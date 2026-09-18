import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { GameMode, GameStatus, GameType, PointsTransactionType, Role } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { LoyaltyService, startOfDayInTz } from '../src/services/loyaltyService';

async function createTenant(unique: string, idx: number, overrides: { pointRules?: any; dailyPointsLimit?: number; timezone?: string } = {}) {
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `REW-${idx}-${unique}`, name: `Rewards Plan ${idx}`, price: 10, features: ['GAMES_LOYALTY'], active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Rewards Tenant ${idx}`,
      slug: `rewards-tenant-${idx}-${unique}`,
      active: true,
      timezone: overrides.timezone ?? 'UTC',
    },
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

async function createOwner(unique: string, restaurantId: string, suffix: string) {
  const email = `reward-owner-${suffix}-${unique}@test.com`;
  const user = await prisma.user.create({
    data: { email, name: 'Reward Owner', passwordHash: await bcrypt.hash('Password123!', 10) },
  });
  await prisma.userRestaurant.create({ data: { userId: user.id, restaurantId, role: Role.OWNER } });
  const token = (await request(app).post('/api/auth/login').send({ email, password: 'Password123!' })).body.data?.token;
  return { user, email, token };
}

async function makeFinishedGame(restaurantId: string, customerId: string | null) {
  const session = await prisma.gameSession.create({
    data: { restaurantId, gameType: GameType.SNAKES_LADDERS, mode: GameMode.PRIVATE, status: GameStatus.FINISHED, maxPlayers: 2, eventVersion: 1 },
  });
  const player = await prisma.gamePlayer.create({
    data: { gameSessionId: session.id, customerId, alias: 'Winner', seatOrder: 0, position: 100, isHost: true },
  });
  await prisma.gameSession.update({ where: { id: session.id }, data: { winnerPlayerId: player.id } });
  return session;
}

async function runTests() {
  console.log('🎁 Loyalty Rewards + Redemption Test Suite...\n');
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
  const emails: string[] = [];

  try {
    A = await createTenant(unique, 1, { pointRules: { winPoints: 10 }, dailyPointsLimit: 100, timezone: 'Europe/Lisbon' });
    B = await createTenant(unique, 2, { pointRules: { winPoints: 10 }, dailyPointsLimit: 100 });
    restaurantIds.push(A.restaurant.id, B.restaurant.id);
    planIds.push(A.plan.id, B.plan.id);

    const ownerA = await createOwner(unique, A.restaurant.id, 'a');
    emails.push(ownerA.email);

    const customerA = await prisma.customer.create({
      data: { restaurantId: A.restaurant.id, name: 'Reward Customer', email: `reward-cust-${unique}@test.com` },
    });
    const customerB = await prisma.customer.create({
      data: { restaurantId: B.restaurant.id, name: 'Other Customer', email: `other-cust-${unique}@test.com` },
    });

    // -------------------------------------------------------------------------
    // TIMEZONE REGRESSION
    // -------------------------------------------------------------------------
    await assert(1, 'Daily limit day boundary uses restaurant timezone (not UTC)', async () => {
      const la = startOfDayInTz(new Date('2026-01-15T00:30:00Z'), 'America/Los_Angeles');
      if (la.toISOString() !== '2026-01-14T08:00:00.000Z') throw new Error(`LA boundary wrong: ${la.toISOString()}`);
      const kiri = startOfDayInTz(new Date('2026-01-15T12:00:00Z'), 'Pacific/Kiritimati');
      if (kiri.toISOString() !== '2026-01-15T10:00:00.000Z') throw new Error(`Kiritimati boundary wrong: ${kiri.toISOString()}`);
    });

    // -------------------------------------------------------------------------
    // REWARD CRUD (admin)
    // -------------------------------------------------------------------------
    let rewardId = '';
    await assert(2, 'Admin creates a reward', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/rewards`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ name: 'Free Coffee', description: 'A cup', pointsCost: 50, active: true, unlimitedStock: true, sortOrder: 1 });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      rewardId = res.body.data.reward.id;
      if (res.body.data.reward.pointsCost !== 50) throw new Error('pointsCost mismatch');
    });

    await assert(3, 'Admin lists and updates a reward', async () => {
      const list = await request(app)
        .get(`/api/restaurants/${A.restaurant.id}/loyalty/rewards`)
        .set('Authorization', `Bearer ${ownerA.token}`);
      if (list.status !== 200 || list.body.data.rewards.length !== 1) throw new Error(`list failed: ${JSON.stringify(list.body)}`);

      const upd = await request(app)
        .put(`/api/restaurants/${A.restaurant.id}/loyalty/rewards/${rewardId}`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ name: 'Free Espresso', pointsCost: 40, active: true, unlimitedStock: true });
      if (upd.status !== 200 || upd.body.data.reward.name !== 'Free Espresso') throw new Error(`update failed: ${JSON.stringify(upd.body)}`);
    });

    await assert(4, 'Admin deactivates a reward (PATCH status)', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/loyalty/rewards/${rewardId}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ active: false });
      if (res.status !== 200 || res.body.data.reward.active !== false) throw new Error(`deactivate failed: ${JSON.stringify(res.body)}`);
    });

    await assert(5, 'Tenant isolation: admin B cannot update A reward', async () => {
      const ownerB = await createOwner(unique, B.restaurant.id, 'b');
      emails.push(ownerB.email);
      const res = await request(app)
        .put(`/api/restaurants/${B.restaurant.id}/loyalty/rewards/${rewardId}`)
        .set('Authorization', `Bearer ${ownerB.token}`)
        .send({ name: 'Hacked', pointsCost: 1, active: true, unlimitedStock: true });
      if (res.status !== 404 || res.body.errorCode !== 'REWARD_NOT_FOUND') {
        throw new Error(`expected 404 REWARD_NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // -------------------------------------------------------------------------
    // REDEMPTION RULES (service-level)
    // -------------------------------------------------------------------------
    await assert(6, 'Inactive reward cannot be redeemed', async () => {
      await LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerA.id, amount: 100, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `seed-${unique}` });
      let rejected = false;
      try {
        await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, rewardId, `r-inactive-${unique}`);
      } catch (e: any) {
        if (e.errorCode === 'REWARD_INACTIVE') rejected = true;
      }
      if (!rejected) throw new Error('expected REWARD_INACTIVE');
    });

    await assert(7, 'Insufficient points rejects redemption', async () => {
      await prisma.reward.update({ where: { id: rewardId }, data: { active: true, pointsCost: 9999, unlimitedStock: true } });
      let rejected = false;
      try {
        await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, rewardId, `r-insuf-${unique}`);
      } catch (e: any) {
        if (e.errorCode === 'INSUFFICIENT_POINTS') rejected = true;
      }
      if (!rejected) throw new Error('expected INSUFFICIENT_POINTS');
    });

    // Limited-stock reward: stock 1.
    const limited = await prisma.reward.create({
      data: { restaurantId: A.restaurant.id, name: 'Limited Mug', pointsCost: 10, active: true, unlimitedStock: false, stock: 1 },
    });

    await assert(8, 'Stock depletion prevents over-redemption', async () => {
      await LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerA.id, amount: 100, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `seed2-${unique}` });
      const first = await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, limited.id, `r-stock1-${unique}`);
      if (first.skipped) throw new Error('first redemption should not be skipped');
      const after = await prisma.reward.findUnique({ where: { id: limited.id } });
      if (after!.stock !== 0) throw new Error(`expected stock 0, got ${after!.stock}`);

      let rejected = false;
      try {
        await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, limited.id, `r-stock2-${unique}`);
      } catch (e: any) {
        if (e.errorCode === 'REWARD_OUT_OF_STOCK') rejected = true;
      }
      if (!rejected) throw new Error('expected REWARD_OUT_OF_STOCK');
    });

    await assert(9, 'Unlimited-stock reward can be redeemed repeatedly', async () => {
      const unlimited = await prisma.reward.create({
        data: { restaurantId: A.restaurant.id, name: 'Unlimited Sticker', pointsCost: 10, active: true, unlimitedStock: true },
      });
      await LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerA.id, amount: 100, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `seed3-${unique}` });
      const r1 = await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, unlimited.id, `r-unlim1-${unique}`);
      const r2 = await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, unlimited.id, `r-unlim2-${unique}`);
      if (r1.skipped || r2.skipped) throw new Error('unlimited redemptions should not skip');
    });

    await assert(10, 'Duplicate redemption (same idempotency key) is prevented', async () => {
      const dup = await prisma.reward.create({
        data: { restaurantId: A.restaurant.id, name: 'Dup Reward', pointsCost: 10, active: true, unlimitedStock: true },
      });
      await LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerA.id, amount: 100, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `seed4-${unique}` });
      const key = `dup-${unique}`;
      const first = await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, dup.id, key);
      const second = await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, dup.id, key);
      if (first.skipped || !second.skipped) throw new Error('second redemption should be skipped (idempotent)');
      const count = await prisma.rewardRedemption.count({ where: { idempotencyKey: key } });
      if (count !== 1) throw new Error(`expected 1 redemption, got ${count}`);
    });

    await assert(11, 'Concurrent redemption of a single-stock reward yields exactly one success', async () => {
      const race = await prisma.reward.create({
        data: { restaurantId: A.restaurant.id, name: 'Race Reward', pointsCost: 10, active: true, unlimitedStock: false, stock: 1 },
      });
      await LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerA.id, amount: 100, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `seed5-${unique}` });
      const results = await Promise.allSettled([
        LoyaltyService.redeemReward(A.restaurant.id, customerA.id, race.id, `race1-${unique}`),
        LoyaltyService.redeemReward(A.restaurant.id, customerA.id, race.id, `race2-${unique}`),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      if (fulfilled.length !== 1) throw new Error(`expected exactly one success, got ${fulfilled.length}`);
      const after = await prisma.reward.findUnique({ where: { id: race.id } });
      if (after!.stock !== 0) throw new Error(`expected stock 0, got ${after!.stock}`);
    });

    await assert(12, 'Refund restores points and stock, and cancels the redemption', async () => {
      const refundReward = await prisma.reward.create({
        data: { restaurantId: A.restaurant.id, name: 'Refundable', pointsCost: 30, active: true, unlimitedStock: false, stock: 2 },
      });
      await LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerA.id, amount: 30, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `seed6-${unique}` });
      const before = (await prisma.customer.findUnique({ where: { id: customerA.id } }))!.loyaltyPoints;

      const redemption = await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, refundReward.id, `refund-${unique}`);
      const afterRedeem = (await prisma.customer.findUnique({ where: { id: customerA.id } }))!.loyaltyPoints;
      if (afterRedeem !== before - 30) throw new Error(`balance after redeem wrong: ${afterRedeem}`);

      const result = await LoyaltyService.refundRedemption(A.restaurant.id, customerA.id, redemption.redemption.id);
      const afterRefund = (await prisma.customer.findUnique({ where: { id: customerA.id } }))!.loyaltyPoints;
      if (afterRefund !== before) throw new Error(`balance after refund wrong: ${afterRefund}`);

      const red = await prisma.rewardRedemption.findUnique({ where: { id: redemption.redemption.id } });
      if (red!.status !== 'CANCELLED') throw new Error(`expected CANCELLED, got ${red!.status}`);
      const reward = await prisma.reward.findUnique({ where: { id: refundReward.id } });
      if (reward!.stock !== 2) throw new Error(`expected stock restored to 2, got ${reward!.stock}`);

      const refundLedger = await prisma.customerPointsLedger.findUnique({ where: { idempotencyKey: `refund-ledger:${redemption.redemption.id}` } });
      if (!refundLedger || refundLedger.type !== 'REFUND') throw new Error('REFUND ledger entry missing');
    });

    await assert(13, 'Refund is idempotent (second refund is a no-op)', async () => {
      const refundReward = await prisma.reward.create({
        data: { restaurantId: A.restaurant.id, name: 'Idem Refund', pointsCost: 20, active: true, unlimitedStock: true },
      });
      await LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: customerA.id, amount: 20, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `seed7-${unique}` });
      const redemption = await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, refundReward.id, `idref-${unique}`);
      await LoyaltyService.refundRedemption(A.restaurant.id, customerA.id, redemption.redemption.id);
      const second = await LoyaltyService.refundRedemption(A.restaurant.id, customerA.id, redemption.redemption.id);
      if (!second.skipped) throw new Error('second refund should be skipped');
    });

    await assert(14, 'Admin manual adjustment changes balance and writes audit', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/customers/${customerA.id}/adjust`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ amount: 25, reason: 'Goodwill' });
      if (res.status !== 200) throw new Error(`adjust failed: ${res.status}: ${JSON.stringify(res.body)}`);
      const audit = await prisma.auditLog.findFirst({ where: { restaurantId: A.restaurant.id, entityType: 'LoyaltyAdjustment' } });
      if (!audit) throw new Error('audit log missing for adjustment');
    });

    await assert(15, 'Customer API: rewards list + redeem via token', async () => {
      const enroll = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/enroll`)
        .send({ email: `redeem-via-token-${unique}@test.com`, name: 'Token Customer' });
      const token = enroll.body.data.token;
      const custId = (await prisma.customer.findFirst({ where: { restaurantId: A.restaurant.id, email: `redeem-via-token-${unique}@test.com` } }))!.id;
      await LoyaltyService.credit({ restaurantId: A.restaurant.id, customerId: custId, amount: 50, type: PointsTransactionType.ADMIN_ADJUST, idempotencyKey: `seed8-${unique}` });

      const reward = await prisma.reward.create({ data: { restaurantId: A.restaurant.id, name: 'Token Reward', pointsCost: 50, active: true, unlimitedStock: true } });

      const list = await request(app).get(`/api/restaurants/${A.restaurant.id}/loyalty/rewards/available`);
      if (list.status !== 200 || !Array.isArray(list.body.data.rewards)) throw new Error('rewards list failed');

      const redeem = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/loyalty/redeem`)
        .send({ token, rewardId: reward.id, idempotencyKey: `http-redeem-${unique}` });
      if (redeem.status !== 200 || redeem.body.data.pointsSpent !== 50) throw new Error(`redeem failed: ${JSON.stringify(redeem.body)}`);
    });

    await assert(16, 'Complete flow: game win → points → redemption', async () => {
      const g = await makeFinishedGame(A.restaurant.id, customerA.id);
      const win = await LoyaltyService.awardGameWin(g.id);
      if (!win.awarded || win.amount !== 10) throw new Error('game win not awarded');

      const reward = await prisma.reward.create({
        data: { restaurantId: A.restaurant.id, name: 'Game Reward', pointsCost: 10, active: true, unlimitedStock: true },
      });
      const before = (await prisma.customer.findUnique({ where: { id: customerA.id } }))!.loyaltyPoints;
      const redemption = await LoyaltyService.redeemReward(A.restaurant.id, customerA.id, reward.id, `game-redeem-${unique}`);
      const after = (await prisma.customer.findUnique({ where: { id: customerA.id } }))!.loyaltyPoints;
      if (after !== before - 10) throw new Error(`flow balance wrong: ${before} -> ${after}`);
      if (redemption.redemption.status !== 'COMPLETED') throw new Error('redemption not completed');
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
    if (emails.length) await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    if (planIds.length) await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nLoyalty Rewards + Redemption Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
