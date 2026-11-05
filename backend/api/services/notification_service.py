"""
Subversion Nuvi - Repository Update Notification Service
Tracks SVN repository commits and changes, automatically generates notifications
for administrator review, and maintains read/unread status across all repositories.
Includes persistent cleared revision markers to prevent resurrecting deleted notifications.
"""

import os
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.api.models.schema import Repository, Notification, ServerConfiguration, BackupScheduleJob
from backend.api.services.svn_native import svn_engine
from backend.api.services.repo_service import RepositoryService


class NotificationService:
    @staticmethod
    def _get_cleared_revision(db: Session, repo_id: int) -> int:
        """Returns the highest revision marked as cleared for this repository."""
        key = f"notif_cleared_rev_{repo_id}"
        cfg = db.query(ServerConfiguration).filter(ServerConfiguration.key == key).first()
        if cfg and cfg.value:
            try:
                return int(cfg.value)
            except ValueError:
                pass
        return 0

    @staticmethod
    def _set_cleared_revision(db: Session, repo_id: int, revision: int) -> None:
        """Stores the cleared revision marker so cleared commits are never re-imported."""
        key = f"notif_cleared_rev_{repo_id}"
        cfg = db.query(ServerConfiguration).filter(ServerConfiguration.key == key).first()
        if cfg:
            cfg.value = str(revision)
            cfg.updated_at = datetime.now(timezone.utc)
        else:
            cfg = ServerConfiguration(
                key=key,
                value=str(revision),
                description=f"Highest cleared notification revision for repository #{repo_id}"
            )
            db.add(cfg)
        db.commit()

    @staticmethod
    def sync_repository_notifications(db: Session, repo_id: Optional[int] = None) -> int:
        """
        Synchronizes commit history across all (or specified) repositories into Notification records.
        Any commit not yet tracked in the Notification table will be added with is_read=False.
        Prevents resurrecting cleared/read notifications and verifies repository path resolution.
        """
        query = db.query(Repository)
        if repo_id:
            query = query.filter(Repository.id == repo_id)
        repos = query.all()

        new_count = 0
        for repo in repos:
            # 1. Resolve and auto-heal repository path
            repo_path = RepositoryService._resolve_repo_path(db, repo)
            if not repo_path or not os.path.exists(repo_path):
                continue

            if repo.fs_path != str(repo_path):
                repo.fs_path = str(repo_path)
                try:
                    db.commit()
                except Exception:
                    db.rollback()

            try:
                info = svn_engine.get_repository_info(str(repo_path))
                latest_rev = info.get("latest_revision", 0)
            except Exception:
                continue

            if latest_rev <= 0:
                continue

            # Update repo latest revision in database if out of date
            if repo.latest_revision != latest_rev:
                repo.latest_revision = latest_rev
                try:
                    db.commit()
                except Exception:
                    db.rollback()

            # 2. Check cleared revision marker from ServerConfiguration
            cleared_rev = NotificationService._get_cleared_revision(db, repo.id)

            # Query the highest revision currently recorded in notifications table for this repo
            max_in_db = db.query(func.max(Notification.revision)).filter(
                Notification.repository_id == repo.id
            ).scalar()

            # 3. Self-heal any existing Notification records for this repo whose repository_name is desynchronized
            stale_names = db.query(Notification).filter(
                Notification.repository_id == repo.id,
                Notification.repository_name != repo.name
            ).all()
            if stale_names:
                for sn in stale_names:
                    sn.repository_name = repo.name
                try:
                    db.commit()
                except Exception:
                    db.rollback()

            # Effective highest recorded revision
            max_recorded = max(max_in_db or 0, cleared_rev)

            if max_recorded == 0 and max_in_db is None and cleared_rev == 0:
                # First time syncing ever on a fresh repository: grab up to latest 50 revisions
                limit = min(latest_rev, 50)
                start_rev = latest_rev
            elif latest_rev > max_recorded:
                limit = latest_rev - max_recorded
                start_rev = latest_rev
            else:
                # Already up to date (or all revisions up to latest_rev have been cleared!)
                continue

            try:
                logs = svn_engine.get_commit_logs(str(repo_path), subpath="/", limit=limit, revision=start_rev)
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
    def enrich_legacy_failed_notifications(db: Session) -> int:
        """
        Scans existing Notification records for past failed executions (e.g. backup failures)
        that were created without detailed failure logs/diagnostics and enriches them with
        diagnostic root cause details from corresponding jobs or server telemetry.
        """
        try:
            failed_notifs = db.query(Notification).filter(
                (Notification.action_type.like("%fail%")) |
                (Notification.message.like("%status: FAILED%"))
            ).all()

            enriched_count = 0
            for n in failed_notifs:
                msg = n.message or ""
                # Check if this notification is an un-detailed legacy failure message
                if "=== " not in msg and ("0 succeeded" in msg or "status: FAILED" in msg):
                    # Find matching BackupScheduleJob
                    job = db.query(BackupScheduleJob).filter(
                        BackupScheduleJob.name == n.repository_name
                    ).first()

                    job_info = f"Job Name: {job.name} (ID: {job.id})\nJob Type: {job.backup_type}\nDestination: {job.destination_path or 'Default'}\nLast Run Message: {job.last_run_message}" if job else f"Target Name: {n.repository_name}"

                    enrichment = (
                        f"\n\n=== DIAGNOSTIC FAILURE REPORT ===\n"
                        f"Status: FAILED (Recorded prior to enhanced real-time logging)\n"
                        f"{job_info}\n"
                        f"Troubleshooting & Diagnostics:\n"
                        f"• Check destination filesystem permissions and available disk space.\n"
                        f"• Verify repository paths are accessible by the subversion service account.\n"
                        f"• Run the backup schedule manually from Operations > Backup Schedules to capture live real-time error logs."
                    )
                    n.message = msg + enrichment
                    enriched_count += 1

            if enriched_count > 0:
                db.commit()
            return enriched_count
        except Exception:
            db.rollback()
            return 0

    @staticmethod
    def get_notifications(
        db: Session,
        is_read: Optional[bool] = None,
        repository_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int, int, int]:
        """
        Retrieves notifications with total count, unread count, and read count.
        """
        # Automatically enrich legacy un-detailed failed notifications
        NotificationService.enrich_legacy_failed_notifications(db)

        # Base query scoped by repository
        base_q = db.query(Notification)
        if repository_id:
            base_q = base_q.filter(Notification.repository_id == repository_id)

        total = base_q.count()
        unread_count = base_q.filter(Notification.is_read == False).count()
        read_count = base_q.filter(Notification.is_read == True).count()

        q = base_q
        if is_read is not None:
            q = q.filter(Notification.is_read == is_read)

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

            # Always resolve accurate live repository name if repository_id is valid
            repo_name = n.repository_name
            if n.repository:
                repo_name = n.repository.name
                if n.repository_name != n.repository.name:
                    n.repository_name = n.repository.name
                    try:
                        db.commit()
                    except Exception:
                        db.rollback()
            elif n.repository_id:
                r = db.query(Repository).filter(Repository.id == n.repository_id).first()
                if r:
                    repo_name = r.name
                    if n.repository_name != r.name:
                        n.repository_name = r.name
                        try:
                            db.commit()
                        except Exception:
                            db.rollback()

            results.append({
                "id": n.id,
                "repository_id": n.repository_id,
                "repository_name": repo_name,
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

        return results, total, unread_count, read_count

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
        """Deletes all notifications that have been marked as read and advances cleared revision marker."""
        q = db.query(Notification).filter(Notification.is_read == True)
        if repository_id:
            q = q.filter(Notification.repository_id == repository_id)

        read_notifs = q.all()
        count = len(read_notifs)
        if count == 0:
            return 0

        # Group max read revision per repository
        repo_max: Dict[int, int] = {}
        for n in read_notifs:
            if n.repository_id and n.revision:
                repo_max[n.repository_id] = max(repo_max.get(n.repository_id, 0), n.revision)

        for rid, max_rev in repo_max.items():
            curr_cleared = NotificationService._get_cleared_revision(db, rid)
            if max_rev > curr_cleared:
                NotificationService._set_cleared_revision(db, rid, max_rev)

        q.delete(synchronize_session=False)
        db.commit()
        return count

    @staticmethod
    def clear_all_notifications(db: Session, repository_id: Optional[int] = None) -> int:
        """Deletes all notifications (read and unread) and permanently advances cleared revision marker."""
        q = db.query(Notification)
        if repository_id:
            q = q.filter(Notification.repository_id == repository_id)

        count = q.count()

        # Update cleared revision markers for all affected repositories
        repos_query = db.query(Repository)
        if repository_id:
            repos_query = repos_query.filter(Repository.id == repository_id)
        repos = repos_query.all()
        for r in repos:
            repo_path = RepositoryService._resolve_repo_path(db, r)
            curr_rev = r.latest_revision
            if repo_path and os.path.exists(repo_path):
                try:
                    info = svn_engine.get_repository_info(str(repo_path))
                    curr_rev = info.get("latest_revision", curr_rev)
                except Exception:
                    pass
            NotificationService._set_cleared_revision(db, r.id, curr_rev)

        q.delete(synchronize_session=False)
        db.commit()
        return count
