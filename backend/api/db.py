"""
Subversion Nuvi - Database Engine & Session Management
"""
import sqlite3
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from backend.api.config import config

Base = declarative_base()

DATABASE_URL = f"sqlite:///{config.DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False
)

# Enable SQLite WAL mode, foreign keys, and busy timeout for high-concurrency
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))

def get_db():
    """FastAPI context dependency to provide a transactional database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initializes all database tables and ensures schema migrations."""
    from backend.api.models import schema  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Auto-migrate columns if missing in SQLite
    with engine.connect() as conn:
        try:
            cursor = conn.exec_driver_sql("PRAGMA table_info(users)")
            cols = [row[1] for row in cursor.fetchall()]
            if cols and "htpasswd_hash" not in cols:
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN htpasswd_hash VARCHAR(128)")
                conn.commit()
        except Exception:
            pass
