# Chicken Road WebSocket Integration Guide

This guide explains how to connect to the Chicken Road Socket.IO gateway, authenticate with the JWT issued by `/wallet/login`, and exchange gameplay messages (bet, step, cashout, session recovery).

---

## 1. Gateway Overview
- **Path:** `/io/`
- **Protocol:** Socket.IO 4.x (WebSocket transport strongly recommended; set `transports: ["websocket"]`).
- **Authentication:** JWT passed as a query parameter (`Authorization`) alongside `gameMode` and `operatorId`.
- **Purpose:** Streams the real-time game loop (bet → step → cashout) and pushes balance/config updates.

```
Client (web/native) ── Socket.IO ──> GamePlayGateway
                                   │
                                   ├─ JwtTokenService (token verification)
                                   ├─ GamePlayService (bet/step/cashout logic)
                                   ├─ RedisService (sessions + hazards)
                                   └─ SingleWalletFunctionsService (agent callbacks)
```

---

## 2. Connection Details
### Required Query Parameters
| Param | Description |
|-------|-------------|
| `gameMode` | Free-form string identifying the game variant (e.g., `chicken-road-two`). Must be present. |
| `operatorId` | Agent identifier; must match the `agentId` embedded in the JWT. |
| `Authorization` | JWT from `/wallet/login` or `/wallet/doLoginAndLaunchGame`. The gateway trims a trailing `=4` for compatibility with some launchers. |

### Example Client (TypeScript)
```ts
import { io } from "socket.io-client";

const socket = io("https://api.example.com", {
  path: "/io/",
  query: {
    gameMode: "chicken-road",
    operatorId: agentId,
    Authorization: jwtToken,
  },
  transports: ["websocket"],
});
```

### Example Raw Upgrade (curl)
```bash
curl 'wss://api.example.com/io/?gameMode=chicken-road&operatorId=agent001&Authorization=<JWT>&EIO=4&transport=websocket' \
  -H 'Upgrade: websocket' \
  -H 'Connection: Upgrade' \
  -H 'Origin: https://your-frontend.example'
```

If any required query parameter is missing or invalid, the server emits:
```json
{ "error": "Missing gameMode query parameter", "code": "MISSING_GAMEMODE" }
```
and disconnects.

---

## 3. Initial Events
After a successful handshake the server emits:
| Event | Payload | Usage |
|-------|---------|-------|
| `onBalanceChange` | `{ currency: "USD", balance: "1000000" }` | Current wallet balance (placeholder until real wallet integration). Re-emitted after settlement. |
| `betConfig` | JSON parsed from `game_config.betConfig`. | UI configuration (min/max bet, presets, decimal places). |
| `betsRanges` | e.g. `{ INR: ["0.01", "150.00"] }`. | Allowed bet ranges per currency. |
| `myData` | `{ userId, nickname, gameAvatar }`. | Player identity metadata (nickname currently hard-coded). |

---

## 4. Core Event: `gameService`
All gameplay actions are sent through `socket.emit("gameService", payload, ack?)`. Supply an ACK callback to receive correlated responses (recommended). Without a callback, the server falls back to emitting `gameService`/`game-state` events.

### Payload Envelope
```ts
interface GameServicePayload {
  action: string; // case-insensitive
  payload?: Record<string, any>;
}
```

### Supported Actions
| Action | Payload | Description | Sample ACK |
|--------|---------|-------------|-----------|
| `bet` | `{ betAmount: "10.00", difficulty: "EASY", currency: "USD", countryCode?: "IN" }` | Starts a session. Creates a bet via agent wallet, stores session in Redis. | `[ { isFinished: false, lineNumber: -1, betAmount: "10.00", currency: "USD" } ]` |
| `step` | `{ lineNumber: 0 }` | Advances one line. Validates sequential order, checks hazards via `HazardSchedulerService`, updates win amount, settles on hazard/win. | `[ { lineNumber: 0, winAmount: "11.00", coeff: "1.10", isFinished: false } ]` |
| `cashout` | `{}` | Ends the current session early, settling at the current win amount. | `[ { endReason: "cashout", winAmount: "14.64", isFinished: true } ]` |
| `get-game-session` | `{}` | Returns the cached session for reconnection. | `[ { lineNumber: 2, winAmount: "13.30", isFinished: false } ]` |
| Placeholder actions (`withdraw`, `get-game-seeds`, `set-user-seed`, etc.) | Action-specific | Currently return `"not_implemented"` placeholders. | `[ { action: "withdraw", status: "not_implemented" } ]` |

**Errors** are returned in the ACK array:
```json
[ { "error": "invalid_step_sequence" } ]
```
Common error strings: `active_session_exists`, `invalid_step_sequence`, `no_active_session`, `agent_rejected`, `bet_failed`, `step_failed`, `cashout_failed`, `missing_action`.

---

## 5. Response Channels
- **ACK-based (preferred):** `socket.emit("gameService", payload, (response) => { ... })`
  - Response is typically an array of one object (for historical compatibility). Always check `Array.isArray`.
- **Event-based fallback:** When no ACK is provided:
  - `gameService` event carries non-step responses.
  - `game-state` event carries step frames as arrays.

Use ACKs whenever the client needs immediate confirmation or error handling tied to the request.

---

## 6. Balance & Settlement Updates
- `onBalanceChange` is emitted:
  - On initial connect (placeholder balance).
  - After each settlement (win, hazard loss, or cashout).
- `GamePlayService` currently calls `SingleWalletFunctionsService.settleBet` with mocked agent data. When integrating with a real wallet, coordinate response formats so the balance reflects genuine values.

---

## 7. Error Handling & Disconnects
| Scenario | Event / Behavior | Recommended Client Action |
|----------|------------------|---------------------------|
| Missing query param | `connection-error` with code, then disconnect. | Fix handshake params, reconnect. |
| Invalid JWT | `connection-error` with `INVALID_TOKEN`. | Refresh token from `/wallet/login`. |
| Action validation error | ACK `[ { error: "validation_failed", details: [...] } ]`. | Display user-facing message, keep socket open. |
| Server-side failure | ACK `[ { error: "bet_failed" } ]` (or similar). | Offer retry; optionally call REST fallback to check status. |
| Network drop | Socket.IO `disconnect` event. | Use exponential backoff to reconnect; call `get-game-session` to resume if available. |

During development, `GamePlayService.cleanupOnDisconnect()` flushes Redis and deletes `PLACED` bets on socket close. Disable this behavior for multi-user/staging environments to avoid data loss.

---

## 8. Practical React Hook Snippet
```ts
const socket = useMemo(
  () =>
    io(import.meta.env.VITE_WS_BASE_URL, {
      path: "/io/",
      query: {
        gameMode: selectedMode,
        operatorId: agentId,
        Authorization: jwt,
      },
      transports: ["websocket"],
    }),
  [selectedMode, agentId, jwt]
);

useEffect(() => {
  socket.on("onBalanceChange", setBalance);
  socket.on("betConfig", setBetConfig);
  socket.on("betsRanges", setBetRanges);
  socket.on("myData", setPlayerInfo);
  socket.on("game-state", (frames) => setGameState(frames[0]));
  return () => socket.disconnect();
}, [socket]);

const placeBet = (payload) =>
  socket.emit("gameService", { action: "bet", payload }, (ack) => {
    if (Array.isArray(ack) && ack[0]?.error) {
      showError(ack[0].error);
    } else {
      setGameState(ack[0]);
    }
  });
```

---

## 9. Testing Checklist
- [ ] Obtain JWT from `/wallet/login` and confirm it decodes with the expected `sub`/`agentId`.
- [ ] Connect with required query params; verify initial events appear.
- [ ] Emit `bet` → ACK shows `lineNumber: -1`.
- [ ] Emit sequential `step` requests; verify hazards cause `endReason: "hazard"` and safe steps update `winAmount`.
- [ ] Cashout mid-game; confirm settlement and balance update.
- [ ] Disconnect + reconnect; use `get-game-session` to resume state.
- [ ] Observe error handling by intentionally sending missing/invalid payloads.

---

## 10. Reference & Related Docs
- `docs/BEGINNER_GUIDE.md` – environment setup and module overview.
- `docs/INTEGRATION_GUIDE.md` – combined REST + WebSocket onboarding for partner teams.
- `GAME_FLOW_DOCUMENTATION.md` / `HAPPY_FLOW.md` – deep dives into hazard logic and example sessions.
- `src/routes/gamePlay/game-play.gateway.ts` – authoritative implementation of the protocol.

Coordinate with the backend team before relying on placeholder responses (wallet mocks, fairness/seed actions) or when upgrading to a new API version.

