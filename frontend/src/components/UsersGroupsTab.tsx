import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  UserCheck,
  UserX,
  Trash2,
  CheckCircle,
  AlertTriangle,
  FolderPlus
} from 'lucide-react';
import { User, Group } from '../types';
import { api } from '../services/api';

export const UsersGroupsTab: React.FC = () => {
  const [subTab, setSubTab] = useState<'users' | 'groups'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [manageGroupModal, setManageGroupModal] = useState<Group | null>(null);
  const [addMemberUsername, setAddMemberUsername] = useState('');

  // Form states
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [uList, gList] = await Promise.all([
        api.listUsers(),
        api.listGroups()
      ]);
      setUsers(uList);
      setGroups(gList);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser({
        username: newUsername,
        password: newUserPassword,
        email: newUserEmail || undefined,
        full_name: newUserFullName || undefined,
        is_admin: newUserIsAdmin
      });
      setCreateUserOpen(false);
      setNewUsername('');
      setNewUserPassword('');
      setNewUserEmail('');
      setNewUserFullName('');
      setNewUserIsAdmin(false);
      setMessage({ type: 'success', text: 'User account created successfully.' });
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await api.setUserStatus(user.id, !user.is_active);
      setMessage({ type: 'success', text: `Account for '${user.username}' updated.` });
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser) return;
    try {
      await api.changePassword(passwordModalUser.id, newPassword);
      setPasswordModalUser(null);
      setNewPassword('');
      setMessage({ type: 'success', text: `Password for '${passwordModalUser.username}' changed.` });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete user '${user.username}'?`)) return;
    try {
      await api.deleteUser(user.id);
      setMessage({ type: 'success', text: `User '${user.username}' deleted.` });
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createGroup({
        name: newGroupName,
        description: newGroupDesc || undefined
      });
      setCreateGroupOpen(false);
      setNewGroupName('');
      setNewGroupDesc('');
      setMessage({ type: 'success', text: 'Security group created.' });
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(`Are you sure you want to delete group '${group.name}'?`)) return;
    try {
      await api.deleteGroup(group.id);
      setMessage({ type: 'success', text: `Group '${group.name}' deleted.` });
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageGroupModal || !addMemberUsername) return;
    try {
      const updated = await api.addGroupMember(manageGroupModal.id, addMemberUsername);
      setManageGroupModal(updated);
      setAddMemberUsername('');
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleRemoveMember = async (username: string) => {
    if (!manageGroupModal) return;
    try {
      const updated = await api.removeGroupMember(manageGroupModal.id, username);
      setManageGroupModal(updated);
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div>
      {/* Toast Alert */}
      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Subnav & Action Bar */}
      <div className="action-bar">
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn btn-sm ${subTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab('users')}
          >
            <Users size={14} />
            Users ({users.length})
          </button>
          <button
            className={`btn btn-sm ${subTab === 'groups' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab('groups')}
          >
            <Shield size={14} />
            Groups ({groups.length})
          </button>
        </div>

        <div>
          {subTab === 'users' ? (
            <button className="btn btn-primary" onClick={() => setCreateUserOpen(true)}>
              <UserPlus size={16} />
              Add User
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setCreateGroupOpen(true)}>
              <FolderPlus size={16} />
              Create Group
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      {subTab === 'users' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Groups</th>
                <th>Status</th>
                <th>Role</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No users found. Create the first user account!
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <strong style={{ color: '#60a5fa' }}>{u.username}</strong>
                    </td>
                    <td>{u.full_name || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{u.email || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {u.groups.length > 0 ? (
                          u.groups.map((g, i) => (
                            <span key={i} className="badge badge-info">{g}</span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>None</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {u.is_active ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                          Disabled
                        </span>
                      )}
                    </td>
                    <td>
                      {u.is_admin ? (
                        <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#c084fc' }}>
                          Administrator
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>User</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setPasswordModalUser(u)}
                          title="Change Password"
                        >
                          <Key size={13} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleToggleStatus(u)}
                          title={u.is_active ? 'Disable Account' : 'Enable Account'}
                        >
                          {u.is_active ? <UserX size={13} color="#f87171" /> : <UserCheck size={13} color="#34d399" />}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteUser(u)}
                          title="Delete User"
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
      )}

      {/* Groups Table */}
      {subTab === 'groups' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Description</th>
                <th>Members Count</th>
                <th>Members</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No security groups defined.
                  </td>
                </tr>
              ) : (
                groups.map(g => (
                  <tr key={g.id}>
                    <td>
                      <strong style={{ color: '#a78bfa' }}>@{g.name}</strong>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{g.description || '—'}</td>
                    <td>{g.member_count}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {g.members.length > 0 ? (
                          g.members.map((m, i) => (
                            <span key={i} className="badge badge-info">{m}</span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No members</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setManageGroupModal(g)}
                        >
                          Manage Members
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteGroup(g)}
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
      )}

      {/* Create User Modal */}
      {createUserOpen && (
        <div className="modal-backdrop" onClick={() => setCreateUserOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Internal User</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setCreateUserOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password * (Min 10 chars, uppercase, lowercase, numbers, symbols)</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newUserPassword}
                    onChange={e => setNewUserPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newUserFullName}
                    onChange={e => setNewUserFullName(e.target.value)}
                  />
                </div>
                <label className="form-checkbox-label">
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={newUserIsAdmin}
                    onChange={e => setNewUserIsAdmin(e.target.checked)}
                  />
                  Administrator Privileges
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCreateUserOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {passwordModalUser && (
        <div className="modal-backdrop" onClick={() => setPasswordModalUser(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Change Password for '{passwordModalUser.username}'</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setPasswordModalUser(null)}>✕</button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter new strong password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPasswordModalUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Update Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {createGroupOpen && (
        <div className="modal-backdrop" onClick={() => setCreateGroupOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Security Group</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setCreateGroupOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateGroup}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Group Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. frontend-engineers"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Group purpose"
                    value={newGroupDesc}
                    onChange={e => setNewGroupDesc(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCreateGroupOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Group Members Modal */}
      {manageGroupModal && (
        <div className="modal-backdrop" onClick={() => setManageGroupModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Manage Members of '@{manageGroupModal.name}'</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setManageGroupModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Username to add"
                  value={addMemberUsername}
                  onChange={e => setAddMemberUsername(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  Add Member
                </button>
              </form>

              <div className="form-label">Current Members ({manageGroupModal.members.length})</div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {manageGroupModal.members.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No users currently in this group.</div>
                ) : (
                  manageGroupModal.members.map(m => (
                    <div key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', backgroundColor: 'var(--bg-primary)', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.9rem' }}>{m}</span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleRemoveMember(m)}>Remove</button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setManageGroupModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
