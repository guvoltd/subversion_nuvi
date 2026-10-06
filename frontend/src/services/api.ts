import {
  Repository,
  RepositoryStats,
  ServerStatus,
  ServerConfig,
  ActiveLock,
  UncommittedTxn,
  CreateRepositoryPayload,
  AuthUser,
  LoginResponse,
  ArchiveImportResponse,
  PersonalAccessToken,
  PATCreatedResponse,
  RepositorySupervisor
} from '../types';

const API_BASE = '/api/v1';

const nativeFetch = window.fetch.bind(window);

// Intercept all API calls to automatically inject Bearer auth token
const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = localStorage.getItem('nuvi_auth_token');
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return nativeFetch(input, { ...init, headers });
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401 && !res.url.includes('/auth/login')) {
    localStorage.removeItem('nuvi_auth_token');
    localStorage.removeItem('nuvi_auth_user');
    window.dispatchEvent(new Event('nuvi_unauthorized'));
  }

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}: ${res.statusText}`;
    try {
      const errorJson = await res.json();
      if (errorJson.detail) {
        errorMsg = typeof errorJson.detail === 'string' 
          ? errorJson.detail 
          : (errorJson.detail.error || JSON.stringify(errorJson.detail));
      }
    } catch {
      // Fallback to text or status
    }
    throw new Error(errorMsg);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json();
}

export const api = {
  // Server
  async getServerStatus(): Promise<ServerStatus> {
    const res = await fetch(`${API_BASE}/server/status`);
    return handleResponse<ServerStatus>(res);
  },

  async getServerConfig(): Promise<ServerConfig> {
    const res = await fetch(`${API_BASE}/server/config`);
    return handleResponse<ServerConfig>(res);
  },

  // Repositories
  async listRepositories(): Promise<Repository[]> {
    const res = await fetch(`${API_BASE}/repositories`);
    return handleResponse<Repository[]>(res);
  },

  async getRepository(id: number): Promise<Repository> {
    const res = await fetch(`${API_BASE}/repositories/${id}`);
    return handleResponse<Repository>(res);
  },

  async createRepository(payload: CreateRepositoryPayload): Promise<Repository> {
    const res = await fetch(`${API_BASE}/repositories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<Repository>(res);
  },

  async deleteRepository(id: number, deleteFiles: boolean = true): Promise<void> {
    const res = await fetch(`${API_BASE}/repositories/${id}?delete_files=${deleteFiles}`, {
      method: 'DELETE'
    });
    return handleResponse<void>(res);
  },

  async initStandardLayout(id: number, author: string, logMessage: string): Promise<Repository> {
    const res = await fetch(`${API_BASE}/repositories/${id}/init-layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, log_message: logMessage })
    });
    return handleResponse<Repository>(res);
  },

  async getRepositoryStats(id: number): Promise<RepositoryStats> {
    const res = await fetch(`${API_BASE}/repositories/${id}/stats`);
    return handleResponse<RepositoryStats>(res);
  },

  async verifyRepository(id: number): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/repositories/${id}/verify`, { method: 'POST' });
    return handleResponse<{ status: string; message: string }>(res);
  },

  async packRepository(id: number): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/repositories/${id}/pack`, { method: 'POST' });
    return handleResponse<{ status: string; message: string }>(res);
  },

  async importArchive(formData: FormData): Promise<ArchiveImportResponse> {
    const res = await fetch(`${API_BASE}/repositories/import-archive`, {
      method: 'POST',
      body: formData
    });
    return handleResponse<ArchiveImportResponse>(res);
  },

  async importArchivePath(payload: {
    archive_path: string;
    repo_name?: string;
    import_acls?: boolean;
    import_users?: boolean;
    import_hooks?: boolean;
  }): Promise<ArchiveImportResponse> {
    const res = await fetch(`${API_BASE}/repositories/import-archive-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<ArchiveImportResponse>(res);
  },

  // Locks
  async getRepositoryLocks(id: number): Promise<ActiveLock[]> {
    const res = await fetch(`${API_BASE}/repositories/${id}/locks`);
    return handleResponse<ActiveLock[]>(res);
  },

  async breakLock(id: number, lockedPath: string): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/repositories/${id}/locks/break`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked_path: lockedPath })
    });
    return handleResponse<{ status: string; message: string }>(res);
  },

  // Transactions
  async getRepositoryTransactions(id: number): Promise<UncommittedTxn[]> {
    const res = await fetch(`${API_BASE}/repositories/${id}/transactions`);
    return handleResponse<UncommittedTxn[]>(res);
  },

  async abortTransaction(id: number, txnName: string): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/repositories/${id}/transactions/${encodeURIComponent(txnName)}`, {
      method: 'DELETE'
    });
    return handleResponse<{ status: string; message: string }>(res);
  },

  // Users
  async listUsers(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/users`);
    return handleResponse<any[]>(res);
  },

  async createUser(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async deleteUser(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
    return handleResponse<void>(res);
  },

  async changePassword(id: number, newPassword: string): Promise<any> {
    const res = await fetch(`${API_BASE}/users/${id}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword })
    });
    return handleResponse<any>(res);
  },

  async setUserStatus(id: number, isActive: boolean): Promise<any> {
    const res = await fetch(`${API_BASE}/users/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive })
    });
    return handleResponse<any>(res);
  },

  // Groups
  async listGroups(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/groups`);
    return handleResponse<any[]>(res);
  },

  async createGroup(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async deleteGroup(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/groups/${id}`, { method: 'DELETE' });
    return handleResponse<void>(res);
  },

  async addGroupMember(groupId: number, username: string): Promise<any> {
    const res = await fetch(`${API_BASE}/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    return handleResponse<any>(res);
  },

  async removeGroupMember(groupId: number, username: string): Promise<any> {
    const res = await fetch(`${API_BASE}/groups/${groupId}/members/${username}`, {
      method: 'DELETE'
    });
    return handleResponse<any>(res);
  },

  // Access Rules & ACL Evaluator
  async listRules(repositoryId?: number): Promise<any[]> {
    const url = repositoryId !== undefined
      ? `${API_BASE}/acl/rules?repository_id=${repositoryId}`
      : `${API_BASE}/acl/rules`;
    const res = await fetch(url);
    return handleResponse<any[]>(res);
  },

  async createRule(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/acl/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async deleteRule(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/acl/rules/${id}`, { method: 'DELETE' });
    return handleResponse<void>(res);
  },

  async evaluatePermission(payload: { username: string; repository_id: number; path: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/acl/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async compileAuthz(): Promise<any> {
    const res = await fetch(`${API_BASE}/acl/compile`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  // Shield
  async getShieldStatus(): Promise<any> {
    const res = await fetch(`${API_BASE}/shield/status`);
    return handleResponse<any>(res);
  },

  async unbanIp(ipOrSubnet: string): Promise<any> {
    const res = await fetch(`${API_BASE}/shield/unban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip_or_subnet: ipOrSubnet })
    });
    return handleResponse<any>(res);
  },

  // Repository Web Explorer (Phase 3)
  async browseTree(repoId: number, path: string = '/', rev: number = -1): Promise<any> {
    const res = await fetch(`${API_BASE}/browser/${repoId}/tree?path=${encodeURIComponent(path)}&rev=${rev}`);
    return handleResponse<any>(res);
  },

  async catFile(repoId: number, path: string, rev: number = -1): Promise<any> {
    const res = await fetch(`${API_BASE}/browser/${repoId}/cat?path=${encodeURIComponent(path)}&rev=${rev}`);
    return handleResponse<any>(res);
  },

  async getFileDiff(repoId: number, path: string, rev1: number, rev2: number): Promise<any> {
    const res = await fetch(`${API_BASE}/browser/${repoId}/diff?path=${encodeURIComponent(path)}&rev1=${rev1}&rev2=${rev2}`);
    return handleResponse<any>(res);
  },

  async getBlame(repoId: number, path: string, rev: number = -1): Promise<any> {
    const res = await fetch(`${API_BASE}/browser/${repoId}/blame?path=${encodeURIComponent(path)}&rev=${rev}`);
    return handleResponse<any>(res);
  },

  async uploadFile(repoId: number, filePath: string, file: File, author: string, message: string): Promise<any> {
    const formData = new FormData();
    formData.append('file_path', filePath);
    formData.append('commit_author', author);
    formData.append('commit_message', message);
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/browser/${repoId}/upload`, {
      method: 'POST',
      body: formData
    });
    return handleResponse<any>(res);
  },

  // Full-Text Search (Phase 4)
  async search(params: {
    q: string;
    repository_id?: number;
    path_prefix?: string;
    extension?: string;
    username?: string;
    limit?: number;
  }): Promise<any> {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.repository_id !== undefined) searchParams.set('repository_id', params.repository_id.toString());
    if (params.path_prefix) searchParams.set('path_prefix', params.path_prefix);
    if (params.extension) searchParams.set('extension', params.extension);
    if (params.username) searchParams.set('username', params.username);
    if (params.limit !== undefined) searchParams.set('limit', params.limit.toString());

    const res = await fetch(`${API_BASE}/search?${searchParams.toString()}`);
    return handleResponse<any>(res);
  },

  async indexRepository(repoId: number, revision: number = -1): Promise<any> {
    const res = await fetch(`${API_BASE}/search/index/${repoId}?revision=${revision}`, {
      method: 'POST'
    });
    return handleResponse<any>(res);
  },

  async getSearchStatus(): Promise<any> {
    const res = await fetch(`${API_BASE}/search/status`);
    return handleResponse<any>(res);
  },

  // Audit Logs (Phase 4)
  async getAuditLogs(params?: {
    category?: string;
    actor?: string;
    action_name?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.actor) searchParams.set('actor', params.actor);
    if (params?.action_name) searchParams.set('action_name', params.action_name);
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString());

    const res = await fetch(`${API_BASE}/audit?${searchParams.toString()}`);
    return handleResponse<any[]>(res);
  },

  // Operations & Disaster Recovery (Phase 5)
  async getBackupPolicy(repoId?: number): Promise<any> {
    const url = repoId ? `${API_BASE}/operations/backup/policy?repo_id=${repoId}` : `${API_BASE}/operations/backup/policy`;
    const res = await fetch(url);
    return handleResponse<any>(res);
  },

  async updateBackupPolicy(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/backup/policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async runBackup(repoId: number, payload: { backup_type: string; force: boolean; passphrase?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/backup/run/${repoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async listBackupArchives(repoId?: number): Promise<any[]> {
    const url = repoId ? `${API_BASE}/operations/backup/archives?repo_id=${repoId}` : `${API_BASE}/operations/backup/archives`;
    const res = await fetch(url);
    return handleResponse<any[]>(res);
  },

  async verifyBackup(archiveId: number, passphrase?: string): Promise<any> {
    const url = passphrase 
      ? `${API_BASE}/operations/backup/verify/${archiveId}?passphrase=${encodeURIComponent(passphrase)}`
      : `${API_BASE}/operations/backup/verify/${archiveId}`;
    const res = await fetch(url, { method: 'POST' });
    return handleResponse<any>(res);
  },

  async restoreBackup(archiveId: number, payload: { target_repository_name: string; target_revision?: number; encryption_passphrase?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/backup/restore/${archiveId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  // Pre-Packaged Hook Engine (Phase 5)
  async getHookConfig(repoId: number, hookName: string): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/hooks/${repoId}/${hookName}`);
    return handleResponse<any>(res);
  },

  async updateHookConfig(repoId: number, hookName: string, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/hooks/${repoId}/${hookName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  // Multi-Site Geo-Replication (Phase 5)
  async getReplicationStatus(repoId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/replication/${repoId}`);
    return handleResponse<any>(res);
  },

  async configureReplication(repoId: number, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/replication/${repoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async exportReplicationSeed(repoId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/replication/export-seed/${repoId}`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  async importReplicationSeed(payload: { seed_path: string; new_repository_name: string; master_url: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/replication/import-seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async promoteSlaveToMaster(repoId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/operations/replication/promote/${repoId}`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  // SSL/TLS Certificates (Pillar 11)
  async getActiveCertificate(): Promise<any> {
    const res = await fetch(`${API_BASE}/certificates/active`);
    return handleResponse<any>(res);
  },

  async generateSelfSignedCert(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/certificates/self-signed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async generateCSR(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/certificates/csr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async installCustomCert(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/certificates/install-custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  // Directory & SSO Integration (Pillar 3)
  async getDirectoryConfig(): Promise<any> {
    const res = await fetch(`${API_BASE}/directory/config`);
    return handleResponse<any>(res);
  },

  async updateDirectoryConfig(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/directory/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async testDirectoryConnection(): Promise<any> {
    const res = await fetch(`${API_BASE}/directory/test-connection`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  async syncDirectory(): Promise<any> {
    const res = await fetch(`${API_BASE}/directory/sync`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  // Authentication & Management Session
  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await nativeFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await handleResponse<LoginResponse>(res);
    if (data.token) {
      localStorage.setItem('nuvi_auth_token', data.token);
      localStorage.setItem('nuvi_auth_user', JSON.stringify(data.user));
    }
    return data;
  },

  async getCurrentUser(): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/auth/me`);
    return handleResponse<AuthUser>(res);
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('nuvi_auth_token');
      localStorage.removeItem('nuvi_auth_user');
    }
  },

  getStoredUser(): AuthUser | null {
    try {
      const u = localStorage.getItem('nuvi_auth_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  hasToken(): boolean {
    return !!localStorage.getItem('nuvi_auth_token');
  },

  // Repository Export
  getExportUrl(repoId: number, format: 'zip' | 'dump' | 'dump.gz' = 'zip'): string {
    const token = localStorage.getItem('nuvi_auth_token');
    return `${API_BASE}/repositories/${repoId}/export?format=${format}${token ? `&token=${token}` : ''}`;
  },

  // In-Browser Direct Commit & Operations
  async commitFile(repoId: number, payload: { path: string; content: string; commit_message?: string; commit_author?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/browser/${repoId}/commit-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async mkdir(repoId: number, payload: { path: string; commit_message?: string; commit_author?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/browser/${repoId}/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async deletePath(repoId: number, payload: { path: string; commit_message?: string; commit_author?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/browser/${repoId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async copyBranchTag(repoId: number, payload: { source_path: string; target_path: string; commit_message?: string; commit_author?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/browser/${repoId}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  // Self-Service User Profile & Password
  async changeMyPassword(payload: { current_password: string; new_password: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  // Personal Access Tokens (PATs)
  async listMyTokens(): Promise<PersonalAccessToken[]> {
    const res = await fetch(`${API_BASE}/auth/tokens`);
    return handleResponse<PersonalAccessToken[]>(res);
  },

  async createToken(payload: { name: string; expires_in_days?: number | null }): Promise<PATCreatedResponse> {
    const res = await fetch(`${API_BASE}/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<PATCreatedResponse>(res);
  },

  async revokeToken(tokenId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/tokens/${tokenId}`, {
      method: 'DELETE'
    });
    return handleResponse<void>(res);
  },

  // Repository Supervisors
  async listSupervisors(repoId: number): Promise<RepositorySupervisor[]> {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/supervisors`);
    return handleResponse<RepositorySupervisor[]>(res);
  },

  async assignSupervisor(repoId: number, userId: number): Promise<RepositorySupervisor> {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/supervisors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    return handleResponse<RepositorySupervisor>(res);
  },

  async removeSupervisor(repoId: number, userId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/supervisors/${userId}`, {
      method: 'DELETE'
    });
    return handleResponse<void>(res);
  }
};

