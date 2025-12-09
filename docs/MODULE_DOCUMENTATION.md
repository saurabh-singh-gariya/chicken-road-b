# Module-by-Module Documentation

## Table of Contents
1. [Routes Modules](#routes-modules)
2. [Business Logic Modules](#business-logic-modules)
3. [Infrastructure Modules](#infrastructure-modules)
4. [Scheduler Modules](#scheduler-modules)

---

## Routes Modules

### 1. CommonApiFunctionsModule

**Purpose**: Handles wallet-related API endpoints for agent integration.

**Location**: `src/routes/common-api-functions/`

**Controllers**:
- `CommonApiFunctionsController` - `/wallet/*` endpoints

**Endpoints**:
- `POST /wallet/createMember` - Create new user account
- `POST /wallet/login` - User login and JWT generation
- `POST /wallet/doLoginAndLaunchGame` - Login and launch game
- `POST /wallet/logout` - Logout users

**Services**:
- `CommonApiFunctionsService`
  - `createMember()` - Validates and creates user
  - `loginMember()` - Authenticates and generates JWT
  - `loginAndLaunchGame()` - Wrapper for login
  - `logoutUsers()` - Removes user sessions

**Dependencies**:
- `UserService` - User management
- `JwtTokenService` - Token generation
- `UserSessionService` - Session management
- `GameConfigService` - Configuration

**Guards**: `AgentAuthGuard`

**Flow Diagram**:
```
Client Request
    ↓
AgentAuthGuard (validates cert, IP)
    ↓
Controller
    ↓
CommonApiFunctionsService
    ↓
UserService / JwtTokenService
    ↓
MySQL / Redis
    ↓
Response
```

---

### 2. GameApiRoutesModule

**Purpose**: Game-specific API endpoints for frontend integration.

**Location**: `src/routes/game-api-routes/`

**Controllers**:
- `GameApiRoutesController` - `/api/*` endpoints

**Endpoints**:
- `POST /api/auth` - Authenticate game session
- `GET /api/online-counter/v1/data` - Get online player count

**Services**:
- `GameApiRoutesService`
  - `authenticateGame()` - Verify JWT and create game session
  - `getOnlineCounter()` - Return online player statistics

**Dependencies**:
- `JwtTokenService` - Token verification
- `UserSessionService` - Session tracking

**Auth**: JWT Bearer token

**Flow**:
```
POST /api/auth
    ↓
Verify JWT Token
    ↓
Extract userId, agentId
    ↓
Generate New Token
    ↓
Add to Session
    ↓
Return Token + Config
```

---

### 3. GamePlayModule (WebSocket)

**Purpose**: Real-time game actions via WebSocket.

**Location**: `src/routes/gamePlay/`

**Gateway**: `GamePlayGateway`
- Path: `/io/`
- CORS: Enabled for all origins

**WebSocket Events**:
- `gameService` - Main game action handler (ACK-based)
- `ping` / `pong` - Keepalive

**Game Actions** (via `gameService` event):
- `get-game-config` - Get game configuration
- `bet` - Place a bet
- `step` - Take a game step
- `cashout` / `withdraw` - Cash out current bet
- `get-game-session` - Get current session state
- `get-game-state` - Get active game state
- `get-game-seeds` - Get fairness seeds
- `set-user-seed` - Set user seed
- `get-my-bets-history` - Get bet history

**Services**:
- `GamePlayService`
  - `performBetFlow()` - Bet placement logic
  - `performStepFlow()` - Step progression logic
  - `performCashOutFlow()` - Cashout logic
  - `performGetSessionFlow()` - Session retrieval
  - `performGetGameStateFlow()` - Active state retrieval

**Dependencies**:
- `SingleWalletFunctionsService` - Wallet operations
- `BetService` - Bet management
- `HazardSchedulerService` - Hazard positions
- `FairnessService` - Provably fair
- `RedisService` - Session storage

**Connection Flow**:
```
WebSocket Connect
    ↓
Extract JWT from query
    ↓
Verify Token
    ↓
Extract userId, agentId
    ↓
Fetch Balance
    ↓
Emit Initial Data:
  - Balance
  - Bet Config
  - User Data
  - Currencies
    ↓
Ready for Game Actions
```

---

### 4. SingleWalletFunctionsModule

**Purpose**: Wallet API integration with external agents.

**Location**: `src/routes/single-wallet-functions/`

**Services**:
- `SingleWalletFunctionsService`
  - `getBalance()` - Get user balance
  - `placeBet()` - Place bet (deduct amount)
  - `settleBet()` - Settle bet (credit win)
  - `refundBet()` - Refund bet

**Dependencies**:
- `AgentsService` - Agent lookup
- `HttpService` - HTTP client
- `WalletAuditService` - Audit logging
- `WalletRetryJobService` - Retry job creation

**Error Handling**:
- All failures logged to `wallet_audit` table
- Failed operations create retry jobs
- Error types: NETWORK_ERROR, HTTP_ERROR, TIMEOUT_ERROR, AGENT_REJECTED

**Flow**:
```
Wallet Operation Request
    ↓
Resolve Agent (callbackURL, cert)
    ↓
Build Request Payload
    ↓
HTTP POST to Agent
    ↓
Parse Response
    ↓
Check Status (0000 = success)
    ↓
Log to Audit (non-blocking)
    ↓
On Failure: Create Retry Job
    ↓
Return Result
```

---

## Business Logic Modules

### 5. AgentsModule

**Purpose**: Agent management and validation.

**Location**: `src/modules/agents/`

**Services**:
- `AgentsService`
  - `findOne(agentId)` - Find agent by ID
  - `findAll()` - List all agents

**Entity**: `Agents`
- `agentId` (PK)
- `cert` - Certificate for authentication
- `agentIPaddress` - Whitelisted IP(s)
- `callbackURL` - Wallet API endpoint
- `isWhitelisted` - Active flag

**Usage**: Used by `AgentAuthGuard` and wallet operations.

---

### 6. BetModule

**Purpose**: Bet lifecycle management.

**Location**: `src/modules/bet/`

**Services**:
- `BetService`
  - `createPlacement()` - Create bet record
  - `recordSettlement()` - Update bet with settlement
  - `markSettlementFailed()` - Mark as failed
  - `listUserBetsByTimeRange()` - Query user bets

**Entity**: `Bet`
- `id` (UUID)
- `externalPlatformTxId` (unique)
- `userId`, `agentId`
- `roundId`
- `difficulty` (EASY, MEDIUM, HARD, DAREDEVIL)
- `betAmount`, `winAmount`
- `status` (PLACED, WON, LOST, SETTLED, etc.)
- `fairnessData` (JSON)

**Indexes**:
- `externalPlatformTxId` (unique)
- `userId`
- `roundId`

---

### 7. UserModule

**Purpose**: User account management.

**Location**: `src/modules/user/`

**Services**:
- `UserService`
  - `create()` - Create user
  - `findOne()` - Find user by userId + agentId

**Entity**: `User`
- Composite PK: `userId` + `agentId`
- `currency`, `language`, `username`
- `betLimit`
- `passwordHash` (optional)

---

### 8. GameConfigModule

**Purpose**: Game configuration management.

**Location**: `src/modules/gameConfig/`

**Services**:
- `GameConfigService`
  - `getConfig(key)` - Get config value
  - `getJwtSecret()` - Get JWT secret
  - `getJwtExpires()` - Get JWT expiration
  - `getChickenRoadGamePayloads()` - Get game payloads (cached)

**Entity**: `GameConfig`
- `id` (auto-increment)
- `key` (string)
- `value` (text/JSON)

**Caching**: Game payloads cached in Redis (`game.payloads`)

---

### 9. HazardModule

**Purpose**: Hazard generation and scheduling.

**Location**: `src/modules/hazard/`

**Services**:
- `HazardSchedulerService`
  - `getActiveHazards(difficulty)` - Get current hazard positions
  - `refreshHazards()` - Refresh hazard state (cron)
- `HazardGeneratorService`
  - `generateHazards()` - Generate random hazard positions

**Hazard Configuration**:
- EASY: 3 hazards, 30 columns
- MEDIUM: 4 hazards, 25 columns
- HARD: 5 hazards, 22 columns
- DAREDEVIL: 7 hazards, 18 columns

**Redis Keys**: `hazards-${difficulty}`

**Cron**: Runs every 5 seconds

---

### 10. FairnessModule

**Purpose**: Provably fair game mechanics.

**Location**: `src/modules/fairness/`

**Services**:
- `FairnessService`
  - `getOrCreateFairness()` - Get/create user seeds
  - `setUserSeed()` - Set user seed
  - `rotateSeeds()` - Rotate after settlement
  - `generateFairnessDataForBet()` - Generate fairness proof

**Redis Keys**: `fairness:${userId}:${agentId}`

**TTL**: 7 days

**Seed Management**:
- `userSeed` - User-provided seed
- `serverSeed` - Server-generated seed
- `hashedServerSeed` - SHA256 hash of server seed
- `nonce` - Incrementing counter

---

### 11. WalletRetryModule

**Purpose**: Retry mechanism for failed wallet operations.

**Location**: `src/modules/wallet-retry/`

**Services**:
- `WalletRetryJobService`
  - `createRetryJob()` - Create retry job
  - `findDueRetries()` - Find jobs ready for retry
  - `updateStatus()` - Update job status
  - `markSuccess()` - Mark as successful
  - `markExpired()` - Mark as expired
- `WalletRetrySchedulerService`
  - `processDueRetries()` - Process due jobs (cron)
- `WalletRetryProcessorService`
  - `executeRetry()` - Execute retry operation

**Entity**: `WalletRetryJob`
- `id` (UUID)
- `platformTxId`, `apiAction`
- `status` (PENDING, PROCESSING, SUCCESS, FAILED, EXPIRED)
- `retryAttempt`, `maxRetries`
- `nextRetryAt`, `initialFailureAt`

**Retry Schedule**:
- Production: 5min → 15min → 30min → every 2h until 72h
- Test: 1min → 2min → every 3min until 5min

**Cron**: Runs every minute

**Distributed Locking**: Prevents duplicate processing

---

### 12. WalletAuditModule

**Purpose**: Audit logging for wallet operations.

**Location**: `src/modules/wallet-audit/`

**Services**:
- `WalletAuditService`
  - `logAudit()` - Log wallet operation
- `WalletAuditCleanupService`
  - `cleanupOldAudits()` - Archive old records (cron)

**Entity**: `WalletAudit`
- `id` (UUID)
- `agentId`, `userId`, `requestId`
- `apiAction` (GET_BALANCE, PLACE_BET, SETTLE_BET, REFUND_BET)
- `status` (SUCCESS, FAILURE)
- `requestPayload`, `responseData` (JSON)
- `httpStatus`, `responseTime`
- `failureType`, `errorMessage`

**Indexes**:
- `agentId`
- `userId`
- `requestId`
- `platformTxId`

**Cron**: Cleanup runs daily at 3 AM

---

### 13. WalletErrorModule

**Purpose**: Error tracking and management.

**Location**: `src/modules/wallet-error/`

**Services**:
- `WalletErrorService`
  - `createError()` - Log error

**Entity**: `WalletError`
- Similar structure to `WalletAudit`
- Focused on error tracking

---

## Infrastructure Modules

### 14. RedisModule

**Purpose**: Redis client and utilities.

**Location**: `src/modules/redis/`

**Services**:
- `RedisService`
  - `set(key, value, ttl)` - Set with TTL
  - `get(key)` - Get value
  - `del(key)` - Delete key
  - `acquireLock(key, ttl)` - Distributed lock
  - `releaseLock(key)` - Release lock
  - `getSessionTTL()` - Get session TTL
- `PubSubService`
  - `publish(channel, message)` - Publish message
  - `subscribe(channel, callback)` - Subscribe to channel
  - `unsubscribe(channel, callback)` - Unsubscribe

**Provider**: `RedisProvider` - Creates ioredis client

**Connection**: Configured via `redisConfig`

---

### 15. JwtModule

**Purpose**: JWT token management.

**Location**: `src/modules/jwt/`

**Services**:
- `JwtTokenService`
  - `signUserToken()` - Sign user token
  - `verifyToken()` - Verify token
  - `signGenericToken()` - Sign custom payload

**Configuration**: JWT secret and expiration from `GameConfig`

---

### 16. UserSessionModule

**Purpose**: User session tracking.

**Location**: `src/modules/user-session/`

**Services**:
- `UserSessionService`
  - `addSession()` - Add user to active sessions
  - `removeSessions()` - Remove users from sessions
  - `getLoggedInUserCount()` - Get active user count

**Storage**: Redis (set-based)

---

### 17. LastWinModule

**Purpose**: Last win broadcasting.

**Location**: `src/modules/last-win/`

**Services**:
- `LastWinBroadcasterService`
  - `startBroadcasting()` - Start broadcasting last wins

**Broadcast**: Via WebSocket to all connected clients

---

## Scheduler Modules

### 18. BetCleanupSchedulerModule

**Purpose**: Cleanup old bet records.

**Location**: `src/modules/bet-cleanup/`

**Services**:
- `BetCleanupSchedulerService`
  - `cleanupOldBets()` - Delete old PLACED bets (cron)

**Cron**: Daily at 2 AM

**Distributed Lock**: Prevents duplicate execution

---

### 19. RefundSchedulerModule

**Purpose**: Scheduled refund processing.

**Location**: `src/modules/refund-scheduler/`

**Services**:
- `RefundSchedulerService`
  - `processRefunds()` - Process pending refunds

**Trigger**: Manual or scheduled

---

## Module Dependencies Graph

```
AppModule
├── Routes
│   ├── CommonApiFunctionsModule
│   │   ├── UserModule
│   │   ├── JwtModule
│   │   └── UserSessionModule
│   ├── GameApiRoutesModule
│   │   ├── JwtModule
│   │   └── UserSessionModule
│   ├── GamePlayModule
│   │   ├── SingleWalletFunctionsModule
│   │   ├── BetModule
│   │   ├── HazardModule
│   │   ├── FairnessModule
│   │   └── RedisModule
│   └── SingleWalletFunctionsModule
│       ├── AgentsModule
│       ├── WalletAuditModule
│       └── WalletRetryModule
├── Business Logic
│   ├── AgentsModule
│   ├── BetModule
│   ├── UserModule
│   ├── GameConfigModule
│   ├── HazardModule
│   ├── FairnessModule
│   ├── WalletRetryModule
│   ├── WalletAuditModule
│   └── WalletErrorModule
├── Infrastructure
│   ├── RedisModule
│   ├── JwtModule
│   ├── UserSessionModule
│   └── LastWinModule
└── Schedulers
    ├── BetCleanupSchedulerModule
    ├── WalletAuditCleanupModule
    ├── RefundSchedulerModule
    └── HazardSchedulerService (in HazardModule)
```

