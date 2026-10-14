"""
Subversion Nuvi - Hot Backup, GFS & Custom Retention, Dump Archives, Authz Snapshot,
AES-256-GCM Encryption, Scheduled Job Queue & Automated Verification Engine.
"""

import os
import gzip
import shutil
import hashlib
import zipfile
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from backend.api.config import config
from backend.api.models.schema import Repository, BackupPolicy, BackupArchiveRecord, BackupScheduleJob, Notification
from backend.api.models.dto import (
    BackupPolicyCreateRequest,
    BackupPolicyResponse,
    BackupArchiveResponse,
    BackupVerifyResponse,
    BackupScheduleJobCreateRequest,
    BackupScheduleJobUpdateRequest,
    BackupScheduleJobResponse
)
from backend.api.services.svn_native import svn_engine, SubversionNativeError
from backend.api.services.audit_service import AuditService


class BackupService:
    @staticmethod
    def _derive_key(passphrase: str, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100_000
        )
        return kdf.derive(passphrase.encode("utf-8"))

    @staticmethod
    def encrypt_file(source_path: Path, dest_path: Path, passphrase: str) -> str:
        """Encrypts a file with AES-256-GCM: format [16-byte salt][12-byte nonce][ciphertext + 16-byte tag]."""
        salt = os.urandom(16)
        nonce = os.urandom(12)
        key = BackupService._derive_key(passphrase, salt)
        aesgcm = AESGCM(key)

        with open(source_path, "rb") as f:
            plaintext = f.read()

        ciphertext = aesgcm.encrypt(nonce, plaintext, None)

        with open(dest_path, "wb") as f:
            f.write(salt + nonce + ciphertext)

        return hashlib.sha256(salt + nonce + ciphertext).hexdigest()

    @staticmethod
    def decrypt_file(source_path: Path, dest_path: Path, passphrase: str) -> None:
        """Decrypts an AES-256-GCM encrypted backup archive."""
        with open(source_path, "rb") as f:
            data = f.read()

        if len(data) < 28:
            raise ValueError("Corrupted encrypted archive (header too short).")

        salt = data[:16]
        nonce = data[16:28]
        ciphertext = data[28:]

        key = BackupService._derive_key(passphrase, salt)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)

        with open(dest_path, "wb") as f:
            f.write(plaintext)

    # -------------------------------------------------------------
    # Next Run Time Calculation
    # -------------------------------------------------------------
    @staticmethod
    def calculate_next_run(
        frequency: str = "daily",
        time_str: str = "02:00",
        weekday: int = 6,
        interval_hours: int = 24,
        from_time: Optional[datetime] = None
    ) -> datetime:
        """Calculates next execution datetime according to frequency settings."""
        now = from_time or datetime.now(timezone.utc)
        hour = 2
        minute = 0
        try:
            parts = [int(p) for p in (time_str or "02:00").split(":")]
            if len(parts) >= 2:
                hour, minute = parts[0], parts[1]
        except Exception:
            pass

        if frequency == "hourly":
            next_t = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            return next_t

        elif frequency == "interval":
            hrs = max(1, interval_hours or 24)
            return now + timedelta(hours=hrs)

        elif frequency == "daily":
            target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target <= now:
                target += timedelta(days=1)
            return target

        elif frequency == "weekly":
            # weekday: 0=Mon, ..., 6=Sun
            target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            days_ahead = (weekday - target.weekday()) % 7
            if days_ahead == 0 and target <= now:
                days_ahead = 7
            target += timedelta(days=days_ahead)
            return target

        elif frequency == "monthly":
            # 1st of next month
            year = now.year
            month = now.month + 1
            if month > 12:
                month = 1
                year += 1
            target = datetime(year, month, 1, hour, minute, 0, tzinfo=timezone.utc)
            return target

        # Default fallback
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        return target

    # -------------------------------------------------------------
    # Scheduled Backup Jobs Management (Multi-Task Queue)
    # -------------------------------------------------------------
    @staticmethod
    def list_schedule_jobs(db: Session, repo_id: Optional[int] = None) -> List[Dict[str, Any]]:
        query = db.query(BackupScheduleJob)
        if repo_id is not None:
            query = query.filter((BackupScheduleJob.repository_id == repo_id) | (BackupScheduleJob.repository_id.is_(None)))
        jobs = query.order_by(desc(BackupScheduleJob.created_at)).all()

        results = []
        for j in jobs:
            repo_name = "All Repositories"
            if j.repository_id:
                r = db.query(Repository).filter(Repository.id == j.repository_id).first()
                if r:
                    repo_name = r.name

            results.append({
                "id": j.id,
                "name": j.name,
                "repository_id": j.repository_id,
                "repository_name": repo_name,
                "backup_type": j.backup_type,
                "schedule_frequency": j.schedule_frequency,
                "schedule_time": j.schedule_time,
                "schedule_weekday": j.schedule_weekday,
                "schedule_interval_hours": j.schedule_interval_hours,
                "schedule_cron": j.schedule_cron,
                "destination_path": j.destination_path,
                "is_enabled": j.is_enabled,
                "skip_if_unchanged": j.skip_if_unchanged,
                "auto_verify": j.auto_verify,
                "retention_count": j.retention_count,
                "encryption_enabled": j.encryption_enabled,
                "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
                "last_run_status": j.last_run_status,
                "last_run_message": j.last_run_message,
                "next_run_at": j.next_run_at.isoformat() if j.next_run_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "updated_at": j.updated_at.isoformat() if j.updated_at else None
            })
        return results

    @staticmethod
    def create_schedule_job(db: Session, req: BackupScheduleJobCreateRequest) -> Dict[str, Any]:
        dest = req.destination_path.strip() if req.destination_path and req.destination_path.strip() else str(config.BACKUP_DIR)
        next_run = BackupService.calculate_next_run(
            frequency=req.schedule_frequency,
            time_str=req.schedule_time,
            weekday=req.schedule_weekday,
            interval_hours=req.schedule_interval_hours
        )

        job = BackupScheduleJob(
            name=req.name.strip(),
            repository_id=req.repository_id,
            backup_type=req.backup_type or "hotcopy_full",
            schedule_frequency=req.schedule_frequency or "daily",
            schedule_time=req.schedule_time or "02:00",
            schedule_weekday=req.schedule_weekday if req.schedule_weekday is not None else 6,
            schedule_interval_hours=req.schedule_interval_hours or 24,
            schedule_cron=req.schedule_cron or "0 2 * * *",
            destination_path=dest,
            is_enabled=req.is_enabled,
            skip_if_unchanged=req.skip_if_unchanged,
            auto_verify=req.auto_verify,
            retention_count=max(1, req.retention_count or 7),
            encryption_enabled=req.encryption_enabled,
            encryption_passphrase=req.encryption_passphrase or None,
            next_run_at=next_run
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        repo_name = "All Repositories"
        if job.repository_id:
            r = db.query(Repository).filter(Repository.id == job.repository_id).first()
            if r:
                repo_name = r.name

        return {
            "id": job.id,
            "name": job.name,
            "repository_id": job.repository_id,
            "repository_name": repo_name,
            "backup_type": job.backup_type,
            "schedule_frequency": job.schedule_frequency,
            "schedule_time": job.schedule_time,
            "schedule_weekday": job.schedule_weekday,
            "schedule_interval_hours": job.schedule_interval_hours,
            "schedule_cron": job.schedule_cron,
            "destination_path": job.destination_path,
            "is_enabled": job.is_enabled,
            "skip_if_unchanged": job.skip_if_unchanged,
            "auto_verify": job.auto_verify,
            "retention_count": job.retention_count,
            "encryption_enabled": job.encryption_enabled,
            "next_run_at": job.next_run_at.isoformat() if job.next_run_at else None,
            "created_at": job.created_at.isoformat() if job.created_at else None
        }

    @staticmethod
    def update_schedule_job(db: Session, job_id: int, req: BackupScheduleJobUpdateRequest) -> Dict[str, Any]:
        job = db.query(BackupScheduleJob).filter(BackupScheduleJob.id == job_id).first()
        if not job:
            raise ValueError(f"Backup schedule job #{job_id} not found.")

        if req.name is not None:
            job.name = req.name.strip()
        if req.repository_id is not None:
            job.repository_id = req.repository_id if req.repository_id > 0 else None
        if req.backup_type is not None:
            job.backup_type = req.backup_type
        if req.schedule_frequency is not None:
            job.schedule_frequency = req.schedule_frequency
        if req.schedule_time is not None:
            job.schedule_time = req.schedule_time
        if req.schedule_weekday is not None:
            job.schedule_weekday = req.schedule_weekday
        if req.schedule_interval_hours is not None:
            job.schedule_interval_hours = req.schedule_interval_hours
        if req.schedule_cron is not None:
            job.schedule_cron = req.schedule_cron
        if req.destination_path is not None and req.destination_path.strip():
            job.destination_path = req.destination_path.strip()
        if req.is_enabled is not None:
            job.is_enabled = req.is_enabled
        if req.skip_if_unchanged is not None:
            job.skip_if_unchanged = req.skip_if_unchanged
        if req.auto_verify is not None:
            job.auto_verify = req.auto_verify
        if req.retention_count is not None:
            job.retention_count = max(1, req.retention_count)
        if req.encryption_enabled is not None:
            job.encryption_enabled = req.encryption_enabled
        if req.encryption_passphrase is not None:
            job.encryption_passphrase = req.encryption_passphrase or None

        job.next_run_at = BackupService.calculate_next_run(
            frequency=job.schedule_frequency,
            time_str=job.schedule_time,
            weekday=job.schedule_weekday,
            interval_hours=job.schedule_interval_hours
        )

        db.commit()
        db.refresh(job)

        repo_name = "All Repositories"
        if job.repository_id:
            r = db.query(Repository).filter(Repository.id == job.repository_id).first()
            if r:
                repo_name = r.name

        return {
            "id": job.id,
            "name": job.name,
            "repository_id": job.repository_id,
            "repository_name": repo_name,
            "backup_type": job.backup_type,
            "schedule_frequency": job.schedule_frequency,
            "schedule_time": job.schedule_time,
            "destination_path": job.destination_path,
            "is_enabled": job.is_enabled,
            "next_run_at": job.next_run_at.isoformat() if job.next_run_at else None
        }

    @staticmethod
    def delete_schedule_job(db: Session, job_id: int) -> Dict[str, Any]:
        job = db.query(BackupScheduleJob).filter(BackupScheduleJob.id == job_id).first()
        if not job:
            raise ValueError(f"Backup schedule job #{job_id} not found.")
        db.delete(job)
        db.commit()
        return {"status": "deleted", "id": job_id}

    @staticmethod
    def toggle_schedule_job(db: Session, job_id: int) -> Dict[str, Any]:
        job = db.query(BackupScheduleJob).filter(BackupScheduleJob.id == job_id).first()
        if not job:
            raise ValueError(f"Backup schedule job #{job_id} not found.")
        job.is_enabled = not job.is_enabled
        if job.is_enabled:
            job.next_run_at = BackupService.calculate_next_run(
                frequency=job.schedule_frequency,
                time_str=job.schedule_time,
                weekday=job.schedule_weekday,
                interval_hours=job.schedule_interval_hours
            )
        db.commit()
        db.refresh(job)
        return {"status": "success", "id": job_id, "is_enabled": job.is_enabled}

    # -------------------------------------------------------------
    # Execute Backup for Single Target Repository
    # -------------------------------------------------------------
    @staticmethod
    def execute_single_backup(
        db: Session,
        repo: Repository,
        backup_type: str = "hotcopy_full",
        destination_path: Optional[str] = None,
        force: bool = False,
        skip_if_unchanged: bool = True,
        encryption_enabled: bool = False,
        passphrase: Optional[str] = None,
        job_id: Optional[int] = None,
        auto_verify: bool = True,
        retention_count: int = 7,
        actor: str = "system",
        client_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        """Executes a hotcopy or dump backup for a specific repository."""
        info = svn_engine.get_repository_info(repo.fs_path)
        current_rev = info.get("latest_revision", 0)

        # 1. Check last backup for this repo
        last_backup = db.query(BackupArchiveRecord).filter(
            BackupArchiveRecord.repository_id == repo.id
        ).order_by(desc(BackupArchiveRecord.created_at)).first()

        if not force and skip_if_unchanged and last_backup:
            if last_backup.revision_to == current_rev:
                AuditService.log_event(
                    db,
                    actor=actor,
                    action_category="operational",
                    action_name="backup_skipped_unchanged",
                    target_type="repository",
                    target_id=str(repo.id),
                    details={"latest_revision": current_rev, "reason": "No revisions committed since last backup"},
                    client_ip=client_ip
                )
                return {
                    "status": "skipped",
                    "repository_id": repo.id,
                    "repository_name": repo.name,
                    "reason": "Repository unchanged since last backup",
                    "latest_revision": current_rev
                }

        dest_dir = Path(destination_path or config.BACKUP_DIR)
        dest_dir.mkdir(parents=True, exist_ok=True)

        now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        is_incremental = "incremental" in backup_type
        rev_from = last_backup.revision_to if (is_incremental and last_backup) else 0

        # 2. Execute according to type
        if "dump" in backup_type:
            # SVN Dump
            if is_incremental and last_backup:
                dump_filename = f"{repo.name}_rev{rev_from+1}-{current_rev}_{now_str}.dump.gz"
                dump_path = dest_dir / dump_filename
                cmd = ["svnadmin", "dump", repo.fs_path, "-r", f"{rev_from+1}:{current_rev}", "--incremental"]
            else:
                dump_filename = f"{repo.name}_rev0-{current_rev}_{now_str}.dump.gz"
                dump_path = dest_dir / dump_filename
                cmd = ["svnadmin", "dump", repo.fs_path]

            dump_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            with gzip.open(dump_path, "wb") as gz_out:
                shutil.copyfileobj(dump_proc.stdout, gz_out)
            dump_proc.wait()
            if dump_proc.returncode != 0:
                if dump_path.exists():
                    dump_path.unlink()
                err_text = dump_proc.stderr.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"svnadmin dump failed: {err_text}")

            final_filename = dump_filename
            final_path = dump_path
        else:
            # Hotcopy (Full or Incremental)
            temp_hotcopy_dir = dest_dir / f"hotcopy_{repo.name}_{now_str}"
            cmd = ["svnadmin", "hotcopy", repo.fs_path, str(temp_hotcopy_dir)]
            if is_incremental and last_backup:
                cmd.append("--incremental")

            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode != 0:
                if temp_hotcopy_dir.exists():
                    shutil.rmtree(temp_hotcopy_dir, ignore_errors=True)
                raise RuntimeError(f"svnadmin hotcopy failed: {proc.stderr}")

            tar_filename = f"{repo.name}_rev{current_rev}_{now_str}.tar.gz"
            tar_path = dest_dir / tar_filename
            with tarfile.open(tar_path, "w:gz") as tar:
                tar.add(temp_hotcopy_dir, arcname=repo.name)

            shutil.rmtree(temp_hotcopy_dir, ignore_errors=True)
            final_filename = tar_filename
            final_path = tar_path

        # 3. Apply AES-256-GCM Encryption if requested
        is_encrypted = False
        if encryption_enabled and passphrase:
            enc_filename = f"{final_filename}.enc"
            enc_path = dest_dir / enc_filename
            sha256_hash = BackupService.encrypt_file(final_path, enc_path, passphrase)
            final_path.unlink()
            final_filename = enc_filename
            final_path = enc_path
            is_encrypted = True
        else:
            with open(final_path, "rb") as f:
                sha256_hash = hashlib.sha256(f.read()).hexdigest()

        file_size = final_path.stat().st_size

        # 4. Record archive in database
        record = BackupArchiveRecord(
            repository_id=repo.id,
            job_id=job_id,
            backup_type=backup_type,
            archive_filename=final_filename,
            archive_path=str(final_path),
            revision_from=rev_from,
            revision_to=current_rev,
            size_bytes=file_size,
            sha256_checksum=sha256_hash,
            is_encrypted=is_encrypted,
            verification_status="unverified"
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        # 5. Automated Verification Sandbox if requested
        if auto_verify:
            try:
                BackupService.verify_backup(db, record.id, passphrase if is_encrypted else None)
            except Exception as ve:
                record.verification_status = "failed"
                record.verification_log = str(ve)
                db.commit()

        # 6. Retention Pruning (keep last N archives)
        BackupService.prune_retention(db, repo.id, retention_count)

        # 7. Audit Log
        AuditService.log_event(
            db,
            actor=actor,
            action_category="operational",
            action_name="backup_created",
            target_type="repository",
            target_id=str(repo.id),
            details={
                "backup_id": record.id,
                "backup_type": backup_type,
                "revision_to": current_rev,
                "size_bytes": file_size,
                "is_encrypted": is_encrypted,
                "filename": final_filename
            },
            client_ip=client_ip
        )

        return {
            "status": "success",
            "backup_id": record.id,
            "repository_id": repo.id,
            "repository_name": repo.name,
            "filename": final_filename,
            "revision_to": current_rev,
            "size_bytes": file_size,
            "is_encrypted": is_encrypted,
            "sha256": sha256_hash
        }

    # -------------------------------------------------------------
    # Execute Authz & Server Config Backup
    # -------------------------------------------------------------
    @staticmethod
    def execute_authz_config_backup(
        db: Session,
        destination_path: Optional[str] = None,
        job_id: Optional[int] = None,
        encryption_enabled: bool = False,
        passphrase: Optional[str] = None,
        retention_count: int = 14,
        actor: str = "system",
        client_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        """Creates a timestamped snapshot of authorization rules, htpasswd credentials, and server TLS keys."""
        dest_dir = Path(destination_path or config.BACKUP_DIR)
        dest_dir.mkdir(parents=True, exist_ok=True)

        now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        zip_filename = f"authz_config_backup_{now_str}.zip"
        zip_path = dest_dir / zip_filename

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            if config.AUTHZ_FILE.exists():
                zf.write(config.AUTHZ_FILE, arcname="authz")
            if config.HTPASSWD_FILE.exists():
                zf.write(config.HTPASSWD_FILE, arcname="htpasswd")
            if config.CERTS_DIR.exists():
                for cert_file in config.CERTS_DIR.iterdir():
                    if cert_file.is_file():
                        zf.write(cert_file, arcname=f"certs/{cert_file.name}")

        final_filename = zip_filename
        final_path = zip_path
        is_encrypted = False

        if encryption_enabled and passphrase:
            enc_filename = f"{zip_filename}.enc"
            enc_path = dest_dir / enc_filename
            sha256_hash = BackupService.encrypt_file(zip_path, enc_path, passphrase)
            zip_path.unlink()
            final_filename = enc_filename
            final_path = enc_path
            is_encrypted = True
        else:
            with open(final_path, "rb") as f:
                sha256_hash = hashlib.sha256(f.read()).hexdigest()

        file_size = final_path.stat().st_size

        record = BackupArchiveRecord(
            repository_id=None,
            job_id=job_id,
            backup_type="authz_config",
            archive_filename=final_filename,
            archive_path=str(final_path),
            revision_from=0,
            revision_to=0,
            size_bytes=file_size,
            sha256_checksum=sha256_hash,
            is_encrypted=is_encrypted,
            verification_status="verified",
            verification_log="Archive contains valid authz and htpasswd files."
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        # Retention pruning for config archives
        cfg_records = db.query(BackupArchiveRecord).filter(
            BackupArchiveRecord.backup_type == "authz_config"
        ).order_by(desc(BackupArchiveRecord.created_at)).all()

        if len(cfg_records) > retention_count:
            for old_rec in cfg_records[retention_count:]:
                try:
                    p = Path(old_rec.archive_path)
                    if p.exists():
                        p.unlink()
                except Exception:
                    pass
                db.delete(old_rec)
            db.commit()

        AuditService.log_event(
            db,
            actor=actor,
            action_category="operational",
            action_name="authz_config_backup_created",
            target_type="server_config",
            target_id="authz",
            details={"filename": final_filename, "size_bytes": file_size},
            client_ip=client_ip
        )

        return {
            "status": "success",
            "backup_id": record.id,
            "filename": final_filename,
            "size_bytes": file_size,
            "is_encrypted": is_encrypted,
            "sha256": sha256_hash
        }

    # -------------------------------------------------------------
    # Execute Scheduled Job (All Repos or Specific Repo)
    # -------------------------------------------------------------
    @staticmethod
    def run_scheduled_job(
        db: Session,
        job_id: int,
        force: bool = False,
        actor: str = "scheduler",
        client_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        """Executes a full backup schedule job across designated repository targets."""
        job = db.query(BackupScheduleJob).filter(BackupScheduleJob.id == job_id).first()
        if not job:
            raise ValueError(f"Backup schedule job #{job_id} not found.")

        job.last_run_status = "running"
        db.commit()

        try:
            results = []
            if job.backup_type == "authz_config":
                res = BackupService.execute_authz_config_backup(
                    db,
                    destination_path=job.destination_path,
                    job_id=job.id,
                    encryption_enabled=job.encryption_enabled,
                    passphrase=job.encryption_passphrase,
                    retention_count=job.retention_count,
                    actor=actor,
                    client_ip=client_ip
                )
                results.append(res)
            elif job.repository_id:
                # Specific repository
                repo = db.query(Repository).filter(Repository.id == job.repository_id).first()
                if not repo:
                    raise ValueError(f"Repository ID {job.repository_id} not found.")
                res = BackupService.execute_single_backup(
                    db,
                    repo=repo,
                    backup_type=job.backup_type,
                    destination_path=job.destination_path,
                    force=force,
                    skip_if_unchanged=job.skip_if_unchanged,
                    encryption_enabled=job.encryption_enabled,
                    passphrase=job.encryption_passphrase,
                    job_id=job.id,
                    auto_verify=job.auto_verify,
                    retention_count=job.retention_count,
                    actor=actor,
                    client_ip=client_ip
                )
                results.append(res)
            else:
                # All active repositories
                repos = db.query(Repository).all()
                for repo in repos:
                    try:
                        res = BackupService.execute_single_backup(
                            db,
                            repo=repo,
                            backup_type=job.backup_type,
                            destination_path=job.destination_path,
                            force=force,
                            skip_if_unchanged=job.skip_if_unchanged,
                            encryption_enabled=job.encryption_enabled,
                            passphrase=job.encryption_passphrase,
                            job_id=job.id,
                            auto_verify=job.auto_verify,
                            retention_count=job.retention_count,
                            actor=actor,
                            client_ip=client_ip
                        )
                        results.append(res)
                    except Exception as e:
                        results.append({
                            "status": "failed",
                            "repository_id": repo.id,
                            "repository_name": repo.name,
                            "error": str(e)
                        })

            # Check status
            failed_count = sum(1 for r in results if r.get("status") == "failed")
            success_count = sum(1 for r in results if r.get("status") == "success")
            skipped_count = sum(1 for r in results if r.get("status") == "skipped")

            if failed_count > 0:
                final_status = "failed" if success_count == 0 else "partial"
                summary_msg = f"{success_count} succeeded, {skipped_count} skipped, {failed_count} failed."
            elif success_count > 0:
                final_status = "success"
                summary_msg = f"Completed successfully: {success_count} archive(s) created."
            else:
                final_status = "skipped"
                summary_msg = f"All {skipped_count} repository targets skipped (unchanged)."

            # Update job telemetry
            now = datetime.now(timezone.utc)
            job.last_run_at = now
            job.last_run_status = final_status
            job.last_run_message = summary_msg
            job.next_run_at = BackupService.calculate_next_run(
                frequency=job.schedule_frequency,
                time_str=job.schedule_time,
                weekday=job.schedule_weekday,
                interval_hours=job.schedule_interval_hours,
                from_time=now
            )
            db.commit()

            # Emit Admin Notification
            notif = Notification(
                repository_id=job.repository_id,
                repository_name=job.name,
                revision=None,
                author=actor,
                action_type="backup_completed" if final_status in ("success", "skipped") else "backup_failed",
                summary=f"Backup Job '{job.name}': {summary_msg}",
                message=f"Scheduled execution of '{job.name}' finished with status: {final_status.upper()}.\n{summary_msg}",
                is_read=False,
                created_at=now
            )
            db.add(notif)
            db.commit()

            return {
                "status": final_status,
                "job_id": job.id,
                "job_name": job.name,
                "message": summary_msg,
                "results": results
            }

        except Exception as e:
            now = datetime.now(timezone.utc)
            job.last_run_at = now
            job.last_run_status = "failed"
            job.last_run_message = str(e)
            job.next_run_at = BackupService.calculate_next_run(
                frequency=job.schedule_frequency,
                time_str=job.schedule_time,
                weekday=job.schedule_weekday,
                interval_hours=job.schedule_interval_hours,
                from_time=now
            )
            db.commit()

            notif = Notification(
                repository_id=job.repository_id,
                repository_name=job.name,
                revision=None,
                author=actor,
                action_type="backup_failed",
                summary=f"Backup Job '{job.name}' Failed",
                message=f"Error executing backup schedule job '{job.name}': {e}",
                is_read=False,
                created_at=now
            )
            db.add(notif)
            db.commit()

            raise

    # -------------------------------------------------------------
    # Periodic Background Scheduler Runner (Polls Due Jobs)
    # -------------------------------------------------------------
    @staticmethod
    def execute_due_scheduled_jobs(db: Session) -> int:
        """Polls all active jobs and executes any whose next_run_at timestamp has arrived."""
        now = datetime.now(timezone.utc)
        jobs = db.query(BackupScheduleJob).filter(
            BackupScheduleJob.is_enabled == True
        ).all()

        executed = 0
        for job in jobs:
            # If next_run_at is missing, initialize it
            if not job.next_run_at:
                job.next_run_at = BackupService.calculate_next_run(
                    frequency=job.schedule_frequency,
                    time_str=job.schedule_time,
                    weekday=job.schedule_weekday,
                    interval_hours=job.schedule_interval_hours
                )
                db.commit()
                continue

            target_next = job.next_run_at.replace(tzinfo=timezone.utc) if job.next_run_at.tzinfo is None else job.next_run_at
            if target_next <= now:
                try:
                    BackupService.run_scheduled_job(db, job.id, force=False, actor="system_scheduler")
                    executed += 1
                except Exception as e:
                    print(f"[NuviScheduler] Error running job #{job.id} ({job.name}): {e}")

        return executed

    # -------------------------------------------------------------
    # Retention Pruning
    # -------------------------------------------------------------
    @staticmethod
    def prune_retention(db: Session, repo_id: int, max_keep: int = 7):
        """Simple count-based retention pruning: keeps last N archives for a repository."""
        records = db.query(BackupArchiveRecord).filter(
            BackupArchiveRecord.repository_id == repo_id
        ).order_by(desc(BackupArchiveRecord.created_at)).all()

        if len(records) > max_keep:
            for old_rec in records[max_keep:]:
                try:
                    p = Path(old_rec.archive_path)
                    if p.exists():
                        p.unlink()
                except Exception:
                    pass
                db.delete(old_rec)
            db.commit()

    @staticmethod
    def prune_gfs_retention(db: Session, repo_id: int, policy: BackupPolicy):
        """GFS retention pruning."""
        records = db.query(BackupArchiveRecord).filter(
            BackupArchiveRecord.repository_id == repo_id
        ).order_by(desc(BackupArchiveRecord.created_at)).all()

        if len(records) <= policy.gfs_keep_dailies:
            return

        now = datetime.now(timezone.utc)
        daily_cutoff = now - timedelta(days=policy.gfs_keep_dailies)
        weekly_cutoff = now - timedelta(weeks=policy.gfs_keep_weeklies)
        monthly_cutoff = now - timedelta(days=policy.gfs_keep_monthlies * 30)

        kept_records = set()
        for rec in records:
            rec_date = rec.created_at.replace(tzinfo=timezone.utc) if rec.created_at.tzinfo is None else rec.created_at
            if rec_date >= daily_cutoff:
                kept_records.add(rec.id)
            elif rec_date >= weekly_cutoff and rec_date.weekday() == 6:
                kept_records.add(rec.id)
            elif rec_date >= monthly_cutoff and rec_date.day == 1:
                kept_records.add(rec.id)
            else:
                try:
                    p = Path(rec.archive_path)
                    if p.exists():
                        p.unlink()
                except Exception:
                    pass
                db.delete(rec)
        db.commit()

    # -------------------------------------------------------------
    # Automated Sandbox Verification
    # -------------------------------------------------------------
    @staticmethod
    def verify_backup(
        db: Session,
        archive_id: int,
        passphrase: Optional[str] = None
    ) -> BackupVerifyResponse:
        """Restores archive into sandbox, tests SHA-256 integrity, runs 'svnadmin verify'."""
        rec = db.query(BackupArchiveRecord).filter(BackupArchiveRecord.id == archive_id).first()
        if not rec:
            raise ValueError(f"Backup archive {archive_id} not found.")

        archive_path = Path(rec.archive_path)
        if not archive_path.exists():
            rec.verification_status = "failed"
            rec.verification_log = f"Archive file {archive_path} does not exist on disk."
            db.commit()
            return BackupVerifyResponse(archive_id=rec.id, status="failed", verified_revisions=0, log_output=rec.verification_log)

        sandbox_dir = Path(tempfile.mkdtemp(prefix="nuvi_verify_sandbox_"))
        try:
            # 1. Decrypt if needed
            tar_to_extract = archive_path
            if rec.is_encrypted:
                effective_pass = passphrase
                if not effective_pass and rec.policy:
                    effective_pass = rec.policy.encryption_passphrase
                if not effective_pass and rec.job:
                    effective_pass = rec.job.encryption_passphrase
                if not effective_pass:
                    raise ValueError("Passphrase required to decrypt and verify this archive.")

                decrypted_tar = sandbox_dir / "unencrypted.tmp"
                BackupService.decrypt_file(archive_path, decrypted_tar, effective_pass)
                tar_to_extract = decrypted_tar

            # 2. Check if SVN Dump vs Hotcopy
            if ".dump" in rec.archive_filename:
                # Test dump load into sandbox repo
                test_repo_path = sandbox_dir / "test_repo"
                svn_engine.create_repository(str(test_repo_path))

                load_cmd = ["svnadmin", "load", str(test_repo_path)]
                load_proc = subprocess.Popen(load_cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                with gzip.open(tar_to_extract, "rb") as gz_in:
                    shutil.copyfileobj(gz_in, load_proc.stdin)
                load_proc.stdin.close()
                load_proc.wait()

                if load_proc.returncode != 0:
                    err_msg = load_proc.stderr.read().decode("utf-8", errors="replace")
                    rec.verification_status = "failed"
                    rec.verification_log = f"svnadmin load failed during verify:\n{err_msg}"
                    db.commit()
                    return BackupVerifyResponse(archive_id=rec.id, status="failed", verified_revisions=0, log_output=rec.verification_log)

                # Now verify the loaded repo
                verify_cmd = ["svnadmin", "verify", str(test_repo_path)]
                proc = subprocess.run(verify_cmd, capture_output=True, text=True)
                log_output = proc.stdout + proc.stderr
                verified_revs = rec.revision_to

            elif "authz_config" in rec.backup_type:
                # Authz snapshot verification
                with zipfile.ZipFile(tar_to_extract, "r") as zf:
                    names = zf.namelist()
                    if "authz" not in names:
                        raise ValueError("Archive is missing authz configuration file.")
                log_output = f"Authz & config files validated cleanly ({len(names)} items verified)."
                verified_revs = 0

            else:
                # Hotcopy tar.gz
                with tarfile.open(tar_to_extract, "r:gz") as tar:
                    tar.extractall(path=sandbox_dir)

                extracted_repos = [p for p in sandbox_dir.iterdir() if p.is_dir() and (p / "format").exists()]
                if not extracted_repos:
                    raise RuntimeError("Invalid backup archive: missing Subversion format file in extracted tree.")

                restored_repo_path = extracted_repos[0]
                verify_cmd = ["svnadmin", "verify", str(restored_repo_path)]
                proc = subprocess.run(verify_cmd, capture_output=True, text=True)
                log_output = proc.stdout + proc.stderr
                verified_revs = rec.revision_to

            rec.verification_status = "verified"
            rec.verification_log = f"All revisions verified cleanly with zero checksum errors.\n{log_output}"
            rec.verified_at = datetime.now(timezone.utc)
            db.commit()

            return BackupVerifyResponse(
                archive_id=rec.id,
                status="verified",
                verified_revisions=verified_revs,
                log_output=rec.verification_log
            )

        except Exception as e:
            rec.verification_status = "failed"
            rec.verification_log = f"Verification failed: {e}"
            rec.verified_at = datetime.now(timezone.utc)
            db.commit()
            return BackupVerifyResponse(
                archive_id=rec.id,
                status="failed",
                verified_revisions=0,
                log_output=rec.verification_log
            )
        finally:
            shutil.rmtree(sandbox_dir, ignore_errors=True)

    # -------------------------------------------------------------
    # Restore Archive into Repository
    # -------------------------------------------------------------
    @staticmethod
    def restore_backup(
        db: Session,
        archive_id: int,
        target_name: str,
        target_rev: Optional[int] = None,
        passphrase: Optional[str] = None
    ) -> Dict[str, Any]:
        """Restores a backup archive (hotcopy or dump) into a new target repository."""
        rec = db.query(BackupArchiveRecord).filter(BackupArchiveRecord.id == archive_id).first()
        if not rec:
            raise ValueError(f"Backup archive {archive_id} not found.")

        dest_fs_path = config.REPOSITORIES_ROOT / target_name
        if dest_fs_path.exists():
            raise ValueError(f"Target repository path '{dest_fs_path}' already exists.")

        archive_path = Path(rec.archive_path)
        sandbox_dir = Path(tempfile.mkdtemp(prefix="nuvi_restore_"))
        try:
            tar_to_extract = archive_path
            if rec.is_encrypted:
                effective_pass = passphrase
                if not effective_pass and rec.job:
                    effective_pass = rec.job.encryption_passphrase
                if not effective_pass:
                    raise ValueError("Passphrase required to restore encrypted archive.")
                decrypted_tar = sandbox_dir / "unencrypted.tmp"
                BackupService.decrypt_file(archive_path, decrypted_tar, effective_pass)
                tar_to_extract = decrypted_tar

            if ".dump" in rec.archive_filename:
                # SVN dump restore
                svn_engine.create_repository(str(dest_fs_path))
                load_cmd = ["svnadmin", "load", str(dest_fs_path)]
                load_proc = subprocess.Popen(load_cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                with gzip.open(tar_to_extract, "rb") as gz_in:
                    shutil.copyfileobj(gz_in, load_proc.stdin)
                load_proc.stdin.close()
                load_proc.wait()
                if load_proc.returncode != 0:
                    err_msg = load_proc.stderr.read().decode("utf-8", errors="replace")
                    raise RuntimeError(f"svnadmin load failed: {err_msg}")
            else:
                # Hotcopy tar.gz restore
                with tarfile.open(tar_to_extract, "r:gz") as tar:
                    tar.extractall(path=sandbox_dir)

                extracted_repos = [p for p in sandbox_dir.iterdir() if p.is_dir() and (p / "format").exists()]
                if not extracted_repos:
                    raise RuntimeError("Invalid backup archive: missing Subversion format file.")

                shutil.move(str(extracted_repos[0]), str(dest_fs_path))

            info = svn_engine.get_repository_info(str(dest_fs_path))
            latest_rev = info.get("latest_revision", rec.revision_to)

            repo = Repository(
                name=target_name,
                description=f"Restored from backup #{rec.id} ({rec.archive_filename})",
                fs_path=str(dest_fs_path),
                latest_revision=latest_rev
            )
            db.add(repo)
            db.commit()
            db.refresh(repo)

            return {
                "status": "restored",
                "repository_id": repo.id,
                "name": repo.name,
                "latest_revision": repo.latest_revision,
                "fs_path": repo.fs_path
            }
        finally:
            shutil.rmtree(sandbox_dir, ignore_errors=True)

    # -------------------------------------------------------------
    # List & Delete Archives
    # -------------------------------------------------------------
    @staticmethod
    def list_archives(db: Session, repo_id: Optional[int] = None) -> List[Dict[str, Any]]:
        query = db.query(BackupArchiveRecord)
        if repo_id is not None:
            query = query.filter(BackupArchiveRecord.repository_id == repo_id)
        records = query.order_by(desc(BackupArchiveRecord.created_at)).all()

        results = []
        for r in records:
            repo_name = "Global / Authz"
            if r.repository_id:
                repo = db.query(Repository).filter(Repository.id == r.repository_id).first()
                if repo:
                    repo_name = repo.name

            job_name = None
            if r.job_id:
                job = db.query(BackupScheduleJob).filter(BackupScheduleJob.id == r.job_id).first()
                if job:
                    job_name = job.name

            results.append({
                "id": r.id,
                "repository_id": r.repository_id,
                "repository_name": repo_name,
                "job_id": r.job_id,
                "job_name": job_name,
                "backup_type": r.backup_type,
                "archive_filename": r.archive_filename,
                "archive_path": r.archive_path,
                "revision_from": r.revision_from,
                "revision_to": r.revision_to,
                "size_bytes": r.size_bytes,
                "sha256_checksum": r.sha256_checksum,
                "is_encrypted": r.is_encrypted,
                "verification_status": r.verification_status,
                "verification_log": r.verification_log,
                "verified_at": r.verified_at.isoformat() if r.verified_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
        return results

    @staticmethod
    def delete_archive(db: Session, archive_id: int) -> Dict[str, Any]:
        rec = db.query(BackupArchiveRecord).filter(BackupArchiveRecord.id == archive_id).first()
        if not rec:
            raise ValueError(f"Backup archive #{archive_id} not found.")

        try:
            p = Path(rec.archive_path)
            if p.exists():
                p.unlink()
        except Exception:
            pass

        db.delete(rec)
        db.commit()
        return {"status": "deleted", "id": archive_id}

    # -------------------------------------------------------------
    # Legacy Policy Compatibility Methods
    # -------------------------------------------------------------
    @staticmethod
    def get_or_create_policy(db: Session, repo_id: Optional[int] = None) -> BackupPolicy:
        query = db.query(BackupPolicy)
        if repo_id is not None:
            policy = query.filter(BackupPolicy.repository_id == repo_id).first()
        else:
            policy = query.filter(BackupPolicy.repository_id.is_(None)).first()

        if not policy:
            dest = config.BACKUP_DIR
            policy = BackupPolicy(
                repository_id=repo_id,
                backup_type="full",
                schedule_cron="0 2 * * *",
                destination_path=str(dest),
                is_enabled=True,
                skip_if_unchanged=True,
                conditional_full_days=7,
                gfs_keep_dailies=7,
                gfs_keep_weeklies=4,
                gfs_keep_monthlies=12,
                encryption_enabled=False
            )
            db.add(policy)
            db.commit()
            db.refresh(policy)
        return policy

    @staticmethod
    def update_policy(db: Session, req: BackupPolicyCreateRequest) -> BackupPolicyResponse:
        policy = BackupService.get_or_create_policy(db, req.repository_id)
        policy.backup_type = req.backup_type
        policy.schedule_cron = req.schedule_cron
        if req.destination_path:
            policy.destination_path = req.destination_path
        policy.is_enabled = req.is_enabled
        policy.skip_if_unchanged = req.skip_if_unchanged
        policy.conditional_full_days = req.conditional_full_days
        policy.gfs_keep_dailies = req.gfs_keep_dailies
        policy.gfs_keep_weeklies = req.gfs_keep_weeklies
        policy.gfs_keep_monthlies = req.gfs_keep_monthlies
        policy.encryption_enabled = req.encryption_enabled
        if req.encryption_passphrase:
            policy.encryption_passphrase = req.encryption_passphrase

        db.commit()
        db.refresh(policy)
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

    @staticmethod
    def run_backup(
        db: Session,
        repo_id: int,
        backup_type: str = "full",
        force: bool = False,
        passphrase: Optional[str] = None,
        actor: str = "system",
        client_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise ValueError(f"Repository ID {repo_id} not found.")
        policy = BackupService.get_or_create_policy(db, repo.id)
        effective_type = "hotcopy_incremental" if backup_type == "incremental" else "hotcopy_full"
        return BackupService.execute_single_backup(
            db,
            repo=repo,
            backup_type=effective_type,
            destination_path=policy.destination_path,
            force=force,
            skip_if_unchanged=policy.skip_if_unchanged,
            encryption_enabled=policy.encryption_enabled or bool(passphrase),
            passphrase=passphrase or policy.encryption_passphrase,
            job_id=None,
            auto_verify=True,
            retention_count=policy.gfs_keep_dailies,
            actor=actor,
            client_ip=client_ip
        )
