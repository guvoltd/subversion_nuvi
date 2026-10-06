"""
Subversion Nuvi - Repositories API Router
Handles repository CRUD, layout initialization, dumps, active locks, and transaction management.
"""

from typing import List, Optional
import tempfile
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.models.schema import RepositorySupervisor
from backend.api.models.dto import (
    RepositoryCreateRequest,
    RepositoryResponse,
    RepositoryStatsResponse,
    StandardLayoutRequest,
    RepositoryImportRequest,
    LockResponse,
    BreakLockRequest,
    TransactionResponse,
    ArchivePathImportRequest,
    ArchiveImportResponse,
    RepositorySupervisorRequest,
    RepositorySupervisorResponse,
)
from backend.api.services.repo_service import RepositoryService
from backend.api.services.archive_import_service import ArchiveImportService
from backend.api.services.svn_native import SubversionNativeError
from backend.api.services.acl_service import AclService
from backend.api.services.token_service import get_optional_current_user

router = APIRouter(prefix="/repositories", tags=["Repositories"])

@router.get("", response_model=List[RepositoryResponse], summary="List all repositories")
def list_repositories(request: Request, db: Session = Depends(get_db)):
    """Retrieve Subversion repositories registered in the server. If authenticated as non-admin, returns only repositories with assigned access rights."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        allowed_repos = AclService.get_accessible_repositories(db, user)
        allowed_ids = [r.id for r in allowed_repos]
        return RepositoryService.list_repositories(db, allowed_repo_ids=allowed_ids)
    return RepositoryService.list_repositories(db)

@router.post("", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED, summary="Create a new repository")
def create_repository(req: RepositoryCreateRequest, request: Request, db: Session = Depends(get_db)):
    """Create a new genuine Subversion FSFS repository with optional standard layout."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        actor = user.username if user else "admin"
        return RepositoryService.create_repository(db, req, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/{repo_id}", response_model=RepositoryResponse, summary="Get repository details")
def get_repository(repo_id: int, request: Request, db: Session = Depends(get_db)):
    """Retrieve metadata and live status for a specific repository."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
    try:
        return RepositoryService.get_repository(db, repo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete repository")
def delete_repository(repo_id: int, request: Request, delete_files: bool = Query(True, description="Remove files from disk"), db: Session = Depends(get_db)):
    """Delete a repository from registry and optionally purge disk files."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        actor = user.username if user else "admin"
        RepositoryService.delete_repository(db, repo_id, delete_files=delete_files, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/{repo_id}/init-layout", response_model=RepositoryResponse, summary="Initialize standard layout")
def init_standard_layout(repo_id: int, req: StandardLayoutRequest, request: Request, db: Session = Depends(get_db)):
    """Atomically commit /trunk, /branches, /tags to repository HEAD+1."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return RepositoryService.init_standard_layout(db, repo_id, req, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/{repo_id}/import-dump", response_model=RepositoryResponse, summary="Import dump file into repository")
def import_dump(repo_id: int, req: RepositoryImportRequest, request: Request, db: Session = Depends(get_db)):
    """Import a Subversion portable dump file into the repository."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return RepositoryService.import_repository_dump(db, repo_id, req.source_location, actor=actor, client_ip=client_ip)
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/{repo_id}/stats", response_model=RepositoryStatsResponse, summary="Get repository storage statistics")
def get_repository_stats(repo_id: int, request: Request, db: Session = Depends(get_db)):
    """Compute exact disk usage, database size, and transaction metrics for repository."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
    try:
        return RepositoryService.get_storage_stats(db, repo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

# --- Active Locks API (TASK-1.4) ---

@router.get("/{repo_id}/locks", response_model=List[LockResponse], summary="List active locks")
def get_repository_locks(repo_id: int, request: Request, db: Session = Depends(get_db)):
    """Inspect all active locks recursively across repository paths."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
    try:
        return RepositoryService.get_repository_locks(db, repo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/{repo_id}/locks/break", status_code=status.HTTP_200_OK, summary="Break / steal a lock")
def break_repository_lock(repo_id: int, req: BreakLockRequest, request: Request, db: Session = Depends(get_db)):
    """Break or steal an active lock on a repository path."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        is_sup = db.query(RepositorySupervisor).filter(
            RepositorySupervisor.repository_id == repo_id,
            RepositorySupervisor.user_id == user.id,
            RepositorySupervisor.can_manage_locks == True
        ).first()
        if not is_sup:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator or lock supervisor privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        RepositoryService.break_repository_lock(db, repo_id, req.locked_path, actor=actor, client_ip=client_ip)
        return {"status": "success", "message": f"Lock broken on path '{req.locked_path}'"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# --- Uncommitted Transactions API (TASK-1.4) ---

@router.get("/{repo_id}/transactions", response_model=List[TransactionResponse], summary="List uncommitted transactions")
def get_repository_transactions(repo_id: int, request: Request, db: Session = Depends(get_db)):
    """List in-progress or dangling uncommitted transactions."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    try:
        return RepositoryService.get_repository_transactions(db, repo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.delete("/{repo_id}/transactions/{txn_name}", status_code=status.HTTP_200_OK, summary="Abort an uncommitted transaction")
def abort_repository_transaction(repo_id: int, txn_name: str, request: Request, db: Session = Depends(get_db)):
    """Abort and purge a dangling or abandoned transaction."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        RepositoryService.abort_repository_transaction(db, repo_id, txn_name, actor=actor, client_ip=client_ip)
        return {"status": "success", "message": f"Transaction '{txn_name}' aborted and purged"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# --- Maintenance Operations ---

@router.post("/{repo_id}/pack", status_code=status.HTTP_200_OK, summary="Pack repository shards")
def pack_repository(repo_id: int, request: Request, db: Session = Depends(get_db)):
    """Run FSFS pack on repository to consolidate revision files."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    r = RepositoryService.get_repository(db, repo_id)
    from backend.api.services.svn_native import svn_engine
    svn_engine.pack_repository(r.fs_path)
    return {"status": "success", "message": f"Repository '{r.name}' packed successfully"}

@router.post("/{repo_id}/verify", status_code=status.HTTP_200_OK, summary="Verify repository integrity")
def verify_repository(repo_id: int, request: Request, start_rev: int = Query(-1), end_rev: int = Query(-1), db: Session = Depends(get_db)):
    """Run svnadmin verify on repository."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    r = RepositoryService.get_repository(db, repo_id)
    from backend.api.services.svn_native import svn_engine
    svn_engine.verify_repository(r.fs_path, start_rev=start_rev, end_rev=end_rev)
    return {"status": "success", "message": f"Repository '{r.name}' integrity verified"}

# --- Archive & VisualSVN Import Facility ---

@router.post("/import-archive", response_model=ArchiveImportResponse, status_code=status.HTTP_201_CREATED, summary="Import repository from ZIP archive (SVN dump + VisualSVN authz)")
async def import_archive_upload(
    file: UploadFile = File(..., description="ZIP archive containing SVN dump and VisualSVN authz/hooks"),
    repo_name: Optional[str] = Form(None, description="Optional target repository name override"),
    import_acls: bool = Form(True, description="Import VisualSVN authz access rules"),
    import_users: bool = Form(True, description="Auto-create users and security groups"),
    import_hooks: bool = Form(True, description="Import hook scripts"),
    default_password: Optional[str] = Form("Welcome123!", description="Default password for new users"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Imports a Subversion repository from a ZIP archive package.
    Automatically detects and loads SVN dump files (or raw repository trees),
    parses VisualSVN authz path rules, imports security groups & members,
    migrates htpasswd credentials, installs hook scripts, and compiles authz.
    """
    user = get_optional_current_user(request, db) if request else None
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    actor = user.username if user else "admin"

    # Stream upload to temporary file on disk
    suffix = Path(file.filename or "upload.zip").suffix or ".zip"
    tmp_fd, tmp_path_str = tempfile.mkstemp(prefix="nuvi_upload_", suffix=suffix)
    tmp_path = Path(tmp_path_str)

    try:
        with open(tmp_fd, "wb") as f_out:
            shutil.copyfileobj(file.file, f_out)

        effective_repo_name = repo_name.strip() if (repo_name and repo_name.strip()) else None
        if not effective_repo_name and file.filename:
            clean_stem = Path(file.filename).stem
            if clean_stem:
                effective_repo_name = clean_stem

        return ArchiveImportService.import_repository_archive(
            db=db,
            archive_path=tmp_path,
            repo_name=effective_repo_name,
            import_acls=import_acls,
            import_users=import_users,
            import_hooks=import_hooks,
            default_password=default_password or "Welcome123!",
            actor=actor,
            client_ip=client_ip
        )
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass

@router.post("/import-archive-path", response_model=ArchiveImportResponse, status_code=status.HTTP_201_CREATED, summary="Import repository from server-side ZIP archive path")
def import_archive_path(
    req: ArchivePathImportRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Import repository archive from an existing file path on the server."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return ArchiveImportService.import_repository_archive(
            db=db,
            archive_path=Path(req.archive_path),
            repo_name=req.repo_name,
            import_acls=req.import_acls,
            import_users=req.import_users,
            import_hooks=req.import_hooks,
            default_password=req.default_password or "Welcome123!",
            actor=actor,
            client_ip=client_ip
        )
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/{repo_id}/export", summary="Export and download repository dump or full archive package")
def export_repository_archive(
    repo_id: int,
    background_tasks: BackgroundTasks,
    format: str = Query("zip", description="Export format: zip, dump, or dump.gz"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Exports a Subversion repository as:
    - 'zip': Full portable archive with dump, authz, htpasswd, and hooks (compatible with import-archive).
    - 'dump.gz': Compressed Subversion dump file.
    - 'dump': Raw uncompressed Subversion dump file.
    """
    if format not in ("zip", "dump", "dump.gz"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid format. Supported: zip, dump, dump.gz")

    user = get_optional_current_user(request, db) if request else None
    if user and not user.is_admin:
        is_sup = db.query(RepositorySupervisor).filter(
            RepositorySupervisor.repository_id == repo_id,
            RepositorySupervisor.user_id == user.id,
            RepositorySupervisor.can_trigger_backups == True
        ).first()
        if not is_sup:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator or backup supervisor privileges required.")

    client_ip = request.client.host if request and request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        file_path, filename, media_type = RepositoryService.export_repository(
            db=db,
            repo_id=repo_id,
            format_type=format,
            actor=actor,
            client_ip=client_ip
        )

        def cleanup_temp():
            try:
                if file_path.exists():
                    file_path.unlink()
                parent = file_path.parent
                if "nuvi_export_" in parent.name and parent.exists():
                    shutil.rmtree(parent, ignore_errors=True)
            except Exception:
                pass

        background_tasks.add_task(cleanup_temp)
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# --- Repository Supervisors Delegation ---

@router.get("/{repo_id}/supervisors", response_model=List[RepositorySupervisorResponse], summary="List delegated supervisors for this repository")
def list_supervisors(repo_id: int, request: Request, db: Session = Depends(get_db)):
    """List all non-admin users delegated to supervise this specific repository."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    try:
        return RepositoryService.list_supervisors(db, repo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/{repo_id}/supervisors", response_model=RepositorySupervisorResponse, status_code=status.HTTP_201_CREATED, summary="Assign a user as supervisor for this repository")
def assign_supervisor(repo_id: int, req: RepositorySupervisorRequest, request: Request, db: Session = Depends(get_db)):
    """Assign a user as supervisor for this repository."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    actor = user.username if user else "admin"
    try:
        return RepositoryService.assign_supervisor(db, repo_id, req.user_id, actor=actor)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.delete("/{repo_id}/supervisors/{user_id}", status_code=status.HTTP_200_OK, summary="Remove a user as supervisor for this repository")
def remove_supervisor(repo_id: int, user_id: int, request: Request, db: Session = Depends(get_db)):
    """Remove a supervisor assignment."""
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    actor = user.username if user else "admin"
    try:
        RepositoryService.remove_supervisor(db, repo_id, user_id, actor=actor)
        return {"status": "success", "message": "Supervisor assignment removed"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


