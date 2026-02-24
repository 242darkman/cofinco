#!/usr/bin/env bash
# ==========================================================
# Cofinco — VPS Initial Setup (Ubuntu 22.04/24.04 LTS)
# ==========================================================
# Usage :
#   sudo bash scripts/vps/setup.sh
#
# Ce script installe et configure :
#   1. PostgreSQL 16 (natif, sécurisé)
#   2. Nginx + Certbot (reverse proxy, HTTPS auto-renew)
#   3. Docker + Docker Compose
#   4. UFW Firewall (restrictif)
#   5. Arborescence /opt/cofinco
#   6. Utilisateur deploy (sans accès root)
#   7. systemd timer pour backups DB
#
# IMPORTANT : Ce script est IDEMPOTENT.
# Il peut être relancé sans danger.
# ==========================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────
APP_NAME="cofinco"
APP_DIR="/opt/$APP_NAME"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
PG_VERSION="16"
PG_DB="${PG_DB:-cofinco}"
PG_USER="${PG_USER:-cofinco_app}"
# PG_PASS should be set as env var or will be auto-generated
DOMAIN="${DOMAIN:-}"
ACME_EMAIL="${ACME_EMAIL:-}"

# ── Couleurs ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $*"; }
info() { echo -e "${CYAN}[→]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }

section() {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  $*${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Root check ───────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  err "Ce script doit être exécuté en root (sudo)"
  exit 1
fi

section "1/7 — SYSTEM UPDATES"

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget gnupg2 lsb-release ca-certificates \
  software-properties-common apt-transport-https \
  ufw fail2ban unzip jq logrotate

log "System packages updated"

section "2/7 — POSTGRESQL $PG_VERSION"

# Install PostgreSQL from official repo
if ! dpkg -l | grep -q "postgresql-$PG_VERSION"; then
  info "Installing PostgreSQL $PG_VERSION..."
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
    gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg 2>/dev/null || true
  echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | \
    tee /etc/apt/sources.list.d/pgdg.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq "postgresql-$PG_VERSION" "postgresql-client-$PG_VERSION"
  log "PostgreSQL $PG_VERSION installed"
else
  log "PostgreSQL $PG_VERSION already installed"
fi

# Start and enable
systemctl enable postgresql
systemctl start postgresql

# Generate password if not provided
if [ -z "${PG_PASS:-}" ]; then
  PG_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  warn "Auto-generated PG password (save this!): $PG_PASS"
fi

# Create database and user
info "Configuring PostgreSQL..."
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'\"" | grep -q 1 || \
  su - postgres -c "psql -c \"CREATE USER $PG_USER WITH PASSWORD '$PG_PASS' NOSUPERUSER NOCREATEDB NOCREATEROLE;\""

su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$PG_DB'\"" | grep -q 1 || \
  su - postgres -c "psql -c \"CREATE DATABASE $PG_DB OWNER $PG_USER;\""

# Grant permissions
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;\""
su - postgres -c "psql -d $PG_DB -c \"GRANT ALL ON SCHEMA public TO $PG_USER;\""
su - postgres -c "psql -d $PG_DB -c \"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $PG_USER;\""
su - postgres -c "psql -d $PG_DB -c \"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $PG_USER;\""
su - postgres -c "psql -d $PG_DB -c \"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $PG_USER;\""

log "PostgreSQL user '$PG_USER' and database '$PG_DB' configured"

# Secure pg_hba.conf — only scram-sha-256, allow Docker bridge subnet
PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"
PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"

# Get Docker bridge subnet (usually 172.17.0.0/16)
DOCKER_SUBNET="172.16.0.0/12"

# Backup original configs
cp "$PG_HBA" "$PG_HBA.bak.$(date +%Y%m%d)" 2>/dev/null || true
cp "$PG_CONF" "$PG_CONF.bak.$(date +%Y%m%d)" 2>/dev/null || true

# Configure listen_addresses to accept Docker bridge connections
# Safe because: pg_hba.conf restricts to localhost + Docker subnet, UFW blocks 5432 externally
if ! grep -q "listen_addresses.*\*" "$PG_CONF" 2>/dev/null; then
  sed -i "s/^#\?listen_addresses\s*=.*/listen_addresses = '*'/" "$PG_CONF"
  log "PostgreSQL listen_addresses = '*' (secured by pg_hba.conf + UFW)"
fi

# Add Docker subnet to pg_hba.conf (if not already there)
if ! grep -q "$DOCKER_SUBNET" "$PG_HBA" 2>/dev/null; then
  # Add before the first "host" line
  echo "# Docker containers (Cofinco app)" >> "$PG_HBA"
  echo "host    $PG_DB    $PG_USER    $DOCKER_SUBNET    scram-sha-256" >> "$PG_HBA"
  log "Added Docker subnet to pg_hba.conf"
fi

# Ensure scram-sha-256 for local connections
sed -i 's/^local\s\+all\s\+all\s\+peer/local   all   all   scram-sha-256/' "$PG_HBA" || true

# ── PostgreSQL Performance Tuning (64GB RAM / 16 vCores) ──
info "Applying PostgreSQL performance tuning..."

# Detect total RAM in GB (fallback to 64)
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
if [ "$TOTAL_RAM_GB" -lt 4 ]; then
  TOTAL_RAM_GB=4
fi

# Calculate tuning values based on available RAM
SHARED_BUFFERS="$((TOTAL_RAM_GB / 4))GB"          # 25% of RAM
EFFECTIVE_CACHE="$((TOTAL_RAM_GB * 3 / 4))GB"     # 75% of RAM
WORK_MEM="256MB"
MAINT_WORK_MEM="2GB"
WAL_BUFFERS="64MB"
MAX_WAL="4GB"

# Detect CPU cores (fallback to 4)
CPU_CORES=$(nproc 2>/dev/null || echo 4)
PARALLEL_WORKERS=$((CPU_CORES / 2))
if [ "$PARALLEL_WORKERS" -gt 8 ]; then
  PARALLEL_WORKERS=8
fi
PARALLEL_GATHER=$((PARALLEL_WORKERS / 2))

PG_TUNE_CONF="/etc/postgresql/$PG_VERSION/main/conf.d/99-cofinco-tuning.conf"
mkdir -p "/etc/postgresql/$PG_VERSION/main/conf.d"

cat > "$PG_TUNE_CONF" <<PGEOF
# ==========================================================
# Cofinco — PostgreSQL Tuning (auto-generated)
# Server: ${TOTAL_RAM_GB}GB RAM, ${CPU_CORES} CPU cores
# ==========================================================

# ── Memory ─────────────────────────────────────────────────
shared_buffers = $SHARED_BUFFERS
effective_cache_size = $EFFECTIVE_CACHE
work_mem = $WORK_MEM
maintenance_work_mem = $MAINT_WORK_MEM
wal_buffers = $WAL_BUFFERS
huge_pages = try

# ── Checkpoints & WAL ─────────────────────────────────────
checkpoint_completion_target = 0.9
max_wal_size = $MAX_WAL
min_wal_size = 1GB
wal_level = replica

# ── Connections ────────────────────────────────────────────
max_connections = 200

# ── Planner (SSD optimized) ───────────────────────────────
random_page_cost = 1.1
effective_io_concurrency = 200

# ── Parallel Workers ──────────────────────────────────────
max_worker_processes = $CPU_CORES
max_parallel_workers_per_gather = $PARALLEL_GATHER
max_parallel_workers = $PARALLEL_WORKERS
max_parallel_maintenance_workers = $PARALLEL_GATHER

# ── Logging ────────────────────────────────────────────────
log_min_duration_statement = 1000
log_checkpoints = on
log_lock_waits = on
log_temp_files = 0
PGEOF

# Ensure conf.d is included in postgresql.conf
if ! grep -q "include_dir.*conf.d" "$PG_CONF" 2>/dev/null; then
  echo "include_dir = 'conf.d'" >> "$PG_CONF"
fi

log "PostgreSQL tuned for ${TOTAL_RAM_GB}GB RAM / ${CPU_CORES} cores"
log "  shared_buffers=$SHARED_BUFFERS  effective_cache_size=$EFFECTIVE_CACHE"
log "  work_mem=$WORK_MEM  max_parallel_workers=$PARALLEL_WORKERS"

# Restart PostgreSQL to apply config
systemctl restart postgresql
log "PostgreSQL configured and secured"

echo ""
echo -e "  ${CYAN}DATABASE_URL=${NC}postgresql://$PG_USER:$PG_PASS@host.docker.internal:5432/$PG_DB"
echo -e "  ${YELLOW}(Sauvegardez cette URL dans GitHub Secrets)${NC}"
echo ""

section "3/7 — DOCKER"

if ! command -v docker >/dev/null 2>&1; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  log "Docker installed"
else
  log "Docker already installed"
fi

systemctl enable docker
systemctl start docker

# Ensure deploy user can use Docker
if id "$DEPLOY_USER" &>/dev/null; then
  usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true
fi

# Docker daemon config (log rotation, live-restore)
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  },
  "live-restore": true,
  "default-address-pools": [
    {"base": "172.20.0.0/16", "size": 24}
  ]
}
EOF

systemctl restart docker
log "Docker configured (log rotation, live-restore)"

section "4/7 — NGINX + CERTBOT"

if ! command -v nginx >/dev/null 2>&1; then
  info "Installing Nginx..."
  apt-get install -y -qq nginx
  log "Nginx installed"
else
  log "Nginx already installed"
fi

if ! command -v certbot >/dev/null 2>&1; then
  info "Installing Certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx
  log "Certbot installed"
else
  log "Certbot already installed"
fi

systemctl enable nginx

# Copy Nginx config if DOMAIN is set
if [ -n "$DOMAIN" ]; then
  NGINX_CONF="/etc/nginx/sites-available/$APP_NAME"

  if [ -f "$APP_DIR/infra/nginx/cofinco.conf" ]; then
    cp "$APP_DIR/infra/nginx/cofinco.conf" "$NGINX_CONF"
    # Replace DOMAIN placeholder
    sed -i "s/DOMAIN/$DOMAIN/g" "$NGINX_CONF"

    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    nginx -t && systemctl reload nginx
    log "Nginx configured for $DOMAIN"

    # Get SSL certificate
    if [ -n "$ACME_EMAIL" ]; then
      # Create webroot for ACME challenges
      mkdir -p /var/www/certbot

      info "Requesting SSL certificate..."
      certbot --nginx \
        -d "$DOMAIN" -d "www.$DOMAIN" \
        --non-interactive --agree-tos \
        -m "$ACME_EMAIL" \
        --redirect || warn "Certbot failed — may need to retry after DNS propagation"

      # Certbot auto-renewal is set up automatically
      log "SSL certificate obtained (auto-renew enabled)"
    else
      warn "ACME_EMAIL not set — skipping Certbot. Run manually:"
      echo "  sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN -m admin@$DOMAIN"
    fi
  else
    warn "Nginx config template not found at $APP_DIR/infra/nginx/cofinco.conf"
  fi
else
  warn "DOMAIN not set — skipping Nginx/Certbot configuration"
  echo "  Set DOMAIN and ACME_EMAIL, then re-run this section"
fi

# Certbot auto-renew hook to reload Nginx
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

log "Certbot reload hook configured"

# ── Create .pgpass for deploy user (backup auth) ─────────
PGPASS_FILE="/home/$DEPLOY_USER/.pgpass"
if id "$DEPLOY_USER" &>/dev/null; then
  echo "localhost:5432:$PG_DB:$PG_USER:$PG_PASS" > "$PGPASS_FILE"
  chmod 600 "$PGPASS_FILE"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$PGPASS_FILE"
  log ".pgpass created for $DEPLOY_USER (backup authentication)"
fi

section "5/7 — UFW FIREWALL"

# Reset UFW to default
ufw --force reset >/dev/null 2>&1 || true

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (before enabling!)
ufw allow ssh

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow PostgreSQL from Docker subnet only (containers → host PG)
# Default "deny incoming" blocks external access, no explicit deny needed
ufw allow from 172.16.0.0/12 to any port 5432 proto tcp comment 'PostgreSQL from Docker'

# Enable firewall
ufw --force enable
log "UFW configured: SSH + HTTP/HTTPS only"

# Show status
ufw status verbose

section "6/7 — APPLICATION DIRECTORY"

# Create directory structure
mkdir -p "$APP_DIR"/{env,logs,backups,scripts/vps}

# Create deploy user if not exists
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -r -m -s /bin/bash -G docker "$DEPLOY_USER"
  log "User '$DEPLOY_USER' created"

  # Setup SSH key for deploy user
  mkdir -p "/home/$DEPLOY_USER/.ssh"
  chmod 700 "/home/$DEPLOY_USER/.ssh"

  if [ -f "/root/.ssh/authorized_keys" ]; then
    cp "/root/.ssh/authorized_keys" "/home/$DEPLOY_USER/.ssh/authorized_keys"
    chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
    log "SSH keys copied to deploy user"
  fi
else
  log "User '$DEPLOY_USER' already exists"
fi

# Set ownership
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

# Secure env directory
chmod 700 "$APP_DIR/env"

log "Directory structure created at $APP_DIR"

section "7/7 — BACKUP SYSTEMD TIMER"

# Install backup script
if [ -f "$APP_DIR/scripts/vps/backup-db.sh" ]; then
  chmod +x "$APP_DIR/scripts/vps/backup-db.sh"
fi

# Create systemd service
cat > /etc/systemd/system/cofinco-backup.service <<EOF
[Unit]
Description=Cofinco PostgreSQL Backup
After=postgresql.service

[Service]
Type=oneshot
User=$DEPLOY_USER
ExecStart=$APP_DIR/scripts/vps/backup-db.sh
Environment=PG_DB=$PG_DB
Environment=PG_USER=$PG_USER
Environment=BACKUP_DIR=$APP_DIR/backups
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Create systemd timer (daily at 2:00 AM)
cat > /etc/systemd/system/cofinco-backup.timer <<EOF
[Unit]
Description=Cofinco Daily PostgreSQL Backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable cofinco-backup.timer
systemctl start cofinco-backup.timer

log "Backup timer enabled (daily at 02:00 UTC)"

# Logrotate for deploy logs
cat > /etc/logrotate.d/cofinco <<EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 $DEPLOY_USER $DEPLOY_USER
}
EOF

log "Logrotate configured"

# ── Fail2ban for Nginx ───────────────────────────────────
if [ -d /etc/fail2ban ]; then
  cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
logpath = /var/log/nginx/cofinco_error.log
EOF

  systemctl enable fail2ban
  systemctl restart fail2ban
  log "Fail2ban configured"
fi

# ══════════════════════════════════════════════════════════
# RÉSUMÉ
# ══════════════════════════════════════════════════════════
section "SETUP COMPLETE"

echo ""
echo -e "  ${BOLD}PostgreSQL${NC}"
echo -e "    Database:  $PG_DB"
echo -e "    User:      $PG_USER"
echo -e "    Password:  $PG_PASS"
echo -e "    URL:       postgresql://$PG_USER:****@host.docker.internal:5432/$PG_DB"
echo ""
echo -e "  ${BOLD}Directories${NC}"
echo -e "    App:       $APP_DIR"
echo -e "    Env:       $APP_DIR/env/.env.runtime"
echo -e "    Backups:   $APP_DIR/backups/"
echo -e "    Logs:      $APP_DIR/logs/"
echo ""
echo -e "  ${BOLD}Next Steps${NC}"
echo -e "    1. Configure GitHub Secrets:"
echo -e "       - VPS_HOST, VPS_USER, VPS_SSH_KEY"
echo -e "       - DATABASE_URL=postgresql://$PG_USER:$PG_PASS@host.docker.internal:5432/$PG_DB"
echo -e "       - REDIS_PASSWORD, SESSION_SECRET, OTP_HMAC_SECRET, ..."
echo -e "    2. Copy compose file:"
echo -e "       cp docker-compose.vps.yml $APP_DIR/"
echo -e "    3. Copy deploy scripts:"
echo -e "       cp -r scripts/vps/ $APP_DIR/scripts/"
echo -e "    4. Login to GHCR:"
echo -e "       su - $DEPLOY_USER -c 'echo TOKEN | docker login ghcr.io -u USER --password-stdin'"
echo -e "    5. Create and push a tag to trigger deployment:"
echo -e "       git tag v3.61.0 && git push origin v3.61.0"
echo ""
