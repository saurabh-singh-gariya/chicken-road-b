# API Endpoint Documentation

## Table of Contents
1. [Wallet API Endpoints](#wallet-api-endpoints)
2. [Game API Endpoints](#game-api-endpoints)
3. [WebSocket Events](#websocket-events)
4. [Health Endpoints](#health-endpoints)

---

## Wallet API Endpoints

### Base Path: `/wallet`

All endpoints require `AgentAuthGuard` authentication.

---

### 1. Create Member

**Endpoint**: `POST /wallet/createMember`

**Purpose**: Create a new user account.

**Authentication**: AgentAuthGuard (cert + agentId)

**Request Body**:
```json
{
  "cert": "agent-certificate",
  "agentId": "agent123",
  "userId": "user456",
  "currency": "INR",
  "betLimit": "1000",
  "language": "en",
  "userName": "John Doe"
}
```

**Validation**:
- `cert`: Required
- `agentId`: Required, must match authenticated agent
- `userId`: Required, alphanumeric lowercase only (`^[a-z0-9]+$`)
- `currency`: Required, 3-4 uppercase letters (`^[A-Z]{3,4}$`)
- `betLimit`: Required
- `language`: Optional
- `userName`: Optional

**Response**:
```json
{
  "status": "0000",
  "desc": "Member created successfully"
}
```

**Error Codes**:
- `0001` - Parameter missing
- `0002` - Invalid agentId
- `0003` - Invalid userId format
- `0004` - Invalid currency code
- `0005` - Account already exists
- `0006` - Unable to proceed

**Flow**:
```
1. AgentAuthGuard validates cert + IP
2. Validate request parameters
3. Check if user exists
4. Create user in database
5. Return success/error
```

---

### 2. Login

**Endpoint**: `POST /wallet/login`

**Purpose**: Authenticate user and generate JWT token.

**Authentication**: AgentAuthGuard

**Request Body**:
```json
{
  "cert": "agent-certificate",
  "agentId": "agent123",
  "userId": "user456"
}
```

**Response**:
```json
{
  "status": "0000",
  "url": "https://host/index.html?gameMode=...&authToken=...",
  "extension": []
}
```

**Flow**:
```
1. Validate agentId matches authenticated agent
2. Validate userId format
3. Lookup user in database
4. Generate JWT token (userId, agentId)
5. Resolve frontend host from config
6. Build game URL with token
7. Add user to active sessions
8. Return URL
```

**JWT Payload**:
```json
{
  "sub": "user456",
  "agentId": "agent123",
  "iat": 1234567890
}
```

---

### 3. Login and Launch Game

**Endpoint**: `POST /wallet/doLoginAndLaunchGame`

**Purpose**: Login and launch game (wrapper for login).

**Request Body**:
```json
{
  "cert": "agent-certificate",
  "agentId": "agent123",
  "userId": "user456",
  "platform": "SPADE",
  "gameType": "LIVE",
  "gameCode": "chicken-road-2"
}
```

**Response**: Same as `/wallet/login`

---

### 4. Logout

**Endpoint**: `POST /wallet/logout`

**Purpose**: Logout users (remove from active sessions).

**Request Body**:
```json
{
  "cert": "agent-certificate",
  "agentId": "agent123",
  "userIds": "user1,user2,user3"
}
```

**Response**:
```json
{
  "status": "0000",
  "logoutUsers": ["user1", "user2", "user3"],
  "count": 3
}
```

---

## Game API Endpoints

### Base Path: `/api`

---

### 1. Authenticate Game

**Endpoint**: `POST /api/auth`

**Purpose**: Authenticate game session and generate new JWT.

**Authentication**: JWT token in request body

**Request Body**:
```json
{
  "auth_token": "jwt-token-here",
  "operator": "agent123",
  "currency": "INR",
  "game_mode": "chicken-road-two"
}
```

**Response**:
```json
{
  "success": true,
  "result": "new-jwt-token",
  "data": "new-jwt-token",
  "gameConfig": null,
  "bonuses": [],
  "isLobbyEnabled": false,
  "isPromoCodeEnabled": false,
  "isSoundEnabled": false,
  "isMusicEnabled": false
}
```

**Flow**:
```
1. Verify incoming JWT token
2. Extract userId and agentId
3. Generate new JWT with game context
4. Add user to active sessions
5. Return new token
```

---

### 2. Online Counter

**Endpoint**: `GET /api/online-counter/v1/data`

**Purpose**: Get online player statistics.

**Authentication**: JWT Bearer token in Authorization header

**Headers**:
```
Authorization: Bearer jwt-token-here
```

**Response**:
```json
{
  "result": {
    "total": 15000,
    "gameMode": {
      "chicken-road-two": 6937,
      "chicken-road": 1980,
      ...
    }
  }
}
```

**Flow**:
```
1. Verify JWT token
2. Get actual logged-in user count
3. Add random "pump" value (11000-15000)
4. Return total + per-game-mode breakdown
```

**Note**: Response is NOT transformed by `ResponseTransformInterceptor`.

---

## WebSocket Events

### Connection

**Path**: `/io/`

**Query Parameters**:
- `gameMode` - Game mode identifier
- `operatorId` - Agent/operator ID
- `Authorization` - JWT token

**Connection Flow**:
```
1. Extract query parameters
2. Verify JWT token
3. Extract userId, agentId
4. Fetch user balance
5. Emit initial data:
   - onBalanceChange
   - betsRanges
   - betsConfig
   - myData
   - currencies
```

---

### Game Service Event

**Event**: `gameService`

**Protocol**: ACK-based (acknowledgement required)

**Actions**:

#### 1. Get Game Config
```javascript
socket.emit('gameService', {
  action: 'get-game-config'
}, (response) => {
  // response: { coefficients: {...}, lastWin: {...} }
});
```

#### 2. Place Bet
```javascript
socket.emit('gameService', {
  action: 'bet',
  payload: {
    betAmount: "10.00",
    difficulty: "EASY",
    currency: "INR"
  }
}, (response) => {
  // response: BetStepResponse or { error: {...} }
});
```

**Response**:
```json
{
  "isFinished": false,
  "coeff": "1.00",
  "winAmount": "10.00",
  "difficulty": "EASY",
  "betAmount": "10.00",
  "currency": "INR",
  "lineNumber": -1
}
```

**Flow**:
```
1. Acquire distributed lock (bet-lock:userId-agentId)
2. Check for active session
3. Validate bet payload
4. Call wallet API (placeBet)
5. Create bet record in database
6. Create game session in Redis
7. Release lock
8. Return response
9. Emit onBalanceChange
```

#### 3. Step
```javascript
socket.emit('gameService', {
  action: 'step',
  payload: {
    lineNumber: 0
  }
}, (response) => {
  // response: BetStepResponse
});
```

**Response**:
```json
{
  "isFinished": false,
  "coeff": "1.01",
  "winAmount": "10.10",
  "difficulty": "EASY",
  "betAmount": "10.00",
  "currency": "INR",
  "lineNumber": 0
}
```

**Flow**:
```
1. Get game session from Redis
2. Validate session exists and is active
3. Validate step sequence
4. Check if hit hazard
5. Update session state
6. If finished (win/hazard):
   - Call wallet API (settleBet)
   - Update bet record
   - Rotate fairness seeds
7. Return response
8. If finished: Emit onBalanceChange
```

#### 4. Cashout
```javascript
socket.emit('gameService', {
  action: 'cashout'
}, (response) => {
  // response: BetStepResponse
});
```

**Flow**:
```
1. Get game session
2. Mark session as inactive
3. Calculate win amount
4. Call wallet API (settleBet)
5. Update bet record
6. Rotate fairness seeds
7. Return response
8. Emit onBalanceChange
```

#### 5. Get Game Session
```javascript
socket.emit('gameService', {
  action: 'get-game-session'
}, (response) => {
  // response: BetStepResponse or { error: "no_session" }
});
```

#### 6. Get Game Seeds
```javascript
socket.emit('gameService', {
  action: 'get-game-seeds'
}, (response) => {
  // response: { userSeed, hashedServerSeed, nonce }
});
```

#### 7. Set User Seed
```javascript
socket.emit('gameService', {
  action: 'set-user-seed',
  payload: {
    userSeed: "my-seed-123"
  }
}, (response) => {
  // response: { success: true, userSeed: "..." }
});
```

#### 8. Get My Bets History
```javascript
socket.emit('gameService', {
  action: 'get-my-bets-history'
}, (response) => {
  // response: Array<BetHistoryItem>
});
```

**Response**:
```json
[
  {
    "id": "uuid",
    "createdAt": "2024-01-01T00:00:00Z",
    "gameId": 0,
    "finishCoeff": 0,
    "fairness": {
      "decimal": "...",
      "clientSeed": "...",
      "serverSeed": "...",
      "combinedHash": "...",
      "hashedServerSeed": "..."
    },
    "betAmount": 10.00,
    "win": 15.50,
    "withdrawCoeff": 1.55,
    "operatorId": "agent123",
    "userId": "user456",
    "currency": "INR",
    "gameMeta": {
      "coeff": "1.55",
      "difficulty": "EASY"
    }
  }
]
```

---

### Ping/Pong

**Event**: `ping`

**Response**: `pong` with timestamp

```javascript
socket.emit('ping', {}, (response) => {
  // response: { ts: 1234567890 }
});
```

---

## Health Endpoints

### Health Check

**Endpoint**: `GET /health`

**Purpose**: Application health status.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Error Response**:
```json
{
  "status": "error",
  "timestamp": "2024-01-01T00:00:00Z",
  "error": "Error message"
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "status": "error-code",
  "desc": "Error description"
}
```

### WebSocket Error Format

```json
{
  "error": {
    "message": "Error message"
  }
}
```

### Common Error Codes

- `0000` - Success
- `0001` - Parameter missing
- `0002` - Invalid agentId
- `0003` - Invalid userId
- `0004` - Invalid currency
- `0005` - Account already exists
- `0006` - Account not found
- `0007` - Unable to proceed
- `0008` - Invalid IP address

### WebSocket Error Messages

- `missing_action` - Action not provided
- `missing_context` - Missing user/agent context
- `active_session_exists` - User has active session
- `validation_failed` - Request validation failed
- `invalid_bet_amount` - Invalid bet amount
- `agent_rejected` - Agent rejected operation
- `no_active_session` - No active game session
- `invalid_step_sequence` - Invalid step sequence
- `settlement_failed` - Settlement failed

---

## Rate Limiting

Currently not implemented. Consider adding:
- Per-agent rate limits
- Per-user rate limits
- Per-IP rate limits

---

## CORS Configuration

**Enabled**: Yes

**Origins**: `*` (all origins)

**Methods**: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD

**Headers**: Content-Type, Authorization, Accept, Origin, X-Requested-With

**Credentials**: false (required when origin is `*`)

