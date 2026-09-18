# Games + Loyalty — Bounded Context

Isolated feature adding restaurant-scoped table games (first: Snakes & Ladders) and a
customer loyalty points system. Games and loyalty share one feature entitlement key.

## Feature key

- `GAMES_LOYALTY` (subscription-plan feature, enforced via `FeatureService` / `requireFeature` / `requirePublicFeature`).

## Access rules

| Surface | Auth | Permission | Feature gate | Tenant scope |
|---|---|---|---|---|
| Customer games (`gameRoutes.ts`) | public / game player token | — | `GAMES_LOYALTY` | `:restaurantId` |
| Customer loyalty (`loyaltyRoutes.ts`) | public | — | `GAMES_LOYALTY` | `:restaurantId` |
| Admin config (`gameAdminRoutes.ts`) | JWT | `MANAGE_RESTAURANT_SETTINGS` | `GAMES_LOYALTY` | `:restaurantId` |

- Platform admins bypass feature/permission gates (existing RBAC behavior).
- Tenant isolation: `requirePermission` enforces membership for admin routes;
  `requirePublicFeature` resolves/validates `restaurantId` for public routes.
- No new RBAC permission keys are added.

## Game rules (Snakes & Ladders)

- 2–6 players; board of 100 squares.
- Server-authoritative dice (`crypto.randomInt(1, 7)`); client sends only roll intent.
- A roll advances the player and applies one fixed snake/ladder at most.
- Landing exactly on 100 wins; rolling beyond 100 leaves the player in place.
- No double roll; turn advances only after a valid roll.
- Fast turn timeout (configurable via `GameConfig.turnTimeoutSeconds`); an expired
  turn is skipped lazily on the next roll.
- Finished/cancelled games reject all further actions.

### State machine

```
WAITING ── start ──> IN_PROGRESS ── land on 100 ──> FINISHED
   │                     │
   └─ cancel/leave ──> CANCELLED
```

## Phase 4 API (customer, under `/api/restaurants/:restaurantId`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/games/private` | public + `tableId`,`alias` | create private same-table lobby (host) |
| GET | `/games/table/:tableId` | public | discover the table's waiting private game |
| POST | `/games/random` | public + `alias` | join random matchmaking |
| POST | `/games/:gameSessionId/join` | public + `tableId`,`alias` | join a waiting private game |
| GET | `/games/:gameSessionId` | game player token | get current game state |
| POST | `/games/:gameSessionId/start` | game player token (host) | start a waiting game |
| POST | `/games/:gameSessionId/cancel` | game player token (host) | cancel a waiting game |
| POST | `/games/:gameSessionId/roll` | game player token | server-authoritative dice roll |
| POST | `/games/:gameSessionId/leave` | game player token | leave a waiting lobby |

Admin config (`gameAdminRoutes.ts`, JWT + `MANAGE_RESTAURANT_SETTINGS` + `GAMES_LOYALTY`):
- `GET/PUT /api/restaurants/:restaurantId/games/config`
- reward CRUD + customer points + redemption management (Phase 6C, see below)

## Player token

- Short-lived signed JWT issued on create/join.
- Payload scope: `sub` (GamePlayer.id) + `restaurantId` + `gameSessionId` + `alias`.
- Verified by `requireGamePlayerToken`; the token (not the URL) is the authority for
  player/session/restaurant scope.
- The token never carries `customerId`, NIF/taxId, or any loyalty secret.

## Player identity (anonymous vs customer-linked)

- `GamePlayer.customerId` is the single identity link (nullable) between a game player
  and an existing `Customer`. Reused from Phase 4/5; no schema change.
- A player is **anonymous** when no `customerId` is supplied. Anonymous players are
  fully valid game players (`customerId = null`).
- A player is **customer-linked** only when a caller supplies an existing
  `customerId` on create/join/random. The game service resolves it strictly:
  - the customer must already exist (never created by the game path);
  - the customer must belong to the same restaurant (tenant isolation);
  - otherwise the request is rejected (`INVALID_CUSTOMER_ID` / `CUSTOMER_NOT_FOUND` /
    `CUSTOMER_NOT_IN_RESTAURANT`).
- NIF/taxId is **never** required for gameplay and never used as the primary identity.
- No duplicate `Customer` identities are created by the game context.

## Anti-cheat / security

- Dice, movement, snake/ladder resolution are server-only.
- `GameMove` is immutable and unique per `(gameSessionId, turnNumber)` — concurrent
  double-rolls for the same turn are rejected at the DB level.
- `playerKey` prevents a player from entering multiple active games/queues.
- All state-changing operations run inside transactions.
- Every query is restaurant-scoped; cross-table/cross-restaurant joins are rejected.
- Random sessions never expose `customerId`/`tableId`; players see alias only.
- `customerId`, `taxId`/NIF, loyalty tokens and personal data are never included in
  public game events, snapshots, tokens, or sanitized player/session payloads.

## Realtime (SSE)

Reuses the existing `RealtimeService` (in-memory SSE). No WebSocket/Redis.

### Channels

| Channel | Audience | Payload safety |
|---|---|---|
| `game:{gameSessionId}` | players of that game | sanitized players (alias only; no `customerId`) |
| `table:{tableId}` | same-table private lobby discovery | lobby status + player count/alias only |

### Endpoints

- `GET /api/restaurants/:restaurantId/games/:gameSessionId/events` — game player stream (gamePlayerToken).
- `GET /api/restaurants/:restaurantId/games/table/:tableId/events` — table discovery stream (public, feature-gated).

### Event contract

| Event | Payload (key fields) |
|---|---|
| `GAME_SNAPSHOT` | `gameSessionId`, `version`, `snapshot` (authoritative state) |
| `TABLE_SNAPSHOT` | `tableId`, `game` (waiting lobby or null) |
| `PLAYER_JOINED` | `gameSessionId`, `version`, `player` |
| `PLAYER_LEFT` | `gameSessionId`, `version`, `playerId` |
| `GAME_STARTED` | `gameSessionId`, `version`, `currentTurnPlayerId`, `turnNumber` |
| `TURN_CHANGED` | `gameSessionId`, `version`, `currentTurnPlayerId`, `turnNumber` |
| `DICE_ROLLED` | `gameSessionId`, `version`, `playerId`, `diceRoll`, `fromPosition`, `toPosition`, `turnNumber` |
| `PLAYER_MOVED` | `gameSessionId`, `version`, `playerId`, `position` |
| `SNAKE_LADDER` | `gameSessionId`, `version`, `playerId`, `fromPosition`, `toPosition`, `movedByLadder`, `movedBySnake` |
| `GAME_FINISHED` | `gameSessionId`, `version`, `winnerPlayerId` |
| `GAME_CANCELLED` | `gameSessionId`, `version` |

### Recovery / versioning

- Every event carries a monotonically increasing `version` (`GameSession.eventVersion`).
- On connect, the server sends an authoritative `GAME_SNAPSHOT` from PostgreSQL, then live events.
- On reconnect, the snapshot resyncs the client from PostgreSQL (SSE is transport only, never the source of truth).

## Data models

- `GameConfig`, `GameSession` (incl. `eventVersion`), `GamePlayer`, `GameMove`
- `CustomerPointsLedger` (audit source of truth), `Reward`, `RewardRedemption`
- Loyalty identity = `Customer.id`; `taxId` is optional and never the primary key.

## Graphify (to regenerate after implementation)

Run `graphify update .` after code changes. Expected new nodes:

- `gameRoutes.ts`, `loyaltyRoutes.ts`, `gameAdminRoutes.ts`
- `gameService.ts`, `gameAuthMiddleware.ts`, `constants/game.ts`
- `featureMiddleware.ts` (`requirePublicFeature`)
- `FEATURE_KEYS` / `GAMES_LOYALTY`
- Models: `GameConfig`, `GameSession`, `GamePlayer`, `GameMove`, `CustomerPointsLedger`, `Reward`, `RewardRedemption`

Expected new relations:
- `gameRoutes -> gameService + requireGamePlayerToken + requirePublicFeature`
- `gameService -> constants/game + prisma`
- `GameSession -> Restaurant/Table`, `GamePlayer -> GameSession/Customer`, `GameMove -> GameSession/GamePlayer`
- `CustomerPointsLedger -> Customer/Restaurant`, `Reward -> Restaurant`, `RewardRedemption -> Customer/Reward/Restaurant`

## Loyalty identity + points engine (Phase 6B)

### Identity architecture

- `Customer.id` remains the internal source identity for points.
- A `LoyaltyIdentity` row links a restaurant-scoped `Customer` to an opaque token:
  - `tokenHash` = SHA-256 of the raw token (raw token is never stored).
  - `@@unique([restaurantId, customerId])` guarantees at most one identity per
    customer per restaurant (no duplicate active identities).
- `taxId`/NIF is an optional lookup/verification attribute only; loyalty works
  without NIF and never uses it as the primary identity.

### QR / token lifecycle

- Enrollment mints a cryptographically random 32-byte token (`crypto.randomBytes`),
  stores only its SHA-256 hash, and returns the raw token once (for the QR).
- The QR contains only the opaque token (never `Customer.id`).
- `rotate` mints a fresh token and invalidates the previous one (old hash no longer
  matches).
- `revoke` marks the identity `REVOKED` so the token can no longer resolve.
- Token resolution is rate-limited (in-memory sliding window) to prevent enumeration.

### Customer resolution

- Reuses the existing `Customer` model and `CustomerService.resolveForCheckout`; no
  second customer store is introduced.
- Supported paths: existing customer, anonymous player, NIF lookup (same restaurant,
  case-insensitive, falls back to fiscal profile), and loyalty QR token.
- NIF lookup never creates a customer; it only resolves an existing one.

### Points ledger

- `CustomerPointsLedger` is the immutable audit source of truth; `balanceAfter` is
  persisted on every entry.
- Every mutation is restaurant-scoped, transactional, and updates
  `Customer.loyaltyPoints` atomically in the same transaction (customer row locked
  with `SELECT ... FOR UPDATE`).
- Negative balances are rejected; `idempotencyKey` (unique) prevents duplicate
  credits, including under concurrency (`P2002` fallback).
- Point types reuse the existing enum: `GAME_WIN`, `REWARD_REDEEM`, `ADMIN_ADJUST`,
  `EXPIRY`, `REFUND`.

### Idempotency

- Idempotency keys are deterministic per logical event. Game wins use
  `game-win:{gameSessionId}` so a finished game is credited exactly once.

### Game → loyalty flow

- When a game reaches `FINISHED`, `LoyaltyService.awardGameWin(gameSessionId)` runs
  (best-effort; never blocks the game result).
- Only `FINISHED` games award; `CANCELLED` games award zero.
- The point amount comes from server-side `GameConfig.pointRules.winPoints`
  (never from the client).
- `GameConfig.dailyPointsLimit` is enforced server-side for positive grants.
- An anonymous winner (no resolved `Customer`) is skipped and never credited to
  another customer; the game result (`winnerPlayerId`, `FINISHED`) is preserved for
  later linking.

### Privacy / security

- Tenant isolation on every query; cross-restaurant token resolution is rejected.
- Raw tokens and NIF values are never logged.
- Public responses never expose `Customer.id`, `taxId`, or PII — only `name` and
  `balance` (`sanitizeCustomerPublic`).

## Rewards + redemption (Phase 6C)

### Rewards lifecycle

- `Reward` is restaurant-scoped: `name`, `description`, `pointsCost`, `active`,
  `unlimitedStock`, `stock`, `sortOrder`.
- Admin CRUD + activate/deactivate reuses `MANAGE_RESTAURANT_SETTINGS` and
  `AuditService` (no new RBAC permission). Limited-stock rewards require a
  non-negative `stock`.

### Redemption transaction

`redeemReward` runs in a single transaction with row locks (`SELECT … FOR UPDATE`
on the customer and reward rows):
1. validate reward belongs to restaurant, is active, has stock (if limited);
2. validate balance ≥ `pointsCost`;
3. debit points (immutable `CustomerPointsLedger` + atomic `Customer.loyaltyPoints`);
4. create `RewardRedemption` (`COMPLETED`);
5. decrement stock (if not unlimited).

Negative balance/stock and concurrent double-redemption are prevented by row
locks + unique `RewardRedemption.idempotencyKey` + ledger idempotency.

### Refund / cancel

`refundRedemption` transitions `COMPLETED → CANCELLED` in one transaction:
- restores points via a `REFUND` ledger entry (`refund-ledger:{redemptionId}`);
- restores stock;
- idempotent (a cancelled redemption is a no-op on retry).

### Limits / timezone

- `GameConfig.dailyPointsLimit` caps **GAME_WIN** grants only (admin adjustments
  and refunds do not count toward the game earning limit).
- The day boundary uses the restaurant's `timezone` (IANA) via
  `startOfDayInTz`, matching the analytics convention — not blindly UTC.

### APIs

Customer (public, feature-gated): `enroll`, `resolve`, `lookup-nif`, `me`,
`ledger`, `token/rotate`, `token/revoke`, `rewards/available`, `redeem`,
`redemptions/me`.

Admin (JWT + `MANAGE_RESTAURANT_SETTINGS` + feature): reward CRUD + status,
`customers/:customerId` lookup, `customers/:customerId/adjust`,
`redemptions` list, `redemptions/:redemptionId/refund`.

### Security

- Every query is restaurant-scoped; cross-restaurant reward/token access is rejected.
- Customer responses never expose `Customer.id`, `taxId`, raw tokens, or PII.

### Complete flow

```
Game FINISHED → awardGameWin → GAME_WIN ledger (exactly-once)
  → Customer.loyaltyPoints → redeemReward → REWARD_REDEEM ledger + RewardRedemption
  → (optional) refundRedemption → REFUND ledger + CANCELLED
```

## Restaurant Admin Game Control UI (Phase 7A)

Admin → Games page (`src/pages/admin/AdminGamesPage.tsx`) controlling whether
table games are active and how they behave, backed entirely by the Phase 3–6
backend (no local-only state, no `localStorage`, no schema change).

### Route + gating

- Route: `/admin/games` (nested under the protected `AdminLayout`).
- Frontend gate: `PermissionRoute permission="MANAGE_RESTAURANT_SETTINGS"` +
  `FeatureGate feature="GAMES_LOYALTY"`.
- Sidebar nav item "Games" (`Gamepad2`) shown only when both the permission and
  the feature are held (via the existing `AdminSidebar` filter).

### Configuration surface

| Field | Type | Validation (client mirrors backend) |
|---|---|---|
| `enabled` | boolean | master switch |
| `modes` | `GameMode[]` | `PRIVATE` (same table) / `RANDOM` (same restaurant); ≥1 required when enabled |
| `minPlayers` | number | ≥ 1 |
| `maxPlayers` | number | ≥ `minPlayers` |
| `turnTimeoutSeconds` | number | ≥ 5 |
| `dailyPointsLimit` | number | ≥ 0 |
| `pointRules.winPoints` | number | ≥ 0 |

- Controls that only make sense when games are active (`modes`, player/turn
  numbers, points) are disabled while `enabled` is off.
- Save posts through the existing authenticated admin API
  (`PUT /restaurants/:restaurantId/games/config`), then re-reads the backend to
  display the persisted truth. Cancel discards local edits and re-fetches.
- Success / error / validation states are surfaced inline.

### Data flow

1. On mount, `gameAdminService.getConfig(restaurantId)` loads the saved
   `GameConfig` (or the page defaults when none exists yet).
2. `gameAdminService.updateConfig(restaurantId, payload)` persists via
   `prisma.gameConfig.upsert` (create/update by `restaurantId`) and writes an
   `AuditService` entry (`entityType: 'GameConfig'`).
3. Backend `parseGameConfigInput` rejects invalid values with `400
   VALIDATION_ERROR`, so the UI cannot persist an invalid configuration.

Authorization is unchanged: `MANAGE_RESTAURANT_SETTINGS` + `GAMES_LOYALTY`
feature + `requirePermission` tenant membership (see Access rules above).

## Restaurant Admin Loyalty + Rewards UI (Phase 7B)

Admin → Loyalty page (`src/pages/admin/AdminLoyaltyPage.tsx`) built on the
Phase 6B/6C backend. All data is fetched from the backend and refetched after
every mutation; nothing is kept only in React state or `localStorage`.

### Route + gating

- Route: `/admin/loyalty` (nested under the protected `AdminLayout`).
- Frontend gate: `PermissionRoute permission="MANAGE_RESTAURANT_SETTINGS"` +
  `FeatureGate feature="GAMES_LOYALTY"`.
- Sidebar nav item "Loyalty" (`Gift`) uses the same `AdminSidebar` filter.
- No new RBAC permission keys.

### Sections

1. **Overview** — total loyalty customers, points issued, points redeemed,
   active rewards, recent redemptions (from `GET .../loyalty/overview`).
2. **Customer lookup** — search by NIF/taxId via
   `GET .../loyalty/customers/lookup?taxId=...`; shows safe identity (name,
   email, phone, balance), ledger, redemptions, and identity status. Never
   renders `Customer.id` or raw loyalty tokens.
3. **Manual adjustment** — add/remove points with required amount + reason via
   `POST .../loyalty/customers/:customerId/adjust`; confirmation dialog before
   execution; backend prevents negative balances; audit logged.
4. **Rewards management** — create/edit/activate/deactivate/delete via existing
   reward CRUD + status endpoints (`pointsCost`, `stock`, `unlimitedStock`,
   `sortOrder`).
5. **Redemptions** — list (safe customer identity, reward, points, status,
   time) via `GET .../loyalty/redemptions`; refund via
   `POST .../loyalty/redemptions/:redemptionId/refund` with confirmation.
6. **Customer profile** — points balance, ledger history, and redeemed rewards
   (no internal IDs or raw QR tokens shown).
7. **QR / identity** — shows whether the customer has an active `LoyaltyIdentity`
   and offers a safe admin `revoke` action
   (`POST .../loyalty/customers/:customerId/token/revoke`). The raw token is
   never returned. Token *rotation* is intentionally not exposed to admin
   (it mints a new raw token that only the customer should receive).

### Backend additions (no schema change)

- `GET /restaurants/:restaurantId/loyalty/overview` — read-only aggregates.
- `GET /restaurants/:restaurantId/loyalty/customers/lookup?taxId=...` —
  NIF resolution returning the full admin profile.
- `POST /restaurants/:restaurantId/loyalty/customers/:customerId/token/revoke` —
  revoke a loyalty identity by `customerId` (never exposes the token).
- `customers/:customerId` profile now includes `identity` status.
- `adjust` now requires a non-empty `reason`.

### Authorization + tenant isolation

Unchanged: every new admin route uses the existing `adminGate`
(`validateUuidParams` + `authenticateToken` + `requirePermission('MANAGE_RESTAURANT_SETTINGS')`
+ `requireFeature('GAMES_LOYALTY')`). Tenant isolation remains backend-enforced
via `requirePermission` membership checks; customer/ledger/reward/redemption
queries are all restaurant-scoped.

## Customer Loyalty + QR UI (Phase 8A)

Customer-facing loyalty experience added to the customer menu, backed entirely
by the Phase 6B/6C public loyalty endpoints. No game-board UI yet.

### Entry point

- "My Loyalty" button (`Gift`) in the customer menu header
  (`src/components/customer/MenuHeader.tsx`).
- Opens `CustomerLoyaltyPanel` (`src/components/customer/CustomerLoyaltyPanel.tsx`),
  a mobile-first full-screen sheet.

### Customer flow

1. **No token** → safe enrollment form (name / email / phone, all optional; at
   least one required). NIF is never required. Reuses
   `CustomerService.resolveForCheckout`, so an existing customer is never
   duplicated.
2. **Token present** (scanned QR `?loyalty=:token` or saved locally) → shows:
   - current points balance,
   - points history (ledger),
   - available rewards (cost + stock status),
   - redeem with confirmation (idempotent, refetches after success),
   - redemption history/status,
   - personal loyalty QR.

### QR / identity

- `enroll` returns a backend-generated `loyaltyUrl` deep link
  (`/menu/:slug?loyalty=:token`); the raw token is embedded only inside the URL.
- `GET /restaurants/:restaurantId/loyalty/qr?token=...` returns the canonical
  deep link for an active token (used for returning customers).
- The QR is rendered client-side (`qrcode.react`) from the deep link; the raw
  token is never displayed as text.
- The QR explains: "Scan this QR next time to recover the same loyalty account."

### Security / source of truth

- Backend is authoritative; balance/history/rewards/redemptions are always
  refetched from the API (never trusted only from localStorage).
- The loyalty token is persisted only for session recovery; points/balance are
  never stored as the source of truth.
- `Customer.id` and the raw token are never rendered; public endpoints already
  return sanitized data (`sanitizeCustomerPublic`).
- All customer loyalty routes remain feature-gated by `GAMES_LOYALTY` and
  tenant-scoped by `:restaurantId`.

## Customer Game Lobby + Multiplayer UI (Phase 8B)

Customer-facing game lobby (no board yet), built on the Phase 4/5 game APIs +
in-memory SSE.

### Entry point

- "Play While You Wait" button (`Gamepad2`) in the customer menu header
  (`src/components/customer/MenuHeader.tsx`).
- Shown only when `GAMES_LOYALTY` is enabled (checked via the public
  `GET /restaurants/:restaurantId/games/availability` endpoint).

### Flow

1. **Mode selection** — "Play with my table" (PRIVATE) and "Play with random
   guests" (RANDOM), each enabled only if present in `GameConfig.modes`.
   PRIVATE also requires a resolved table context.
2. **Alias** — the customer enters a display name; only aliases are shown.
3. **PRIVATE** — first customer creates the lobby (host); same-table customers
   discover it via `GET /games/table/:tableId` and join (no invite code). Host
   can start (only once `minPlayers` is met) or cancel. Cross-table joins are
   rejected server-side (`CROSS_TABLE_JOIN_FORBIDDEN`).
4. **RANDOM** — joins restaurant matchmaking; backend decides the match and
   auto-starts when full. Shows "Searching for players…" until matched.

### Realtime

- Reuses existing SSE (no WebSocket/Redis).
- Game events via `GET /games/:gameSessionId/events?token=...` (the game player
  token is now also accepted as a query param for `EventSource` compatibility).
- Table discovery via `GET /games/table/:tableId/events`.
- Authoritative `GAME_SNAPSHOT` on connect/reconnect; `PLAYER_JOINED`,
  `PLAYER_LEFT`, `GAME_STARTED`, `GAME_CANCELLED` drive lobby state.
- Loading/reconnecting states surfaced in the UI.

### Identity / privacy

- Reuses optional `GamePlayer.customerId` (anonymous players stay valid).
- NIF is never required; `Customer.id` and loyalty tokens are never exposed.
- `playerKey` is a stable device key (`localStorage`) used only for the
  server-side "already in game" guard.

### Error handling

`GAMES_DISABLED`, `GAME_MODE_DISABLED`, `GAME_FULL`, `ALREADY_IN_GAME`,
`CROSS_TABLE_JOIN_FORBIDDEN`, `GAME_NOT_JOINABLE`, `NOT_ENOUGH_PLAYERS`,
`HOST_ONLY`, cancelled/started states, and SSE disconnect/reconnect are all
surfaced to the customer.

### Backend additions (no schema change)

- `GET /restaurants/:restaurantId/games/availability` — public read-only game
  config (enabled + modes + player bounds) for feature gating.
- `requireGamePlayerToken` now also accepts `?token=` (query) in addition to the
  `Authorization` header, matching the existing admin SSE pattern.

## Customer Snakes & Ladders Board UI (Phase 8C)

Complete customer board built on the Phase 4/5 game APIs + SSE. No game-rule,
engine, lobby, or loyalty changes.

### Board

- `src/components/customer/CustomerGameBoard.tsx` — 100-square responsive board
  (10×10 boustrophedon), pieces, dice, turn/winner states.
- Rendered by `CustomerGameLobby` when the game is `IN_PROGRESS`.
- Snakes/ladders are read from the backend via
  `GET /restaurants/:restaurantId/games/availability` (`ladders` / `snakes`
  arrays, sourced from the same `constants/game.ts` map used by the engine).
- All positions/status are authoritative from `GAME_SNAPSHOT`; the client never
  computes movement or dice.

### Realtime / state flow

Handles `GAME_SNAPSHOT`, `PLAYER_JOINED`, `PLAYER_LEFT`, `GAME_STARTED`,
`TURN_CHANGED`, `DICE_ROLLED`, `PLAYER_MOVED`, `SNAKE_LADDER`, `GAME_FINISHED`,
`GAME_CANCELLED`. On reconnect the board rebuilds from `GAME_SNAPSHOT`.

### Dice + movement

- "Roll Dice" is enabled only when `currentTurnPlayerId` is the local player and
  the connection is live; it sends only roll intent (`POST …/roll`).
- `DICE_ROLLED` animates the piece from authoritative `fromPosition` →
  `toPosition` (two-phase: dice landing, then snake/ladder slide via `SNAKE_LADDER`).
- Dice value is displayed from the server event; never generated client-side.

### States / accessibility

Loading, waiting, your turn, opponent turn, reconnecting, cancelled, finished
(winner celebration with final positions), and back-to-menu. Reduced-motion is
honoured (`useReducedMotion`); timers/EventSource listeners are cleaned up on
unmount.

## Order/Table Lifecycle Integration (Phase 9A)

When an order reaches a terminal status, any active private game for the same
restaurant + table is ended safely.

### Flow

- `server/src/services/gameOrderLifecycle.ts` exposes
  `terminatePrivateGameByTable(restaurantId, tableId, 'FINISHED' | 'CANCELLED')`.
- Hooked into the existing order transition handlers in `orderRoutes.ts`:
  - `PATCH /orders/:orderId/status` → `COMPLETED` finishes the game, `CANCELLED`
    cancels it.
  - `POST /orders/:orderId/cancel` → cancels the game.
- Only `mode=PRIVATE` games with the order's `tableId` and
  `status IN (WAITING, IN_PROGRESS)` are matched; random games (`tableId=null`)
  are never affected, and other tables/restaurants are isolated.
- Idempotent: once a game is `FINISHED`/`CANCELLED`, repeated order updates or a
  second completed order are no-ops.
- The final state is broadcast to the customer game UI via the existing SSE
  channel (`GAME_FINISHED` / `GAME_CANCELLED`); no new realtime architecture.
- Loyalty rules are unchanged: a `FINISHED` game without a winner and a
  `CANCELLED` game award nothing (existing `awardGameWin` semantics).

## Security + Anti-Abuse Hardening (Phase 9B)

Audited and hardened the Games + Loyalty system without changing game rules,
board behavior, or point/reward business rules.

### Existing controls (verified)

- **Tenant isolation** — every game/loyalty query is restaurant-scoped
  (`resolveRestaurantId`, `requirePermission`, `requirePublicFeature`,
  `resolveConfig`, `assertTableBelongsToRestaurant`, `resolveLinkedCustomerId`,
  `resolveIdentityByToken`).
- **Game-player token** — signed JWT carrying `sub`/`restaurantId`/
  `gameSessionId`; `requireGamePlayerToken` re-checks player existence and
  restaurant/session match, and rejects `TENANT_MISMATCH`/`GAME_MISMATCH`.
- **Private same-table** — `CROSS_TABLE_JOIN_FORBIDDEN` prevents cross-table
  joins; tables are restaurant-validated.
- **Random matchmaking** — matched only within the same restaurant
  (`mode=RANDOM` + `restaurantId`).
- **Duplicate rolls/joins** — `GameMove` unique `(gameSessionId, turnNumber)`
  blocks duplicate rolls; `playerKey` guard blocks concurrent active games;
  `GAME_FULL`/`GAME_NOT_JOINABLE` block over-join.
- **Loyalty/reward** — exactly-once via idempotency keys, `SELECT … FOR UPDATE`
  row locks, negative balance/stock rejection, daily `GAME_WIN` limit, token
  resolution rate limiting.
- **Privacy** — `sanitizeSession`/`sanitizePlayer`/`sanitizeCustomerPublic`
  never expose `customerId`, `taxId`/NIF, or raw loyalty tokens; random sessions
  omit `tableId`.
- **SSE** — game streams require the game-player token; `GAME_SNAPSHOT` resyncs
  on reconnect; `realtimeService` removes clients on close.
- **Cleanup** — `leave` cancels when the last player leaves; turn timeout skips
  abandoned players lazily; Phase 9A order completion terminates games.
- **Audit** — privileged admin actions (config, reward CRUD/status, adjust,
  refund, identity revoke) use `AuditService`.

### Fixes applied

1. **Game rate limiting** — `gameActionRateLimiter` (60/min) on
   create/join/leave/matchmaking/start/cancel and `gameRollRateLimiter` (30/min)
   on roll (`server/src/middleware/rateLimiter.ts`, wired in `gameRoutes.ts`).
2. **Error-handler hardening** — unexpected 5xx errors now return a generic
   message instead of leaking `err.message` (SQL/stack/secrets/internal IDs);
   safe 4xx client errors are preserved (`errorHandler.ts`).

### Security regression tests

`server/tests/securityHardening.test.ts` covers game action rate limiting and
error-handler no-leak / safe-4xx behavior. Cross-restaurant/cross-table/token/
duplicate/concurrency/privacy/negative-balance/redemption isolation are already
covered by `gameEngine`, `gameRealtime`, `gameLobby`, `loyalty`,
`loyaltyRewards`, `loyaltyAdmin`, and `gamesLoyalty` suites.

## Deployment / migration

- Games + Loyalty is additive. Migrations live in
  `prisma/migrations/20260917040000_add_games_loyalty` through
  `20260917080000_add_redemption_idempotency`.
- Apply with `npx prisma migrate deploy` (never `db push` / `migrate reset`).
  Verified clean: 29 migrations found, no pending migrations.
- New models/enums: `GameConfig`, `GameSession`, `GamePlayer`, `GameMove`,
  `LoyaltyIdentity`, `CustomerPointsLedger`, `Reward`, `RewardRedemption`, plus a
  unique `reward_redemptions.idempotency_key`.
- Frontend ships in the standard Vite bundle (`npm run build`) and is gated by
  the `GAMES_LOYALTY` feature key.

## Known limitations

- **SSE is single-instance (in-memory).** `realtimeService` keeps connected
  clients in process memory, so horizontal scale-out would not share game events
  across instances (needs sticky sessions or a Redis pub/sub adapter). No impact
  on single-instance correctness.
- **Game SSE accepts `?token=`** for `EventSource` compatibility (matches the
  existing admin SSE pattern); a signed 2h token keeps this safe.
- **Anonymous duplicate-join guard is best-effort.** `playerKey` is
  client-supplied; anonymous players can bypass "one active game" by
  omitting/changing it. Customer-linked players are still enforced server-side.
- **Rate limiting is per-process/in-memory** (`SlidingWindowRateLimiter`),
  consistent with the rest of the platform.
- **Random matchmaking has no server timeout** — it waits until full or cancelled
  (the client shows a persistent searching state).

## Future phases

- ~~Phase 4: server-authoritative game engine + lobbies~~
- ~~Phase 5: realtime (SSE) wiring~~
- ~~Phase 6: loyalty identity + points engine (identity/token/ledger/game-win)~~
- ~~Phase 6C: rewards + redemption business logic~~
- ~~Phase 7A: admin config UI~~
- ~~Phase 7B: admin loyalty + rewards UI~~
- ~~Phase 8A: customer loyalty + QR UI~~
- ~~Phase 8B: customer game lobby + multiplayer UI~~
- ~~Phase 8C: customer game board UI~~
- ~~Phase 9A: order/table lifecycle integration~~
- ~~Phase 9B: security + anti-abuse hardening~~
