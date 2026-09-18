import request from 'supertest';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { GameMode, GameStatus } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { GameService } from '../src/services/gameService';
import { applyMovement, rollDice, BOARD_SIZE } from '../src/constants/game';

async function setupRestaurant(unique: string, idx: number) {
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `GAME-${idx}-${unique}`, name: `Game Plan ${idx}`, price: 10, features: ['GAMES_LOYALTY'], active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: `Game Rest ${idx}`, slug: `game-rest-${idx}-${unique}`, active: true },
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

async function runTests() {
  console.log('🎲 Snakes & Ladders Game Engine Test Suite...\n');
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
  const planIds: string[] = [];
  const restaurantIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // UNIT: pure movement + dice
    // -------------------------------------------------------------------------
    await assert(1, 'Ladder advances the player upward', async () => {
      const r = applyMovement(2, 2); // 4 -> ladder to 14
      if (r.toPosition !== 14 || !r.movedByLadder) throw new Error(`expected ladder to 14, got ${JSON.stringify(r)}`);
    });

    await assert(2, 'Snake slides the player downward', async () => {
      const r = applyMovement(16, 1); // 17 -> snake to 7
      if (r.toPosition !== 7 || !r.movedBySnake) throw new Error(`expected snake to 7, got ${JSON.stringify(r)}`);
    });

    await assert(3, 'Exact landing on 100 wins', async () => {
      const r = applyMovement(97, 3);
      if (!r.won || r.toPosition !== BOARD_SIZE) throw new Error(`expected win at 100, got ${JSON.stringify(r)}`);
    });

    await assert(4, 'Beyond 100 stays in place (overshoot)', async () => {
      const r = applyMovement(98, 3);
      if (!r.overshoot || r.toPosition !== 98) throw new Error(`expected overshoot stay at 98, got ${JSON.stringify(r)}`);
    });

    await assert(5, 'Server dice always returns 1..6', async () => {
      for (let i = 0; i < 200; i++) {
        const d = rollDice();
        if (d < 1 || d > 6) throw new Error(`dice out of range: ${d}`);
      }
    });

    // -------------------------------------------------------------------------
    // INTEGRATION: setup two isolated restaurants
    // -------------------------------------------------------------------------
    A = await setupRestaurant(unique, 1);
    B = await setupRestaurant(unique, 2);
    planIds.push(A.plan.id, B.plan.id);
    restaurantIds.push(A.restaurant.id, B.restaurant.id);

    // -------------------------------------------------------------------------
    // PRIVATE lifecycle
    // -------------------------------------------------------------------------
    let sessionId = '';
    let aliceToken = '';
    let bobToken = '';
    let alicePlayerId = '';
    let bobPlayerId = '';

    await assert(6, 'Private create issues a scoped player token', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableA.id, alias: 'Alice', playerKey: `alice-${unique}` });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      sessionId = res.body.data.session.id;
      aliceToken = res.body.data.token;
      alicePlayerId = res.body.data.player.id;
      if (!sessionId || !aliceToken) throw new Error('missing session/token in response');
    });

    await assert(7, 'Same-table join is allowed before start', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sessionId}/join`)
        .send({ tableId: A.tableA.id, alias: 'Bob', playerKey: `bob-${unique}` });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      bobToken = res.body.data.token;
      bobPlayerId = res.body.data.player.id;
    });

    await assert(8, 'Cross-table join is rejected', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sessionId}/join`)
        .send({ tableId: A.tableB.id, alias: 'Eve', playerKey: `eve-${unique}` });
      if (res.status !== 403 || res.body.errorCode !== 'CROSS_TABLE_JOIN_FORBIDDEN') {
        throw new Error(`expected 403 CROSS_TABLE_JOIN_FORBIDDEN, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(9, 'Table waiting-game discovery returns the waiting lobby', async () => {
      const res = await request(app).get(`/api/restaurants/${A.restaurant.id}/games/table/${A.tableA.id}`);
      if (res.status !== 200 || !res.body.data.game || res.body.data.game.id !== sessionId) {
        throw new Error(`expected waiting game, got ${JSON.stringify(res.body)}`);
      }
    });

    await assert(10, 'Host starts the game once minPlayers met', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sessionId}/start`)
        .set('Authorization', `Bearer ${aliceToken}`);
      if (res.status !== 200 || res.body.data.game.status !== 'IN_PROGRESS') {
        throw new Error(`expected start, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(11, 'Out-of-turn roll is rejected', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sessionId}/roll`)
        .set('Authorization', `Bearer ${bobToken}`);
      if (res.status !== 409 || res.body.errorCode !== 'NOT_YOUR_TURN') {
        throw new Error(`expected 409 NOT_YOUR_TURN, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(12, 'Valid roll advances the turn', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sessionId}/roll`)
        .set('Authorization', `Bearer ${aliceToken}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data.session.currentTurnPlayerId !== bobPlayerId) {
        throw new Error('turn did not advance to Bob');
      }
    });

    await assert(13, 'Token is scoped: Alice token cannot access restaurant B session', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${B.restaurant.id}/games/${sessionId}`)
        .set('Authorization', `Bearer ${aliceToken}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
    });

    await assert(14, 'Finished-game protection: roll after finish is rejected', async () => {
      await prisma.gameSession.update({ where: { id: sessionId }, data: { status: GameStatus.FINISHED, endedAt: new Date() } });
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sessionId}/roll`)
        .set('Authorization', `Bearer ${aliceToken}`);
      if (res.status !== 409 || res.body.errorCode !== 'GAME_ENDED') {
        throw new Error(`expected 409 GAME_ENDED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // -------------------------------------------------------------------------
    // RANDOM matchmaking
    // -------------------------------------------------------------------------
    await assert(15, 'Random matching puts same-restaurant players in one session', async () => {
      const p1 = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/random`).send({ alias: 'P1', playerKey: `p1-${unique}` });
      const p2 = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/random`).send({ alias: 'P2', playerKey: `p2-${unique}` });
      if (p1.status !== 201 || p2.status !== 201) throw new Error(`join random failed: ${p1.status}/${p2.status}`);
      if (p1.body.data.session.id !== p2.body.data.session.id) throw new Error('players were not matched into the same session');
      if (p2.body.data.session.tableId !== null) throw new Error('random session must not expose tableId');
    });

    await assert(16, 'Cross-restaurant matching never merges sessions', async () => {
      const qA = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/random`).send({ alias: 'QA', playerKey: `qa-${unique}` });
      const qB = await request(app).post(`/api/restaurants/${B.restaurant.id}/games/random`).send({ alias: 'QB', playerKey: `qb-${unique}` });
      if (qA.body.data.session.id === qB.body.data.session.id) throw new Error('cross-restaurant sessions merged');
    });

    await assert(17, 'A player cannot join two active games (playerKey guard)', async () => {
      const first = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/random`).send({ alias: 'Dup', playerKey: `dup-${unique}` });
      if (first.status !== 201) throw new Error(`first join failed ${first.status}`);
      const second = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/random`).send({ alias: 'Dup2', playerKey: `dup-${unique}` });
      if (second.status !== 409 || second.body.errorCode !== 'ALREADY_IN_GAME') {
        throw new Error(`expected 409 ALREADY_IN_GAME, got ${second.status}: ${JSON.stringify(second.body)}`);
      }
    });

    // -------------------------------------------------------------------------
    // LIMITS, CANCEL, LEAVE, WIN
    // -------------------------------------------------------------------------
    await assert(18, 'Starting below minPlayers is rejected', async () => {
      const solo = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/private`).send({ tableId: A.tableA.id, alias: 'Solo', playerKey: `solo-${unique}` });
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${solo.body.data.session.id}/start`)
        .set('Authorization', `Bearer ${solo.body.data.token}`);
      if (res.status !== 409 || res.body.errorCode !== 'NOT_ENOUGH_PLAYERS') {
        throw new Error(`expected 409 NOT_ENOUGH_PLAYERS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(19, 'Host can cancel a waiting game', async () => {
      const lobby = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/private`).send({ tableId: A.tableA.id, alias: 'CancelHost', playerKey: `cancel-${unique}` });
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${lobby.body.data.session.id}/cancel`)
        .set('Authorization', `Bearer ${lobby.body.data.token}`);
      if (res.status !== 200 || res.body.data.game.status !== 'CANCELLED') {
        throw new Error(`expected cancel, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(20, 'Player can leave a waiting lobby', async () => {
      const lobby = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/private`).send({ tableId: A.tableA.id, alias: 'LeaveHost', playerKey: `leave-${unique}` });
      const joiner = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/${lobby.body.data.session.id}/join`).send({ tableId: A.tableA.id, alias: 'LeaveJoiner', playerKey: `leavej-${unique}` });
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${lobby.body.data.session.id}/leave`)
        .set('Authorization', `Bearer ${joiner.body.data.token}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const after = await prisma.gamePlayer.count({ where: { gameSessionId: lobby.body.data.session.id } });
      if (after !== 1) throw new Error(`expected 1 remaining player, got ${after}`);
    });

    await assert(21, 'Win triggers FINISHED via deterministic injected dice', async () => {
      const g = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/private`).send({ tableId: A.tableA.id, alias: 'Winner', playerKey: `win-${unique}` });
      const sid = g.body.data.session.id;
      const pid = g.body.data.player.id;
      const j = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/${sid}/join`).send({ tableId: A.tableA.id, alias: 'Other', playerKey: `win2-${unique}` });
      await request(app).post(`/api/restaurants/${A.restaurant.id}/games/${sid}/start`).set('Authorization', `Bearer ${g.body.data.token}`);

      // Move the winner to square 97, then force a roll of 3 to land on 100.
      await prisma.gamePlayer.update({ where: { id: pid }, data: { position: 97 } });
      const res = await GameService.roll(A.restaurant.id, sid, pid, () => 3);
      if (!res.won || res.session.status !== 'FINISHED' || res.session.winnerPlayerId !== pid) {
        throw new Error(`expected win/finish, got ${JSON.stringify(res)}`);
      }
    });

    await assert(22, 'Concurrent rolls for the same turn are protected', async () => {
      const g = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/private`).send({ tableId: A.tableA.id, alias: 'Race', playerKey: `race-${unique}` });
      const sid = g.body.data.session.id;
      const pid = g.body.data.player.id;
      await request(app).post(`/api/restaurants/${A.restaurant.id}/games/${sid}/join`).send({ tableId: A.tableA.id, alias: 'Race2', playerKey: `race2-${unique}` });
      await request(app).post(`/api/restaurants/${A.restaurant.id}/games/${sid}/start`).set('Authorization', `Bearer ${g.body.data.token}`);

      const results = await Promise.allSettled([
        GameService.roll(A.restaurant.id, sid, pid, () => 2),
        GameService.roll(A.restaurant.id, sid, pid, () => 5),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      if (fulfilled.length !== 1) {
        throw new Error(`expected exactly one concurrent roll to succeed, got ${fulfilled.length}`);
      }
    });

    await assert(23, 'Tenant isolation: player token cannot read another restaurant session', async () => {
      const gA = await request(app).post(`/api/restaurants/${A.restaurant.id}/games/private`).send({ tableId: A.tableA.id, alias: 'IsoA', playerKey: `isoa-${unique}` });
      const res = await request(app)
        .get(`/api/restaurants/${B.restaurant.id}/games/${gA.body.data.session.id}`)
        .set('Authorization', `Bearer ${gA.body.data.token}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });

    // -------------------------------------------------------------------------
    // PLAYER IDENTITY READINESS (Phase 6A)
    // -------------------------------------------------------------------------
    const customerA = await prisma.customer.create({
      data: { restaurantId: A.restaurant.id, name: 'Loyal Gamer', email: `loyal-${unique}@test.com` },
    });
    const customerB = await prisma.customer.create({
      data: { restaurantId: B.restaurant.id, name: 'Other Tenant', email: `other-${unique}@test.com` },
    });

    await assert(24, 'Anonymous player remains valid with null customerId', async () => {
      const g = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableA.id, alias: 'Anon', playerKey: `anon-${unique}` });
      if (g.status !== 201) throw new Error(`expected 201, got ${g.status}: ${JSON.stringify(g.body)}`);
      const row = await prisma.gamePlayer.findUnique({ where: { id: g.body.data.player.id } });
      if (row?.customerId !== null) throw new Error(`expected null customerId, got ${row?.customerId}`);
    });

    await assert(25, 'Customer-linked player persists customerId without duplicating identity', async () => {
      const before = await prisma.customer.count({ where: { restaurantId: A.restaurant.id } });
      const g = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableA.id, alias: 'Linked', playerKey: `linked-${unique}`, customerId: customerA.id });
      if (g.status !== 201) throw new Error(`expected 201, got ${g.status}: ${JSON.stringify(g.body)}`);
      const row = await prisma.gamePlayer.findUnique({ where: { id: g.body.data.player.id } });
      if (row?.customerId !== customerA.id) throw new Error(`expected customerId link, got ${row?.customerId}`);
      const after = await prisma.customer.count({ where: { restaurantId: A.restaurant.id } });
      if (after !== before) throw new Error(`customer identity was duplicated: ${before} -> ${after}`);
    });

    await assert(26, 'Cross-tenant customer link is rejected', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableA.id, alias: 'CrossCust', playerKey: `crosscust-${unique}`, customerId: customerB.id });
      if (res.status !== 403 || res.body.errorCode !== 'CUSTOMER_NOT_IN_RESTAURANT') {
        throw new Error(`expected 403 CUSTOMER_NOT_IN_RESTAURANT, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(27, 'Invalid customerId is rejected', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableA.id, alias: 'BadCust', playerKey: `badcust-${unique}`, customerId: 'not-a-uuid' });
      if (res.status !== 400 || res.body.errorCode !== 'INVALID_CUSTOMER_ID') {
        throw new Error(`expected 400 INVALID_CUSTOMER_ID, got ${res.status}: ${JSON.stringify(res.body)}`);
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

  console.log(`\nSnakes & Ladders Engine Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
