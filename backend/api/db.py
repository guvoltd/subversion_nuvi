"""
Subversion Nuvi - Database Engine & Session Management
"""
import sqlite3
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from backend.api.config import config

Base = declarative_base()

# Ensure parent directory of database file exists
try:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

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
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
        except Exception:
            pass
        try:
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
        except Exception:
            pass
        finally:
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
    """Initializes all database tables, ensures schema migrations, seeds default admin, and generates initial authz/htpasswd."""
    from backend.api.models import schema  # noqa: F401
    try:
        config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
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

    # Ensure default administrator exists and compile authz/htpasswd files
    from backend.api.models.schema import User
    from backend.api.services.security_service import ph, generate_apache_sha
    from backend.api.services.acl_service import AclService
    from sqlalchemy import func

    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(func.lower(User.username) == "admin").first()
        created_admin = False
        if not admin_user:
            # Check if any administrator exists at all
            any_admin = db.query(User).filter(User.is_admin == True).first()
            if not any_admin:
                admin_user = User(
                    username="admin",
                    password_hash=ph.hash("admin"),
                    htpasswd_hash=generate_apache_sha("admin"),
                    email="admin@localhost",
                    full_name="Administrator",
                    is_active=True,
                    is_admin=True,
                )
                db.add(admin_user)
                db.commit()
                created_admin = True
        elif not getattr(admin_user, "htpasswd_hash", None):
            try:
                if ph.verify(admin_user.password_hash, "admin"):
                    admin_user.htpasswd_hash = generate_apache_sha("admin")
                    db.commit()
            except Exception:
                pass

        def _is_missing_or_empty(p):
            try:
                return not p.exists() or p.stat().st_size == 0
            except Exception:
                return True

        if created_admin or _is_missing_or_empty(config.AUTHZ_FILE) or _is_missing_or_empty(config.HTPASSWD_FILE):
            try:
                AclService.compile_authz_file(db)
            except Exception:
                pass
    except Exception:
        pass
    finally:
        db.close()
