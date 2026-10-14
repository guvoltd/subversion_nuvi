"""
Subversion Nuvi - Repository Service Layer
Orchestrates database metadata, native C++ Subversion operations, and filesystem management.
"""

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import psutil

from sqlalchemy.orm import Session
from backend.api.config import config
from backend.api.models.schema import Repository, AuditLog
from backend.api.models.dto import (
    RepositoryCreateRequest,
    RepositoryResponse,
    RepositoryStatsResponse,
    LockResponse,
    TransactionResponse,
    ServerStatusResponse,
    StandardLayoutRequest,
)
from backend.api.services.svn_native import svn_engine, SubversionNativeError

START_TIME = time.time()

def get_dir_size(path: Path) -> int:
    """Calculate directory size in bytes."""
    total = 0
    try:
        for entry in os.scandir(path):
            if entry.is_file(follow_symlinks=False):
                total += entry.stat().st_size
            elif entry.is_dir(follow_symlinks=False):
                total += get_dir_size(Path(entry.path))
    except (PermissionError, FileNotFoundError):
        pass
    return total

class RepositoryService:
    @staticmethod
    def _resolve_repo_path(db: Session, r: Repository) -> Path:
        """Resolve and auto-heal repository filesystem path if it has moved."""
        path = Path(r.fs_path)
        if path.exists():
            return path

        candidates = [
            config.REPOSITORIES_ROOT / r.name,
            config.DATA_DIR / "repositories" / r.name,
            config.DATA_DIR / "repositorys" / r.name,
        ]
        for cand in candidates:
            if cand.exists():
                r.fs_path = str(cand)
                try:
                    db.commit()
                except Exception:
                    db.rollback()
                return cand
        return path

    @staticmethod
    def _set_repo_permissions(repo_path: Path) -> None:
        """Recursively ensure repository directory is owned by subversion:subversion with setgid 2775 and 664 files."""
        import pwd
        import grp
        import stat

        uid = -1
        gid = -1
        for u in [os.getenv("NUVI_USER", "subversion"), "subversion"]:
            try:
                uid = pwd.getpwnam(u).pw_uid
                break
            except KeyError:
                pass
        for g in [os.getenv("NUVI_GROUP", "subversion"), "subversion", "www-data"]:
            try:
                gid = grp.getgrnam(g).gr_gid
                break
            except KeyError:
                pass

        if not repo_path.exists():
            return

        for root, dirs, files in os.walk(repo_path):
            if uid != -1 or gid != -1:
                try:
                    os.chown(root, uid, gid)
                except Exception:
                    pass
            try:
                os.chmod(root, stat.S_ISGID | stat.S_IRWXU | stat.S_IRWXG | stat.S_IROTH | stat.S_IXOTH)  # 2775
            except Exception:
                pass

            for f in files:
                f_path = os.path.join(root, f)
                if uid != -1 or gid != -1:
                    try:
                        os.chown(f_path, uid, gid)
                    except Exception:
                        pass
                try:
                    os.chmod(f_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IWGRP | stat.S_IROTH)  # 664
                except Exception:
                    pass

    @staticmethod
    def list_repositories(db: Session, allowed_repo_ids: Optional[List[int]] = None) -> List[RepositoryResponse]:
        """List registered repositories with live on-disk status. Optionally filter by allowed_repo_ids."""
        query = db.query(Repository)
        if allowed_repo_ids is not None:
            if not allowed_repo_ids:
                return []
            query = query.filter(Repository.id.in_(allowed_repo_ids))
        repos = query.order_by(Repository.name.asc()).all()
        results = []
        for r in repos:
            repo_path = RepositoryService._resolve_repo_path(db, r)
            latest_author = ""
            latest_date = ""
            latest_log = ""
            size_bytes = 0

            if repo_path.exists():
                size_bytes = get_dir_size(repo_path)
                try:
                    info = svn_engine.get_repository_info(str(repo_path))
                    r.latest_revision = info["latest_revision"]
                    latest_author = info["latest_author"]
                    latest_date = info["latest_date"]
                    latest_log = info["latest_log"]
                except Exception:
                    pass

            results.append(RepositoryResponse(
                id=r.id,
                name=r.name,
                description=r.description,
                fs_path=r.fs_path,
                uuid=r.uuid,
                fs_type=r.fs_type,
                format_version=r.format_version,
                latest_revision=r.latest_revision,
                is_locked=r.is_locked,
                rep_sharing_enabled=r.rep_sharing_enabled,
                compression=r.compression,
                size_bytes=size_bytes,
                created_at=r.created_at,
                updated_at=r.updated_at,
                latest_author=latest_author,
                latest_date=latest_date,
                latest_log=latest_log,
            ))
        return results

    @staticmethod
    def get_repository(db: Session, repo_id: int) -> RepositoryResponse:
        """Get repository by ID with live metadata."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        repo_path = RepositoryService._resolve_repo_path(db, r)
        size_bytes = get_dir_size(repo_path) if repo_path.exists() else 0
        latest_author = ""
        latest_date = ""
        latest_log = ""

        if repo_path.exists():
            try:
                info = svn_engine.get_repository_info(str(repo_path))
                r.latest_revision = info["latest_revision"]
                r.uuid = info["uuid"]
                latest_author = info["latest_author"]
                latest_date = info["latest_date"]
                latest_log = info["latest_log"]
                db.commit()
            except Exception:
                pass

        return RepositoryResponse(
            id=r.id,
            name=r.name,
            description=r.description,
            fs_path=r.fs_path,
            uuid=r.uuid,
            fs_type=r.fs_type,
            format_version=r.format_version,
            latest_revision=r.latest_revision,
            is_locked=r.is_locked,
            rep_sharing_enabled=r.rep_sharing_enabled,
            compression=r.compression,
            size_bytes=size_bytes,
            created_at=r.created_at,
            updated_at=r.updated_at,
            latest_author=latest_author,
            latest_date=latest_date,
            latest_log=latest_log,
        )

    @staticmethod
    def create_repository(db: Session, req: RepositoryCreateRequest, actor: str = "SYSTEM", client_ip: str = "127.0.0.1") -> RepositoryResponse:
        """Create a new Subversion repository on disk and register it."""
        # Sanitize name
        name = req.name.strip()
        if not name.replace("-", "").replace("_", "").isalnum():
            raise ValueError("Repository name must be alphanumeric with optional dashes and underscores")

        # Check existing
        existing = db.query(Repository).filter(Repository.name == name).first()
        if existing:
            raise ValueError(f"Repository '{name}' already exists in registry")

        repo_dir = config.REPOSITORIES_ROOT / name
        if repo_dir.exists():
            raise ValueError(f"Filesystem path '{repo_dir}' already exists")

        # Create repository on disk using native C++ API
        svn_engine.create_repository(str(repo_dir), fstype=req.fs_type, compatible_version=req.compatible_version)

        # Inspect created repo info
        info = svn_engine.get_repository_info(str(repo_dir))

        # Initialize standard layout if requested
        if req.init_standard_layout:
            svn_engine.init_standard_layout(
                str(repo_dir),
                author=req.layout_author or "nuvi-admin",
                log_message=req.layout_message or "Initialize standard project structure (trunk, branches, tags)"
            )
            # Refresh info after commit
            info = svn_engine.get_repository_info(str(repo_dir))

        # Save to database
        db_repo = Repository(
            name=name,
            description=req.description,
            fs_path=str(repo_dir),
            uuid=info["uuid"],
            fs_type=info["fs_type"],
            format_version=info["format_version"],
            latest_revision=info["latest_revision"],
            is_locked=False,
            rep_sharing_enabled=True,
            compression="lz4",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(db_repo)

        # Audit log
        audit = AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="REPO",
            action_name="CREATE_REPOSITORY",
            target_type="repository",
            target_id=name,
            details_json=f'{{"fs_path": "{repo_dir}", "standard_layout": {req.init_standard_layout}}}'
        )
        db.add(audit)
        db.commit()
        db.refresh(db_repo)

        # Enforce group and file permissions for subversion/Apache collaboration
        RepositoryService._set_repo_permissions(repo_dir)

        # Recompile authz rules so new repository is recognized in authorization matrix
        try:
            from backend.api.services.acl_service import AclService
            AclService.compile_authz_file(db)
        except Exception:
            pass

        return RepositoryService.get_repository(db, db_repo.id)

    @staticmethod
    def register_existing_repository(db: Session, repo_path: Path, actor: str = "cli") -> Optional[Repository]:
        """Register or synchronize an existing Subversion repository found on disk."""
        repo_path = Path(repo_path).resolve()
        if not repo_path.exists() or not (repo_path / "format").exists():
            return None

        name = repo_path.name
        existing = db.query(Repository).filter(Repository.name == name).first()
        info = svn_engine.get_repository_info(str(repo_path))

        if existing:
            existing.fs_path = str(repo_path)
            existing.uuid = info.get("uuid") or existing.uuid
            existing.format_version = info.get("format_version") or existing.format_version
            existing.latest_revision = info.get("latest_revision", existing.latest_revision)
            existing.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing)
            db_repo = existing
        else:
            db_repo = Repository(
                name=name,
                description=f"Imported existing repository ({name})",
                fs_path=str(repo_path),
                uuid=info.get("uuid", ""),
                fs_type=info.get("fs_type", "fsfs"),
                format_version=info.get("format_version", 2),
                latest_revision=info.get("latest_revision", 0),
                is_locked=False,
                rep_sharing_enabled=True,
                compression="lz4",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(db_repo)
            db.commit()
            db.refresh(db_repo)

        # Enforce file/folder permissions
        RepositoryService._set_repo_permissions(repo_path)

        # Recompile authz rules
        try:
            from backend.api.services.acl_service import AclService
            AclService.compile_authz_file(db)
        except Exception:
            pass

        return db_repo

    @staticmethod
    def scan_and_sync_repositories(db: Session, search_dir: Optional[Path] = None) -> List[Repository]:
        """Scan a directory for Subversion repositories and ensure all are registered and synchronized."""
        root = Path(search_dir) if search_dir else config.REPOSITORIES_ROOT
        synced = []
        if not root.exists() or not root.is_dir():
            return synced

        # Check if root itself is a repository
        if (root / "format").exists() and (root / "db").exists():
            rep = RepositoryService.register_existing_repository(db, root)
            if rep:
                synced.append(rep)
            return synced

        # Scan subdirectories
        try:
            for entry in os.scandir(root):
                if entry.is_dir(follow_symlinks=True):
                    ep = Path(entry.path)
                    if (ep / "format").exists() and (ep / "db").exists():
                        rep = RepositoryService.register_existing_repository(db, ep)
                        if rep:
                            synced.append(rep)
        except Exception:
            pass
        return synced

    @staticmethod
    def delete_repository(db: Session, repo_id: int, delete_files: bool = True, actor: str = "SYSTEM", client_ip: str = "127.0.0.1") -> None:
        """Delete repository registration and optionally remove its files on disk."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        repo_name = r.name
        repo_path = Path(r.fs_path)

        db.delete(r)

        audit = AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="REPO",
            action_name="DELETE_REPOSITORY",
            target_type="repository",
            target_id=repo_name,
            details_json=f'{{"deleted_files": {delete_files}}}'
        )
        db.add(audit)
        db.commit()

        if delete_files and repo_path.exists():
            shutil.rmtree(repo_path, ignore_errors=True)

    @staticmethod
    def init_standard_layout(db: Session, repo_id: int, req: StandardLayoutRequest, actor: str = "SYSTEM", client_ip: str = "127.0.0.1") -> RepositoryResponse:
        """Create /trunk, /branches, /tags atomically in revision HEAD+1."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        svn_engine.init_standard_layout(
            r.fs_path,
            author=req.author or "nuvi-admin",
            log_message=req.log_message or "Initialize standard project structure (trunk, branches, tags)"
        )

        audit = AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="REPO",
            action_name="INIT_STANDARD_LAYOUT",
            target_type="repository",
            target_id=r.name,
            details_json=f'{{"author": "{req.author}"}}'
        )
        db.add(audit)
        db.commit()

        return RepositoryService.get_repository(db, repo_id)

    @staticmethod
    def import_repository_dump(db: Session, repo_id: int, dump_path: str, actor: str = "SYSTEM", client_ip: str = "127.0.0.1") -> RepositoryResponse:
        """Import a Subversion dump file into an existing repository using svnadmin load."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        p = Path(dump_path)
        if not p.exists() or not p.is_file():
            raise FileNotFoundError(f"Dump file not found: {dump_path}")

        # Run svnadmin load
        with open(p, "rb") as dump_file:
            res = subprocess.run(
                ["svnadmin", "load", "--ignore-uuid", r.fs_path],
                stdin=dump_file,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            if res.returncode != 0:
                raise RuntimeError(f"svnadmin load failed: {res.stderr}")

        audit = AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="REPO",
            action_name="IMPORT_DUMP",
            target_type="repository",
            target_id=r.name,
            details_json=f'{{"dump_path": "{dump_path}"}}'
        )
        db.add(audit)
        db.commit()

        return RepositoryService.get_repository(db, repo_id)

    @staticmethod
    def get_repository_locks(db: Session, repo_id: int) -> List[LockResponse]:
        """Query all active locks for a repository."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        repo_path = RepositoryService._resolve_repo_path(db, r)
        locks_raw = svn_engine.get_active_locks(str(repo_path)) if repo_path.exists() else []
        return [LockResponse(**l) for l in locks_raw]

    @staticmethod
    def break_repository_lock(db: Session, repo_id: int, locked_path: str, actor: str = "SYSTEM", client_ip: str = "127.0.0.1") -> None:
        """Break or steal a lock."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        repo_path = RepositoryService._resolve_repo_path(db, r)
        svn_engine.break_lock(str(repo_path), locked_path)

        audit = AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="LOCK",
            action_name="BREAK_LOCK",
            target_type="repository",
            target_id=r.name,
            details_json=f'{{"locked_path": "{locked_path}"}}'
        )
        db.add(audit)
        db.commit()

    @staticmethod
    def get_repository_transactions(db: Session, repo_id: int) -> List[TransactionResponse]:
        """List uncommitted transactions in repository."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        repo_path = RepositoryService._resolve_repo_path(db, r)
        txns_raw = svn_engine.get_uncommitted_transactions(str(repo_path)) if repo_path.exists() else []
        return [TransactionResponse(**t) for t in txns_raw]

    @staticmethod
    def abort_repository_transaction(db: Session, repo_id: int, txn_name: str, actor: str = "SYSTEM", client_ip: str = "127.0.0.1") -> None:
        """Abort/purge an uncommitted transaction."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        repo_path = RepositoryService._resolve_repo_path(db, r)
        svn_engine.abort_transaction(str(repo_path), txn_name)

        audit = AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="REPO",
            action_name="ABORT_TRANSACTION",
            target_type="repository",
            target_id=r.name,
            details_json=f'{{"txn_name": "{txn_name}"}}'
        )
        db.add(audit)
        db.commit()

    @staticmethod
    def get_storage_stats(db: Session, repo_id: int) -> RepositoryStatsResponse:
        """Calculate detailed storage stats for a repository."""
        r = db.query(Repository).filter(Repository.id == repo_id).first()
        if not r:
            raise ValueError(f"Repository with ID {repo_id} not found")

        repo_path = RepositoryService._resolve_repo_path(db, r)
        total_size = get_dir_size(repo_path) if repo_path.exists() else 0
        db_size = get_dir_size(repo_path / "db") if (repo_path.exists() and (repo_path / "db").exists()) else 0

        locks_count = len(svn_engine.get_active_locks(str(repo_path))) if repo_path.exists() else 0
        txns_count = len(svn_engine.get_uncommitted_transactions(str(repo_path))) if repo_path.exists() else 0
        info = svn_engine.get_repository_info(str(repo_path)) if repo_path.exists() else {
            "uuid": r.uuid or "",
            "fs_type": r.fs_type,
            "format_version": r.format_version,
            "latest_revision": r.latest_revision,
        }

        return RepositoryStatsResponse(
            repository_id=r.id,
            name=r.name,
            uuid=info["uuid"],
            fs_type=info["fs_type"],
            format_version=info["format_version"],
            latest_revision=info["latest_revision"],
            total_size_bytes=total_size,
            db_size_bytes=db_size,
            active_locks_count=locks_count,
            uncommitted_txns_count=txns_count,
            compression=r.compression,
            rep_sharing_enabled=r.rep_sharing_enabled,
        )

    @staticmethod
    def get_server_status(db: Session) -> ServerStatusResponse:
        """Get live system health, resource consumption, and repository aggregate metrics."""
        repos = db.query(Repository).all()
        total_storage = 0
        total_revisions = 0
        total_locks = 0
        total_txns = 0

        for r in repos:
            p = RepositoryService._resolve_repo_path(db, r)
            if p.exists():
                total_storage += get_dir_size(p)
                try:
                    info = svn_engine.get_repository_info(str(p))
                    total_revisions += info["latest_revision"]
                    total_locks += len(svn_engine.get_active_locks(str(p)))
                    total_txns += len(svn_engine.get_uncommitted_transactions(str(p)))
                except Exception:
                    pass

        # Process & system metrics
        vm = psutil.virtual_memory()
        mem_total_mb = vm.total / (1024 * 1024)
        mem_used_mb = vm.used / (1024 * 1024)
        mem_percent = vm.percent

        target_dir = config.REPOSITORIES_ROOT if config.REPOSITORIES_ROOT.exists() else config.DATA_DIR
        try:
            disk = psutil.disk_usage(str(target_dir))
            disk_used_gb = disk.used / (1024 ** 3)
            disk_total_gb = disk.total / (1024 ** 3)
            disk_percent = disk.percent
        except Exception:
            disk_used_gb = 0.0
            disk_total_gb = 0.0
            disk_percent = 0.0

        cpu_perc = psutil.cpu_percent(interval=None)

        uptime_sec = int(time.time() - START_TIME)
        days, rem = divmod(uptime_sec, 86400)
        hours, rem = divmod(rem, 3600)
        mins, secs = divmod(rem, 60)
        if days > 0:
            uptime_str = f"{days}d {hours}h {mins}m {secs}s"
        elif hours > 0:
            uptime_str = f"{hours}h {mins}m {secs}s"
        else:
            uptime_str = f"{mins}m {secs}s"

        return ServerStatusResponse(
            server_name=config.SERVER_NAME,
            version="1.16.13 (Subversion 1.16.13)",
            uptime_seconds=time.time() - START_TIME,
            uptime_formatted=uptime_str,
            repositories_count=len(repos),
            total_revisions=total_revisions,
            total_storage_bytes=total_storage,
            active_locks_count=total_locks,
            uncommitted_txns_count=total_txns,
            memory_used_mb=round(mem_used_mb, 1),
            memory_total_mb=round(mem_total_mb, 1),
            memory_percent=round(mem_percent, 1),
            disk_used_gb=round(disk_used_gb, 2),
            disk_total_gb=round(disk_total_gb, 2),
            disk_percent=round(disk_percent, 1),
            cpu_percent=round(cpu_perc, 1),
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
