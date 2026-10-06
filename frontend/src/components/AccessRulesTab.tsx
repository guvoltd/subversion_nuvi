import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Play,
  FileText,
  Layers,
  Users,
  User as UserIcon,
  Globe,
  List,
  ChevronDown,
  ChevronRight,
  FolderGit2
} from 'lucide-react';
import { AccessRule, Repository, User, Group, EffectivePermission } from '../types';
import { api } from '../services/api';

interface AccessRulesTabProps {
  repositories: Repository[];
}

interface PrincipalGroup {
  key: string;
  principalType: string;
  principalName: string;
  groupObj?: Group;
  userObj?: User;
  rules: AccessRule[];
}

export const AccessRulesTab: React.FC<AccessRulesTabProps> = ({ repositories }) => {
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterRepoId, setFilterRepoId] = useState<string>('all');
  const [filterPrincipalType, setFilterPrincipalType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add rule modal state with multi-path facility
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [ruleScope, setRuleScope] = useState<'server' | 'repo'>('server');
  const [ruleRepoId, setRuleRepoId] = useState<number | null>(null);
  const [rulePaths, setRulePaths] = useState<string[]>(['/']);
  const [principalType, setPrincipalType] = useState<'user' | 'group' | 'everyone'>('everyone');
  const [principalName, setPrincipalName] = useState('*');
  const [permission, setPermission] = useState<'rw' | 'r' | ''>('r');

  // Evaluator state (nuvi-acl-eval)
  const [evalUsername, setEvalUsername] = useState('');
  const [evalRepoId, setEvalRepoId] = useState<number>(repositories[0]?.id || 1);
  const [evalPath, setEvalPath] = useState('/');
  const [evalResult, setEvalResult] = useState<EffectivePermission | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  useEffect(() => {
    loadRules();
    api.listUsers().then(setUsers).catch(() => {});
    api.listGroups().then(setGroups).catch(() => {});
  }, [filterRepoId]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const repoId = filterRepoId === 'all' ? undefined : (filterRepoId === 'server' ? undefined : Number(filterRepoId));
      const res = await api.listRules(repoId);
      setRules(res);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter(r => {
      if (filterPrincipalType !== 'all' && r.principal_type !== filterPrincipalType) {
        return false;
      }
      return true;
    });
  }, [rules, filterPrincipalType]);

  // Grouped by Principal structure
  const groupedRules = useMemo<PrincipalGroup[]>(() => {
    const map = new Map<string, PrincipalGroup>();

    for (const r of filteredRules) {
      const key = `${r.principal_type}:${r.principal_name}`;
      if (!map.has(key)) {
        const groupObj = r.principal_type === 'group'
          ? groups.find(g => g.name.toLowerCase() === r.principal_name.toLowerCase())
          : undefined;
        const userObj = r.principal_type === 'user'
          ? users.find(u => u.username.toLowerCase() === r.principal_name.toLowerCase())
          : undefined;

        map.set(key, {
          key,
          principalType: r.principal_type,
          principalName: r.principal_name,
          groupObj,
          userObj,
          rules: []
        });
      }
      map.get(key)!.rules.push(r);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.principalType === 'everyone') return -1;
      if (b.principalType === 'everyone') return 1;
      if (a.principalType === 'group' && b.principalType !== 'group') return -1;
      if (a.principalType !== 'group' && b.principalType === 'group') return 1;
      return a.principalName.localeCompare(b.principalName);
    });
  }, [filteredRules, groups, users]);

  // Multi-path helpers
  const handleOpenAddModal = () => {
    setRulePaths(['/']);
    setRuleScope('server');
    if (repositories.length > 0) setRuleRepoId(repositories[0].id);
    setPrincipalType('everyone');
    setPrincipalName('*');
    setPermission('r');
    setAddRuleOpen(true);
  };

  const handleAddPathRow = () => {
    setRulePaths(prev => [...prev, '/']);
  };

  const handleRemovePathRow = (index: number) => {
    if (rulePaths.length <= 1) return;
    setRulePaths(prev => prev.filter((_, i) => i !== index));
  };

  const handlePathChange = (index: number, val: string) => {
    setRulePaths(prev => {
      const updated = [...prev];
      updated[index] = val;
      return updated;
    });
  };

  const handleQuickAddCommonPath = (commonPath: string) => {
    if (!rulePaths.includes(commonPath)) {
      if (rulePaths.length === 1 && rulePaths[0] === '/') {
        setRulePaths([commonPath]);
      } else {
        setRulePaths(prev => [...prev, commonPath]);
      }
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanedPaths = Array.from(new Set(
        rulePaths
          .map(p => p.trim())
          .filter(Boolean)
          .map(p => (p.startsWith('/') ? p : '/' + p))
      ));

      if (cleanedPaths.length === 0) {
        cleanedPaths.push('/');
      }

      const pName = principalType === 'everyone' ? '*' : principalName;
      const targetRepoId = ruleScope === 'repo' ? ruleRepoId : null;

      // Submit all path access rules in a single go
      for (const p of cleanedPaths) {
        await api.createRule({
          repository_id: targetRepoId,
          path: p,
          principal_type: principalType,
          principal_name: pName,
          permission: permission,
          rule_order: 0
        });
      }

      setAddRuleOpen(false);
      setMessage({
        type: 'success',
        text: `Successfully added ${cleanedPaths.length} access rule(s) and recompiled authz.`
      });
      loadRules();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    if (!confirm('Are you sure you want to delete this access rule?')) return;
    try {
      await api.deleteRule(ruleId);
      setMessage({ type: 'success', text: 'Access rule removed and authz recompiled.' });
      loadRules();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleCompileAuthz = async () => {
    try {
      const res = await api.compileAuthz();
      setMessage({ type: 'success', text: `${res.message} (${res.lines} lines).` });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evalUsername) return;
    setEvalLoading(true);
    setEvalResult(null);
    try {
      const res = await api.evaluatePermission({
        username: evalUsername,
        repository_id: evalRepoId,
        path: evalPath
      });
      setEvalResult(res);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setEvalLoading(false);
    }
  };

  // Render Principal Identity (first column)
  const renderPrincipalCell = (r: AccessRule) => {
    if (r.principal_type === 'everyone') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'rgba(148, 163, 184, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Globe size={15} color="#94a3b8" />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#cbd5e1' }}>* (Everyone)</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Global wildcard</div>
          </div>
        </div>
      );
    }

    if (r.principal_type === 'group') {
      const grp = groups.find(g => g.name.toLowerCase() === r.principal_name.toLowerCase());
      const memberCount = grp ? grp.members?.length ?? 0 : null;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'rgba(167, 139, 250, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Users size={15} color="#c084fc" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ color: '#c084fc', fontWeight: 600 }}>@{r.principal_name}</span>
              <span
                className="badge"
                style={{
                  backgroundColor: 'rgba(167, 139, 250, 0.15)',
                  color: '#c084fc',
                  fontSize: '0.65rem',
                  padding: '0.1rem 0.35rem'
                }}
              >
                Group
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              {memberCount !== null ? (
                <span>
                  {memberCount} member{memberCount === 1 ? '' : 's'}
                  {grp?.members && grp.members.length > 0 ? `: ${grp.members.slice(0, 3).join(', ')}${grp.members.length > 3 ? '...' : ''}` : ''}
                </span>
              ) : (
                'Security group'
              )}
            </div>
          </div>
        </div>
      );
    }

    // Individual user
    const usr = users.find(u => u.username.toLowerCase() === r.principal_name.toLowerCase());
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            background: 'rgba(59, 130, 246, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <UserIcon size={15} color="#60a5fa" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: '#60a5fa', fontWeight: 600 }}>{r.principal_name}</span>
            <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
              User
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            {usr?.groups && usr.groups.length > 0
              ? `Member of ${usr.groups.map(g => '@' + g).join(', ')}`
              : 'Individual account'}
          </div>
        </div>
      </div>
    );
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

      {/* Main Grid: Rules Table on Left, Live Evaluator on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Rules Table Column */}
        <div>
          <div className="action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Filter controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <select
                className="form-select"
                style={{ width: '190px', fontSize: '0.85rem' }}
                value={filterRepoId}
                onChange={e => setFilterRepoId(e.target.value)}
              >
                <option value="all">All Scopes</option>
                <option value="server">Server-Wide Only</option>
                {repositories.map(r => (
                  <option key={r.id} value={r.id}>Repo: {r.name}</option>
                ))}
              </select>

              <select
                className="form-select"
                style={{ width: '150px', fontSize: '0.85rem' }}
                value={filterPrincipalType}
                onChange={e => setFilterPrincipalType(e.target.value)}
              >
                <option value="all">All Principals</option>
                <option value="group">Groups Only</option>
                <option value="user">Users Only</option>
                <option value="everyone">Everyone (*)</option>
              </select>

              {/* View Switcher: Flat List vs Group View */}
              <div
                style={{
                  display: 'inline-flex',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '2px'
                }}
              >
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: viewMode === 'flat' ? 'var(--accent-primary)' : 'transparent',
                    color: viewMode === 'flat' ? 'white' : 'var(--text-muted)'
                  }}
                  onClick={() => setViewMode('flat')}
                  title="Flat Table View"
                >
                  <List size={13} />
                  Table View
                </button>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: viewMode === 'grouped' ? 'var(--accent-primary)' : 'transparent',
                    color: viewMode === 'grouped' ? 'white' : 'var(--text-muted)'
                  }}
                  onClick={() => setViewMode('grouped')}
                  title="Group rules by Principal"
                >
                  <Users size={13} />
                  Group View
                </button>
              </div>
            </div>

            {/* Actions: Sync authz & Add Rule with Plus Button */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleCompileAuthz} title="Sync authz file">
                <FileText size={14} />
                Sync authz
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleOpenAddModal} title="Add Access Rule across paths in single go">
                <Plus size={14} />
                Add Access Rule
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: Flat Table View with Principal at FIRST Location */}
          {viewMode === 'flat' && (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Principal</th>
                    <th style={{ width: '22%' }}>Scope</th>
                    <th style={{ width: '28%' }}>Repository Path</th>
                    <th style={{ width: '14%' }}>Permission</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No access rules found for this selection.
                      </td>
                    </tr>
                  ) : (
                    filteredRules.map(r => (
                      <tr key={r.id}>
                        {/* Principal Column moved to FIRST location with Group/User breakdown */}
                        <td>{renderPrincipalCell(r)}</td>

                        {/* Scope Column */}
                        <td>
                          {r.repository_name ? (
                            <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <FolderGit2 size={12} />
                              {r.repository_name}
                            </span>
                          ) : (
                            <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#c084fc' }}>
                              Server-Wide
                            </span>
                          )}
                        </td>

                        {/* Repository Path Column */}
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                          <span style={{ color: '#93c5fd' }}>{r.path}</span>
                        </td>

                        {/* Permission Column */}
                        <td>
                          {r.permission === 'rw' ? (
                            <span className="badge badge-success">Read / Write</span>
                          ) : r.permission === 'r' ? (
                            <span className="badge badge-info">Read Only</span>
                          ) : (
                            <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                              Deny
                            </span>
                          )}
                        </td>

                        {/* Action Column */}
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.3rem 0.5rem' }}
                            onClick={() => handleDeleteRule(r.id)}
                            title="Delete access rule"
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
          )}

          {/* VIEW MODE 2: Group View (Grouped by Principal) */}
          {viewMode === 'grouped' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {groupedRules.length === 0 ? (
                <div
                  className="table-container"
                  style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}
                >
                  No access rules found for this selection.
                </div>
              ) : (
                groupedRules.map(pg => {
                  const isCollapsed = !!collapsedGroups[pg.key];
                  return (
                    <div
                      key={pg.key}
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Principal Group Header */}
                      <div
                        style={{
                          padding: '0.85rem 1.25rem',
                          backgroundColor: 'rgba(15, 23, 42, 0.5)',
                          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer'
                        }}
                        onClick={() => toggleGroupCollapse(pg.key)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ color: 'var(--text-muted)' }}>
                            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          </div>

                          {pg.principalType === 'everyone' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Globe size={18} color="#94a3b8" />
                              <span style={{ fontWeight: 600, color: '#f8fafc' }}>* (Everyone)</span>
                              <span className="badge" style={{ backgroundColor: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8' }}>
                                Global Wildcard
                              </span>
                            </div>
                          ) : pg.principalType === 'group' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Users size={18} color="#c084fc" />
                              <span style={{ fontWeight: 600, color: '#c084fc' }}>@{pg.principalName}</span>
                              <span className="badge" style={{ backgroundColor: 'rgba(167, 139, 250, 0.2)', color: '#c084fc' }}>
                                Security Group
                              </span>
                              {pg.groupObj && pg.groupObj.members && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: '0.25rem' }}>
                                  ({pg.groupObj.members.length} members: {pg.groupObj.members.join(', ')})
                                </span>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <UserIcon size={18} color="#60a5fa" />
                              <span style={{ fontWeight: 600, color: '#60a5fa' }}>{pg.principalName}</span>
                              <span className="badge badge-info">User</span>
                              {pg.userObj && pg.userObj.groups && pg.userObj.groups.length > 0 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: '0.25rem' }}>
                                  (Groups: {pg.userObj.groups.map(g => '@' + g).join(', ')})
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#93c5fd', fontSize: '0.75rem' }}>
                            {pg.rules.length} path{pg.rules.length === 1 ? '' : 's'} assigned
                          </span>
                        </div>
                      </div>

                      {/* Principal Rules Sub-Table */}
                      {!isCollapsed && (
                        <table className="data-table" style={{ margin: 0 }}>
                          <thead>
                            <tr style={{ backgroundColor: 'transparent' }}>
                              <th style={{ width: '30%', fontSize: '0.75rem', padding: '0.65rem 1.25rem' }}>Scope</th>
                              <th style={{ width: '40%', fontSize: '0.75rem', padding: '0.65rem 1.25rem' }}>Repository Path</th>
                              <th style={{ width: '20%', fontSize: '0.75rem', padding: '0.65rem 1.25rem' }}>Permission</th>
                              <th style={{ width: '10%', textAlign: 'right', fontSize: '0.75rem', padding: '0.65rem 1.25rem' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pg.rules.map(r => (
                              <tr key={r.id}>
                                <td>
                                  {r.repository_name ? (
                                    <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                      <FolderGit2 size={12} />
                                      {r.repository_name}
                                    </span>
                                  ) : (
                                    <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#c084fc' }}>
                                      Server-Wide
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                                  <span style={{ color: '#93c5fd' }}>{r.path}</span>
                                </td>
                                <td>
                                  {r.permission === 'rw' ? (
                                    <span className="badge badge-success">Read / Write</span>
                                  ) : r.permission === 'r' ? (
                                    <span className="badge badge-info">Read Only</span>
                                  ) : (
                                    <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                                      Deny
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    style={{ padding: '0.25rem 0.5rem' }}
                                    onClick={() => handleDeleteRule(r.id)}
                                    title="Delete access rule"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Live Effective Permissions Evaluator Column (nuvi-acl-eval) */}
        <div>
          <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <ShieldAlert size={18} color="#3b82f6" />
              Effective Permissions Evaluator
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Simulates live access decisions (<code className="mono">nuvi-acl-eval</code>) and traces exact inheritance hierarchy and group resolution.
            </p>

            <form onSubmit={handleEvaluate}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. alice_dev"
                  value={evalUsername}
                  onChange={e => setEvalUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Repository</label>
                <select
                  className="form-select"
                  value={evalRepoId}
                  onChange={e => setEvalRepoId(Number(e.target.value))}
                >
                  {repositories.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Path</label>
                <input
                  type="text"
                  className="form-input"
                  value={evalPath}
                  onChange={e => setEvalPath(e.target.value)}
                  placeholder="/"
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={evalLoading}>
                <Play size={14} />
                Calculate Permission
              </button>
            </form>

            {/* Evaluator Result */}
            {evalResult && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Effective Access:</span>
                  {evalResult.effective_permission === 'rw' ? (
                    <span className="badge badge-success" style={{ fontSize: '0.85rem' }}>Read / Write</span>
                  ) : evalResult.effective_permission === 'r' ? (
                    <span className="badge badge-info" style={{ fontSize: '0.85rem' }}>Read Only</span>
                  ) : (
                    <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '0.85rem' }}>
                      No Access (Deny)
                    </span>
                  )}
                </div>

                <div className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Layers size={14} />
                  Decision Tree Trace
                </div>
                <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {evalResult.decision_trace.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: '0.75rem',
                        backgroundColor: 'var(--bg-primary)',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        borderLeft: `3px solid ${item.effect === 'grant' ? '#10b981' : '#ef4444'}`
                      }}
                    >
                      <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span>{item.path}</span>
                        <span style={{ textTransform: 'uppercase', color: item.effect === 'grant' ? '#34d399' : '#f87171' }}>
                          {item.effect} ({item.permission || 'Deny'})
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-dim)' }}>{item.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Access Rule Modal with Multi-Path Facility & Plus Button */}
      {addRuleOpen && (
        <div className="modal-backdrop" onClick={() => setAddRuleOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add Path-Based Access Rule</h3>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
                onClick={() => setAddRuleOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddRule} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-body">
                {/* Rule Scope */}
                <div className="form-group">
                  <label className="form-label">Rule Scope</label>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
                    <label className="form-checkbox-label">
                      <input
                        type="radio"
                        name="scope"
                        checked={ruleScope === 'server'}
                        onChange={() => setRuleScope('server')}
                      />
                      Server-Wide
                    </label>
                    <label className="form-checkbox-label">
                      <input
                        type="radio"
                        name="scope"
                        checked={ruleScope === 'repo'}
                        onChange={() => {
                          setRuleScope('repo');
                          if (!ruleRepoId && repositories.length > 0) setRuleRepoId(repositories[0].id);
                        }}
                      />
                      Specific Repository
                    </label>
                  </div>
                </div>

                {ruleScope === 'repo' && (
                  <div className="form-group">
                    <label className="form-label">Repository</label>
                    <select
                      className="form-select"
                      value={ruleRepoId || ''}
                      onChange={e => setRuleRepoId(Number(e.target.value))}
                      required
                    >
                      {repositories.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Multi-Path Repository Path Facility with Plus Button */}
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      Repository Path(s)
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                        ({rulePaths.length} path{rulePaths.length === 1 ? '' : 's'} configured)
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      onClick={handleAddPathRow}
                      title="Add another repository path to grant in single go"
                    >
                      <Plus size={13} />
                      Add Path
                    </button>
                  </div>

                  {/* List of path inputs */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      maxHeight: '190px',
                      overflowY: 'auto',
                      paddingRight: '0.2rem'
                    }}
                  >
                    {rulePaths.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                          value={p}
                          onChange={e => handlePathChange(idx, e.target.value)}
                          placeholder="e.g. / or /trunk/testRepo"
                          required
                        />
                        {/* Plus button right on the row to add another path in single go */}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.45rem 0.6rem' }}
                          onClick={handleAddPathRow}
                          title="Add another repository path"
                        >
                          <Plus size={14} />
                        </button>
                        {rulePaths.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.45rem 0.6rem' }}
                            onClick={() => handleRemovePathRow(idx)}
                            title="Remove this path"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Quick-add shortcuts */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Quick Add:</span>
                    {['/', '/trunk', '/branches', '/tags'].map(cp => (
                      <button
                        key={cp}
                        type="button"
                        style={{
                          background: 'rgba(59, 130, 246, 0.12)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          color: '#93c5fd',
                          borderRadius: '4px',
                          padding: '0.15rem 0.5rem',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)'
                        }}
                        onClick={() => handleQuickAddCommonPath(cp)}
                        title={`Add ${cp} to paths`}
                      >
                        + {cp}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Principal Type */}
                <div className="form-group">
                  <label className="form-label">Principal Type</label>
                  <select
                    className="form-select"
                    value={principalType}
                    onChange={e => {
                      const pt = e.target.value as any;
                      setPrincipalType(pt);
                      if (pt === 'everyone') setPrincipalName('*');
                      else if (pt === 'user' && users.length > 0) setPrincipalName(users[0].username);
                      else if (pt === 'group' && groups.length > 0) setPrincipalName(groups[0].name);
                    }}
                  >
                    <option value="everyone">Everyone (*)</option>
                    <option value="group">Security Group</option>
                    <option value="user">Individual User</option>
                  </select>
                </div>

                {/* User / Group Selector */}
                {principalType === 'user' && (
                  <div className="form-group">
                    <label className="form-label">Select User</label>
                    <select
                      className="form-select"
                      value={principalName}
                      onChange={e => setPrincipalName(e.target.value)}
                      required
                    >
                      {users.map(u => (
                        <option key={u.id} value={u.username}>
                          {u.username} {u.full_name ? `(${u.full_name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {principalType === 'group' && (
                  <div className="form-group">
                    <label className="form-label">Select Security Group</label>
                    <select
                      className="form-select"
                      value={principalName}
                      onChange={e => setPrincipalName(e.target.value)}
                      required
                    >
                      {groups.map(g => (
                        <option key={g.id} value={g.name}>
                          @{g.name} ({g.members?.length ?? 0} members)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Permission Level */}
                <div className="form-group">
                  <label className="form-label">Permission Level</label>
                  <select
                    className="form-select"
                    value={permission}
                    onChange={e => setPermission(e.target.value as any)}
                  >
                    <option value="rw">Read / Write (rw)</option>
                    <option value="r">Read Only (r)</option>
                    <option value="">Deny (Explicit No Access)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAddRuleOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Access Rule{rulePaths.length > 1 ? `s (${rulePaths.length})` : ''}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
