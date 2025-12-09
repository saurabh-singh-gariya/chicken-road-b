# Configuration & Infrastructure Documentation

## Table of Contents
1. [Environment Variables](#environment-variables)
2. [Configuration Modules](#configuration-modules)
3. [Database Configuration](#database-configuration)
4. [Redis Configuration](#redis-configuration)
5. [Logging Strategy](#logging-strategy)
6. [Application Startup](#application-startup)
7. [Cron Jobs & Schedulers](#cron-jobs--schedulers)

---

## Environment Variables

### Application Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | `3000` | Application port |
| `APP_ENV` | `production` | Environment name |
| `ENABLE_AUTH` | `true` | Enable authentication guards |

### Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USERNAME` | `root` | MySQL username |
| `DB_PASSWORD` | `` | MySQL password |
| `DB_DATABASE` | `chickenroad` | Database name |
| `DB_SYNCHRONIZE` | `true` | Auto-sync schema (disable in production) |
| `DB_CONNECTION_LIMIT` | `30` | Connection pool limit |

### Redis Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | `` | Redis password (if requirepass enabled) |

### JWT Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `CHANGE_ME_DEV_SECRET` | JWT secret key (CRITICAL: change in production) |
| `JWT_EXPIRES` or `JWT_EXPIRES_IN` | `1h` | Token expiration time |

### Retry Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RETRY_CONCURRENT_LIMIT` | `10` | Max concurrent retry jobs |
| `RETRY_TEST_MODE` | `false` | Enable test mode (faster retries) |

---

## Configuration Modules

### AppConfig

**Location**: `src/config/app.config.ts`

**Interface**:
```typescript
interface AppConfig {
  port: number;
  env: string;
  enableAuth: boolean;
}
```

**Usage**:
```typescript
const port = configService.get<number>('app.port');
const enableAuth = configService.get<boolean>('app.enableAuth');
```

---

### DatabaseConfig

**Location**: `src/config/database.config.ts`

**Interface**:
```typescript
interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
}
```

**Connection Pool Settings**:
```typescript
{
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '30', 10),
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  pool: {
    min: 5,
    max: parseInt(process.env.DB_CONNECTION_LIMIT || '30', 10),
    idleTimeoutMillis: 30000
  }
}
```

---

### RedisConfig

**Location**: `src/config/redis.config.ts`

**Interface**:
```typescript
interface RedisConfig {
  host: string;
  port: number;
  password: string;
}
```

**Connection Settings**:
```typescript
{
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false
}
```

---

### JwtConfig

**Location**: `src/config/jwt.config.ts`

**Interface**:
```typescript
interface JwtConfig {
  secret: string;
  expiresIn: string;
}
```

**Note**: JWT secret and expiration can also be stored in `game_config` table.

---

## Database Configuration

### TypeORM Setup

**Location**: `src/app.module.ts`

**Configuration**:
```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): TypeOrmModuleOptions => {
    const dbConfig = cfg.get<DatabaseConfig>('database');
    return {
      type: 'mysql',
      host: dbConfig?.host,
      port: dbConfig?.port,
      username: dbConfig?.username,
      password: dbConfig?.password,
      database: dbConfig?.database,
      synchronize: dbConfig?.synchronize,
      autoLoadEntities: true,
      entities: [User, Agents, GameConfig, Bet, WalletAudit, WalletRetryJob],
      extra: {
        connectionLimit: 30,
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true,
        pool: { min: 5, max: 30, idleTimeoutMillis: 30000 }
      }
    };
  }
})
```

### Connection Pooling

**Settings**:
- **Min Connections**: 5
- **Max Connections**: 30 (per pod)
- **Acquire Timeout**: 60 seconds
- **Query Timeout**: 60 seconds
- **Idle Timeout**: 30 seconds

**Scaling**: With 3 pods, total connections = 90

---

## Redis Configuration

### Client Setup

**Location**: `src/modules/redis/redis.provider.ts`

**Connection**:
```typescript
const client = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false
});
```

### Memory Configuration

**Production** (docker-compose.prod.yml):
```yaml
command: redis-server --appendonly yes --maxmemory 400mb --maxmemory-policy allkeys-lru
```

**Settings**:
- **Max Memory**: 400MB
- **Eviction Policy**: `allkeys-lru` (Least Recently Used)
- **Persistence**: AOF (Append Only File)

---

## Logging Strategy

### Winston Logger

**Location**: `src/common/logger/winston-logger.service.ts`

**Configuration**:
- **Levels**: error, warn, log, debug
- **File Rotation**: Daily log files
- **Log Directory**: `logs/`
- **File Pattern**: `app-YYYY-MM-DD-HH.log`, `error-YYYY-MM-DD-HH.log`

**Log Format**:
```
[timestamp] [level] [context] message [metadata]
```

**Example**:
```
2024-01-01 12:00:00 [LOG] [GamePlayService] [BET_PLACED] user=user123 agent=agent456 amount=10.00
```

### Log Levels

- **error**: Errors and exceptions
- **warn**: Warnings and recoverable issues
- **log**: General information
- **debug**: Detailed debugging information

### Log Files

**Application Logs**:
- `logs/app-YYYY-MM-DD-HH.log` - General logs
- Rotated daily or when size limit reached

**Error Logs**:
- `logs/error-YYYY-MM-DD-HH.log` - Error-only logs
- Separate file for easier error tracking

### Logging Best Practices

1. **Structured Logging**: Include context (userId, agentId, etc.)
2. **Error Logging**: Always include stack traces
3. **Performance Logging**: Log response times for API calls
4. **Audit Logging**: Log all wallet operations

---

## Application Startup

### Bootstrap Process

**Location**: `src/main.ts`

**Steps**:

1. **Error Handlers**
   ```typescript
   process.on('unhandledRejection', ...);
   process.on('uncaughtException', ...);
   ```

2. **NestJS Application Creation**
   ```typescript
   const app = await NestFactory.create<NestExpressApplication>(AppModule, {
     logger: winstonLogger
   });
   ```

3. **Middleware Setup**
   ```typescript
   app.use(express.urlencoded({ extended: true }));
   app.enableCors({ ... });
   ```

4. **Swagger Configuration**
   ```typescript
   SwaggerModule.setup('api', app, document);
   ```

5. **Global Filters/Interceptors**
   ```typescript
   app.useGlobalFilters(new AllExceptionsFilter());
   app.useGlobalInterceptors(new ResponseTransformInterceptor());
   app.useGlobalPipes(new ValidationPipe({ ... }));
   ```

6. **Server Start**
   ```typescript
   await app.listen(port);
   ```

### Startup Logging

**Messages**:
```
Application is running on: 3000 env=production auth=ENABLED dbHost=localhost
Swagger documentation available at: http://localhost:3000/api
```

---

## Cron Jobs & Schedulers

### 1. Wallet Retry Scheduler

**Location**: `src/modules/wallet-retry/wallet-retry-scheduler.service.ts`

**Schedule**: `@Cron('* * * * *')` - Every minute

**Purpose**: Process due retry jobs

**Lock**: `wallet-retry-scheduler-lock` (TTL: 60s)

**Concurrency**: 10 concurrent jobs (configurable via `RETRY_CONCURRENT_LIMIT`)

**Flow**:
1. Acquire distributed lock
2. Find due retries (`status = 'PENDING'` and `nextRetryAt <= NOW()`)
3. Process in batches (10 concurrent)
4. Release lock

---

### 2. Hazard Scheduler

**Location**: `src/modules/hazard/hazard-scheduler.service.ts`

**Schedule**: `@Cron('*/5 * * * * *')` - Every 5 seconds

**Purpose**: Refresh hazard positions

**Lock**: Per-difficulty locks

**Flow**:
1. For each difficulty (EASY, MEDIUM, HARD, DAREDEVIL)
2. Generate new hazard positions
3. Store in Redis with TTL

---

### 3. Bet Cleanup Scheduler

**Location**: `src/modules/bet-cleanup/bet-cleanup-scheduler.service.ts`

**Schedule**: `@Cron('0 2 * * *')` - Daily at 2 AM

**Purpose**: Cleanup old PLACED bets

**Lock**: `bet-cleanup-lock` (TTL: 300s)

**Flow**:
1. Acquire distributed lock
2. Check last run (prevent duplicate execution)
3. Delete old PLACED bets
4. Update last run timestamp
5. Release lock

---

### 4. Wallet Audit Cleanup Scheduler

**Location**: `src/modules/wallet-audit/wallet-audit-cleanup.service.ts`

**Schedule**: `@Cron('0 3 * * *')` - Daily at 3 AM

**Purpose**: Archive old audit records

**Lock**: `wallet-audit-cleanup-lock` (TTL: 300s)

**Flow**:
1. Acquire distributed lock
2. Check last run
3. Archive old audit records (90+ days)
4. Update last run timestamp
5. Release lock

---

## Infrastructure Components

### Docker Configuration

**Production**: `docker-compose.prod.yml`

**Services**:
- **Application**: NestJS app
- **MySQL**: Database
- **Redis**: Cache and pub/sub

**Networking**: Internal Docker network

**Volumes**: Logs, database data

---

### Health Checks

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Checks** (potential):
- Database connectivity
- Redis connectivity
- Application status

---

### Monitoring

**Current**: Winston logging

**Potential Additions**:
- Prometheus metrics
- APM (Application Performance Monitoring)
- Health check endpoints
- Database query monitoring
- Redis performance monitoring

---

## Security Configuration

### CORS

**Configuration**:
```typescript
app.enableCors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Authorization']
});
```

**Note**: `origin: '*'` requires `credentials: false`

---

### Authentication

**Agent API**: Certificate-based (`cert` field)

**Game API**: JWT Bearer token

**IP Whitelisting**: Agent IP validation

---

## Environment-Specific Configuration

### Development

- `DB_SYNCHRONIZE: true` - Auto-sync schema
- `ENABLE_AUTH: false` - Disable auth (optional)
- `RETRY_TEST_MODE: true` - Faster retries

### Production

- `DB_SYNCHRONIZE: false` - Use migrations
- `ENABLE_AUTH: true` - Enable auth
- `RETRY_TEST_MODE: false` - Production retry schedule
- Strong JWT secret
- Secure database passwords

---

## Configuration Best Practices

1. **Environment Variables**: Use `.env` files (not committed)
2. **Secrets**: Store in environment variables or secure vault
3. **Defaults**: Provide sensible defaults in code
4. **Validation**: Validate configuration on startup
5. **Documentation**: Document all configuration options
6. **Type Safety**: Use TypeScript interfaces for config

---

## Troubleshooting

### Configuration Issues

**Problem**: Application won't start

**Solutions**:
- Check environment variables
- Verify database connection
- Verify Redis connection
- Check log files for errors

**Problem**: Database connection errors

**Solutions**:
- Verify `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`
- Check database is running
- Verify network connectivity
- Check connection pool limits

**Problem**: Redis connection errors

**Solutions**:
- Verify `REDIS_HOST`, `REDIS_PORT`
- Check Redis is running
- Verify password (if required)
- Check network connectivity

