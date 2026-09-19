import request from 'supertest';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { GameMode, GameStatus } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { terminatePrivateGameByTable } from '../src/services/gameOrderLifecycle';

async function setupRestaurant(unique: string, idx: number) {
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `PLC-${idx}-${unique}`, name: `PLC Plan ${idx}`, price: 10, features: ['GAMES_LOYALTY'], active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: `PLC Rest ${idx}`, slug: `plc-rest-${idx}-${unique}`, active: true },
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
  return { restaurant, plan, tableA };
}

async function runTests() {
  const TOTAL = 7;
  console.log(`🧬 Game Player/Session Lifecycle Test Suite (${TOTAL} Tests)...\n`);
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
  const planIds: string[] = [];
  const restaurantIds: string[] = [];

  try {
    // 1. finished game -> same player can start next game
    await assert(1, 'Finished game no longer blocks the same playerKey', async () => {
      const R = await setupRestaurant(unique, 1);
      planIds.push(R.plan.id);
      restaurantIds.push(R.restaurant.id);

      const session = await prisma.gameSession.create({
        data: { restaurantId: R.restaurant.id, gameType: 'SNAKES_LADDERS', mode: GameMode.RANDOM, status: GameStatus.FINISHED, maxPlayers: 6, eventVersion: 1, endedAt: new Date() },
      });
      await prisma.gamePlayer.create({
        data: { gameSessionId: session.id, alias: 'Done', playerKey: `done-${unique}`, seatOrder: 0, position: 1 },
      });

      const res = await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/games/random`)
        .send({ alias: 'DoneAgain', playerKey: `done-${unique}` });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    });

    // 2. leave -> immediate rejoin
    await assert(2, 'Leave releases the player for an immediate rejoin', async () => {
      const R = await setupRestaurant(unique, 2);
      planIds.push(R.plan.id);
      restaurantIds.push(R.restaurant.id);

      const create = await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/games/private`)
        .send({ tableId: R.tableA.id, alias: 'Leaver', playerKey: `leaver-${unique}` });
      if (create.status !== 201) throw new Error(`create failed ${create.status}`);

      const leave = await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/games/${create.body.data.session.id}/leave`)
        .set('Authorization', `Bearer ${create.body.data.token}`);
      if (leave.status !== 200) throw new Error(`leave failed ${leave.status}: ${JSON.stringify(leave.body)}`);

      const rejoin = await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/games/random`)
        .send({ alias: 'LeaverAgain', playerKey: `leaver-${unique}` });
      if (rejoin.status !== 201) throw new Error(`expected 201 rejoin, got ${rejoin.status}: ${JSON.stringify(rejoin.body)}`);
    });

    // 3. expired waiting game -> rejoin
    await assert(3, 'Expired waiting lobby is released and rejoin allowed', async () => {
      const R = await setupRestaurant(unique, 3);
      planIds.push(R.plan.id);
      restaurantIds.push(R.restaurant.id);

      const session = await prisma.gameSession.create({
        data: { restaurantId: R.restaurant.id, gameType: 'SNAKES_LADDERS', mode: GameMode.RANDOM, status: GameStatus.WAITING, maxPlayers: 6, eventVersion: 1 },
      });
      await prisma.gamePlayer.create({
        data: { gameSessionId: session.id, alias: 'StaleWaiter', playerKey: `stale-wait-${unique}`, seatOrder: 0, position: 1 },
      });
      await prisma.gameSession.update({ where: { id: session.id }, data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });

      const res = await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/games/random`)
        .send({ alias: 'Fresh', playerKey: `stale-wait-${unique}` });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);

      const cancelled = await prisma.gameSession.findUnique({ where: { id: session.id } });
      if (cancelled?.status !== GameStatus.CANCELLED) throw new Error(`expected expired lobby CANCELLED, got ${cancelled?.status}`);
    });

    // 4. expired player in random game -> other players continue
    await assert(4, 'Expired player in a random game is released without ending the match', async () => {
      const R = await setupRestaurant(unique, 4);
      planIds.push(R.plan.id);
      restaurantIds.push(R.restaurant.id);

      const p1 = await request(app).post(`/api/restaurants/${R.restaurant.id}/games/random`).send({ alias: 'R1', playerKey: `r1-${unique}` });
      const p2 = await request(app).post(`/api/restaurants/${R.restaurant.id}/games/random`).send({ alias: 'R2', playerKey: `r2-${unique}` });
      if (p1.status !== 201 || p2.status !== 201) throw new Error(`join failed ${p1.status}/${p2.status}`);
      const sessionId = p1.body.data.session.id;
      const p1Id = p1.body.data.player.id;

      const staleIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
      await prisma.$executeRaw`UPDATE "game_players" SET "updated_at" = ${staleIso}::timestamp WHERE "id" = ${p1Id}::uuid`;

      const rejoin = await request(app).post(`/api/restaurants/${R.restaurant.id}/games/random`).send({ alias: 'R1Again', playerKey: `r1-${unique}` });
      if (rejoin.status !== 201) throw new Error(`expected 201 rejoin, got ${rejoin.status}: ${JSON.stringify(rejoin.body)}`);

      const session = await prisma.gameSession.findUnique({ where: { id: sessionId }, include: { players: true } });
      if (session?.status !== GameStatus.IN_PROGRESS) throw new Error(`match should continue IN_PROGRESS, got ${session?.status}`);
      if (session.players.length !== 1) throw new Error(`expected 1 remaining player, got ${session.players.length}`);
    });

    // 5. private order completed -> player released
    await assert(5, 'Completed table order releases the private game player', async () => {
      const R = await setupRestaurant(unique, 5);
      planIds.push(R.plan.id);
      restaurantIds.push(R.restaurant.id);

      const session = await prisma.gameSession.create({
        data: { restaurantId: R.restaurant.id, gameType: 'SNAKES_LADDERS', mode: GameMode.PRIVATE, tableId: R.tableA.id, status: GameStatus.IN_PROGRESS, maxPlayers: 2, eventVersion: 1 },
      });
      await prisma.gamePlayer.create({
        data: { gameSessionId: session.id, alias: 'Ordered', playerKey: `ordered-${unique}`, seatOrder: 0, position: 1, isHost: true },
      });

      await terminatePrivateGameByTable(R.restaurant.id, R.tableA.id, 'FINISHED');

      const res = await request(app).post(`/api/restaurants/${R.restaurant.id}/games/random`).send({ alias: 'OrderedAgain', playerKey: `ordered-${unique}` });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    });

    // 6. stale localStorage reference -> server rejects it
    await assert(6, 'Stale active-game reference is rejected by the server', async () => {
      const R = await setupRestaurant(unique, 6);
      planIds.push(R.plan.id);
      restaurantIds.push(R.restaurant.id);

      const create = await request(app).post(`/api/restaurants/${R.restaurant.id}/games/private`).send({ tableId: R.tableA.id, alias: 'StaleToken', playerKey: `stale-token-${unique}` });
      if (create.status !== 201) throw new Error(`create failed ${create.status}`);
      const { session, token } = create.body.data;

      await prisma.gameSession.update({ where: { id: session.id }, data: { status: GameStatus.FINISHED, endedAt: new Date() } });

      const get = await request(app).get(`/api/restaurants/${R.restaurant.id}/games/${session.id}`).set('Authorization', `Bearer ${token}`);
      if (get.status !== 409 || get.body.errorCode !== 'GAME_ENDED') {
        throw new Error(`expected 409 GAME_ENDED, got ${get.status}: ${JSON.stringify(get.body)}`);
      }
    });

    // 7. real active game -> ALREADY_IN_GAME remains correct
    await assert(7, 'A genuinely active game still returns ALREADY_IN_GAME', async () => {
      const R = await setupRestaurant(unique, 7);
      planIds.push(R.plan.id);
      restaurantIds.push(R.restaurant.id);

      const first = await request(app).post(`/api/restaurants/${R.restaurant.id}/games/random`).send({ alias: 'Active', playerKey: `active-${unique}` });
      if (first.status !== 201) throw new Error(`first join failed ${first.status}`);

      const second = await request(app).post(`/api/restaurants/${R.restaurant.id}/games/random`).send({ alias: 'ActiveAgain', playerKey: `active-${unique}` });
      if (second.status !== 409 || second.body.errorCode !== 'ALREADY_IN_GAME') {
        throw new Error(`expected 409 ALREADY_IN_GAME, got ${second.status}: ${JSON.stringify(second.body)}`);
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
    if (planIds.length) await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nGame Player/Session Lifecycle Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
