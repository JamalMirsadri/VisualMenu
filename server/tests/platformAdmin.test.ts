import request from 'supertest';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { PlatformRole } from '@prisma/client';
import { normalizePaginatedResult, unwrapResponse } from '../../src/services/platformService';

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

    // 13. Platform Admin Contract & Shape Regressions (All 4 Pages)
    await assert('24. [Regression] Platform Dashboard consumes consistent metrics and paginated restaurants', async () => {
      // Metric shape verification
      const metricsRes = await request(app)
        .get('/api/platform/metrics')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (metricsRes.status !== 200) throw new Error(`Metrics HTTP ${metricsRes.status}`);
      const metrics = unwrapResponse<any>(metricsRes.body);
      if (!metrics || typeof metrics.totalRestaurants !== 'number') {
        throw new Error('Platform Dashboard metrics response mismatch or missing fields');
      }

      // Recent restaurants feed shape verification
      const restaurantsRes = await request(app)
        .get('/api/platform/restaurants?page=1&limit=5')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (restaurantsRes.status !== 200) throw new Error(`Restaurants HTTP ${restaurantsRes.status}`);
      const paginated = normalizePaginatedResult<any>(restaurantsRes.body);
      if (!Array.isArray(paginated.items)) {
        throw new Error('Platform Dashboard recent restaurants items must be an array');
      }
      if (paginated.items.length > 5) {
        throw new Error(`Expected limit 5, got ${paginated.items.length}`);
      }
      // Verify safe mapping without undefined error
      const mapped = paginated.items.map((r: any) => r.id);
      if (!Array.isArray(mapped)) throw new Error('Failed to map restaurant items');
    });

    await assert('25. [Regression] Tenants & Restaurants page handles populated and empty results defensively', async () => {
      // Populated list check
      const res = await request(app)
        .get('/api/platform/restaurants?page=1&limit=10')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const paginated = normalizePaginatedResult<any>(res.body);
      if (!Array.isArray(paginated.items) || paginated.items.length === 0) {
        throw new Error('Expected non-empty items array for active tenants');
      }

      // Empty search check
      const emptyRes = await request(app)
        .get('/api/platform/restaurants?search=definitely_nonexistent_tenant_query_xyz')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (emptyRes.status !== 200) throw new Error(`Empty search HTTP ${emptyRes.status}`);
      const emptyPaginated = normalizePaginatedResult<any>(emptyRes.body);
      if (!Array.isArray(emptyPaginated.items) || emptyPaginated.items.length !== 0) {
        throw new Error('Expected items to be an empty array []');
      }
      if (emptyPaginated.total !== 0) {
        throw new Error(`Expected total 0, got ${emptyPaginated.total}`);
      }
      // Defensive mapping test: must not throw
      const mapped = emptyPaginated.items.map((r: any) => r.name);
      if (mapped.length !== 0) throw new Error('Unexpected mapped length');
    });

    await assert('26. [Regression] Platform Operators page handles populated and empty results defensively', async () => {
      // Operators list check
      const res = await request(app)
        .get('/api/platform/users?page=1&limit=10')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const paginated = normalizePaginatedResult<any>(res.body);
      if (!Array.isArray(paginated.items) || paginated.items.length === 0) {
        throw new Error('Expected non-empty items array for platform operators');
      }

      // Empty search check
      const emptyRes = await request(app)
        .get('/api/platform/users?search=nonexistent_operator_xyz@auramenu.com')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (emptyRes.status !== 200) throw new Error(`Empty users search HTTP ${emptyRes.status}`);
      const emptyPaginated = normalizePaginatedResult<any>(emptyRes.body);
      if (!Array.isArray(emptyPaginated.items) || emptyPaginated.items.length !== 0) {
        throw new Error('Expected operators items to be empty array []');
      }
      // Defensive mapping test
      const roles = emptyPaginated.items.map((u: any) => u.platformRole);
      if (roles.length !== 0) throw new Error('Unexpected roles mapped length');
    });

    await assert('27. [Regression] Platform Audit Log page handles populated and empty results defensively', async () => {
      // Audit logs check
      const res = await request(app)
        .get('/api/platform/audit?page=1&limit=10')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const paginated = normalizePaginatedResult<any>(res.body);
      if (!Array.isArray(paginated.items)) {
        throw new Error('Expected items array for audit logs');
      }

      // Filter with 0 matches
      const emptyRes = await request(app)
        .get('/api/platform/audit?entityType=NonExistentEntityName99999')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (emptyRes.status !== 200) throw new Error(`Empty audit HTTP ${emptyRes.status}`);
      const emptyPaginated = normalizePaginatedResult<any>(emptyRes.body);
      if (!Array.isArray(emptyPaginated.items) || emptyPaginated.items.length !== 0) {
        throw new Error('Expected audit items to be empty array []');
      }
      // Defensive mapping test
      const actions = emptyPaginated.items.map((a: any) => a.action);
      if (actions.length !== 0) throw new Error('Unexpected actions mapped length');
    });

    await assert('28. [Regression] Client normalization prevents "Cannot read properties of undefined (reading items)" across all edge cases', async () => {
      const edgeCases: any[] = [
        undefined,
        null,
        {},
        { data: undefined },
        { data: null },
        { items: undefined },
        { data: { items: null } },
        [],
        [{ id: 'item1' }],
        { data: { items: [{ id: 'item2' }], total: 1 } },
      ];

      for (const ec of edgeCases) {
        const normalized = normalizePaginatedResult(ec);
        if (!Array.isArray(normalized.items)) {
          throw new Error(`Failed to ensure items array for input: ${JSON.stringify(ec)}`);
        }
        if (typeof normalized.total !== 'number') {
          throw new Error(`Failed to ensure total number for input: ${JSON.stringify(ec)}`);
        }
        // Crucial check: accessing .items or mapping must NEVER throw
        const count = normalized.items.length;
        const mapped = normalized.items.map((x: any) => x?.id);
        if (typeof count !== 'number' || !Array.isArray(mapped)) {
          throw new Error('Defensive access failed');
        }
      }
    });

    // 14. Full Restaurant / Tenant Editing by Platform Admin
    let originalRestaurantSnapshot: any = null;

    await assert('29. Platform Admin updates restaurant specifications (name, tagline, legalName, city, country, timezone, phone, currency, defaultLanguage) via PATCH /api/platform/restaurants/:id', async () => {
      // Snapshot original restaurant details to restore if needed
      originalRestaurantSnapshot = await prisma.restaurant.findUnique({
        where: { id: targetRestaurant.id },
        include: { settings: true },
      });

      const updatePayload = {
        name: `${originalRestaurantSnapshot.name} Edited`,
        tagline: 'Refined Dining & Lounge',
        legalName: 'Aura Enterprise Global Ltd',
        city: 'London',
        country: 'United Kingdom',
        timezone: 'Europe/London',
        phone: '+44 20 7946 0999',
        currency: 'GBP',
        defaultLanguage: 'en',
      };

      const res = await request(app)
        .patch(`/api/platform/restaurants/${targetRestaurant.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(updatePayload);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const updated = res.body.data.restaurant;
      const settings = res.body.data.settings;
      if (updated.name !== updatePayload.name) throw new Error(`Name mismatch: ${updated.name}`);
      if (updated.legalName !== updatePayload.legalName) throw new Error(`legalName mismatch: ${updated.legalName}`);
      if (updated.city !== updatePayload.city) throw new Error(`city mismatch: ${updated.city}`);
      if (updated.country !== updatePayload.country) throw new Error(`country mismatch: ${updated.country}`);
      if (updated.timezone !== updatePayload.timezone) throw new Error(`timezone mismatch: ${updated.timezone}`);
      if (updated.phone !== updatePayload.phone) throw new Error(`phone mismatch: ${updated.phone}`);
      if (updated.currency !== updatePayload.currency) throw new Error(`currency mismatch: ${updated.currency}`);
      if (updated.defaultLanguage !== updatePayload.defaultLanguage) throw new Error(`defaultLanguage mismatch: ${updated.defaultLanguage}`);
      if (settings?.language !== updatePayload.defaultLanguage) throw new Error(`settings language mismatch: ${settings?.language}`);

      // Verify in DB directly
      const dbRestaurant = await prisma.restaurant.findUnique({
        where: { id: targetRestaurant.id },
        include: { settings: true },
      });
      if (dbRestaurant?.name !== updatePayload.name) throw new Error('DB name not updated');
      if (dbRestaurant?.legalName !== updatePayload.legalName) throw new Error('DB legalName not updated');
      if (dbRestaurant?.city !== updatePayload.city) throw new Error('DB city not updated');
      if (dbRestaurant?.country !== updatePayload.country) throw new Error('DB country not updated');
      if (dbRestaurant?.timezone !== updatePayload.timezone) throw new Error('DB timezone not updated');
      if (dbRestaurant?.phone !== updatePayload.phone) throw new Error('DB phone not updated');
      if (dbRestaurant?.currency !== updatePayload.currency) throw new Error('DB currency not updated');
      if (dbRestaurant?.defaultLanguage !== updatePayload.defaultLanguage) throw new Error('DB defaultLanguage not updated');
      if (dbRestaurant?.settings?.language !== updatePayload.defaultLanguage) throw new Error('DB settings language not updated');
    });

    await assert('30. Attempting to update slug to an existing restaurant slug returns 409 SLUG_CONFLICT', async () => {
      // Find or create another restaurant to get a colliding slug
      const otherRestaurant = await prisma.restaurant.findFirst({
        where: { id: { not: targetRestaurant.id } },
      });
      if (!otherRestaurant) {
        throw new Error('At least 2 restaurants required to test slug collision');
      }

      const res = await request(app)
        .patch(`/api/platform/restaurants/${targetRestaurant.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ slug: otherRestaurant.slug });

      if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
      const code = res.body.errorCode || res.body.code;
      if (code !== 'SLUG_CONFLICT') {
        throw new Error(`Expected SLUG_CONFLICT, got ${code}`);
      }
    });

    await assert('31. Platform Admin updates slug to a unique slug successfully and updates public routing', async () => {
      const newSlug = `test-unique-slug-${Date.now()}`;
      const res = await request(app)
        .patch(`/api/platform/restaurants/${targetRestaurant.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ slug: newSlug });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data.restaurant.slug !== newSlug) throw new Error(`Slug mismatch: ${res.body.data.restaurant.slug}`);

      const dbCheck = await prisma.restaurant.findUnique({ where: { slug: newSlug } });
      if (!dbCheck || dbCheck.id !== targetRestaurant.id) throw new Error('Restaurant not found by new slug in DB');

      // Revert back to original slug for test idempotency
      await prisma.restaurant.update({
        where: { id: targetRestaurant.id },
        data: { slug: originalRestaurantSnapshot.slug },
      });
    });

    await assert('32. Platform Admin updates theme/presentation defaults transactionally', async () => {
      const res = await request(app)
        .patch(`/api/platform/restaurants/${targetRestaurant.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          theme: 'LIGHT_MINIMAL',
          presentationMode: 'VISUAL_IMAGE',
          primaryColor: '#10b981',
          accentColor: '#059669',
        });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data.settings.theme !== 'LIGHT_MINIMAL') throw new Error(`Theme mismatch: ${res.body.data.settings.theme}`);
      if (res.body.data.settings.presentationMode !== 'VISUAL_IMAGE') throw new Error(`Presentation mode mismatch: ${res.body.data.settings.presentationMode}`);

      const dbSettings = await prisma.restaurantSettings.findUnique({
        where: { restaurantId: targetRestaurant.id },
      });
      if (dbSettings?.theme !== 'LIGHT_MINIMAL') throw new Error('DB settings theme not updated');
      if (dbSettings?.presentationMode !== 'VISUAL_IMAGE') throw new Error('DB settings presentationMode not updated');
      if (dbSettings?.primaryColor !== '#10b981') throw new Error('DB settings primaryColor not updated');
      if (dbSettings?.accentColor !== '#059669') throw new Error('DB settings accentColor not updated');
    });

    await assert('33. Non-Platform-Admin (Viewer, Support, Owner) is rejected with 403 PLATFORM_ACCESS_DENIED when editing restaurant', async () => {
      // Test Platform Viewer
      const viewerRes = await request(app)
        .patch(`/api/platform/restaurants/${targetRestaurant.id}`)
        .set('Authorization', `Bearer ${platformViewerToken}`)
        .send({ name: 'Hacked by Viewer' });
      if (viewerRes.status !== 403) throw new Error(`Expected 403 for Viewer, got ${viewerRes.status}`);

      // Test Platform Support
      const supportRes = await request(app)
        .patch(`/api/platform/restaurants/${targetRestaurant.id}`)
        .set('Authorization', `Bearer ${platformSupportToken}`)
        .send({ name: 'Hacked by Support' });
      if (supportRes.status !== 403) throw new Error(`Expected 403 for Support, got ${supportRes.status}`);

      // Test Restaurant Owner
      const ownerRes = await request(app)
        .patch(`/api/platform/restaurants/${targetRestaurant.id}`)
        .set('Authorization', `Bearer ${restaurantOwnerToken}`)
        .send({ name: 'Hacked by Owner' });
      if (ownerRes.status !== 403) throw new Error(`Expected 403 for Owner, got ${ownerRes.status}`);
    });

    await assert('34. Audit log captures UPDATE action with before and after metadata for Restaurant changes', async () => {
      const auditRecord = await prisma.auditLog.findFirst({
        where: {
          restaurantId: targetRestaurant.id,
          action: 'UPDATE',
          entityType: 'Restaurant',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!auditRecord) throw new Error('UPDATE audit log record for Restaurant not found');
      const meta = auditRecord.metadata as any;
      if (!meta || !meta.before || !meta.after || !Array.isArray(meta.updatedFields)) {
        throw new Error(`Audit log metadata missing before/after/updatedFields: ${JSON.stringify(meta)}`);
      }
      if (meta.updatedFields.length === 0) {
        throw new Error('Audit log updatedFields is empty');
      }

      // Restore original restaurant snapshot
      if (originalRestaurantSnapshot) {
        await prisma.restaurant.update({
          where: { id: targetRestaurant.id },
          data: {
            name: originalRestaurantSnapshot.name,
            tagline: originalRestaurantSnapshot.tagline,
            legalName: originalRestaurantSnapshot.legalName,
            city: originalRestaurantSnapshot.city,
            country: originalRestaurantSnapshot.country,
            timezone: originalRestaurantSnapshot.timezone,
            phone: originalRestaurantSnapshot.phone,
            currency: originalRestaurantSnapshot.currency,
          },
        });
        if (originalRestaurantSnapshot.settings) {
          await prisma.restaurantSettings.update({
            where: { restaurantId: targetRestaurant.id },
            data: {
              theme: originalRestaurantSnapshot.settings.theme,
              presentationMode: originalRestaurantSnapshot.settings.presentationMode,
              defaultLanguage: originalRestaurantSnapshot.settings.defaultLanguage,
              bannerColor: originalRestaurantSnapshot.settings.bannerColor,
              accentColor: originalRestaurantSnapshot.settings.accentColor,
            },
          });
        }
      }
    });

    // 15. Clean up created operator
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
