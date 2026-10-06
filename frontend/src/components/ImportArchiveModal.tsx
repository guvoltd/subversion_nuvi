import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  ShieldCheck,
  Users,
  RefreshCw,
  FolderGit2
} from 'lucide-react';
import { ArchiveImportResponse } from '../types';
import { api } from '../services/api';

interface ImportArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ArchiveImportResponse) => void;
}

export const ImportArchiveModal: React.FC<ImportArchiveModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [repoName, setRepoName] = useState('');
  const [importAcls, setImportAcls] = useState(true);
  const [importUsers, setImportUsers] = useState(true);
  const [importHooks, setImportHooks] = useState(true);
  const [defaultPassword, setDefaultPassword] = useState('Welcome123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArchiveImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const f = e.target.files[0];
      setSelectedFile(f);
      setError(null);
      // Auto-suggest repository name from file name if blank
      if (!repoName.trim()) {
        const baseName = f.name.replace(/\.zip$/i, '').replace(/(\.dump|\.svndump)$/i, '');
        const clean = baseName.replace(/[^a-zA-Z0-9_\-]/g, '_');
        setRepoName(clean);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a .zip archive to import.');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (repoName.trim()) {
      formData.append('repo_name', repoName.trim());
    }
    formData.append('import_acls', importAcls ? 'true' : 'false');
    formData.append('import_users', importUsers ? 'true' : 'false');
    formData.append('import_hooks', importHooks ? 'true' : 'false');
    formData.append('default_password', defaultPassword.trim() || 'Welcome123!');

    try {
      const res = await api.importArchive(formData);
      setResult(res);
      onSuccess(res);
    } catch (err: any) {
      setError(err.message || 'Archive import failed. Please verify the archive format.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={loading ? undefined : onClose}>
      <div className="modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)'
              }}
            >
              <Archive size={18} />
            </div>
            <h3 className="modal-title">Import Repository Archive (.zip)</h3>
          </div>
          {!loading && (
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>

        {result ? (
          /* Success Screen */
          <div className="modal-body">
            <div
              style={{
                textAlign: 'center',
                padding: '1.5rem',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '12px',
                marginBottom: '1.5rem'
              }}
            >
              <CheckCircle2 size={44} color="#10b981" style={{ margin: '0 auto 0.75rem auto' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399' }}>
                Repository Successfully Imported!
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Repository <strong>{result.repository_name}</strong> has been restored and registered in Subversion Nuvi.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Revisions Loaded</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#60a5fa' }}>
                  {result.revisions_loaded} revs
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>VisualSVN Path ACLs</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#a78bfa' }}>
                  {result.rules_created} rules imported
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Groups & Users</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#34d399' }}>
                  {result.groups_created} groups / {result.users_created} users
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Hooks Installed</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f59e0b' }}>
                  {result.hooks_imported} hook scripts
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button type="button" className="btn btn-primary" onClick={handleFinish}>
                View Repository
              </button>
            </div>
          </div>
        ) : (
          /* Upload & Configuration Form */
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && (
                <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                Select a compressed <code className="mono">.zip</code> package containing an SVN dump (<code className="mono">*.dump</code>, <code className="mono">*.svndump</code>, <code className="mono">*.dump.gz</code>) or raw repository, along with VisualSVN configuration files (<code className="mono">authz</code>, <code className="mono">htpasswd</code>, <code className="mono">hooks</code>).
              </p>

              {/* Drag & Drop File Upload Box */}
              <div
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '12px',
                  padding: '1.75rem 1.25rem',
                  textAlign: 'center',
                  backgroundColor: 'rgba(15, 23, 42, 0.4)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                  marginBottom: '1.25rem'
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".zip"
                  onChange={handleFileChange}
                />
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-primary)',
                    marginBottom: '0.75rem'
                  }}
                >
                  <Upload size={22} />
                </div>
                {selectedFile ? (
                  <div>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.95rem' }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to import
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                      Click to browse or drop ZIP archive here
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                      Supports ZIP files with SVN Dump + VisualSVN authz, htpasswd, and hooks
                    </div>
                  </div>
                )}
              </div>

              {/* Target Repository Name */}
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Target Repository Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Auto-detected from archive if left blank"
                  value={repoName}
                  onChange={e => setRepoName(e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                  Alphanumeric characters, underscores, and dashes only.
                </div>
              </div>

              {/* Import Options Checkboxes */}
              <div
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  marginBottom: '1rem'
                }}
              >
                <label className="form-checkbox-label">
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={importAcls}
                    onChange={e => setImportAcls(e.target.checked)}
                  />
                  <span>
                    <strong>Import VisualSVN Path ACLs (<code className="mono">authz</code>)</strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Converts and migrates repository and subpath access rules into Nuvi ACL engine.
                    </div>
                  </span>
                </label>

                <label className="form-checkbox-label">
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={importUsers}
                    onChange={e => setImportUsers(e.target.checked)}
                  />
                  <span>
                    <strong>Auto-create Security Groups & Users</strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Extracts <code className="mono">[groups]</code>, user accounts, and <code className="mono">htpasswd</code> hashes.
                    </div>
                  </span>
                </label>

                <label className="form-checkbox-label">
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={importHooks}
                    onChange={e => setImportHooks(e.target.checked)}
                  />
                  <span>
                    <strong>Import Hook Scripts</strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Restores custom <code className="mono">pre-commit</code>, <code className="mono">post-commit</code>, and trigger scripts.
                    </div>
                  </span>
                </label>
              </div>

              {/* Default Password for new accounts */}
              {importUsers && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Default Password for Newly Created Users</label>
                  <input
                    type="text"
                    className="form-input"
                    value={defaultPassword}
                    onChange={e => setDefaultPassword(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !selectedFile}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Importing Archive...</span>
                  </>
                ) : (
                  <>
                    <Archive size={14} />
                    <span>Start Archive Import</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
