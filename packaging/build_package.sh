#!/usr/bin/env bash
set -e

# Subversion Nuvi - Automated Distribution Packaging Script
# Generates .deb (Debian/Ubuntu) and standalone .tar.gz distribution archives.

VERSION="1.16.1"
PACKAGE_NAME="subversion-nuvi"
ARCH="amd64"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
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
BIN_DIR="$STAGING_DIR/usr/local/bin"
SYSTEMD_DIR="$STAGING_DIR/etc/systemd/system"

mkdir -p "$OPT_DIR" "$BIN_DIR" "$SYSTEMD_DIR"
mkdir -p "$OPT_DIR/data/repositories" "$OPT_DIR/data/logs" "$OPT_DIR/data/backups" "$OPT_DIR/data/db"

# Copy backend
cp -r "$WORKSPACE_ROOT/backend" "$OPT_DIR/"
# Copy frontend dist
mkdir -p "$OPT_DIR/frontend"
cp -r "$WORKSPACE_ROOT/frontend/dist" "$OPT_DIR/frontend/"
# Copy packaging utilities
cp -r "$WORKSPACE_ROOT/packaging" "$OPT_DIR/"
# Copy bin
cp -r "$WORKSPACE_ROOT/bin" "$OPT_DIR/"
chmod +x "$OPT_DIR/bin/nuvictl"

# Install symlink for nuvictl
ln -sf /opt/nuvi/bin/nuvictl "$BIN_DIR/nuvictl"

# Install systemd unit files
cp "$WORKSPACE_ROOT/packaging/systemd/nuvi-api.service" "$SYSTEMD_DIR/"
cp "$WORKSPACE_ROOT/packaging/systemd/nuvi-worker.service" "$SYSTEMD_DIR/"

# Install default .env templates
ETC_DIR="$STAGING_DIR/etc/nuvi"
mkdir -p "$ETC_DIR"
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
Depends: python3 (>= 3.10), subversion (>= 1.14), libapr1, libaprutil1
Description: Enterprise Subversion Server & Administration Platform
 Subversion Nuvi delivers full VisualSVN Server Enterprise feature parity
 for Apache Subversion on Linux, including visual path ACLs, Argon2id,
 brute-force shield, web repository client, FTS5 search, hot backups,
 pre-packaged hooks, and VDFS multi-site replication.
EOF

cat <<EOF > "$DEBIAN_DIR/postinst"
#!/bin/sh
set -e
# Create subversion and nuvi system users/groups if not existing
if ! getent group subversion >/dev/null; then
    groupadd --system subversion
fi
if ! getent passwd subversion >/dev/null; then
    useradd --system --gid subversion --home-dir /opt/nuvi --no-create-home --shell /usr/sbin/nologin subversion
fi
if ! getent group nuvi >/dev/null; then
    groupadd --system nuvi
fi
if ! getent passwd nuvi >/dev/null; then
    useradd --system --gid nuvi --home-dir /opt/nuvi --no-create-home --shell /usr/sbin/nologin nuvi
fi

# Ensure web server (www-data) mutual permissions
if getent group www-data >/dev/null; then
    usermod -aG www-data subversion 2>/dev/null || true
    usermod -aG subversion www-data 2>/dev/null || true
fi

chown -R subversion:subversion /opt/nuvi/data
chmod -R 775 /opt/nuvi/data

# Initialize /etc/nuvi/nuvi.env from template if not existing
if [ ! -f /etc/nuvi/nuvi.env ] && [ -f /etc/nuvi/nuvi.env.example ]; then
    cp /etc/nuvi/nuvi.env.example /etc/nuvi/nuvi.env
    chmod 640 /etc/nuvi/nuvi.env
    chown root:subversion /etc/nuvi/nuvi.env 2>/dev/null || true
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
    systemctl stop nuvi-api.service || true
    systemctl stop nuvi-worker.service || true
fi
exit 0
EOF
chmod 755 "$DEBIAN_DIR/prerm"
chmod 755 "$DEBIAN_DIR/postinst"
chmod 644 "$DEBIAN_DIR/control"
chmod 755 "$DEBIAN_DIR"

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
