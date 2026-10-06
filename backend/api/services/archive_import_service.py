"""
Subversion Nuvi - Archive & Dump Import Service
Supports importing complete Subversion repository dump packages (.zip),
including SVN dumps, VisualSVN authz configurations, groups, users, htpasswd, and hooks.
"""

import os
import re
import gzip
import bz2
import shutil
import tempfile
import zipfile
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Set
from sqlalchemy.orm import Session

from backend.api.config import config
from backend.api.models.schema import (
    Repository,
    User,
    Group,
    UserGroupMembership,
    AccessRule,
    PrincipalType,
    PermissionLevel,
    AuditLog
)
from backend.api.models.dto import (
    RepositoryCreateRequest,
    ArchiveImportResponse
)
from backend.api.services.repo_service import RepositoryService
from backend.api.services.acl_service import AclService
from backend.api.services.security_service import SecurityService
from backend.api.services.svn_native import svn_engine

class ArchiveImportService:
    @staticmethod
    def import_repository_archive(
        db: Session,
        archive_path: Path,
        repo_name: Optional[str] = None,
        import_acls: bool = True,
        import_users: bool = True,
        import_hooks: bool = True,
        default_password: str = "Welcome123!",
        actor: str = "admin",
        client_ip: str = "127.0.0.1"
    ) -> ArchiveImportResponse:
        """
        Extracts and imports an SVN repository archive (.zip), restoring the repository dump,
        parsing VisualSVN authz rules, importing security groups, auto-creating users,
        and configuring hooks.
        """
        if not archive_path.exists() or not archive_path.is_file():
            raise FileNotFoundError(f"Archive file not found: {archive_path}")

        staging_dir = Path(tempfile.mkdtemp(prefix="nuvi_import_staging_"))
        try:
            # 1. Unzip safely (prevent path traversal / zip-slip)
            try:
                with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                    for member in zip_ref.infolist():
                        # Normalize target path
                        target_file = staging_dir / member.filename
                        resolved_path = target_file.resolve()
                        if not str(resolved_path).startswith(str(staging_dir.resolve())):
                            raise RuntimeError(f"Illegal path in zip archive: {member.filename}")
                        zip_ref.extract(member, staging_dir)
            except zipfile.BadZipFile:
                raise ValueError("The provided file is not a valid ZIP archive.")

            # 2. Determine target repository name
            target_repo_name = ArchiveImportService._determine_repo_name(db, staging_dir, archive_path, repo_name)

            # 3. Locate SVN dump file or raw repository
            dump_file_path = ArchiveImportService._find_dump_file(staging_dir)
            raw_repo_dir = ArchiveImportService._find_raw_repo_dir(staging_dir) if not dump_file_path else None

            if not dump_file_path and not raw_repo_dir:
                raise ValueError(
                    "No Subversion dump file (*.dump, *.svndump, *.dump.gz) or repository data directory found inside the archive."
                )

            # 4. Create repository in Nuvi
            created_repo_dto = RepositoryService.create_repository(
                db=db,
                req=RepositoryCreateRequest(
                    name=target_repo_name,
                    description=f"Imported from archive '{archive_path.name}'",
                    init_standard_layout=False  # Do not initialize layout, we will load history
                ),
                actor=actor,
                client_ip=client_ip
            )
            created_repo = db.query(Repository).filter(Repository.id == created_repo_dto.id).first()
            if not created_repo:
                raise RuntimeError("Failed to retrieve newly created repository record.")

            revisions_loaded = 0
            dump_loaded = False

            # 5. Load dump file or copy raw repo
            if dump_file_path:
                revisions_loaded = ArchiveImportService._load_dump(created_repo.fs_path, dump_file_path)
                dump_loaded = True
            elif raw_repo_dir:
                # Hotcopy raw repo into created_repo.fs_path
                shutil.rmtree(created_repo.fs_path, ignore_errors=True)
                res = subprocess.run(
                    ["svnadmin", "hotcopy", str(raw_repo_dir), created_repo.fs_path],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                if res.returncode != 0:
                    raise RuntimeError(f"svnadmin hotcopy failed: {res.stderr}")
                dump_loaded = True
                try:
                    revisions_loaded = svn_engine.get_latest_revision(created_repo.fs_path)
                except Exception:
                    pass

            # Update latest revision in database
            if revisions_loaded > 0:
                created_repo.latest_revision = revisions_loaded
            try:
                latest_rev = svn_engine.get_latest_revision(created_repo.fs_path)
                if latest_rev > 0:
                    created_repo.latest_revision = latest_rev
            except Exception:
                pass
            db.commit()

            # 6. Locate and parse htpasswd (if present) to pre-seed user credentials
            users_from_htpasswd = {}
            htpasswd_file = ArchiveImportService._find_htpasswd_file(staging_dir)
            if htpasswd_file and import_users:
                users_from_htpasswd = ArchiveImportService._parse_htpasswd(htpasswd_file)

            # 7. Locate and parse VisualSVN authz file
            authz_file = ArchiveImportService._find_authz_file(staging_dir)
            authz_imported = False
            groups_created = 0
            users_created = 0
            rules_created = 0
            details: Dict[str, Any] = {}

            if authz_file and import_acls:
                parsed_groups, parsed_rules = ArchiveImportService._parse_visualsvn_authz(authz_file)

                # A. Import Groups and Users
                g_count, u_count = ArchiveImportService._import_groups_and_users(
                    db,
                    parsed_groups,
                    users_from_htpasswd,
                    import_users,
                    default_password,
                    target_repo_name
                )
                groups_created += g_count
                users_created += u_count

                # B. Import Path Access Rules
                rules_created = ArchiveImportService._import_access_rules(
                    db,
                    created_repo.id,
                    parsed_rules,
                    import_users,
                    default_password
                )
                authz_imported = True

                details["parsed_groups_count"] = len(parsed_groups)
                details["parsed_rules_count"] = len(parsed_rules)

            # If htpasswd had extra users not in authz, ensure they exist too
            if users_from_htpasswd and import_users:
                for u_name, u_hash in users_from_htpasswd.items():
                    u_rec = db.query(User).filter(User.username.ilike(u_name)).first()
                    if not u_rec:
                        u_rec = User(
                            username=u_name,
                            full_name=f"Imported User ({u_name})",
                            email=f"{u_name}@imported.local",
                            is_active=True,
                            is_admin=False,
                            password_hash=SecurityService.hash_password(default_password),
                            htpasswd_hash=u_hash
                        )
                        db.add(u_rec)
                        users_created += 1
                    elif not u_rec.htpasswd_hash:
                        u_rec.htpasswd_hash = u_hash
                db.commit()

            # 8. Locate and import Hooks (if present)
            hooks_imported = 0
            if import_hooks:
                hooks_imported = ArchiveImportService._import_hooks(staging_dir, Path(created_repo.fs_path))

            # 9. Recompile authz and htpasswd so permissions take effect immediately
            AclService.compile_authz(db)
            AclService.compile_htpasswd(db)

            # 10. Audit Log
            import json
            db.add(AuditLog(
                actor=actor,
                client_ip=client_ip,
                action_category="REPO",
                action_name="import_archive",
                target_type="repository",
                target_id=str(created_repo.id),
                details_json=json.dumps({
                    "repository": target_repo_name,
                    "archive": archive_path.name,
                    "revisions_loaded": revisions_loaded,
                    "rules_created": rules_created,
                    "groups_created": groups_created,
                    "users_created": users_created,
                    "hooks_imported": hooks_imported
                })
            ))
            db.commit()

            return ArchiveImportResponse(
                status="success",
                repository_id=created_repo.id,
                repository_name=created_repo.name,
                latest_revision=created_repo.latest_revision,
                dump_loaded=dump_loaded,
                revisions_loaded=revisions_loaded,
                authz_imported=authz_imported,
                groups_created=groups_created,
                users_created=users_created,
                rules_created=rules_created,
                hooks_imported=hooks_imported,
                details=details
            )

        finally:
            shutil.rmtree(staging_dir, ignore_errors=True)

    # --- Discovery Helpers ---

    @staticmethod
    def _determine_repo_name(db: Session, staging_dir: Path, archive_path: Path, requested_name: Optional[str]) -> str:
        """Determines a clean, unique repository name."""
        base_name = requested_name
        if not base_name:
            # Check if there is an authz with explicit repo prefix like [MyRepo:/]
            authz_p = ArchiveImportService._find_authz_file(staging_dir)
            if authz_p:
                try:
                    text = authz_p.read_text(encoding="utf-8", errors="ignore")
                    m = re.search(r'\[([a-zA-Z0-9_\-]+):/', text)
                    if m:
                        base_name = m.group(1)
                except Exception:
                    pass

        if not base_name:
            # Derive from zip archive name (e.g. MyRepo.zip -> MyRepo)
            base_name = archive_path.stem
            if base_name.endswith(('.dump', '.svndump')):
                base_name = Path(base_name).stem

        # Clean name
        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', base_name).strip('_')
        if not clean_name:
            clean_name = "imported_repo"

        # Check uniqueness
        candidate = clean_name
        counter = 1
        while db.query(Repository).filter(Repository.name == candidate).first():
            candidate = f"{clean_name}_{counter}"
            counter += 1

        return candidate

    @staticmethod
    def _find_dump_file(staging_dir: Path) -> Optional[Path]:
        """Finds SVN dump files in the extracted archive, decompressing if necessary."""
        # 1. Look for uncompressed dumps
        for p in staging_dir.rglob("*"):
            if p.is_file() and p.suffix.lower() in [".dump", ".svndump", ".dumpfile"]:
                return p

        # 2. Look for compressed dumps (.dump.gz, .svndump.gz, .dump.bz2)
        for p in staging_dir.rglob("*"):
            if p.is_file():
                low_name = p.name.lower()
                if low_name.endswith((".dump.gz", ".svndump.gz")):
                    decompressed = p.with_name(p.stem)
                    with gzip.open(p, "rb") as f_in, open(decompressed, "wb") as f_out:
                        shutil.copyfileobj(f_in, f_out)
                    return decompressed
                elif low_name.endswith((".dump.bz2", ".svndump.bz2")):
                    decompressed = p.with_name(p.stem)
                    with bz2.open(p, "rb") as f_in, open(decompressed, "wb") as f_out:
                        shutil.copyfileobj(f_in, f_out)
                    return decompressed

        return None

    @staticmethod
    def _find_raw_repo_dir(staging_dir: Path) -> Optional[Path]:
        """Finds raw SVN repository directory (contains 'format' file and 'db' directory)."""
        for p in staging_dir.rglob("format"):
            if p.is_file() and (p.parent / "db").is_dir():
                return p.parent
        return None

    @staticmethod
    def _find_authz_file(staging_dir: Path) -> Optional[Path]:
        """Finds VisualSVN / Subversion authz files."""
        # Common filenames in VisualSVN exports
        target_names = [
            "authz",
            "visualsvn-winauthz",
            "visualsvn-server.authz",
            "security.authz",
            "svnauthz"
        ]
        for name in target_names:
            for p in staging_dir.rglob(name):
                if p.is_file():
                    return p

        # Fallback: any file with .authz extension
        for p in staging_dir.rglob("*.authz"):
            if p.is_file():
                return p

        return None

    @staticmethod
    def _find_htpasswd_file(staging_dir: Path) -> Optional[Path]:
        """Finds htpasswd files in the archive."""
        for p in staging_dir.rglob("*"):
            if p.is_file() and p.name.lower() in ["htpasswd", "visualsvn-server.htpasswd", "htpasswd.txt"]:
                return p
        return None

    # --- Loading & Parsing Helpers ---

    @staticmethod
    def _load_dump(fs_path: str, dump_path: Path) -> int:
        """Loads a dump file into a Subversion repository using svnadmin load."""
        with open(dump_path, "rb") as f_in:
            proc = subprocess.run(
                ["svnadmin", "load", "--ignore-uuid", fs_path],
                stdin=f_in,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            if proc.returncode != 0:
                raise RuntimeError(f"svnadmin load failed: {proc.stderr[:1000]}")

        # Count loaded revisions from stdout or query repo
        revs = 0
        try:
            revs = svn_engine.get_latest_revision(fs_path)
        except Exception:
            for line in proc.stdout.splitlines():
                if "Committed revision" in line:
                    revs += 1
        return revs

    @staticmethod
    def _parse_htpasswd(htpasswd_path: Path) -> Dict[str, str]:
        """Parses username:hash pairs from htpasswd file."""
        users = {}
        try:
            content = htpasswd_path.read_text(encoding="utf-8", errors="ignore")
            for line in content.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if ":" in line:
                    username, hash_val = line.split(":", 1)
                    username = username.strip()
                    # Strip any Windows DOMAIN\ prefix
                    if "\\" in username:
                        username = username.split("\\", 1)[1]
                    users[username.lower()] = hash_val.strip()
        except Exception:
            pass
        return users

    @staticmethod
    def _parse_visualsvn_authz(authz_path: Path) -> Tuple[Dict[str, List[str]], List[Dict[str, Any]]]:
        """
        Parses VisualSVN authz file into:
        - groups: {group_name: [member1, member2, ...]}
        - rules: [{'path': '/trunk', 'principal_type': 'group', 'principal_name': 'devs', 'permission': 'rw'}]
        """
        groups: Dict[str, List[str]] = {}
        rules: List[Dict[str, Any]] = []

        try:
            content = authz_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return groups, rules

        current_section = None
        current_path = None

        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith(";"):
                continue

            # Section Header [section]
            if line.startswith("[") and line.endswith("]"):
                current_section = line[1:-1].strip()
                if current_section.lower() == "groups":
                    current_path = None
                else:
                    # Parse path section (e.g. [/] or [myrepo:/trunk] or [/trunk])
                    p_val = current_section
                    if ":" in p_val:
                        p_val = p_val.split(":", 1)[1]
                    # Ensure leading slash
                    if not p_val.startswith("/"):
                        p_val = "/" + p_val
                    current_path = p_val
                continue

            if "=" in line:
                key, val = [part.strip() for part in line.split("=", 1)]
                val = val.lower()

                # Inside [groups] section
                if current_section and current_section.lower() == "groups":
                    group_name = key.strip("@")
                    members = [m.strip().strip("@") for m in val.split(",") if m.strip()]
                    # Normalize domain prefixes (e.g. DOMAIN\user -> user)
                    clean_members = []
                    for m in members:
                        if "\\" in m:
                            m = m.split("\\", 1)[1]
                        clean_members.append(m)
                    groups[group_name] = clean_members

                # Inside path section
                elif current_path is not None:
                    perm_str = ""
                    if "rw" in val:
                        perm_str = "rw"
                    elif "r" in val:
                        perm_str = "r"
                    else:
                        perm_str = ""  # Deny

                    if key == "*":
                        p_type = PrincipalType.EVERYONE
                        p_name = "*"
                    elif key.startswith("@"):
                        p_type = PrincipalType.GROUP
                        p_name = key[1:].strip()
                    else:
                        p_type = PrincipalType.USER
                        p_name = key
                        if "\\" in p_name:
                            p_name = p_name.split("\\", 1)[1]

                    rules.append({
                        "path": current_path,
                        "principal_type": p_type,
                        "principal_name": p_name,
                        "permission": perm_str
                    })

        return groups, rules

    @staticmethod
    def _import_groups_and_users(
        db: Session,
        parsed_groups: Dict[str, List[str]],
        users_from_htpasswd: Dict[str, str],
        import_users: bool,
        default_password: str,
        repo_name: str
    ) -> Tuple[int, int]:
        """Creates groups, users, and memberships in the database."""
        groups_created = 0
        users_created = 0

        for group_name, members in parsed_groups.items():
            # Check or create group
            grp = db.query(Group).filter(Group.name.ilike(group_name)).first()
            if not grp:
                grp = Group(
                    name=group_name,
                    description=f"Imported from {repo_name} VisualSVN configuration"
                )
                db.add(grp)
                db.flush()
                groups_created += 1

            for member_name in members:
                # Check or create user
                usr = db.query(User).filter(User.username.ilike(member_name)).first()
                if not usr and import_users:
                    ht_hash = users_from_htpasswd.get(member_name.lower())
                    usr = User(
                        username=member_name,
                        full_name=f"Imported User ({member_name})",
                        email=f"{member_name}@imported.local",
                        is_active=True,
                        is_admin=False,
                        password_hash=SecurityService.hash_password(default_password),
                        htpasswd_hash=ht_hash
                    )
                    db.add(usr)
                    db.flush()
                    users_created += 1
                elif usr and not usr.htpasswd_hash and member_name.lower() in users_from_htpasswd:
                    usr.htpasswd_hash = users_from_htpasswd[member_name.lower()]

                if usr:
                    # Check membership
                    existing_mem = db.query(UserGroupMembership).filter(
                        UserGroupMembership.group_id == grp.id,
                        UserGroupMembership.user_id == usr.id
                    ).first()
                    if not existing_mem:
                        db.add(UserGroupMembership(group_id=grp.id, user_id=usr.id))

        db.commit()
        return groups_created, users_created

    @staticmethod
    def _import_access_rules(
        db: Session,
        repository_id: int,
        parsed_rules: List[Dict[str, Any]],
        import_users: bool,
        default_password: str
    ) -> int:
        """Imports path-based access control rules for the repository."""
        rules_created = 0

        for r_data in parsed_rules:
            p_type = r_data["principal_type"]
            p_name = r_data["principal_name"]
            path = r_data["path"]
            perm_val = r_data["permission"]

            # Map permission level
            if perm_val == "rw":
                p_level = PermissionLevel.READ_WRITE
            elif perm_val == "r":
                p_level = PermissionLevel.READ
            else:
                p_level = PermissionLevel.DENY

            # Ensure user exists if rule targets individual user
            if p_type == PrincipalType.USER and import_users:
                u_rec = db.query(User).filter(User.username.ilike(p_name)).first()
                if not u_rec:
                    u_rec = User(
                        username=p_name,
                        full_name=f"Imported User ({p_name})",
                        email=f"{p_name}@imported.local",
                        is_active=True,
                        is_admin=False,
                        password_hash=SecurityService.hash_password(default_password)
                    )
                    db.add(u_rec)
                    db.flush()

            # Check if rule already exists
            existing_rule = db.query(AccessRule).filter(
                AccessRule.repository_id == repository_id,
                AccessRule.path == path,
                AccessRule.principal_type == p_type,
                AccessRule.principal_name == p_name
            ).first()

            if not existing_rule:
                rule = AccessRule(
                    repository_id=repository_id,
                    path=path,
                    principal_type=p_type,
                    principal_name=p_name,
                    permission=p_level,
                    rule_order=0
                )
                db.add(rule)
                rules_created += 1

        db.commit()
        return rules_created

    @staticmethod
    def _import_hooks(staging_dir: Path, repo_fs_path: Path) -> int:
        """Copies hook scripts from archive into repository hooks directory and makes executable."""
        hooks_dir = repo_fs_path / "hooks"
        hooks_dir.mkdir(parents=True, exist_ok=True)
        count = 0

        # Look for hooks directory in staging
        staging_hooks = None
        for p in staging_dir.rglob("hooks"):
            if p.is_dir():
                staging_hooks = p
                break

        if not staging_hooks:
            return 0

        for f in staging_hooks.iterdir():
            if f.is_file() and not f.name.endswith(".tmpl"):
                dest = hooks_dir / f.name
                shutil.copy2(f, dest)
                try:
                    os.chmod(dest, 0o755)
                except Exception:
                    pass
                count += 1

        return count
