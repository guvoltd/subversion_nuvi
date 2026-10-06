import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Unlock,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Globe
} from 'lucide-react';
import { ShieldStatus } from '../types';
import { api } from '../services/api';

export const ShieldTab: React.FC = () => {
  const [shieldData, setShieldData] = useState<ShieldStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadShieldStatus();
  }, []);

  const loadShieldStatus = async () => {
    setLoading(true);
    try {
      const data = await api.getShieldStatus();
      setShieldData(data);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUnban = async (ipOrSubnet: string) => {
    try {
      const res = await api.unbanIp(ipOrSubnet);
      setMessage({ type: 'success', text: res.message });
      loadShieldStatus();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div>
      {/* Toast Alert */}
      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Top Status Cards */}
      <div className="card-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <span>Active IP Bans</span>
            <ShieldAlert size={18} color={shieldData && shieldData.active_bans_count > 0 ? '#ef4444' : '#10b981'} />
          </div>
          <div className="stat-value" style={{ color: shieldData && shieldData.active_bans_count > 0 ? '#ef4444' : '#10b981' }}>
            {shieldData?.active_bans_count ?? 0}
          </div>
          <div className="stat-sub">Temporarily blocked hosts / subnets</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>Failed Logins Tracked</span>
            <Globe size={18} color="#3b82f6" />
          </div>
          <div className="stat-value">
            {shieldData?.failed_attempts_tracked ?? 0}
          </div>
          <div className="stat-sub">Recent unsuccessful authentication attempts</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>Shield Protection Status</span>
            <ShieldCheck size={18} color="#10b981" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.3rem', color: '#10b981', paddingTop: '0.4rem' }}>
            Active & Enforcing
          </div>
          <div className="stat-sub">IPv6 /64 prefix clustering enabled</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Active Bans & Rate Limiting</h3>
        <button className="btn btn-secondary btn-sm" onClick={loadShieldStatus} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh Status
        </button>
      </div>

      {/* Banned IPs Table */}
      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Banned Subnet or IP</th>
              <th>Remaining Ban Duration</th>
              <th>Banned Until (UTC)</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {!shieldData || shieldData.banned_ips.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No active bans. The server is clear of malicious brute-force attempts.
                </td>
              </tr>
            ) : (
              shieldData.banned_ips.map((b, idx) => (
                <tr key={idx}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#f87171' }}>
                      {b.subnet_or_ip}
                    </span>
                  </td>
                  <td>{b.remaining_seconds} seconds</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{b.banned_until}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleUnban(b.subnet_or_ip)}
                    >
                      <Unlock size={13} />
                      Lift Ban
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Whitelist Overview */}
      <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={16} color="#10b981" />
          Trusted Subnets (Whitelist)
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Addresses matching the following CIDR ranges are exempt from brute-force rate-limiting and will never be banned.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(shieldData?.trusted_subnets || []).map((s, i) => (
            <span key={i} className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
