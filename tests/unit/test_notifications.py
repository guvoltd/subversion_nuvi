"""
Unit & Integration Tests for Admin Notifications & Repository Update Tracking
"""

import io
import uuid
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.db import init_db, SessionLocal
from backend.api.services.notification_service import NotificationService
from backend.api.models.schema import User
from backend.api.services.token_service import create_access_token

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()

def test_notification_creation_and_lifecycle():
    db = SessionLocal()
    try:
        notif = NotificationService.create_notification(
            db=db,
            repository_id=None,
            repository_name="test_repo",
            revision=10,
            author="developer",
            message="Add core features",
            changed_paths=[{"action": "A", "path": "/trunk/core.py"}],
            action_type="commit"
        )
        assert notif.id is not None
        assert notif.is_read is False

        # Get notifications
        items, total, unread = NotificationService.get_notifications(db)
        assert total >= 1
        assert unread >= 1
        target = next((item for item in items if item["id"] == notif.id), None)
        assert target is not None
        assert target["is_read"] is False
        assert len(target["changed_paths"]) == 1
        assert target["changed_paths"][0]["path"] == "/trunk/core.py"

        # Mark as read
        updated = NotificationService.mark_as_read(db, notif.id)
        assert updated.is_read is True
        assert updated.read_at is not None

        # Check unread count
        unread_after = NotificationService.get_unread_count(db)
        assert unread_after == unread - 1

        # Mark as unread
        updated_unread = NotificationService.mark_as_unread(db, notif.id)
        assert updated_unread.is_read is False
        assert updated_unread.read_at is None

        # Delete notification
        deleted = NotificationService.delete_notification(db, notif.id)
        assert deleted is True
    finally:
        db.close()

def test_notification_api_endpoints():
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == "admin").first()
        admin_token = create_access_token(admin_user) if admin_user else None
    finally:
        db.close()

    headers = {"Authorization": f"Bearer {admin_token}"} if admin_token else {}

    # List notifications
    res = client.get("/api/v1/notifications", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "total" in data
    assert "unread_count" in data
    assert "notifications" in data

    # Unread count endpoint
    res_count = client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res_count.status_code == 200
    assert "unread_count" in res_count.json()

    # Create a test notification directly in db for API testing
    db = SessionLocal()
    try:
        notif = NotificationService.create_notification(
            db=db,
            repository_id=None,
            repository_name="api_test_repo",
            revision=42,
            author="tester",
            message="Test commit message",
            changed_paths=[{"action": "M", "path": "/trunk/test.txt"}]
        )
        notif_id = notif.id
    finally:
        db.close()

    # Mark read via API
    res_read = client.post(f"/api/v1/notifications/{notif_id}/read", headers=headers)
    assert res_read.status_code == 200
    assert res_read.json()["is_read"] is True

    # Mark unread via API
    res_unread = client.post(f"/api/v1/notifications/{notif_id}/unread", headers=headers)
    assert res_unread.status_code == 200
    assert res_unread.json()["is_read"] is False

    # Mark all read via API
    res_all = client.post("/api/v1/notifications/mark-all-read", json={}, headers=headers)
    assert res_all.status_code == 200
    assert res_all.json()["marked_count"] >= 1

    # Clear read notifications
    res_clear = client.delete("/api/v1/notifications/clear-read", headers=headers)
    assert res_clear.status_code == 200
    assert res_clear.json()["status"] == "success"

def test_sync_repository_notifications():
    uid = uuid.uuid4().hex[:6]
    repo_name = f"notif_repo_{uid}"

    # 1. Create repository
    create_res = client.post("/api/v1/repositories", json={
        "name": repo_name,
        "description": "Notification sync test repo",
        "init_standard_layout": True,
        "layout_author": "admin"
    })
    assert create_res.status_code == 201
    repo_id = create_res.json()["id"]

    try:
        # 2. Upload file (commits revision 2)
        upload_res = client.post(
            f"/api/v1/browser/{repo_id}/upload",
            data={
                "file_path": "/trunk/notify.txt",
                "commit_author": "committer-bob",
                "commit_message": "Add notify file for test"
            },
            files={"file": ("notify.txt", io.BytesIO(b"Hello Notification"), "text/plain")}
        )
        assert upload_res.status_code == 200
        rev = upload_res.json()["committed_revision"]
        assert rev >= 2

        # 3. Query notifications for this repo
        res = client.get(f"/api/v1/notifications?repository_id={repo_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1
        notif_revs = [n["revision"] for n in data["notifications"]]
        assert rev in notif_revs

        # Find the notification for this commit
        target_notif = next(n for n in data["notifications"] if n["revision"] == rev)
        assert target_notif["author"] == "committer-bob"
        assert "notify file" in target_notif["message"]
        assert target_notif["is_read"] is False
    finally:
        # Cleanup repository
        client.delete(f"/api/v1/repositories/{repo_id}?delete_files=true")
