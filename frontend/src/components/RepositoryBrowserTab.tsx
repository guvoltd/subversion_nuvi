import React, { useState, useEffect } from 'react';
import {
  Folder,
  FileCode,
  FolderUp,
  Download,
  Upload,
  Eye,
  GitCommit,
  GitBranch,
  Copy,
  Check,
  CheckCircle,
  FileText,
  Clock,
  User,
  History,
  Edit3,
  Plus,
  Trash2,
  FolderPlus,
  GitFork,
  AlertTriangle,
  FolderTree
} from 'lucide-react';
import { Repository } from '../types';
import { api } from '../services/api';

interface RepositoryBrowserTabProps {
  repositories: Repository[];
}

export const RepositoryBrowserTab: React.FC<RepositoryBrowserTabProps> = ({ repositories }) => {
  const [selectedRepoId, setSelectedRepoId] = useState<number>(repositories[0]?.id || 1);
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [treeData, setTreeData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // File Viewer & In-Browser Edit Modal
  const [viewingFile, setViewingFile] = useState<any | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [editedContent, setEditedContent] = useState<string>('');
  const [fileTab, setFileTab] = useState<'content' | 'edit' | 'blame' | 'diff'>('content');
  const [blameData, setBlameData] = useState<any[]>([]);
  const [diffText, setDiffText] = useState<string>('');
  const [viewerLoading, setViewerLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [editMessage, setEditMessage] = useState('Update file via Web Console');
  const [savingEdit, setSavingEdit] = useState(false);

  // Upload Modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
  const [uploadAuthor, setUploadAuthor] = useState('web-dev');
  const [uploadMessage, setUploadMessage] = useState('Web file upload');
  const [uploading, setUploading] = useState(false);

  // New File Modal
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [newFileMessage, setNewFileMessage] = useState('Create new file via Web Console');

  // New Folder Modal
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderMessage, setNewFolderMessage] = useState('Create new folder via Web Console');

  // Branch / Tag Modal
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchSourcePath, setBranchSourcePath] = useState('');
  const [branchTargetPath, setBranchTargetPath] = useState('');
  const [branchMessage, setBranchMessage] = useState('Create branch/tag via Web Console');

  // Delete Path Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<any | null>(null);
  const [deleteMessage, setDeleteMessage] = useState('Delete path via Web Console');
  const [submittingOp, setSubmittingOp] = useState(false);

  useEffect(() => {
    if (repositories.length > 0 && (!selectedRepoId || !repositories.some(r => r.id === selectedRepoId))) {
      setSelectedRepoId(repositories[0].id);
      setCurrentPath('/');
    }
  }, [repositories, selectedRepoId]);

  useEffect(() => {
    if (selectedRepoId) {
      loadTree(selectedRepoId, currentPath);
    }
  }, [selectedRepoId, currentPath]);

  const loadTree = async (repoId: number, path: string) => {
    setLoading(true);
    try {
      const res = await api.browseTree(repoId, path);
      setTreeData(res);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (newPath: string) => {
    setCurrentPath(newPath);
  };

  const handleGoUp = () => {
    if (currentPath === '/' || !currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = '/' + parts.join('/');
    setCurrentPath(upPath);
  };

  const handleOpenFile = async (entry: any) => {
    setViewingFile(entry);
    setFileTab('content');
    setViewerLoading(true);
    try {
      const catRes = await api.catFile(selectedRepoId, entry.path);
      setFileContent(catRes.content);
      setEditedContent(catRes.content);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setViewerLoading(false);
    }
  };

  const loadBlame = async () => {
    if (!viewingFile) return;
    setViewerLoading(true);
    try {
      const res = await api.getBlame(selectedRepoId, viewingFile.path);
      setBlameData(res.lines || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setViewerLoading(false);
    }
  };

  const loadDiff = async () => {
    if (!viewingFile) return;
    setViewerLoading(true);
    try {
      const rev2 = viewingFile.last_changed_rev;
      const rev1 = Math.max(1, rev2 - 1);
      const res = await api.getFileDiff(selectedRepoId, viewingFile.path, rev1, rev2);
      setDiffText(res.diff || 'No differences detected against previous revision.');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setViewerLoading(false);
    }
  };

  const handleFileTabChange = (tab: 'content' | 'edit' | 'blame' | 'diff') => {
    setFileTab(tab);
    if (tab === 'blame' && blameData.length === 0) {
      loadBlame();
    } else if (tab === 'diff' && !diffText) {
      loadDiff();
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFileObj) return;

    setUploading(true);
    const targetFilePath = currentPath === '/' ? `/${uploadFileObj.name}` : `${currentPath}/${uploadFileObj.name}`;
    try {
      const res = await api.uploadFile(
        selectedRepoId,
        targetFilePath,
        uploadFileObj,
        uploadAuthor,
        uploadMessage
      );
      setUploadModalOpen(false);
      setUploadFileObj(null);
      setMessage({ type: 'success', text: `Committed '${targetFilePath}' as revision ${res.committed_revision}.` });
      loadTree(selectedRepoId, currentPath);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!viewingFile) return;
    setSavingEdit(true);
    try {
      const res = await api.commitFile(selectedRepoId, {
        path: viewingFile.path,
        content: editedContent,
        commit_message: editMessage
      });
      setFileContent(editedContent);
      setFileTab('content');
      setMessage({ type: 'success', text: `Committed '${viewingFile.path}' as revision ${res.committed_revision}.` });
      loadTree(selectedRepoId, currentPath);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilePath.trim()) return;
    setSubmittingOp(true);
    const targetPath = newFilePath.startsWith('/') ? newFilePath : `${currentPath === '/' ? '' : currentPath}/${newFilePath.trim()}`;
    try {
      const res = await api.commitFile(selectedRepoId, {
        path: targetPath,
        content: newFileContent,
        commit_message: newFileMessage
      });
      setNewFileModalOpen(false);
      setNewFilePath('');
      setNewFileContent('');
      setMessage({ type: 'success', text: `Committed new file '${targetPath}' as revision ${res.committed_revision}.` });
      loadTree(selectedRepoId, currentPath);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingOp(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setSubmittingOp(true);
    const targetPath = newFolderName.startsWith('/') ? newFolderName : `${currentPath === '/' ? '' : currentPath}/${newFolderName.trim()}`;
    try {
      await api.mkdir(selectedRepoId, {
        path: targetPath,
        commit_message: newFolderMessage
      });
      setNewFolderModalOpen(false);
      setNewFolderName('');
      setMessage({ type: 'success', text: `Directory '${targetPath}' created successfully.` });
      loadTree(selectedRepoId, currentPath);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingOp(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchSourcePath.trim() || !branchTargetPath.trim()) return;
    setSubmittingOp(true);
    try {
      await api.copyBranchTag(selectedRepoId, {
        source_path: branchSourcePath.trim(),
        target_path: branchTargetPath.trim(),
        commit_message: branchMessage
      });
      setBranchModalOpen(false);
      setMessage({ type: 'success', text: `Created branch/tag '${branchTargetPath}' successfully.` });
      loadTree(selectedRepoId, currentPath);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingOp(false);
    }
  };

  const handleDeletePath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingEntry) return;
    setSubmittingOp(true);
    try {
      await api.deletePath(selectedRepoId, {
        path: deletingEntry.path,
        commit_message: deleteMessage
      });
      setDeleteModalOpen(false);
      setDeletingEntry(null);
      setMessage({ type: 'success', text: `Path '${deletingEntry.path}' deleted successfully.` });
      loadTree(selectedRepoId, currentPath);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingOp(false);
    }
  };

  // Breadcrumbs calculation
  const pathParts = currentPath.split('/').filter(Boolean);

  if (repositories.length === 0) {
    return (
      <div className="card" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
        <FolderTree size={48} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)', opacity: 0.5 }} />
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)' }}>No Accessible Repositories</h3>
        <p style={{ margin: '0 auto', maxWidth: '480px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          You do not have access rights assigned to any repository. Please contact your system administrator to grant repository permissions.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Toast Alert */}
      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Top Controls: Repository Selector & Actions */}
      <div className="action-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            style={{ width: '240px' }}
            value={selectedRepoId}
            onChange={e => {
              setSelectedRepoId(Number(e.target.value));
              setCurrentPath('/');
            }}
          >
            {repositories.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} (r{r.latest_revision})
              </option>
            ))}
          </select>

          {/* Breadcrumbs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '0.45rem 0.85rem',
            fontSize: '0.875rem'
          }}>
            <button
              onClick={() => handleNavigate('/')}
              style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}
            >
              root
            </button>
            {pathParts.map((part, idx) => {
              const fullSubPath = '/' + pathParts.slice(0, idx + 1).join('/');
              return (
                <React.Fragment key={idx}>
                  <span style={{ color: 'var(--text-dim)', margin: '0 0.35rem' }}>/</span>
                  <button
                    onClick={() => handleNavigate(fullSubPath)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: idx === pathParts.length - 1 ? 'var(--text-main)' : '#60a5fa',
                      cursor: 'pointer',
                      fontWeight: idx === pathParts.length - 1 ? 600 : 400
                    }}
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setNewFilePath('');
              setNewFileContent('');
              setNewFileMessage('Create file via Web Console');
              setNewFileModalOpen(true);
            }}
          >
            <Plus size={14} />
            New File
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setNewFolderName('');
              setNewFolderMessage('Create folder via Web Console');
              setNewFolderModalOpen(true);
            }}
          >
            <FolderPlus size={14} />
            New Folder
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setBranchSourcePath(currentPath === '/' ? '/trunk' : currentPath);
              setBranchTargetPath(currentPath === '/' ? '/branches/my-branch' : `${currentPath}-copy`);
              setBranchMessage('Branch/tag creation via Web Console');
              setBranchModalOpen(true);
            }}
          >
            <GitFork size={14} />
            Branch / Tag
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setUploadModalOpen(true)}
          >
            <Upload size={14} />
            Upload File
          </button>
          <a
            href={`/api/v1/browser/${selectedRepoId}/zip?path=${encodeURIComponent(currentPath)}`}
            className="btn btn-secondary btn-sm"
            download
            title="Download this folder and subfiles as a ZIP archive"
          >
            <Download size={14} />
            ZIP
          </a>
        </div>
      </div>

      {/* Directory Contents Table */}
      <div className="table-container" style={{ marginBottom: '1.5rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Revision</th>
              <th>Author</th>
              <th>Commit Message</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPath !== '/' && (
              <tr>
                <td colSpan={6}>
                  <button
                    onClick={handleGoUp}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontWeight: 600
                    }}
                  >
                    <FolderUp size={16} />
                    .. (Parent Directory)
                  </button>
                </td>
              </tr>
            )}

            {!treeData || treeData.entries.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  This folder is empty. Use "Upload File" to commit new content.
                </td>
              </tr>
            ) : (
              treeData.entries.map((entry: any) => (
                <tr key={entry.path}>
                  <td>
                    {entry.is_dir ? (
                      <button
                        onClick={() => handleNavigate(entry.path)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#60a5fa',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <Folder size={16} color="#3b82f6" />
                        {entry.name}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenFile(entry)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <FileCode size={16} color="#94a3b8" />
                        {entry.name}
                      </button>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    {entry.is_dir ? '—' : `${((entry.size_bytes || 0) / 1024).toFixed(1)} KB`}
                  </td>
                  <td>
                    <span className="badge badge-info">r{entry.last_changed_rev}</span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {entry.last_author || '—'}
                  </td>
                  <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {entry.last_log || '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                      {!entry.is_dir && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenFile(entry)}
                            title="View / Edit File Content"
                          >
                            <Eye size={13} />
                            View
                          </button>
                          <a
                            href={`/api/v1/browser/${selectedRepoId}/raw?path=${encodeURIComponent(entry.path)}`}
                            className="btn btn-secondary btn-sm"
                            download={entry.name}
                            title="Download Raw File"
                          >
                            <Download size={13} />
                          </a>
                        </>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setDeletingEntry(entry);
                          setDeleteMessage(`Delete ${entry.name} via Web Console`);
                          setDeleteModalOpen(true);
                        }}
                        title={`Delete ${entry.is_dir ? 'Directory' : 'File'}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Embedded README.md Preview */}
      {treeData?.readme && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginTop: '1.5rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '1rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            color: 'var(--text-muted)'
          }}>
            <FileText size={16} />
            README.md
          </div>
          <div style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.6,
            fontSize: '0.9rem',
            color: 'var(--text-main)'
          }}>
            {treeData.readme}
          </div>
        </div>
      )}

      {/* File Viewer Modal (Code, Blame, Diff) */}
      {viewingFile && (
        <div className="modal-backdrop" onClick={() => setViewingFile(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileCode size={20} color="#3b82f6" />
                <h3 className="modal-title" style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>
                  {viewingFile.path}
                </h3>
              </div>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setViewingFile(null)}
              >
                ✕
              </button>
            </div>

            {/* Viewer Subtabs */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 1.5rem',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              borderBottom: '1px solid var(--border-color)',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn btn-sm ${fileTab === 'content' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleFileTabChange('content')}
                >
                  <FileText size={13} />
                  Code Viewer
                </button>
                <button
                  className={`btn btn-sm ${fileTab === 'edit' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleFileTabChange('edit')}
                >
                  <Edit3 size={13} />
                  Edit & Commit
                </button>
                <button
                  className={`btn btn-sm ${fileTab === 'blame' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleFileTabChange('blame')}
                >
                  <History size={13} />
                  Blame / Annotate
                </button>
                <button
                  className={`btn btn-sm ${fileTab === 'diff' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleFileTabChange('diff')}
                >
                  <GitCommit size={13} />
                  Diff vs r{Math.max(1, viewingFile.last_changed_rev - 1)}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleCopyCode}>
                  {copiedCode ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={`/api/v1/browser/${selectedRepoId}/raw?path=${encodeURIComponent(viewingFile.path)}`}
                  className="btn btn-secondary btn-sm"
                  download={viewingFile.name}
                >
                  <Download size={13} />
                  Raw
                </a>
              </div>
            </div>

            <div className="modal-body" style={{ padding: 0 }}>
              {viewerLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Loading file data...
                </div>
              ) : fileTab === 'edit' ? (
                /* In-Browser File Editor */
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Commit Log Message
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={editMessage}
                      onChange={e => setEditMessage(e.target.value)}
                      placeholder="Commit message describing edits"
                    />
                  </div>
                  <textarea
                    style={{
                      width: '100%',
                      minHeight: '340px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      resize: 'vertical',
                      lineHeight: 1.5,
                      boxSizing: 'border-box'
                    }}
                    value={editedContent}
                    onChange={e => setEditedContent(e.target.value)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEditedContent(fileContent);
                        setFileTab('content');
                      }}
                    >
                      Discard Edits
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                    >
                      <GitCommit size={13} />
                      {savingEdit ? 'Committing...' : 'Commit Changes'}
                    </button>
                  </div>
                </div>
              ) : fileTab === 'content' ? (
                /* Monospace Code View with Line Numbers */
                <div style={{ display: 'flex', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                  <div style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    color: 'var(--text-dim)',
                    padding: '1rem 0.75rem',
                    textAlign: 'right',
                    userSelect: 'none',
                    borderRight: '1px solid var(--border-color)'
                  }}>
                    {fileContent.split('\n').map((_, idx) => (
                      <div key={idx}>{idx + 1}</div>
                    ))}
                  </div>
                  <pre style={{ margin: 0, padding: '1rem', overflowX: 'auto', flex: 1, backgroundColor: 'var(--bg-primary)' }}>
                    <code>{fileContent}</code>
                  </pre>
                </div>
              ) : fileTab === 'blame' ? (
                /* Blame View */
                <table className="data-table" style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  <tbody>
                    {blameData.map(l => (
                      <tr key={l.line_number}>
                        <td style={{ width: '40px', color: 'var(--text-dim)', textAlign: 'right', userSelect: 'none' }}>
                          {l.line_number}
                        </td>
                        <td style={{ width: '70px', color: '#60a5fa' }}>r{l.revision}</td>
                        <td style={{ width: '120px', color: '#a78bfa' }}>{l.author}</td>
                        <td style={{ whiteSpace: 'pre', color: 'var(--text-main)' }}>{l.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                /* Unified Diff View */
                <pre style={{
                  margin: 0,
                  padding: '1rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--bg-primary)',
                  lineHeight: 1.5
                }}>
                  {diffText.split('\n').map((line, idx) => {
                    let color = 'inherit';
                    let bg = 'transparent';
                    if (line.startsWith('+')) {
                      color = '#34d399';
                      bg = 'rgba(16, 185, 129, 0.1)';
                    } else if (line.startsWith('-')) {
                      color = '#f87171';
                      bg = 'rgba(239, 68, 68, 0.1)';
                    } else if (line.startsWith('@@')) {
                      color = '#60a5fa';
                    }
                    return (
                      <div key={idx} style={{ color, backgroundColor: bg, padding: '0 0.25rem' }}>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewingFile(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Modal */}
      {uploadModalOpen && (
        <div className="modal-backdrop" onClick={() => setUploadModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Upload File to {currentPath}</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setUploadModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Select File *</label>
                  <input
                    type="file"
                    className="form-input"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFileObj(e.target.files[0]);
                      }
                    }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Commit Author</label>
                  <input
                    type="text"
                    className="form-input"
                    value={uploadAuthor}
                    onChange={e => setUploadAuthor(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Commit Message</label>
                  <input
                    type="text"
                    className="form-input"
                    value={uploadMessage}
                    onChange={e => setUploadMessage(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setUploadModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? 'Uploading & Committing...' : 'Commit File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New File Modal */}
      {newFileModalOpen && (
        <div className="modal-backdrop" onClick={() => setNewFileModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Create New File</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setNewFileModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateFile}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">File Name or Relative Path *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. config.json or docs/README.md"
                    value={newFilePath}
                    onChange={e => setNewFilePath(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                    Parent directory: <code>{currentPath}</code>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">File Content</label>
                  <textarea
                    className="form-input"
                    rows={8}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                    placeholder="Enter file contents..."
                    value={newFileContent}
                    onChange={e => setNewFileContent(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Commit Message *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newFileMessage}
                    onChange={e => setNewFileMessage(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setNewFileModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submittingOp}>
                  {submittingOp ? 'Committing...' : 'Create & Commit File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {newFolderModalOpen && (
        <div className="modal-backdrop" onClick={() => setNewFolderModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Directory</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setNewFolderModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Folder Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. features or src/utils"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                    Created under: <code>{currentPath}</code>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Commit Message *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newFolderMessage}
                    onChange={e => setNewFolderMessage(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setNewFolderModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submittingOp}>
                  {submittingOp ? 'Creating...' : 'Create Directory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Branch / Tag Modal */}
      {branchModalOpen && (
        <div className="modal-backdrop" onClick={() => setBranchModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Branch or Tag (Copy)</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setBranchModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateBranch}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Source Path *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. /trunk"
                    value={branchSourcePath}
                    onChange={e => setBranchSourcePath(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Target Destination Path *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. /branches/feature-x or /tags/v1.0"
                    value={branchTargetPath}
                    onChange={e => setBranchTargetPath(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Commit Message *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={branchMessage}
                    onChange={e => setBranchMessage(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setBranchModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submittingOp}>
                  {submittingOp ? 'Creating Copy...' : 'Create Branch / Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && deletingEntry && (
        <div className="modal-backdrop" onClick={() => setDeleteModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Delete {deletingEntry.is_dir ? 'Directory' : 'File'}</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setDeleteModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleDeletePath}>
              <div className="modal-body">
                <p style={{ color: 'var(--text-main)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  Are you sure you want to permanently delete <strong>{deletingEntry.path}</strong>?
                  This action commits a deletion revision to the Subversion repository.
                </p>
                <div className="form-group">
                  <label className="form-label">Commit Message *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={deleteMessage}
                    onChange={e => setDeleteMessage(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={submittingOp}>
                  {submittingOp ? 'Deleting...' : 'Delete Path'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
