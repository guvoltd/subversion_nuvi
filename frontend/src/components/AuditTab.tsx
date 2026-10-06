import React, { useState, useEffect } from 'react';
import { ShieldCheck, Download, RefreshCw, Filter, Clock, User, Terminal, HardDrive } from 'lucide-react';
import { api } from '../services/api';

export const AuditTab: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [actor, setActor] = useState<string>('');
  const [actionName, setActionName] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({
        category: category || undefined,
        actor: actor.trim() || undefined,
        action_name: actionName.trim() || undefined,
        limit: 100
      });
      setLogs(data);
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [category]);

  const handleExportJsonl = () => {
    const url = `/api/v1/audit/export${category ? `?category=${category}` : ''}`;
    window.open(url, '_blank');
  };

  return (
    <div className="tab-pane">
      <div className="tab-header">
        <div>
          <h2>Structured Audit Logging & SIEM Telemetry</h2>
          <p className="tab-subtitle">
            Dual-tier audit logging recording administrative mutations and Subversion repository operational events with SIEM forwarder integration.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExportJsonl}>
            <Download size={14} />
            Export JSON Lines (SIEM)
          </button>
          <button className="btn btn-secondary btn-sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh Logs
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={15} color="#64748b" />
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Filters:</span>
          </div>

          <select
            className="form-control"
            style={{ width: '180px', height: '36px', fontSize: '0.85rem' }}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            <option value="operational">Operational Events</option>
            <option value="management">Management Audits</option>
          </select>

          <input
            type="text"
            className="form-control"
            style={{ width: '160px', height: '36px', fontSize: '0.85rem' }}
            placeholder="Filter by Actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />

          <input
            type="text"
            className="form-control"
            style={{ width: '200px', height: '36px', fontSize: '0.85rem' }}
            placeholder="Filter by Action Name"
            value={actionName}
            onChange={(e) => setActionName(e.target.value)}
          />

          <button className="btn btn-primary btn-sm" onClick={fetchLogs} disabled={loading}>
            Apply Filters
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>Loading audit records...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <ShieldCheck size={36} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
            <p style={{ color: '#64748b', margin: 0 }}>No audit logs recorded for the selected criteria.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '170px' }}>Timestamp (UTC)</th>
                  <th style={{ width: '130px' }}>Category</th>
                  <th style={{ width: '130px' }}>Actor</th>
                  <th style={{ width: '120px' }}>Client IP</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr>
                        <td style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: '#64748b' }}>
                          <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                        </td>
                        <td>
                          <span className={`badge badge-${log.category === 'operational' ? 'info' : 'warning'}`}>
                            {log.category}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}>
                            <User size={13} color="#64748b" />
                            {log.actor}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                          {log.client_ip}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                          {log.action}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#475569' }}>
                          {log.target_type && (
                            <span className="badge badge-secondary" style={{ marginRight: '0.4rem' }}>
                              {log.target_type}
                            </span>
                          )}
                          {log.target_id || '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {log.details ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            >
                              {isExpanded ? 'Hide' : 'View'}
                            </button>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && log.details && (
                        <tr>
                          <td colSpan={7} style={{ backgroundColor: '#f8fafc', padding: '0.75rem 1.5rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                              Detailed Payload JSON:
                            </div>
                            <pre style={{
                              margin: 0,
                              padding: '0.5rem',
                              backgroundColor: '#0f172a',
                              color: '#38bdf8',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              maxHeight: '180px',
                              overflowY: 'auto'
                            }}>
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
