import './setup';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { Role, SubscriptionStatus } from '@prisma/client';
import { getJwtSecret } from '../src/config';
import { PERMISSION_CATALOG } from '../src/constants/permissions';
import { SubscriptionService } from '../src/services/subscription/subscriptionService';

async function runTests() {
  console.log('🧪 Phase 14 — Architecture & Security Hardening Regression Tests\n');
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
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ---------------------------------------------------------------------
    // Fix #1: JWT secret must never fall back to a hardcoded value.
    // ---------------------------------------------------------------------
    await assert('1. getJwtSecret() throws when JWT_SECRET is missing', async () => {
      const saved = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      let threw = false;
      try {
        getJwtSecret();
      } catch {
        threw = true;
      } finally {
        if (saved !== undefined) process.env.JWT_SECRET = saved;
      }
      if (!threw) throw new Error('getJwtSecret() did not throw when JWT_SECRET was missing');
    });

    // ---------------------------------------------------------------------
    // Fix #8: every permission key must be present in PERMISSION_CATALOG.
    // ---------------------------------------------------------------------
    await assert('2. All permission keys (incl. formerly-missing ones) are in PERMISSION_CATALOG', async () => {
      const catalogKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
      const required = [
        'VIEW_FLOOR',
        'ASSIGN_ORDERS',
        'TRANSFER_TABLE',
        'MANAGE_USERS',
        'MANAGE_RESTAURANT',
        'TOGGLE_AVAILABILITY',
      ];
      const missing = required.filter((k) => !catalogKeys.has(k));
      if (missing.length > 0) throw new Error(`Missing from catalog: ${missing.join(', ')}`);
    });

    // ---------------------------------------------------------------------
    // Fix #2: CORS allowlist.
    // ---------------------------------------------------------------------
    await assert('3. CORS allows configured origin', async () => {
      const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
      if (res.headers['access-control-allow-origin'] !== 'http://localhost:5173') {
        throw new Error('Expected Access-Control-Allow-Origin for allowed origin');
      }
    });

    await assert('4. CORS rejects disallowed origin', async () => {
      const res = await request(app).get('/api/health').set('Origin', 'http://evil.example.com');
      if (res.headers['access-control-allow-origin'] === 'http://evil.example.com') {
        throw new Error('Disallowed origin must not be granted Access-Control-Allow-Origin');
      }
      if (res.status < 400) {
        throw new Error(`Expected 4xx/5xx for disallowed origin, got ${res.status}`);
      }
    });

    // ---------------------------------------------------------------------
    // Fix #3: GET /api/payments/:id requires authentication.
    // ---------------------------------------------------------------------
    await assert('5. GET /api/payments/:id returns 401 without authentication', async () => {
      const res = await request(app).get('/api/payments/00000000-0000-0000-0000-000000000000');
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    // ---------------------------------------------------------------------
    // Fix #5: createSubscription must never auto-activate (even with trialDays).
    // ---------------------------------------------------------------------
    await assert('6. createSubscription starts PENDING (no auto-ACTIVE trial)', async () => {
      const plan = await prisma.subscriptionPlan.findFirst({ where: { active: true } });
      if (!plan) throw new Error('No active subscription plan found');

      const restaurant = await prisma.restaurant.create({
        data: {
          name: `Hardening Trial ${timestamp}`,
          slug: `hardening-trial-${timestamp}`,
          provisioningStatus: 'ACTIVE',
        },
      });
      createdRestaurantIds.push(restaurant.id);

      const sub = await SubscriptionService.createSubscription({
        restaurantId: restaurant.id,
        planId: plan.id,
        provider: 'MOCK',
      });

      if (sub.status !== SubscriptionStatus.PENDING) {
        throw new Error(`Expected PENDING, got ${sub.status}`);
      }
    });

    // ---------------------------------------------------------------------
    // Fix #6: no legacy 365-day subscription fallback.
    // ---------------------------------------------------------------------
    await assert('7. Restaurant without subscription is blocked (402) and NOT auto-provisioned', async () => {
      const email = `owner-nosub-${timestamp}@test.com`;
      const passwordHash = await bcrypt.hash('Password123!', 10);

      const user = await prisma.user.create({
        data: { email, name: 'NoSub Owner', passwordHash, active: true },
      });
      createdUserIds.push(user.id);

      const restaurant = await prisma.restaurant.create({
        data: { name: `NoSub Bistro ${timestamp}`, slug: `nosub-bistro-${timestamp}` },
      });
      createdRestaurantIds.push(restaurant.id);

      await prisma.userRestaurant.create({
        data: { userId: user.id, restaurantId: restaurant.id, role: Role.OWNER },
      });

      const login = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
      const token = login.body.data.token;

      const res = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${token}`);

      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);

      const autoSub = await prisma.subscription.findFirst({ where: { restaurantId: restaurant.id } });
      if (autoSub) throw new Error('A subscription was auto-created by the legacy fallback');
    });

    // ---------------------------------------------------------------------
    // Fix #4: Subscription.restaurantId must be unique at the database level.
    // ---------------------------------------------------------------------
    await assert('8. Duplicate subscription for the same restaurant is rejected (unique constraint)', async () => {
      const plan = await prisma.subscriptionPlan.findFirst({ where: { active: true } });
      if (!plan) throw new Error('No active subscription plan found');

      const restaurant = await prisma.restaurant.create({
        data: { name: `Unique Sub ${timestamp}`, slug: `unique-sub-${timestamp}` },
      });
      createdRestaurantIds.push(restaurant.id);

      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 86400000);

      await prisma.subscription.create({
        data: {
          restaurantId: restaurant.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          autoRenew: true,
          provider: 'MOCK',
          agreedPrice: plan.price,
          agreedCurrency: plan.currency,
        },
      });

      let rejected = false;
      try {
        await prisma.subscription.create({
          data: {
            restaurantId: restaurant.id,
            planId: plan.id,
            status: SubscriptionStatus.PENDING,
            startsAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            autoRenew: true,
            provider: 'MOCK',
            agreedPrice: plan.price,
            agreedCurrency: plan.currency,
          },
        });
      } catch (e: any) {
        if (e.code === 'P2002') rejected = true;
      }
      if (!rejected) throw new Error('Expected P2002 unique constraint violation');
    });

    // ---------------------------------------------------------------------
    // Fix #7: cancelAutoRenew must exist and behave as a single authoritative method.
    // ---------------------------------------------------------------------
    await assert('9. cancelAutoRenew sets autoRenew=false without error', async () => {
      const plan = await prisma.subscriptionPlan.findFirst({ where: { active: true } });
      if (!plan) throw new Error('No active subscription plan found');

      const restaurant = await prisma.restaurant.create({
        data: { name: `Cancel Renew ${timestamp}`, slug: `cancel-renew-${timestamp}` },
      });
      createdRestaurantIds.push(restaurant.id);

      const sub = await SubscriptionService.createSubscription({
        restaurantId: restaurant.id,
        planId: plan.id,
        provider: 'MOCK',
      });

      const updated = await SubscriptionService.cancelAutoRenew(sub.id, undefined, 'test');
      if (updated.autoRenew !== false) throw new Error('autoRenew was not set to false');
    });
  } finally {
    // Cleanup created test data (preserve any pre-existing data).
    for (const id of createdRestaurantIds) {
      await prisma.restaurant.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of createdUserIds) {
      await prisma.user.deleteMany({ where: { id } }).catch(() => {});
    }
  }

  console.log(`\n✅ Phase 14 hardening: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests()
  .catch((e) => {
    console.error('❌ Test suite error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
