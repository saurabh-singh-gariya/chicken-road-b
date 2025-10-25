# Chicken Road Front-End Integration Guide

Target audience: Front-end / UI engineer integrating authentication, wallet operations, and real-time gameplay.

---

## 1. Overview

The Chicken Road backend exposes REST endpoints (health, auth, wallet) and a WebSocket `/game` namespace for interactive betting gameplay (bet, step, cashout). JWT auth protects wallet routes. Real-time messages update game session state and balances.

Entities referenced generically: `userId`, `sessionId`, `transactionId`. Unknown / unspecified fields are marked `???`.

---

## 2. Authentication Model

1. Issue JWT via `POST /auth/token` using either JSON body `{ username, password }` or Basic Authorization header.
2. Store `{ accessToken, expiresIn ??? }` securely (prefer in-memory; localStorage acceptable with XSS precautions).
3. Send `Authorization: Bearer <accessToken>` on protected routes.
4. Refresh token before expiry (track `expiresIn`). On `401`, attempt silent re-auth or redirect to login.
5. If backend has `ENABLE_AUTH=false`, protected endpoints may still work without a valid token—front-end should keep auth logic enabled regardless.
6. Register admin via `POST /auth/register` with validation (username length 3–32, password length 8–72 with at least one letter & digit).

---

## 3. REST Endpoints

### Public

| Method | Path             | Auth | Request                                       | Success Response                                                            | Errors                               |
| ------ | ---------------- | ---- | --------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| GET    | `/health`        | None | (none)                                        | `{ status, timestamp, uptimeSeconds, env, authEnabled, db: { connected } }` | 500 internal failure                 |
| POST   | `/auth/token`    | None | JSON `{ username, password }` OR Basic header | `{ accessToken, expiresIn ??? }`                                            | 400 missing creds, 401 invalid creds |
| POST   | `/auth/register` | None | `{ username, password }`                      | `{ id, username }`                                                          | 400 validation                       |

### Protected Wallet (Base: `/api/v1/wallet`)

| Method | Path                                    | Auth   | Request                                | Success Response                             | Errors                                           |
| ------ | --------------------------------------- | ------ | -------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| GET    | `/api/v1/wallet/balance?userId=USER_ID` | Bearer | Query: `userId`                        | `{ userId, balance }`                        | 401 auth, 404 unknown user                       |
| POST   | `/api/v1/wallet/deposit`                | Bearer | `{ userId: string, amount: number>0 }` | `{ userId, balance, lastTransactionId ??? }` | 400 validation, 401 auth                         |
| POST   | `/api/v1/wallet/withdraw`               | Bearer | `{ userId: string, amount: number>0 }` | `{ userId, balance, lastTransactionId ??? }` | 400 validation, 401 auth, 409 insufficient funds |

---

## 4. Sample REST Requests

### Issue token (JSON)

```
POST /auth/token
Content-Type: application/json

{ "username": "demoUser", "password": "Str0ngPass123" }
```

Response:

```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIs...", "expiresIn": 3600 }
```

### Issue token (Basic)

```
Authorization: Basic ZGVtb1VzZXI6U3Ryb25nUGFzczEyMw==
```

### Get balance

```
GET /api/v1/wallet/balance?userId=12345
Authorization: Bearer <token>
```

Response:

```json
{ "userId": "12345", "balance": 2500 }
```

### Deposit

```
POST /api/v1/wallet/deposit
Authorization: Bearer <token>
Content-Type: application/json

{ "userId": "12345", "amount": 500 }
```

Response:

```json
{ "userId": "12345", "balance": 3000, "lastTransactionId": "tx_7890" }
```

### Withdraw (Insufficient Funds Example)

```json
{ "statusCode": 409, "message": "Insufficient funds" }
```

---

## 5. WebSocket `/game` Namespace

**Connection:** `wss://<HOST>/game` (prod) or `ws://localhost:3000/game`.

**Auth options (preferred order):**

1. Header: `Authorization: Bearer <token>`
2. Handshake auth: `{ token: "<token>" }`
3. Query param: `?token=<token>`

On connect server emits:

```json
{ "betConfig": { "minBet": 10, "maxBet": 1000, "defaultBet": 50 } }
```

Primary bi-directional event: `game-service`.
Client outbound:

```json
{ "action": "bet", "payload": { ... } }
```

### Actions & Payloads

| Action             | Payload                     | Purpose            | Success Example                                                              | Error Example                    |
| ------------------ | --------------------------- | ------------------ | ---------------------------------------------------------------------------- | -------------------------------- |
| bet                | `{ betAmount, difficulty }` | Start session      | `{ sessionId, status:"active", betAmount, difficulty, balanceAfterBet ??? }` | `{ error: "Invalid betAmount" }` |
| step               | `{ lineNumber }`            | Advance in session | `{ sessionId, lineNumber, hazard:false, multiplier ???, status:"active" }`   | `{ error: "No active session" }` |
| cashout            | (none)                      | Payout & end       | `{ sessionId, payoutAmount, balanceAfterPayout ???, status:"completed" }`    | `{ error: "Cannot cashout" }`    |
| get_active_session | (none)                      | Recover session    | `{ sessionId, status, betAmount, steps:[...], difficulty ??? }`              | `{ error: "No active session" }` |

Unknown action → `{ error: "Unknown action" }`.
Validation errors → `{ error: "<details>" }`.

### Example Sequence

1. Connect → receive `betConfig`
2. Bet: `{ action:"bet", payload:{ betAmount:100, difficulty:"medium" } }`
3. Response: `{ sessionId:"sess_123", status:"active", betAmount:100, difficulty:"medium", balanceAfterBet:1900 }`
4. Step: `{ action:"step", payload:{ lineNumber:1 } }`
5. Response: `{ sessionId:"sess_123", lineNumber:1, hazard:false, multiplier:1.2, status:"active" }`
6. Cashout: `{ action:"cashout" }`
7. Response: `{ sessionId:"sess_123", payoutAmount:120, balanceAfterPayout:2020, status:"completed" }`

### Textual Flow Diagram

```
Client                Server (/game)
  | --- CONNECT ---> | (JWT check)
  | <--- betConfig --|
  | --- game-service: bet -----------------> |
  | <--- session start ---------------------|
  | --- game-service: step ---------------->|
  | <--- step outcome ----------------------|
  | --- game-service: cashout ------------->|
  | <--- payout ----------------------------|
```

---

## 6. End-to-End User Flow

Login → store token → fetch wallet balance → open WS → show `betConfig` → place bet → update balance from bet response → perform steps → cashout → update balance (trust WS or re-fetch REST) → session completed.
On reconnect: re-auth if needed, re-fetch balance, optionally retrieve active session.

---

## 7. Response & Error Standards

### HTTP

- 200 success
- 400 validation / malformed
- 401 unauthorized
- 404 resource not found
- 409 business conflict (e.g., insufficient funds)
- 500 unexpected

Standard error body (Nest style):

```json
{ "statusCode": 400, "message": "Validation failed (amount must be > 0)" }
```

### WebSocket

Errors always inline: `{ "error": "Descriptive message" }`.

---

## 8. Front-End Environment Variables (Suggested)

| Variable               | Purpose                    | Example                      |
| ---------------------- | -------------------------- | ---------------------------- |
| VITE_API_BASE_URL      | REST base URL              | `https://api.example.com`    |
| VITE_WS_BASE_URL       | WebSocket base             | `wss://api.example.com/game` |
| VITE_ENABLE_AUTH       | Reflect backend auth state | `true`                       |
| VITE_TOKEN_STORAGE_KEY | Storage key name           | `chickenroad.token`          |

---

## 9. Security Considerations

- Always use `Authorization: Bearer <token>`; avoid query tokens except WS fallback.
- Track expiry (`expiresIn`) and refresh proactively.
- Minimal client validation; rely on server for authoritative errors.
- Exponential backoff reconnect for WS (1s,2s,5s,10s...).
- Clear all sensitive state on logout or token invalidation.
- After cashout, optionally re-fetch wallet balance for consistency across tabs.

---

## 10. WebSocket Message Flow Summary

| Step | Client             | Server           | Notes             |
| ---- | ------------------ | ---------------- | ----------------- |
| 1    | Connect            | Auth + betConfig | Pre-game config   |
| 2    | Bet                | Session created  | Balance reduced   |
| 3    | Step               | Evaluate hazard  | Continues or ends |
| 4    | Cashout            | Payout           | Balance credited  |
| 5    | get_active_session | Session snapshot | Recovery          |

---

## 11. Placeholder / Unknown Fields

- `expiresIn` unit (seconds vs ms) → ???
- Game session: `multiplier`, `balanceAfterBet`, `balanceAfterPayout` specifics → ???
- Transaction field naming consistency (`lastTransactionId`) → ???

Handle unknown fields defensively—check presence before display.

---

## 12. Front-End State Model (Conceptual)

```ts
interface AuthState {
  accessToken: string;
  expiresAt: number;
}
interface WalletState {
  userId: string;
  balance: number;
  lastTransactionId?: string;
}
interface GameSessionState {
  sessionId?: string;
  status?: 'active' | 'completed' | 'failed';
  betAmount?: number;
  difficulty?: string;
  steps?: Array<{ lineNumber: number; hazard?: boolean; multiplier?: number }>;
  payoutAmount?: number;
}
```

---

## 13. Retry & Resilience Patterns

| Scenario             | Strategy                                     |
| -------------------- | -------------------------------------------- |
| Token nearing expiry | Preemptive refresh timer                     |
| 401 on request       | Silent refresh or logout                     |
| WS disconnect        | Backoff + resync balance/session             |
| Insufficient funds   | Display error; disable action                |
| Unknown action       | Client-side validation; fallback error toast |

---

## 14. REST & WS Quick Reference

### REST Headers

| Header        | Value                | Required    |
| ------------- | -------------------- | ----------- |
| Content-Type  | application/json     | POST bodies |
| Authorization | Bearer <accessToken> | Protected   |

### WS Auth Options

| Method         | Example                       | Notes     |
| -------------- | ----------------------------- | --------- |
| Header         | Authorization: Bearer <token> | Preferred |
| Handshake auth | { token: "<token>" }          | Common    |
| Query param    | wss://host/game?token=<token> | Fallback  |

---

## 15. Error Handling UX

| Error    | UX Suggestion                                     |
| -------- | ------------------------------------------------- |
| 400      | Highlight field; concise message                  |
| 401      | Prompt re-login; clear sensitive state            |
| 404      | Generic not found message                         |
| 409      | Business-specific (e.g., show insufficient funds) |
| WS error | Inline or toast; keep session stable              |

---

## 16. Implementation Tips

- Wrap fetch/axios with auth interceptor.
- Central WebSocket service: `connect`, `sendAction(action, payload)`, event listeners.
- Derive `expiresAt = now + expiresIn*1000 ???` once clarified.
- After cashout, optionally refresh balance via REST for cross-tab consistency.

---

## 17. Pre-Production Checklist

- Confirm `expiresIn` unit.
- Validate wallet response fields real values.
- Clarify game session full schema.
- Evaluate cookie-based auth (future).
- Add transaction history endpoint integration (future scope).

---

## 18. Summary

Document covers REST endpoints, auth, WebSocket actions, full user flow, security & resilience patterns, and placeholders for unknown fields. Suitable for immediate front-end integration with defensive coding around `???` fields.

---

_End of Integration Guide_
