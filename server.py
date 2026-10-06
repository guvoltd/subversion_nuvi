"""
Subversion Nuvi - Server API Router
Handles server health, real-time dashboard status, and configuration management.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from backend.api.db import get_db
from backend.api.models.dto import ServerStatusResponse
from backend.api.services.repo_service import RepositoryService
from backend.api.config import config

router = APIRouter(prefix="/server", tags=["Server"])

@router.get("/status", response_model=ServerStatusResponse, summary="Get server dashboard status")
def get_server_status(db: Session = Depends(get_db)):
    """Retrieve real-time server health, resource consumption, and repository statistics."""
    return RepositoryService.get_server_status(db)

@router.get("/config", summary="Get global server configuration")
def get_server_config():
    """Retrieve current runtime configuration."""
    return {
        "server_name": config.SERVER_NAME,
        "env": config.ENV,
        "env_file_loaded": config.ENV_FILE_LOADED,
        "svn_url_prefix": config.SVN_URL_PREFIX,
        "repositories_root": str(config.REPOSITORIES_ROOT),
        "data_dir": str(config.DATA_DIR),
        "db_path": str(config.DB_PATH),
        "authz_file": str(config.AUTHZ_FILE),
        "htpasswd_file": str(config.HTPASSWD_FILE),
        "backup_dir": str(config.BACKUP_DIR),
        "search_index_dir": str(config.SEARCH_INDEX_DIR),
        "certs_dir": str(config.CERTS_DIR),
        "logs_dir": str(config.LOGS_DIR),
        "api_log": str(config.API_LOG),
        "worker_log": str(config.WORKER_LOG),
        "svn_access_log": str(config.SVN_ACCESS_LOG),
        "svn_error_log": str(config.SVN_ERROR_LOG),
        "host": config.HOST,
        "port": config.PORT,
        "svn_port": config.SVN_PORT,
        "ban_threshold": config.BAN_THRESHOLD,
        "ban_reset_seconds": config.BAN_RESET_SECONDS,
        "ban_duration_seconds": config.BAN_DURATION_SECONDS,
        "password_min_length": config.PASSWORD_MIN_LENGTH,
        "trusted_subnets": config.TRUSTED_SUBNETS,
    }
