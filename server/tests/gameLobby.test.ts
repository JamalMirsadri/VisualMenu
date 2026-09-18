import request from 'supertest';
import http from 'http';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { GameMode } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';

interface SSEEvent {
  event: string;
  data: any;
}

async function startAppServer() {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  return { server, port };
}

function connectSSE(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{
    events: SSEEvent[];
    waitFor: (type: string, ms?: number) => Promise<SSEEvent>;
    close: () => void;
  }>((resolve, reject) => {
    const events: SSEEvent[] = [];
    const req = http.request({ host: '127.0.0.1', port, path, headers, method: 'GET' }, (res) => {
      let buffer = '';
      const parse = () => {
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = 'message';
          let dataStr = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (dataStr) {
            try {
              events.push({ event, data: JSON.parse(dataStr) });
            } catch {
              /* ignore ping/comment frames */
            }
          }
        }
      };
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        parse();
      });
      const waitFor = (type: string, ms = 5000) =>
        new Promise<SSEEvent>((res2, rej2) => {
          const found = events.find((e) => e.event === type);
          if (found) return res2(found);
          const timer = setTimeout(() => rej2(new Error(`timeout waiting for SSE event ${type}`)), ms);
          const interval = setInterval(() => {
            const f = events.find((e) => e.event === type);
            if (f) {
              clearTimeout(timer);
              clearInterval(interval);
              res2(f);
            }
          }, 40);
        });
      resolve({ events, waitFor, close: () => req.destroy() });
    });
    req.on('error', reject);
    req.end();
  });
}

async function setupRestaurant(
  unique: string,
  idx: number,
  opts: { features?: string[]; enabled?: boolean; minPlayers?: number; maxPlayers?: number } = {}
) {
  const features = opts.features ?? ['GAMES_LOYALTY'];
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `LOB-${idx}-${unique}`, name: `Lobby Plan ${idx}`, price: 10, features, active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: `Lobby Rest ${idx}`, slug: `lobby-rest-${idx}-${unique}`, active: true },
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
  if (features.includes('GAMES_LOYALTY')) {
    await prisma.gameConfig.create({
      data: {
        restaurantId: restaurant.id,
        enabled: opts.enabled ?? true,
        modes: [GameMode.PRIVATE, GameMode.RANDOM],
        minPlayers: opts.minPlayers ?? 2,
        maxPlayers: opts.maxPlayers ?? 6,
        turnTimeoutSeconds: 60,
      },
    });
  }
  const tableA = await prisma.table.create({ data: { restaurantId: restaurant.id, number: `A${idx}` } });
  const tableB = await prisma.table.create({ data: { restaurantId: restaurant.id, number: `B${idx}` } });
  return { restaurant, plan, tableA, tableB };
}

async function runTests() {
  const TOTAL = 6;
  console.log(`🎮 Customer Game Lobby Test Suite (${TOTAL} Tests)...\n`);
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
  let A: any, Disabled: any, NoFeature: any;
  const planIds: string[] = [];
  const restaurantIds: string[] = [];
  let server: http.Server | null = null;

  try {
    A = await setupRestaurant(unique, 1);
    Disabled = await setupRestaurant(unique, 2, { enabled: false });
    NoFeature = await setupRestaurant(unique, 3, { features: ['AI_INSIGHTS'] });
    planIds.push(A.plan.id, Disabled.plan.id, NoFeature.plan.id);
    restaurantIds.push(A.restaurant.id, Disabled.restaurant.id, NoFeature.restaurant.id);

    // -------------------------------------------------------------------------
    // PUBLIC GAME CONFIG
    // -------------------------------------------------------------------------
    await assert(1, 'Public game config returns enabled modes for entitled tenant', async () => {
      const res = await request(app).get(`/api/restaurants/${A.restaurant.id}/games/availability`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const d = res.body.data;
      if (d.enabled !== true) throw new Error('enabled should be true');
      if (!d.modes.includes('PRIVATE') || !d.modes.includes('RANDOM')) throw new Error(`modes missing: ${JSON.stringify(d.modes)}`);
      if (d.minPlayers !== 2 || d.maxPlayers !== 6) throw new Error(`player bounds wrong: ${JSON.stringify(d)}`);
      if (!Array.isArray(d.ladders) || d.ladders.length < 1) throw new Error('ladders map missing');
      if (!Array.isArray(d.snakes) || d.snakes.length < 1) throw new Error('snakes map missing');
      if (d.ladders[0].from !== 4 || d.ladders[0].to !== 14) throw new Error(`ladder map wrong: ${JSON.stringify(d.ladders[0])}`);
    });

    await assert(2, 'Public game config returns enabled=false when games are disabled', async () => {
      const res = await request(app).get(`/api/restaurants/${Disabled.restaurant.id}/games/availability`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data.enabled !== false) throw new Error('enabled should be false');
    });

    await assert(3, 'Public game config blocked without GAMES_LOYALTY (feature gate)', async () => {
      const res = await request(app).get(`/api/restaurants/${NoFeature.restaurant.id}/games/availability`);
      if (res.status !== 403 || res.body.errorCode !== 'FEATURE_NOT_AVAILABLE') {
        throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // -------------------------------------------------------------------------
    // LOBBY RULES
    // -------------------------------------------------------------------------
    await assert(4, 'Full lobby is rejected with GAME_FULL', async () => {
      // maxPlayers=1 -> host fills the only seat.
      const full = await setupRestaurant(unique, 4, { maxPlayers: 1 });
      planIds.push(full.plan.id);
      restaurantIds.push(full.restaurant.id);

      const create = await request(app)
        .post(`/api/restaurants/${full.restaurant.id}/games/private`)
        .send({ tableId: full.tableA.id, alias: 'Host', playerKey: `full-host-${unique}` });
      if (create.status !== 201) throw new Error(`create failed: ${create.status}`);

      const join = await request(app)
        .post(`/api/restaurants/${full.restaurant.id}/games/${create.body.data.session.id}/join`)
        .send({ tableId: full.tableA.id, alias: 'Late', playerKey: `full-late-${unique}` });
      if (join.status !== 409 || join.body.errorCode !== 'GAME_FULL') {
        throw new Error(`expected 409 GAME_FULL, got ${join.status}: ${JSON.stringify(join.body)}`);
      }
    });

    await assert(5, 'Joining after start is rejected with GAME_NOT_JOINABLE', async () => {
      const create = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableA.id, alias: 'Alice', playerKey: `lock-a-${unique}` });
      const sid = create.body.data.session.id;
      const hostToken = create.body.data.token;
      await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sid}/join`)
        .send({ tableId: A.tableA.id, alias: 'Bob', playerKey: `lock-b-${unique}` });
      await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sid}/start`)
        .set('Authorization', `Bearer ${hostToken}`);

      const late = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sid}/join`)
        .send({ tableId: A.tableA.id, alias: 'Late', playerKey: `lock-late-${unique}` });
      if (late.status !== 409 || late.body.errorCode !== 'GAME_NOT_JOINABLE') {
        throw new Error(`expected 409 GAME_NOT_JOINABLE, got ${late.status}: ${JSON.stringify(late.body)}`);
      }
    });

    // -------------------------------------------------------------------------
    // SSE VIA ?token= (EventSource-compatible)
    // -------------------------------------------------------------------------
    await assert(6, 'Game SSE authenticates via ?token= query param (EventSource)', async () => {
      const create = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableB.id, alias: 'QToken', playerKey: `qt-${unique}` });
      const sid = create.body.data.session.id;
      const token = create.body.data.token;

      server = (await startAppServer()).server;
      const port = (server.address() as any).port;

      const c = await connectSSE(
        port,
        `/api/restaurants/${A.restaurant.id}/games/${sid}/events?token=${encodeURIComponent(token)}`,
        {}
      );
      const snap = await c.waitFor('GAME_SNAPSHOT');
      if (!snap.data.snapshot || snap.data.snapshot.id !== sid) {
        throw new Error(`snapshot missing/wrong: ${JSON.stringify(snap.data)}`);
      }
      c.close();
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (server) server.close();
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

  console.log(`\nCustomer Game Lobby Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
