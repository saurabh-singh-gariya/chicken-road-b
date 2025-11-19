# Docker Setup Guide

## Prerequisites

1. Docker Desktop installed and running
2. MySQL and Redis running on your host machine (or in separate Docker containers)
3. `.env.local` file in the `chicken-road-b/` directory (see setup below)

## Environment Variables Setup

1. **Copy the example file:**
   ```bash
   cd chicken-road-b
   cp env.local.example .env.local
   ```

2. **Edit `.env.local` with your actual values:**
   - Update `DB_PASSWORD` with your MySQL password
   - Update `JWT_SECRET` with a strong random secret (generate with: `openssl rand -hex 64`)
   - Adjust `DB_HOST` and `REDIS_HOST` if needed (use `host.docker.internal` for Windows/Mac, or `172.17.0.1` for Linux)

3. **Important:** Never commit `.env.local` to version control! It's already in `.gitignore`.

## ⚠️ CRITICAL: Update Your .env.local File for Docker

If MySQL and Redis are running on your **host machine** (not in Docker), you **MUST** update your `.env.local` file to use `host.docker.internal`:

### For Windows/Mac:
```env
DB_HOST=host.docker.internal
REDIS_HOST=host.docker.internal
```

**IMPORTANT:** If you see `connect ECONNREFUSED 127.0.0.1:6379` errors in Docker logs, it means your `.env.local` file still has `REDIS_HOST=127.0.0.1` or `REDIS_HOST=localhost`. Change it to `REDIS_HOST=host.docker.internal`!

### For Linux:
```env
DB_HOST=172.17.0.1
REDIS_HOST=172.17.0.1
```

Or use your host machine's IP address.

### Complete .env.local Example:
```env
APP_PORT=3000
APP_ENV=production
ENABLE_AUTH=true
DB_HOST=host.docker.internal
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=chickenroad
DB_SYNCHRONIZE=true
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES=1h
REDIS_HOST=host.docker.internal
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Running with Docker

### Build and Start:
```bash
cd chicken-road-b
docker compose up --build
```

### Start in Detached Mode (Background):
```bash
docker compose up -d --build
```

### View Logs:
```bash
docker compose logs -f app
```

### Stop:
```bash
docker compose down
```

### Rebuild After Code Changes:
```bash
docker compose up --build
```

## Troubleshooting

### Connection Refused to MySQL/Redis
- Ensure MySQL and Redis are running on your host machine
- Verify `.env` has correct `DB_HOST` and `REDIS_HOST` (use `host.docker.internal` for Windows/Mac)
- Check firewall settings

### Port Already in Use
- Stop any running instances: `docker compose down`
- Check if port 3000 is used: `netstat -ano | findstr :3000` (Windows) or `lsof -i :3000` (Mac/Linux)

### Container Keeps Restarting
- Check logs: `docker compose logs app`
- Verify all required environment variables are set in `.env`
- Ensure database exists and is accessible

### Build Fails
- Clear Docker cache: `docker compose build --no-cache`
- Check Docker has enough resources allocated

## Alternative: Run MySQL and Redis in Docker

If you want to run everything in Docker, you can add MySQL and Redis services to `docker-compose.yml`:

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: your_password
      MYSQL_DATABASE: chickenroad
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  app:
    # ... existing app config ...
    depends_on:
      - mysql
      - redis
    environment:
      DB_HOST: mysql
      REDIS_HOST: redis

volumes:
  mysql_data:
```

Then update your `.env` to use service names instead of `host.docker.internal`.

