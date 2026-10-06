"""
Test Suite for Repository Archive Import Facility (Dump + VisualSVN Authz + Hooks + Htpasswd)
"""

import os
import zipfile
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

