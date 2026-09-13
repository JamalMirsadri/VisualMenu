import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Restaurant Bootstrap Regression Suite
 *
 * Verifies the complete bootstrap flow used by every admin page:
 *   auth token -> current user -> UserRestaurant membership -> active restaurant
 *   -> restaurant context -> page APIs
 *
 * Regression coverage requested:
 *   login -> restaurant load -> refresh -> direct admin route
 *
 * The suite combines static source verification (the single source of truth)
 * with a mirrored deterministic-resolver state machine that encodes the exact
 * resolution rules the source must implement.
 */

interface Assignment {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';
  status?: 'ACTIVE' | 'DISABLED';
  permissions?: string[];
}

/**
 * Mirrors resolveActiveRestaurant() in src/context/AuthContext.tsx.
 * Prefer the last-selected slug (if still ACTIVE), then the first ACTIVE
 * membership. Returns null when no usable membership exists.
 */
function resolveActiveRestaurant(
  restaurants: Assignment[],
  savedSlug?: string | null
): Assignment | null {
  const activeMemberships = restaurants.filter((r) => r.status !== 'DISABLED');
  if (savedSlug) {
    const matched = activeMemberships.find((r) => r.slug === savedSlug);
    if (matched) return matched;
  }
  return activeMemberships[0] || null;
}

async function runRestaurantBootstrapTests() {
  console.log('🏛️  Starting Restaurant Bootstrap Regression Suite (14 Tests)...\n');
  let passed = 0;
  let failed = 0;

  function assert(num: number, desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ [Test ${num}/14] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${num}/14] ${desc}:`, err.message || err);
      failed++;
    }
  }

  const rootDir = path.resolve(__dirname, '../../');
  const authContext = fs.readFileSync(path.join(rootDir, 'src/context/AuthContext.tsx'), 'utf-8');
  const protectedRoute = fs.readFileSync(path.join(rootDir, 'src/components/admin/ProtectedRoute.tsx'), 'utf-8');
  const useAdminData = fs.readFileSync(path.join(rootDir, 'src/hooks/useAdminData.ts'), 'utf-8');
  const dataGate = fs.readFileSync(path.join(rootDir, 'src/components/admin/RestaurantDataGate.tsx'), 'utf-8');
  const app = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf-8');

  // ---- Deterministic membership-based resolution (behavior) ----
  const restaurants: Assignment[] = [
    { id: 'r1', name: 'First', slug: 'first', role: 'OWNER', status: 'ACTIVE' },
    { id: 'r2', name: 'Second', slug: 'second', role: 'ADMIN', status: 'ACTIVE' },
  ];

  assert(1, 'resolution: returns first ACTIVE membership when no saved slug', () => {
    const res = resolveActiveRestaurant(restaurants, null);
    if (res?.slug !== 'first') throw new Error(`expected 'first', got ${res?.slug}`);
  });

  assert(2, 'resolution: prefers a still-ACTIVE saved slug over the first membership', () => {
    const res = resolveActiveRestaurant(restaurants, 'second');
    if (res?.slug !== 'second') throw new Error(`expected 'second', got ${res?.slug}`);
  });

  assert(3, 'resolution: ignores DISABLED memberships entirely', () => {
    const withDisabled: Assignment[] = [
      { id: 'd1', name: 'Disabled', slug: 'disabled', role: 'OWNER', status: 'DISABLED' },
      { id: 'a1', name: 'Active', slug: 'active', role: 'ADMIN', status: 'ACTIVE' },
    ];
    const res = resolveActiveRestaurant(withDisabled, null);
    if (res?.slug !== 'active') throw new Error(`expected 'active', got ${res?.slug}`);
  });

  assert(4, 'resolution: falls back to first ACTIVE when saved slug is DISABLED', () => {
    const withDisabled: Assignment[] = [
      { id: 'd1', name: 'Disabled', slug: 'disabled', role: 'OWNER', status: 'DISABLED' },
      { id: 'a1', name: 'Active', slug: 'active', role: 'ADMIN', status: 'ACTIVE' },
    ];
    const res = resolveActiveRestaurant(withDisabled, 'disabled');
    if (res?.slug !== 'active') throw new Error(`expected 'active', got ${res?.slug}`);
  });

  assert(5, 'resolution: returns null when no ACTIVE membership exists', () => {
    const onlyDisabled: Assignment[] = [
      { id: 'd1', name: 'Disabled', slug: 'disabled', role: 'OWNER', status: 'DISABLED' },
    ];
    const res = resolveActiveRestaurant(onlyDisabled, null);
    if (res !== null) throw new Error(`expected null, got ${res?.slug}`);
  });

  // ---- Static source invariants (single source of truth) ----
  assert(6, 'AuthContext: contains deterministic resolver filtering DISABLED', () => {
    if (!authContext.includes('function resolveActiveRestaurant')) {
      throw new Error('resolveActiveRestaurant helper missing');
    }
    if (!authContext.includes("r.status !== 'DISABLED'")) {
      throw new Error('resolver does not filter DISABLED memberships');
    }
  });

  assert(7, 'AuthContext: initAuth and refreshProfile resolve via the shared helper', () => {
    if (!authContext.includes('resolveActiveRestaurant(data.restaurants, savedSlug)')) {
      throw new Error('initAuth/refreshProfile not using resolveActiveRestaurant');
    }
  });

  assert(8, 'AuthContext: exposes subscriptionLoading in the interface and provider value', () => {
    if (!authContext.includes('subscriptionLoading: boolean;')) {
      throw new Error('subscriptionLoading missing from AuthContextType');
    }
    if (!authContext.includes('subscriptionLoading,\n        refreshSubscription')) {
      throw new Error('subscriptionLoading missing from provider value');
    }
  });

  assert(9, 'AuthContext: login sets subscriptionLoading true/false based on resolved restaurant', () => {
    if (!authContext.includes('setSubscriptionLoading(true)')) {
      throw new Error('login does not set subscriptionLoading true for an active restaurant');
    }
    if (!authContext.includes('setSubscriptionLoading(false)')) {
      throw new Error('login does not set subscriptionLoading false when no restaurant');
    }
  });

  assert(10, 'useAdminData: resolves the admin restaurant by UUID (no demo-restaurant mock fallback)', () => {
    if (!useAdminData.includes("activeRestaurant?.id || ''")) {
      throw new Error('useAdminData does not derive the restaurant UUID from activeRestaurant');
    }
    if (useAdminData.includes('demo-restaurant')) {
      throw new Error('useAdminData still contains demo-restaurant fallback');
    }
  });

  assert(11, 'RestaurantDataGate: renders error + retry instead of perpetual loading', () => {
    if (!dataGate.includes('if (loading)')) {
      throw new Error('RestaurantDataGate missing loading branch');
    }
    if (!dataGate.includes('if (!hasRestaurant)')) {
      throw new Error('RestaurantDataGate missing no-restaurant error branch');
    }
    if (!dataGate.includes('Retry')) {
      throw new Error('RestaurantDataGate missing Retry action');
    }
  });

  assert(12, 'ProtectedRoute: waits for subscriptionLoading before gating (no race)', () => {
    if (!protectedRoute.includes('subscriptionLoading')) {
      throw new Error('ProtectedRoute does not read subscriptionLoading');
    }
    if (!protectedRoute.includes('!isPlatformAdmin && !isPlatformUser && subscriptionLoading')) {
      throw new Error('ProtectedRoute does not gate on subscriptionLoading');
    }
  });

  assert(13, 'ProtectedRoute: subscription gating only applies when a restaurant membership exists', () => {
    if (!protectedRoute.includes('activeRestaurant && !isPlatformAdmin && !isPlatformUser && !allowExpired')) {
      throw new Error('ProtectedRoute does not scope subscription gating to activeRestaurant');
    }
  });

  assert(14, 'App: /admin/login is public and /admin is protected (refresh + direct URL)', () => {
    if (!app.includes('<Route path="/admin/login" element={<AdminLoginPage />} />')) {
      throw new Error('login route is not public');
    }
    if (!app.includes('<ProtectedRoute>') || !app.includes('<AdminLayout />')) {
      throw new Error('admin routes are not wrapped in ProtectedRoute');
    }
  });

  console.log(`\n📊 Restaurant Bootstrap Test Results: ${passed} passed, ${failed} failed (Total: 14)`);
  if (failed > 0) {
    process.exit(1);
  }
}

runRestaurantBootstrapTests().catch((err) => {
  console.error('Fatal error during restaurant bootstrap tests:', err);
  process.exit(1);
});
