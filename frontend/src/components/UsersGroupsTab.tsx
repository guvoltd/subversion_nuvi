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
  FolderPlus,
  Search,
  Plus,
  UserMinus,
  User as UserIcon,
  X
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
  const [selectedAddUser, setSelectedAddUser] = useState('');
  const [availableUserSearch, setAvailableUserSearch] = useState('');
  const [currentMemberSearch, setCurrentMemberSearch] = useState('');
  const [mainSearch, setMainSearch] = useState('');

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

  const handleOpenManageGroup = (group: Group) => {
    setManageGroupModal(group);
    setSelectedAddUser('');
    setAddMemberUsername('');
    setAvailableUserSearch('');
    setCurrentMemberSearch('');
  };

  const handleCloseManageGroup = () => {
    setManageGroupModal(null);
    setSelectedAddUser('');
    setAddMemberUsername('');
    setAvailableUserSearch('');
    setCurrentMemberSearch('');
  };

  const handleAddMemberByUsername = async (usernameToAdd: string) => {
    if (!manageGroupModal || !usernameToAdd.trim()) return;
    try {
      const updated = await api.addGroupMember(manageGroupModal.id, usernameToAdd.trim());
      setManageGroupModal(updated);
      setSelectedAddUser('');
      setAddMemberUsername('');
      loadData();
      setMessage({ type: 'success', text: `Added '${usernameToAdd.trim()}' to group '@${manageGroupModal.name}'.` });
      setTimeout(() => setMessage(null), 3500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = selectedAddUser.trim() || addMemberUsername.trim();
    if (target) {
      await handleAddMemberByUsername(target);
    }
  };

  const handleRemoveMember = async (username: string) => {
    if (!manageGroupModal) return;
    try {
      const updated = await api.removeGroupMember(manageGroupModal.id, username);
      setManageGroupModal(updated);
      loadData();
      setMessage({ type: 'success', text: `Removed '${username}' from group '@${manageGroupModal.name}'.` });
      setTimeout(() => setMessage(null), 3500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // Filtered lists for main tables
  const filteredUsers = users.filter(u => {
    if (!mainSearch.trim()) return true;
    const q = mainSearch.toLowerCase().trim();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.groups && u.groups.some(g => g.toLowerCase().includes(q)))
    );
  });

  const filteredGroups = groups.filter(g => {
    if (!mainSearch.trim()) return true;
    const q = mainSearch.toLowerCase().trim();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description && g.description.toLowerCase().includes(q)) ||
      (g.members && g.members.some(m => m.toLowerCase().includes(q)))
    );
  });

  // Computed membership lists for the Manage Group modal
  const currentMembersSet = new Set(
    (manageGroupModal?.members || []).map(m => m.toLowerCase())
  );

  const availableUsers = users.filter(u => !currentMembersSet.has(u.username.toLowerCase()));

  const filteredAvailableUsers = availableUsers.filter(u => {
    if (!availableUserSearch.trim()) return true;
    const q = availableUserSearch.toLowerCase().trim();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  const filteredCurrentMembers = (manageGroupModal?.members || []).filter(m => {
    if (!currentMemberSearch.trim()) return true;
    const q = currentMemberSearch.toLowerCase().trim();
    const uObj = users.find(u => u.username.toLowerCase() === m.toLowerCase());
    return (
      m.toLowerCase().includes(q) ||
      (uObj?.full_name && uObj.full_name.toLowerCase().includes(q)) ||
      (uObj?.email && uObj.email.toLowerCase().includes(q))
    );
  });

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
      <div className="action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className={`btn btn-sm ${subTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setSubTab('users'); setMainSearch(''); }}
          >
            <Users size={14} />
            Users ({users.length})
          </button>
          <button
            className={`btn btn-sm ${subTab === 'groups' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setSubTab('groups'); setMainSearch(''); }}
          >
            <Shield size={14} />
            Groups ({groups.length})
          </button>
        </div>

        {/* Global Search Filter in Action Bar */}
        <div className="search-input-wrapper" style={{ minWidth: '260px', maxWidth: '380px', flex: 1 }}>
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder={subTab === 'users' ? "Filter users by name, username, email, group..." : "Filter groups by name, description, member..."}
            value={mainSearch}
            onChange={e => setMainSearch(e.target.value)}
          />
          {mainSearch && (
            <button
              type="button"
              onClick={() => setMainSearch('')}
              style={{
                position: 'absolute',
                right: '0.6rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
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
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    {mainSearch ? `No users match "${mainSearch}".` : 'No users found. Create the first user account!'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
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
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    {mainSearch ? `No security groups match "${mainSearch}".` : 'No security groups defined.'}
                  </td>
                </tr>
              ) : (
                filteredGroups.map(g => (
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
                          onClick={() => handleOpenManageGroup(g)}
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
        <div className="modal-backdrop" onClick={handleCloseManageGroup}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '95%' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Shield size={20} color="#a78bfa" />
                  <span>Manage Members of <strong style={{ color: '#c084fc' }}>@{manageGroupModal.name}</strong></span>
                </h3>
                {manageGroupModal.description && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {manageGroupModal.description}
                  </p>
                )}
              </div>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.25rem' }}
                onClick={handleCloseManageGroup}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Section 1: Available Users in System to Add */}
              <div style={{ backgroundColor: 'var(--bg-primary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <UserPlus size={16} color="#60a5fa" />
                    <span>Add Users from System</span>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                      {availableUsers.length} available
                    </span>
                  </div>
                </div>

                {/* Quick Add Form: Dropdown or Manual */}
                <form
                  onSubmit={handleAddMember}
                  style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}
                >
                  {availableUsers.length > 0 ? (
                    <select
                      className="form-select"
                      value={selectedAddUser}
                      onChange={e => setSelectedAddUser(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">-- Choose an available user to add --</option>
                      {availableUsers.map(u => (
                        <option key={u.id} value={u.username}>
                          {u.username} {u.full_name ? `(${u.full_name})` : ''} {u.email ? `• ${u.email}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Username to add"
                      value={addMemberUsername}
                      onChange={e => setAddMemberUsername(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  )}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={availableUsers.length > 0 ? !selectedAddUser : !addMemberUsername.trim()}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <Plus size={14} />
                    Add Member
                  </button>
                </form>

                {/* Available Users Directory with Search Filter */}
                {availableUsers.length > 0 ? (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                      Or browse &amp; filter available users:
                    </div>

                    <div className="search-input-wrapper" style={{ width: '100%', marginBottom: '0.5rem' }}>
                      <Search size={14} className="search-icon" />
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Search available users by name, username, or email..."
                        value={availableUserSearch}
                        onChange={e => setAvailableUserSearch(e.target.value)}
                        style={{ padding: '0.45rem 1rem 0.45rem 2.1rem', fontSize: '0.85rem' }}
                      />
                      {availableUserSearch && (
                        <button
                          type="button"
                          onClick={() => setAvailableUserSearch('')}
                          style={{
                            position: 'absolute',
                            right: '0.6rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {filteredAvailableUsers.length === 0 ? (
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '0.5rem', textAlign: 'center' }}>
                          No available users match "{availableUserSearch}".
                        </div>
                      ) : (
                        filteredAvailableUsers.map(u => (
                          <div
                            key={u.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.45rem 0.75rem',
                              backgroundColor: 'var(--bg-secondary)',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                              <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(96, 165, 250, 0.15)',
                                color: '#60a5fa',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                flexShrink: 0
                              }}>
                                {u.username[0]?.toUpperCase() || 'U'}
                              </div>
                              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <strong style={{ color: '#60a5fa', fontSize: '0.88rem' }}>{u.username}</strong>
                                  {u.full_name && (
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>• {u.full_name}</span>
                                  )}
                                  {u.is_admin && (
                                    <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', fontSize: '0.7rem' }}>
                                      Admin
                                    </span>
                                  )}
                                </div>
                                {u.email && (
                                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {u.email}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleAddMemberByUsername(u.username)}
                              style={{ flexShrink: 0, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                            >
                              <Plus size={13} /> Add
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '0.6rem 0.85rem',
                    backgroundColor: 'rgba(52, 211, 153, 0.1)',
                    border: '1px solid rgba(52, 211, 153, 0.25)',
                    borderRadius: '6px',
                    color: '#34d399',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <CheckCircle size={15} />
                    <span>All registered users in the system are currently members of this group.</span>
                  </div>
                )}
              </div>

              {/* Section 2: Current Group Members */}
              <div style={{ backgroundColor: 'var(--bg-primary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={16} color="#a78bfa" />
                    <span>Current Members</span>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                      {manageGroupModal.members.length} {manageGroupModal.members.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                </div>

                {manageGroupModal.members.length > 0 && (
                  <div className="search-input-wrapper" style={{ width: '100%', marginBottom: '0.5rem' }}>
                    <Search size={14} className="search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Filter current members by name, username, email..."
                      value={currentMemberSearch}
                      onChange={e => setCurrentMemberSearch(e.target.value)}
                      style={{ padding: '0.45rem 1rem 0.45rem 2.1rem', fontSize: '0.85rem' }}
                    />
                    {currentMemberSearch && (
                      <button
                        type="button"
                        onClick={() => setCurrentMemberSearch('')}
                        style={{
                          position: 'absolute',
                          right: '0.6rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}

                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {manageGroupModal.members.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '0.75rem', textAlign: 'center' }}>
                      No users currently in this group. Select or search available users above to add members.
                    </div>
                  ) : filteredCurrentMembers.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '0.5rem', textAlign: 'center' }}>
                      No members match "{currentMemberSearch}".
                    </div>
                  ) : (
                    filteredCurrentMembers.map(m => {
                      const uObj = users.find(u => u.username.toLowerCase() === m.toLowerCase());
                      return (
                        <div
                          key={m}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.45rem 0.75rem',
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(167, 139, 250, 0.15)',
                              color: '#a78bfa',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              flexShrink: 0
                            }}>
                              {m[0]?.toUpperCase() || 'M'}
                            </div>
                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '0.88rem', color: '#f1f5f9' }}>{m}</strong>
                                {uObj?.full_name && (
                                  <span style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>• {uObj.full_name}</span>
                                )}
                                {uObj?.is_admin && (
                                  <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', fontSize: '0.7rem' }}>
                                    Admin
                                  </span>
                                )}
                              </div>
                              {uObj?.email && (
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {uObj.email}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRemoveMember(m)}
                            style={{ flexShrink: 0, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                          >
                            <UserMinus size={13} /> Remove
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseManageGroup}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
