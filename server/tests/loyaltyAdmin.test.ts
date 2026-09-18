import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { GameMode, PointsTransactionType, Role } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { LoyaltyService } from '../src/services/loyaltyService';

async function createTenant(unique: string, idx: number, features: string[]) {
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `LADM-${idx}-${unique}`, name: `Loyalty Admin Plan ${idx}`, price: 10, features, active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: `Loyalty Admin Tenant ${idx}`, slug: `loyalty-admin-${idx}-${unique}`, active: true, timezone: 'UTC' },
  });
  const now = new Date();
  await prisma.subscription.create({
    data: {
      restaurantId: restaurant.id,
      planId: plan.id,
      status: 'ACTIVE',
      startsAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 86400000),
      agreedPrice: 10,
      agreedCurrency: 'EUR',
    },
  });
  return { restaurant, plan };
}

async function createUser(unique: string, restaurantId: string, role: Role, suffix: string) {
  const email = `loyalty-admin-${suffix}-${unique}@test.com`;
  const user = await prisma.user.create({
    data: { email, name: `User ${suffix}`, passwordHash: await bcrypt.hash('Password123!', 10) },
  });
  await prisma.userRestaurant.create({ data: { userId: user.id, restaurantId, role } });
  const token = (await request(app).post('/api/auth/login').send({ email, password: 'Password123!' })).body.data?.token;
  return { user, email, token };
}

async function runTests() {
  const TOTAL = 15;
  console.log(`💎 Loyalty Admin UI Test Suite (${TOTAL} Tests)...\n`);
  let passed = 0;
  let failed = 0;

  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/${TOTAL}] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/${TOTAL}] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let tenantA: any;
  let tenantB: any;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  const emails: string[] = [];

  try {
    tenantA = await createTenant(unique, 1, ['GAMES_LOYALTY']);
    tenantB = await createTenant(unique, 2, ['AI_INSIGHTS']);
    restaurantIds.push(tenantA.restaurant.id, tenantB.restaurant.id);
    planIds.push(tenantA.plan.id, tenantB.plan.id);

    const ownerA = await createUser(unique, tenantA.restaurant.id, Role.OWNER, 'owner-a');
    const ownerB = await createUser(unique, tenantB.restaurant.id, Role.OWNER, 'owner-b');
    const staffA = await createUser(unique, tenantA.restaurant.id, Role.STAFF, 'staff-a');
    emails.push(ownerA.email, ownerB.email, staffA.email);

    const customerA = await prisma.customer.create({
      data: { restaurantId: tenantA.restaurant.id, name: 'Alice Loyalty', email: `alice-${unique}@test.com`, taxId: '501234567' },
    });
    const customerB = await prisma.customer.create({
      data: { restaurantId: tenantB.restaurant.id, name: 'Bob Other', email: `bob-${unique}@test.com`, taxId: '509876543' },
    });

    // Seed loyalty data in tenant A: points, an active reward, an identity.
    await LoyaltyService.credit({
      restaurantId: tenantA.restaurant.id,
      customerId: customerA.id,
      amount: 100,
      type: PointsTransactionType.ADMIN_ADJUST,
      idempotencyKey: `seed-${unique}`,
      referenceType: 'ADMIN',
    });
    const reward = await prisma.reward.create({
      data: { restaurantId: tenantA.restaurant.id, name: 'Free Dessert', pointsCost: 20, active: true, unlimitedStock: true, sortOrder: 1 },
    });
    await LoyaltyService.enroll(tenantA.restaurant.id, customerA.id);

    // -------------------------------------------------------------------------
    // OVERVIEW
    // -------------------------------------------------------------------------
    await assert(1, 'Overview returns loyalty aggregates for entitled tenant', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/overview`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const d = res.body.data;
      if (d.totalLoyaltyCustomers < 1) throw new Error('totalLoyaltyCustomers missing');
      if (d.totalPointsIssued < 100) throw new Error(`totalPointsIssued wrong: ${d.totalPointsIssued}`);
      if (d.activeRewards < 1) throw new Error('activeRewards missing');
      if (!Array.isArray(d.recentRedemptions)) throw new Error('recentRedemptions missing');
    });

    await assert(2, 'Overview blocked without GAMES_LOYALTY (feature gate)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantB.restaurant.id}/loyalty/overview`)
        .set('Authorization', `Bearer ${ownerB.token}`);
      if (res.status !== 403 || res.body.errorCode !== 'FEATURE_NOT_AVAILABLE') {
        throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(3, 'Overview blocked for staff without MANAGE_RESTAURANT_SETTINGS', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/overview`)
        .set('Authorization', `Bearer ${staffA.token}`);
      if (res.status !== 403 || res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') {
        throw new Error(`expected 403 INSUFFICIENT_PERMISSIONS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // -------------------------------------------------------------------------
    // CUSTOMER LOOKUP
    // -------------------------------------------------------------------------
    await assert(4, 'Customer lookup by NIF returns safe profile + identity', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/lookup?taxId=501234567`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const d = res.body.data;
      if (d.customer.name !== 'Alice Loyalty') throw new Error('customer name mismatch');
      if (d.customer.balance < 100) throw new Error('balance missing');
      if (!d.identity || d.identity.active !== true) throw new Error('identity should be active');
      if (!Array.isArray(d.ledger) || d.ledger.length < 1) throw new Error('ledger missing');
      if (d.identity.tokenHash || d.identity.rawToken) throw new Error('raw token must never be exposed');
    });

    await assert(5, 'Customer lookup requires taxId', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/lookup`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(6, 'Customer lookup is tenant-scoped (NIF from B not found in A)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/lookup?taxId=509876543`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (res.status !== 404 || res.body.errorCode !== 'CUSTOMER_NOT_FOUND') {
        throw new Error(`expected 404 CUSTOMER_NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(7, 'Cross-tenant lookup URL is rejected by tenant isolation', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantB.restaurant.id}/loyalty/customers/lookup?taxId=501234567`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (res.status !== 403 || res.body.errorCode !== 'RESTAURANT_ACCESS_DENIED') {
        throw new Error(`expected 403 RESTAURANT_ACCESS_DENIED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // -------------------------------------------------------------------------
    // MANUAL ADJUSTMENT
    // -------------------------------------------------------------------------
    await assert(8, 'Manual adjustment requires a reason', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/${customerA.id}/adjust`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ amount: 10 });
      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(9, 'Manual adjustment persists and is reflected on refresh', async () => {
      const before = (await prisma.customer.findUnique({ where: { id: customerA.id } }))!.loyaltyPoints;
      const add = await request(app)
        .post(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/${customerA.id}/adjust`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ amount: 25, reason: 'Goodwill credit' });
      if (add.status !== 200 || add.body.data.balance !== before + 25) {
        throw new Error(`add failed: ${add.status}: ${JSON.stringify(add.body)}`);
      }

      // Re-read from backend (refresh) and confirm persisted balance.
      const get = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/${customerA.id}`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (get.body.data.customer.balance !== before + 25) {
        throw new Error(`refresh balance mismatch: ${get.body.data.customer.balance}`);
      }
    });

    await assert(10, 'Manual adjustment cannot drive balance negative', async () => {
      const poor = await prisma.customer.create({
        data: { restaurantId: tenantA.restaurant.id, name: 'Poor Customer', email: `poor-${unique}@test.com` },
      });
      await LoyaltyService.credit({ restaurantId: tenantA.restaurant.id, customerId: poor.id, amount: 5, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `poor-${unique}` });
      const res = await request(app)
        .post(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/${poor.id}/adjust`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ amount: -50, reason: 'Over-deduct' });
      if (res.status !== 409 || res.body.errorCode !== 'INSUFFICIENT_POINTS') {
        throw new Error(`expected 409 INSUFFICIENT_POINTS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // -------------------------------------------------------------------------
    // IDENTITY (QR) REVOKE
    // -------------------------------------------------------------------------
    await assert(11, 'Revoke loyalty identity marks it inactive (no raw token)', async () => {
      const revoke = await request(app)
        .post(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/${customerA.id}/token/revoke`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (revoke.status !== 200) throw new Error(`revoke failed: ${revoke.status}: ${JSON.stringify(revoke.body)}`);
      if (revoke.body.data.identity.active !== false) throw new Error('identity should be inactive');

      const get = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/customers/${customerA.id}`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (get.body.data.identity.active !== false) throw new Error('refresh should show revoked identity');
    });

    // -------------------------------------------------------------------------
    // REDEMPTIONS + REFUND
    // -------------------------------------------------------------------------
    await assert(12, 'Admin redemptions list returns safe customer identity', async () => {
      await LoyaltyService.redeemReward(tenantA.restaurant.id, customerA.id, reward.id, `red-${unique}`);
      const res = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/redemptions`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (res.status !== 200 || res.body.data.redemptions.length < 1) throw new Error('redemptions list empty');
      const first = res.body.data.redemptions[0];
      if (!first.customer?.name) throw new Error('customer safe identity missing');
    });

    await assert(13, 'Admin refund cancels redemption and persists on refresh', async () => {
      const redeem = await LoyaltyService.redeemReward(tenantA.restaurant.id, customerA.id, reward.id, `refund-${unique}`);
      const refund = await request(app)
        .post(`/api/restaurants/${tenantA.restaurant.id}/loyalty/redemptions/${redeem.redemption.id}/refund`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (refund.status !== 200) throw new Error(`refund failed: ${refund.status}: ${JSON.stringify(refund.body)}`);

      const list = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/redemptions`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      const found = list.body.data.redemptions.find((r: any) => r.id === redeem.redemption.id);
      if (!found || found.status !== 'CANCELLED') throw new Error('refund not persisted (status should be CANCELLED)');
    });

    // -------------------------------------------------------------------------
    // REWARD CRUD round-trip (persisted state)
    // -------------------------------------------------------------------------
    await assert(14, 'Reward CRUD round-trip persists via backend', async () => {
      const created = await request(app)
        .post(`/api/restaurants/${tenantA.restaurant.id}/loyalty/rewards`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ name: 'Limited Mug', pointsCost: 30, unlimitedStock: false, stock: 3, sortOrder: 2 });
      if (created.status !== 201) throw new Error(`create failed: ${created.status}: ${JSON.stringify(created.body)}`);
      const id = created.body.data.reward.id;

      const list = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/loyalty/rewards`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      const found = list.body.data.rewards.find((r: any) => r.id === id);
      if (!found || found.stock !== 3) throw new Error('created reward not persisted');
    });

    await assert(15, 'Reward CRUD blocked for staff without MANAGE_RESTAURANT_SETTINGS', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${tenantA.restaurant.id}/loyalty/rewards`)
        .set('Authorization', `Bearer ${staffA.token}`)
        .send({ name: 'Hacked', pointsCost: 1 });
      if (res.status !== 403 || res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') {
        throw new Error(`expected 403 INSUFFICIENT_PERMISSIONS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    for (const rid of restaurantIds) {
      await prisma.loyaltyIdentity.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.rewardRedemption.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.reward.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.customerPointsLedger.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await RestaurantDeletionService.hardDelete(rid).catch(() => {});
    }
    if (emails.length) await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    if (planIds.length) await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nLoyalty Admin UI Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
