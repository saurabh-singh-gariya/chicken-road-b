# Chicken Road - Happy Flow Documentation

## Overview

This document describes the complete happy flow for the Chicken Road game, from player connection through game completion.

---

## 🎮 Game Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLAYER CONNECTS (WebSocket)                   │
│  Query Params: token, gameMode, operatorId                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AUTHENTICATION & SETUP                         │
│  • JWT Token Verification                                        │
│  • Emit: balanceChange, betsRanges, betConfig, myData          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PLACE BET                                  │
│  Action: "bet"                                                   │
│  Payload: { betAmount, difficulty, currency }                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP THROUGH GAME                             │
│  Action: "step"                                                  │
│  Payload: { lineNumber: 0, 1, 2, ... }                          │
│  Repeats until: WIN, LOSE (hazard), or CASHOUT                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GAME ENDS & SETTLEMENT                        │
│  • WIN: Reached final column                                    │
│  • LOSE: Hit hazard column                                      │
│  • CASHOUT: Player cashes out mid-game                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📡 Step-by-Step Flow

### **Step 1: WebSocket Connection**

**Endpoint:** `wss://your-domain.com/io/`

**Query Parameters:**

- `Authorization`: JWT token
- `gameMode`: Game mode identifier
- `operatorId`: Agent/Operator ID

**Connection Process:**

1. Client connects with query parameters
2. Gateway validates all required parameters
3. JWT token is verified using `JwtTokenService`
4. Socket data is populated with:
   ```typescript
   {
     auth: { sub: userId, ... },
     gameMode: "normal",
     operatorId: "agent123"
   }
   ```

**Emitted Events:**

- `onBalanceChange`: `{ currency: "USD", balance: "1000000" }`
- `betsRanges`: `{ INR: ["0.01", "150.00"] }`
- `betConfig`: Coefficient configurations per difficulty
- `myData`: `{ userId, nickname, gameAvatar }`

---

### **Step 2: Place Bet**

**WebSocket Event:** `gameService` (with acknowledgment)

**Request:**

```json
{
  "action": "bet",
  "payload": {
    "betAmount": "10.00",
    "difficulty": "medium",
    "currency": "USD"
  }
}
```

**Backend Processing (`performBetFlow`):**

1. **Check for Existing Session**

   - Redis Key: `gameSession:${userId}-${agentId}`
   - If active session exists → Error: `active_session_exists`

2. **Validate Payload**

   - Uses `class-validator` with `BetPayloadDto`
   - Validates: betAmount (number > 0), difficulty (enum), currency (string)

3. **Generate IDs**

   ```typescript
   roundId = `${userId}${Date.now()}`;
   platformTxId = `${userId}-${agentId}-${uuid()}`;
   ```

4. **Call Agent API (placeBet)**

   - Deducts bet amount from player's balance
   - Returns: `{ status, balance, balanceTs, userId }`
   - Expected status: `"0000"` for success

5. **Create Database Record**

   - Table: `bet`
   - Status: `BetStatus.PLACED`
   - Stores: platformTxId, userId, roundId, difficulty, betAmount, currency, etc.

6. **Load Game Configuration**

   - Fetches coefficients from database config
   - Example: `{ EASY: ["1.1", "1.2", ...], MEDIUM: [...], ... }`

7. **Create Game Session (Redis)**
   ```typescript
   {
     userId: "user123",
     agentId: "agent456",
     currency: "USD",
     difficulty: "MEDIUM",
     coefficients: ["1.1", "1.2", "1.3", ...],
     currentStep: -1,           // No steps taken yet
     winAmount: 0,
     betAmount: 10.00,
     isActive: true,
     isWin: false,
     platformBetTxId: "...",
     roundId: "...",
     createdAt: Date
   }
   ```
   - TTL: 3600 seconds (1 hour)

**Response:**

```json
{
  "isFinished": false,
  "coeff": "0.00",
  "winAmount": "0.00",
  "difficulty": "MEDIUM",
  "betAmount": "10.00",
  "currency": "USD"
}
```

---

### **Step 3: Make Steps**

**WebSocket Event:** `gameService` (with acknowledgment)

**Request:**

```json
{
  "action": "step",
  "payload": {
    "lineNumber": 0
  }
}
```

**Backend Processing (`performStepFlow`):**

1. **Load Game Session**

   - Redis Key: `gameSession:${userId}-${agentId}`
   - Validate: session exists and `isActive === true`

2. **Validate Step Sequence**

   ```typescript
   expected = currentStep + 1; // e.g., -1 + 1 = 0 for first step
   if (lineNumber !== expected) return { error: "invalid_step_sequence" };
   ```

3. **Check if Final Step**

   ```typescript
   totalColumns = coefficients.length; // e.g., 15
   if (lineNumber === totalColumns - 1) {
     // AUTO WIN - Player reached the end!
   }
   ```

4. **If Not Final Step → Check Hazards**

   - Call: `hazardSchedulerService.getActiveHazards(difficulty)`
   - Returns: Array of hazard column indices, e.g., `[2, 5, 8, 11, 14]`
   - Check: `hazardColumns.includes(lineNumber)`

5. **Outcome Scenarios:**

   **A) Safe Step (No Hazard)**

   ```typescript
   currentStep = lineNumber
   winAmount = betAmount × coefficients[lineNumber]
   // Continue playing
   ```

   **B) Hit Hazard (LOSE)**

   ```typescript
   isActive = false
   isWin = false
   winAmount = 0
   collisionColumns = hazardColumns
   currentStep = lineNumber
   → Trigger Settlement
   ```

   **C) Final Step (WIN)**

   ```typescript
   currentStep = lineNumber
   winAmount = betAmount × coefficients[lineNumber]
   isActive = false
   isWin = true
   → Trigger Settlement
   ```

6. **Update Redis Session**

   - Save updated game session back to Redis

7. **Settlement (if game ended)**

   **Calculate Settlement Amount:**

   ```typescript
   finalWinAmount = isWin ? winAmount : 0
   settlementAmount = finalWinAmount - betAmount

   Examples:
   - Win $25 on $10 bet → settlementAmount = +$15 (net gain)
   - Lose $10 bet → settlementAmount = -$10 (net loss)
   ```

   **Call Agent API (settleBet):**

   - Sends net gain/loss amount
   - Returns updated balance

   **Update Database (recordSettlement):**

   ```typescript
   {
     externalPlatformTxId: platformTxId,
     winAmount: finalWinAmount,
     settledAt: new Date(),
     balanceAfterSettlement: settleResult.balance,
     updatedBy: userId
   }
   ```

   - Bet status automatically set to `WON` or `LOST` based on winAmount

**Response (Safe Step):**

```json
{
  "isFinished": false,
  "isWin": false,
  "lineNumber": "0",
  "winAmount": "11.00",
  "betAmount": "10.00",
  "coeff": "1.10",
  "difficulty": "MEDIUM",
  "currency": "USD"
}
```

**Response (Win/Lose):**

```json
{
  "isFinished": true,
  "isWin": true,
  "lineNumber": "14",
  "winAmount": "25.00",
  "betAmount": "10.00",
  "coeff": "2.50",
  "difficulty": "MEDIUM",
  "currency": "USD",
  "endReason": "win"
}
```

**Response (Hazard Hit):**

```json
{
  "isFinished": true,
  "isWin": false,
  "lineNumber": "5",
  "winAmount": "0.00",
  "betAmount": "10.00",
  "coeff": "1.50",
  "difficulty": "MEDIUM",
  "currency": "USD",
  "endReason": "hazard",
  "collisionPositions": ["2", "5", "8", "11", "14"]
}
```

---

### **Step 4: Cashout (Optional)**

**WebSocket Event:** `gameService` (with acknowledgment)

**Request:**

```json
{
  "action": "cashout"
}
```

**Backend Processing (`performCashOutFlow`):**

1. Load active game session
2. Validate: `isActive === true`
3. Calculate current winnings
4. Call agent settleBet API with current win amount
5. Update database with settlement
6. Mark session as inactive

**Response:**

```json
{
  "isFinished": true,
  "isWin": false,
  "lineNumber": "7",
  "winAmount": "18.50",
  "betAmount": "10.00",
  "coeff": "1.85",
  "difficulty": "MEDIUM",
  "currency": "USD",
  "endReason": "cashout"
}
```

---

## 🎲 Hazard System

### **Global Hazard Rotation**

The hazard system operates globally, synchronized across all players and game instances.

**Configuration:**

```typescript
{
  totalColumns: 15,
  hazardRefreshMs: 5000,  // Rotate every 5 seconds
  hazards: {
    EASY: 3,       // 3 hazard columns
    MEDIUM: 4,     // 4 hazard columns
    HARD: 5,       // 5 hazard columns
    DAREDEVIL: 7   // 7 hazard columns
  }
}
```

**Rotation Process:**

1. **On Application Startup** (`onModuleInit`):

   - Loads hazard config from database
   - Initializes hazard patterns for all difficulties
   - Stores in Redis with keys: `chicken-road-hazards-{difficulty}`

2. **Pattern Generation**:

   ```typescript
   // Example for MEDIUM difficulty (4 hazards, 15 columns)
   generateRandomPattern(4, 15);
   // Returns: [2, 5, 8, 11] (sorted unique random indices)
   ```

3. **Double Buffering**:

   ```typescript
   {
     current: [2, 5, 8, 11],      // Active pattern
     next: [1, 4, 9, 13],         // Pre-generated next pattern
     changeAt: Date,              // Rotation timestamp
     hazardCount: 4,
     generatedAt: Date
   }
   ```

4. **Every 5 Seconds**:
   - `current` becomes old (discarded)
   - `next` becomes `current`
   - Generate new `next`
   - Save to Redis
   - Schedule next rotation

**Key Features:**

- ✅ Zero-latency: Next pattern pre-generated
- ✅ Global sync: All players see same hazards at any moment
- ✅ Redis-backed: Survives app restarts
- ✅ History tracking: Maintains last 100 rotations per difficulty

---

## 💾 Data Flow

### **Redis Storage**

**Game Sessions:**

- **Key:** `gameSession:${userId}-${agentId}`
- **TTL:** 3600 seconds
- **Purpose:** Track active game state

**Hazard Patterns:**

- **Key:** `chicken-road-hazards-${difficulty}`
- **TTL:** None (persistent)
- **Purpose:** Store current/next hazard patterns

**Hazard History:**

- **Key:** `chicken-road-hazards-history-${difficulty}`
- **Type:** List
- **Size:** Max 100 entries
- **Purpose:** Audit trail of pattern changes

### **Database Storage (MySQL)**

**Bet Records (`bet` table):**

**On Bet Placement:**

```sql
INSERT INTO bet (
  externalPlatformTxId, userId, roundId, difficulty,
  betAmount, currency, status, platform, gameType,
  gameCode, gameName, betPlacedAt, balanceAfterBet,
  createdBy
) VALUES (...)
```

- Status: `PLACED`

**On Settlement:**

```sql
UPDATE bet SET
  winAmount = ?,
  status = ?,  -- WON or LOST (auto-determined)
  settledAt = ?,
  balanceAfterSettlement = ?,
  updatedBy = ?
WHERE externalPlatformTxId = ?
```

---

## 🔒 Error Handling

### **Common Errors**

| Error Code                  | Scenario                 | Resolution                            |
| --------------------------- | ------------------------ | ------------------------------------- |
| `missing_action`            | No action specified      | Include action field                  |
| `validation_failed`         | Invalid bet payload      | Check betAmount, difficulty, currency |
| `invalid_bet_amount`        | Amount ≤ 0 or NaN        | Send positive number                  |
| `active_session_exists`     | Bet while game active    | Finish or cashout current game        |
| `no_active_session`         | Step/cashout without bet | Place bet first                       |
| `invalid_step_sequence`     | Wrong lineNumber         | Follow sequence: 0, 1, 2, ...         |
| `agent_rejected`            | Agent API failure        | Check balance, agent status           |
| `invalid_difficulty_config` | Missing coefficients     | Verify game config in DB              |

### **Agent API Errors**

If agent API returns status ≠ `"0000"`:

- Bet placement rejected
- Error returned to client: `{ error: 'agent_rejected' }`
- No database record created
- No session created

---

## 📊 Example Complete Flow

### **Scenario: Player Wins**

```
1. CONNECT
   → Socket established
   → Balance: $1000

2. BET
   Request: { action: "bet", payload: { betAmount: "10", difficulty: "medium", currency: "USD" } }
   → Agent deducts $10 → Balance: $990
   → DB: bet record created (status: PLACED)
   → Redis: session created (currentStep: -1)
   Response: { isFinished: false, coeff: "0.00", winAmount: "0.00" }

3. STEP 0
   Request: { action: "step", payload: { lineNumber: 0 } }
   → Hazards: [2, 5, 8, 11] (not hit)
   → currentStep: 0, winAmount: $11.00 (10 × 1.1)
   Response: { isFinished: false, winAmount: "11.00", coeff: "1.10" }

4. STEP 1
   Request: { action: "step", payload: { lineNumber: 1 } }
   → Hazards: [2, 5, 8, 11] (not hit)
   → currentStep: 1, winAmount: $12.00 (10 × 1.2)
   Response: { isFinished: false, winAmount: "12.00", coeff: "1.20" }

5. STEP 2
   Request: { action: "step", payload: { lineNumber: 2 } }
   → Hazards: [2, 5, 8, 11] (HIT!)
   → Game ends: isWin: false, winAmount: $0
   → Agent settlement: -$10 (player loses bet)
   → DB: bet updated (status: LOST, winAmount: 0)
   Response: {
     isFinished: true,
     isWin: false,
     winAmount: "0.00",
     endReason: "hazard",
     collisionPositions: ["2", "5", "8", "11"]
   }
```

---

## 🎯 Key Implementation Details

### **Step Validation**

- First step must be lineNumber = 0
- Each subsequent step must be currentStep + 1
- Cannot skip steps or go backwards

### **Final Step Detection**

- If columns = 15, final step is lineNumber = 14 (0-indexed)
- Final step triggers automatic win
- No hazard check on final step

### **Settlement Calculation**

```typescript
// Net gain/loss sent to agent
finalWinAmount = isWin ? winAmount : 0;
settlementAmount = finalWinAmount - betAmount;

// Examples:
// Win: $25 win on $10 bet → send +$15
// Loss: $0 win on $10 bet → send -$10
// Cashout: $18 win on $10 bet → send +$8
```

### **Concurrency Protection**

- One active session per userId-agentId pair
- New bet rejected if active session exists
- Session expires after 1 hour (auto-cleanup)

### **Hazard Race Condition**

- Hazards rotate every 5 seconds globally
- If player takes >5 seconds between steps, hazards may change
- This is intentional design (dynamic difficulty)
- Player sees current hazards at each step, not starting hazards

---

## 🔧 Configuration

### **Database Config Required**

**Table: `game_config`**

1. **Coefficients:**

```json
{
  "key": "coefficients",
  "value": {
    "EASY": ["1.05", "1.10", "1.15", ...],
    "MEDIUM": ["1.10", "1.20", "1.30", ...],
    "HARD": ["1.20", "1.40", "1.60", ...],
    "DAREDEVIL": ["1.50", "2.00", "2.50", ...]
  }
}
```

2. **Hazard Config:**

```json
{
  "key": "hazardConfig",
  "value": {
    "totalColumns": 15,
    "hazardRefreshMs": 5000,
    "hazards": {
      "easy": 3,
      "medium": 4,
      "hard": 5,
      "daredevil": 7
    }
  }
}
```

3. **Bet Config:**

```json
{
  "key": "betConfig",
  "value": {
    "minBet": 1,
    "maxBet": 1000,
    "difficulties": ["easy", "medium", "hard", "daredevil"]
  }
}
```

---

## 📝 Notes

### **Currency Handling**

- Player selects currency in bet payload
- Currency passed to agent API for placement and settlement
- Database stores currency per bet
- No conversion - agent handles currency logic

### **Session Management**

- Sessions stored in Redis with 1-hour TTL
- Automatic cleanup on expiry
- No persistent session storage (by design)
- If Redis connection lost, active games are lost

### **Agent Integration**

- Agent must return status "0000" for success
- Agent handles balance updates (debit on bet, credit on settlement)
- Agent API structure follows single-wallet pattern
- Supports net settlement amounts (positive = win, negative = loss)

### **Performance Considerations**

- Redis used for high-speed session access
- Database writes minimized (only bet creation and settlement)
- Hazard rotation is async and non-blocking
- WebSocket reduces HTTP overhead

---

## 🚀 Testing Happy Flow

### **Manual Test Sequence**

1. **Connect:** Use WebSocket client (e.g., Socket.IO client)
2. **Authenticate:** Include valid JWT token in query params
3. **Place Bet:** Send bet action with valid payload
4. **Make Steps:** Send step actions sequentially (0, 1, 2, ...)
5. **Observe:** Check responses for safe/hazard/win outcomes
6. **Verify Database:** Check `bet` table for correct records
7. **Verify Redis:** Check session exists with correct state
8. **Check Agent:** Verify balance deductions and credits

### **Automated Test Cases**

- ✅ Place bet with valid payload → Success
- ✅ Place bet while active game → Error
- ✅ Step with correct sequence → Safe/Hazard response
- ✅ Step with wrong sequence → Error
- ✅ Reach final step → Auto win
- ✅ Hit hazard → Loss with collision positions
- ✅ Cashout mid-game → Settlement with current winnings
- ✅ Settlement updates database → Correct bet status

---

**Last Updated:** November 16, 2025
**Version:** 1.0
