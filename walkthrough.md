# Phase 12: Advanced Order Workflow, Floor/Table Operations & Kitchen Coordination

This document provides a comprehensive architectural walkthrough, operational loop guide, and verification report for **Phase 12: Advanced Order Workflow, Floor/Table Operations & Kitchen Coordination**.

---

## 1. Executive Summary & Verification Matrix

Phase 12 connects the restaurant's operational touchpoints into an integrated, real-time loop:
`TABLE → CUSTOMER ORDER → WAITER / CONFIRMATION → KITCHEN → READY → WAITER NOTIFIED → SERVED → PAYMENT → COMPLETED → TABLE RELEASED`.

### Comprehensive Test & Build Verification

| Test Suite / Verification | Command | Results | Status |
| :--- | :--- | :--- | :--- |
| **Phase 12: Operations, Floor & Kitchen** | `npm run test:operations` | **66 / 66 Passed (0 errors)** | ✅ Verified |
| **Phase 11B: Operational Access & Workspaces** | `npm run test:operational-access` | **57 / 57 Passed (0 errors)** | ✅ Verified |
| **Phase 11A: Staff & Custom Permissions** | `npm run test:staff` | **28 / 28 Passed (0 errors)** | ✅ Verified |
| **Phase 10: Provisioning & Onboarding Suite** | `npm run test:provisioning` | **28 / 28 Passed (0 errors)** | ✅ Verified |
| **Phase 9: Platform Admin & Tenant Architecture** | `npm run test:platform` | **23 / 23 Passed (0 errors)** | ✅ Verified |
| **Food Video Transition Zero-Flash Suite** | `npm run test:video-transition` | **20 / 20 Passed (0 errors)** | ✅ Verified |
| **Food Video Playback Single-Play Suite** | `npm run test:video-playback` | **16 / 16 Passed (0 errors)** | ✅ Verified |
| **Food Form Modal Scroll & Viewport Suite** | `npm run test:food-modal-scroll` | **12 / 12 Passed (0 errors)** | ✅ Verified |
| **Food Media & Optional Media Suite** | `npm run test:food-media` | **25 / 25 Passed (0 errors)** | ✅ Verified |
| **Phase 8 Payments, NIF & Fiscal Suite** | `npm run test:phase8` | **11 / 11 Passed (0 errors)** | ✅ Verified |
| **Phase 7 Branding & Theme Engine Suite** | `npm run test:phase7` | **12 / 12 Passed (0 errors)** | ✅ Verified |
| **Real-Time Customer SSE Suite** | `npm run test:realtime` | **12 / 12 Passed (0 errors)** | ✅ Verified |
| **Production QA & Security Suite** | `npm run test:qa` | **15 / 15 Passed (0 errors)** | ✅ Verified |
| **Core API & Order Processing Suite** | `npm run test:api` | **40 / 40 Passed (0 errors)** | ✅ Verified |
| **TypeScript Strict Compilation** | `npx tsc -b` | **0 Errors** | ✅ Verified |
| **TOTAL AUTOMATED TESTS PASSED** | — | **365 / 365 Passed (100%)** | 🚀 Production Ready |

---

## 2. The Operational Loop Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │       Phase 12 Unified Restaurant Operations Loop      │
                    └───────────────────────────┬────────────────────────────┘
                                                │
   ┌────────────────────────────────────────────┴────────────────────────────────────────────┐
   │                                                                                         │
   ▼                                                                                         ▼
┌─────────────────────────────────┐                                       ┌─────────────────────────────────┐
│     Customer / Table Origin     │                                       │     Waitstaff & Floor Desk      │
├─────────────────────────────────┤                                       ├─────────────────────────────────┤
│ • Scans Dynamic QR at Table     │                                       │ • Floor View (/admin/floor)     │
│ • Builds Cart & Places Order    │                                       │ • KPI summary cards & filters   │
│ • State: ORDER_PENDING          │──────────────────┐                    │ • Concurrency-safe atomic claim │
└─────────────────────────────────┘                  │                    │ • Table Detail Drawer           │
                                                     ▼                    └────────────────┬────────────────┘
                                  ┌─────────────────────────────────┐                      │
                                  │      Kitchen Display (KDS)      │                      │
                                  ├─────────────────────────────────┤                      │
                                  │ • Ticket with table & priority  │◄─────────────────────┘
                                  │ • Item-by-item status advance   │
                                  │ • Order ready alert via SSE     │
                                  └────────────────┬────────────────┘
                                                   │
                                                   ▼
                                  ┌─────────────────────────────────┐
                                  │       Runner & Food Serve       │
                                  ├─────────────────────────────────┤
                                  │ • Alert: READY_TO_SERVE         │
                                  │ • Runner delivers to table      │
                                  │ • POST /serve advances status   │
                                  └────────────────┬────────────────┘
                                                   │
                                                   ▼
                                  ┌─────────────────────────────────┐
                                  │      Payment & Table Reset      │
                                  ├─────────────────────────────────┤
                                  │ • Bill requested: AWAITING_PAY  │
                                  │ • Cash or digital payment (PAID)│
                                  │ • Fiscal receipt auto-generated │
                                  │ • Order COMPLETED releases table│
                                  │ • State: AVAILABLE              │
                                  └─────────────────────────────────┘
```

---

## 3. Key Components Implemented

### 3.1 Derived Table Operational State Engine (`FloorService`)
- [floorService.ts](file:///d:/code%20gemini/menu/server/src/services/floorService.ts) deterministically computes the table operational status from active orders, item progress, and payment records without persisting denormalized state flags:
  - `AVAILABLE`: Table has no active orders.
  - `ORDER_PENDING`: Customer submitted order, awaiting staff acceptance.
  - `ORDER_ACTIVE`: Staff accepted order (`CONFIRMED`).
  - `PREPARING`: Items are actively being prepared in the kitchen.
  - `READY_TO_SERVE`: Kitchen marked food ready; urgent delivery required (highlighted with pulsing purple badge).
  - `SERVED`: Dishes delivered to the table.
  - `AWAITING_PAYMENT`: Food served and bill is pending payment.
  - `PAID`: Bill paid; pending final release.

### 3.2 Concurrency-Safe Waiter Assignment & Serve
- [orderRoutes.ts](file:///d:/code%20gemini/menu/server/src/routes/orderRoutes.ts):
  - **Atomic Claim (`POST /api/restaurants/:id/orders/:orderId/claim`)**: Uses atomic `updateMany` checking `assignedWaiterUserRestaurantId: null`. Simultaneous claims by two waiters result in exactly one receiving `200 OK` and the other receiving `409 Conflict` (`ORDER_ALREADY_ASSIGNED`).
  - **Atomic Serve (`POST /api/restaurants/:id/orders/:orderId/serve`)**: Requires `status: READY` and updates atomically with child item synchronization, audit logging, and SSE broadcasts.
  - **Manager Assignment (`POST /api/restaurants/:id/orders/:orderId/assign`)**: Supervisors/Owners can directly delegate orders to specific staff members.
  - **Priority Selector (`PATCH /api/restaurants/:id/orders/:orderId/priority`)**: Supports `NORMAL`, `HIGH`, `URGENT` ticket priority across kitchen and floor.

### 3.3 Visual Interactive Floor View (`AdminFloorPage`)
- [AdminFloorPage.tsx](file:///d:/code%20gemini/menu/src/pages/admin/AdminFloorPage.tsx):
  - Located at `/admin/floor` with navigation link in `AdminSidebar` and workspace launchpad card in `AdminDashboard`.
  - Displays real-time operational KPI counters: Total Tables, Occupied, Cooking, Ready to Serve, Awaiting Payment.
  - Interactive table cards displaying derived state badges, timer indicators, assigned waiter name, item counts, unpaid balance, and quick action buttons.
  - Operational filter tabs (`All`, `Available`, `Occupied`, `Preparing`, `Ready to Serve`, `Awaiting Payment`, `My Assigned`).

### 3.4 Table Detail Slide-Over Drawer (`TableDetailDrawer`)
- [TableDetailDrawer.tsx](file:///d:/code%20gemini/menu/src/components/admin/TableDetailDrawer.tsx):
  - Displays table metadata, active state badge, timer in current state, and QR code download.
  - Lists all active orders with item breakdowns, customer notes, priority badges, and status histories.
  - Inline waiter claim/unassign/assign controls.
  - Status advance buttons (`Confirm Order`, `Mark Ready`, `Serve Food`, `Complete Order`).
  - Cash payment settlement modal triggering receipt generation.

### 3.5 Real-Time SSE Synchronization
- [realtimeService.ts](file:///d:/code%20gemini/menu/server/src/services/realtimeService.ts):
  - Emits `floor_updated`, `order_assigned`, `order_ready`, `order_served`, and `order_status_changed`.
  - Reconnects automatically and updates table states instantly across all open screens without manual refresh.

---

## 4. Verification Guide

To re-verify the full system at any time:

1. **Run the Phase 12 Operational Test Suite**:
   ```bash
   npm run test:operations
   ```
   *Expected: 66 passed, 0 failed.*

2. **Verify TypeScript Strict Compilation**:
   ```bash
   npx tsc -b
   ```
   *Expected: 0 errors.*

3. **Verify All 14 Test Suites**:
   ```bash
   npm run test:operational-access
   npm run test:staff
   npm run test:provisioning
   npm run test:platform
   npm run test:food-media
   npm run test:video-playback
   npm run test:video-transition
   npm run test:food-modal-scroll
   npm run test:phase8
   npm run test:phase7
   npm run test:realtime
   npm run test:qa
   npm run test:api
   npm run test:operations
   ```
   *Expected: All 365 tests pass cleanly.*

4. **Explore the Live UI**:
   - Access the floor overview at `http://localhost:5173/admin/floor`.
   - Access the kitchen KDS at `http://localhost:5173/admin/kitchen`.
   - Access order management at `http://localhost:5173/admin/orders`.
