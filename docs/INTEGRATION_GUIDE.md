# Chicken Road Front-End Integration Guide

Target audience: partner/front-end teams that need to launch the Chicken Road wallet APIs and WebSocket gameplay client.

---

## 1. High-Level Architecture
- **REST (HTTP/JSON)** handles player onboarding and operator integrations.
  - `/wallet/*` endpoints are called by agent systems and are protected by `AgentAuthGuard` (requires `agentId`, `cert`, and whitelisted IP).
  - `/api/*` endpoints are used by operator back offices or BI systems.
- **Socket.IO Gateway (`/io/`)** streams the real-time Chicken Road game (bet → step → cashout). Clients send events via the `gameService` channel and receive ACKs/events in return.
- **Auth tokens**
  - Wallet endpoints rely on agent credentials in the body.
  - Game/WebSocket traffic uses JWTs issued by `/wallet/login` or `/wallet/doLoginAndLaunchGame`.

---

## 2. Authentication & Tokens
1. **Create/Sync Players** – Agents call `/wallet/createMember` with:
   ```json
   {
     "agentId": "agent001",
     "cert": "secretFromDB",
     "userId": "player123",
     "currency": "USD",
     "betLimit": "1000",
     "language": "en",
     "userName": "Player 123"
   }
   ```
   - `AgentAuthGuard` validates `agentId/cert` and client IP before the controller runs.
2. **Login & Get JWT** – `/wallet/login` and `/wallet/doLoginAndLaunchGame` return:
   ```json
   {
     "status": "0000",
     "url": "https://<frontend.host>/player/login/apiLogin0?agentId=agent001&x=<JWT>"
   }
   ```
   - Extract the JWT from the `x` query parameter for Socket.IO connections.
3. **Operator Auth** – `POST /api/auth` expects an incoming auth token (`auth_token`) and issues a longer-lived token for BI endpoints.

---

## 3. REST API Reference

### `/wallet` (Agent-Facing, Guarded)
| Endpoint | Description | Notes |
|----------|-------------|-------|
| `POST /wallet/createMember` | Registers or upserts a player for the agent. | Requires `agentId`, `cert`, `userId`, `currency`, `betLimit`. |
| `POST /wallet/login` | Issues a JWT and returns a redirect URL. | Validates `userId` format and existence. |
| `POST /wallet/doLoginAndLaunchGame` | Combines login with launch parameters (`platform`, `gameType`, `gameCode`). | Same auth/validation rules as `/wallet/login`. |
| `POST /wallet/logout` | Logs out one or more players. | Accepts CSV list `userIds`. |

Responses follow the numeric `status` codes defined in `src/common/constants.ts` (`0000` success, `1001` account exists, etc.). The global response interceptor adds `status` automatically if a controller forgets.

### `/api` (Operator-Facing)
| Endpoint | Body / Header | Response |
|----------|---------------|----------|
| `POST /api/auth` | `{ auth_token, operator, currency, game_mode }` | Verifies the token and returns a new signed token plus placeholder config data. |
| `GET /api/online-counter/v1/data` | `Authorization: Bearer <token>` | Returns mocked online player counts grouped by game mode. |

### Health & Well-Known (optional)
- `GET /health` – status, uptime, current env, DB connectivity.
- `.well-known/appspecific/com.chrome.devtools.json` – returns `{ status: "ok" }`.

---

## 4. WebSocket / Socket.IO Integration

### 4.1 Connection
- **Endpoint:** `wss://<HOST>/io/?gameMode=<MODE>&operatorId=<AGENT_ID>&Authorization=<JWT>`
- **Required query params**
  - `gameMode` – any string identifying the variation (e.g., `chicken-road-two`).
  - `operatorId` – agent identifier (must match the token’s `agentId`).
  - `Authorization` – JWT issued by `/wallet/login`. If the token ends with `=4` and contains 3 segments, the gateway strips the suffix automatically.
- Ensure the client forces WebSocket transport for best results:
  ```ts
  import { io } from "socket.io-client";
  const socket = io("https://example.com", {
    path: "/io/",
    query: {
      gameMode: "chicken-road",
      operatorId: "agent001",
      Authorization: jwt
    },
    transports: ["websocket"]
  });
  ```

### 4.2 Initial Events
Once authenticated, the gateway emits:
| Event | Payload | Purpose |
|-------|---------|---------|
| `onBalanceChange` | `{ currency: "USD", balance: "1000000" }` | Current wallet balance placeholder (updated on bet/settle). |
| `betConfig` | JSON from `game_config.betConfig`. | UI presets, min/max, currency. |
| `betsRanges` | e.g. `{ INR: ["0.01", "150.00"] }`. | Allowed bet ranges per currency. |
| `myData` | `{ userId, nickname, gameAvatar }`. | Basic player display info. |

### 4.3 Core Event: `gameService`
- All actions are sent via `socket.emit("gameService", payload, ack?)`.
- If you supply an ACK callback, results return via the callback instead of additional events.

| Action | Payload | Server Behavior | Sample ACK |
|--------|---------|-----------------|------------|
| `bet` | `{ betAmount: "10.00", difficulty: "EASY", currency: "USD", countryCode: "IN" }` | Validates payload, ensures no active session, calls agent wallet (`placeBet`), creates a `Bet`, caches Redis session. | `[ { isFinished: false, lineNumber: -1, betAmount: "10.00", currency: "USD" } ]` |
| `step` | `{ lineNumber: 0 }` | Loads session, checks hazard state for the given difficulty and step, updates win amount, settles if hazard/win. | `[ { isFinished: false, lineNumber: 0, winAmount: "11.00", coeff: "1.10" } ]` |
| `cashout` | (no payload) | Ends session early, uses current win amount to settle. | `[ { isFinished: true, endReason: "cashout", winAmount: "14.64" } ]` |
| `get-game-session` | (no payload) | Returns current Redis session snapshot (used after reconnect). | `[ { isFinished: false, lineNumber: 2, winAmount: "13.30" } ]` |
| Placeholder actions (`withdraw`, `get-game-seeds`, etc.) | Action-specific | Currently return `"not_implemented"` placeholders via `GamePlayService.buildPlaceholder`. | `[ { action: "withdraw", status: "not_implemented" } ]` |

**Error Handling** – The ACK array contains error objects:
```json
[ { "error": "invalid_step_sequence" } ]
```
Common errors:
- `active_session_exists` – you tried to bet without finishing the previous game.
- `invalid_step_sequence` – line numbers must increase by 1 each call.
- `no_active_session` – step/cashout without a prior bet.
- `agent_rejected` – upstream wallet rejected the bet/settlement.

### 4.4 Sample Flow
```
Client                           Server
------                           ------
CONNECT (with query params) ─▶  Auth JWT + set socket metadata
◀─ betConfig, betsRanges, onBalanceChange, myData
Bet action (ACK handler) ─────▶  performBetFlow → Redis session created
◀─────────────────────────────  ACK: [{ lineNumber: -1, ... }]
Step action line 0 ───────────▶ performStepFlow (hazard check)
◀─────────────────────────────  ACK: [{ lineNumber: 0, winAmount: "11.00" }]
Step action line 1 ───────────▶ ...
Cashout action ───────────────▶ performCashOutFlow
◀─────────────────────────────  ACK: [{ endReason: "cashout", ... }]
```

---

## 5. Front-End Environment Variables (Suggested)
| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `https://api.example.com` | Point REST calls here (`/wallet`, `/api`). |
| `VITE_WS_BASE_URL` | `wss://api.example.com/io/` | Socket.IO endpoint. Append query params per session. |
| `VITE_AGENT_ID` | `agent001` | Pre-fill operatorId query param. |
| `VITE_GAME_MODE` | `chicken-road` | Default `gameMode` value. |
| `VITE_TOKEN_STORAGE_KEY` | `chickenroad.token` | Where you cache the JWT client-side. |

---

## 6. Security & Resilience Tips
- Always transmit JWTs via headers/query over HTTPS; clear them on logout.
- Respect `ENABLE_AUTH`: even if the backend allows anonymous calls (dev mode), keep client-side auth flows enabled so production toggling is seamless.
- Handle reconnects: on `disconnect`, attempt exponential backoff and call `get-game-session` to restore active games.
- Watch for placeholder data:
  - `SingleWalletFunctionsService` currently returns mocked balances; coordinate with backend to switch to real agent responses.
  - `GamePlayService.cleanupOnDisconnect` flushes Redis for development. In production this should be disabled to preserve concurrent sessions.

---

## 7. Testing Checklist
- [ ] Call `/wallet/createMember` → expect `status: "0000"`.
- [ ] Login and extract JWT from returned URL.
- [ ] Connect to `/io/` with required query params.
- [ ] Receive `betConfig`, `betsRanges`, `myData`, `onBalanceChange`.
- [ ] Emit `bet` → ACK contains `lineNumber: -1`.
- [ ] Emit sequential `step` actions → see win updates and hazard behavior.
- [ ] Cash out or reach final column → settlement occurs and `Bet` record is updated.
- [ ] Call `/api/auth` and use the returned token on `/api/online-counter/v1/data`.

---

## 8. Reference Docs
- `docs/BEGINNER_GUIDE.md` – system overview & setup.
- `GAME_FLOW_DOCUMENTATION.md`, `HAPPY_FLOW.md` – deep dives into the betting/step mechanics.
- `WEBSOCKET_INTEGRATION.md` – lower-level Socket.IO protocol reference (query params, fairness/seeds placeholders).

Need additional payload samples or SDK wrappers? Coordinate with the backend team so the guide stays in sync with future protocol updates (Swagger support, fairness APIs, etc.).

