# Graph Report - menu  (2026-09-13)

## Corpus Check
- 216 files · ~237,215 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1530 nodes · 3423 edges · 80 communities (66 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `df822acf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server/src/services/mediaService.ts
- @prisma/client
- types/index.ts
- .log
- apiClient.ts
- authMiddleware.ts
- useAdminData.ts
- App.tsx
- CustomerOrderTrackingPage.tsx
- FoodFeed.tsx
- payment/paymentService.ts
- 20260908230000_phase8_payments_nif_receipts/migration.sql
- settingsRoutes.ts
- useAuth
- 20260907224524_init/migration.sql
- app.ts
- package.json
- scripts
- seedPermissions.ts
- FoodItem
- FoodMediaTransitionStateMachine
- rateLimiter.ts
- compilerOptions
- devDependencies
- FoodMediaPlaybackStateMachine
- "orders"
- RestaurantSettings
- compilerOptions
- dependencies
- "restaurants"
- 20260910123000_phase11a_staff_permissions/migration.sql
- realtimeService
- 20260912160000_phase13a_subscription_billing/migration.sql
- "restaurant_tables"
- storageService.ts
- CategoryNav.tsx
- AdminMenuPreviewPage.tsx
- apiClient
- realtimeService.ts
- Restaurant
- SubscriptionScheduler
- Phase 13A: SaaS Subscription Core, Billing Isolation, Access Enforcement & Expiry Reminders
- NifValidator
- floorService.ts
- JobService
- .oxlintrc.json
- "user_restaurants"
- advance_test_order.ts
- AdminTablesPage.tsx
- backup_restore_test.ts
- foodFormModalScroll.test.ts
- 3. Frontend Workspaces & User Experience
- runOperationsTestSuite
- runPlatformAdminTests
- runOperationalAccessTests
- tsconfig.json
- prisma
- ReconciliationService
- Phase 13B: Notification Center, Platform-to-Restaurant Messaging & Subscription Communication
- Phase 10: Restaurant Provisioning, Owner Onboarding & Tenant Initialization Guide
- Phase 11A — Restaurant Staff Management, Custom Permissions & Role-Based Access Control
- Database Architecture & Operations Guide
- Production Database Operations & Disaster Recovery Guide
- Phase 11B: Operational Access Control & Role Workspaces Guide
- AuthContext.tsx
- PostgreSQL Backup & Disaster Recovery Runbook
- Phase 12: Restaurant Operations, Floor Coordination & Kitchen Workflow
- notificationRoutes.ts
- subscriptionService
- 3. Key Components Implemented
- Restaurant Payments Architecture & Lifecycle (Phase 8)
- AdminUsersPage.tsx
- Portuguese Fiscal Integration & Technical Receipts (Phase 8)
- Customer Data Protection, NIF Profiles & Privacy (Phase 8)
- React + TypeScript + Vite
- SlidingWindowRateLimiter
- seed.ts
- runProvisioningTests

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 78 edges
2. `react` - 72 edges
3. `@prisma/client` - 62 edges
4. `lucide-react` - 61 edges
5. `prisma` - 56 edges
6. `express` - 35 edges
7. `FoodItem` - 35 edges
8. `Category` - 31 edges
9. `SubscriptionService` - 29 edges
10. `scripts` - 27 edges

## Surprising Connections (you probably didn't know these)
- `food_items_restaurant_id_available_deleted_at_idx` --indexes--> `"food_items"`  [EXTRACTED]
  prisma/migrations/20260908140000_phase6_production_hardening/migration.sql → prisma/migrations/20260907224524_init/migration.sql
- `food_items_restaurant_id_category_id_display_order_idx` --indexes--> `"food_items"`  [EXTRACTED]
  prisma/migrations/20260908140000_phase6_production_hardening/migration.sql → prisma/migrations/20260907224524_init/migration.sql
- `orders_created_at_idx` --indexes--> `"orders"`  [EXTRACTED]
  prisma/migrations/20260908120000_phase4_tables_orders/migration.sql → prisma/migrations/20260907224524_init/migration.sql
- `orders_order_number_idx` --indexes--> `"orders"`  [EXTRACTED]
  prisma/migrations/20260908120000_phase4_tables_orders/migration.sql → prisma/migrations/20260907224524_init/migration.sql
- `orders_table_id_idx` --indexes--> `"orders"`  [EXTRACTED]
  prisma/migrations/20260908120000_phase4_tables_orders/migration.sql → prisma/migrations/20260907224524_init/migration.sql

## Import Cycles
- None detected.

## Communities (80 total, 12 thin omitted)

### Community 0 - "server/src/services/mediaService.ts"
Cohesion: 0.05
Nodes (17): CreateMediaInput, ListMediaOptions, MediaService, PaginatedMediaResult, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MediaValidator, ValidationResult (+9 more)

### Community 1 - "@prisma/client"
Cohesion: 0.13
Nodes (24): bcryptjs, @prisma/client, supertest, app, prisma, CreateNotificationInput, ListNotificationOptions, ReconciliationReport (+16 more)

### Community 2 - "types/index.ts"
Cohesion: 0.07
Nodes (38): AdminStaffPage(), StaffOnboardingPage(), CatalogResponse, CreateStaffData, ListStaffResponse, staffService, ButtonStyle, CameraMotion (+30 more)

### Community 3 - ".log"
Cohesion: 0.06
Nodes (5): redactSensitiveData(), PlatformMessageService, PlatformService, StaffService, SubscriptionService

### Community 4 - "apiClient.ts"
Cohesion: 0.14
Nodes (12): AdminSubscriptionPage(), PlatformSubscriptionPlansPage(), ApiResponse, categoryService, foodService, BillingInterval, SubscriptionDetails, SubscriptionEvent (+4 more)

### Community 5 - "authMiddleware.ts"
Cohesion: 0.18
Nodes (23): express, hasPermission(), normalizePermissionKey(), Permission, PermissionDefinition, authenticateToken(), AuthUser, Express (+15 more)

### Community 6 - "useAdminData.ts"
Cohesion: 0.11
Nodes (20): CategoryFormModal(), CategoryFormModalProps, ICON_OPTIONS, COMMON_ALLERGENS, FoodFormModal(), MediaUploadModal(), MediaUploadModalProps, useAdminData() (+12 more)

### Community 7 - "App.tsx"
Cohesion: 0.08
Nodes (32): App(), ProtectedRoute(), PermissionRoute(), COMMON_CURRENCIES, COMMON_LANGUAGES, COMMON_TIMEZONES, PlatformEditRestaurantModal(), PlatformEditRestaurantModalProps (+24 more)

### Community 8 - "CustomerOrderTrackingPage.tsx"
Cohesion: 0.08
Nodes (37): STATE_BADGE_STYLES, TableDetailDrawer(), TableDetailDrawerProps, AdminCashPage(), AdminCustomersPage(), AdminFloorPage(), OperationalFilter, STATE_BADGE_STYLES (+29 more)

### Community 9 - "FoodFeed.tsx"
Cohesion: 0.15
Nodes (21): framer-motion, CartDrawer(), CustomerMenuPreviewInner(), FoodDetailsModal(), FoodDetailsModalProps, FoodFeed(), LuxuryFoodFallback(), LuxuryFoodFallbackProps (+13 more)

### Community 10 - "payment/paymentService.ts"
Cohesion: 0.08
Nodes (17): defaultFiscalProvider, FiscalProvider, IssueDocumentParams, StandardFiscalProvider, MBWayPaymentProvider, MockPaymentProvider, CreatePaymentParams, PaymentProvider (+9 more)

### Community 11 - "20260908230000_phase8_payments_nif_receipts/migration.sql"
Cohesion: 0.13
Nodes (27): "customers", "customer_fiscal_profiles", customer_fiscal_profiles_customer_id_idx, customer_fiscal_profiles_tax_id_idx, customers_email_idx, customers_phone_idx, customers_restaurant_id_idx, "fiscal_documents" (+19 more)

### Community 12 - "settingsRoutes.ts"
Cohesion: 0.06
Nodes (28): multer, requirePlatformRole(), platformRouter, upload, normalizePresentationMode(), normalizeTheme(), settingsRouter, VALID_ANIMATION_STYLES (+20 more)

### Community 13 - "useAuth"
Cohesion: 0.19
Nodes (18): lucide-react, react, react-router-dom, AdminLayout(), AdminSidebar(), NotificationBell(), SubscriptionWarningBanner(), UrgentNotificationBanner() (+10 more)

### Community 14 - "20260907224524_init/migration.sql"
Cohesion: 0.12
Nodes (30): "audit_logs", audit_logs_created_at_idx, audit_logs_entity_type_entity_id_idx, audit_logs_restaurant_id_idx, "categories", categories_active_idx, categories_display_order_idx, categories_restaurant_id_idx (+22 more)

### Community 15 - "app.ts"
Cohesion: 0.06
Nodes (36): jsonwebtoken, allowedOrigins, getAllowedOrigins(), getJwtSecret(), PERMISSION_CATALOG, PermissionKey, ROLE_PERMISSIONS, ROLE_TEMPLATES (+28 more)

### Community 16 - "package.json"
Cohesion: 0.08
Nodes (26): name, private, type, version, clsx, cors, dotenv, oxlint (+18 more)

### Community 17 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, db:migrate, db:seed, dev, lint, preview, server (+19 more)

### Community 19 - "FoodItem"
Cohesion: 0.24
Nodes (6): FoodFormModalProps, PublicMenuPayload, notifyChange(), storageService, Category, FoodItem

### Community 20 - "FoodMediaTransitionStateMachine"
Cohesion: 0.16
Nodes (6): createMockVideo(), __dirname, __filename, FoodMediaTransitionStateMachine, MockVideoElement, runVideoTransitionTests()

### Community 21 - "rateLimiter.ts"
Cohesion: 0.13
Nodes (16): ClientBucket, loginLimiterInstance, loginRateLimiter, orderCreationLimiterInstance, orderCreationRateLimiter, orderTrackingLimiterInstance, orderTrackingRateLimiter, paymentCreationLimiterInstance (+8 more)

### Community 22 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 23 - "devDependencies"
Cohesion: 0.11
Nodes (18): devDependencies, oxlint, prisma, supertest, tailwindcss, @tailwindcss/vite, tsx, @types/bcryptjs (+10 more)

### Community 24 - "FoodMediaPlaybackStateMachine"
Cohesion: 0.17
Nodes (6): createMockVideo(), __dirname, __filename, FoodMediaPlaybackStateMachine, MockVideoElement, runVideoPlaybackTests()

### Community 25 - ""orders""
Cohesion: 0.15
Nodes (16): "orders", orders_restaurant_id_idx, orders_status_idx, "order_status_history", order_status_history_created_at_idx, order_status_history_order_id_idx, orders_idempotency_key_idx, orders_idempotency_key_key (+8 more)

### Community 26 - "RestaurantSettings"
Cohesion: 0.17
Nodes (13): CategoryNavProps, FoodInfo(), FoodInfoProps, FoodMedia(), FoodMediaProps, VideoPlaybackState, FoodSlide(), FoodSlideProps (+5 more)

### Community 27 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 28 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, bcryptjs, clsx, cors, dotenv, express, framer-motion, jsonwebtoken (+8 more)

### Community 29 - ""restaurants""
Cohesion: 0.16
Nodes (17): "restaurants", restaurants_slug_key, "users", users_email_key, users_restaurant_id_idx, "platform_settings", restaurants_active_idx, restaurants_created_at_idx (+9 more)

### Community 30 - "20260910123000_phase11a_staff_permissions/migration.sql"
Cohesion: 0.25
Nodes (14): "permissions", permissions_active_idx, permissions_group_idx, permissions_key_key, "staff_invitations", staff_invitations_expires_at_idx, staff_invitations_invited_email_idx, staff_invitations_restaurant_id_idx (+6 more)

### Community 32 - "20260912160000_phase13a_subscription_billing/migration.sql"
Cohesion: 0.06
Nodes (57): "notifications", notifications_read_at_idx, notifications_restaurant_id_idx, notifications_restaurant_id_user_id_read_at_idx, notifications_type_idx, notifications_user_id_idx, "subscription_events", subscription_events_created_at_idx (+49 more)

### Community 33 - ""restaurant_tables""
Cohesion: 0.16
Nodes (13): "qr_codes", qr_codes_restaurant_id_idx, qr_codes_slug_idx, qr_codes_slug_key, "restaurant_tables", restaurant_tables_restaurant_id_idx, restaurant_tables_restaurant_id_table_number_key, orders_created_at_idx (+5 more)

### Community 34 - "storageService.ts"
Cohesion: 0.27
Nodes (7): INITIAL_CATEGORIES, INITIAL_FOODS, INITIAL_MEDIA, INITIAL_RESTAURANT, DataListener, listeners, MediaItem

### Community 35 - "CategoryNav.tsx"
Cohesion: 0.33
Nodes (8): CategoryNav(), getCategoryIcon(), getTheme(), THEME_REGISTRY, ThemeDefinition, ResolvedTheme, resolveTheme(), useTheme()

### Community 36 - "AdminMenuPreviewPage.tsx"
Cohesion: 0.25
Nodes (7): CustomerMenuPreview(), DeviceMode, DevicePreview(), DevicePreviewProps, SinglePlayVideo(), SinglePlayVideoProps, settingsService

### Community 37 - "apiClient"
Cohesion: 0.08
Nodes (16): PlatformMessagesPage(), apiClient, NotificationListResult, NotificationPriority, NotificationQueryOptions, notificationService, NotificationSeverity, NotificationSource (+8 more)

### Community 38 - "realtimeService.ts"
Cohesion: 0.25
Nodes (6): CashPaymentService, ConfirmCashPaymentInput, OrderCreatedEvent, OrderItemStatusChangedEvent, OrderStatusChangedEvent, RealtimeEventName

### Community 39 - "Restaurant"
Cohesion: 0.43
Nodes (4): AdminSidebarProps, CustomerMenuPreviewProps, FoodFeedProps, Restaurant

### Community 40 - "SubscriptionScheduler"
Cohesion: 0.10
Nodes (12): server, shutdown(), registry, mockSubscriptionProvider, CheckoutSessionInput, CheckoutSessionResult, SubscriptionProvider, WebhookVerificationResult (+4 more)

### Community 41 - "Phase 13A: SaaS Subscription Core, Billing Isolation, Access Enforcement & Expiry Reminders"
Cohesion: 0.08
Nodes (25): 1. Fundamental Architectural Separation, 2.1 `SubscriptionPlan`, 2.2 `Subscription`, 2.3 `SubscriptionPayment`, 2.4 `SubscriptionInvoice`, 2.5 `SubscriptionEvent`, 2.6 `SubscriptionReminderLog`, 2. Subscription Data Model & Schemas (+17 more)

### Community 42 - "NifValidator"
Cohesion: 0.33
Nodes (3): NifValidator, ValidationResult, runPhase8Tests()

### Community 43 - "floorService.ts"
Cohesion: 0.33
Nodes (4): FloorOverviewResponse, floorService, FloorTableSummary, TableOperationalState

### Community 44 - "JobService"
Cohesion: 0.33
Nodes (3): Job, jobService, JobType

### Community 45 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 46 - ""user_restaurants""
Cohesion: 0.53
Nodes (5): "user_restaurants", user_restaurants_restaurant_id_idx, user_restaurants_user_id_idx, user_restaurants_user_id_restaurant_id_key, user_restaurants_status_idx

### Community 47 - "advance_test_order.ts"
Cohesion: 0.60
Nodes (5): loginOwner(), run(), sleep(), updateItemStatus(), updateStatus()

### Community 48 - "AdminTablesPage.tsx"
Cohesion: 0.53
Nodes (4): AdminTablesPage(), CreateTablePayload, tableService, Table

### Community 49 - "backup_restore_test.ts"
Cohesion: 0.40
Nodes (3): PG_DUMP, PSQL, TEMP_BACKUP_PATH

### Community 50 - "foodFormModalScroll.test.ts"
Cohesion: 0.40
Nodes (3): __dirname, __filename, runFoodModalScrollTests()

### Community 51 - "3. Frontend Workspaces & User Experience"
Cohesion: 0.08
Nodes (24): 1. Database & Persistence Layer, 2. Backend API & Operational Services, 3. Frontend Workspaces & User Experience, 4. Automated Testing & Verification, Automated Tests, Documentation, Implementation Plan — Phase 12: Advanced Order Workflow, Floor/Table Operations & Kitchen Coordination, [MODIFY] [package.json](file:///d:/code%20gemini/menu/package.json) (+16 more)

### Community 53 - "runPlatformAdminTests"
Cohesion: 0.67
Nodes (3): runPlatformAdminTests(), normalizePaginatedResult(), unwrapResponse()

### Community 60 - "Phase 13B: Notification Center, Platform-to-Restaurant Messaging & Subscription Communication"
Cohesion: 0.09
Nodes (22): 10. Verification & Test Coverage, 1. Database Architecture & Data Models, 2. Notification Sources & Lifecycle, 3. Priority Levels & Urgent Banner Treatment, 4. Acknowledgement Flow & Read Receipts, 5. Scheduled Delivery Worker & Concurrency Locking, 6. Non-Destructive Revision History, 7. Tenant Isolation & Expired Subscription Access (+14 more)

### Community 61 - "Phase 10: Restaurant Provisioning, Owner Onboarding & Tenant Initialization Guide"
Cohesion: 0.09
Nodes (22): 1. Overview & Architectural Philosophy, 2. Provisioning Lifecycle & State Machine, 3. Cryptographic Owner Invitation & Onboarding Protocol, 4.1. Platform Management APIs (Requires `PLATFORM_ADMIN`), 4.2. Public Owner Onboarding APIs, 4. API Endpoints Reference, 5.1. Platform Provisioning Wizard (`/platform/restaurants/create`), 5.2. Restaurant Detail Lifecycle View (`/platform/restaurants/:id`) (+14 more)

### Community 62 - "Phase 11A — Restaurant Staff Management, Custom Permissions & Role-Based Access Control"
Cohesion: 0.10
Nodes (20): 1. Architectural Overview & 4-Layer Defense-in-Depth, 2. Complete Permission Catalog (51 Permissions across 15 Functional Groups), 3. Role Templates (Quick-Select Presets), 4. Cryptographic Staff Invitation Protocol, 5. Staff Status Lifecycle & Multi-Tenant Isolation, 6. Audit Trail, 7. API Reference, 8. Verification & Test Suite (+12 more)

### Community 63 - "Database Architecture & Operations Guide"
Cohesion: 0.11
Nodes (18): 1. Environment & Configuration, 2. Entity-Relationship & Schema Design, 3. Development Workflow, 4. Production Deployment & Migrations, 5. Backup & Recovery Recommendations, 6. Audit Logging, Core Models, Database Architecture & Operations Guide (+10 more)

### Community 64 - "Production Database Operations & Disaster Recovery Guide"
Cohesion: 0.12
Nodes (15): 1. Architecture & PostgreSQL Topology, 2.1 Full Logical Backup (`pg_dump`), 2. Backup Procedures, 3.1 Standard Database Restoration (`pg_restore`), 3.2 Selective Table Restoration, 3. Restoration & Point-in-Time Recovery (PITR), 4.1 Applying Production Migrations, 4.2 Migration Rollback Protocol (+7 more)

### Community 65 - "Phase 11B: Operational Access Control & Role Workspaces Guide"
Cohesion: 0.14
Nodes (13): 1. Core Authorization Principles, 1. Financial Metric Isolation, 2. Practical Permission Matrix by Template, 2. Price Segregation, 3.1 Floor / Waiter Workspace (`/admin/orders`), 3.2 Kitchen Display System (KDS) (`/admin/kitchen`), 3.3 Cash Register / POS Workspace (`/admin/payments`), 3. Fiscal & Tax Identification (NIF) Masking (+5 more)

### Community 66 - "AuthContext.tsx"
Cohesion: 0.29
Nodes (11): ProtectedRouteProps, AuthContext, AuthContextType, authService, AuthUser, LoginResponse, MeResponse, PlatformRole (+3 more)

### Community 67 - "PostgreSQL Backup & Disaster Recovery Runbook"
Cohesion: 0.17
Nodes (11): 1. Automated Daily & Point-in-Time Backups, 2. Backup Procedures, 3. Restoration Procedures, 4. Automated Backup Verification Drill, 5. Recovery Time Objective (RTO) & Recovery Point Objective (RPO), A. Logical Dump (Standard Daily Snapshot), B. Custom Archive Format (Recommended for Production), Binary Locations (+3 more)

### Community 68 - "Phase 12: Restaurant Operations, Floor Coordination & Kitchen Workflow"
Cohesion: 0.17
Nodes (11): 1. The Unified Operational Loop, 2. Table Operational State Machine, 3.1 Waiter Claim (`POST /api/restaurants/:restaurantId/orders/:orderId/claim`), 3.2 Waiter Serve (`POST /api/restaurants/:restaurantId/orders/:orderId/serve`), 3. Concurrency & Atomic Claim Protection, 4.1 Event Catalog, 4. Real-Time Floor & Kitchen Synchronization (SSE), 5. Security & Data Minimization (+3 more)

### Community 71 - "3. Key Components Implemented"
Cohesion: 0.17
Nodes (11): 1. Executive Summary & Verification Matrix, 2. The Operational Loop Architecture, 3.1 Derived Table Operational State Engine (`FloorService`), 3.2 Concurrency-Safe Waiter Assignment & Serve, 3.3 Visual Interactive Floor View (`AdminFloorPage`), 3.4 Table Detail Slide-Over Drawer (`TableDetailDrawer`), 3.5 Real-Time SSE Synchronization, 3. Key Components Implemented (+3 more)

### Community 72 - "Restaurant Payments Architecture & Lifecycle (Phase 8)"
Cohesion: 0.18
Nodes (10): 1. Architectural Overview, 2. Strict Lifecycle Separation, 3.1. Cash Settlement (`CASH`), 3.2. Credit / Debit Card (`CARD`), 3.3. MB WAY (`MBWAY`), 3.4. Mock Provider (`MOCK`), 3. Supported Payment Methods, 4. Idempotency & Webhook Deduplication (+2 more)

### Community 73 - "AdminUsersPage.tsx"
Cohesion: 0.36
Nodes (7): AdminUsersPage(), AddMemberPayload, ResetPasswordPayload, UpdateRolePayload, userService, RestaurantMember, UserRole

### Community 74 - "Portuguese Fiscal Integration & Technical Receipts (Phase 8)"
Cohesion: 0.33
Nodes (5): 1. Portuguese NIF Validation Algorithm, 2. Technical Receipts vs Certified Legal Invoicing, 3. Sequential Series Numbering & Immutability, Portuguese Fiscal Integration & Technical Receipts (Phase 8), Rules:

### Community 75 - "Customer Data Protection, NIF Profiles & Privacy (Phase 8)"
Cohesion: 0.40
Nodes (4): 1. Overview & Privacy Principles, 2. Customer & Fiscal Profile Data Model, 3. Masking & Protection Rules, Customer Data Protection, NIF Profiles & Privacy (Phase 8)

### Community 76 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the Oxlint configuration, React Compiler, React + TypeScript + Vite

## Knowledge Gaps
- **423 isolated node(s):** `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components`, `name` (+418 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 571 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `@prisma/client` to `server/src/services/mediaService.ts`, `authMiddleware.ts`, `notificationRoutes.ts`, `realtimeService.ts`, `payment/paymentService.ts`, `floorService.ts`, `settingsRoutes.ts`, `seed.ts`, `advance_test_order.ts`, `package.json`, `backup_restore_test.ts`, `app.ts`, `rateLimiter.ts`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `react` connect `useAuth` to `AuthContext.tsx`, `CategoryNav.tsx`, `AdminMenuPreviewPage.tsx`, `apiClient.ts`, `useAdminData.ts`, `App.tsx`, `CustomerOrderTrackingPage.tsx`, `FoodFeed.tsx`, `types/index.ts`, `AdminUsersPage.tsx`, `apiClient`, `package.json`, `AdminTablesPage.tsx`, `RestaurantSettings`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `useAuth` to `AuthContext.tsx`, `CategoryNav.tsx`, `AdminMenuPreviewPage.tsx`, `types/index.ts`, `useAdminData.ts`, `App.tsx`, `CustomerOrderTrackingPage.tsx`, `FoodFeed.tsx`, `apiClient.ts`, `AdminUsersPage.tsx`, `apiClient`, `package.json`, `AdminTablesPage.tsx`, `RestaurantSettings`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `$schema`, `plugins`, `react/rules-of-hooks` to the rest of the system?**
  _423 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server/src/services/mediaService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05009920634920635 - nodes in this community are weakly interconnected._
- **Should `@prisma/client` be split into smaller, more focused modules?**
  _Cohesion score 0.12727272727272726 - nodes in this community are weakly interconnected._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07084785133565621 - nodes in this community are weakly interconnected._