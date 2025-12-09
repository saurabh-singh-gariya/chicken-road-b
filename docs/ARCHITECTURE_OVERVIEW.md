# Chicken Road Backend - Architecture Overview

## 1. High-Level Architecture

### Architecture Pattern
**Modular Monolith** - A single NestJS application organized into feature modules with clear boundaries.

### Technology Stack
- **Framework**: NestJS 11.x (Node.js)
- **Database**: MySQL 8.0+ (TypeORM)
- **Cache/Pub-Sub**: Redis (ioredis)
- **WebSocket**: Socket.IO
- **Authentication**: JWT (Passport)
- **HTTP Client**: Axios
- **Logging**: Winston with daily rotation
- **Validation**: class-validator, class-transformer
- **API Documentation**: Swagger/OpenAPI

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                       │
│  (Web Frontend, Mobile Apps, Agent Systems)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP/WebSocket
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    NestJS Application                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Global Interceptors/Filters              │  │
│  │  - ResponseTransformInterceptor                       │  │
│  │  - AllExceptionsFilter                                │  │
│  │  - ValidationPipe                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Routes     │  │   Modules    │  │   Common     │    │
│  │              │  │              │  │              │    │
│  │ - Wallet API │  │ - Agents     │  │ - Redis      │    │
│  │ - Game API   │  │ - Bet        │  │ - JWT        │    │
│  │ - GamePlay   │  │ - User        │  │ - Logger     │    │
│  │   (WebSocket)│  │ - Wallet      │  │ - Config     │    │
│  │              │  │   Retry       │  │              │    │
│  │              │  │ - Hazard      │  │              │    │
│  │              │  │ - Fairness    │  │              │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│    MySQL     │ │   Redis    │ │  External  │
│  (TypeORM)   │ │  (ioredis) │ │   Agents   │
│              │ │            │ │  (Wallet)  │
│ - Users      │ │ - Sessions │ │            │
│ - Bets       │ │ - Locks     │ │            │
│ - Agents     │ │ - Cache     │ │            │
│ - Config     │ │ - Pub/Sub   │ │            │
│ - Audit      │ │ - Hazards   │ │            │
└──────────────┘ └────────────┘ └────────────┘
```

## 2. Major Modules

### Core Modules

#### 1. **Routes** (API Entry Points)
- `common-api-functions` - Wallet operations (createMember, login, logout)
- `game-api-routes` - Game authentication and online counter
- `gamePlay` - WebSocket gateway for real-time game actions
- `single-wallet-functions` - Wallet API integration (bet, settle, refund)

#### 2. **Business Logic Modules**
- `agents` - Agent management and validation
- `bet` - Bet lifecycle management
- `user` - User account management
- `gameConfig` - Game configuration management
- `hazard` - Hazard generation and scheduling
- `fairness` - Provably fair game mechanics
- `wallet-retry` - Retry mechanism for failed wallet operations
- `wallet-audit` - Audit logging for wallet operations
- `wallet-error` - Error tracking and management

#### 3. **Infrastructure Modules**
- `redis` - Redis client, pub/sub, locks
- `jwt` - JWT token generation and validation
- `user-session` - User session management
- `last-win` - Last win broadcasting

#### 4. **Scheduler Modules**
- `bet-cleanup` - Cleanup old bet records
- `wallet-audit-cleanup` - Cleanup old audit records
- `refund-scheduler` - Scheduled refund processing
- `hazard-scheduler` - Hazard state management

## 3. Request/Response Flow

### HTTP Request Flow

```
1. Client Request
   ↓
2. CORS Middleware
   ↓
3. AgentAuthGuard (if /wallet/*)
   ↓
4. Controller
   ↓
5. Service Layer
   ↓
6. Database/Redis/External API
   ↓
7. ResponseTransformInterceptor
   ↓
8. AllExceptionsFilter (on error)
   ↓
9. Client Response
```

### WebSocket Connection Flow

```
1. Client Connection (with JWT token)
   ↓
2. GamePlayGateway.handleConnection()
   ↓
3. JWT Token Verification
   ↓
4. User Session Creation
   ↓
5. Initial Data Emission (balance, config, etc.)
   ↓
6. Event Handlers (bet, step, cashout)
   ↓
7. GamePlayService Business Logic
   ↓
8. Wallet API Calls (if needed)
   ↓
9. Response via ACK
```

## 4. External Services & Integrations

### External Wallet API
- **Purpose**: Agent wallet integration
- **Protocol**: HTTP POST
- **Endpoints**: 
  - `getBalance` - Get user balance
  - `placeBet` - Deduct bet amount
  - `settleBet` - Credit win amount
  - `refundBet` - Refund bet amount
- **Authentication**: Certificate-based (cert field)
- **Error Handling**: Retry mechanism with exponential backoff

### Redis Usage
- **Sessions**: Game session state (`gameSession:${userId}-${agentId}`)
- **Locks**: Distributed locking for concurrency control
- **Cache**: Game configuration, hazard states
- **Pub/Sub**: Cache invalidation, coordination

### MySQL Database
- **Primary Storage**: Users, bets, agents, configuration
- **Audit Trail**: Wallet operations, errors
- **Retry Jobs**: Failed wallet operations

## 5. Background Workers & Cron Jobs

### Scheduled Tasks

1. **Wallet Retry Scheduler** (`@Cron('* * * * *')`)
   - Runs every minute
   - Processes due retry jobs
   - Uses distributed locking

2. **Hazard Scheduler** (`@Cron('*/5 * * * * *')`)
   - Runs every 5 seconds
   - Refreshes hazard positions
   - Updates Redis state

3. **Bet Cleanup Scheduler** (`@Cron('0 2 * * *')`)
   - Runs daily at 2 AM
   - Cleans up old bet records
   - Uses distributed locking

4. **Wallet Audit Cleanup** (`@Cron('0 3 * * *')`)
   - Runs daily at 3 AM
   - Archives old audit records
   - Uses distributed locking

5. **Refund Scheduler** (Manual trigger)
   - Processes pending refunds
   - Uses distributed locking

## 6. Key Design Patterns

### 1. **Repository Pattern**
- TypeORM repositories for database access
- Service layer abstracts repository details

### 2. **Dependency Injection**
- NestJS IoC container
- Constructor injection throughout

### 3. **Guard Pattern**
- `AgentAuthGuard` for wallet API authentication
- JWT verification for game API

### 4. **Interceptor Pattern**
- `ResponseTransformInterceptor` for response normalization
- `AllExceptionsFilter` for error handling

### 5. **Pub/Sub Pattern**
- Redis pub/sub for cache invalidation
- Last win broadcasting

### 6. **Retry Pattern**
- Exponential backoff for wallet API failures
- Job queue for retry processing

### 7. **Distributed Locking**
- Redis SETNX for concurrency control
- Prevents duplicate processing

## 7. Scalability Considerations

### Horizontal Scaling
- **Stateless Application**: Can run multiple pods
- **Distributed Locks**: Prevents duplicate processing
- **Shared Redis**: Session state shared across pods
- **Shared MySQL**: Database connection pooling

### Bottlenecks Addressed
1. **Database Connection Pool**: Increased from 10 to 30 connections
2. **Redis Memory**: Increased from 80MB to 400MB
3. **Retry Concurrency**: Parallel processing (10 concurrent)
4. **Connection Timeouts**: 60-second timeouts

### Load Distribution
- **HTTP**: Load balancer distributes requests
- **WebSocket**: Sticky sessions recommended
- **Cron Jobs**: Distributed locks prevent duplicate execution

## 8. Security Architecture

### Authentication
- **Agent API**: Certificate-based (`cert` field)
- **Game API**: JWT tokens
- **IP Whitelisting**: Agent IP validation

### Authorization
- **Agent Whitelist**: `isWhitelisted` flag
- **JWT Claims**: User ID and agent ID

### Data Protection
- **Password Hashing**: bcrypt (if used)
- **JWT Secrets**: Configurable via environment
- **Input Validation**: class-validator DTOs

## 9. Error Handling Strategy

### Error Types
1. **Business Logic Errors**: Return status codes
2. **Validation Errors**: 400 Bad Request
3. **Authentication Errors**: 401 Unauthorized
4. **System Errors**: 500 Internal Server Error

### Error Flow
1. Exception thrown in service
2. Caught by `AllExceptionsFilter`
3. Mapped to error code/description
4. Logged via Winston
5. Returned to client

### Retry Strategy
- **Wallet API Failures**: Automatic retry with exponential backoff
- **Max Retries**: 38 attempts over 72 hours
- **Retry Schedule**: 5min → 15min → 30min → every 2h

## 10. Monitoring & Observability

### Logging
- **Winston Logger**: Structured logging
- **Log Levels**: error, warn, log, debug
- **File Rotation**: Daily log files
- **Log Locations**: `logs/app-YYYY-MM-DD-HH.log`

### Metrics (Potential)
- Request count
- Response times
- Error rates
- Active sessions
- Retry job counts

### Health Checks
- `/health` endpoint
- Database connectivity
- Redis connectivity

