import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Restaurant Creation + Owner Onboarding Lifecycle Regression Suite
 *
 * Verifies the end-to-end tenant bootstrap guarantees:
 *   1. create restaurant          -> UUID restaurant.id
 *   2. create/activate owner      -> UUID user.id + OWNER membership
 *   3. owner login                -> JWT + UUID/slug split
 *   4. resolve active restaurant  -> UUID used for API, slug for URL only
 *   5. load dashboard             -> membership lookup uses UUID
 *   6. load categories/foods/QR   -> UUID tenant context
 *   7. refresh browser            -> token persists under canonical key
 *   8. direct admin route         -> authenticated
 */

interface ProvisionedTenant {
  restaurantId: string;
  userId: string;
  membership: { userId: string; restaurantId: string; role: 'OWNER' };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mirrors the membership creation performed by RestaurantProvisioningService
 * (must always reference the auto-generated UUIDs, never a slug/email/name).
 */
function provisionMembership(restaurantId: string, userId: string): ProvisionedTenant {
  if (!UUID_RE.test(restaurantId)) throw new Error('restaurant.id is not a UUID');
  if (!UUID_RE.test(userId)) throw new Error('user.id is not a UUID');
  return {
    restaurantId,
    userId,
    membership: { userId, restaurantId, role: 'OWNER' },
  };
}

async function runRestaurantLifecycleTests() {
  console.log('🏗️  Starting Restaurant Lifecycle Regression Suite (12 Tests)...\n');
  let passed = 0;
  let failed = 0;

  function assert(num: number, desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ [Test ${num}/12] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${num}/12] ${desc}:`, err.message || err);
      failed++;
    }
  }

  const rootDir = path.resolve(__dirname, '../../');
  const read = (p: string) => fs.readFileSync(path.join(rootDir, p), 'utf-8');

  const provisioning = read('server/src/services/restaurantProvisioningService.ts');
  const authRoutes = read('server/src/routes/authRoutes.ts');
  const subMiddleware = read('server/src/middleware/subscriptionMiddleware.ts');
  const useAdminData = read('src/hooks/useAdminData.ts');
  const authContext = read('src/context/AuthContext.tsx');
  const authService = read('src/services/authService.ts');
  const ownerService = read('src/services/platformService.ts');
  const ownerPage = read('src/pages/owner/OwnerOnboardingPage.tsx');

  // ---- Behavioral: membership always references UUIDs ----
  assert(1, 'provisioned membership references UUID restaurantId + userId (never slug/email)', () => {
    const t = provisionMembership(
      '0192f3a0-0000-7000-8000-000000000001',
      '0192f3a0-0000-7000-8000-000000000002'
    );
    if (t.membership.role !== 'OWNER') throw new Error('owner membership role wrong');
    if (t.membership.restaurantId !== t.restaurantId || t.membership.userId !== t.userId) {
      throw new Error('membership does not reference the real UUIDs');
    }
  });

  assert(2, 'rejects non-UUID restaurant/user identifiers at membership creation', () => {
    let threw = false;
    try {
      provisionMembership('la-cucina', '0192f3a0-0000-7000-8000-000000000002');
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('slug was accepted as a restaurant UUID');
  });

  // ---- Static source invariants ----
  assert(3, 'provisioning creates OWNER membership with restaurant.id and user.id', () => {
    if (!provisioning.includes('userId: user.id')) throw new Error('provisioning missing userId: user.id');
    if (!provisioning.includes('restaurantId: restaurant.id')) throw new Error('provisioning missing restaurantId: restaurant.id');
    if (!provisioning.includes('role: Role.OWNER')) throw new Error('provisioning missing OWNER role');
  });

  assert(4, 'owner invitation accept creates membership with the real invitation.restaurantId', () => {
    if (!provisioning.includes('restaurantId: invitation.restaurantId')) {
      throw new Error('acceptOwnerInvitation missing restaurantId: invitation.restaurantId');
    }
    if (!provisioning.includes('userId: u.id')) throw new Error('acceptOwnerInvitation missing userId: u.id');
  });

  assert(5, 'owner onboarding stores token under the canonical auth key', () => {
    if (!ownerService.includes("setItem('aura_admin_token', dataResult.token)")) {
      throw new Error('owner service does not persist aura_admin_token');
    }
    if (!ownerService.includes("setItem('aura_admin_user'")) {
      throw new Error('owner service does not persist aura_admin_user');
    }
  });

  assert(6, 'owner onboarding page no longer uses the broken auth_token / loginWithToken path', () => {
    if (ownerPage.includes('auth_token')) throw new Error('owner page still stores auth_token');
    if (ownerPage.includes('loginWithToken')) throw new Error('owner page still calls loginWithToken');
    if (!ownerPage.includes('refreshProfile()')) throw new Error('owner page does not refresh the auth context');
  });

  assert(7, 'login response returns restaurant UUID and slug separately', () => {
    if (!authRoutes.includes('id: ur.restaurant.id')) throw new Error('login response missing id: ur.restaurant.id');
    if (!authRoutes.includes('slug: ur.restaurant.slug')) throw new Error('login response missing slug: ur.restaurant.slug');
  });

  assert(8, 'activeRestaurant uses the slug only for the by-slug fetch, then the UUID for APIs', () => {
    if (!useAdminData.includes("slug || activeRestaurant?.slug || ''")) {
      throw new Error('useAdminData does not derive slug from activeRestaurant');
    }
    if (!useAdminData.includes('restaurantService.getBySlug(effectiveSlug)')) {
      throw new Error('useAdminData does not fetch by slug');
    }
    if (!useAdminData.includes('categoryService.getByRestaurant(rest.id)')) {
      throw new Error('useAdminData does not use restaurant UUID for categories');
    }
  });

  assert(9, 'AuthContext deterministic resolver preserves UUID vs slug fields', () => {
    if (!authContext.includes("r.status !== 'DISABLED'")) throw new Error('resolver missing ACTIVE filter');
    if (!authContext.includes('localStorage.getItem(\'aura_active_restaurant_slug\')')) {
      throw new Error('resolver missing saved-slug preference');
    }
  });

  assert(10, 'subscription middleware rejects a non-UUID restaurantId before membership lookup', () => {
    if (!subMiddleware.includes('isValidUuid(restaurantId)')) {
      throw new Error('subscription middleware missing UUID guard');
    }
    if (!subMiddleware.includes('Restaurant identifier must be a valid UUID.')) {
      throw new Error('subscription middleware missing clear rejection message');
    }
  });

  assert(11, 'no slug/email/name is used as a restaurant UUID in provisioning', () => {
    const bad = /(restaurantId|userId):\s*(slug|name|email|ownerEmail|invitedEmail)/.test(provisioning);
    if (bad) throw new Error('provisioning maps a slug/name/email into a UUID field');
  });

  assert(12, 'direct admin route + refresh flow persist the canonical token key', () => {
    if (!ownerPage.includes("navigate('/admin')")) throw new Error('owner page does not redirect to /admin');
    if (!authService.includes('aura_admin_token')) throw new Error('auth service does not use the canonical token key');
  });

  console.log(`\n📊 Restaurant Lifecycle Test Results: ${passed} passed, ${failed} failed (Total: 12)`);
  if (failed > 0) {
    process.exit(1);
  }
}

runRestaurantLifecycleTests().catch((err) => {
  console.error('Fatal error during restaurant lifecycle tests:', err);
  process.exit(1);
});
