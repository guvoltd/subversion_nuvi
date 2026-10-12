#!/usr/bin/env bash
# ==============================================================================
# Subversion Nuvi - Clean Slate Purge & Interactive Reinstallation Script
# 
# Features:
# 1. Automatically inspects /etc/nuvi/nuvi.env (if present) to discover existing paths.
# 2. Performs a complete clean slate removal of Subversion Nuvi, services, and data.
# 3. Interactively prompts for custom installation paths, ports, and hostname.
# 4. Creates system users & groups (subversion, nuvi, www-data, $SUDO_USER).
# 5. Generates a fresh /etc/nuvi/nuvi.env with user selections.
# 6. Initializes storage directories with proper ownership and permissions (2775/2770).
# 7. Initializes metadata database with default admin/admin credentials.
# 8. Configures and enables Apache mod_dav_svn (nuvi-svn.conf) and restarts Apache.
# 9. Configures and starts systemd services (nuvi-api, nuvi-worker).
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/backend" ]; then
    WORKSPACE_ROOT="$SCRIPT_DIR"
elif [ -d "$SCRIPT_DIR/../backend" ]; then
    WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
    WORKSPACE_ROOT="/opt/nuvi"
fi

for arg in "$@"; do
    if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
        echo "Usage: sudo $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  -y, --yes, --non-interactive  Run without interactive prompts"
        echo "  --data-dir=<path>             Base storage path (default: /home/nuvi-svn/data or discovered)"
        echo "  --repos-dir=<path>            Repositories path (default: <data-dir>/repositories)"
        echo "  --web-port=<port>             Web console port (default: 8080)"
        echo "  --svn-port=<port>             Subversion WebDAV port (default: 8081)"
        echo "  --host=<domain|ip>            Server hostname/IP (default: me-server.in)"
        echo "  --admin-pass=<password>       Default admin password (default: admin)"
        echo "  -h, --help                    Show this help message"
        exit 0
    fi
done

# ------------------------------------------------------------------------------
# 0. Check Root Privileges
# ------------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}[ERROR] This script must be executed with root privileges.${NC}"
    echo -e "Please run with: ${BOLD}sudo $0${NC}"
    exit 1
fi

echo -e "${BLUE}========================================================================${NC}"
echo -e "${BLUE}${BOLD}        Subversion Nuvi - Clean Slate Purge & Interactive Setup        ${NC}"
echo -e "${BLUE}========================================================================${NC}"
echo ""

# ------------------------------------------------------------------------------
# Parse CLI Options
# ------------------------------------------------------------------------------
AUTO_CONFIRM=false
CLI_DATA_DIR=""
CLI_REPOS_DIR=""
CLI_WEB_PORT=""
CLI_SVN_PORT=""
CLI_HOST=""
CLI_ADMIN_PASS="admin"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -y|--yes|--non-interactive)
            AUTO_CONFIRM=true
            shift
            ;;
        --data-dir=*)
            CLI_DATA_DIR="${1#*=}"
            shift
            ;;
        --data-dir)
            CLI_DATA_DIR="$2"
            shift 2
            ;;
        --repos-dir=*)
            CLI_REPOS_DIR="${1#*=}"
            shift
            ;;
        --repos-dir)
            CLI_REPOS_DIR="$2"
            shift 2
            ;;
        --web-port=*)
            CLI_WEB_PORT="${1#*=}"
            shift
            ;;
        --web-port)
            CLI_WEB_PORT="$2"
            shift 2
            ;;
        --svn-port=*)
            CLI_SVN_PORT="${1#*=}"
            shift
            ;;
        --svn-port)
            CLI_SVN_PORT="$2"
            shift 2
            ;;
        --host=*)
            CLI_HOST="${1#*=}"
            shift
            ;;
        --host)
            CLI_HOST="$2"
            shift 2
            ;;
        --admin-pass=*)
            CLI_ADMIN_PASS="${1#*=}"
            shift
            ;;
        --admin-pass)
            CLI_ADMIN_PASS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: sudo $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -y, --yes, --non-interactive  Run without interactive prompts"
            echo "  --data-dir=<path>             Base storage path (default: /home/nuvi-svn/data or discovered)"
            echo "  --repos-dir=<path>            Repositories path (default: <data-dir>/repositories)"
            echo "  --web-port=<port>             Web console port (default: 8080)"
            echo "  --svn-port=<port>             Subversion WebDAV port (default: 8081)"
            echo "  --host=<domain|ip>            Server hostname/IP (default: me-server.in)"
            echo "  --admin-pass=<password>       Default admin password (default: admin)"
            echo "  -h, --help                    Show this help message"
            exit 0
            ;;
        *)
            echo -e "${YELLOW}[WARNING] Unrecognized argument: $1 (ignoring)${NC}"
            shift
            ;;
    esac
done

# ------------------------------------------------------------------------------
# STEP 1: Discover Existing /etc/nuvi/nuvi.env
# ------------------------------------------------------------------------------
echo -e "${CYAN}${BOLD}[STEP 1/8] Inspecting existing system configuration...${NC}"

OLD_DATA_DIR=""
OLD_REPOS_DIR=""
OLD_DB_PATH=""
OLD_AUTHZ_FILE=""
OLD_HTPASSWD_FILE=""
OLD_WEB_PORT="8080"
OLD_SVN_PORT="8081"
OLD_HOST="me-server.in"
DISCOVERED_ENV=""

CANDIDATE_ENVS=(
    "/etc/nuvi/nuvi.env"
    "/opt/nuvi/.env"
    "$WORKSPACE_ROOT/.env"
)

for env_path in "${CANDIDATE_ENVS[@]}"; do
    if [[ -f "$env_path" ]]; then
        DISCOVERED_ENV="$env_path"
        break
    fi
done

if [[ -n "$DISCOVERED_ENV" ]]; then
    echo -e "${GREEN}[INFO] Found existing configuration at: ${DISCOVERED_ENV}${NC}"
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            val="${BASH_REMATCH[2]}"
            # Strip quotes and trailing comments
            val="$(echo "$val" | sed -e 's/^[[:space:]]*["'\'']//' -e 's/["'\''][[:space:]]*$//' -e 's/[[:space:]]*#.*$//')"
            case "$key" in
                NUVI_DATA_DIR) OLD_DATA_DIR="$val" ;;
                NUVI_REPOSITORIES_ROOT|NUVI_REPOSITORIES_PATH) OLD_REPOS_DIR="$val" ;;
                NUVI_DB_PATH) OLD_DB_PATH="$val" ;;
                NUVI_AUTHZ_FILE) OLD_AUTHZ_FILE="$val" ;;
                NUVI_HTPASSWD_FILE) OLD_HTPASSWD_FILE="$val" ;;
                NUVI_PORT|NUVI_API_PORT) OLD_WEB_PORT="$val" ;;
                NUVI_SVN_PORT) OLD_SVN_PORT="$val" ;;
                NUVI_SERVER_HOST|NUVI_HOST) OLD_HOST="$val" ;;
            esac
        fi
    done < "$DISCOVERED_ENV"

    echo -e "  - Discovered Data Directory:        ${OLD_DATA_DIR:-<none>}"
    echo -e "  - Discovered Repositories Path:     ${OLD_REPOS_DIR:-<none>}"
    echo -e "  - Discovered Metadata DB Path:      ${OLD_DB_PATH:-<none>}"
    echo -e "  - Discovered Web Console Port:      ${OLD_WEB_PORT}"
    echo -e "  - Discovered Subversion Port:       ${OLD_SVN_PORT}"
    echo -e "  - Discovered Hostname/IP:           ${OLD_HOST}"
else
    echo -e "${YELLOW}[INFO] No prior configuration (/etc/nuvi/nuvi.env) detected. Using standard defaults.${NC}"
fi

# Fallback defaults if not set in old env
[[ -z "$OLD_DATA_DIR" ]] && OLD_DATA_DIR="/home/nuvi-svn/data"
[[ -z "$OLD_REPOS_DIR" ]] && OLD_REPOS_DIR="${OLD_DATA_DIR}/repositories"

# ------------------------------------------------------------------------------
# STEP 2: Confirm and Perform Complete Clean Slate Purge
# ------------------------------------------------------------------------------
echo ""
echo -e "${RED}${BOLD}[STEP 2/8] Complete Clean Slate Removal (Purge)${NC}"
echo -e "${YELLOW}${BOLD}[CAUTION]${NC} This will completely remove Subversion Nuvi, services, configurations,"
echo -e "and all repository data located at:"
echo -e "  • ${OLD_DATA_DIR}"
[[ -n "$OLD_REPOS_DIR" && "$OLD_REPOS_DIR" != "$OLD_DATA_DIR"* ]] && echo -e "  • ${OLD_REPOS_DIR}"
echo -e "  • /opt/nuvi, /etc/nuvi, /var/log/nuvi, /var/lib/nuvi"
echo ""

if [ "$AUTO_CONFIRM" != "true" ]; then
    read -r -p "Are you sure you want to completely purge Subversion Nuvi? [y/N]: " confirm_purge
    if [[ ! "$confirm_purge" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}[CANCELLED] Clean slate purge aborted by user.${NC}"
        exit 0
    fi
fi

echo -e "${CYAN}[*] Stopping and disabling services...${NC}"
systemctl stop nuvi-api.service nuvi-worker.service apache2 2>/dev/null || true
systemctl disable nuvi-api.service nuvi-worker.service 2>/dev/null || true
pkill -9 -f 'uvicorn.*backend.api.main' 2>/dev/null || true
pkill -9 -f 'backend.api.worker' 2>/dev/null || true

echo -e "${CYAN}[*] Purging Debian package if installed...${NC}"
apt-get purge -y subversion-nuvi 2>/dev/null || dpkg -P subversion-nuvi 2>/dev/null || true

echo -e "${CYAN}[*] Removing systemd unit files & binary symlinks...${NC}"
rm -f /etc/systemd/system/nuvi-api.service
rm -f /etc/systemd/system/nuvi-worker.service
rm -f /usr/bin/nuvictl
rm -f /usr/local/bin/nuvictl
systemctl daemon-reload
systemctl reset-failed 2>/dev/null || true

# Helper function for safe recursive directory removal
safe_remove_dir() {
    local target="$1"
    if [[ -z "$target" ]]; then return 0; fi
    # Canonicalize path
    local canon
    canon="$(readlink -f "$target" 2>/dev/null || echo "$target")"
    
    # Critical security sanity checks: NEVER remove root, system top-levels, or full /home
    case "$canon" in
        ""|"/"|"/root"|"/home"|"/var"|"/etc"|"/usr"|"/opt"|"/tmp"|"/bin"|"/sbin"|"/lib"|"/lib64"|"/boot"|"/dev"|"/proc"|"/sys")
            echo -e "${RED}[SAFETY BLOCK] Refusing to delete protected system root: $canon${NC}"
            return 1
            ;;
        *)
            if [[ -d "$canon" || -L "$canon" ]]; then
                echo -e "    Removing: $canon"
                rm -rf "$canon"
            fi
            ;;
    esac
}

echo -e "${CYAN}[*] Removing application and data directories...${NC}"
# Remove discovered custom data paths
safe_remove_dir "$OLD_DATA_DIR"
if [[ -n "$OLD_REPOS_DIR" && "$OLD_REPOS_DIR" != "$OLD_DATA_DIR"* ]]; then
    safe_remove_dir "$OLD_REPOS_DIR"
fi

# If /home/nuvi-svn was used and is now empty or has old files, purge /home/nuvi-svn
if [[ "$OLD_DATA_DIR" == "/home/nuvi-svn"* && -d "/home/nuvi-svn" ]]; then
    safe_remove_dir "/home/nuvi-svn"
fi

# Remove standard distribution locations
safe_remove_dir "/opt/nuvi"
safe_remove_dir "/etc/nuvi"
safe_remove_dir "/var/log/nuvi"
safe_remove_dir "/var/lib/nuvi"
safe_remove_dir "/var/nuvi"

echo -e "${CYAN}[*] Removing Apache Subversion configuration...${NC}"
a2dissite nuvi-svn.conf 2>/dev/null || true
rm -f /etc/apache2/sites-available/nuvi-svn.conf
rm -f /etc/apache2/sites-enabled/nuvi-svn.conf

echo -e "${CYAN}[*] Removing legacy system users and groups...${NC}"
userdel -f nuvi 2>/dev/null || true
groupdel nuvi 2>/dev/null || true
userdel -f subversion 2>/dev/null || true
groupdel subversion 2>/dev/null || true

echo -e "${GREEN}[SUCCESS] System wiped cleanly. Ready for fresh installation.${NC}"
echo ""

# ------------------------------------------------------------------------------
# STEP 3: Interactive Configuration Prompts
# ------------------------------------------------------------------------------
echo -e "${CYAN}${BOLD}[STEP 3/8] Configure Target Installation Settings${NC}"

# 1. Base Data Directory
DEFAULT_DATA_DIR="${CLI_DATA_DIR:-$OLD_DATA_DIR}"
[[ -z "$DEFAULT_DATA_DIR" ]] && DEFAULT_DATA_DIR="/home/nuvi-svn/data"
if [ "$AUTO_CONFIRM" = "true" ] || [ -n "$CLI_DATA_DIR" ]; then
    TARGET_DATA_DIR="$DEFAULT_DATA_DIR"
else
    read -r -p "Enter Base Data Directory [$DEFAULT_DATA_DIR]: " user_data_dir
    TARGET_DATA_DIR="${user_data_dir:-$DEFAULT_DATA_DIR}"
fi
# Strip trailing slash
TARGET_DATA_DIR="${TARGET_DATA_DIR%/}"

# 2. Repositories Directory
DEFAULT_REPOS_DIR="${CLI_REPOS_DIR:-${TARGET_DATA_DIR}/repositories}"
if [ "$AUTO_CONFIRM" = "true" ] || [ -n "$CLI_REPOS_DIR" ]; then
    TARGET_REPOS_DIR="$DEFAULT_REPOS_DIR"
else
    read -r -p "Enter Repositories Storage Path [$DEFAULT_REPOS_DIR]: " user_repos_dir
    TARGET_REPOS_DIR="${user_repos_dir:-$DEFAULT_REPOS_DIR}"
fi
TARGET_REPOS_DIR="${TARGET_REPOS_DIR%/}"

# 3. Web Console Port
DEFAULT_WEB_PORT="${CLI_WEB_PORT:-$OLD_WEB_PORT}"
[[ -z "$DEFAULT_WEB_PORT" ]] && DEFAULT_WEB_PORT="8080"
if [ "$AUTO_CONFIRM" = "true" ] || [ -n "$CLI_WEB_PORT" ]; then
    TARGET_WEB_PORT="$DEFAULT_WEB_PORT"
else
    read -r -p "Enter Web Console Management Port [$DEFAULT_WEB_PORT]: " user_web_port
    TARGET_WEB_PORT="${user_web_port:-$DEFAULT_WEB_PORT}"
fi

# 4. SVN WebDAV Port
DEFAULT_SVN_PORT="${CLI_SVN_PORT:-$OLD_SVN_PORT}"
[[ -z "$DEFAULT_SVN_PORT" ]] && DEFAULT_SVN_PORT="8081"
if [ "$AUTO_CONFIRM" = "true" ] || [ -n "$CLI_SVN_PORT" ]; then
    TARGET_SVN_PORT="$DEFAULT_SVN_PORT"
else
    read -r -p "Enter Subversion WebDAV Port [$DEFAULT_SVN_PORT]: " user_svn_port
    TARGET_SVN_PORT="${user_svn_port:-$DEFAULT_SVN_PORT}"
fi

# 5. Server Hostname / IP
DEFAULT_HOST="${CLI_HOST:-$OLD_HOST}"
[[ -z "$DEFAULT_HOST" ]] && DEFAULT_HOST="me-server.in"
if [ "$AUTO_CONFIRM" = "true" ] || [ -n "$CLI_HOST" ]; then
    TARGET_HOST="$DEFAULT_HOST"
else
    read -r -p "Enter Server Hostname / Domain / IP [$DEFAULT_HOST]: " user_host
    TARGET_HOST="${user_host:-$DEFAULT_HOST}"
fi

# 6. Admin Initial Password
DEFAULT_ADMIN_PASS="${CLI_ADMIN_PASS:-admin}"
if [ "$AUTO_CONFIRM" = "true" ] || [ -n "$CLI_ADMIN_PASS" ]; then
    TARGET_ADMIN_PASS="$DEFAULT_ADMIN_PASS"
else
    read -r -p "Enter Initial Admin Password [$DEFAULT_ADMIN_PASS]: " user_admin_pass
    TARGET_ADMIN_PASS="${user_admin_pass:-$DEFAULT_ADMIN_PASS}"
fi

echo ""
echo -e "${GREEN}Configuration Summary:${NC}"
echo -e "  • Base Data Directory:    ${BOLD}${TARGET_DATA_DIR}${NC}"
echo -e "  • Repositories Root:      ${BOLD}${TARGET_REPOS_DIR}${NC}"
echo -e "  • Web Console Port:       ${BOLD}${TARGET_WEB_PORT}${NC}"
echo -e "  • Subversion WebDAV Port: ${BOLD}${TARGET_SVN_PORT}${NC}"
echo -e "  • Server Hostname/IP:     ${BOLD}${TARGET_HOST}${NC}"
echo -e "  • Admin Credentials:      ${BOLD}admin / ${TARGET_ADMIN_PASS}${NC}"
echo ""

# ------------------------------------------------------------------------------
# STEP 4: Create Users, Groups, and Group Memberships
# ------------------------------------------------------------------------------
echo -e "${CYAN}${BOLD}[STEP 4/8] Creating system users and configuring mutual group rights...${NC}"

# 1. subversion group & user
if ! getent group subversion >/dev/null; then
    groupadd --system subversion
fi
if ! getent passwd subversion >/dev/null; then
    useradd --system --gid subversion --home-dir /opt/nuvi --no-create-home --shell /usr/sbin/nologin subversion
fi

# 2. nuvi group & user
if ! getent group nuvi >/dev/null; then
    groupadd --system nuvi
fi
if ! getent passwd nuvi >/dev/null; then
    useradd --system --gid nuvi --home-dir /opt/nuvi --no-create-home --shell /usr/sbin/nologin nuvi
fi

# 3. Mutual group memberships
usermod -aG nuvi subversion 2>/dev/null || true
usermod -aG subversion nuvi 2>/dev/null || true

# 4. Apache (www-data) integration
if getent group www-data >/dev/null; then
    usermod -aG subversion www-data 2>/dev/null || true
    usermod -aG www-data subversion 2>/dev/null || true
fi

# 5. Sudo invoking user membership (allows running nuvictl without root)
INVOKING_USER="${SUDO_USER:-$USER}"
if [[ -n "$INVOKING_USER" && "$INVOKING_USER" != "root" ]] && id -u "$INVOKING_USER" >/dev/null 2>&1; then
    echo -e "  Adding user '${INVOKING_USER}' to group 'subversion'..."
    usermod -aG subversion "$INVOKING_USER" 2>/dev/null || true
fi

# ------------------------------------------------------------------------------
# STEP 5: Generate Fresh /etc/nuvi/nuvi.env
# ------------------------------------------------------------------------------
echo -e "${CYAN}${BOLD}[STEP 5/8] Generating /etc/nuvi/nuvi.env...${NC}"

mkdir -p /etc/nuvi
chown root:subversion /etc/nuvi
chmod 755 /etc/nuvi

SECRET_KEY="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"

cat <<EOF > /etc/nuvi/nuvi.env
# ==============================================================================
# Subversion Nuvi - Enterprise Server Environment Configuration
# Generated by clean_slate_reinstall.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ==============================================================================

# 1. Server Identity & Security
NUVI_SERVER_NAME="Subversion Nuvi Enterprise Server"
NUVI_ENV=production
NUVI_LOG_LEVEL=INFO
NUVI_SECRET_KEY="${SECRET_KEY}"

# 2. Network & Listening Ports
NUVI_HOST=0.0.0.0
NUVI_PORT=${TARGET_WEB_PORT}
NUVI_API_PORT=${TARGET_WEB_PORT}
NUVI_SVN_PORT=${TARGET_SVN_PORT}
NUVI_SERVER_HOST=${TARGET_HOST}
NUVI_SVN_URL_PREFIX="/svn"
NUVI_API_URL_PREFIX="/api/v1"

# 3. Dedicated Service User & Group
NUVI_USER=subversion
NUVI_GROUP=subversion

# 4. Storage & Repository Paths
NUVI_DATA_DIR=${TARGET_DATA_DIR}
NUVI_REPOSITORIES_ROOT=${TARGET_REPOS_DIR}
NUVI_DB_PATH=${TARGET_DATA_DIR}/db/nuvi_metadata.sqlite3
NUVI_AUTHZ_FILE=${TARGET_DATA_DIR}/authz
NUVI_HTPASSWD_FILE=${TARGET_DATA_DIR}/htpasswd
NUVI_BACKUP_DIR=${TARGET_DATA_DIR}/backups
NUVI_SEARCH_INDEX_DIR=${TARGET_DATA_DIR}/search_index
NUVI_CERTS_DIR=${TARGET_DATA_DIR}/certs

# 5. Service Logs
NUVI_LOGS_DIR=${TARGET_DATA_DIR}/logs
NUVI_API_LOG=${TARGET_DATA_DIR}/logs/api.log
NUVI_WORKER_LOG=${TARGET_DATA_DIR}/logs/worker.log
NUVI_SVN_ACCESS_LOG=${TARGET_DATA_DIR}/logs/svn_access.log
NUVI_SVN_ERROR_LOG=${TARGET_DATA_DIR}/logs/svn_error.log

# 6. Security Shield & Rate Limiting
NUVI_BAN_THRESHOLD=5
NUVI_BAN_RESET_SECONDS=600
NUVI_BAN_DURATION_SECONDS=900
NUVI_TRUSTED_SUBNETS="127.0.0.1/32,::1/128"
EOF

chown root:subversion /etc/nuvi/nuvi.env
chmod 640 /etc/nuvi/nuvi.env
echo -e "${GREEN}[SUCCESS] /etc/nuvi/nuvi.env written and secured (0640 root:subversion).${NC}"

# ------------------------------------------------------------------------------
# STEP 6: Create Folder Structure and Set Correct Roles & Permissions
# ------------------------------------------------------------------------------
echo -e "${CYAN}${BOLD}[STEP 6/8] Creating directory hierarchy and assigning roles/permissions...${NC}"

# Critical traversal check: If inside /home/nuvi-svn, ensure parent is executable by group
PARENT_DIR="$(dirname "$TARGET_DATA_DIR")"
if [[ "$PARENT_DIR" != "/" && "$PARENT_DIR" != "/home" && "$PARENT_DIR" != "/opt" && "$PARENT_DIR" != "/var" ]]; then
    mkdir -p "$PARENT_DIR"
    chown subversion:subversion "$PARENT_DIR" 2>/dev/null || true
    chmod 755 "$PARENT_DIR" 2>/dev/null || true
fi

# Create target data directories
mkdir -p "$TARGET_DATA_DIR/repositories" \
         "$TARGET_DATA_DIR/db" \
         "$TARGET_DATA_DIR/backups" \
         "$TARGET_DATA_DIR/certs" \
         "$TARGET_DATA_DIR/search_index" \
         "$TARGET_DATA_DIR/logs" \
         /var/log/nuvi

# Deploy application code to /opt/nuvi if not already present
DEB_PACKAGE="$(find "$WORKSPACE_ROOT/dist" -name "subversion-nuvi_*.deb" 2>/dev/null | sort -V | tail -n 1 || true)"
if [[ -z "$DEB_PACKAGE" ]]; then
    DEB_PACKAGE="$(find /media/uv/winData/proTEmp/subversion_nuvi/dist -name "subversion-nuvi_*.deb" 2>/dev/null | sort -V | tail -n 1 || true)"
fi

if [[ -n "$DEB_PACKAGE" && -f "$DEB_PACKAGE" ]]; then
    echo -e "  Installing prebuilt package: ${DEB_PACKAGE}..."
    dpkg -i "$DEB_PACKAGE" 2>/dev/null || apt-get install -f -y
else
    echo -e "  Deploying application from source workspace: ${WORKSPACE_ROOT}..."
    mkdir -p /opt/nuvi
    cp -r "$WORKSPACE_ROOT/backend" /opt/nuvi/
    cp -r "$WORKSPACE_ROOT/bin" /opt/nuvi/ 2>/dev/null || true
    if [ -d "$WORKSPACE_ROOT/frontend/dist" ]; then
        mkdir -p /opt/nuvi/frontend
        cp -r "$WORKSPACE_ROOT/frontend/dist" /opt/nuvi/frontend/
    fi
    cp -r "$WORKSPACE_ROOT/packaging" /opt/nuvi/ 2>/dev/null || true
    cp "$WORKSPACE_ROOT/requirements.txt" /opt/nuvi/ 2>/dev/null || true
    chmod +x /opt/nuvi/bin/nuvictl 2>/dev/null || true
    ln -sf /opt/nuvi/bin/nuvictl /usr/local/bin/nuvictl
    ln -sf /opt/nuvi/bin/nuvictl /usr/bin/nuvictl 2>/dev/null || true
    
    # Python venv
    if [ ! -d /opt/nuvi/venv ]; then
        python3 -m venv --system-site-packages /opt/nuvi/venv
    fi
    /opt/nuvi/venv/bin/pip install -q fastapi uvicorn pydantic sqlalchemy argon2-cffi psutil python-multipart cryptography python-dotenv
fi

# Ensure /opt/nuvi/data links to TARGET_DATA_DIR if different
if [[ "$TARGET_DATA_DIR" != "/opt/nuvi/data" ]]; then
    ln -sfn "$TARGET_DATA_DIR" /opt/nuvi/data
fi
cp /etc/nuvi/nuvi.env /opt/nuvi/.env 2>/dev/null || true

# Initialize database schema and default admin user using python
echo -e "  Initializing database schema and default admin/admin credentials..."
su -s /bin/sh subversion -c "PYTHONPATH=/opt/nuvi NUVI_ENV_FILE=/etc/nuvi/nuvi.env /opt/nuvi/venv/bin/python3 -c 'from backend.api.db import init_db; init_db()'"

# If customized password was provided, update it in SQLite and htpasswd
if [[ "$TARGET_ADMIN_PASS" != "admin" ]]; then
    echo -e "  Updating administrator password to custom selection..."
    su -s /bin/sh subversion -c "PYTHONPATH=/opt/nuvi NUVI_ENV_FILE=/etc/nuvi/nuvi.env /opt/nuvi/venv/bin/python3 -c 'from backend.api.db import SessionLocal; from backend.api.models.schema import User; from backend.api.services.security_service import SecurityService; db=SessionLocal(); u=db.query(User).filter(User.username==\"admin\").first(); u.password_hash=SecurityService.hash_password(\"${TARGET_ADMIN_PASS}\"); SecurityService.update_apache_htpasswd(\"admin\", \"${TARGET_ADMIN_PASS}\"); db.commit(); db.close()'"
fi

# Assign rigorous permissions
echo -e "  Applying permissions across data directories..."
chown -R subversion:subversion "$TARGET_DATA_DIR" /var/log/nuvi
find "$TARGET_DATA_DIR" /var/log/nuvi -type d -exec chmod 2775 {} +
find "$TARGET_DATA_DIR" -type f -exec chmod 664 {} + 2>/dev/null || true
chmod 2770 "$TARGET_DATA_DIR/db" "$TARGET_DATA_DIR/backups" "$TARGET_DATA_DIR/certs" 2>/dev/null || true
if [[ -f "$TARGET_DATA_DIR/db/nuvi_metadata.sqlite3" ]]; then
    chmod 660 "$TARGET_DATA_DIR/db/nuvi_metadata.sqlite3"
fi

# ------------------------------------------------------------------------------
# STEP 7: Apache mod_dav_svn HTTP Server Configuration
# ------------------------------------------------------------------------------
echo -e "${CYAN}${BOLD}[STEP 7/8] Configuring and reinitializing Apache mod_dav_svn (nuvi-svn.conf)...${NC}"

# Ensure apache2 and mod_dav_svn are present
apt-get install -y -qq apache2 libapache2-mod-svn subversion

# Enable necessary Apache modules
a2enmod dav dav_svn authz_svn headers 2>/dev/null || true

# Ensure Apache's ports.conf handles the custom port if needed
if ! grep -q "Listen ${TARGET_SVN_PORT}" /etc/apache2/ports.conf 2>/dev/null; then
    echo "# Subversion Nuvi WebDAV Port" >> /etc/apache2/ports.conf
    echo "Listen ${TARGET_SVN_PORT}" >> /etc/apache2/ports.conf
fi

# Generate /etc/apache2/sites-available/nuvi-svn.conf
cat <<EOF > /etc/apache2/sites-available/nuvi-svn.conf
# ==============================================================================
# Subversion Nuvi - Apache mod_dav_svn Virtual Host Configuration
# Generated by clean_slate_reinstall.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ==============================================================================

<VirtualHost *:${TARGET_SVN_PORT}>
    ServerName ${TARGET_HOST}

    <Location /svn>
        DAV svn

        # Points to user-specified Subversion repositories directory
        SVNParentPath ${TARGET_REPOS_DIR}
        SVNListParentPath On

        # Transactional Authz Path Access Matrix compiled by Nuvi
        AuthzSVNAccessFile ${TARGET_DATA_DIR}/authz

        # Basic Authentication linked to Nuvi credentials
        AuthType Basic
        AuthName "Subversion Nuvi Enterprise Repository"
        AuthUserFile ${TARGET_DATA_DIR}/htpasswd

        Require valid-user

        SVNAutoversioning Off
        SVNPathAuthz short_circuit
    </Location>

    # Dedicated operational access and error logs
    CustomLog ${TARGET_DATA_DIR}/logs/svn_access.log "%h %l %u %t \"%r\" %>s %b \"%{SVN-ACTION}e\""
    ErrorLog ${TARGET_DATA_DIR}/logs/svn_error.log
</VirtualHost>
EOF

# Enable site and reload Apache
a2ensite nuvi-svn.conf
apache2ctl configtest
systemctl restart apache2
echo -e "${GREEN}[SUCCESS] Apache mod_dav_svn configured and restarted on port ${TARGET_SVN_PORT}.${NC}"

# ------------------------------------------------------------------------------
# STEP 8: Systemd Services Activation & Verification
# ------------------------------------------------------------------------------
echo -e "${CYAN}${BOLD}[STEP 8/8] Configuring and launching Nuvi systemd services...${NC}"

# Copy or generate service files
cp /opt/nuvi/packaging/systemd/nuvi-api.service /etc/systemd/system/
cp /opt/nuvi/packaging/systemd/nuvi-worker.service /etc/systemd/system/
chmod 644 /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service

# Inject custom port and whitelist path permissions into service units
sed -i "s|--port [0-9]*|--port ${TARGET_WEB_PORT}|g" /etc/systemd/system/nuvi-api.service
sed -i "s|^ReadWritePaths=.*|ReadWritePaths=-/opt/nuvi -/var/nuvi -${TARGET_DATA_DIR} -${TARGET_REPOS_DIR} -/home|" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service

systemctl daemon-reload
systemctl enable --now nuvi-api.service nuvi-worker.service
systemctl restart nuvi-api.service nuvi-worker.service

# Wait a moment for API startup
sleep 2

echo ""
echo -e "${BLUE}========================================================================${NC}"
echo -e "${GREEN}${BOLD}       Subversion Nuvi Clean Reinstallation Completed Successfully!     ${NC}"
echo -e "${BLUE}========================================================================${NC}"
echo -e "  ${BOLD}Web Admin Console:${NC}     http://${TARGET_HOST}:${TARGET_WEB_PORT}"
echo -e "  ${BOLD}Subversion WebDAV:${NC}     http://${TARGET_HOST}:${TARGET_SVN_PORT}/svn"
echo -e "  ${BOLD}Admin Username:${NC}        admin"
echo -e "  ${BOLD}Admin Password:${NC}        ${TARGET_ADMIN_PASS}"
echo -e "  ${BOLD}Repositories Path:${NC}     ${TARGET_REPOS_DIR}"
echo -e "  ${BOLD}Data Root:${NC}             ${TARGET_DATA_DIR}"
echo -e "  ${BOLD}Config File:${NC}           /etc/nuvi/nuvi.env"
echo -e "  ${BOLD}Apache Site:${NC}           /etc/apache2/sites-available/nuvi-svn.conf"
echo -e "${BLUE}========================================================================${NC}"
echo -e "To verify services:  ${CYAN}sudo systemctl status nuvi-api nuvi-worker apache2${NC}"
echo -e "To browse repositories: ${CYAN}http://${TARGET_HOST}:${TARGET_SVN_PORT}/svn/${NC} (in web browser)"
echo -e "To test with SVN client: Create a repository in the Web Console first, then run:"
echo -e "                         ${CYAN}svn list http://${TARGET_HOST}:${TARGET_SVN_PORT}/svn/<repo-name> --username admin${NC}"
echo ""
