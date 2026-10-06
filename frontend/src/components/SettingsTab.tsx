import React, { useEffect, useState } from 'react';
import { Settings, Shield, Server, Terminal, Lock, Key, Globe, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { ServerConfig } from '../types';
import { api } from '../services/api';
import { NUVI_LOGO_SRC } from '../assets/logo';

export const SettingsTab: React.FC = () => {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
        {/* Server Identity & Paths */}
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

        {/* Security & Brute Force Shield Policy */}
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
      </div>

      {/* SSL/TLS Certificate Lifecycle (Pillar 11) */}
      <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Key size={18} color="#f59e0b" />
            SSL/TLS Certificate Lifecycle (Pillar 11)
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowSelfSignedForm(!showSelfSignedForm)}
              style={{ fontSize: '0.8rem' }}
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

      {/* Enterprise Directory & SSO Integration (Pillar 3) */}
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

      {/* Subversion Engine & Compatibility Info */}
      <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={18} color="#8b5cf6" />
          Native Subversion Compatibility Layer
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Subversion Nuvi binds directly to Apache Subversion's C shared libraries (<code className="mono">libsvn_fs-1.so</code>, <code className="mono">libsvn_repos-1.so</code>, <code className="mono">libapr-1.so</code>). Every repository created is 100% compliant with standard FSFS file structure, fully interoperable with command line <code className="mono">svn</code>, <code className="mono">svnadmin</code>, TortoiseSVN, Eclipse Subversive, and Apache HTTPD <code className="mono">mod_dav_svn</code>.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <span className="badge badge-success">FSFS Sharded Storage</span>
          <span className="badge badge-success">Rep-Sharing Active</span>
          <span className="badge badge-success">Atomic Revisions</span>
          <span className="badge badge-success">Portable Dumps Compatible</span>
        </div>
      </div>
    </div>
  );
};
