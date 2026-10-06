"""
Subversion Nuvi - Operations, Disaster Recovery & Replication API Router
Provides endpoints for Hot Backups, GFS Pruning, AES-256-GCM Encryption,
Sandbox Verification, Hook Engine, and Multi-Site Replication.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.models.dto import (
    BackupPolicyCreateRequest,
    BackupPolicyResponse,
    BackupArchiveResponse,
    BackupVerifyResponse,
    BackupRestoreRequest,
    HookConfigUpdateRequest,
    HookConfigResponse,
    ReplicationNodeCreateRequest,
    ReplicationNodeResponse,
)
from backend.api.services.backup_service import BackupService
from backend.api.services.hook_service import HookService
from backend.api.services.replication_service import ReplicationService

router = APIRouter(prefix="/operations", tags=["Operations & DR"])

# --- Hot Backups & DR ---

class RunBackupRequest(BaseModel):
    backup_type: str = "full"
    force: bool = False
    passphrase: Optional[str] = None

class ImportSeedRequest(BaseModel):
    seed_path: str
    new_repository_name: str
    master_url: str

@router.get("/backup/policy", response_model=BackupPolicyResponse, summary="Get backup policy")
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

@router.post("/backup/policy", response_model=BackupPolicyResponse, summary="Update backup policy")
def update_backup_policy(req: BackupPolicyCreateRequest, db: Session = Depends(get_db)):
    return BackupService.update_policy(db, req)

@router.post("/backup/run/{repo_id}", summary="Trigger repository hot backup")
def trigger_backup(
    repo_id: int,
    req: RunBackupRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        return BackupService.run_backup(
            db,
            repo_id=repo_id,
            backup_type=req.backup_type,
            force=req.force,
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
