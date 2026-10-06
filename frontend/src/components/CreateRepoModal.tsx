import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderGit2, AlertTriangle } from 'lucide-react';
import { CreateRepositoryPayload } from '../types';
import { api } from '../services/api';

interface CreateRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateRepoModal: React.FC<CreateRepoModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initLayout, setInitLayout] = useState(true);
  const [layoutAuthor, setLayoutAuthor] = useState('admin');
  const [layoutMessage, setLayoutMessage] = useState('Initial project structure');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Repository name is required');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: CreateRepositoryPayload = {
      name: name.trim(),
      description: description.trim(),
      fs_type: 'fsfs',
      compatible_version: '1.14.0',
      init_standard_layout: initLayout,
      layout_author: initLayout ? layoutAuthor : undefined,
      layout_message: initLayout ? layoutMessage : undefined
    };

    try {
      await api.createRepository(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create repository');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderGit2 size={20} color="#3b82f6" />
            <h3 className="modal-title">Create Subversion Repository</h3>
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="alert alert-danger">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Repository Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. project-alpha"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                required
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                Only alphanumeric characters, dashes, and underscores.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Brief summary of repository purpose"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Storage Format</label>
              <select className="form-select" disabled value="fsfs">
                <option value="fsfs">FSFS (Fast Subversion Filesystem - Subversion 1.14 Compatible)</option>
              </select>
            </div>

            <div style={{
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '1rem',
              marginTop: '1rem'
            }}>
              <label className="form-checkbox-label" style={{ marginBottom: initLayout ? '1rem' : 0 }}>
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={initLayout}
                  onChange={e => setInitLayout(e.target.checked)}
                />
                <strong>Initialize default project structure (/trunk, /branches, /tags)</strong>
              </label>

              {initLayout && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <div>
                    <label className="form-label">Commit Author</label>
                    <input
                      type="text"
                      className="form-input"
                      value={layoutAuthor}
                      onChange={e => setLayoutAuthor(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Commit Message</label>
                    <input
                      type="text"
                      className="form-input"
                      value={layoutMessage}
                      onChange={e => setLayoutMessage(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating Repository...' : 'Create Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
