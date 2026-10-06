import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Shield,
  RefreshCw,
  Play,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Globe,
  Upload,
  Download,
  Key,
  Calendar,
  Lock,
  FileCheck
} from 'lucide-react';
import { Repository } from '../types';
import { api } from '../services/api';

interface OperationsTabProps {
  repositories: Repository[];
}

export const OperationsTab: React.FC<OperationsTabProps> = ({ repositories }) => {
  const [activeSubTab, setActiveSubTab] = useState<'backups' | 'hooks' | 'replication'>('backups');
  const [selectedRepoId, setSelectedRepoId] = useState<number | ''>(repositories.length > 0 ? repositories[0].id : '');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Backups State
  const [policy, setPolicy] = useState<any>(null);
  const [archives, setArchives] = useState<any[]>([]);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupType, setBackupType] = useState('full');
  const [forceBackup, setForceBackup] = useState(false);
  const [verifyLog, setVerifyLog] = useState<{ id: number; log: string } | null>(null);

  // Hooks State
  const [hookType, setHookType] = useState<'pre-commit' | 'post-commit'>('pre-commit');
  const [hookConfig, setHookConfig] = useState<any>({
    is_enabled: true,
    check_commit_message: true,
    commit_message_pattern: '^.{10,}',
    commit_message_error_msg: 'Commit message must be at least 10 characters long.',
    check_pathnames: true,
    disallow_spaces: false,
    disallow_special_chars: true,
    email_notifications: false,
    webhook_enabled: false,
    webhook_url: ''
  });

  // Replication State
  const [replicationNode, setReplicationNode] = useState<any>(null);
  const [masterUrl, setMasterUrl] = useState('');
  const [syncInterval, setSyncInterval] = useState(30);

  const loadData = async () => {
    if (!selectedRepoId) return;
    setLoading(true);
    setNotification(null);
    try {
      if (activeSubTab === 'backups') {
        const [pol, archs] = await Promise.all([
          api.getBackupPolicy(Number(selectedRepoId)),
          api.listBackupArchives(Number(selectedRepoId))
        ]);
        setPolicy(pol);
        setArchives(archs);
      } else if (activeSubTab === 'hooks') {
        const hConfig = await api.getHookConfig(Number(selectedRepoId), hookType);
        setHookConfig(hConfig);
      } else if (activeSubTab === 'replication') {
        const rep = await api.getReplicationStatus(Number(selectedRepoId));
        setReplicationNode(rep);
        setMasterUrl(rep.master_url || '');
        setSyncInterval(rep.sync_interval_seconds || 30);
      }
    } catch (err: any) {
      console.error(err);
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRepoId, activeSubTab, hookType]);

  // Backups Handlers
  const handleSavePolicy = async () => {
    if (!policy) return;
    setLoading(true);
    try {
      await api.updateBackupPolicy({
        repository_id: selectedRepoId !== '' ? Number(selectedRepoId) : undefined,
        backup_type: policy.backup_type,
        schedule_cron: policy.schedule_cron,
        skip_if_unchanged: policy.skip_if_unchanged,
        gfs_keep_dailies: Number(policy.gfs_keep_dailies),
        gfs_keep_weeklies: Number(policy.gfs_keep_weeklies),
        gfs_keep_monthlies: Number(policy.gfs_keep_monthlies),
        encryption_enabled: policy.encryption_enabled,
        encryption_passphrase: backupPassphrase || undefined
      });
      setNotification({ type: 'success', message: 'Backup and GFS retention policy updated successfully.' });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRunBackup = async () => {
    if (!selectedRepoId) return;
    setLoading(true);
    try {
      const res = await api.runBackup(Number(selectedRepoId), {
        backup_type: backupType,
        force: forceBackup,
        passphrase: backupPassphrase || undefined
      });
      if (res.status === 'skipped') {
        setNotification({ type: 'success', message: 'Backup Skipped: No revisions committed since last backup.' });
      } else {
        setNotification({ type: 'success', message: `Hot backup created: ${res.filename} (${((res.size_bytes || 0) / 1024).toFixed(1)} KB)` });
      }
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyArchive = async (archiveId: number) => {
    setLoading(true);
    try {
      const res = await api.verifyBackup(archiveId, backupPassphrase || undefined);
      setVerifyLog({ id: archiveId, log: res.log_output });
      setNotification({
        type: res.status === 'verified' ? 'success' : 'error',
        message: `Sandbox Verification Result: ${res.status.toUpperCase()} (${res.verified_revisions} revisions checked)`
      });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Hooks Handlers
  const handleSaveHooks = async () => {
    if (!selectedRepoId) return;
    setLoading(true);
    try {
      await api.updateHookConfig(Number(selectedRepoId), hookType, hookConfig);
      setNotification({ type: 'success', message: `Pre-packaged ${hookType} hook installed and active.` });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Replication Handlers
  const handleExportSeed = async () => {
    if (!selectedRepoId) return;
    setLoading(true);
    try {
      const res = await api.exportReplicationSeed(Number(selectedRepoId));
      setNotification({ type: 'success', message: `Replication seed created: ${res.seed_filename} (${((res.size_bytes || 0) / 1024).toFixed(1)} KB)` });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteToMaster = async () => {
    if (!selectedRepoId) return;
    if (!confirm('Are you sure you want to promote this Slave repository to standalone Master? Upstream synchronization will cease.')) return;
    setLoading(true);
    try {
      const res = await api.promoteSlaveToMaster(Number(selectedRepoId));
      setNotification({ type: 'success', message: res.message });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-pane">
      <div className="tab-header">
        <div>
          <h2>Operations, Disaster Recovery & Multi-Site Replication</h2>
          <p className="tab-subtitle">
            Enterprise hot backups with AES-256-GCM encryption, automated sandbox verification, pre-packaged hook policies, and VDFS replication.
          </p>
        </div>

        {/* Repository Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Target Repository:</span>
          <select
            className="form-control"
            style={{ width: '220px', height: '36px' }}
            value={selectedRepoId}
            onChange={(e) => setSelectedRepoId(Number(e.target.value))}
          >
            {repositories.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {notification && (
        <div className={`alert alert-${notification.type === 'error' ? 'danger' : 'success'}`} style={{ marginBottom: '1.25rem' }}>
          {notification.message}
        </div>
      )}

      {/* Sub Tabs Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <button
          className={`btn ${activeSubTab === 'backups' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('backups')}
        >
          <HardDrive size={15} />
          Hot Backups & Verification
        </button>
        <button
          className={`btn ${activeSubTab === 'hooks' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('hooks')}
        >
          <Shield size={15} />
          Pre-Packaged Hook Engine
        </button>
        <button
          className={`btn ${activeSubTab === 'replication' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('replication')}
        >
          <Globe size={15} />
          Multi-Site Geo-Replication (VDFS)
        </button>
      </div>

      {/* --- SUBTAB 1: BACKUPS --- */}
      {activeSubTab === 'backups' && (
        <div>
          {/* Policy & Trigger Card */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={16} color="#6366f1" />
                Backup Policy & GFS Retention
              </h3>
              {policy && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Conditional Backup (Skip if Unchanged):</label>
                    <input
                      type="checkbox"
                      checked={policy.skip_if_unchanged}
                      onChange={(e) => setPolicy({ ...policy, skip_if_unchanged: e.target.checked })}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>AES-256-GCM Encryption:</label>
                    <input
                      type="checkbox"
                      checked={policy.encryption_enabled}
                      onChange={(e) => setPolicy({ ...policy, encryption_enabled: e.target.checked })}
                    />
                  </div>

                  {policy.encryption_enabled && (
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Encryption Passphrase:</label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="Enter encryption passphrase"
                        value={backupPassphrase}
                        onChange={(e) => setBackupPassphrase(e.target.value)}
                      />
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Keep Dailies</label>
                      <input
                        type="number"
                        className="form-control"
                        value={policy.gfs_keep_dailies}
                        onChange={(e) => setPolicy({ ...policy, gfs_keep_dailies: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Keep Weeklies</label>
                      <input
                        type="number"
                        className="form-control"
                        value={policy.gfs_keep_weeklies}
                        onChange={(e) => setPolicy({ ...policy, gfs_keep_weeklies: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Keep Monthlies</label>
                      <input
                        type="number"
                        className="form-control"
                        value={policy.gfs_keep_monthlies}
                        onChange={(e) => setPolicy({ ...policy, gfs_keep_monthlies: e.target.value })}
                      />
                    </div>
                  </div>

                  <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={handleSavePolicy} disabled={loading}>
                    Save Backup & GFS Policy
                  </button>
                </div>
              )}
            </div>

            {/* Run Backup Now Card */}
            <div className="card">
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Play size={16} color="#10b981" />
                Run On-Demand Hot Backup
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>Backup Type:</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={{ fontSize: '0.85rem' }}>
                      <input
                        type="radio"
                        name="backupType"
                        value="full"
                        checked={backupType === 'full'}
                        onChange={() => setBackupType('full')}
                        style={{ marginRight: '0.35rem' }}
                      />
                      Full Hotcopy
                    </label>
                    <label style={{ fontSize: '0.85rem' }}>
                      <input
                        type="radio"
                        name="backupType"
                        value="incremental"
                        checked={backupType === 'incremental'}
                        onChange={() => setBackupType('incremental')}
                        style={{ marginRight: '0.35rem' }}
                      />
                      Incremental Hotcopy
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="forceBackupCheck"
                    checked={forceBackup}
                    onChange={(e) => setForceBackup(e.target.checked)}
                  />
                  <label htmlFor="forceBackupCheck" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                    Force Execution (Ignore 'Skip if Unchanged' Policy)
                  </label>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Encryption Key / Passphrase (Optional Override):</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Passphrase for AES-256-GCM"
                    value={backupPassphrase}
                    onChange={(e) => setBackupPassphrase(e.target.value)}
                  />
                </div>

                <button className="btn btn-primary" onClick={handleRunBackup} disabled={loading}>
                  <HardDrive size={15} />
                  Execute Hot Backup Now
                </button>
              </div>
            </div>
          </div>

          {/* Backup Archives Table */}
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Available Backup Archives & Verification Status</h3>
            {archives.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                No backup archives found for this repository yet.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Archive Filename</th>
                      <th>Type</th>
                      <th>Revision Range</th>
                      <th>Size</th>
                      <th>Encrypted</th>
                      <th>Verification</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archives.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600 }}>
                          {a.archive_filename}
                        </td>
                        <td>
                          <span className={`badge badge-${a.backup_type === 'full' ? 'primary' : 'secondary'}`}>
                            {a.backup_type}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          r{a.revision_from} &rarr; r{a.revision_to}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {((a.size_bytes || 0) / 1024).toFixed(1)} KB
                        </td>
                        <td>
                          {a.is_encrypted ? (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Lock size={11} /> AES-256-GCM
                            </span>
                          ) : (
                            <span className="badge badge-secondary">Plain</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-${a.verification_status === 'verified' ? 'success' : a.verification_status === 'failed' ? 'danger' : 'secondary'}`}>
                            {a.verification_status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ marginRight: '0.4rem', fontSize: '0.75rem' }}
                            onClick={() => handleVerifyArchive(a.id)}
                            disabled={loading}
                          >
                            <FileCheck size={13} />
                            Sandbox Verify
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sandbox Verification Log modal/box */}
            {verifyLog && (
              <div style={{ marginTop: '1.25rem', padding: '1rem', backgroundColor: '#0f172a', borderRadius: '6px' }}>
                <div style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Verification Output Log (Archive #{verifyLog.id}):
                </div>
                <pre style={{ margin: 0, color: '#e2e8f0', fontSize: '0.8rem', maxHeight: '140px', overflowY: 'auto' }}>
                  {verifyLog.log}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- SUBTAB 2: HOOKS --- */}
      {activeSubTab === 'hooks' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', margin: 0 }}>Pre-Packaged Hook Engine (nuvi-hooks)</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                Enforce commit policies without writing custom shell scripts. Hooks are compiled and synced directly to repository hooks directory.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className={`btn ${hookType === 'pre-commit' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setHookType('pre-commit')}
              >
                pre-commit
              </button>
              <button
                className={`btn ${hookType === 'post-commit' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setHookType('post-commit')}
              >
                post-commit
              </button>
            </div>
          </div>

          {hookType === 'pre-commit' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="hookEnabled"
                  checked={hookConfig.is_enabled}
                  onChange={(e) => setHookConfig({ ...hookConfig, is_enabled: e.target.checked })}
                />
                <label htmlFor="hookEnabled" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Enable pre-commit policy enforcement</label>
              </div>

              {/* Commit Message Regex Rule */}
              <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input
                    type="checkbox"
                    id="checkLogMsg"
                    checked={hookConfig.check_commit_message}
                    onChange={(e) => setHookConfig({ ...hookConfig, check_commit_message: e.target.checked })}
                  />
                  <label htmlFor="checkLogMsg" style={{ fontWeight: 600 }}>Enforce Commit Log Message Policy (Regex)</label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Regex Validation Pattern (Python re):</label>
                    <input
                      type="text"
                      className="form-control"
                      value={hookConfig.commit_message_pattern || ''}
                      placeholder="e.g. ^\[(JIRA|FIX)-\d+\].+"
                      onChange={(e) => setHookConfig({ ...hookConfig, commit_message_pattern: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Custom Violation Error Message:</label>
                    <input
                      type="text"
                      className="form-control"
                      value={hookConfig.commit_message_error_msg || ''}
                      placeholder="e.g. Your commit message must begin with [JIRA-123]"
                      onChange={(e) => setHookConfig({ ...hookConfig, commit_message_error_msg: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Pathname Sanitization Rule */}
              <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input
                    type="checkbox"
                    id="checkPaths"
                    checked={hookConfig.check_pathnames}
                    onChange={(e) => setHookConfig({ ...hookConfig, check_pathnames: e.target.checked })}
                  />
                  <label htmlFor="checkPaths" style={{ fontWeight: 600 }}>Enforce Pathname Sanitization</label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={hookConfig.disallow_spaces}
                      onChange={(e) => setHookConfig({ ...hookConfig, disallow_spaces: e.target.checked })}
                    />
                    Disallow whitespace/spaces in filenames
                  </label>
                  <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={hookConfig.disallow_special_chars}
                      onChange={(e) => setHookConfig({ ...hookConfig, disallow_special_chars: e.target.checked })}
                    />
                    Disallow cross-platform unsafe characters (* ? " &lt; &gt; | :) and trailing dots
                  </label>
                </div>
              </div>

              <button className="btn btn-primary" style={{ width: '240px' }} onClick={handleSaveHooks} disabled={loading}>
                Save & Install pre-commit Hook
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input
                    type="checkbox"
                    id="webhookCheck"
                    checked={hookConfig.webhook_enabled}
                    onChange={(e) => setHookConfig({ ...hookConfig, webhook_enabled: e.target.checked })}
                  />
                  <label htmlFor="webhookCheck" style={{ fontWeight: 600 }}>Asynchronous Webhook Dispatcher (--no-wait)</label>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Webhook Endpoint URL (HTTP POST):</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="https://ci.company.com/svn-events"
                    value={hookConfig.webhook_url || ''}
                    onChange={(e) => setHookConfig({ ...hookConfig, webhook_url: e.target.value })}
                  />
                </div>
              </div>

              <button className="btn btn-primary" style={{ width: '240px' }} onClick={handleSaveHooks} disabled={loading}>
                Save & Install post-commit Hook
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- SUBTAB 3: REPLICATION --- */}
      {activeSubTab === 'replication' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', margin: 0 }}>VDFS Multi-Site Geo-Replication</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                Distribute read-write Subversion repositories across geographically dispersed branch offices.
              </p>
            </div>
            {replicationNode && (
              <span className={`badge badge-${replicationNode.node_role === 'master' ? 'primary' : 'warning'}`}>
                Role: {replicationNode.node_role.toUpperCase()}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Node Config */}
            <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '6px' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Node Configuration</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Master Server SVN URL (for Slaves):</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="https://master.svn.example.com/svn/repo"
                    value={masterUrl}
                    onChange={(e) => setMasterUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Sync Polling Interval (seconds):</label>
                  <input
                    type="number"
                    className="form-control"
                    value={syncInterval}
                    onChange={(e) => setSyncInterval(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Offline Seed & DR Promotion */}
            <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h4 style={{ fontSize: '0.9rem', margin: 0 }}>Offline Replication Seed</h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0.75rem 0' }}>
                  Export compressed initial repository state for physical or high-speed transfer to remote sites.
                </p>
                <button className="btn btn-secondary btn-sm" onClick={handleExportSeed} disabled={loading}>
                  <Download size={14} />
                  Export .nuviseed Archive
                </button>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                <h4 style={{ fontSize: '0.9rem', margin: 0, color: '#dc2626' }}>Disaster Recovery Promotion</h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0.75rem 0' }}>
                  Promote this slave repository to standalone Master if the primary datacenter fails.
                </p>
                <button className="btn btn-secondary btn-sm" style={{ color: '#dc2626' }} onClick={handlePromoteToMaster} disabled={loading}>
                  <RotateCcw size={14} />
                  Promote Slave to Master
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
