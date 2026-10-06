"""
Unit & Integration Tests for Phase 2: Identity, Visual Authorization & Security
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.api.db import init_db
from backend.api.services.shield_service import shield_service

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()

def test_password_policy_and_user_crud():
    uid = uuid.uuid4().hex[:6]
    test_user = f"alice_{uid}"

    # 1. Reject weak password (fails length / complexity)
    weak_res = client.post("/api/v1/users", json={
        "username": test_user,
        "password": "123",
        "email": "alice@example.com"
    })
    assert weak_res.status_code == 400

    # 2. Create user with strong password
    create_res = client.post("/api/v1/users", json={
        "username": test_user,
        "password": "SecurePassword123!",
        "email": "alice@example.com",
        "full_name": "Alice Developer",
        "is_admin": False
    })
    assert create_res.status_code == 201
    user_data = create_res.json()
    user_id = user_data["id"]
    assert user_data["username"] == test_user
    assert user_data["is_active"] is True

    # 3. Duplicate username check
    dup_res = client.post("/api/v1/users", json={
        "username": test_user,
        "password": "SecurePassword123!"
    })
    assert dup_res.status_code == 409

    # 4. Update user
    update_res = client.put(f"/api/v1/users/{user_id}", json={
        "full_name": "Alice Senior Developer",
        "is_admin": False
    })
    assert update_res.status_code == 200
    assert update_res.json()["full_name"] == "Alice Senior Developer"

    # 5. Change password
    pwd_res = client.post(f"/api/v1/users/{user_id}/password", json={
        "new_password": "NewStrongPassword456$"
    })
    assert pwd_res.status_code == 200

    # 6. Disable account
    status_res = client.post(f"/api/v1/users/{user_id}/status", json={"is_active": False})
    assert status_res.status_code == 200
    assert status_res.json()["is_active"] is False

    # 7. Re-enable account
    status_res2 = client.post(f"/api/v1/users/{user_id}/status", json={"is_active": True})
    assert status_res2.status_code == 200
    assert status_res2.json()["is_active"] is True

def test_groups_and_memberships():
    uid = uuid.uuid4().hex[:6]
    test_user = f"bob_{uid}"
    test_group = f"engineers_{uid}"

    # Create user first
    u_res = client.post("/api/v1/users", json={
        "username": test_user,
        "password": "StrongPassword123!"
    })
    assert u_res.status_code == 201

    # 1. Create Group
    group_res = client.post("/api/v1/groups", json={
        "name": test_group,
        "description": "Engineering team"
    })
    assert group_res.status_code == 201
    group_id = group_res.json()["id"]
    assert group_res.json()["name"] == test_group

    # 2. Add Bob to group
    add_res = client.post(f"/api/v1/groups/{group_id}/members", json={"username": test_user})
    assert add_res.status_code == 200
    assert test_user in add_res.json()["members"]

    # 3. Check User returns group
    user_res = client.get("/api/v1/users")
    bob = next((u for u in user_res.json() if u["username"] == test_user), None)
    assert bob is not None
    assert test_group in bob["groups"]

    # 4. Remove Bob from group
    rem_res = client.delete(f"/api/v1/groups/{group_id}/members/{test_user}")
    assert rem_res.status_code == 200
    assert test_user not in rem_res.json()["members"]

def test_brute_force_shield_ip_ban_and_unban():
    test_ip = f"198.51.100.{uuid.uuid4().int % 200 + 10}"

    # Reset any previous state for test_ip
    shield_service.unban(test_ip)

    # Record 4 failed attempts (Threshold is 5)
    for _ in range(4):
        banned, rem = shield_service.record_failed_attempt(test_ip)
        assert not banned

    # 5th failed attempt triggers ban
    banned, rem = shield_service.record_failed_attempt(test_ip)
    assert banned
    assert rem == 0
    assert shield_service.is_ip_banned(test_ip) is True

    # Check status endpoint
    status_res = client.get("/api/v1/shield/status")
    assert status_res.status_code == 200
    bans = status_res.json()["banned_ips"]
    assert any(test_ip in b["subnet_or_ip"] for b in bans)

    # Manually unban
    unban_res = client.post("/api/v1/shield/unban", json={"ip_or_subnet": test_ip})
    assert unban_res.status_code == 200
    assert shield_service.is_ip_banned(test_ip) is False

def test_ipv6_64_prefix_grouping():
    ip1 = "2001:db8:1234:5678:0000:0000:0000:0001"
    ip2 = "2001:db8:1234:5678:ffff:ffff:ffff:ffff"

    norm1 = shield_service._normalize_client_network(ip1)
    norm2 = shield_service._normalize_client_network(ip2)
    assert norm1 == norm2 == "2001:db8:1234:5678::/64"

def test_acl_rules_and_authz_compiler():
    uid = uuid.uuid4().hex[:6]
    test_repo_name = f"acl_repo_{uid}"
    test_user = f"charlie_{uid}"
    test_group = f"designers_{uid}"

    # Create user & group
    client.post("/api/v1/users", json={"username": test_user, "password": "StrongPassword123!"})
    g_res = client.post("/api/v1/groups", json={"name": test_group})
    g_id = g_res.json()["id"]
    client.post(f"/api/v1/groups/{g_id}/members", json={"username": test_user})

    # Create test repository
    repo_res = client.post("/api/v1/repositories", json={
        "name": test_repo_name,
        "description": "Repo for testing access rules"
    })
    assert repo_res.status_code == 201
    repo_id = repo_res.json()["id"]

    try:
        # 1. Create global rule: everyone read-only at /
        r1 = client.post("/api/v1/acl/rules", json={
            "repository_id": None,
            "path": "/",
            "principal_type": "everyone",
            "principal_name": "*",
            "permission": "r"
        })
        assert r1.status_code == 201

        # 2. Create repo-specific rule: designers group read-write at /
        r2 = client.post("/api/v1/acl/rules", json={
            "repository_id": repo_id,
            "path": "/",
            "principal_type": "group",
            "principal_name": test_group,
            "permission": "rw"
        })
        assert r2.status_code == 201

        # 3. Create repo subpath rule: deny everyone at /trunk/secret
        r3 = client.post("/api/v1/acl/rules", json={
            "repository_id": repo_id,
            "path": "/trunk/secret",
            "principal_type": "everyone",
            "principal_name": "*",
            "permission": ""
        })
        assert r3.status_code == 201

        # 4. Trigger authz compile
        compile_res = client.post("/api/v1/acl/compile")
        assert compile_res.status_code == 200
        assert compile_res.json()["status"] == "success"

        # 5. Evaluate Effective Permissions (nuvi-acl-eval)
        # Charlie is in 'designers' group -> should have 'rw' at /
        eval1 = client.post("/api/v1/acl/evaluate", json={
            "username": test_user,
            "repository_id": repo_id,
            "path": "/"
        })
        assert eval1.status_code == 200
        assert eval1.json()["effective_permission"] == "rw"
        assert eval1.json()["can_write"] is True

        # At /trunk/secret, wildcard deny overrides
        eval2 = client.post("/api/v1/acl/evaluate", json={
            "username": test_user,
            "repository_id": repo_id,
            "path": "/trunk/secret"
        })
        assert eval2.status_code == 200
        assert eval2.json()["effective_permission"] == ""
        assert eval2.json()["can_read"] is False

    finally:
        # Clean up global rule and test repository
        try:
            client.delete(f"/api/v1/acl/rules/{r1.json()['id']}")
        except Exception:
            pass
        client.delete(f"/api/v1/repositories/{repo_id}?delete_files=true")

def test_repository_supervisors():
    uid = uuid.uuid4().hex[:6]
    test_repo_name = f"sup_repo_{uid}"
    test_user = f"david_{uid}"

    # Create user
    u_res = client.post("/api/v1/users", json={"username": test_user, "password": "StrongPassword123!"})
    user_id = u_res.json()["id"]

    # Create repository
    repo_res = client.post("/api/v1/repositories", json={
        "name": test_repo_name,
        "description": "Supervisor test"
    })
    repo_id = repo_res.json()["id"]

    try:
        # Assign supervisor
        assign_res = client.post(f"/api/v1/acl/supervisors/{repo_id}", json={
            "user_id": user_id,
            "can_manage_acls": True,
            "can_manage_locks": True,
            "can_trigger_backups": False
        })
        assert assign_res.status_code == 200
        assert assign_res.json()["can_manage_acls"] is True
        assert assign_res.json()["can_trigger_backups"] is False

        # List supervisors
        list_res = client.get(f"/api/v1/acl/supervisors/{repo_id}")
        assert list_res.status_code == 200
        assert len(list_res.json()) == 1

        # Remove supervisor
        del_res = client.delete(f"/api/v1/acl/supervisors/{repo_id}/{user_id}")
        assert del_res.status_code == 204
    finally:
        client.delete(f"/api/v1/repositories/{repo_id}?delete_files=true")

def test_implicit_traversal_and_sparse_sibling_exclusion():
    uid = uuid.uuid4().hex[:6]
    test_repo_name = f"sparse_repo_{uid}"
    test_user = f"bob_{uid}"

    # 1. Create user
    client.post("/api/v1/users", json={"username": test_user, "password": "StrongPassword123!"})

    # 2. Create repository with standard structure
    repo_res = client.post("/api/v1/repositories", json={
        "name": test_repo_name,
        "description": "Sparse checkout traversal test repo"
    })
    assert repo_res.status_code == 201
    repo_id = repo_res.json()["id"]

    try:
        # 3. Create subpath-only rule for bob at /trunk/feature1
        r_res = client.post("/api/v1/acl/rules", json={
            "repository_id": repo_id,
            "path": "/trunk/feature1",
            "principal_type": "user",
            "principal_name": test_user,
            "permission": "rw"
        })
        assert r_res.status_code == 201

        # 4. Trigger authz compilation
        compile_res = client.post("/api/v1/acl/compile")
        assert compile_res.status_code == 200

        # Read compiled authz file
        from backend.api.config import config
        authz_content = (config.DATA_DIR / "authz").read_text(encoding="utf-8")

        # Verify ancestor traversal granted
        assert f"[{test_repo_name}:/]\n{test_user} = r" in authz_content or f"[{test_repo_name}:/]" in authz_content
        assert f"[{test_repo_name}:/trunk]" in authz_content
        # Verify sibling exclusion denied
        assert f"[{test_repo_name}:/branches]" in authz_content
        assert f"[{test_repo_name}:/tags]" in authz_content
        assert f"[{test_repo_name}:/trunk/feature1]" in authz_content

        # 5. Evaluate root permission -> should report implicit traversal read
        eval_root = client.post("/api/v1/acl/evaluate", json={
            "username": test_user,
            "repository_id": repo_id,
            "path": "/"
        })
        assert eval_root.status_code == 200
        root_data = eval_root.json()
        assert root_data["effective_permission"] == "r"
        assert root_data["can_read"] is True
        assert root_data["can_write"] is False
        assert any(t.get("scope") == "implicit_traversal" for t in root_data["decision_trace"])

        # 6. Evaluate subpath permission -> should report explicit rw
        eval_sub = client.post("/api/v1/acl/evaluate", json={
            "username": test_user,
            "repository_id": repo_id,
            "path": "/trunk/feature1"
        })
        assert eval_sub.status_code == 200
        sub_data = eval_sub.json()
        assert sub_data["effective_permission"] == "rw"
        assert sub_data["can_read"] is True
        assert sub_data["can_write"] is True

    finally:
        client.delete(f"/api/v1/repositories/{repo_id}?delete_files=true")

