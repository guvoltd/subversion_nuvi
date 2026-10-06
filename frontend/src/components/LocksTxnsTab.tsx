import React, { useState, useEffect } from 'react';
import {
  Lock,
  Unlock,
  GitCommit,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  FileCode
} from 'lucide-react';
import { Repository, ActiveLock, UncommittedTxn } from '../types';
import { api } from '../services/api';

interface LocksTxnsTabProps {
  repositories: Repository[];
  selectedRepoId: number | null;
  onSelectRepoId: (id: number) => void;
}

export const LocksTxnsTab: React.FC<LocksTxnsTabProps> = ({
  repositories,
  selectedRepoId,
  onSelectRepoId
}) => {
  const [locks, setLocks] = useState<ActiveLock[]>([]);
  const [txns, setTxns] = useState<UncommittedTxn[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeRepo = repositories.find(r => r.id === selectedRepoId) || repositories[0];

  useEffect(() => {
    if (activeRepo) {
      loadData(activeRepo.id);
    }
  }, [activeRepo?.id]);

  const loadData = async (repoId: number) => {
    setLoading(true);
    setActionMessage(null);
    try {
      const [locksRes, txnsRes] = await Promise.all([
        api.getRepositoryLocks(repoId),
        api.getRepositoryTransactions(repoId)
      ]);
      setLocks(locksRes);
      setTxns(txnsRes);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to fetch locks or transactions' });
    } finally {
      setLoading(false);
    }
  };

  const handleBreakLock = async (lockedPath: string) => {
    if (!activeRepo) return;
    try {
      const res = await api.breakLock(activeRepo.id, lockedPath);
      setActionMessage({ type: 'success', text: res.message });
      await loadData(activeRepo.id);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleAbortTxn = async (txnName: string) => {
    if (!activeRepo) return;
    try {
      const res = await api.abortTransaction(activeRepo.id, txnName);
      setActionMessage({ type: 'success', text: res.message });
      await loadData(activeRepo.id);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  if (repositories.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
        <p>No repositories available. Create a repository first to manage locks and transactions.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Toast Alert */}
      {actionMessage && (
        <div className={`alert ${actionMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
          {actionMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Select Repository & Action Bar */}
      <div className="action-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>Select Repository:</span>
          <select
            className="form-select"
            style={{ maxWidth: '320px' }}
            value={activeRepo?.id || ''}
            onChange={e => onSelectRepoId(Number(e.target.value))}
          >
            {repositories.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} (r{r.latest_revision})
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => activeRepo && loadData(activeRepo.id)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Active Locks Section */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={18} color="#f59e0b" />
            Active Repository Locks ({locks.length})
          </h3>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Locked Path</th>
                <th>Owner</th>
                <th>Created</th>
                <th>Comment</th>
                <th>Lock Token</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {locks.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No active locks found on this repository.
                  </td>
                </tr>
              ) : (
                locks.map((lock, idx) => (
                  <tr key={idx}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                        <FileCode size={14} color="#60a5fa" />
                        {lock.path}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-info">{lock.owner}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {lock.creation_date}
                    </td>
                    <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {lock.comment || '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-dim)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lock.token}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleBreakLock(lock.path)}
                        title="Force break or steal this lock"
                      >
                        <Unlock size={14} />
                        Break Lock
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Uncommitted Transactions Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitCommit size={18} color="#3b82f6" />
            Uncommitted / Dangling Transactions ({txns.length})
          </h3>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Author</th>
                <th>Initiated At</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No uncommitted or dangling transactions found.
                  </td>
                </tr>
              ) : (
                txns.map((txn, idx) => (
                  <tr key={idx}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {txn.name}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-info">{txn.author || 'anonymous'}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {txn.date || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleAbortTxn(txn.name)}
                        title="Purge transaction and free temporary storage"
                      >
                        <Trash2 size={14} />
                        Abort Transaction
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
