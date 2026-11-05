"""
Subversion Nuvi - Automated Periodic Backups & Maintenance Tools Tests
Tests multi-task scheduled backup queues, custom destinations, multiple backup types
(hotcopy, dump, authz), automated retention, maintenance operations (pack, clean-txns, verify),
and admin notification emission.
"""

import os
import uuid
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.db import init_db, SessionLocal
from backend.api.models.schema import Notification, BackupScheduleJob, BackupArchiveRecord
from backend.api.services.repo_service import RepositoryService
from backend.api.models.dto import RepositoryCreateRequest
from backend.api.services.backup_service import BackupService
from backend.api.services.maintenance_service import MaintenanceService

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()

def test_backup_schedules_crud_and_queue():
    db = SessionLocal()
    try:
        uid = uuid.uuid4().hex[:6]
        repo_name = f"SchedRepo_{uid}"
        repo = RepositoryService.create_repository(
            db,
            RepositoryCreateRequest(name=repo_name, standard_layout=True),
            actor="admin"
        )

        # 1. Create a global schedule
        create_res = client.post("/api/v1/operations/backup/schedules", json={
            "name": f"Weekly Global Hotcopy {uid}",
            "repository_id": None,
            "backup_type": "hotcopy_full",
            "schedule_frequency": "weekly",
            "schedule_time": "03:00",
            "schedule_weekday": 6,
            "retention_count": 5,
            "is_enabled": True
        })
        assert create_res.status_code == 200
        sched1 = create_res.json()
        assert sched1["name"] == f"Weekly Global Hotcopy {uid}"
        assert sched1["repository_id"] is None
        assert sched1["backup_type"] == "hotcopy_full"
        assert sched1["next_run_at"] is not None

        # 2. Create a repo-specific dump schedule with custom destination
        with tempfile.TemporaryDirectory() as custom_dir:
            create_res2 = client.post("/api/v1/operations/backup/schedules", json={
                "name": f"Daily Dump {repo_name}",
                "repository_id": repo.id,
                "backup_type": "dump_full",
                "schedule_frequency": "daily",
                "schedule_time": "01:00",
                "destination_path": custom_dir,
                "retention_count": 3,
                "is_enabled": True
            })
            assert create_res2.status_code == 200
            sched2 = create_res2.json()
            assert sched2["destination_path"] == custom_dir

            # 3. List schedules
            list_res = client.get("/api/v1/operations/backup/schedules")
            assert list_res.status_code == 200
            jobs = list_res.json()
            assert any(j["id"] == sched1["id"] for j in jobs)
            assert any(j["id"] == sched2["id"] for j in jobs)

            # 4. Toggle schedule
            toggle_res = client.post(f"/api/v1/operations/backup/schedules/{sched2['id']}/toggle")
            assert toggle_res.status_code == 200
            assert toggle_res.json()["is_enabled"] is False

            toggle_res2 = client.post(f"/api/v1/operations/backup/schedules/{sched2['id']}/toggle")
            assert toggle_res2.json()["is_enabled"] is True

            # 5. Run schedule now
            run_res = client.post(f"/api/v1/operations/backup/schedules/{sched2['id']}/run")
            assert run_res.status_code == 200
            run_data = run_res.json()
            assert run_data["status"] == "success"

            # Check that files were created in custom_dir
            created_files = list(Path(custom_dir).glob("*.dump.gz"))
            assert len(created_files) >= 1

            # Check admin notification created
            notif = db.query(Notification).filter(
                Notification.action_type == "backup_completed"
            ).order_by(Notification.id.desc()).first()
            assert notif is not None
            assert f"Daily Dump {repo_name}" in notif.summary

            # 6. Delete schedule
            del_res = client.delete(f"/api/v1/operations/backup/schedules/{sched1['id']}")
            assert del_res.status_code == 200
    finally:
        db.close()

def test_authz_config_backup_and_archive_download():
    db = SessionLocal()
    try:
        with tempfile.TemporaryDirectory() as dest_dir:
            # 1. Execute authz_config snapshot backup
            res = BackupService.execute_authz_config_backup(
                db,
                destination_path=dest_dir,
                encryption_enabled=False,
                retention_count=3,
                actor="test_admin"
            )
            assert res["status"] == "success"
            archive_id = res["backup_id"]
            filename = res["filename"]
            assert filename.endswith(".zip")

            # 2. Check archive record in DB
            rec = db.query(BackupArchiveRecord).filter(BackupArchiveRecord.id == archive_id).first()
            assert rec is not None
            assert rec.backup_type == "authz_config"

            # 3. Test download endpoint
            dl_res = client.get(f"/api/v1/operations/backup/archives/{archive_id}/download")
            assert dl_res.status_code == 200
            assert len(dl_res.content) == res["size_bytes"]

            # 4. Test delete archive endpoint
            del_res = client.delete(f"/api/v1/operations/backup/archives/{archive_id}")
            assert del_res.status_code == 200
            assert not (Path(dest_dir) / filename).exists()
    finally:
        db.close()

def test_maintenance_tools_pack_clean_verify_storage():
    db = SessionLocal()
    try:
        uid = uuid.uuid4().hex[:6]
        repo_name = f"MaintRepo_{uid}"
        repo = RepositoryService.create_repository(
            db,
            RepositoryCreateRequest(name=repo_name, standard_layout=True),
            actor="admin"
        )

        # 1. FSFS Shard Packing
        pack_res = client.post(f"/api/v1/operations/maintenance/pack/{repo.id}")
        assert pack_res.status_code == 200
        pack_data = pack_res.json()
        assert pack_data["status"] == "success"
        assert "elapsed_seconds" in pack_data

        # 2. Dead Transactions Cleaner
        clean_res = client.post(f"/api/v1/operations/maintenance/clean-txns/{repo.id}")
        assert clean_res.status_code == 200
        clean_data = clean_res.json()
        assert clean_data["status"] == "success"
        assert "cleaned_count" in clean_data

        # 3. Live svnadmin verify
        verify_res = client.post(f"/api/v1/operations/maintenance/verify/{repo.id}", json={
            "start_revision": 0,
            "end_revision": 0
        })
        assert verify_res.status_code == 200
        verify_data = verify_res.json()
        assert verify_data["status"] == "verified"
        assert "* Verified revision 0." in verify_data["log_output"]

        # 4. Storage Breakdown Stats
        stats_res = client.get("/api/v1/operations/maintenance/storage-stats")
        assert stats_res.status_code == 200
        stats = stats_res.json()
        assert len(stats) >= 1
        target_stat = next((s for s in stats if s["repository_id"] == repo.id), None)
        assert target_stat is not None
        assert target_stat["total_size_bytes"] > 0
        assert "revs_size_bytes" in target_stat
    finally:
        db.close()


def test_backup_failure_logging_and_notification_enrichment():
    from backend.api.models.schema import Repository, AuditLog
    from backend.api.services.notification_service import NotificationService

    db = SessionLocal()
    try:
        uid = uuid.uuid4().hex[:6]
        # 1. Create a repository with a non-existent filesystem path to force execution failure
        bad_repo = Repository(
            name=f"FailingRepo_{uid}",
            description="Testing backup failure logging",
            fs_path=f"/nonexistent/path/to/svn_{uid}",
            latest_revision=5
        )
        db.add(bad_repo)
        db.commit()
        db.refresh(bad_repo)

        # Create a scheduled job targeting this bad repository
        job_name = f"failing-backup-job-{uid}"
        job = BackupScheduleJob(
            name=job_name,
            repository_id=bad_repo.id,
            backup_type="hotcopy_full",
            schedule_frequency="daily",
            schedule_time="02:00",
            destination_path="/tmp/nuvi_test_backups",
            is_enabled=True,
            skip_if_unchanged=False
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        # 2. Run scheduled job and verify detailed failure diagnostics are logged
        res = BackupService.run_scheduled_job(db, job.id, force=True, actor="test_runner")
        assert res["status"] == "failed"
        assert len(res["results"]) == 1
        assert res["results"][0]["status"] == "failed"
        assert "error" in res["results"][0]

        # Verify Job state
        db.refresh(job)
        assert job.last_run_status == "failed"
        assert "0 succeeded, 0 skipped, 1 failed" in job.last_run_message
        assert "Error:" in job.last_run_message or "Reason:" in job.last_run_message

        # Verify Notification record contains full failure diagnostics
        notif = db.query(Notification).filter(
            Notification.repository_name == job_name,
            Notification.action_type == "backup_failed"
        ).order_by(Notification.id.desc()).first()
        assert notif is not None
        assert "FAILED" in notif.summary
        assert "=== FAILURE ROOT CAUSE & DIAGNOSTICS ===" in notif.message
        assert "=== PER-REPOSITORY FAILURE BREAKDOWN ===" in notif.message
        assert f"FailingRepo_{uid}" in notif.message
        assert "does not exist on disk" in notif.message or "nonexistent" in notif.message

        # Verify Audit Log entry
        audit_event = db.query(AuditLog).filter(
            AuditLog.action_name == "backup_job_failed",
            AuditLog.target_id == str(job.id)
        ).first()
        assert audit_event is not None
        assert audit_event.action_category == "operational"

        # 3. Test Legacy Notification Enrichment
        legacy_msg = "Scheduled execution of 'legacy-test-backup' finished with status: FAILED.\n0 succeeded, 0 skipped, 29 failed."
        legacy_notif = Notification(
            repository_name="legacy-test-backup",
            action_type="backup_failed",
            summary="Backup Job 'legacy-test-backup': 0 succeeded, 0 skipped, 29 failed.",
            message=legacy_msg,
            is_read=False
        )
        db.add(legacy_notif)
        db.commit()
        db.refresh(legacy_notif)

        enriched = NotificationService.enrich_legacy_failed_notifications(db)
        assert enriched >= 1
        db.refresh(legacy_notif)
        assert "=== DIAGNOSTIC FAILURE REPORT ===" in legacy_notif.message
        assert "Troubleshooting & Diagnostics:" in legacy_notif.message

        # 4. Test Manual Backup Failure API Endpoint
        manual_fail_res = client.post(f"/api/v1/operations/backup/run/{bad_repo.id}", json={
            "backup_type": "hotcopy_full",
            "force": True
        })
        assert manual_fail_res.status_code == 500
        manual_notif = db.query(Notification).filter(
            Notification.repository_id == bad_repo.id,
            Notification.action_type == "backup_failed"
        ).order_by(Notification.id.desc()).first()
        assert manual_notif is not None
        assert "Manual Backup of" in manual_notif.summary
        assert "=== Diagnostic Traceback ===" in manual_notif.message

    finally:
        try:
            db.delete(job)
            db.delete(bad_repo)
            db.delete(legacy_notif)
            db.commit()
        except Exception:
            pass
        db.close()
