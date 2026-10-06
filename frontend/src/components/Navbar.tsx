import {
  Server,
  FolderGit2,
  Lock,
  Settings,
  RefreshCw,
  Activity,
  Users,
  ShieldAlert,
  FolderTree,
  ShieldCheck,
  Search as SearchNavIcon,
  FileText as AuditNavIcon,
  HardDrive as OperationsNavIcon,
  LogOut,
  ChevronDown,
  LucideIcon,
  Key
} from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { ServerStatus, AuthUser } from '../types';
import { UserProfileModal } from './UserProfileModal';
import { NUVI_LOGO_SRC } from '../assets/logo';

export type TabType = 'welcome' | 'dashboard' | 'repositories' | 'browser' | 'search' | 'audit' | 'operations' | 'locks-txns' | 'users-groups' | 'access-rules' | 'shield' | 'settings';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  status: ServerStatus | null;
  loading: boolean;
  onRefresh: () => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
}

const secondaryTabs: { id: TabType; label: string; icon: LucideIcon; desc: string }[] = [
  { id: 'search', label: 'Commit & File Search', icon: SearchNavIcon, desc: 'Search logs, commit messages & revisions' },
  { id: 'audit', label: 'Audit & Access Logs', icon: AuditNavIcon, desc: 'SVN access history & admin security logs' },
  { id: 'operations', label: 'Operations & DR', icon: OperationsNavIcon, desc: 'Hot-backup, dump export/import & repair' },
  { id: 'shield', label: 'Security & Shield', icon: ShieldCheck, desc: 'Pre-commit hooks, ransomware & secret shields' },
  { id: 'locks-txns', label: 'Locks & Transactions', icon: Lock, desc: 'Inspect & break repository locks' },
  { id: 'settings', label: 'Server Settings', icon: Settings, desc: 'Apache config, TLS & system settings' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  status,
  loading,
  onRefresh,
  currentUser,
  onLogout
}) => {
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSecondaryActive = secondaryTabs.some((t) => t.id === activeTab);
  const activeSecondary = secondaryTabs.find((t) => t.id === activeTab);
  const isAdmin = currentUser?.is_admin === true;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMoreToolsOpen(false);
      }
    };
    if (moreToolsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [moreToolsOpen]);

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <img
              src={NUVI_LOGO_SRC}
              alt="Nuvi Logo"
              className="brand-logo"
              width={32}
              height={32}
              style={{ width: '32px', height: '32px', maxWidth: '32px', maxHeight: '32px', objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <div className="brand-title">
                Subversion Nuvi
                <span className="brand-badge">{isAdmin ? 'Server Manager' : 'User Portal'}</span>
              </div>
            </div>
          </div>

          <nav className="nav-tabs">
            {!isAdmin ? (
              /* Non-Admin: Welcome, Repositories, Web Client, and Search */
              <>
                <button
                  className={`nav-tab ${activeTab === 'welcome' ? 'active' : ''}`}
                  onClick={() => setActiveTab('welcome')}
                >
                  <FolderGit2 size={16} />
                  Welcome
                </button>
                <button
                  className={`nav-tab ${activeTab === 'repositories' ? 'active' : ''}`}
                  onClick={() => setActiveTab('repositories')}
                >
                  <FolderGit2 size={16} />
                  Repositories
                </button>
                <button
                  className={`nav-tab ${activeTab === 'browser' ? 'active' : ''}`}
                  onClick={() => setActiveTab('browser')}
                >
                  <FolderTree size={16} />
                  Web Client
                </button>
                <button
                  className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
                  onClick={() => setActiveTab('search')}
                >
                  <SearchNavIcon size={16} />
                  Search
                </button>
              </>
            ) : (
              /* Admin: Full Management Navigation */
              <>
                <button
                  className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  <Activity size={16} />
                  Dashboard
                </button>
                <button
                  className={`nav-tab ${activeTab === 'repositories' ? 'active' : ''}`}
                  onClick={() => setActiveTab('repositories')}
                >
                  <FolderGit2 size={16} />
                  Repositories
                </button>
                <button
                  className={`nav-tab ${activeTab === 'browser' ? 'active' : ''}`}
                  onClick={() => setActiveTab('browser')}
                >
                  <FolderTree size={16} />
                  Web Client
                </button>
                <button
                  className={`nav-tab ${activeTab === 'access-rules' ? 'active' : ''}`}
                  onClick={() => setActiveTab('access-rules')}
                >
                  <ShieldAlert size={16} />
                  Access Rules
                </button>
                <button
                  className={`nav-tab ${activeTab === 'users-groups' ? 'active' : ''}`}
                  onClick={() => setActiveTab('users-groups')}
                >
                  <Users size={16} />
                  Users & Groups
                </button>

                {/* More Tools Dropdown */}
                <div className="nav-dropdown-container" ref={dropdownRef}>
                  <button
                    className={`nav-tab ${isSecondaryActive ? 'active' : ''}`}
                    onClick={() => setMoreToolsOpen(!moreToolsOpen)}
                    type="button"
                  >
                    {isSecondaryActive && activeSecondary ? (
                      <>
                        <activeSecondary.icon size={16} />
                        <span>{activeSecondary.label}</span>
                      </>
                    ) : (
                      <>
                        <span>More Tools</span>
                      </>
                    )}
                    <ChevronDown
                      size={14}
                      style={{
                        transform: moreToolsOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s ease'
                      }}
                    />
                  </button>

                  {moreToolsOpen && (
                    <div className="nav-dropdown-menu">
                      {secondaryTabs.map((item) => {
                        const ItemIcon = item.icon;
                        const isCurrent = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`nav-dropdown-item ${isCurrent ? 'active' : ''}`}
                            onClick={() => {
                              setActiveTab(item.id);
                              setMoreToolsOpen(false);
                            }}
                          >
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                backgroundColor: isCurrent ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isCurrent ? '#60a5fa' : 'var(--text-muted)',
                                flexShrink: 0
                              }}
                            >
                              <ItemIcon size={15} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                              <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.label}</span>
                              <span className="nav-dropdown-item-desc">{item.desc}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </nav>

          <div className="header-status">
            {isAdmin && (
              <div className="status-badge">
                <span className="status-dot"></span>
                {status?.uptime_formatted ? status.uptime_formatted : 'Online'}
              </div>
            )}

            <button
              className="btn btn-secondary btn-sm"
              onClick={onRefresh}
              title="Refresh State"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>

            {currentUser && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  className="user-pill"
                  onClick={() => setProfileModalOpen(true)}
                  title={isAdmin ? "Manage password & Personal Access Tokens (PATs)" : "Click to change password"}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#60a5fa',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      flexShrink: 0
                    }}
                  >
                    {currentUser.username ? currentUser.username.substring(0, 2).toUpperCase() : 'US'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-main)' }}>
                      {currentUser.username}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {isAdmin ? 'Admin' : 'User'}
                    </span>
                  </div>
                </div>

                {!isAdmin && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setProfileModalOpen(true)}
                    title="Change Password"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.8rem'
                    }}
                  >
                    <Key size={13} />
                    Change Password
                  </button>
                )}

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={onLogout}
                  title="Sign out of server console"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8rem',
                    color: '#f87171'
                  }}
                >
                  <LogOut size={13} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

    <UserProfileModal
      isOpen={profileModalOpen}
      onClose={() => setProfileModalOpen(false)}
      currentUser={currentUser}
    />
  </>
);
};
