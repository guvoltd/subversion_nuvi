Here are the step-by-step instructions to completely wipe all Subversion Nuvi files, databases, configurations, and services and start over with a fresh, clean slate.

Phase 1: Complete Clean Slate Purge (Total Removal)

CAUTION

This will permanently delete all Nuvi repositories, databases, and configuration files. If you have any repositories you wish to keep, dump or back them up before running these commands.

1. Stop and Disable Services
bash
sudo systemctl stop nuvi-api.service nuvi-worker.service apache2 nginx 2>/dev/null || true
sudo systemctl disable nuvi-api.service nuvi-worker.service 2>/dev/null || true
2. Purge the Debian Package
bash
sudo apt purge subversion-nuvi -y 2>/dev/null || sudo dpkg -P subversion-nuvi 2>/dev/null || true
3. Remove Service Unit Files & Binaries
bash
sudo rm -f /etc/systemd/system/nuvi-api.service
sudo rm -f /etc/systemd/system/nuvi-worker.service
sudo rm -f /usr/bin/nuvictl
sudo rm -f /usr/local/bin/nuvictl
sudo systemctl daemon-reload
sudo systemctl reset-failed
4. Remove All Directories and Data
bash
# Application and virtual environment
sudo rm -rf /opt/nuvi
# Configuration
sudo rm -rf /etc/nuvi
# Logs and system state
sudo rm -rf /var/log/nuvi
sudo rm -rf /var/lib/nuvi
sudo rm -rf /var/nuvi
# Custom data folder created under /home
sudo rm -rf /home/nuvi-svn
5. Remove Apache / Nginx Nuvi Configurations
bash
# Apache site configs
sudo rm -f /etc/apache2/sites-enabled/nuvi-svn.conf
sudo rm -f /etc/apache2/sites-available/nuvi-svn.conf
sudo rm -f /etc/httpd/conf.d/nuvi-svn.conf
# Nginx site configs (if configured)
sudo rm -f /etc/nginx/sites-enabled/subversion-nuvi.conf
sudo rm -f /etc/nginx/sites-available/subversion-nuvi.conf
sudo rm -f /etc/nginx/conf.d/subversion-nuvi.conf
6. (Optional) Remove System Users and Groups

If you want to recreate the system users and groups from scratch:

bash
sudo userdel -r nuvi 2>/dev/null || true
sudo groupdel nuvi 2>/dev/null || true
sudo userdel -r subversion 2>/dev/null || true
sudo groupdel subversion 2>/dev/null || true
7. Verify System is Clean
bash
systemctl status nuvi-api.service
# Should output: Unit nuvi-api.service could not be found.
which nuvictl
# Should output nothing
Phase 2: Clean Slate Re-Installation & Setup
1. Install System Dependencies
bash
sudo apt update
sudo apt install -y subversion libapache2-mod-svn apache2 python3 python3-venv python3-pip python3-multipart
2. Install the Rebuilt .deb Package
bash
sudo dpkg -i /media/uv/winData/proTEmp/subversion_nuvi/dist/subversion-nuvi_1.16.13_amd64.deb

(The postinst script will automatically create users, initialize /opt/nuvi/data, set up permissions, and configure systemd services with ProtectHome=false).

3. (Optional) Custom Data Directory (/home/nuvi-svn/data)

If you want your data in /home/nuvi-svn/data instead of the default /opt/nuvi/data:

bash
# Create directories
sudo mkdir -p /home/nuvi-svn/data/repositories \
              /home/nuvi-svn/data/db \
              /home/nuvi-svn/data/backups \
              /home/nuvi-svn/data/certs \
              /home/nuvi-svn/data/search_index \
              /home/nuvi-svn/data/logs
# Set permissions
sudo chown -R subversion:subversion /home/nuvi-svn/data
sudo find /home/nuvi-svn/data -type d -exec chmod 2775 {} +
sudo chmod 2770 /home/nuvi-svn/data/db /home/nuvi-svn/data/backups /home/nuvi-svn/data/certs
# Create symlink for Apache/system utilities
sudo ln -sfn /home/nuvi-svn/data /opt/nuvi/data
# Point /etc/nuvi/nuvi.env to the new path
sudo sed -i 's|^NUVI_DATA_DIR=.*|NUVI_DATA_DIR=/home/nuvi-svn/data|' /etc/nuvi/nuvi.env
sudo sed -i 's|^NUVI_REPOSITORIES_ROOT=.*|NUVI_REPOSITORIES_ROOT=/home/nuvi-svn/data/repositories|' /etc/nuvi/nuvi.env
sudo sed -i 's|^NUVI_DB_PATH=.*|NUVI_DB_PATH=/home/nuvi-svn/data/db/nuvi_metadata.sqlite3|' /etc/nuvi/nuvi.env
4. Configure and Enable Apache (mod_dav_svn)

Deploy the Apache site configuration:

bash
sudo cp /opt/nuvi/packaging/apache/nuvi-svn.conf /etc/apache2/sites-available/nuvi-svn.conf
sudo a2enmod dav dav_svn authz_svn
sudo a2ensite nuvi-svn.conf
sudo systemctl restart apache2
5. Start and Enable Nuvi Services
bash
sudo systemctl daemon-reload
sudo systemctl enable --now nuvi-api.service nuvi-worker.service
6. Verify Service Status
bash
sudo systemctl status nuvi-api.service
sudo systemctl status nuvi-worker.service
sudo systemctl status apache2
7. Access the Web Console
Open your browser to: http://me-server.in:8080
Log in with default credentials:
Username: admin
Password: admin
Test creating a new repository or importing a dump.
Test checkout with the Subversion WebDAV port:
bash
svn checkout http://me-server.in:8081/svn/<your_repo> --username admin


Here are the commands to manually create the subversion and nuvi system users and groups with proper group memberships:

Step-by-Step Commands
1. Create the subversion Group and User
bash
# Create system group 'subversion'
sudo groupadd --system subversion
# Create system user 'subversion' with no login shell and home set to /opt/nuvi
sudo useradd --system \
  --gid subversion \
  --home-dir /opt/nuvi \
  --no-create-home \
  --shell /usr/sbin/nologin \
  subversion
2. Create the nuvi Group and User
bash
# Create system group 'nuvi'
sudo groupadd --system nuvi
# Create system user 'nuvi' with no login shell and home set to /opt/nuvi
sudo useradd --system \
  --gid nuvi \
  --home-dir /opt/nuvi \
  --no-create-home \
  --shell /usr/sbin/nologin \
  nuvi
3. Link Mutual Group Memberships

Connect subversion and nuvi so both services can collaborate:

bash
# Add 'subversion' user to the 'nuvi' group
sudo usermod -aG nuvi subversion
# Add 'nuvi' user to the 'subversion' group
sudo usermod -aG subversion nuvi
4. Configure Apache (www-data) Collaboration

Apache Subversion (mod_dav_svn) runs under the www-data user on Debian/Ubuntu. Grant www-data access to the subversion group so Apache can read/write repositories and compiled authz/htpasswd files:

bash
# Add Apache (www-data) to the subversion group
sudo usermod -aG subversion www-data
# Add subversion to the www-data group
sudo usermod -aG www-data subversion
5. Add Your Login User to the subversion Group (Recommended)

This allows your own Linux user account to inspect repositories and run nuvictl commands without requiring sudo every time:

bash
sudo usermod -aG subversion $USER

(You will need to log out and back in, or run newgrp subversion for this to take effect in your current terminal).

Verification

Check that the users and their group memberships were created successfully:

bash
id subversion
# Output should show: uid=...(subversion) gid=...(subversion) groups=...(subversion),...(nuvi),...(www-data)
id nuvi
# Output should show: uid=...(nuvi) gid=...(nuvi) groups=...(nuvi),...(subversion)
id www-data
# Output should show: groups includes (subversion)