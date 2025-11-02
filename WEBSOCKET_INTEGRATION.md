# Chicken Road WebSocket Integration Guide

> Version: Draft 1.0  
> Gateway: Socket.IO (`/io/` path)  
> Transport: WebSocket only (force `transports: ["websocket"]`)

## 1. Base URL & Connection Format

Production Host (example): `ws://139.59.57.153`

Socket.IO connection endpoint combines the host + path + required query params:

```
ws://139.59.57.153/io/?gameMode=<DIFFICULTY>&operatorId=<OPERATOR_ID>&Authorization=<TOKEN>
```

Required Query Parameters:

- `gameMode` (string; one of `ANY RANDOM STRING`) - can be any string value but must present
- `operatorId` (string) – partner/operator identifier used for routing and configuration
  Optional Query Parameters:
- `Authorization` (string) – currently NOT validated (TEST MODE). You may send any random non-empty string. In future this will become a real JWT.

Notes:

- If `gameMode` or `operatorId` is missing the server immediately emits `connection-error` and disconnects.
- The server is currently in TEST MODE: it auto-binds the first user found (or creates a test user). Do NOT rely on this behavior for production.

### Example Raw Upgrade (curl)

```
curl 'ws://139.59.57.153/io/?gameMode=chicken-road&operatorId=operator1&Authorization=abc123&EIO=4&transport=websocket' \
  -H 'Upgrade: websocket' -H 'Origin: http://localhost:5173' -H 'Connection: Upgrade' \
  -H 'Sec-WebSocket-Key: ...' -H 'Sec-WebSocket-Version: 13'
```

### Example Socket.IO Client (TypeScript)

```ts
import { io } from 'socket.io-client';
const socket = io('http://139.59.57.153', {
  path: '/io/',
  query: { gameMode: 'EASY', operatorId: 'operator1', Authorization: 'xyz' },
  transports: ['websocket'],
});
```

## 2. Events Emitted Immediately After Connection

Upon successful `connect` the gateway fetches configuration + user context and emits:

| Event Name        | Payload Shape                                                            | Description                                                           |
| ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `betConfig`       | JSON string (may contain nested arrays of numbers serialized as strings) | Betting configuration, limits, UI presets.                            |
| `myData`          | `{ id: string; name: string; avatar: string }`                           | Basic user identity (TEST MODE auto-bound).                           |
| `betsRanges`      | JSON string                                                              | Ranges for bet amounts per difficulty. Numbers serialized as strings. |
| `onBalanceChange` | `{ currency: string; balance: string }`                                  | Current wallet balance. Subsequent balance updates reuse this event.  |

Potential (not always sent currently):
| Event Name | Payload | Notes |
|------------|---------|-------|
| `coefficients` | JSON string | Coefficients table (reserved; may be re-enabled). |

If a required query param is missing you receive:
| Event Name | Payload |
|------------|---------|
| `connection-error` | `{ error: string; code: string }` |

## 3. Core Interaction Event

All game actions are sent via the unified inbound event:

```
"gameService"
```

Alias also accepted: `"game-service"` (legacy). Prefer camelCase `gameService`.

### Action Envelope

```ts
interface GameActionEnvelope {
  action: string; // one of GameAction enum values (case-insensitive)
  payload?: object | null; // depends on action
}
```

Server normalizes and uppercases incoming actions. Legacy synonyms like `CASHOUT` are mapped internally to `WITHDRAW`.

### Supported Actions

| Action                 | Purpose                                             | Payload Required       | Notes                                                                     |
| ---------------------- | --------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `bet`                  | Start a new session by placing a bet                | Yes (`BetPayloadDto`)  | Emits updated balance after acceptance. Returns session or game-state.    |
| `step`                 | Advance one line/step in current session            | Yes (`StepPayloadDto`) | Returns transformed game-state array frame. May emit balance if finished. |
| `withdraw` / `CASHOUT` | Cash out current active session (if any)            | No                     | Returns result object or error; emits balance.                            |
| `GET-GAME-SESSION`     | Fetch current active session state                  | No                     | Returns session object or `null`.                                         |
| `GET-GAME-CONFIG`      | Fetch aggregate game configuration                  | No                     | Returns raw config object.                                                |
| `GET-GAME-SEEDS`       | Fetch user seed + current/next server seed hashes   | No                     | Returns `GameSeedsResponseDto`.                                           |
| `SET-USER-SEED`        | Set or update the user's seed for fairness          | Yes (`SetUserSeedDto`) | Returns updated seed state.                                               |
| `REVEAL-SERVER-SEED`   | Reveal the current server seed at rotation boundary | No                     | Returns `RevealServerSeedResponseDto`.                                    |
| `ROTATE-SERVER-SEED`   | Force server seed rotation (admin/testing)          | No                     | Returns hashes + rounds count (string).                                   |

## 4. Payload Schemas & Examples

### 4.1 BetPayloadDto

```ts
interface BetPayloadDto {
  betAmount: string; // numeric string; server expects string, e.g. "1.0" or "500"
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'DAREDEVIL';
  currencyCode?: string; // optional ISO currency code
  countryCode?: string; // optional country code
}
```

Example client emit:

```ts
socket.emit('gameService', {
  action: 'BET',
  payload: { betAmount: '1.0', difficulty: 'EASY' },
});
```

ACK or event response examples:

```json
{
  "currentStep": -1,
  "betAmount": "1.0",
  "winAmount": "0",
  "multiplier": "1.00",
  "difficulty": "EASY"
}
```

Or (transformed game-state frame array when using event path):

```json
[
  {
    "isFinished": false,
    "currency": "USD",
    "betAmount": "1.000000000",
    "coeff": "1.00",
    "winAmount": "0.00",
    "difficulty": "EASY",
    "lineNumber": -1
  }
]
```

### 4.2 StepPayloadDto

```ts
interface StepPayloadDto {
  lineNumber: number; // next line index (0-based or session-based progression)
}
```

Example:

```ts
socket.emit('gameService', { action: 'STEP', payload: { lineNumber: 3 } });
```

ACK response (preferred):

```json
{
  "isFinished": false,
  "currency": "USD",
  "betAmount": "1.000000000",
  "coeff": "1.20",
  "winAmount": "0.00",
  "difficulty": "EASY",
  "lineNumber": 3,
  "collisionPositions": [2]
}
```

Event-based (`game-state`) response variant:

```json
[
  {
    "isFinished": false,
    "currency": "USD",
    "betAmount": "1.000000000",
    "coeff": "1.20",
    "winAmount": "0.00",
    "difficulty": "EASY",
    "lineNumber": 3,
    "collisionPositions": [2]
  }
]
```

If finished:

```json
{
  "isFinished": true,
  "currency": "USD",
  "betAmount": "1.000000000",
  "coeff": "2.50",
  "winAmount": "2.50",
  "difficulty": "EASY",
  "lineNumber": 7,
  "isWin": true
}
```

A balance update will also arrive via `onBalanceChange` after a finished step.

### 4.3 Withdraw / Cashout

Emit (either string accepted):

```ts
socket.emit('gameService', { action: 'WITHDRAW' });
// or legacy
socket.emit('gameService', { action: 'CASHOUT' });
```

Response example (shape may vary):

```json
{ "status": "ok", "winAmount": "2.50" }
```

Balance update follows separately.

### 4.4 Get Active Session

```ts
socket.emit('gameService', { action: 'GET-GAME-SESSION' }, (session) => {
  console.log(session);
});
```

Session object example (raw StepResponse style):

```json
{
  "currentStep": 2,
  "betAmount": "1.0",
  "winAmount": "0.00",
  "multiplier": "1.40",
  "difficulty": "EASY"
}
```

### 4.5 Game Config

```ts
socket.emit('gameService', { action: 'GET-GAME-CONFIG' }, (cfg) => {
  console.log(cfg);
});
```

Example (structure TBD; raw server output):

```json
{
  "betsConfig": "{...}",
  "betsRanges": "{...}",
  "coefficients": "{...}" // may be stringified
}
```

### 4.6 Fairness: Seeds

#### Get Game Seeds

```ts
socket.emit('gameService', { action: 'GET-GAME-SEEDS' }, (seeds) => {
  console.log(seeds);
});
```

Response (`GameSeedsResponseDto`):

```json
{
  "userSeed": "109ff4d973030c1f",
  "currentServerSeedHash": "ee7812710c3ab9b4960f0b304d3e68b8f216370bbb167d5",
  "nextServerSeedHash": "f506b5ea7c79d9f3b67850eb67d67d4931993699fd87bcdb71a412c3b692d7ec",
  "nonce": "3"
}
```

#### Set User Seed

```ts
socket.emit('gameService', {
  action: 'SET-USER-SEED',
  payload: { userSeed: 'abcd1234ef98' },
});
```

Response mirrors `GameSeedsResponseDto`.

#### Reveal Server Seed

```ts
socket.emit('gameService', { action: 'REVEAL-SERVER-SEED' });
```

Response (`RevealServerSeedResponseDto`):

```json
{
  "userSeed": "109ff4d973030c1f",
  "serverSeed": "abcd1234ef567890",
  "serverSeedHash": "ee7812710c3ab9b4960f0b304d3e68b8f216370bbb167d5",
  "finalNonce": "7"
}
```

#### Rotate Server Seed

```ts
socket.emit('gameService', { action: 'ROTATE-SERVER-SEED' });
```

Response:

```json
{
  "currentServerSeedHash": "newhash",
  "nextServerSeedHash": "nexthash",
  "roundsCount": "12"
}
```

## 5. Response Channels (ACK vs Event)

The gateway supports two patterns:

1. ACK-based: Provide a callback as the last argument to `socket.emit`. You will receive a direct response (object or array) without listening for an event. Recommended for request/response flows.
2. Event-based: If no callback supplied the server will emit responses via:
   - `gameService` for non-step actions (raw object)
   - `game-state` for step frames (array of one transformed frame)

De-duplication: When ACK callback is used, the server suppresses the duplicate decorator emit.

### Choosing a Pattern

Use ACK for actions where you need immediate correlated response (BET, STEP, GET-GAME-SESSION, seeds). Listen to `game-state` only as a fallback or for streaming updates if future versions introduce multi-frame pushes.

## 6. Balance Updates

Event: `onBalanceChange`
Payload:

```ts
interface BalanceUpdate {
  currency: string;
  balance: string;
}
```

Sent initially on connect and again after BET, STEP (if finished), WITHDRAW/CASHOUT.

## 7. Error Handling

- Connection-level: `connection-error` then disconnect.
- Action-level: ACK or `gameService` event returns `{ error: "Message" }`.
- Unknown action: `{ error: 'Unknown action' }` or `{ error: 'ACK_UNSUPPORTED_ACTION', action: '...' }` when using ACK.

Client best practice:

```ts
if (resp && resp.error) {
  /* show toast */
}
```

## 8. Practical React Hook Example (Simplified from `App.tsx`)

```ts
const socket = useMemo(
  () =>
    io(host, {
      path: '/io/',
      query: { gameMode, operatorId, Authorization: token },
      transports: ['websocket'],
    }),
  [host, gameMode, operatorId, token],
);

useEffect(() => {
  socket.on('onBalanceChange', setBalance);
  socket.on('game-state', setGameState);
  socket.on('gameService', (payload) => {
    /* handle session / seeds */
  });
  return () => socket.disconnect();
}, [socket]);

function bet() {
  socket.emit(
    'gameService',
    {
      action: 'BET',
      payload: { betAmount: betAmountStr, difficulty: gameMode },
    },
    (ack) => {
      if (Array.isArray(ack)) setGameState(ack);
      else if (ack?.currentStep !== undefined) setActiveSession(ack);
    },
  );
}
```

## 9. Serialization Notes

- Monetary values arrive already formatted as strings (`"1.000000000"`, `"2.50"`). Do not parse unless you need numeric math.
- Arrays inside config JSON strings have numeric items coerced to strings for UI uniformity.
- Nonce and rounds counters are strings.

## 10. Future Changes (Roadmap Awareness)

- Real JWT validation will replace TEST MODE auto-binding.
- `coefficients` event may be reinstated or merged inside `GET-GAME-CONFIG` response.
- Multi-frame streaming for game progression may expand beyond single-element `game-state` arrays.
- Session IDs will be added to fairness reveal endpoints.

## 11. Quick Reference Cheat Sheet

```
Emit: gameService { action: 'BET', payload: { betAmount: '1.0', difficulty: 'EASY' } }
ACK: [{ isFinished:false, currency:'USD', betAmount:'1.000000000', coeff:'1.00', winAmount:'0.00', difficulty:'EASY', lineNumber:-1 }]

Emit: gameService { action: 'STEP', payload: { lineNumber: 0 } }
ACK/Event: same shape (array or object) + possible balance update.

Emit: gameService { action: 'WITHDRAW' }
ACK: { status:'ok', winAmount:'2.50' }

Emit: gameService { action: 'GET-GAME-SEEDS' }
ACK: { userSeed, currentServerSeedHash, nextServerSeedHash, nonce }
```

## 12. Minimal Error Examples

```json
{ "error": "Missing gameMode query parameter", "code": "MISSING_GAMEMODE" }
{ "error": "Missing operatorId query parameter", "code": "MISSING_OPERATOR_ID" }
{ "error": "NO_USER" }
{ "error": "ACK_UNSUPPORTED_ACTION", "action": "FOO" }
```

---

For any ambiguity (e.g., numeric formatting, session field additions) consult backend team before hard-coding assumptions.
