#!/usr/bin/env bash
set -e

# Subversion Nuvi - Automated Distribution Packaging Script
# Generates .deb (Debian/Ubuntu) and standalone .tar.gz distribution archives.

VERSION="1.16.3"
PACKAGE_NAME="subversion-nuvi"
ARCH="amd64"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/backend" ]; then
    WORKSPACE_ROOT="$SCRIPT_DIR"
else
    WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
DIST_DIR="$WORKSPACE_ROOT/dist"
STAGING_DIR="/tmp/nuvi_package_staging_$$"
trap "rm -rf '$STAGING_DIR'" EXIT

echo "=========================================================="
echo " Subversion Nuvi - Building Distribution Packages v$VERSION"
echo "=========================================================="

mkdir -p "$DIST_DIR"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# 1. Compile C++ Core if needed
echo "[1/6] Verifying Native C++ Engine..."
if [ ! -f "$WORKSPACE_ROOT/backend/core/build/libnuvi_svn_core.so" ]; then
    echo "Compiling libnuvi_svn_core.so..."
    mkdir -p "$WORKSPACE_ROOT/backend/core/build"
    (cd "$WORKSPACE_ROOT/backend/core/build" && cmake .. && make -j$(nproc))
fi

# 2. Verify Frontend Assets
echo "[2/6] Verifying Web Console production build..."
if [ ! -f "$WORKSPACE_ROOT/frontend/dist/index.html" ]; then
    echo "Building frontend..."
    (cd "$WORKSPACE_ROOT/frontend" && npm run build)
fi

# 3. Assemble Directory Layout
echo "[3/6] Assembling package tree..."
OPT_DIR="$STAGING_DIR/opt/nuvi"
BIN_DIR="$STAGING_DIR/usr/bin"
LOCAL_BIN_DIR="$STAGING_DIR/usr/local/bin"
SYSTEMD_DIR="$STAGING_DIR/etc/systemd/system"
LOG_DIR="$STAGING_DIR/var/log/nuvi"
ETC_DIR="$STAGING_DIR/etc/nuvi"

mkdir -p "$OPT_DIR" "$BIN_DIR" "$LOCAL_BIN_DIR" "$SYSTEMD_DIR" "$LOG_DIR" "$ETC_DIR"
mkdir -p "$OPT_DIR/data/repositories" "$OPT_DIR/data/logs" "$OPT_DIR/data/backups" "$OPT_DIR/data/db" "$OPT_DIR/data/search_index" "$OPT_DIR/data/certs"

# Pre-create virtual environment structure in package layout
mkdir -p "$OPT_DIR/venv/bin"
cat <<EOF > "$OPT_DIR/venv/pyvenv.cfg"
home = /usr/bin
include-system-site-packages = true
version = 3
EOF
ln -sf /usr/bin/python3 "$OPT_DIR/venv/bin/python3"
ln -sf python3 "$OPT_DIR/venv/bin/python"
cat <<'UEOF' > "$OPT_DIR/venv/bin/uvicorn"
#!/bin/sh
exec /opt/nuvi/venv/bin/python3 -m uvicorn "$@"
UEOF
chmod 755 "$OPT_DIR/venv/bin/uvicorn"

# Copy backend
cp -r "$WORKSPACE_ROOT/backend" "$OPT_DIR/"

# Clean any build cruft, compiler probes, and stale python bytecodes
find "$OPT_DIR/backend" -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
find "$OPT_DIR/backend" -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete 2>/dev/null || true
if [ -d "$OPT_DIR/backend/core/build" ]; then
    find "$OPT_DIR/backend/core/build" -mindepth 1 ! -name "libnuvi_svn_core.so" -delete 2>/dev/null || true
fi

# Copy frontend dist
mkdir -p "$OPT_DIR/frontend"
cp -r "$WORKSPACE_ROOT/frontend/dist" "$OPT_DIR/frontend/"

# Copy packaging utilities
cp -r "$WORKSPACE_ROOT/packaging" "$OPT_DIR/"

# Copy bin
cp -r "$WORKSPACE_ROOT/bin" "$OPT_DIR/"

# Install symlinks for nuvictl (/usr/bin for Debian standard, /usr/local/bin for compatibility)
ln -sf /opt/nuvi/bin/nuvictl "$BIN_DIR/nuvictl"
ln -sf /opt/nuvi/bin/nuvictl "$LOCAL_BIN_DIR/nuvictl"

# Install systemd unit files
cp "$WORKSPACE_ROOT/packaging/systemd/nuvi-api.service" "$SYSTEMD_DIR/"
cp "$WORKSPACE_ROOT/packaging/systemd/nuvi-worker.service" "$SYSTEMD_DIR/"

# Copy requirements.txt
if [ -f "$WORKSPACE_ROOT/requirements.txt" ]; then
    cp "$WORKSPACE_ROOT/requirements.txt" "$OPT_DIR/requirements.txt"
fi

# Install default .env templates
cp "$WORKSPACE_ROOT/.env.example" "$ETC_DIR/nuvi.env.example"
cp "$WORKSPACE_ROOT/.env.example" "$OPT_DIR/.env.example"

# 4. Generate Debian Control Files
echo "[4/6] Generating Debian package metadata..."
DEBIAN_DIR="$STAGING_DIR/DEBIAN"
mkdir -p "$DEBIAN_DIR"

cat <<EOF > "$DEBIAN_DIR/control"
Package: $PACKAGE_NAME
Version: $VERSION
Section: devel
Priority: optional
Architecture: $ARCH
Maintainer: Subversion Nuvi Team <support@nuvi.dev>
Depends: python3 (>= 3.10), python3-venv, python3-pip, subversion (>= 1.14), libapr1, libaprutil1
Recommends: python3-multipart, python3-cryptography
Description: Enterprise Subversion Server & Administration Platform
 Subversion Nuvi delivers full VisualSVN Server Enterprise feature parity
 for Apache Subversion on Linux, including visual path ACLs, Argon2id,
 brute-force shield, web repository client, FTS5 search, hot backups,
 pre-packaged hooks, and VDFS multi-site replication.
EOF

cat <<EOF > "$DEBIAN_DIR/postinst"
#!/bin/sh
set -e

# 1. Create subversion system user and group if not existing
if ! getent group subversion >/dev/null; then
    groupadd --system subversion
fi
if ! getent passwd subversion >/dev/null; then
    useradd --system --gid subversion --home-dir /opt/nuvi --no-create-home --shell /usr/sbin/nologin subversion
fi

# 2. Also ensure alias group/user nuvi exists and is linked
if ! getent group nuvi >/dev/null; then
    groupadd --system nuvi
fi
if ! getent passwd nuvi >/dev/null; then
    useradd --system --gid nuvi --home-dir /opt/nuvi --no-create-home --shell /usr/sbin/nologin nuvi
fi
usermod -aG nuvi subversion 2>/dev/null || true

# 3. Apache (www-data) mutual group collaboration
if getent group www-data >/dev/null; then
    usermod -aG www-data subversion 2>/dev/null || true
    usermod -aG subversion www-data 2>/dev/null || true
fi

# 4. Code & Application Root (/opt/nuvi) - owned by root:root, read/execute for subversion
chown -R root:root /opt/nuvi
find /opt/nuvi -type d -exec chmod 755 {} +
find /opt/nuvi -type f -exec chmod 644 {} +
chmod 755 /opt/nuvi/bin/nuvictl 2>/dev/null || true
if [ -f /opt/nuvi/backend/core/build/libnuvi_svn_core.so ]; then
    chmod 755 /opt/nuvi/backend/core/build/libnuvi_svn_core.so
fi

# 5. Runtime Data & Storage Directories (/opt/nuvi/data, custom data dir, and /var/log/nuvi)
CUSTOM_DATA_DIR=""
if [ -f /etc/nuvi/nuvi.env ]; then
    CUSTOM_DATA_DIR="\$(grep -E '^NUVI_DATA_DIR=' /etc/nuvi/nuvi.env 2>/dev/null | head -n 1 | cut -d'=' -f2- | tr -d '\"'\' || true)"
fi
TARGET_DATA_DIRS="/opt/nuvi/data"
if [ -n "\$CUSTOM_DATA_DIR" ] && [ "\$CUSTOM_DATA_DIR" != "/opt/nuvi/data" ]; then
    TARGET_DATA_DIRS="/opt/nuvi/data \$CUSTOM_DATA_DIR"
    PARENT="\$(dirname "\$CUSTOM_DATA_DIR")"
    if [ "\$PARENT" != "/" ] && [ "\$PARENT" != "/home" ] && [ "\$PARENT" != "/opt" ]; then
        mkdir -p "\$PARENT"
        chown subversion:subversion "\$PARENT" 2>/dev/null || true
        chmod 755 "\$PARENT" 2>/dev/null || true
    fi
    ln -sfn "\$CUSTOM_DATA_DIR" /opt/nuvi/data
fi

for ddir in \$TARGET_DATA_DIRS; do
    mkdir -p /var/log/nuvi \
             "\$ddir/repositories" \
             "\$ddir/db" \
             "\$ddir/backups" \
             "\$ddir/search_index" \
             "\$ddir/certs" \
             "\$ddir/logs"

    chown -R subversion:subversion "\$ddir" /var/log/nuvi
    find "\$ddir" /var/log/nuvi -type d -exec chmod 2775 {} + 2>/dev/null || true
    find "\$ddir" -type f -exec chmod 664 {} + 2>/dev/null || true
    chmod 2770 "\$ddir/db" "\$ddir/backups" "\$ddir/certs" 2>/dev/null || true
    [ -f "\$ddir/db/nuvi_metadata.sqlite3" ] && chmod 660 "\$ddir/db/nuvi_metadata.sqlite3" 2>/dev/null || true
done

# 6. Python virtual environment setup (/opt/nuvi/venv)
if [ ! -x /opt/nuvi/venv/bin/python3 ]; then
    mkdir -p /opt/nuvi/venv/bin
    ln -sf "\$(command -v python3 || echo /usr/bin/python3)" /opt/nuvi/venv/bin/python3
    ln -sf python3 /opt/nuvi/venv/bin/python
    cat <<PEOF > /opt/nuvi/venv/pyvenv.cfg
home = /usr/bin
include-system-site-packages = true
version = 3
PEOF
fi

# Ensure /opt/nuvi/venv/bin/uvicorn launcher is properly created and functional
if [ ! -x /opt/nuvi/venv/bin/uvicorn ] || grep -q 'uvicorn ""' /opt/nuvi/venv/bin/uvicorn 2>/dev/null; then
    cat <<'UEOF' > /opt/nuvi/venv/bin/uvicorn
#!/bin/sh
exec /opt/nuvi/venv/bin/python3 -m uvicorn "\$@"
UEOF
    chmod 755 /opt/nuvi/venv/bin/uvicorn
fi

# Provision full virtual environment with pip if available
if command -v python3 >/dev/null 2>&1; then
    if [ ! -d /opt/nuvi/venv/lib ]; then
        python3 -m venv --system-site-packages /opt/nuvi/venv 2>/dev/null || true
    fi
    echo "Configuring Subversion Nuvi Python dependencies..."
    if [ -x /opt/nuvi/venv/bin/pip ]; then
        if [ -f /opt/nuvi/requirements.txt ]; then
            /opt/nuvi/venv/bin/pip install -q -r /opt/nuvi/requirements.txt 2>/dev/null || true
        else
            /opt/nuvi/venv/bin/pip install -q fastapi uvicorn pydantic sqlalchemy argon2-cffi psutil python-multipart cryptography python-dotenv 2>/dev/null || true
        fi
    elif command -v pip3 >/dev/null 2>&1; then
        if [ -f /opt/nuvi/requirements.txt ]; then
            pip3 install -q -r /opt/nuvi/requirements.txt 2>/dev/null || true
        else
            pip3 install -q fastapi uvicorn pydantic sqlalchemy argon2-cffi psutil python-multipart cryptography python-dotenv 2>/dev/null || true
        fi
    fi
fi

# Ensure venv executables are 755
find /opt/nuvi/venv -type d -exec chmod 755 {} + 2>/dev/null || true
find /opt/nuvi/venv -type f -exec chmod 644 {} + 2>/dev/null || true
chmod -R 755 /opt/nuvi/venv/bin 2>/dev/null || true

# 7. Initialize /etc/nuvi and /etc/nuvi/nuvi.env (root:subversion 0755 / 0640)
mkdir -p /etc/nuvi
chown root:subversion /etc/nuvi 2>/dev/null || true
chmod 755 /etc/nuvi
if [ -f /etc/nuvi/nuvi.env.example ]; then
    chmod 644 /etc/nuvi/nuvi.env.example 2>/dev/null || true
fi
if [ ! -f /etc/nuvi/nuvi.env ] && [ -f /etc/nuvi/nuvi.env.example ]; then
    cp /etc/nuvi/nuvi.env.example /etc/nuvi/nuvi.env
fi
if [ -f /etc/nuvi/nuvi.env ]; then
    chown root:subversion /etc/nuvi/nuvi.env
    chmod 640 /etc/nuvi/nuvi.env
fi
if [ -f /opt/nuvi/.env ]; then
    chown root:subversion /opt/nuvi/.env 2>/dev/null || true
    chmod 640 /opt/nuvi/.env 2>/dev/null || true
fi

# 8. Initialize Database as subversion user (prevent root-owned WAL journal lockouts)
echo "Initializing Subversion Nuvi database schema..."
if id -u subversion >/dev/null 2>&1; then
    su -s /bin/sh subversion -c "PYTHONPATH=/opt/nuvi /opt/nuvi/venv/bin/python3 -c 'from backend.api.db import init_db; init_db()'" 2>/dev/null || true
else
    PYTHONPATH=/opt/nuvi /opt/nuvi/venv/bin/python3 -c "from backend.api.db import init_db; init_db()" 2>/dev/null || true
fi

# Ensure all data files, SQLite DB, authz, htpasswd, and logs are subversion:subversion 660/664
for ddir in \$TARGET_DATA_DIRS; do
    chown -R subversion:subversion "\$ddir" /var/log/nuvi 2>/dev/null || true
    find "\$ddir" /var/log/nuvi -type d -exec chmod 2775 {} + 2>/dev/null || true
    find "\$ddir" -type f -exec chmod 664 {} + 2>/dev/null || true
    chmod 2770 "\$ddir/db" "\$ddir/backups" "\$ddir/certs" 2>/dev/null || true
    find "\$ddir/db" -type f -exec chmod 660 {} + 2>/dev/null || true
done

# 9. If installed via sudo, add invoking user to subversion group for seamless administration
if [ -n "\${SUDO_USER:-}" ] && id -u "\$SUDO_USER" >/dev/null 2>&1; then
    usermod -aG subversion "\$SUDO_USER" 2>/dev/null || true
fi

if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload || true
fi
exit 0
EOF
chmod 755 "$DEBIAN_DIR/postinst"

cat <<EOF > "$DEBIAN_DIR/prerm"
#!/bin/sh
set -e
if command -v systemctl >/dev/null 2>&1; then
    systemctl stop nuvi-api.service nuvi-worker.service 2>/dev/null || true
    systemctl disable nuvi-api.service nuvi-worker.service 2>/dev/null || true
fi
exit 0
EOF
chmod 755 "$DEBIAN_DIR/prerm"

cat <<EOF > "$DEBIAN_DIR/postrm"
#!/bin/sh
set -e
if [ "\$1" = "purge" ]; then
    rm -rf /opt/nuvi
    rm -rf /var/log/nuvi
    rm -rf /etc/nuvi
    rm -rf /var/lib/nuvi
    rm -f /usr/bin/nuvictl /usr/local/bin/nuvictl
    rm -f /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service
fi
if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload || true
    systemctl reset-failed 2>/dev/null || true
fi
exit 0
EOF
chmod 755 "$DEBIAN_DIR/postrm"
chmod 644 "$DEBIAN_DIR/control"
chmod 755 "$DEBIAN_DIR"

# Explicitly sanitize staging permissions to eliminate host/NTFS 0777 leakage
echo "Sanitizing staging directory permissions (strict Debian policy)..."
find "$STAGING_DIR" -type d -exec chmod 755 {} +
find "$STAGING_DIR" -type f -exec chmod 644 {} +
chmod 755 "$OPT_DIR/bin/nuvictl" 2>/dev/null || true
chmod 755 "$OPT_DIR/venv/bin/uvicorn" 2>/dev/null || true
if [ -f "$OPT_DIR/backend/core/build/libnuvi_svn_core.so" ]; then
    chmod 755 "$OPT_DIR/backend/core/build/libnuvi_svn_core.so"
fi
chmod 644 "$SYSTEMD_DIR"/*.service 2>/dev/null || true
chmod 755 "$DEBIAN_DIR/postinst" "$DEBIAN_DIR/prerm" "$DEBIAN_DIR/postrm" 2>/dev/null || true
chmod 644 "$DEBIAN_DIR/control" 2>/dev/null || true

# 5. Build .deb Package
echo "[5/6] Building Debian package..."
DEB_FILE="$DIST_DIR/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$STAGING_DIR" "$DEB_FILE"
echo "  -> Created: $DEB_FILE"

# 6. Build Standalone .tar.gz Archive
echo "[6/6] Building Standalone tarball archive..."
TAR_FILE="$DIST_DIR/${PACKAGE_NAME}-${VERSION}-linux-x86_64.tar.gz"
(cd "$STAGING_DIR" && tar -czf "$TAR_FILE" opt etc usr)
echo "  -> Created: $TAR_FILE"

echo "=========================================================="
echo " Packaging completed successfully!"
ls -lh "$DIST_DIR"
echo "=========================================================="
