# Chicken Road - Game Flow Documentation

## Overview

Chicken Road is a risk-based progression game where players navigate through 15 columns (0-14), avoiding hazards and collecting multiplied winnings at each safe step.

---

## Game Flow States

### 1. **CONNECTION**

When the WebSocket connects successfully:

- Client receives: `onBalanceChange`, `betConfig`, `betsRanges`, `myData` events
- Client immediately calls: `gameService` action `get-game-config` with ACK callback
- Response contains: `betConfig`, `coefficients` (multipliers for each difficulty), `lastWin`

**Response Structure:**

```typescript
{
  betConfig: Record<string, any>,
  coefficients: {
    EASY: ["1.10", "1.21", "1.33", ...],
    MEDIUM: ["1.15", "1.32", "1.52", ...],
    HARD: ["1.20", "1.44", "1.73", ...],
    DAREDEVIL: ["1.30", "1.69", "2.20", ...]
  },
  lastWin: {
    username: "Salmon Delighted Loon",
    winAmount: "306.00",
    currency: "USD"
  }
}
```

---

### 2. **BET PLACEMENT** (Action: `bet`)

**Request:**

```typescript
{
  action: "bet",
  payload: {
    betAmount: "10.00",
    difficulty: "EASY", // EASY | MEDIUM | HARD | DAREDEVIL
    currency: "USD",
    countryCode: "IN"
  }
}
```

**Success Response:**

```typescript
{
  isFinished: false,
  coeff: "0.00",
  winAmount: "0.00",
  difficulty: "EASY",
  betAmount: "10.00",
  currency: "USD",
  lineNumber: -1  // Starting position (before first step)
}
```

**Backend Operations:**

1. Validates no active session exists
2. Validates bet amount is valid
3. Calls single-wallet API to place bet (deduct from balance)
4. Creates bet record in database
5. Creates game session in Redis with:
   - Current step: -1
   - Win amount: 0
   - Active: true
   - Coefficients array for difficulty level
6. Returns initial response

**Error Cases:**

- `active_session_exists` - User already has an active game
- `validation_failed` - Invalid payload
- `invalid_bet_amount` - Bet amount <= 0 or not finite
- `agent_rejected` - Wallet service rejected bet placement

---

### 3. **STEP FLOW** (Action: `step`)

Players make steps from line -1 → 0 → 1 → 2 ... → 14 (total 15 columns)

**Request:**

```typescript
{
  action: "step",
  payload: {
    lineNumber: 0  // Must be currentStep + 1
  }
}
```

**Success Response (Safe Step):**

```typescript
{
  isFinished: false,
  isWin: false,
  lineNumber: 0,
  winAmount: "11.00",  // betAmount * coefficient[0]
  betAmount: "10.00",
  coeff: "1.10",
  difficulty: "EASY",
  currency: "USD"
  // No endReason - game continues
}
```

**Success Response (Hit Hazard):**

```typescript
{
  isFinished: true,
  isWin: false,
  lineNumber: 5,
  winAmount: "0.00",
  betAmount: "10.00",
  coeff: "1.61",
  difficulty: "EASY",
  currency: "USD",
  endReason: "hazard",
  collisionPositions: ["3", "5", "7"]  // All hazard positions revealed
}
```

**Success Response (Final Step - Auto Win):**

```typescript
{
  isFinished: true,
  isWin: true,
  lineNumber: 14,
  winAmount: "536.23",
  betAmount: "10.00",
  coeff: "53.62",
  difficulty: "EASY",
  currency: "USD",
  endReason: "win"
}
```

**Backend Operations:**

1. Validates active session exists
2. Validates lineNumber === currentStep + 1 (sequential)
3. **If line 14 (final step):** Auto-win, set endReason = 'win'
4. **Else:** Check hazard scheduler for active hazards
   - Safe: Update currentStep, calculate winAmount = betAmount \* coeff[step]
   - Hazard: Set isActive=false, winAmount=0, endReason='hazard'
5. **If game ended:** Call single-wallet settleBet API and record settlement in DB
6. Return response

**Hazard Configuration:**

- **EASY:** 3 random hazards per 15 columns
- **MEDIUM:** 4 random hazards per 15 columns
- **HARD:** 5 random hazards per 15 columns
- **DAREDEVIL:** 7 random hazards per 15 columns

**Error Cases:**

- `no_active_session` - No game in progress
- `invalid_step_sequence` - lineNumber !== currentStep + 1

---

### 4. **CASHOUT FLOW** (Action: `cashout`)

**Request:**

```typescript
{
  action: "cashout";
}
```

**Success Response:**

```typescript
{
  isFinished: true,
  isWin: false,
  lineNumber: 3,
  winAmount: "14.64",
  betAmount: "10.00",
  coeff: "1.46",
  difficulty: "EASY",
  currency: "USD",
  endReason: "cashout"
}
```

**Backend Operations:**

1. Validates active session exists
2. Sets isActive = false
3. Finalizes winAmount at current step
4. Calls single-wallet settleBet API with current winAmount
5. Records settlement in database with `settleType: 'cashout'`
6. Returns final state

**Error Cases:**

- `no_active_session` - No active game to cashout

---

### 5. **GET SESSION** (Action: `get-game-session`)

Retrieves current game state (useful after reconnection).

**Request:**

```typescript
{
  action: "get-game-session";
}
```

**Success Response:**

```typescript
{
  isFinished: boolean,
  isWin: boolean,
  lineNumber: number,
  winAmount: string,
  betAmount: string,
  coeff: string,
  difficulty: string,
  currency: string,
  endReason?: 'win' | 'cashout' | 'hazard',
  collisionPositions?: string[]
}
```

**Backend Operations:**

1. Fetches session from Redis
2. Reconstructs response with current state
3. Determines endReason based on isActive/isWin/collisionColumns

**Error Cases:**

- `no_session` - No session found in Redis

---

## Complete Game Example

### Scenario: Player wins after 5 safe steps then cashes out

1. **Connect:**

   - Get config with coefficients: `["1.10", "1.21", "1.33", "1.46", "1.61", "1.77", ...]`

2. **Place Bet:**

   ```
   Bet: 10.00 USD, Difficulty: EASY
   Response: lineNumber=-1, winAmount=0.00, isFinished=false
   ```

3. **Step 0:**

   ```
   Request: lineNumber=0
   Response: lineNumber=0, winAmount=11.00 (10*1.10), coeff=1.10, isFinished=false
   ```

4. **Step 1:**

   ```
   Request: lineNumber=1
   Response: lineNumber=1, winAmount=12.10 (10*1.21), coeff=1.21, isFinished=false
   ```

5. **Step 2:**

   ```
   Request: lineNumber=2
   Response: lineNumber=2, winAmount=13.30 (10*1.33), coeff=1.33, isFinished=false
   ```

6. **Step 3:**

   ```
   Request: lineNumber=3
   Response: lineNumber=3, winAmount=14.60 (10*1.46), coeff=1.46, isFinished=false
   ```

7. **Step 4:**

   ```
   Request: lineNumber=4
   Response: lineNumber=4, winAmount=16.10 (10*1.61), coeff=1.61, isFinished=false
   ```

8. **Cashout:**
   ```
   Request: action=cashout
   Response: lineNumber=4, winAmount=16.10, endReason="cashout", isFinished=true
   Settlement: Player wins 16.10 - 10.00 = 6.10 profit
   ```

---

## UI Implementation Notes

### Visual Grid

- Display 15 columns (0-14)
- Show current position with highlight
- Show passed positions as green ✅
- Show hazards when game ends with 💥
- Show next position with ❓
- Display multiplier on each passed column

### Game State

- **Before Bet:** Show only bet configuration
- **After Bet (lineNumber=-1):** Show "Game Active - Make first step"
- **During Game:** Enable "Step" and "Cashout" buttons
- **After Hazard/Win/Cashout:** Disable buttons, show final results

### Response Handling

All responses come through ACK callbacks as Arrays:

```typescript
socket.emit("gameService", payload, (ack) => {
  if (Array.isArray(ack) && ack.length > 0) {
    const response = ack[0];
    // Handle response
  }
});
```

---

## Settlement Flow

### Win/Hazard Auto-Settlement

When game ends (win or hazard), backend automatically:

1. Calculates settlement: `finalWinAmount - betAmount`
2. Calls `settleBet(agentId, platformTxId, userId, settlement, roundId, betAmount)`
3. Records in database with final balance

### Cashout Manual Settlement

When player cashes out:

1. Uses current `winAmount` at current step
2. Calls same settleBet API
3. Records with `settleType: 'cashout'`

---

## Error Handling

### Connection Errors

- `MISSING_GAMEMODE` - gameMode query parameter missing
- `MISSING_OPERATOR_ID` - operatorId query parameter missing
- `MISSING_AUTH` - Authorization token missing
- `INVALID_TOKEN` - JWT verification failed

### Game Errors

- `active_session_exists` - Cannot bet while game active
- `validation_failed` - Invalid payload structure
- `no_active_session` - No game to continue/cashout
- `invalid_step_sequence` - Steps must be sequential
- `settlement_failed` - Settlement API call failed (logged, game continues)

---

## Key Technical Details

1. **Step Sequence:** Must always be current + 1, enforced server-side
2. **Hazard Refresh:** Hazards regenerate every 5000ms (5 seconds)
3. **Decimal Precision:** All amounts use 2 decimal places (`.toFixed(2)`)
4. **Auto-Win:** Reaching line 14 (final step) triggers automatic win
5. **Session Storage:** Redis with configurable TTL (default 3600s)
6. **Bet Records:** All bets stored in MySQL with placement and settlement data
7. **Platform Integration:** Single wallet functions handle all balance operations

---

## Testing Checklist

- [ ] Connect and receive initial events
- [ ] Get game config with ACK callback
- [ ] Place bet and start at lineNumber=-1
- [ ] Make sequential steps (0, 1, 2, ...)
- [ ] Hit hazard and see collisionPositions
- [ ] Reach final step (14) and auto-win
- [ ] Cashout mid-game and see final state
- [ ] Attempt invalid step sequence (should error)
- [ ] Place bet while game active (should error)
- [ ] Cashout with no active game (should error)
- [ ] Reconnect and get session state
- [ ] Test all difficulty levels (EASY, MEDIUM, HARD, DAREDEVIL)
