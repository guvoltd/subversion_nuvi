#!/usr/bin/env bash
set -e

# Subversion Nuvi - Web Server & Reverse Proxy Setup Script
# Installs and links Nginx and Apache mod_dav_svn configurations for production.

echo "=========================================================="
echo " Subversion Nuvi - Web Server & Proxy Integration"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGING_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$PACKAGING_DIR/.." && pwd)"

NGINX_CONF_SRC="$PACKAGING_DIR/nginx/subversion-nuvi.conf"
APACHE_CONF_SRC="$PACKAGING_DIR/apache/nuvi-svn.conf"

echo "[1/4] Checking required packages..."
if command -v apt-get >/dev/null 2>&1; then
    echo "Host is Debian/Ubuntu based."
elif command -v dnf >/dev/null 2>&1; then
    echo "Host is RHEL/Fedora based."
else
    echo "Unknown package manager. Proceeding with configuration files deployment."
fi

echo "[2/4] Deploying Nginx reverse proxy configuration..."
if [ -d "/etc/nginx/sites-available" ]; then
    cp "$NGINX_CONF_SRC" /etc/nginx/sites-available/subversion-nuvi.conf
    ln -sf /etc/nginx/sites-available/subversion-nuvi.conf /etc/nginx/sites-enabled/
    echo "Installed to /etc/nginx/sites-available/subversion-nuvi.conf"
    if command -v nginx >/dev/null 2>&1; then
        nginx -t || true
    fi
elif [ -d "/etc/nginx/conf.d" ]; then
    cp "$NGINX_CONF_SRC" /etc/nginx/conf.d/subversion-nuvi.conf
    echo "Installed to /etc/nginx/conf.d/subversion-nuvi.conf"
fi

echo "[3/4] Deploying Apache mod_dav_svn backend configuration..."
if [ -d "/etc/apache2/sites-available" ]; then
    cp "$APACHE_CONF_SRC" /etc/apache2/sites-available/nuvi-svn.conf
    ln -sf /etc/apache2/sites-available/nuvi-svn.conf /etc/apache2/sites-enabled/
    echo "Installed to /etc/apache2/sites-available/nuvi-svn.conf"
    if command -v a2enmod >/dev/null 2>&1; then
        a2enmod dav dav_svn authz_svn || true
    fi
elif [ -d "/etc/httpd/conf.d" ]; then
    cp "$APACHE_CONF_SRC" /etc/httpd/conf.d/nuvi-svn.conf
    echo "Installed to /etc/httpd/conf.d/nuvi-svn.conf"
fi

echo "[4/4] Ensuring Nuvi data directories exist..."
mkdir -p "$WORKSPACE_ROOT/data/repositories"
mkdir -p "$WORKSPACE_ROOT/data/logs"
touch "$WORKSPACE_ROOT/data/authz"
touch "$WORKSPACE_ROOT/data/htpasswd"

echo "=========================================================="
echo " Web server configuration deployed successfully!"
echo " Restart services with:"
echo "   sudo systemctl restart apache2 # or httpd"
echo "   sudo systemctl restart nginx"
echo "=========================================================="
