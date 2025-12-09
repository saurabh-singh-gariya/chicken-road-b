# File-Level & Function-Level Analysis

## Table of Contents
1. [Core Application Files](#core-application-files)
2. [Route Files](#route-files)
3. [Module Service Files](#module-service-files)
4. [Entity Files](#entity-files)
5. [Common Utilities](#common-utilities)
6. [Configuration Files](#configuration-files)

---

## Core Application Files

### main.ts

**Purpose**: Application bootstrap and initialization

**Key Functions**:
- `bootstrap()` - Main entry point
  - Sets up global error handlers
  - Creates NestJS application
  - Configures CORS
  - Sets up Swagger
  - Applies global filters, interceptors, pipes
  - Starts HTTP server

**Global Handlers**:
- `unhandledRejection` - Logs unhandled promise rejections
- `uncaughtException` - Logs and exits on uncaught exceptions

**Configuration**:
- Port from `app.port` config
- CORS: `origin: '*'`, `credentials: false`
- Swagger: `/api` endpoint
- Global filters: `AllExceptionsFilter`
- Global interceptors: `ResponseTransformInterceptor`
- Global pipes: `ValidationPipe` (whitelist, forbidNonWhitelisted, transform)

**Inputs**: Environment variables
**Outputs**: Running HTTP server

---

### app.module.ts

**Purpose**: Root module configuration

**Key Components**:
- `ConfigModule` - Global configuration
- `TypeOrmModule` - Database connection
- Feature modules imports
- `HealthController`

**Database Configuration**:
- Connection pool: 30 connections
- Timeout: 60 seconds
- Auto-load entities: true
- Synchronize: configurable

**Module Imports**:
- AgentsModule, BetModule, HazardModule
- WalletErrorModule, WalletAuditModule, WalletRetryModule
- CommonApiFunctionsModule, GameApiRoutesModule, GamePlayModule, SingleWalletFunctionsModule

---

## Route Files

### common-api-functions.controller.ts

**Purpose**: Wallet API controller

**Decorators**: `@Controller('/wallet')`, `@UseGuards(AgentAuthGuard)`

**Endpoints**:
- `POST /wallet/createMember` → `createMember()`
- `POST /wallet/login` → `login()`
- `POST /wallet/doLoginAndLaunchGame` → `doLoginAndLaunchGame()`
- `POST /wallet/logout` → `logout()`

**Inputs**: Request body DTOs
**Outputs**: Status response objects

---

### common-api-functions.service.ts

**Purpose**: Wallet API business logic

**Key Functions**:

#### `createMember(body: CreateMemberBodyDto)`
- **Purpose**: Create new user account
- **Steps**:
  1. Validate required fields
  2. Validate userId format (`^[a-z0-9]+$`)
  3. Validate currency format (`^[A-Z]{3,4}$`)
  4. Call `userService.create()`
  5. Handle ConflictException (account exists)
- **Inputs**: `CreateMemberBodyDto`
- **Outputs**: `{ status: string, desc: string }`

#### `loginMember(agent, userId, agentId, ipAddress?)`
- **Purpose**: Authenticate user and generate JWT
- **Steps**:
  1. Validate agentId matches
  2. Validate userId format
  3. Lookup user in database
  4. Generate JWT token
  5. Resolve frontend host
  6. Build game URL with token
  7. Add user to active sessions
- **Inputs**: `Agents`, `userId`, `agentId`, `ipAddress?`
- **Outputs**: `{ status, url, extension }`

#### `loginAndLaunchGame(agent, dto)`
- **Purpose**: Wrapper for login with game parameters
- **Steps**: Delegates to `loginMember()`
- **Inputs**: `Agents`, login DTO
- **Outputs**: Same as `loginMember()`

#### `logoutUsers(agent, agentId, userIdsCsv)`
- **Purpose**: Remove users from active sessions
- **Steps**:
  1. Validate agentId
  2. Parse CSV userIds
  3. Remove sessions via `userSessionService`
- **Inputs**: `Agents`, `agentId`, `userIdsCsv`
- **Outputs**: `{ status, logoutUsers, count }`

---

### game-api-routes.controller.ts

**Purpose**: Game API controller

**Decorators**: `@Controller('api')`, `@ApiTags('game-api')`

**Endpoints**:
- `POST /api/auth` → `authenticate()`
- `GET /api/online-counter/v1/data` → `getOnlineCounter()`

**Inputs**: Request body/headers
**Outputs**: Auth response, online counter data

---

### game-api-routes.service.ts

**Purpose**: Game API business logic

**Key Functions**:

#### `authenticateGame(dto: AuthLoginDto)`
- **Purpose**: Authenticate game session
- **Steps**:
  1. Verify incoming JWT token
  2. Extract userId and agentId
  3. Generate new JWT with game context
  4. Add user to active sessions
  5. Return token and config
- **Inputs**: `AuthLoginDto`
- **Outputs**: `AuthLoginResponse`

#### `getOnlineCounter(token: string)`
- **Purpose**: Get online player statistics
- **Steps**:
  1. Verify JWT token
  2. Get actual logged-in user count
  3. Add random "pump" value (11000-15000)
  4. Return total + per-game-mode breakdown
- **Inputs**: JWT token string
- **Outputs**: `OnlineCounterResponse`

---

### game-play.gateway.ts

**Purpose**: WebSocket gateway for real-time game

**Decorators**: `@WebSocketGateway({ path: '/io/', cors: true })`

**Key Functions**:

#### `handleConnection(client: Socket)`
- **Purpose**: Handle WebSocket connection
- **Steps**:
  1. Extract query parameters (gameMode, operatorId, Authorization)
  2. Verify JWT token
  3. Extract userId, agentId
  4. Fetch user balance
  5. Emit initial data (balance, config, user data, currencies)
  6. Initialize fairness seeds
- **Inputs**: Socket connection
- **Outputs**: Emits events to client

#### `handleDisconnect(client: Socket)`
- **Purpose**: Handle WebSocket disconnection
- **Steps**: Log disconnect event
- **Inputs**: Socket connection

#### `handlePing(@ConnectedSocket() client: Socket)`
- **Purpose**: Keepalive handler
- **Steps**: Emit pong with timestamp
- **Inputs**: Socket connection
- **Outputs**: Pong event

**Event Handlers** (via ACK):
- `gameService` event with actions: bet, step, cashout, get-game-config, etc.

---

### game-play.service.ts

**Purpose**: Game logic service

**Key Functions**:

#### `performBetFlow(userId, agentId, gameMode, incoming)`
- **Purpose**: Place a bet
- **Steps**:
  1. Acquire distributed lock
  2. Check for active session
  3. Validate bet payload
  4. Call wallet API (placeBet)
  5. Create bet record
  6. Create game session in Redis
  7. Release lock
- **Inputs**: `userId`, `agentId`, `gameMode`, bet payload
- **Outputs**: `BetStepResponse` or error

#### `performStepFlow(userId, agentId, lineNumber)`
- **Purpose**: Process game step
- **Steps**:
  1. Get game session from Redis
  2. Validate session and step sequence
  3. Get active hazards
  4. Check if hit hazard
  5. Update session state
  6. If finished: settle bet, update record, rotate seeds
- **Inputs**: `userId`, `agentId`, `lineNumber`
- **Outputs**: `BetStepResponse` or error

#### `performCashOutFlow(userId, agentId)`
- **Purpose**: Cash out current bet
- **Steps**:
  1. Get game session
  2. Mark session inactive
  3. Calculate win amount
  4. Call wallet API (settleBet)
  5. Update bet record
  6. Rotate seeds
- **Inputs**: `userId`, `agentId`
- **Outputs**: `BetStepResponse` or error

#### `performGetSessionFlow(userId, agentId)`
- **Purpose**: Get current session state
- **Steps**:
  1. Get session from Redis
  2. Build response from session state
- **Inputs**: `userId`, `agentId`
- **Outputs**: `BetStepResponse` or error

#### `getMyBetsHistory(userId, agentId)`
- **Purpose**: Get user bet history
- **Steps**:
  1. Query bets from last 7 days
  2. Map to response format
  3. Include fairness data
- **Inputs**: `userId`, `agentId`
- **Outputs**: Array of bet history items

---

### single-wallet-functions.service.ts

**Purpose**: Wallet API integration service

**Key Functions**:

#### `getBalance(agentId, userId)`
- **Purpose**: Get user balance from agent
- **Steps**:
  1. Resolve agent (callbackURL, cert)
  2. Build request payload
  3. HTTP POST to agent
  4. Parse response
  5. Check status (0000 = success)
  6. Log to audit
  7. Return balance
- **Inputs**: `agentId`, `userId`
- **Outputs**: Balance response object

#### `placeBet(agentId, userId, amount, roundId, platformTxId, currency, gamePayloads)`
- **Purpose**: Place bet (deduct amount)
- **Steps**:
  1. Resolve agent
  2. Build transaction payload
  3. HTTP POST to agent
  4. Check status
  5. Log to audit
  6. Return result
- **Inputs**: Bet parameters
- **Outputs**: Balance response

#### `settleBet(agentId, platformTxId, userId, winAmount, roundId, betAmount, gamePayloads, gameSession?)`
- **Purpose**: Settle bet (credit win)
- **Steps**:
  1. Resolve agent
  2. Build settlement payload
  3. HTTP POST to agent
  4. Check status
  5. Log to audit
  6. On failure: create retry job
  7. Return result
- **Inputs**: Settlement parameters
- **Outputs**: Balance response

#### `refundBet(agentId, userId, refundTransactions)`
- **Purpose**: Refund bet(s)
- **Steps**:
  1. Resolve agent
  2. Build refund transaction array
  3. HTTP POST to agent
  4. Check status
  5. Log to audit
  6. On failure: create retry job
  7. Return result
- **Inputs**: Refund parameters
- **Outputs**: Balance response

**Helper Functions**:
- `resolveAgent()` - Get agent configuration
- `mapAgentResponse()` - Normalize agent response
- `logAudit()` - Non-blocking audit logging
- `createRetryJobSafely()` - Non-blocking retry job creation

---

## Module Service Files

### agents.service.ts

**Purpose**: Agent management

**Key Functions**:
- `findOne(agentId)` - Find agent by ID
- `findAll()` - List all agents

**Inputs**: `agentId` string
**Outputs**: `Agents` entity or null

---

### bet.service.ts

**Purpose**: Bet lifecycle management

**Key Functions**:
- `createPlacement(params)` - Create bet record
- `recordSettlement(params)` - Update bet with settlement
- `markSettlementFailed(platformTxId, userId)` - Mark as failed
- `listUserBetsByTimeRange(userId, startDate, endDate, limit)` - Query user bets

**Inputs**: Bet parameters
**Outputs**: Bet entity or array

---

### user.service.ts

**Purpose**: User account management

**Key Functions**:
- `create(params)` - Create user
- `findOne(userId, agentId)` - Find user

**Inputs**: User parameters
**Outputs**: User entity

---

### game-config.service.ts

**Purpose**: Game configuration management

**Key Functions**:
- `getConfig(key)` - Get config value (with Redis cache)
- `getJwtSecret()` - Get JWT secret
- `getJwtExpires()` - Get JWT expiration
- `getChickenRoadGamePayloads()` - Get game payloads (cached)

**Inputs**: Config key string
**Outputs**: Config value (string or parsed JSON)

---

### hazard-scheduler.service.ts

**Purpose**: Hazard generation and scheduling

**Key Functions**:
- `getActiveHazards(difficulty)` - Get current hazard positions
- `refreshHazards()` - Refresh hazard state (cron, every 5s)

**Inputs**: Difficulty enum
**Outputs**: Array of hazard column indices

---

### fairness.service.ts

**Purpose**: Provably fair game mechanics

**Key Functions**:
- `getOrCreateFairness(userId, agentId)` - Get/create user seeds
- `setUserSeed(userId, agentId, userSeed)` - Set user seed
- `rotateSeeds(userId, agentId)` - Rotate after settlement
- `generateFairnessDataForBet(userSeed, serverSeed)` - Generate fairness proof

**Inputs**: User identifiers, seeds
**Outputs**: Fairness data object

---

### wallet-retry-job.service.ts

**Purpose**: Retry job management

**Key Functions**:
- `createRetryJob(params)` - Create retry job (prevents duplicates)
- `findDueRetries()` - Find jobs ready for retry
- `findById(id)` - Find job by ID
- `updateStatus(id, status)` - Update job status
- `markSuccess(id)` - Mark as successful
- `markExpired(id, errorMessage)` - Mark as expired
- `scheduleNextRetry(id, attempt, nextRetryAt, errorMessage)` - Schedule next retry

**Inputs**: Retry job parameters
**Outputs**: WalletRetryJob entity

**Helper Functions**:
- `calculateNextRetryTime(attempt, initialFailureAt)` - Calculate retry schedule
- `calculateMaxRetries()` - Calculate max retry attempts

---

### wallet-retry-scheduler.service.ts

**Purpose**: Retry job scheduler

**Key Functions**:
- `processDueRetries()` - Process due retries (cron, every 1min)
  - Acquires distributed lock
  - Finds due retries
  - Processes in parallel (10 concurrent)
  - Releases lock

**Inputs**: None (cron triggered)
**Outputs**: None (side effects)

---

### wallet-retry-processor.service.ts

**Purpose**: Execute retry operations

**Key Functions**:
- `executeRetry(retryJob)` - Execute retry operation
  - Determines operation type
  - Replays original wallet operation
  - Returns success/failure result

**Inputs**: WalletRetryJob entity
**Outputs**: `{ success: boolean, errorMessage?: string }`

---

### wallet-audit.service.ts

**Purpose**: Audit logging

**Key Functions**:
- `logAudit(params)` - Log wallet operation
  - Creates audit record
  - Stores request/response data
  - Links to retry job if applicable

**Inputs**: Audit parameters
**Outputs**: WalletAudit entity

---

### redis.service.ts

**Purpose**: Redis client wrapper

**Key Functions**:
- `set(key, value, ttl?)` - Set key with TTL
- `get<T>(key)` - Get key value
- `del(key)` - Delete key
- `acquireLock(key, ttlSeconds)` - Acquire distributed lock
- `releaseLock(key)` - Release lock
- `getSessionTTL()` - Get session TTL from config
- `flushAll()` - Flush all keys (development only)

**Inputs**: Key, value, TTL
**Outputs**: Typed values or boolean (for locks)

---

### pub-sub.service.ts

**Purpose**: Redis pub/sub wrapper

**Key Functions**:
- `publish(channel, message)` - Publish message
- `subscribe(channel, callback)` - Subscribe to channel
- `unsubscribe(channel, callback?)` - Unsubscribe
- `getSubscribedChannels()` - List subscribed channels
- `isSubscribed(channel)` - Check subscription

**Inputs**: Channel name, message/callback
**Outputs**: Number of subscribers (publish), void (subscribe)

---

### jwt-token.service.ts

**Purpose**: JWT token management

**Key Functions**:
- `signUserToken(userId, agentId, ttlSeconds?)` - Sign user token
- `verifyToken<T>(token)` - Verify token
- `signGenericToken(payload, ttlSeconds?)` - Sign custom payload

**Inputs**: User identifiers or payload
**Outputs**: JWT token string or decoded payload

---

### user-session.service.ts

**Purpose**: User session tracking

**Key Functions**:
- `addSession(userId, agentId)` - Add user to active sessions
- `removeSessions(userIds, agentId)` - Remove users from sessions
- `getLoggedInUserCount()` - Get active user count

**Inputs**: User identifiers
**Outputs**: Void or number (count)

---

## Entity Files

### User.entity.ts

**Purpose**: User entity definition

**Key Decorators**:
- `@Entity()` - TypeORM entity
- `@PrimaryColumn()` - Composite primary key (userId, agentId)
- `@Column()` - Regular columns
- `@CreateDateColumn()` - Auto-managed timestamp
- `@UpdateDateColumn()` - Auto-managed timestamp

**Fields**: userId, agentId, currency, language, username, betLimit, avatar, passwordHash, timestamps

---

### bet.entity.ts

**Purpose**: Bet entity definition

**Key Decorators**:
- `@Entity()` - TypeORM entity
- `@PrimaryGeneratedColumn('uuid')` - UUID primary key
- `@Index()` - Database indexes
- `@Column('decimal')` - Decimal columns for amounts
- `@Column('json')` - JSON columns for complex data

**Enums**:
- `BetStatus` - PLACED, WON, LOST, SETTLED, etc.
- `Difficulty` - EASY, MEDIUM, HARD, DAREDEVIL

**Fields**: id, externalPlatformTxId, userId, roundId, difficulty, betAmount, winAmount, status, fairnessData, etc.

---

### wallet-retry-job.entity.ts

**Purpose**: Retry job entity definition

**Key Decorators**: Similar to Bet entity

**Enums**:
- `WalletRetryJobStatus` - PENDING, PROCESSING, SUCCESS, FAILED, EXPIRED
- `WalletApiAction` - GET_BALANCE, PLACE_BET, SETTLE_BET, REFUND_BET

**Fields**: id, platformTxId, apiAction, status, retryAttempt, maxRetries, nextRetryAt, etc.

---

### wallet-audit.entity.ts

**Purpose**: Audit log entity definition

**Key Decorators**: Similar to other entities

**Enums**:
- `WalletAuditStatus` - SUCCESS, FAILURE
- `WalletApiAction` - Same as WalletRetryJob
- `WalletErrorType` - NETWORK_ERROR, HTTP_ERROR, TIMEOUT_ERROR, etc.

**Fields**: id, agentId, userId, apiAction, status, requestPayload, responseData, httpStatus, responseTime, etc.

---

## Common Utilities

### response-transform.interceptor.ts

**Purpose**: Transform API responses

**Key Functions**:
- `intercept(context, next)` - Intercept response
  - Skips transformation for online-counter endpoint
  - Transforms response to include status field
- `transformResponse(data)` - Transform response object
  - Adds status if missing
  - Wraps primitives

**Inputs**: ExecutionContext, CallHandler
**Outputs**: Observable with transformed response

---

### all-exception.filter.ts

**Purpose**: Global exception filter

**Key Functions**:
- `catch(exception, host)` - Catch all exceptions
  - Routes to API or health handler
  - Maps exceptions to error codes
  - Logs errors
  - Returns formatted response

**Inputs**: Exception, ArgumentsHost
**Outputs**: HTTP response

**Exception Mapping**:
- ConflictException → ACCOUNT_EXIST
- NotFoundException → ACCOUNT_NOT_EXIST
- BadRequestException → PARAMETER_MISSING
- UnauthorizedException → INVALID_AGENT_ID or INVALID_IP_ADDRESS
- HttpException → UNABLE_TO_PROCEED

---

### agent-auth.guard.ts

**Purpose**: Agent authentication guard

**Key Functions**:
- `canActivate(ctx)` - Validate agent authentication
  - Checks if auth enabled
  - Extracts credentials (cert, agentId)
  - Extracts client IP
  - Validates agent (exists, whitelisted, cert matches, IP matches)

**Inputs**: ExecutionContext
**Outputs**: boolean (can activate)

**Helper Functions**:
- `extractCredentials(req)` - Get cert and agentId from body
- `extractClientIp(req)` - Get client IP from headers
- `validateAgent(agentId, cert, clientIp)` - Validate agent
- `ipMatches(expectedPattern, actualIp)` - Match IP patterns (supports wildcards)

---

### winston-logger.service.ts

**Purpose**: Winston logger implementation

**Key Functions**:
- `log(message, context?)` - Log info message
- `error(message, trace?, context?)` - Log error with stack
- `warn(message, context?)` - Log warning
- `debug(message, context?)` - Log debug
- `verbose(message, context?)` - Log verbose

**Configuration**:
- Console transport (always)
- File transport (production or if enabled)
- Error file transport (errors only)
- Daily rotation
- Max files: 60 days
- Max size: 50MB

---

## Configuration Files

### app.config.ts

**Purpose**: Application configuration

**Key Functions**:
- `registerAs('app', ...)` - Register app config namespace
  - Reads APP_PORT, APP_ENV, ENABLE_AUTH
  - Returns AppConfig interface

**Inputs**: Environment variables
**Outputs**: AppConfig object

---

### database.config.ts

**Purpose**: Database configuration

**Key Functions**:
- `registerAs('database', ...)` - Register database config
  - Reads DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, DB_SYNCHRONIZE
  - Returns DatabaseConfig interface

**Inputs**: Environment variables
**Outputs**: DatabaseConfig object

---

### redis.config.ts

**Purpose**: Redis configuration

**Key Functions**:
- `registerAs('redis', ...)` - Register Redis config
  - Reads REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
  - Returns RedisConfig interface

**Inputs**: Environment variables
**Outputs**: RedisConfig object

---

### jwt.config.ts

**Purpose**: JWT configuration

**Key Functions**:
- `registerAs('jwt', ...)` - Register JWT config
  - Reads JWT_SECRET, JWT_EXPIRES or JWT_EXPIRES_IN
  - Returns JwtConfig interface

**Inputs**: Environment variables
**Outputs**: JwtConfig object

---

### defaults.config.ts

**Purpose**: Default configuration values

**Structure**: Nested object with categories:
- APP - Application defaults
- betConfig - Bet configuration
- coefficients - Game coefficients per difficulty
- hazardConfig - Hazard configuration
- GAME - Game constants
- CURRENCY - Currency defaults
- USER - User defaults
- REDIS - Redis defaults
- JWT - JWT defaults
- DATABASE - Database defaults
- LOGGER - Logger defaults
- ERROR_MESSAGES - Error message constants

**Usage**: Fallback values when environment variables not set

---

## Summary

This document provides file-level and function-level analysis for:

- **Core Files**: 2 files (main.ts, app.module.ts)
- **Route Files**: 5 files (controllers + services)
- **Module Services**: 15+ service files
- **Entity Files**: 9 entity files
- **Common Utilities**: 4 files (interceptors, filters, guards, logger)
- **Configuration Files**: 5 files

Each file includes:
- Purpose summary
- Key functions with step-by-step logic
- Inputs and outputs
- Decorators and annotations
- Contribution to overall architecture

