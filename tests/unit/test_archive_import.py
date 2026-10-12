"""
Test Suite for Repository Archive Import Facility (Dump + VisualSVN Authz + Hooks + Htpasswd)
"""

import os
import zipfile
import gzip
import uuid
import subprocess
import tempfile
import shutil
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.db import SessionLocal
from backend.api.models.schema import Repository, User, Group, AccessRule, PrincipalType
from backend.api.services.archive_import_service import ArchiveImportService

client = TestClient(app)

def test_archive_import_with_visualsvn_files(tmp_path: Path):
    db = SessionLocal()

    # 1. Create a dummy SVN repository and dump it
    raw_repo = tmp_path / "source_repo"
    subprocess.run(["svnadmin", "create", str(raw_repo)], check=True)

    # Commit initial layout and a file into source repo
    subprocess.run(["svn", "mkdir", f"file://{raw_repo}/trunk", "-m", "Create trunk"], check=True)
    subprocess.run(["svn", "mkdir", f"file://{raw_repo}/branches", "-m", "Create branches"], check=True)
    subprocess.run(["svn", "mkdir", f"file://{raw_repo}/tags", "-m", "Create tags"], check=True)

    # Dump the source repo to a .dump file
    dump_file = tmp_path / "project_export.dump"
    with open(dump_file, "wb") as f_out:
        subprocess.run(["svnadmin", "dump", str(raw_repo)], stdout=f_out, check=True)

    # 2. Create VisualSVN authz file
    authz_file = tmp_path / "authz"
    authz_content = """# VisualSVN Server Authorization File
[groups]
BackendDevs = alice_vsvn, bob_vsvn
QualityAssurance = charlie_vsvn

[/]
* = r
@BackendDevs = rw

[/trunk]
@BackendDevs = rw

[/branches]
@QualityAssurance = rw
* =

[/tags]
* = r
"""
    authz_file.write_text(authz_content, encoding="utf-8")

    # 3. Create htpasswd file
    htpasswd_file = tmp_path / "htpasswd"
    # SHA hash for 'TestPass123!' is {SHA}B5q315w57805124019...
    htpasswd_content = """alice_vsvn:{SHA}e8hfb/dep8Qbs3cmltFNaQD3+Qw=
bob_vsvn:{SHA}e8hfb/dep8Qbs3cmltFNaQD3+Qw=
charlie_vsvn:{SHA}e8hfb/dep8Qbs3cmltFNaQD3+Qw=
"""
    htpasswd_file.write_text(htpasswd_content, encoding="utf-8")

    # 4. Create custom hook script
    hooks_dir = tmp_path / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    pre_commit_hook = hooks_dir / "pre-commit"
    pre_commit_hook.write_text("#!/bin/sh\n# VisualSVN pre-commit hook\nexit 0\n", encoding="utf-8")

    # 5. Pack everything into a .zip archive
    zip_package = tmp_path / "VisualSVN_ProjectAlpha.zip"
    with zipfile.ZipFile(zip_package, "w") as z:
        z.write(dump_file, arcname="dump/project_export.dump")
        z.write(authz_file, arcname="conf/authz")
        z.write(htpasswd_file, arcname="conf/htpasswd")
        z.write(pre_commit_hook, arcname="hooks/pre-commit")

    import uuid
    unique_name = f"vsvn_import_{uuid.uuid4().hex[:8]}"
    imported_repo_id = None
    try:
        # 6. Test import via ArchiveImportService
        res = ArchiveImportService.import_repository_archive(
            db=db,
            archive_path=zip_package,
            repo_name=unique_name,
            import_acls=True,
            import_users=True,
            import_hooks=True,
            actor="test_admin"
        )

        assert res.status == "success"
        assert res.repository_name == unique_name
        assert res.dump_loaded is True
        assert res.revisions_loaded >= 3
        assert res.authz_imported is True
        assert res.rules_created >= 4
        assert res.hooks_imported >= 1
        imported_repo_id = res.repository_id

        # 7. Verify Database state
        # A. Repository exists and has correct revision
        repo = db.query(Repository).filter(Repository.id == res.repository_id).first()
        assert repo is not None
        assert repo.latest_revision >= 3

        # B. Groups exist with members
        backend_grp = db.query(Group).filter(Group.name == "BackendDevs").first()
        assert backend_grp is not None
        assert len(backend_grp.members) >= 2

        qa_grp = db.query(Group).filter(Group.name == "QualityAssurance").first()
        assert qa_grp is not None
        assert len(qa_grp.members) >= 1

        # C. Users exist with htpasswd hashes migrated
        alice = db.query(User).filter(User.username == "alice_vsvn").first()
        assert alice is not None
        assert alice.is_active is True
        assert alice.htpasswd_hash == "{SHA}e8hfb/dep8Qbs3cmltFNaQD3+Qw="

        # D. Rules exist in AccessRule table
        rules = db.query(AccessRule).filter(AccessRule.repository_id == res.repository_id).all()
        assert len(rules) >= 4
        paths = [r.path for r in rules]
        assert "/" in paths
        assert "/trunk" in paths
        assert "/branches" in paths

        # E. Hook file exists and is executable in destination repo
        installed_hook = Path(repo.fs_path) / "hooks" / "pre-commit"
        assert installed_hook.exists()
        assert os.access(installed_hook, os.X_OK)

        # F. Compiled authz file contains the new repository sections
        from backend.api.config import config as app_cfg
        authz_file_on_disk = app_cfg.DATA_DIR / "authz"
        assert authz_file_on_disk.exists()
        authz_text = authz_file_on_disk.read_text(encoding="utf-8")
        assert f"[{repo.name}:/]" in authz_text
        assert f"[{repo.name}:/trunk]" in authz_text

    finally:
        # Cleanup imported repository
        if imported_repo_id:
            try:
                from backend.api.services.repo_service import RepositoryService
                RepositoryService.delete_repository(db, imported_repo_id, delete_files=True)
            except Exception:
                pass
        db.close()

def test_api_import_archive_multipart(tmp_path: Path):
    import uuid
    # 1. Create a dummy dump
    raw_repo = tmp_path / "src_repo"
    subprocess.run(["svnadmin", "create", str(raw_repo)], check=True)
    subprocess.run(["svn", "mkdir", f"file://{raw_repo}/trunk", "-m", "Init"], check=True)

    dump_file = tmp_path / "test.dump"
    with open(dump_file, "wb") as f_out:
        subprocess.run(["svnadmin", "dump", str(raw_repo)], stdout=f_out, check=True)

    # 2. Authz
    authz_file = tmp_path / "authz"
    authz_file.write_text("[groups]\nSecTeam = sec_user\n\n[/]\n* = r\n@SecTeam = rw\n", encoding="utf-8")

    # 3. Zip
    zip_pkg = tmp_path / "Package.zip"
    with zipfile.ZipFile(zip_pkg, "w") as z:
        z.write(dump_file, arcname="test.dump")
        z.write(authz_file, arcname="authz")

    target_name = f"api_import_{uuid.uuid4().hex[:8]}"
    imported_id = None
    try:
        with open(zip_pkg, "rb") as f_in:
            res = client.post(
                "/api/v1/repositories/import-archive",
                files={"file": ("Package.zip", f_in, "application/zip")},
                data={
                    "repo_name": target_name,
                    "import_acls": "true",
                    "import_users": "true",
                    "import_hooks": "true"
                }
            )

        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "success"
        assert data["repository_name"] == target_name
        assert data["dump_loaded"] is True
        assert data["authz_imported"] is True
        imported_id = data["repository_id"]

    finally:
        if imported_id:
            db = SessionLocal()
            try:
                from backend.api.services.repo_service import RepositoryService
                RepositoryService.delete_repository(db, imported_id, delete_files=True)
            except Exception:
                pass
            db.close()


def _create_dummy_dump(tmp_path: Path, author: str) -> Path:
    raw_repo = tmp_path / f"source_{uuid.uuid4().hex[:8]}"
    subprocess.run(["svnadmin", "create", str(raw_repo)], check=True)
    subprocess.run(["svn", "mkdir", f"file://{raw_repo}/trunk", "-m", "Create trunk", "--username", author], check=True)
    subprocess.run(["svn", "mkdir", f"file://{raw_repo}/branches", "-m", "Create branches", "--username", author], check=True)
    dump_file = tmp_path / f"dump_{uuid.uuid4().hex[:8]}.dump"
    with open(dump_file, "wb") as f_out:
        subprocess.run(["svnadmin", "dump", str(raw_repo)], stdout=f_out, check=True)
    return dump_file


def test_dump_import_standalone_raw_and_gz(tmp_path: Path):
    db = SessionLocal()
    unique_author = f"dumpauthor_{uuid.uuid4().hex[:6]}"
    dump_file = _create_dummy_dump(tmp_path, unique_author)

    # 1. Test uncompressed .dump import
    repo_name_1 = f"dump_raw_{uuid.uuid4().hex[:8]}"
    imported_id_1 = None
    imported_id_2 = None
    try:
        res1 = ArchiveImportService.import_repository_dump_file(
            db=db,
            dump_path=dump_file,
            repo_name=repo_name_1,
            description="Testing standalone dump import",
            import_users=True,
            default_password="TestPassword123!",
            actor="test_admin"
        )
        assert res1.status == "success"
        assert res1.repository_name == repo_name_1
        assert res1.dump_loaded is True
        assert res1.revisions_loaded >= 2
        assert res1.users_created >= 1
        imported_id_1 = res1.repository_id

        # Verify repo & user in DB
        repo1 = db.query(Repository).filter(Repository.id == imported_id_1).first()
        assert repo1 is not None
        assert repo1.latest_revision >= 2

        author_user = db.query(User).filter(User.username == unique_author).first()
        assert author_user is not None
        assert author_user.is_active is True

        # 2. Test compressed .dump.gz import
        gz_path = tmp_path / f"{dump_file.name}.gz"
        with open(dump_file, "rb") as f_in, gzip.open(gz_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)

        repo_name_2 = f"dump_gz_{uuid.uuid4().hex[:8]}"
        res2 = ArchiveImportService.import_repository_dump_file(
            db=db,
            dump_path=gz_path,
            repo_name=repo_name_2,
            description="Testing compressed dump import",
            import_users=False,
            actor="test_admin"
        )
        assert res2.status == "success"
        assert res2.repository_name == repo_name_2
        assert res2.dump_loaded is True
        assert res2.revisions_loaded >= 2
        imported_id_2 = res2.repository_id

        repo2 = db.query(Repository).filter(Repository.id == imported_id_2).first()
        assert repo2 is not None
        assert repo2.latest_revision >= 2

    finally:
        from backend.api.services.repo_service import RepositoryService
        if imported_id_1:
            try:
                RepositoryService.delete_repository(db, imported_id_1, delete_files=True)
            except Exception:
                pass
        if imported_id_2:
            try:
                RepositoryService.delete_repository(db, imported_id_2, delete_files=True)
            except Exception:
                pass
        # Clean up test user
        test_u = db.query(User).filter(User.username == unique_author).first()
        if test_u:
            db.delete(test_u)
            db.commit()
        db.close()


def test_api_import_dump_multipart(tmp_path: Path):
    unique_author = f"api_author_{uuid.uuid4().hex[:6]}"
    dump_file = _create_dummy_dump(tmp_path, unique_author)
    target_name = f"api_dump_{uuid.uuid4().hex[:8]}"
    imported_id = None

    try:
        with open(dump_file, "rb") as f_in:
            res = client.post(
                "/api/v1/repositories/import-dump-file",
                files={"file": (dump_file.name, f_in, "application/octet-stream")},
                data={
                    "repo_name": target_name,
                    "description": "API multipart dump import test",
                    "import_users": "true",
                    "default_password": "NewUserPassword123!"
                }
            )

        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "success"
        assert data["repository_name"] == target_name
        assert data["dump_loaded"] is True
        assert data["revisions_loaded"] >= 2
        imported_id = data["repository_id"]

    finally:
        db = SessionLocal()
        if imported_id:
            try:
                from backend.api.services.repo_service import RepositoryService
                RepositoryService.delete_repository(db, imported_id, delete_files=True)
            except Exception:
                pass
        test_u = db.query(User).filter(User.username == unique_author).first()
        if test_u:
            db.delete(test_u)
            db.commit()
        db.close()


def test_api_import_dump_path(tmp_path: Path):
    unique_author = f"path_author_{uuid.uuid4().hex[:6]}"
    dump_file = _create_dummy_dump(tmp_path, unique_author)
    target_name = f"api_dump_path_{uuid.uuid4().hex[:8]}"
    imported_id = None

    try:
        res = client.post(
            "/api/v1/repositories/import-dump-path",
            json={
                "dump_path": str(dump_file),
                "repo_name": target_name,
                "description": "API server dump path import test",
                "import_users": False
            }
        )

        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "success"
        assert data["repository_name"] == target_name
        assert data["dump_loaded"] is True
        assert data["revisions_loaded"] >= 2
        imported_id = data["repository_id"]

    finally:
        db = SessionLocal()
        if imported_id:
            try:
                from backend.api.services.repo_service import RepositoryService
                RepositoryService.delete_repository(db, imported_id, delete_files=True)
            except Exception:
                pass
        test_u = db.query(User).filter(User.username == unique_author).first()
        if test_u:
            db.delete(test_u)
            db.commit()
        db.close()


def test_api_import_archive_auto_detects_dump(tmp_path: Path):
    unique_author = f"autodetect_{uuid.uuid4().hex[:6]}"
    dump_file = _create_dummy_dump(tmp_path, unique_author)
    target_name = f"auto_dump_{uuid.uuid4().hex[:8]}"
    imported_id = None

    try:
        with open(dump_file, "rb") as f_in:
            res = client.post(
                "/api/v1/repositories/import-archive",
                files={"file": (dump_file.name, f_in, "application/octet-stream")},
                data={
                    "repo_name": target_name,
                    "import_users": "true"
                }
            )

        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "success"
        assert data["repository_name"] == target_name
        assert data["dump_loaded"] is True
        assert data["revisions_loaded"] >= 2
        imported_id = data["repository_id"]

    finally:
        db = SessionLocal()
        if imported_id:
            try:
                from backend.api.services.repo_service import RepositoryService
                RepositoryService.delete_repository(db, imported_id, delete_files=True)
            except Exception:
                pass
        test_u = db.query(User).filter(User.username == unique_author).first()
        if test_u:
            db.delete(test_u)
            db.commit()
        db.close()

