#!/usr/bin/env bash
# ==============================================================================
# Subversion Nuvi - Host Installation & Deployment Script
# Supports: Ubuntu 22.04/24.04, Debian 11/12
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}       Subversion Nuvi - Host Installation Wizard     ${NC}"
echo -e "${BLUE}======================================================${NC}"

# ------------------------------------------------------------------------------
# 0. Parse CLI Arguments
# ------------------------------------------------------------------------------
CLI_USER=""
CLI_ENV_FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --user=*)
            CLI_USER="${1#*=}"
            shift
            ;;
        --user)
            CLI_USER="$2"
            shift 2
            ;;
        --env=*|--env-file=*)
            CLI_ENV_FILE="${1#*=}"
            shift
            ;;
        --env|--env-file)
            CLI_ENV_FILE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: sudo ./install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --user=<username>     Run services as specified user (default: NUVI_USER in .env or 'subversion')"
            echo "  --env-file=<path>     Path to custom .env configuration file (default: auto-discovered)"
            echo "  -h, --help            Show this help message"
            exit 0
            ;;
        *)
            echo -e "${YELLOW}[WARNING] Unknown argument: $1 (ignoring)${NC}"
            shift
            ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}[ERROR] This installer must be run as root (sudo ./install.sh)${NC}" 
   exit 1
fi

# ------------------------------------------------------------------------------
# 1. Discover and Load .env Configuration
# ------------------------------------------------------------------------------
# Configuration discovery hierarchy:
# 1. CLI flag: --env-file=<path>
# 2. Environment variable: $NUVI_ENV_FILE
# 3. Local working directory: ./.env
# 4. System configuration: /etc/nuvi/nuvi.env
# 5. Application root: /opt/nuvi/.env
ACTIVE_ENV_FILE=""
if [[ -n "$CLI_ENV_FILE" && -f "$CLI_ENV_FILE" ]]; then
    ACTIVE_ENV_FILE="$CLI_ENV_FILE"
elif [[ -n "${NUVI_ENV_FILE:-}" && -f "$NUVI_ENV_FILE" ]]; then
    ACTIVE_ENV_FILE="$NUVI_ENV_FILE"
elif [[ -f "./.env" ]]; then
    ACTIVE_ENV_FILE="./.env"
elif [[ -f "/etc/nuvi/nuvi.env" ]]; then
    ACTIVE_ENV_FILE="/etc/nuvi/nuvi.env"
elif [[ -f "/opt/nuvi/.env" ]]; then
    ACTIVE_ENV_FILE="/opt/nuvi/.env"
fi

if [[ -n "$ACTIVE_ENV_FILE" ]]; then
    echo -e "${BLUE}[INFO] Active configuration found: ${ACTIVE_ENV_FILE}${NC}"
    while IFS= read -r line || [[ -n "$line" ]]; do
        trimmed="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        [[ -z "$trimmed" || "$trimmed" =~ ^# ]] && continue
        if [[ "$trimmed" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            val="${BASH_REMATCH[2]}"
            # Strip trailing comments and quotes
            if [[ "$val" =~ ^\"(.*)\"([[:space:]]*#.*)?$ ]]; then
                val="${BASH_REMATCH[1]}"
            elif [[ "$val" =~ ^\'(.*)\'([[:space:]]*#.*)?$ ]]; then
                val="${BASH_REMATCH[1]}"
            else
                val="${val%%#*}"
                val="$(echo "$val" | sed -e 's/[[:space:]]*$//')"
            fi
            # Set variable if not overridden by CLI argument
            if [[ "$key" == "NUVI_USER" && -n "$CLI_USER" ]]; then
                continue
            fi
            export "$key=$val"
        fi
    done < "$ACTIVE_ENV_FILE"
else
    echo -e "${YELLOW}[INFO] No existing .env file found. Using default environment configuration.${NC}"
fi

# Determine effective parameters from .env with fallback defaults
INSTALL_DIR="${NUVI_INSTALL_DIR:-/opt/nuvi}"
DATA_DIR="${NUVI_DATA_DIR:-/var/nuvi}"
REPOS_DIR="${NUVI_REPOSITORIES_ROOT:-${NUVI_REPOSITORIES_PATH:-$DATA_DIR/repositories}}"
DB_DIR="$(dirname "${NUVI_DB_PATH:-$DATA_DIR/db/nuvi_metadata.sqlite3}")"
BACKUP_DIR="${NUVI_BACKUP_DIR:-$DATA_DIR/backups}"
SEARCH_INDEX_DIR="${NUVI_SEARCH_INDEX_DIR:-$DATA_DIR/search_index}"
CERTS_DIR="${NUVI_CERTS_DIR:-$DATA_DIR/certs}"
LOG_DIR="${NUVI_LOGS_DIR:-/var/log/nuvi}"
SERVICE_USER="${CLI_USER:-${NUVI_USER:-subversion}}"
PORT="${NUVI_PORT:-8000}"
SVN_PORT="${NUVI_SVN_PORT:-8081}"

echo -e "${BLUE}[INFO] Effective Service User:       ${SERVICE_USER}${NC}"
echo -e "${BLUE}[INFO] Repository Storage Path:      ${REPOS_DIR}${NC}"
echo -e "${BLUE}[INFO] Metadata Database Directory:  ${DB_DIR}${NC}"
echo -e "${BLUE}[INFO] Service Logs Directory:       ${LOG_DIR}${NC}"
echo -e "${BLUE}[INFO] Web Console Port:             ${PORT}${NC}"
echo -e "${BLUE}[INFO] Subversion WebDAV Port:       ${SVN_PORT}${NC}"

echo -e "${GREEN}[1/6] Installing system dependencies and Subversion development libraries...${NC}"
apt-get update -qq
apt-get install -y -qq \
    build-essential \
    cmake \
    subversion \
    libsvn-dev \
    libapr1-dev \
    libaprutil1-dev \
    apache2 \
    libapache2-mod-svn \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    git

echo -e "${GREEN}[2/6] Configuring service user '${SERVICE_USER}' and directories...${NC}"
if ! id -u "$SERVICE_USER" &>/dev/null; then
    echo "Creating dedicated system user '${SERVICE_USER}'..."
    useradd -r -s /usr/sbin/nologin -d "$INSTALL_DIR" "$SERVICE_USER"
else
    echo "Using existing user '${SERVICE_USER}' for Subversion service rights."
fi

SERVICE_GROUP="$(id -gn "$SERVICE_USER" 2>/dev/null || echo "$SERVICE_USER")"

# Grant mutual group access with www-data for Apache mod_dav_svn
if id -u www-data &>/dev/null; then
    usermod -aG "$SERVICE_GROUP" www-data 2>/dev/null || true
    usermod -aG www-data "$SERVICE_USER" 2>/dev/null || true
fi

# Create configured storage and log directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$REPOS_DIR"
mkdir -p "$DB_DIR"
mkdir -p "$BACKUP_DIR"
mkdir -p "$SEARCH_INDEX_DIR"
mkdir -p "$CERTS_DIR"
mkdir -p "$LOG_DIR"

echo -e "${GREEN}[3/6] Deploying Subversion Nuvi application code and configuration...${NC}"
cp -r backend "$INSTALL_DIR/"
cp -r frontend "$INSTALL_DIR/" 2>/dev/null || true
cp -r bin "$INSTALL_DIR/" 2>/dev/null || true
cp requirements.txt "$INSTALL_DIR/" 2>/dev/null || true
chmod +x "$INSTALL_DIR/bin/nuvictl" 2>/dev/null || true
ln -sf "$INSTALL_DIR/bin/nuvictl" /usr/local/bin/nuvictl

# Deploy environment configuration
mkdir -p /etc/nuvi
chown "root:$SERVICE_GROUP" /etc/nuvi 2>/dev/null || true
chmod 755 /etc/nuvi
cp .env.example "$INSTALL_DIR/.env.example" 2>/dev/null || true
cp .env.example /etc/nuvi/nuvi.env.example 2>/dev/null || true
chmod 644 /etc/nuvi/nuvi.env.example 2>/dev/null || true

if [[ -n "$ACTIVE_ENV_FILE" && -f "$ACTIVE_ENV_FILE" && "$ACTIVE_ENV_FILE" != "/etc/nuvi/nuvi.env" ]]; then
    echo "Installing custom configuration from $ACTIVE_ENV_FILE to /etc/nuvi/nuvi.env and $INSTALL_DIR/.env..."
    cp "$ACTIVE_ENV_FILE" /etc/nuvi/nuvi.env
    cp "$ACTIVE_ENV_FILE" "$INSTALL_DIR/.env"
    chmod 640 /etc/nuvi/nuvi.env "$INSTALL_DIR/.env"
    chown "root:$SERVICE_GROUP" /etc/nuvi/nuvi.env "$INSTALL_DIR/.env" 2>/dev/null || true
elif [[ ! -f /etc/nuvi/nuvi.env ]]; then
    echo "Initializing /etc/nuvi/nuvi.env from .env.example template..."
    cp .env.example /etc/nuvi/nuvi.env
    chmod 640 /etc/nuvi/nuvi.env
    chown "root:$SERVICE_GROUP" /etc/nuvi/nuvi.env 2>/dev/null || true
fi

echo -e "${GREEN}[4/6] Building native C++ Subversion binding (libnuvi_svn_core.so)...${NC}"
cmake -B "$INSTALL_DIR/backend/core/build" -S "$INSTALL_DIR/backend/core"
cmake --build "$INSTALL_DIR/backend/core/build"

echo -e "${GREEN}[5/6] Setting up Python virtual environment...${NC}"
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip
if [ -f "$INSTALL_DIR/requirements.txt" ]; then
    "$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/requirements.txt"
else
    "$INSTALL_DIR/venv/bin/pip" install -q \
        fastapi \
        uvicorn \
        pydantic \
        sqlalchemy \
        argon2-cffi \
        cryptography \
        python-multipart \
        psutil \
        python-dotenv
fi

# Ensure uvicorn launcher wrapper is properly configured
if [ ! -x "$INSTALL_DIR/venv/bin/uvicorn" ] || grep -q 'uvicorn ""' "$INSTALL_DIR/venv/bin/uvicorn" 2>/dev/null; then
    cat <<'UEOF' > "$INSTALL_DIR/venv/bin/uvicorn"
#!/bin/sh
exec "$INSTALL_DIR/venv/bin/python3" -m uvicorn "$@"
UEOF
    chmod 755 "$INSTALL_DIR/venv/bin/uvicorn"
fi

# Fix permissions across all configured directories
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR" 2>/dev/null || true
find "$DATA_DIR" "$LOG_DIR" -type d -exec chmod 2775 {} + 2>/dev/null || true
find "$DATA_DIR" -type f -exec chmod 664 {} + 2>/dev/null || true
chmod 2770 "$DB_DIR" "$BACKUP_DIR" "$CERTS_DIR" 2>/dev/null || true
chmod 755 "$INSTALL_DIR/bin/nuvictl" 2>/dev/null || true
if [ -f "$INSTALL_DIR/backend/core/build/libnuvi_svn_core.so" ]; then
    chmod 755 "$INSTALL_DIR/backend/core/build/libnuvi_svn_core.so" 2>/dev/null || true
fi

echo -e "${GREEN}[6/6] Installing systemd unit files for user '${SERVICE_USER}'...${NC}"
cp packaging/systemd/nuvi-api.service /etc/systemd/system/
cp packaging/systemd/nuvi-worker.service /etc/systemd/system/
chmod 644 /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service

# Configure systemd units with the selected service user and group
sed -i "s/^User=.*/User=$SERVICE_USER/" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service
sed -i "s/^Group=.*/Group=$SERVICE_GROUP/" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service

if [[ "$INSTALL_DIR" != "/opt/nuvi" ]]; then
    sed -i "s|/opt/nuvi|$INSTALL_DIR|g" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service
fi

# Ensure systemd sandbox allows write access to all configured directories
RW_PATHS="$INSTALL_DIR $DATA_DIR $REPOS_DIR"
RW_PATHS="$(echo "$RW_PATHS" | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
RW_FORMATTED=""
for p in $RW_PATHS; do
    RW_FORMATTED="${RW_FORMATTED} -${p}"
done
RW_FORMATTED="$(echo "$RW_FORMATTED" | sed 's/^[[:space:]]*//')"
sed -i "s|^ReadWritePaths=.*|ReadWritePaths=$RW_FORMATTED|" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service

systemctl daemon-reload
systemctl enable nuvi-api nuvi-worker
systemctl restart nuvi-api nuvi-worker

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN} Subversion Nuvi installed successfully!              ${NC}"
echo -e "   Web Admin Console: http://localhost:${PORT}        ${NC}"
echo -e "   API Documentation: http://localhost:${PORT}/api/v1/docs${NC}"
echo -e "   Subversion WebDAV: http://localhost:${SVN_PORT}/svn${NC}"
echo -e "   Storage Directory: ${REPOS_DIR}                    ${NC}"
if [[ -n "$ACTIVE_ENV_FILE" ]]; then
echo -e "   Config Applied:    ${ACTIVE_ENV_FILE} -> /etc/nuvi/nuvi.env${NC}"
else
echo -e "   Config Applied:    /etc/nuvi/nuvi.env (default template)${NC}"
fi
echo -e "   Service User:      ${SERVICE_USER}:${SERVICE_GROUP}${NC}"
echo -e "${BLUE}======================================================${NC}"
