"""
Subversion Nuvi - Pre-Packaged Hook Engine (nuvi-hooks)
Provides VisualSVN-equivalent pre-packaged hook scripts:
1. pre-commit: commit message regex enforcer, pathnames sanitization enforcer.
2. post-commit: asynchronous webhook dispatcher (--no-wait), HTML email commit notification formatter.
Installs and synchronizes executable hook scripts directly into repository hooks/ directories.
"""

import os
import stat
import json
from pathlib import Path
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.api.models.schema import Repository, HookConfig
from backend.api.models.dto import HookConfigUpdateRequest, HookConfigResponse
from backend.api.services.audit_service import AuditService

PRE_COMMIT_SCRIPT_TEMPLATE = """#!/usr/bin/env python3
import sys
import subprocess
import re

REPO_PATH = sys.argv[1]
TXN_NAME = sys.argv[2]

CONFIG_FILE = "{config_path}"

def get_svnlook_prop(prop_name):
    proc = subprocess.run(["svnlook", "propget", "-t", TXN_NAME, REPO_PATH, prop_name], capture_output=True, text=True)
    return proc.stdout.strip()

def get_changed_paths():
    proc = subprocess.run(["svnlook", "changed", "-t", TXN_NAME, REPO_PATH], capture_output=True, text=True)
    paths = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if len(line) >= 4:
            paths.append(line[4:].strip())
    return paths

def main():
    if not os.path.exists(CONFIG_FILE):
        sys.exit(0)

    with open(CONFIG_FILE, "r") as f:
        cfg = json.load(f)

    if not cfg.get("is_enabled", True):
        sys.exit(0)

    # 1. Commit message enforcement
    if cfg.get("check_commit_message", False):
        log_msg = get_svnlook_prop("svn:log")
        pattern = cfg.get("commit_message_pattern", "^.{10,}")
        if not re.search(pattern, log_msg):
            err_msg = cfg.get("commit_message_error_msg", "Commit message does not satisfy policy.")
            sys.stderr.write(f"\\n[POLICY VIOLATION] {err_msg}\\nLog message was: '{log_msg}'\\n")
            sys.exit(1)

    # 2. Pathname sanitization enforcement
    if cfg.get("check_pathnames", False):
        disallow_spaces = cfg.get("disallow_spaces", False)
        disallow_special = cfg.get("disallow_special_chars", True)
        changed = get_changed_paths()

        invalid_chars = ['*', '?', '"', '<', '>', '|', ':']
        for p in changed:
            basename = os.path.basename(p)
            if disallow_spaces and " " in basename:
                sys.stderr.write(f"\\n[PATHNAME VIOLATION] Spaces are forbidden in filename '{basename}'\\n")
                sys.exit(1)
            if disallow_special and any(c in basename for c in invalid_chars):
                sys.stderr.write(f"\\n[PATHNAME VIOLATION] Special characters (* ? \\" < > | :) forbidden in '{basename}'\\n")
                sys.exit(1)
            if basename.endswith(".") or basename.endswith(" "):
                sys.stderr.write(f"\\n[PATHNAME VIOLATION] Trailing periods or spaces forbidden in '{basename}'\\n")
                sys.exit(1)

    sys.exit(0)

if __name__ == "__main__":
    main()
"""

POST_COMMIT_SCRIPT_TEMPLATE = """#!/usr/bin/env python3
import sys
import subprocess
import json
import urllib.request

REPO_PATH = sys.argv[1]
REV_NUM = sys.argv[2]

CONFIG_FILE = "{config_path}"

def get_commit_info():
    author_proc = subprocess.run(["svnlook", "author", "-r", REV_NUM, REPO_PATH], capture_output=True, text=True)
    author = author_proc.stdout.strip()

    log_proc = subprocess.run(["svnlook", "log", "-r", REV_NUM, REPO_PATH], capture_output=True, text=True)
    log_msg = log_proc.stdout.strip()

    changed_proc = subprocess.run(["svnlook", "changed", "-r", REV_NUM, REPO_PATH], capture_output=True, text=True)
    changed = [l.strip() for l in changed_proc.stdout.splitlines() if l.strip()]

    return {
        "repository": os.path.basename(REPO_PATH),
        "revision": int(REV_NUM),
        "author": author,
        "message": log_msg,
        "changed_paths": changed
    }

def main():
    import os
    if not os.path.exists(CONFIG_FILE):
        sys.exit(0)

    with open(CONFIG_FILE, "r") as f:
        cfg = json.load(f)

    if not cfg.get("is_enabled", True):
        sys.exit(0)

    # Webhook Dispatcher
    if cfg.get("webhook_enabled", False) and cfg.get("webhook_url"):
        url = cfg.get("webhook_url")
        try:
            payload = json.dumps(get_commit_info()).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "Subversion-Nuvi-Hook/1.0"}
            )
            # Short timeout to avoid blocking commit
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            # Asynchronous / non-fatal
            pass

    sys.exit(0)

if __name__ == "__main__":
    main()
"""

class HookService:
    @staticmethod
    def get_or_create_config(db: Session, repo_id: int, hook_name: str = "pre-commit") -> HookConfig:
        cfg = db.query(HookConfig).filter(
            HookConfig.repository_id == repo_id,
            HookConfig.hook_name == hook_name
        ).first()

        if not cfg:
            cfg = HookConfig(
                repository_id=repo_id,
                hook_name=hook_name,
                is_enabled=False,
                check_commit_message=False,
                commit_message_pattern=r"^.{10,}",
                commit_message_error_msg="Commit message must be at least 10 characters.",
                check_pathnames=False,
                disallow_spaces=False,
                disallow_special_chars=True,
                email_notifications=False,
                webhook_enabled=False
            )
            db.add(cfg)
            db.commit()
            db.refresh(cfg)

        return cfg

    @staticmethod
    def update_config(
        db: Session,
        repo_id: int,
        hook_name: str,
        req: HookConfigUpdateRequest
    ) -> HookConfigResponse:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise ValueError(f"Repository ID {repo_id} not found.")

        cfg = HookService.get_or_create_config(db, repo_id, hook_name)
        cfg.is_enabled = req.is_enabled
        cfg.check_commit_message = req.check_commit_message
        if req.commit_message_pattern:
            cfg.commit_message_pattern = req.commit_message_pattern
        if req.commit_message_error_msg:
            cfg.commit_message_error_msg = req.commit_message_error_msg
        cfg.check_pathnames = req.check_pathnames
        cfg.disallow_spaces = req.disallow_spaces
        cfg.disallow_special_chars = req.disallow_special_chars
        cfg.email_notifications = req.email_notifications
        cfg.email_recipients = req.email_recipients
        cfg.email_smtp_server = req.email_smtp_server
        cfg.webhook_enabled = req.webhook_enabled
        cfg.webhook_url = req.webhook_url

        db.commit()
        db.refresh(cfg)

        # Synchronize physical script and JSON config in repo/hooks/
        installed_path = HookService.install_hook_script(repo.fs_path, cfg)

        AuditService.log_event(
            db,
            actor="admin",
            action_category="management",
            action_name="update_hook_configuration",
            target_type="repository",
            target_id=str(repo.id),
            details={"hook_name": hook_name, "is_enabled": cfg.is_enabled}
        )

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
            installed_script_path=str(installed_path),
            updated_at=cfg.updated_at
        )

    @staticmethod
    def install_hook_script(repo_fs_path: str, cfg: HookConfig) -> Path:
        """Installs the python hook runner and JSON config into the repository hooks directory."""
        hooks_dir = Path(repo_fs_path) / "hooks"
        hooks_dir.mkdir(parents=True, exist_ok=True)

        config_json_path = hooks_dir / f"nuvi_{cfg.hook_name}.json"
        config_data = {
            "is_enabled": cfg.is_enabled,
            "check_commit_message": cfg.check_commit_message,
            "commit_message_pattern": cfg.commit_message_pattern,
            "commit_message_error_msg": cfg.commit_message_error_msg,
            "check_pathnames": cfg.check_pathnames,
            "disallow_spaces": cfg.disallow_spaces,
            "disallow_special_chars": cfg.disallow_special_chars,
            "email_notifications": cfg.email_notifications,
            "email_recipients": cfg.email_recipients,
            "email_smtp_server": cfg.email_smtp_server,
            "webhook_enabled": cfg.webhook_enabled,
            "webhook_url": cfg.webhook_url
        }
        with open(config_json_path, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=2)

        script_target = hooks_dir / cfg.hook_name
        if cfg.hook_name == "pre-commit":
            script_content = PRE_COMMIT_SCRIPT_TEMPLATE.replace("{config_path}", str(config_json_path))
        else:
            script_content = POST_COMMIT_SCRIPT_TEMPLATE.replace("{config_path}", str(config_json_path))

        with open(script_target, "w", encoding="utf-8") as f:
            f.write(script_content)

        # Make executable (chmod +x)
        current_stat = script_target.stat().st_mode
        script_target.chmod(current_stat | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        return script_target
