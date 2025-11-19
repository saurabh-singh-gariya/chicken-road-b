#!/bin/bash

set -e

echo "🚀 Starting deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ Error: .env.production file not found!${NC}"
    echo -e "${YELLOW}📝 Please create .env.production file with your configuration.${NC}"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Error: Docker is not installed!${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Error: Docker Compose is not installed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker compose -f docker-compose.prod.yml down || true

# Build and start services
echo -e "${YELLOW}🔨 Building and starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d --build

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Check if app is running
if docker ps | grep -q chicken-road-backend; then
    echo -e "${GREEN}✅ Application is running!${NC}"
    echo -e "${GREEN}📊 Container status:${NC}"
    docker compose -f docker-compose.prod.yml ps
else
    echo -e "${RED}❌ Error: Application failed to start!${NC}"
    echo -e "${YELLOW}📋 Checking logs...${NC}"
    docker compose -f docker-compose.prod.yml logs app
    exit 1
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${YELLOW}📝 To view logs: docker compose -f docker-compose.prod.yml logs -f app${NC}"
echo -e "${YELLOW}🛑 To stop: docker compose -f docker-compose.prod.yml down${NC}"

