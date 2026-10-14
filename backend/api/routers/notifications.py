"""
Subversion Nuvi - Admin Notifications API Router
Provides real-time notifications for Subversion repository updates and commits,
maintains read/unread state for administrator login, and supports batch operations.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.models.dto import (
    NotificationResponse,
    NotificationListResponse,
    UnreadCountResponse,
    NotificationMarkReadRequest,
)
from backend.api.services.notification_service import NotificationService
from backend.api.services.token_service import get_optional_current_user

router = APIRouter(prefix="/notifications", tags=["Admin Notifications"])


def _require_admin(request: Request, db: Session):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required to access repository notifications."
        )
    return user


@router.get("", response_model=NotificationListResponse, summary="List repository update notifications")
def list_notifications(
    request: Request,
    is_read: Optional[bool] = Query(None, description="Filter by read (true) or unread (false)"),
    repository_id: Optional[int] = Query(None, description="Filter by specific repository ID"),
    limit: int = Query(50, ge=1, le=500, description="Max notifications to retrieve"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    auto_sync: bool = Query(True, description="Sync new repository commits before listing"),
    db: Session = Depends(get_db)
):
    _require_admin(request, db)

    if auto_sync:
        try:
            NotificationService.sync_repository_notifications(db, repository_id)
        except Exception:
            pass

    items, total, unread_count = NotificationService.get_notifications(
        db, is_read=is_read, repository_id=repository_id, limit=limit, offset=offset
    )

    return NotificationListResponse(
        total=total,
        unread_count=unread_count,
        notifications=[NotificationResponse(**item) for item in items]
    )


@router.get("/unread-count", response_model=UnreadCountResponse, summary="Get unread notification count")
def get_unread_count(
    request: Request,
    repository_id: Optional[int] = Query(None, description="Filter by repository ID"),
    auto_sync: bool = Query(True, description="Sync latest repository commits"),
    db: Session = Depends(get_db)
):
    _require_admin(request, db)

    if auto_sync:
        try:
            NotificationService.sync_repository_notifications(db, repository_id)
        except Exception:
            pass

    count = NotificationService.get_unread_count(db, repository_id)
    return UnreadCountResponse(unread_count=count)


@router.post("/sync", summary="Force sync repository updates into notifications")
def sync_repository_updates(
    request: Request,
    repository_id: Optional[int] = Query(None, description="Specific repository ID to sync"),
    db: Session = Depends(get_db)
):
    _require_admin(request, db)
    new_count = NotificationService.sync_repository_notifications(db, repository_id)
    return {
        "status": "success",
        "new_notifications_count": new_count,
        "message": f"Successfully synchronized {new_count} new repository updates."
    }


@router.post("/{notification_id}/read", response_model=NotificationResponse, summary="Mark notification as read")
def mark_notification_read(
    notification_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    _require_admin(request, db)
    notif = NotificationService.mark_as_read(db, notification_id)
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    
    import json
    changed_paths = []
    if notif.changed_paths_json:
        try:
            changed_paths = json.loads(notif.changed_paths_json)
        except Exception:
            pass

    return NotificationResponse(
        id=notif.id,
        repository_id=notif.repository_id,
        repository_name=notif.repository_name,
        revision=notif.revision,
        author=notif.author,
        message=notif.message,
        changed_paths=changed_paths,
        action_type=notif.action_type,
        summary=notif.summary,
        is_read=notif.is_read,
        read_at=notif.read_at,
        created_at=notif.created_at
    )


@router.post("/{notification_id}/unread", response_model=NotificationResponse, summary="Mark notification as unread")
def mark_notification_unread(
    notification_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    _require_admin(request, db)
    notif = NotificationService.mark_as_unread(db, notification_id)
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    import json
    changed_paths = []
    if notif.changed_paths_json:
        try:
            changed_paths = json.loads(notif.changed_paths_json)
        except Exception:
            pass

    return NotificationResponse(
        id=notif.id,
        repository_id=notif.repository_id,
        repository_name=notif.repository_name,
        revision=notif.revision,
        author=notif.author,
        message=notif.message,
        changed_paths=changed_paths,
        action_type=notif.action_type,
        summary=notif.summary,
        is_read=notif.is_read,
        read_at=notif.read_at,
        created_at=notif.created_at
    )


@router.post("/mark-all-read", summary="Mark all unread notifications as read")
def mark_all_notifications_read(
    request: Request,
    req: Optional[NotificationMarkReadRequest] = None,
    db: Session = Depends(get_db)
):
    _require_admin(request, db)
    repo_id = req.repository_id if req else None
    count = NotificationService.mark_all_read(db, repository_id=repo_id)
    return {
        "status": "success",
        "marked_count": count,
        "message": f"Marked {count} notifications as read."
    }


@router.delete("/clear-read", summary="Clear all read notifications")
def clear_read_notifications(
    request: Request,
    repository_id: Optional[int] = Query(None, description="Optional repository ID filter"),
    db: Session = Depends(get_db)
):
    _require_admin(request, db)
    count = NotificationService.clear_read_notifications(db, repository_id)
    return {
        "status": "success",
        "deleted_count": count,
        "message": f"Cleared {count} read notifications."
    }


@router.delete("/{notification_id}", summary="Delete a notification")
def delete_notification(
    notification_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    _require_admin(request, db)
    success = NotificationService.delete_notification(db, notification_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return {"status": "success", "message": "Notification deleted successfully."}
