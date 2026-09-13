import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Production Stabilization Plan — focused regression suite.
 *
 * These are static source-analysis assertions (no live DB required) that pin
 * the exact behaviors fixed by the Production Stabilization Plan:
 *   1. server included in `tsc -b`
 *   2. validateUuidParams accepts string | string[]
 *   3. ONE canonical resolveRestaurantId used by every tenant middleware + SSE
 *   4. UUID validated before Prisma UUID lookups
 *   5. subscription enforced on SSE
 *   6. no nosub / no-sub / test-only fallbacks
 *   7. standardized tenant-protection middleware ordering
 *   8. Translation dual-FK trap removed + migration present
 *   9. live-DB UUID column verification script present
 */

async function runProductionStabilizationTests() {
  console.log('🛡️  Starting Production Stabilization Regression Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(num: number, desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ [Test ${num}] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${num}] ${desc}:`, err.message || err);
      failed++;
    }
  }

  const rootDir = path.resolve(__dirname, '../../');
  const read = (p: string) => fs.readFileSync(path.join(rootDir, p), 'utf-8');
  const exists = (p: string) => fs.existsSync(path.join(rootDir, p));

  const tsconfig = read('tsconfig.json');
  const validation = read('server/src/middleware/validation.ts');
  const authMiddleware = read('server/src/middleware/authMiddleware.ts');
  const subscriptionMiddleware = read('server/src/middleware/subscriptionMiddleware.ts');
  const realtimeRoutes = read('server/src/routes/realtimeRoutes.ts');
  const schema = read('prisma/schema.prisma');
  const orderRoutes = read('server/src/routes/orderRoutes.ts');
  const paymentRoutes = read('server/src/routes/paymentRoutes.ts');
  const verifyScript = read('server/scripts/verifyUuidColumns.ts');

  // ---- 1. Server included in tsc -b ----
  assert(1, 'tsconfig.server.json exists and includes server/src', () => {
    if (!exists('tsconfig.server.json')) throw new Error('tsconfig.server.json missing');
    const cfg = read('tsconfig.server.json');
    if (!cfg.includes('server/src')) throw new Error('tsconfig.server.json does not include server/src');
  });

  assert(2, 'root tsconfig.json references tsconfig.server.json', () => {
    if (!tsconfig.includes('tsconfig.server.json')) {
      throw new Error('tsconfig.json does not reference tsconfig.server.json');
    }
  });

  // ---- 2. validateUuidParams accepts string | string[] ----
  assert(3, 'validateUuidParams accepts string | string[]', () => {
    if (!validation.includes('export function validateUuidParams(paramNames: string | string[])')) {
      throw new Error('validateUuidParams signature does not accept string | string[]');
    }
  });

  assert(4, 'isValidUuid accepts string | string[] and normalizes arrays', () => {
    if (!validation.includes('export function isValidUuid(id?: string | string[]): boolean')) {
      throw new Error('isValidUuid signature does not accept string | string[]');
    }
    if (!validation.includes('Array.isArray(id) ? id[0] : id')) {
      throw new Error('isValidUuid does not normalize arrays to a single value');
    }
  });

  // ---- 3. ONE canonical resolveRestaurantId ----
  assert(5, 'canonical resolveRestaurantId is exported from authMiddleware', () => {
    if (!authMiddleware.includes('export async function resolveRestaurantId(req: Request): Promise<string | null>')) {
      throw new Error('resolveRestaurantId is not exported as the canonical resolver');
    }
  });

  assert(6, 'requireRestaurantAccess uses the canonical resolveRestaurantId', () => {
    const body = authMiddleware.slice(authMiddleware.indexOf('export function requireRestaurantAccess'));
    if (!body.includes('resolveRestaurantId(req)')) {
      throw new Error('requireRestaurantAccess does not use resolveRestaurantId');
    }
  });

  assert(7, 'requirePermission uses the canonical resolveRestaurantId', () => {
    const body = authMiddleware.slice(authMiddleware.indexOf('export function requirePermission'));
    if (!body.includes('resolveRestaurantId(req)')) {
      throw new Error('requirePermission does not use resolveRestaurantId');
    }
  });

  assert(8, 'requireAnyPermission uses the canonical resolveRestaurantId', () => {
    const body = authMiddleware.slice(authMiddleware.indexOf('export function requireAnyPermission'));
    if (!body.includes('resolveRestaurantId(req)')) {
      throw new Error('requireAnyPermission does not use resolveRestaurantId');
    }
  });

  assert(9, 'requireActiveSubscription uses the canonical resolveRestaurantId', () => {
    if (!subscriptionMiddleware.includes("import { resolveRestaurantId } from './authMiddleware'")) {
      throw new Error('requireActiveSubscription does not import the canonical resolveRestaurantId');
    }
    if (!subscriptionMiddleware.includes('resolveRestaurantId(req)')) {
      throw new Error('requireActiveSubscription does not call resolveRestaurantId');
    }
  });

  // ---- 4. UUID validated before Prisma UUID lookups ----
  assert(10, 'resolveRestaurantId never returns a non-UUID', () => {
    if (!authMiddleware.includes('return target && isValidUuid(target) ? target : null;')) {
      throw new Error('resolveRestaurantId does not gate its return value on isValidUuid');
    }
  });

  // ---- 5. subscription enforced on SSE ----
  assert(11, 'SSE rejects non-UUID restaurant identifiers', () => {
    if (!realtimeRoutes.includes('isValidUuid(restaurantId)')) {
      throw new Error('SSE does not validate restaurantId with isValidUuid');
    }
  });

  assert(12, 'SSE enforces an ACTIVE or GRACE_PERIOD subscription', () => {
    if (!realtimeRoutes.includes('SubscriptionStatus.ACTIVE') || !realtimeRoutes.includes('SubscriptionStatus.GRACE_PERIOD')) {
      throw new Error('SSE does not gate on ACTIVE/GRACE_PERIOD subscription status');
    }
  });

  // ---- 6. no nosub / no-sub / test-only fallbacks ----
  assert(13, 'subscription middleware contains no nosub / no-sub fallbacks', () => {
    if (/nosub|no-sub/i.test(subscriptionMiddleware)) {
      throw new Error('subscription middleware still contains nosub / no-sub fallback');
    }
    if (subscriptionMiddleware.includes("NODE_ENV === 'production'")) {
      throw new Error('subscription middleware still contains a production-only test fallback');
    }
  });

  // ---- 7. standardized tenant-protection middleware ordering ----
  assert(14, 'order subscription mount validates UUID before enforcing subscription', () => {
    if (!orderRoutes.includes("orderRouter.use('/restaurants/:restaurantId/orders', authenticateToken, validateUuidParams(['restaurantId']), requireActiveSubscription());")) {
      throw new Error('order subscription mount is not ordered authenticateToken -> validateUuidParams -> requireActiveSubscription');
    }
  });

  assert(15, 'payment subscription mount validates UUID before enforcing subscription', () => {
    if (!paymentRoutes.includes("paymentRouter.use('/restaurants/:id', authenticateToken, validateUuidParams('id'), requireActiveSubscription());")) {
      throw new Error('payment subscription mount is not ordered authenticateToken -> validateUuidParams -> requireActiveSubscription');
    }
  });

  // ---- 8. Translation dual-FK trap removed + migration present ----
  assert(16, 'Translation model has no category / foodItem foreign-key relations', () => {
    const translationBlock = schema.slice(schema.indexOf('model Translation'), schema.indexOf('model PlatformSettings'));
    if (/category\s+Category|foodItem\s+FoodItem|@relation/.test(translationBlock)) {
      throw new Error('Translation model still declares category/foodItem relations');
    }
    if (!translationBlock.includes('entityType') || !translationBlock.includes('entityId')) {
      throw new Error('Translation model does not use the polymorphic entityType/entityId pattern');
    }
  });

  assert(17, 'Category and FoodItem no longer declare a translations back-relation', () => {
    const categoryBlock = schema.slice(schema.indexOf('model Category'), schema.indexOf('model FoodItem'));
    const foodBlock = schema.slice(schema.indexOf('model FoodItem'), schema.indexOf('model Media'));
    if (/translations\s+Translation/.test(categoryBlock) || /translations\s+Translation/.test(foodBlock)) {
      throw new Error('Category/FoodItem still declare translations Translation[]');
    }
  });

  assert(18, 'a migration exists to drop the dual-FK constraints', () => {
    const migrationDir = path.join(rootDir, 'prisma/migrations');
    const dirs = fs.readdirSync(migrationDir).filter((d) => d.includes('remove_translation_dual_fk'));
    if (dirs.length === 0) throw new Error('remove_translation_dual_fk migration directory missing');
    const sql = read(`prisma/migrations/${dirs[0]}/migration.sql`);
    if (!sql.includes('fk_translation_category') || !sql.includes('fk_translation_food')) {
      throw new Error('dual-FK migration does not drop fk_translation_category / fk_translation_food');
    }
  });

  // ---- 9. live-DB UUID column verification script ----
  assert(19, 'verifyUuidColumns script exists and checks tenant UUID columns', () => {
    if (!exists('server/scripts/verifyUuidColumns.ts')) throw new Error('verifyUuidColumns.ts missing');
    if (!verifyScript.includes('information_schema.columns')) {
      throw new Error('verifyUuidColumns does not query information_schema.columns');
    }
  });

  assert(20, 'package.json exposes db:verify-uuid script', () => {
    const pkg = read('package.json');
    if (!pkg.includes('db:verify-uuid')) throw new Error('db:verify-uuid script missing from package.json');
  });

  console.log(`\n📊 Production Stabilization Regression Results: ${passed} passed, ${failed} failed (Total: ${passed + failed})`);
  if (failed > 0) {
    process.exit(1);
  }
}

runProductionStabilizationTests().catch((err) => {
  console.error('Fatal error during production stabilization tests:', err);
  process.exit(1);
});
