# How to Onboard a New Game

Quick guide to add a new game to the multi-game platform.

## Step 1: Add Game to Database

```sql
-- Insert new game into games table
INSERT INTO games (id, gameCode, gameName, platform, gameType, settleType, isActive, createdAt, updatedAt)
VALUES (UUID(), 'your-game-code', 'Your Game Name', 'SPADE', 'LIVE', 'platformTxId', TRUE, NOW(), NOW());

-- Verify game was added
SELECT gameCode, gameName, isActive FROM games WHERE gameCode = 'your-game-code';
```

## Step 2: Create Game Config Table

```sql
-- Create per-game config table (note: underscores, not hyphens)
-- Example: 'your-game-code' → 'your_game_code'
CREATE TABLE IF NOT EXISTS game_config_your_game_code (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(255) NOT NULL,
  value TEXT,
  updatedAt DATETIME,
  UNIQUE KEY uk_key (`key`),
  INDEX idx_key (`key`)
);
```

## Step 3: Copy Configs from Existing Game

```sql
-- Copy all configs from an existing game (e.g., chicken-road-two)
INSERT INTO game_config_your_game_code (`key`, value, updatedAt)
SELECT `key`, value, NOW()
FROM game_config_chicken_road_two;

-- Verify configs were copied
SELECT `key` FROM game_config_your_game_code ORDER BY `key`;
```

**Required configs:**
- `hazardConfig` - Hazard rotation settings
- `betConfig` - Betting limits and presets  
- `coefficients` - Multiplier arrays per difficulty

## Step 4: Grant Agent Access

```sql
-- Option A: Add to existing allowed games
UPDATE agents 
SET allowedGameCodes = JSON_ARRAY_APPEND(
  COALESCE(allowedGameCodes, JSON_ARRAY()), 
  '$', 
  'your-game-code'
),
updatedAt = NOW()
WHERE agentId = 'your-agent-id';

-- Option B: Set specific games (replaces existing)
UPDATE agents 
SET allowedGameCodes = JSON_ARRAY('chicken-road-two', 'your-game-code'),
    updatedAt = NOW()
WHERE agentId = 'your-agent-id';

-- Option C: Allow all games (remove restrictions)
UPDATE agents 
SET allowedGameCodes = NULL,
    updatedAt = NOW()
WHERE agentId = 'your-agent-id';
```

## Step 5: Customize Configs (Optional)

```sql
-- Update betConfig for your game
UPDATE game_config_your_game_code
SET value = '{"minBetAmount":"0.01","maxBetAmount":"150.00",...}',
    updatedAt = NOW()
WHERE `key` = 'betConfig';

-- Update coefficients
UPDATE game_config_your_game_code
SET value = '{"EASY":["1.01","1.03",...],"MEDIUM":[...],...}',
    updatedAt = NOW()
WHERE `key` = 'coefficients';

-- Update hazardConfig
UPDATE game_config_your_game_code
SET value = '{"totalColumns":{"EASY":30,"MEDIUM":25,...},"hazardRefreshMs":5000,...}',
    updatedAt = NOW()
WHERE `key` = 'hazardConfig';
```

## Step 6: Verify

```sql
-- Check game exists and is active
SELECT gameCode, gameName, isActive FROM games WHERE gameCode = 'your-game-code';

-- Check configs exist
SELECT `key` FROM game_config_your_game_code;

-- Check agent access
SELECT agentId, allowedGameCodes FROM agents WHERE agentId = 'your-agent-id';
```

## Step 7: Test

1. **Frontend:** Game should appear in dropdown on login page
2. **Login:** Use `doLoginAndLaunchGame` API with new `gameCode`
3. **WebSocket:** Connect with `gameMode=your-game-code`
4. **Gameplay:** Place bet → Step → Cashout (hazards should work)

## Quick Checklist

- [ ] Game added to `games` table
- [ ] Config table created (`game_config_{normalized_code}`)
- [ ] Configs copied and customized
- [ ] Agent has access (or `allowedGameCodes` is NULL)
- [ ] Game appears in frontend dropdown
- [ ] Login works with new gameCode
- [ ] Hazards initialize correctly
- [ ] Game flow works (bet → step → cashout)

## Notes

- **Table naming:** `gameCode` is normalized: `your-game-code` → `your_game_code`
- **Agent access:** NULL or `[]` = access to ALL games
- **Hazards:** Auto-initialize on first access (lazy initialization)
- **Configs:** Must have `hazardConfig`, `betConfig`, and `coefficients`

## Troubleshooting

**Game not in dropdown?**
- Check `isActive = TRUE` in games table
- Verify `/api/games` endpoint returns the game

**Hazards not working?**
- Check config table exists with correct name
- Verify `hazardConfig` exists in config table
- Check application logs for initialization errors

**Agent access denied?**
- Verify `allowedGameCodes` includes gameCode or is NULL
- Check agent exists in database

