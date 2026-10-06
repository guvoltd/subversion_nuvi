import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Package,
  FileArchive,
  FileCode,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Repository } from '../types';
import { api } from '../services/api';

interface ExportRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  repository: Repository | null;
}

export const ExportRepoModal: React.FC<ExportRepoModalProps> = ({
  isOpen,
  onClose,
  repository
}) => {
  const [format, setFormat] = useState<'zip' | 'dump.gz' | 'dump'>('zip');
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !repository) return null;

  const handleDownload = () => {
    setDownloading(true);
    const exportUrl = api.getExportUrl(repository.id, format);
    
    // Trigger browser file download
    const link = document.createElement('a');
    link.href = exportUrl;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloading(false);
      onClose();
    }, 1500);
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              padding: '0.55rem',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: '#60a5fa',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Download size={20} />
            </div>
            <div>
              <h3 className="modal-title" style={{ margin: 0 }}>
                Export Repository
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Repository: <strong style={{ color: 'var(--text-main)' }}>{repository.name}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Format Options */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>
            Select Export Format
          </label>

          {/* Option: ZIP */}
          <div
            onClick={() => setFormat('zip')}
            style={{
              padding: '0.85rem',
              borderRadius: '8px',
              border: `1px solid ${format === 'zip' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              backgroundColor: format === 'zip' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              transition: 'all 0.15s ease'
            }}
          >
            <Package size={20} color="#60a5fa" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-main)' }}>Full Portable Package (.zip)</span>
                <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Recommended</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0', lineHeight: 1.4 }}>
                Includes full SVN dump, path access rules (<code>authz</code>), user credentials (<code>htpasswd</code>), and hook scripts.
              </p>
            </div>
          </div>

          {/* Option: GZ */}
          <div
            onClick={() => setFormat('dump.gz')}
            style={{
              padding: '0.85rem',
              borderRadius: '8px',
              border: `1px solid ${format === 'dump.gz' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              backgroundColor: format === 'dump.gz' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              transition: 'all 0.15s ease'
            }}
          >
            <FileArchive size={20} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-main)' }}>Compressed SVN Dump (.dump.gz)</span>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0', lineHeight: 1.4 }}>
                Standard revision history dump compressed with Gzip for lightweight backups.
              </p>
            </div>
          </div>

          {/* Option: Raw Dump */}
          <div
            onClick={() => setFormat('dump')}
            style={{
              padding: '0.85rem',
              borderRadius: '8px',
              border: `1px solid ${format === 'dump' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              backgroundColor: format === 'dump' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              transition: 'all 0.15s ease'
            }}
          >
            <FileCode size={20} color="#a78bfa" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-main)' }}>Raw SVN Dump (.dump)</span>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0', lineHeight: 1.4 }}>
                Uncompressed native <code>svnadmin dump</code> stream for standard Subversion interoperability.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Download size={14} />
            <span>{downloading ? 'Preparing Download...' : 'Download Export'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
