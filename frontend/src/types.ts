export interface Repository {
  id: number;
  name: string;
  description?: string | null;
  uuid: string;
  fs_type: string;
  fs_format: number;
  fs_path: string;
  latest_revision: number;
  latest_author: string | null;
  latest_log: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepositoryStats {
  repo_id: number;
  name: string;
  total_size_bytes: number;
  total_size_formatted: string;
  latest_revision: number;
  uncommitted_txns_count: number;
  active_locks_count: number;
}

export interface ServerStatus {
  server_name: string;
  version?: string;
  uptime_seconds: number;
  uptime_formatted: string;
  repositories_count: number;
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disk_percent: number;
  timestamp: string;
}

export interface ServerConfig {
  server_name: string;
  svn_url_prefix: string;
  repositories_root: string;
  ban_threshold: number;
  ban_reset_seconds: number;
  ban_duration_seconds: number;
  password_min_length: number;
  trusted_subnets: string[];
  port?: number;
  svn_port?: number;
}

export interface ActiveLock {
  path: string;
  token: string;
  owner: string;
  comment: string;
  creation_date: string;
  expiration_date?: string;
}

export interface UncommittedTxn {
  name: string;
  author: string;
  date: string;
}

export interface CreateRepositoryPayload {
  name: string;
  description?: string;
  fs_type: string;
  compatible_version: string;
  init_standard_layout: boolean;
  layout_author?: string;
  layout_message?: string;
}

export interface User {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  password_updated_at: string;
  groups: string[];
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
  members: string[];
}

export interface AccessRule {
  id: number;
  repository_id: number | null;
  repository_name: string | null;
  path: string;
  principal_type: string;
  principal_name: string;
  permission: string;
  rule_order: number;
  created_at: string;
}

export interface DecisionTraceItem {
  rule_id?: number;
  scope: string;
  path: string;
  principal: string;
  permission: string;
  effect: string;
  reason: string;
}

export interface EffectivePermission {
  username: string;
  repository_name: string;
  path: string;
  effective_permission: string;
  can_read: boolean;
  can_write: boolean;
  decision_trace: DecisionTraceItem[];
}

export interface ShieldStatus {
  active_bans_count: number;
  failed_attempts_tracked: number;
  banned_ips: Array<{
    subnet_or_ip: string;
    remaining_seconds: number;
    banned_until: string;
  }>;
  trusted_subnets: string[];
}

export interface AuthUser {
  id: number;
  username: string;
  is_admin: boolean;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
}

export interface LoginResponse {
  status: string;
  token: string;
  token_type: string;
  user: AuthUser;
  details?: Record<string, any>;
}

export interface ArchiveImportResponse {
  status: string;
  repository_id: number;
  repository_name: string;
  latest_revision: number;
  dump_loaded: boolean;
  revisions_loaded: number;
  authz_imported: boolean;
  groups_created: number;
  users_created: number;
  rules_created: number;
  hooks_imported: number;
  details: Record<string, any>;
}

export interface PersonalAccessToken {
  id: number;
  name: string;
  token_prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
}

export interface PATCreatedResponse {
  id: number;
  name: string;
  token: string;
  token_prefix: string;
  expires_at: string | null;
}

export interface RepositorySupervisor {
  id: number;
  repository_id: number;
  user_id: number;
  username: string;
  can_manage_acls: boolean;
  can_manage_locks: boolean;
  can_trigger_backups: boolean;
  created_at: string;
}

export interface NotificationChangedPath {
  action: string;
  kind?: string;
  path: string;
  copyfrom_path?: string;
  copyfrom_rev?: string;
}

export interface AdminNotification {
  id: number;
  repository_id: number | null;
  repository_name: string;
  revision: number | null;
  author: string | null;
  message: string | null;
  changed_paths: NotificationChangedPath[];
  action_type: string;
  summary: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string | null;
}

export interface NotificationListResponse {
  total: number;
  unread_count: number;
  notifications: AdminNotification[];
}

export interface UnreadCountResponse {
  unread_count: number;
}

export type BackupType = 'hotcopy_full' | 'hotcopy_incremental' | 'dump_full' | 'dump_incremental' | 'authz_config';
export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom_cron';

export interface BackupScheduleJob {
  id: number;
  name: string;
  repository_id: number | null;
  repository_name?: string;
  backup_type: string;
  schedule_frequency: string;
  schedule_time: string;
  schedule_weekday?: number | null;
  schedule_interval_hours?: number | null;
  schedule_cron?: string | null;
  destination_path: string;
  is_enabled: boolean;
  skip_if_unchanged: boolean;
  auto_verify: boolean;
  retention_count: number;
  encryption_enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  next_run_at: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

export interface BackupScheduleJobCreate {
  name: string;
  repository_id?: number | null;
  backup_type: string;
  schedule_frequency: string;
  schedule_time?: string;
  schedule_weekday?: number;
  schedule_interval_hours?: number;
  schedule_cron?: string;
  destination_path?: string;
  is_enabled?: boolean;
  skip_if_unchanged?: boolean;
  auto_verify?: boolean;
  retention_count?: number;
  encryption_enabled?: boolean;
  encryption_passphrase?: string;
}

export interface BackupArchive {
  id: number;
  repository_id: number | null;
  repository_name?: string;
  archive_filename: string;
  archive_path: string;
  backup_type: string;
  size_bytes: number;
  is_encrypted: boolean;
  sha256_checksum: string;
  revision_from: number;
  revision_to: number;
  verification_status: string;
  job_id?: number | null;
  created_at: string;
}

export interface StorageBreakdown {
  repository_id: number;
  repository_name: string;
  total_size_bytes: number;
  db_size_bytes: number;
  revs_size_bytes: number;
  revprops_size_bytes: number;
  locks_size_bytes: number;
  hooks_size_bytes: number;
  conf_size_bytes: number;
  revision_count: number;
}

