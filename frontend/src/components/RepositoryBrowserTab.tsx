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
  FolderTree,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  RefreshCw,
  Bell,
  CheckCheck,
  ExternalLink,
  Filter,
  Info
} from 'lucide-react';
import { Repository, AdminNotification } from '../types';
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

  // Commit Logs Modal
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logsPath, setLogsPath] = useState('/');
  const [logsContextPath, setLogsContextPath] = useState('/');
  const [commitLogs, setCommitLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsLimit, setLogsLimit] = useState<number>(100);
  const [expandedLogRev, setExpandedLogRev] = useState<number | null>(null);
  const [copiedRev, setCopiedRev] = useState<number | null>(null);

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

  // Repository Updates & Notification View State
  const [viewMode, setViewMode] = useState<'browser' | 'notifications'>('browser');
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [notifRepoFilter, setNotifRepoFilter] = useState<number | 'all'>('all');
  const [notifSearch, setNotifSearch] = useState('');
  const [notifUnreadCount, setNotifUnreadCount] = useState<number>(0);
  const [expandedNotifId, setExpandedNotifId] = useState<number | null>(null);

  const loadNotifications = React.useCallback(async (silent: boolean = false) => {
    if (!silent) setNotifLoading(true);
    try {
      const res = await api.getNotifications({
        repository_id: notifRepoFilter !== 'all' ? notifRepoFilter : undefined,
        limit: 100,
        auto_sync: true
      });
      setNotifications(res.notifications || []);
      setNotifUnreadCount(res.unread_count);
    } catch (err: any) {
      if (!silent) {
        setMessage({ type: 'error', text: err.message || 'Failed to load notifications' });
      }
    } finally {
      if (!silent) setNotifLoading(false);
    }
  }, [notifRepoFilter]);

  // Initial load of unread count and external event listeners
  useEffect(() => {
    api.getUnreadNotificationsCount().then((res) => {
      setNotifUnreadCount(res.unread_count);
    }).catch(() => {});

    const handleSwitch = (e: any) => {
      if (e.detail?.view === 'notifications') {
        setViewMode('notifications');
        if (e.detail?.repositoryId) {
          setNotifRepoFilter(e.detail.repositoryId);
        }
        if (e.detail?.notificationId) {
          setExpandedNotifId(e.detail.notificationId);
        }
      }
    };

    const handleUpdated = () => {
      loadNotifications(true);
    };

    window.addEventListener('nuvi_switch_browser_view', handleSwitch);
    window.addEventListener('nuvi_notifications_updated', handleUpdated);
    return () => {
      window.removeEventListener('nuvi_switch_browser_view', handleSwitch);
      window.removeEventListener('nuvi_notifications_updated', handleUpdated);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (viewMode === 'notifications') {
      loadNotifications();
    }
  }, [viewMode, notifRepoFilter, loadNotifications]);

  const handleMarkNotifRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setNotifUnreadCount((prev) => Math.max(0, prev - 1));
      setMessage({ type: 'success', text: 'Notification marked as read.' });
      window.dispatchEvent(new Event('nuvi_notifications_updated'));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update notification' });
    }
  };

  const handleMarkNotifUnread = async (id: number) => {
    try {
      await api.markNotificationUnread(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)));
      setNotifUnreadCount((prev) => prev + 1);
      setMessage({ type: 'success', text: 'Notification marked as unread.' });
      window.dispatchEvent(new Event('nuvi_notifications_updated'));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update notification' });
    }
  };

  const handleMarkAllNotifsRead = async () => {
    try {
      const targetRepo = notifRepoFilter !== 'all' ? notifRepoFilter : undefined;
      const res = await api.markAllNotificationsRead(targetRepo);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setNotifUnreadCount(0);
      setMessage({ type: 'success', text: res.message || 'All notifications marked as read.' });
      window.dispatchEvent(new Event('nuvi_notifications_updated'));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to mark notifications read' });
    }
  };

  const handleClearReadNotifs = async () => {
    try {
      const targetRepo = notifRepoFilter !== 'all' ? notifRepoFilter : undefined;
      const res = await api.clearReadNotifications(targetRepo);
      setNotifications((prev) => prev.filter((n) => !n.is_read));
      setMessage({ type: 'success', text: res.message || 'Cleared read notifications.' });
      window.dispatchEvent(new Event('nuvi_notifications_updated'));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to clear read notifications' });
    }
  };

  const handleDeleteNotif = async (id: number) => {
    try {
      await api.deleteNotification(id);
      const target = notifications.find((n) => n.id === id);
      if (target && !target.is_read) {
        setNotifUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setMessage({ type: 'success', text: 'Notification deleted.' });
      window.dispatchEvent(new Event('nuvi_notifications_updated'));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete notification' });
    }
  };

  const handleJumpToPath = (repoId: number | null, pathStr: string) => {
    if (repoId) {
      setSelectedRepoId(repoId);
    }
    let target = pathStr.trim();
    if (!target.startsWith('/')) target = '/' + target;
    const parts = target.split('/').filter(Boolean);
    let parentFolder = '/';
    if (parts.length > 1) {
      parts.pop();
      parentFolder = '/' + parts.join('/');
    }
    setCurrentPath(parentFolder);
    setViewMode('browser');
    setMessage({ type: 'success', text: `Navigated to directory '${parentFolder}' in file browser.` });
  };

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

  const handleOpenLogs = async (path: string, limit: number = logsLimit, contextPath?: string) => {
    const targetPath = path || '/';
    setLogsPath(targetPath);
    if (contextPath !== undefined) {
      setLogsContextPath(contextPath || '/');
    } else {
      setLogsContextPath(targetPath);
    }
    setLogsModalOpen(true);
    setLogsLoading(true);
    setLogsSearch('');
    setExpandedLogRev(null);
    try {
      const res = await api.getCommitLogs(selectedRepoId, targetPath, limit);
      setCommitLogs(res.logs || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load commit logs' });
      setCommitLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCopyRevision = (rev: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(`r${rev}`).catch(() => {});
    setCopiedRev(rev);
    setTimeout(() => setCopiedRev(null), 2000);
  };

  const filteredLogs = commitLogs.filter((log: any) => {
    if (!logsSearch.trim()) return true;
    const q = logsSearch.toLowerCase();
    const revMatch = `r${log.revision}`.toLowerCase().includes(q) || String(log.revision).includes(q);
    const authorMatch = (log.author || '').toLowerCase().includes(q);
    const msgMatch = (log.message || '').toLowerCase().includes(q);
    const pathMatch = (log.changed_paths || []).some((cp: any) => (cp.path || '').toLowerCase().includes(q));
    return revMatch || authorMatch || msgMatch || pathMatch;
  });

  const filteredNotifications = notifications.filter((n) => {
    if (notifFilter === 'unread' && n.is_read) return false;
    if (notifFilter === 'read' && !n.is_read) return false;
    if (!notifSearch.trim()) return true;
    const q = notifSearch.toLowerCase();
    const revMatch = n.revision !== null && (`r${n.revision}`.toLowerCase().includes(q) || String(n.revision).includes(q));
    const repoMatch = (n.repository_name || '').toLowerCase().includes(q);
    const authorMatch = (n.author || '').toLowerCase().includes(q);
    const msgMatch = (n.message || '').toLowerCase().includes(q);
    const summaryMatch = (n.summary || '').toLowerCase().includes(q);
    const pathMatch = (n.changed_paths || []).some((cp) => (cp.path || '').toLowerCase().includes(q));
    return revMatch || repoMatch || authorMatch || msgMatch || summaryMatch || pathMatch;
  });

  const unreadNotifsCount = notifications.filter((n) => !n.is_read).length;
  const readNotifsCount = notifications.filter((n) => n.is_read).length;

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

      {/* Sub-View Switcher: File Browser vs Built-in Notifications */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.75rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'browser' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('browser')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.85rem' }}
          >
            <FolderTree size={15} />
            <span>Browse Files & Folders</span>
          </button>

          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'notifications' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setViewMode('notifications');
              loadNotifications();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.85rem',
              position: 'relative'
            }}
          >
            <Bell size={15} />
            <span>Repository Updates & Notifications</span>
            {notifUnreadCount > 0 && (
              <span
                style={{
                  backgroundColor: viewMode === 'notifications' ? '#ffffff' : '#ef4444',
                  color: viewMode === 'notifications' ? '#ef4444' : '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  borderRadius: '9999px',
                  padding: '0.1rem 0.45rem',
                  lineHeight: 1,
                  marginLeft: '4px'
                }}
              >
                {notifUnreadCount}
              </span>
            )}
          </button>
        </div>

        {viewMode === 'notifications' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => loadNotifications()}
              disabled={notifLoading}
              title="Synchronize repository commits with notifications"
            >
              <RefreshCw size={13} className={notifLoading ? 'spin' : ''} />
              Sync & Refresh
            </button>
            {notifUnreadCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleMarkAllNotifsRead}
                title="Mark all notifications as read"
              >
                <CheckCheck size={13} />
                Mark All Read
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClearReadNotifs}
              title="Delete notifications marked as read"
            >
              <Trash2 size={13} />
              Clear Read
            </button>
          </div>
        )}
      </div>

      {viewMode === 'browser' && (
        <>
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
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpenLogs(currentPath, logsLimit, currentPath)}
            title="View commit history logs for current directory"
          >
            <History size={14} />
            Commit Logs
          </button>
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenLogs(entry.path, logsLimit, entry.path);
                      }}
                      className="badge badge-info"
                      style={{
                        cursor: 'pointer',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        borderRadius: '6px',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                      title={`Click to view commit logs for ${entry.is_dir ? 'folder' : 'file'} "${entry.name}"`}
                    >
                      <History size={11} />
                      r{entry.last_changed_rev}
                    </button>
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
    </>
  )}

  {/* Built-in Full Notification View Page */}
  {viewMode === 'notifications' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
      {/* Notifications Toolbar */}
      <div
        className="action-bar"
        style={{
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Repository Filter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Folder size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              className="form-select"
              style={{ width: '220px', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
              value={notifRepoFilter}
              onChange={(e) => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                setNotifRepoFilter(val);
              }}
            >
              <option value="all">All Repositories</option>
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (r{r.latest_revision})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Tabs (All / Unread / Read) */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid var(--border-color)'
            }}
          >
            <button
              type="button"
              onClick={() => setNotifFilter('all')}
              className={`btn btn-sm ${notifFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderRadius: '4px' }}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setNotifFilter('unread')}
              className={`btn btn-sm ${notifFilter === 'unread' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderRadius: '4px' }}
            >
              Unread ({unreadNotifsCount})
            </button>
            <button
              type="button"
              onClick={() => setNotifFilter('read')}
              className={`btn btn-sm ${notifFilter === 'read' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderRadius: '4px' }}
            >
              Read ({readNotifsCount})
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-dim)'
            }}
          />
          <input
            type="text"
            className="form-control"
            placeholder="Search revision, message, author, path..."
            value={notifSearch}
            onChange={(e) => setNotifSearch(e.target.value)}
            style={{ paddingLeft: '32px', fontSize: '0.85rem', width: '100%' }}
          />
        </div>
      </div>

      {/* Notifications Feed */}
      {notifLoading ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem', color: 'var(--accent-primary)' }} />
          <div>Synchronizing repository update history...</div>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px'
          }}
        >
          <Bell size={40} style={{ margin: '0 auto 0.75rem', color: 'var(--text-muted)', opacity: 0.5 }} />
          <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)' }}>No Notifications Found</h4>
          <p style={{ margin: '0 auto', maxWidth: '420px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {notifSearch
              ? 'No notifications match your current search query.'
              : notifFilter === 'unread'
              ? 'All repository updates have been marked as read.'
              : 'Any commits, uploads or changes made to repositories will automatically appear here until marked as read.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filteredNotifications.map((notif) => {
            const paths = notif.changed_paths || [];
            const firstChangedPath = paths.length > 0 ? paths[0].path || '/' : '/';

            return (
              <div
                key={notif.id}
                className="card"
                style={{
                  padding: '1.15rem 1.35rem',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  borderLeft: !notif.is_read ? '4px solid #3b82f6' : '4px solid var(--border-color)',
                  boxShadow: !notif.is_read ? '0 4px 14px rgba(59, 130, 246, 0.08)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Top Row: Meta Tags & Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.65rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    {/* Revision Pill with click to copy */}
                    {notif.revision !== null && (
                      <button
                        type="button"
                        onClick={() => handleCopyRevision(notif.revision!)}
                        className="badge"
                        style={{
                          backgroundColor: 'rgba(59, 130, 246, 0.2)',
                          color: '#60a5fa',
                          border: '1px solid rgba(59, 130, 246, 0.35)',
                          borderRadius: '6px',
                          padding: '0.22rem 0.6rem',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                        title="Click to copy revision number"
                      >
                        <GitCommit size={13} />
                        r{notif.revision}
                        {copiedRev === notif.revision ? (
                          <Check size={12} color="#10b981" />
                        ) : (
                          <Copy size={11} style={{ opacity: 0.6 }} />
                        )}
                      </button>
                    )}

                    {/* Repository Tag */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: 'var(--text-main)',
                        fontWeight: 600
                      }}
                    >
                      <Folder size={12} color="#38bdf8" />
                      {notif.repository_name}
                    </span>

                    {/* Author */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)'
                      }}
                    >
                      <User size={13} />
                      <strong style={{ color: 'var(--text-main)' }}>{notif.author || 'system'}</strong>
                    </span>

                    {/* Date & Time */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        color: 'var(--text-dim)'
                      }}
                    >
                      <Clock size={13} />
                      {notif.created_at ? new Date(notif.created_at).toLocaleString() : ''}
                    </span>

                    {/* Read / Unread Status Pill */}
                    {!notif.is_read ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          backgroundColor: 'rgba(59, 130, 246, 0.2)',
                          color: '#38bdf8',
                          border: '1px solid rgba(59, 130, 246, 0.35)',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          letterSpacing: '0.03em'
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#38bdf8'
                          }}
                        ></span>
                        UNREAD
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          color: 'var(--text-dim)',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: 500
                        }}
                      >
                        <Check size={11} color="var(--text-dim)" />
                        READ
                      </span>
                    )}
                  </div>

                  {/* Card Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    {!notif.is_read ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleMarkNotifRead(notif.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
                        title="Mark this update as read"
                      >
                        <Check size={13} color="#10b981" />
                        Mark Read
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleMarkNotifUnread(notif.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
                        title="Mark this update as unread"
                      >
                        Mark Unread
                      </button>
                    )}

                    {paths.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleJumpToPath(notif.repository_id, firstChangedPath)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
                        title={`Jump to folder in File Browser (${firstChangedPath})`}
                      >
                        <ExternalLink size={13} />
                        View in Browser
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDeleteNotif(notif.id)}
                      style={{ color: '#f87171', padding: '0.35rem 0.5rem' }}
                      title="Delete notification"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Commit Message Box */}
                <div
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '0.75rem 1rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    color: 'var(--text-main)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {notif.message ? notif.message.trim() : notif.summary || 'Commit update recorded.'}
                </div>

                {/* Changed Paths List (Detailed Log Viewer view) */}
                {paths.length > 0 && (
                  <div
                    style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '0.35rem',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)'
                      }}
                    >
                      <span>
                        Changed Paths ({paths.length} file{paths.length > 1 ? 's' : ''})
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Click path to copy &bull; Click arrow to jump
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3rem',
                        maxHeight: '260px',
                        overflowY: 'auto',
                        paddingRight: '0.25rem'
                      }}
                    >
                      {paths.map((p, pIdx) => {
                        const pathStr = typeof p === 'string' ? p : p.path || '';
                        const action =
                          typeof p === 'object' && p.action ? String(p.action).trim().toUpperCase() : 'M';
                        const kindStr = typeof p === 'object' ? p.kind : '';
                        const copyfrom =
                          typeof p === 'object' && p.copyfrom_path
                            ? `${p.copyfrom_path}${p.copyfrom_rev ? '@r' + p.copyfrom_rev : ''}`
                            : '';

                        const actionColors: Record<string, { bg: string; text: string; label: string }> = {
                          A: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', label: 'Added' },
                          M: { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6', label: 'Modified' },
                          D: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444', label: 'Deleted' },
                          R: { bg: 'rgba(168, 85, 247, 0.2)', text: '#a855f7', label: 'Replaced' }
                        };
                        const act = actionColors[action] || {
                          bg: 'rgba(148, 163, 184, 0.2)',
                          text: '#94a3b8',
                          label: action
                        };

                        return (
                          <div
                            key={pIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem',
                              fontFamily: 'var(--font-mono)',
                              padding: '0.3rem 0.5rem',
                              borderRadius: '5px',
                              backgroundColor: 'rgba(255, 255, 255, 0.02)',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)')
                            }
                          >
                            <span
                              style={{
                                backgroundColor: act.bg,
                                color: act.text,
                                padding: '0.12rem 0.45rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                minWidth: '20px',
                                textAlign: 'center',
                                flexShrink: 0
                              }}
                              title={act.label}
                            >
                              {action}
                            </span>

                            <span
                              onClick={() => {
                                if (pathStr) {
                                  navigator.clipboard.writeText(pathStr).catch(() => {});
                                  setMessage({
                                    type: 'success',
                                    text: `Copied path "${pathStr}" to clipboard`
                                  });
                                }
                              }}
                              style={{
                                color: 'var(--text-main)',
                                wordBreak: 'break-all',
                                flex: 1,
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                              title="Click to copy path"
                            >
                              {pathStr || '/'}
                            </span>

                            {copyfrom && (
                              <span
                                style={{
                                  color: 'var(--text-dim)',
                                  fontSize: '0.72rem',
                                  fontStyle: 'italic',
                                  flexShrink: 0
                                }}
                              >
                                (from {copyfrom})
                              </span>
                            )}

                            {kindStr && (
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', flexShrink: 0 }}>
                                [{kindStr}]
                              </span>
                            )}

                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleJumpToPath(notif.repository_id, pathStr)}
                              style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem', color: '#60a5fa' }}
                              title={`Open ${pathStr} in File Browser`}
                            >
                              <ExternalLink size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleOpenLogs(viewingFile.path, logsLimit, viewingFile.path)}
                  title="View commit logs for this file"
                >
                  <History size={13} />
                  Commit Logs
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

      {/* Commit Logs / History Modal */}
      {logsModalOpen && (
        <div className="modal-backdrop" onClick={() => setLogsModalOpen(false)}>
          <div
            className="modal-content"
            style={{
              maxWidth: '920px',
              width: '95%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
              borderRadius: '16px',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#3b82f6'
                }}>
                  <History size={20} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    Commit Logs
                    <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                      for <code>{logsPath || '/'}</code>
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Repository: <strong>{repositories.find(r => r.id === selectedRepoId)?.name || 'Repository'}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleOpenLogs(logsPath, logsLimit, logsContextPath)}
                  title="Refresh commit logs"
                  disabled={logsLoading}
                >
                  <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.25rem', padding: '0.25rem 0.5rem' }}
                  onClick={() => setLogsModalOpen(false)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* History Scope Selector Bar (Entire Repository vs Current Path) */}
            <div style={{
              padding: '0.65rem 1.5rem',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>History Scope:</span>
                <div style={{
                  display: 'inline-flex',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  padding: '2px',
                  gap: '2px'
                }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${logsPath === '/' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderRadius: '4px', fontWeight: 600 }}
                    onClick={() => handleOpenLogs('/', logsLimit, logsContextPath)}
                    disabled={logsLoading}
                    title="View all repository commits across all branches and folders without revision gaps"
                  >
                    Entire Repository (/)
                  </button>
                  {logsContextPath && logsContextPath !== '/' && (
                    <button
                      type="button"
                      className={`btn btn-sm ${logsPath === logsContextPath ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderRadius: '4px', fontWeight: 600 }}
                      onClick={() => handleOpenLogs(logsContextPath, logsLimit, logsContextPath)}
                      disabled={logsLoading}
                      title={`View commits affecting ${logsContextPath} only`}
                    >
                      Current Path ({logsContextPath})
                    </button>
                  )}
                </div>
              </div>

              {/* Informational Help Note */}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, justifyContent: 'flex-end', minWidth: '240px' }}>
                <Info size={13} color={logsPath === '/' ? '#10b981' : '#60a5fa'} style={{ flexShrink: 0 }} />
                {logsPath !== '/' ? (
                  <span>
                    Showing commits touching <code>{logsPath}</code>. For full continuous revision sequence (1..HEAD), select <strong>Entire Repository (/)</strong>.
                  </span>
                ) : (
                  <span>
                    Showing complete repository history (all revisions in sequential order without folder gaps).
                  </span>
                )}
              </div>
            </div>

            {/* Filter / Search Bar & Limit Controls */}
            <div style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
                <Search size={15} color="var(--text-dim)" />
                <input
                  type="text"
                  className="form-input"
                  style={{ margin: 0, padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                  placeholder="Filter commits by message, author, or revision (e.g. r2)..."
                  value={logsSearch}
                  onChange={e => setLogsSearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>Limit:</span>
                  <select
                    className="form-input"
                    style={{ margin: 0, padding: '0.25rem 0.6rem', fontSize: '0.8rem', width: 'auto', cursor: 'pointer' }}
                    value={logsLimit}
                    onChange={(e) => {
                      const newLim = Number(e.target.value);
                      setLogsLimit(newLim);
                      handleOpenLogs(logsPath, newLim, logsContextPath);
                    }}
                    disabled={logsLoading}
                  >
                    <option value={10}>10 commits</option>
                    <option value={25}>25 commits</option>
                    <option value={50}>50 commits</option>
                    <option value={100}>100 commits</option>
                    <option value={250}>250 commits</option>
                    <option value={500}>500 commits</option>
                    <option value={1000}>1000 (All) commits</option>
                  </select>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Showing {filteredLogs.length} of {commitLogs.length} {commitLogs.length === 1 ? 'commit' : 'commits'}
                </div>
              </div>
            </div>

            {/* Modal Body / Logs List */}
            <div className="modal-body custom-scrollbar" style={{
              padding: '1rem 1.5rem',
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: '1 1 auto',
              minHeight: 0,
              maxHeight: 'calc(90vh - 220px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              {logsLoading ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem auto', display: 'block' }} />
                  Retrieving Subversion commit logs from repository...
                </div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                  <GitCommit size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5, display: 'block' }} />
                  {commitLogs.length === 0
                    ? `No commit history found for "${logsPath}".`
                    : `No commits matching filter "${logsSearch}".`}
                </div>
              ) : (
                <>
                  {filteredLogs.map((log: any) => {
                    const isExpanded = expandedLogRev === log.revision;
                    const pathsList: any[] = Array.isArray(log.changed_paths) ? log.changed_paths : [];
                    const fileCount = pathsList.length;

                    return (
                      <div
                        key={log.revision}
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: `1px solid ${isExpanded ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          borderRadius: '10px',
                          overflow: 'hidden',
                          boxShadow: isExpanded ? '0 4px 14px rgba(0, 0, 0, 0.25)' : 'none',
                          transition: 'all 0.15s ease',
                          flexShrink: 0,
                          flexGrow: 0,
                          minHeight: 'fit-content',
                          width: '100%'
                        }}
                      >
                        {/* Log Header Row (Clickable to toggle details) */}
                        <div
                          onClick={() => setExpandedLogRev(isExpanded ? null : log.revision)}
                          style={{
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            backgroundColor: isExpanded ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                            cursor: 'pointer',
                            userSelect: 'none',
                            minHeight: '44px'
                          }}
                          title={isExpanded ? 'Click to collapse details' : 'Click to view full commit details and changed paths'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                            <button
                              onClick={(e) => handleCopyRevision(log.revision, e)}
                              className="badge badge-info"
                              style={{
                                border: 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.25rem 0.55rem',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                borderRadius: '6px'
                              }}
                              title="Click to copy revision number"
                            >
                              {copiedRev === log.revision ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                              r{log.revision}
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600 }}>
                              <User size={13} color="var(--text-muted)" />
                              {log.author || 'anonymous'}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              <Clock size={12} />
                              {log.date ? new Date(log.date).toLocaleString() : '—'}
                            </div>

                            {/* Collapsed message snippet preview */}
                            {!isExpanded && (
                              <div
                                style={{
                                  fontSize: '0.83rem',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '420px',
                                  marginLeft: '0.25rem',
                                  flex: '1 1 auto'
                                }}
                                title={log.message || 'No commit message'}
                              >
                                {log.message && log.message.trim() ? (
                                  log.message.split('\n')[0]
                                ) : (
                                  <em style={{ color: 'var(--text-dim)', opacity: 0.7 }}>No commit message</em>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Controls: Files count & Toggle Chevron */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                            {fileCount > 0 && (
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '5px',
                                  backgroundColor: isExpanded ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                  color: isExpanded ? '#60a5fa' : 'var(--text-muted)',
                                  fontWeight: 600
                                }}
                              >
                                {fileCount} {fileCount === 1 ? 'file' : 'files'}
                              </span>
                            )}
                            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Full Details */}
                        {isExpanded && (
                          <div style={{ borderTop: '1px solid var(--border-color)', minHeight: 'fit-content' }}>
                            {/* Full Commit Message */}
                            <div style={{
                              padding: '1rem 1.25rem',
                              backgroundColor: 'rgba(255, 255, 255, 0.015)',
                              whiteSpace: 'pre-wrap',
                              fontSize: '0.875rem',
                              color: 'var(--text-main)',
                              lineHeight: 1.6,
                              wordBreak: 'break-word',
                              minHeight: 'fit-content'
                            }}>
                              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.45rem' }}>
                                Commit Message
                              </div>
                              {log.message && log.message.trim() ? (
                                <div style={{ color: 'var(--text-main)', fontSize: '0.875rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {log.message}
                                </div>
                              ) : (
                                <em style={{ color: 'var(--text-dim)', opacity: 0.75 }}>No commit message provided.</em>
                              )}
                            </div>

                            {/* Changed Paths List */}
                            <div style={{
                              padding: '0.85rem 1.25rem',
                              borderTop: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-primary)',
                              fontSize: '0.8rem',
                              minHeight: 'fit-content'
                            }}>
                              <div style={{ fontWeight: 600, marginBottom: '0.6rem', color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Changed Paths ({fileCount})</span>
                                {fileCount > 0 && (
                                  <span style={{ fontSize: '0.72rem', textTransform: 'none', color: 'var(--text-muted)' }}>
                                    Click path to copy
                                  </span>
                                )}
                              </div>

                              {fileCount === 0 ? (
                                <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '0.35rem 0' }}>
                                  No changed path details recorded for this revision.
                                </div>
                              ) : (
                                <div
                                  className="custom-scrollbar"
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.35rem',
                                    maxHeight: '280px',
                                    overflowY: 'auto',
                                    paddingRight: '0.35rem'
                                  }}
                                >
                                  {pathsList.map((p: any, pIdx: number) => {
                                    const pathStr = typeof p === 'string' ? p : (p.path || p.text || p.name || String(p || ''));
                                    const actionRaw = typeof p === 'object' && p.action ? String(p.action).trim().toUpperCase() : 'M';
                                    const action = actionRaw || 'M';
                                    const kindStr = typeof p === 'object' ? p.kind : '';
                                    const copyfrom = typeof p === 'object' && p.copyfrom_path
                                      ? `${p.copyfrom_path}${p.copyfrom_rev ? '@r' + p.copyfrom_rev : ''}`
                                      : '';

                                    const actionColors: Record<string, { bg: string; text: string; label: string }> = {
                                      'A': { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', label: 'Added' },
                                      'M': { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6', label: 'Modified' },
                                      'D': { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444', label: 'Deleted' },
                                      'R': { bg: 'rgba(168, 85, 247, 0.2)', text: '#a855f7', label: 'Replaced' }
                                    };
                                    const act = actionColors[action] || { bg: 'rgba(148, 163, 184, 0.2)', text: '#94a3b8', label: action };

                                    return (
                                      <div
                                        key={pIdx}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (pathStr) {
                                            navigator.clipboard.writeText(pathStr).catch(() => {});
                                            setMessage({ type: 'success', text: `Copied path "${pathStr}" to clipboard` });
                                          }
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.6rem',
                                          fontFamily: 'var(--font-mono)',
                                          padding: '0.28rem 0.5rem',
                                          borderRadius: '5px',
                                          backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                          cursor: 'pointer',
                                          transition: 'background-color 0.15s ease'
                                        }}
                                        title="Click to copy file path"
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)')}
                                      >
                                        <span
                                          style={{
                                            backgroundColor: act.bg,
                                            color: act.text,
                                            padding: '0.12rem 0.45rem',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            minWidth: '20px',
                                            textAlign: 'center',
                                            flexShrink: 0
                                          }}
                                          title={act.label}
                                        >
                                          {action}
                                        </span>
                                        <span style={{ color: 'var(--text-main)', wordBreak: 'break-all', flex: 1, fontSize: '0.8rem' }}>
                                          {pathStr || '/'}
                                        </span>
                                        {copyfrom && (
                                          <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontStyle: 'italic', flexShrink: 0 }}>
                                            (from {copyfrom})
                                          </span>
                                        )}
                                        {kindStr && (
                                          <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', flexShrink: 0 }}>
                                            [{kindStr}]
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Load More Commits Button */}
                  {commitLogs.length >= logsLimit && !logsLoading && (
                    <div style={{ textAlign: 'center', padding: '0.75rem 0', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 1.25rem', borderRadius: '8px' }}
                        onClick={() => {
                          const nextLimit = logsLimit < 100 ? 100 : logsLimit < 250 ? 250 : logsLimit < 500 ? 500 : 1000;
                          setLogsLimit(nextLimit);
                          handleOpenLogs(logsPath, nextLimit, logsContextPath);
                        }}
                      >
                        <Clock size={13} />
                        Load More Commits (Showing {commitLogs.length} of limit {logsLimit})
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer" style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Tip: Click on any revision tag (e.g. <code>r{commitLogs[0]?.revision || 1}</code>) to copy it to clipboard. Click a commit row to expand details.
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setLogsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
