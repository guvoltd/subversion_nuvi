"""
Subversion Nuvi - Access Control (ACL) Engine & Authz Compiler
Implements hierarchical path-based authorization, effective permissions calculator (nuvi-acl-eval),
implicit folder listing evaluator, and transactional Subversion authz compiler.
"""

import os
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.api.config import config
from backend.api.models.schema import (
    AccessRule,
    Repository,
    User,
    Group,
    PrincipalType,
    PermissionLevel,
    RepositorySupervisor,
    AuditLog
)
from backend.api.models.dto import (
    AccessRuleCreateRequest,
    AccessRuleResponse,
    EffectivePermissionResponse,
    DecisionTraceItem,
    SupervisorAssignRequest,
    SupervisorResponse
)
from backend.api.services.security_service import SecurityService
from backend.api.services.svn_native import svn_engine

class AclService:
    # --- Rule CRUD ---

    @staticmethod
    def create_rule(db: Session, req: AccessRuleCreateRequest, actor: str = "admin", client_ip: str = "127.0.0.1") -> AccessRuleResponse:
        # Validate repository if specified
        repo_name = None
        if req.repository_id is not None:
            repo = db.query(Repository).filter(Repository.id == req.repository_id).first()
            if not repo:
                raise ValueError(f"Repository ID {req.repository_id} not found.")
            repo_name = repo.name

        # Validate principal
        ptype = req.principal_type.lower()
        if ptype not in [PrincipalType.USER.value, PrincipalType.GROUP.value, PrincipalType.EVERYONE.value]:
            raise ValueError(f"Invalid principal_type '{req.principal_type}'. Must be 'user', 'group', or 'everyone'.")

        perm = req.permission.lower()
        if perm not in ["rw", "r", ""]:
            raise ValueError("Invalid permission. Must be 'rw', 'r', or '' (Deny).")

        normalized_path = "/" + req.path.strip("/ ") if req.path.strip("/ ") else "/"

        rule = AccessRule(
            repository_id=req.repository_id,
            path=normalized_path,
            principal_type=PrincipalType(ptype),
            principal_name="*" if ptype == PrincipalType.EVERYONE.value else req.principal_name,
            permission=PermissionLevel(perm),
            rule_order=req.rule_order
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)

        # Automatically re-compile authz file
        AclService.compile_authz(db)

        # Audit log
        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="acl",
            action_name="rule_create",
            target_type="access_rule",
            target_id=str(rule.id),
            details_json=f'{{"repo": "{repo_name}", "path": "{normalized_path}", "principal": "{rule.principal_name}", "perm": "{perm}"}}'
        ))
        db.commit()

        return AclService._rule_to_dto(rule, repo_name)

    @staticmethod
    def list_rules(db: Session, repository_id: Optional[int] = None) -> List[AccessRuleResponse]:
        query = db.query(AccessRule)
        if repository_id is not None:
            # Get repository specific rules and server-wide rules
            query = query.filter((AccessRule.repository_id == repository_id) | AccessRule.repository_id.is_(None))
        rules = query.order_by(AccessRule.repository_id.desc(), AccessRule.path, AccessRule.rule_order).all()

        repos = {r.id: r.name for r in db.query(Repository).all()}
        return [AclService._rule_to_dto(r, repos.get(r.repository_id)) for r in rules]

    @staticmethod
    def delete_rule(db: Session, rule_id: int, actor: str = "admin", client_ip: str = "127.0.0.1") -> None:
        rule = db.query(AccessRule).filter(AccessRule.id == rule_id).first()
        if not rule:
            raise ValueError(f"Access rule ID {rule_id} not found.")

        db.delete(rule)
        db.commit()

        # Re-compile authz file
        AclService.compile_authz(db)

        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="acl",
            action_name="rule_delete",
            target_type="access_rule",
            target_id=str(rule_id)
        ))
        db.commit()

    # --- Transactional Authz Compiler ---

    @staticmethod
    def compile_authz(db: Session, target_path: Optional[Path] = None) -> str:
        """
        Compiles the entire SQLite ACL database into a standard Apache Subversion authz file.
        Automatically provisions:
        1. Explicit path access rules.
        2. System administrator root permissions ([/] admin = rw).
        3. Automatic path traversal: Grants implicit read permission on ancestor directories
           so users can check out granted subdirectories from the repository root URL.
        4. Automatic sibling exclusion: Excludes (denies) unauthorized sibling folders so
           only the authorized directory hierarchy is populated during checkout, without
           requiring manual deny rules.
        Uses atomic file replacement to ensure zero downtime.
        """
        dest_path = target_path or config.AUTHZ_FILE
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        lines: List[str] = [
            "# ==============================================================================",
            "# Subversion Nuvi - Compiled Authorization File (authz)",
            f"# Generated automatically at: {datetime.now(timezone.utc).isoformat()}",
            "# DO NOT EDIT MANUALLY - Changes will be overwritten by Subversion Nuvi",
            "# ==============================================================================",
            "",
            "[groups]"
        ]

        # 1. Output Groups section
        groups = db.query(Group).all()
        for g in groups:
            members = [m.user.username for m in g.members if m.user and m.user.is_active]
            if members:
                lines.append(f"{g.name} = {', '.join(sorted(members))}")
            else:
                lines.append(f"{g.name} = ")

        lines.append("")

        # 2. Collect explicit rules
        # Map: section_header -> {principal_str: perm_str}
        sections: Dict[str, Dict[str, str]] = defaultdict(dict)

        # Server administrators always have root RW access
        admins = db.query(User).filter(User.is_admin == True, User.is_active == True).all()
        for admin in admins:
            sections["[/]"][admin.username] = "rw"

        repos = {r.id: r for r in db.query(Repository).all()}
        all_rules = db.query(AccessRule).order_by(AccessRule.path, AccessRule.rule_order).all()

        # Track explicit grants per repository:
        # repo_id -> { (principal_type, p_key): set of granted paths with r or rw }
        repo_principal_grants: Dict[int, Dict[Tuple[PrincipalType, str], Set[str]]] = defaultdict(lambda: defaultdict(set))

        for r in all_rules:
            repo_obj = repos.get(r.repository_id) if r.repository_id else None
            repo_name = repo_obj.name if repo_obj else None
            path = "/" + r.path.strip("/") if r.path.strip("/") else "/"
            section_header = f"[{repo_name}:{path}]" if repo_name else f"[{path}]"

            if r.principal_type == PrincipalType.EVERYONE:
                p_key = "*"
            elif r.principal_type == PrincipalType.GROUP:
                p_key = f"@{r.principal_name}"
            else:
                p_key = r.principal_name

            perm_val = r.permission.value
            sections[section_header][p_key] = perm_val

            if r.repository_id and perm_val in ("r", "rw"):
                repo_principal_grants[r.repository_id][(r.principal_type, p_key)].add(path)

        # 3. Automatic Path Traversal & Sparse Sibling Exclusion for subpath-only grants
        for repo_id, principal_grants in repo_principal_grants.items():
            repo_obj = repos.get(repo_id)
            if not repo_obj:
                continue

            for (p_type, p_key), granted_paths in principal_grants.items():
                # If root "/" is already granted, the principal has full traversal and inheritance
                if "/" in granted_paths:
                    continue

                # Collect all ancestor paths that must be traversed to reach the granted paths
                ancestor_paths: Set[str] = set()
                for gp in granted_paths:
                    segments = [s for s in gp.split("/") if s]
                    curr = ""
                    for s in segments[:-1]:  # all strictly ancestor directories
                        curr += "/" + s
                        ancestor_paths.add(curr)
                    ancestor_paths.add("/")

                # For each ancestor directory:
                # 1) Grant implicit read ('r') so the Subversion client can traverse into it
                for anc in ancestor_paths:
                    header = f"[{repo_obj.name}:{anc}]"
                    if p_key not in sections[header]:
                        sections[header][p_key] = "r"

                # 2) Discover all sibling directories of each ancestor level in the repository
                # and exclude (deny) any child path that is NOT on the path to an authorized directory
                for anc in sorted(ancestor_paths, key=lambda x: (len(x), x)):
                    # Get children of this ancestor from SVN repository
                    child_dir_names: Set[str] = set()
                    try:
                        res = svn_engine.list_directory(repo_obj.fs_path, anc)
                        for entry in res.get("entries", []):
                            if entry.get("is_dir"):
                                child_dir_names.add(entry["name"])
                    except Exception:
                        pass

                    # Also include any known directory names from other rules or standard layout
                    for gp in granted_paths:
                        if gp.startswith(anc if anc != "/" else ""):
                            rel = gp[len(anc):].strip("/")
                            if "/" in rel:
                                child_dir_names.add(rel.split("/")[0])
                    if anc == "/":
                        child_dir_names.update(["trunk", "branches", "tags"])

                    for cname in child_dir_names:
                        cpath = f"{anc.rstrip('/')}/{cname}"
                        # Check if cpath is an ancestor of ANY granted path, or is itself a granted path
                        is_allowed_branch = False
                        for gp in granted_paths:
                            if gp == cpath or gp.startswith(cpath + "/"):
                                is_allowed_branch = True
                                break

                        if not is_allowed_branch:
                            # This sibling folder leads only to unauthorized paths.
                            # Exclude (deny) it for this principal so checkout skips it!
                            cheader = f"[{repo_obj.name}:{cpath}]"
                            if p_key not in sections[cheader]:
                                sections[cheader][p_key] = ""

        # 4. Serialize all sections in consistent sorted order
        # Ensure [/] comes first, then repo roots, then alphabetical subpaths
        def section_sort_key(sec: str):
            if sec == "[/]":
                return (0, "", "")
            if ":/]" in sec:
                return (1, sec, "")
            return (2, sec.count("/"), sec)

        for header in sorted(sections.keys(), key=section_sort_key):
            rule_dict = sections[header]
            if not rule_dict:
                continue
            lines.append(header)
            for p_key, perm_val in sorted(rule_dict.items()):
                lines.append(f"{p_key} = {perm_val}")
            lines.append("")

        content = "\n".join(lines) + "\n"

        # Atomic write via tempfile
        tmp_fd, tmp_path = tempfile.mkstemp(dir=dest_path.parent, prefix="authz_tmp_")
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, dest_path)
        try:
            os.chmod(dest_path, 0o644)
        except Exception:
            pass

        # Also write htpasswd for Apache Basic Auth if needed
        AclService.compile_htpasswd(db)

        return content

    @staticmethod
    def compile_htpasswd(db: Session, target_path: Optional[Path] = None) -> None:
        """Exports active users to htpasswd format."""
        dest_path = target_path or config.HTPASSWD_FILE
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        users = db.query(User).filter(User.is_active == True).all()
        lines = []
        for u in users:
            # Apache mod_authn supports standard crypt, md5, sha1, bcrypt, argon2 depending on modules
            # We output user:hash directly (using Apache-compatible htpasswd_hash if present)
            hash_to_write = u.htpasswd_hash if getattr(u, 'htpasswd_hash', None) else u.password_hash
            lines.append(f"{u.username}:{hash_to_write}")

        content = "\n".join(lines) + "\n"
        tmp_fd, tmp_path = tempfile.mkstemp(dir=dest_path.parent, prefix="htpasswd_tmp_")
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, dest_path)
        try:
            os.chmod(dest_path, 0o644)
        except Exception:
            pass

    # --- Effective Permissions Calculator (nuvi-acl-eval) ---

    @staticmethod
    def evaluate_effective_permission(
        db: Session,
        username: str,
        repository_id: int,
        target_path: str = "/"
    ) -> EffectivePermissionResponse:
        """
        Calculates exact effective permission ('rw', 'r', or '') for a user on a given path.
        Returns the final permission and a full step-by-step decision tree trace.
        """
        repo = db.query(Repository).filter(Repository.id == repository_id).first()
        if not repo:
            raise ValueError(f"Repository ID {repository_id} not found.")

        # Check if user is admin
        user = db.query(User).filter(func.lower(User.username) == username.lower()).first()
        user_groups = SecurityService.get_user_group_names(db, username)

        trace: List[DecisionTraceItem] = []
        effective_perm = ""  # Default deny if no rules match

        # Build list of ancestor paths from root down to target_path
        normalized_path = "/" + target_path.strip("/") if target_path.strip("/") else "/"
        path_segments = [p for p in normalized_path.split("/") if p]
        
        path_hierarchy = ["/"]
        curr = ""
        for seg in path_segments:
            curr += "/" + seg
            if curr not in path_hierarchy:
                path_hierarchy.append(curr)

        # Collect all relevant rules ordered by hierarchy depth (root first, then deeper paths)
        # Fetch both server-wide (repo_id=None) and repo-specific rules
        rules = db.query(AccessRule).filter(
            (AccessRule.repository_id == repository_id) | AccessRule.repository_id.is_(None)
        ).all()

        # Organize rules by (scope, path)
        rules_by_scope_path: Dict[Tuple[str, str], List[AccessRule]] = defaultdict(list)
        for r in rules:
            scope = "repository" if r.repository_id else "server_wide"
            rpath = "/" + r.path.strip("/") if r.path.strip("/") else "/"
            rules_by_scope_path[(scope, rpath)].append(r)

        # Evaluation steps:
        # Traverse path hierarchy from root to target
        for p in path_hierarchy:
            # Evaluate server-wide rules for path 'p'
            sw_rules = rules_by_scope_path.get(("server_wide", p), [])
            perm_for_p = AclService._eval_rules_at_level(sw_rules, username, user_groups, trace, "server_wide", p)
            if perm_for_p is not None:
                effective_perm = perm_for_p

            # Evaluate repo-specific rules for path 'p' (which override server-wide)
            repo_rules = rules_by_scope_path.get(("repository", p), [])
            perm_for_repo_p = AclService._eval_rules_at_level(repo_rules, username, user_groups, trace, "repository", p)
            if perm_for_repo_p is not None:
                effective_perm = perm_for_repo_p

        # If user is a superadmin, they have implicit 'rw' unless explicitly denied
        if user and user.is_admin and effective_perm == "":
            effective_perm = "rw"
            trace.append(DecisionTraceItem(
                scope="system",
                path=normalized_path,
                principal=username,
                permission="rw",
                effect="grant",
                reason=f"User '{username}' is a system administrator; granted full read/write access."
            ))

        # Check for implicit traversal read if user has access to descendant paths
        if effective_perm == "" and not (user and user.is_admin):
            descendant_rules = db.query(AccessRule).filter(
                (AccessRule.repository_id == repository_id) | AccessRule.repository_id.is_(None)
            ).all()
            has_descendant_access = False
            descendant_path_matched = None
            for dr in descendant_rules:
                dr_path = "/" + dr.path.strip("/") if dr.path.strip("/") else "/"
                is_descendant = (normalized_path == "/" and dr_path != "/") or (dr_path.startswith(normalized_path.rstrip("/") + "/"))
                if is_descendant:
                    is_match = False
                    if dr.principal_type == PrincipalType.USER and dr.principal_name.lower() == username.lower():
                        is_match = True
                    elif dr.principal_type == PrincipalType.GROUP and dr.principal_name in user_groups:
                        is_match = True
                    elif dr.principal_type == PrincipalType.EVERYONE or dr.principal_name == "*":
                        is_match = True

                    if is_match and dr.permission.value in ("r", "rw"):
                        has_descendant_access = True
                        descendant_path_matched = dr_path
                        break

            if has_descendant_access:
                effective_perm = "r"
                trace.append(DecisionTraceItem(
                    scope="implicit_traversal",
                    path=normalized_path,
                    principal=username,
                    permission="r",
                    effect="grant",
                    reason=f"Implicit directory traversal granted to allow access to descendant path '{descendant_path_matched}'."
                ))

        return EffectivePermissionResponse(
            username=username,
            repository_name=repo.name,
            path=normalized_path,
            effective_permission=effective_perm,
            can_read=effective_perm in ["r", "rw"],
            can_write=effective_perm == "rw",
            decision_trace=trace
        )

    @staticmethod
    def evaluate_permission(
        db: Session,
        username: str,
        repository_id: int,
        path: str = "/"
    ) -> EffectivePermissionResponse:
        """Alias for evaluate_effective_permission with path argument."""
        return AclService.evaluate_effective_permission(db, username=username, repository_id=repository_id, target_path=path)

    @staticmethod
    def user_has_repo_access(db: Session, user: User, repository_id: int) -> bool:
        """
        Determines whether the given user has access rights to the specified repository.
        Administrators and delegated supervisors always have access.
        Standard users have access if root '/' or any descendant path evaluates to readable.
        """
        if user.is_admin:
            return True

        # Check if user is delegated supervisor
        is_sup = db.query(RepositorySupervisor).filter(
            RepositorySupervisor.repository_id == repository_id,
            RepositorySupervisor.user_id == user.id
        ).first()
        if is_sup:
            return True

        try:
            res = AclService.evaluate_permission(db, user.username, repository_id, "/")
            return res.can_read
        except Exception:
            return False

    @staticmethod
    def get_accessible_repositories(db: Session, user: User) -> List[Repository]:
        """
        Returns the list of repositories that the user is permitted to access.
        """
        all_repos = db.query(Repository).order_by(Repository.name.asc()).all()
        if user.is_admin:
            return all_repos
        return [r for r in all_repos if AclService.user_has_repo_access(db, user, r.id)]

    @staticmethod
    def _eval_rules_at_level(
        rules: List[AccessRule],
        username: str,
        user_groups: Set[str],
        trace: List[DecisionTraceItem],
        scope: str,
        path: str
    ) -> Optional[str]:
        if not rules:
            return None

        # 1. Direct user rule (highest priority)
        user_rule = next((r for r in rules if r.principal_type == PrincipalType.USER and r.principal_name.lower() == username.lower()), None)
        if user_rule:
            perm = user_rule.permission.value
            effect = "grant" if perm else "deny"
            trace.append(DecisionTraceItem(
                rule_id=user_rule.id,
                scope=scope,
                path=path,
                principal=user_rule.principal_name,
                permission=perm,
                effect=effect,
                reason=f"Direct user rule matched on {scope} path '{path}' ({effect} '{perm}')."
            ))
            return perm

        # 2. Group rules
        group_rules = [r for r in rules if r.principal_type == PrincipalType.GROUP and r.principal_name in user_groups]
        if group_rules:
            # Combine group permissions: rw > r > ""
            perms = [r.permission.value for r in group_rules]
            combined = "rw" if "rw" in perms else ("r" if "r" in perms else "")
            effect = "grant" if combined else "deny"
            matched_groups = [r.principal_name for r in group_rules]
            trace.append(DecisionTraceItem(
                rule_id=group_rules[0].id,
                scope=scope,
                path=path,
                principal=f"@{', @'.join(matched_groups)}",
                permission=combined,
                effect=effect,
                reason=f"Membership in groups {matched_groups} evaluated on {scope} path '{path}'."
            ))
            return combined

        # 3. Everyone rule ('*')
        everyone_rule = next((r for r in rules if r.principal_type == PrincipalType.EVERYONE or r.principal_name == "*"), None)
        if everyone_rule:
            perm = everyone_rule.permission.value
            effect = "grant" if perm else "deny"
            trace.append(DecisionTraceItem(
                rule_id=everyone_rule.id,
                scope=scope,
                path=path,
                principal="*",
                permission=perm,
                effect=effect,
                reason=f"Wildcard '*' rule applied on {scope} path '{path}'."
            ))
            return perm

        return None

    # --- Implicit List Folder Permission ---

    @staticmethod
    def get_implicit_readable_paths(db: Session, username: str, repository_id: int) -> Set[str]:
        """
        Discovers all paths that the user can implicitly browse through to reach
        explicitly readable descendant directories.
        """
        # Get all distinct paths with rules in this repo
        repo_rules = db.query(AccessRule.path).filter(
            (AccessRule.repository_id == repository_id) | AccessRule.repository_id.is_(None)
        ).distinct().all()

        accessible_parents: Set[str] = set()
        for (p,) in repo_rules:
            eval_res = AclService.evaluate_effective_permission(db, username, repository_id, p)
            if eval_res.can_read:
                # Add all ancestors
                parts = [seg for seg in p.split("/") if seg]
                curr = ""
                for part in parts:
                    curr += "/" + part
                    accessible_parents.add(curr)
                accessible_parents.add("/")

        return accessible_parents

    # --- Repository Supervisor Management ---

    @staticmethod
    def assign_supervisor(db: Session, repo_id: int, req: SupervisorAssignRequest) -> SupervisorResponse:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise ValueError(f"Repository ID {repo_id} not found.")

        user = db.query(User).filter(User.id == req.user_id).first()
        if not user:
            raise ValueError(f"User ID {req.user_id} not found.")

        supervisor = db.query(RepositorySupervisor).filter(
            RepositorySupervisor.repository_id == repo_id,
            RepositorySupervisor.user_id == req.user_id
        ).first()

        if not supervisor:
            supervisor = RepositorySupervisor(
                repository_id=repo_id,
                user_id=req.user_id,
                can_manage_acls=req.can_manage_acls,
                can_manage_locks=req.can_manage_locks,
                can_trigger_backups=req.can_trigger_backups
            )
            db.add(supervisor)
        else:
            supervisor.can_manage_acls = req.can_manage_acls
            supervisor.can_manage_locks = req.can_manage_locks
            supervisor.can_trigger_backups = req.can_trigger_backups

        db.commit()
        db.refresh(supervisor)

        return SupervisorResponse(
            id=supervisor.id,
            repository_id=supervisor.repository_id,
            user_id=supervisor.user_id,
            username=user.username,
            can_manage_acls=supervisor.can_manage_acls,
            can_manage_locks=supervisor.can_manage_locks,
            can_trigger_backups=supervisor.can_trigger_backups,
            created_at=supervisor.created_at
        )

    @staticmethod
    def list_supervisors(db: Session, repo_id: int) -> List[SupervisorResponse]:
        supervisors = db.query(RepositorySupervisor).filter(RepositorySupervisor.repository_id == repo_id).all()
        res = []
        for s in supervisors:
            res.append(SupervisorResponse(
                id=s.id,
                repository_id=s.repository_id,
                user_id=s.user_id,
                username=s.user.username if s.user else "unknown",
                can_manage_acls=s.can_manage_acls,
                can_manage_locks=s.can_manage_locks,
                can_trigger_backups=s.can_trigger_backups,
                created_at=s.created_at
            ))
        return res

    @staticmethod
    def remove_supervisor(db: Session, repo_id: int, user_id: int) -> None:
        supervisor = db.query(RepositorySupervisor).filter(
            RepositorySupervisor.repository_id == repo_id,
            RepositorySupervisor.user_id == user_id
        ).first()
        if supervisor:
            db.delete(supervisor)
            db.commit()

    # --- Helpers ---

    @staticmethod
    def _rule_to_dto(rule: AccessRule, repo_name: Optional[str] = None) -> AccessRuleResponse:
        return AccessRuleResponse(
            id=rule.id,
            repository_id=rule.repository_id,
            repository_name=repo_name,
            path=rule.path,
            principal_type=rule.principal_type.value,
            principal_name=rule.principal_name,
            permission=rule.permission.value,
            rule_order=rule.rule_order,
            created_at=rule.created_at
        )
