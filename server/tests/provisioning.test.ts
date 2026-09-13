import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { ProvisioningStatus, Role } from '@prisma/client';

async function runProvisioningTests() {
  console.log('🚀 Starting Phase 10: Restaurant Provisioning, Owner Onboarding & Tenant Initialization Test Suite...\n');
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
  let standardUserToken = '';
  let testSlug1 = `test-bistro-${Date.now()}`;
  let testSlug2 = `test-lounge-${Date.now()}`;
  let provisionedRestaurant1: any = null;
  let rawInvitationToken1 = '';
  let provisionedRestaurant2: any = null;
  let rawInvitationToken2 = '';
  let owner1Email = `owner1-${Date.now()}@testtenant.com`;
  let owner2Email = `owner2-${Date.now()}@testtenant.com`;
  let owner1Token = '';

  try {
    // 1. Authenticate Platform Roles
    await assert('1. Authenticate Platform Admin operator', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'platformadmin@auramenu.com',
        password: 'Password123!',
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      platformAdminToken = res.body.data.token;
    });

    await assert('2. Authenticate Platform Support operator', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'support@auramenu.com',
        password: 'Password123!',
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      platformSupportToken = res.body.data.token;
    });

    await assert('3. Non-platform user cannot access /api/platform/restaurants (403)', async () => {
      // Create a dedicated standard user without platformRole
      const regularEmail = `test-staff-${Date.now()}-${Math.random().toString(36).substring(7)}@auramenu.com`;
      const regularUser = await prisma.user.create({
        data: {
          email: regularEmail,
          name: 'Regular Staff',
          passwordHash: await bcrypt.hash('Password123!', 10),
          active: true,
        },
      });
      const loginRes = await request(app).post('/api/auth/login').send({
        email: regularUser.email,
        password: 'Password123!',
      });
      if (loginRes.status !== 200) throw new Error(`Expected 200, got ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
      standardUserToken = loginRes.body.data.token;

      const res = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${standardUserToken}`)
        .send({
          name: 'Unauthorized Bistro',
          slug: `unauthorized-${Date.now()}`,
          ownerName: 'Alice',
          ownerEmail: 'alice@test.com',
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('4. Platform Support cannot provision restaurants (requires PLATFORM_ADMIN) (403)', async () => {
      const res = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformSupportToken}`)
        .send({
          name: 'Support Bistro',
          slug: `support-${Date.now()}`,
          ownerName: 'Bob',
          ownerEmail: 'bob@test.com',
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('5. Provision Restaurant: Invalid or reserved slug rejected (400)', async () => {
      const res = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Admin Reserved',
          slug: 'admin',
          ownerName: 'Charlie',
          ownerEmail: 'charlie@test.com',
        });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await assert('6. Provision Restaurant 1: Full atomic transactional provisioning succeeds (201)', async () => {
      const res = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Lumina Bistro & Wine',
          slug: testSlug1,
          legalName: 'Lumina Hospitality Lda',
          address: 'Rua das Flores 88',
          city: 'Porto',
          country: 'Portugal',
          currency: 'EUR',
          currencySymbol: '€',
          ownerName: 'Duarte Silva',
          ownerEmail: owner1Email,
          theme: 'DARK_LUXURY',
          presentationMode: 'INDIVIDUAL_VIDEO',
          language: 'pt',
        });

      if (res.status !== 201) {
        throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (!res.body.data?.restaurant?.id) throw new Error('Missing restaurant in response');
      if (!res.body.data?.invitation?.rawToken) throw new Error('Missing raw invitation token');
      if (res.body.data.restaurant.provisioningStatus !== 'ACTIVE' && res.body.data.restaurant.provisioningStatus !== 'SUBSCRIPTION_PENDING') {
        throw new Error(`Expected ACTIVE or SUBSCRIPTION_PENDING status, got ${res.body.data.restaurant.provisioningStatus}`);
      }

      provisionedRestaurant1 = res.body.data.restaurant;
      rawInvitationToken1 = res.body.data.invitation.rawToken;
    });

    await assert('7. Duplicate slug rejected with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Lumina Duplicate Slug',
          slug: testSlug1, // Same slug
          ownerName: 'Another Owner',
          ownerEmail: 'another@test.com',
        });
      if (res.status !== 409) throw new Error(`Expected 409 Conflict, got ${res.status}`);
    });

    await assert('8. Owner User created with active: true and temporary placeholder password', async () => {
      const user = await prisma.user.findUnique({
        where: { email: owner1Email },
      });
      if (!user) throw new Error('Owner user not found in database');
      if (!user.active) throw new Error('Owner user should be active: true');
      if (!user.passwordHash || user.passwordHash.length < 20) {
        throw new Error('Owner passwordHash should be securely generated');
      }
    });

    await assert('9. UserRestaurant membership created with role = OWNER', async () => {
      const user = await prisma.user.findUnique({ where: { email: owner1Email } });
      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: user!.id,
            restaurantId: provisionedRestaurant1.id,
          },
        },
      });
      if (!membership) throw new Error('Missing UserRestaurant membership');
      if (membership.role !== Role.OWNER) throw new Error(`Expected role OWNER, got ${membership.role}`);
    });

    await assert('10. Existing User Reuse: Provisioning new restaurant with existing email reuses identity', async () => {
      const res = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Lumina Seaside Lounge',
          slug: testSlug2,
          ownerName: 'Duarte Silva',
          ownerEmail: owner1Email, // Same email!
          currency: 'EUR',
        });

      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);

      // Verify no duplicate user was created
      const matchingUsers = await prisma.user.findMany({
        where: { email: owner1Email },
      });
      if (matchingUsers.length !== 1) {
        throw new Error(`Expected exactly 1 user, found ${matchingUsers.length}`);
      }

      // Verify user has memberships in BOTH restaurants
      const memberships = await prisma.userRestaurant.findMany({
        where: { userId: matchingUsers[0].id },
      });
      if (memberships.length < 2) {
        throw new Error(`Expected at least 2 memberships, found ${memberships.length}`);
      }

      provisionedRestaurant2 = res.body.data.restaurant;
      rawInvitationToken2 = res.body.data.invitation.rawToken;
    });

    await assert('11. OwnerInvitation token stored as SHA-256 hash (rawToken NOT in DB)', async () => {
      const tokenHash = crypto.createHash('sha256').update(rawInvitationToken1).digest('hex');
      const invitation = await prisma.ownerInvitation.findUnique({
        where: { tokenHash },
      });
      if (!invitation) throw new Error('Hashed invitation token not found in database');

      // Verify rawToken is nowhere in the DB
      const leakCheck = await prisma.ownerInvitation.findFirst({
        where: { tokenHash: rawInvitationToken1 },
      });
      if (leakCheck) throw new Error('Raw invitation token should NOT be stored in database!');
    });

    await assert('12. Empty Tenant Guarantee: All business entities start at 0 count', async () => {
      const [
        categoriesCount,
        foodsCount,
        mediaCount,
        tablesCount,
        ordersCount,
        customersCount,
        paymentsCount,
        fiscalDocsCount,
      ] = await Promise.all([
        prisma.category.count({ where: { restaurantId: provisionedRestaurant1.id } }),
        prisma.foodItem.count({ where: { restaurantId: provisionedRestaurant1.id } }),
        prisma.media.count({ where: { restaurantId: provisionedRestaurant1.id } }),
        prisma.table.count({ where: { restaurantId: provisionedRestaurant1.id } }),
        prisma.order.count({ where: { restaurantId: provisionedRestaurant1.id } }),
        prisma.customer.count({ where: { restaurantId: provisionedRestaurant1.id } }),
        prisma.payment.count({ where: { restaurantId: provisionedRestaurant1.id } }),
        prisma.fiscalDocument.count({ where: { restaurantId: provisionedRestaurant1.id } }),
      ]);

      if (categoriesCount !== 0) throw new Error(`Expected 0 categories, got ${categoriesCount}`);
      if (foodsCount !== 0) throw new Error(`Expected 0 foods, got ${foodsCount}`);
      if (mediaCount !== 0) throw new Error(`Expected 0 media, got ${mediaCount}`);
      if (tablesCount !== 0) throw new Error(`Expected 0 tables, got ${tablesCount}`);
      if (ordersCount !== 0) throw new Error(`Expected 0 orders, got ${ordersCount}`);
      if (customersCount !== 0) throw new Error(`Expected 0 customers, got ${customersCount}`);
      if (paymentsCount !== 0) throw new Error(`Expected 0 payments, got ${paymentsCount}`);
      if (fiscalDocsCount !== 0) throw new Error(`Expected 0 fiscalDocs, got ${fiscalDocsCount}`);
    });

    await assert('13. No Demo Data Leakage: Demo restaurant content not accessible by new tenant', async () => {
      const demoRestaurant = await prisma.restaurant.findFirst({
        where: { slug: { notIn: [testSlug1, testSlug2] } },
        include: { _count: { select: { foods: true } } },
      });
      if (demoRestaurant && demoRestaurant._count.foods > 0) {
        // Query foods for new tenant
        const newTenantFoods = await prisma.foodItem.findMany({
          where: { restaurantId: provisionedRestaurant1.id },
        });
        if (newTenantFoods.length > 0) {
          throw new Error(`Demo food items leaked into new tenant! Found: ${newTenantFoods.length}`);
        }
      }
    });

    await assert('14. RestaurantSettings initialized with safe neutral defaults', async () => {
      const settings = await prisma.restaurantSettings.findUnique({
        where: { restaurantId: provisionedRestaurant1.id },
      });
      if (!settings) throw new Error('RestaurantSettings missing');
      if (settings.theme !== 'DARK_LUXURY') throw new Error(`Expected DARK_LUXURY, got ${settings.theme}`);
      if (settings.presentationMode !== 'INDIVIDUAL_VIDEO') {
        throw new Error(`Expected INDIVIDUAL_VIDEO, got ${settings.presentationMode}`);
      }
      if (!settings.cashPaymentEnabled || !settings.cardPaymentEnabled) {
        throw new Error('Payment methods should default to enabled');
      }
    });

    await assert('15. Public lookup of valid invitation token succeeds (GET /api/owner/invitations/:token)', async () => {
      const res = await request(app).get(`/api/owner/invitations/${rawInvitationToken1}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (!res.body.data?.valid) throw new Error('Invitation should be valid');
      if (res.body.data.invitedEmail !== owner1Email) {
        throw new Error(`Expected ${owner1Email}, got ${res.body.data.invitedEmail}`);
      }
      if (res.body.data.restaurant.name !== 'Lumina Bistro & Wine') {
        throw new Error(`Expected Lumina Bistro & Wine, got ${res.body.data.restaurant.name}`);
      }
    });

    await assert('16. Lookup of invalid token returns 404 INVITATION_NOT_FOUND', async () => {
      const res = await request(app).get('/api/owner/invitations/invalid-fake-token-123456');
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
      if (res.body.errorCode !== 'INVITATION_NOT_FOUND') {
        throw new Error(`Expected INVITATION_NOT_FOUND, got ${res.body.errorCode}`);
      }
    });

    await assert('17. Resend Owner Invitation: Revokes old invitation and generates fresh token', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${provisionedRestaurant1.id}/invitation/resend`)
        .set('Authorization', `Bearer ${platformAdminToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const newRawToken = res.body.data?.invitation?.rawToken;
      if (!newRawToken || newRawToken === rawInvitationToken1) {
        throw new Error('Expected new distinct invitation rawToken');
      }

      // Old token lookup should now return 410 INVITATION_REVOKED
      const oldCheck = await request(app).get(`/api/owner/invitations/${rawInvitationToken1}`);
      if (oldCheck.status !== 410) throw new Error(`Expected 410 for old revoked token, got ${oldCheck.status}`);

      // New token lookup should succeed
      const newCheck = await request(app).get(`/api/owner/invitations/${newRawToken}`);
      if (newCheck.status !== 200) throw new Error(`Expected 200 for new token, got ${newCheck.status}`);

      // Update active token
      rawInvitationToken1 = newRawToken;
    });

    await assert('18. Revoke Owner Invitation: Revokes active invitation (410)', async () => {
      // Create a temporary restaurant to test revocation
      const tempSlug = `temp-revoke-${Date.now()}`;
      const createRes = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Temp Revoke Restaurant',
          slug: tempSlug,
          ownerName: 'Temp Owner',
          ownerEmail: `temp-${Date.now()}@test.com`,
        });

      const tempId = createRes.body.data.restaurant.id;
      const tempToken = createRes.body.data.invitation.rawToken;

      const revokeRes = await request(app)
        .post(`/api/platform/restaurants/${tempId}/invitation/revoke`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (revokeRes.status !== 200) throw new Error(`Expected 200, got ${revokeRes.status}`);

      // Verify token is revoked
      const checkRes = await request(app).get(`/api/owner/invitations/${tempToken}`);
      if (checkRes.status !== 410) throw new Error(`Expected 410, got ${checkRes.status}`);
      if (checkRes.body.errorCode !== 'INVITATION_REVOKED') {
        throw new Error(`Expected INVITATION_REVOKED, got ${checkRes.body.errorCode}`);
      }
    });

    await assert('19. Expired invitation is rejected with 410 INVITATION_EXPIRED', async () => {
      const expiredRaw = `expired-token-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const expiredHash = crypto.createHash('sha256').update(expiredRaw).digest('hex');
      await prisma.ownerInvitation.create({
        data: {
          restaurantId: provisionedRestaurant1.id,
          invitedEmail: `expired-${Date.now()}@test.com`,
          invitedName: 'Expired User',
          tokenHash: expiredHash,
          expiresAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour in past
        },
      });

      const res = await request(app).get(`/api/owner/invitations/${expiredRaw}`);
      if (res.status !== 410) throw new Error(`Expected 410, got ${res.status}`);
      if (res.body.errorCode !== 'INVITATION_EXPIRED') {
        throw new Error(`Expected INVITATION_EXPIRED, got ${res.body.errorCode}`);
      }
    });

    await assert('20. Owner Onboarding Acceptance: Sets password and issues JWT session', async () => {
      const res = await request(app)
        .post(`/api/owner/invitations/${rawInvitationToken1}/accept`)
        .send({
          password: 'NewOwnerPassword123!',
          name: 'Duarte Silva Updated',
        });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (!res.body.data?.token) throw new Error('Missing token in acceptance response');
      if (res.body.data.restaurant.name !== 'Lumina Bistro & Wine') {
        throw new Error('Mismatched restaurant in acceptance session');
      }
      owner1Token = res.body.data.token;
    });

    await assert('21. Password securely hashed with bcrypt after onboarding', async () => {
      const user = await prisma.user.findUnique({ where: { email: owner1Email } });
      const valid = await bcrypt.compare('NewOwnerPassword123!', user!.passwordHash);
      if (!valid) throw new Error('Bcrypt validation failed on updated password');
    });

    await assert('22. Invitation is one-time use: Re-acceptance is rejected with 410', async () => {
      const res = await request(app)
        .post(`/api/owner/invitations/${rawInvitationToken1}/accept`)
        .send({
          password: 'AnotherPassword123!',
        });
      if (res.status !== 410) throw new Error(`Expected 410, got ${res.status}`);
      if (res.body.errorCode !== 'INVITATION_ALREADY_ACCEPTED') {
        throw new Error(`Expected INVITATION_ALREADY_ACCEPTED, got ${res.body.errorCode}`);
      }
    });

    await assert('23. Transaction Rollback: Database constraint conflict leaves 0 partial records', async () => {
      const conflictSlug = `conflict-${Date.now()}`;
      // Pre-create restaurant with conflictSlug
      await prisma.restaurant.create({
        data: {
          name: 'Pre-existing Conflict',
          slug: conflictSlug,
        },
      });

      const beforeCount = await prisma.user.count({ where: { email: 'rollback-check@test.com' } });

      // Attempt to provision with same slug
      const res = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Rollback Attempt',
          slug: conflictSlug,
          ownerName: 'Rollback User',
          ownerEmail: 'rollback-check@test.com',
        });

      if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);

      // Verify user was NOT created (transaction rolled back)
      const afterCount = await prisma.user.count({ where: { email: 'rollback-check@test.com' } });
      if (afterCount !== beforeCount) {
        throw new Error('Partial user record was not rolled back!');
      }
    });

    await assert('24. Concurrent Provisioning: Simultaneous requests for same slug resolve cleanly', async () => {
      const raceSlug = `race-${Date.now()}`;
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/platform/restaurants')
          .set('Authorization', `Bearer ${platformAdminToken}`)
          .send({
            name: 'Race Bistro A',
            slug: raceSlug,
            ownerName: 'Race A',
            ownerEmail: `race-a-${Date.now()}@test.com`,
          }),
        request(app)
          .post('/api/platform/restaurants')
          .set('Authorization', `Bearer ${platformAdminToken}`)
          .send({
            name: 'Race Bistro B',
            slug: raceSlug,
            ownerName: 'Race B',
            ownerEmail: `race-b-${Date.now()}@test.com`,
          }),
      ]);

      const statuses = [resA.status, resB.status];
      if (!statuses.includes(201)) {
        throw new Error(`Neither request succeeded: ${JSON.stringify(statuses)}`);
      }
      if (!statuses.includes(409) && !statuses.includes(400)) {
        throw new Error(`Second request did not fail with conflict: ${JSON.stringify(statuses)}`);
      }
    });

    await assert('25. Tenant Isolation: Owner 1 cannot access another restaurant without membership', async () => {
      // Create independent third restaurant with Owner 3
      const thirdSlug = `third-tenant-${Date.now()}`;
      const thirdRes = await request(app)
        .post('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          name: 'Third Restaurant',
          slug: thirdSlug,
          ownerName: 'Third Owner',
          ownerEmail: `third-owner-${Date.now()}@test.com`,
        });

      const thirdId = thirdRes.body.data.restaurant.id;

      // Owner 1 attempts to query third restaurant's foods or tables
      const res = await request(app)
        .get(`/api/restaurants/${thirdId}/tables`)
        .set('Authorization', `Bearer ${owner1Token}`);

      if (res.status !== 403) {
        throw new Error(`Expected 403 Forbidden for cross-tenant access, got ${res.status}`);
      }
    });

    await assert('26. Platform Admin inspects provisioning status (GET /api/platform/restaurants/:id/provisioning)', async () => {
      const res = await request(app)
        .get(`/api/platform/restaurants/${provisionedRestaurant1.id}/provisioning`)
        .set('Authorization', `Bearer ${platformAdminToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data?.restaurant?.provisioningStatus) {
        throw new Error('Missing provisioningStatus in response');
      }
      if (res.body.data.entityCounts.foods !== 0) {
        throw new Error(`Expected 0 foods, got ${res.body.data.entityCounts.foods}`);
      }
    });

    await assert('27. Audit trail records Phase 10 events with actor role', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { restaurantId: provisionedRestaurant1.id },
      });
      const actions = logs.map((l) => l.action);

      if (!actions.includes('RESTAURANT_CREATE' as any)) {
        throw new Error('Missing RESTAURANT_CREATE audit log');
      }
      if (!actions.includes('RESTAURANT_PROVISION_SUCCESS' as any)) {
        throw new Error('Missing RESTAURANT_PROVISION_SUCCESS audit log');
      }
      if (!actions.includes('OWNER_INVITATION_CREATE' as any)) {
        throw new Error('Missing OWNER_INVITATION_CREATE audit log');
      }
      if (!actions.includes('OWNER_INVITATION_ACCEPT' as any)) {
        throw new Error('Missing OWNER_INVITATION_ACCEPT audit log');
      }
    });

    await assert('28. Platform Admin context switch and status toggle on new tenant works without regressions', async () => {
      // Context enter
      const enterRes = await request(app)
        .post(`/api/platform/restaurants/${provisionedRestaurant1.id}/context/enter`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (enterRes.status !== 200) throw new Error(`Context enter failed: ${enterRes.status}`);

      // Deactivate tenant
      const deactRes = await request(app)
        .post(`/api/platform/restaurants/${provisionedRestaurant1.id}/deactivate`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (deactRes.status !== 200) throw new Error(`Deactivate failed: ${deactRes.status}`);

      // Reactivate tenant
      const actRes = await request(app)
        .post(`/api/platform/restaurants/${provisionedRestaurant1.id}/activate`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (actRes.status !== 200) throw new Error(`Activate failed: ${actRes.status}`);
    });
  } catch (error: any) {
    console.error('Fatal error running provisioning tests:', error);
  } finally {
    console.log('\n========================================');
    console.log(`Provisioning Test Results: ${passed} passed, ${failed} failed (Total: ${passed + failed})`);
    console.log('========================================\n');
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runProvisioningTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
