import React, { useState, useEffect, useCallback } from 'react';
import { Server, RefreshCw } from 'lucide-react';
import { Navbar, TabType } from './components/Navbar';
import { DashboardTab } from './components/DashboardTab';
import { RepositoriesTab } from './components/RepositoriesTab';
import { RepositoryBrowserTab } from './components/RepositoryBrowserTab';
import { SearchTab } from './components/SearchTab';
import { AuditTab } from './components/AuditTab';
import { OperationsTab } from './components/OperationsTab';
import { LocksTxnsTab } from './components/LocksTxnsTab';
import { UsersGroupsTab } from './components/UsersGroupsTab';
import { AccessRulesTab } from './components/AccessRulesTab';
import { ShieldTab } from './components/ShieldTab';
import { SettingsTab } from './components/SettingsTab';
import { CreateRepoModal } from './components/CreateRepoModal';
import { LoginPage } from './components/LoginPage';
import { WelcomeTab } from './components/WelcomeTab';
import { ServerStatus, Repository, AuthUser } from './types';
import { api } from './services/api';
import { NUVI_LOGO_SRC } from './assets/logo';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => api.getStoredUser());
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const stored = api.getStoredUser();
    return stored?.is_admin ? 'dashboard' : 'welcome';
  });
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedRepoIdForLocks, setSelectedRepoIdForLocks] = useState<number | null>(null);

  // Validate session on load
  useEffect(() => {
    const verifyAuth = async () => {
      if (api.hasToken()) {
        try {
          const user = await api.getCurrentUser();
          setCurrentUser(user);
          if (!user.is_admin) {
            setActiveTab('welcome');
          }
        } catch {
          setCurrentUser(null);
          localStorage.removeItem('nuvi_auth_token');
          localStorage.removeItem('nuvi_auth_user');
        }
      } else {
        setCurrentUser(null);
      }
      setAuthChecking(false);
    };

    verifyAuth();

    const handleUnauthorized = () => {
      setCurrentUser(null);
    };
    window.addEventListener('nuvi_unauthorized', handleUnauthorized);
    return () => window.removeEventListener('nuvi_unauthorized', handleUnauthorized);
  }, []);

  const fetchAllData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      if (currentUser.is_admin) {
        const [statusRes, reposRes] = await Promise.all([
          api.getServerStatus(),
          api.listRepositories()
        ]);
        setStatus(statusRes);
        setRepositories(reposRes);
        if (reposRes.length > 0 && selectedRepoIdForLocks === null) {
          setSelectedRepoIdForLocks(reposRes[0].id);
        }
      } else {
        const reposRes = await api.listRepositories();
        setRepositories(reposRes);
      }
    } catch (err) {
      console.error('Failed to load Nuvi Server data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedRepoIdForLocks]);

  useEffect(() => {
    if (!currentUser) return;
    fetchAllData();
    const interval = setInterval(fetchAllData, 15000); // 15s polling
    return () => clearInterval(interval);
  }, [currentUser, fetchAllData]);

  const handleSelectRepoForLocks = (repoId: number) => {
    setSelectedRepoIdForLocks(repoId);
    setActiveTab('locks-txns');
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setStatus(null);
    setRepositories([]);
  };

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    setActiveTab(user.is_admin ? 'dashboard' : 'welcome');
  };

  // Splash screen while checking existing stored session token
  if (authChecking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-main)',
          gap: '1rem'
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <img
            src={NUVI_LOGO_SRC}
            alt="Subversion Nuvi"
            width={58}
            height={58}
            style={{
              width: '58px',
              height: '58px',
              maxWidth: '58px',
              maxHeight: '58px',
              objectFit: 'contain',
              flexShrink: 0,
              filter: 'drop-shadow(0 6px 14px rgba(59, 130, 246, 0.35))'
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={16} className="spin" />
          <span>Verifying secure management session...</span>
        </div>
      </div>
    );
  }

  // Not authenticated: render Login Page
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Authenticated: render full Server Management Console
  return (
    <div className="app-container">
      {/* Subtle Ambient Brand Watermark in background */}
      <div
        className="app-watermark-bg"
        style={{ backgroundImage: `url(${NUVI_LOGO_SRC})` }}
        aria-hidden="true"
      />

      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        status={status}
        loading={loading}
        onRefresh={fetchAllData}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {!currentUser.is_admin ? (
          <>
            {activeTab === 'welcome' && (
              <WelcomeTab
                currentUser={currentUser}
                repositories={repositories}
                onNavigateToBrowser={() => setActiveTab('browser')}
                onNavigateToRepos={() => setActiveTab('repositories')}
              />
            )}

            {activeTab === 'repositories' && (
              <RepositoriesTab
                repositories={repositories}
                loading={loading}
                onRefresh={fetchAllData}
                onOpenCreateModal={() => {}}
                onSelectRepoForLocks={() => {}}
                isAdmin={false}
              />
            )}

            {activeTab === 'browser' && (
              <RepositoryBrowserTab repositories={repositories} />
            )}

            {activeTab === 'search' && (
              <SearchTab repositories={repositories} />
            )}

            {activeTab !== 'welcome' && activeTab !== 'repositories' && activeTab !== 'browser' && activeTab !== 'search' && (
              <WelcomeTab
                currentUser={currentUser}
                repositories={repositories}
                onNavigateToBrowser={() => setActiveTab('browser')}
                onNavigateToRepos={() => setActiveTab('repositories')}
              />
            )}
          </>
        ) : (
          <>
            {activeTab === 'welcome' && (
              <WelcomeTab
                currentUser={currentUser}
                repositories={repositories}
                onNavigateToBrowser={() => setActiveTab('browser')}
                onNavigateToRepos={() => setActiveTab('repositories')}
              />
            )}

            {activeTab === 'dashboard' && (
              <DashboardTab
                status={status}
                repositories={repositories}
                onNavigateToRepos={() => setActiveTab('repositories')}
                onOpenCreateModal={() => setCreateModalOpen(true)}
              />
            )}

            {activeTab === 'repositories' && (
              <RepositoriesTab
                repositories={repositories}
                loading={loading}
                onRefresh={fetchAllData}
                onOpenCreateModal={() => setCreateModalOpen(true)}
                onSelectRepoForLocks={handleSelectRepoForLocks}
                isAdmin={true}
              />
            )}

            {activeTab === 'browser' && <RepositoryBrowserTab repositories={repositories} />}

            {activeTab === 'search' && <SearchTab repositories={repositories} />}

            {activeTab === 'audit' && <AuditTab />}

            {activeTab === 'operations' && <OperationsTab repositories={repositories} />}

            {activeTab === 'users-groups' && <UsersGroupsTab />}

            {activeTab === 'access-rules' && <AccessRulesTab repositories={repositories} />}

            {activeTab === 'shield' && <ShieldTab />}

            {activeTab === 'locks-txns' && (
              <LocksTxnsTab
                repositories={repositories}
                selectedRepoId={selectedRepoIdForLocks}
                onSelectRepoId={setSelectedRepoIdForLocks}
              />
            )}

            {activeTab === 'settings' && <SettingsTab />}
          </>
        )}
      </main>

      {currentUser.is_admin && (
        <CreateRepoModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={fetchAllData}
        />
      )}
    </div>
  );
};

export default App;
