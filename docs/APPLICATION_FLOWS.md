# Application Flows Documentation

## Table of Contents
1. [User Registration Flow](#user-registration-flow)
2. [User Login Flow](#user-login-flow)
3. [Bet Placement Flow](#bet-placement-flow)
4. [Game Step Flow](#game-step-flow)
5. [Cashout Flow](#cashout-flow)
6. [Settlement Flow](#settlement-flow)
7. [Retry Flow](#retry-flow)
8. [Hazard Generation Flow](#hazard-generation-flow)

---

## User Registration Flow

### Sequence Diagram

```
Client          Controller      Service        UserService    MySQL
  |                 |              |               |            |
  |--POST /wallet/createMember-->|                |            |
  |                 |              |               |            |
  |                 |--createMember()------------->|            |
  |                 |              |               |            |
  |                 |              |--validate()---|            |
  |                 |              |               |            |
  |                 |              |--create()----------------->|
  |                 |              |               |            |
  |                 |              |<--User--------|            |
  |                 |              |               |            |
  |<--{status: "0000"}------------|                |            |
```

### Step-by-Step

1. **Client Request**
   - POST `/wallet/createMember`
   - Body: `{ cert, agentId, userId, currency, betLimit, ... }`

2. **Authentication**
   - `AgentAuthGuard` validates `cert` and IP address
   - Attaches agent to request

3. **Validation**
   - Validate required fields
   - Validate userId format (`^[a-z0-9]+$`)
   - Validate currency format (`^[A-Z]{3,4}$`)

4. **User Creation**
   - Check if user exists
   - If exists, return `ACCOUNT_EXIST`
   - If not, create user in database

5. **Response**
   - Return `{ status: "0000", desc: "Member created successfully" }`

### Error Paths

- **Missing Parameters**: Return `PARAMETER_MISSING`
- **Invalid Format**: Return `INVALID_USER_ID` or `INVALID_CURRENCY`
- **Account Exists**: Return `ACCOUNT_EXIST`
- **Database Error**: Return `UNABLE_TO_PROCEED`

---

## User Login Flow

### Sequence Diagram

```
Client          Controller      Service        JWTService    UserService    Redis
  |                 |              |               |            |            |
  |--POST /wallet/login---------->|                |            |            |
  |                 |              |               |            |            |
  |                 |--loginMember()-------------->|            |            |
  |                 |              |               |            |            |
  |                 |              |--findOne()---------------->|            |
  |                 |              |               |            |            |
  |                 |              |<--User--------|            |            |
  |                 |              |               |            |            |
  |                 |              |--signUserToken()---------->|            |
  |                 |              |               |            |            |
  |                 |              |<--JWT---------|            |            |
  |                 |              |               |            |            |
  |                 |              |--addSession()-------------------------->|
  |                 |              |               |            |            |
  |<--{status, url}---------------|                |            |            |
```

### Step-by-Step

1. **Client Request**
   - POST `/wallet/login`
   - Body: `{ cert, agentId, userId }`

2. **Authentication**
   - `AgentAuthGuard` validates agent

3. **User Lookup**
   - Find user by `userId` and `agentId`
   - If not found, return `ACCOUNT_NOT_EXIST`

4. **JWT Generation**
   - Generate JWT with `userId` and `agentId`
   - Token expires based on configuration

5. **Session Creation**
   - Add user to active sessions (Redis)

6. **URL Construction**
   - Resolve frontend host from config
   - Build game URL with token and parameters

7. **Response**
   - Return `{ status: "0000", url: "...", extension: [] }`

---

## Bet Placement Flow

### Sequence Diagram

```
Client          Gateway         GamePlayService  WalletService  BetService    Redis      MySQL
  |                 |                 |               |            |            |         |
  |--WebSocket: bet->|                |               |            |            |         |
  |                 |                 |               |            |            |         |
  |                 |--performBetFlow()--------------->|            |            |         |
  |                 |                 |               |            |            |         |
  |                 |                 |--acquireLock()------------------------>|         |
  |                 |                 |               |            |            |         |
  |                 |                 |--getSession()------------------------->|         |
  |                 |                 |               |            |            |         |
  |                 |                 |--placeBet()-->|            |            |         |
  |                 |                 |               |--HTTP POST->|            |         |
  |                 |                 |               |            |            |         |
  |                 |                 |               |<--Response-|            |         |
  |                 |                 |               |            |            |         |
  |                 |                 |--createPlacement()--------->|            |         |
  |                 |                 |               |            |--INSERT--->|         |
  |                 |                 |               |            |            |         |
  |                 |                 |--setSession()------------------------->|         |
  |                 |                 |               |            |            |         |
  |                 |                 |--releaseLock()------------------------->|         |
  |                 |                 |               |            |            |         |
  |<--ACK: response-|                 |               |            |            |         |
  |<--onBalanceChange|                |               |            |            |         |
```

### Step-by-Step

1. **WebSocket Request**
   - Client emits `gameService` event with `action: "bet"`
   - Payload: `{ betAmount, difficulty, currency }`

2. **Lock Acquisition**
   - Acquire distributed lock: `bet-lock:${userId}-${agentId}`
   - TTL: 30 seconds
   - If lock not acquired, return error

3. **Session Check**
   - Check Redis for active session
   - If active session exists, return `ACTIVE_SESSION_EXISTS`

4. **Validation**
   - Validate bet payload
   - Validate bet amount > 0

5. **Wallet API Call**
   - Call `placeBet()` on `SingleWalletFunctionsService`
   - HTTP POST to agent's `callbackURL`
   - Payload: `{ action: "bet", txns: [...] }`
   - If status !== "0000", return `AGENT_REJECTED`

6. **Bet Record Creation**
   - Create bet record in database
   - Status: `PLACED`
   - Store `externalPlatformTxId`, `roundId`, etc.

7. **Game Session Creation**
   - Create game session in Redis
   - Store: coefficients, seeds, current step, etc.
   - TTL: Session TTL (default 1 hour)

8. **Response**
   - Return `BetStepResponse` via ACK
   - Emit `onBalanceChange` event

9. **Lock Release**
   - Always release lock in finally block

### Error Handling

- **Concurrent Bet**: Lock not acquired → return error
- **Active Session**: Existing session → return error
- **Agent Rejection**: Status !== "0000" → return error
- **Database Error**: Log and return error

---

## Game Step Flow

### Sequence Diagram

```
Client          Gateway         GamePlayService  HazardService  WalletService  Redis      MySQL
  |                 |                 |               |               |            |         |
  |--WebSocket: step->|                |               |               |            |         |
  |                 |                 |               |               |            |         |
  |                 |--performStepFlow()------------->|               |            |         |
  |                 |                 |               |               |            |         |
  |                 |                 |--getSession()--------------------------->|         |
  |                 |                 |               |               |            |         |
  |                 |                 |--validateStep()|               |            |         |
  |                 |                 |               |               |            |         |
  |                 |                 |--getActiveHazards()---------->|            |         |
  |                 |                 |               |               |            |         |
  |                 |                 |<--hazards-----|               |            |         |
  |                 |                 |               |               |            |         |
  |                 |                 |--checkHazard()|               |            |         |
  |                 |                 |               |               |            |         |
  |                 |                 |--updateSession()------------------------->|         |
  |                 |                 |               |               |            |         |
  |                 |                 |--if finished: settleBet()---->|            |         |
  |                 |                 |               |--HTTP POST---->|            |         |
  |                 |                 |               |<--Response-----|            |         |
  |                 |                 |--recordSettlement()---------->|            |         |
  |                 |                 |               |            |--UPDATE----->|         |
  |                 |                 |               |               |            |         |
  |<--ACK: response-|                 |               |               |            |         |
  |<--onBalanceChange|                |               |               |            |         |
```

### Step-by-Step

1. **WebSocket Request**
   - Client emits `gameService` event with `action: "step"`
   - Payload: `{ lineNumber: 0 }`

2. **Session Retrieval**
   - Get game session from Redis
   - If not found or inactive, return `NO_ACTIVE_SESSION`

3. **Step Validation**
   - Validate step sequence (must be `currentStep + 1`)
   - If invalid, return `INVALID_STEP_SEQUENCE`

4. **Hazard Check**
   - Get active hazards from `HazardSchedulerService`
   - Check if `lineNumber` is in hazards array

5. **Win Check**
   - If `lineNumber === totalColumns - 1`:
     - Mark as win
     - Calculate win amount
     - Set `isActive = false`, `isWin = true`

6. **Hazard Hit**
   - If hazard hit:
     - Mark as lost
     - Set `winAmount = 0`
     - Set `isActive = false`, `isWin = false`
     - Store `collisionColumns`

7. **Session Update**
   - Update session in Redis
   - Update `currentStep`, `winAmount`, `isActive`

8. **Settlement** (if finished)
   - If win or hazard:
     - Call `settleBet()` on wallet service
     - Update bet record with settlement
     - Rotate fairness seeds

9. **Response**
   - Return `BetStepResponse` via ACK
   - If finished, emit `onBalanceChange`

---

## Cashout Flow

### Sequence Diagram

```
Client          Gateway         GamePlayService  WalletService  BetService    Redis      MySQL
  |                 |                 |               |            |            |         |
  |--WebSocket: cashout->|                |               |            |            |         |
  |                 |                 |               |            |            |         |
  |                 |--performCashOutFlow()----------->|            |            |         |
  |                 |                 |               |            |            |         |
  |                 |                 |--getSession()------------------------->|         |
  |                 |                 |               |            |            |         |
  |                 |                 |--markInactive()----------------------->|         |
  |                 |                 |               |            |            |         |
  |                 |                 |--settleBet()-->|            |            |         |
  |                 |                 |               |--HTTP POST->|            |         |
  |                 |                 |               |<--Response-|            |         |
  |                 |                 |--recordSettlement()-------->|            |         |
  |                 |                 |               |            |--UPDATE---->|         |
  |                 |                 |               |            |            |         |
  |                 |                 |--rotateSeeds()|            |            |         |
  |                 |                 |               |            |            |         |
  |<--ACK: response-|                 |               |            |            |         |
  |<--onBalanceChange|                |               |            |            |         |
```

### Step-by-Step

1. **WebSocket Request**
   - Client emits `gameService` event with `action: "cashout"`

2. **Session Retrieval**
   - Get game session from Redis
   - If not found or inactive, return `NO_ACTIVE_SESSION`

3. **Mark Inactive**
   - Set `isActive = false`, `isWin = true`
   - Update session in Redis

4. **Settlement**
   - Calculate win amount from current step
   - Call `settleBet()` on wallet service
   - Update bet record with settlement
   - Rotate fairness seeds

5. **Response**
   - Return `BetStepResponse` via ACK
   - Emit `onBalanceChange` event

---

## Settlement Flow

### Sequence Diagram

```
GamePlayService  WalletService  Agent API      AuditService   RetryService  MySQL
      |               |              |               |              |         |
      |--settleBet()-->|              |               |              |         |
      |               |              |               |              |         |
      |               |--HTTP POST---------------------------------->|         |
      |               |              |               |              |         |
      |               |<--Response--|               |              |         |
      |               |              |               |              |         |
      |               |--checkStatus()|               |              |         |
      |               |              |               |              |         |
      |               |--logAudit()--|               |              |         |
      |               |              |--INSERT------>|              |         |
      |               |              |               |              |         |
      |               |--if failure: createRetryJob()|              |         |
      |               |              |               |--INSERT----->|         |
      |               |              |               |              |         |
      |<--Result------|              |               |              |         |
```

### Step-by-Step

1. **Settlement Request**
   - Call `settleBet()` with `platformTxId`, `winAmount`, etc.

2. **Agent API Call**
   - HTTP POST to agent's `callbackURL`
   - Payload: `{ action: "settle", txns: [...] }`
   - Measure response time

3. **Response Processing**
   - Parse agent response
   - Check status code
   - If status !== "0000", mark as failure

4. **Audit Logging**
   - Log to `wallet_audit` table (non-blocking)
   - Store: request, response, timing, errors

5. **Retry Job Creation** (on failure)
   - Create retry job in `wallet_retry_job` table
   - Schedule first retry (5 minutes)
   - Link to audit record

6. **Bet Update** (on success)
   - Update bet record with settlement
   - Set status to `SETTLED`
   - Store `winAmount`, `settledAt`, etc.

7. **Return Result**
   - Return balance and status

---

## Retry Flow

### Sequence Diagram

```
Scheduler      RetryService    Processor      WalletService  Agent API      MySQL
    |               |              |               |              |         |
    |--Cron: every 1min->|              |               |              |         |
    |               |              |               |              |         |
    |               |--findDueRetries()--------------------------->|         |
    |               |              |               |              |         |
    |               |<--Jobs-------|               |              |         |
    |               |              |               |              |         |
    |               |--processJob()-->|              |               |              |         |
    |               |              |               |              |         |
    |               |              |--acquireLock()|               |              |         |
    |               |              |               |              |         |
    |               |              |--executeRetry()-->|              |         |
    |               |              |               |--HTTP POST--->|         |
    |               |              |               |              |         |
    |               |              |               |<--Response----|         |
    |               |              |               |              |         |
    |               |              |--if success: markSuccess()--->|         |
    |               |              |               |              |         |
    |               |              |--if failure: scheduleNext()-->|         |
    |               |              |               |              |         |
    |               |              |--releaseLock()|               |              |         |
```

### Step-by-Step

1. **Cron Trigger**
   - Scheduler runs every minute
   - Acquires distributed lock

2. **Find Due Retries**
   - Query `wallet_retry_job` table
   - Find jobs where `status = 'PENDING'` and `nextRetryAt <= NOW()`

3. **Process Jobs** (parallel, max 10 concurrent)
   - For each job:
     - Acquire job-specific lock
     - Check job status (double-check)
     - Update status to `PROCESSING`

4. **Execute Retry**
   - Call `executeRetry()` on processor
   - Replay original wallet operation
   - Call agent API

5. **Handle Result**
   - **Success**: Mark job as `SUCCESS`, update bet/audit
   - **Failure**: Calculate next retry time, update job

6. **Release Lock**
   - Always release lock in finally block

### Retry Schedule

**Production**:
- Attempt 1: 5 minutes
- Attempt 2: 15 minutes
- Attempt 3: 30 minutes
- Attempt 4+: Every 2 hours until 72 hours

**Test Mode**:
- Attempt 1: 1 minute
- Attempt 2: 2 minutes
- Attempt 3+: Every 3 minutes until 5 minutes

---

## Hazard Generation Flow

### Sequence Diagram

```
Scheduler      HazardService   Generator      Redis
    |               |              |            |
    |--Cron: every 5s->|              |            |
    |               |              |            |
    |               |--refreshHazards()-------->|            |
    |               |              |            |
    |               |              |--generateHazards()|            |
    |               |              |            |
    |               |              |<--positions|            |
    |               |              |            |
    |               |--setHazards()------------------------>|         |
    |               |              |            |
    |               |              |            |
```

### Step-by-Step

1. **Cron Trigger**
   - Runs every 5 seconds
   - For each difficulty level

2. **Generate Hazards**
   - Generate random hazard positions
   - Count based on difficulty:
     - EASY: 3 hazards
     - MEDIUM: 4 hazards
     - HARD: 5 hazards
     - DAREDEVIL: 7 hazards

3. **Store in Redis**
   - Key: `hazards-${difficulty}`
   - TTL: 7.5 seconds (1.5x refresh interval)
   - Store: positions array, timestamps

4. **Usage**
   - Game steps check hazards from Redis
   - If step number in hazards array, player loses

---

## Cache Hit/Miss Scenarios

### Game Configuration

**Cache Hit**:
```
Request → Redis (hit) → Return cached config
```

**Cache Miss**:
```
Request → Redis (miss) → MySQL → Update Redis → Return config
```

### Game Session

**Session Exists**:
```
Request → Redis (exists) → Return session
```

**Session Not Found**:
```
Request → Redis (not found) → Return error: NO_ACTIVE_SESSION
```

---

## Error Handling Paths

### Wallet API Failure

1. **Network Error**
   - Log to audit
   - Create retry job
   - Return error to caller

2. **Agent Rejection**
   - Log to audit
   - Create retry job
   - Mark bet as `SETTLEMENT_FAILED`
   - Return error

3. **Timeout**
   - Log to audit
   - Create retry job
   - Return error

### Database Failure

1. **Connection Error**
   - Log error
   - Return error to caller
   - Retry logic (if applicable)

2. **Query Timeout**
   - Log timeout
   - Return error
   - Connection pool handles retry

### Redis Failure

1. **Connection Error**
   - Log error
   - Fallback to database (if applicable)
   - Return error

2. **Lock Acquisition Failure**
   - Return error (operation blocked)
   - Client should retry

