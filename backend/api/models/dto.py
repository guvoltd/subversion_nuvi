"""
Subversion Nuvi - Data Transfer Objects & Pydantic Schemas
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# --- Repository DTOs ---

class RepositoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, description="Unique repository name (alphanumeric, dash, underscore)")
    description: Optional[str] = Field(None, max_length=1000)
    fs_type: str = Field("fsfs", description="Filesystem backend (default: fsfs)")
    compatible_version: str = Field("1.14.0", description="Target compatible Subversion format version")
    init_standard_layout: bool = Field(True, description="Automatically create /trunk, /branches, /tags")
    layout_author: Optional[str] = Field("nuvi-admin", description="Commit author for initial layout")
    layout_message: Optional[str] = Field("Initialize standard project structure (trunk, branches, tags)", description="Commit log message")

class RepositoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    fs_path: str
    uuid: Optional[str] = None
    fs_type: str
    format_version: int
    latest_revision: int
    is_locked: bool
    rep_sharing_enabled: bool
    compression: str
    size_bytes: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    latest_author: Optional[str] = ""
    latest_date: Optional[str] = ""
    latest_log: Optional[str] = ""

class StandardLayoutRequest(BaseModel):
    author: Optional[str] = "nuvi-admin"
    log_message: Optional[str] = "Initialize standard project structure (trunk, branches, tags)"

class RepositoryImportRequest(BaseModel):
    source_type: str = Field(..., description="'dump_file' or 'remote_url'")
    source_location: str = Field(..., description="Absolute path to dump file or remote SVN URL")

class ArchivePathImportRequest(BaseModel):
    archive_path: str = Field(..., description="Path to .zip archive containing dump and VisualSVN files")
    repo_name: Optional[str] = Field(None, description="Optional override for imported repository name")
    import_acls: bool = Field(True, description="Import VisualSVN authz path access rules")
    import_users: bool = Field(True, description="Auto-create users and security groups from authz and htpasswd")
    import_hooks: bool = Field(True, description="Install hook scripts from the archive")
    default_password: Optional[str] = Field("Welcome123!", description="Default password for newly created imported users")

class ArchiveImportResponse(BaseModel):
    status: str
    repository_id: int
    repository_name: str
    latest_revision: int
    dump_loaded: bool
    revisions_loaded: int
    authz_imported: bool
    groups_created: int
    users_created: int
    rules_created: int
    hooks_imported: int
    details: Dict[str, Any] = {}


class RepositoryStatsResponse(BaseModel):
    repository_id: int
    name: str
    uuid: str
    fs_type: str
    format_version: int
    latest_revision: int
    total_size_bytes: int
    db_size_bytes: int
    active_locks_count: int
    uncommitted_txns_count: int
    compression: str
    rep_sharing_enabled: bool

# --- Lock DTOs ---

class LockResponse(BaseModel):
    path: str
    token: str
    owner: str
    comment: str
    creation_date: str
    expiration_date: str

class BreakLockRequest(BaseModel):
    locked_path: str = Field(..., description="Path in repository to break lock on (e.g. /trunk/file.txt)")

# --- Transaction DTOs ---

class TransactionResponse(BaseModel):
    txn_name: str
    base_revision: int
    size_bytes: int
    creation_date: str

# --- Server Status DTOs ---

class ServerStatusResponse(BaseModel):
    server_name: str
    version: str = "1.16.1 (Subversion 1.16.1)"
    uptime_seconds: float
    uptime_formatted: Optional[str] = ""
    repositories_count: int
    total_revisions: int
    total_storage_bytes: int
    active_locks_count: int
    uncommitted_txns_count: int
    memory_used_mb: float = 0.0
    memory_total_mb: float = 0.0
    memory_percent: float = 0.0
    disk_used_gb: float = 0.0
    disk_total_gb: float = 0.0
    disk_percent: float = 0.0
    cpu_percent: float = 0.0
    timestamp: Optional[str] = None

# --- Phase 2: User & Group DTOs ---

class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, description="Alphanumeric username")
    password: str = Field(..., min_length=1, description="Initial password")
    email: Optional[str] = Field(None, max_length=128)
    full_name: Optional[str] = Field(None, max_length=128)
    is_admin: bool = Field(False)

class UserUpdateRequest(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_admin: Optional[bool] = None

class UserPasswordChangeRequest(BaseModel):
    old_password: Optional[str] = None
    new_password: str = Field(..., min_length=1)

class UserStatusRequest(BaseModel):
    is_active: bool

class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_active: bool
    is_admin: bool
    created_at: Optional[datetime] = None
    password_updated_at: Optional[datetime] = None
    groups: List[str] = []

class GroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    description: Optional[str] = Field(None, max_length=255)

class GroupUpdateRequest(BaseModel):
    description: Optional[str] = None

class GroupResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    member_count: int = 0
    members: List[str] = []

class GroupMemberRequest(BaseModel):
    username: str

# --- Phase 2: Access Rule DTOs ---

class AccessRuleCreateRequest(BaseModel):
    repository_id: Optional[int] = Field(None, description="Repository ID or None for server-wide rule")
    path: str = Field("/", description="Repository subpath, e.g. / or /trunk")
    principal_type: str = Field(..., description="'user', 'group', or 'everyone'")
    principal_name: str = Field(..., description="Username, group name, or '*' for everyone")
    permission: str = Field(..., description="'rw' (Read/Write), 'r' (Read Only), or '' (Deny)")
    rule_order: int = 0

class AccessRuleResponse(BaseModel):
    id: int
    repository_id: Optional[int] = None
    repository_name: Optional[str] = None
    path: str
    principal_type: str
    principal_name: str
    permission: str
    rule_order: int
    created_at: Optional[datetime] = None

# --- Phase 2: Effective Permissions & Decision Tree ---

class EffectivePermissionRequest(BaseModel):
    username: str
    repository_id: int
    path: str = "/"

class DecisionTraceItem(BaseModel):
    rule_id: Optional[int] = None
    scope: str # 'server_wide' or 'repository'
    path: str
    principal: str
    permission: str
    effect: str # 'grant', 'deny', 'inherit', 'override'
    reason: str

class EffectivePermissionResponse(BaseModel):
    username: str
    repository_name: str
    path: str
    effective_permission: str # 'rw', 'r', or ''
    can_read: bool
    can_write: bool
    decision_trace: List[DecisionTraceItem]

# --- Phase 2: Brute Force Shield DTOs ---

class ShieldStatusResponse(BaseModel):
    active_bans_count: int
    failed_attempts_tracked: int
    banned_ips: List[Dict[str, Any]]
    trusted_subnets: List[str]

class UnbanRequest(BaseModel):
    ip_or_subnet: str

# --- Phase 2: Repository Supervisor DTOs ---

class SupervisorAssignRequest(BaseModel):
    user_id: int
    can_manage_acls: bool = True
    can_manage_locks: bool = True
    can_trigger_backups: bool = True

class SupervisorResponse(BaseModel):
    id: int
    repository_id: int
    user_id: int
    username: str
    can_manage_acls: bool
    can_manage_locks: bool
    can_trigger_backups: bool
    created_at: Optional[datetime] = None

RepositorySupervisorRequest = SupervisorAssignRequest
RepositorySupervisorResponse = SupervisorResponse

# --- Phase 5: Operations, Disaster Recovery & Replication DTOs ---

class BackupPolicyCreateRequest(BaseModel):
    repository_id: Optional[int] = None
    backup_type: str = "full" # 'full' or 'incremental'
    schedule_cron: str = "0 2 * * *"
    destination_path: Optional[str] = None
    is_enabled: bool = True
    skip_if_unchanged: bool = True
    conditional_full_days: int = 7
    gfs_keep_dailies: int = 7
    gfs_keep_weeklies: int = 4
    gfs_keep_monthlies: int = 12
    encryption_enabled: bool = False
    encryption_passphrase: Optional[str] = None

class BackupPolicyResponse(BaseModel):
    id: int
    repository_id: Optional[int] = None
    backup_type: str
    schedule_cron: str
    destination_path: str
    is_enabled: bool
    skip_if_unchanged: bool
    conditional_full_days: int
    gfs_keep_dailies: int
    gfs_keep_weeklies: int
    gfs_keep_monthlies: int
    encryption_enabled: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class BackupArchiveResponse(BaseModel):
    id: int
    repository_id: int
    repository_name: Optional[str] = None
    backup_type: str
    archive_filename: str
    archive_path: str
    revision_from: int
    revision_to: int
    size_bytes: int
    sha256_checksum: Optional[str] = None
    is_encrypted: bool
    verification_status: str
    verification_log: Optional[str] = None
    verified_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

class BackupVerifyResponse(BaseModel):
    archive_id: int
    status: str # 'verified' or 'failed'
    verified_revisions: int
    log_output: str

class BackupRestoreRequest(BaseModel):
    target_repository_name: str
    target_revision: Optional[int] = None
    encryption_passphrase: Optional[str] = None

class HookConfigUpdateRequest(BaseModel):
    is_enabled: bool = True
    check_commit_message: bool = False
    commit_message_pattern: Optional[str] = "^.{10,}"
    commit_message_error_msg: Optional[str] = "Commit message must be at least 10 characters."
    check_pathnames: bool = False
    disallow_spaces: bool = False
    disallow_special_chars: bool = True
    email_notifications: bool = False
    email_recipients: Optional[str] = None
    email_smtp_server: Optional[str] = None
    webhook_enabled: bool = False
    webhook_url: Optional[str] = None

class HookConfigResponse(BaseModel):
    id: int
    repository_id: int
    hook_name: str
    is_enabled: bool
    check_commit_message: bool
    commit_message_pattern: Optional[str] = None
    commit_message_error_msg: Optional[str] = None
    check_pathnames: bool
    disallow_spaces: bool
    disallow_special_chars: bool
    email_notifications: bool
    email_recipients: Optional[str] = None
    email_smtp_server: Optional[str] = None
    webhook_enabled: bool
    webhook_url: Optional[str] = None
    installed_script_path: Optional[str] = None
    updated_at: Optional[datetime] = None

class ReplicationNodeCreateRequest(BaseModel):
    repository_id: int
    node_role: str = "slave" # 'master' or 'slave'
    master_url: Optional[str] = None
    sync_interval_seconds: int = 30
    compression_enabled: bool = True

class ReplicationNodeResponse(BaseModel):
    id: int
    repository_id: int
    repository_name: Optional[str] = None
    node_role: str
    master_url: Optional[str] = None
    sync_interval_seconds: int
    last_sync_revision: int
    last_sync_at: Optional[datetime] = None
    sync_status: str
    sync_error: Optional[str] = None
    is_active: bool
    compression_enabled: bool
    created_at: Optional[datetime] = None

# --- Phase 6: Auth Self-Service & PAT DTOs ---

class ChangeSelfPasswordRequest(BaseModel):
    current_password: str
    new_password: str

class CreatePATRequest(BaseModel):
    name: str
    expires_in_days: Optional[int] = 30

class PATResponse(BaseModel):
    id: int
    name: str
    token_prefix: str
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    is_active: bool

class PATCreatedResponse(BaseModel):
    id: int
    name: str
    token: str
    token_prefix: str
    expires_at: Optional[datetime] = None

