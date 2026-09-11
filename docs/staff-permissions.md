# Phase 11A — Restaurant Staff Management, Custom Permissions & Role-Based Access Control

A production-grade, multi-tenant staff management and granular permission control system for AURA Restaurant SaaS.

---

## 1. Architectural Overview & 4-Layer Defense-in-Depth

The staff management system guarantees that employees only access features explicitly permitted by the restaurant **OWNER**, implementing four concentric security boundaries:

```
┌────────────────────────────────────────────────────────┐
│  Layer 1: UI Navigation Filtering                      │
│  Unchecked items completely omitted from AdminSidebar   │
└───────────────────────┬────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────┐
│  Layer 2: Direct Route Guards                          │
│  <PermissionRoute> renders luxury 403 on direct URLs    │
└───────────────────────┬────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────┐
│  Layer 3: Backend API Authorization                   │
│  requirePermission() returns HTTP 403 INSUFFICIENT...  │
└───────────────────────┬────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────┐
│  Layer 4: Tenant Database Scoping                      │
│  UserRestaurantPermission rows bound to tenant only   │
└────────────────────────────────────────────────────────┘
```

### Layer 1: UI Navigation Filtering (`AdminSidebar.tsx`)
- Navigation items in the admin sidebar evaluate `hasPermission(item.permission)`.
- If a permission is unchecked or missing for the active workplace, the navigation item is **completely omitted** from the DOM (not disabled or greyed out).

### Layer 2: Direct Route Guards (`PermissionRoute.tsx`)
- If a staff member attempts to circumvent navigation and type a direct URL (e.g. `/admin/kitchen` or `/admin/payments`), the React Router route guard intercepts the attempt.
- Displays a themed, luxury 403 Access Restricted screen explaining the required permission, the staff member's role, and provides quick actions to return to their dashboard or switch workplaces.

### Layer 3: Backend API Authorization (`authMiddleware.ts`)
- `requirePermission(key)` inspects the incoming JWT bearer token and resolves the tenant `UserRestaurant` membership.
- Checks if the staff member is `DISABLED` (returns 403 `STAFF_DISABLED` immediately).
- Checks if the user is `Role.OWNER` (full inherent access bypass).
- Validates that the active tenant membership possesses the exact permission key (or legacy alias) in `UserRestaurantPermission`.
- Returns `HTTP 403 Forbidden` with standardized `errorCode: 'INSUFFICIENT_PERMISSIONS'`.

### Layer 4: Tenant Database Scoping (`schema.prisma`)
- Custom permissions are stored in `UserRestaurantPermission`, strictly linking `userRestaurantId` to `permissionId`.
- Permissions belong to a single restaurant membership; a user can be a `WAITER` in Restaurant A with 3 permissions, and a `MANAGER` in Restaurant B with 40 permissions.

---

## 2. Complete Permission Catalog (51 Permissions across 15 Functional Groups)

| Group | Key | Label | Description |
|---|---|---|---|
| **General** | `VIEW_DASHBOARD` | View Dashboard | Access the main restaurant operations dashboard and real-time activity metrics. |
| **Orders** | `VIEW_ORDERS` | View Orders | Access the live dining room orders feed and order list. |
| | `VIEW_ORDER_DETAILS` | View Order Details | Inspect order line items, customer notes, and timing metrics. |
| | `UPDATE_ORDER_STATUS` | Update Order Status | Advance or adjust overall order lifecycle status. |
| | `CONFIRM_ORDER` | Confirm Order | Acknowledge and confirm newly submitted customer orders. |
| | `CANCEL_ORDER` | Cancel Order | Void or cancel orders with mandatory audit attribution. |
| | `MARK_ORDER_SERVED` | Mark Order Served | Mark orders as delivered to the customer table. |
| | `MARK_ORDER_COMPLETED` | Mark Order Completed | Finalize orders upon completion of dining and payment. |
| **Kitchen** | `VIEW_KITCHEN` | View Kitchen KDS | Access the Kitchen Display System (KDS) workspace. |
| | `VIEW_KITCHEN_ORDERS` | View Kitchen Orders | View active tickets pending preparation. |
| | `UPDATE_KITCHEN_STATUS` | Update Kitchen Status | Update item or ticket status in the kitchen workflow. |
| | `CONFIRM_PREPARATION` | Confirm Preparation | Mark food items as actively cooking / preparing. |
| | `MARK_READY` | Mark Ready | Mark prepared food as ready for pickup. |
| **Tables** | `VIEW_TABLES` | View Tables | View dining room floor plan and table availability. |
| | `MANAGE_TABLES` | Manage Tables | Create, edit, and deactivate dining tables. |
| | `MANAGE_TABLE_QR` | Manage Table QR | Generate, configure, and download table QR codes. |
| **Menu** | `VIEW_MENU` | View Menu | Access and view the complete dishes and categories catalog. |
| | `MANAGE_MENU` | Manage Menu | Edit menu structure and catalog presentation. |
| | `MANAGE_CATEGORIES` | Manage Categories | Create, edit, reorder, and remove menu categories. |
| | `MANAGE_FOODS` | Manage Foods | Create, edit, and soft-delete dishes and beverages. |
| | `MANAGE_FOOD_PRICES` | Manage Food Prices | Adjust prices and tax rates on food items. |
| | `TOGGLE_FOOD_AVAILABILITY` | Toggle Food Availability | 86 / toggle real-time availability of menu items. |
| **Media** | `VIEW_MEDIA` | View Media | Browse restaurant media library and uploaded assets. |
| | `UPLOAD_MEDIA` | Upload Media | Upload new food photos and presentation videos. |
| | `MANAGE_MEDIA` | Manage Media | Replace, assign, and delete media files. |
| **Customers** | `VIEW_CUSTOMERS` | View Customers | View customer directory and dining visit records. |
| | `MANAGE_CUSTOMERS` | Manage Customers | Edit customer contact and dining profile details. |
| | `VIEW_CUSTOMER_FISCAL_DATA` | View Fiscal Data | Inspect customer tax numbers (NIF) and legal billing data. |
| **Payments** | `VIEW_PAYMENTS` | View Payments | View transaction logs and payment settlements. |
| | `PROCESS_PAYMENTS` | Process Payments | Initiate digital card or MB WAY payment requests. |
| | `CONFIRM_CASH_PAYMENT` | Confirm Cash Payment | Record cash receipts and calculate drawer change. |
| | `VIEW_PAYMENT_STATUS` | View Payment Status | Check real-time payment reconciliation status. |
| **Fiscal** | `VIEW_FISCAL` | View Fiscal Data | View certified fiscal records and tax summaries. |
| | `MANAGE_FISCAL_SETTINGS` | Manage Fiscal Settings | Configure tax rates, company NIF, and receipt sequences. |
| | `VIEW_NIF_DATA` | View NIF Data | Access customer tax identifiers on invoices. |
| | `MANAGE_RECEIPTS` | Manage Receipts | Issue, print, or download technical receipts. |
| **Staff** | `VIEW_STAFF` | View Staff | View team members, job templates, and assigned roles. |
| | `CREATE_STAFF` | Create / Invite Staff | Issue cryptographic staff invitations or provision employees. |
| | `EDIT_STAFF` | Edit Staff | Edit employee profile, contact info, and role assignment. |
| | `DISABLE_STAFF` | Disable Staff | Disable or re-enable employee workplace access. |
| | `MANAGE_STAFF_PERMISSIONS`| Manage Permissions | Customize granular permissions in the permission matrix. |
| **Settings** | `VIEW_RESTAURANT_SETTINGS` | View Settings | View operating hours, location, and restaurant configuration. |
| | `MANAGE_RESTAURANT_SETTINGS`| Manage Settings | Update restaurant profile, currency, and service charges. |
| **Branding** | `VIEW_BRANDING` | View Branding | View current themes, color palettes, and logos. |
| | `MANAGE_BRANDING` | Manage Branding | Customize theme presets, fonts, and luxury styling. |
| **Reporting** | `VIEW_REPORTS` | View Reports | Access operations and sales summary reports. |
| | `VIEW_FINANCIAL_REPORTS`| Financial Reports | View revenue, cash drawer reconciliation, and tax reports. |
| | `VIEW_SALES_REPORTS` | Sales Reports | View dish popularity, table turnover, and hourly sales. |
| **Audit** | `VIEW_AUDIT_LOGS` | View Audit Logs | Access tamper-evident historical audit logs with user attribution. |
| **QR** | `VIEW_QR_CODES` | View QR Codes | View generated menu and table QR codes. |
| | `MANAGE_QR_CODES` | Manage QR Codes | Generate, customize, and print marketing and dining QR codes. |

---

## 3. Role Templates (Quick-Select Presets)

Role templates are non-locking starting presets. An Owner can pick a template and then freely customize any individual checkbox:

1. **WAITER**
   - General: `VIEW_DASHBOARD`
   - Orders: `VIEW_ORDERS`, `VIEW_ORDER_DETAILS`, `CONFIRM_ORDER`, `MARK_ORDER_SERVED`
   - Kitchen: `VIEW_KITCHEN`, `VIEW_KITCHEN_ORDERS`
   - Tables: `VIEW_TABLES`
   - Menu: `VIEW_MENU`, `TOGGLE_FOOD_AVAILABILITY`
   - Payments: `VIEW_PAYMENTS`, `CONFIRM_CASH_PAYMENT`, `VIEW_PAYMENT_STATUS`
2. **KITCHEN**
   - Kitchen: `VIEW_KITCHEN`, `VIEW_KITCHEN_ORDERS`, `UPDATE_KITCHEN_STATUS`, `CONFIRM_PREPARATION`, `MARK_READY`
   - Menu: `VIEW_MENU`, `TOGGLE_FOOD_AVAILABILITY`
3. **CASHIER**
   - General: `VIEW_DASHBOARD`
   - Orders: `VIEW_ORDERS`, `VIEW_ORDER_DETAILS`, `MARK_ORDER_COMPLETED`
   - Payments: `VIEW_PAYMENTS`, `PROCESS_PAYMENTS`, `CONFIRM_CASH_PAYMENT`, `VIEW_PAYMENT_STATUS`
   - Fiscal: `VIEW_FISCAL`, `VIEW_NIF_DATA`, `MANAGE_RECEIPTS`
4. **HOST**
   - Tables: `VIEW_TABLES`, `MANAGE_TABLES`, `MANAGE_TABLE_QR`
   - Menu: `VIEW_MENU`
   - QR: `VIEW_QR_CODES`, `MANAGE_QR_CODES`
5. **SUPERVISOR**
   - Full operational oversight across dining room, kitchen, cashiering, and table seating with void and override capabilities.
6. **ACCOUNTING**
   - Financial oversight: `VIEW_PAYMENTS`, `VIEW_PAYMENT_STATUS`, `VIEW_FISCAL`, `MANAGE_FISCAL_SETTINGS`, `VIEW_NIF_DATA`, `MANAGE_RECEIPTS`, `VIEW_REPORTS`, `VIEW_FINANCIAL_REPORTS`, `VIEW_SALES_REPORTS`, `VIEW_AUDIT_LOGS`.
7. **CUSTOM**
   - Tailored selection designed specifically for the employee.

---

## 4. Cryptographic Staff Invitation Protocol

```
Owner creates staff invitation
  ├── Generates 32-byte cryptographically secure random token (64-char hex)
  ├── Computes SHA-256 hash -> Stored in database (raw token never stored)
  ├── Sets 7-day expiration (expiresAt = now + 7 days)
  ├── Staged permissions array persisted on the invitation
  └── Returns raw token to Owner via onboarding URL (/staff/onboarding/:token)

Invitee opens onboarding portal
  ├── GET /api/staff/invitations/:token validates tokenHash against DB
  ├── Verifies invitation is not expired (<= 7 days) and not revoked
  ├── Displays Restaurant Name, Logo, Invitee Email, Role & Template
  ├── Employee enters Name, Password (min. 8 chars), and Confirm Password
  ├── POST /api/staff/invitations/:token/accept
  │     ├── Hashes password with bcrypt (10 rounds)
  │     ├── Creates or links User identity
  │     ├── Creates UserRestaurant with staged permissions
  │     ├── Stamps acceptedAt = now() (invalidating future use)
  │     └── Issues JWT session token
  └── Redirects employee directly to their permitted restaurant workspace
```

### Re-acceptance & Revocation Security
- **One-time use**: Attempting to reuse an accepted token returns HTTP 410 `INVITATION_ALREADY_ACCEPTED`.
- **Resend mechanic**: Resending an invitation invalidates the old token (HTTP 410 `INVITATION_REVOKED`) and generates a brand new 32-byte token.
- **Explicit Revocation**: Owner can revoke pending invitations at any time.

---

## 5. Staff Status Lifecycle & Multi-Tenant Isolation

### Staff Status (`ACTIVE` vs `DISABLED`)
- **`ACTIVE`**: Employee can log in and perform actions according to their granted permissions.
- **`DISABLED`**: Access to this specific restaurant is **immediately blocked**:
  - `authMiddleware` checks `membership.status === 'DISABLED'` and returns HTTP 403 `STAFF_DISABLED`.
  - Does NOT delete the user.
  - Does NOT affect their access to other restaurants (multi-tenant isolation).
  - Can be re-enabled at any time by the Owner.

### Sole Active Owner Protection
- A restaurant must maintain at least one active Owner at all times.
- Disabling the sole Owner returns HTTP 400 `SOLE_OWNER_PROTECTION`.
- Removing the sole Owner returns HTTP 400 `SOLE_OWNER_REMOVAL`.

### Global User Record Survival
- When removing an employee from a restaurant (`DELETE /api/restaurants/:id/staff/:userId`), only the `UserRestaurant` membership and its `UserRestaurantPermission` rows are removed.
- The global `User` account survives untouched, preserving memberships in any other restaurants or platforms.

---

## 6. Audit Trail

Phase 11A expands the immutable `AuditLog` model with 12 new actions:

1. `STAFF_CREATE` — Direct staff creation with temporary credentials
2. `STAFF_UPDATE` — Update of staff profile or metadata
3. `STAFF_DISABLE` — Immediate suspension of restaurant workplace access
4. `STAFF_ENABLE` — Restoration of workplace access
5. `STAFF_REMOVE` — Deletion of restaurant membership
6. `STAFF_INVITATION_CREATE` — Issuance of cryptographic onboarding link
7. `STAFF_INVITATION_RESEND` — Token rotation and resend
8. `STAFF_INVITATION_REVOKE` — Cancellation of pending invitation
9. `STAFF_INVITATION_ACCEPT` — Acceptance and password setup by employee
10. `STAFF_PERMISSION_GRANT` — Dynamic addition of permissions
11. `STAFF_PERMISSION_REVOKE` — Dynamic removal of permissions
12. `STAFF_ROLE_CHANGE` — Role escalation or demotion

---

## 7. API Reference

### Staff Management Endpoints (Protected by JWT & Permissions)

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/restaurants/:id/staff-permissions-catalog` | `VIEW_STAFF` | Retrieves catalog of 51 permissions and 7 role templates |
| `GET` | `/api/restaurants/:id/staff` | `VIEW_STAFF` | Lists active staff and pending invitations |
| `GET` | `/api/restaurants/:id/staff/:userId` | `VIEW_STAFF` | Retrieves detailed permissions for a specific staff member |
| `POST` | `/api/restaurants/:id/staff` | `CREATE_STAFF` | Invites employee or creates directly with password |
| `PUT` | `/api/restaurants/:id/staff/:userId/permissions` | `MANAGE_STAFF_PERMISSIONS` | Atomically updates employee permissions matrix |
| `PATCH`| `/api/restaurants/:id/staff/:userId/status` | `DISABLE_STAFF` | Enables or disables restaurant access |
| `DELETE`| `/api/restaurants/:id/staff/:userId` | `DISABLE_STAFF` | Removes employee membership from restaurant |
| `POST` | `/api/restaurants/:id/staff/invitations/:id/resend` | `CREATE_STAFF` | Rotates token and resends invitation |
| `DELETE`| `/api/restaurants/:id/staff/invitations/:id` | `CREATE_STAFF` | Revokes active invitation |

### Public Onboarding Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/staff/invitations/:token` | None (Public) | Validates invitation token and returns restaurant & role info |
| `POST` | `/api/staff/invitations/:token/accept` | None (Public) | Accepts invitation, sets password, and logs in |

---

## 8. Verification & Test Suite

All functionality is covered by automated integration tests in `server/tests/staff.test.ts`:

```bash
npm run test:staff
```

### Full Regression Suite:
```bash
npm run test:staff             # 28 passed
npm run test:provisioning      # 28 passed
npm run test:platform          # 23 passed
npm run test:phase8            # 11 passed
npm run test:phase7            # 12 passed
npm run test:api               # 40 passed
npm run test:realtime          # 12 passed
npm run test:qa                # 15 passed
npm run test:food-media        # 25 passed
npm run test:video-playback    # 16 passed
npm run test:video-transition  # 20 passed
npm run test:food-modal-scroll # 12 passed
# Total: 242 tests passing with 0 failures
```
