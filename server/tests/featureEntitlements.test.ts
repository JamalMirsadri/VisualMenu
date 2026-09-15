import request from 'supertest';
import bcrypt from 'bcryptjs';
import express from 'express';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { FeatureService } from '../src/services/featureService';
import { authenticateToken } from '../src/middleware/authMiddleware';
import { requireFeature } from '../src/middleware/featureMiddleware';

// Test-only probe route to exercise requireFeature() over HTTP with real DB.
const featureProbe = express();
featureProbe.use(express.json());
featureProbe.get(
  '/probe/:restaurantId',
  authenticateToken,
  requireFeature('ADVANCED_ANALYTICS'),
  (_req, res) => res.json({ success: true })
);

async function createTenantWithPlan(unique: string, idx: number, features: string[]) {
  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: `FEAT-${idx}-${unique}`,
      name: `Feature Plan ${idx}`,
      price: 10,
      features,
      active: true,
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: { name: `Tenant ${idx}`, slug: `feat-tenant-${idx}-${unique}`, active: true },
  });

  const now = new Date();
  await prisma.subscription.create({
    data: {
      restaurantId: restaurant.id,
      planId: plan.id,
      status: 'ACTIVE',
      startsAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      agreedPrice: 10,
      agreedCurrency: 'EUR',
    },
  });

  return { restaurant, plan };
}

async function runTests() {
  console.log('🧪 Feature Entitlement System Regression Suite (8 Tests)...\n');
  let passed = 0;
  let failed = 0;

  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/8] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/8] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let tenantA: any;
  let tenantB: any;
  let ownerTokenA = '';
  let ownerTokenB = '';
  let apiPlanId = '';

  try {
    tenantA = await createTenantWithPlan(unique, 1, ['ADVANCED_ANALYTICS', 'ANALYTICS_EXPORT']);
    tenantB = await createTenantWithPlan(unique, 2, ['AI_INSIGHTS']);

    const ownerEmailA = `feat-owner-a-${unique}@test.com`;
    const ownerEmailB = `feat-owner-b-${unique}@test.com`;
    const password = 'Password123!';

    for (const [email, restaurantId] of [
      [ownerEmailA, tenantA.restaurant.id],
      [ownerEmailB, tenantB.restaurant.id],
    ] as const) {
      const user = await prisma.user.create({
        data: { email, name: 'Owner', passwordHash: await bcrypt.hash(password, 10) },
      });
      await prisma.userRestaurant.create({
        data: { userId: user.id, restaurantId, role: 'OWNER' },
      });
    }

    const loginA = await request(app).post('/api/auth/login').send({ email: ownerEmailA, password });
    ownerTokenA = loginA.body.data?.token;
    const loginB = await request(app).post('/api/auth/login').send({ email: ownerEmailB, password });
    ownerTokenB = loginB.body.data?.token;

    await assert(1, 'Active plan features resolve for a restaurant', async () => {
      const features = await FeatureService.getRestaurantFeatures(tenantA.restaurant.id);
      if (!features.includes('ADVANCED_ANALYTICS') || !features.includes('ANALYTICS_EXPORT')) {
        throw new Error(`unexpected features: ${JSON.stringify(features)}`);
      }
    });

    await assert(2, 'Disabled feature returns false', async () => {
      const has = await FeatureService.hasFeature(tenantA.restaurant.id, 'AI_INSIGHTS');
      if (has !== false) throw new Error('expected AI_INSIGHTS to be disabled for tenant A');
    });

    await assert(3, 'Enabled feature returns true', async () => {
      const has = await FeatureService.hasFeature(tenantA.restaurant.id, 'ADVANCED_ANALYTICS');
      if (has !== true) throw new Error('expected ADVANCED_ANALYTICS to be enabled for tenant A');
    });

    await assert(4, 'Tenant isolation: features do not leak across restaurants', async () => {
      const featuresB = await FeatureService.getRestaurantFeatures(tenantB.restaurant.id);
      if (featuresB.includes('ADVANCED_ANALYTICS')) throw new Error('tenant B leaked tenant A feature');
      if (!featuresB.includes('AI_INSIGHTS')) throw new Error('tenant B missing its own feature');
      const hasAInB = await FeatureService.hasFeature(tenantB.restaurant.id, 'ADVANCED_ANALYTICS');
      if (hasAInB !== false) throw new Error('ADVANCED_ANALYTICS should be false for tenant B');
    });

    await assert(5, 'Platform admin can set features on plan create (sanitized)', async () => {
      const plat = await request(app)
        .post('/api/auth/login')
        .send({ email: 'platformadmin@auramenu.com', password: 'Password123!' });
      const platToken = plat.body.data?.token;
      if (!platToken) throw new Error('platform admin login failed');

      const res = await request(app)
        .post('/api/platform/subscriptions/plans')
        .set('Authorization', `Bearer ${platToken}`)
        .send({
          code: `FEATAPI-${unique}`,
          name: 'Feature API Plan',
          price: 99,
          features: ['ADVANCED_ANALYTICS', 'NOT_A_REAL_FEATURE', 'AI_INSIGHTS'],
        });

      if (res.status !== 201) throw new Error(`status ${res.status}: ${JSON.stringify(res.body)}`);
      apiPlanId = res.body.data.id;
      const features = res.body.data.features || [];
      if (!features.includes('ADVANCED_ANALYTICS') || !features.includes('AI_INSIGHTS')) {
        throw new Error(`expected valid features, got ${JSON.stringify(features)}`);
      }
      if (features.includes('NOT_A_REAL_FEATURE')) throw new Error('invalid feature was not stripped');
    });

    await assert(6, 'Platform admin can update features on a plan', async () => {
      const plat = await request(app)
        .post('/api/auth/login')
        .send({ email: 'platformadmin@auramenu.com', password: 'Password123!' });
      const platToken = plat.body.data?.token;

      const res = await request(app)
        .put(`/api/platform/subscriptions/plans/${apiPlanId}`)
        .set('Authorization', `Bearer ${platToken}`)
        .send({ features: ['ADVANCED_FORECASTING'] });

      if (res.status !== 200) throw new Error(`status ${res.status}: ${JSON.stringify(res.body)}`);
      const features = res.body.data.features || [];
      if (features.length !== 1 || features[0] !== 'ADVANCED_FORECASTING') {
        throw new Error(`expected only ADVANCED_FORECASTING, got ${JSON.stringify(features)}`);
      }
    });

    await assert(7, 'requireFeature blocks direct API access with 403 FEATURE_NOT_AVAILABLE', async () => {
      // Tenant B lacks ADVANCED_ANALYTICS -> blocked.
      const denied = await request(featureProbe)
        .get(`/probe/${tenantB.restaurant.id}`)
        .set('Authorization', `Bearer ${ownerTokenB}`);
      if (denied.status !== 403 || denied.body.errorCode !== 'FEATURE_NOT_AVAILABLE') {
        throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${denied.status} ${JSON.stringify(denied.body)}`);
      }

      // Tenant A has ADVANCED_ANALYTICS -> allowed.
      const allowed = await request(featureProbe)
        .get(`/probe/${tenantA.restaurant.id}`)
        .set('Authorization', `Bearer ${ownerTokenA}`);
      if (allowed.status !== 200) throw new Error(`expected 200, got ${allowed.status}`);
    });

    await assert(8, 'Platform admin bypasses the feature gate', async () => {
      const plat = await request(app)
        .post('/api/auth/login')
        .send({ email: 'platformadmin@auramenu.com', password: 'Password123!' });
      const platToken = plat.body.data?.token;

      const res = await request(featureProbe)
        .get(`/probe/${tenantB.restaurant.id}`)
        .set('Authorization', `Bearer ${platToken}`);
      if (res.status !== 200) throw new Error(`expected 200 bypass, got ${res.status}`);
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (tenantA?.restaurant?.id) await RestaurantDeletionService.hardDelete(tenantA.restaurant.id).catch(() => {});
    if (tenantB?.restaurant?.id) await RestaurantDeletionService.hardDelete(tenantB.restaurant.id).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: [`feat-owner-a-${unique}@test.com`, `feat-owner-b-${unique}@test.com`] } } }).catch(() => {});
    const planIds = [tenantA?.plan?.id, tenantB?.plan?.id, apiPlanId].filter(Boolean);
    if (planIds.length) await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nFeature Entitlement Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
