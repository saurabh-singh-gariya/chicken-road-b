# Multi-Game Support - Complete Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Core Requirements](#core-requirements)
3. [Database Schema](#database-schema)
4. [Service Layer Changes](#service-layer-changes)
5. [Hazards & Config Per Game](#hazards--config-per-game)
6. [API Flow Changes](#api-flow-changes)
7. [Redis Key Structure](#redis-key-structure)
8. [Validation Points](#validation-points)
9. [Migration Strategy](#migration-strategy)
10. [Implementation Steps](#implementation-steps)
11. [Testing Checklist](#testing-checklist)
12. [Files to Create/Modify](#files-to-createmodify)

---

## Overview

Transform the current single-game system (chicken-road-2) into a multi-game platform where:
- Multiple games can be supported simultaneously
- Each game has isolated configurations and data
- Agents can have access to specific games
- Game code flows from login → WebSocket → game session → bet operations
- Hazards are isolated per game + difficulty
- Configs are stored per game

---

## Core Requirements

### 1. Game Identification
- `gameCode` is the primary identifier (e.g., 'chicken-road-2', 'game-xyz')
- `gameCode` is **mandatory** at all entry points (no default fallback)
- Flow: `doLoginAndLaunchGame` API → URL → `gameMode` in WebSocket → stored in `gameSession`

### 2. Database Architecture
- **Single table approach** (not separate tables per game)
- Use `gameCode` column with proper indexing for performance
- Separate `games` table for game metadata
- Separate `game_config_{gameCode}` tables for game-specific configurations

### 3. Agent-Game Access Control
- Agents can have access to multiple games
- Store `allowedGameCodes` as JSON array in `agents` table
- Validate agent access before allowing game operations

---

## Database Schema

### Games Table (NEW)
```sql
CREATE TABLE games (
  id VARCHAR(36) PRIMARY KEY,
  gameCode VARCHAR(64) UNIQUE NOT NULL,
  gameName VARCHAR(255) NOT NULL,
  platform VARCHAR(32) NOT NULL,        -- Moved from bets table
  gameType VARCHAR(32) NOT NULL,         -- Moved from bets table
  settleType VARCHAR(50) NOT NULL,      -- Moved from bets table
  isActive BOOLEAN DEFAULT TRUE,
  createdAt DATETIME(3),
  updatedAt DATETIME(3),
  INDEX idx_active (isActive)
);
```

### Updated Bets Table
**Removed columns:** `platform`, `gameType`, `gameName`, `settleType` (moved to games table)
**Added column:** `gameCode` (required, indexed)

**Required columns (24 total):**
1. `id` (UUID, PK)
2. `externalPlatformTxId` (unique, indexed)
3. `userId` (indexed)
4. `roundId` (indexed)
5. `gameCode` (indexed, references games.gameCode)
6. `difficulty` (ENUM)
7. `betAmount` (DECIMAL)
8. `winAmount` (DECIMAL, nullable)
9. `currency` (VARCHAR)
10. `status` (ENUM)
11. `operatorId` (indexed)
12. `settlementRefTxId` (nullable)
13. `betPlacedAt` (datetime, indexed)
14. `settledAt` (datetime, nullable)
15. `createdAt` (auto)
16. `updatedAt` (auto)
17. `balanceAfterBet` (DECIMAL, nullable)
18. `balanceAfterSettlement` (DECIMAL, nullable)
19. `gameInfo` (TEXT, nullable)
20. `fairnessData` (JSON, nullable)
21. `finalCoeff` (DECIMAL, nullable)
22. `withdrawCoeff` (DECIMAL, nullable)
23. `createdBy` (nullable)
24. `updatedBy` (nullable)

**Indexes:**
- `idx_external_tx` (unique on externalPlatformTxId)
- `idx_gameCode` (on gameCode)
- `idx_userId` (on userId)
- `idx_roundId` (on roundId)
- `idx_operatorId` (on operatorId)
- `idx_betPlacedAt` (on betPlacedAt)
- `idx_game_user` (composite: gameCode, userId)
- `idx_game_round` (composite: gameCode, roundId)
- `idx_game_status` (composite: gameCode, status)
- `idx_game_created` (composite: gameCode, createdAt)

### Per-Game Config Tables
```sql
-- Each game has its own config table
CREATE TABLE game_config_chicken_road_2 (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key VARCHAR(255) NOT NULL,
  value TEXT,
  updatedAt DATETIME,
  UNIQUE KEY uk_key (key),
  INDEX idx_key (key)
);

-- Similar tables for each game: game_config_{normalized_gameCode}
-- Normalization: gameCode.toLowerCase().replace(/-/g, '_')
-- Example: 'chicken-road-2' → 'chicken_road_2'
```

**Config keys per game:**
- `hazardConfig` - Hazard rotation config
- `betConfig` - Betting limits and presets
- `coefficients` - Multiplier arrays per difficulty
- `lastWin` - Last win display data
- Any other game-specific configs

### Updated Agents Table
```sql
ALTER TABLE agents 
ADD COLUMN allowedGameCodes JSON NULL DEFAULT ('[]');
```

**Structure:**
- `allowedGameCodes`: JSON array of game codes, e.g., `["chicken-road-2", "game-xyz"]`
- If `NULL` or empty array `[]`, agent has access to all games (backward compatibility)
- If populated, agent only has access to listed games

### Config Structure Examples (Per Game)

```json
// hazardConfig (stored in game_config_{gameCode} table, key='hazardConfig')
{
  "totalColumns": {
    "EASY": 30,
    "MEDIUM": 25,
    "HARD": 22,
    "DAREDEVIL": 18
  },
  "hazardRefreshMs": 5000,
  "hazards": {
    "EASY": 3,
    "MEDIUM": 4,
    "HARD": 5,
    "DAREDEVIL": 7
  }
}

// coefficients (stored in game_config_{gameCode} table, key='coefficients')
{
  "EASY": ["1.01", "1.03", ...],
  "MEDIUM": ["1.08", "1.21", ...],
  "HARD": ["1.18", "1.46", ...],
  "DAREDEVIL": ["1.44", "2.21", ...]
}

// betConfig (stored in game_config_{gameCode} table, key='betConfig')
{
  "minBetAmount": "0.01",
  "maxBetAmount": "150.00",
  "maxWinAmount": "10000.00",
  "defaultBetAmount": "0.60",
  "betPresets": ["0.5", "1", "2", "7"],
  "decimalPlaces": "2",
  "currency": "INR"
}
```

---

## Service Layer Changes

### 1. GameService (NEW)
```typescript
@Injectable()
export class GameService {
  async getGame(gameCode: string): Promise<Game>
  async validateGame(gameCode: string): Promise<void>  // Throws if not found/inactive
  async getActiveGames(): Promise<Game[]>
  async getGamePayloads(gameCode: string): Promise<{
    platform: string;
    gameType: string;
    gameCode: string;
    gameName: string;
    settleType: string;
  }>
  normalizeGameCode(gameCode: string): string  // For table names
}
```

### 2. GameConfigService (UPDATED)
```typescript
@Injectable()
export class GameConfigService {
  // Get config repository for specific game
  private getConfigRepository(gameCode: string): Repository<GameConfig>
  
  // All methods now require gameCode parameter
  async getConfig(gameCode: string, key: string): Promise<any>
  async setConfig(gameCode: string, key: string, value: string): Promise<GameConfig>
  async getGamePayloads(gameCode: string): Promise<any>  // From games table
  async getBetConfig(gameCode: string): Promise<any>
  async getCoefficients(gameCode: string): Promise<Record<string, string[]>>
  async getHazardConfig(gameCode: string): Promise<{
    totalColumns: Record<Difficulty, number>;
    hazardRefreshMs: number;
    hazards: Record<Difficulty, number>;
  }>
  async getGameConfigPayload(gameCode: string): Promise<GameConfigPayload>
  
  // Normalize gameCode for table names
  private normalizeGameCode(gameCode: string): string {
    return gameCode.toLowerCase().replace(/-/g, '_');
  }
}
```

### 3. AgentsService (UPDATED)
```typescript
@Injectable()
export class AgentsService {
  // New methods for game access control
  async hasGameAccess(agentId: string, gameCode: string): Promise<boolean>
  async addGameAccess(agentId: string, gameCode: string): Promise<Agents>
  async removeGameAccess(agentId: string, gameCode: string): Promise<Agents>
  async findAgentsByGame(gameCode: string): Promise<Agents[]>
}
```

### 4. BetService (UPDATED)
```typescript
@Injectable()
export class BetService {
  // All methods now require gameCode parameter
  async createPlacement(params: CreateBetParams & { gameCode: string }): Promise<Bet>
  async recordSettlement(params: SettlementParams & { gameCode: string }): Promise<Bet>
  async findBetByRoundId(gameCode: string, roundId: string): Promise<Bet>
  async findBetByPlatformTxId(gameCode: string, txId: string): Promise<Bet>
  async updateStatus(params: UpdateBetStatusParams & { gameCode: string }): Promise<Bet>
}
```

### 5. GamePlayService (UPDATED)
```typescript
@Injectable()
export class GamePlayService {
  // All methods now require gameCode:
  async performBetFlow(
    userId: string,
    agentId: string,
    gameCode: string,  // NEW: Required
    gameMode: string,
    incoming: any,
  ): Promise<BetStepResponse | { error: string }>
  
  async performStepFlow(
    userId: string,
    agentId: string,
    gameCode: string,  // NEW: Required
    lineNumber: number,
  ): Promise<BetStepResponse | { error: string }>
  
  async performCashoutFlow(
    userId: string,
    agentId: string,
    gameCode: string,  // NEW: Required
    incoming: any,
  ): Promise<BetStepResponse | { error: string }>
  
  async getGameConfigPayload(gameCode: string): Promise<GameConfigPayload>
  
  // Redis key pattern changed:
  // Old: gameSession:${userId}-${agentId}
  // New: gameSession:${userId}-${agentId}-${gameCode}
}
```

### 6. HazardSchedulerService (UPDATED)
```typescript
@Injectable()
export class HazardSchedulerService implements OnModuleInit, OnModuleDestroy {
  // Timers: key = `${gameCode}-${difficulty}`
  private timers: Record<string, NodeJS.Timeout> = {};
  
  // States: key = `${gameCode}-${difficulty}`
  private states: Record<string, HazardState> = {};
  
  // Config cache: key = gameCode
  private configs: Record<string, {
    totalColumns: Record<Difficulty, number>;
    hazardRefreshMs: number;
    hazards: Record<Difficulty, number>;
  }> = {};
  
  // All methods now require gameCode parameter
  async getCurrentState(
    gameCode: string,
    difficulty: Difficulty,
  ): Promise<HazardState | undefined>
  
  async getActiveHazards(
    gameCode: string,
    difficulty: Difficulty,
  ): Promise<number[]>
  
  async isHazard(
    gameCode: string,
    difficulty: Difficulty,
    columnIndex: number,
  ): Promise<boolean>
  
  // Private methods
  private redisKey(gameCode: string, difficulty: Difficulty): string {
    return `hazards-${gameCode}-${difficulty}`;
  }
  
  private stateKey(gameCode: string, difficulty: Difficulty): string {
    return `${gameCode}-${difficulty}`;
  }
  
  private async loadGameConfig(gameCode: string): Promise<void>
  private async initializeGameDifficulty(gameCode: string, difficulty: Difficulty): Promise<void>
  private async rotateGameDifficulty(gameCode: string, difficulty: Difficulty): Promise<void>
  private async scheduleRotation(gameCode: string, difficulty: Difficulty): void
}
```

---

## Hazards & Config Per Game

### Architecture Decision

**Option 1: One Leader for All Games (Recommended)**
- Single leader election handles all games
- State tracked per `gameCode-difficulty` combination
- Simpler implementation, less overhead
- Redis keys: `hazards-${gameCode}-${difficulty}`

**Decision: Use Option 1** - One leader manages all games, but state is isolated per game+difficulty.

### Updated HazardState Interface
```typescript
export interface HazardState {
  gameCode: string;        // NEW: Game identifier
  difficulty: Difficulty;
  current: number[];       // Active hazard column indices
  next: number[];          // Next pattern (becomes current after changeAt)
  changeAt: number;        // Epoch timestamp (ms) when rotation occurs
  hazardCount: number;     // Number of hazards for this difficulty
  generatedAt: string;     // ISO8601 timestamp of generation
}
```

### Key Implementation Points

1. **Lazy Initialization**: Hazards are initialized on first access (not all at startup)
2. **Config Caching**: Game configs are cached in memory to reduce DB calls
3. **Leader Election**: One leader handles all games (simpler than per-game leaders)
4. **State Isolation**: Each `gameCode-difficulty` combination has isolated state
5. **Backward Compatibility**: Default configs used if game config not found

---

## API Flow Changes

### 1. doLoginAndLaunchGame API
**Current:** Receives `gameCode` but doesn't use it
**New:**
- Validate `gameCode` exists in `games` table and `isActive = true`
- Validate agent has access to game (check `allowedGameCodes`)
- Embed `gameCode` in returned URL as `gameMode` query parameter
- Example: `https://game.example.com?token=xxx&gameMode=chicken-road-2`

### 2. WebSocket Connection (handleConnection)
**Current:** Extracts `gameMode` from query params
**New:**
- Extract `gameMode` (which is `gameCode`)
- Validate `gameCode` exists in `games` table
- Validate agent has access to this game
- Store in `client.data.gameCode` (explicit field)
- Store in `client.data.gameMode` (for backward compatibility)

### 3. Game Operations
All game operations (bet, step, cashout) must:
- Extract `gameCode` from `client.data.gameCode` or session
- Validate agent has access to game
- Use `gameCode`-specific Redis keys
- Use `gameCode`-specific configs
- Pass `gameCode` to hazard scheduler calls

---

## Redis Key Structure

### Game Sessions
- **Old:** `gameSession:${userId}-${agentId}`
- **New:** `gameSession:${userId}-${agentId}-${gameCode}`
- **Example:** `gameSession:user123-agent456-chicken-road-2`

### Hazards (Per Game + Difficulty)
- **Old:** `chicken-road-hazards-${difficulty}`
- **New:** `hazards-${gameCode}-${difficulty}`
- **Example:** `hazards-chicken-road-2-EASY`, `hazards-game-xyz-MEDIUM`

### Hazard History (Per Game + Difficulty)
- **Old:** `chicken-road-hazards-history-${difficulty}`
- **New:** `hazards-history-${gameCode}-${difficulty}`

### Pub/Sub Channels (Per Game + Difficulty)
- **Old:** `hazard-rotation-${difficulty}`
- **New:** `hazard-rotation-${gameCode}-${difficulty}`

### Game Config Cache
- **Pattern:** `game.config.${gameCode}.${key}`
- **Example:** `game.config.chicken-road-2.betConfig`
- **Example:** `game.config.chicken-road-2.coefficients`

### Game Payloads Cache
- **Pattern:** `game.payloads.${gameCode}`
- **Example:** `game.payloads.chicken-road-2`

---

## Validation Points

1. **doLoginAndLaunchGame:**
   - `gameCode` missing → 400 Bad Request
   - `gameCode` not found → 404 Not Found
   - `gameCode` inactive → 400 Bad Request
   - Agent has no access → 403 Forbidden

2. **WebSocket Connection:**
   - `gameCode` missing → Disconnect with error
   - `gameCode` invalid → Disconnect with error
   - Agent has no access → Disconnect with error

3. **Game Operations:**
   - `gameCode` mismatch → 400 Bad Request
   - Agent has no access → 403 Forbidden

---

## GameSession Interface Update
```typescript
interface GameSession {
  userId: string;
  agentId: string;
  gameCode: string;        // NEW: Required field
  currency: string;
  difficulty: Difficulty;
  serverSeed?: string;
  userSeed?: string;
  hashedServerSeed?: string;
  nonce?: number;
  coefficients: string[];  // Game-specific coefficients
  currentStep: number;
  winAmount: number;
  betAmount: number;
  isActive: boolean;
  isWin: boolean;
  createdAt: Date;
  collisionColumns?: number[];
  platformBetTxId: string;
  roundId: string;
}
```

---

## Migration Strategy

### Phase 1: Setup
1. Create `games` table
2. Insert initial game: `chicken-road-2` with all metadata
3. Create `game_config_chicken_road_2` table
4. Migrate existing configs from `game_config` to `game_config_chicken_road_2`

### Phase 2: Schema Updates
1. Add `gameCode` column to `bets` table (nullable initially)
2. Add `allowedGameCodes` column to `agents` table
3. Update all existing bets: set `gameCode = 'chicken-road-2'`
4. Make `gameCode` NOT NULL in `bets` table

### Phase 3: Code Updates
1. Create `GameService`
2. Update `GameConfigService` to use per-game tables
3. Update `HazardSchedulerService` to require `gameCode`
4. Update `AgentsService` with game access methods
5. Update `BetService` to require `gameCode`
6. Update `GamePlayService` to require `gameCode`
7. Update WebSocket gateway to validate `gameCode`

### Phase 4: Testing & Cleanup
1. Test all game flows with `gameCode`
2. Update frontend to pass `gameCode` as `gameMode`
3. Archive old `game_config` table (optional)

---

## Implementation Steps

1. Create `Game` entity and `GameService` with validation methods
2. Create `games` table migration, insert initial game data
3. Update `Agents` entity: add `allowedGameCodes` JSON column
4. Update `Bet` entity: add `gameCode`, remove platform/gameType/gameName/settleType
5. Create per-game config table structure
6. Update `GameConfigService`: change to `getGamePayloads(gameCode)` using games table
7. Update `GameConfigService`: add per-game config methods
8. Update `HazardSchedulerService`: add `gameCode` to all methods
9. Update `HazardState` interface: add `gameCode` field
10. Update `AgentsService`: add `hasGameAccess()`, `addGameAccess()`, `removeGameAccess()`
11. Update `BetService`: add `gameCode` parameter to all methods
12. Update `GamePlayService`: add `gameCode` parameter, update Redis keys, pass to hazards
13. Update WebSocket gateway: validate `gameCode`, store in client.data
14. Update `doLoginAndLaunchGame`: validate and embed `gameCode` in URL
15. Update `GameSession` interface: add `gameCode` field

---

## Key Implementation Notes

1. **Backward Compatibility:**
   - If `allowedGameCodes` is `NULL` or `[]`, agent has access to all games
   - This allows gradual migration

2. **Game Code Normalization:**
   - For table names: `gameCode.replace(/-/g, '_').toLowerCase()`
   - Example: `chicken-road-2` → `chicken_road_2`

3. **Error Handling:**
   - Always validate `gameCode` at entry points
   - Always validate agent access before operations
   - Return clear error messages

4. **Performance:**
   - Use composite indexes on `(gameCode, userId)`, `(gameCode, status)`, etc.
   - Cache game configs in Redis with TTL
   - Cache game payloads in Redis
   - Cache hazard configs in memory

5. **Data Integrity:**
   - `gameCode` in `bets` must reference valid `gameCode` in `games` table
   - Validate in application layer (TypeORM doesn't support cross-table foreign keys on non-PK)

---

## Testing Checklist

### Basic Functionality
- [ ] Create new game in `games` table
- [ ] Assign game access to agent
- [ ] Login with `gameCode` → verify URL contains `gameMode`
- [ ] WebSocket connection with `gameMode` → verify `gameCode` stored
- [ ] Place bet → verify `gameCode` in bet record
- [ ] Step flow → verify uses correct `gameCode` session
- [ ] Cashout → verify uses correct `gameCode` session
- [ ] Bet history → verify filters by `gameCode`
- [ ] Admin panel → verify filters by `gameCode`

### Access Control
- [ ] Agent without access → verify rejection
- [ ] Agent with access → verify success
- [ ] Agent with NULL/empty `allowedGameCodes` → verify access to all games

### Hazards & Config
- [ ] Hazards isolated per game (game A hazards don't affect game B)
- [ ] Hazards isolated per difficulty (EASY hazards don't affect MEDIUM)
- [ ] Config loaded from per-game config tables
- [ ] Different games can have different hazard patterns
- [ ] Different games can have different coefficients
- [ ] Different games can have different bet configs

### Redis & Caching
- [ ] Redis keys include gameCode
- [ ] Pub/sub notifications include gameCode
- [ ] Config cache works per game
- [ ] Session isolation per game

### Error Handling
- [ ] Invalid `gameCode` → verify error handling
- [ ] Inactive game → verify error handling
- [ ] Missing `gameCode` → verify error handling

---

## Files to Create/Modify

### New Files
- `src/entities/game.entity.ts`
- `src/modules/game/game.service.ts`
- `src/modules/game/game.module.ts`

### Modified Files
- `src/entities/agents.entity.ts` (add `allowedGameCodes`)
- `src/entities/bet.entity.ts` (add `gameCode`, remove `platform`, `gameType`, `gameName`, `settleType`)
- `src/modules/gameConfig/game-config.service.ts` (update to use per-game tables)
- `src/modules/hazard/hazard-scheduler.service.ts` (add `gameCode` to all methods)
- `src/modules/hazard/interfaces/hazard-state.interface.ts` (add `gameCode` field)
- `src/modules/agents/agents.service.ts` (add game access methods)
- `src/modules/bet/bet.service.ts` (add `gameCode` parameter)
- `src/routes/gamePlay/game-play.service.ts` (add `gameCode` parameter, pass to hazards)
- `src/routes/gamePlay/game-play.gateway.ts` (validate `gameCode`)
- `src/routes/common-api-functions/common-api-functions.service.ts` (validate `gameCode`)

---

## Database Migrations Needed

1. Create `games` table
2. Create `game_config_{gameCode}` tables (one per game)
3. Add `gameCode` to `bets` table
4. Add `allowedGameCodes` to `agents` table
5. Migrate existing data
6. Add indexes

---

## Performance Considerations

1. **Config Caching**: Cache game configs in memory to avoid repeated DB queries
2. **Lazy Initialization**: Only initialize hazards for games that are actively used
3. **Redis Key Pattern**: Use consistent key pattern for easy querying
4. **Pub/Sub Efficiency**: Consider pattern-based subscriptions if Redis supports it
5. **Composite Indexes**: Use composite indexes on `(gameCode, userId)`, `(gameCode, status)`, etc.

---

## Key Decisions Summary

- **Single table approach** (not separate bet tables per game) - better for queries and maintenance
- **JSON column for agent game access** - simple, flexible, already used in codebase
- **Game metadata in games table** - reduces redundancy in bets table
- **Per-game config tables** - isolates game-specific settings
- **One leader for all games** - simpler than per-game leaders
- **Hazards per game+difficulty** - complete isolation

---

**Last Updated:** [Current Date]
**Status:** Architecture Design Complete - Ready for Implementation

**Use this guide for:** Complete multi-game support implementation including hazards, configs, bets, agents, and all service layer changes.

