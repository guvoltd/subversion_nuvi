import React from 'react';
import {
  Cpu,
  HardDrive,
  Layers,
  FolderGit2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { ServerStatus, Repository } from '../types';

interface DashboardTabProps {
  status: ServerStatus | null;
  repositories: Repository[];
  onNavigateToRepos: () => void;
  onOpenCreateModal: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  status,
  repositories,
  onNavigateToRepos,
  onOpenCreateModal
}) => {
  return (
    <div>
      <div className="card-grid">
        {/* CPU Card */}
        <div className="stat-card">
          <div className="stat-header">
            <span>CPU Usage</span>
            <Cpu size={18} color="#3b82f6" />
          </div>
          <div className="stat-value">
            {status?.cpu_percent != null ? `${status.cpu_percent.toFixed(1)}%` : '--'}
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.min(status?.cpu_percent ?? 0, 100)}%`,
                backgroundColor: (status?.cpu_percent ?? 0) > 85 ? '#ef4444' : '#3b82f6'
              }}
            />
          </div>
          <div className="stat-sub">Host Processing Load</div>
        </div>

        {/* Memory Card */}
        <div className="stat-card">
          <div className="stat-header">
            <span>Memory Usage</span>
            <Layers size={18} color="#8b5cf6" />
          </div>
          <div className="stat-value">
            {status?.memory_percent != null ? `${status.memory_percent.toFixed(1)}%` : '--'}
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.min(status?.memory_percent ?? 0, 100)}%`,
                backgroundColor: (status?.memory_percent ?? 0) > 90 ? '#ef4444' : '#8b5cf6'
              }}
            />
          </div>
          <div className="stat-sub">
            {status?.memory_used_mb != null && status?.memory_total_mb != null
              ? `${status.memory_used_mb} MB / ${status.memory_total_mb} MB`
              : '--'}
          </div>
        </div>

        {/* Disk Card */}
        <div className="stat-card">
          <div className="stat-header">
            <span>Storage Usage</span>
            <HardDrive size={18} color="#10b981" />
          </div>
          <div className="stat-value">
            {status?.disk_percent != null ? `${status.disk_percent.toFixed(1)}%` : '--'}
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.min(status?.disk_percent ?? 0, 100)}%`,
                backgroundColor: (status?.disk_percent ?? 0) > 90 ? '#ef4444' : '#10b981'
              }}
            />
          </div>
          <div className="stat-sub">
            {status?.disk_used_gb != null && status?.disk_total_gb != null
              ? `${status.disk_used_gb} GB / ${status.disk_total_gb} GB used`
              : '--'}
          </div>
        </div>

        {/* Repositories Count Card */}
        <div className="stat-card">
          <div className="stat-header">
            <span>Active Repositories</span>
            <FolderGit2 size={18} color="#f59e0b" />
          </div>
          <div className="stat-value">{repositories.length}</div>
          <div className="stat-sub" style={{ marginTop: '1.25rem' }}>
            Managed FSFS Repositories
          </div>
        </div>
      </div>

      {/* Overview & Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
        {/* Server Health Overview */}
        <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} color="#10b981" />
            System Health & Environment
          </h3>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
            <li style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Daemon Status:</span>
              <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={14} /> Running (Healthy)
              </span>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Subversion Core:</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{status?.version || '1.16.3 (Subversion 1.16.3)'}</span>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Metadata Store:</span>
              <span>SQLite 3 (WAL Mode Active)</span>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Server Uptime:</span>
              <span>{status?.uptime_formatted || '--'}</span>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Rate Limiting & Shield:</span>
              <span style={{ color: '#3b82f6', fontWeight: 500 }}>Active (IP-based sliding window)</span>
            </li>
          </ul>
        </div>

        {/* Quick Launch & Actions */}
        <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Administration Quick Actions
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Create standard-layout Subversion repositories, verify consistency, or manage active checkout locks with a single click.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={onOpenCreateModal} style={{ justifyContent: 'center' }}>
              <FolderGit2 size={16} />
              Create New Repository Wizard
            </button>
            <button className="btn btn-secondary" onClick={onNavigateToRepos} style={{ justifyContent: 'center' }}>
              Manage All Repositories ({repositories.length})
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
