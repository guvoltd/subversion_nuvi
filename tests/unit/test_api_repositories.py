"""
Integration tests for Subversion Nuvi FastAPI Management Server
"""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.api.db import init_db

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

def test_server_status_endpoint():
    response = client.get("/api/v1/server/status")
    assert response.status_code == 200
    data = response.json()
    assert "repositories_count" in data
    assert "uptime_seconds" in data
    assert "memory_used_mb" in data

def test_repository_lifecycle():
    repo_name = "api_test_project"

    # 1. Create Repository with standard layout
    create_payload = {
        "name": repo_name,
        "description": "Integration test repository",
        "fs_type": "fsfs",
        "compatible_version": "1.14.0",
        "init_standard_layout": True,
        "layout_author": "test-suite",
        "layout_message": "Automated initial project structure"
    }
    create_res = client.post("/api/v1/repositories", json=create_payload)
    assert create_res.status_code == 201
    repo_data = create_res.json()
    repo_id = repo_data["id"]
    assert repo_data["name"] == repo_name
    assert repo_data["latest_revision"] == 1
    assert repo_data["latest_author"] == "test-suite"
    assert "Automated initial project structure" in repo_data["latest_log"]

    # 2. List Repositories
    list_res = client.get("/api/v1/repositories")
    assert list_res.status_code == 200
    repos = list_res.json()
    assert any(r["id"] == repo_id for r in repos)

    # 3. Get Repository by ID
    get_res = client.get(f"/api/v1/repositories/{repo_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == repo_name

    # 4. Storage Stats
    stats_res = client.get(f"/api/v1/repositories/{repo_id}/stats")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_size_bytes"] > 0
    assert stats["latest_revision"] == 1

    # 5. Active Locks
    locks_res = client.get(f"/api/v1/repositories/{repo_id}/locks")
    assert locks_res.status_code == 200
    assert isinstance(locks_res.json(), list)

    # 6. Uncommitted Transactions
    txns_res = client.get(f"/api/v1/repositories/{repo_id}/transactions")
    assert txns_res.status_code == 200
    assert isinstance(txns_res.json(), list)

    # 7. Pack Repository
    pack_res = client.post(f"/api/v1/repositories/{repo_id}/pack")
    assert pack_res.status_code == 200
    assert pack_res.json()["status"] == "success"

    # 8. Verify Repository
    verify_res = client.post(f"/api/v1/repositories/{repo_id}/verify")
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "success"

    # 9. Test Init Layout on empty repo
    empty_repo_res = client.post("/api/v1/repositories", json={
        "name": "empty_repo_for_layout",
        "description": "Empty repo",
        "init_standard_layout": False
    })
    assert empty_repo_res.status_code == 201
    empty_id = empty_repo_res.json()["id"]
    assert empty_repo_res.json()["latest_revision"] == 0

    init_layout_res = client.post(f"/api/v1/repositories/{empty_id}/init-layout", json={
        "author": "layout-tester",
        "log_message": "Manual layout initialization"
    })
    assert init_layout_res.status_code == 200
    assert init_layout_res.json()["latest_revision"] == 1
    assert init_layout_res.json()["latest_author"] == "layout-tester"

    # Clean up empty repo
    client.delete(f"/api/v1/repositories/{empty_id}?delete_files=true")

    # 10. Delete Repository
    del_res = client.delete(f"/api/v1/repositories/{repo_id}?delete_files=true")
    assert del_res.status_code == 204

    # 11. Verify Deleted
    assert client.get(f"/api/v1/repositories/{repo_id}").status_code == 404

def test_server_config_endpoint():
    response = client.get("/api/v1/server/config")
    assert response.status_code == 200
    cfg = response.json()
    assert "server_name" in cfg
    assert "repositories_root" in cfg
    assert "ban_threshold" in cfg

def test_web_console_static_serving():
    response = client.get("/")
    assert response.status_code == 200
    assert "Subversion Nuvi" in response.text
    assert "<div id=\"root\"></div>" in response.text

def test_repository_auto_heal_path_on_relocation(tmp_path):
    import uuid
    name = f"autoheal_{uuid.uuid4().hex[:8]}"
    res = client.post("/api/v1/repositories", json={
        "name": name,
        "description": "Auto heal test",
        "init_standard_layout": True
    })
    assert res.status_code == 201, res.json()
    repo_data = res.json()
    repo_id = repo_data["id"]
    original_path = Path(repo_data["fs_path"])

    try:
        from backend.api.db import SessionLocal
        from backend.api.models.schema import Repository
        db = SessionLocal()
        # 2. Simulate moving the repository to a new path under a custom root
        new_root = tmp_path / "custom_repositories"
        new_root.mkdir(parents=True, exist_ok=True)
        new_repo_path = new_root / name
        import shutil
        shutil.move(str(original_path), str(new_repo_path))

        # 3. Simulate REPOSITORIES_ROOT reconfigured to new_root in config
        from backend.api.config import config
        old_root = config.REPOSITORIES_ROOT
        config.REPOSITORIES_ROOT = new_root

        try:
            # 4. Fetch the repository - auto-healing should detect new path and update DB
            get_res = client.get(f"/api/v1/repositories/{repo_id}")
            assert get_res.status_code == 200
            updated_data = get_res.json()
            assert updated_data["fs_path"] == str(new_repo_path)
            assert updated_data["latest_revision"] == 1

            # 5. Verify database was persisted with the new path
            db_repo = db.query(Repository).filter(Repository.id == repo_id).first()
            assert db_repo is not None
            assert db_repo.fs_path == str(new_repo_path)
        finally:
            config.REPOSITORIES_ROOT = old_root
            db.close()
    finally:
        client.delete(f"/api/v1/repositories/{repo_id}?delete_files=true")


def test_repository_fs_path_hidden_for_non_admin():
    import uuid
    uid = uuid.uuid4().hex[:6]
    test_user = f"norm_{uid}"
    repo_name = f"norm_repo_{uid}"

    # 1. Create a non-admin user
    u_res = client.post("/api/v1/users", json={
        "username": test_user,
        "password": "Password123!",
        "is_admin": False
    })
    assert u_res.status_code == 201

    # 2. Create repository as admin
    r_res = client.post("/api/v1/repositories", json={
        "name": repo_name,
        "description": "Non admin test repo"
    })
    assert r_res.status_code == 201
    repo_data = r_res.json()
    repo_id = repo_data["id"]
    assert repo_data["fs_path"] != ""

    try:
        # Grant user read access to the repo
        acl_res = client.post("/api/v1/acl/rules", json={
            "repository_id": repo_id,
            "path": "/",
            "principal_type": "user",
            "principal_name": test_user,
            "permission": "r"
        })
        assert acl_res.status_code == 201

        # 3. Login as the non-admin user
        login_res = client.post("/api/v1/auth/login", json={
            "username": test_user,
            "password": "Password123!"
        })
        assert login_res.status_code == 200
        token = login_res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 4. List repositories as non-admin - fs_path must be empty string
        list_res = client.get("/api/v1/repositories", headers=headers)
        assert list_res.status_code == 200
        repos = list_res.json()
        target = next((r for r in repos if r["id"] == repo_id), None)
        assert target is not None
        assert target["fs_path"] == ""

        # 5. Get repository as non-admin - fs_path must be empty string
        get_res = client.get(f"/api/v1/repositories/{repo_id}", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["fs_path"] == ""

        # 6. Admin should still see full fs_path
        admin_res = client.get(f"/api/v1/repositories/{repo_id}")
        assert admin_res.status_code == 200
        assert admin_res.json()["fs_path"] != ""
    finally:
        client.delete(f"/api/v1/repositories/{repo_id}?delete_files=true")


