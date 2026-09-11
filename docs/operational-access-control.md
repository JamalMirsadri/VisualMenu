# Phase 11B: Operational Access Control & Role Workspaces Guide

This guide documents the enterprise-grade operational access control system, role workspace routing, granular permission gates, and data protection boundaries implemented across the multi-tenant restaurant SaaS.

---

## 1. Core Authorization Principles

1. **Permissions Govern Capabilities, Not Role Names Alone**:
   Role names (`OWNER`, `MANAGER`, `STAFF`) provide high-level defaults, but **effective permissions** (evaluated via `hasPermission()`) govern actual system behavior across navigation menus, dashboard KPI metrics, workspace views, interactive buttons, modal fields, API endpoints, and real-time Server-Sent Events (SSE).

2. **Defense in Depth**:
   Client-side hiding and disabling of UI elements is paired with strict backend route middleware (`requirePermission`, `requireAnyPermission`, and explicit endpoint logic). Unpermitted attempts return `403 Forbidden` with descriptive error codes (`INSUFFICIENT_PERMISSIONS`, `TENANT_FORBIDDEN`, `STAFF_DISABLED`).

3. **Strict Multi-Tenant Isolation**:
   All operational queries, metrics, and actions are strictly partitioned by `restaurantId`. Cross-tenant attempts are rejected immediately with `403 RESTAURANT_ACCESS_DENIED` or `TENANT_FORBIDDEN`.

4. **Instant Deactivation via `STAFF_DISABLED`**:
   Disabled staff memberships (`status === 'DISABLED'`) are immediately blocked from all operational endpoints, dashboards, and real-time SSE streams.

---

## 2. Practical Permission Matrix by Template

The table below illustrates default and optional capabilities across operational staff profiles:

| Capability | Owner | Waiter | Kitchen | Cashier | Host | Supervisor | Accounting | Custom |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Orders View** | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | *Opt* |
| **Order Status Advance** | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | *Opt* |
| **Order Cancel** | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | *Opt* |
| **Kitchen KDS View** | ✓ | ✓* | ✓ | ✗ | ✗ | ✓ | ✗ | *Opt* |
| **KDS Status Advance** | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | *Opt* |
| **Cash Settlement** | ✓ | ✓* | ✗ | ✓ | ✗ | ✓ | ✗ | *Opt* |
| **Payment Processing/Refund** | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | *Opt* |
| **Menu Editing** | ✓ | ✗ | ✗ | ✗ | ✗ | ✓* | ✗ | *Opt* |
| **Price Management** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | *Opt* |
| **Customer Directory** | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | *Opt* |
| **Customer Fiscal Data (NIF)** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | *Opt* |
| **Staff Management** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | *Opt* |
| **Financial Reports** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | *Opt* |
| **Branding & Settings** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | *Opt* |

*\*Only when explicitly granted by restaurant Owner.*

---

## 3. Operational Workspaces

Staff members are provided dedicated workspace entry points tailored to their daily duties:

### 3.1 Floor / Waiter Workspace (`/admin/orders`)
- **Required Permission**: `VIEW_ORDERS`
- **Capabilities**:
  - Live order feed with real-time SSE ticket updates.
  - One-tap status transitions: Confirm (`CONFIRM_ORDER`), Mark Served (`MARK_ORDER_SERVED`), or Complete (`MARK_ORDER_COMPLETED`).
  - Cash settlement launch button (if caller also has `CONFIRM_CASH_PAYMENT`).
  - Strict UI gating: action buttons disable automatically if caller lacks the specific step permission.

### 3.2 Kitchen Display System (KDS) (`/admin/kitchen`)
- **Required Permission**: `VIEW_KITCHEN` (or `VIEW_KITCHEN_ORDERS`)
- **Read-Only Mode Protection**:
  - If a user has `VIEW_KITCHEN` but lacks `UPDATE_KITCHEN_STATUS`, a prominent **Read-Only Mode** badge is displayed.
  - All status advancement buttons (e.g. "Start Prep", "Mark Ready") are cleanly disabled with tooltip explanations and padlock icons.
- **Full Operational Mode**:
  - Staff with `UPDATE_KITCHEN_STATUS` + `CONFIRM_PREPARATION` / `MARK_READY` can interactively advance individual item tickets or entire orders.

### 3.3 Cash Register / POS Workspace (`/admin/payments`)
- **Required Permission**: `VIEW_PAYMENTS`
- **Capabilities**:
  - Summary of pending, settled, and refunded transactions.
  - Cash payment settlement modal with change calculation (`CONFIRM_CASH_PAYMENT`).
  - Transaction refund drawer (`PROCESS_PAYMENTS`).
  - Technical fiscal receipt generation and verification.

---

## 4. Sensitive Data Protection

### 1. Financial Metric Isolation
- **Endpoint**: `GET /api/restaurants/:id/dashboard-metrics`
- The backend evaluates `VIEW_FINANCIAL_REPORTS`.
- When permitted: returns `financialMetrics` with `todaySales`, `todayRevenue`, `totalRevenue`, `cashPaymentsCount`, and `cardPaymentsCount`.
- When lacking: `financialMetrics` is **strictly omitted** from the response payload, and the client dashboard omits the Financial Overview card entirely.

### 2. Price Segregation
- Separation of `MANAGE_FOODS` vs `MANAGE_FOOD_PRICES`.
- A kitchen manager or menu editor with `MANAGE_FOODS` can update dish descriptions, ingredients, allergens, and tags, but **cannot change prices**.
- If a user lacking `MANAGE_FOOD_PRICES` attempts to submit or edit a price on `POST /api/restaurants/:id/foods` or `PUT /api/foods/:id`, the backend returns `403 INSUFFICIENT_PERMISSIONS`.
- In the frontend `FoodFormModal`, the price input displays a padlock icon and is disabled, preserving the existing price on submit.

### 3. Fiscal & Tax Identification (NIF) Masking
- **Endpoint**: `GET /api/restaurants/:id/customers/:customerId`
- Customers store sensitive fiscal records (e.g. Portuguese NIF / VAT ID, billing address).
- When caller lacks `VIEW_CUSTOMER_FISCAL_DATA`, fiscal profiles are stripped from API responses, and table displays show `***-***-*** (Protected)`.

---

## 5. Real-Time SSE & Session State

1. **Emission After Transaction Commit**:
   All real-time SSE events (`ORDER_UPDATED`, `KITCHEN_UPDATED`, `PAYMENT_UPDATED`) are emitted strictly after the corresponding database transaction commits.
2. **Active Session Changes**:
   When an Owner modifies permissions for a staff member:
   - The staff member's backend requests are authorized against fresh DB relational data on every request.
   - Frontend `useAuth` hook refreshes effective permissions so UI controls update promptly without manual page reloads.
3. **Disabled Staff (`STAFF_DISABLED`)**:
   When staff status is changed to `DISABLED`:
   - All subsequent API requests immediately return `403 STAFF_DISABLED`.
   - Real-time SSE streaming connections for the user are immediately disconnected.

---

## 6. Verification & Test Execution

Run the complete Phase 11B operational access test suite:
```bash
npm run test:operational-access
```

The test suite validates:
- Scoped dashboard metrics & financial field exclusion (Tests 1–6)
- Order status lifecycle authorization step-by-step (Tests 7–20)
- Kitchen KDS item and ticket status gates (Tests 21–24)
- Cash settlement & refund controls (Tests 25–30)
- Menu price modification segregation (Tests 31–38)
- Category & media management controls (Tests 39–44)
- Dining tables & QR controls (Tests 45–48)
- Customer fiscal profile protection & NIF masking (Tests 49–52)
- Instant revocation via `STAFF_DISABLED` (Tests 53–54)
- Cross-tenant boundary enforcement (Test 55)
- Unauthenticated endpoint rejection (Test 56)
