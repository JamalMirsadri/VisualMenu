import request from 'supertest';
import http from 'http';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { GameMode } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { GameService } from '../src/services/gameService';

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

async function setupRestaurant(unique: string, idx: number) {
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `RT-${idx}-${unique}`, name: `RT Plan ${idx}`, price: 10, features: ['GAMES_LOYALTY'], active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: `RT Rest ${idx}`, slug: `rt-rest-${idx}-${unique}`, active: true },
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
  console.log('📡 Game Realtime SSE Test Suite...\n');
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
  let server: http.Server | null = null;

  try {
    A = await setupRestaurant(unique, 1);
    B = await setupRestaurant(unique, 2);
    planIds.push(A.plan.id, B.plan.id);
    restaurantIds.push(A.restaurant.id, B.restaurant.id);

    // Create a private game with host Alice + player Bob, then start it.
    const create = await request(app)
      .post(`/api/restaurants/${A.restaurant.id}/games/private`)
      .send({ tableId: A.tableA.id, alias: 'Alice', playerKey: `rt-a-${unique}` });
    const sid = create.body.data.session.id;
    const aliceToken = create.body.data.token;
    const join = await request(app)
      .post(`/api/restaurants/${A.restaurant.id}/games/${sid}/join`)
      .send({ tableId: A.tableA.id, alias: 'Bob', playerKey: `rt-b-${unique}` });
    const bobToken = join.body.data.token;
    await request(app)
      .post(`/api/restaurants/${A.restaurant.id}/games/${sid}/start`)
      .set('Authorization', `Bearer ${aliceToken}`);

    server = (await startAppServer()).server;
    const port = (server.address() as any).port;

    await assert(1, 'SSE auth: missing token is rejected (401)', async () => {
      const res = await request(app).get(`/api/restaurants/${A.restaurant.id}/games/${sid}/events`);
      if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
    });

    await assert(2, 'SSE auth: invalid token is rejected (401)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${A.restaurant.id}/games/${sid}/events`)
        .set('Authorization', 'Bearer invalid-token');
      if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
    });

    await assert(3, 'Cross-game subscription rejection: Bob token cannot read a different game', async () => {
      const other = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableB.id, alias: 'Other', playerKey: `rt-other-${unique}` });
      const res = await request(app)
        .get(`/api/restaurants/${A.restaurant.id}/games/${other.body.data.session.id}/events`)
        .set('Authorization', `Bearer ${aliceToken}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });

    await assert(4, 'Game SSE sends an authoritative snapshot immediately', async () => {
      const c = await connectSSE(port, `/api/restaurants/${A.restaurant.id}/games/${sid}/events`, {
        Authorization: `Bearer ${aliceToken}`,
      });
      const snap = await c.waitFor('GAME_SNAPSHOT');
      if (!snap.data.snapshot || !snap.data.snapshot.players || snap.data.snapshot.players.length !== 2) {
        throw new Error(`snapshot missing players: ${JSON.stringify(snap.data)}`);
      }
      if (typeof snap.data.version !== 'number') throw new Error(`snapshot missing version: ${JSON.stringify(snap.data)}`);
      c.close();
    });

    await assert(5, 'Game SSE broadcasts DICE_ROLLED + TURN_CHANGED on roll', async () => {
      const c = await connectSSE(port, `/api/restaurants/${A.restaurant.id}/games/${sid}/events`, {
        Authorization: `Bearer ${aliceToken}`,
      });
      await c.waitFor('GAME_SNAPSHOT');
      await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sid}/roll`)
        .set('Authorization', `Bearer ${aliceToken}`);
      await c.waitFor('DICE_ROLLED');
      await c.waitFor('TURN_CHANGED');
      c.close();
    });

    await assert(6, 'Reconnect snapshot resyncs from PostgreSQL (missed-event recovery)', async () => {
      const c1 = await connectSSE(port, `/api/restaurants/${A.restaurant.id}/games/${sid}/events`, {
        Authorization: `Bearer ${bobToken}`,
      });
      const before = await c1.waitFor('GAME_SNAPSHOT');
      c1.close();

      // Bob rolls while disconnected.
      await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${sid}/roll`)
        .set('Authorization', `Bearer ${bobToken}`);

      const c2 = await connectSSE(port, `/api/restaurants/${A.restaurant.id}/games/${sid}/events`, {
        Authorization: `Bearer ${bobToken}`,
      });
      const after = await c2.waitFor('GAME_SNAPSHOT');
      if (after.data.version <= before.data.version) {
        throw new Error(`snapshot version did not advance: ${before.data.version} -> ${after.data.version}`);
      }
      c2.close();
    });

    await assert(7, 'Random identity privacy: snapshot/events expose no customerId/tableId', async () => {
      const r = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/random`)
        .send({ alias: 'Rand', playerKey: `rt-rand-${unique}` });
      const rSid = r.body.data.session.id;
      const rToken = r.body.data.token;

      const c = await connectSSE(port, `/api/restaurants/${A.restaurant.id}/games/${rSid}/events`, {
        Authorization: `Bearer ${rToken}`,
      });
      const snap = await c.waitFor('GAME_SNAPSHOT');
      if (snap.data.snapshot.tableId !== null) throw new Error('random snapshot leaked tableId');
      const raw = JSON.stringify(snap.data);
      if (raw.includes('customerId')) throw new Error('random snapshot leaked customerId');
      c.close();
    });

    await assert(8, 'Private table discovery SSE exposes safe lobby info + PLAYER_JOINED', async () => {
      const c = await connectSSE(port, `/api/restaurants/${A.restaurant.id}/games/table/${A.tableB.id}/events`, {});
      const snap = await c.waitFor('TABLE_SNAPSHOT');
      if (!snap.data || snap.data.tableId !== A.tableB.id) throw new Error(`bad table snapshot: ${JSON.stringify(snap.data)}`);

      // Another player joins a new lobby at tableB; discovery should broadcast PLAYER_JOINED.
      await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableB.id, alias: 'Discover', playerKey: `rt-disc-${unique}` });
      const joined = await c.waitFor('PLAYER_JOINED');
      if (!joined.data.player || joined.data.player.alias !== 'Discover') {
        throw new Error(`expected PLAYER_JOINED for Discover: ${JSON.stringify(joined.data)}`);
      }
      c.close();
    });

    await assert(9, 'Tenant isolation: Alice token cannot open SSE in restaurant B', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${B.restaurant.id}/games/${sid}/events`)
        .set('Authorization', `Bearer ${aliceToken}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });

    await assert(10, 'Linked customer identity is never exposed in game state or SSE snapshot', async () => {
      const customer = await prisma.customer.create({
        data: { restaurantId: A.restaurant.id, name: 'Private Gamer', email: `priv-${unique}@test.com` },
      });
      const g = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableA.id, alias: 'PrivLink', playerKey: `privlink-${unique}`, customerId: customer.id });
      if (g.status !== 201) throw new Error(`expected 201, got ${g.status}: ${JSON.stringify(g.body)}`);

      const token = g.body.data.token;
      const gsid = g.body.data.session.id;

      const getRes = await request(app)
        .get(`/api/restaurants/${A.restaurant.id}/games/${gsid}`)
        .set('Authorization', `Bearer ${token}`);
      const rawGet = JSON.stringify(getRes.body);
      if (rawGet.includes('customerId') || rawGet.includes('taxId')) {
        throw new Error(`game state leaked identity fields: ${rawGet}`);
      }

      const c = await connectSSE(port, `/api/restaurants/${A.restaurant.id}/games/${gsid}/events`, {
        Authorization: `Bearer ${token}`,
      });
      const snap = await c.waitFor('GAME_SNAPSHOT');
      const rawSnap = JSON.stringify(snap.data);
      if (rawSnap.includes('customerId') || rawSnap.includes('taxId')) {
        throw new Error(`snapshot leaked identity fields: ${rawSnap}`);
      }
      c.close();
    });

    await assert(11, 'Snake/ladder movement broadcasts SNAKE_LADDER event', async () => {
      const g = await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/private`)
        .send({ tableId: A.tableA.id, alias: 'SnakeHost', playerKey: `snake-host-${unique}` });
      const gsid = g.body.data.session.id;
      const hostToken = g.body.data.token;
      const hostPlayerId = g.body.data.player.id;

      await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${gsid}/join`)
        .send({ tableId: A.tableA.id, alias: 'SnakeGuest', playerKey: `snake-guest-${unique}` });
      await request(app)
        .post(`/api/restaurants/${A.restaurant.id}/games/${gsid}/start`)
        .set('Authorization', `Bearer ${hostToken}`);

      // Place the host on square 16 so a deterministic dice=1 lands on 17 -> snake to 7.
      await prisma.gamePlayer.update({ where: { id: hostPlayerId }, data: { position: 16 } });

      const c = await connectSSE(port, `/api/restaurants/${A.restaurant.id}/games/${gsid}/events?token=${encodeURIComponent(hostToken)}`, {});
      await c.waitFor('GAME_SNAPSHOT');

      await GameService.roll(A.restaurant.id, gsid, hostPlayerId, () => 1);

      const rolled = await c.waitFor('DICE_ROLLED');
      if (rolled.data.fromPosition !== 16 || rolled.data.toPosition !== 7) {
        throw new Error(`dice rolled positions wrong: ${JSON.stringify(rolled.data)}`);
      }
      const sl = await c.waitFor('SNAKE_LADDER');
      if (!sl.data.movedBySnake || sl.data.toPosition !== 7) {
        throw new Error(`snake_ladder event wrong: ${JSON.stringify(sl.data)}`);
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

  console.log(`\nGame Realtime SSE Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
