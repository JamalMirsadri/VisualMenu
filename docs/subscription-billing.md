# Phase 13A: SaaS Subscription Core, Billing Isolation, Access Enforcement & Expiry Reminders

This document describes the architectural foundation, data models, state machines, access enforcement gates, scheduler, notification mechanisms, and security invariants for Aura Menu's tenant-scoped subscription billing system.

---

## 1. Fundamental Architectural Separation

A fundamental architectural invariant of the platform is the **complete lifecycle and data isolation** between SaaS subscription revenue and customer restaurant order transactions:

```
┌─────────────────────────────────────────────────────────────┐
│                       AURA PLATFORM                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌───────────────────────────────┐     ┌───────────────────────────────┐
│     SaaS SUBSCRIPTION CORE    │     │   CUSTOMER ORDER PAYMENTS     │
├───────────────────────────────┤     ├───────────────────────────────┤
│ • Tenant-scoped B2B revenue   │     │ • End-customer B2C payments   │
│ • Subscription plans & tiers  │     │ • Tables, foods, orders, cart │
│ • Subscription invoices       │     │ • POS, Cash, Card, MB WAY     │
│ • Hourly expiry scheduler     │     │ • Fiscal receipt integration  │
│ • Expiration & access gating  │     │ • Kitchen/bar prep workflow   │
│ • In-app reminder logs        │     │                               │
│ • SubscriptionPayment domain  │     │ • Payment / FiscalDocument    │
└───────────────────────────────┘     └───────────────────────────────┘
```

> **Critical Rule:** `SubscriptionPayment` and `SubscriptionInvoice` records NEVER mix with customer `Payment` or `FiscalDocument` records. Customer ordering and public menu viewing (`/menu/*`) remain operational regardless of a restaurant's admin subscription status.

---

## 2. Subscription Data Model & Schemas

### 2.1 `SubscriptionPlan`
Authoritative plan definition managed exclusively by Platform Admin:
- `id` (UUID, Primary Key)
- `code` (Unique, e.g. `STARTER_MONTHLY`, `PRO_YEARLY`)
- `name` (Display name, e.g. "Professional Plan")
- `description` (Features & metadata)
- `price` (Decimal, e.g. 49.00)
- `currency` (e.g. `EUR`)
- `billingInterval` (`MONTHLY` | `YEARLY`)
- `intervalCount` (Default 1)
- `trialDays` (Optional trial period, e.g. 14 days)
- `gracePeriodDays` (Configurable grace period, default 7 days)
- `active` (Boolean flag)

### 2.2 `Subscription`
Tenant-scoped entity bound 1:1 with a `Restaurant`:
- `id` (UUID, Primary Key)
- `restaurantId` (Unique Foreign Key referencing `Restaurant`)
- `planId` (Foreign Key referencing `SubscriptionPlan`)
- `status` (`SubscriptionStatus` enum)
- `startsAt` (Timestamp)
- `currentPeriodStart` (UTC timestamp)
- `currentPeriodEnd` (UTC timestamp)
- `trialEndsAt` (Nullable UTC timestamp)
- `graceEndsAt` (Nullable UTC timestamp)
- `cancelledAt` (Nullable UTC timestamp)
- `endedAt` (Nullable UTC timestamp)
- `autoRenew` (Boolean)
- `provider` (e.g. `MOCK`, `STRIPE`, `MBWAY`)
- `providerCustomerId` (Nullable string)
- `providerSubscriptionId` (Nullable string)
- `agreedPrice` (Decimal, immutable historical price agreed at subscription start)
- `agreedCurrency` (Currency agreed at subscription start)

### 2.3 `SubscriptionPayment`
Immutable SaaS transaction ledger:
- `id` (UUID, Primary Key)
- `subscriptionId` (Foreign Key referencing `Subscription`)
- `amount` (Decimal)
- `currency` (String, e.g. EUR)
- `status` (`PENDING` | `SUCCEEDED` | `FAILED` | `REFUNDED`)
- `provider` (Provider name)
- `providerTransactionId` (Unique provider reference)
- `idempotencyKey` (Unique idempotency key)
- `failureReason` (Nullable text explaining card or authorization rejection)
- `paidAt` (Timestamp)

### 2.4 `SubscriptionInvoice`
Immutable billing invoices:
- `invoiceNumber` (Deterministic human-readable identifier, e.g. `INV-2026-00123`)
- `periodStart` / `periodEnd` (Billing interval coverage)
- `subtotal` / `tax` / `total` (Computed based on statutory rates)
- `status` (`DRAFT` | `PAID` | `VOID` | `UNCOLLECTIBLE`)

### 2.5 `SubscriptionEvent`
Append-only immutable audit trail for every status transition, manual override, extension, or renewal.

### 2.6 `SubscriptionReminderLog`
Atomic deduplication table with composite unique constraint `@@unique([subscriptionId, eventType, periodEnd])`.

---

## 3. Subscription State Machine & Lifecycle

The subscription state machine is strictly enforced by `SubscriptionService`. Arbitrary status mutations are rejected.

```
                  ┌──────────────────────┐
                  │      PROVISIONED     │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │       PENDING        │ ◄─── Awaiting initial payment
                  └──────────┬───────────┘
                             │ Initial Payment Success
                             ▼
         ┌──────────────► ┌──────────────────────┐ ◄──────────────┐
         │                │        ACTIVE        │                │
         │                └──────────┬───────────┘                │
         │ Renewal                   │                            │
         │ Payment                   │ Period End Reached         │ Restore /
         │ Succeeded                 ▼                            │ Extension
         │                ┌──────────────────────┐                │
         │                │     GRACE_PERIOD     │                │
         │                └──────────┬───────────┘                │
         │                           │                            │
         │                           │ Grace Period Elapsed       │
         │                           ▼                            │
         │                ┌──────────────────────┐                │
         └─────────────── │       EXPIRED        │ ───────────────┘
                          └──────────┬───────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │      SUSPENDED       │ (Platform Admin override)
                          └──────────────────────┘
```

### State Definitions & Access Rules:
1. **`PENDING`**: Restaurant provisioned. Administrative access blocked (HTTP 402). Redirects to subscription checkout.
2. **`ACTIVE`**: Full restaurant management and operational console access allowed.
3. **`PAST_DUE`**: Automatic renewal charge attempt failed; renewal warning active. Access permitted for a brief retry window before grace transition.
4. **`GRACE_PERIOD`**: Subscription period ended. Owner retains admin console access, but a prominent, persistent warning banner is rendered.
5. **`EXPIRED`**: Grace period elapsed without renewal. Normal `/admin/*` operations blocked (HTTP 402). Owner redirected to `/admin/subscription-required`.
6. **`CANCELLED`**: `autoRenew = false`. Restaurant remains `ACTIVE` until `currentPeriodEnd`, after which it transitions to `GRACE_PERIOD` or `EXPIRED`.
7. **`SUSPENDED`**: Administrative intervention by Platform Admin. Admin console blocked immediately.

---

## 4. Access Enforcement Middleware (`requireActiveSubscription`)

Access gating is centralized in `server/src/middleware/subscriptionMiddleware.ts`:

- **Applied to:**
  - `/api/admin/*`
  - `/api/staff/*`
  - Operational management and floor coordination endpoints
- **Bypass Rules:**
  - `Platform Admin` and `Platform Support` bypass restaurant subscription gating to allow administrative support across all tenants.
  - `GET /api/restaurants` (resolving tenant assignment list during login) is unblocked so authenticated users can read their assignments and navigate to the renewal portal.
  - `/api/subscriptions/*` endpoints are unblocked so owners can inspect, checkout, and renew subscriptions.
  - `/api/notifications/*` endpoints are unblocked so owners can read renewal notifications.
  - Public menu routes (`/menu/*`, `/api/menu/*`, customer orders, customer tracking, QR access) remain completely operational.

### Blocked Response Format (HTTP 402 Payment Required):
```json
{
  "success": false,
  "errorCode": "SUBSCRIPTION_REQUIRED",
  "message": "An active subscription is required to access restaurant administration.",
  "subscriptionStatus": "EXPIRED",
  "renewUrl": "/admin/subscription"
}
```

---

## 5. Expiry Reminder Schedule & Deduplication

### 5.1 Reminder Schedule
The server-side scheduler runs hourly and checks `currentPeriodEnd` relative to the current UTC timestamp:
- **30 days before:** Information notice
- **14 days before:** Advance renewal notice
- **7 days before:** Warning notice
- **3 days before:** Urgent reminder
- **1 day before:** Critical alert
- **Expiration Day / Grace Period:** Critical grace & renewal notice

### 5.2 Deterministic Deduplication
Duplicate reminders are mathematically prevented via `SubscriptionReminderLog`:
- Record creation uses the unique composite constraint `(subscriptionId, eventType, periodEnd)`.
- If the scheduler process restarts or runs concurrently, subsequent insertion attempts fail with `P2002` and are safely skipped.
- Notifications format dates in the **restaurant's configured timezone** (from `Restaurant.timezone`).

---

## 6. In-App Notification Center

Tenant-scoped notifications are stored in the `Notification` table:
- Types: `SUBSCRIPTION_30_DAYS`, `SUBSCRIPTION_14_DAYS`, `SUBSCRIPTION_7_DAYS`, `SUBSCRIPTION_3_DAYS`, `SUBSCRIPTION_1_DAY`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_PAYMENT_FAILED`.
- Features:
  - Header Notification Bell with live unread counter badge.
  - Interactive dropdown showing the 5 most recent notices with direct action buttons.
  - Dedicated `/admin/notifications` Notification Center with tabbed filtering (`All`, `Unread`, `Subscription`).
  - Batch "Mark all as read" and individual item resolution.
  - Strict tenant isolation: Tenant A cannot view or dismiss Tenant B's notifications.

---

## 7. Platform Admin Subscription Management

Platform Admins have full cross-tenant subscription management capabilities at `/platform/restaurants/:id`:
- **Subscription Card:**
  - Plan name, interval, agreed price, status badge
  - Current period start & end, days remaining (calculated server-side)
  - Auto-renew indicator, payment provider, latest payment status
- **Admin Actions:**
  - **Activate / Restore:** Manually activate a pending, expired, or suspended subscription.
  - **Suspend:** Suspend restaurant console access with mandatory audit reason.
  - **Grant Extension:** Grant courtesy extensions (`+7 days`, `+14 days`, `+30 days`) without mutating historical invoices.
  - **Change Plan:** Upgrade or downgrade tenant to any active plan catalog tier.
  - **Inspect Billing History:** View detailed tables of generated invoices and payment transactions.
  - **Audit Event Timeline:** Complete chronological record of every status transition with actor details.
- **Plan Catalog Management:**
  - Available at `/platform/subscriptions/plans` for creating, editing metadata, and activating/deactivating subscription tiers.

---

## 8. Financial Security & Idempotency Invariants

1. **Server Authoritative:** Frontend never passes price, status, or expiration dates. All monetary values are retrieved from `SubscriptionPlan.price` in the database.
2. **Historical Price Immutability:** When a plan's price is updated, existing subscriptions retain their `agreedPrice` and `agreedCurrency`. Historical `SubscriptionInvoice` records are never modified.
3. **Payment Idempotency:** Duplicate checkout or renewal calls passing the same `idempotencyKey` return the existing transaction record without charging twice or double-advancing periods.
4. **Webhook Security:** Webhooks verify provider signatures, record incoming events in `SubscriptionWebhookEvent`, and idempotently reject duplicate deliveries.
5. **Fresh DB Authorization:** Subscription status is verified directly against the database on every protected request. A stale JWT containing `status: ACTIVE` cannot bypass an expired database state.
