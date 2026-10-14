import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  FileCheck,
  Trash2,
  Pause,
  Clock,
  Database,
  Layers,
  Activity,
  FileText,
  Sliders,
  Plus,
  X,
  Server,
  Folder
} from 'lucide-react';
import {
  Repository,
  BackupScheduleJob,
  BackupArchive,
  StorageBreakdown
} from '../types';
import { api } from '../services/api';

interface OperationsTabProps {
  repositories: Repository[];
  initialSubTab?: 'schedules' | 'archives' | 'maintenance' | 'hooks' | 'replication';
  hideSubTabBar?: boolean;
  hideHeader?: boolean;
}

export const OperationsTab: React.FC<OperationsTabProps> = ({
  repositories,
  initialSubTab = 'schedules',
  hideSubTabBar = false,
  hideHeader = false
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'schedules' | 'archives' | 'maintenance' | 'hooks' | 'replication'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [selectedRepoId, setSelectedRepoId] = useState<number | ''>(repositories.length > 0 ? repositories[0].id : '');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // --- Scheduled Backups State ---
  const [schedules, setSchedules] = useState<BackupScheduleJob[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BackupScheduleJob | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    repository_id: null as number | null,
    backup_type: 'hotcopy_full',
    schedule_frequency: 'daily',
    schedule_time: '02:00',
    schedule_weekday: 6,
    schedule_interval_hours: 24,
    schedule_cron: '0 2 * * *',
    destination_path: '',
    is_enabled: true,
    skip_if_unchanged: true,
    auto_verify: true,
    retention_count: 7,
    encryption_enabled: false,
    encryption_passphrase: ''
  });

  // --- Archives & Restore State ---
  const [archives, setArchives] = useState<BackupArchive[]>([]);
  const [archiveRepoFilter, setArchiveRepoFilter] = useState<number | 'all'>('all');
  const [showManualBackupModal, setShowManualBackupModal] = useState(false);
  const [manualBackupForm, setManualBackupForm] = useState({
    repo_id: repositories.length > 0 ? repositories[0].id : 0,
    backup_type: 'hotcopy_full',
    force: false,
    passphrase: ''
  });
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreArchive, setRestoreArchive] = useState<BackupArchive | null>(null);
  const [restoreForm, setRestoreForm] = useState({
    target_repository_name: '',
    target_revision: '' as number | '',
    encryption_passphrase: ''
  });
  const [verifyLog, setVerifyLog] = useState<{ id: number; log: string } | null>(null);

  // --- Maintenance & Tools State ---
  const [packStatus, setPackStatus] = useState<any | null>(null);
  const [cleanTxnStatus, setCleanTxnStatus] = useState<any | null>(null);
  const [verifyStartRev, setVerifyStartRev] = useState<number | ''>('');
  const [verifyEndRev, setVerifyEndRev] = useState<number | ''>('');
  const [verifyStatus, setVerifyStatus] = useState<{ status: string; message: string; log_output?: string } | null>(null);
  const [storageStats, setStorageStats] = useState<StorageBreakdown[]>([]);

  // --- Hooks State ---
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

  // --- Replication State ---
  const [replicationNode, setReplicationNode] = useState<any>(null);
  const [masterUrl, setMasterUrl] = useState('');
  const [syncInterval, setSyncInterval] = useState(30);

  // -------------------------------------------------------------
  // Data Loaders
  // -------------------------------------------------------------
  const loadData = async () => {
    setLoading(true);
    setNotification(null);
    try {
      if (activeSubTab === 'schedules') {
        const schedList = await api.listBackupSchedules();
        setSchedules(schedList);
      } else if (activeSubTab === 'archives') {
        const archList = await api.listBackupArchives(
          archiveRepoFilter === 'all' ? undefined : Number(archiveRepoFilter)
        );
        setArchives(archList);
      } else if (activeSubTab === 'maintenance') {
        const stats = await api.getStorageStats();
        setStorageStats(stats);
      } else if (activeSubTab === 'hooks') {
        if (selectedRepoId) {
          const hConfig = await api.getHookConfig(Number(selectedRepoId), hookType);
          setHookConfig(hConfig);
        }
      } else if (activeSubTab === 'replication') {
        if (selectedRepoId) {
          const rep = await api.getReplicationStatus(Number(selectedRepoId));
          setReplicationNode(rep);
          setMasterUrl(rep.master_url || '');
          setSyncInterval(rep.sync_interval_seconds || 30);
        }
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
  }, [activeSubTab, archiveRepoFilter, selectedRepoId, hookType]);

  // -------------------------------------------------------------
  // Schedules Handlers
  // -------------------------------------------------------------
  const handleOpenCreateSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({
      name: '',
      repository_id: null,
      backup_type: 'hotcopy_full',
      schedule_frequency: 'daily',
      schedule_time: '02:00',
      schedule_weekday: 6,
      schedule_interval_hours: 24,
      schedule_cron: '0 2 * * *',
      destination_path: '',
      is_enabled: true,
      skip_if_unchanged: true,
      auto_verify: true,
      retention_count: 7,
      encryption_enabled: false,
      encryption_passphrase: ''
    });
    setShowScheduleModal(true);
  };

  const handleOpenEditSchedule = (job: BackupScheduleJob) => {
    setEditingSchedule(job);
    setScheduleForm({
      name: job.name,
      repository_id: job.repository_id,
      backup_type: job.backup_type,
      schedule_frequency: job.schedule_frequency,
      schedule_time: job.schedule_time || '02:00',
      schedule_weekday: job.schedule_weekday !== null && job.schedule_weekday !== undefined ? job.schedule_weekday : 6,
      schedule_interval_hours: job.schedule_interval_hours || 24,
      schedule_cron: job.schedule_cron || '0 2 * * *',
      destination_path: job.destination_path || '',
      is_enabled: job.is_enabled,
      skip_if_unchanged: job.skip_if_unchanged,
      auto_verify: job.auto_verify,
      retention_count: job.retention_count || 7,
      encryption_enabled: job.encryption_enabled,
      encryption_passphrase: ''
    });
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.name.trim()) {
      setNotification({ type: 'error', message: 'Job name is required.' });
      return;
    }
    setLoading(true);
    try {
      if (editingSchedule) {
        await api.updateBackupSchedule(editingSchedule.id, scheduleForm);
        setNotification({ type: 'success', message: `Backup schedule '${scheduleForm.name}' updated successfully.` });
      } else {
        await api.createBackupSchedule(scheduleForm);
        setNotification({ type: 'success', message: `Backup schedule '${scheduleForm.name}' created successfully.` });
      }
      setShowScheduleModal(false);
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSchedule = async (jobId: number) => {
    setLoading(true);
    try {
      const res = await api.toggleBackupSchedule(jobId);
      setNotification({
        type: 'success',
        message: `Schedule job #${jobId} is now ${res.is_enabled ? 'Active' : 'Paused'}.`
      });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRunScheduleNow = async (jobId: number, jobName: string) => {
    setLoading(true);
    try {
      const res = await api.runBackupScheduleNow(jobId);
      setNotification({
        type: res.status === 'failed' ? 'error' : 'success',
        message: `Schedule execution '${jobName}': ${res.message}`
      });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSchedule = async (jobId: number, jobName: string) => {
    if (!confirm(`Are you sure you want to delete backup schedule '${jobName}'?`)) return;
    setLoading(true);
    try {
      await api.deleteBackupSchedule(jobId);
      setNotification({ type: 'success', message: `Backup schedule '${jobName}' deleted.` });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Archives & Manual Trigger Handlers
  // -------------------------------------------------------------
  const handleRunManualBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.runBackup(manualBackupForm.repo_id, {
        backup_type: manualBackupForm.backup_type,
        force: manualBackupForm.force,
        passphrase: manualBackupForm.passphrase || undefined
      });
      if (res.status === 'skipped') {
        setNotification({ type: 'success', message: 'Backup Skipped: No revisions committed since last backup.' });
      } else {
        setNotification({
          type: 'success',
          message: `Backup archive created: ${res.filename} (${((res.size_bytes || 0) / 1024).toFixed(1)} KB)`
        });
      }
      setShowManualBackupModal(false);
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
      const res = await api.verifyBackup(archiveId);
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

  const handleDeleteArchive = async (archiveId: number, filename: string) => {
    if (!confirm(`Are you sure you want to delete backup archive '${filename}'? This permanently removes the physical file.`)) return;
    setLoading(true);
    try {
      await api.deleteBackupArchive(archiveId);
      setNotification({ type: 'success', message: `Archive '${filename}' deleted successfully.` });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRestoreModal = (archive: BackupArchive) => {
    setRestoreArchive(archive);
    const baseRepoName = archive.repository_name || 'restored_repo';
    setRestoreForm({
      target_repository_name: `${baseRepoName}_restored`,
      target_revision: '',
      encryption_passphrase: ''
    });
    setShowRestoreModal(true);
  };

  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreArchive) return;
    if (!restoreForm.target_repository_name.trim()) {
      setNotification({ type: 'error', message: 'Target repository name is required.' });
      return;
    }
    setLoading(true);
    try {
      const res = await api.restoreBackup(restoreArchive.id, {
        target_repository_name: restoreForm.target_repository_name.trim(),
        target_revision: restoreForm.target_revision !== '' ? Number(restoreForm.target_revision) : undefined,
        encryption_passphrase: restoreForm.encryption_passphrase || undefined
      });
      setNotification({
        type: 'success',
        message: `Restore completed! Created repository '${res.repository_name}' at revision r${res.latest_revision}.`
      });
      setShowRestoreModal(false);
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Maintenance Handlers
  // -------------------------------------------------------------
  const handlePackRepository = async () => {
    if (!selectedRepoId) return;
    setLoading(true);
    setPackStatus(null);
    try {
      const res = await api.packRepository(Number(selectedRepoId));
      setPackStatus(res);
      setNotification({ type: 'success', message: `Shard packing successful: ${res.message}` });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCleanTransactions = async () => {
    if (!selectedRepoId) return;
    setLoading(true);
    setCleanTxnStatus(null);
    try {
      const res = await api.cleanTransactions(Number(selectedRepoId));
      setCleanTxnStatus(res);
      setNotification({ type: 'success', message: res.message });
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyHealth = async () => {
    if (!selectedRepoId) return;
    setLoading(true);
    setVerifyStatus(null);
    try {
      const res = await api.verifyRepositoryHealth(
        Number(selectedRepoId),
        verifyStartRev !== '' ? Number(verifyStartRev) : undefined,
        verifyEndRev !== '' ? Number(verifyEndRev) : undefined
      );
      setVerifyStatus(res);
      setNotification({
        type: res.status === 'verified' ? 'success' : 'error',
        message: `Verification complete: ${res.message}`
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Hooks & Replication Handlers
  // -------------------------------------------------------------
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

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getBackupTypeBadge = (type: string) => {
    switch (type) {
      case 'hotcopy_full':
        return <span className="badge badge-primary">Full Hotcopy</span>;
      case 'hotcopy_incremental':
        return <span className="badge badge-secondary" style={{ backgroundColor: '#0284c7', color: '#fff' }}>Incr Hotcopy</span>;
      case 'dump_full':
        return <span className="badge badge-secondary" style={{ backgroundColor: '#7c3aed', color: '#fff' }}>Full Dump</span>;
      case 'dump_incremental':
        return <span className="badge badge-secondary" style={{ backgroundColor: '#9333ea', color: '#fff' }}>Incr Dump</span>;
      case 'authz_config':
        return <span className="badge badge-warning">Authz Snapshot</span>;
      default:
        return <span className="badge badge-secondary">{type}</span>;
    }
  };

  return (
    <div className="tab-pane">
      {/* Header */}
      {!hideHeader && (
        <div className="tab-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h2>Operations, Automated Backups & Administration Tools</h2>
            <p className="tab-subtitle">
              Configure repetitive automated backup schedules, manage disaster recovery archives, run FSFS shard packing & dead txn purges, and manage security hooks.
            </p>
          </div>

          {/* Global/Target Repo Selector (for tabs that are repo-specific) */}
          {(activeSubTab === 'maintenance' || activeSubTab === 'hooks' || activeSubTab === 'replication') && (
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
          )}
        </div>
      )}

      {/* Target Repo Selector if hideHeader is active */}
      {hideHeader && (activeSubTab === 'maintenance' || activeSubTab === 'hooks' || activeSubTab === 'replication') && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Target Repository:</span>
          <select
            className="input"
            style={{ width: '220px', height: '36px' }}
            value={selectedRepoId}
            onChange={(e) => setSelectedRepoId(Number(e.target.value))}
          >
            {repositories.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      {notification && (
        <div className={`alert alert-${notification.type === 'error' ? 'danger' : 'success'}`} style={{ marginBottom: '1.25rem' }}>
          {notification.message}
        </div>
      )}

      {/* Sub Tabs Navigation */}
      {!hideSubTabBar && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeSubTab === 'schedules' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('schedules')}
          >
            <Calendar size={15} />
            Automated Backup Schedules
          </button>
          <button
            className={`btn ${activeSubTab === 'archives' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('archives')}
          >
            <HardDrive size={15} />
            Archives & Disaster Recovery
          </button>
          <button
            className={`btn ${activeSubTab === 'maintenance' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('maintenance')}
          >
            <Layers size={15} />
            Repository Maintenance & Optimization
          </button>
          <button
            className={`btn ${activeSubTab === 'hooks' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('hooks')}
          >
            <Shield size={15} />
            Security Hooks Engine
          </button>
          <button
            className={`btn ${activeSubTab === 'replication' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('replication')}
          >
            <Globe size={15} />
            Multi-Site Replication (VDFS)
          </button>
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBTAB 1: SCHEDULED BACKUP JOBS QUEUE                         */}
      {/* ============================================================= */}
      {activeSubTab === 'schedules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Scheduled Periodic Backup Queues</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                Automated multi-task backups running in background. Configurable per-repository or globally across all repositories with custom destination paths.
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleOpenCreateSchedule}>
              <Plus size={15} />
              Create Backup Schedule
            </button>
          </div>

          <div className="card">
            {schedules.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                <Clock size={36} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
                <p style={{ fontWeight: 500, margin: '0 0 0.5rem 0' }}>No backup schedules configured yet.</p>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                  Set up repetitive backup tasks such as weekly hotcopy, monthly dumps, or authorization snapshot backups.
                </p>
                <button className="btn btn-primary btn-sm" onClick={handleOpenCreateSchedule}>
                  <Plus size={14} />
                  Configure First Schedule
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Job Name</th>
                      <th>Target</th>
                      <th>Backup Type</th>
                      <th>Frequency</th>
                      <th>Destination</th>
                      <th>Retention</th>
                      <th>Security</th>
                      <th>Last Run</th>
                      <th>Next Run</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</div>
                          {s.last_run_message && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.last_run_message}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${s.repository_id ? 'badge-secondary' : 'badge-primary'}`} style={{ fontSize: '0.75rem' }}>
                            {s.repository_name || (s.repository_id ? `Repo #${s.repository_id}` : 'All Repositories')}
                          </span>
                        </td>
                        <td>{getBackupTypeBadge(s.backup_type)}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{s.schedule_frequency}</span>
                          {s.schedule_frequency === 'daily' && <span style={{ color: '#64748b' }}> @ {s.schedule_time}</span>}
                          {s.schedule_frequency === 'weekly' && <span style={{ color: '#64748b' }}> @ {s.schedule_time}</span>}
                          {s.schedule_frequency === 'hourly' && <span style={{ color: '#64748b' }}> every {s.schedule_interval_hours}h</span>}
                          {s.schedule_frequency === 'custom_cron' && <code style={{ fontSize: '0.75rem', marginLeft: '4px' }}>{s.schedule_cron}</code>}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'monospace', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.destination_path}>
                          {s.destination_path || '/opt/nuvi/data/backups'}
                        </td>
                        <td style={{ fontSize: '0.85rem', textAlign: 'center' }}>
                          {s.retention_count} archives
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {s.encryption_enabled ? (
                            <span title="AES-256-GCM Encrypted" style={{ color: '#d97706' }}><Lock size={15} /></span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>None</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {s.last_run_status ? (
                            <span className={`badge badge-${s.last_run_status === 'success' ? 'success' : s.last_run_status === 'failed' ? 'danger' : s.last_run_status === 'running' ? 'warning' : 'secondary'}`}>
                              {s.last_run_status.toUpperCase()}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Never</span>
                          )}
                          {s.last_run_at && (
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                              {new Date(s.last_run_at).toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {s.next_run_at ? (
                            <div>
                              <div>{new Date(s.next_run_at).toLocaleDateString()}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(s.next_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Pending</span>
                          )}
                        </td>
                        <td>
                          <button
                            className={`btn btn-sm ${s.is_enabled ? 'btn-success' : 'btn-secondary'}`}
                            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            onClick={() => handleToggleSchedule(s.id)}
                            title={s.is_enabled ? 'Click to Pause' : 'Click to Enable'}
                            disabled={loading}
                          >
                            {s.is_enabled ? <CheckCircle size={12} /> : <Pause size={12} />}
                            {s.is_enabled ? 'Active' : 'Paused'}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => handleRunScheduleNow(s.id, s.name)}
                              title="Run this backup immediately"
                              disabled={loading}
                            >
                              <Play size={13} color="#10b981" />
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => handleOpenEditSchedule(s)}
                              title="Edit Schedule Settings"
                              disabled={loading}
                            >
                              <Sliders size={13} />
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#ef4444' }}
                              onClick={() => handleDeleteSchedule(s.id, s.name)}
                              title="Delete Schedule"
                              disabled={loading}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* CREATE / EDIT SCHEDULE MODAL */}
          {showScheduleModal && createPortal(
            <div className="modal-backdrop" onClick={() => setShowScheduleModal(false)}>
              <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={18} color="#3b82f6" />
                    <h3 className="modal-title">{editingSchedule ? 'Edit Backup Schedule' : 'Create New Backup Schedule'}</h3>
                  </div>
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                    onClick={() => setShowScheduleModal(false)}
                    type="button"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveSchedule}>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        Schedule Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Weekly Full Hotcopy (All Repos) or Daily Dump"
                        value={scheduleForm.name}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                        required
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label className="form-label" style={{ fontWeight: 600 }}>
                          Target Repository Scope
                        </label>
                        <select
                          className="form-control"
                          value={scheduleForm.repository_id === null ? 'all' : scheduleForm.repository_id}
                          onChange={(e) => setScheduleForm({
                            ...scheduleForm,
                            repository_id: e.target.value === 'all' ? null : Number(e.target.value)
                          })}
                        >
                          <option value="all">All Repositories (Global Queue)</option>
                          {repositories.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="form-label" style={{ fontWeight: 600 }}>
                          Backup Archive Type
                        </label>
                        <select
                          className="form-control"
                          value={scheduleForm.backup_type}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, backup_type: e.target.value })}
                        >
                          <option value="hotcopy_full">Full SVN Hotcopy (Physical clone)</option>
                          <option value="hotcopy_incremental">Incremental Hotcopy (Byte diff)</option>
                          <option value="dump_full">Full SVN Dump (.dump.gz stream)</option>
                          <option value="dump_incremental">Incremental SVN Dump</option>
                          <option value="authz_config">Authz & Config Snapshot (.tar.gz)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '8px', backgroundColor: 'var(--bg-primary)' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
                        Recurrence Schedule & Frequency
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>
                            Frequency Interval
                          </label>
                          <select
                            className="form-control"
                            value={scheduleForm.schedule_frequency}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_frequency: e.target.value })}
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="hourly">Hourly Interval</option>
                            <option value="monthly">Monthly (1st of month)</option>
                            <option value="custom_cron">Custom Cron Expression</option>
                          </select>
                        </div>

                        {scheduleForm.schedule_frequency === 'hourly' && (
                          <div>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>
                              Every N Hours
                            </label>
                            <select
                              className="form-control"
                              value={scheduleForm.schedule_interval_hours}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_interval_hours: Number(e.target.value) })}
                            >
                              <option value={1}>Every 1 hour</option>
                              <option value={2}>Every 2 hours</option>
                              <option value={4}>Every 4 hours</option>
                              <option value={6}>Every 6 hours</option>
                              <option value={12}>Every 12 hours</option>
                              <option value={24}>Every 24 hours</option>
                            </select>
                          </div>
                        )}

                        {(scheduleForm.schedule_frequency === 'daily' || scheduleForm.schedule_frequency === 'monthly') && (
                          <div>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>
                              Execution Time (HH:MM UTC)
                            </label>
                            <input
                              type="time"
                              className="form-control"
                              value={scheduleForm.schedule_time}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_time: e.target.value })}
                            />
                          </div>
                        )}

                        {scheduleForm.schedule_frequency === 'weekly' && (
                          <>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>
                                Day of Week
                              </label>
                              <select
                                className="form-control"
                                value={scheduleForm.schedule_weekday}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_weekday: Number(e.target.value) })}
                              >
                                <option value={0}>Monday</option>
                                <option value={1}>Tuesday</option>
                                <option value={2}>Wednesday</option>
                                <option value={3}>Thursday</option>
                                <option value={4}>Friday</option>
                                <option value={5}>Saturday</option>
                                <option value={6}>Sunday</option>
                              </select>
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>
                                Execution Time (HH:MM UTC)
                              </label>
                              <input
                                type="time"
                                className="form-control"
                                value={scheduleForm.schedule_time}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_time: e.target.value })}
                              />
                            </div>
                          </>
                        )}

                        {scheduleForm.schedule_frequency === 'custom_cron' && (
                          <div>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>
                              Standard 5-part Cron Syntax
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="0 2 * * *"
                              value={scheduleForm.schedule_cron}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_cron: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        Backup Destination Directory
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Leave blank for server default (/opt/nuvi/data/backups) or specify custom path"
                        value={scheduleForm.destination_path}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, destination_path: e.target.value })}
                      />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                        Supports any local directory, mounted NAS share, or NFS mount (e.g., <code>/mnt/backups/svn</code>).
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label className="form-label" style={{ fontWeight: 600 }}>
                          Retention Count (Archives to Keep)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          className="form-control"
                          value={scheduleForm.retention_count}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, retention_count: Number(e.target.value) })}
                        />
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                          Older archives exceeding this count are automatically purged.
                        </p>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
                        <label className="form-checkbox-label" style={{ fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            className="form-checkbox"
                            checked={scheduleForm.skip_if_unchanged}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, skip_if_unchanged: e.target.checked })}
                          />
                          <span>Skip if unchanged (no new commits)</span>
                        </label>
                        <label className="form-checkbox-label" style={{ fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            className="form-checkbox"
                            checked={scheduleForm.auto_verify}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, auto_verify: e.target.checked })}
                          />
                          <span>Auto-verify archive integrity after backup</span>
                        </label>
                      </div>
                    </div>

                    {/* Encryption */}
                    <div style={{ border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '8px', backgroundColor: 'var(--bg-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: scheduleForm.encryption_enabled ? '0.75rem' : '0' }}>
                        <input
                          type="checkbox"
                          id="schedEncCheck"
                          className="form-checkbox"
                          checked={scheduleForm.encryption_enabled}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, encryption_enabled: e.target.checked })}
                        />
                        <label htmlFor="schedEncCheck" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', color: 'var(--text-main)' }}>
                          AES-256-GCM Authenticated Encryption
                        </label>
                      </div>

                      {scheduleForm.encryption_enabled && (
                        <div>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>
                            Encryption Passphrase (Optional - system key will be used if omitted)
                          </label>
                          <input
                            type="password"
                            className="form-control"
                            placeholder="Passphrase for archive encryption"
                            value={scheduleForm.encryption_passphrase}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, encryption_passphrase: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowScheduleModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBTAB 2: ARCHIVES & DISASTER RECOVERY RESTORE                */}
      {/* ============================================================= */}
      {activeSubTab === 'archives' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Backup Archives & Restore Manager</h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                  Download point-in-time archives, run automated sandbox verifications, or restore repositories to new targets.
                </p>
              </div>

              {/* Repo Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Filter:</span>
                <select
                  className="form-control"
                  style={{ width: '180px', height: '34px', fontSize: '0.85rem' }}
                  value={archiveRepoFilter}
                  onChange={(e) => setArchiveRepoFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">All Archives</option>
                  {repositories.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setManualBackupForm({
                  repo_id: repositories.length > 0 ? repositories[0].id : 0,
                  backup_type: 'hotcopy_full',
                  force: false,
                  passphrase: ''
                });
                setShowManualBackupModal(true);
              }}
            >
              <Play size={14} />
              Run Immediate Hot Backup
            </button>
          </div>

          <div className="card">
            {archives.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                <HardDrive size={36} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
                <p style={{ fontWeight: 500, margin: '0 0 0.5rem 0' }}>No backup archives found.</p>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                  Execute a manual backup or wait for the next scheduled background task.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Archive Filename</th>
                      <th>Repository</th>
                      <th>Type</th>
                      <th>Revision Span</th>
                      <th>Size</th>
                      <th>Encrypted</th>
                      <th>Verification</th>
                      <th>Created At</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archives.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600 }}>
                            {a.archive_filename}
                          </div>
                          {a.sha256_checksum && (
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }} title={a.sha256_checksum}>
                              SHA256: {a.sha256_checksum.slice(0, 16)}...
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                            {a.repository_name || (a.repository_id ? `Repo #${a.repository_id}` : 'Global Authz')}
                          </span>
                        </td>
                        <td>{getBackupTypeBadge(a.backup_type)}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {a.backup_type === 'authz_config' ? 'N/A' : `r${a.revision_from} → r${a.revision_to}`}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {formatBytes(a.size_bytes)}
                        </td>
                        <td>
                          {a.is_encrypted ? (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Lock size={11} /> AES-256
                            </span>
                          ) : (
                            <span className="badge badge-secondary">Plain</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-${a.verification_status === 'verified' ? 'success' : a.verification_status === 'failed' ? 'danger' : 'secondary'}`}>
                            {a.verification_status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                            {/* Direct Download */}
                            <a
                              href={api.getBackupDownloadUrl(a.id)}
                              download={a.archive_filename}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                              title="Download Archive to Local Machine"
                            >
                              <Download size={13} />
                            </a>

                            {/* Verify Sandbox */}
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => handleVerifyArchive(a.id)}
                              disabled={loading}
                              title="Run Sandbox svnadmin verify"
                            >
                              <FileCheck size={13} />
                            </button>

                            {/* Restore Wizard */}
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => handleOpenRestoreModal(a)}
                              disabled={loading}
                              title="Point-in-time Restore"
                            >
                              <RotateCcw size={13} />
                            </button>

                            {/* Delete Archive */}
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#ef4444' }}
                              onClick={() => handleDeleteArchive(a.id, a.archive_filename)}
                              disabled={loading}
                              title="Delete Archive"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sandbox Verification Log modal */}
            {verifyLog && createPortal(
              <div className="modal-backdrop" onClick={() => setVerifyLog(null)}>
                <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileCheck size={18} color="#10b981" />
                      <h3 className="modal-title">Verification Output Log (Archive #{verifyLog.id})</h3>
                    </div>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                      onClick={() => setVerifyLog(null)}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="modal-body">
                    <pre style={{
                      margin: 0,
                      color: '#e2e8f0',
                      fontSize: '0.8rem',
                      maxHeight: '360px',
                      overflowY: 'auto',
                      backgroundColor: '#0f172a',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {verifyLog.log}
                    </pre>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setVerifyLog(null)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>

          {/* MANUAL BACKUP MODAL */}
          {showManualBackupModal && createPortal(
            <div className="modal-backdrop" onClick={() => setShowManualBackupModal(false)}>
              <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Play size={18} color="#10b981" />
                    <h3 className="modal-title">Run Immediate Hot Backup</h3>
                  </div>
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                    onClick={() => setShowManualBackupModal(false)}
                    type="button"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleRunManualBackup}>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        Target Repository
                      </label>
                      <select
                        className="form-control"
                        value={manualBackupForm.repo_id}
                        onChange={(e) => setManualBackupForm({ ...manualBackupForm, repo_id: Number(e.target.value) })}
                      >
                        {repositories.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        Backup Type
                      </label>
                      <select
                        className="form-control"
                        value={manualBackupForm.backup_type}
                        onChange={(e) => setManualBackupForm({ ...manualBackupForm, backup_type: e.target.value })}
                      >
                        <option value="hotcopy_full">Full Hotcopy (Binary FSFS clone)</option>
                        <option value="hotcopy_incremental">Incremental Hotcopy</option>
                        <option value="dump_full">Full SVN Dump (.dump.gz)</option>
                        <option value="dump_incremental">Incremental SVN Dump</option>
                      </select>
                    </div>

                    <label className="form-checkbox-label">
                      <input
                        type="checkbox"
                        id="manualForceCheck"
                        className="form-checkbox"
                        checked={manualBackupForm.force}
                        onChange={(e) => setManualBackupForm({ ...manualBackupForm, force: e.target.checked })}
                      />
                      <span>Force Execution (Ignore skip if unchanged)</span>
                    </label>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>
                        Encryption Passphrase (Optional AES-256-GCM)
                      </label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="Passphrase"
                        value={manualBackupForm.passphrase}
                        onChange={(e) => setManualBackupForm({ ...manualBackupForm, passphrase: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowManualBackupModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      Trigger Backup Now
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

          {/* RESTORE MODAL */}
          {showRestoreModal && restoreArchive && createPortal(
            <div className="modal-backdrop" onClick={() => setShowRestoreModal(false)}>
              <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <RotateCcw size={18} color="#6366f1" />
                    <h3 className="modal-title">Restore Repository from Archive</h3>
                  </div>
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                    onClick={() => setShowRestoreModal(false)}
                    type="button"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleExecuteRestore}>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                      <div><strong>Archive:</strong> <code style={{ color: 'var(--accent-primary)' }}>{restoreArchive.archive_filename}</code></div>
                      <div style={{ marginTop: '0.25rem' }}><strong>Type:</strong> {restoreArchive.backup_type} | <strong>Size:</strong> {formatBytes(restoreArchive.size_bytes)}</div>
                      <div style={{ marginTop: '0.25rem' }}><strong>Span:</strong> r{restoreArchive.revision_from} → r{restoreArchive.revision_to}</div>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        Target Repository Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={restoreForm.target_repository_name}
                        onChange={(e) => setRestoreForm({ ...restoreForm, target_repository_name: e.target.value })}
                        required
                      />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                        A new repository will be created safely from this archive without overwriting existing data.
                      </p>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        Target Revision (Optional point-in-time limit)
                      </label>
                      <input
                        type="number"
                        className="form-control"
                        placeholder={`Max revision: ${restoreArchive.revision_to}`}
                        value={restoreForm.target_revision}
                        onChange={(e) => setRestoreForm({ ...restoreForm, target_revision: e.target.value ? Number(e.target.value) : '' })}
                      />
                    </div>

                    {restoreArchive.is_encrypted && (
                      <div>
                        <label className="form-label" style={{ fontWeight: 600, color: '#f59e0b' }}>
                          Decryption Passphrase <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          type="password"
                          className="form-control"
                          placeholder="Passphrase used during backup"
                          value={restoreForm.encryption_passphrase}
                          onChange={(e) => setRestoreForm({ ...restoreForm, encryption_passphrase: e.target.value })}
                          required
                        />
                      </div>
                    )}
                  </div>

                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowRestoreModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      Execute Restore
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBTAB 3: REPOSITORY MAINTENANCE & OPTIMIZATION TOOLS         */}
      {/* ============================================================= */}
      {activeSubTab === 'maintenance' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Subversion Maintenance & Optimization Tools</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Native administrative operations to optimize disk storage, clean interrupted transactions, and inspect FSFS integrity.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {/* Tool 1: svnadmin pack */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={16} color="#0284c7" />
                  FSFS Shard Packing (<code>svnadmin pack</code>)
                </h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
                  Consolidates completed loose revision and revprop files in <code>db/revs</code> and <code>db/revprops</code> into monolithic 1,000-rev shards. Reduces inode consumption, minimizes filesystem fragmentation, and speeds up read throughput.
                </p>
              </div>

              <div>
                {packStatus && (
                  <div className="alert alert-success" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                    {packStatus.message}
                  </div>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%' }}
                  onClick={handlePackRepository}
                  disabled={loading || !selectedRepoId}
                >
                  <Database size={14} />
                  Pack Repository Shards
                </button>
              </div>
            </div>

            {/* Tool 2: svnadmin rmtxns */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Trash2 size={16} color="#d97706" />
                  Dead Transactions Cleaner (<code>svnadmin rmtxns</code>)
                </h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
                  Scans <code>db/transactions</code> and <code>db/txn-protorevs</code> for dead, failed, or interrupted client commit transactions and safely removes them without locking ongoing active developer sessions.
                </p>
              </div>

              <div>
                {cleanTxnStatus && (
                  <div className="alert alert-success" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                    {cleanTxnStatus.message}
                  </div>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                  onClick={handleCleanTransactions}
                  disabled={loading || !selectedRepoId}
                >
                  <Trash2 size={14} />
                  Purge Dead Transactions
                </button>
              </div>
            </div>

            {/* Tool 3: svnadmin verify */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileCheck size={16} color="#10b981" />
                  Live Integrity Verification (<code>svnadmin verify</code>)
                </h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.75rem 0', lineHeight: 1.4 }}>
                  Verifies revision tree checksums, schema structures, and node deltas directly against live FSFS storage.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Start Revision (opt):</label>
                    <input
                      type="number"
                      className="form-control"
                      style={{ height: '30px', fontSize: '0.8rem' }}
                      placeholder="0"
                      value={verifyStartRev}
                      onChange={(e) => setVerifyStartRev(e.target.value ? Number(e.target.value) : '')}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>End Revision (opt):</label>
                    <input
                      type="number"
                      className="form-control"
                      style={{ height: '30px', fontSize: '0.8rem' }}
                      placeholder="HEAD"
                      value={verifyEndRev}
                      onChange={(e) => setVerifyEndRev(e.target.value ? Number(e.target.value) : '')}
                    />
                  </div>
                </div>
              </div>

              <div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                  onClick={handleVerifyHealth}
                  disabled={loading || !selectedRepoId}
                >
                  <Activity size={14} />
                  Run Integrity Verification
                </button>
              </div>
            </div>
          </div>

          {/* Verification Live Log Box */}
          {verifyStatus && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#0f172a', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600 }}>
                  Live svnadmin verify Output:
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.7rem', padding: '2px 6px', color: '#94a3b8' }}
                  onClick={() => setVerifyStatus(null)}
                >
                  Dismiss
                </button>
              </div>
              <pre style={{ margin: 0, color: '#e2e8f0', fontSize: '0.8rem', maxHeight: '180px', overflowY: 'auto' }}>
                {verifyStatus.log_output || verifyStatus.message}
              </pre>
            </div>
          )}

          {/* Storage Profiler Table */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Server size={16} color="#6366f1" />
                Repository Storage Profiler & Disk Breakdown
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
                <RefreshCw size={13} />
                Refresh Disk Metrics
              </button>
            </div>

            {storageStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                No storage statistics available.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Repository Name</th>
                      <th>Total Disk Size</th>
                      <th>Revisions (<code>db/revs</code>)</th>
                      <th>Revprops (<code>db/revprops</code>)</th>
                      <th>Active Locks (<code>db/locks</code>)</th>
                      <th>Hooks (<code>hooks/</code>)</th>
                      <th>Revisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageStats.map((s) => (
                      <tr key={s.repository_id}>
                        <td style={{ fontWeight: 600 }}>{s.repository_name}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{formatBytes(s.total_size_bytes)}</td>
                        <td>{formatBytes(s.revs_size_bytes)}</td>
                        <td>{formatBytes(s.revprops_size_bytes)}</td>
                        <td>{formatBytes(s.locks_size_bytes)}</td>
                        <td>{formatBytes(s.hooks_size_bytes)}</td>
                        <td>
                          <span className="badge badge-secondary">{s.revision_count} revs</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBTAB 4: PRE-PACKAGED HOOK ENGINE                            */}
      {/* ============================================================= */}
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

      {/* ============================================================= */}
      {/* SUBTAB 5: REPLICATION                                         */}
      {/* ============================================================= */}
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
