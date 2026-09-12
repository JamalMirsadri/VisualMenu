# Implementation Plan — Phase 12: Advanced Order Workflow, Floor/Table Operations & Kitchen Coordination

Phase 12 builds upon the enterprise permission architecture of Phases 11A & 11B to introduce an integrated, real-time operations workspace coordinating **Tables, Orders, Order Items, Waiters, Kitchen Staff, and Cashiers**.

---

## User Review Required

> [!IMPORTANT]
> **Database Schema Extension (Safe & Non-Destructive)**:
> We will extend the `Order` model in Prisma with:
> - `assignedWaiterUserRestaurantId String? @map("assigned_waiter_user_restaurant_id") @db.Uuid`: Restaurant-scoped link to `UserRestaurant`.
> - `priority String @default("NORMAL")`: Operational priority (`NORMAL`, `HIGH`, `URGENT`).
> - Relational foreign key to `UserRestaurant` with `onDelete: SetNull`.
> - Index on `[restaurantId, assignedWaiterUserRestaurantId]`.
> All changes are nullable with defaults, ensuring 100% backward compatibility with all existing data and tests.

> [!NOTE]
> **Zero-Duplication State Principle**:
> Table operational statuses (`AVAILABLE`, `ORDER_PENDING`, `ORDER_ACTIVE`, `PREPARING`, `READY_TO_SERVE`, `SERVED`, `AWAITING_PAYMENT`, `PAID`) are **dynamically derived** from active orders, item statuses, and payment states. This eliminates desynchronization bugs and ensures real-time accuracy across floor, kitchen, and cashier views.

---

## Proposed Changes

### 1. Database & Persistence Layer

#### [MODIFY] [prisma/schema.prisma](file:///d:/code%20gemini/menu/prisma/schema.prisma)
- Add to `Order` model:
  - `assignedWaiterUserRestaurantId String? @map("assigned_waiter_user_restaurant_id") @db.Uuid`
  - `priority String @default("NORMAL")`
  - Relation: `assignedWaiter UserRestaurant? @relation("AssignedWaiterOrders", fields: [assignedWaiterUserRestaurantId], references: [id], onDelete: SetNull)`
  - Index: `@@index([restaurantId, assignedWaiterUserRestaurantId])`
- Add to `UserRestaurant` model:
  - `assignedOrders Order[] @relation("AssignedWaiterOrders")`
- Run `npx prisma db push` to synchronize PostgreSQL database and update `@prisma/client`.

---

### 2. Backend API & Operational Services

#### [NEW] [server/src/services/floorService.ts](file:///d:/code%20gemini/menu/server/src/services/floorService.ts)
- Implement `deriveTableState(table, activeOrders, latestPayment)`:
  - Calculates exact derived state:
    - `AVAILABLE`: No active unresolved orders.
    - `ORDER_PENDING`: Active order with status `PENDING`.
    - `ORDER_ACTIVE`: Active order with status `CONFIRMED`.
    - `PREPARING`: Order in `PREPARING` or kitchen items cooking.
    - `READY_TO_SERVE`: Order in `READY` (all items ready).
    - `SERVED`: Order in `SERVED`.
    - `AWAITING_PAYMENT`: Order served/completed with payment pending/unpaid.
    - `PAID`: Payment settled, dining session ready to reset to available.
- `getRestaurantFloorState(restaurantId, userCapabilities)`:
  - High-efficiency relational query joining `Table`, active `Order`s, `OrderItem`s, `Payment`s, and `assignedWaiter`.
  - Computes counts: Available, Occupied, Preparing, Ready, Awaiting Payment.
  - Respects sensitive data permissions: masks or omits monetary values (`total`, `amountDue`) if user lacks `VIEW_PAYMENTS` / `VIEW_PAYMENT_STATUS`.

#### [MODIFY] [server/src/routes/tableRoutes.ts](file:///d:/code%20gemini/menu/server/src/routes/tableRoutes.ts)
- Add `GET /api/restaurants/:restaurantId/floor`:
  - Returns complete floor overview with derived table states, active order summaries, and summary counters.
  - Gated by `requireAnyPermission(['VIEW_TABLES', 'VIEW_ORDERS'])`.
- Add `GET /api/restaurants/:restaurantId/tables/:tableId/operational-state`:
  - Detailed operational state for the Table Drawer (active orders, line items, kitchen progress, payment details, assigned staff).

#### [MODIFY] [server/src/routes/orderRoutes.ts](file:///d:/code%20gemini/menu/server/src/routes/orderRoutes.ts)
- Add `POST /api/restaurants/:restaurantId/orders/:orderId/assign`:
  - Assigns an order to a specific waiter (`UserRestaurant`) in the same restaurant.
  - Requires `ASSIGN_ORDERS` or `UPDATE_ORDER_STATUS` or `Role.OWNER`.
  - Audits `ORDER_ASSIGN` and broadcasts `order_assigned` via SSE.
- Add `POST /api/restaurants/:restaurantId/orders/:orderId/claim`:
  - Current authenticated waiter atomically claims unassigned order.
  - Concurrency-safe: atomic update with `where: { id: orderId, assignedWaiterUserRestaurantId: null }`.
  - Returns 409 Conflict if already claimed by another waiter.
- Add `POST /api/restaurants/:restaurantId/orders/:orderId/unassign`:
  - Unassigns waiter from order.
- Add `POST /api/restaurants/:restaurantId/orders/:orderId/serve`:
  - Dedicated endpoint to transition order from `READY` to `SERVED`.
  - Requires `MARK_ORDER_SERVED`.
  - Transactionally updates order, creates history entry, audits, and emits SSE.
- Add `GET /api/restaurants/:restaurantId/orders/ready-to-serve`:
  - Dedicated queue of orders currently in `READY` status.
- Add `GET /api/restaurants/:restaurantId/orders/awaiting-payment`:
  - Dedicated queue of orders in `SERVED` status with unsettled payments.
- Add `PATCH /api/restaurants/:restaurantId/orders/:orderId/priority`:
  - Update order priority (`NORMAL`, `HIGH`, `URGENT`).
  - Gated by `UPDATE_ORDER_STATUS`.

#### [MODIFY] [server/src/services/realtimeService.ts](file:///d:/code%20gemini/menu/server/src/services/realtimeService.ts)
- Add helper methods:
  - `notifyOrderAssigned(restaurantId, orderId, assignedWaiter)`
  - `notifyFloorUpdated(restaurantId, tableId, operationalState)`
  - `notifyOrderReady(restaurantId, order)`
  - `notifyOrderServed(restaurantId, order)`
- Scopes broadcasts to `restaurant:${restaurantId}` and customer channel `order:${publicToken}`.

---

### 3. Frontend Workspaces & User Experience

#### [NEW] [src/pages/admin/AdminFloorPage.tsx](file:///d:/code%20gemini/menu/src/pages/admin/AdminFloorPage.tsx)
- Visual Floor Operations board:
  - Header statistics: Total Tables, Available, Active/Occupied, Preparing, Ready to Serve, Awaiting Payment.
  - Operational filter bar: All Tables, Available, Occupied, Preparing, Ready, Awaiting Payment, My Orders (assigned to me).
  - Search input: table number, order number, customer name.
  - Table grid: Luxury responsive cards displaying:
    - Table number, name, capacity icon.
    - Derived operational state badge with distinct theme styling.
    - Active order number, item count, and timer.
    - Kitchen items progress indicator (e.g. "2 Prep, 1 Ready").
    - Payment badge (masked if caller lacks payment permissions).
    - Assigned waiter name with quick "Claim" action if unassigned.
  - Real-time updates via SSE without manual page refresh.

#### [NEW] [src/components/admin/TableDetailDrawer.tsx](file:///d:/code%20gemini/menu/src/components/admin/TableDetailDrawer.tsx)
- Polished slide-over drawer when clicking a table card on the Floor:
  - Table profile (number, capacity, location, QR link).
  - Active orders breakdown with itemized tickets and item-level kitchen progress.
  - Assigned Waiter badge with "Claim", "Assign", or "Release" actions.
  - Payment snapshot (amount due, payment status, settlement action).
  - Permission-aware action buttons:
    - [Confirm Order] (if `CONFIRM_ORDER`)
    - [Serve Order] (if `MARK_ORDER_SERVED`)
    - [Settle Cash] (if `CONFIRM_CASH_PAYMENT`)
    - [Cancel Order] (if `CANCEL_ORDER`)

#### [MODIFY] [src/pages/admin/AdminOrdersPage.tsx](file:///d:/code%20gemini/menu/src/pages/admin/AdminOrdersPage.tsx)
- Transform into an enhanced Waiter Workspace:
  - Tab views: "All Orders", "My Orders", "Ready to Serve", "Awaiting Payment".
  - One-tap "Claim" button on unassigned tickets.
  - Assigned waiter badge on each ticket card.
  - One-tap "Serve" button on tickets in `READY` status.

#### [MODIFY] [src/pages/admin/AdminKitchenPage.tsx](file:///d:/code%20gemini/menu/src/pages/admin/AdminKitchenPage.tsx)
- Integrate table context:
  - Displays `Table #12` prominently on each KDS ticket header.
  - Live preparation timer counting up based on database `createdAt`.
  - Displays customer notes prominently (e.g. "No onions").
  - Derived order readiness indicator: when all cook items are marked `READY`, prompts expediter/kitchen to advance ticket.

#### [MODIFY] [src/components/admin/AdminSidebar.tsx](file:///d:/code%20gemini/menu/src/components/admin/AdminSidebar.tsx)
- Add "Floor Operations" nav item linked to `/admin/floor` (icon: `LayoutGrid`), visible if user has `VIEW_TABLES` or `VIEW_ORDERS`.

#### [MODIFY] [src/pages/admin/AdminDashboard.tsx](file:///d:/code%20gemini/menu/src/pages/admin/AdminDashboard.tsx)
- Add "Floor Operations" quick-launch card alongside Waiter, Kitchen, POS, and Staff launchpads.

#### [MODIFY] [src/App.tsx](file:///d:/code%20gemini/menu/src/App.tsx)
- Register route `/admin/floor` with `<PermissionRoute permission="VIEW_TABLES">`.

---

### 4. Automated Testing & Verification

#### [NEW] [server/tests/operations.test.ts](file:///d:/code%20gemini/menu/server/tests/operations.test.ts)
- Comprehensive test suite covering at least 60 automated tests across:
  1. **Floor Operations (Tests 1–8)**: Loading floor, derived states (Available, Occupied, Preparing, Ready to Serve, Awaiting Payment, Paid).
  2. **Orders & Lifecycle (Tests 9–20)**: Order visibility, assignment, unassignment, claim race condition, full transition sequence (Pending -> Confirmed -> Preparing -> Ready -> Served -> Completed), cancel permission.
  3. **Kitchen Coordination (Tests 21–27)**: Table context on tickets, item-level prep/ready, partial vs full readiness, read-only KDS gating.
  4. **Payments & Cash Flow (Tests 28–34)**: Pending payment, cash confirmation with server change calculation, duplicate cash prevention, awaiting payment queue.
  5. **Waiter Workspace (Tests 35–39)**: "My Orders" filtering, Ready to Serve queue, Serve transition authorization, menu/report privilege boundaries.
  6. **Tables & Multi-Tenant (Tests 40–44)**: Table detail endpoint, active order linkage, table release after completion/payment, cross-tenant isolation.
  7. **Real-Time SSE Coordination (Tests 45–52)**: New order updates floor, kitchen ready notifies waiter, payment update notifies cashier, tenant isolation, SSE data filtering.
  8. **Security & Data Minimization (Tests 53–56)**: 403 on unauthorized actions, financial/fiscal data omission.
  9. **Concurrency & Race Conditions (Tests 57–62)**: Concurrent claim race condition (only 1 winner), double serve race, duplicate cash payment block.

#### [MODIFY] [package.json](file:///d:/code%20gemini/menu/package.json)
- Add `"test:operations": "tsx server/tests/operations.test.ts"`.

---

## Verification Plan

### Automated Tests
1. Run Phase 12 operational test suite:
   ```bash
   npm run test:operations
   ```
   Must pass all 60+ tests with 0 failures.
2. Run all 13 existing regression test suites:
   ```bash
   npm run test:operational-access
   npm run test:staff
   npm run test:provisioning
   npm run test:platform
   npm run test:video-transition
   npm run test:video-playback
   npm run test:food-modal-scroll
   npm run test:food-media
   npm run test:phase8
   npm run test:phase7
   npm run test:realtime
   npm run test:qa
   npm run test:api
   ```
   All 299 existing tests must pass with 0 regressions.
3. Strict TypeScript type check:
   ```bash
   npx tsc -b
   ```
4. Vite production build:
   ```bash
   npm run build
   ```

### Documentation
- Create `docs/restaurant-operations.md` documenting the complete floor architecture, table derived states, waiter/kitchen/cashier coordination, concurrency protections, and lifecycle diagram.
