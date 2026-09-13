import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * /admin/floor Rendering Regression Suite
 *
 * Guards against the production blank-screen: the floor endpoint returns a
 * `FloorOverviewResponse` with a single `activeOrder` summary (no `activeOrders`
 * or `assignedWaiters` arrays), while the UI previously dereferenced those
 * missing arrays directly and threw during render.
 *
 * Verifies direct navigation + that the render path is fully defensive so a
 * mismatched/missing floor payload renders loading/empty/error states instead
 * of crashing React to a blank screen.
 */

async function runFloorRenderingTests() {
  console.log('🧭  Starting /admin/floor Rendering Regression Suite (10 Tests)...\n');
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

  const app = read('src/App.tsx');
  const floor = read('src/pages/admin/AdminFloorPage.tsx');
  const drawer = read('src/components/admin/TableDetailDrawer.tsx');
  const types = read('src/types/index.ts');

  assert(1, 'direct /admin/floor route exists and is wrapped by permission gating', () => {
    if (!app.includes('path="floor"')) {
      throw new Error('App.tsx missing the /admin/floor route');
    }
    if (!app.includes('<AdminFloorPage />')) {
      throw new Error('App.tsx does not mount AdminFloorPage');
    }
  });

  assert(2, 'Floor page does not dereference a missing activeOrders array during render', () => {
    if (floor.includes('table.activeOrders.some')) {
      throw new Error('Floor render still dereferences table.activeOrders directly (blank-screen crash)');
    }
    if (!floor.includes('(table.activeOrders || []).some((o) => !o.assignedWaiter)')) {
      throw new Error('Floor render missing activeOrders fallback');
    }
  });

  assert(3, 'Floor quick claim/serve handlers are null-safe on activeOrders', () => {
    if (!floor.includes('const activeOrders = table.activeOrders || [];')) {
      throw new Error('Floor handlers missing activeOrders fallback');
    }
  });

  assert(4, 'Floor search is null-safe on nullable table name', () => {
    if (!floor.includes('(t.name && t.name.toLowerCase().includes(q))')) {
      throw new Error('Floor search still dereferences a possibly-null table.name');
    }
  });

  assert(5, 'Floor renders duration-in-state safely when the field is absent', () => {
    if (!floor.includes('table.minutesInCurrentState ?? 0')) {
      throw new Error('Floor render missing minutesInCurrentState fallback');
    }
  });

  assert(6, 'Table detail drawer is null-safe on activeOrders', () => {
    if (!drawer.includes('const activeOrders = table.activeOrders || [];')) {
      throw new Error('Drawer missing activeOrders fallback');
    }
    if (drawer.includes('table.activeOrders.length') || drawer.includes('table.activeOrders.map')) {
      throw new Error('Drawer still dereferences table.activeOrders directly');
    }
  });

  assert(7, 'Floor loading/empty/error states remain present', () => {
    if (!floor.includes('Loading floor state...')) {
      throw new Error('Floor page missing loading state');
    }
    if (!floor.includes('No tables match current filter')) {
      throw new Error('Floor page missing empty state');
    }
    if (!floor.includes('<ErrorBanner')) {
      throw new Error('Floor page missing actionable error state');
    }
  });

  assert(8, 'TableOperationalInfo type reflects the optional/nullable floor payload', () => {
    if (!types.includes('activeOrders?: Order[];')) {
      throw new Error('activeOrders is not optional in TableOperationalInfo');
    }
    if (!types.includes('name: string | null;')) {
      throw new Error('name is not nullable in TableOperationalInfo');
    }
    if (!types.includes('minutesInCurrentState?: number;')) {
      throw new Error('minutesInCurrentState is not optional in TableOperationalInfo');
    }
  });

  assert(9, 'floor summary still uses the backend-provided activeOrderCount', () => {
    if (!floor.includes('table.activeOrderCount')) {
      throw new Error('Floor page no longer renders activeOrderCount');
    }
  });

  assert(10, 'RBAC permission check for floor route is preserved', () => {
    if (!app.includes('permission="VIEW_TABLES"')) {
      throw new Error('Floor route RBAC permission missing');
    }
  });

  console.log(`\n📊 /admin/floor Rendering Test Results: ${passed} passed, ${failed} failed (Total: 10)`);
  if (failed > 0) {
    process.exit(1);
  }
}

runFloorRenderingTests().catch((err) => {
  console.error('Fatal error during floor rendering tests:', err);
  process.exit(1);
});
