# Restaurant Payments Architecture & Lifecycle (Phase 8)

## 1. Architectural Overview

The AURA Studio payments architecture provides a financial engine designed for multi-tenant hospitality operations. It decouples operational order workflow from financial settlement, providing high-assurance audit trails, PCI-DSS compliance, and support for cash, card, and Portuguese MB WAY payment rails.

```
                    ┌─────────────────────────┐
                    │   Customer Places Tray   │
                    └────────────┬────────────┘
                                 │
                 Order Created (status: PENDING)
                 Payment Created (status: UNPAID)
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
[Method: CASH]            [Method: CARD]            [Method: MB WAY]
       │                         │                         │
Staff Collects At Table    Stripe Elements / Token    Push to PT Mobile (9xx)
Authoritative Server Change ClientSecret / Webhook   SIBS / Partner Gateway
       │                         │                         │
       └─────────────────────────┼─────────────────────────┘
                                 │
                  Authoritative Settlement Verification
                  (Prisma Transaction & Lock)
                                 │
                   ┌─────────────┴─────────────┐
                   │  Payment status -> PAID    │
                   │  Receipt Generated (REC)  │
                   │  SSE Broadcast Emitted    │
                   └───────────────────────────┘
```

---

## 2. Strict Lifecycle Separation

A critical design requirement is the strict boundary between **Order Lifecycle** and **Payment Lifecycle**:

| Dimension | Order Lifecycle | Payment Lifecycle |
|---|---|---|
| **States** | `PENDING`, `CONFIRMED`, `PREPARING`, `READY`, `SERVED`, `COMPLETED`, `CANCELLED` | `UNPAID`, `PENDING`, `AUTHORIZED`, `PAID`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED` |
| **Authority** | Kitchen & Floor Staff | Payment Gateway / Staff Cash Register Settlement |
| **Concurrency** | Independent state machine | Atomic database transactions with idempotency protection |
| **Failure Mode** | Dish out of stock or kitchen delay | Insufficient funds, network timeout, webhook retry |

An order can be actively cooked (`PREPARING`) while payment is `UNPAID` (traditional table service) or can be `PAID` upfront (fast-casual / counter pickup). A dish status change never accidentally marks an order as paid.

---

## 3. Supported Payment Methods

### 3.1. Cash Settlement (`CASH`)
- **Workflow**: Diners request cash payment at table or counter.
- **Security Rule**: Customers can NEVER mark cash payments as paid. Cash settlement is strictly restricted to authenticated staff (`Role.STAFF`, `MANAGER`, `ADMIN`, `OWNER`).
- **Authoritative Change Calculation**:
  - The client provides `amountReceived`.
  - The server verifies: `amountReceived >= order.total`.
  - Server calculates change: `changeGiven = amountReceived - order.total`.
  - System logs `receivedByUserId`, `amountReceived`, and `changeGiven` in `Payment` and `PaymentTransaction`.
  - Generates an immutable technical receipt snapshot (`REC-YYYY-NNNNN`).
  - Emits real-time SSE `payment_status_changed` notification to staff and diner.

### 3.2. Credit / Debit Card (`CARD`)
- **Tokenized Model**: Card data is never captured, processed, or stored on application servers.
- **Provider Architecture**: Implemented via `StripePaymentProvider` using hosted tokenization (Stripe Elements / PaymentIntents).
- **PCI-DSS Compliance**: The server only receives tokens, ephemeral client secrets, and webhook confirmations. No raw PAN, CVV, or PIN touches application memory.

### 3.3. MB WAY (`MBWAY`)
- **Portuguese Mobile Payment**: Built specifically for Portugal's national mobile payment system.
- **Validation**: Strict validation of Portuguese mobile phone numbers: exactly 9 numeric digits starting with `9` (e.g. `91xxxxxxx`, `92xxxxxxx`, `93xxxxxxx`, `96xxxxxxx`).
- **Asynchronous Flow**: A payment request is submitted to the gateway; the user approves via their mobile app; webhook notification notifies the system, transitioning payment to `PAID`.

### 3.4. Mock Provider (`MOCK`)
- Fully featured testing and development provider allowing configurable outcomes (`SUCCESS`, `PENDING`, `FAILED`), webhook simulation, and automated test suite verification.

---

## 4. Idempotency & Webhook Deduplication

To eliminate double-charges from network disconnects or repeated webhook events:
1. **Idempotency Keys**: `POST /api/payments` accepts an `Idempotency-Key` header. Consecutive requests with the same key return the existing payment without creating duplicate charges.
2. **Webhook Event Log**: Ingested external webhook events are hashed and recorded in `PaymentWebhookEvent`. If an event ID has already been marked as `PROCESSED`, the server immediately responds `200 OK` without re-processing.

---

## 5. Refunds & Financial Reconciliation

1. **Full & Partial Refunds**:
   - Authorized managers/admins can initiate refunds via `POST /api/payments/:id/refund`.
   - The server validates that `refundAmount <= (payment.amount - payment.refundedAmount)`.
   - Transitions payment to `PARTIALLY_REFUNDED` or `REFUNDED`.
   - Logs a `REFUND` transaction in `PaymentTransaction` and emits SSE updates.
2. **Reconciliation Engine**:
   - `GET /api/restaurants/:id/reconciliation`: Compares expected order totals against registered payment transactions, flagging uncaptured differences or mismatched drawer totals.
   - `GET /api/restaurants/:id/cash-operations`: Full audit log of all physical banknotes collected, change returned, and responsible staff.
