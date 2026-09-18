import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { GameMode, GameStatus, OrderStatus, Prisma, Role } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';

async function setupRestaurant(unique: string, idx: number) {
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `OL-${idx}-${unique}`, name: `OL Plan ${idx}`, price: 10, features: ['GAMES_LOYALTY'], active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: `OL Rest ${idx}`, slug: `ol-rest-${idx}-${unique}`, active: true },
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
    },
  });
  const tableA = await prisma.table.create({ data: { restaurantId: restaurant.id, number: `A${idx}` } });
  const tableB = await prisma.table.create({ data: { restaurantId: restaurant.id, number: `B${idx}` } });
  return { restaurant, plan, tableA, tableB };
}

async function createOwner(unique: string, restaurantId: string, suffix: string) {
  const email = `ol-owner-${suffix}-${unique}@test.com`;
  const user = await prisma.user.create({
    data: { email, name: 'Owner', passwordHash: await bcrypt.hash('Password123!', 10) },
  });
  await prisma.userRestaurant.create({ data: { userId: user.id, restaurantId, role: Role.OWNER } });
  const token = (await request(app).post('/api/auth/login').send({ email, password: 'Password123!' })).body.data?.token;
  return { user, email, token };
}

async function createPrivateGame(restaurantId: string, tableId: string, status: GameStatus, customerId: string | null = null) {
  const session = await prisma.gameSession.create({
    data: {
      restaurantId,
      gameType: 'SNAKES_LADDERS',
      mode: GameMode.PRIVATE,
      tableId,
      status,
      maxPlayers: 2,
      eventVersion: 1,
    },
  });
  await prisma.gamePlayer.create({
    data: { gameSessionId: session.id, alias: 'P1', seatOrder: 0, position: 1, isHost: true, customerId },
  });
  return session;
}

async function createOrder(unique: string, restaurantId: string, tableId: string, status: OrderStatus, n: number) {
  return prisma.order.create({
    data: {
      restaurantId,
      tableId,
      orderNumber: `T-${n}-${unique}`,
      status,
      subtotal: new Prisma.Decimal('10.00'),
      total: new Prisma.Decimal('10.00'),
    },
  });
}

async function runTests() {
  const TOTAL = 9;
  console.log(`🍽️ Order/Table Lifecycle Integration Test Suite (${TOTAL} Tests)...\n`);
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
  let A: any, B: any;
  const planIds: string[] = [];
  const restaurantIds: string[] = [];
  const emails: string[] = [];
  const customerIds: string[] = [];

  try {
    A = await setupRestaurant(unique, 1);
    B = await setupRestaurant(unique, 2);
    planIds.push(A.plan.id, B.plan.id);
    restaurantIds.push(A.restaurant.id, B.restaurant.id);

    const ownerA = await createOwner(unique, A.restaurant.id, 'a');
    emails.push(ownerA.email);

    await assert(1, 'Order COMPLETED terminates the table private game (FINISHED)', async () => {
      const game = await createPrivateGame(A.restaurant.id, A.tableA.id, GameStatus.IN_PROGRESS);
      const order = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.SERVED, 1);
      const res = await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'COMPLETED' });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const g = await prisma.gameSession.findUnique({ where: { id: game.id } });
      if (g!.status !== GameStatus.FINISHED) throw new Error(`expected FINISHED, got ${g!.status}`);
    });

    await assert(2, 'Order CANCELLED (PATCH status) cancels the table private game', async () => {
      const game = await createPrivateGame(A.restaurant.id, A.tableA.id, GameStatus.IN_PROGRESS);
      const order = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.PENDING, 2);
      const res = await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'CANCELLED' });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const g = await prisma.gameSession.findUnique({ where: { id: game.id } });
      if (g!.status !== GameStatus.CANCELLED) throw new Error(`expected CANCELLED, got ${g!.status}`);
    });

    await assert(3, 'Order CANCELLED (POST cancel) cancels the table private game', async () => {
      const game = await createPrivateGame(A.restaurant.id, A.tableA.id, GameStatus.WAITING);
      const order = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.PENDING, 3);
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ reason: 'test' });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const g = await prisma.gameSession.findUnique({ where: { id: game.id } });
      if (g!.status !== GameStatus.CANCELLED) throw new Error(`expected CANCELLED, got ${g!.status}`);
    });

    await assert(4, 'Wrong table: order at table B does not affect table A game', async () => {
      const game = await createPrivateGame(A.restaurant.id, A.tableA.id, GameStatus.IN_PROGRESS);
      const order = await createOrder(unique, A.restaurant.id, A.tableB.id, OrderStatus.SERVED, 4);
      await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'COMPLETED' });
      const g = await prisma.gameSession.findUnique({ where: { id: game.id } });
      if (g!.status !== GameStatus.IN_PROGRESS) throw new Error(`table A game should be unaffected, got ${g!.status}`);
    });

    await assert(5, 'Wrong restaurant: order in A does not affect restaurant B game', async () => {
      const gameB = await createPrivateGame(B.restaurant.id, B.tableA.id, GameStatus.IN_PROGRESS);
      const orderA = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.SERVED, 5);
      await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${orderA.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'COMPLETED' });
      const g = await prisma.gameSession.findUnique({ where: { id: gameB.id } });
      if (g!.status !== GameStatus.IN_PROGRESS) throw new Error(`restaurant B game should be unaffected, got ${g!.status}`);
    });

    await assert(6, 'Repeated status update is idempotent (no duplicate termination)', async () => {
      const game = await createPrivateGame(A.restaurant.id, A.tableA.id, GameStatus.IN_PROGRESS);
      const order1 = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.SERVED, 6);
      await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${order1.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'COMPLETED' });

      const order2 = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.SERVED, 7);
      await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${order2.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'COMPLETED' });

      const g = await prisma.gameSession.findUnique({ where: { id: game.id } });
      if (g!.status !== GameStatus.FINISHED) throw new Error(`expected FINISHED, got ${g!.status}`);
    });

    await assert(7, 'Random game is unaffected by order completion', async () => {
      const random = await prisma.gameSession.create({
        data: { restaurantId: A.restaurant.id, gameType: 'SNAKES_LADDERS', mode: GameMode.RANDOM, status: GameStatus.IN_PROGRESS, maxPlayers: 2, eventVersion: 1 },
      });
      await prisma.gamePlayer.create({ data: { gameSessionId: random.id, alias: 'R1', seatOrder: 0, position: 1 } });

      const order = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.SERVED, 8);
      await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'COMPLETED' });

      const g = await prisma.gameSession.findUnique({ where: { id: random.id } });
      if (g!.status !== GameStatus.IN_PROGRESS) throw new Error(`random game should be unaffected, got ${g!.status}`);
    });

    await assert(8, 'Cancelled game awards no loyalty points', async () => {
      const customer = await prisma.customer.create({
        data: { restaurantId: A.restaurant.id, name: 'Loyal Gamer', email: `ol-cust-${unique}@test.com` },
      });
      customerIds.push(customer.id);

      await createPrivateGame(A.restaurant.id, A.tableA.id, GameStatus.IN_PROGRESS, customer.id);
      const order = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.PENDING, 9);
      await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'CANCELLED' });

      const c = await prisma.customer.findUnique({ where: { id: customer.id } });
      if (c!.loyaltyPoints !== 0) throw new Error(`expected 0 points, got ${c!.loyaltyPoints}`);
      const ledger = await prisma.customerPointsLedger.count({ where: { customerId: customer.id } });
      if (ledger !== 0) throw new Error(`expected no ledger entries, got ${ledger}`);
    });

    await assert(9, 'Finished game result is preserved on order completion', async () => {
      const game = await prisma.gameSession.create({
        data: { restaurantId: A.restaurant.id, gameType: 'SNAKES_LADDERS', mode: GameMode.PRIVATE, tableId: A.tableA.id, status: GameStatus.FINISHED, maxPlayers: 2, eventVersion: 1 },
      });
      const winner = await prisma.gamePlayer.create({
        data: { gameSessionId: game.id, alias: 'Winner', seatOrder: 0, position: 100, isHost: true },
      });
      await prisma.gameSession.update({ where: { id: game.id }, data: { winnerPlayerId: winner.id } });

      const order = await createOrder(unique, A.restaurant.id, A.tableA.id, OrderStatus.SERVED, 10);
      await request(app)
        .patch(`/api/restaurants/${A.restaurant.id}/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .send({ status: 'COMPLETED' });

      const g = await prisma.gameSession.findUnique({ where: { id: game.id } });
      if (g!.status !== GameStatus.FINISHED || g!.winnerPlayerId !== winner.id) {
        throw new Error(`finished result must be preserved: ${JSON.stringify({ status: g!.status, winner: g!.winnerPlayerId })}`);
      }
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    for (const rid of restaurantIds) {
      await prisma.gameMove.deleteMany({ where: { gameSession: { restaurantId: rid } } }).catch(() => {});
      await prisma.gamePlayer.deleteMany({ where: { gameSession: { restaurantId: rid } } }).catch(() => {});
      await prisma.gameSession.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.gameConfig.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.rewardRedemption.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.reward.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.customerPointsLedger.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await RestaurantDeletionService.hardDelete(rid).catch(() => {});
    }
    if (customerIds.length) await prisma.customer.deleteMany({ where: { id: { in: customerIds } } }).catch(() => {});
    if (emails.length) await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    if (planIds.length) await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nOrder/Table Lifecycle Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
