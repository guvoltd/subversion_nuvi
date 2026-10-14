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
  ChevronLeft,
  ChevronRight,
  LucideIcon,
  Key,
  Bell,
  CheckCheck,
  ExternalLink,
  Calendar,
  Layers
} from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ServerStatus, AuthUser, AdminNotification } from '../types';
import { api } from '../services/api';
import { UserProfileModal } from './UserProfileModal';
import { NUVI_LOGO_SRC } from '../assets/logo';

export type TabType =
  | 'welcome'
  | 'dashboard'
  | 'repositories'
  | 'browser'
  | 'search'
  | 'audit'
  | 'operations'
  | 'backup-schedules'
  | 'backup-archives'
  | 'maintenance'
  | 'locks-txns'
  | 'users-groups'
  | 'access-rules'
  | 'shield'
  | 'settings';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  status: ServerStatus | null;
  loading: boolean;
  onRefresh: () => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
}

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [recentNotifications, setRecentNotifications] = useState<AdminNotification[]>([]);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const navWrapperRef = useRef<HTMLDivElement>(null);
  const navTabsRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const isAdmin = currentUser?.is_admin === true;

  // Check scroll boundary limits
  const checkScroll = useCallback(() => {
    const el = navTabsRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 2;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  // Intercept mouse round scroll (wheel) and feed directly to horizontal scrolling view
  useEffect(() => {
    const wrapper = navWrapperRef.current;
    const nav = navTabsRef.current;
    if (!wrapper || !nav) return;

    const onWheel = (e: WheelEvent) => {
      // Determine wheel delta (support both vertical deltaY and horizontal deltaX)
      let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) {
        delta *= 32;
      } else if (e.deltaMode === 2) {
        delta *= nav.clientWidth;
      }

      if (delta === 0) return;

      const maxScroll = nav.scrollWidth - nav.clientWidth;
      if (maxScroll <= 0) return;

      // Prevent parent vertical scroll and scroll top tabs horizontally
      e.preventDefault();
      e.stopPropagation();

      nav.scrollLeft += delta;
      checkScroll();
    };

    wrapper.addEventListener('wheel', onWheel, { passive: false });
    nav.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    checkScroll();
    const timer = setTimeout(checkScroll, 100);

    return () => {
      wrapper.removeEventListener('wheel', onWheel);
      nav.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      clearTimeout(timer);
    };
  }, [checkScroll]);

  // When activeTab changes, auto-scroll it into view if needed
  useEffect(() => {
    const nav = navTabsRef.current;
    if (!nav) return;
    const activeBtn = nav.querySelector<HTMLElement>('.nav-tab.active');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    const timer = setTimeout(checkScroll, 250);
    return () => clearTimeout(timer);
  }, [activeTab, checkScroll]);

  const handleScrollBy = (amount: number) => {
    const nav = navTabsRef.current;
    if (!nav) return;
    nav.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(checkScroll, 200);
  };

  const handleTabFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notificationsOpen]);

  const fetchNotificationData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.getNotifications({ limit: 5 });
      setUnreadCount(res.unread_count);
      setRecentNotifications(res.notifications || []);
    } catch {
      // ignore
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchNotificationData();
    const interval = setInterval(fetchNotificationData, 15000);
    const handleNotifUpdate = () => fetchNotificationData();
    window.addEventListener('nuvi_notifications_updated', handleNotifUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('nuvi_notifications_updated', handleNotifUpdate);
    };
  }, [isAdmin, fetchNotificationData]);

  const handleOpenNotificationCenter = () => {
    setNotificationsOpen(false);
    setActiveTab('browser');
    window.dispatchEvent(new CustomEvent('nuvi_switch_browser_view', { detail: { view: 'notifications' } }));
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnreadCount(0);
      setRecentNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      window.dispatchEvent(new Event('nuvi_notifications_updated'));
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = async (notif: AdminNotification) => {
    if (!notif.is_read) {
      try {
        await api.markNotificationRead(notif.id);
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setRecentNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
        window.dispatchEvent(new Event('nuvi_notifications_updated'));
      } catch {
        // ignore
      }
    }
    setNotificationsOpen(false);
    setActiveTab('browser');
    window.dispatchEvent(new CustomEvent('nuvi_switch_browser_view', {
      detail: { view: 'notifications', repositoryId: notif.repository_id, notificationId: notif.id }
    }));
  };

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

          <div
            className={`nav-tabs-wrapper ${canScrollLeft ? 'has-scroll-left' : ''} ${canScrollRight ? 'has-scroll-right' : ''}`}
            ref={navWrapperRef}
          >
            {canScrollLeft && (
              <button
                className="nav-scroll-btn left"
                onClick={() => handleScrollBy(-160)}
                type="button"
                title="Scroll navigation left"
                aria-label="Scroll navigation left"
              >
                <ChevronLeft size={14} />
              </button>
            )}

            <nav className="nav-tabs" ref={navTabsRef}>
              {!isAdmin ? (
                /* Non-Admin: Welcome, Repositories, Web Client, and Search */
                <>
                  <button
                    className={`nav-tab ${activeTab === 'welcome' ? 'active' : ''}`}
                    onClick={() => setActiveTab('welcome')}
                    onFocus={handleTabFocus}
                  >
                    <FolderGit2 size={16} />
                    Welcome
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'repositories' ? 'active' : ''}`}
                    onClick={() => setActiveTab('repositories')}
                    onFocus={handleTabFocus}
                  >
                    <FolderGit2 size={16} />
                    Repositories
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'browser' ? 'active' : ''}`}
                    onClick={() => setActiveTab('browser')}
                    onFocus={handleTabFocus}
                  >
                    <FolderTree size={16} />
                    Web Client
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
                    onClick={() => setActiveTab('search')}
                    onFocus={handleTabFocus}
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
                    onFocus={handleTabFocus}
                  >
                    <Activity size={16} />
                    Dashboard
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'repositories' ? 'active' : ''}`}
                    onClick={() => setActiveTab('repositories')}
                    onFocus={handleTabFocus}
                  >
                    <FolderGit2 size={16} />
                    Repositories
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'browser' ? 'active' : ''}`}
                    onClick={() => setActiveTab('browser')}
                    onFocus={handleTabFocus}
                  >
                    <FolderTree size={16} />
                    Web Client
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'access-rules' ? 'active' : ''}`}
                    onClick={() => setActiveTab('access-rules')}
                    onFocus={handleTabFocus}
                  >
                    <ShieldAlert size={16} />
                    Access Rules
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'users-groups' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users-groups')}
                    onFocus={handleTabFocus}
                  >
                    <Users size={16} />
                    Users & Groups
                  </button>

                  <button
                    className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
                    onClick={() => setActiveTab('search')}
                    onFocus={handleTabFocus}
                  >
                    <SearchNavIcon size={16} />
                    Search
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'audit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('audit')}
                    onFocus={handleTabFocus}
                  >
                    <AuditNavIcon size={16} />
                    Audit Logs
                  </button>
                  <button
                    className={`nav-tab ${activeTab === 'locks-txns' ? 'active' : ''}`}
                    onClick={() => setActiveTab('locks-txns')}
                    onFocus={handleTabFocus}
                  >
                    <Lock size={16} />
                    Locks & Txns
                  </button>
                  <button
                    className={`nav-tab ${
                      activeTab === 'settings' ||
                      activeTab === 'operations' ||
                      activeTab === 'backup-schedules' ||
                      activeTab === 'backup-archives' ||
                      activeTab === 'maintenance' ||
                      activeTab === 'shield'
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => setActiveTab('settings')}
                    onFocus={handleTabFocus}
                  >
                    <Settings size={16} />
                    Settings
                  </button>
                </>
              )}
            </nav>

            {canScrollRight && (
              <button
                className="nav-scroll-btn right"
                onClick={() => handleScrollBy(160)}
                type="button"
                title="Scroll navigation right"
                aria-label="Scroll navigation right"
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          <div className="header-status">
            {isAdmin && (
              <div className="status-badge">
                <span className="status-dot"></span>
                {status?.uptime_formatted ? status.uptime_formatted : 'Online'}
              </div>
            )}

            {isAdmin && (
              <div className="nav-dropdown-container" ref={notifDropdownRef}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const nextOpen = !notificationsOpen;
                    setNotificationsOpen(nextOpen);
                    if (nextOpen) fetchNotificationData();
                  }}
                  title={unreadCount > 0 ? `${unreadCount} unread repository update(s)` : 'Repository notifications'}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.65rem',
                    borderColor: unreadCount > 0 ? 'rgba(239, 68, 68, 0.4)' : undefined,
                    backgroundColor: unreadCount > 0 ? 'rgba(239, 68, 68, 0.1)' : undefined
                  }}
                >
                  <Bell size={15} style={{ color: unreadCount > 0 ? '#ef4444' : 'var(--text-muted)' }} />
                  {unreadCount > 0 && (
                    <span
                      style={{
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        borderRadius: '9999px',
                        padding: '0.1rem 0.42rem',
                        lineHeight: 1,
                        minWidth: '18px',
                        textAlign: 'center'
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div
                    className="nav-dropdown-menu"
                    style={{
                      width: '360px',
                      maxWidth: '90vw',
                      right: 0,
                      padding: '0.75rem',
                      gap: '0.5rem'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--border-color)',
                        paddingBottom: '0.5rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Bell size={15} style={{ color: '#60a5fa' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Repository Updates</span>
                        {unreadCount > 0 && (
                          <span
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px'
                            }}
                          >
                            {unreadCount} unread
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem', height: 'auto' }}
                          onClick={handleMarkAllRead}
                          title="Mark all as read"
                        >
                          <CheckCheck size={12} />
                          Mark all read
                        </button>
                      )}
                    </div>

                    {/* Notification items preview */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                        maxHeight: '260px',
                        overflowY: 'auto'
                      }}
                    >
                      {recentNotifications.length === 0 ? (
                        <div
                          style={{
                            padding: '1.25rem 0',
                            textAlign: 'center',
                            color: 'var(--text-dim)',
                            fontSize: '0.8rem'
                          }}
                        >
                          No repository updates recorded yet.
                        </div>
                      ) : (
                        recentNotifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.2rem',
                              padding: '0.5rem 0.6rem',
                              borderRadius: '6px',
                              backgroundColor: !n.is_read
                                ? 'rgba(59, 130, 246, 0.1)'
                                : 'rgba(255, 255, 255, 0.02)',
                              borderLeft: !n.is_read ? '3px solid #3b82f6' : '3px solid transparent',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = !n.is_read
                                ? 'rgba(59, 130, 246, 0.16)'
                                : 'rgba(255, 255, 255, 0.05)')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = !n.is_read
                                ? 'rgba(59, 130, 246, 0.1)'
                                : 'rgba(255, 255, 255, 0.02)')
                            }
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#60a5fa' }}>
                                  {n.repository_name}
                                </span>
                                {n.revision !== null && (
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontFamily: 'var(--font-mono)',
                                      color: '#38bdf8'
                                    }}
                                  >
                                    r{n.revision}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                  {n.created_at
                                    ? new Date(n.created_at).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : ''}
                                </span>
                                {!n.is_read && (
                                  <span
                                    style={{
                                      width: '6px',
                                      height: '6px',
                                      borderRadius: '50%',
                                      backgroundColor: '#3b82f6'
                                    }}
                                  ></span>
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {n.message ? n.message.split('\n')[0] : n.summary || 'Update committed'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                              by {n.author || 'system'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        marginTop: '0.25rem',
                        fontSize: '0.78rem'
                      }}
                      onClick={handleOpenNotificationCenter}
                    >
                      <ExternalLink size={13} />
                      Open Full Notification Center in Viewer
                    </button>
                  </div>
                )}
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
