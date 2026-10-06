"""
Subversion Nuvi - Phase 5 Operations, Disaster Recovery & Replication Tests
Tests hot backup engine, conditional execution, AES-256-GCM encryption,
automated sandbox verification, point-in-time restore, pre-packaged hook engine,
and multi-site replication with seed export/import and slave promotion.
"""

import io
import uuid
import stat
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.db import init_db, SessionLocal
from backend.api.services.repo_service import RepositoryService
from backend.api.models.dto import (
    RepositoryCreateRequest,
    BackupPolicyCreateRequest,
    HookConfigUpdateRequest,
    ReplicationNodeCreateRequest
)
from backend.api.services.backup_service import BackupService
from backend.api.services.hook_service import HookService
from backend.api.services.replication_service import ReplicationService

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()

def test_hot_backup_conditional_skip_and_encryption():
    db = SessionLocal()
    try:
        uid = uuid.uuid4().hex[:6]
        repo_name = f"BackupRepo_{uid}"
        repo = RepositoryService.create_repository(
            db,
            RepositoryCreateRequest(name=repo_name, standard_layout=True),
            actor="admin"
        )

        passphrase = "UltraSecretBackupKey42!"

        # 1. Configure policy with encryption enabled
        policy_res = client.post("/api/v1/operations/backup/policy", json={
            "repository_id": repo.id,
            "backup_type": "full",
            "is_enabled": True,
            "skip_if_unchanged": True,
            "encryption_enabled": True,
            "encryption_passphrase": passphrase
        })
        assert policy_res.status_code == 200

        # 2. Trigger first Full Backup
        run_res = client.post(f"/api/v1/operations/backup/run/{repo.id}", json={
            "backup_type": "full",
            "force": False,
            "passphrase": passphrase
        })
        assert run_res.status_code == 200
        backup_data = run_res.json()
        assert backup_data["status"] == "success"
        assert backup_data["is_encrypted"] is True
        assert backup_data["filename"].endswith(".enc")
        backup_id = backup_data["backup_id"]

        # 3. Test TASK-5.1: Conditional Execution Check (No new commits -> should skip)
        skip_res = client.post(f"/api/v1/operations/backup/run/{repo.id}", json={
            "backup_type": "full",
            "force": False,
            "passphrase": passphrase
        })
        assert skip_res.status_code == 200
        assert skip_res.json()["status"] == "skipped"

        # 4. Commit a file and re-run backup
        client.post(
            f"/api/v1/browser/{repo.id}/upload",
            data={
                "file_path": "/trunk/data.txt",
                "commit_author": "developer-alice",
                "commit_message": "Add test data file"
            },
            files={"file": ("data.txt", io.BytesIO(b"Data content line"), "text/plain")}
        )

        run2_res = client.post(f"/api/v1/operations/backup/run/{repo.id}", json={
            "backup_type": "incremental",
            "force": False,
            "passphrase": passphrase
        })
        assert run2_res.status_code == 200
        assert run2_res.json()["status"] == "success"

        # 5. TASK-5.3: Automated Sandbox Verification
        verify_res = client.post(f"/api/v1/operations/backup/verify/{backup_id}?passphrase={passphrase}")
        assert verify_res.status_code == 200
        verify_data = verify_res.json()
        assert verify_data["status"] == "verified"
        assert verify_data["verified_revisions"] >= 1

        # 6. Point-in-Time Restore into new repository
        restored_name = f"Restored_{uid}"
        restore_res = client.post(f"/api/v1/operations/backup/restore/{backup_id}", json={
            "target_repository_name": restored_name,
            "encryption_passphrase": passphrase
        })
        assert restore_res.status_code == 200
        assert restore_res.json()["status"] == "restored"
        assert restore_res.json()["name"] == restored_name
    finally:
        db.close()

def test_pre_packaged_hook_engine():
    db = SessionLocal()
    try:
        uid = uuid.uuid4().hex[:6]
        repo_name = f"HookRepo_{uid}"
        repo = RepositoryService.create_repository(
            db,
            RepositoryCreateRequest(name=repo_name, standard_layout=True),
            actor="admin"
        )

        # 1. Update pre-commit hook configuration
        update_res = client.put(f"/api/v1/operations/hooks/{repo.id}/pre-commit", json={
            "is_enabled": True,
            "check_commit_message": True,
            "commit_message_pattern": r"^\[(JIRA|PROJ)-\d+\].+",
            "commit_message_error_msg": "Commit message must start with [JIRA-123] or [PROJ-123]",
            "check_pathnames": True,
            "disallow_spaces": True,
            "disallow_special_chars": True
        })
        assert update_res.status_code == 200
        hook_data = update_res.json()
        assert hook_data["is_enabled"] is True
        assert hook_data["check_commit_message"] is True

        # Verify physical hook file on disk
        installed_path = Path(hook_data["installed_script_path"])
        assert installed_path.exists()
        assert (installed_path.stat().st_mode & stat.S_IXUSR) != 0 # Executable
        with open(installed_path, "r") as f:
            content = f.read()
            assert "check_commit_message" in content

        # 2. Update post-commit hook with webhook
        post_res = client.put(f"/api/v1/operations/hooks/{repo.id}/post-commit", json={
            "is_enabled": True,
            "webhook_enabled": True,
            "webhook_url": "https://ci.example.com/api/svn-webhook"
        })
        assert post_res.status_code == 200
        assert post_res.json()["webhook_enabled"] is True
    finally:
        db.close()

def test_multi_site_replication_seeds_and_promotion():
    db = SessionLocal()
    try:
        uid = uuid.uuid4().hex[:6]
        master_repo_name = f"MasterRepo_{uid}"
        master_repo = RepositoryService.create_repository(
            db,
            RepositoryCreateRequest(name=master_repo_name, standard_layout=True),
            actor="admin"
        )

        # 1. Export offline replication seed
        seed_res = client.post(f"/api/v1/operations/replication/export-seed/{master_repo.id}")
        assert seed_res.status_code == 200
        seed_data = seed_res.json()
        seed_path = seed_data["seed_path"]
        assert Path(seed_path).exists()

        # 2. Import seed into new slave repository
        slave_repo_name = f"SlaveRepo_{uid}"
        import_res = client.post("/api/v1/operations/replication/import-seed", json={
            "seed_path": seed_path,
            "new_repository_name": slave_repo_name,
            "master_url": f"https://svn.example.com/svn/{master_repo_name}"
        })
        assert import_res.status_code == 200
        slave_data = import_res.json()
        slave_id = slave_data["repository_id"]
        assert slave_data["node_role"] == "slave"

        # 3. Check replication status
        status_res = client.get(f"/api/v1/operations/replication/{slave_id}")
        assert status_res.status_code == 200
        assert status_res.json()["node_role"] == "slave"

        # 4. Promote slave to master in disaster recovery scenario
        promote_res = client.post(f"/api/v1/operations/replication/promote/{slave_id}")
        assert promote_res.status_code == 200
        assert promote_res.json()["new_role"] == "master"

        # Verify role updated
        status_after = client.get(f"/api/v1/operations/replication/{slave_id}")
        assert status_after.json()["node_role"] == "master"
    finally:
        db.close()
