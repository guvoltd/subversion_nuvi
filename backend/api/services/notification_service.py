"""
Subversion Nuvi - Repository Update Notification Service
Tracks SVN repository commits and changes, automatically generates notifications
for administrator review, and maintains read/unread status across all repositories.
"""

import os
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.api.models.schema import Repository, Notification
from backend.api.services.svn_native import svn_engine


class NotificationService:
    @staticmethod
    def sync_repository_notifications(db: Session, repo_id: Optional[int] = None) -> int:
        """
        Synchronizes commit history across all (or specified) repositories into Notification records.
        Any commit not yet tracked in the Notification table will be added with is_read=False.
        """
        query = db.query(Repository)
        if repo_id:
            query = query.filter(Repository.id == repo_id)
        repos = query.all()

        new_count = 0
        for repo in repos:
            if not repo.fs_path or not os.path.exists(repo.fs_path):
                continue

            try:
                info = svn_engine.get_repository_info(repo.fs_path)
                latest_rev = info.get("latest_revision", 0)
            except Exception:
                continue

            if latest_rev <= 0:
                continue

            # Query the highest revision currently recorded for this repository
            max_recorded = db.query(func.max(Notification.revision)).filter(
                Notification.repository_id == repo.id
            ).scalar()

            if max_recorded is None:
                # First time syncing: grab up to latest 50 revisions so admin sees recent activity
                limit = min(latest_rev, 50)
                start_rev = latest_rev
            elif latest_rev > max_recorded:
                limit = latest_rev - max_recorded
                start_rev = latest_rev
            else:
                # Already up to date
                continue

            try:
                logs = svn_engine.get_commit_logs(repo.fs_path, subpath="/", limit=limit, revision=start_rev)
            except Exception:
                continue

            for entry in logs:
                rev = entry.get("revision", 0)
                if max_recorded is not None and rev <= max_recorded:
                    continue

                # Check if this rev is already tracked (avoid duplicate records)
                existing = db.query(Notification).filter(
                    Notification.repository_id == repo.id,
                    Notification.revision == rev
                ).first()
                if existing:
                    continue

                author = entry.get("author") or "anonymous"
                msg = entry.get("message") or ""
                changed_paths = entry.get("changed_paths") or []

                # Parse date if available
                date_str = entry.get("date")
                created_dt = datetime.now(timezone.utc)
                if date_str:
                    try:
                        # SVN XML dates are like: 2026-10-13T12:00:00.000000Z
                        clean_dt = date_str.replace("Z", "+00:00")
                        created_dt = datetime.fromisoformat(clean_dt)
                    except Exception:
                        created_dt = datetime.now(timezone.utc)

                summary = f"Revision r{rev} committed by {author}"
                if msg:
                    first_line = msg.strip().split("\n")[0]
                    if len(first_line) > 80:
                        first_line = first_line[:77] + "..."
                    summary += f": {first_line}"

                notif = Notification(
                    repository_id=repo.id,
                    repository_name=repo.name,
                    revision=rev,
                    author=author,
                    message=msg,
                    changed_paths_json=json.dumps(changed_paths),
                    action_type="commit",
                    summary=summary,
                    is_read=False,
                    created_at=created_dt
                )
                db.add(notif)
                new_count += 1

        if new_count > 0:
            db.commit()

        return new_count

    @staticmethod
    def create_notification(
        db: Session,
        repository_id: Optional[int],
        repository_name: str,
        revision: Optional[int] = None,
        author: Optional[str] = "web-admin",
        message: Optional[str] = "",
        changed_paths: Optional[List[Dict[str, Any]]] = None,
        action_type: str = "commit",
        summary: Optional[str] = None
    ) -> Notification:
        """Explicitly record a notification for web actions (e.g. upload, mkdir, delete)."""
        if not summary:
            summary = f"Revision r{revision} {action_type} by {author}" if revision else f"{action_type.capitalize()} by {author}"

        notif = Notification(
            repository_id=repository_id,
            repository_name=repository_name,
            revision=revision,
            author=author,
            message=message or "",
            changed_paths_json=json.dumps(changed_paths or []),
            action_type=action_type,
            summary=summary,
            is_read=False,
            created_at=datetime.now(timezone.utc)
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)
        return notif

    @staticmethod
    def get_notifications(
        db: Session,
        is_read: Optional[bool] = None,
        repository_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int, int]:
        """
        Retrieves notifications with total count and unread count.
        """
        # Unread count
        unread_q = db.query(func.count(Notification.id)).filter(Notification.is_read == False)
        if repository_id:
            unread_q = unread_q.filter(Notification.repository_id == repository_id)
        unread_count = unread_q.scalar() or 0

        # Filtered query
        q = db.query(Notification)
        if repository_id:
            q = q.filter(Notification.repository_id == repository_id)
        if is_read is not None:
            q = q.filter(Notification.is_read == is_read)

        total = q.count()
        rows = q.order_by(
            Notification.created_at.desc(),
            Notification.revision.desc().nullslast(),
            Notification.id.desc()
        ).offset(offset).limit(limit).all()

        results = []
        for n in rows:
            changed_paths = []
            if n.changed_paths_json:
                try:
                    changed_paths = json.loads(n.changed_paths_json)
                except Exception:
                    changed_paths = []

            results.append({
                "id": n.id,
                "repository_id": n.repository_id,
                "repository_name": n.repository_name,
                "revision": n.revision,
                "author": n.author,
                "message": n.message,
                "changed_paths": changed_paths,
                "action_type": n.action_type,
                "summary": n.summary,
                "is_read": n.is_read,
                "read_at": n.read_at,
                "created_at": n.created_at
            })

        return results, total, unread_count

    @staticmethod
    def get_unread_count(db: Session, repository_id: Optional[int] = None) -> int:
        """Returns the number of unread notifications for admin."""
        q = db.query(func.count(Notification.id)).filter(Notification.is_read == False)
        if repository_id:
            q = q.filter(Notification.repository_id == repository_id)
        return q.scalar() or 0

    @staticmethod
    def mark_as_read(db: Session, notification_id: int) -> Optional[Notification]:
        """Marks a single notification as read."""
        notif = db.query(Notification).filter(Notification.id == notification_id).first()
        if not notif:
            return None
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notif)
        return notif

    @staticmethod
    def mark_as_unread(db: Session, notification_id: int) -> Optional[Notification]:
        """Marks a single notification as unread."""
        notif = db.query(Notification).filter(Notification.id == notification_id).first()
        if not notif:
            return None
        notif.is_read = False
        notif.read_at = None
        db.commit()
        db.refresh(notif)
        return notif

    @staticmethod
    def mark_all_read(db: Session, repository_id: Optional[int] = None) -> int:
        """Marks all unread notifications as read."""
        q = db.query(Notification).filter(Notification.is_read == False)
        if repository_id:
            q = q.filter(Notification.repository_id == repository_id)
        count = q.count()
        q.update({"is_read": True, "read_at": datetime.now(timezone.utc)}, synchronize_session=False)
        db.commit()
        return count

    @staticmethod
    def delete_notification(db: Session, notification_id: int) -> bool:
        """Deletes a notification."""
        notif = db.query(Notification).filter(Notification.id == notification_id).first()
        if not notif:
            return False
        db.delete(notif)
        db.commit()
        return True

    @staticmethod
    def clear_read_notifications(db: Session, repository_id: Optional[int] = None) -> int:
        """Deletes all notifications that have been marked as read."""
        q = db.query(Notification).filter(Notification.is_read == True)
        if repository_id:
            q = q.filter(Notification.repository_id == repository_id)
        count = q.count()
        q.delete(synchronize_session=False)
        db.commit()
        return count

