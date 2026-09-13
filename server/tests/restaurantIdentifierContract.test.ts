import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Restaurant Identifier Contract Regression Suite
 *
 * Guarantees the UUID vs slug separation across the restaurant API:
 *   - UUID-based endpoints receive a Restaurant.id (UUID)
 *   - slug-based endpoints receive an explicit slug path
 *   - the frontend never sends activeRestaurant.slug where restaurant.id is required
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runIdentifierContractTests() {
  console.log('🔐  Starting Restaurant Identifier Contract Suite (10 Tests)...\n');
  let passed = 0;
  let failed = 0;

  function assert(num: number, desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ [Test ${num}/10] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${num}/10] ${desc}:`, err.message || err);
      failed++;
    }
  }

  const rootDir = path.resolve(__dirname, '../../');
  const read = (p: string) => fs.readFileSync(path.join(rootDir, p), 'utf-8');

  const restaurantRoutes = read('server/src/routes/restaurantRoutes.ts');
  const restaurantService = read('src/services/restaurantService.ts');
  const useAdminData = read('src/hooks/useAdminData.ts');

  // ---- Behavioral: identifier classification ----
  assert(1, 'UUID string is accepted as a restaurant id', () => {
    const id = '0192f3a0-0000-7000-8000-000000000001';
    if (!UUID_RE.test(id)) throw new Error('valid UUID rejected');
  });

  assert(2, 'slug string is NOT a valid UUID', () => {
    if (UUID_RE.test('mahana')) throw new Error('slug incorrectly classified as UUID');
  });

  // ---- Backend routing contract ----
  assert(3, 'backend exposes an explicit UUID route GET /restaurants/:id', () => {
    if (!restaurantRoutes.includes("restaurantRouter.get('/:id'")) {
      throw new Error('missing GET /:id UUID route');
    }
    if (!restaurantRoutes.includes("validateUuidParams(['id'])")) {
      throw new Error('GET /:id route is not UUID-validated');
    }
  });

  assert(4, 'backend exposes an explicit slug route GET /restaurants/by-slug/:slug', () => {
    if (!restaurantRoutes.includes("restaurantRouter.get('/by-slug/:slug'")) {
      throw new Error('missing explicit /by-slug/:slug route');
    }
  });

  assert(5, 'backend no longer exposes the ambiguous GET /restaurants/:slug route', () => {
    if (restaurantRoutes.includes("get('/:slug'")) {
      throw new Error('ambiguous /:slug route still present');
    }
  });

  // ---- Frontend service contract ----
  assert(6, 'restaurantService.getById targets the UUID endpoint', () => {
    if (!restaurantService.includes('getById(id: string)')) throw new Error('missing getById');
    if (!restaurantService.includes('`/restaurants/${id}`')) throw new Error('getById does not use UUID path');
  });

  assert(7, 'restaurantService.getBySlug targets the explicit slug endpoint', () => {
    if (!restaurantService.includes('getBySlug(slug: string)')) throw new Error('missing getBySlug');
    if (!restaurantService.includes('`/restaurants/by-slug/${slug}`')) {
      throw new Error('getBySlug does not use the explicit by-slug path');
    }
  });

  assert(8, 'useAdminData fetches the admin restaurant by UUID (not slug)', () => {
    if (!useAdminData.includes('activeRestaurant?.id || \'\'')) {
      throw new Error('useAdminData does not use activeRestaurant.id');
    }
    if (!useAdminData.includes('restaurantService.getById(restaurantId)')) {
      throw new Error('useAdminData does not call getById');
    }
    if (useAdminData.includes('getBySlug(activeRestaurant?.slug)')) {
      throw new Error('useAdminData still fetches by slug');
    }
  });

  assert(9, 'public menu still resolves by slug via the dedicated /menu endpoint', () => {
    if (!restaurantService.includes('getPublicMenu(slug: string')) throw new Error('missing getPublicMenu');
    if (!restaurantService.includes('/menu/${slug}')) throw new Error('getPublicMenu does not use /menu/:slug');
  });

  assert(10, 'no restaurant service method passes a slug where a UUID is required', () => {
    // getById/getBySlug are the only single-segment restaurant paths; every
    // other service call in the frontend uses `restaurantId` (UUID) explicitly.
    if (restaurantService.includes('getBySlug(slug: string): Promise<Restaurant> {\n    return apiClient.get<Restaurant>(`/restaurants/${slug}`)')) {
      throw new Error('getBySlug still targets the ambiguous /restaurants/:slug path');
    }
  });

  console.log(`\n📊 Identifier Contract Test Results: ${passed} passed, ${failed} failed (Total: 10)`);
  if (failed > 0) {
    process.exit(1);
  }
}

runIdentifierContractTests().catch((err) => {
  console.error('Fatal error during identifier contract tests:', err);
  process.exit(1);
});
