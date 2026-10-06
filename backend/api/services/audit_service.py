"""
Subversion Nuvi - Structured Dual-Tier Audit Logging Service
Records logical operational events and administrative management changes in structured JSON format
and relational database for compliance and SIEM integration.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.api.config import config
from backend.api.models.schema import AuditLog

class AuditService:
    @staticmethod
    def log_event(
        db: Session,
        actor: str,
        action_category: str, # "operational" or "management"
        action_name: str,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        client_ip: str = "127.0.0.1"
    ) -> AuditLog:
        now = datetime.now(timezone.utc)
        details_str = json.dumps(details) if details else None

        # 1. Insert into database
        entry = AuditLog(
            timestamp=now,
            actor=actor,
            client_ip=client_ip,
            action_category=action_category,
            action_name=action_name,
            target_type=target_type,
            target_id=target_id,
            details_json=details_str
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)

        # 2. Append to structured JSON Lines file for SIEM log forwarders (Splunk/Fluentd)
        log_file = config.LOGS_DIR / f"nuvi_{action_category}.jsonl"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        
        json_record = {
            "timestamp": now.isoformat(),
            "actor": actor,
            "client_ip": client_ip,
            "category": action_category,
            "action": action_name,
            "target_type": target_type,
            "target_id": target_id,
            "details": details or {}
        }
        try:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(json_record) + "\n")
        except Exception:
            pass

        return entry

    @staticmethod
    def log_action(
        db: Session,
        actor: str,
        category: str,
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        client_ip: str = "127.0.0.1"
    ) -> AuditLog:
        return AuditService.log_event(
            db=db,
            actor=actor,
            action_category=category,
            action_name=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            client_ip=client_ip
        )

    @staticmethod
    def query_logs(
        db: Session,
        category: Optional[str] = None,
        actor: Optional[str] = None,
        action_name: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        query = db.query(AuditLog)
        if category:
            query = query.filter(AuditLog.action_category == category)
        if actor:
            query = query.filter(AuditLog.actor == actor)
        if action_name:
            query = query.filter(AuditLog.action_name == action_name)

        logs = query.order_by(desc(AuditLog.timestamp)).offset(offset).limit(limit).all()

        results = []
        for l in logs:
            details_obj = None
            if l.details_json:
                try:
                    details_obj = json.loads(l.details_json)
                except Exception:
                    details_obj = l.details_json

            results.append({
                "id": l.id,
                "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                "actor": l.actor,
                "client_ip": l.client_ip,
                "category": l.action_category,
                "action": l.action_name,
                "target_type": l.target_type,
                "target_id": l.target_id,
                "details": details_obj
            })
        return results
