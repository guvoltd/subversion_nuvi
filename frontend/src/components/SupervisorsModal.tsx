import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  UserCheck,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Users
} from 'lucide-react';
import { Repository, RepositorySupervisor } from '../types';
import { api } from '../services/api';

interface SupervisorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  repository: Repository | null;
}

export const SupervisorsModal: React.FC<SupervisorsModalProps> = ({
  isOpen,
  onClose,
  repository
}) => {
  const [supervisors, setSupervisors] = useState<RepositorySupervisor[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && repository) {
      loadData();
    }
  }, [isOpen, repository]);

  const loadData = async () => {
    if (!repository) return;
    setLoading(true);
    setError(null);
    try {
      const [sups, users] = await Promise.all([
        api.listSupervisors(repository.id),
        api.listUsers()
      ]);
      setSupervisors(sups);
      setAvailableUsers(users);
      if (users.length > 0) {
        setSelectedUserId(String(users[0].id));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load supervisors');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repository || !selectedUserId) return;

    setLoading(true);
    setError(null);
    try {
      await api.assignSupervisor(repository.id, Number(selectedUserId));
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to assign supervisor');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId: number) => {
    if (!repository) return;
    if (!window.confirm('Remove this user from repository supervisors?')) return;

    setLoading(true);
    try {
      await api.removeSupervisor(repository.id, userId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove supervisor');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !repository) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
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
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="modal-title" style={{ margin: 0 }}>
                Delegated Repository Supervisors
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

        {/* Content Body */}
        <div className="modal-body">
          {/* Description */}
          <div style={{ marginBottom: '1.2rem' }}>
            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
              Supervisors have delegated administrative rights to manage access rules, locks, and hooks
              specifically for <strong style={{ color: 'var(--text-main)' }}>{repository.name}</strong> without granting full server-wide administrator privileges.
            </p>
          </div>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Assign Form */}
          <form onSubmit={handleAssign} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="form-select"
              style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
            >
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} {u.full_name ? `(${u.full_name})` : ''} {u.is_admin ? '[Admin]' : ''}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={loading || !selectedUserId}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
            >
              <Plus size={15} />
              <span>Add Supervisor</span>
            </button>
          </form>

          {/* Supervisors List */}
          <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="data-table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.6rem 0.85rem' }}>Supervisor User</th>
                  <th style={{ padding: '0.6rem 0.85rem' }}>Assigned Date</th>
                  <th style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {supervisors.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No dedicated supervisors assigned yet.
                    </td>
                  </tr>
                ) : (
                  supervisors.map((s) => (
                    <tr key={s.id}>
                      <td style={{ padding: '0.6rem 0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--text-main)' }}>
                          <UserCheck size={15} style={{ color: '#60a5fa' }} />
                          <span>{s.username}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleRemove(s.user_id)}
                          className="btn btn-danger btn-sm"
                          style={{ padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center' }}
                          title="Remove supervisor"
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

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
