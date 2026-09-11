# Phase 12: Restaurant Operations, Floor Coordination & Kitchen Workflow

This document details the operational loop, derived table state machine, concurrency guarantees, and real-time coordination architectures implemented in **Phase 12**.

---

## 1. The Unified Operational Loop

In modern hospitality environments, isolated views lead to customer delays and miscommunication. Phase 12 integrates table occupancy, waiter service, kitchen preparation, and billing into a unified operational cycle:

```
TABLE (AVAILABLE)
      │  Customer Scans QR / Staff Opens Table
      ▼
CUSTOMER ORDER (PENDING)
      │  Waiter Accepts / Claims Order
      ▼
WAITER CONFIRMED (CONFIRMED)
      │  Ticket Routed to Kitchen Display System (KDS)
      ▼
KITCHEN PREPARATION (PREPARING)
      │  All Items Prepared & Plated
      ▼
READY TO SERVE (READY)
      │  Runner / Waiter Notified in Real-Time via SSE
      ▼
SERVED AT TABLE (SERVED)
      │  Customer Requests Bill / Staff Settles Cash or Digital Payment
      ▼
PAYMENT (PAID)
      │  Fiscal Document Issued & Order Finalized
      ▼
COMPLETED (COMPLETED)
      │  Table Released & Reset Automatically
      ▼
TABLE (AVAILABLE)
```

---

## 2. Table Operational State Machine

To prevent database desynchronization and stale table flags, table states are **deterministically derived** in real-time from active orders, item statuses, and payment records (`FloorService.deriveTableState`).

| State | Derivation Rule | Visual Badge |
|---|---|---|
| `AVAILABLE` | Table has zero active orders (or all orders are `COMPLETED` / `CANCELLED`) | Emerald (`Available`) |
| `ORDER_PENDING` | Active order submitted by customer, awaiting staff confirmation (`PENDING`) | Amber (`Pending`) |
| `ORDER_ACTIVE` | Active order accepted and confirmed by waitstaff (`CONFIRMED`) | Blue (`Active`) |
| `PREPARING` | At least one active order or order item is being prepared in the kitchen (`PREPARING`) | Orange (`In Kitchen`) |
| `READY_TO_SERVE` | Kitchen marked order or items as `READY`. Waiter attention required immediately. | Purple (`Ready to Serve`, Pulsing Glow) |
| `SERVED` | Order delivered to dining table; dining in progress (`SERVED`) | Indigo (`Served`) |
| `AWAITING_PAYMENT` | Order is served and bill requested, or payment is pending settlement | Amber (`Bill Requested`) |
| `PAID` | Payment confirmed (`PAID`) and fiscal receipt generated; awaiting table reset | Teal (`Paid - Pending Release`) |

### Priority Rule Hierarchy
When a table has multiple active orders or items across states:
1. `READY_TO_SERVE` takes absolute precedence (food is getting cold, runner must act immediately).
2. `PREPARING` takes second precedence (kitchen is actively working).
3. `ORDER_PENDING` / `ORDER_ACTIVE` take third precedence.
4. `SERVED` / `AWAITING_PAYMENT` / `PAID` follow.
5. Once all active orders transition to `COMPLETED`, the table immediately returns to `AVAILABLE`.

---

## 3. Concurrency & Atomic Claim Protection

In a busy dining room, multiple waitstaff may attempt to claim or serve the same table order concurrently. Phase 12 implements atomic database operations:

### 3.1 Waiter Claim (`POST /api/restaurants/:restaurantId/orders/:orderId/claim`)
- Uses conditional atomic write:
  ```ts
  const updatedCount = await prisma.order.updateMany({
    where: {
      id: orderId,
      restaurantId,
      OR: [
        { assignedWaiterUserRestaurantId: null },
        { assignedWaiterUserRestaurantId: waiterId },
      ],
    },
    data: { assignedWaiterUserRestaurantId: waiterId },
  });
  ```
- If two waiters submit `/claim` at the exact same millisecond:
  - Exactly one request updates the record (`count === 1`) and returns HTTP `200 OK`.
  - The other request matches zero rows (`count === 0`) and returns HTTP `409 Conflict` (`ORDER_ALREADY_ASSIGNED`) with the name of the assigned waiter.

### 3.2 Waiter Serve (`POST /api/restaurants/:restaurantId/orders/:orderId/serve`)
- Atomic transition from `READY` to `SERVED`:
  ```ts
  const updateCount = await tx.order.updateMany({
    where: { id: orderId, status: OrderStatus.READY },
    data: { status: OrderStatus.SERVED },
  });
  if (updateCount.count === 0) {
    throw new Error('ORDER_ALREADY_SERVED');
  }
  ```
- Guaranteed at database level: exactly one serve call succeeds; concurrent attempts receive HTTP `400 Bad Request` or `409 Conflict`.

---

## 4. Real-Time Floor & Kitchen Synchronization (SSE)

Real-time updates are streamed via Server-Sent Events (`/api/restaurants/:restaurantId/orders/stream`):

### 4.1 Event Catalog
- `order_assigned`: Broadcast when an order is claimed or assigned to a staff member.
- `order_ready`: Emitted when the kitchen marks all or remaining items ready for delivery.
- `order_served`: Emitted when the runner confirms food delivery at the table.
- `floor_updated`: Emitted on any state transition, notifying the Floor Operations view (`/admin/floor`) to update table cards, timer counters, and badges without page reload.

---

## 5. Security & Data Minimization

- **Floor Overview (`GET /api/restaurants/:id/floor`)**:
  - Staff without `VIEW_PAYMENTS` receive masked unpaid balances (`totalUnpaidAmount: 0`).
  - Cashiers and managers with `VIEW_PAYMENTS` receive accurate live table totals.
  - Staff without `VIEW_CUSTOMERS` have customer names and fiscal data omitted.
- **Role Isolation**:
  - Waitstaff from Restaurant A cannot query, claim, or advance orders for Restaurant B (`403 Forbidden` / `404 Not Found`).
  - Disabled staff accounts are blocked at gateway middleware (`403 STAFF_DISABLED`).

---

## 6. Verification & Test Suite

The automated operational suite runs via:
```bash
npm run test:operations
```

The suite executes **66 comprehensive end-to-end tests** covering:
1. Floor State Derivation & Calculations (10 tests)
2. Floor Operational API Endpoints (8 tests)
3. Waiter Assignment & Concurrency Lifecycle (12 tests)
4. Order Lifecycle & Ready/Serve Operations (10 tests)
5. Kitchen Coordination, Notes & Timers (6 tests)
6. Payment, Completion & Table Release (8 tests)
7. Multi-Tenant Security & Isolation (8 tests)
8. Concurrency & Atomicity Under Stress (4 tests)
