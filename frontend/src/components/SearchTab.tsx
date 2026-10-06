import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, Database, Filter, RefreshCw, FileText, GitCommit, ArrowRight } from 'lucide-react';
import { Repository } from '../types';
import { api } from '../services/api';

interface SearchTabProps {
  repositories: Repository[];
}

export const SearchTab: React.FC<SearchTabProps> = ({ repositories }) => {
  const [query, setQuery] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<number | ''>('');
  const [extension, setExtension] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');
  const [username, setUsername] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [jumpRev, setJumpRev] = useState<number | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStats = async () => {
    try {
      const data = await api.getSearchStatus();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setNotification(null);
    try {
      const res = await api.search({
        q: query.trim(),
        repository_id: selectedRepoId !== '' ? Number(selectedRepoId) : undefined,
        path_prefix: pathPrefix.trim() || undefined,
        extension: extension.trim() || undefined,
        username: username.trim() || undefined,
        limit: 50
      });
      setResults(res.results || []);
      setTotalHits(res.total_hits || 0);
      setJumpRev(res.jump_revision || null);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleIndexRepo = async (repoId: number) => {
    setIndexing(true);
    setNotification(null);
    try {
      const res = await api.indexRepository(repoId);
      setNotification({
        type: 'success',
        message: `Indexed repository at revision r${res.revision} (${res.indexed_files_count} files indexed).`
      });
      await fetchStats();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div className="tab-pane">
      <div className="tab-header">
        <div>
          <h2>Full-Text & Symbol Search</h2>
          <p className="tab-subtitle">
            Sub-millisecond FTS5 search across all files, code symbols, and commit logs with automatic ACL security trimming.
          </p>
        </div>
        {stats && (
          <div className="badge badge-info" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Database size={16} />
            <span>Indexed Documents: <strong>{stats.total_documents_indexed}</strong></span>
            <span>Covered Repos: <strong>{stats.repositories_indexed}</strong></span>
          </div>
        )}
      </div>

      {notification && (
        <div className={`alert alert-${notification.type === 'error' ? 'danger' : 'success'}`} style={{ marginBottom: '1rem' }}>
          {notification.message}
        </div>
      )}

      {/* Search Input Bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '2.5rem', fontSize: '1.05rem', height: '46px' }}
                placeholder="Search code, functions, commits or type 'r42' to jump to revision..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <SearchIcon size={18} style={{ position: 'absolute', left: '1rem', top: '14px', color: '#64748b' }} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: '46px', padding: '0 1.5rem' }} disabled={loading}>
              <SearchIcon size={16} />
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Filters Row */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={14} color="#64748b" />
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Filters:</span>
            </div>

            <select
              className="form-control"
              style={{ width: '200px', height: '36px', fontSize: '0.85rem' }}
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">All Repositories</option>
              {repositories.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>

            <input
              type="text"
              className="form-control"
              style={{ width: '130px', height: '36px', fontSize: '0.85rem' }}
              placeholder="Ext (e.g. .cpp)"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
            />

            <input
              type="text"
              className="form-control"
              style={{ width: '160px', height: '36px', fontSize: '0.85rem' }}
              placeholder="Path prefix (/trunk)"
              value={pathPrefix}
              onChange={(e) => setPathPrefix(e.target.value)}
            />

            <input
              type="text"
              className="form-control"
              style={{ width: '160px', height: '36px', fontSize: '0.85rem' }}
              placeholder="Security Trim User"
              value={username}
              title="Filter results by effective permissions of this user"
              onChange={(e) => setUsername(e.target.value)}
            />

            {selectedRepoId !== '' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => handleIndexRepo(Number(selectedRepoId))}
                disabled={indexing}
              >
                <RefreshCw size={13} className={indexing ? 'spin' : ''} />
                {indexing ? 'Indexing Repository...' : 'Re-Index Repository'}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Jump Revision Announcement */}
      {jumpRev !== null && (
        <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid #6366f1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <GitCommit size={20} color="#6366f1" />
            <div>
              <strong>Instant Jump to Revision: r{jumpRev}</strong>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Matched revision shortcut query</div>
            </div>
          </div>
          <span className="badge badge-primary">Revision #{jumpRev}</span>
        </div>
      )}

      {/* Search Results */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>
            Search Results {query && `(${totalHits} match${totalHits === 1 ? '' : 'es'})`}
          </h3>
        </div>

        {results.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <SearchIcon size={36} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
            <p style={{ color: '#64748b', margin: 0 }}>
              {query ? 'No matching files or commit records found for this query.' : 'Enter a query or symbol name above to search indexed repositories.'}
            </p>
          </div>
        ) : (
          <div className="search-results-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {results.map((hit) => (
              <div
                key={hit.id}
                style={{
                  padding: '1rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={16} color="#3b82f6" />
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{hit.filename}</span>
                    <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>{hit.repository_name}</span>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>r{hit.revision}</span>
                  </div>
                  {hit.author && (
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      by <strong>{hit.author}</strong>
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                  {hit.path}
                </div>

                {hit.snippet && (
                  <div
                    style={{
                      fontSize: '0.88rem',
                      fontFamily: 'monospace',
                      backgroundColor: '#f8fafc',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '4px',
                      color: '#334155',
                      lineHeight: '1.4'
                    }}
                    dangerouslySetInnerHTML={{ __html: hit.snippet }}
                  />
                )}

                {hit.log_message && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.4rem', fontStyle: 'italic' }}>
                    Commit log: "{hit.log_message}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
