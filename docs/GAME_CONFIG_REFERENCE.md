# Game Config Table Reference

Quick reference for all configuration keys stored in the `game_config` table.

---

## 🔐 Authentication & Security

### `jwt.secret`
**Purpose**: Secret key for signing JWT tokens  
**Format**: String or JSON `{ "secret": "..." }`  
**Default**: `CHANGE_ME_DEV_SECRET` (env: `JWT_SECRET`)  
**Used by**: All JWT token operations  
**Impact**: CRITICAL - Security

### `jwt.expires`
**Purpose**: JWT token expiration time (used for both user and generic tokens)  
**Format**: String (e.g., `"1h"`, `"24h"`) or JSON `{ "expiresIn": "1h" }`  
**Default**: `"1h"` (env: `JWT_EXPIRES` or `JWT_EXPIRES_IN`)  
**Used by**: All JWT token signing  
**Impact**: MEDIUM - Session duration

---

## 💾 Redis & Session Management

### `redis.TTL`
**Purpose**: Default TTL for Redis cache keys  
**Format**: Number as string (e.g., `"3600"`)  
**Unit**: Seconds  
**Default**: `3600` (1 hour)  
**Used by**: General Redis caching  
**Impact**: LOW - Cache expiration

### `game.session.ttl`
**Purpose**: Game session expiration time  
**Format**: Number as string (e.g., `"3600"`)  
**Unit**: Seconds  
**Default**: `3600` (1 hour)  
**Used by**: 
- Game session expiration in Redis
- Refund scheduler timing
- Session TTL refresh  
**Impact**: HIGH - Affects session expiry and refund timing

---

## 🎮 Game Configuration

### `betConfig`
**Purpose**: Betting limits, presets, and currency settings  
**Format**: JSON object  
**Structure**:
```json
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
**Default**: See `DEFAULTS.betConfig`  
**Used by**: Frontend display, bet validation  
**Impact**: CRITICAL - Controls betting limits

### `coefficients`
**Purpose**: Multiplier arrays for each difficulty level (step-by-step payouts)  
**Format**: JSON object with arrays  
**Structure**:
```json
{
  "EASY": ["1.01", "1.03", "1.06", ...],      // 30 values
  "MEDIUM": ["1.08", "1.21", "1.37", ...],    // 25 values
  "HARD": ["1.18", "1.46", "1.83", ...],      // 22 values
  "DAREDEVIL": ["1.44", "2.21", "3.45", ...]  // 18 values
}
```
**Default**: See `DEFAULTS.coefficients`  
**Used by**: Game payout calculation, frontend display  
**Impact**: CRITICAL - Directly affects game payouts and RTP

### `hazardConfig`
**Purpose**: Hazard rotation frequency and difficulty settings  
**Format**: JSON object  
**Structure**:
```json
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
```
**Default**: See `DEFAULTS.hazardConfig`  
**Used by**: Hazard scheduler rotation  
**Impact**: HIGH - Affects game difficulty and timing

### `game.payloads`
**Purpose**: Game metadata sent to wallet APIs  
**Format**: JSON object  
**Structure**:
```json
{
  "gameType": "CRASH",
  "gameCode": "chicken-road-two",
  "gameName": "chicken-road-2",
  "platform": "In-out",
  "settleType": "platformTxId"
}
```
**Default**: See `DEFAULTS.GAME_PAYLOADS`  
**Used by**: Wallet API calls (bet/settle/refund)  
**Impact**: MEDIUM - Required for wallet integration

---

## 🌐 Infrastructure

### `frontend.host`
**Purpose**: Frontend hostname for login URL generation  
**Format**: String (e.g., `"gscr.chicken-road-twoinout.live"`) or JSON `{ "host": "..." }`  
**Default**: `"gscr.chicken-road-twoinout.live"`  
**Used by**: Login URL building  
**Impact**: MEDIUM - Affects login redirects

### `agent.ipHeader`
**Purpose**: HTTP header name to read client IP from (for IP whitelisting)  
**Format**: String (e.g., `"x-real-ip"`, `"x-forwarded-for"`) or JSON `{ "header": "..." }`  
**Default**: Direct connection IP  
**Used by**: Agent authentication guard  
**Impact**: MEDIUM - Security (IP whitelisting)

---

## 📋 Quick Reference Table

| Config Key | Unit | Default | Impact | Fallback |
|------------|------|---------|--------|----------|
| `jwt.secret` | - | `CHANGE_ME_DEV_SECRET` | CRITICAL | Env: `JWT_SECRET` |
| `jwt.expires` | Time string | `"1h"` | MEDIUM | Env: `JWT_EXPIRES` |
| `redis.TTL` | Seconds | `3600` | LOW | Hardcoded default |
| `game.session.ttl` | Seconds | `3600` | HIGH | Hardcoded default |
| `betConfig` | JSON | See defaults | CRITICAL | `DEFAULTS.betConfig` |
| `coefficients` | JSON | See defaults | CRITICAL | `DEFAULTS.coefficients` |
| `hazardConfig` | JSON | See defaults | HIGH | `DEFAULTS.hazardConfig` |
| `game.payloads` | JSON | See defaults | MEDIUM | `DEFAULTS.GAME_PAYLOADS` |
| `frontend.host` | String | `gscr.chicken-road-twoinout.live` | MEDIUM | Hardcoded default |
| `agent.ipHeader` | String | Direct IP | MEDIUM | Direct connection |

---

## ⚠️ Important Notes

- **All configs have fallbacks** - System can run without DB configs using defaults
- **TTL units**: Both `redis.TTL` and `game.session.ttl` use **seconds**
- **JWT expiry**: `jwt.expires` is used for both user and generic tokens (no separate config needed)
- **JSON configs**: `betConfig`, `coefficients`, `hazardConfig`, `game.payloads` are stored as JSON strings in DB
- **Cache**: `game.payloads` is cached in Redis for performance

