import React, { useEffect, useState } from 'react';
import {
  Settings,
  Shield,
  Server,
  Terminal,
  Lock,
  Key,
  Globe,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calendar,
  HardDrive,
  Layers,
  ShieldCheck
} from 'lucide-react';
import { ServerConfig, Repository } from '../types';
import { api } from '../services/api';
import { NUVI_LOGO_SRC } from '../assets/logo';
import { OperationsTab } from './OperationsTab';
import { ShieldTab } from './ShieldTab';

export type SettingsSubTab =
  | 'schedules'
  | 'archives'
  | 'maintenance'
  | 'general'
  | 'certificates'
  | 'directory'
  | 'shield'
  | 'hooks'
  | 'replication';

interface SettingsTabProps {
  repositories?: Repository[];
  initialSubTab?: SettingsSubTab;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  repositories = [],
  initialSubTab = 'schedules'
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Certificate state
  const [activeCert, setActiveCert] = useState<any>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certMsg, setCertMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showSelfSignedForm, setShowSelfSignedForm] = useState(false);
  const [selfSignedCN, setSelfSignedCN] = useState('localhost');
  const [selfSignedSANs, setSelfSignedSANs] = useState('localhost, 127.0.0.1');
  const [selfSignedDays, setSelfSignedDays] = useState(365);

  // Directory / SSO state
  const [dirConfig, setDirConfig] = useState<any>(null);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirMsg, setDirMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchSettings = async () => {
    try {
      const [cfg, cert, dir] = await Promise.all([
        api.getServerConfig().catch(() => null),
        api.getActiveCertificate().catch(() => null),
        api.getDirectoryConfig().catch(() => null)
      ]);
      if (cfg) setConfig(cfg);
      if (cert) setActiveCert(cert);
      if (dir) setDirConfig(dir);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleGenerateSelfSigned = async (e: React.FormEvent) => {
    e.preventDefault();
    setCertLoading(true);
    setCertMsg(null);
    try {
      const sans = selfSignedSANs.split(',').map(s => s.trim()).filter(Boolean);
      await api.generateSelfSignedCert({
        common_name: selfSignedCN,
        san_list: sans,
        validity_days: selfSignedDays,
        organization: 'Subversion Nuvi Enterprise'
      });
      setCertMsg({ text: 'Self-signed certificate generated and installed successfully!', type: 'success' });
      setShowSelfSignedForm(false);
      const updated = await api.getActiveCertificate();
      setActiveCert(updated);
    } catch (err: any) {
      setCertMsg({ text: err.message || 'Failed to generate certificate', type: 'error' });
    } finally {
      setCertLoading(false);
    }
  };

  const handleSaveDirectory = async (e: React.FormEvent) => {
    e.preventDefault();
    setDirLoading(true);
    setDirMsg(null);
    try {
      await api.updateDirectoryConfig(dirConfig);
      setDirMsg({ text: 'Directory configuration saved successfully!', type: 'success' });
    } catch (err: any) {
      setDirMsg({ text: err.message || 'Failed to save configuration', type: 'error' });
    } finally {
      setDirLoading(false);
    }
  };

  const handleTestDirConnection = async () => {
    setDirLoading(true);
    setDirMsg(null);
    try {
      const res = await api.testDirectoryConnection();
      setDirMsg({ text: `Connection successful: ${res.message} (${res.latency_ms}ms)`, type: 'success' });
    } catch (err: any) {
      setDirMsg({ text: err.message || 'Connection test failed', type: 'error' });
    } finally {
      setDirLoading(false);
    }
  };

  const handleSyncDirectory = async () => {
    setDirLoading(true);
    setDirMsg(null);
    try {
      const res = await api.syncDirectory();
      setDirMsg({ text: res.message || 'Directory sync completed.', type: 'success' });
    } catch (err: any) {
      setDirMsg({ text: err.message || 'Directory sync failed', type: 'error' });
    } finally {
      setDirLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Settings Navigation Bar */}
      <div style={{
        display: 'flex',
        gap: '0.45rem',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '0.75rem',
        overflowX: 'auto',
        flexWrap: 'nowrap',
        alignItems: 'center',
        scrollbarWidth: 'thin'
      }}>
        <button
          className={`btn ${activeSubTab === 'schedules' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('schedules')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <Calendar size={14} />
          <span>Backup Schedules</span>
        </button>

        <button
          className={`btn ${activeSubTab === 'archives' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('archives')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <HardDrive size={14} />
          <span>Backup Archives & DR</span>
        </button>

        <button
          className={`btn ${activeSubTab === 'maintenance' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('maintenance')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <Layers size={14} />
          <span>Storage & Maintenance</span>
        </button>

        <button
          className={`btn ${activeSubTab === 'general' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('general')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <Server size={14} />
          <span>General & Storage</span>
        </button>

        <button
          className={`btn ${activeSubTab === 'certificates' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('certificates')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <Key size={14} />
          <span>SSL/TLS Certificates</span>
        </button>

        <button
          className={`btn ${activeSubTab === 'directory' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('directory')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <Globe size={14} />
          <span>Directory & SSO</span>
        </button>

        <button
          className={`btn ${activeSubTab === 'shield' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('shield')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <Shield size={14} />
          <span>Security & Shield</span>
        </button>

        <button
          className={`btn ${activeSubTab === 'hooks' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('hooks')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <ShieldCheck size={14} />
          <span>Security Hooks</span>
        </button>

        <button
          className={`btn ${activeSubTab === 'replication' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubTab('replication')}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <RefreshCw size={14} />
          <span>Multi-Site Replication</span>
        </button>
      </div>

      {/* Subtab Description Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-0.25rem', marginBottom: '0.25rem' }}>
        {activeSubTab === 'schedules' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Automated periodic backup queues (<code>BackupScheduleJob</code>) running in the background. Configurable per-repository or globally with custom backup destinations.
          </p>
        )}
        {activeSubTab === 'archives' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Point-in-time backup archives and disaster recovery restoration manager (<code>BackupArchive</code>).
          </p>
        )}
        {activeSubTab === 'maintenance' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            FSFS shard packing (<code>svnadmin pack</code>), dead transactions purge, and disk space profiler (<code>StorageBreakdown</code>).
          </p>
        )}
        {activeSubTab === 'general' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Subversion Nuvi server identity, repository storage roots, and native C++ FSFS compatibility layer.
          </p>
        )}
        {activeSubTab === 'certificates' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Manage X.509 SSL/TLS certificates, RSA 2048/4096 key pairs, CSR generation, and HTTPS encryption.
          </p>
        )}
        {activeSubTab === 'directory' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Centralized directory integration with OpenLDAP, Active Directory, SAML 2.0, and OpenID Connect.
          </p>
        )}
        {activeSubTab === 'shield' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Brute-force protection, failed attempt thresholds, IP blacklisting, and subnet whitelisting.
          </p>
        )}
        {activeSubTab === 'hooks' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Pre-packaged hook policy engine (<code>pre-commit</code> / <code>post-commit</code>) enforced directly at repository level.
          </p>
        )}
        {activeSubTab === 'replication' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Distributed Multi-Site Replication (VDFS) cluster synchronization, seed exports, and master promotion.
          </p>
        )}
      </div>

      {/* Subtab Content 1: Backup Schedules (BackupScheduleJob) */}
      {activeSubTab === 'schedules' && (
        <OperationsTab
          repositories={repositories}
          initialSubTab="schedules"
          hideSubTabBar
          hideHeader
        />
      )}

      {/* Subtab Content 2: Backup Archives (BackupArchive) */}
      {activeSubTab === 'archives' && (
        <OperationsTab
          repositories={repositories}
          initialSubTab="archives"
          hideSubTabBar
          hideHeader
        />
      )}

      {/* Subtab Content 3: Storage Breakdown & Maintenance (StorageBreakdown) */}
      {activeSubTab === 'maintenance' && (
        <OperationsTab
          repositories={repositories}
          initialSubTab="maintenance"
          hideSubTabBar
          hideHeader
        />
      )}

      {/* Subtab Content 4: Security Hooks Engine */}
      {activeSubTab === 'hooks' && (
        <OperationsTab
          repositories={repositories}
          initialSubTab="hooks"
          hideSubTabBar
          hideHeader
        />
      )}

      {/* Subtab Content 5: Multi-Site Replication */}
      {activeSubTab === 'replication' && (
        <OperationsTab
          repositories={repositories}
          initialSubTab="replication"
          hideSubTabBar
          hideHeader
        />
      )}

      {/* Subtab Content 6: General Server & Storage Identity */}
      {activeSubTab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
            <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <img
                  src={NUVI_LOGO_SRC}
                  alt="Nuvi Logo"
                  width={22}
                  height={22}
                  style={{ width: '22px', height: '22px', maxWidth: '22px', maxHeight: '22px', objectFit: 'contain', flexShrink: 0 }}
                />
                Server Identity & Storage
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Server Instance Name:</div>
                  <div style={{ fontWeight: 600 }}>{config?.server_name || 'Subversion Nuvi Core'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Repositories Storage Root:</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem', background: 'var(--bg-primary)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                    {config?.repositories_root || '/opt/nuvi/data/repositories'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Subversion Client Access Prefix:</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
                    {config?.svn_url_prefix || '/svn'}
                  </div>
                </div>
              </div>
            </div>

            {/* Native Subversion Compatibility Layer */}
            <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Terminal size={18} color="#8b5cf6" />
                Native Subversion Compatibility Layer
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Subversion Nuvi binds directly to Apache Subversion's C shared libraries (<code className="mono">libsvn_fs-1.so</code>, <code className="mono">libsvn_repos-1.so</code>, <code className="mono">libapr-1.so</code>). Every repository created is 100% compliant with standard FSFS file structure, fully interoperable with command line <code className="mono">svn</code>, <code className="mono">svnadmin</code>, TortoiseSVN, Eclipse Subversive, and Apache HTTPD <code className="mono">mod_dav_svn</code>.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                <span className="badge badge-success">FSFS Sharded Storage</span>
                <span className="badge badge-success">Rep-Sharing Active</span>
                <span className="badge badge-success">Atomic Revisions</span>
                <span className="badge badge-success">Portable Dumps Compatible</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab Content 7: SSL/TLS Certificate Lifecycle */}
      {activeSubTab === 'certificates' && (
        <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Key size={18} color="#f59e0b" />
              SSL/TLS Certificate Lifecycle (Pillar 11)
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowSelfSignedForm(!showSelfSignedForm)}
                style={{ fontSize: '0.8rem' }}
                type="button"
              >
                {showSelfSignedForm ? 'Cancel' : 'Generate Self-Signed Certificate'}
              </button>
            </div>
          </div>

          {certMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              backgroundColor: certMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: certMsg.type === 'success' ? '#10b981' : '#ef4444',
              fontSize: '0.875rem'
            }}>
              {certMsg.text}
            </div>
          )}

          {showSelfSignedForm && (
            <form onSubmit={handleGenerateSelfSigned} style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border-subtle)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>Generate New Self-Signed X.509 Certificate</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Common Name (FQDN / IP)</label>
                  <input
                    type="text"
                    value={selfSignedCN}
                    onChange={e => setSelfSignedCN(e.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Subject Alternative Names (Comma-separated)</label>
                  <input
                    type="text"
                    value={selfSignedSANs}
                    onChange={e => setSelfSignedSANs(e.target.value)}
                    className="input"
                    placeholder="localhost, svn.corp.local, 192.168.1.100"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Validity (Days)</label>
                  <input
                    type="number"
                    value={selfSignedDays}
                    onChange={e => setSelfSignedDays(Number(e.target.value))}
                    className="input"
                    min="30"
                    max="3650"
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={certLoading} style={{ fontSize: '0.85rem' }}>
                {certLoading ? 'Generating RSA 2048 & Signing...' : 'Generate & Activate Certificate'}
              </button>
            </form>
          )}

          {activeCert?.installed ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Common Name (Subject):</div>
                <div style={{ fontWeight: 600 }}>{activeCert.common_name}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Issuer Organization:</div>
                <div style={{ fontWeight: 600 }}>{activeCert.issuer}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Status & Expiration:</div>
                <div>
                  <span className={`badge ${activeCert.is_expired ? 'badge-danger' : 'badge-success'}`}>
                    {activeCert.is_expired ? 'Expired' : `${activeCert.days_remaining} days remaining`}
                  </span>
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>SHA256 Fingerprint:</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeCert.sha256_fingerprint}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No SSL/TLS certificate installed. The server is currently operating with plaintext HTTP.
            </div>
          )}
        </div>
      )}

      {/* Subtab Content 8: Directory & SSO Integration */}
      {activeSubTab === 'directory' && (
        <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Globe size={18} color="#06b6d4" />
            Enterprise Directory & SSO Integration (LDAP / Active Directory / SAML / OIDC)
          </h3>

          {dirMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              backgroundColor: dirMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: dirMsg.type === 'success' ? '#10b981' : '#ef4444',
              fontSize: '0.875rem'
            }}>
              {dirMsg.text}
            </div>
          )}

          {dirConfig && (
            <form onSubmit={handleSaveDirectory}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Provider Type</label>
                  <select
                    value={dirConfig.provider_type || 'ldap'}
                    onChange={e => setDirConfig({ ...dirConfig, provider_type: e.target.value })}
                    className="input"
                  >
                    <option value="ldap">OpenLDAP / Generic LDAP</option>
                    <option value="ad">Microsoft Active Directory</option>
                    <option value="saml">SAML 2.0 Identity Provider</option>
                    <option value="oidc">OpenID Connect (OIDC / OAuth2)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Enable Provider</label>
                  <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                      <input
                        type="checkbox"
                        checked={dirConfig.is_enabled || false}
                        onChange={e => setDirConfig({ ...dirConfig, is_enabled: e.target.checked })}
                      />
                      Enable External Authentication
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Directory Server URL</label>
                  <input
                    type="text"
                    value={dirConfig.server_url || ''}
                    onChange={e => setDirConfig({ ...dirConfig, server_url: e.target.value })}
                    className="input"
                    placeholder="ldaps://dc01.corp.internal:636"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Base Search DN</label>
                  <input
                    type="text"
                    value={dirConfig.base_dn || ''}
                    onChange={e => setDirConfig({ ...dirConfig, base_dn: e.target.value })}
                    className="input"
                    placeholder="DC=corp,DC=internal"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Service Bind DN</label>
                  <input
                    type="text"
                    value={dirConfig.bind_dn || ''}
                    onChange={e => setDirConfig({ ...dirConfig, bind_dn: e.target.value })}
                    className="input"
                    placeholder="CN=NuviService,OU=ServiceAccounts,DC=corp,DC=internal"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Bind Password {dirConfig.bind_password_set && <span style={{ color: '#10b981' }}>(Password Configured)</span>}
                  </label>
                  <input
                    type="password"
                    value={dirConfig.bind_password || ''}
                    onChange={e => setDirConfig({ ...dirConfig, bind_password: e.target.value })}
                    className="input"
                    placeholder={dirConfig.bind_password_set ? '••••••••' : 'Enter bind password'}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={dirLoading} style={{ fontSize: '0.85rem' }}>
                  Save Directory Settings
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={dirLoading}
                  onClick={handleTestDirConnection}
                  style={{ fontSize: '0.85rem' }}
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={dirLoading || !dirConfig.is_enabled}
                  onClick={handleSyncDirectory}
                  style={{ fontSize: '0.85rem' }}
                >
                  <RefreshCw size={14} style={{ marginRight: '0.3rem' }} />
                  Sync Directory Now
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Subtab Content 9: Security & Shield Policy (+ Live Shield view) */}
      {activeSubTab === 'shield' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={18} color="#10b981" />
              Security & Brute-Force Shield Policy
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Password Guessing Ban Threshold:</span>
                <span style={{ fontWeight: 600 }}>{config?.ban_threshold || 5} failed attempts</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sliding Attempt Window:</span>
                <span>{config?.ban_reset_seconds || 600} seconds (10 min)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>IP Ban Duration:</span>
                <span>{config?.ban_duration_seconds || 1800} seconds (30 min)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Minimum Password Length:</span>
                <span>{config?.password_min_length || 10} characters</span>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Trusted Subnets (Whitelist):</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {(config?.trusted_subnets || ['127.0.0.1/32', '::1/128']).map((s, idx) => (
                    <span key={idx} className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Embedded live IP ban monitor */}
          <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} color="#60a5fa" />
              Active IP Bans & Protection Status
            </h3>
            <ShieldTab />
          </div>
        </div>
      )}
    </div>
  );
};
