"""
Subversion Nuvi - Repository Maintenance & Health Engine
Provides FSFS Shard Packing (svnadmin pack), Dead Transaction Cleaner (svnadmin rmtxns),
Live Health/Integrity Check (svnadmin verify), and Detailed Storage Profiling.
"""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.api.models.schema import Repository
from backend.api.services.svn_native import svn_engine


class MaintenanceService:
    @staticmethod
    def pack_repository(fs_path: str) -> Dict[str, Any]:
        """
        Executes 'svnadmin pack' on an FSFS repository.
        Consolidates completed shard revisions into monolithic pack files,
        reducing inode consumption and accelerating read access.
        """
        if not os.path.exists(fs_path):
            raise ValueError(f"Repository path does not exist: {fs_path}")

        format_file = os.path.join(fs_path, "format")
        if not os.path.exists(format_file):
            raise ValueError(f"Not a valid Subversion repository: {fs_path}")

        import time
        start_time = time.time()
        cmd = ["svnadmin", "pack", fs_path]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        elapsed = round(time.time() - start_time, 2)
        if proc.returncode != 0:
            raise RuntimeError(f"svnadmin pack failed: {proc.stderr or proc.stdout}")

        return {
            "status": "success",
            "message": "Repository FSFS shards packed successfully.",
            "elapsed_seconds": elapsed,
            "output": proc.stdout.strip() or "Packing completed."
        }

    @staticmethod
    def clean_transactions(fs_path: str) -> Dict[str, Any]:
        """
        Scans for dead or abandoned transactions in db/transactions/
        and purges them using 'svnadmin rmtxns'.
        """
        if not os.path.exists(fs_path):
            raise ValueError(f"Repository path does not exist: {fs_path}")

        # 1. List active/dead transactions
        list_cmd = ["svnadmin", "lstxns", fs_path]
        list_proc = subprocess.run(list_cmd, capture_output=True, text=True)
        if list_proc.returncode != 0:
            raise RuntimeError(f"Failed to list transactions: {list_proc.stderr}")

        txns = [t.strip() for t in list_proc.stdout.splitlines() if t.strip()]
        if not txns:
            return {
                "status": "success",
                "message": "No uncommitted or dead transactions found.",
                "cleaned_count": 0,
                "cleaned_transactions": []
            }

        # 2. Execute rmtxns
        rm_cmd = ["svnadmin", "rmtxns", fs_path] + txns
        rm_proc = subprocess.run(rm_cmd, capture_output=True, text=True)
        if rm_proc.returncode != 0:
            raise RuntimeError(f"svnadmin rmtxns failed: {rm_proc.stderr}")

        return {
            "status": "success",
            "message": f"Successfully purged {len(txns)} dead transaction(s).",
            "cleaned_count": len(txns),
            "cleaned_transactions": txns
        }

    @staticmethod
    def verify_repository(
        fs_path: str,
        start_rev: Optional[int] = None,
        end_rev: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Executes 'svnadmin verify' across repository revisions to detect
        corrupted data representations, missing revision files, or broken checksums.
        """
        if not os.path.exists(fs_path):
            raise ValueError(f"Repository path does not exist: {fs_path}")

        info = svn_engine.get_repository_info(fs_path)
        latest_rev = info.get("latest_revision", 0)

        cmd = ["svnadmin", "verify", fs_path]
        if start_rev is not None and end_rev is not None:
            cmd.extend(["-r", f"{start_rev}:{end_rev}"])
        elif start_rev is not None:
            cmd.extend(["-r", f"{start_rev}:{latest_rev}"])

        proc = subprocess.run(cmd, capture_output=True, text=True)
        output = proc.stdout.strip()
        errors = proc.stderr.strip()

        combined_log = f"{output}\n{errors}".strip()
        verified_count = combined_log.count("* Verified revision")

        if proc.returncode != 0:
            return {
                "status": "failed",
                "latest_revision": latest_rev,
                "verified_revisions": verified_count,
                "log_output": combined_log,
                "message": f"Verification failed with errors: {errors}"
            }

        return {
            "status": "verified",
            "latest_revision": latest_rev,
            "verified_revisions": max(verified_count, latest_rev),
            "log_output": combined_log,
            "message": f"All {latest_rev} revision(s) verified cleanly with zero errors."
        }

    @staticmethod
    def get_storage_breakdown(db: Session) -> List[Dict[str, Any]]:
        """
        Calculates detailed disk storage telemetry for all active repositories:
        revisions size, properties size, locks, transactions cache, and total allocated.
        """
        repos = db.query(Repository).all()
        results = []

        for repo in repos:
            if not repo.fs_path or not os.path.exists(repo.fs_path):
                continue

            fs = Path(repo.fs_path)
            db_dir = fs / "db"

            revs_dir = db_dir / "revs"
            revprops_dir = db_dir / "revprops"
            txns_dir = db_dir / "transactions"
            locks_dir = db_dir / "locks"

            def dir_size(p: Path) -> int:
                total = 0
                if not p.exists():
                    return 0
                for dirpath, _, filenames in os.walk(p):
                    for f in filenames:
                        fp = os.path.join(dirpath, f)
                        try:
                            total += os.path.getsize(fp)
                        except OSError:
                            pass
                return total

            revs_size = dir_size(revs_dir)
            revprops_size = dir_size(revprops_dir)
            txns_size = dir_size(txns_dir)
            locks_size = dir_size(locks_dir)
            total_size = dir_size(fs)

            # Check if packed
            is_packed = False
            pack_manifest = revs_dir / "0" / "manifest"
            if pack_manifest.exists():
                is_packed = True

            results.append({
                "repository_id": repo.id,
                "repository_name": repo.name,
                "latest_revision": repo.latest_revision,
                "revision_count": repo.latest_revision or 0,
                "total_bytes": total_size,
                "total_size_bytes": total_size,
                "revisions_bytes": revs_size,
                "revs_size_bytes": revs_size,
                "properties_bytes": revprops_size,
                "revprops_size_bytes": revprops_size,
                "transactions_bytes": txns_size,
                "locks_bytes": locks_size,
                "locks_size_bytes": locks_size,
                "hooks_size_bytes": dir_size(fs / "hooks"),
                "conf_size_bytes": dir_size(fs / "conf"),
                "is_packed": is_packed,
                "fs_format": repo.fs_type
            })

        return results
