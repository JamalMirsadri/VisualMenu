import http from 'http';
import request from 'supertest';
import './setup';
import { createRestaurantWithSubscription } from './helpers';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { realtimeService } from '../src/services/realtimeService';
import { OrderStatus, OrderItemStatus, Role } from '@prisma/client';

interface SseMessage {
  event: string;
  data: any;
}

function createSseClient(url: string, headers: Record<string, string> = {}) {
  const messages: SseMessage[] = [];
  const listeners: Array<(msg: SseMessage) => void> = [];

  const parsedUrl = new URL(url);
  const req = http.request({
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...headers,
    },
  });

  let buffer = '';
  let currentEvent = 'message';

  req.on('response', (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          currentEvent = 'message';
          continue;
        }
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.replace(/^event:\s*/, '');
        } else if (trimmed.startsWith('data:')) {
          const rawData = trimmed.replace(/^data:\s*/, '');
          try {
            const data = JSON.parse(rawData);
            const msg: SseMessage = { event: currentEvent, data };
            messages.push(msg);
            for (const listener of listeners) {
              listener(msg);
            }
          } catch {
            // raw text if not json
          }
        }
      }
    });
  });

  req.end();

  return {
    req,
    messages,
    close: () => req.destroy(),
    waitForEvent: (
      predicate: (msg: SseMessage) => boolean,
      timeoutMs = 5000
    ): Promise<SseMessage> => {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout waiting for SSE event (${timeoutMs}ms)`));
        }, timeoutMs);

        const handler = (msg: SseMessage) => {
          if (predicate(msg)) {
            clearTimeout(timeout);
            const idx = listeners.indexOf(handler);
            if (idx !== -1) listeners.splice(idx, 1);
            resolve(msg);
          }
        };
        listeners.push(handler);
      });
    },
    assertNoEvent: (
      predicate: (msg: SseMessage) => boolean,
      waitMs = 800
    ): Promise<void> => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = listeners.indexOf(handler);
          if (idx !== -1) listeners.splice(idx, 1);
          resolve();
        }, waitMs);

        const handler = (msg: SseMessage) => {
          if (predicate(msg)) {
            clearTimeout(timer);
            const idx = listeners.indexOf(handler);
            if (idx !== -1) listeners.splice(idx, 1);
            reject(new Error(`Forbidden event was received: ${JSON.stringify(msg)}`));
          }
        };
        listeners.push(handler);
      });
    },
  };
}

async function runRealtimeTests() {
  console.log('⚡ Starting Section 12A Real-Time Customer Order Status Test Suite...\n');
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

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let staffToken = '';
  let restaurantAId = '';
  let restaurantBId = '';
  let foodAId = '';
  let foodBId = '';
  let orderAId = '';
  let orderAPublicToken = '';
  let orderAItemId = '';
  let orderBId = '';
  let orderBPublicToken = '';
  let clientA: ReturnType<typeof createSseClient> | null = null;
  let clientStaffA: ReturnType<typeof createSseClient> | null = null;

  try {
    // 0. Setup test restaurants, dishes, users, and orders
    const ownerLogin = await request(app).post('/api/auth/login').send({
      email: 'owner@auradining.com',
      password: 'Password123!',
    });
    staffToken = ownerLogin.body.data.token;

    const restA = await createRestaurantWithSubscription({
      data: {
        name: 'Realtime Bistro Alpha',
        slug: `rt-bistro-alpha-${Date.now()}`,
        currency: 'USD',
        currencySymbol: '$',
        active: true,
      },
    });
    restaurantAId = restA.id;

    // Associate owner with restaurant A
    const ownerUser = await prisma.user.findUnique({
      where: { email: 'owner@auradining.com' },
    });
    if (ownerUser) {
      await prisma.userRestaurant.create({
        data: {
          userId: ownerUser.id,
          restaurantId: restaurantAId,
          role: Role.OWNER,
        },
      });
    }

    const restB = await createRestaurantWithSubscription({
      data: {
        name: 'Realtime Bistro Beta',
        slug: `rt-bistro-beta-${Date.now()}`,
        currency: 'USD',
        currencySymbol: '$',
        active: true,
      },
    });
    restaurantBId = restB.id;

    const catA = await prisma.category.create({
      data: { name: 'Mains', slug: 'mains-a', restaurantId: restaurantAId },
    });
    const dishA = await prisma.foodItem.create({
      data: {
        name: 'Truffle Wagyu Burger',
        slug: 'truffle-wagyu-burger',
        price: 28.0,
        categoryId: catA.id,
        restaurantId: restaurantAId,
        available: true,
      },
    });
    foodAId = dishA.id;

    const catB = await prisma.category.create({
      data: { name: 'Mains', slug: 'mains-b', restaurantId: restaurantBId },
    });
    const dishB = await prisma.foodItem.create({
      data: {
        name: 'Lobster Ravioli',
        slug: 'lobster-ravioli',
        price: 36.0,
        categoryId: catB.id,
        restaurantId: restaurantBId,
        available: true,
      },
    });
    foodBId = dishB.id;

    // Create Order A
    const createOrderRes = await request(app)
      .post('/api/orders')
      .send({
        restaurantSlug: restA.slug,
        customerNote: 'Corner table seating',
        items: [{ foodItemId: foodAId, quantity: 1, customerNote: 'Medium rare' }],
      });
    orderAId = createOrderRes.body.data.id;
    orderAPublicToken = createOrderRes.body.data.publicToken;
    orderAItemId = createOrderRes.body.data.items[0].id;

    // Create Order B in Restaurant A
    const createOrderBRes = await request(app)
      .post('/api/orders')
      .send({
        restaurantSlug: restA.slug,
        items: [{ foodItemId: foodAId, quantity: 2 }],
      });
    orderBId = createOrderBRes.body.data.id;
    orderBPublicToken = createOrderBRes.body.data.publicToken;

    // =========================================================================
    // TEST 1: Customer connects to SSE order stream
    // =========================================================================
    await assert('1. Customer connects to SSE stream and receives initial connection handshake', async () => {
      clientA = createSseClient(`${baseUrl}/api/orders/track/${orderAPublicToken}/events`);
      const event = await clientA.waitForEvent(
        (m) => m.event === 'connected' || m.event === 'CONNECTED'
      );
      if (!event) throw new Error('Failed to receive initial connected event');
      if (event.data.channel !== `order:${orderAPublicToken}`) {
        throw new Error(`Unexpected channel in connected event: ${event.data.channel}`);
      }
    });

    // =========================================================================
    // TEST 2: Kitchen transitions PENDING -> CONFIRMED
    // =========================================================================
    await assert('2. Kitchen changes PENDING -> CONFIRMED; Customer receives order_status_changed', async () => {
      if (!clientA) throw new Error('Client A not initialized');

      const updateRes = await request(app)
        .patch(`/api/restaurants/${restaurantAId}/orders/${orderAId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.CONFIRMED });

      if (updateRes.status !== 200) {
        throw new Error(`Status update failed: ${updateRes.status} ${JSON.stringify(updateRes.body)}`);
      }

      const evt = await clientA.waitForEvent(
        (m) =>
          (m.event === 'order_status_changed' || m.event === 'ORDER_STATUS_CHANGED') &&
          m.data.newStatus === 'CONFIRMED'
      );

      if (!evt) throw new Error('Did not receive CONFIRMED event');
      if (evt.data.orderId !== orderAId) throw new Error('Mismatched orderId in event');
      if (evt.data.publicOrderToken !== orderAPublicToken) {
        throw new Error('Mismatched publicOrderToken in event');
      }
      if (evt.data.previousStatus !== 'PENDING') {
        throw new Error(`Expected previousStatus PENDING, got ${evt.data.previousStatus}`);
      }
    });

    // =========================================================================
    // TEST 3: Kitchen transitions CONFIRMED -> PREPARING
    // =========================================================================
    await assert('3. Kitchen changes CONFIRMED -> PREPARING; Customer receives order_status_changed', async () => {
      if (!clientA) throw new Error('Client A not initialized');

      await request(app)
        .patch(`/api/restaurants/${restaurantAId}/orders/${orderAId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.PREPARING });

      const evt = await clientA.waitForEvent(
        (m) =>
          (m.event === 'order_status_changed' || m.event === 'ORDER_STATUS_CHANGED') &&
          m.data.newStatus === 'PREPARING'
      );

      if (!evt) throw new Error('Did not receive PREPARING event');
      if (evt.data.previousStatus !== 'CONFIRMED') {
        throw new Error(`Expected previousStatus CONFIRMED, got ${evt.data.previousStatus}`);
      }
    });

    // =========================================================================
    // TEST 4: Kitchen transitions PREPARING -> READY
    // =========================================================================
    await assert('4. Kitchen changes PREPARING -> READY; Customer receives order_status_changed', async () => {
      if (!clientA) throw new Error('Client A not initialized');

      await request(app)
        .patch(`/api/restaurants/${restaurantAId}/orders/${orderAId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.READY });

      const evt = await clientA.waitForEvent(
        (m) =>
          (m.event === 'order_status_changed' || m.event === 'ORDER_STATUS_CHANGED') &&
          m.data.newStatus === 'READY'
      );

      if (!evt) throw new Error('Did not receive READY event');
      if (evt.data.previousStatus !== 'PREPARING') {
        throw new Error(`Expected previousStatus PREPARING, got ${evt.data.previousStatus}`);
      }
    });

    // =========================================================================
    // TEST 5: Kitchen transitions READY -> SERVED
    // =========================================================================
    await assert('5. Kitchen changes READY -> SERVED; Customer receives order_status_changed', async () => {
      if (!clientA) throw new Error('Client A not initialized');

      await request(app)
        .patch(`/api/restaurants/${restaurantAId}/orders/${orderAId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.SERVED });

      const evt = await clientA.waitForEvent(
        (m) =>
          (m.event === 'order_status_changed' || m.event === 'ORDER_STATUS_CHANGED') &&
          m.data.newStatus === 'SERVED'
      );

      if (!evt) throw new Error('Did not receive SERVED event');
      if (evt.data.previousStatus !== 'READY') {
        throw new Error(`Expected previousStatus READY, got ${evt.data.previousStatus}`);
      }
    });

    // =========================================================================
    // TEST 6: Item-level status transition emits order_item_status_changed
    // =========================================================================
    await assert('6. Kitchen updates item status; Customer receives order_item_status_changed', async () => {
      if (!clientA) throw new Error('Client A not initialized');

      const patchItemRes = await request(app)
        .patch(`/api/restaurants/${restaurantAId}/orders/${orderAId}/items/${orderAItemId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderItemStatus.READY });

      if (patchItemRes.status !== 200) {
        throw new Error(`Item status update failed: ${JSON.stringify(patchItemRes.body)}`);
      }

      const evt = await clientA.waitForEvent(
        (m) =>
          (m.event === 'order_item_status_changed' || m.event === 'ORDER_ITEM_STATUS_CHANGED') &&
          m.data.itemId === orderAItemId
      );

      if (!evt) throw new Error('Did not receive order_item_status_changed event');
      if (evt.data.newStatus !== 'READY') {
        throw new Error(`Expected item status READY, got ${evt.data.newStatus}`);
      }
      if (evt.data.publicOrderToken !== orderAPublicToken) {
        throw new Error('Mismatched publicOrderToken in item event');
      }
    });

    // =========================================================================
    // TEST 7: Multi-tenant isolation: Order B receives no events from Order A
    // =========================================================================
    await assert('7. Multi-tenant Order Isolation: Customer on Order A receives NO events for Order B', async () => {
      if (!clientA) throw new Error('Client A not initialized');

      // Kitchen advances Order B
      await request(app)
        .patch(`/api/restaurants/${restaurantAId}/orders/${orderBId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.CONFIRMED });

      // Client A must NOT receive any event for Order B
      await clientA.assertNoEvent(
        (m) =>
          m.data?.orderId === orderBId ||
          m.data?.publicOrderToken === orderBPublicToken,
        800
      );
    });

    // =========================================================================
    // TEST 8: Multi-tenant isolation: Customer receives no events from Restaurant B
    // =========================================================================
    await assert('8. Multi-tenant Restaurant Isolation: Customer A receives NO events from Restaurant B', async () => {
      if (!clientA) throw new Error('Client A not initialized');

      // Create order in Restaurant B
      const orderInB = await request(app)
        .post('/api/orders')
        .send({
          restaurantSlug: restB.slug,
          items: [{ foodItemId: foodBId, quantity: 1 }],
        });
      const orderInBId = orderInB.body.data.id;

      // Transition order in Restaurant B
      await request(app)
        .patch(`/api/restaurants/${restaurantBId}/orders/${orderInBId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.CONFIRMED });

      // Client A must NOT receive any event from Restaurant B
      await clientA.assertNoEvent(
        (m) => m.data?.orderId === orderInBId,
        800
      );

      // Clean up order in B
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: orderInBId } });
      await prisma.orderItem.deleteMany({ where: { orderId: orderInBId } });
      await prisma.order.delete({ where: { id: orderInBId } });
    });

    // =========================================================================
    // TEST 9: Restaurant staff channel isolation
    // =========================================================================
    await assert('9. Staff Channel Isolation: Staff for Restaurant A receives NO events from Restaurant B', async () => {
      clientStaffA = createSseClient(
        `${baseUrl}/api/restaurants/${restaurantAId}/events?token=${encodeURIComponent(staffToken)}`
      );
      await clientStaffA.waitForEvent((m) => m.event === 'connected' || m.event === 'CONNECTED');

      // Emit event on Restaurant B
      realtimeService.broadcast(`restaurant:${restaurantBId}`, 'order_created', {
        orderId: 'rest-b-dummy-order',
      });

      // Staff A should not receive it
      await clientStaffA.assertNoEvent(
        (m) => m.data?.orderId === 'rest-b-dummy-order',
        800
      );
    });

    // =========================================================================
    // TEST 10: Database transaction failure does not emit false success events
    // =========================================================================
    await assert('10. Database failure safety: Invalid transition does not emit false success SSE event', async () => {
      if (!clientA) throw new Error('Client A not initialized');

      // Attempt prohibited jump: Order A is SERVED; jumping directly back to PENDING is disallowed
      const failRes = await request(app)
        .patch(`/api/restaurants/${restaurantAId}/orders/${orderAId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.PENDING });

      if (failRes.status !== 400 || failRes.body.errorCode !== 'INVALID_STATUS_TRANSITION') {
        throw new Error(`Expected 400 INVALID_STATUS_TRANSITION, got ${failRes.status}`);
      }

      // Ensure no false success event was emitted
      await clientA.assertNoEvent(
        (m) =>
          (m.event === 'order_status_changed' || m.event === 'ORDER_STATUS_CHANGED') &&
          m.data.newStatus === 'PENDING',
        800
      );
    });

    // =========================================================================
    // TEST 11: SSE Reconnection & State Reconciliation
    // =========================================================================
    await assert('11. SSE Reconnection & Reconciliation: Client reconnects and reconciles missed events', async () => {
      // 1. Simulate disconnect by closing client A
      clientA?.close();

      // 2. Kitchen transitions Order A while customer is offline (SERVED -> COMPLETED)
      const completeRes = await request(app)
        .patch(`/api/restaurants/${restaurantAId}/orders/${orderAId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: OrderStatus.COMPLETED });

      if (completeRes.status !== 200) {
        throw new Error('Failed to complete order while offline');
      }

      // 3. Customer reconnects
      const reconnectedClient = createSseClient(`${baseUrl}/api/orders/track/${orderAPublicToken}/events`);
      await reconnectedClient.waitForEvent(
        (m) => m.event === 'connected' || m.event === 'CONNECTED'
      );

      // 4. Customer performs authoritative reconciliation fetch
      const trackRes = await request(app).get(`/api/orders/track/${orderAPublicToken}`);
      if (trackRes.status !== 200 || !trackRes.body.data) {
        throw new Error('Failed to fetch tracked order after reconnect');
      }

      if (trackRes.body.data.status !== OrderStatus.COMPLETED) {
        throw new Error(`Expected reconciled status COMPLETED, got ${trackRes.body.data.status}`);
      }

      reconnectedClient.close();
    });

    // =========================================================================
    // TEST 12: Token security: Invalid tracking token rejected with 404
    // =========================================================================
    await assert('12. Token security: Invalid tracking token returns 404 ORDER_NOT_FOUND', async () => {
      const res = await request(app).get('/api/orders/track/non-existent-token-uuid/events');
      if (res.status !== 404 || res.body.errorCode !== 'ORDER_NOT_FOUND') {
        throw new Error(`Expected 404 ORDER_NOT_FOUND, got ${res.status}`);
      }
    });

  } finally {
    // Cleanup clients
    if (clientA) clientA.close();
    if (clientStaffA) clientStaffA.close();
    realtimeService.stopHeartbeat();

    // Clean up test database records
    try {
      if (orderAId) {
        await prisma.orderStatusHistory.deleteMany({ where: { orderId: orderAId } });
        await prisma.orderItem.deleteMany({ where: { orderId: orderAId } });
        await prisma.order.delete({ where: { id: orderAId } });
      }
      if (orderBId) {
        await prisma.orderStatusHistory.deleteMany({ where: { orderId: orderBId } });
        await prisma.orderItem.deleteMany({ where: { orderId: orderBId } });
        await prisma.order.delete({ where: { id: orderBId } });
      }
      if (foodAId) await prisma.foodItem.delete({ where: { id: foodAId } });
      if (foodBId) await prisma.foodItem.delete({ where: { id: foodBId } });
      if (restaurantAId) {
        await prisma.category.deleteMany({ where: { restaurantId: restaurantAId } });
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurantAId } });
        await prisma.restaurant.delete({ where: { id: restaurantAId } });
      }
      if (restaurantBId) {
        await prisma.category.deleteMany({ where: { restaurantId: restaurantBId } });
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurantBId } });
        await prisma.restaurant.delete({ where: { id: restaurantBId } });
      }
    } catch (e) {
      console.error('Error during cleanup:', e);
    }

    // Stop server and disconnect Prisma
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  console.log(`\n========================================`);
  console.log(`Realtime Test Results: ${passed} passed, ${failed} failed.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runRealtimeTests().catch((e) => {
  console.error('Fatal realtime test error:', e);
  process.exit(1);
});
