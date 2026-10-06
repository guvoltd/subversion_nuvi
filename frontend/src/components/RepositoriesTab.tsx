import React, { useState } from 'react';
import {
  FolderGit2,
  Plus,
  Search,
  ExternalLink,
  Trash2,
  CheckCircle,
  Archive,
  Copy,
  Check,
  FolderTree,
  Download,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { Repository, RepositoryStats, ArchiveImportResponse } from '../types';
import { api } from '../services/api';
import { ImportArchiveModal } from './ImportArchiveModal';
import { ExportRepoModal } from './ExportRepoModal';
import { SupervisorsModal } from './SupervisorsModal';

interface RepositoriesTabProps {
  repositories: Repository[];
  loading: boolean;
  onRefresh: () => void;
  onOpenCreateModal: () => void;
  onSelectRepoForLocks: (repoId: number) => void;
  isAdmin?: boolean;
}

export const RepositoriesTab: React.FC<RepositoriesTabProps> = ({
  repositories,
  loading,
  onRefresh,
  onOpenCreateModal,
  onSelectRepoForLocks,
  isAdmin = true
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [repoStats, setRepoStats] = useState<RepositoryStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteFilesOnDisk, setDeleteFilesOnDisk] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportRepo, setExportRepo] = useState<Repository | null>(null);
  const [supervisorsModalOpen, setSupervisorsModalOpen] = useState(false);
  const [supervisorsRepo, setSupervisorsRepo] = useState<Repository | null>(null);

  const handleOpenExport = (repo: Repository) => {
    setExportRepo(repo);
    setExportModalOpen(true);
  };

  const handleOpenSupervisors = (repo: Repository) => {
    setSupervisorsRepo(repo);
    setSupervisorsModalOpen(true);
  };

  const handleImportSuccess = (res: ArchiveImportResponse) => {
    onRefresh();
    setActionMessage({
      type: 'success',
      text: `Repository '${res.repository_name}' successfully imported with ${res.revisions_loaded} revisions and ${res.rules_created} access rules.`
    });
    setTimeout(() => setActionMessage(null), 6000);
  };

  const filteredRepos = repositories.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectRepo = async (repo: Repository) => {
    setSelectedRepo(repo);
    setRepoStats(null);
    setStatsLoading(true);
    try {
      const stats = await api.getRepositoryStats(repo.id);
      setRepoStats(stats);
    } catch {
      // Ignored
    } finally {
      setStatsLoading(false);
    }
  };

  const handleCopyCheckout = (repoName: string) => {
    const url = `${window.location.origin}/svn/${repoName}`;
    navigator.clipboard.writeText(`svn checkout ${url}`);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleVerify = async (repoId: number) => {
    try {
      const res = await api.verifyRepository(repoId);
      setActionMessage({ type: 'success', text: res.message });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handlePack = async (repoId: number) => {
    try {
      const res = await api.packRepository(repoId);
      setActionMessage({ type: 'success', text: res.message });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleInitLayout = async (repoId: number) => {
    try {
      const updated = await api.initStandardLayout(
        repoId,
        'nuvi-admin',
        'Initialize standard project structure (/trunk, /branches, /tags)'
      );
      setSelectedRepo(updated);
      onRefresh();
      setActionMessage({ type: 'success', text: 'Standard layout committed successfully as revision 1.' });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async () => {
    if (!selectedRepo) return;
    try {
      await api.deleteRepository(selectedRepo.id, deleteFilesOnDisk);
      setDeleteConfirmOpen(false);
      setSelectedRepo(null);
      onRefresh();
      setActionMessage({ type: 'success', text: `Repository '${selectedRepo.name}' deleted.` });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div>
      {/* Toast Alert */}
      {actionMessage && (
        <div className={`alert ${actionMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
          {actionMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Action Bar */}
      <div className="action-bar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>
              <Archive size={16} />
              Import Archive (.zip)
            </button>
            <button className="btn btn-primary" onClick={onOpenCreateModal}>
              <Plus size={16} />
              Create Repository
            </button>
          </div>
        )}
      </div>

      {/* Repositories Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Repository Name</th>
              <th>Format</th>
              <th>Revision</th>
              <th>Latest Author</th>
              <th>Last Commit Message</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRepos.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  {repositories.length === 0
                    ? (isAdmin ? 'No Subversion repositories found. Create your first repository!' : 'No accessible repositories found.')
                    : 'No repositories match your search query.'}
                </td>
              </tr>
            ) : (
              filteredRepos.map(repo => (
                <tr key={repo.id}>
                  <td>
                    <button
                      onClick={() => handleSelectRepo(repo)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#60a5fa',
                        fontWeight: 600,
                        fontSize: '0.925rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        textAlign: 'left'
                      }}
                    >
                      <FolderGit2 size={16} />
                      {repo.name}
                    </button>
                  </td>
                  <td>
                    <span className="badge badge-info">{repo.fs_type}</span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      r{repo.latest_revision}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {repo.latest_author || '—'}
                  </td>
                  <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                    {repo.latest_log || '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSelectRepo(repo)}
                        title="View Repository Details"
                      >
                        Details
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenExport(repo)}
                            title="Export Repository Dump (.zip / .dump)"
                          >
                            <Download size={13} style={{ marginRight: '0.25rem' }} />
                            Export
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenSupervisors(repo)}
                            title="Manage Delegated Supervisors"
                          >
                            <ShieldCheck size={13} style={{ marginRight: '0.25rem' }} />
                            Supervisors
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => onSelectRepoForLocks(repo.id)}
                            title="Inspect Locks & Transactions"
                          >
                            Locks
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Repository Detail Modal */}
      {selectedRepo && (
        <div className="modal-backdrop" onClick={() => setSelectedRepo(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FolderGit2 size={20} color="#3b82f6" />
                <h3 className="modal-title">{selectedRepo.name}</h3>
              </div>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setSelectedRepo(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Checkout Command Box */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div className="form-label">Subversion Checkout Command</div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '0.5rem 0.75rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem'
                }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    svn checkout {window.location.origin}/svn/{selectedRepo.name}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopyCheckout(selectedRepo.name)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {copiedUrl ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    {copiedUrl ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '0.2rem' }}>UUID:</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{selectedRepo.uuid}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Storage Path:</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                    {selectedRepo.fs_path}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Filesystem Type:</div>
                  <div>{selectedRepo.fs_type.toUpperCase()} (Format {selectedRepo.fs_format})</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Latest Revision:</div>
                  <div style={{ fontWeight: 600 }}>r{selectedRepo.latest_revision}</div>
                </div>
              </div>

              {/* Live Storage Metrics */}
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '8px',
                padding: '1rem',
                border: '1px solid var(--border-subtle)',
                marginBottom: '1.5rem'
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Live Storage Metrics
                </div>
                {statsLoading ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Calculating storage footprint...</div>
                ) : repoStats ? (
                  <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Disk Usage: </span>
                      <strong>{repoStats.total_size_formatted}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Active Locks: </span>
                      <strong>{repoStats.active_locks_count}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Dangling Txns: </span>
                      <strong>{repoStats.uncommitted_txns_count}</strong>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Layout Init Prompt if Rev 0 (Admin only) */}
              {isAdmin && selectedRepo.latest_revision === 0 && (
                <div style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#60a5fa', fontWeight: 600 }}>
                    <FolderTree size={18} />
                    Empty Repository Structure
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    This repository is currently at revision 0 with no files or folders. You can initialize the standard directory layout.
                  </p>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleInitLayout(selectedRepo.id)}
                  >
                    Initialize /trunk, /branches, /tags
                  </button>
                </div>
              )}

              {/* Maintenance Operations (Admin only) */}
              {isAdmin && (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    Maintenance & Health
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleVerify(selectedRepo.id)}>
                      <CheckCircle size={14} />
                      Verify Integrity
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handlePack(selectedRepo.id)}>
                      <Archive size={14} />
                      Pack Shards
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOpenExport(selectedRepo)}>
                      <Download size={14} />
                      Export
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOpenSupervisors(selectedRepo)}>
                      <ShieldCheck size={14} />
                      Supervisors
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const id = selectedRepo.id;
                        setSelectedRepo(null);
                        onSelectRepoForLocks(id);
                      }}
                    >
                      View Active Locks
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteConfirmOpen(true)}
                      style={{ marginLeft: 'auto' }}
                    >
                      <Trash2 size={14} />
                      Delete Repository
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedRepo(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && selectedRepo && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirmOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} />
                Delete Repository
              </h3>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                Are you sure you want to permanently delete repository <strong>'{selectedRepo.name}'</strong>?
              </p>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={deleteFilesOnDisk}
                  onChange={e => setDeleteFilesOnDisk(e.target.checked)}
                />
                Purge repository files from disk permanently
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Archive Modal */}
      <ImportArchiveModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={handleImportSuccess}
      />

      {/* Export Repository Modal */}
      <ExportRepoModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        repository={exportRepo}
      />

      {/* Supervisors Modal */}
      <SupervisorsModal
        isOpen={supervisorsModalOpen}
        onClose={() => setSupervisorsModalOpen(false)}
        repository={supervisorsRepo}
      />
    </div>
  );
};

