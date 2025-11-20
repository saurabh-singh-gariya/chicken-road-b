#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

IP_ADDRESS="165.232.177.221"

echo -e "${GREEN}🔒 Setting up HTTPS with self-signed certificate${NC}"
echo -e "${YELLOW}⚠️  Note: Browsers will show a security warning. This is normal for self-signed certificates.${NC}"

# Step 1: Generate self-signed certificate
echo -e "${YELLOW}📦 Generating self-signed certificate...${NC}"
mkdir -p /etc/nginx/ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=ChickenRoad/CN=$IP_ADDRESS"

chmod 600 /etc/nginx/ssl/nginx-selfsigned.key
chmod 644 /etc/nginx/ssl/nginx-selfsigned.crt

echo -e "${GREEN}✅ Certificate generated${NC}"

# Step 2: Update Nginx config
echo -e "${YELLOW}📝 Updating Nginx configuration...${NC}"
cd /opt/chicken-road-b

# Create backup
cp nginx/nginx.conf nginx/nginx.conf.backup

# Update nginx config to use self-signed certificate
cat > nginx/nginx-selfsigned.conf << 'EOF'
upstream backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

# HTTP server - redirect to HTTPS
server {
    listen 80;
    server_name _;

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name _;

    # Self-signed certificate
    ssl_certificate /etc/nginx/ssl/nginx-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Main application
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # WebSocket endpoint
    location /io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://backend;
        access_log off;
    }
}
EOF

# Remove any existing configs to avoid conflicts
echo -e "${YELLOW}🧹 Cleaning up existing Nginx configs...${NC}"
rm -f /etc/nginx/sites-enabled/*
rm -f /etc/nginx/sites-available/chicken-road-backend

# Copy config to system location
mkdir -p /etc/nginx/sites-available
cp nginx/nginx-selfsigned.conf /etc/nginx/sites-available/chicken-road-backend

# Create symlink
ln -sf /etc/nginx/sites-available/chicken-road-backend /etc/nginx/sites-enabled/chicken-road-backend

# Step 3: Test and reload Nginx
echo -e "${YELLOW}🧪 Testing Nginx configuration...${NC}"
if nginx -t; then
    echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
    systemctl reload nginx
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
else
    echo -e "${RED}❌ Nginx configuration test failed!${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 HTTPS setup complete!${NC}"
echo -e "${GREEN}✅ Your backend is now available at: https://$IP_ADDRESS${NC}"
echo -e "${YELLOW}⚠️  Important:${NC}"
echo -e "   1. Browsers will show a security warning (this is normal)"
echo -e "   2. Click 'Advanced' → 'Proceed to $IP_ADDRESS (unsafe)'"
echo -e "   3. Update your frontend:"
echo -e "      VITE_API_BASE_URL=https://$IP_ADDRESS"
echo -e "      VITE_WS_BASE_URL=https://$IP_ADDRESS"
echo -e ""
echo -e "${YELLOW}💡 For production, consider getting a free domain and using Let's Encrypt${NC}"

