# Phase 10: Restaurant Provisioning, Owner Onboarding & Tenant Initialization Guide

## 1. Overview & Architectural Philosophy

Phase 10 introduces enterprise-grade multi-tenant restaurant provisioning and owner onboarding to the AuraMenu platform. This architecture establishes a strict separation between **Platform Management** (global SaaS operators) and **Tenant Operations** (independent restaurant owners and their staff).

### Core Principles:
1. **Empty Tenant Guarantee**: Every freshly provisioned restaurant is created in a clean, pristine state:
   - **0 Categories**
   - **0 Food Items**
   - **0 Media Assets**
   - **0 Tables**
   - **0 Orders**
   - **0 Customers**
   - **0 Payments**
   - **0 Fiscal Documents / Invoices**
   - **Neutral Configuration Defaults**: `DARK_LUXURY` theme, `INDIVIDUAL_VIDEO` presentation mode, `EUR` currency, English (`en`), 0% baseline tax rate.
   - **Zero Demo Leakage**: No seed dishes, demo images, mock tables, or test transactions are ever injected into newly provisioned restaurants.

2. **Strict Identity & Tenancy Isolation**:
   - **Platform Operators** (`PLATFORM_ADMIN`, `PLATFORM_SUPPORT`, `PLATFORM_VIEWER`) possess global system roles (`User.platformRole`). They are **NEVER** assigned synthetic `UserRestaurant` tenant memberships to administer tenants.
   - **Tenant Roles** (`OWNER`, `ADMIN`, `MANAGER`, `STAFF`) are strictly scoped to a specific restaurant via `UserRestaurant.restaurantId`.
   - Normal restaurant owners and staff have `User.platformRole = null` and are blocked from `/platform/*` endpoints with HTTP 403 Forbidden.
   - Cross-tenant access is strictly enforced via database queries and middleware: Owner A cannot access, query, or mutate Restaurant B's resources.

3. **Atomic Transactional Rollback**:
   - The provisioning of a restaurant, owner creation, membership assignment, settings initialization, invitation generation, and audit logging execute inside a single PostgreSQL transaction (`prisma.$transaction`).
   - If any step encounters an error (e.g., duplicate slug, database constraint violation), the entire transaction rolls back cleanly, leaving **0 partial records**.

---

## 2. Provisioning Lifecycle & State Machine

Every `Restaurant` record maintains a `provisioningStatus` field governed by the `ProvisioningStatus` enum:

```
                      ┌────────────────────────┐
                      │      PROVISIONING      │  (Initial transaction state)
                      └───────────┬────────────┘
                                  │ (Commit & Token Generated)
                                  ▼
                      ┌────────────────────────┐
                      │         ACTIVE         │ ◄──┐
                      └───────────┬────────────┘    │
                                  │                 │ (Platform Admin Reactivation)
                 ┌────────────────┴──────────────┐  │
                 │                               │  │
                 ▼                               ▼  │
   ┌───────────────────────────┐   ┌────────────────┴──────────┐
   │         SUSPENDED         │   │        DEACTIVATED        │
   │  (Maintenance / Billing)  │   │  (Permanent Offboarding)  │
   └─────────────┬─────────────┘   └───────────────────────────┘
                 │                               ▲
                 └───────────────────────────────┘
```

- **`PROVISIONING`**: Initial ephemeral state while transactional setup completes.
- **`ACTIVE`**: Restaurant is provisioned, active, and accessible by authorized tenant staff.
- **`SUSPENDED`**: Temporarily frozen (e.g. overdue billing or operational review); staff cannot modify menus or process orders.
- **`DEACTIVATED`**: Permanently or indefinitely disabled; public customer menu returns 404 or inactive notice, and orders are blocked.

---

## 3. Cryptographic Owner Invitation & Onboarding Protocol

To guarantee zero exposure of plain-text passwords or credentials during provisioning, the system implements a secure token hash invitation flow:

```
[Platform Admin] ────────► Provisions Restaurant (Wizard)
                                   │
                                   ▼
                      Generates 32-Byte Hex Token
                                   │
                                   ├─► SHA-256 Hash stored in DB (OwnerInvitation.tokenHash)
                                   └─► Raw Token returned ONLY ONCE in response
                                   │
                                   ▼
                      Sends Onboarding Link:
                      https://app.auramenu.com/owner/onboarding/<rawToken>
                                   │
                                   ▼
[Restaurant Owner] ───────► Opens Onboarding Portal
                                   │
                                   ├─► Validates Token against SHA-256 Hash
                                   ├─► Checks Expiration (7-day TTL) & Revocation
                                   │
                                   ▼
                      Enters New Password (min 8 chars)
                                   │
                                   ├─► bcrypt.hash(password, 10)
                                   ├─► Sets OwnerInvitation.acceptedAt = NOW()
                                   ├─► Creates/Updates User & UserRestaurant (Role.OWNER)
                                   │
                                   ▼
                      Receives Authenticated JWT Token
                                   │
                                   ▼
                      Direct Redirection to /admin
                      (Welcomed by Empty Onboarding Checklist Banner)
```

### Security Guarantees:
- **Raw Token Storage**: The raw token is **NEVER** stored in the database. Only the cryptographic `tokenHash` (SHA-256) is persisted.
- **One-Time Use**: Once accepted (`acceptedAt !== null`), attempting to use the token again returns **HTTP 410 INVITATION_ALREADY_ACCEPTED**.
- **Expiration Enforcement**: Default TTL is 7 days. Requests after `expiresAt` return **HTTP 410 INVITATION_EXPIRED**.
- **Instant Revocation**: Platform Admins can revoke pending invitations at any time. Revoked tokens return **HTTP 410 INVITATION_REVOKED**.
- **Resend with Invalidation**: Resending an invitation automatically revokes all previous pending invitations for that restaurant before generating a new token.

---

## 4. API Endpoints Reference

### 4.1. Platform Management APIs (Requires `PLATFORM_ADMIN`)

#### `POST /api/platform/restaurants`
Provisions a new isolated empty restaurant tenant.

**Request Payload:**
```json
{
  "name": "Lumina Gastro Lounge",
  "slug": "lumina-lounge",
  "legalName": "Lumina Hospitality Lda",
  "address": "Rua da Boavista 142",
  "city": "Porto",
  "country": "Portugal",
  "phone": "+351 912 345 678",
  "email": "contact@lumina.pt",
  "currency": "EUR",
  "currencySymbol": "€",
  "ownerName": "Carlos Silva",
  "ownerEmail": "carlos@lumina.pt",
  "theme": "DARK_LUXURY",
  "presentationMode": "INDIVIDUAL_VIDEO",
  "language": "en",
  "taxRate": 23.0,
  "serviceChargeRate": 0
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Restaurant \"Lumina Gastro Lounge\" provisioned successfully.",
  "data": {
    "restaurant": {
      "id": "uuid-here",
      "name": "Lumina Gastro Lounge",
      "slug": "lumina-lounge",
      "provisioningStatus": "ACTIVE",
      "active": true
    },
    "owner": {
      "id": "uuid-here",
      "name": "Carlos Silva",
      "email": "carlos@lumina.pt"
    },
    "invitation": {
      "id": "uuid-here",
      "rawToken": "a3f5...32_byte_hex...",
      "expiresAt": "2026-09-16T22:00:00.000Z",
      "onboardingUrl": "/owner/onboarding/a3f5...32_byte_hex..."
    }
  }
}
```

#### `GET /api/platform/restaurants/:id/provisioning`
Inspects the restaurant's provisioning status, owner details, latest invitation state, and verifies the 8-metric entity counts.

#### `POST /api/platform/restaurants/:id/invitation/resend`
Revokes pending invitations and issues a new onboarding invitation token.

#### `POST /api/platform/restaurants/:id/invitation/revoke`
Revokes any active pending onboarding invitation for the restaurant.

---

### 4.2. Public Owner Onboarding APIs

#### `GET /api/owner/invitations/:token`
Public endpoint to validate an onboarding token before presenting the password creation screen.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "invitedEmail": "carlos@lumina.pt",
    "invitedName": "Carlos Silva",
    "restaurant": {
      "id": "uuid-here",
      "name": "Lumina Gastro Lounge",
      "slug": "lumina-lounge",
      "currency": "EUR",
      "currencySymbol": "€",
      "defaultLanguage": "en"
    },
    "expiresAt": "2026-09-16T22:00:00.000Z"
  }
}
```

#### `POST /api/owner/invitations/:token/accept`
Sets the owner's secure password, activates the account, binds the `OWNER` membership, and issues an authenticated JWT token.

**Request Payload:**
```json
{
  "password": "SecurePassword123!",
  "name": "Carlos Silva"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOi...",
  "user": {
    "id": "uuid-here",
    "name": "Carlos Silva",
    "email": "carlos@lumina.pt"
  },
  "restaurant": {
    "id": "uuid-here",
    "name": "Lumina Gastro Lounge",
    "slug": "lumina-lounge"
  }
}
```

---

## 5. UI Portal Integration & User Flows

### 5.1. Platform Provisioning Wizard (`/platform/restaurants/create`)
- **Step 1: Restaurant Identity**: Name, automated URL-safe slug generator with collision warnings, address, phone, contact email, and currency.
- **Step 2: Owner Designation**: Owner full name and email. Checks if user identity already exists to safely link multi-restaurant owners.
- **Step 3: Safe Initial Configuration**: Visual theme preset (`DARK_LUXURY`, `LIGHT_MINIMAL`, `WARM_RESTAURANT`, `MODERN_GLASS`), presentation mode, primary language, and tax/service charge rates.
- **Step 4: Empty Tenant Guarantee Review**: Live verification checklist confirming 0 categories, 0 foods, 0 media, 0 tables, 0 orders, 0 customers, 0 payments, and 0 fiscal docs.
- **Post-Provisioning Modal**: Instant presentation of the newly provisioned tenant, owner credentials summary, and a 1-click **Copy Onboarding Link** button.

### 5.2. Restaurant Detail Lifecycle View (`/platform/restaurants/:id`)
- **Provisioning Lifecycle Card**: Live badge of current state (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`).
- **Owner Invitation Management**: Shows invitation status (`PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`) with **Resend Invitation** and **Revoke Invitation** actions.
- **Tenant Entity Counts**: 8-metric grid displaying the live count of categories, foods, media, tables, orders, customers, payments, and fiscal documents.

### 5.3. Public Owner Onboarding Portal (`/owner/onboarding/:token`)
- Dedicated branded onboarding flow with step-by-step guidance.
- Real-time password strength validation (minimum 8 characters, confirmation matching).
- Setup tour introducing the restaurant owner to the Live Menu Studio, Kitchen Display System, QR Table Codes, and Financial Ledger.
- Direct transition into `/admin` without requiring a secondary login step.

### 5.4. Restaurant Admin Empty State Checklist (`/admin`)
- When a newly onboarded owner logs into `/admin` with 0 categories or foods, a prominent, non-blocking **Onboarding Checklist Banner** is displayed:
  - Add First Menu Category
  - Upload Visual Media & Create Food Items
  - Generate Dining Tables & QR Codes
  - Preview Live Visual Menu
- Dismissible and non-blocking: Never impedes normal staff operations or experienced owners.

---

## 6. Audit Trail Compliance

All Phase 10 provisioning and invitation events are logged in the `AuditLog` table with the operator's `actorPlatformRole`, IP address, and metadata:

| Audit Action | Entity Type | Trigger |
|---|---|---|
| `RESTAURANT_CREATE` | `Restaurant` | Tenant record created in database |
| `OWNER_INVITATION_CREATE` | `OwnerInvitation` | Cryptographic invitation hash stored |
| `RESTAURANT_PROVISION_SUCCESS` | `Restaurant` | Transaction committed and status set to `ACTIVE` |
| `OWNER_INVITATION_RESEND` | `OwnerInvitation` | Operator requests resending of invitation |
| `OWNER_INVITATION_REVOKE` | `OwnerInvitation` | Operator revokes pending invitation |
| `OWNER_INVITATION_ACCEPT` | `OwnerInvitation` | Owner sets password and completes onboarding |

---

## 7. Verification & Regression Test Suites

Phase 10 includes a dedicated 28-test integration test suite (`npm run test:provisioning`) and guarantees 100% non-regression across all previous phases:

| Test Suite | Command | Total Tests | Result |
|---|---|---|---|
| **Phase 10: Restaurant Provisioning & Onboarding** | `npm run test:provisioning` | **28** | **28 Passed (100%)** |
| Phase 9: Platform Admin & SaaS Architecture | `npm run test:platform` | 23 | 23 Passed (100%) |
| Video Transition (No Previous Final Frame) | `npm run test:video-transition` | 20 | 20 Passed (100%) |
| Video Playback (Single Play, No Loop) | `npm run test:video-playback` | 16 | 16 Passed (100%) |
| Food Modal Scrolling Architecture | `npm run test:food-modal-scroll` | 12 | 12 Passed (100%) |
| Food Media & Optional Media Abstraction | `npm run test:food-media` | 25 | 25 Passed (100%) |
| Phase 8: Payments, NIF, Receipts & Fiscal | `npm run test:phase8` | 11 | 11 Passed (100%) |
| Phase 7: Theme Engine & Settings | `npm run test:phase7` | 12 | 12 Passed (100%) |
| SSE Real-Time Customer Order Tracking | `npm run test:realtime` | 12 | 12 Passed (100%) |
| Phase 6 QA & Enterprise Stability | `npm run test:qa` | 15 | 15 Passed (100%) |
| Core API & Order Processing | `npm run test:api` | 40 | 40 Passed (100%) |
| **TOTAL SUITE VERIFICATION** | — | **214** | **214 Passed (100%)** |
