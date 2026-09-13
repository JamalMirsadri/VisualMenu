import request from 'supertest';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import './setup';
import { createRestaurantWithSubscription } from './helpers';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { Role } from '@prisma/client';

async function runTenantIsolationTests() {
  console.log('🔒 Starting Tenant Isolation & Responsive Admin UX Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function assert(desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${desc}:`, err.message || err);
      failed++;
    }
  }

  const timestamp = Date.now();
  let ownerAToken = '';
  let ownerBToken = '';
  let staffAToken = '';
  let restaurantA: any = null;
  let restaurantB: any = null;
  let userOwnerA: any = null;
  let userOwnerB: any = null;
  let userStaffA: any = null;
  let platformAdminToken = '';

  try {
    // -------------------------------------------------------------------------
    // 1. SETUP TWO ISOLATED RESTAURANTS WITH OWNERS & STAFF
    // -------------------------------------------------------------------------
    await assert('1. Setup Restaurant Alpha and Restaurant Beta with distinct owners', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);

      // Create Restaurant Alpha
      restaurantA = await createRestaurantWithSubscription({
        data: {
          name: `Alpha Dining ${timestamp}`,
          slug: `alpha-${timestamp}`,
          active: true,
          currency: 'EUR',
          defaultLanguage: 'en',
        },
      });

      // Create Restaurant Beta
      restaurantB = await createRestaurantWithSubscription({
        data: {
          name: `Beta Bistro ${timestamp}`,
          slug: `beta-${timestamp}`,
          active: true,
          currency: 'USD',
          defaultLanguage: 'en',
        },
      });

      // Create Owner A
      userOwnerA = await prisma.user.create({
        data: {
          email: `owner-alpha-${timestamp}@auraisolation.com`,
          name: 'Alice Alpha',
          passwordHash,
          active: true,
        },
      });
      await prisma.userRestaurant.create({
        data: {
          userId: userOwnerA.id,
          restaurantId: restaurantA.id,
          role: Role.OWNER,
        },
      });

      // Create Owner B
      userOwnerB = await prisma.user.create({
        data: {
          email: `owner-beta-${timestamp}@auraisolation.com`,
          name: 'Bob Beta',
          passwordHash,
          active: true,
        },
      });
      await prisma.userRestaurant.create({
        data: {
          userId: userOwnerB.id,
          restaurantId: restaurantB.id,
          role: Role.OWNER,
        },
      });

      // Create Staff A (under Restaurant Alpha)
      userStaffA = await prisma.user.create({
        data: {
          email: `staff-alpha-${timestamp}@auraisolation.com`,
          name: 'Sam Staff',
          passwordHash,
          active: true,
        },
      });
      await prisma.userRestaurant.create({
        data: {
          userId: userStaffA.id,
          restaurantId: restaurantA.id,
          role: Role.STAFF,
        },
      });

      // Log in Owner A
      const loginA = await request(app).post('/api/auth/login').send({
        email: userOwnerA.email,
        password: 'Password123!',
      });
      if (loginA.status !== 200) throw new Error(`Owner A login failed: ${loginA.status}`);
      ownerAToken = loginA.body.data.token;

      // Log in Owner B
      const loginB = await request(app).post('/api/auth/login').send({
        email: userOwnerB.email,
        password: 'Password123!',
      });
      if (loginB.status !== 200) throw new Error(`Owner B login failed: ${loginB.status}`);
      ownerBToken = loginB.body.data.token;

      // Log in Staff A
      const loginStaffA = await request(app).post('/api/auth/login').send({
        email: userStaffA.email,
        password: 'Password123!',
      });
      if (loginStaffA.status !== 200) throw new Error(`Staff A login failed: ${loginStaffA.status}`);
      staffAToken = loginStaffA.body.data.token;

      // Log in Platform Admin
      const loginPA = await request(app).post('/api/auth/login').send({
        email: 'platformadmin@auramenu.com',
        password: 'Password123!',
      });
      if (loginPA.status !== 200) throw new Error(`Platform Admin login failed: ${loginPA.status}`);
      platformAdminToken = loginPA.body.data.token;
    });

    // -------------------------------------------------------------------------
    // 2. TENANT ISOLATION: RESTAURANT USERS CANNOT ACCESS PLATFORM APIS
    // -------------------------------------------------------------------------
    await assert('2. Restaurant Owner cannot access /api/platform/metrics (403 PLATFORM_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .get('/api/platform/metrics')
        .set('Authorization', `Bearer ${ownerAToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'PLATFORM_ACCESS_DENIED') throw new Error(`Expected PLATFORM_ACCESS_DENIED, got ${code}`);
    });

    await assert('3. Restaurant Owner cannot access /api/platform/restaurants (403 PLATFORM_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .get('/api/platform/restaurants')
        .set('Authorization', `Bearer ${ownerAToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'PLATFORM_ACCESS_DENIED') throw new Error(`Expected PLATFORM_ACCESS_DENIED, got ${code}`);
    });

    await assert('4. Restaurant Staff cannot access /api/platform/users (403 PLATFORM_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .get('/api/platform/users')
        .set('Authorization', `Bearer ${staffAToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'PLATFORM_ACCESS_DENIED') throw new Error(`Expected PLATFORM_ACCESS_DENIED, got ${code}`);
    });

    await assert('5. Restaurant Owner cannot access /api/platform/audit (403 PLATFORM_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .get('/api/platform/audit')
        .set('Authorization', `Bearer ${ownerBToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'PLATFORM_ACCESS_DENIED') throw new Error(`Expected PLATFORM_ACCESS_DENIED, got ${code}`);
    });

    // -------------------------------------------------------------------------
    // 3. RESTAURANT CREATION RESTRICTION
    // -------------------------------------------------------------------------
    await assert('6. Restaurant Owner attempting to create a restaurant via POST /api/restaurants is rejected (403 PLATFORM_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Hacked Restaurant',
          slug: `hacked-${Date.now()}`,
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'PLATFORM_ACCESS_DENIED') throw new Error(`Expected PLATFORM_ACCESS_DENIED, got ${code}`);
    });

    await assert('7. Restaurant Staff attempting to create a restaurant via POST /api/restaurants is rejected (403 PLATFORM_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${staffAToken}`)
        .send({
          name: 'Staff Restaurant',
          slug: `staff-created-${Date.now()}`,
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'PLATFORM_ACCESS_DENIED') throw new Error(`Expected PLATFORM_ACCESS_DENIED, got ${code}`);
    });

    await assert('8. Platform Admin can create restaurant via POST /api/restaurants or /api/platform/restaurants', async () => {
      const pSlug = `plat-created-${Date.now()}`;
      const res = await request(app)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Platform Operator Diner',
          slug: pSlug,
          currency: 'USD',
        });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data.slug !== pSlug) throw new Error(`Slug mismatch: ${res.body.data.slug}`);

      // Clean up test restaurant
      await prisma.restaurant.delete({ where: { slug: pSlug } }).catch(() => {});
    });

    // -------------------------------------------------------------------------
    // 4. RESTAURANT DIRECTORY LISTING ISOLATION
    // -------------------------------------------------------------------------
    await assert('9. Restaurant Owner calling GET /api/restaurants only receives their own assigned restaurant, never other tenants', async () => {
      const res = await request(app)
        .get('/api/restaurants')
        .set('Authorization', `Bearer ${ownerAToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const list = res.body.data;
      if (!Array.isArray(list)) throw new Error('Expected data array');
      if (list.length === 0) throw new Error('Owner A should have their assigned restaurant');

      const containsA = list.some((r: any) => r.id === restaurantA.id);
      const containsB = list.some((r: any) => r.id === restaurantB.id);

      if (!containsA) throw new Error('Owner A cannot see Restaurant A');
      if (containsB) throw new Error('Tenant isolation breach: Owner A received Restaurant B!');
    });

    await assert('10. Restaurant Staff calling GET /api/restaurants only receives their own assigned restaurant', async () => {
      const res = await request(app)
        .get('/api/restaurants')
        .set('Authorization', `Bearer ${staffAToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const list = res.body.data;
      const containsB = list.some((r: any) => r.id === restaurantB.id);
      if (containsB) throw new Error('Tenant isolation breach: Staff A received Restaurant B!');
    });

    // -------------------------------------------------------------------------
    // 5. CROSS-TENANT DATA ACCESS RETURNS 403
    // -------------------------------------------------------------------------
    await assert('11. Owner A accessing Restaurant B foods (/api/restaurants/:bId/foods) is rejected (403 RESTAURANT_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantB.id}/foods`)
        .set('Authorization', `Bearer ${ownerAToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'RESTAURANT_ACCESS_DENIED') throw new Error(`Expected RESTAURANT_ACCESS_DENIED, got ${code}`);
    });

    await assert('12. Owner A creating table in Restaurant B (/api/restaurants/:bId/tables) is rejected (403 RESTAURANT_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantB.id}/tables`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          number: '99',
          capacity: 4,
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'RESTAURANT_ACCESS_DENIED') throw new Error(`Expected RESTAURANT_ACCESS_DENIED, got ${code}`);
    });

    await assert('13. Owner A accessing Restaurant B staff directory is rejected (403 RESTAURANT_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantB.id}/staff`)
        .set('Authorization', `Bearer ${ownerAToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'RESTAURANT_ACCESS_DENIED') throw new Error(`Expected RESTAURANT_ACCESS_DENIED, got ${code}`);
    });

    await assert('14. Owner A updating Restaurant B settings (PUT /api/restaurants/:bId) is rejected (403 RESTAURANT_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${restaurantB.id}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ name: 'Tampered by Owner A' });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'RESTAURANT_ACCESS_DENIED') throw new Error(`Expected RESTAURANT_ACCESS_DENIED, got ${code}`);
    });

    // -------------------------------------------------------------------------
    // 6. ADMIN SIDEBAR STRUCTURE, INDEPENDENT SCROLL & ACCESSIBILITY
    // -------------------------------------------------------------------------
    await assert('15. AdminSidebar component file enforces independent scroll container and removes All Restaurants', async () => {
      const sidebarFilePath = path.resolve(process.cwd(), 'src/components/admin/AdminSidebar.tsx');
      const content = fs.readFileSync(sidebarFilePath, 'utf-8');

      // 1. Independent scroll container verification
      if (!content.includes('overflow-y-auto')) {
        throw new Error('AdminSidebar missing independent overflow-y-auto navigation container');
      }
      if (!content.includes('flex-1 min-h-0')) {
        throw new Error('AdminSidebar navigation container must be flex-1 min-h-0 to allow independent scrolling');
      }

      // 2. Removal of All Restaurants navigation item
      if (content.includes("label: 'All Restaurants'")) {
        throw new Error('AdminSidebar must NOT contain "All Restaurants" navigation item');
      }
      if (content.includes("to: '/admin/restaurants'")) {
        throw new Error('AdminSidebar must NOT route to /admin/restaurants');
      }

      // 3. Removal of tenant switcher dropdown
      if (content.includes('Active Tenant') || content.includes('restaurants.map')) {
        throw new Error('AdminSidebar must NOT contain tenant switching select controls');
      }

      // 4. Presence of onNavigate callback for mobile drawer auto-dismissal
      if (!content.includes('onNavigate?: () => void')) {
        throw new Error('AdminSidebar must declare onNavigate callback prop');
      }

      // 5. Verification of key operational items
      const expectedItems = [
        'Dashboard',
        'Floor Operations',
        'Live Orders',
        'Kitchen KDS',
        'Payments',
        'Cash Register',
        'Customers & NIF',
        'Dining Tables',
        'Categories',
        'Food Items',
        'Media Library',
        'Menu Preview',
        'QR Codes',
        'Staff & Roles',
        'Restaurant Settings',
      ];
      for (const item of expectedItems) {
        if (!content.includes(`label: '${item}'`)) {
          throw new Error(`AdminSidebar missing essential operational item: ${item}`);
        }
      }
    });

    await assert('16. AdminLayout component file enforces responsive drawer (< 1024px) and persistent desktop sidebar (>= 1024px)', async () => {
      const layoutFilePath = path.resolve(process.cwd(), 'src/components/admin/AdminLayout.tsx');
      const content = fs.readFileSync(layoutFilePath, 'utf-8');

      // 1. Persistent desktop sidebar at lg breakpoint
      if (!content.includes('hidden lg:flex')) {
        throw new Error('AdminLayout must use hidden lg:flex for desktop sidebar');
      }

      // 2. Responsive drawer toggle button at lg:hidden
      if (!content.includes('lg:hidden')) {
        throw new Error('AdminLayout must show drawer toggle button on < lg');
      }

      // 3. Main content area overflow protection
      if (!content.includes('overflow-x-hidden')) {
        throw new Error('AdminLayout main container must have overflow-x-hidden to prevent horizontal viewport scroll');
      }

      // 4. Platform Context banner retained
      if (!content.includes('PLATFORM CONTEXT') || !content.includes('Back to Platform')) {
        throw new Error('AdminLayout must preserve the amber PLATFORM CONTEXT banner and Back to Platform action');
      }
    });

    await assert('17. App.tsx routes redirect /admin/restaurants to /admin/restaurant', async () => {
      const appFilePath = path.resolve(process.cwd(), 'src/App.tsx');
      const content = fs.readFileSync(appFilePath, 'utf-8');

      if (!content.includes('path="restaurants" element={<Navigate to="/admin/restaurant" replace />}')) {
        throw new Error('App.tsx must redirect /admin/restaurants to /admin/restaurant');
      }
    });

    // -------------------------------------------------------------------------
    // 7. CLEANUP TEST ENTITIES
    // -------------------------------------------------------------------------
    if (restaurantA) await prisma.restaurant.delete({ where: { id: restaurantA.id } }).catch(() => {});
    if (restaurantB) await prisma.restaurant.delete({ where: { id: restaurantB.id } }).catch(() => {});
    if (userOwnerA) await prisma.user.delete({ where: { id: userOwnerA.id } }).catch(() => {});
    if (userOwnerB) await prisma.user.delete({ where: { id: userOwnerB.id } }).catch(() => {});
    if (userStaffA) await prisma.user.delete({ where: { id: userStaffA.id } }).catch(() => {});

  } catch (err: any) {
    console.error('Fatal test suite error:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Tenant Isolation Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTenantIsolationTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
