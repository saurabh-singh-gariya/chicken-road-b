#!/usr/bin/env bash
# Idempotent, parameterized deployment script for Chicken Road Backend (Ubuntu)
# Supports: PM2 or systemd, optional one-time DB synchronize, SSL issuance, custom domain/user.
set -euo pipefail

DEFAULT_APP_USER="deploy"
REPO_SSH="git@github.com:saurabh-singh-gariya/chicken-road-b.git"
DOMAIN="_"                  # default IP-only; override with --domain for real host
NODE_MAJOR=20               # override with --node-major
DB_NAME="chickenroad"       # override with --db-name
DB_USER="chicken"           # override with --db-user
DB_PASS="StrongPass123!"    # override with --db-pass
JWT_SECRET=""               # auto-generate if empty
EMAIL=""                   # used for certbot if --issue-ssl
USE_SYSTEMD=false           # if true, skip PM2 and create systemd unit
ENABLE_SYNC_ONCE=false      # if true, set DB_SYNCHRONIZE=true initially
ISSUE_SSL=false             # if true, run certbot (needs DOMAIN + EMAIL)
SKIP_MYSQL_SECURE=false     # if true, skip mysql_secure_installation
SKIP_FIREWALL=false         # if true, do not configure ufw
DRY_RUN=false               # if true, only print planned actions

COLOR_INFO="\e[34m"
COLOR_WARN="\e[33m"
COLOR_ERR="\e[31m"
COLOR_OK="\e[32m"
COLOR_RESET="\e[0m"

log() { echo -e "${COLOR_INFO}[INFO]${COLOR_RESET} $1"; }
warn() { echo -e "${COLOR_WARN}[WARN]${COLOR_RESET} $1"; }
err() { echo -e "${COLOR_ERR}[ERROR]${COLOR_RESET} $1"; }
ok() { echo -e "${COLOR_OK}[OK]${COLOR_RESET} $1"; }

usage() {
  cat <<USAGE
Chicken Road Backend deployment script.

Usage: sudo bash setup.sh [options]
  --domain DOMAIN              Set public domain (default: ${DOMAIN})
  --app-user USER              Deployment user (default: ${DEFAULT_APP_USER})
  --db-name NAME               MySQL database name (default: ${DB_NAME})
  --db-user USER               MySQL user (default: ${DB_USER})
  --db-pass PASS               MySQL password (default: ${DB_PASS})
  --node-major N               Node.js major version (default: ${NODE_MAJOR})
  --jwt-secret SECRET          Provide JWT secret (auto if omitted)
  --email EMAIL                Email for SSL cert
  --issue-ssl                  Obtain Let's Encrypt cert (requires domain + email)
  --systemd                    Use systemd service instead of PM2
  --enable-sync-once           Start with DB_SYNCHRONIZE=true (remember to disable later)
  --skip-mysql-secure          Skip interactive mysql_secure_installation
  --skip-firewall              Skip ufw configuration
  --dry-run                    Show actions without executing
  -h | --help                  Show this help

Examples:
  sudo bash setup.sh --domain api.example.com --email admin@example.com --issue-ssl --enable-sync-once
USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain) DOMAIN="$2"; shift 2;;
      --app-user) DEFAULT_APP_USER="$2"; shift 2;;
      --db-name) DB_NAME="$2"; shift 2;;
      --db-user) DB_USER="$2"; shift 2;;
      --db-pass) DB_PASS="$2"; shift 2;;
      --node-major) NODE_MAJOR="$2"; shift 2;;
      --jwt-secret) JWT_SECRET="$2"; shift 2;;
      --email) EMAIL="$2"; shift 2;;
      --issue-ssl) ISSUE_SSL=true; shift;;
      --systemd) USE_SYSTEMD=true; shift;;
      --enable-sync-once) ENABLE_SYNC_ONCE=true; shift;;
      --skip-mysql-secure) SKIP_MYSQL_SECURE=true; shift;;
      --skip-firewall) SKIP_FIREWALL=true; shift;;
      --dry-run) DRY_RUN=true; shift;;
      -h|--help) usage; exit 0;;
      *) err "Unknown option: $1"; usage; exit 1;;
    esac
  done
}

parse_args "$@"

if [[ $EUID -ne 0 ]]; then
  err "Run as root (sudo)."; exit 1
fi

APP_USER="$DEFAULT_APP_USER"
APP_DIR="/home/${APP_USER}/chicken-road-b/chicken-road-backend"
[[ -z "$JWT_SECRET" ]] && JWT_SECRET=$(openssl rand -hex 48)

summary_file="/var/log/chicken-road-deploy-summary.txt"
touch "$summary_file" || true

action() {
  local desc="$1"; shift
  if $DRY_RUN; then
    echo "[DRY-RUN] $desc -> $*" >> "$summary_file"
    log "(dry-run) $desc"
  else
    log "$desc"; "$@"
  fi
}

write_summary() {
  {
    echo "Date: $(date -Iseconds)"
    echo "Domain: $DOMAIN"
    echo "App User: $APP_USER"
    echo "Node Major: $NODE_MAJOR"
    echo "MySQL DB/User: $DB_NAME / $DB_USER"
    echo "Systemd: $USE_SYSTEMD"
    echo "One-time synchronize: $ENABLE_SYNC_ONCE"
    echo "SSL requested: $ISSUE_SSL"
  } >> "$summary_file"
}

ensure_user() {
  if id -u "$APP_USER" >/dev/null 2>&1; then
    ok "User $APP_USER exists"
  else
    action "Creating deploy user $APP_USER" adduser --disabled-password --gecos "Deploy User" "$APP_USER"
    action "Adding $APP_USER to sudo" usermod -aG sudo "$APP_USER"
  fi
  mkdir -p "/home/${APP_USER}/.ssh"
  chmod 700 "/home/${APP_USER}/.ssh"
  chown -R ${APP_USER}:${APP_USER} "/home/${APP_USER}/.ssh"
  if [[ ! -f "/home/${APP_USER}/.ssh/authorized_keys" || ! -s "/home/${APP_USER}/.ssh/authorized_keys" ]]; then
    warn "No SSH authorized_keys for $APP_USER yet. Add one BEFORE git clone if using SSH auth."
  fi
}

install_base_packages() {
  action "Updating apt indices" apt update
  action "Upgrading packages" apt -y upgrade
  action "Installing core packages" apt install -y curl git build-essential mysql-server redis-server nginx certbot python3-certbot-nginx
}

secure_mysql() {
  if $SKIP_MYSQL_SECURE; then
    warn "Skipping mysql_secure_installation per flag"
  else
    log "Securing MySQL (interactive)"; mysql_secure_installation || warn "mysql_secure_installation exited non-zero"
  fi
}

ensure_mysql_db_user() {
  mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME}; CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}'; GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;"
  ok "MySQL database/user ensured"
}

configure_redis() {
  if ! grep -q 'supervised systemd' /etc/redis/redis.conf; then
    sed -i 's/^# *supervised no/supervised systemd/' /etc/redis/redis.conf || true
  fi
  systemctl enable --now redis-server
  ok "Redis enabled"
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    log "Node present: $(node -v)"
  else
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt install -y nodejs
    ok "Installed Node $(node -v)"
  fi
}

clone_or_update_repo() {
  if [[ ! -d "/home/${APP_USER}/chicken-road-b/.git" ]]; then
    sudo -u "$APP_USER" git clone "$REPO_SSH" "/home/${APP_USER}/chicken-road-b"
    ok "Repository cloned"
  else
    sudo -u "$APP_USER" git -C "/home/${APP_USER}/chicken-road-b" pull --ff-only
    ok "Repository updated"
  fi
}

write_env_file() {
  local sync_value=false
  $ENABLE_SYNC_ONCE && sync_value=true
  cat > "${APP_DIR}/.env" <<EOF
APP_PORT=3000
APP_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_DATABASE=${DB_NAME}
DB_SYNCHRONIZE=${sync_value}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES=1h
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
EOF
  chown ${APP_USER}:${APP_USER} "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  ok ".env written (DB_SYNCHRONIZE=${sync_value})"
  if $ENABLE_SYNC_ONCE; then
    warn "Remember to change DB_SYNCHRONIZE=false after initial tables are created."
  fi
}

install_npm_deps_build() {
  cd "$APP_DIR"
  sudo -u "$APP_USER" npm ci
  sudo -u "$APP_USER" npm run build
  ok "Dependencies installed & app built"
}

setup_pm2() {
  npm install -g pm2
  sudo -u "$APP_USER" pm2 start dist/main.js --name chicken-road-api || true
  sudo -u "$APP_USER" pm2 save || true
  pm2 startup systemd -u "$APP_USER" --hp "/home/${APP_USER}" || true
  ok "PM2 configured"
}

setup_systemd_unit() {
  local unit_file="/etc/systemd/system/chicken-road-api.service"
  cat > "$unit_file" <<UNIT
[Unit]
Description=Chicken Road NestJS API
After=network.target redis-server.service mysql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now chicken-road-api
  ok "Systemd service enabled (chicken-road-api)"
}

setup_nginx() {
  local listen_directive="listen 80;"
  local server_name_directive="server_name ${DOMAIN};"
  if [[ "$DOMAIN" == "_" || -z "$DOMAIN" ]]; then
    listen_directive="listen 80 default_server;"
    server_name_directive="server_name _;"
  fi
  cat > /etc/nginx/sites-available/chicken-road <<NGINX
server {
    ${listen_directive}
    ${server_name_directive}

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    location /game {
        proxy_pass http://127.0.0.1:3000/game;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/chicken-road /etc/nginx/sites-enabled/chicken-road
  nginx -t && systemctl reload nginx
  ok "Nginx reverse proxy configured for ${DOMAIN}"
}

obtain_ssl() {
  if $ISSUE_SSL; then
    if [[ -z "$DOMAIN" || -z "$EMAIL" || "$DOMAIN" == "api.example.com" ]]; then
      warn "Skipping SSL issuance: provide real --domain and --email"
    else
      certbot --nginx -d "$DOMAIN" --redirect --email "$EMAIL" --agree-tos --no-eff-email || warn "certbot failed"
      ok "SSL attempted for $DOMAIN"
    fi
  fi
}

configure_firewall() {
  if $SKIP_FIREWALL; then
    warn "Skipping firewall configuration as requested"
    return
  fi
  if ! command -v ufw >/dev/null 2>&1; then
    apt install -y ufw
  fi
  ufw allow OpenSSH || true
  ufw allow 80 || true
  ufw allow 443 || true
  ufw --force enable || true
  ok "Firewall rules applied (22,80,443)"
}

main() {
  write_summary
  install_base_packages
  secure_mysql
  ensure_mysql_db_user
  configure_redis
  install_node
  ensure_user
  clone_or_update_repo
  mkdir -p "$APP_DIR"
  write_env_file
  install_npm_deps_build
  if $USE_SYSTEMD; then
    setup_systemd_unit
  else
    setup_pm2
  fi
  setup_nginx
  obtain_ssl
  configure_firewall
  ok "Deployment complete. Test: curl -I http://$DOMAIN or server IP."
  log "Summary stored at $summary_file"
}

if $DRY_RUN; then
  log "Dry run enabled; showing planned actions only"
fi

main

# End of script
