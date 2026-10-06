"""
Subversion Nuvi - Multi-Site Geo-Replication Engine (VDFS Architecture)
Implements:
1. Master-Slave replication node management.
2. Offline Replication Seed export/import for massive initial repository synchronization over WAN.
3. Automated svnsync-based revision synchronization.
4. Disaster Recovery Slave-to-Master node promotion.
"""

import os
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.api.config import config
from backend.api.models.schema import Repository, ReplicationNode
from backend.api.models.dto import ReplicationNodeCreateRequest, ReplicationNodeResponse
from backend.api.services.svn_native import svn_engine
from backend.api.services.audit_service import AuditService

class ReplicationService:
    @staticmethod
    def get_or_create_node(
        db: Session,
        repo_id: int,
        req: Optional[ReplicationNodeCreateRequest] = None
    ) -> ReplicationNode:
        node = db.query(ReplicationNode).filter(ReplicationNode.repository_id == repo_id).first()
        if not node:
            node = ReplicationNode(
                repository_id=repo_id,
                node_role=req.node_role if req else "master",
                master_url=req.master_url if req else None,
                sync_interval_seconds=req.sync_interval_seconds if req else 30,
                compression_enabled=req.compression_enabled if req else True,
                sync_status="idle"
            )
            db.add(node)
            db.commit()
            db.refresh(node)
        elif req:
            node.node_role = req.node_role
            node.master_url = req.master_url
            node.sync_interval_seconds = req.sync_interval_seconds
            node.compression_enabled = req.compression_enabled
            db.commit()
            db.refresh(node)

        return node

    @staticmethod
    def export_replication_seed(db: Session, repo_id: int) -> Dict[str, Any]:
        """
        TASK-5.5: Offline Replication Seed Export.
        Generates a portable, compressed seed archive for seeding remote slave repositories
        without saturating WAN bandwidth.
        """
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise ValueError(f"Repository ID {repo_id} not found.")

        dest_dir = config.DATA_DIR / "replication_seeds"
        dest_dir.mkdir(parents=True, exist_ok=True)

        now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        seed_filename = f"{repo.name}_seed_rev{repo.latest_revision}_{now_str}.nuviseed"
        seed_path = dest_dir / seed_filename

        # Create hotcopy into temp dir and compress
        temp_dir = Path(tempfile.mkdtemp(prefix="nuvi_seed_"))
        try:
            hotcopy_dir = temp_dir / "repo"
            cmd = ["svnadmin", "hotcopy", repo.fs_path, str(hotcopy_dir)]
            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode != 0:
                raise RuntimeError(f"svnadmin hotcopy failed for seed: {proc.stderr}")

            with tarfile.open(seed_path, "w:gz") as tar:
                tar.add(hotcopy_dir, arcname="seed_repository")

            file_size = seed_path.stat().st_size

            AuditService.log_event(
                db,
                actor="admin",
                action_category="management",
                action_name="export_replication_seed",
                target_type="repository",
                target_id=str(repo.id),
                details={"seed_filename": seed_filename, "size_bytes": file_size, "revision": repo.latest_revision}
            )

            return {
                "repository_id": repo.id,
                "seed_filename": seed_filename,
                "seed_path": str(seed_path),
                "size_bytes": file_size,
                "latest_revision": repo.latest_revision
            }
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    @staticmethod
    def import_replication_seed(db: Session, seed_path: str, new_repo_name: str, master_url: str) -> Dict[str, Any]:
        """
        TASK-5.5: Offline Replication Seed Import.
        Extracts a seed archive into a new local slave repository and binds it to the master URL.
        """
        seed_file = Path(seed_path)
        if not seed_file.exists():
            raise ValueError(f"Seed file '{seed_path}' not found.")

        dest_repo_path = config.REPOSITORIES_ROOT / new_repo_name
        if dest_repo_path.exists():
            raise ValueError(f"Destination repository '{dest_repo_path}' already exists.")

        temp_dir = Path(tempfile.mkdtemp(prefix="nuvi_seed_import_"))
        try:
            with tarfile.open(seed_file, "r:gz") as tar:
                tar.extractall(path=temp_dir)

            extracted_repo = temp_dir / "seed_repository"
            if not extracted_repo.exists() or not (extracted_repo / "format").exists():
                raise RuntimeError("Invalid seed archive: missing repository structure.")

            shutil.move(str(extracted_repo), str(dest_repo_path))

            info = svn_engine.get_repository_info(str(dest_repo_path))

            # Register as slave in database
            repo = Repository(
                name=new_repo_name,
                description=f"Replication Slave tracking {master_url}",
                fs_path=str(dest_repo_path),
                latest_revision=info["latest_revision"]
            )
            db.add(repo)
            db.commit()
            db.refresh(repo)

            node = ReplicationNode(
                repository_id=repo.id,
                node_role="slave",
                master_url=master_url,
                last_sync_revision=repo.latest_revision,
                sync_status="standby",
                is_active=True
            )
            db.add(node)
            db.commit()
            db.refresh(node)

            AuditService.log_event(
                db,
                actor="admin",
                action_category="management",
                action_name="import_replication_seed",
                target_type="repository",
                target_id=str(repo.id),
                details={"master_url": master_url, "seeded_revision": repo.latest_revision}
            )

            return {
                "repository_id": repo.id,
                "name": repo.name,
                "latest_revision": repo.latest_revision,
                "node_role": "slave",
                "master_url": master_url
            }
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    @staticmethod
    def promote_slave_to_master(db: Session, repo_id: int) -> Dict[str, Any]:
        """
        TASK-5.5: Disaster Recovery Promotion.
        Promotes a slave repository to standalone master role.
        """
        node = db.query(ReplicationNode).filter(ReplicationNode.repository_id == repo_id).first()
        if not node:
            raise ValueError(f"Replication configuration for repository {repo_id} not found.")

        if node.node_role == "master":
            return {"status": "already_master", "message": "Repository is already operating as Master."}

        node.node_role = "master"
        node.master_url = None
        node.sync_status = "idle"
        db.commit()

        AuditService.log_event(
            db,
            actor="admin",
            action_category="management",
            action_name="promote_slave_to_master",
            target_type="repository",
            target_id=str(repo_id),
            details={"promoted_at": datetime.now(timezone.utc).isoformat()}
        )

        return {
            "status": "promoted",
            "repository_id": repo_id,
            "new_role": "master",
            "message": "Node successfully promoted to Master repository."
        }
