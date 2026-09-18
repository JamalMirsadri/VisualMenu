import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';

async function createTenantWithPlan(unique: string, idx: number, features: string[]) {
  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: `GAMES-${idx}-${unique}`,
      name: `Games Plan ${idx}`,
      price: 10,
      features,
      active: true,
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: { name: `Games Tenant ${idx}`, slug: `games-tenant-${idx}-${unique}`, active: true },
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
  const TOTAL = 17;
  console.log(`🎮 Games + Loyalty Foundation Test Suite (${TOTAL} Tests)...\n`);
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
  let ownerTokenA = '';
  let ownerTokenB = '';
  let staffTokenA = '';
  const emails: string[] = [];

  try {
    // Tenant A has GAMES_LOYALTY; Tenant B does not.
    tenantA = await createTenantWithPlan(unique, 1, ['GAMES_LOYALTY']);
    tenantB = await createTenantWithPlan(unique, 2, ['AI_INSIGHTS']);

    const password = 'Password123!';
    const ownerEmailA = `games-owner-a-${unique}@test.com`;
    const ownerEmailB = `games-owner-b-${unique}@test.com`;
    const staffEmailA = `games-staff-a-${unique}@test.com`;
    emails.push(ownerEmailA, ownerEmailB, staffEmailA);

    // Owner A
    const ownerAUser = await prisma.user.create({
      data: { email: ownerEmailA, name: 'Owner A', passwordHash: await bcrypt.hash(password, 10) },
    });
    await prisma.userRestaurant.create({ data: { userId: ownerAUser.id, restaurantId: tenantA.restaurant.id, role: 'OWNER' } });

    // Owner B
    const ownerBUser = await prisma.user.create({
      data: { email: ownerEmailB, name: 'Owner B', passwordHash: await bcrypt.hash(password, 10) },
    });
    await prisma.userRestaurant.create({ data: { userId: ownerBUser.id, restaurantId: tenantB.restaurant.id, role: 'OWNER' } });

    // Staff A (no MANAGE_RESTAURANT_SETTINGS)
    const staffAUser = await prisma.user.create({
      data: { email: staffEmailA, name: 'Staff A', passwordHash: await bcrypt.hash(password, 10) },
    });
    await prisma.userRestaurant.create({ data: { userId: staffAUser.id, restaurantId: tenantA.restaurant.id, role: 'STAFF' } });

    ownerTokenA = (await request(app).post('/api/auth/login').send({ email: ownerEmailA, password })).body.data?.token;
    ownerTokenB = (await request(app).post('/api/auth/login').send({ email: ownerEmailB, password })).body.data?.token;
    staffTokenA = (await request(app).post('/api/auth/login').send({ email: staffEmailA, password })).body.data?.token;

    await assert(1, 'Admin config allowed when GAMES_LOYALTY is enabled', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    });

    await assert(2, 'Admin config blocked with 403 FEATURE_NOT_AVAILABLE without GAMES_LOYALTY', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantB.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenB}`);
      if (res.status !== 403 || res.body.errorCode !== 'FEATURE_NOT_AVAILABLE') {
        throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(3, 'Tenant isolation: owner A cannot access tenant B config', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantB.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`);
      if (res.status !== 403 || res.body.errorCode !== 'RESTAURANT_ACCESS_DENIED') {
        throw new Error(`expected 403 RESTAURANT_ACCESS_DENIED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(4, 'Route authorization: staff without MANAGE_RESTAURANT_SETTINGS blocked', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${staffTokenA}`);
      if (res.status !== 403 || res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') {
        throw new Error(`expected 403 INSUFFICIENT_PERMISSIONS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(5, 'Public customer loyalty route allowed for entitled tenant', async () => {
      const res = await request(app).get(`/api/restaurants/${tenantA.restaurant.id}/loyalty`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    });

    await assert(6, 'Public customer loyalty route blocked without entitlement', async () => {
      const res = await request(app).get(`/api/restaurants/${tenantB.restaurant.id}/loyalty`);
      if (res.status !== 403 || res.body.errorCode !== 'FEATURE_NOT_AVAILABLE') {
        throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(7, 'Public customer loyalty route requires a valid restaurant context', async () => {
      const res = await request(app).get('/api/restaurants/not-a-uuid/loyalty');
      if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    });

    await assert(8, 'Platform admin bypasses feature + permission gates', async () => {
      const plat = await request(app)
        .post('/api/auth/login')
        .send({ email: 'platformadmin@auramenu.com', password: 'Password123!' });
      const platToken = plat.body.data?.token;
      const res = await request(app)
        .get(`/api/restaurants/${tenantB.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${platToken}`);
      if (res.status !== 200) throw new Error(`expected 200 bypass, got ${res.status}: ${JSON.stringify(res.body)}`);
    });

    const validConfig = {
      enabled: true,
      modes: ['PRIVATE', 'RANDOM'],
      minPlayers: 2,
      maxPlayers: 6,
      turnTimeoutSeconds: 30,
      dailyPointsLimit: 100,
      pointRules: { winPoints: 20 },
    };

    await assert(9, 'Admin can save game config and read it back', async () => {
      const putRes = await request(app)
        .put(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send(validConfig);
      if (putRes.status !== 200) throw new Error(`expected 200, got ${putRes.status}: ${JSON.stringify(putRes.body)}`);
      const cfg = putRes.body.data.config;
      if (!cfg || cfg.enabled !== true || cfg.maxPlayers !== 6 || cfg.pointRules?.winPoints !== 20) {
        throw new Error(`config not persisted as expected: ${JSON.stringify(cfg)}`);
      }
      const getRes = await request(app)
        .get(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`);
      const saved = getRes.body.data.config;
      if (!saved || saved.enabled !== true || saved.dailyPointsLimit !== 100 || saved.turnTimeoutSeconds !== 30) {
        throw new Error(`saved config mismatch on re-read: ${JSON.stringify(saved)}`);
      }
    });

    await assert(10, 'Save rejects enabled config with no game modes', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ ...validConfig, modes: [] });
      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(11, 'Save rejects maxPlayers lower than minPlayers', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ ...validConfig, minPlayers: 5, maxPlayers: 3 });
      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(12, 'Save rejects turn timeout below 5 seconds', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ ...validConfig, turnTimeoutSeconds: 4 });
      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(13, 'Save rejects negative daily points limit', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ ...validConfig, dailyPointsLimit: -1 });
      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(14, 'Save rejects negative winner points', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ ...validConfig, pointRules: { winPoints: -5 } });
      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(15, 'Tenant isolation: owner A cannot write tenant B config', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${tenantB.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send(validConfig);
      if (res.status !== 403 || res.body.errorCode !== 'RESTAURANT_ACCESS_DENIED') {
        throw new Error(`expected 403 RESTAURANT_ACCESS_DENIED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(16, 'Save blocked without GAMES_LOYALTY entitlement', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${tenantB.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .send(validConfig);
      if (res.status !== 403 || res.body.errorCode !== 'FEATURE_NOT_AVAILABLE') {
        throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(17, 'Save blocked for staff without MANAGE_RESTAURANT_SETTINGS', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${tenantA.restaurant.id}/games/config`)
        .set('Authorization', `Bearer ${staffTokenA}`)
        .send(validConfig);
      if (res.status !== 403 || res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') {
        throw new Error(`expected 403 INSUFFICIENT_PERMISSIONS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (tenantA?.restaurant?.id) await RestaurantDeletionService.hardDelete(tenantA.restaurant.id).catch(() => {});
    if (tenantB?.restaurant?.id) await RestaurantDeletionService.hardDelete(tenantB.restaurant.id).catch(() => {});
    if (emails.length) await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    const planIds = [tenantA?.plan?.id, tenantB?.plan?.id].filter(Boolean);
    if (planIds.length) await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nGames + Loyalty Foundation Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
