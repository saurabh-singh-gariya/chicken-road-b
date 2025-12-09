# Logging Standards

## Overview
This document defines logging standards for tracking user actions, API calls, and system events throughout the application lifecycle.

## Log Format Structure

### Standard Log Format
```
[LEVEL] [TIMESTAMP] [CONTEXT] [ACTION] user={userId} agent={agentId} [KEY=VALUE ...] message
```

### Example
```
[INFO] [2025-01-15 10:30:45] [GamePlayService] [BET_PLACED] user=user123 agent=agent001 amount=50.00 currency=INR roundId=user1231705312245000 txId=abc-123
```

## Log Levels

- **ERROR**: System errors, exceptions, failures
- **WARN**: Warning conditions, validation failures, rejected operations
- **INFO**: Important business events (login, bet, settlement, etc.)
- **DEBUG**: Detailed diagnostic information (API calls, internal state)

## Required Logging Points

### 1. Authentication & User Management

#### User Login
- **When**: User successfully logs in
- **Level**: INFO
- **Required Fields**: userId, agentId, ipAddress, userAgent, tokenGenerated
- **Example**:
  ```
  [INFO] [LOGIN_SUCCESS] user=user123 agent=agent001 ip=192.168.1.1 tokenGenerated=true
  ```

#### User Logout
- **When**: User logs out or session expires
- **Level**: INFO
- **Required Fields**: userId, agentId, reason (logout/expired)
- **Example**:
  ```
  [INFO] [LOGOUT] user=user123 agent=agent001 reason=logout
  ```

#### Token Verification
- **When**: Token is verified (success/failure)
- **Level**: INFO (success) / WARN (failure)
- **Required Fields**: userId, agentId, tokenValid, reason (if failed)
- **Example**:
  ```
  [WARN] [TOKEN_VERIFICATION_FAILED] user=user123 agent=agent001 reason=expired
  ```

### 2. Wallet API Calls

#### Request Logging
- **When**: Before making wallet API call
- **Level**: DEBUG
- **Required Fields**: userId, agentId, apiAction, url, requestPayload
- **Example**:
  ```
  [DEBUG] [WALLET_API_REQUEST] user=user123 agent=agent001 action=placeBet url=https://... payload={"betAmount":50.00,"roundId":"..."}
  ```

#### Response Logging
- **When**: After receiving wallet API response
- **Level**: INFO (success) / ERROR (failure)
- **Required Fields**: userId, agentId, apiAction, status, balance, responseTime (ms)
- **Example**:
  ```
  [INFO] [WALLET_API_RESPONSE] user=user123 agent=agent001 action=placeBet status=0000 balance=950.00 responseTime=150ms
  ```

#### Error Logging
- **When**: Wallet API call fails
- **Level**: ERROR
- **Required Fields**: userId, agentId, apiAction, errorType, errorMessage, httpStatus, retryAttempt
- **Example**:
  ```
  [ERROR] [WALLET_API_ERROR] user=user123 agent=agent001 action=placeBet errorType=TIMEOUT_ERROR httpStatus=null retryAttempt=2
  ```

### 3. Gameplay Actions

#### Bet Placement
- **When**: User places a bet
- **Level**: INFO
- **Required Fields**: userId, agentId, betAmount, currency, difficulty, roundId, platformTxId
- **Example**:
  ```
  [INFO] [BET_PLACED] user=user123 agent=agent001 amount=50.00 currency=INR difficulty=MEDIUM roundId=user1231705312245000 txId=abc-123
  ```

#### Game Step
- **When**: User takes a step in the game
- **Level**: INFO
- **Required Fields**: userId, agentId, stepNumber, multiplier, winAmount, hitHazard (true/false)
- **Example**:
  ```
  [INFO] [GAME_STEP] user=user123 agent=agent001 step=5 multiplier=1.37 winAmount=68.50 hitHazard=false
  ```

#### Cashout
- **When**: User cashes out
- **Level**: INFO
- **Required Fields**: userId, agentId, stepNumber, finalMultiplier, winAmount, platformTxId
- **Example**:
  ```
  [INFO] [CASHOUT] user=user123 agent=agent001 step=10 multiplier=2.05 winAmount=102.50 txId=abc-123
  ```

#### Settlement (Win/Loss)
- **When**: Game ends and bet is settled
- **Level**: INFO
- **Required Fields**: userId, agentId, roundId, platformTxId, betAmount, winAmount, settlementAmount, status (WON/LOST), endReason
- **Example**:
  ```
  [INFO] [SETTLEMENT] user=user123 agent=agent001 roundId=user1231705312245000 txId=abc-123 betAmount=50.00 winAmount=102.50 settlementAmount=102.50 status=WON endReason=cashout
  ```

### 4. WebSocket Events

#### Connection
- **When**: User connects via WebSocket
- **Level**: INFO
- **Required Fields**: socketId, userId, agentId, gameMode, operatorId, ipAddress
- **Example**:
  ```
  [INFO] [WS_CONNECT] socketId=socket-123 user=user123 agent=agent001 gameMode=chicken-road-two operatorId=agent001 ip=192.168.1.1
  ```

#### Disconnection
- **When**: User disconnects from WebSocket
- **Level**: INFO
- **Required Fields**: socketId, userId, agentId, reason (disconnect/timeout/error)
- **Example**:
  ```
  [INFO] [WS_DISCONNECT] socketId=socket-123 user=user123 agent=agent001 reason=disconnect
  ```

#### Message Received
- **When**: WebSocket message received
- **Level**: DEBUG
- **Required Fields**: socketId, userId, agentId, action, payload
- **Example**:
  ```
  [DEBUG] [WS_MESSAGE] socketId=socket-123 user=user123 agent=agent001 action=BET payload={"betAmount":50.00,"difficulty":"MEDIUM"}
  ```

### 5. Session Management

#### Session Created
- **When**: Game session created in Redis
- **Level**: DEBUG
- **Required Fields**: userId, agentId, roundId, platformTxId, ttl (seconds)
- **Example**:
  ```
  [DEBUG] [SESSION_CREATED] user=user123 agent=agent001 roundId=user1231705312245000 txId=abc-123 ttl=3600
  ```

#### Session Expired
- **When**: Session expires or is removed
- **Level**: INFO
- **Required Fields**: userId, agentId, reason (expired/manual/refund)
- **Example**:
  ```
  [INFO] [SESSION_EXPIRED] user=user123 agent=agent001 reason=expired
  ```

### 6. Refund Operations

#### Refund Initiated
- **When**: Refund scheduler processes a bet
- **Level**: INFO
- **Required Fields**: userId, agentId, platformTxId, roundId, betAmount, reason
- **Example**:
  ```
  [INFO] [REFUND_INITIATED] user=user123 agent=agent001 txId=abc-123 roundId=user1231705312245000 amount=50.00 reason=session_expired
  ```

#### Refund Completed
- **When**: Refund successfully processed
- **Level**: INFO
- **Required Fields**: userId, agentId, platformTxId, refundTxId, refundAmount
- **Example**:
  ```
  [INFO] [REFUND_COMPLETED] user=user123 agent=agent001 txId=abc-123 refundTxId=refund-456 amount=50.00
  ```

## Best Practices

1. **Always Include User Context**: Every log should include userId and agentId when available
2. **Use Structured Format**: Use key=value pairs for easy parsing and searching
3. **Log Before and After**: Log both request and response for external API calls
4. **Include Timing**: Log response times for performance monitoring
5. **Error Context**: Include full error details (message, stack, httpStatus) for errors
6. **Sensitive Data**: Never log passwords, full tokens, or sensitive user data
7. **Consistent Action Names**: Use consistent action names (e.g., BET_PLACED, SETTLEMENT, etc.)
8. **Transaction IDs**: Always include transaction IDs (platformTxId, roundId) for traceability

## Log Analysis

Logs can be analyzed to:
- Track user journey from login to settlement
- Debug issues by following transaction IDs
- Monitor API performance (response times)
- Identify patterns in errors
- Audit user actions for compliance

## Example Complete User Flow

```
[INFO] [LOGIN_SUCCESS] user=user123 agent=agent001 ip=192.168.1.1
[INFO] [WS_CONNECT] socketId=socket-123 user=user123 agent=agent001
[DEBUG] [WALLET_API_REQUEST] user=user123 agent=agent001 action=placeBet amount=50.00
[INFO] [WALLET_API_RESPONSE] user=user123 agent=agent001 action=placeBet status=0000 balance=950.00 responseTime=150ms
[INFO] [BET_PLACED] user=user123 agent=agent001 amount=50.00 currency=INR roundId=user1231705312245000 txId=abc-123
[INFO] [GAME_STEP] user=user123 agent=agent001 step=1 multiplier=1.08 winAmount=54.00 hitHazard=false
[INFO] [GAME_STEP] user=user123 agent=agent001 step=2 multiplier=1.21 winAmount=60.50 hitHazard=false
[INFO] [CASHOUT] user=user123 agent=agent001 step=2 multiplier=1.21 winAmount=60.50 txId=abc-123
[DEBUG] [WALLET_API_REQUEST] user=user123 agent=agent001 action=settleBet winAmount=60.50
[INFO] [WALLET_API_RESPONSE] user=user123 agent=agent001 action=settleBet status=0000 balance=1010.50 responseTime=120ms
[INFO] [SETTLEMENT] user=user123 agent=agent001 roundId=user1231705312245000 txId=abc-123 betAmount=50.00 winAmount=60.50 settlementAmount=60.50 status=WON endReason=cashout
```

