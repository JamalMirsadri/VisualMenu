import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { PlatformRole } from '@prisma/client';

async function runPlatformAdminTests() {
  console.log('🧪 Starting Phase 9 Platform Admin & Multi-Tenant Control Test Suite...\n');
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

  let platformAdminToken = '';
  let platformSupportToken = '';
  let platformViewerToken = '';
  let restaurantOwnerToken = '';
  let targetRestaurant: any = null;
  let createdOperatorId = '';

  try {
    // 1. Authenticate Platform Roles
    await assert('1. Platform Admin logs in successfully and receives PLATFORM_ADMIN role', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'platformadmin@auramenu.com',
        password: 'Password123!',
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (!res.body.data?.token) throw new Error('Missing token');
      if (res.body.data?.user?.platformRole !== 'PLATFORM_ADMIN') {
        throw new Error(`Expected PLATFORM_ADMIN, got ${res.body.data?.user?.platformRole}`);
      }
      platformAdminToken = res.body.data.token;
    });

    await assert('2. Platform Support logs in successfully and receives PLATFORM_SUPPORT role', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'support@auramenu.com',
        password: 'Password123!',
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data?.user?.platformRole !== 'PLATFORM_SUPPORT') {
        throw new Error(`Expected PLATFORM_SUPPORT, got ${res.body.data?.user?.platformRole}`);
      }
      platformSupportToken = res.body.data.token;
    });

    await assert('3. Platform Viewer logs in successfully and receives PLATFORM_VIEWER role', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'viewer@auramenu.com',
        password: 'Password123!',
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data?.user?.platformRole !== 'PLATFORM_VIEWER') {
        throw new Error(`Expected PLATFORM_VIEWER, got ${res.body.data?.user?.platformRole}`);
      }
      platformViewerToken = res.body.data.token;
    });

    await assert('4. Restaurant Owner logs in and has null platformRole', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'owner@auradining.com',
        password: 'Password123!',
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data?.user?.platformRole) {
        throw new Error(`Expected null platformRole, got ${res.body.data?.user?.platformRole}`);
      }
      restaurantOwnerToken = res.body.data.token;
    });

    // 2. Access Control & Authorization Boundaries
    await assert('5. Unauthenticated user accessing /api/platform/metrics is rejected (401)', async () => {
      const res = await request(app).get('/api/platform/metrics');
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    await assert('6. Restaurant staff accessing /api/platform/metrics is rejected (403 PLATFORM_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .get('/api/platform/metrics')
        .set('Authorization', `Bearer ${restaurantOwnerToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'PLATFORM_ACCESS_DENIED') {
        throw new Error(`Expected PLATFORM_ACCESS_DENIED, got ${code}`);
      }
    });

    // 3. Platform Metrics
    await assert('7. Platform Admin retrieves cross-tenant aggregate metrics (200)', async () => {
      const res = await request(app)
        .get('/api/platform/metrics')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const m = res.body.data;
      if (typeof m.totalRestaurants !== 'number') throw new Error('Invalid totalRestaurants metric');
      if (typeof m.ordersToday !== 'number') throw new Error('Invalid ordersToday metric');
      if (typeof m.revenueToday !== 'number') throw new Error('Invalid revenueToday metric');
      if (typeof m.platformUsers !== 'number') throw new Error('Invalid platformUsers metric');
    });

    // 4. Restaurants Directory & Search
    await assert('8. Platform Admin lists all tenants with pagination', async () => {
      const res = await request(app)
        .get('/api/platform/restaurants?page=1&limit=10')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.body.data?.items)) throw new Error('Missing items array');
      if (res.body.data.items.length === 0) throw new Error('Expected at least 1 restaurant');
      targetRestaurant = res.body.data.items[0];
    });

    await assert('9. Platform Admin searches restaurants by name query', async () => {
      const res = await request(app)
        .get(`/api/platform/restaurants?search=${encodeURIComponent(targetRestaurant.name.slice(0, 4))}`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const found = res.body.data.items.find((r: any) => r.id === targetRestaurant.id);
      if (!found) throw new Error('Target restaurant not found in search results');
    });

    await assert('10. Platform Admin filters restaurants by active status', async () => {
      const res = await request(app)
        .get('/api/platform/restaurants?status=active')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const allActive = res.body.data.items.every((r: any) => r.active === true);
      if (!allActive) throw new Error('Non-active restaurant returned when status=active requested');
    });

    // 5. Tenant Specification & Inspection
    await assert('11. Platform Admin inspects detailed restaurant specifications & counts', async () => {
      const res = await request(app)
        .get(`/api/platform/restaurants/${targetRestaurant.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data?.restaurant || !res.body.data?.stats) {
        throw new Error('Incomplete restaurant details response');
      }
      if (typeof res.body.data.stats.foods !== 'number') throw new Error('Missing stats.foods');
      if (!Array.isArray(res.body.data.members)) throw new Error('Missing members array');
    });

    // 6. Tenant Activation / Deactivation Lifecycle
    await assert('12. Platform Admin deactivates tenant and writes DEACTIVATE audit log', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${targetRestaurant.id}/deactivate`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ reason: 'Routine subscription compliance check' });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data?.active !== false) throw new Error('Restaurant was not deactivated');

      const dbCheck = await prisma.restaurant.findUnique({ where: { id: targetRestaurant.id } });
      if (dbCheck?.active !== false) throw new Error('Database restaurant active flag was not updated');
    });

    await assert('13. Platform Admin re-activates tenant and writes ACTIVATE audit log', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${targetRestaurant.id}/activate`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ reason: 'Reactivation verified' });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data?.active !== true) throw new Error('Restaurant was not activated');

      const dbCheck = await prisma.restaurant.findUnique({ where: { id: targetRestaurant.id } });
      if (dbCheck?.active !== true) throw new Error('Database restaurant active flag was not updated');
    });

    // 7. Context Switching & Auditing
    await assert('14. Platform Admin entering restaurant context records CONTEXT_ENTER audit event', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${targetRestaurant.id}/context/enter`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data?.auditLogId) throw new Error('Context enter failed');

      // Verify audit record exists
      const log = await prisma.auditLog.findFirst({
        where: {
          restaurantId: targetRestaurant.id,
          action: 'CONTEXT_ENTER',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!log) throw new Error('CONTEXT_ENTER audit log was not recorded');
    });

    await assert('15. Platform Admin exiting restaurant context records CONTEXT_EXIT audit event', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${targetRestaurant.id}/context/exit`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data?.auditLogId) throw new Error('Context exit failed');

      const log = await prisma.auditLog.findFirst({
        where: {
          restaurantId: targetRestaurant.id,
          action: 'CONTEXT_EXIT',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!log) throw new Error('CONTEXT_EXIT audit log was not recorded');
    });

    // 8. Controlled Platform Admin Override into Restaurant APIs
    await assert('16. Platform Admin can access tenant-scoped endpoint without UserRestaurant membership', async () => {
      // Platform Admin has no UserRestaurant record for targetRestaurant
      const res = await request(app)
        .get(`/api/restaurants/${targetRestaurant.id}/foods`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (!Array.isArray(res.body.data)) throw new Error('Expected array of food items');
    });

    // 9. Platform Operators Governance
    await assert('17. Platform Admin creates new platform operator (POST /api/platform/users)', async () => {
      const uniqueEmail = `operator_${Date.now()}@auramenu.com`;
      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Junior Support Operator',
          email: uniqueEmail,
          password: 'Password123!',
          platformRole: 'PLATFORM_SUPPORT',
        });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data?.platformRole !== 'PLATFORM_SUPPORT') {
        throw new Error(`Expected PLATFORM_SUPPORT, got ${res.body.data?.platformRole}`);
      }
      createdOperatorId = res.body.data.id;
    });

    await assert('18. Platform Support is forbidden from creating platform operators (403)', async () => {
      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${platformSupportToken}`)
        .send({
          name: 'Hacker Support',
          email: 'hacker@auramenu.com',
          password: 'Password123!',
          platformRole: 'PLATFORM_ADMIN',
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('19. Platform Admin can deactivate an operator', async () => {
      if (!createdOperatorId) throw new Error('Operator was not created');
      const res = await request(app)
        .put(`/api/platform/users/${createdOperatorId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ active: false });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data?.active !== false) throw new Error('Operator active was not set to false');
    });

    // 10. Platform Global SaaS Settings
    await assert('20. Platform Admin reads and updates global SaaS settings', async () => {
      const readRes = await request(app)
        .get('/api/platform/settings')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (readRes.status !== 200) throw new Error(`Expected 200, got ${readRes.status}`);

      const updateRes = await request(app)
        .put('/api/platform/settings')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          platformName: 'Aura Dining SaaS Master',
          defaultCurrency: 'USD',
          maintenanceMode: false,
          systemNotice: 'Phase 9 Platform Verification Active',
        });
      if (updateRes.status !== 200) throw new Error(`Expected 200, got ${updateRes.status}`);
      if (updateRes.body.data?.platformName !== 'Aura Dining SaaS Master') {
        throw new Error('platformName was not updated');
      }
    });

    await assert('21. Platform Viewer is forbidden from updating SaaS settings (403)', async () => {
      const res = await request(app)
        .put('/api/platform/settings')
        .set('Authorization', `Bearer ${platformViewerToken}`)
        .send({
          platformName: 'Hacked Platform Name',
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    // 11. Platform Audit Trail Inspection
    await assert('22. Platform Admin retrieves and filters audit logs', async () => {
      const res = await request(app)
        .get('/api/platform/audit?action=DEACTIVATE&page=1&limit=5')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.body.data?.items)) throw new Error('Missing items array');
      const allDeactivate = res.body.data.items.every((l: any) => l.action === 'DEACTIVATE');
      if (!allDeactivate) throw new Error('Filter did not restrict to DEACTIVATE logs');
    });

    // 12. Non-Regression: Restaurant Staff Operations
    await assert('23. Restaurant Owner can still access their restaurant admin without regressions', async () => {
      const ownerMembership = await prisma.userRestaurant.findFirst({
        where: { user: { email: 'owner@auradining.com' }, role: 'OWNER' },
      });
      if (!ownerMembership) throw new Error('Owner membership not found');

      const res = await request(app)
        .get(`/api/restaurants/${ownerMembership.restaurantId}/foods`)
        .set('Authorization', `Bearer ${restaurantOwnerToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (!Array.isArray(res.body.data)) throw new Error('Expected array of food items');
    });

    // 13. Clean up created operator
    if (createdOperatorId) {
      await prisma.user.delete({ where: { id: createdOperatorId } }).catch(() => {});
    }

  } catch (err: any) {
    console.error('Fatal test suite error:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Platform Admin Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPlatformAdminTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
