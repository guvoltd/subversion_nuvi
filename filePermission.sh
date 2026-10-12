# 1. Ensure system user & group exist
sudo getent group subversion >/dev/null || sudo groupadd --system subversion
sudo getent passwd subversion >/dev/null || sudo useradd --system --gid subversion --home-dir /opt/nuvi --no-create-home --shell /usr/sbin/nologin subversion

# 2. Add current user and Apache (www-data) to the subversion group
sudo usermod -aG subversion $USER
sudo usermod -aG subversion www-data 2>/dev/null || true
sudo usermod -aG www-data subversion 2>/dev/null || true

# 3. /opt/nuvi application, venv & data
sudo chown -R subversion:subversion /opt/nuvi
sudo find /opt/nuvi -type d -exec chmod 755 {} +
sudo find /opt/nuvi -type f -exec chmod 644 {} +
sudo find /opt/nuvi/data -type d -exec chmod 2775 {} +
sudo find /opt/nuvi/data -type f -exec chmod 664 {} +
[ -d /opt/nuvi/data/db ] && sudo chmod 2770 /opt/nuvi/data/db
[ -d /opt/nuvi/data/backups ] && sudo chmod 2770 /opt/nuvi/data/backups
[ -d /opt/nuvi/data/certs ] && sudo chmod 2770 /opt/nuvi/data/certs
[ -f /opt/nuvi/data/db/nuvi_metadata.sqlite3 ] && sudo chmod 660 /opt/nuvi/data/db/nuvi_metadata.sqlite3
[ -f /opt/nuvi/bin/nuvictl ] && sudo chmod 755 /opt/nuvi/bin/nuvictl
[ -f /opt/nuvi/backend/core/build/libnuvi_svn_core.so ] && sudo chmod 755 /opt/nuvi/backend/core/build/libnuvi_svn_core.so

# 4. /var/log/nuvi logs
sudo mkdir -p /var/log/nuvi
sudo chown -R subversion:subversion /var/log/nuvi
sudo chmod 2775 /var/log/nuvi

# 5. /etc/nuvi configurations (secured 640)
sudo mkdir -p /etc/nuvi
sudo chown -R root:subversion /etc/nuvi
sudo chmod 750 /etc/nuvi
[ -f /etc/nuvi/nuvi.env ] && sudo chmod 640 /etc/nuvi/nuvi.env
[ -f /etc/nuvi/nuvi.env.example ] && sudo chmod 644 /etc/nuvi/nuvi.env.example

# 6. nuvictl symlinks
sudo chown -h root:root /usr/bin/nuvictl /usr/local/bin/nuvictl 2>/dev/null || true

# 7. Systemd unit files
sudo chown root:root /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service 2>/dev/null || true
sudo chmod 644 /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service 2>/dev/null || true

# 8. Reload systemd
sudo systemctl daemon-reload