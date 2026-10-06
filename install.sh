#!/usr/bin/env bash
# ==============================================================================
# Subversion Nuvi - Host Installation & Deployment Script
# Supports: Ubuntu 22.04/24.04, Debian 11/12
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}       Subversion Nuvi - Host Installation Wizard     ${NC}"
echo -e "${BLUE}======================================================${NC}"

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}[ERROR] This installer must be run as root (sudo ./install.sh)${NC}" 
   exit 1
fi

INSTALL_DIR="/opt/nuvi"
DATA_DIR="/var/nuvi"
LOG_DIR="/var/log/nuvi"

# Configurable Service User: can be a dedicated system user ('subversion'/'nuvi')
# or an existing login user (e.g., $USER).
SERVICE_USER="${NUVI_USER:-subversion}"
for arg in "$@"; do
    case $arg in
        --user=*)
            SERVICE_USER="${arg#*=}"
            ;;
    esac
done
if [[ "${1:-}" == "--user" && -n "${2:-}" ]]; then
    SERVICE_USER="$2"
fi

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

mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR/repositories" "$DATA_DIR/db" "$DATA_DIR/backups"
mkdir -p "$LOG_DIR"

echo -e "${GREEN}[3/6] Deploying Subversion Nuvi application code...${NC}"
cp -r backend "$INSTALL_DIR/"
cp -r frontend "$INSTALL_DIR/" 2>/dev/null || true
cp -r bin "$INSTALL_DIR/" 2>/dev/null || true
cp .env.example "$INSTALL_DIR/.env.example" 2>/dev/null || true
mkdir -p /etc/nuvi
cp .env.example /etc/nuvi/nuvi.env.example 2>/dev/null || true
if [ ! -f /etc/nuvi/nuvi.env ]; then
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
"$INSTALL_DIR/venv/bin/pip" install -q \
    fastapi \
    uvicorn \
    pydantic \
    sqlalchemy \
    argon2-cffi \
    psutil

# Fix permissions
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
chmod -R 775 "$DATA_DIR/repositories"

echo -e "${GREEN}[6/6] Installing systemd unit files for user '${SERVICE_USER}'...${NC}"
cp packaging/systemd/nuvi-api.service /etc/systemd/system/
cp packaging/systemd/nuvi-worker.service /etc/systemd/system/

# Configure systemd units with the selected service user and group
sed -i "s/^User=.*/User=$SERVICE_USER/" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service
sed -i "s/^Group=.*/Group=$SERVICE_GROUP/" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service

systemctl daemon-reload
systemctl enable nuvi-api nuvi-worker
systemctl restart nuvi-api nuvi-worker

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN} Subversion Nuvi installed successfully!              ${NC}"
echo -e "   Web Admin Console: http://localhost:8000           ${NC}"
echo -e "   API Documentation: http://localhost:8000/api/v1/docs${NC}"
echo -e "   Storage Directory: ${DATA_DIR}/repositories        ${NC}"
echo -e "${BLUE}======================================================${NC}"
