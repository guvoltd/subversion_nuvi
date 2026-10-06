"""
Subversion Nuvi - Full-Text Search Engine with ACL Security Trimming
Utilizes SQLite FTS5 for high-speed indexing of file content, filenames, and commit messages.
Enforces automatic ACL security trimming to ensure users never see results for paths they cannot read.
"""

import re
import sqlite3
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.api.config import config
from backend.api.models.schema import Repository
from backend.api.services.svn_native import svn_engine
from backend.api.services.acl_service import AclService

class SearchService:
    @staticmethod
    def init_search_tables(db: Session):
        """Initializes FTS5 virtual table and documents store if not present."""
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS search_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repository_id INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                path TEXT NOT NULL,
                filename TEXT NOT NULL,
                author TEXT,
                log_message TEXT,
                content TEXT,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(repository_id, path, revision)
            );
        """))
        db.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
                filename,
                path,
                author,
                log_message,
                content,
                content='search_documents',
                content_rowid='id',
                tokenize='porter unicode61'
            );
        """))
        # Triggers for keeping FTS5 index in sync
        db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS search_docs_ai AFTER INSERT ON search_documents BEGIN
                INSERT INTO search_fts(rowid, filename, path, author, log_message, content)
                VALUES (new.id, new.filename, new.path, new.author, new.log_message, new.content);
            END;
        """))
        db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS search_docs_ad AFTER DELETE ON search_documents BEGIN
                INSERT INTO search_fts(search_fts, rowid, filename, path, author, log_message, content)
                VALUES('delete', old.id, old.filename, old.path, old.author, old.log_message, old.content);
            END;
        """))
        db.commit()

    @staticmethod
    def index_repository(db: Session, repo_id: int, revision: int = -1) -> Dict[str, Any]:
        """Indexes all text files and directory structures in a repository at given revision."""
        SearchService.init_search_tables(db)
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise ValueError(f"Repository ID {repo_id} not found.")

        info = svn_engine.get_repository_info(repo.fs_path)
        target_rev = info["latest_revision"] if revision < 0 else revision

        indexed_count = 0

        # Recursively walk tree
        def walk_and_index(dir_path: str):
            nonlocal indexed_count
            tree = svn_engine.list_directory(repo.fs_path, dir_path=dir_path, revision=target_rev)
            for entry in tree["entries"]:
                if entry["is_dir"]:
                    walk_and_index(entry["path"])
                else:
                    # Index file if not binary / large
                    try:
                        content = svn_engine.cat_file(repo.fs_path, entry["path"], revision=target_rev)
                        # Truncate content to 500KB to prevent excessive memory usage
                        if len(content) > 500_000:
                            content = content[:500_000]

                        filename = entry["name"]
                        author = entry["last_author"] or ""
                        log_msg = entry["last_log"] or ""

                        # Upsert document
                        db.execute(text("""
                            INSERT INTO search_documents (repository_id, revision, path, filename, author, log_message, content)
                            VALUES (:repo_id, :rev, :path, :filename, :author, :log_msg, :content)
                            ON CONFLICT(repository_id, path, revision) DO UPDATE SET
                                content=excluded.content,
                                author=excluded.author,
                                log_message=excluded.log_message,
                                indexed_at=CURRENT_TIMESTAMP;
                        """), {
                            "repo_id": repo.id,
                            "rev": target_rev,
                            "path": entry["path"],
                            "filename": filename,
                            "author": author,
                            "log_msg": log_msg,
                            "content": content
                        })
                        db.commit()
                        indexed_count += 1
                    except Exception:
                        pass

        walk_and_index("/")
        return {"repository_id": repo.id, "revision": target_rev, "indexed_files_count": indexed_count}

    @staticmethod
    def search(
        db: Session,
        query_str: str,
        repository_id: Optional[int] = None,
        path_prefix: Optional[str] = None,
        extension: Optional[str] = None,
        username: Optional[str] = None,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Executes unified search with instant jump-to-revision and ACL security trimming.
        """
        SearchService.init_search_tables(db)
        clean_query = query_str.strip()
        if not clean_query:
            return {"total_hits": 0, "results": [], "query": query_str}

        # 1. Instant Jump to Revision: check if query matches 'r123' or purely digits
        rev_match = re.match(r"^r?(\d+)$", clean_query, re.IGNORECASE)
        jump_revision = None
        if rev_match:
            jump_revision = int(rev_match.group(1))

        # 2. Execute FTS5 match query
        # Sanitize query for FTS5 (escape quotes)
        safe_query = clean_query.replace('"', '""')
        fts_match_expr = f'"{safe_query}"*'

        sql = """
            SELECT 
                d.id,
                d.repository_id,
                r.name as repository_name,
                d.revision,
                d.path,
                d.filename,
                d.author,
                d.log_message,
                snippet(search_fts, 4, '<mark>', '</mark>', '...', 25) as snippet,
                bm25(search_fts) as rank
            FROM search_fts f
            JOIN search_documents d ON f.rowid = d.id
            JOIN repositories r ON d.repository_id = r.id
            WHERE search_fts MATCH :query
        """
        params: Dict[str, Any] = {"query": fts_match_expr}

        if repository_id is not None:
            sql += " AND d.repository_id = :repo_id"
            params["repo_id"] = repository_id

        if path_prefix:
            sql += " AND d.path LIKE :path_prefix"
            params["path_prefix"] = f"{path_prefix.rstrip('/')}%"

        if extension:
            ext_clean = extension.lstrip(".")
            sql += " AND d.filename LIKE :ext"
            params["ext"] = f"%.{ext_clean}"

        sql += " ORDER BY rank LIMIT :limit"
        params["limit"] = limit * 2 # Fetch extra candidates to account for ACL trimming

        rows = db.execute(text(sql), params).fetchall()
        raw_results = []
        for r in rows:
            raw_results.append({
                "id": r[0],
                "repository_id": r[1],
                "repository_name": r[2],
                "revision": r[3],
                "path": r[4],
                "filename": r[5],
                "author": r[6],
                "log_message": r[7],
                "snippet": r[8],
                "rank": float(r[9]) if r[9] is not None else 0.0
            })

        # 3. TASK-4.3: ACL Security Trimming
        # If username is provided, filter out paths that the user cannot read
        trimmed_results = []
        for item in raw_results:
            if username:
                eval_res = AclService.evaluate_effective_permission(
                    db,
                    username=username,
                    repository_id=item["repository_id"],
                    target_path=item["path"]
                )
                if not eval_res.can_read:
                    # Silently skip security-trimmed result
                    continue

            trimmed_results.append(item)
            if len(trimmed_results) >= limit:
                break

        return {
            "query": query_str,
            "jump_revision": jump_revision,
            "total_hits": len(trimmed_results),
            "results": trimmed_results
        }

    @staticmethod
    def get_index_stats(db: Session) -> Dict[str, Any]:
        SearchService.init_search_tables(db)
        doc_count = db.execute(text("SELECT count(*) FROM search_documents")).scalar() or 0
        repos_indexed = db.execute(text("SELECT count(DISTINCT repository_id) FROM search_documents")).scalar() or 0
        return {
            "total_documents_indexed": doc_count,
            "repositories_indexed": repos_indexed,
            "engine": "SQLite FTS5 (BM25 + Porter Stemmer)"
        }
