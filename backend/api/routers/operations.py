"""
Subversion Nuvi - Operations, Disaster Recovery & Replication API Router
Provides endpoints for Hot Backups, Dump Archives, Authz Snapshots, Scheduled Job Queue,
GFS Pruning, AES-256-GCM Encryption, Sandbox Verification, FSFS Shard Packing,
Dead Transaction Cleaning, Storage Profiling, Hook Engine, and Multi-Site Replication.
"""

from typing import List, Optional, Dict, Any
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.models.dto import (
    BackupPolicyCreateRequest,
    BackupPolicyResponse,
    BackupArchiveResponse,
    BackupVerifyResponse,
    BackupRestoreRequest,
    BackupScheduleJobCreateRequest,
    BackupScheduleJobUpdateRequest,
    BackupScheduleJobResponse,
    HookConfigUpdateRequest,
    HookConfigResponse,
    ReplicationNodeCreateRequest,
    ReplicationNodeResponse,
)
from backend.api.models.schema import Repository, BackupArchiveRecord
from backend.api.services.backup_service import BackupService
from backend.api.services.maintenance_service import MaintenanceService
from backend.api.services.hook_service import HookService
from backend.api.services.replication_service import ReplicationService

router = APIRouter(prefix="/operations", tags=["Operations & DR"])

# --- Request Schemas ---

class RunBackupRequest(BaseModel):
    backup_type: str = "hotcopy_full"
    force: bool = False
    passphrase: Optional[str] = None

class ImportSeedRequest(BaseModel):
    seed_path: str
    new_repository_name: str
    master_url: str

class VerifyRepoRequest(BaseModel):
    start_revision: Optional[int] = None
    end_revision: Optional[int] = None

# --- Scheduled Backup Jobs Queue ---

@router.get("/backup/schedules", summary="List all scheduled backup jobs")
def list_backup_schedules(repo_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    return BackupService.list_schedule_jobs(db, repo_id)

@router.post("/backup/schedules", summary="Create a new scheduled backup job")
def create_backup_schedule(req: BackupScheduleJobCreateRequest, db: Session = Depends(get_db)):
    try:
        return BackupService.create_schedule_job(db, req)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.put("/backup/schedules/{job_id}", summary="Update a scheduled backup job")
def update_backup_schedule(job_id: int, req: BackupScheduleJobUpdateRequest, db: Session = Depends(get_db)):
    try:
        return BackupService.update_schedule_job(db, job_id, req)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.delete("/backup/schedules/{job_id}", summary="Delete a scheduled backup job")
def delete_backup_schedule(job_id: int, db: Session = Depends(get_db)):
    try:
        return BackupService.delete_schedule_job(db, job_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/backup/schedules/{job_id}/run", summary="Trigger scheduled backup job now")
def run_backup_schedule_now(job_id: int, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        return BackupService.run_scheduled_job(db, job_id, force=True, actor="admin", client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/backup/schedules/{job_id}/toggle", summary="Enable or pause a scheduled backup job")
def toggle_backup_schedule(job_id: int, db: Session = Depends(get_db)):
    try:
        return BackupService.toggle_schedule_job(db, job_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

# --- Hot Backups & Manual Triggers ---

@router.get("/backup/policy", response_model=BackupPolicyResponse, summary="Get legacy backup policy")
def get_backup_policy(repo_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    policy = BackupService.get_or_create_policy(db, repo_id)
    return BackupPolicyResponse(
        id=policy.id,
        repository_id=policy.repository_id,
        backup_type=policy.backup_type,
        schedule_cron=policy.schedule_cron,
        destination_path=policy.destination_path,
        is_enabled=policy.is_enabled,
        skip_if_unchanged=policy.skip_if_unchanged,
        conditional_full_days=policy.conditional_full_days,
        gfs_keep_dailies=policy.gfs_keep_dailies,
        gfs_keep_weeklies=policy.gfs_keep_weeklies,
        gfs_keep_monthlies=policy.gfs_keep_monthlies,
        encryption_enabled=policy.encryption_enabled,
        created_at=policy.created_at,
        updated_at=policy.updated_at
    )

@router.post("/backup/policy", response_model=BackupPolicyResponse, summary="Update legacy backup policy")
def update_backup_policy(req: BackupPolicyCreateRequest, db: Session = Depends(get_db)):
    return BackupService.update_policy(db, req)

@router.post("/backup/run/{repo_id}", summary="Trigger repository backup immediately")
def trigger_backup(
    repo_id: int,
    req: RunBackupRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Repository {repo_id} not found")

        return BackupService.execute_single_backup(
            db,
            repo=repo,
            backup_type=req.backup_type or "hotcopy_full",
            destination_path=None,
            force=req.force,
            skip_if_unchanged=False if req.force else True,
            encryption_enabled=bool(req.passphrase),
            passphrase=req.passphrase,
            actor="admin",
            client_ip=client_ip
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/backup/archives", summary="List backup archives")
def list_backup_archives(repo_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    return BackupService.list_archives(db, repo_id)

@router.get("/backup/archives/{archive_id}/download", summary="Download backup archive")
def download_backup_archive(archive_id: int, db: Session = Depends(get_db)):
    rec = db.query(BackupArchiveRecord).filter(BackupArchiveRecord.id == archive_id).first()
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup archive not found.")

    p = Path(rec.archive_path)
    if not p.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archive file is missing from disk.")

    media_type = "application/gzip" if p.name.endswith(".gz") else "application/octet-stream"
    return FileResponse(path=str(p), filename=rec.archive_filename, media_type=media_type)

@router.delete("/backup/archives/{archive_id}", summary="Delete backup archive")
def delete_backup_archive(archive_id: int, db: Session = Depends(get_db)):
    try:
        return BackupService.delete_archive(db, archive_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/backup/verify/{archive_id}", response_model=BackupVerifyResponse, summary="Automated Sandbox Verification")
def verify_backup_archive(
    archive_id: int,
    passphrase: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        return BackupService.verify_backup(db, archive_id, passphrase)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/backup/restore/{archive_id}", summary="Point-in-time Restore from Backup")
def restore_backup_archive(
    archive_id: int,
    req: BackupRestoreRequest,
    db: Session = Depends(get_db)
):
    try:
        return BackupService.restore_backup(
            db,
            archive_id=archive_id,
            target_name=req.target_repository_name,
            target_rev=req.target_revision,
            passphrase=req.encryption_passphrase
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# --- Repository Maintenance & Optimization Tools ---

@router.post("/maintenance/pack/{repo_id}", summary="Execute FSFS shard packing")
def pack_repository(repo_id: int, db: Session = Depends(get_db)):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    try:
        return MaintenanceService.pack_repository(repo.fs_path)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/maintenance/clean-txns/{repo_id}", summary="Purge dead transactions")
def clean_transactions(repo_id: int, db: Session = Depends(get_db)):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    try:
        return MaintenanceService.clean_transactions(repo.fs_path)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/maintenance/verify/{repo_id}", summary="Live svnadmin verify inspection")
def verify_repository_health(
    repo_id: int,
    req: VerifyRepoRequest = VerifyRepoRequest(),
    db: Session = Depends(get_db)
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    try:
        return MaintenanceService.verify_repository(repo.fs_path, req.start_revision, req.end_revision)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/maintenance/storage-stats", summary="Get detailed storage breakdown across all repositories")
def get_storage_stats(db: Session = Depends(get_db)):
    try:
        return MaintenanceService.get_storage_breakdown(db)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# --- Pre-Packaged Hook Engine ---

@router.get("/hooks/{repo_id}/{hook_name}", response_model=HookConfigResponse, summary="Get hook configuration")
def get_hook_config(repo_id: int, hook_name: str, db: Session = Depends(get_db)):
    cfg = HookService.get_or_create_config(db, repo_id, hook_name)
    return HookConfigResponse(
        id=cfg.id,
        repository_id=cfg.repository_id,
        hook_name=cfg.hook_name,
        is_enabled=cfg.is_enabled,
        check_commit_message=cfg.check_commit_message,
        commit_message_pattern=cfg.commit_message_pattern,
        commit_message_error_msg=cfg.commit_message_error_msg,
        check_pathnames=cfg.check_pathnames,
        disallow_spaces=cfg.disallow_spaces,
        disallow_special_chars=cfg.disallow_special_chars,
        email_notifications=cfg.email_notifications,
        email_recipients=cfg.email_recipients,
        email_smtp_server=cfg.email_smtp_server,
        webhook_enabled=cfg.webhook_enabled,
        webhook_url=cfg.webhook_url,
        updated_at=cfg.updated_at
    )

@router.put("/hooks/{repo_id}/{hook_name}", response_model=HookConfigResponse, summary="Update hook configuration")
def update_hook_config(
    repo_id: int,
    hook_name: str,
    req: HookConfigUpdateRequest,
    db: Session = Depends(get_db)
):
    try:
        return HookService.update_config(db, repo_id, hook_name, req)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

# --- Multi-Site Replication (VDFS) ---

@router.post("/replication/import-seed", summary="Import offline replication seed")
def import_seed(req: ImportSeedRequest, db: Session = Depends(get_db)):
    try:
        return ReplicationService.import_replication_seed(
            db,
            seed_path=req.seed_path,
            new_repo_name=req.new_repository_name,
            master_url=req.master_url
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/replication/export-seed/{repo_id}", summary="Export offline replication seed")
def export_seed(repo_id: int, db: Session = Depends(get_db)):
    try:
        return ReplicationService.export_replication_seed(db, repo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/replication/promote/{repo_id}", summary="Promote slave repository to master")
def promote_slave(repo_id: int, db: Session = Depends(get_db)):
    try:
        return ReplicationService.promote_slave_to_master(db, repo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.get("/replication/{repo_id}", response_model=ReplicationNodeResponse, summary="Get replication status")
def get_replication_status(repo_id: int, db: Session = Depends(get_db)):
    node = ReplicationService.get_or_create_node(db, repo_id)
    return ReplicationNodeResponse(
        id=node.id,
        repository_id=node.repository_id,
        node_role=node.node_role,
        master_url=node.master_url,
        sync_interval_seconds=node.sync_interval_seconds,
        last_sync_revision=node.last_sync_revision,
        last_sync_at=node.last_sync_at,
        sync_status=node.sync_status,
        sync_error=node.sync_error,
        is_active=node.is_active,
        compression_enabled=node.compression_enabled,
        created_at=node.created_at
    )

@router.post("/replication/{repo_id}", response_model=ReplicationNodeResponse, summary="Configure replication")
def configure_replication(
    repo_id: int,
    req: ReplicationNodeCreateRequest,
    db: Session = Depends(get_db)
):
    node = ReplicationService.get_or_create_node(db, repo_id, req)
    return ReplicationNodeResponse(
        id=node.id,
        repository_id=node.repository_id,
        node_role=node.node_role,
        master_url=node.master_url,
        sync_interval_seconds=node.sync_interval_seconds,
        last_sync_revision=node.last_sync_revision,
        last_sync_at=node.last_sync_at,
        sync_status=node.sync_status,
        sync_error=node.sync_error,
        is_active=node.is_active,
        compression_enabled=node.compression_enabled,
        created_at=node.created_at
    )
