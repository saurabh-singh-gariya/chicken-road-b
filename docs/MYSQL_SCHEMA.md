# MySQL Database Schema Documentation

## Entity Relationship Diagram

```
┌─────────────┐         ┌─────────────┐
│    User     │         │   Agents    │
│─────────────│         │─────────────│
│ userId (PK) │         │ agentId (PK)│
│ agentId(PK) │         │ cert        │
│ currency    │         │ agentIPaddr │
│ language    │         │ callbackURL │
│ username    │         │ isWhitelist │
│ betLimit    │         └─────────────┘
└─────────────┘
       │
       │ 1:N
       │
┌──────▼──────────────┐
│        Bet          │
│─────────────────────│
│ id (UUID PK)        │
│ externalPlatformTxId│ (unique)
│ userId              │ (indexed)
│ agentId             │
│ roundId             │ (indexed)
│ difficulty          │
│ betAmount           │
│ winAmount           │
│ status              │
│ fairnessData (JSON) │
└─────────────────────┘
       │
       │ 1:N
       │
┌──────▼──────────────┐
│   WalletRetryJob    │
│─────────────────────│
│ id (UUID PK)        │
│ platformTxId        │ (indexed)
│ apiAction           │
│ status              │
│ retryAttempt        │
│ nextRetryAt         │ (indexed)
│ agentId             │ (indexed)
│ userId              │ (indexed)
└─────────────────────┘

┌─────────────┐
│ GameConfig  │
│─────────────│
│ id (PK)     │
│ key         │
│ value       │
└─────────────┘

┌─────────────┐         ┌─────────────┐
│WalletAudit  │         │WalletError  │
│─────────────│         │─────────────│
│ id (UUID PK)│         │ id (UUID PK)│
│ agentId     │(indexed)│ agentId     │(indexed)
│ userId      │(indexed)│ userId      │(indexed)
│ apiAction   │         │ apiAction   │
│ status      │         │ errorType   │
│ requestId   │(indexed)│ errorMessage│
│ platformTxId│(indexed)│ platformTxId│
└─────────────┘         └─────────────┘
```

## Tables

### 1. User

**Table Name**: `user`

**Primary Key**: Composite (`userId`, `agentId`)

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `userId` | VARCHAR | NO | User identifier (PK) |
| `agentId` | VARCHAR | NO | Agent identifier (PK) |
| `currency` | VARCHAR | NO | Currency code (e.g., INR, USD) |
| `language` | VARCHAR | YES | Language code (e.g., en, es) |
| `username` | VARCHAR | YES | Display name |
| `betLimit` | VARCHAR | NO | Bet limit amount |
| `avatar` | VARCHAR | YES | Avatar URL |
| `passwordHash` | VARCHAR | YES | Hashed password (optional) |
| `createdAt` | DATETIME | NO | Creation timestamp |
| `updatedAt` | DATETIME | NO | Update timestamp |
| `createdBy` | VARCHAR | YES | Creator identifier |
| `updatedBy` | VARCHAR | YES | Updater identifier |

**Indexes**:
- Primary Key: (`userId`, `agentId`)

**Relationships**:
- 1:N with `Bet` (via `userId` + `agentId`)

**Example Queries**:
```sql
-- Find user
SELECT * FROM user WHERE userId = 'user123' AND agentId = 'agent456';

-- Create user
INSERT INTO user (userId, agentId, currency, betLimit, createdAt, updatedAt)
VALUES ('user123', 'agent456', 'INR', '1000', NOW(), NOW());
```

---

### 2. Agents

**Table Name**: `agents`

**Primary Key**: `agentId`

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `agentId` | VARCHAR | NO | Agent identifier (PK) |
| `cert` | VARCHAR | NO | Certificate for authentication |
| `agentIPaddress` | VARCHAR | NO | Whitelisted IP address(es) |
| `callbackURL` | VARCHAR | NO | Wallet API endpoint URL |
| `isWhitelisted` | BOOLEAN | NO | Active flag (default: true) |
| `createdAt` | DATETIME | NO | Creation timestamp |
| `updatedAt` | DATETIME | NO | Update timestamp |
| `createdBy` | VARCHAR | YES | Creator identifier |
| `updatedBy` | VARCHAR | YES | Updater identifier |

**Indexes**:
- Primary Key: `agentId`

**Relationships**:
- 1:N with `User` (via `agentId`)
- 1:N with `Bet` (via `agentId`)

**Example Queries**:
```sql
-- Find agent
SELECT * FROM agents WHERE agentId = 'agent456';

-- List whitelisted agents
SELECT * FROM agents WHERE isWhitelisted = true;
```

---

### 3. Bet

**Table Name**: `bet`

**Primary Key**: `id` (UUID)

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | VARCHAR(36) | NO | UUID (PK) |
| `externalPlatformTxId` | VARCHAR | NO | External transaction ID (unique) |
| `userId` | VARCHAR | NO | User identifier (indexed) |
| `roundId` | VARCHAR | NO | Round identifier (indexed) |
| `difficulty` | ENUM | NO | EASY, MEDIUM, HARD, DAREDEVIL |
| `betType` | VARCHAR(50) | YES | Bet type (nullable) |
| `betAmount` | DECIMAL(18,3) | NO | Bet amount |
| `winAmount` | DECIMAL(18,3) | YES | Win amount (after settlement) |
| `currency` | VARCHAR(4) | NO | Currency code |
| `status` | ENUM | NO | PLACED, PENDING_SETTLEMENT, WON, LOST, CANCELLED, REFUNDED, SETTLED, SETTLEMENT_FAILED |
| `settlementRefTxId` | VARCHAR | YES | Settlement reference transaction ID |
| `settleType` | VARCHAR(50) | YES | Settlement type (platformTxId, roundId, etc.) |
| `isPremium` | BOOLEAN | NO | Premium bet flag (default: false) |
| `betPlacedAt` | DATETIME(3) | YES | Bet placement timestamp (millisecond precision) |
| `settledAt` | DATETIME(3) | YES | Settlement timestamp |
| `platform` | VARCHAR(32) | NO | Platform name (default: SPADE) |
| `gameType` | VARCHAR(32) | NO | Game type (default: LIVE) |
| `gameCode` | VARCHAR(64) | NO | Game code (default: chicken-road-2) |
| `gameName` | VARCHAR(64) | NO | Game name (default: ChickenRoad) |
| `gameInfo` | TEXT | YES | Additional game information (JSON) |
| `balanceAfterBet` | DECIMAL(18,3) | YES | Balance after bet placement |
| `balanceAfterSettlement` | DECIMAL(18,3) | YES | Balance after settlement |
| `operatorId` | VARCHAR(64) | NO | Operator/agent identifier |
| `finalCoeff` | DECIMAL(18,3) | YES | Final coefficient |
| `withdrawCoeff` | DECIMAL(18,3) | YES | Withdrawal coefficient |
| `fairnessData` | JSON | YES | Provably fair data |
| `createdAt` | DATETIME | NO | Creation timestamp |
| `updatedAt` | DATETIME | NO | Update timestamp |
| `createdBy` | VARCHAR | YES | Creator identifier |
| `updatedBy` | VARCHAR | YES | Updater identifier |

**Indexes**:
- Primary Key: `id`
- Unique: `externalPlatformTxId`
- Index: `userId`
- Index: `roundId`

**Enums**:

**BetStatus**:
- `PLACED` - Bet placed, not yet settled
- `PENDING_SETTLEMENT` - Settlement in progress
- `WON` - Bet won
- `LOST` - Bet lost
- `CANCELLED` - Bet cancelled
- `REFUNDED` - Bet refunded
- `SETTLED` - Bet settled successfully
- `SETTLEMENT_FAILED` - Settlement failed

**Difficulty**:
- `EASY` - Easy difficulty
- `MEDIUM` - Medium difficulty
- `HARD` - Hard difficulty
- `DAREDEVIL` - Daredevil difficulty

**Relationships**:
- N:1 with `User` (via `userId` + `agentId`)
- N:1 with `Agents` (via `operatorId`)
- 1:1 with `WalletRetryJob` (via `platformTxId`)

**Example Queries**:
```sql
-- Create bet
INSERT INTO bet (id, externalPlatformTxId, userId, roundId, difficulty, betAmount, currency, status, operatorId, createdAt, updatedAt)
VALUES (UUID(), 'tx-123', 'user123', 'round-456', 'EASY', 10.000, 'INR', 'PLACED', 'agent456', NOW(), NOW());

-- Update settlement
UPDATE bet 
SET status = 'SETTLED', winAmount = 15.500, settledAt = NOW(), balanceAfterSettlement = 1005.500, finalCoeff = 1.550
WHERE externalPlatformTxId = 'tx-123';

-- Get user bets
SELECT * FROM bet 
WHERE userId = 'user123' 
  AND createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY createdAt DESC 
LIMIT 30;
```

---

### 4. GameConfig

**Table Name**: `game_config`

**Primary Key**: `id` (auto-increment)

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INT | NO | Auto-increment (PK) |
| `key` | VARCHAR | NO | Configuration key |
| `value` | TEXT | NO | Configuration value (JSON or string) |
| `updatedAt` | DATETIME | NO | Update timestamp |

**Indexes**:
- Primary Key: `id`
- Unique: `key` (should be unique)

**Example Keys**:
- `redis.TTL` - Redis default TTL
- `game.session.ttl` - Session TTL
- `jwt.secret` - JWT secret
- `jwt.expires` - JWT expiration
- `frontend.host` - Frontend hostname
- `betConfig` - Bet configuration (JSON)
- `coefficients` - Game coefficients (JSON)
- `game.payloads` - Game payloads (JSON, cached in Redis)

**Example Queries**:
```sql
-- Get config
SELECT value FROM game_config WHERE key = 'redis.TTL';

-- Update config
UPDATE game_config SET value = '7200', updatedAt = NOW() WHERE key = 'redis.TTL';
```

---

### 5. WalletAudit

**Table Name**: `wallet_audit`

**Primary Key**: `id` (UUID)

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | VARCHAR(36) | NO | UUID (PK) |
| `agentId` | VARCHAR | NO | Agent identifier (indexed) |
| `userId` | VARCHAR | NO | User identifier (indexed) |
| `requestId` | VARCHAR | YES | Request identifier (indexed) |
| `apiAction` | ENUM | NO | GET_BALANCE, PLACE_BET, SETTLE_BET, REFUND_BET |
| `status` | ENUM | NO | SUCCESS, FAILURE |
| `requestPayload` | JSON | YES | Request payload |
| `requestUrl` | TEXT | YES | Request URL |
| `requestMethod` | VARCHAR | YES | HTTP method (default: POST) |
| `responseData` | JSON | YES | Response data |
| `httpStatus` | INT | YES | HTTP status code |
| `responseTime` | INT | YES | Response time in milliseconds |
| `failureType` | ENUM | YES | Error type (if failure) |
| `errorMessage` | TEXT | YES | Error message |
| `errorStack` | TEXT | YES | Error stack trace |
| `platformTxId` | VARCHAR | YES | Platform transaction ID (indexed) |
| `roundId` | VARCHAR | YES | Round identifier |
| `betAmount` | DECIMAL(18,4) | YES | Bet amount |
| `winAmount` | DECIMAL(18,4) | YES | Win amount |
| `currency` | VARCHAR(4) | YES | Currency code |
| `callbackUrl` | TEXT | YES | Callback URL |
| `rawError` | TEXT | YES | Raw error data |
| `retryJobId` | VARCHAR | YES | Associated retry job ID |
| `isRetry` | BOOLEAN | NO | Is retry attempt (default: false) |
| `retryAttempt` | INT | YES | Retry attempt number |
| `createdAt` | DATETIME | NO | Creation timestamp |
| `resolved` | BOOLEAN | YES | Resolved flag (default: false) |
| `resolvedAt` | DATETIME(3) | YES | Resolution timestamp |
| `resolutionNotes` | TEXT | YES | Resolution notes |

**Indexes**:
- Primary Key: `id`
- Index: `agentId`
- Index: `userId`
- Index: `requestId`
- Index: `platformTxId`

**Enums**:

**WalletApiAction**:
- `GET_BALANCE` - Get balance operation
- `PLACE_BET` - Place bet operation
- `SETTLE_BET` - Settle bet operation
- `REFUND_BET` - Refund bet operation

**WalletErrorType**:
- `NETWORK_ERROR` - Network connection error
- `HTTP_ERROR` - HTTP error response
- `TIMEOUT_ERROR` - Request timeout
- `INVALID_RESPONSE` - Invalid response format
- `AGENT_REJECTED` - Agent rejected request
- `MALFORMED_RESPONSE` - Malformed response
- `UNKNOWN_ERROR` - Unknown error

**Relationships**:
- N:1 with `User` (via `userId`)
- N:1 with `Agents` (via `agentId`)
- 1:1 with `WalletRetryJob` (via `retryJobId`)

**Example Queries**:
```sql
-- Log audit
INSERT INTO wallet_audit (id, agentId, userId, requestId, apiAction, status, requestPayload, responseData, httpStatus, responseTime, createdAt)
VALUES (UUID(), 'agent456', 'user123', 'req-789', 'PLACE_BET', 'SUCCESS', '{"amount": 10}', '{"balance": 990}', 200, 150, NOW());

-- Get failed operations
SELECT * FROM wallet_audit 
WHERE status = 'FAILURE' 
  AND createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY createdAt DESC;
```

---

### 6. WalletRetryJob

**Table Name**: `wallet_retry_job`

**Primary Key**: `id` (UUID)

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | VARCHAR(36) | NO | UUID (PK) |
| `platformTxId` | VARCHAR | NO | Platform transaction ID (indexed) |
| `apiAction` | ENUM | NO | Wallet API action |
| `status` | ENUM | NO | PENDING, PROCESSING, SUCCESS, FAILED, EXPIRED |
| `retryAttempt` | INT | NO | Current retry attempt (default: 0) |
| `maxRetries` | INT | NO | Maximum retry attempts |
| `nextRetryAt` | DATETIME(3) | NO | Next retry timestamp (indexed) |
| `initialFailureAt` | DATETIME(3) | NO | Initial failure timestamp |
| `lastRetryAt` | DATETIME(3) | YES | Last retry timestamp |
| `agentId` | VARCHAR | NO | Agent identifier (indexed) |
| `userId` | VARCHAR | NO | User identifier (indexed) |
| `requestPayload` | JSON | NO | Request payload |
| `callbackUrl` | TEXT | NO | Callback URL |
| `roundId` | VARCHAR | YES | Round identifier |
| `betAmount` | DECIMAL(18,4) | YES | Bet amount |
| `winAmount` | DECIMAL(18,4) | YES | Win amount |
| `currency` | VARCHAR(4) | YES | Currency code |
| `gamePayloads` | JSON | YES | Game payloads |
| `walletAuditId` | VARCHAR | YES | Associated audit record ID |
| `betId` | VARCHAR | YES | Associated bet ID |
| `createdAt` | DATETIME | NO | Creation timestamp |
| `updatedAt` | DATETIME | NO | Update timestamp |
| `completedAt` | DATETIME(3) | YES | Completion timestamp |
| `errorMessage` | TEXT | YES | Error message |

**Indexes**:
- Primary Key: `id`
- Index: `platformTxId`
- Index: `nextRetryAt`
- Index: `agentId`
- Index: `userId`

**Enums**:

**WalletRetryJobStatus**:
- `PENDING` - Waiting for retry
- `PROCESSING` - Currently being processed
- `SUCCESS` - Retry succeeded
- `FAILED` - Retry failed (expired)
- `EXPIRED` - Retry expired (72 hours)

**Relationships**:
- N:1 with `User` (via `userId`)
- N:1 with `Agents` (via `agentId`)
- 1:1 with `Bet` (via `platformTxId`)
- 1:1 with `WalletAudit` (via `walletAuditId`)

**Example Queries**:
```sql
-- Create retry job
INSERT INTO wallet_retry_job (id, platformTxId, apiAction, status, retryAttempt, maxRetries, nextRetryAt, initialFailureAt, agentId, userId, requestPayload, callbackUrl, createdAt, updatedAt)
VALUES (UUID(), 'tx-123', 'SETTLE_BET', 'PENDING', 0, 38, DATE_ADD(NOW(), INTERVAL 5 MINUTE), NOW(), 'agent456', 'user123', '{"amount": 10}', 'https://agent.com/callback', NOW(), NOW());

-- Find due retries
SELECT * FROM wallet_retry_job 
WHERE status = 'PENDING' 
  AND nextRetryAt <= NOW()
ORDER BY nextRetryAt ASC
LIMIT 100;
```

---

### 7. WalletError

**Table Name**: `wallet_error`

**Primary Key**: `id` (UUID)

**Columns**: Similar to `WalletAudit` but focused on error tracking.

**Purpose**: Dedicated error tracking table (may be redundant with `WalletAudit`).

---

### 8. GameSession

**Table Name**: `game_session`

**Note**: This entity exists but is primarily stored in Redis, not MySQL.

**Columns**: Similar to game session structure in Redis.

---

### 9. Admin

**Table Name**: `admins`

**Primary Key**: `id` (UUID)

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | VARCHAR(36) | NO | UUID (PK) |
| `username` | VARCHAR | NO | Admin username (unique) |
| `password_hash` | VARCHAR | NO | Hashed password |

**Purpose**: Admin authentication (if implemented).

---

## Database Configuration

### Connection Pool Settings

```typescript
{
  connectionLimit: 30,        // Max connections per pod
  acquireTimeout: 60000,      // 60 seconds
  timeout: 60000,            // 60 seconds query timeout
  reconnect: true,
  pool: {
    min: 5,                  // Minimum connections
    max: 30,                 // Maximum connections
    idleTimeoutMillis: 30000 // Close idle after 30s
  }
}
```

### Synchronization

**Development**: `synchronize: true` (auto-sync schema)

**Production**: `synchronize: false` (use migrations)

---

## Query Patterns

### High-Frequency Queries

1. **User Lookup**: `SELECT * FROM user WHERE userId = ? AND agentId = ?`
2. **Bet Creation**: `INSERT INTO bet ...`
3. **Bet Settlement**: `UPDATE bet SET status = 'SETTLED', ... WHERE externalPlatformTxId = ?`
4. **Config Lookup**: `SELECT value FROM game_config WHERE key = ?`
5. **Retry Job Query**: `SELECT * FROM wallet_retry_job WHERE status = 'PENDING' AND nextRetryAt <= NOW()`

### Optimization Recommendations

1. **Indexes**: All foreign keys and frequently queried columns are indexed
2. **Connection Pooling**: Configured for 30 connections per pod
3. **Query Timeout**: 60 seconds to prevent hanging queries
4. **Archiving**: Old audit records should be archived periodically

---

## Data Retention

### Recommended Retention Policies

- **Bets**: Keep for 1 year, archive older
- **WalletAudit**: Keep for 90 days, archive older
- **WalletRetryJob**: Keep successful for 30 days, failed for 90 days
- **GameConfig**: Keep all (small table)

---

## Migration Strategy

1. Use TypeORM migrations for schema changes
2. Test migrations in staging first
3. Backup database before migrations
4. Run migrations during low-traffic periods

