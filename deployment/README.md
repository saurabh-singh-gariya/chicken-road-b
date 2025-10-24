# Chicken Road Backend Deployment Guide (Ubuntu, IP only)

Public IPv4: 139.59.57.153
Repository (SSH): git@github.com:saurabh-singh-gariya/chicken-road-b.git

## Overview

Deploy the NestJS backend (MySQL, Redis, Socket.IO gateway `namespace: game`) behind Nginx on port 80 using PM2 as a process manager. Initial schema uses TypeORM `synchronize=true` then flips to `false` automatically. All services bound to localhost except Nginx. No domain or SSL yet.

If you previously attempted installs on the droplet and they partially failed, see the "Fresh Start Cleanup" section before proceeding.

## Pre-req

1. Fresh Ubuntu (22.04/24.04) droplet accessible via root SSH.
2. GitHub repository accessible with SSH key.
3. Decide strong JWT secret (we will generate 64 hex bytes).
4. MySQL credentials: user `chicken`, password `StrongPass123!` (Consider strengthening later—kept as per user confirmation).
5. Redis: no password (local only). Can add later.

## Step-by-step (Manual Reference)

Order for manual execution (script automates these):

1. Update & upgrade packages.
2. Create non-root `deploy` user & add sudo.
3. Generate ed25519 SSH key, add to GitHub.
4. Install system packages: git, build-essential, ufw, nginx, mysql-server, redis-server.
5. Bind MySQL & Redis to 127.0.0.1.
6. Create database & grant privileges.
7. Install Node.js 20.x & PM2.
8. Clone repo (or pull if exists).
9. Create `.env` with `DB_SYNCHRONIZE=true` first run; generate JWT secret.
10. Build (`npm ci` then `npm run build`).
11. Start PM2 & register startup.
12. Configure Nginx reverse proxy for IP only.
13. Enable UFW (allow 22 & 80).
14. Auto flip `DB_SYNCHRONIZE=false` after tables detected.
15. Smoke tests (HTTP + WebSocket).

### Fresh Start Cleanup (Run BEFORE main steps if prior attempts failed)

These commands aim to recover a droplet with half-done installs. They avoid dropping MySQL data unless you explicitly remove the database.

```bash
# Stop any lingering processes
pm2 delete all || true
pkill node || true

# Remove broken Node.js (optional)
apt-get remove -y nodejs npm || true
rm -rf /usr/local/lib/node_modules || true
rm -rf /root/.nvm || true

# Apt cleanup
apt-get update -y
apt-get autoremove -y
apt-get autoclean -y
apt-get -f install -y

# Ensure services running (won't purge data)
systemctl enable mysql || true
systemctl enable redis-server || true
systemctl start mysql || true
systemctl start redis-server || true
systemctl status mysql --no-pager
systemctl status redis-server --no-pager

# Stop nginx if misconfigured (we'll rewrite config later)
systemctl stop nginx || true

# Optional: remove previous app directory for a clean clone
rm -rf /home/deploy/chicken-road-b || true

# Check disk space
df -h
```

If MySQL root login fails, reset root password:

```bash
sudo mysqld_safe --skip-grant-tables &
sleep 5
mysql -uroot -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'NewRootPass!'; FLUSH PRIVILEGES;"
kill %1
systemctl restart mysql
```

## Automated Deployment Script

Run as root on the fresh droplet (idempotent). Safe to re-run; it will not drop data.

```bash
#!/usr/bin/env bash
set -euo pipefail

IP="139.59.57.153"
REPO_SSH="git@github.com:saurabh-singh-gariya/chicken-road-b.git"
APP_DIR="/home/deploy/chicken-road-b/chicken-road-backend"
ENV_FILE="$APP_DIR/.env"
DB_NAME="chickenroad"
DB_USER="chicken"
DB_PASS="StrongPass123!" # Consider rotating to a stronger secret later
JWT_LEN=64

log() { echo "[+] $*"; }
warn() { echo "[!] $*"; }

require_root() { if [ "$(id -u)" -ne 0 ]; then echo "Run as root"; exit 1; fi; }
require_root

log "Updating system packages"
apt-get update -y && apt-get upgrade -y

log "Creating deploy user if missing"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy || true

log "Ensuring deploy .ssh directory"
sudo -u deploy mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh

if [ ! -f /home/deploy/.ssh/id_ed25519 ]; then
    log "Generating ed25519 SSH key (no passphrase)"
    sudo -u deploy ssh-keygen -t ed25519 -C "deploy@$IP" -f /home/deploy/.ssh/id_ed25519 -N ""
    warn "ADD THIS PUBLIC KEY TO GITHUB NOW:"
    cat /home/deploy/.ssh/id_ed25519.pub
fi

log "Installing base packages"
DEBIAN_FRONTEND=noninteractive apt-get install -y git build-essential ufw nginx mysql-server redis-server curl

log "Securing MySQL bind-address"
MYSQL_CNF="/etc/mysql/mysql.conf.d/mysqld.cnf"
if grep -q "^bind-address" "$MYSQL_CNF"; then
    sed -i "s/^bind-address.*/bind-address = 127.0.0.1/" "$MYSQL_CNF"
else
    echo "bind-address = 127.0.0.1" >> "$MYSQL_CNF"
fi
systemctl restart mysql

log "Securing Redis (bind + protected-mode)"
REDIS_CONF="/etc/redis/redis.conf"
sed -i "s/^#*bind .*/bind 127.0.0.1/" "$REDIS_CONF"
sed -i "s/^#*protected-mode .*/protected-mode yes/" "$REDIS_CONF"
systemctl restart redis-server

log "Create DB and user if missing"
mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

log "Install Node.js 20.x if not present"
if ! command -v node >/dev/null || ! node -v | grep -q '^v20'; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

log "Install PM2 globally"
npm install -g pm2@latest

log "Clone or update repository"
if [ ! -d /home/deploy/chicken-road-b/.git ]; then
    sudo -u deploy git clone "$REPO_SSH" /home/deploy/chicken-road-b
else
    sudo -u deploy git -C /home/deploy/chicken-road-b fetch --all --prune
    sudo -u deploy git -C /home/deploy/chicken-road-b reset --hard origin/main
fi

log "Install dependencies (production only)"
cd "$APP_DIR"
if [ -f package-lock.json ]; then
    sudo -u deploy npm ci --omit=dev
else
    sudo -u deploy npm install --omit=dev
fi

log "Generate JWT secret if missing"
if [ ! -f "$ENV_FILE" ]; then
    JWT_SECRET=$(openssl rand -hex $JWT_LEN)
else
    # Attempt to read existing JWT secret
    JWT_SECRET=$(grep -E '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)
    if [ -z "$JWT_SECRET" ]; then JWT_SECRET=$(openssl rand -hex $JWT_LEN); fi
fi

log "Create or update .env"
if [ ! -f "$ENV_FILE" ]; then
cat > "$ENV_FILE" <<EOF
APP_PORT=3000
APP_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASS
DB_DATABASE=$DB_NAME
DB_SYNCHRONIZE=true
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES=1h
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
EOF
else
    # Ensure critical keys exist (do not overwrite DB_SYNCHRONIZE if already false)
    grep -q '^APP_PORT=' "$ENV_FILE" || echo 'APP_PORT=3000' >> "$ENV_FILE"
    grep -q '^APP_ENV=' "$ENV_FILE" || echo 'APP_ENV=production' >> "$ENV_FILE"
    grep -q '^DB_HOST=' "$ENV_FILE" || echo 'DB_HOST=localhost' >> "$ENV_FILE"
    grep -q '^DB_PORT=' "$ENV_FILE" || echo 'DB_PORT=3306' >> "$ENV_FILE"
    grep -q '^DB_USERNAME=' "$ENV_FILE" || echo "DB_USERNAME=$DB_USER" >> "$ENV_FILE"
    grep -q '^DB_PASSWORD=' "$ENV_FILE" || echo "DB_PASSWORD=$DB_PASS" >> "$ENV_FILE"
    grep -q '^DB_DATABASE=' "$ENV_FILE" || echo "DB_DATABASE=$DB_NAME" >> "$ENV_FILE"
    grep -q '^JWT_SECRET=' "$ENV_FILE" || echo "JWT_SECRET=$JWT_SECRET" >> "$ENV_FILE"
    grep -q '^JWT_EXPIRES=' "$ENV_FILE" || echo 'JWT_EXPIRES=1h' >> "$ENV_FILE"
    grep -q '^REDIS_HOST=' "$ENV_FILE" || echo 'REDIS_HOST=127.0.0.1' >> "$ENV_FILE"
    grep -q '^REDIS_PORT=' "$ENV_FILE" || echo 'REDIS_PORT=6379' >> "$ENV_FILE"
    grep -q '^REDIS_PASSWORD=' "$ENV_FILE" || echo 'REDIS_PASSWORD=' >> "$ENV_FILE"
fi

log "Build application"
sudo -u deploy npm run build

log "Start (or restart) PM2 process"
if pm2 list | grep -q 'chicken-road-api'; then
    pm2 restart chicken-road-api
else
    pm2 start dist/main.js --name chicken-road-api
fi
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy | sed -n 's/^.*PM2 home.*$//p' >/dev/null 2>&1 || true
PM2_CMD=$(pm2 startup systemd -u deploy --hp /home/deploy | grep 'sudo' || true)
if [ -n "$PM2_CMD" ]; then eval $PM2_CMD; fi
pm2 save

log "Configure Nginx reverse proxy"
NGINX_DEFAULT="/etc/nginx/sites-available/default"
cat > "$NGINX_DEFAULT" <<NGINX
server {
        listen 80 default_server;
        server_name $IP;
        location / {
                proxy_pass http://127.0.0.1:3000/;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection "upgrade";
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
}
NGINX
nginx -t && systemctl reload nginx

log "Configure UFW firewall"
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw default deny incoming || true
ufw default allow outgoing || true
echo "y" | ufw enable || true
ufw status

log "Auto-toggle DB_SYNCHRONIZE if schema exists"
TABLE_COUNT=$(mysql -u "$DB_USER" -p"$DB_PASS" -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME';") || TABLE_COUNT=0
if grep -q '^DB_SYNCHRONIZE=true' "$ENV_FILE" && [ "$TABLE_COUNT" -gt 0 ]; then
    sed -i "s/^DB_SYNCHRONIZE=true/DB_SYNCHRONIZE=false/" "$ENV_FILE"
    log "DB_SYNCHRONIZE set to false (tables detected: $TABLE_COUNT)"
    pm2 restart chicken-road-api
fi

log "Deployment complete"
echo "Node version: $(node -v)"
echo "PM2 list:"; pm2 list
echo "Curl test:"; curl -I http://$IP || true
echo "MySQL tables:"; mysql -u "$DB_USER" -p"$DB_PASS" -e "USE $DB_NAME; SHOW TABLES;" || true
```

## Verification Commands

```bash
node -v
npm -v
mysql -u chicken -pStrongPass123! -e "SHOW DATABASES;"
mysql -u chicken -pStrongPass123! -e "USE chickenroad; SHOW TABLES;"
redis-cli PING
pm2 list
pm2 logs chicken-road-api --lines 50
curl -I http://139.59.57.153
ss -tnlp | grep ':3000'
ss -tnlp | grep ':80'
nginx -t
```

## Smoke Test (WebSocket)

Create `smoke-ws-test.js` locally or on server (needs a valid JWT token from your login flow):

```javascript
// smoke-ws-test.js
const { io } = require('socket.io-client');
const TOKEN = 'REPLACE_WITH_JWT';
const URL = 'http://139.59.57.153/game';
const socket = io(URL, {
  extraHeaders: { Authorization: `Bearer ${TOKEN}` },
  reconnectionAttempts: 2,
  timeout: 5000,
});
socket.on('connect', () => console.log('Connected', socket.id));
socket.on('betConfig', (cfg) => {
  console.log('Bet config', cfg);
  socket.emit('game-service', {
    action: 'BET',
    payload: { betAmount: 500, difficulty: 1 },
  });
});
socket.on('game-service', (data) => {
  console.log('Response', data);
  socket.close();
});
socket.on('connect_error', (err) =>
  console.error('Connect error', err.message),
);
socket.on('disconnect', (r) => console.log('Disconnected', r));
```

Run:

```bash
npm install socket.io-client
node smoke-ws-test.js
```

## Post-deploy Changes

1. Confirm `.env` now has `DB_SYNCHRONIZE=false`.
2. Rotate DB password & JWT secret at your next security review.
3. Consider adding Redis password and updating `.env` + redis.conf (`requirepass`).
4. Enable log rotation (logrotate for `/home/deploy/.pm2/logs`).
5. Optional: disable root SSH (`PermitRootLogin prohibit-password`) and enforce key-only auth.

## Security Hardening Checklist

- Local-only MySQL & Redis bindings.
- Non-root deploy user.
- UFW limits inbound to 22, 80.
- Long random JWT secret generated (64 hex bytes).
- DB user scoped to one schema.
- Synchronize disabled after first run.
- Nginx reverse proxy only (no direct port 3000 exposure externally).
- Optional enhancements: fail2ban, SSH banner, automated backups.

### Additional Hardening Details

1. Fail2ban:
   ```bash
   apt-get install -y fail2ban
   cat >/etc/fail2ban/jail.d/sshd.local <<EOF
   [sshd]
   enabled = true
   port = 22
   filter = sshd
   logpath = /var/log/auth.log
   maxretry = 5
   bantime = 3600
   EOF
   systemctl restart fail2ban
   fail2ban-client status sshd
   ```
2. SSH hardening (`/etc/ssh/sshd_config`):
   - `PermitRootLogin prohibit-password`
   - `PasswordAuthentication no` (after confirming key-only access works)
   - `ClientAliveInterval 300`
   - `ClientAliveCountMax 2`
     Then: `systemctl reload sshd`.
3. Redis password: add `requirepass <strongpass>` to `/etc/redis/redis.conf`, restart and add `REDIS_PASSWORD` to `.env`.
4. PM2 log rotation:
   ```bash
   cat >/etc/logrotate.d/pm2-deploy <<EOF
   /home/deploy/.pm2/logs/*.log {
        daily
        rotate 14
        compress
        missingok
        notifempty
        copytruncate
   }
   EOF
   logrotate -f /etc/logrotate.d/pm2-deploy || true
   ```
5. Dependency audit:
   ```bash
   cd /home/deploy/chicken-road-b/chicken-road-backend
   npm audit --production
   ```
6. Automatic security updates:
   ```bash
   apt-get install -y unattended-upgrades
   dpkg-reconfigure -plow unattended-upgrades
   ```

### Backup Strategy (Basic)

- Nightly MySQL dump cron:
  ```bash
  mkdir -p /home/deploy/backups
  crontab -u deploy -l | { cat; echo "0 2 * * * mysqldump -u chicken -p'StrongPass123!' chickenroad | gzip > /home/deploy/backups/chickenroad-\$(date +\%F).sql.gz"; } | crontab -u deploy -
  ```
- Redis persistence: ensure `save` directives in `/etc/redis/redis.conf`.
- Off-site copy (rsync / scp to object storage) weekly.

### Scaling Considerations

- PM2 cluster mode: `pm2 start dist/main.js -i max` (ensure statelessness, use Redis).
- Move DB & Redis to managed services for HA.
- Add health endpoint for LB checks.
- Implement horizontal scaling only after metrics instrumentation.

### Observability Enhancements

- Structured logging (JSON) + ship with Fluent Bit / Vector.
- Metrics via Prometheus exporter (`@willsoto/nestjs-prometheus`).
- Error tracing: Sentry or OpenTelemetry collector.

### Docker Alternative

Dockerfile example:

```Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### Terraform / IaC Idea

Use Terraform to provision droplet, firewall rules, and DNS. Embed cloud-init user-data executing the deployment script for reproducible environments.

---

Extended guidance appended on: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Future: Domain + SSL

When adding a domain:

1. Point DNS A record to 139.59.57.153.
2. Edit Nginx `server_name yourdomain.com www.yourdomain.com;`.
3. Install certbot: `apt-get install -y certbot python3-certbot-nginx`.
4. Run: `certbot --nginx -d yourdomain.com -d www.yourdomain.com --redirect`.
5. Test renewal: `certbot renew --dry-run`.

## Future: TypeORM Migrations

1. Add a data source file (e.g. `src/data-source.ts`) configured for migrations.
2. Generate initial migration: `npx typeorm migration:generate src/migrations/InitSchema -d src/data-source.ts`.
3. Set `DB_SYNCHRONIZE=false` permanently.
4. Apply migrations: `npx typeorm migration:run`.
5. CI/CD uses migrations instead of synchronize to evolve schema.

## Future: CI/CD (High-Level)

- GitHub Actions workflow on push to `main`.
- Steps: checkout -> setup Node -> npm ci -> npm run build -> scp artifact or direct SSH to run a mini deploy script (git pull, npm ci, build, pm2 restart).
- Store secrets (SSH key, JWT secret) in GitHub Actions secrets.

## Acceptance Checklist

- [ ] System updated
- [ ] Deploy user created & SSH key added to GitHub
- [ ] Repo cloned/pulled
- [ ] MySQL DB & user exist
- [ ] Redis running local only
- [ ] `.env` created
- [ ] Dependencies installed (npm ci)
- [ ] Build produced `dist/main.js`
- [ ] PM2 process online
- [ ] Nginx proxy serving on 80 (HTTP reachable)
- [ ] Firewall active (only 22,80 open)
- [ ] Tables created & `DB_SYNCHRONIZE=false`
- [ ] WebSocket smoke test succeeded
- [ ] JWT secret length >= 64 hex bytes
- [ ] Logs reviewed (no critical errors)
- [ ] Security hardening reviewed
- [ ] Plan for migrations & SSL noted

---

Deployment guide generated on: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
