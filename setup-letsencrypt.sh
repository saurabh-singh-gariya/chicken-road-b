#!/bin/bash

# Let's Encrypt SSL Setup Script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Let's Encrypt SSL Setup ===${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Run with: sudo ./setup-letsencrypt.sh [domain]${NC}"
    exit 1
fi

# Get domain from argument or prompt
DOMAIN_NAME="$1"

if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${YELLOW}Prerequisites:${NC}"
    echo -e "  • Domain name with A record pointing to: $(curl -s ifconfig.me 2>/dev/null || echo '165.232.177.221')"
    echo ""
    read -p "Enter domain name (e.g., api.yourdomain.com): " DOMAIN_NAME
fi

if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${RED}❌ Domain name required${NC}"
    echo -e "${YELLOW}Usage: sudo ./setup-letsencrypt.sh api.yourdomain.com${NC}"
    exit 1
fi

# Verify DNS
echo -e "${YELLOW}Checking DNS...${NC}"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "165.232.177.221")
DNS_IP=$(dig +short $DOMAIN_NAME 2>/dev/null | tail -n1)

if [ "$DNS_IP" != "$SERVER_IP" ]; then
    echo -e "${RED}❌ DNS mismatch!${NC}"
    echo -e "   Server: $SERVER_IP"
    echo -e "   DNS:    $DNS_IP"
    echo -e "${YELLOW}   Update DNS A record first${NC}"
    exit 1
fi

echo -e "${GREEN}✅ DNS OK${NC}"

# Install certbot
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing certbot...${NC}"
    apt-get update -qq
    apt-get install -y certbot python3-certbot-nginx > /dev/null 2>&1
fi

# Backup current config
BACKUP_DIR="/etc/nginx/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
[ -f /etc/nginx/sites-available/chicken-road-backend ] && \
    cp /etc/nginx/sites-available/chicken-road-backend "$BACKUP_DIR/"

# Prepare for ACME challenge
mkdir -p /var/www/html
cat > /etc/nginx/sites-available/chicken-road-backend << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF

rm -f /etc/nginx/sites-enabled/chicken-road-backend
ln -sf /etc/nginx/sites-available/chicken-road-backend /etc/nginx/sites-enabled/chicken-road-backend
nginx -t > /dev/null && systemctl reload nginx > /dev/null

# Get certificate
echo -e "${YELLOW}Getting certificate...${NC}"
certbot certonly --webroot -w /var/www/html -d $DOMAIN_NAME \
    --non-interactive --agree-tos --email admin@$DOMAIN_NAME 2>&1 | grep -v "^$" || {
    echo -e "${RED}❌ Certificate failed${NC}"
    [ -f "$BACKUP_DIR/chicken-road-backend" ] && \
        cp "$BACKUP_DIR/chicken-road-backend" /etc/nginx/sites-available/chicken-road-backend && \
        systemctl reload nginx
    exit 1
}

echo -e "${GREEN}✅ Certificate obtained${NC}"

# Update nginx config
echo -e "${YELLOW}Configuring nginx...${NC}"

cat > /etc/nginx/sites-available/chicken-road-backend << EOF
upstream backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

# HTTP server - redirect to HTTPS
server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;

    # Let's Encrypt certificates
    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;

    # SSL Configuration - Modern and secure
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;

    # Main application
    location / {
        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, Accept, Origin, X-Requested-With' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Max-Age' '86400' always;

        # Handle CORS preflight
        if (\$request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, Accept, Origin, X-Requested-With' always;
            add_header 'Access-Control-Allow-Credentials' 'true' always;
            add_header 'Access-Control-Max-Age' '86400' always;
            add_header 'Content-Type' 'text/plain charset=UTF-8' always;
            add_header 'Content-Length' '0' always;
            return 204;
        }

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 86400;
        proxy_buffering off;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket endpoint
    location /io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
        proxy_buffering off;
        proxy_cache off;
    }

    # Health check
    location /health {
        proxy_pass http://backend;
        access_log off;
    }
}

map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}
EOF

nginx -t > /dev/null && systemctl reload nginx > /dev/null

# Auto-renewal
(crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab - > /dev/null 2>&1

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo -e "${GREEN}✅ https://$DOMAIN_NAME${NC}"
echo -e "${GREEN}✅ Auto-renewal configured${NC}"
echo ""
echo -e "${YELLOW}Update frontend:${NC}"
echo -e "  VITE_API_BASE_URL=https://$DOMAIN_NAME"
echo -e "  VITE_WS_BASE_URL=https://$DOMAIN_NAME"
echo ""

