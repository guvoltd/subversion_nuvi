"""
Subversion Nuvi - Asynchronous Background Worker Daemon
Executes scheduled tasks: automated hot backups, verification jobs, repository packing,
and full-text search indexing.
"""

import time
import logging
from backend.api.config import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [NuviWorker] %(message)s"
)
logger = logging.getLogger("nuvi.worker")

def run_worker_loop():
    logger.info("Subversion Nuvi Background Worker Daemon initializing...")
    logger.info(f"Connected to metadata db: {config.DB_PATH}")
    logger.info(f"Repositories directory: {config.REPOSITORIES_ROOT}")

    from backend.api.db import SessionLocal
    from backend.api.services.backup_service import BackupService
    
    while True:
        try:
            db = SessionLocal()
            try:
                executed = BackupService.execute_due_scheduled_jobs(db)
                if executed > 0:
                    logger.info(f"Successfully processed {executed} due scheduled backup job(s).")
            finally:
                db.close()
            time.sleep(15)
        except KeyboardInterrupt:
            logger.info("Worker shutting down gracefully...")
            break
        except Exception as e:
            logger.error(f"Error in worker loop: {e}", exc_info=True)
            time.sleep(10)

if __name__ == "__main__":
    run_worker_loop()
