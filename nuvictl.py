#!/usr/bin/env python3
"""
Subversion Nuvi - Native Linux Management CLI (nuvictl)
Unified command-line administration tool for headless Subversion Nuvi enterprise servers.
"""

import sys
import os
import argparse
import json
from pathlib import Path

# Ensure backend modules can be imported across dev and installed environments
current_dir = Path(__file__).resolve().parent
for candidate in [
    current_dir,
    current_dir.parent,
    current_dir.parent.parent,
    current_dir.parent.parent.parent,
    Path("/opt/nuvi")
]:
    if (candidate / "backend").exists():
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))
        break

from backend.api.db import SessionLocal, init_db
from backend.api.config import config
from backend.api.services.repo_service import RepositoryService
from backend.api.services.security_service import SecurityService
from backend.api.services.acl_service import AclService
from backend.api.services.shield_service import shield_service
from backend.api.services.backup_service import BackupService
from backend.api.services.hook_service import HookService
from backend.api.services.search_service import SearchService
from backend.api.services.replication_service import ReplicationService
from backend.api.models.dto import (
    RepositoryCreateRequest,
    UserCreateRequest,
    GroupCreateRequest,
    AccessRuleCreateRequest,
    HookConfigUpdateRequest,
    ReplicationNodeCreateRequest
)
from backend.api.models.schema import Repository, User, Group, BackupArchiveRecord

def print_table(headers, rows):
    if not rows:
        print("No records found.")
        return
    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val)))

    header_fmt = "  ".join(f"{{:<{w}}}" for w in col_widths)
    sep_fmt = "  ".join("-" * w for w in col_widths)

    print(header_fmt.format(*headers))
    print(sep_fmt)
    for row in rows:
        print(header_fmt.format(*[str(v) for v in row]))

def cmd_status(args):
    # 1. Try querying the live API daemon first (permission-independent, fast)
    try:
        import urllib.request
        import json
        url = f"http://127.0.0.1:{config.PORT}/api/v1/server/status"
        req = urllib.request.Request(url, headers={"User-Agent": "nuvictl"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                status_data = json.loads(resp.read().decode())
                uptime_sec = int(status_data.get("uptime_seconds", 0))
                days, rem = divmod(uptime_sec, 86400)
                hours, rem = divmod(rem, 3600)
                mins, secs = divmod(rem, 60)
                uptime_str = f"{days}d {hours}h {mins}m {secs}s" if days > 0 else (f"{hours}h {mins}m {secs}s" if hours > 0 else f"{mins}m {secs}s")
                print("=== Subversion Nuvi Server Status ===")
                print(f"Daemon Status:      Running (API port {config.PORT})")
                print(f"Server Name:        {status_data.get('server_name', config.SERVER_NAME)}")
                print(f"Engine Version:     {status_data.get('version', '1.16.13 (Subversion 1.16.13)')}")
                print(f"Uptime:             {uptime_str}")
                print(f"Repositories:       {status_data.get('repositories_count', 0)}")
                print(f"Total Revisions:    {status_data.get('total_revisions', 0)}")
                print(f"Storage Allocated:  {(status_data.get('total_storage_bytes', 0) / (1024*1024)):.2f} MB")
                print(f"Active Locks:       {status_data.get('active_locks_count', 0)}")
                print(f"Uncommitted Txns:   {status_data.get('uncommitted_txns_count', 0)}")
                print(f"CPU Percent:        {status_data.get('cpu_percent', 0.0)}%")
                print(f"Memory Used:        {status_data.get('memory_used_mb', 0.0):.1f} MB")
                print(f"Repositories Root:  {config.REPOSITORIES_ROOT}")
                print(f"Authz ACL File:     {config.AUTHZ_FILE}")
                print(f"Htpasswd File:      {config.HTPASSWD_FILE}")
                print(f"Config Source:      {config.ENV_FILE_LOADED or 'Defaults / Environment'}")
                return
    except Exception:
        pass

    # 2. Daemon is offline or unreachable - direct database inspection
    try:
        config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    if not config.DB_PATH.exists():
        try:
            init_db()
        except Exception:
            print("=== Subversion Nuvi Server Status ===")
            print("Daemon Status:      Stopped")
            print(f"Server Name:        {config.SERVER_NAME}")
            print("Engine Version:     1.16.13 (Subversion 1.16.13)")
            print(f"Database:           Not yet initialized ({config.DB_PATH})")
            print(f"Repositories Root:  {config.REPOSITORIES_ROOT}")
            print(f"Config Source:      {config.ENV_FILE_LOADED or 'Defaults / Environment'}")
            print("\n[NOTE] Database has not been initialized yet.")
            print("       Start the daemon ('sudo systemctl start nuvi-api') or run 'sudo nuvictl status'.")
            return

    try:
        init_db()
    except Exception:
        pass

    db = None
    try:
        db = SessionLocal()
        from backend.api.routers.server import get_server_status
        status = get_server_status(db)
        uptime_hours = int(status.uptime_seconds // 3600)
        uptime_mins = int((status.uptime_seconds % 3600) // 60)
        uptime_secs = int(status.uptime_seconds % 60)
        print("=== Subversion Nuvi Server Status ===")
        print("Daemon Status:      Offline (Direct database inspection)")
        print(f"Server Name:        {status.server_name}")
        print(f"Engine Version:     {status.version}")
        print(f"Uptime:             {uptime_hours}h {uptime_mins}m {uptime_secs}s")
        print(f"Repositories:       {status.repositories_count}")
        print(f"Total Revisions:    {status.total_revisions}")
        print(f"Storage Allocated:  {(status.total_storage_bytes / (1024*1024)):.2f} MB")
        print(f"Active Locks:       {status.active_locks_count}")
        print(f"Uncommitted Txns:   {status.uncommitted_txns_count}")
        print(f"CPU Percent:        {status.cpu_percent}%")
        print(f"Memory Used:        {status.memory_used_mb:.1f} MB")
        print(f"Repositories Root:  {config.REPOSITORIES_ROOT}")
        print(f"Authz ACL File:     {config.AUTHZ_FILE}")
        print(f"Htpasswd File:      {config.HTPASSWD_FILE}")
        print(f"Config Source:      {config.ENV_FILE_LOADED or 'Defaults / Environment'}")
    except Exception as e:
        print("=== Subversion Nuvi Server Status ===")
        print("Daemon Status:      Stopped")
        print(f"Server Name:        {config.SERVER_NAME}")
        print("Engine Version:     1.16.13 (Subversion 1.16.13)")
        print(f"Repositories Root:  {config.REPOSITORIES_ROOT}")
        print(f"Config Source:      {config.ENV_FILE_LOADED or 'Defaults / Environment'}")
        print(f"\n[ERROR] Unable to access database ({config.DB_PATH}): {e}")
        print("       Please run with sudo or verify group permissions:")
        print("       sudo usermod -aG subversion $USER")
    finally:
        if db:
            db.close()

def cmd_config(args):
    print("=== Subversion Nuvi Active Configuration ===")
    print(f"Config File Loaded: {config.ENV_FILE_LOADED or 'None (using defaults/env vars)'}")
    print()
    rows = [
        ["Server Name", config.SERVER_NAME],
        ["Environment", config.ENV],
        ["Log Level", config.LOG_LEVEL],
        ["API / Web Host", f"{config.HOST}:{config.PORT}"],
        ["SVN WebDAV Port", config.SVN_PORT],
        ["SVN URL Prefix", config.SVN_URL_PREFIX],
        ["Data Directory", str(config.DATA_DIR)],
        ["Repositories Root", str(config.REPOSITORIES_ROOT)],
        ["Metadata DB Path", str(config.DB_PATH)],
        ["Authz ACL File", str(config.AUTHZ_FILE)],
        ["Htpasswd File", str(config.HTPASSWD_FILE)],
        ["Backups Directory", str(config.BACKUP_DIR)],
        ["Search Index Dir", str(config.SEARCH_INDEX_DIR)],
        ["Certificates Dir", str(config.CERTS_DIR)],
        ["Logs Directory", str(config.LOGS_DIR)],
        ["API Log File", str(config.API_LOG)],
        ["Worker Log File", str(config.WORKER_LOG)],
        ["SVN Access Log", str(config.SVN_ACCESS_LOG)],
        ["SVN Error Log", str(config.SVN_ERROR_LOG)],
        ["Ban Threshold", f"{config.BAN_THRESHOLD} attempts"],
        ["Ban Reset Window", f"{config.BAN_RESET_SECONDS}s"],
        ["Ban Duration", f"{config.BAN_DURATION_SECONDS}s"],
        ["Password Min Length", config.PASSWORD_MIN_LENGTH],
    ]
    print_table(["Setting Parameter", "Configured Value"], rows)

def cmd_repo(args):
    init_db()
    db = SessionLocal()
    try:
        if args.repo_action == "list":
            repos = RepositoryService.list_repositories(db)
            rows = [[r.id, r.name, r.latest_revision, f"{r.size_bytes / 1024:.1f} KB", r.fs_path] for r in repos]
            print_table(["ID", "Name", "Latest Rev", "Storage", "FS Path"], rows)

        elif args.repo_action == "create":
            req = RepositoryCreateRequest(
                name=args.name,
                description=args.desc,
                standard_layout=args.layout
            )
            res = RepositoryService.create_repository(db, req, actor="cli")
            print(f"Successfully created repository '{res.name}' (ID: {res.id}) at '{res.fs_path}'.")

        elif args.repo_action == "delete":
            repo = db.query(Repository).filter(Repository.name == args.name).first()
            if not repo:
                print(f"Error: Repository '{args.name}' not found.", file=sys.stderr)
                sys.exit(1)
            RepositoryService.delete_repository(db, repo.id, delete_files=args.purge_files, actor="cli")
            print(f"Repository '{args.name}' deleted successfully.")

        elif args.repo_action == "verify":
            repo = db.query(Repository).filter(Repository.name == args.name).first()
            if not repo:
                print(f"Error: Repository '{args.name}' not found.", file=sys.stderr)
                sys.exit(1)
            res = RepositoryService.verify_repository(db, repo.id)
            print(f"Verification {res['status'].upper()}: {res['output']}")

        elif args.repo_action == "pack":
            repo = db.query(Repository).filter(Repository.name == args.name).first()
            if not repo:
                print(f"Error: Repository '{args.name}' not found.", file=sys.stderr)
                sys.exit(1)
            res = RepositoryService.pack_repository(db, repo.id)
            print(f"Pack {res['status'].upper()}: {res['output']}")

        elif args.repo_action == "import-archive":
            from backend.api.services.archive_import_service import ArchiveImportService
            from pathlib import Path
            res = ArchiveImportService.import_repository_archive(
                db=db,
                archive_path=Path(args.archive_path),
                repo_name=args.name,
                import_acls=not args.no_acls,
                import_users=not args.no_users,
                import_hooks=not args.no_hooks,
                actor="cli"
            )
            print(f"Successfully imported repository '{res.repository_name}' (ID: {res.repository_id}).")
            print(f"  Revisions loaded:   {res.revisions_loaded}")
            print(f"  Access rules:       {res.rules_created}")
            print(f"  Groups created:     {res.groups_created}")
            print(f"  Users created:      {res.users_created}")
            print(f"  Hooks installed:    {res.hooks_imported}")

        elif args.repo_action == "import-dump":
            from backend.api.services.archive_import_service import ArchiveImportService
            from pathlib import Path
            res = ArchiveImportService.import_repository_dump_file(
                db=db,
                dump_path=Path(args.dump_path),
                repo_name=args.name,
                description=getattr(args, "desc", None),
                import_users=not args.no_users,
                default_password=args.default_password or "Welcome123!",
                actor="cli"
            )
            print(f"Successfully imported dump into repository '{res.repository_name}' (ID: {res.repository_id}).")
            print(f"  Revisions loaded:   {res.revisions_loaded}")
            print(f"  Users created:      {res.users_created}")

        elif args.repo_action in ("sync", "fix-permissions"):
            from pathlib import Path
            target_path = Path(args.path) if getattr(args, "path", None) else None
            synced = RepositoryService.scan_and_sync_repositories(db, search_dir=target_path)
            print(f"Synchronized and enforced permissions across {len(synced)} repository(ies):")
            for rep in synced:
                print(f"  • {rep.name} (Rev: {rep.latest_revision}) at {rep.fs_path}")
    finally:
        db.close()

def cmd_user(args):
    init_db()
    db = SessionLocal()
    try:
        if args.user_action == "list":
            users = SecurityService.list_users(db)
            rows = [[u.id, u.username, "Yes" if u.is_admin else "No", "Active" if u.is_active else "Inactive", ", ".join(u.groups)] for u in users]
            print_table(["ID", "Username", "Admin", "Status", "Groups"], rows)

        elif args.user_action == "create":
            req = UserCreateRequest(
                username=args.username,
                password=args.password,
                email=args.email,
                is_admin=args.admin
            )
            res = SecurityService.create_user(db, req)
            print(f"User '{res.username}' created successfully.")

        elif args.user_action == "passwd":
            user = db.query(User).filter(User.username == args.username).first()
            if not user:
                print(f"Error: User '{args.username}' not found.", file=sys.stderr)
                sys.exit(1)
            SecurityService.change_password(db, user.id, args.new_password)
            print(f"Password for user '{args.username}' changed successfully.")
    finally:
        db.close()

def cmd_acl(args):
    init_db()
    db = SessionLocal()
    try:
        if args.acl_action == "eval":
            repo = db.query(Repository).filter(Repository.name == args.repo).first()
            if not repo:
                print(f"Error: Repository '{args.repo}' not found.", file=sys.stderr)
                sys.exit(1)
            res = AclService.evaluate_effective_permission(db, args.user, repo.id, args.path or "/")
            print(f"=== Effective Permissions: User '{args.user}' on '{repo.name}:{res.path}' ===")
            print(f"Effective Permission: {res.effective_permission or 'none (DENIED)'}")
            print(f"Can Read:             {'YES' if res.can_read else 'NO'}")
            print(f"Can Write:            {'YES' if res.can_write else 'NO'}")
            print("\nDecision Trace:")
            for item in res.decision_trace:
                print(f"  [{item.scope}] Rule on '{item.path}' ({item.principal} -> '{item.permission}') => {item.effect.upper()}: {item.reason}")
    finally:
        db.close()

def cmd_backup(args):
    init_db()
    db = SessionLocal()
    try:
        if args.backup_action == "run":
            repo = db.query(Repository).filter(Repository.name == args.repo).first()
            if not repo:
                print(f"Error: Repository '{args.repo}' not found.", file=sys.stderr)
                sys.exit(1)
            res = BackupService.run_backup(
                db,
                repo_id=repo.id,
                backup_type=args.type,
                force=args.force,
                passphrase=args.passphrase,
                actor="cli"
            )
            print(f"Backup Result: {json.dumps(res, indent=2)}")

        elif args.backup_action == "verify":
            res = BackupService.verify_backup(db, archive_id=args.archive_id, passphrase=args.passphrase)
            print(f"Sandbox Verification: {res.status.upper()} ({res.verified_revisions} revisions checked)")
            print(res.log_output)
    finally:
        db.close()

def cmd_search(args):
    init_db()
    db = SessionLocal()
    try:
        res = SearchService.search(
            db,
            query_str=args.query,
            repository_id=args.repo,
            path_prefix=args.path,
            extension=args.ext,
            username=args.user
        )
        print(f"Search results for '{args.query}': {res['total_hits']} hits")
        if res.get("jump_revision") is not None:
            print(f"[*] Instant Jump to Revision: r{res['jump_revision']}")
        rows = [[r["repository_name"], f"r{r['revision']}", r["filename"], r["path"]] for r in res["results"]]
        print_table(["Repo", "Rev", "File", "Path"], rows)
    finally:
        db.close()

def main():
    parser = argparse.ArgumentParser(
        prog="nuvictl",
        description="Subversion Nuvi - Native Headless Linux Server Management CLI"
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # Status
    p_status = subparsers.add_parser("status", help="Show live server telemetry and health")
    p_status.set_defaults(func=cmd_status)

    # Config
    p_config = subparsers.add_parser("config", help="Display active server configuration and .env details")
    p_config.set_defaults(func=cmd_config)

    # Repositories
    p_repo = subparsers.add_parser("repo", help="Repository management")
    repo_subs = p_repo.add_subparsers(dest="repo_action", required=True)
    repo_subs.add_parser("list", help="List all repositories")
    
    p_create = repo_subs.add_parser("create", help="Create a new repository")
    p_create.add_argument("name", help="Repository name")
    p_create.add_argument("--desc", default="", help="Description")
    p_create.add_argument("--layout", action="store_true", help="Initialize trunk/branches/tags layout")

    p_del = repo_subs.add_parser("delete", help="Delete a repository")
    p_del.add_argument("name", help="Repository name")
    p_del.add_argument("--purge-files", action="store_true", help="Delete repository disk files")

    p_ver = repo_subs.add_parser("verify", help="Run svnadmin verify")
    p_ver.add_argument("name", help="Repository name")

    p_pack = repo_subs.add_parser("pack", help="Run svnadmin pack")
    p_pack.add_argument("name", help="Repository name")

    p_import = repo_subs.add_parser("import-archive", help="Import repository from a .zip archive (dump + VisualSVN authz/htpasswd/hooks)")
    p_import.add_argument("archive_path", help="Path to .zip archive file")
    p_import.add_argument("--name", default=None, help="Target repository name (defaults to archive base name)")
    p_import.add_argument("--no-acls", action="store_true", help="Do not import authz permissions")
    p_import.add_argument("--no-users", action="store_true", help="Do not import users or htpasswd hashes")
    p_import.add_argument("--no-hooks", action="store_true", help="Do not import hook scripts")

    p_import_dump = repo_subs.add_parser("import-dump", help="Import repository from a standalone .dump / .svndump / .dump.gz file")
    p_import_dump.add_argument("dump_path", help="Path to .dump, .svndump, or .dump.gz file")
    p_import_dump.add_argument("--name", default=None, help="Target repository name (defaults to dump base name)")
    p_import_dump.add_argument("--desc", default=None, help="Optional repository description")
    p_import_dump.add_argument("--no-users", action="store_true", help="Do not auto-create commit authors as users")
    p_import_dump.add_argument("--default-password", default="Welcome123!", help="Default password for newly created imported authors")

    p_sync = repo_subs.add_parser("sync", help="Scan and sync permissions for repositories copied into storage root")
    p_sync.add_argument("path", nargs="?", default=None, help="Optional path to specific repository or folder")

    p_fix = repo_subs.add_parser("fix-permissions", help="Fix permissions, ownership, and sync repositories")
    p_fix.add_argument("path", nargs="?", default=None, help="Optional path to specific repository or folder")

    p_repo.set_defaults(func=cmd_repo)

    # Users
    p_user = subparsers.add_parser("user", help="User management")
    user_subs = p_user.add_subparsers(dest="user_action", required=True)
    user_subs.add_parser("list", help="List users")
    
    p_ucreate = user_subs.add_parser("create", help="Create user")
    p_ucreate.add_argument("username", help="Username")
    p_ucreate.add_argument("password", help="Password")
    p_ucreate.add_argument("--email", default=None, help="Email")
    p_ucreate.add_argument("--admin", action="store_true", help="Grant administrator rights")

    p_upasswd = user_subs.add_parser("passwd", help="Change user password")
    p_upasswd.add_argument("username", help="Username")
    p_upasswd.add_argument("new_password", help="New password")
    p_user.set_defaults(func=cmd_user)

    # ACL
    p_acl = subparsers.add_parser("acl", help="Access control and effective permission evaluation")
    acl_subs = p_acl.add_subparsers(dest="acl_action", required=True)
    p_eval = acl_subs.add_parser("eval", help="Evaluate effective permission decision tree")
    p_eval.add_argument("repo", help="Repository name")
    p_eval.add_argument("user", help="Username to test")
    p_eval.add_argument("--path", default="/", help="Path within repository")
    p_acl.set_defaults(func=cmd_acl)

    # Backups
    p_backup = subparsers.add_parser("backup", help="Hot backup and sandbox verification")
    b_subs = p_backup.add_subparsers(dest="backup_action", required=True)
    p_brun = b_subs.add_parser("run", help="Run hot backup")
    p_brun.add_argument("repo", help="Repository name")
    p_brun.add_argument("--type", choices=["full", "incremental"], default="full")
    p_brun.add_argument("--force", action="store_true", help="Force backup even if unchanged")
    p_brun.add_argument("--passphrase", default=None, help="AES-256-GCM passphrase")

    p_bver = b_subs.add_parser("verify", help="Sandbox verify backup")
    p_bver.add_argument("archive_id", type=int, help="Backup archive record ID")
    p_bver.add_argument("--passphrase", default=None, help="Decryption passphrase")
    p_backup.set_defaults(func=cmd_backup)

    # Search
    p_search = subparsers.add_parser("search", help="Full-text FTS5 search")
    p_search.add_argument("query", help="Search string or 'r123' for jump to revision")
    p_search.add_argument("--repo", type=int, default=None, help="Repository ID filter")
    p_search.add_argument("--path", default=None, help="Path prefix filter")
    p_search.add_argument("--ext", default=None, help="Extension filter")
    p_search.add_argument("--user", default=None, help="Username for ACL security trimming")
    p_search.set_defaults(func=cmd_search)

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
