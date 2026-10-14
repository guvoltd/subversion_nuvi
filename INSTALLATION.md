# Subversion Nuvi - Prerequisites & Installation Guide

This guide provides step-by-step instructions for installing and deploying **Subversion Nuvi** across all supported deployment targets: **Docker / Docker Compose**, **Debian package (`.deb`)**, **Turnkey Host Script**, and **Standalone Tarball (`.tar.gz`)**.

> [!TIP]
> **Is creating a dedicated `nuvi` or `subversion` user mandatory?**
> **No, creating a dedicated system user is NOT mandatory.** You can run Subversion Nuvi using your **existing Linux login user** (`$USER`), which gives you direct read/write access to repository storage without needing `sudo`. You can also choose the standard isolated service user for multi-tenant production setups. Both methods are detailed below.

---

## 1. System Requirements & Compatibility

| Specification | Minimum Requirement | Recommended (Production) |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 LTS+, Debian 11+, or any Linux with Docker | Ubuntu 24.04 LTS / Debian 12 |
| **CPU Architecture** | x86_64 / amd64 (2 Cores) | x86_64 (4+ Cores) |
| **Memory (RAM)** | 2 GB | 4 GB to 8 GB |
| **Storage** | 10 GB free space | 50+ GB SSD (dependent on repository tree sizes) |
| **Network Ports** | `8080` (Web Console / API), `8081` (SVN WebDAV) | `80` / `443` (via Nginx or Apache reverse proxy) |

---

## 2. Located Project Assets & Existing Scripts

The repository includes pre-built artifacts and automated setup scripts:

| Asset / Script | Location | Purpose |
| :--- | :--- | :--- |
| **Pre-built Debian Package** | `dist/subversion-nuvi_1.16.13_amd64.deb` | Ready-to-install `.deb` package for Ubuntu and Debian |
| **Standalone Tarball** | `dist/subversion-nuvi-1.16.13-linux-x86_64.tar.gz` | Portable distribution package |
| **Root Docker Compose** | `docker-compose.yml` | Production Docker Compose service configuration |
| **Production Dockerfile** | `packaging/docker/Dockerfile` | 3-stage multi-stage image definition |
| **Turnkey Host Installer** | `packaging/install.sh` | Automated host installer script for Ubuntu / Debian |
| **Packaging Builder** | `packaging/build_package.sh` | Rebuilds `.deb` and `.tar.gz` packages |
| **Web Server Setup Script** | `packaging/scripts/setup_webserver.sh` | Deploys Nginx and Apache reverse proxy configurations |
| **Systemd Service Units** | `packaging/systemd/` | `nuvi-api.service` and `nuvi-worker.service` definitions |
| **Environment Configuration** | `.env.example` | Master template for all storage paths, ports, logs, authz, and security settings |
| **Admin CLI Tool** | `bin/nuvictl` (symlinked to `/usr/local/bin/nuvictl`) | Headless Linux management command-line utility |

---

## 3. Configuration & Environment Parameters (.env)

Subversion Nuvi supports extensive customization of repository storage paths, networking ports, authorization files, log locations, and security policies via `.env` configuration files or environment variables.

### 3.1 Configuration File Locations by Deployment Method
* **Docker / Compose**: Create or edit `.env` in the project root:
  ```bash
  cp .env.example .env
  # Edit values such as NUVI_PORT, NUVI_SVN_PORT, etc.
  ```
* **Debian Package (`.deb`)**: Automatically initialized at `/etc/nuvi/nuvi.env`:
  ```bash
  sudo nano /etc/nuvi/nuvi.env
  sudo systemctl restart nuvi-api.service nuvi-worker.service
  ```
* **Host Script / Source Install**: Initialized at `/etc/nuvi/nuvi.env` and `/opt/nuvi/.env`:
  ```bash
  sudo nano /opt/nuvi/.env
  sudo systemctl restart nuvi-api.service nuvi-worker.service
  ```

### 3.2 Primary Configuration Parameters

| Parameter | Default (Host / Docker) | Description |
| :--- | :--- | :--- |
| **`NUVI_REPOSITORIES_ROOT`** | `/opt/nuvi/data/repositories` / `/var/nuvi/repositories` | Filesystem path where Subversion FSFS repositories are stored |
| **`NUVI_DATA_DIR`** | `/opt/nuvi/data` / `/var/nuvi` | Base root storage directory for all application data |
| **`NUVI_PORT`** | `8080` (host) / `8000` (container) | Web Administration Console & REST API HTTP port |
| **`NUVI_SVN_PORT`** | `8081` (host) / `80` (container) | Apache `mod_dav_svn` WebDAV Subversion client access port |
| **`NUVI_AUTHZ_FILE`** | `${NUVI_DATA_DIR}/authz` | Path to compiled path-based access control rules (authz) |
| **`NUVI_HTPASSWD_FILE`** | `${NUVI_DATA_DIR}/htpasswd` | Path to compiled Apache Basic Auth credentials file |
| **`NUVI_DB_PATH`** | `${NUVI_DATA_DIR}/db/nuvi_metadata.sqlite3` | SQLite database file for users, audit logs, and settings |
| **`NUVI_LOGS_DIR`** | `/var/log/nuvi` | Directory for application, worker, and Apache SVN logs |
| **`NUVI_API_LOG`** | `${NUVI_LOGS_DIR}/api.log` | API access and operations log file |
| **`NUVI_SVN_ACCESS_LOG`** | `${NUVI_LOGS_DIR}/svn_access.log` | Subversion client checkout/commit audit access log |
| **`NUVI_SVN_ERROR_LOG`** | `${NUVI_LOGS_DIR}/svn_error.log` | Subversion WebDAV error log |
| **`NUVI_SERVER_NAME`** | `Subversion Nuvi Enterprise Server` | Display name of the server instance |
| **`NUVI_LOG_LEVEL`** | `INFO` | Logging verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| **`NUVI_BAN_THRESHOLD`** | `5` | Failed attempts before IP address ban by Brute-Force Shield |

### 3.3 Inspecting Active Configuration
At any time, you can verify which configuration file and parameters are active using the `nuvictl` CLI:
```bash
nuvictl config
```

---

## 4. Installation Method 1: Docker / Docker Compose (Fastest & Recommended)

Docker provides a completely isolated, zero-dependency environment bundling the native C++ Subversion engine, Python FastAPI server, Apache `mod_dav_svn`, and the compiled React administration console.

### 4.1 Install Prerequisites (Docker & Compose)

#### Ubuntu / Debian:
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Add Docker's official GPG key & repository
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 4.2 Launch Container Stack

From the root of the `subversion_nuvi` workspace:

```bash
# 1. Start the services in the background
docker compose up -d

# 2. Verify container status and healthcheck
docker compose ps
```

### 4.3 Default Container Mappings
* **Web Management Console & REST API**: `http://localhost:8080/`
* **Apache mod_dav_svn Endpoint**: `http://localhost:8081/svn/`
* **Persistent Data Volume**: `nuvi_storage_data` mounted at `/var/nuvi`
* **Persistent Logs Volume**: `nuvi_server_logs` mounted at `/var/log/nuvi`

---

## 5. Installation Method 2: Debian Package (`.deb`)

Use the pre-built `.deb` package on native Ubuntu 22.04/24.04 or Debian 11/12 servers.

### 5.1 Install Prerequisites

```bash
sudo apt-get update
sudo apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    subversion \
    libsvn1 \
    libapr1 \
    libaprutil1 \
    apache2 \
    libapache2-mod-svn
```

### 5.2 Install the Package

```bash
# Install the generated .deb package directly via apt (resolves any missing runtime dependencies)
sudo apt-get install -y ./dist/subversion-nuvi_1.16.13_amd64.deb

# OR install using dpkg:
sudo dpkg -i dist/subversion-nuvi_1.16.13_amd64.deb
sudo apt-get install -f -y
```

### 5.3 Service User Configuration: Dedicated User vs. Current User

Creating a new user is **NOT mandatory**. You can run the Subversion Nuvi services and manage repository permissions using either:
* **Option A (Dedicated User — Enterprise / Production)**: Uses an isolated system account (`subversion` or `nuvi`).
* **Option B (Current Login User — Development / Workstations)**: Uses your existing Linux account (`$USER`), giving you direct file access without `sudo`.

---

#### Option A: Use Dedicated Service User (`subversion` / `nuvi`)
Recommended for multi-tenant production servers for security isolation.

1. The `.deb` package automatically creates the `subversion` and `nuvi` system users.
2. To allow your current login user to easily read/write repositories without `sudo`, simply add your user to the `subversion` group:
   ```bash
   sudo usermod -aG subversion $USER
   # Re-login or run 'newgrp subversion' to apply
   ```
3. Enable and start services:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now nuvi-api.service nuvi-worker.service
   ```

---

#### Option B: Use Your Existing Login User (`$USER`)
Recommended for developer workstations, personal servers, or CI/test runners.

If you prefer to run Subversion Nuvi directly under your current user account:

1. **Assign data folder ownership to your current user**:
   ```bash
   sudo chown -R $USER:$(id -gn) /opt/nuvi/data
   ```

2. **Configure systemd services to run as your current user**:
   ```bash
   # Update User and Group in the systemd service files:
   sudo sed -i "s/^User=.*/User=$USER/" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service
   sudo sed -i "s/^Group=.*/Group=$(id -gn)/" /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service
   ```

3. **Grant mutual permissions with Apache (`www-data`)** (if using Apache `mod_dav_svn`):
   ```bash
   sudo usermod -aG www-data $USER
   sudo usermod -aG $(id -gn) www-data
   sudo chmod -R 775 /opt/nuvi/data/repositories
   ```

4. **Reload and start services as your current user**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now nuvi-api.service nuvi-worker.service
   ```

---

### 5.4 Verify Service Status

```bash
sudo systemctl status nuvi-api.service
sudo systemctl status nuvi-worker.service
nuvictl status
```

---

### 5.5 Complete Uninstallation & Clean Reinstallation

To completely remove Subversion Nuvi, purge all services and data, and perform a fresh reinstall from `.deb`:

#### Step 1: Complete Removal / Purge
```bash
# 1. Stop and disable active services
sudo systemctl stop nuvi-api.service nuvi-worker.service 2>/dev/null || true
sudo systemctl disable nuvi-api.service nuvi-worker.service 2>/dev/null || true

# 2. Purge the Debian package (removes systemd units and package files)
sudo apt-get purge -y subversion-nuvi || sudo dpkg -P subversion-nuvi

# 3. Clean up runtime directories, database, logs, and venv
sudo rm -rf /opt/nuvi
sudo rm -rf /var/log/nuvi
sudo rm -rf /etc/nuvi
sudo rm -f /usr/local/bin/nuvictl
sudo rm -f /etc/systemd/system/nuvi-api.service /etc/systemd/system/nuvi-worker.service

# 4. Reload systemd daemon
sudo systemctl daemon-reload
sudo systemctl reset-failed
```

#### Step 2: Clean Reinstallation
```bash
# Install the fresh .deb package via apt (resolves any dependencies automatically)
sudo apt-get install -y ./dist/subversion-nuvi_1.16.13_amd64.deb

# OR install using dpkg:
# sudo dpkg -i dist/subversion-nuvi_1.16.13_amd64.deb
# sudo apt-get install -f -y

# Activate subversion group membership in current shell:
newgrp subversion

# Verify
nuvictl status
```

---

### 5.6 Filesystem Ownership, Groups, and Permissions Matrix

The `.deb` package installs with a defense-in-depth permission model: application source and binaries are immutable to the service user (`root:root 0755/0644`), while runtime state directories use **setgid (`2775`)** to ensure seamless group collaboration between the `subversion` service daemon, Apache (`www-data`), and administrator accounts.

| Filesystem Path | Owner | Group | Permissions (Mode) | Purpose & Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **`/opt/nuvi`** | `root` | `root` | `0755` (`drwxr-xr-x`) | Base installation root; immutable to service accounts |
| **`/opt/nuvi/backend`** | `root` | `root` | `0755` (dirs) / `0644` (files) | Python API backend; protected against unauthorized tampering |
| **`/opt/nuvi/backend/core/build/libnuvi_svn_core.so`** | `root` | `root` | `0755` (`-rwxr-xr-x`) | Native C++ Subversion bridge shared library |
| **`/opt/nuvi/frontend`** | `root` | `root` | `0755` (dirs) / `0644` (files) | Web console compiled static assets |
| **`/opt/nuvi/venv`** | `root` | `root` | `0755` (execs) / `0644` (libs) | Isolated Python runtime; executable by `subversion` |
| **`/opt/nuvi/bin/nuvictl`** | `root` | `root` | `0755` (`-rwxr-xr-x`) | Headless administration CLI script |
| **`/usr/bin/nuvictl`** | `root` | `root` | `lrwxrwxrwx` -> `/opt/nuvi/bin/nuvictl` | Global standard Debian system binary symlink |
| **`/usr/local/bin/nuvictl`** | `root` | `root` | `lrwxrwxrwx` -> `/opt/nuvi/bin/nuvictl` | Backward-compatibility symlink |
| **`/opt/nuvi/data`** | `subversion` | `subversion` | `2775` (`drwxrwsr-x`) | Runtime data root; **setgid** enforces group inheritance |
| **`/opt/nuvi/data/repositories`** | `subversion` | `subversion` | `2775` (`drwxrwsr-x`) | FSFS repositories; shared with Apache `www-data` via group |
| **`/opt/nuvi/data/db`** | `subversion` | `subversion` | `2770` (`drwxrws---`) | SQLite database directory; restricted to service group |
| **`/opt/nuvi/data/db/*.sqlite3*`** | `subversion` | `subversion` | `0660` (`-rw-rw----`) | Metadata database and WAL journals; service group read/write |
| **`/opt/nuvi/data/backups`** | `subversion` | `subversion` | `2770` (`drwxrws---`) | Hot backup archives; restricted to service group |
| **`/opt/nuvi/data/certs`** | `subversion` | `subversion` | `2770` (`drwxrws---`) | TLS private keys and X.509 certs; restricted to service group |
| **`/opt/nuvi/data/search_index`** | `subversion` | `subversion` | `2775` (`drwxrwsr-x`) | FTS5 full-text search indexes |
| **`/opt/nuvi/data/authz`** | `subversion` | `subversion` | `0664` (`-rw-rw-r--`) | Compiled ACL file; readable by Apache `mod_authz_svn` |
| **`/opt/nuvi/data/htpasswd`** | `subversion` | `subversion` | `0664` (`-rw-rw-r--`) | Compiled basic auth credentials; readable by Apache |
| **`/var/log/nuvi`** | `subversion` | `subversion` | `2775` (`drwxrwsr-x`) | Application and Subversion access/error logs |
| **`/etc/nuvi`** | `root` | `subversion` | `0750` (`drwxr-x---`) | Configuration directory; hidden from unprivileged accounts |
| **`/etc/nuvi/nuvi.env`** | `root` | `subversion` | `0640` (`-rw-r-----`) | Environment secrets (JWT key, LDAP); read-only to service |
| **`/etc/nuvi/nuvi.env.example`** | `root` | `root` | `0644` (`-rw-r--r--`) | Public master configuration reference template |
| **`/etc/systemd/system/nuvi-*.service`** | `root` | `root` | `0644` (`-rw-r--r--`) | Systemd unit files; strictly non-executable / non-writable |

---

## 6. Installation Method 3: Turnkey Host Script (`packaging/install.sh`)

If building directly on the target host from source files, use the turnkey installer:

### 6.1 Run the Automated Installer

You can run the installer using either the default dedicated service user or your current login user:

#### Option A: Default Dedicated Service User
```bash
sudo ./packaging/install.sh
```

#### Option B: Use Your Current Login User
```bash
# Pass your current username directly:
sudo ./packaging/install.sh --user=$USER

# OR set the NUVI_USER environment variable:
NUVI_USER=$USER sudo -E ./packaging/install.sh
```

#### Option C: Follow Custom `.env` Configuration File
```bash
# Simply place a configured .env in the current directory:
cp .env.example .env
nano .env
sudo ./install.sh

# OR pass an explicit configuration file:
sudo ./install.sh --env-file=/custom/path/nuvi.env
```
The installer automatically discovers `.env`, extracts custom repository storage paths (`NUVI_REPOSITORIES_ROOT`), service ports (`NUVI_PORT`), log directories (`NUVI_LOGS_DIR`), and service user settings (`NUVI_USER`), copies the active `.env` to `/etc/nuvi/nuvi.env` and `/opt/nuvi/.env`, and ensures directory creation and systemd sandboxing rules are updated.

### 6.2 What the Script Automates
1. Installs all required compilers and header libraries (`build-essential`, `cmake`, `libsvn-dev`, `libapr1-dev`, `libaprutil1-dev`, `apache2`, `libapache2-mod-svn`, `python3-venv`).
2. Configures the selected service user (creates dedicated user or configures existing login user) and establishes storage directories under `/opt/nuvi`, `/var/nuvi`, and `/var/log/nuvi`.
3. Grants mutual group permissions with Apache (`www-data`).
4. Automatically compiles the native C++ Subversion engine:
   ```bash
   cmake -B /opt/nuvi/backend/core/build -S /opt/nuvi/backend/core
   cmake --build /opt/nuvi/backend/core/build
   ```
5. Creates the Python virtual environment and installs backend packages (`fastapi`, `uvicorn`, `sqlalchemy`, `argon2-cffi`, `psutil`).
6. Configures and starts `nuvi-api` and `nuvi-worker` systemd services configured for the selected user.

---

## 7. Installation Method 4: Standalone Tarball (`.tar.gz`)

For non-Debian distributions (Rocky Linux, RHEL, AlmaLinux, Arch):

### 7.1 Install System Dependencies (RHEL / Rocky Linux 9)

```bash
sudo dnf install -y epel-release
sudo dnf install -y subversion apr apr-util python3 python3-pip httpd mod_dav_svn
```

### 7.2 Extract Archive

```bash
sudo tar -xzf dist/subversion-nuvi-1.16.13-linux-x86_64.tar.gz -C /
```

This extracts files into `/opt/nuvi`, `/etc/systemd/system/`, and `/usr/local/bin/`.

---

## 8. Web Server & Reverse Proxy Integration (Nginx & Apache)

To expose Subversion Nuvi over standard ports (`80` / `443`) with SSL and unified URL routing:

```bash
# Run the automated web server configuration script:
sudo ./packaging/scripts/setup_webserver.sh
```

This installs:
* `/etc/nginx/sites-available/subversion-nuvi.conf` (Nginx reverse proxy)
* `/etc/apache2/sites-available/nuvi-svn.conf` (Apache `mod_dav_svn` backend on port 8081)

Restart the web servers:
```bash
sudo a2enmod dav dav_svn authz_svn
sudo systemctl restart apache2
sudo systemctl restart nginx
```

---

## 9. Post-Installation Verification & Administration

### 9.1 Initial Access & Credentials
* **Web Admin Console**: Navigate to `http://<your-server-ip>:8080` (or `http://localhost:8000`)
* **Default Administrator Username**: `admin`
* **Default Administrator Password**: `admin`
*(You will be prompted to change the administrator password upon first login)*

### 9.2 Verify Using the `nuvictl` CLI
The `nuvictl` command-line utility provides instant server inspection:

```bash
# Check server health and status
nuvictl status

# List repositories
nuvictl repo list

# Create a sample repository with standard trunk/branches/tags layout
nuvictl repo create demo-project --layout

# List and manage users
nuvictl user list
```

### 8.3 Verify SVN Client Access
Test checking out a repository from any client workstation:

```bash
svn checkout http://<your-server-ip>:8081/svn/demo-project --username admin
```

