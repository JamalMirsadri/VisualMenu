import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Admin Loading-State Regression Suite
 *
 * Guards against perpetual spinners and silently-hidden backend errors across
 * Restaurant Admin. Verifies that every async view surfaces a real error with a
 * Retry action instead of collapsing a failed request into an empty/loading state.
 */

async function runAdminLoadingStateTests() {
  console.log('🛡️  Starting Admin Loading-State Regression Suite (12 Tests)...\n');
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

  const errorBanner = read('src/components/admin/ErrorBanner.tsx');
  const useAdminData = read('src/hooks/useAdminData.ts');
  const dashboard = read('src/pages/admin/AdminDashboard.tsx');
  const floor = read('src/pages/admin/AdminFloorPage.tsx');
  const categories = read('src/pages/admin/AdminCategoriesPage.tsx');
  const qr = read('src/pages/admin/AdminQrPage.tsx');
  const menuPreview = read('src/pages/admin/AdminMenuPreviewPage.tsx');
  const kitchen = read('src/pages/admin/AdminKitchenPage.tsx');
  const orders = read('src/pages/admin/AdminOrdersPage.tsx');

  assert(1, 'shared ErrorBanner exists with a Retry action', () => {
    if (!errorBanner.includes('export const ErrorBanner')) {
      throw new Error('ErrorBanner component missing');
    }
    if (!errorBanner.includes('onRetry') || !errorBanner.includes('Retry')) {
      throw new Error('ErrorBanner missing Retry action');
    }
  });

  assert(2, 'useAdminData surfaces sub-resource failures instead of silently hiding them', () => {
    if (!useAdminData.includes('failedLabels')) {
      throw new Error('useAdminData does not track failed sub-resources');
    }
    if (!useAdminData.includes("Couldn't load")) {
      throw new Error('useAdminData does not surface a partial-load error message');
    }
  });

  assert(3, 'Dashboard surfaces restaurant and metrics errors with retry', () => {
    if (!dashboard.includes('metricsError')) {
      throw new Error('Dashboard does not track metrics errors');
    }
    if (!dashboard.includes('<ErrorBanner') || !dashboard.includes('fetchMetrics')) {
      throw new Error('Dashboard does not render error banner with retry');
    }
  });

  assert(4, 'Floor page surfaces an error with retry wired to fetchFloor', () => {
    if (!floor.includes('<ErrorBanner message={error} onRetry={() => fetchFloor()}')) {
      throw new Error('Floor page missing error banner with fetchFloor retry');
    }
  });

  assert(5, 'Categories page surfaces partial-load error with retry', () => {
    if (!categories.includes('<ErrorBanner message={error} onRetry={refresh}')) {
      throw new Error('Categories page missing error banner with retry');
    }
  });

  assert(6, 'QR page tracks and surfaces its own QR load error with retry', () => {
    if (!qr.includes('qrError')) {
      throw new Error('QR page does not track QR load errors');
    }
    if (!qr.includes('<ErrorBanner message={qrError} onRetry={loadQrs}')) {
      throw new Error('QR page missing QR error banner with retry');
    }
  });

  assert(7, 'Menu Preview surfaces partial-load error with retry', () => {
    if (!menuPreview.includes('<ErrorBanner message={error} onRetry={refresh}')) {
      throw new Error('Menu Preview missing error banner with retry');
    }
  });

  assert(8, 'Kitchen page tracks error and exposes retry', () => {
    if (!kitchen.includes('const [error, setError]')) {
      throw new Error('Kitchen page does not track load errors');
    }
    if (!kitchen.includes('<ErrorBanner message={error} onRetry={fetchKitchenOrders}')) {
      throw new Error('Kitchen page missing error banner with retry');
    }
  });

  assert(9, 'Kitchen page has an explicit initial loading state', () => {
    if (!kitchen.includes('Loading kitchen tickets...')) {
      throw new Error('Kitchen page missing loading state');
    }
  });

  assert(10, 'Orders page surfaces an error with retry wired to fetchOrders', () => {
    if (!orders.includes('<ErrorBanner message={error} onRetry={fetchOrders}')) {
      throw new Error('Orders page missing error banner with retry');
    }
  });

  assert(11, 'Floor/Kitchen/Orders never leave a spinner when no restaurant id (early-return guards)', () => {
    if (!floor.includes('if (!silent) setLoading(false);')) {
      throw new Error('Floor page fetchFloor early-return does not clear loading');
    }
    if (!kitchen.includes('setLoading(false);\n      return;')) {
      throw new Error('Kitchen page fetchKitchenOrders early-return does not clear loading');
    }
    if (!orders.includes('setLoading(false);\n      return;')) {
      throw new Error('Orders page fetchOrders early-return does not clear loading');
    }
  });

  assert(12, 'Foods and Restaurant pages also reuse the shared error banner', () => {
    const foods = read('src/pages/admin/AdminFoodsPage.tsx');
    const restaurant = read('src/pages/admin/AdminRestaurantPage.tsx');
    if (!foods.includes('<ErrorBanner message={error} onRetry={refresh}')) {
      throw new Error('Foods page missing error banner');
    }
    if (!restaurant.includes('<ErrorBanner message={error} onRetry={refresh}')) {
      throw new Error('Restaurant page missing error banner');
    }
  });

  console.log(`\n📊 Admin Loading-State Test Results: ${passed} passed, ${failed} failed (Total: 12)`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAdminLoadingStateTests().catch((err) => {
  console.error('Fatal error during admin loading-state tests:', err);
  process.exit(1);
});
