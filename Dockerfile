# ==============================================================================
# Subversion Nuvi - Production Container Image
# Multi-stage build providing Apache Subversion (mod_dav_svn) and Nuvi API Server
# ==============================================================================

# Stage 1: Build Web Administration Console
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Native Subversion C++ Core
FROM ubuntu:24.04 AS cpp-builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libsvn-dev \
    libapr1-dev \
    libaprutil1-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend/core
COPY backend/core/ ./
RUN rm -rf build && cmake -B build -S . && cmake --build build

# Stage 3: Runtime
FROM ubuntu:24.04 AS runtime
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/nuvi \
    NUVI_DATA_DIR=/var/nuvi

RUN apt-get update && apt-get install -y --no-install-recommends \
    subversion \
    libsvn1 \
    libapr1 \
    libaprutil1 \
    apache2 \
    libapache2-mod-svn \
    python3 \
    python3-pip \
    python3-venv \
    supervisor \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Setup application directories and user
RUN groupadd -r subversion && useradd -r -g subversion -d /opt/nuvi -s /sbin/nologin subversion \
    && usermod -aG subversion www-data \
    && usermod -aG www-data subversion \
    && mkdir -p /opt/nuvi /var/nuvi/repositories /var/nuvi/db /var/nuvi/backups /var/nuvi/certs /var/nuvi/logs /var/log/nuvi /etc/supervisor/conf.d \
    && chown -R subversion:www-data /opt/nuvi /var/nuvi /var/log/nuvi \
    && chmod -R 775 /var/nuvi

WORKDIR /opt/nuvi

# Create Virtualenv and install Python dependencies
RUN python3 -m venv /opt/nuvi/venv
COPY backend/ /opt/nuvi/backend/
RUN mkdir -p /opt/nuvi/backend/core/build
RUN /opt/nuvi/venv/bin/pip install --no-cache-dir \
    fastapi \
    uvicorn \
    pydantic \
    sqlalchemy \
    argon2-cffi \
    cryptography \
    python-multipart \
    psutil

# Copy compiled C++ core from cpp-builder
COPY --from=cpp-builder /app/backend/core/build/libnuvi_svn_core.so /opt/nuvi/backend/core/build/libnuvi_svn_core.so

# Copy built frontend assets from frontend-builder
COPY --from=frontend-builder /app/frontend/dist /opt/nuvi/frontend/dist

# Copy CLI tool and .env.example template
COPY bin/ /opt/nuvi/bin/
COPY .env.example /opt/nuvi/.env.example
RUN ln -sf /opt/nuvi/bin/nuvictl /usr/local/bin/nuvictl && chmod +x /opt/nuvi/bin/nuvictl

# Copy Apache and Supervisor configs
COPY packaging/docker/subversion.conf /etc/apache2/mods-available/dav_svn.conf
COPY packaging/docker/apache-unified.conf /etc/apache2/sites-available/000-default.conf
COPY packaging/docker/supervisord.conf /etc/supervisor/conf.d/nuvi.conf

# Enable Apache DAV SVN and reverse proxy modules, configure unified ports
RUN a2enmod dav dav_svn authz_svn proxy proxy_http proxy_wstunnel headers \
    && echo "Listen 8000" >> /etc/apache2/ports.conf

EXPOSE 80 8000

VOLUME ["/var/nuvi"]

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
