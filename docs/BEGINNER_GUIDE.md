# Chicken Road Backend – Beginner-Friendly Guide

## Overview
- Chicken Road is a NestJS backend that powers a real-time hazard-avoidance game and related wallet APIs for partner casinos.
- It exposes:
  - REST endpoints (`/wallet`, `/api`) for player onboarding, login, and operator integrations.
  - A Socket.IO gateway (`/io/`) that streams live game rounds (bet, step, cashout).
- Core technologies: Node.js 20, NestJS 11, TypeORM (MySQL), Redis, Socket.IO, Axios, JWT, class-validator, and PM2/Nginx for deployment.
- Runtime flow:
  1. `main.ts` boots `AppModule`, loads `.env`, and installs global filters/interceptors.
  2. Feature modules (Agents, User, Bet, GamePlay, Hazard, Redis, etc.) are wired through dependency injection.
  3. Controllers/gateways call services, services hit MySQL/Redis/agent callbacks, and return normalized responses (`status` codes).

## Prerequisites
### Required Software
| Component | Min Version | Purpose |
|-----------|-------------|---------|
| Node.js | 20.x | Runs the NestJS server |
| npm | 10.x | Dependency management |
| MySQL / MariaDB | 8.0 / 10.4 | Persistent storage via TypeORM |
| Redis | 6+ | Game sessions + hazard states |
| Git | Latest | Source control |
| Optional tools | `@nestjs/cli`, PM2, Nginx, curl/postman, socket.io-client | Local dev & deployment |

### Accounts & Secrets
- MySQL user with full access to a schema (default `chickenroad`).
- Redis credentials (password optional; default config allows none).
- Long random `JWT_SECRET` (≥64 hex chars recommended).
- Seed `agents` table with entries: `{ agentId, cert, agentIPaddress, callbackURL, isWhitelisted }`.
- Partner wallet endpoints (agent callback URLs) that accept the `SingleWalletFunctionsService` payloads.

## Installation Steps
1. **Clone & install**
   ```bash
   git clone git@github.com:YOUR_ORG/chicken-road-b.git
   cd chicken-road-b
   npm install
   ```
2. **Create `.env`**
   ```ini
   APP_PORT=3000
   APP_ENV=development
   ENABLE_AUTH=true
   DB_HOST=localhost
   DB_PORT=3306
   DB_USERNAME=root
   DB_PASSWORD=secret
   DB_DATABASE=chickenroad
   DB_SYNCHRONIZE=true
   JWT_SECRET=CHANGE_ME_DEV_SECRET
   JWT_EXPIRES=1h
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   REDIS_PASSWORD=
   ```
3. **Prepare databases**
   ```sql
   CREATE DATABASE chickenroad CHARACTER SET utf8mb4;
   ```
   Start Redis locally (`redis-server`) or point `.env` to a remote instance.
4. **Seed reference data**
   - On first boot, `GameConfigSeeder` inserts `betConfig` and `coefficients` rows.  
   - Manually add `hazardConfig`, `frontend.host`, `agent.ipHeader`, `redis.TTL`, etc., inside the `game_config` table as needed.
   - Insert at least one agent row so the guard allows requests.
5. **Run the app**
   ```bash
   npm run start:dev   # hot reload for local dev
   npm run build && npm run start:prod   # production-style build
   ```
6. **Smoke tests**
   - REST: `curl http://localhost:3000/health`
   - WebSocket: connect using instructions from `WEBSOCKET_INTEGRATION.md`.

## Configuration
### Environment Variables
| Key | Description |
|-----|-------------|
| APP_PORT / APP_ENV | Server port & environment label |
| ENABLE_AUTH | Toggle `AgentAuthGuard`; set `false` for local testing |
| DB_* | MySQL connection + auto-sync toggle |
| JWT_SECRET / JWT_EXPIRES | Token signing secret & TTL |
| REDIS_* | Redis host/port/password |

### `game_config` Table Keys
| Key | Value Example | Usage |
|-----|---------------|-------|
| `betConfig` | JSON with min/max bet, presets, decimal places | Sent to clients & used by UI |
| `coefficients` | JSON arrays per difficulty | Multipliers used during steps |
| `hazardConfig` | `{ "totalColumns": 15, "hazardRefreshMs": 5000, "hazards": {...} }` | Hazard scheduler overrides |
| `frontend.host` | `"game.example.com"` | Used when building login URLs |
| `agent.ipHeader` | `"x-real-ip"` | Guard reads client IP from configurable header |
| `redis.TTL` | `"3600"` | Default TTL for Redis keys |
| `jwt.secret` | `{ "secret": "..." }` | Overrides env JWT secret |

## Application Flow
1. **Bootstrap** – `main.ts` creates the Nest app, enables CORS/logging, loads config, installs validation pipes, and starts listening on `app.port`.
2. **Wallet REST Routes (`/wallet`)**  
   - Guard: `AgentAuthGuard` validates agentId + cert + source IP (whitelist/wildcard).  
   - `CommonApiFunctionsController` provides:
     - `POST /wallet/createMember` → creates a `User` linked to the agent.  
     - `POST /wallet/login` and `/wallet/doLoginAndLaunchGame` → verifies user, resolves `frontend.host`, signs JWT, returns launch URL.  
     - `POST /wallet/logout` → logs selected users out (mocked response).
3. **Platform API (`/api`)**  
   - `POST /api/auth` verifies a JWT (`JwtTokenService.verifyToken`), then issues a new operator token plus placeholder config.  
   - `GET /api/online-counter/v1/data` validates a Bearer token and returns mocked online counts.
4. **Gameplay (Socket.IO @ `/io/`)**  
   - Connection query params: `gameMode`, `operatorId`, `Authorization`.  
   - `GamePlayGateway` verifies the token, stores metadata in the socket, and emits:
     - `onBalanceChange` (placeholder balance)
     - `betConfig`, `betsRanges`, `myData`
   - Core actions handled via `gameService` event + ACK callback:
     | Action | Service Method | Behavior |
     |--------|----------------|----------|
     | `bet` | `performBetFlow` | Checks active session, validates payload, calls agent wallet (`placeBet`), creates `Bet`, caches Redis session |
     | `step` | `performStepFlow` | Validates sequence, checks hazards via scheduler, updates session, settles if win/loss |
     | `cashout` | `performCashOutFlow` | Ends session early, settles based on current winnings |
     | `get-game-session` | `performGetSessionFlow` | Returns session snapshot for reconnection |
     | Placeholder actions (`withdraw`, seeds) | `buildPlaceholder` currently returns “not implemented” payloads |
5. **Hazard Rotation**  
   - `HazardSchedulerService` runs on startup (module init).  
   - For each difficulty it keeps `{ current, next, changeAt }` hazard patterns, stores them in Redis with TTL, and rotates every `hazardRefreshMs` (default 5 seconds).  
   - Gameplay steps call `getActiveHazards` to decide if a column is dangerous at that moment.
6. **Settlement Flow**  
   - On win/hazard/cashout completion, `GamePlayService` computes net settlement (`winAmount - betAmount`), calls the agent callback via `SingleWalletFunctionsService.settleBet`, and updates the `Bet` record to WON/LOST with balances.

## Architecture Breakdown
```
Browser / Agent Systems
    │
    ├─ REST (/wallet, /api) ─► Controllers ─► Services ─► TypeORM ─► MySQL
    │
    └─ Socket.IO (/io) ─► GamePlayGateway ─► GamePlayService
                             │            │
                             │            ├─ RedisService (sessions, hazards)
                             │            ├─ HazardSchedulerService
                             │            ├─ SingleWalletFunctionsService ─► Agent callback URLs
                             │            └─ BetService ─► MySQL `bet` table
```
Supporting modules: Agents/User for player metadata, JwtToken for signing, GameConfig for key-value settings, Redis for caching, Hazard for randomization, Extra controllers for health probes.

## Module Highlights (What each piece does)
- **App bootstrap**  
  `main.ts` + `AppModule` load configs, set up TypeORM (MySQL) and import all feature modules.
- **Global concerns**  
  `AllExceptionsFilter` maps thrown Nest errors to casino-style `status` codes, and `ResponseTransformInterceptor` guarantees every response carries a `status` field (default `0000`).
- **Agents/User services**  
  CRUD helpers for `agents` and `users` with conflict/not-found handling used by both the guard and wallet routes.
- **AgentAuthGuard**  
  Enforces agent credential/IP checks before `/wallet` requests execute; respects env `ENABLE_AUTH`.
- **BetService**  
  Idempotent bet placement, settlement recording, status updates, queries by user/round/tx, and a cleanup helper (`deletePlacedBets`).
- **GameConfigService**  
  Fetches config rows, logs missing keys, and exposes `getJwtSecret()` fallback logic.
- **RedisService**  
  Wraps `ioredis` with `set/get/del/flushAll` plus TTL discovery via `game_config`.
- **Hazard services**  
  `HazardGeneratorService`: pure functions to get random unique column indexes and validate hazard states.  
  `HazardSchedulerService`: coordinates per-difficulty timers, writes states to Redis/history lists, answers hazard queries during gameplay.
- **JwtTokenService**  
  Signs/verifies both agent-facing and gameplay tokens using the DB-provided secret.
- **Common API Functions (`/wallet/...`)**  
  Handles create-member/login/logout flows, issues login URLs, and applies consistent error codes (`src/common/constants.ts`).
- **Game API Routes (`/api/...`)**  
  Minimal integration sample (auth exchange + mocked analytics) for downstream partners.
- **Single Wallet Functions**  
  Talks to agent callback URLs for balance, bet, and settlement. Currently returns mocked data (`mapAgentResponse`)—remove the stub return when integrating with real partners.
- **GamePlay Gateway + Service**  
  Manage the Socket.IO protocol (query validation, per-socket metadata, events) and encapsulate bet/step/cashout logic, including Redis session caches and settlement calls.
- **Utilities**  
  `GameConfigSeeder` auto inserts starter config rows. Extra controllers (`HealthController`, `WellKnownController`) can be added to a module for probes.

## Setup & Run Commands
| Goal | Command |
|------|---------|
| Install deps | `npm install` |
| Start dev server | `npm run start:dev` |
| Build | `npm run build` |
| Start production build | `npm run start:prod` |
| Run tests (if added) | `npm run test` / `npm run test:e2e` |
| Lint/format | `npm run lint` / `npm run format` |
| Watch logs (if using PM2) | `pm2 logs chicken-road-api` |

## Common Issues & Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `ECONNREFUSED` MySQL/Redis | Service not running or `.env` misconfigured | Start services; verify host/port |
| `/wallet/*` returns `INVALID_AGENT_ID` | Agent not whitelisted, IP mismatch, or wrong cert | Update `agents` table to match incoming credentials/IP |
| `Config "xxx" not found` errors | Missing row in `game_config` | Insert required JSON keys (`betConfig`, `coefficients`, etc.) |
| All users disconnected when any socket closes | `cleanupOnDisconnect` flushes Redis + deletes `PLACED` bets | Comment out or guard behind env flag in multi-user environments |
| Wallet calls always succeed | `SingleWalletFunctionsService.mapAgentResponse` short-circuits with mock data | Remove the mock return and handle real agent responses |
| Hazard timing feels random | Defaults rotate every 5s; players stepping slowly will see different hazards | Adjust `hazardConfig.hazardRefreshMs` to larger intervals if desired |
| Need health endpoint | Add `HealthController` to a module or expose via `AppModule` |

## Deployment (Summary)
- Reference script: `deployment/setup.sh` or the detailed instructions in `deployment/README.md`.
- High-level steps:
  1. Provision Ubuntu, add `deploy` user + SSH key.
  2. Install Node 20, MySQL, Redis, PM2, Nginx.
  3. Clone repo, `npm ci --omit=dev`, create `.env` with production secrets.
  4. Run `npm run build`, start via PM2 (`pm2 start dist/main.js --name chicken-road-api`).
  5. Configure Nginx reverse proxy :80 → 127.0.0.1:3000 with WebSocket headers.
  6. Secure with UFW, set `DB_SYNCHRONIZE=false` after schema is created.
  7. Smoke-test REST and Socket.IO.

## Next Steps & Recommendations
- **Remove mock shortcuts** (wallet response stub, Redis flush on disconnect) before live traffic.
- **Add Swagger UI** via `SwaggerModule` for interactive docs (DTOs already decorated).
- **Implement migrations** instead of relying on `synchronize`.
- **Add tests** for bet/step/cashout flows using mocked Redis/wallet services.
- **Harden security** (Redis password, PM2 log rotation, fail2ban) per the deployment guide.
- **Monitor**: integrate logging/metrics (Sentry, Prometheus, etc.) for production visibility.

Need more context? Check these repo documents:
- `GAME_FLOW_DOCUMENTATION.md` – deep dive into the gameplay lifecycle.
- `HAPPY_FLOW.md` – end-to-end “perfect” game scenario.
- `INTEGRATION_GUIDE.md` – front-end & partner API integration tips.
- `WEBSOCKET_INTEGRATION.md` – Socket.IO protocol reference.

---
This guide is intentionally high-level and beginner-friendly so new developers or partner engineers can understand the system and get productive quickly.

