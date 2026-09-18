import request from 'supertest';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { GameMode, GameStatus, GameType, PointsTransactionType } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { LoyaltyService } from '../src/services/loyaltyService';

async function createTenant(unique: string, idx: number, overrides: { pointRules?: any; dailyPointsLimit?: number } = {}) {
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `LOY-${idx}-${unique}`, name: `Loyalty Plan ${idx}`, price: 10, features: ['GAMES_LOYALTY'], active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: `Loyalty Tenant ${idx}`, slug: `loyalty-tenant-${idx}-${unique}`, active: true },
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
  await prisma.gameConfig.create({
    data: {
      restaurantId: restaurant.id,
      enabled: true,
      modes: [GameMode.PRIVATE, GameMode.RANDOM],
      minPlayers: 2,
      maxPlayers: 6,
      turnTimeoutSeconds: 60,
      pointRules: overrides.pointRules ?? { winPoints: 10 },
      dailyPointsLimit: overrides.dailyPointsLimit ?? 100,
    },
  });
  return { restaurant, plan };
}

async function makeFinishedGame(restaurantId: string, customerId: string | null, status: GameStatus = GameStatus.FINISHED) {
  const session = await prisma.gameSession.create({
    data: {
      restaurantId,
      gameType: GameType.SNAKES_LADDERS,
      mode: GameMode.PRIVATE,
      status,
      maxPlayers: 2,
      eventVersion: 1,
    },
  });
  const player = await prisma.gamePlayer.create({
    data: {
      gameSessionId: session.id,
      customerId,
      alias: 'Winner',
      seatOrder: 0,
      position: 100,
      isHost: true,
    },
  });
  await prisma.gameSession.update({ where: { id: session.id }, data: { winnerPlayerId: player.id } });
  return { session, player };
}

async function runTests() {
  console.log('💳 Loyalty Identity + Points Engine Test Suite...\n');
  let passed = 0;
  let failed = 0;

  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let A: any, B: any;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];

  try {
    A = await createTenant(unique, 1, { pointRules: { winPoints: 10 }, dailyPointsLimit: 100 });
    B = await createTenant(unique, 2, { pointRules: { winPoints: 10 }, dailyPointsLimit: 100 });
    restaurantIds.push(A.restaurant.id, B.restaurant.id);
    planIds.push(A.plan.id, B.plan.id);

    // -------------------------------------------------------------------------
    // IDENTITY + QR TOKEN
    // -------------------------------------------------------------------------
    let tokenA = '';
    let customerAId = '';

    await assert(1, 'Enroll without NIF creates a loyalty identity and returns a raw token', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/enroll`)
        .send({ email: `loyal-${unique}@test.com`, name: 'Loyal Gamer' });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      tokenA = res.body.data.token;
      if (!tokenA || typeof tokenA !== 'string' || tokenA.length < 32) throw new Error('missing/weak raw token');
      if (res.body.data.balance !== 0) throw new Error('expected zero balance');
    });

    await assert(2, 'Token resolution returns sanitized customer (no internal id/taxId)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/resolve`)
        .send({ token: tokenA });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data.name !== 'Loyal Gamer') throw new Error('name mismatch');
      const raw = JSON.stringify(res.body.data);
      if (raw.includes('"id"') || raw.includes('taxId') || raw.includes('customerId')) {
        throw new Error(`sanitized response leaked identity: ${raw}`);
      }
    });

    await assert(3, 'Duplicate identity prevention: re-enroll returns existing identity, no duplicate', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/enroll`)
        .send({ email: `loyal-${unique}@test.com` });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}`);
      if (!res.body.data.alreadyEnrolled || res.body.data.token !== null) {
        throw new Error(`expected alreadyEnrolled with null token, got ${JSON.stringify(res.body.data)}`);
      }
      const count = await prisma.loyaltyIdentity.count({ where: { restaurantId: A.restaurant.id } });
      if (count !== 1) throw new Error(`expected 1 identity, got ${count}`);
    });

    await assert(4, 'NIF lookup resolves the existing customer without exposing id/taxId', async () => {
      // Enroll a second customer WITH NIF.
      await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/enroll`)
        .send({ name: 'Nif Customer', taxId: '123456789' });
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/lookup-nif`)
        .send({ taxId: '123456789' });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data.name !== 'Nif Customer') throw new Error('nif lookup name mismatch');
      const raw = JSON.stringify(res.body.data);
      if (raw.includes('"id"') || raw.includes('taxId')) throw new Error(`nif lookup leaked identity: ${raw}`);
    });

    await assert(5, 'Token rotation invalidates the old token and issues a new one', async () => {
      const rot = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/token/rotate`)
        .send({ token: tokenA });
      if (rot.status !== 200 || !rot.body.data.token) throw new Error(`rotate failed: ${JSON.stringify(rot.body)}`);
      const newToken = rot.body.data.token;

      const oldRes = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/resolve`)
        .send({ token: tokenA });
      if (oldRes.status !== 404) throw new Error(`old token should fail after rotation, got ${oldRes.status}`);

      const newRes = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/resolve`)
        .send({ token: newToken });
      if (newRes.status !== 200) throw new Error(`new token should resolve, got ${newRes.status}`);
      tokenA = newToken;
    });

    await assert(6, 'Token revocation prevents further resolution (410)', async () => {
      const rev = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/token/revoke`)
        .send({ token: tokenA });
      if (rev.status !== 200) throw new Error(`revoke failed: ${rev.status}`);

      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/resolve`)
        .send({ token: tokenA });
      if (res.status !== 410 || res.body.errorCode !== 'LOYALTY_TOKEN_REVOKED') {
        throw new Error(`expected 410 LOYALTY_TOKEN_REVOKED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(7, 'Restaurant isolation: token from A cannot resolve in B', async () => {
      const enrollA = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/enroll`)
        .send({ email: `iso-${unique}@test.com` });
      const res = await request(app)
        .post(`/api/restaurants/${B.restaurant.id}/loyalty/resolve`)
        .send({ token: enrollA.body.data.token });
      if (res.status !== 404 || res.body.errorCode !== 'LOYALTY_TOKEN_NOT_FOUND') {
        throw new Error(`expected 404 LOYALTY_TOKEN_NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // Resolve a customer id for points tests.
    const cust = await prisma.customer.findFirst({ where: { restaurantId: A.restaurant.id, email: `loyal-${unique}@test.com` } });
    customerAId = cust!.id;

    // -------------------------------------------------------------------------
    // POINTS ENGINE
    // -------------------------------------------------------------------------
    await assert(8, 'Points credit writes an immutable ledger entry + updates balance', async () => {
      await LoyaltyService.credit({
        restaurantId: A.restaurant.id,
        customerId: customerAId,
        amount: 50,
        type: PointsTransactionType.ADMIN_ADJUST,
        idempotencyKey: `credit-${unique}`,
      });
      const balance = await prisma.customer.findUnique({ where: { id: customerAId } });
      if (balance!.loyaltyPoints !== 50) throw new Error(`expected balance 50, got ${balance!.loyaltyPoints}`);
      const ledger = await prisma.customerPointsLedger.findUnique({ where: { idempotencyKey: `credit-${unique}` } });
      if (!ledger || ledger.balanceAfter !== 50) throw new Error('ledger entry missing/incorrect balanceAfter');
    });

    await assert(9, 'Points debit updates balance and balanceAfter atomically', async () => {
      await LoyaltyService.debit({
        restaurantId: A.restaurant.id,
        customerId: customerAId,
        amount: 20,
        type: PointsTransactionType.REWARD_REDEEM,
        idempotencyKey: `debit-${unique}`,
      });
      const balance = await prisma.customer.findUnique({ where: { id: customerAId } });
      if (balance!.loyaltyPoints !== 30) throw new Error(`expected balance 30, got ${balance!.loyaltyPoints}`);
    });

    await assert(10, 'Negative balance is rejected and balance is unchanged', async () => {
      let rejected = false;
      try {
        await LoyaltyService.debit({
          restaurantId: A.restaurant.id,
          customerId: customerAId,
          amount: 9999,
          type: PointsTransactionType.REWARD_REDEEM,
          idempotencyKey: `neg-${unique}`,
        });
      } catch (err: any) {
        if (err.errorCode === 'INSUFFICIENT_POINTS') rejected = true;
      }
      if (!rejected) throw new Error('expected INSUFFICIENT_POINTS');
      const balance = await prisma.customer.findUnique({ where: { id: customerAId } });
      if (balance!.loyaltyPoints !== 30) throw new Error(`balance changed unexpectedly: ${balance!.loyaltyPoints}`);
    });

    await assert(11, 'Concurrent credits serialize and never lose an update', async () => {
      const before = (await prisma.customer.findUnique({ where: { id: customerAId } }))!.loyaltyPoints;
      const results = await Promise.allSettled([
        LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerAId, amount: 10, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `c1-${unique}` }),
        LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerAId, amount: 15, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `c2-${unique}` }),
      ]);
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount !== 0) throw new Error(`expected no rejections, got ${failedCount}`);
      const after = (await prisma.customer.findUnique({ where: { id: customerAId } }))!.loyaltyPoints;
      if (after !== before + 25) throw new Error(`expected balance ${before + 25}, got ${after}`);
    });

    // -------------------------------------------------------------------------
    // GAME → LOYALTY INTEGRATION
    // -------------------------------------------------------------------------
    await assert(12, 'GAME_WIN awards configured points exactly once (idempotent)', async () => {
      const g = await makeFinishedGame(A.restaurant.id, customerAId);
      const first = await LoyaltyService.awardGameWin(g.session.id);
      if (!first.awarded || first.amount !== 10) throw new Error(`expected award of 10, got ${JSON.stringify(first)}`);

      const balanceAfterFirst = (await prisma.customer.findUnique({ where: { id: customerAId } }))!.loyaltyPoints;

      const second = await LoyaltyService.awardGameWin(g.session.id);
      if (!second.awarded) throw new Error('second award should be idempotent (still awarded)');
      const balanceAfterSecond = (await prisma.customer.findUnique({ where: { id: customerAId } }))!.loyaltyPoints;
      if (balanceAfterSecond !== balanceAfterFirst) throw new Error('duplicate credit applied');

      const count = await prisma.customerPointsLedger.count({
        where: { referenceId: g.session.id, type: PointsTransactionType.GAME_WIN },
      });
      if (count !== 1) throw new Error(`expected exactly one GAME_WIN ledger entry, got ${count}`);
    });

    await assert(13, 'Cancelled game awards zero points', async () => {
      const before = (await prisma.customer.findUnique({ where: { id: customerAId } }))!.loyaltyPoints;
      const g = await makeFinishedGame(A.restaurant.id, customerAId, GameStatus.CANCELLED);
      const result = await LoyaltyService.awardGameWin(g.session.id);
      if (result.awarded) throw new Error('cancelled game should not award');
      const after = (await prisma.customer.findUnique({ where: { id: customerAId } }))!.loyaltyPoints;
      if (after !== before) throw new Error('balance changed for cancelled game');
    });

    await assert(14, 'Anonymous winner is never credited to anyone', async () => {
      const before = (await prisma.customer.findUnique({ where: { id: customerAId } }))!.loyaltyPoints;
      const g = await makeFinishedGame(A.restaurant.id, null);
      const result = await LoyaltyService.awardGameWin(g.session.id);
      if (result.awarded) throw new Error('anonymous winner should not award');
      const after = (await prisma.customer.findUnique({ where: { id: customerAId } }))!.loyaltyPoints;
      if (after !== before) throw new Error('anonymous winner changed balance');
    });

    await assert(15, 'Daily points limit is enforced on positive grants', async () => {
      const limited = await prisma.customer.create({
        data: { restaurantId: A.restaurant.id, name: 'Limited', email: `limited-${unique}@test.com` },
      });
      // Set a tiny daily limit and a high win reward.
      await prisma.gameConfig.update({
        where: { restaurantId: A.restaurant.id },
        data: { dailyPointsLimit: 5, pointRules: { winPoints: 10 } },
      });
      const g = await makeFinishedGame(A.restaurant.id, limited.id);
      let rejected = false;
      try {
        await LoyaltyService.awardGameWin(g.session.id);
      } catch (err: any) {
        if (err.errorCode === 'DAILY_POINTS_LIMIT_EXCEEDED') rejected = true;
      }
      if (!rejected) throw new Error('expected DAILY_POINTS_LIMIT_EXCEEDED');
      const balance = (await prisma.customer.findUnique({ where: { id: limited.id } }))!.loyaltyPoints;
      if (balance !== 0) throw new Error(`expected zero balance, got ${balance}`);
    });

    // -------------------------------------------------------------------------
    // LOYALTY QR URL (Phase 8A)
    // -------------------------------------------------------------------------
    await assert(16, 'Enroll returns a backend-generated loyalty QR deep link', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/enroll`)
        .send({ email: `qr-${unique}@test.com`, name: 'QR Customer' });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      const { token, loyaltyUrl } = res.body.data;
      if (!token || !loyaltyUrl) throw new Error('token or loyaltyUrl missing');
      if (!loyaltyUrl.includes(`/menu/${A.restaurant.slug}?loyalty=`)) {
        throw new Error(`loyaltyUrl is not a menu deep link: ${loyaltyUrl}`);
      }
      if (!loyaltyUrl.includes(encodeURIComponent(token))) throw new Error('loyaltyUrl does not contain the token');
    });

    await assert(17, 'QR endpoint returns a canonical loyalty URL for an active token', async () => {
      const enroll = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/enroll`)
        .send({ email: `qr2-${unique}@test.com` });
      const token = enroll.body.data.token;
      const res = await request(app)
        .get(`/api/restaurants/${A.restaurant.id}/loyalty/qr?token=${encodeURIComponent(token)}`);
      if (res.status !== 200 || !res.body.data.loyaltyUrl) {
        throw new Error(`qr endpoint failed: ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (!res.body.data.loyaltyUrl.includes(encodeURIComponent(token))) throw new Error('qr url missing token');
    });

    await assert(18, 'QR endpoint rejects missing and revoked tokens', async () => {
      const missing = await request(app).get(`/api/restaurants/${A.restaurant.id}/loyalty/qr`);
      if (missing.status !== 400) throw new Error(`expected 400 for missing token, got ${missing.status}`);

      const enroll = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/enroll`)
        .send({ email: `qr3-${unique}@test.com` });
      const token = enroll.body.data.token;
      await request(app).post(`/api/restaurants/${A.restaurant.id}/loyalty/token/revoke`).send({ token });
      const revoked = await request(app)
        .get(`/api/restaurants/${A.restaurant.id}/loyalty/qr?token=${encodeURIComponent(token)}`);
      if (revoked.status !== 410 || revoked.body.errorCode !== 'LOYALTY_TOKEN_REVOKED') {
        throw new Error(`expected 410 LOYALTY_TOKEN_REVOKED, got ${revoked.status}: ${JSON.stringify(revoked.body)}`);
      }
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    for (const rid of restaurantIds) {
      await prisma.loyaltyIdentity.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.gameMove.deleteMany({ where: { gameSession: { restaurantId: rid } } }).catch(() => {});
      await prisma.gamePlayer.deleteMany({ where: { gameSession: { restaurantId: rid } } }).catch(() => {});
      await prisma.gameSession.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.gameConfig.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.rewardRedemption.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.reward.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.customerPointsLedger.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await RestaurantDeletionService.hardDelete(rid).catch(() => {});
    }
    if (planIds.length) await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nLoyalty Identity + Points Engine Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
