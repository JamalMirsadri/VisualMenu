# Phase 13B: Notification Center, Platform-to-Restaurant Messaging & Subscription Communication

## Overview
Phase 13B establishes an enterprise-grade tenant notification and platform messaging system for the AURA SaaS platform. It connects two primary communication channels into a unified tenant notification center:
1. **System Notifications**: Automated lifecycle events (subscription renewal reminders at 30/14/7/3/1 days, payment failures, plan upgrades, system & security notices).
2. **Platform Messages**: Operator-composed broadcasts and targeted communications sent from Platform Admin to one restaurant, multiple selected restaurants, or all active tenants.

The system is engineered with strict tenant isolation, safety checks against accidental mass broadcasts, recipient deduplication, non-destructive edit history, read receipts, urgent acknowledgement tracking, and scheduled message publishing.

---

## 1. Database Architecture & Data Models

### Models Overview
```
┌───────────────────────────────────────────────────────────────┐
│                       PlatformMessage                         │
│  - id: UUID                                                   │
│  - senderUserId: UUID (Platform Admin)                        │
│  - title, message, priority, targetType, status               │
│  - scheduledAt, sentAt, expiresAt, metadata                   │
└───────────────┬───────────────────────────────┬───────────────┘
                │ 1:N                           │ 1:N
                ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│   PlatformMessageRecipient    │   │    PlatformMessageRevision    │
│  - messageId + restaurantId   │   │  - messageId, title, content  │
│    (Composite Unique PK)      │   │  - editedByUserId, createdAt  │
│  - deliveredAt, readAt        │   └───────────────────────────────┘
│  - acknowledgedAt             │
│  - acknowledgedByUserId       │
└───────────────┬───────────────┘
                │ 1:1 linked delivery
                ▼
┌───────────────────────────────────────────────────────────────┐
│                         Notification                          │
│  - id: UUID                                                   │
│  - restaurantId: UUID (Strict Tenant Isolation)               │
│  - type: NotificationType (SUBSCRIPTION_*, PLATFORM_MESSAGE)  │
│  - source: SYSTEM | PLATFORM | SECURITY | SUBSCRIPTION        │
│  - priority: LOW | NORMAL | HIGH | URGENT                     │
│  - title, message, severity, pinned, expiresAt                │
│  - readAt, acknowledgedAt, acknowledgedByUserId               │
│  - platformMessageId: UUID?                                   │
└───────────────────────────────────────────────────────────────┘
```

### Composite Unique Constraints & Deduplication
To eliminate accidental duplicate deliveries when an operator selects overlapping groups or repeats restaurant IDs in a target list:
- `PlatformMessageRecipient` enforces `@@unique([messageId, restaurantId])`.
- Deduplication runs at query level (`Array.from(new Set(restaurantIds))`) and database constraint level.

---

## 2. Notification Sources & Lifecycle

### A. System Notifications
- **Subscription Reminders**: Triggered by `SubscriptionScheduler` based on `currentPeriodEnd`.
  - 30 days before: `NORMAL` priority, `INFO` severity
  - 14 days before: `NORMAL` priority, `INFO` severity
  - 7 days before: `HIGH` priority, `WARNING` severity
  - 3 days before: `HIGH` priority, `WARNING` severity
  - 1 day before: `URGENT` priority, `CRITICAL` severity
- **Payment Failures**: Generated immediately upon webhook or provider payment rejection (`CRITICAL` severity, `URGENT` priority).
- **Renewals & Restorations**: Generated when recurring billing succeeds or subscription is reinstated.
- **Auto-Detection**: `NotificationService.createNotification` automatically infers `SUBSCRIPTION` source from subscription event types, and infers `URGENT` or `HIGH` priority from `CRITICAL` / `WARNING` severity if omitted.

### B. Platform Messages
- **Compose Interface**: Restricted exclusively to `PLATFORM_ADMIN`.
- **Targeting Scopes**:
  - `RESTAURANT`: Single designated restaurant.
  - `MULTIPLE_RESTAURANTS`: Explicit array of selected restaurants.
  - `ALL_RESTAURANTS`: Global broadcast across all active tenants.
- **Safety Mechanism (`CONFIRMATION_REQUIRED`)**:
  - Global broadcasts (`ALL_RESTAURANTS`) require explicit confirmation (`confirmAll: true`).
  - Requests submitted without confirmation are rejected with HTTP 400 and `errorCode: 'CONFIRMATION_REQUIRED'`.
- **Subscription Status Filtering**: Operators can optionally filter broadcasts by subscription tier status (e.g. deliver only to `ACTIVE` subscribers or only to `TRIALING` / `EXPIRED`).

---

## 3. Priority Levels & Urgent Banner Treatment

| Priority | Visual Treatment | Use Case |
|---|---|---|
| `LOW` | Muted badge, standard list item | General informational updates, tips |
| `NORMAL` | Neutral blue badge, standard list | Scheduled changes, normal notices |
| `HIGH` | Amber badge, highlighted card | 7d/3d subscription notices, policy updates |
| `URGENT` | Crimson badge, sticky top banner | Expiry notices, security alerts, outages |

### Urgent Notification Banner
- Implemented as `<UrgentNotificationBanner />` in `src/components/admin/UrgentNotificationBanner.tsx`.
- Automatically injected into `AdminLayout.tsx` and `SubscriptionRequiredPage.tsx`.
- Queries active, unacknowledged `URGENT` notifications for the current restaurant.
- Displays a prominent sticky top bar with direct "Acknowledge" button.
- Dismissing or acknowledging immediately syncs with the server and removes the banner in real time.

---

## 4. Acknowledgement Flow & Read Receipts

### Synchronized Telemetry
When an announcement requires explicit acknowledgement:
1. The tenant user clicks **"Acknowledge"** in the Notification Center or Urgent Banner.
2. The server updates `Notification`:
   - `acknowledgedAt: new Date()`
   - `acknowledgedByUserId: req.user.id`
   - `readAt: notification.readAt || new Date()` (acknowledgement automatically marks the notice as read).
3. If linked to a platform message (`notification.platformMessageId`), the server automatically synchronizes the recipient row in `PlatformMessageRecipient`:
   - `acknowledgedAt: new Date()`
   - `acknowledgedByUserId: req.user.id`
   - `readAt: new Date()`
4. Platform Admin metrics update live:
   - `readCount` & `readPercentage`
   - `acknowledgedCount` & `acknowledgedPercentage`

---

## 5. Scheduled Delivery Worker & Concurrency Locking

Platform operators can schedule announcements in advance (`scheduledAt`):
1. **Creation**: The message is saved in `SCHEDULED` status with 0 delivered notifications.
2. **Worker Dispatch**: `PlatformMessageService.processScheduledMessages()` is integrated directly into the periodic `SubscriptionScheduler.runOnce()` cycle.
3. **Concurrency Lock**:
   - The worker executes an atomic state transition:
     `UPDATE platform_messages SET status = 'SENDING' WHERE id = :id AND status = 'SCHEDULED'`
   - If another worker thread claimed the message, the count is 0 and it skips processing.
4. **Delivery**: The worker re-resolves target restaurants based on stored filter parameters, dispatches notifications, logs the audit trail, and marks status as `SENT`.
5. **Cancellation**: Scheduled messages can be cancelled at any time before delivery via `POST /api/platform/messages/:id/cancel`.

---

## 6. Non-Destructive Revision History

If an operator needs to update an already-published platform announcement:
1. `PATCH /api/platform/messages/:id` preserves the prior state by appending a record into `PlatformMessageRevision` (`title`, `content`, `editedByUserId`, `createdAt`).
2. The live `PlatformMessage` title and content are updated.
3. All tenant-facing `Notification` records linked to that platform message are updated in-place so tenants immediately see the corrected notice.
4. If editing an un-sent `DRAFT`, fields are updated directly without creating revision records.

---

## 7. Tenant Isolation & Expired Subscription Access

### Absolute Tenant Isolation
- Tenants can only read, mark read, or acknowledge notifications matching their assigned `restaurantId`.
- Cross-tenant requests return `403 RESTAURANT_ACCESS_DENIED`.

### Expired Subscription Guarantee
When a restaurant subscription expires:
- High-level management routes (e.g. `/api/admin/categories`, `/api/admin/menu`, `/api/admin/tables`) are blocked with **HTTP 402 Payment Required**.
- The tenant is redirected to `/admin/subscription-required`.
- **Exception**: `/api/notifications/**` routes remain accessible!
- Expired subscription owners can view critical renewal notices, read platform alerts, and acknowledge urgent announcements without encountering 402 barriers.

---

## 8. Real-Time Delivery (SSE)

- Events are broadcast via `realtimeService.broadcastToRestaurant(restaurantId, event, payload)`.
- Channel isolation ensures only clients connected with token access to `restaurant:{restaurantId}` receive events.
- Event names:
  - `notification` / `notification_created`: Emitted when a new notification is generated.
  - `platform_message`: Emitted when a platform announcement is delivered.
- Frontend component `<NotificationBell />` listens to SSE events and immediately updates unread badge count without requiring page refresh.

---

## 9. API Reference

### Tenant Notifications (`/api/notifications`)
| Method | Endpoint | Permissions | Description |
|---|---|---|---|
| `GET` | `/api/notifications/restaurant/:restaurantId` | `VIEW_NOTIFICATIONS` | List paginated notifications with filters |
| `GET` | `/api/notifications/restaurant/:restaurantId/unread-count` | `VIEW_NOTIFICATIONS` | Get current unread notification count |
| `POST` | `/api/notifications/:id/read` | `MARK_NOTIFICATIONS_READ` | Mark single notification as read |
| `POST` | `/api/notifications/:id/unread` | `MARK_NOTIFICATIONS_READ` | Mark single notification as unread |
| `POST` | `/api/notifications/:id/acknowledge` | `ACKNOWLEDGE_NOTIFICATIONS` | Acknowledge urgent notice |
| `POST` | `/api/notifications/restaurant/:restaurantId/read-all` | `MARK_NOTIFICATIONS_READ` | Mark all notifications read |

### Platform Messages (`/api/platform/messages`)
| Method | Endpoint | Permissions | Description |
|---|---|---|---|
| `GET` | `/api/platform/messages` | `PLATFORM_ADMIN` | List messages with status filter & pagination |
| `POST` | `/api/platform/messages` | `PLATFORM_ADMIN` | Compose message (single, multi, broadcast) |
| `GET` | `/api/platform/messages/:id` | `PLATFORM_ADMIN` | Detail view with telemetry & recipient list |
| `PATCH` | `/api/platform/messages/:id` | `PLATFORM_ADMIN` | Edit message (stores revision if SENT) |
| `POST` | `/api/platform/messages/:id/cancel` | `PLATFORM_ADMIN` | Cancel scheduled message |

---

## 10. Verification & Test Coverage

The comprehensive automated test suite in `server/tests/notifications.test.ts` contains **68 tests** verifying all requirements:
- **RBAC & Permissions**: Tests 1–5
- **System & Subscription Notifications**: Tests 6–15
- **Read, Unread & Acknowledgement Lifecycle**: Tests 16–25
- **Platform Messaging Composition & Targeting**: Tests 26–38
- **Scheduled Messages & Worker Concurrency**: Tests 39–46
- **Revision History & Live Updates**: Tests 47–51
- **Telemetry Sync & Read Receipts**: Tests 52–56
- **Multi-Tenant Isolation**: Tests 57–61
- **Expired Subscription Access Guarantee**: Tests 62–64
- **Audit Logging**: Test 65

Run with:
```bash
npm run test:notifications
```
All **68 tests pass with 0 errors**.
