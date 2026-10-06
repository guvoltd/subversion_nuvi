"""
Subversion Nuvi - Security & Identity Service
Handles Argon2id password hashing, password policy enforcement, user and group management.
"""

import re
import hashlib
import base64
from datetime import datetime, timezone
from typing import List, Optional, Set
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHash
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.api.config import config
from backend.api.models.schema import User, Group, UserGroupMembership, AuditLog
from backend.api.models.dto import (
    UserCreateRequest,
    UserUpdateRequest,
    UserResponse,
    GroupCreateRequest,
    GroupUpdateRequest,
    GroupResponse
)

def generate_apache_sha(password: str) -> str:
    return "{SHA}" + base64.b64encode(hashlib.sha1(password.encode("utf-8")).digest()).decode("ascii")

# Argon2id password hasher with tuned memory and iterations
ph = PasswordHasher(
    time_cost=config.ARGON2_TIME_COST,
    memory_cost=config.ARGON2_MEMORY_COST,
    parallelism=config.ARGON2_PARALLELISM
)

class SecurityPolicyError(ValueError):
    pass

class SecurityService:
    @staticmethod
    def validate_password_complexity(password: str) -> None:
        """Enforces strong password policy."""
        if len(password) < config.PASSWORD_MIN_LENGTH:
            raise SecurityPolicyError(f"Password must be at least {config.PASSWORD_MIN_LENGTH} characters long.")
        if config.PASSWORD_REQUIRE_UPPERCASE and not re.search(r"[A-Z]", password):
            raise SecurityPolicyError("Password must contain at least one uppercase letter.")
        if config.PASSWORD_REQUIRE_LOWERCASE and not re.search(r"[a-z]", password):
            raise SecurityPolicyError("Password must contain at least one lowercase letter.")
        if config.PASSWORD_REQUIRE_DIGITS and not re.search(r"\d", password):
            raise SecurityPolicyError("Password must contain at least one numeric digit.")
        if config.PASSWORD_REQUIRE_SPECIAL and not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_+=]", password):
            raise SecurityPolicyError("Password must contain at least one special character.")

    @staticmethod
    def hash_password(password: str) -> str:
        SecurityService.validate_password_complexity(password)
        return ph.hash(password)

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        try:
            return ph.verify(hashed_password, plain_password)
        except (VerifyMismatchError, InvalidHash):
            return False

    # --- User Management ---

    @staticmethod
    def create_user(db: Session, req: UserCreateRequest, actor: str = "system", client_ip: str = "127.0.0.1") -> UserResponse:
        existing = db.query(User).filter(func.lower(User.username) == req.username.lower()).first()
        if existing:
            raise ValueError(f"User with username '{req.username}' already exists.")

        pwd_hash = SecurityService.hash_password(req.password)
        apache_hash = generate_apache_sha(req.password)
        user = User(
            username=req.username,
            password_hash=pwd_hash,
            htpasswd_hash=apache_hash,
            email=req.email,
            full_name=req.full_name,
            is_active=True,
            is_admin=req.is_admin,
            password_updated_at=datetime.now(timezone.utc)
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Audit log
        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="security",
            action_name="user_create",
            target_type="user",
            target_id=user.username,
            details_json=f'{{"is_admin": {str(user.is_admin).lower()}}}'
        ))
        db.commit()

        try:
            from backend.api.services.acl_service import AclService
            AclService.compile_htpasswd(db)
        except Exception:
            pass

        return SecurityService._user_to_dto(user)

    @staticmethod
    def get_user(db: Session, user_id: int) -> UserResponse:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User ID {user_id} not found.")
        return SecurityService._user_to_dto(user)

    @staticmethod
    def get_user_by_username(db: Session, username: str) -> Optional[User]:
        return db.query(User).filter(func.lower(User.username) == username.lower()).first()

    @staticmethod
    def list_users(db: Session) -> List[UserResponse]:
        users = db.query(User).order_by(User.username).all()
        return [SecurityService._user_to_dto(u) for u in users]

    @staticmethod
    def update_user(db: Session, user_id: int, req: UserUpdateRequest, actor: str = "system", client_ip: str = "127.0.0.1") -> UserResponse:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User ID {user_id} not found.")

        if req.email is not None:
            user.email = req.email
        if req.full_name is not None:
            user.full_name = req.full_name
        if req.is_admin is not None:
            user.is_admin = req.is_admin

        db.commit()
        db.refresh(user)

        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="security",
            action_name="user_update",
            target_type="user",
            target_id=user.username
        ))
        db.commit()

        return SecurityService._user_to_dto(user)

    @staticmethod
    def change_password(db: Session, user_id: int, new_password: str, actor: str = "system", client_ip: str = "127.0.0.1") -> None:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User ID {user_id} not found.")

        user.password_hash = SecurityService.hash_password(new_password)
        user.htpasswd_hash = generate_apache_sha(new_password)
        user.password_updated_at = datetime.now(timezone.utc)
        db.commit()

        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="security",
            action_name="password_change",
            target_type="user",
            target_id=user.username
        ))
        db.commit()

        try:
            from backend.api.services.acl_service import AclService
            AclService.compile_htpasswd(db)
        except Exception:
            pass

    @staticmethod
    def set_user_status(db: Session, user_id: int, is_active: bool, actor: str = "system", client_ip: str = "127.0.0.1") -> UserResponse:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User ID {user_id} not found.")

        user.is_active = is_active
        db.commit()
        db.refresh(user)

        action = "user_enable" if is_active else "user_disable"
        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="security",
            action_name=action,
            target_type="user",
            target_id=user.username
        ))
        db.commit()

        try:
            from backend.api.services.acl_service import AclService
            AclService.compile_htpasswd(db)
        except Exception:
            pass

        return SecurityService._user_to_dto(user)

    @staticmethod
    def delete_user(db: Session, user_id: int, actor: str = "system", client_ip: str = "127.0.0.1") -> None:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User ID {user_id} not found.")

        username = user.username
        db.delete(user)
        db.commit()

        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="security",
            action_name="user_delete",
            target_type="user",
            target_id=username
        ))
        db.commit()

        try:
            from backend.api.services.acl_service import AclService
            AclService.compile_htpasswd(db)
        except Exception:
            pass

    # --- Group Management ---

    @staticmethod
    def create_group(db: Session, req: GroupCreateRequest, actor: str = "system", client_ip: str = "127.0.0.1") -> GroupResponse:
        existing = db.query(Group).filter(func.lower(Group.name) == req.name.lower()).first()
        if existing:
            raise ValueError(f"Group '{req.name}' already exists.")

        group = Group(
            name=req.name,
            description=req.description
        )
        db.add(group)
        db.commit()
        db.refresh(group)

        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="security",
            action_name="group_create",
            target_type="group",
            target_id=group.name
        ))
        db.commit()

        return SecurityService._group_to_dto(group)

    @staticmethod
    def get_group(db: Session, group_id: int) -> GroupResponse:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise ValueError(f"Group ID {group_id} not found.")
        return SecurityService._group_to_dto(group)

    @staticmethod
    def list_groups(db: Session) -> List[GroupResponse]:
        groups = db.query(Group).order_by(Group.name).all()
        return [SecurityService._group_to_dto(g) for g in groups]

    @staticmethod
    def update_group(db: Session, group_id: int, req: GroupUpdateRequest, actor: str = "system", client_ip: str = "127.0.0.1") -> GroupResponse:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise ValueError(f"Group ID {group_id} not found.")

        if req.description is not None:
            group.description = req.description

        db.commit()
        db.refresh(group)
        return SecurityService._group_to_dto(group)

    @staticmethod
    def delete_group(db: Session, group_id: int, actor: str = "system", client_ip: str = "127.0.0.1") -> None:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise ValueError(f"Group ID {group_id} not found.")

        group_name = group.name
        db.delete(group)
        db.commit()

        db.add(AuditLog(
            actor=actor,
            client_ip=client_ip,
            action_category="security",
            action_name="group_delete",
            target_type="group",
            target_id=group_name
        ))
        db.commit()

    @staticmethod
    def add_group_member(db: Session, group_id: int, username: str, actor: str = "system", client_ip: str = "127.0.0.1") -> GroupResponse:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise ValueError(f"Group ID {group_id} not found.")

        user = db.query(User).filter(func.lower(User.username) == username.lower()).first()
        if not user:
            raise ValueError(f"User '{username}' not found.")

        existing = db.query(UserGroupMembership).filter(
            UserGroupMembership.group_id == group.id,
            UserGroupMembership.user_id == user.id
        ).first()

        if not existing:
            membership = UserGroupMembership(group_id=group.id, user_id=user.id)
            db.add(membership)
            db.commit()
            db.refresh(group)

            db.add(AuditLog(
                actor=actor,
                client_ip=client_ip,
                action_category="security",
                action_name="group_member_add",
                target_type="group",
                target_id=group.name,
                details_json=f'{{"member": "{user.username}"}}'
            ))
            db.commit()

        return SecurityService._group_to_dto(group)

    @staticmethod
    def remove_group_member(db: Session, group_id: int, username: str, actor: str = "system", client_ip: str = "127.0.0.1") -> GroupResponse:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise ValueError(f"Group ID {group_id} not found.")

        user = db.query(User).filter(func.lower(User.username) == username.lower()).first()
        if not user:
            raise ValueError(f"User '{username}' not found.")

        membership = db.query(UserGroupMembership).filter(
            UserGroupMembership.group_id == group.id,
            UserGroupMembership.user_id == user.id
        ).first()

        if membership:
            db.delete(membership)
            db.commit()
            db.refresh(group)

            db.add(AuditLog(
                actor=actor,
                client_ip=client_ip,
                action_category="security",
                action_name="group_member_remove",
                target_type="group",
                target_id=group.name,
                details_json=f'{{"member": "{user.username}"}}'
            ))
            db.commit()

        return SecurityService._group_to_dto(group)

    @staticmethod
    def get_user_group_names(db: Session, username: str) -> Set[str]:
        """Resolves all groups a user belongs to."""
        user = db.query(User).filter(func.lower(User.username) == username.lower()).first()
        if not user:
            return set()
        return {m.group.name for m in user.group_memberships if m.group}

    # --- Helpers ---

    @staticmethod
    def _user_to_dto(user: User) -> UserResponse:
        groups = [m.group.name for m in user.group_memberships if m.group]
        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
            password_updated_at=user.password_updated_at,
            groups=groups
        )

    @staticmethod
    def _group_to_dto(group: Group) -> GroupResponse:
        members = [m.user.username for m in group.members if m.user]
        return GroupResponse(
            id=group.id,
            name=group.name,
            description=group.description,
            created_at=group.created_at,
            member_count=len(members),
            members=members
        )
