"""
Subversion Nuvi - Phase 4 Full-Text Search & Audit Logging Unit Tests
Tests FTS5 indexing, jump-to-revision, ACL security trimming, and dual-tier audit logging.
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.db import init_db, SessionLocal
from backend.api.services.repo_service import RepositoryService
from backend.api.models.dto import RepositoryCreateRequest, UserCreateRequest, AccessRuleCreateRequest
from backend.api.services.search_service import SearchService
from backend.api.services.audit_service import AuditService
from backend.api.services.security_service import SecurityService
from backend.api.services.acl_service import AclService

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()

def test_audit_logging_and_export():
    db = SessionLocal()
    try:
        uid = uuid.uuid4().hex[:6]
        actor_name = f"user_{uid}"

        # Log operational and management events
        AuditService.log_event(
            db,
            actor=actor_name,
            action_category="operational",
            action_name="svn_commit",
            target_type="repository",
            target_id="1",
            details={"revision": 1, "message": "Initial import"},
            client_ip="192.168.1.50"
        )

        AuditService.log_event(
            db,
            actor=actor_name,
            action_category="management",
            action_name="create_user",
            target_type="user",
            target_id="bob",
            details={"role": "developer"},
            client_ip="127.0.0.1"
        )

        # Query via API
        res = client.get(f"/api/v1/audit?actor={actor_name}")
        assert res.status_code == 200
        logs = res.json()
        assert len(logs) >= 2
        actions = [l["action"] for l in logs]
        assert "svn_commit" in actions
        assert "create_user" in actions

        # Export via API
        export_res = client.get("/api/v1/audit/export")
        assert export_res.status_code == 200
        export_text = export_res.text
        assert actor_name in export_text
    finally:
        db.close()

def test_fts5_search_indexing_and_acl_trimming():
    db = SessionLocal()
    try:
        uid = uuid.uuid4().hex[:6]
        repo_name = f"SearchRepo_{uid}"

        # 1. Create a repository
        repo = RepositoryService.create_repository(
            db,
            RepositoryCreateRequest(name=repo_name, standard_layout=True),
            actor="admin"
        )

        import io

        # Commit a secret file and a public file via browser upload API
        res1 = client.post(
            f"/api/v1/browser/{repo.id}/upload",
            data={
                "file_path": "/trunk/public.txt",
                "commit_author": "developer-alice",
                "commit_message": "Add public document"
            },
            files={"file": ("public.txt", io.BytesIO(b"This is public documentation for all team members to read."), "text/plain")}
        )
        assert res1.status_code == 200

        res2 = client.post(
            f"/api/v1/browser/{repo.id}/upload",
            data={
                "file_path": "/branches/secret.txt",
                "commit_author": "developer-alice",
                "commit_message": "Add confidential financial data"
            },
            files={"file": ("secret.txt", io.BytesIO(b"Confidential financial projections and crypto keys."), "text/plain")}
        )
        assert res2.status_code == 200

        # 2. Trigger Indexing
        index_res = client.post(f"/api/v1/search/index/{repo.id}")
        assert index_res.status_code == 200
        data = index_res.json()
        assert data["indexed_files_count"] >= 2

        # 3. Test Search Telemetry
        status_res = client.get("/api/v1/search/status")
        assert status_res.status_code == 200
        assert status_res.json()["total_documents_indexed"] >= 2

        # 4. Search for 'projections' without user (admin sees all)
        search_all = client.get(f"/api/v1/search?q=projections&repository_id={repo.id}")
        assert search_all.status_code == 200
        res_data = search_all.json()
        assert res_data["total_hits"] >= 1
        assert any("secret.txt" in r["filename"] for r in res_data["results"])

        # 5. Test Instant Jump to Revision
        jump_res = client.get(f"/api/v1/search?q=r2&repository_id={repo.id}")
        assert jump_res.status_code == 200
        assert jump_res.json()["jump_revision"] == 2

        # 6. Test ACL Security Trimming
        # Create user 'charlie_<uid>'
        charlie_name = f"charlie_{uid}"
        SecurityService.create_user(db, UserCreateRequest(username=charlie_name, password="CharlieSecret123!"))

        # Grant read on trunk, deny on branches
        AclService.create_rule(db, AccessRuleCreateRequest(
            repository_id=repo.id,
            path="/trunk",
            principal_type="user",
            principal_name=charlie_name,
            permission="r"
        ))
        AclService.create_rule(db, AccessRuleCreateRequest(
            repository_id=repo.id,
            path="/branches",
            principal_type="user",
            principal_name=charlie_name,
            permission=""
        ))

        # Search for 'documentation' as charlie -> SHOULD find public.txt
        search_charlie_public = client.get(f"/api/v1/search?q=documentation&username={charlie_name}&repository_id={repo.id}")
        assert search_charlie_public.status_code == 200
        assert search_charlie_public.json()["total_hits"] >= 1

        # Search for 'projections' or 'confidential' as charlie -> SHOULD BE SILENTLY TRIMMED (0 hits)
        search_charlie_secret = client.get(f"/api/v1/search?q=projections&username={charlie_name}&repository_id={repo.id}")
        assert search_charlie_secret.status_code == 200
        assert search_charlie_secret.json()["total_hits"] == 0
    finally:
        db.close()
