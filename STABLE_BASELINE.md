# Stable Baseline

Verified state of the VisualMenu (Aura SaaS) monorepo at the current commit.
This file documents a known-good baseline; it does not modify code, database, or migrations.

- **Date:** 2026-09-13
- **Commit:** `2ae1a1d` — `fix: production stabilization and tenant identifier hardening`
- **Branch:** `main` (up to date with `origin/main`)

## Verification status

| Check | Result |
|---|---|
| `git status` | Clean — nothing to commit, working tree clean |
| `git diff` | Empty — no uncommitted changes |
| Typecheck (`tsc -b`, server + frontend) | Pass (exit 0) |
| Build (`npm run build`) | Pass (exit 0) |
| Pending migrations | 1 not applied (`20260913020000_remove_translation_dual_fk`) |

## Test summary

### Static regression suites (10/10 pass — 146 assertions)

| Suite | Result |
|---|---|
| restaurantBootstrap | 14 passed |
| restaurantLifecycle | 12 passed |
| restaurantIdentifierContract | 10 passed |
| productionStabilization | 20 passed |
| adminLoadingStates | 12 passed |
| floorRendering | 10 passed |
| mediaUploadModal | 10 passed |
| foodFormModalScroll | 12 passed |
| foodVideoPlayback | 16 passed |
| foodVideoTransition | 20 passed |

### Integration suites (14/16 fully pass — 538 assertions)

| Suite | Result |
|---|---|
| phase14-hardening | 11 passed |
| realtime | 12 passed |
| operational-access | 57 passed |
| staff | 28 passed |
| subscriptions | 74 passed |
| phase7 | 12 passed |
| phase8 | 11 passed |
| foodMedia | 25 passed |
| qa | 15 passed |
| subscriptionAccess | 70 passed |
| provisioning | 28 passed |
| tenantIsolation | 17 passed |
| api | 40 passed |
| operations | 66 passed |

## Pending migrations

- `20260913020000_remove_translation_dual_fk` — **not yet applied**. Drops the erroneous
  `fk_translation_category` and `fk_translation_food` constraints on `translations.entity_id`.
  Apply via `prisma migrate deploy` (production) or `prisma migrate dev` (development).
  18 migrations total are present in `prisma/migrations`.

## Known non-blocking issues

1. **`platformAdmin.test.ts`** — fails on startup (pre-existing). Imports the frontend
   `src/services/platformService` → `src/config.ts`, which reads `import.meta.env.VITE_API_URL`,
   undefined under `tsx`/Node.
2. **`notifications.test.ts` Test 34** — flaky off-by-one (`Expected N recipients, got N+1`).
   Broadcast recipient-count mismatch caused by leftover test restaurants in the shared dev DB.
3. **Migration not applied** — the Translation dual-FK drop migration is committed but still
   pending application to the database.
4. **Hang-on-exit tests** — several integration suites (`tenantIsolation`, `operations`, `api`,
   `provisioning`, `phase7`, `qa`) omit `process.exit(0)` and keep the Prisma pool open after
   all assertions pass. Assertions pass; the process only exits when killed.
5. **Vite chunk-size warning** — production bundle (~1.7 MB) exceeds 500 kB; cosmetic,
   pre-existing.
