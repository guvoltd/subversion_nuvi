import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  Key,
  Lock,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Shield,
  X,
  CheckCircle2
} from 'lucide-react';
import { AuthUser, PersonalAccessToken, PATCreatedResponse } from '../types';
import { api } from '../services/api';
import { NUVI_LOGO_SRC } from '../assets/logo';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'password' | 'tokens'>('password');

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  // PAT State
  const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenDays, setNewTokenDays] = useState<number>(30);
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [createdToken, setCreatedToken] = useState<PATCreatedResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && activeTab === 'tokens' && currentUser?.is_admin) {
      loadTokens();
    }
  }, [isOpen, activeTab, currentUser]);

  const loadTokens = async () => {
    setTokensLoading(true);
    setTokenError(null);
    try {
      const data = await api.listMyTokens();
      setTokens(data);
    } catch (err: any) {
      setTokenError(err.message || 'Failed to load tokens');
    } finally {
      setTokensLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 4) {
      setPwError('Password must be at least 4 characters.');
      return;
    }

    setPwLoading(true);
    try {
      await api.changeMyPassword({
        current_password: currentPassword,
        new_password: newPassword
      });
      setPwSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.message || 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;

    setTokensLoading(true);
    setTokenError(null);
    try {
      const res = await api.createToken({
        name: newTokenName.trim(),
        expires_in_days: newTokenDays === 0 ? null : newTokenDays
      });
      setCreatedToken(res);
      setNewTokenName('');
      setShowCreateToken(false);
      await loadTokens();
    } catch (err: any) {
      setTokenError(err.message || 'Failed to create token');
    } finally {
      setTokensLoading(false);
    }
  };

  const handleRevokeToken = async (id: number) => {
    if (!window.confirm('Are you sure you want to revoke this Personal Access Token?')) return;
    try {
      await api.revokeToken(id);
      await loadTokens();
    } catch (err: any) {
      setTokenError(err.message || 'Failed to revoke token');
    }
  };

  const handleCopy = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img
              src={NUVI_LOGO_SRC}
              alt="Nuvi Logo"
              width={34}
              height={34}
              style={{
                width: '34px',
                height: '34px',
                maxWidth: '34px',
                maxHeight: '34px',
                objectFit: 'contain',
                borderRadius: '8px',
                flexShrink: 0
              }}
            />
            <div>
              <h3 className="modal-title" style={{ margin: 0 }}>
                {currentUser?.is_admin ? 'User Account & Security Profile' : 'Change Password'}
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Logged in as <strong style={{ color: 'var(--text-main)' }}>{currentUser?.username}</strong></span>
                {currentUser?.is_admin ? (
                  <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                    Administrator
                  </span>
                ) : (
                  <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                    Standard User
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Subtabs (Admin Only) */}
        {currentUser?.is_admin && (
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.65rem 1.5rem',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0
          }}>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'password' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('password')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Key size={14} />
              <span>Change Password</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'tokens' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('tokens')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Lock size={14} />
              <span>App Passwords & Personal Tokens</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="modal-body">
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              {pwError && (
                <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
                  <AlertCircle size={16} />
                  <span>{pwError}</span>
                </div>
              )}

              {pwSuccess && (
                <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
                  <CheckCircle2 size={16} />
                  <span>{pwSuccess}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Current Password *</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  placeholder="Enter current password"
                  className="form-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">New Password *</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Enter new password"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password *</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repeat new password"
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="btn btn-primary"
                >
                  {pwLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'tokens' && (
            <div>
              {/* Token banner notification */}
              {createdToken && (
                <div className="alert alert-success" style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                      <CheckCircle2 size={16} />
                      <span>Personal Access Token Created ({createdToken.name})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreatedToken(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Dismiss
                    </button>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#a7f3d0' }}>
                    Make sure to copy your personal access token now. You won't be able to see it again!
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      readOnly
                      value={createdToken.token}
                      className="form-input"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#34d399', backgroundColor: 'var(--bg-primary)' }}
                    />
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="btn btn-secondary btn-sm"
                      style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}

              {tokenError && (
                <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
                  <AlertCircle size={16} />
                  <span>{tokenError}</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Active Access Tokens</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                    Use PATs to authenticate Subversion CLI, TortoiseSVN, or CI/CD pipelines.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateToken(!showCreateToken)}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Plus size={14} />
                  <span>Generate Token</span>
                </button>
              </div>

              {showCreateToken && (
                <form
                  onSubmit={handleCreateToken}
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.25rem'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-main)' }}>
                    Generate New Personal Access Token
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Token Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Laptop SVN, Jenkins CI"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        required
                        className="form-input"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Expiration</label>
                      <select
                        value={newTokenDays}
                        onChange={(e) => setNewTokenDays(Number(e.target.value))}
                        className="form-select"
                      >
                        <option value={7}>7 Days</option>
                        <option value={30}>30 Days</option>
                        <option value={90}>90 Days</option>
                        <option value={0}>No Expiration</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowCreateToken(false)}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={tokensLoading}
                      className="btn btn-primary btn-sm"
                    >
                      Create
                    </button>
                  </div>
                </form>
              )}

              {/* Tokens Table */}
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Prefix</th>
                      <th>Created</th>
                      <th>Expires</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>
                          No Personal Access Tokens found. Click "Generate Token" to create one.
                        </td>
                      </tr>
                    ) : (
                      tokens.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{t.name}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#60a5fa' }}>
                            {t.token_prefix}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            {t.expires_at ? new Date(t.expires_at).toLocaleDateString() : 'Never'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => handleRevokeToken(t.id)}
                              className="btn btn-danger btn-sm"
                              title="Revoke Token"
                              style={{ padding: '0.25rem 0.5rem' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
