"""
Subversion Nuvi - Configuration Management
Supports loading from .env files, system environment, and defaults.
"""
import os
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent.parent

def load_env_file(explicit_path: Optional[str] = None) -> Optional[Path]:
    """
    Discovers and loads environment variables from a .env file.
    Search order:
      1. Explicit path passed as argument
      2. Path in NUVI_ENV_FILE environment variable
      3. Current working directory: ./.env
      4. Application source root: BASE_DIR / .env
      5. Standard system configuration: /etc/nuvi/nuvi.env or /etc/nuvi/.env
      6. Standard installation directory: /opt/nuvi/.env
    """
    candidates = []
    if explicit_path:
        candidates.append(Path(explicit_path))
    if os.getenv("NUVI_ENV_FILE"):
        candidates.append(Path(os.environ["NUVI_ENV_FILE"]))

    candidates.extend([
        Path.cwd() / ".env",
        BASE_DIR / ".env",
        Path("/etc/nuvi/nuvi.env"),
        Path("/etc/nuvi/.env"),
        Path("/opt/nuvi/.env"),
    ])

    for candidate in candidates:
        try:
            if not candidate.is_file():
                continue
        except (PermissionError, OSError):
            continue

        # Try python-dotenv first
        try:
            import dotenv
            dotenv.load_dotenv(candidate, override=False)
            return candidate
        except ImportError:
            pass
        except (PermissionError, OSError):
            continue

        # Built-in robust parser if python-dotenv is not available
        try:
            with open(candidate, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k not in os.environ:
                        os.environ[k] = v
            return candidate
        except (PermissionError, OSError):
            continue
        except Exception:
            pass
    return None

def get_env_bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.strip().lower() in ("true", "1", "yes", "on")

def get_env_int(key: str, default: int) -> int:
    val = os.getenv(key)
    if val is None:
        return default
    try:
        return int(val.strip())
    except ValueError:
        return default

@dataclass
class NuviConfig:
    # 1. Server identity & Environment
    SERVER_NAME: str = "Subversion Nuvi Enterprise Server"
    ENV: str = "production"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "change-me-to-a-secure-random-secret-key"
    ENV_FILE_LOADED: Optional[str] = None

    # 2. Network & Ports
    HOST: str = "0.0.0.0"
    PORT: int = 8080
    SVN_PORT: int = 8081
    SVN_URL_PREFIX: str = "/svn"
    API_URL_PREFIX: str = "/api/v1"
    
    # 3. Storage Paths
    DATA_DIR: Path = BASE_DIR / "data"
    REPOSITORIES_ROOT: Path = BASE_DIR / "data" / "repositories"
    DB_PATH: Path = BASE_DIR / "data" / "db" / "nuvi_metadata.sqlite3"
    BACKUP_DIR: Path = BASE_DIR / "data" / "backups"
    SEARCH_INDEX_DIR: Path = BASE_DIR / "data" / "search_index"
    CERTS_DIR: Path = BASE_DIR / "data" / "certs"
    LOGS_DIR: Path = BASE_DIR / "data" / "logs"

    # 4. Authorization & Credentials
    AUTHZ_FILE: Path = BASE_DIR / "data" / "authz"
    HTPASSWD_FILE: Path = BASE_DIR / "data" / "htpasswd"

    # 5. Log Files
    API_LOG: Path = BASE_DIR / "data" / "logs" / "api.log"
    WORKER_LOG: Path = BASE_DIR / "data" / "logs" / "worker.log"
    SVN_ACCESS_LOG: Path = BASE_DIR / "data" / "logs" / "svn_access.log"
    SVN_ERROR_LOG: Path = BASE_DIR / "data" / "logs" / "svn_error.log"

    # 6. Security & Brute-force Shield
    BAN_THRESHOLD: int = 5                  # Failed attempts before ban
    BAN_RESET_SECONDS: int = 600           # 10 minutes reset window
    BAN_DURATION_SECONDS: int = 900        # 15 minutes ban
    BAN_IPV6_SUBNET_PREFIX: int = 64       # Ban /64 subnet for IPv6
    TRUSTED_SUBNETS: List[str] = field(default_factory=lambda: ["127.0.0.1/32", "::1/128"])

    # 7. Password Policy
    PASSWORD_MIN_LENGTH: int = 4
    PASSWORD_REQUIRE_UPPERCASE: bool = False
    PASSWORD_REQUIRE_LOWERCASE: bool = False
    PASSWORD_REQUIRE_DIGITS: bool = False
    PASSWORD_REQUIRE_SPECIAL: bool = False
    PASSWORD_HISTORY_COUNT: int = 5

    # 8. Argon2id Parameters
    ARGON2_TIME_COST: int = 2
    ARGON2_MEMORY_COST: int = 19456  # 19 MiB
    ARGON2_PARALLELISM: int = 1

    def __post_init__(self):
        # 1. Discover and load .env file if available
        loaded_env = load_env_file()
        if loaded_env:
            self.ENV_FILE_LOADED = str(loaded_env)

        # 2. Server identity & runtime mode
        if os.getenv("NUVI_SERVER_NAME"):
            self.SERVER_NAME = os.environ["NUVI_SERVER_NAME"]
        if os.getenv("NUVI_ENV"):
            self.ENV = os.environ["NUVI_ENV"]
        if os.getenv("NUVI_LOG_LEVEL"):
            self.LOG_LEVEL = os.environ["NUVI_LOG_LEVEL"].upper()
        if os.getenv("NUVI_SECRET_KEY"):
            self.SECRET_KEY = os.environ["NUVI_SECRET_KEY"]

        # 3. Network & Ports
        if os.getenv("NUVI_HOST"):
            self.HOST = os.environ["NUVI_HOST"]
        self.PORT = get_env_int("NUVI_PORT", get_env_int("NUVI_API_PORT", self.PORT))
        self.SVN_PORT = get_env_int("NUVI_SVN_PORT", self.SVN_PORT)
        if os.getenv("NUVI_SVN_URL_PREFIX"):
            self.SVN_URL_PREFIX = os.environ["NUVI_SVN_URL_PREFIX"]
        if os.getenv("NUVI_API_URL_PREFIX"):
            self.API_URL_PREFIX = os.environ["NUVI_API_URL_PREFIX"]

        # 4. Storage root & derived paths
        env_data_dir = os.getenv("NUVI_DATA_DIR")
        if env_data_dir:
            self.DATA_DIR = Path(env_data_dir)

        # Specific path overrides with sensible defaults relative to DATA_DIR
        self.REPOSITORIES_ROOT = Path(os.getenv("NUVI_REPOSITORIES_ROOT", self.DATA_DIR / "repositories"))
        self.DB_PATH = Path(os.getenv("NUVI_DB_PATH", self.DATA_DIR / "db" / "nuvi_metadata.sqlite3"))
        self.BACKUP_DIR = Path(os.getenv("NUVI_BACKUP_DIR", self.DATA_DIR / "backups"))
        self.SEARCH_INDEX_DIR = Path(os.getenv("NUVI_SEARCH_INDEX_DIR", self.DATA_DIR / "search_index"))
        self.CERTS_DIR = Path(os.getenv("NUVI_CERTS_DIR", self.DATA_DIR / "certs"))

        # 5. Authorization & Credentials files
        self.AUTHZ_FILE = Path(os.getenv("NUVI_AUTHZ_FILE", self.DATA_DIR / "authz"))
        self.HTPASSWD_FILE = Path(os.getenv("NUVI_HTPASSWD_FILE", self.DATA_DIR / "htpasswd"))

        # 6. Log directory & log files
        env_logs_dir = os.getenv("NUVI_LOGS_DIR") or os.getenv("NUVI_LOG_DIR")
        if env_logs_dir:
            self.LOGS_DIR = Path(env_logs_dir)
        else:
            self.LOGS_DIR = self.DATA_DIR / "logs"

        self.API_LOG = Path(os.getenv("NUVI_API_LOG", self.LOGS_DIR / "api.log"))
        self.WORKER_LOG = Path(os.getenv("NUVI_WORKER_LOG", self.LOGS_DIR / "worker.log"))
        self.SVN_ACCESS_LOG = Path(os.getenv("NUVI_SVN_ACCESS_LOG", self.LOGS_DIR / "svn_access.log"))
        self.SVN_ERROR_LOG = Path(os.getenv("NUVI_SVN_ERROR_LOG", self.LOGS_DIR / "svn_error.log"))

        # 7. Security Shield & Rate Limiting
        self.BAN_THRESHOLD = get_env_int("NUVI_BAN_THRESHOLD", self.BAN_THRESHOLD)
        self.BAN_RESET_SECONDS = get_env_int("NUVI_BAN_RESET_SECONDS", self.BAN_RESET_SECONDS)
        self.BAN_DURATION_SECONDS = get_env_int("NUVI_BAN_DURATION_SECONDS", self.BAN_DURATION_SECONDS)
        self.BAN_IPV6_SUBNET_PREFIX = get_env_int("NUVI_BAN_IPV6_SUBNET_PREFIX", self.BAN_IPV6_SUBNET_PREFIX)
        if os.getenv("NUVI_TRUSTED_SUBNETS"):
            self.TRUSTED_SUBNETS = [s.strip() for s in os.environ["NUVI_TRUSTED_SUBNETS"].split(",") if s.strip()]

        # 8. Password Policy
        self.PASSWORD_MIN_LENGTH = get_env_int("NUVI_PASSWORD_MIN_LENGTH", self.PASSWORD_MIN_LENGTH)
        self.PASSWORD_REQUIRE_UPPERCASE = get_env_bool("NUVI_PASSWORD_REQUIRE_UPPERCASE", self.PASSWORD_REQUIRE_UPPERCASE)
        self.PASSWORD_REQUIRE_LOWERCASE = get_env_bool("NUVI_PASSWORD_REQUIRE_LOWERCASE", self.PASSWORD_REQUIRE_LOWERCASE)
        self.PASSWORD_REQUIRE_DIGITS = get_env_bool("NUVI_PASSWORD_REQUIRE_DIGITS", self.PASSWORD_REQUIRE_DIGITS)
        self.PASSWORD_REQUIRE_SPECIAL = get_env_bool("NUVI_PASSWORD_REQUIRE_SPECIAL", self.PASSWORD_REQUIRE_SPECIAL)
        self.PASSWORD_HISTORY_COUNT = get_env_int("NUVI_PASSWORD_HISTORY_COUNT", self.PASSWORD_HISTORY_COUNT)

        # 9. Argon2id Tuning
        self.ARGON2_TIME_COST = get_env_int("NUVI_ARGON2_TIME_COST", self.ARGON2_TIME_COST)
        self.ARGON2_MEMORY_COST = get_env_int("NUVI_ARGON2_MEMORY_COST", self.ARGON2_MEMORY_COST)
        self.ARGON2_PARALLELISM = get_env_int("NUVI_ARGON2_PARALLELISM", self.ARGON2_PARALLELISM)

        # 10. Ensure directories exist safely
        for directory in [
            self.DATA_DIR,
            self.REPOSITORIES_ROOT,
            self.DB_PATH.parent,
            self.AUTHZ_FILE.parent,
            self.HTPASSWD_FILE.parent,
            self.BACKUP_DIR,
            self.SEARCH_INDEX_DIR,
            self.CERTS_DIR,
            self.LOGS_DIR,
            self.API_LOG.parent,
            self.WORKER_LOG.parent,
            self.SVN_ACCESS_LOG.parent,
            self.SVN_ERROR_LOG.parent,
        ]:
            try:
                directory.mkdir(parents=True, exist_ok=True)
            except Exception:
                pass

# Global default configuration instance
config = NuviConfig()


