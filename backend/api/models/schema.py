"""
Subversion Nuvi - Database Models & Schema Definitions
"""
from datetime import datetime, timezone
import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Enum,
    UniqueConstraint,
    Index
)
from sqlalchemy.orm import relationship
from backend.api.db import Base

class PermissionLevel(str, enum.Enum):
    READ = "r"
    READ_WRITE = "rw"
    DENY = ""

class PrincipalType(str, enum.Enum):
    USER = "user"
    GROUP = "group"
    EVERYONE = "everyone"

class JobType(str, enum.Enum):
    BACKUP_FULL = "backup_full"
    BACKUP_INCREMENTAL = "backup_incremental"
    VERIFY_INTEGRITY = "verify_integrity"
    VERIFY_BACKUP = "verify_backup"
    PACK_REVISIONS = "pack_revisions"

class JobStatus(str, enum.Enum):
    IDLE = "idle"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"

class ServerConfiguration(Base):
    __tablename__ = "server_configurations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(128), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Repository(Base):
    __tablename__ = "repositories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    fs_path = Column(String(512), unique=True, nullable=False)
    uuid = Column(String(64), nullable=True)
    fs_type = Column(String(32), default="fsfs", nullable=False)
    format_version = Column(Integer, default=9, nullable=False)
    latest_revision = Column(Integer, default=0, nullable=False)
    is_locked = Column(Boolean, default=False, nullable=False)
    rep_sharing_enabled = Column(Boolean, default=True, nullable=False)
    compression = Column(String(32), default="lz4", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    access_rules = relationship("AccessRule", back_populates="repository", cascade="all, delete-orphan")
    jobs = relationship("BackgroundJob", back_populates="repository", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    htpasswd_hash = Column(String(128), nullable=True)
    email = Column(String(128), nullable=True)
    full_name = Column(String(128), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    password_updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group_memberships = relationship("UserGroupMembership", back_populates="user", cascade="all, delete-orphan")
    personal_access_tokens = relationship("PersonalAccessToken", back_populates="user", cascade="all, delete-orphan")

class PersonalAccessToken(Base):
    __tablename__ = "personal_access_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    token_prefix = Column(String(32), nullable=False)
    token_hash = Column(String(64), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="personal_access_tokens")

class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    members = relationship("UserGroupMembership", back_populates="group", cascade="all, delete-orphan")

class UserGroupMembership(Base):
    __tablename__ = "user_group_memberships"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="group_memberships")
    group = relationship("Group", back_populates="members")

    __table_args__ = (
        UniqueConstraint("user_id", "group_id", name="uq_user_group"),
    )

class AccessRule(Base):
    __tablename__ = "access_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True, index=True)
    path = Column(String(512), default="/", nullable=False)
    principal_type = Column(Enum(PrincipalType), nullable=False)
    principal_name = Column(String(64), nullable=False)
    permission = Column(Enum(PermissionLevel), nullable=False)
    rule_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    repository = relationship("Repository", back_populates="access_rules")

    __table_args__ = (
        Index("ix_acl_repo_path", "repository_id", "path"),
    )

class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    job_type = Column(Enum(JobType), nullable=False)
    schedule_cron = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    target_repo_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    last_status = Column(Enum(JobStatus), default=JobStatus.IDLE, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    repository = relationship("Repository", back_populates="jobs")
    executions = relationship("JobExecution", back_populates="job", cascade="all, delete-orphan")

class JobExecution(Base):
    __tablename__ = "job_executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("background_jobs.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)
    status = Column(Enum(JobStatus), default=JobStatus.RUNNING, nullable=False)
    details_json = Column(Text, nullable=True)
    log_output = Column(Text, nullable=True)

    job = relationship("BackgroundJob", back_populates="executions")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    actor = Column(String(64), nullable=False)
    client_ip = Column(String(64), nullable=True)
    action_category = Column(String(32), nullable=False)
    action_name = Column(String(64), nullable=False)
    target_type = Column(String(32), nullable=True)
    target_id = Column(String(128), nullable=True)
    details_json = Column(Text, nullable=True)

class RepositorySupervisor(Base):
    __tablename__ = "repository_supervisors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    can_manage_acls = Column(Boolean, default=True, nullable=False)
    can_manage_locks = Column(Boolean, default=True, nullable=False)
    can_trigger_backups = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    repository = relationship("Repository")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("repository_id", "user_id", name="uq_repo_supervisor"),
    )

class DirectoryConfiguration(Base):
    __tablename__ = "directory_configurations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_type = Column(String(32), default="ldap", nullable=False) # ldap, ad, saml, oidc
    is_enabled = Column(Boolean, default=False, nullable=False)
    server_url = Column(String(255), nullable=True)
    bind_dn = Column(String(255), nullable=True)
    bind_password = Column(String(255), nullable=True)
    base_dn = Column(String(255), nullable=True)
    user_search_filter = Column(String(255), default="(sAMAccountName={username})", nullable=True)
    group_search_filter = Column(String(255), default="(member={dn})", nullable=True)
    use_tls = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

# --- Phase 5: Operations, Disaster Recovery & Replication ---

class BackupPolicy(Base):
    __tablename__ = "backup_policies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True, index=True)
    backup_type = Column(String(32), default="full", nullable=False) # 'full', 'incremental', 'dump_full', 'dump_incremental', 'authz_config'
    schedule_cron = Column(String(64), default="0 2 * * *", nullable=False)
    destination_path = Column(String(512), nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    skip_if_unchanged = Column(Boolean, default=True, nullable=False)
    conditional_full_days = Column(Integer, default=7, nullable=False)
    gfs_keep_dailies = Column(Integer, default=7, nullable=False)
    gfs_keep_weeklies = Column(Integer, default=4, nullable=False)
    gfs_keep_monthlies = Column(Integer, default=12, nullable=False)
    encryption_enabled = Column(Boolean, default=False, nullable=False)
    encryption_passphrase = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    repository = relationship("Repository")

class BackupScheduleJob(Base):
    __tablename__ = "backup_schedule_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False) # e.g. "Weekly Hotcopy (All Repos)", "Nightly SVN Dump"
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True, index=True) # None = All Repositories
    backup_type = Column(String(32), default="hotcopy_full", nullable=False) # 'hotcopy_full', 'hotcopy_incremental', 'dump_full', 'dump_incremental', 'authz_config'
    schedule_frequency = Column(String(32), default="daily", nullable=False) # 'hourly', 'daily', 'weekly', 'monthly', 'interval', 'cron'
    schedule_time = Column(String(16), default="02:00", nullable=False) # HH:MM
    schedule_weekday = Column(Integer, default=6, nullable=False) # 0=Mon, ..., 6=Sun
    schedule_interval_hours = Column(Integer, default=24, nullable=False)
    schedule_cron = Column(String(64), default="0 2 * * *", nullable=False)
    destination_path = Column(String(512), nullable=False) # default or custom
    is_enabled = Column(Boolean, default=True, nullable=False)
    skip_if_unchanged = Column(Boolean, default=True, nullable=False)
    auto_verify = Column(Boolean, default=True, nullable=False)
    retention_count = Column(Integer, default=7, nullable=False) # keep last N archives
    encryption_enabled = Column(Boolean, default=False, nullable=False)
    encryption_passphrase = Column(String(255), nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(String(32), nullable=True) # 'success', 'skipped', 'failed', 'running'
    last_run_message = Column(Text, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    repository = relationship("Repository")

class BackupArchiveRecord(Base):
    __tablename__ = "backup_archive_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True, index=True)
    policy_id = Column(Integer, ForeignKey("backup_policies.id", ondelete="SET NULL"), nullable=True)
    job_id = Column(Integer, ForeignKey("backup_schedule_jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    backup_type = Column(String(32), default="full", nullable=False) # 'full', 'incremental', 'hotcopy_full', 'hotcopy_incremental', 'dump_full', 'dump_incremental', 'authz_config'
    archive_filename = Column(String(255), nullable=False)
    archive_path = Column(String(512), nullable=False)
    revision_from = Column(Integer, default=0, nullable=False)
    revision_to = Column(Integer, default=0, nullable=False)
    size_bytes = Column(Integer, default=0, nullable=False)
    sha256_checksum = Column(String(64), nullable=True)
    is_encrypted = Column(Boolean, default=False, nullable=False)
    verification_status = Column(String(32), default="unverified", nullable=False) # 'verified', 'failed', 'unverified'
    verification_log = Column(Text, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    repository = relationship("Repository")
    policy = relationship("BackupPolicy")
    job = relationship("BackupScheduleJob")

class HookConfig(Base):
    __tablename__ = "hook_configurations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True)
    hook_name = Column(String(64), default="pre-commit", nullable=False) # 'pre-commit', 'post-commit'
    is_enabled = Column(Boolean, default=True, nullable=False)
    # pre-commit rules
    check_commit_message = Column(Boolean, default=False, nullable=False)
    commit_message_pattern = Column(String(255), default="^.{10,}", nullable=True)
    commit_message_error_msg = Column(String(255), default="Commit message must be at least 10 characters.", nullable=True)
    check_pathnames = Column(Boolean, default=False, nullable=False)
    disallow_spaces = Column(Boolean, default=False, nullable=False)
    disallow_special_chars = Column(Boolean, default=True, nullable=False)
    # post-commit rules
    email_notifications = Column(Boolean, default=False, nullable=False)
    email_recipients = Column(String(512), nullable=True)
    email_smtp_server = Column(String(128), nullable=True)
    webhook_enabled = Column(Boolean, default=False, nullable=False)
    webhook_url = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    repository = relationship("Repository")

    __table_args__ = (
        UniqueConstraint("repository_id", "hook_name", name="uq_repo_hook"),
    )

class ReplicationNode(Base):
    __tablename__ = "replication_nodes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True)
    node_role = Column(String(32), default="master", nullable=False) # 'master' or 'slave'
    master_url = Column(String(512), nullable=True)
    sync_interval_seconds = Column(Integer, default=30, nullable=False)
    last_sync_revision = Column(Integer, default=0, nullable=False)
    last_sync_at = Column(DateTime, nullable=True)
    sync_status = Column(String(32), default="idle", nullable=False) # 'idle', 'syncing', 'error', 'standby'
    sync_error = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    compression_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    repository = relationship("Repository")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True, index=True)
    repository_name = Column(String(128), nullable=False, index=True)
    revision = Column(Integer, nullable=True, index=True)
    author = Column(String(128), nullable=True)
    message = Column(Text, nullable=True)
    changed_paths_json = Column(Text, nullable=True)  # JSON array of {action, kind, path, copyfrom_path, copyfrom_rev}
    action_type = Column(String(32), default="commit", nullable=False)  # commit, upload, mkdir, delete
    summary = Column(String(512), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    repository = relationship("Repository")


