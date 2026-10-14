import React, { useState, useEffect } from 'react';
import {
  Key,
  Terminal,
  FolderGit2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Info,
  HelpCircle,
  ExternalLink,
  FolderTree,
  Search,
  Lock
} from 'lucide-react';
import { AuthUser, Repository, ServerConfig } from '../types';
import { api } from '../services/api';
import { buildCheckoutUrl } from '../utils/checkoutUrl';
import { CheckoutCopyButton } from './CheckoutCopyButton';
import { NUVI_LOGO_SRC } from '../assets/logo';

interface WelcomeTabProps {
  currentUser: AuthUser;
  repositories?: Repository[];
  onNavigateToBrowser?: (repoId: number) => void;
  onNavigateToRepos?: () => void;
}

export const WelcomeTab: React.FC<WelcomeTabProps> = ({
  currentUser,
  repositories = [],
  onNavigateToBrowser,
  onNavigateToRepos
}) => {
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [repoSearch, setRepoSearch] = useState('');
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);

  useEffect(() => {
    api.getServerConfig().then(setServerConfig).catch(() => {});
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentUser.id, newPassword);
      setSuccess('Your password has been changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRepos = repositories.filter(r =>
    r.name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Welcome Hero Banner with Hard-Embedded Logo and Watermark */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '2rem 2.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Subtle Watermark Crest */}
        <div
          className="hero-watermark-bg"
          style={{ backgroundImage: `url(${NUVI_LOGO_SRC})` }}
          aria-hidden="true"
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', zIndex: 1 }}>
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '16px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              flexShrink: 0,
              boxShadow: '0 8px 24px rgba(59, 130, 246, 0.2)'
            }}
          >
            <img
              src={NUVI_LOGO_SRC}
              alt="Subversion Nuvi Logo"
              width={52}
              height={52}
              style={{
                width: '52px',
                height: '52px',
                maxWidth: '52px',
                maxHeight: '52px',
                objectFit: 'contain',
                flexShrink: 0
              }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Welcome, {currentUser.username}!
              </h1>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.25rem 0.65rem',
                  borderRadius: '999px',
                  backgroundColor: currentUser.is_admin ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: currentUser.is_admin ? '#60a5fa' : '#34d399',
                  border: currentUser.is_admin ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
                }}
              >
                {currentUser.is_admin ? 'Server Administrator' : 'Standard User'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.925rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {currentUser.is_admin
                ? 'Full administrative control over repositories, user accounts, path access control, and server security.'
                : 'Access your assigned Subversion repositories, copy checkout links, browse directory trees, and manage your account.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', zIndex: 1 }}>
          <div
            style={{
              padding: '0.65rem 1rem',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#60a5fa' }}>{repositories.length}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assigned Repos</div>
          </div>
        </div>
      </div>

      {/* Accessible Repositories Section */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa'
              }}
            >
              <FolderGit2 size={17} />
            </div>
            <div>
              <h3 className="card-title" style={{ margin: 0, fontSize: '1.1rem' }}>
                Your Accessible Repositories ({repositories.length})
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Repositories where your account has assigned read/write permissions
              </span>
            </div>
          </div>

          {repositories.length > 3 && (
            <div className="search-input-wrapper" style={{ width: '240px' }}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Filter repositories..."
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                style={{ fontSize: '0.825rem', padding: '0.4rem 0.75rem 0.4rem 2rem' }}
              />
            </div>
          )}
        </div>

        <div className="card-body">
          {repositories.length === 0 ? (
            <div
              style={{
                padding: '3rem 1.5rem',
                textAlign: 'center',
                backgroundColor: 'rgba(15, 23, 42, 0.3)',
                borderRadius: '10px',
                border: '1px dashed var(--border-color)'
              }}
            >
              <FolderGit2 size={40} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)', opacity: 0.6 }} />
              <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)', fontSize: '1.05rem' }}>
                No Repositories Assigned Yet
              </h4>
              <p style={{ margin: '0 auto', maxWidth: '460px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Your account currently does not have access permissions assigned to any repository. Please ask a server administrator to grant your account access via <strong>Access Rules</strong>.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
              {filteredRepos.map((repo) => {
                const checkoutUrl = buildCheckoutUrl(repo.name, serverConfig);
                const checkoutCmd = `svn checkout ${checkoutUrl}`;

                return (
                  <div
                    key={repo.id}
                    style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.45)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '1.15rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                      transition: 'border-color 0.2s, transform 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FolderGit2 size={18} color="#60a5fa" />
                        <span style={{ fontWeight: 600, fontSize: '0.975rem', color: 'var(--text-main)' }}>
                          {repo.name}
                        </span>
                      </div>
                      <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                        r{repo.latest_revision}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      <div>
                        <strong>Latest Commit:</strong> {repo.latest_author ? `by ${repo.latest_author}` : 'Initial repository'}
                      </div>
                      {repo.latest_log && (
                        <div
                          style={{
                            marginTop: '0.2rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontStyle: 'italic',
                            color: 'var(--text-dim)'
                          }}
                          title={repo.latest_log}
                        >
                          "{repo.latest_log}"
                        </div>
                      )}
                    </div>

                    {/* Checkout Box */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '6px',
                        padding: '0.4rem 0.65rem',
                        fontSize: '0.78rem',
                        fontFamily: 'monospace',
                        color: '#93c5fd'
                      }}
                    >
                      <span style={{ flex: 1, overflowX: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {checkoutCmd}
                      </span>
                      <CheckoutCopyButton
                        repoName={repo.name}
                        serverConfig={serverConfig}
                        size="sm"
                        style={{ marginLeft: '0.4rem' }}
                      />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                      {onNavigateToBrowser && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onNavigateToBrowser(repo.id)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                        >
                          <FolderTree size={14} />
                          <span>Browse Files</span>
                        </button>
                      )}
                      {onNavigateToRepos && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={onNavigateToRepos}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                          title="View in Repositories"
                        >
                          <ExternalLink size={13} />
                          <span>Details</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout: Change Password & SVN Guide */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 460px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Column: Change Password */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa'
              }}
            >
              <Key size={16} />
            </div>
            <div>
              <h3 className="card-title" style={{ margin: 0, fontSize: '1.1rem' }}>Account Security</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Change your Subversion & Portal password
              </span>
            </div>
          </div>

          <div className="card-body">
            {error && (
              <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
                <CheckCircle2 size={16} />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  disabled
                  value={currentUser.username}
                  className="form-input"
                  style={{ opacity: 0.7, backgroundColor: 'rgba(15, 23, 42, 0.4)' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min. 4 characters)"
                  className="form-input"
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="form-input"
                  autoComplete="new-password"
                />
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={loading || !newPassword || !confirmPassword}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem' }}
                >
                  <Key size={15} />
                  <span>{loading ? 'Updating Password...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: SVN Working Guide */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399'
              }}
            >
              <Terminal size={16} />
            </div>
            <div>
              <h3 className="card-title" style={{ margin: 0, fontSize: '1.1rem' }}>Subversion Client Connection</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Command line usage and client workflow
              </span>
            </div>
          </div>

          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
            {/* Daily Workflow */}
            <div>
              <label className="form-label">Standard SVN Commands</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.35)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <code style={{ color: '#38bdf8', fontSize: '0.85rem' }}>svn update</code>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pull latest changes from server</span>
                </div>
                <div
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.35)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <code style={{ color: '#38bdf8', fontSize: '0.85rem' }}>svn status</code>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>View locally modified files</span>
                </div>
                <div
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.35)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <code style={{ color: '#38bdf8', fontSize: '0.85rem' }}>svn commit -m "Your note"</code>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Publish your revision</span>
                </div>
                <div
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.35)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <code style={{ color: '#38bdf8', fontSize: '0.85rem' }}>svn log -l 5</code>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>View recent commit history</span>
                </div>
              </div>
            </div>

            {/* Help Callout */}
            <div
              style={{
                marginTop: 'auto',
                padding: '0.85rem',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                lineHeight: 1.45
              }}
            >
              <Info size={16} color="#60a5fa" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: 'var(--text-main)' }}>Need access to additional repositories?</strong>
                <div>
                  Repository permissions are controlled via path-based access control. If you receive an <em>Access Forbidden (403)</em> error, contact your administrator to grant access to <strong>{currentUser.username}</strong>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
