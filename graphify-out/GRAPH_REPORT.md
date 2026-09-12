# Graph Report - menu  (2026-09-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1054 nodes · 2539 edges · 60 communities (51 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e9b1f876`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server/src/services/mediaService.ts
- @prisma/client
- types/index.ts
- PaymentProvider
- ApiClient
- authMiddleware.ts
- App.tsx
- AuthContext.tsx
- CustomerOrderTrackingPage.tsx
- FoodFeed.tsx
- paymentProvider.ts
- 20260908230000_phase8_payments_nif_receipts/migration.sql
- settingsRoutes.ts
- useAuth
- 20260907224524_init/migration.sql
- app.ts
- package.json
- scripts
- permissions.ts
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
- RealtimeService
- services/paymentService.ts
- "restaurant_tables"
- storageService.ts
- CategoryNav.tsx
- AdminMenuPreviewPage.tsx
- server/src/services/platformService.ts
- realtimeService.ts
- Restaurant
- "owner_invitations"
- FiscalProvider
- NifValidator
- floorService.ts
- JobService
- .oxlintrc.json
- "user_restaurants"
- advance_test_order.ts
- AdminTablesPage.tsx
- backup_restore_test.ts
- foodFormModalScroll.test.ts
- vite.config.ts
- runOperationsTestSuite
- runPlatformAdminTests
- runOperationalAccessTests
- tsconfig.json
- prisma
- ReconciliationService

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 66 edges
2. `react` - 63 edges
3. `lucide-react` - 52 edges
4. `@prisma/client` - 48 edges
5. `prisma` - 42 edges
6. `FoodItem` - 35 edges
7. `express` - 32 edges
8. `Category` - 31 edges
9. `StorageService` - 25 edges
10. `scripts` - 23 edges

## Surprising Connections (you probably didn't know these)
- `CategoryFormModalProps` --references--> `Category`  [EXTRACTED]
  src/components/admin/CategoryFormModal.tsx → src/types/index.ts
- `MediaUploadModalProps` --references--> `MediaItem`  [EXTRACTED]
  src/components/admin/MediaUploadModal.tsx → src/types/index.ts
- `AdminUsersPage()` --calls--> `useAuth()`  [EXTRACTED]
  src/pages/admin/AdminUsersPage.tsx → src/context/AuthContext.tsx
- `runPlatformAdminTests()` --calls--> `normalizePaginatedResult()`  [EXTRACTED]
  server/tests/platformAdmin.test.ts → src/services/platformService.ts
- `runPlatformAdminTests()` --calls--> `unwrapResponse()`  [EXTRACTED]
  server/tests/platformAdmin.test.ts → src/services/platformService.ts

## Import Cycles
- None detected.

## Communities (60 total, 7 thin omitted)

### Community 0 - "server/src/services/mediaService.ts"
Cohesion: 0.05
Nodes (17): CreateMediaInput, ListMediaOptions, MediaService, PaginatedMediaResult, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MediaValidator, ValidationResult (+9 more)

### Community 1 - "@prisma/client"
Cohesion: 0.09
Nodes (22): prisma, bcryptjs, dotenv, @prisma/client, supertest, app, server, prisma (+14 more)

### Community 2 - "types/index.ts"
Cohesion: 0.07
Nodes (38): AdminStaffPage(), StaffOnboardingPage(), CatalogResponse, CreateStaffData, ListStaffResponse, staffService, ButtonStyle, CameraMotion (+30 more)

### Community 3 - "PaymentProvider"
Cohesion: 0.07
Nodes (5): redactSensitiveData(), PaymentProvider, PaymentService, PlatformService, StaffService

### Community 4 - "ApiClient"
Cohesion: 0.08
Nodes (22): ProtectedRouteProps, AuthContextType, AdminUsersPage(), ApiClient, ApiResponse, authService, AuthUser, LoginResponse (+14 more)

### Community 5 - "authMiddleware.ts"
Cohesion: 0.21
Nodes (20): express, hasPermission(), authenticateToken(), AuthUser, Express, Request, requireAnyPermission(), requirePermission() (+12 more)

### Community 6 - "App.tsx"
Cohesion: 0.15
Nodes (21): react, App(), AdminLayout(), CategoryFormModal(), CategoryFormModalProps, ICON_OPTIONS, COMMON_ALLERGENS, FoodFormModal() (+13 more)

### Community 7 - "AuthContext.tsx"
Cohesion: 0.11
Nodes (23): COMMON_CURRENCIES, COMMON_LANGUAGES, COMMON_TIMEZONES, PlatformEditRestaurantModal(), PlatformEditRestaurantModalProps, PlatformRoute(), PlatformRouteProps, AuthContext (+15 more)

### Community 8 - "CustomerOrderTrackingPage.tsx"
Cohesion: 0.11
Nodes (26): STATE_BADGE_STYLES, TableDetailDrawer(), TableDetailDrawerProps, AdminFloorPage(), OperationalFilter, STATE_BADGE_STYLES, AdminKitchenPage(), AdminOrdersPage() (+18 more)

### Community 9 - "FoodFeed.tsx"
Cohesion: 0.15
Nodes (21): framer-motion, CartDrawer(), CustomerMenuPreviewInner(), CustomerMenuPreviewProps, FoodDetailsModal(), FoodDetailsModalProps, FoodFeed(), LuxuryFoodFallback() (+13 more)

### Community 10 - "paymentProvider.ts"
Cohesion: 0.15
Nodes (9): MBWayPaymentProvider, MockPaymentProvider, CreatePaymentParams, PaymentProviderResult, PaymentProviderStatusResult, RefundPaymentParams, RefundProviderResult, WebhookVerificationResult (+1 more)

### Community 11 - "20260908230000_phase8_payments_nif_receipts/migration.sql"
Cohesion: 0.13
Nodes (27): "customers", "customer_fiscal_profiles", customer_fiscal_profiles_customer_id_idx, customer_fiscal_profiles_tax_id_idx, customers_email_idx, customers_phone_idx, customers_restaurant_id_idx, "fiscal_documents" (+19 more)

### Community 12 - "settingsRoutes.ts"
Cohesion: 0.08
Nodes (19): normalizePresentationMode(), normalizeTheme(), settingsRouter, VALID_ANIMATION_STYLES, VALID_BACKGROUND_STYLES, VALID_BUTTON_STYLES, VALID_CAMERA_MOTIONS, VALID_CARD_STYLES (+11 more)

### Community 13 - "useAuth"
Cohesion: 0.16
Nodes (18): lucide-react, react-router-dom, AdminSidebar(), ProtectedRoute(), PermissionRoute(), PermissionRouteProps, PlatformLayout(), PlatformSidebar() (+10 more)

### Community 14 - "20260907224524_init/migration.sql"
Cohesion: 0.15
Nodes (25): "categories", categories_active_idx, categories_display_order_idx, categories_restaurant_id_idx, categories_restaurant_id_name_key, "food_items", food_items_available_idx, food_items_category_id_idx (+17 more)

### Community 15 - "app.ts"
Cohesion: 0.10
Nodes (17): ApiError, errorHandler(), requestLogger(), auditRouter, categoryRouter, customerRouter, foodRouter, mediaRouter (+9 more)

### Community 16 - "package.json"
Cohesion: 0.09
Nodes (22): name, private, type, version, clsx, cors, oxlint, prisma (+14 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, build, db:migrate, db:seed, dev, lint, preview, server (+15 more)

### Community 18 - "permissions.ts"
Cohesion: 0.14
Nodes (15): jsonwebtoken, normalizePermissionKey(), Permission, PERMISSION_CATALOG, PermissionDefinition, PermissionKey, ROLE_PERMISSIONS, ROLE_TEMPLATES (+7 more)

### Community 19 - "FoodItem"
Cohesion: 0.27
Nodes (5): FoodFormModalProps, notifyChange(), StorageService, Category, FoodItem

### Community 20 - "FoodMediaTransitionStateMachine"
Cohesion: 0.16
Nodes (6): createMockVideo(), __dirname, __filename, FoodMediaTransitionStateMachine, MockVideoElement, runVideoTransitionTests()

### Community 21 - "rateLimiter.ts"
Cohesion: 0.12
Nodes (15): ClientBucket, loginLimiterInstance, loginRateLimiter, orderCreationLimiterInstance, orderCreationRateLimiter, orderTrackingLimiterInstance, orderTrackingRateLimiter, paymentCreationLimiterInstance (+7 more)

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
Cohesion: 0.18
Nodes (15): "orders", orders_restaurant_id_idx, orders_status_idx, "order_status_history", order_status_history_created_at_idx, order_status_history_order_id_idx, orders_idempotency_key_idx, orders_idempotency_key_key (+7 more)

### Community 26 - "RestaurantSettings"
Cohesion: 0.18
Nodes (12): FoodInfo(), FoodInfoProps, FoodMedia(), FoodMediaProps, VideoPlaybackState, FoodSlide(), FoodSlideProps, getTranslations() (+4 more)

### Community 27 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 28 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, bcryptjs, clsx, cors, dotenv, express, framer-motion, jsonwebtoken (+8 more)

### Community 29 - ""restaurants""
Cohesion: 0.16
Nodes (15): "audit_logs", audit_logs_created_at_idx, audit_logs_entity_type_entity_id_idx, audit_logs_restaurant_id_idx, "restaurants", restaurants_slug_key, "users", users_email_key (+7 more)

### Community 30 - "20260910123000_phase11a_staff_permissions/migration.sql"
Cohesion: 0.25
Nodes (14): "permissions", permissions_active_idx, permissions_group_idx, permissions_key_key, "staff_invitations", staff_invitations_expires_at_idx, staff_invitations_invited_email_idx, staff_invitations_restaurant_id_idx (+6 more)

### Community 32 - "services/paymentService.ts"
Cohesion: 0.22
Nodes (11): AdminCashPage(), AdminCustomersPage(), AdminPaymentsPage(), InitiatePaymentResult, PaymentQueryParams, paymentService, SettleCashParams, Customer (+3 more)

### Community 33 - ""restaurant_tables""
Cohesion: 0.16
Nodes (13): "qr_codes", qr_codes_restaurant_id_idx, qr_codes_slug_idx, qr_codes_slug_key, "restaurant_tables", restaurant_tables_restaurant_id_idx, restaurant_tables_restaurant_id_table_number_key, orders_created_at_idx (+5 more)

### Community 34 - "storageService.ts"
Cohesion: 0.27
Nodes (7): INITIAL_CATEGORIES, INITIAL_FOODS, INITIAL_MEDIA, INITIAL_RESTAURANT, DataListener, listeners, MediaItem

### Community 35 - "CategoryNav.tsx"
Cohesion: 0.33
Nodes (8): CategoryNav(), CategoryNavProps, getCategoryIcon(), getTheme(), ThemeDefinition, ResolvedTheme, resolveTheme(), useTheme()

### Community 36 - "AdminMenuPreviewPage.tsx"
Cohesion: 0.25
Nodes (7): CustomerMenuPreview(), DeviceMode, DevicePreview(), DevicePreviewProps, SinglePlayVideo(), SinglePlayVideoProps, settingsService

### Community 37 - "server/src/services/platformService.ts"
Cohesion: 0.20
Nodes (8): multer, requirePlatformRole(), platformRouter, upload, ListPlatformAuditParams, ListPlatformUsersParams, ListRestaurantsParams, UpdatePlatformRestaurantInput

### Community 38 - "realtimeService.ts"
Cohesion: 0.22
Nodes (7): OrderCreatedEvent, OrderItemStatusChangedEvent, OrderStatusChangedEvent, RealtimeEventName, createSseClient(), runRealtimeTests(), SseMessage

### Community 39 - "Restaurant"
Cohesion: 0.33
Nodes (5): AdminSidebarProps, FoodFeedProps, MenuHeaderProps, PublicMenuPayload, Restaurant

### Community 40 - ""owner_invitations""
Cohesion: 0.43
Nodes (7): "owner_invitations", owner_invitations_expires_at_idx, owner_invitations_invited_email_idx, owner_invitations_restaurant_id_idx, owner_invitations_token_hash_idx, owner_invitations_token_hash_key, restaurants_provisioning_status_idx

### Community 42 - "NifValidator"
Cohesion: 0.33
Nodes (3): NifValidator, ValidationResult, runPhase8Tests()

### Community 43 - "floorService.ts"
Cohesion: 0.33
Nodes (4): FloorOverviewResponse, FloorService, FloorTableSummary, TableOperationalState

### Community 44 - "JobService"
Cohesion: 0.33
Nodes (3): Job, JobService, JobType

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

### Community 51 - "vite.config.ts"
Cohesion: 0.50
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 53 - "runPlatformAdminTests"
Cohesion: 0.67
Nodes (3): runPlatformAdminTests(), normalizePaginatedResult(), unwrapResponse()

## Knowledge Gaps
- **251 isolated node(s):** `CreateMediaInput`, `ListMediaOptions`, `PaginatedMediaResult`, `ValidationResult`, `UploadResult` (+246 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 344 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `@prisma/client` to `server/src/services/mediaService.ts`, `authMiddleware.ts`, `server/src/services/platformService.ts`, `realtimeService.ts`, `paymentProvider.ts`, `floorService.ts`, `settingsRoutes.ts`, `advance_test_order.ts`, `package.json`, `backup_restore_test.ts`, `permissions.ts`, `app.ts`, `rateLimiter.ts`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `react` connect `App.tsx` to `services/paymentService.ts`, `types/index.ts`, `CategoryNav.tsx`, `AdminMenuPreviewPage.tsx`, `ApiClient`, `AuthContext.tsx`, `CustomerOrderTrackingPage.tsx`, `FoodFeed.tsx`, `useAuth`, `package.json`, `AdminTablesPage.tsx`, `RestaurantSettings`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `express` connect `authMiddleware.ts` to `@prisma/client`, `server/src/services/platformService.ts`, `realtimeService.ts`, `paymentProvider.ts`, `settingsRoutes.ts`, `app.ts`, `package.json`, `permissions.ts`, `rateLimiter.ts`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `CreateMediaInput`, `ListMediaOptions`, `PaginatedMediaResult` to the rest of the system?**
  _251 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server/src/services/mediaService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05009920634920635 - nodes in this community are weakly interconnected._
- **Should `@prisma/client` be split into smaller, more focused modules?**
  _Cohesion score 0.09061224489795919 - nodes in this community are weakly interconnected._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07084785133565621 - nodes in this community are weakly interconnected._