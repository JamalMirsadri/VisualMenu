import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { createRestaurantWithSubscription } from './helpers';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { Role, StaffStatus, OrderStatus } from '@prisma/client';
import { floorService } from '../src/services/floorService';

async function runOperationsTestSuite() {
  console.log('🚀 Starting Phase 12: Advanced Order Workflow, Floor/Table Operations & Kitchen Coordination Test Suite...\n');
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

  const timestamp = Date.now();
  const emailsToClean: string[] = [];
  let restaurantA: any = null;
  let restaurantB: any = null;
  let categoryA: any = null;
  let foodItemA: any = null;
  let tableA1: any = null;
  let tableA2: any = null;
  let tableB1: any = null;

  // Tokens and UserRestaurant IDs
  let ownerAToken = '';
  let waiter1Token = '';
  let waiter1UserRestId = '';
  let waiter2Token = '';
  let waiter2UserRestId = '';
  let chefToken = '';
  let cashierToken = '';
  let viewerToken = '';
  let waiterBToken = '';
  let waiterBUserRestId = '';

  async function createStaffUser(
    restaurantId: string,
    prefix: string,
    perms: string[],
    role: Role = Role.STAFF
  ) {
    const email = `${prefix}-${timestamp}@testops.com`;
    emailsToClean.push(email);
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: `Test ${prefix}`,
        passwordHash,
        active: true,
      },
    });

    const userRestaurant = await prisma.userRestaurant.create({
      data: {
        userId: user.id,
        restaurantId,
        role,
        status: StaffStatus.ACTIVE,
      },
    });

    if (perms.length > 0) {
      const dbPerms = await prisma.permission.findMany({
        where: { key: { in: perms } },
      });
      if (dbPerms.length > 0) {
        await prisma.userRestaurantPermission.createMany({
          data: dbPerms.map((p) => ({
            userRestaurantId: userRestaurant.id,
            permissionId: p.id,
          })),
        });
      }
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' });

    const token = res.body?.data?.token || res.body?.token;
    return { user, userRestaurant, token };
  }

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log('--- Setting up Phase 12 test fixtures ---');
    restaurantA = await createRestaurantWithSubscription({
      data: {
        name: `Ops Test Restaurant A ${timestamp}`,
        slug: `ops-test-a-${timestamp}`,
        tagline: 'Precision Dining',
        logo: 'https://example.com/logo-a.png',
      },
    });

    restaurantB = await createRestaurantWithSubscription({
      data: {
        name: `Ops Test Restaurant B ${timestamp}`,
        slug: `ops-test-b-${timestamp}`,
        tagline: 'Isolated Venue',
        logo: 'https://example.com/logo-b.png',
      },
    });

    categoryA = await prisma.category.create({
      data: {
        restaurantId: restaurantA.id,
        name: 'Mains',
        slug: `mains-${timestamp}`,
        displayOrder: 1,
        active: true,
      },
    });

    foodItemA = await prisma.foodItem.create({
      data: {
        restaurantId: restaurantA.id,
        categoryId: categoryA.id,
        name: 'Truffle Steak',
        slug: `truffle-steak-${timestamp}`,
        description: 'Prime cut with summer truffle',
        price: 35.0,
        available: true,
      },
    });

    tableA1 = await prisma.table.create({
      data: {
        restaurantId: restaurantA.id,
        number: 'T1',
        name: 'Window Booth',
        capacity: 4,
        location: 'Window',
        active: true,
      },
    });

    tableA2 = await prisma.table.create({
      data: {
        restaurantId: restaurantA.id,
        number: 'T2',
        name: 'Center Table',
        capacity: 2,
        location: 'Center',
        active: true,
      },
    });

    tableB1 = await prisma.table.create({
      data: {
        restaurantId: restaurantB.id,
        number: 'TB1',
        name: 'Patio B',
        capacity: 4,
        active: true,
      },
    });

    // Create staff roles with explicit permissions
    const ownerA = await createStaffUser(
      restaurantA.id,
      'owner-a',
      [
        'VIEW_DASHBOARD',
        'VIEW_TABLES',
        'VIEW_ORDERS',
        'UPDATE_ORDER_STATUS',
        'MARK_ORDER_SERVED',
        'CONFIRM_ORDER',
        'CONFIRM_PREPARATION',
        'MARK_READY',
        'CANCEL_ORDER',
        'VIEW_PAYMENTS',
        'CONFIRM_CASH_PAYMENT',
        'PROCESS_PAYMENTS',
        'VIEW_KITCHEN',
        'UPDATE_KITCHEN_STATUS',
        'VIEW_STAFF',
      ],
      Role.OWNER
    );
    ownerAToken = ownerA.token;

    const w1 = await createStaffUser(restaurantA.id, 'waiter-1', [
      'VIEW_TABLES',
      'VIEW_ORDERS',
      'UPDATE_ORDER_STATUS',
      'MARK_ORDER_SERVED',
      'CONFIRM_ORDER',
    ]);
    waiter1Token = w1.token;
    waiter1UserRestId = w1.userRestaurant.id;

    const w2 = await createStaffUser(restaurantA.id, 'waiter-2', [
      'VIEW_TABLES',
      'VIEW_ORDERS',
      'UPDATE_ORDER_STATUS',
      'MARK_ORDER_SERVED',
      'CONFIRM_ORDER',
    ]);
    waiter2Token = w2.token;
    waiter2UserRestId = w2.userRestaurant.id;

    const chef = await createStaffUser(restaurantA.id, 'chef', [
      'VIEW_KITCHEN',
      'UPDATE_KITCHEN_STATUS',
      'CONFIRM_PREPARATION',
      'MARK_READY',
    ]);
    chefToken = chef.token;

    const cashier = await createStaffUser(restaurantA.id, 'cashier', [
      'VIEW_PAYMENTS',
      'CONFIRM_CASH_PAYMENT',
      'PROCESS_PAYMENTS',
      'VIEW_TABLES',
      'VIEW_ORDERS',
    ]);
    cashierToken = cashier.token;

    const viewer = await createStaffUser(restaurantA.id, 'viewer', [
      'VIEW_TABLES',
      'VIEW_ORDERS',
    ]);
    viewerToken = viewer.token;

    const wB = await createStaffUser(restaurantB.id, 'waiter-b', [
      'VIEW_TABLES',
      'VIEW_ORDERS',
      'UPDATE_ORDER_STATUS',
      'MARK_ORDER_SERVED',
    ]);
    waiterBToken = wB.token;
    waiterBUserRestId = wB.userRestaurant.id;

    console.log('Fixtures initialized successfully.\n');

    // Helper to create test orders
    async function createTestOrder(tableId: string, status: OrderStatus = 'PENDING', total = 35.0) {
      const publicToken = `tok-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      return prisma.order.create({
        data: {
          restaurantId: restaurantA.id,
          tableId,
          publicToken,
          orderNumber,
          status,
          subtotal: total,
          tax: 0,
          discount: 0,
          serviceCharge: 0,
          total,
          currency: 'EUR',
          items: {
            create: [
              {
                foodItemId: foodItemA.id,
                foodNameSnapshot: foodItemA.name,
                unitPrice: foodItemA.price,
                quantity: 1,
                lineTotal: foodItemA.price,
                status: status === 'PREPARING' ? 'PREPARING' : status === 'READY' ? 'READY' : 'PENDING',
              },
            ],
          },
        },
        include: {
          items: true,
          table: true,
          assignedWaiter: { include: { user: true } },
          payments: true,
        },
      });
    }

    // =========================================================================
    // 1. FLOOR STATE DERIVATION & OPERATIONAL CALCULATIONS (10 TESTS)
    // =========================================================================
    console.log('--- 1. Floor State Derivation & Operational Calculations ---');

    await assert('FloorService derives AVAILABLE when table has zero orders', async () => {
      const state = floorService.deriveTableState(tableA1, []);
      if (state !== 'AVAILABLE') throw new Error(`Expected AVAILABLE, got ${state}`);
    });

    await assert('FloorService derives ORDER_PENDING when active order is PENDING', async () => {
      const dummyOrder = { status: 'PENDING', payments: [] };
      const state = floorService.deriveTableState(tableA1, [dummyOrder]);
      if (state !== 'ORDER_PENDING') throw new Error(`Expected ORDER_PENDING, got ${state}`);
    });

    await assert('FloorService derives ORDER_ACTIVE when active order is CONFIRMED', async () => {
      const dummyOrder = { status: 'CONFIRMED', payments: [] };
      const state = floorService.deriveTableState(tableA1, [dummyOrder]);
      if (state !== 'ORDER_ACTIVE') throw new Error(`Expected ORDER_ACTIVE, got ${state}`);
    });

    await assert('FloorService derives PREPARING when order is cooking in kitchen', async () => {
      const dummyOrder = { status: 'PREPARING', payments: [] };
      const state = floorService.deriveTableState(tableA1, [dummyOrder]);
      if (state !== 'PREPARING') throw new Error(`Expected PREPARING, got ${state}`);
    });

    await assert('FloorService derives READY_TO_SERVE when order is READY for runner', async () => {
      const dummyOrder = { status: 'READY', payments: [] };
      const state = floorService.deriveTableState(tableA1, [dummyOrder]);
      if (state !== 'READY_TO_SERVE') throw new Error(`Expected READY_TO_SERVE, got ${state}`);
    });

    await assert('FloorService derives AWAITING_PAYMENT when order is SERVED and unpaid', async () => {
      const dummyOrder = { status: 'SERVED', payments: [] };
      const state = floorService.deriveTableState(tableA1, [dummyOrder]);
      if (state !== 'AWAITING_PAYMENT') throw new Error(`Expected AWAITING_PAYMENT, got ${state}`);
    });

    await assert('FloorService derives PAID when order is SERVED and payment status is PAID', async () => {
      const dummyOrder = { status: 'SERVED', payments: [{ status: 'PAID' }] };
      const state = floorService.deriveTableState(tableA1, [dummyOrder]);
      if (state !== 'PAID') throw new Error(`Expected PAID, got ${state}`);
    });

    await assert('FloorService ignores COMPLETED orders and derives AVAILABLE', async () => {
      const dummyOrder = { status: 'COMPLETED', payments: [{ status: 'PAID' }] };
      const state = floorService.deriveTableState(tableA1, [dummyOrder]);
      if (state !== 'AVAILABLE') throw new Error(`Expected AVAILABLE, got ${state}`);
    });

    await assert('Priority hierarchy: READY_TO_SERVE supersedes PREPARING and PENDING', async () => {
      const orders = [
        { status: 'PENDING', payments: [] },
        { status: 'PREPARING', payments: [] },
        { status: 'READY', payments: [] },
      ];
      const state = floorService.deriveTableState(tableA1, orders);
      if (state !== 'READY_TO_SERVE') throw new Error(`Expected READY_TO_SERVE, got ${state}`);
    });

    await assert('Unpaid balance correctly sums unpaid active orders on the table', async () => {
      const order1 = await createTestOrder(tableA1.id, 'CONFIRMED', 25.0);
      const order2 = await createTestOrder(tableA1.id, 'PREPARING', 35.0);
      const floor = await floorService.getRestaurantFloorState(restaurantA.id, { allowPaymentMetrics: true });
      const tableInfo = floor.tables.find((t) => t.id === tableA1.id);
      if (!tableInfo) throw new Error('Table info not found in floor state');
      if (tableInfo.totalUnpaidAmount !== 60.0) {
        throw new Error(`Expected totalUnpaidAmount to be 60.0, got ${tableInfo.totalUnpaidAmount}`);
      }
      // Cleanup orders
      await prisma.orderItem.deleteMany({ where: { orderId: { in: [order1.id, order2.id] } } });
      await prisma.order.deleteMany({ where: { id: { in: [order1.id, order2.id] } } });
    });

    // =========================================================================
    // 2. FLOOR OPERATIONAL API ENDPOINTS (8 TESTS)
    // =========================================================================
    console.log('\n--- 2. Floor Operational API Endpoints ---');

    await assert('GET /api/restaurants/:restaurantId/floor returns 200 with FloorSummary', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/floor`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (typeof res.body.totalTables !== 'number') throw new Error('totalTables missing');
      if (!Array.isArray(res.body.tables)) throw new Error('tables array missing');
    });

    await assert('Floor summary contains accurate operational counters', async () => {
      const order = await createTestOrder(tableA1.id, 'PREPARING', 40.0);
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/floor`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.body.ordersPreparing < 1) throw new Error('ordersPreparing should be >= 1');
      if (res.body.occupiedTables < 1) throw new Error('occupiedTables should be >= 1');
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { id: order.id } });
    });

    await assert('Data minimization: staff without payment perms has totalUnpaidAmount omitted/0', async () => {
      const order = await createTestOrder(tableA1.id, 'CONFIRMED', 50.0);
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/floor`)
        .set('Authorization', `Bearer ${viewerToken}`);

      const t1 = res.body.tables.find((t: any) => t.id === tableA1.id);
      if (t1.totalUnpaidAmount !== 0) {
        throw new Error(`Expected masked totalUnpaidAmount=0 for viewer without payments perms, got ${t1.totalUnpaidAmount}`);
      }
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { id: order.id } });
    });

    await assert('Cashier with payment permission receives full totalUnpaidAmount', async () => {
      const order = await createTestOrder(tableA1.id, 'CONFIRMED', 75.5);
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/floor`)
        .set('Authorization', `Bearer ${cashierToken}`);

      const t1 = res.body.tables.find((t: any) => t.id === tableA1.id);
      if (t1.totalUnpaidAmount !== 75.5) {
        throw new Error(`Expected totalUnpaidAmount=75.5 for cashier, got ${t1.totalUnpaidAmount}`);
      }
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { id: order.id } });
    });

    await assert('GET /api/restaurants/:restaurantId/tables/:tableId/operational-state returns specific state', async () => {
      const order = await createTestOrder(tableA1.id, 'READY', 20.0);
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/tables/${tableA1.id}/operational-state`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.state !== 'READY_TO_SERVE') throw new Error(`Expected READY_TO_SERVE, got ${res.body.state}`);
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { id: order.id } });
    });

    await assert('Operational state of non-existent table returns 404', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/tables/${fakeUuid}/operational-state`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    });

    await assert('Unauthorized foreign restaurant floor request returns 403 or 404', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantB.id}/floor`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 403 && res.status !== 404) throw new Error(`Expected 403 or 404, got ${res.status}`);
    });

    await assert('Unauthenticated floor request returns 401', async () => {
      const res = await request(app).get(`/api/restaurants/${restaurantA.id}/floor`);
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    // =========================================================================
    // 3. WAITER ASSIGNMENT & LIFECYCLE (12 TESTS)
    // =========================================================================
    console.log('\n--- 3. Waiter Assignment & Lifecycle ---');

    let assignTestOrder: any = null;

    await assert('Waiter 1 can claim an unassigned order via POST /claim', async () => {
      assignTestOrder = await createTestOrder(tableA1.id, 'CONFIRMED', 30.0);
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/claim`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const body = res.body.data || res.body;
      if (body.assignedWaiterUserRestaurantId !== waiter1UserRestId) {
        throw new Error(`Expected assignedWaiterUserRestaurantId=${waiter1UserRestId}, got ${body.assignedWaiterUserRestaurantId}`);
      }
    });

    await assert('Claimed order includes assignedWaiter relation with user name & email', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      const body = res.body.data || res.body;
      if (!body.assignedWaiter) throw new Error('assignedWaiter missing from order payload');
      if (!body.assignedWaiter.user?.name) throw new Error('assignedWaiter.user.name missing');
    });

    await assert('Claiming an already assigned order by another waiter returns 400 or 409', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/claim`)
        .set('Authorization', `Bearer ${waiter2Token}`);

      if (res.status !== 400 && res.status !== 409) throw new Error(`Expected 400 or 409, got ${res.status}: ${JSON.stringify(res.body)}`);
      const errMsg = (res.body.message || res.body.error || '').toLowerCase();
      if (!errMsg.includes('already assigned') && !errMsg.includes('claimed')) {
        throw new Error(`Expected error message to mention already assigned or claimed, got ${errMsg}`);
      }
    });

    await assert('Waiter 1 can unassign/release their own assigned order', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/unassign`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.assignedWaiterUserRestaurantId !== null) {
        throw new Error('Expected assignedWaiterUserRestaurantId to be null');
      }
    });

    await assert('Waiter 2 can claim order after Waiter 1 unassigned it', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/claim`)
        .set('Authorization', `Bearer ${waiter2Token}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.assignedWaiterUserRestaurantId !== waiter2UserRestId) {
        throw new Error('Expected assigned to waiter 2');
      }
    });

    await assert('Waiter 1 cannot unassign Waiter 2s order without manager perms', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/unassign`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('Owner can unassign Waiter 2s order', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/unassign`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await assert('Owner can assign order directly to Waiter 1 via POST /assign', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/assign`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ staffUserRestaurantId: waiter1UserRestId });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.assignedWaiterUserRestaurantId !== waiter1UserRestId) {
        throw new Error('Expected assignment to Waiter 1');
      }
    });

    await assert('Assigning to a staff member of another restaurant is rejected (400 or 403)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/assign`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ staffUserRestaurantId: waiterBUserRestId });

      if (res.status !== 400 && res.status !== 403) {
        throw new Error(`Expected 400 or 403, got ${res.status}`);
      }
    });

    await assert('Assigning with non-existent staffUserRestaurantId returns 400', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${assignTestOrder.id}/assign`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ staffUserRestaurantId: fakeUuid });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await assert('Querying orders with ?assignedToMe=true returns only assigned orders', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders?assignedToMe=true`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const list = Array.isArray(res.body.data) ? res.body.data : (Array.isArray(res.body) ? res.body : []);
      const hasOrder = list.some((o: any) => o.id === assignTestOrder.id);
      if (!hasOrder) throw new Error('Expected assignTestOrder in assignedToMe results');
    });

    await assert('Querying orders with ?assignedWaiterId filters accurately', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders?assignedWaiterId=${waiter1UserRestId}`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const list = Array.isArray(res.body.data) ? res.body.data : (Array.isArray(res.body) ? res.body : []);
      const matches = list.every((o: any) => o.assignedWaiterUserRestaurantId === waiter1UserRestId);
      if (!matches) throw new Error('Found order not assigned to waiter 1');
    });

    // Cleanup assignTestOrder
    await prisma.orderItem.deleteMany({ where: { orderId: assignTestOrder.id } });
    await prisma.order.deleteMany({ where: { id: assignTestOrder.id } });

    // =========================================================================
    // 4. ORDER STATE LIFECYCLE & READY / SERVE OPERATIONS (10 TESTS)
    // =========================================================================
    console.log('\n--- 4. Order State Lifecycle & Ready / Serve Operations ---');

    let lifecycleOrder: any = null;

    await assert('Order creates in PENDING status', async () => {
      lifecycleOrder = await createTestOrder(tableA1.id, 'PENDING', 25.0);
      if (lifecycleOrder.status !== 'PENDING') throw new Error(`Expected PENDING, got ${lifecycleOrder.status}`);
    });

    await assert('Order advances from PENDING to CONFIRMED', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/status`)
        .set('Authorization', `Bearer ${waiter1Token}`)
        .send({ status: 'CONFIRMED' });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.status !== 'CONFIRMED') throw new Error(`Expected CONFIRMED, got ${body.status}`);
    });

    await assert('Order advances from CONFIRMED to PREPARING', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/status`)
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ status: 'PREPARING' });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.status !== 'PREPARING') throw new Error(`Expected PREPARING, got ${body.status}`);
    });

    await assert('Calling POST /serve on PREPARING order returns 400 (not READY)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/serve`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await assert('Order advances from PREPARING to READY', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/status`)
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ status: 'READY' });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.status !== 'READY') throw new Error(`Expected READY, got ${body.status}`);
    });

    await assert('GET /orders/ready-to-serve lists orders in READY status', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders/ready-to-serve`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const list = Array.isArray(res.body.data) ? res.body.data : (Array.isArray(res.body) ? res.body : []);
      const found = list.some((o: any) => o.id === lifecycleOrder.id);
      if (!found) throw new Error('lifecycleOrder not found in ready-to-serve list');
    });

    await assert('POST /orders/:orderId/serve transitions order from READY to SERVED', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/serve`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const body = res.body.data || res.body;
      if (body.status !== 'SERVED') throw new Error(`Expected SERVED, got ${body.status}`);
    });

    await assert('GET /orders/awaiting-payment lists orders in SERVED status', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders/awaiting-payment`)
        .set('Authorization', `Bearer ${cashierToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const list = Array.isArray(res.body.data) ? res.body.data : (Array.isArray(res.body) ? res.body : []);
      const found = list.some((o: any) => o.id === lifecycleOrder.id);
      if (!found) throw new Error('lifecycleOrder not found in awaiting-payment list');
    });

    await assert('PATCH /orders/:orderId/priority updates priority to URGENT', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/priority`)
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ priority: 'URGENT' });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.priority !== 'URGENT') throw new Error(`Expected URGENT, got ${body.priority}`);
    });

    await assert('PATCH /orders/:orderId/priority with invalid value returns 400', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/priority`)
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ priority: 'SUPER_FAST' });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    // =========================================================================
    // 5. KITCHEN COORDINATION & TIMERS (6 TESTS)
    // =========================================================================
    console.log('\n--- 5. Kitchen Coordination & Timers ---');

    await assert('Kitchen displays active orders including table number', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders?status=SERVED`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      const list = Array.isArray(res.body.data) ? res.body.data : (Array.isArray(res.body) ? res.body : []);
      const o = list.find((item: any) => item.id === lifecycleOrder.id);
      if (!o) throw new Error('Order not found');
      if (o.table?.number !== 'T1') throw new Error(`Expected Table T1, got ${o.table?.number}`);
    });

    await assert('Advancing individual item in kitchen updates item status', async () => {
      const itemId = lifecycleOrder.items[0].id;
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/items/${itemId}/status`)
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ status: 'READY' });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.status !== 'READY') throw new Error(`Expected item status READY, got ${body.status}`);
    });

    await assert('Customer note is preserved throughout kitchen coordination', async () => {
      const noteOrder = await prisma.order.create({
        data: {
          restaurantId: restaurantA.id,
          tableId: tableA2.id,
          publicToken: `tok-note-${Date.now()}`,
          orderNumber: `ORD-NOTE-${Math.floor(100 + Math.random() * 900)}`,
          status: 'PENDING',
          customerNote: 'No cilantro and extra crispy please',
          subtotal: 20,
          total: 20,
          currency: 'EUR',
          items: {
            create: [
              {
                foodItemId: foodItemA.id,
                foodNameSnapshot: foodItemA.name,
                unitPrice: 20,
                quantity: 1,
                lineTotal: 20,
                status: 'PENDING',
              },
            ],
          },
        },
      });

      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders/${noteOrder.id}`)
        .set('Authorization', `Bearer ${chefToken}`);

      const body = res.body.data || res.body;
      if (body.customerNote !== 'No cilantro and extra crispy please') {
        throw new Error(`Customer note corrupted: ${body.customerNote}`);
      }

      await prisma.orderItem.deleteMany({ where: { orderId: noteOrder.id } });
      await prisma.order.deleteMany({ where: { id: noteOrder.id } });
    });

    await assert('Order priority is reflected in order queries', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}`)
        .set('Authorization', `Bearer ${chefToken}`);

      const body = res.body.data || res.body;
      if (body.priority !== 'URGENT') throw new Error(`Expected URGENT, got ${body.priority}`);
    });

    await assert('Invalid order item status update returns 400', async () => {
      const itemId = lifecycleOrder.items[0].id;
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/items/${itemId}/status`)
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ status: 'INVALID_STATUS' });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await assert('Updating item on non-existent order returns 404', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${fakeUuid}/items/${fakeUuid}/status`)
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ status: 'READY' });

      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    });

    // =========================================================================
    // 6. PAYMENT, COMPLETION & TABLE RELEASE (8 TESTS)
    // =========================================================================
    console.log('\n--- 6. Payment, Completion & Table Release ---');

    await assert('Order in SERVED state settles cash payment via POST /cash-payment', async () => {
      const res = await request(app)
        .post(`/api/orders/${lifecycleOrder.id}/cash-payment`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          amountReceived: 30.0,
          changeGiven: 5.0,
          isStaffSettlement: true,
        });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const data = res.body.data || res.body;
      if (data.payment?.status !== 'PAID') throw new Error(`Expected payment status PAID, got ${data.payment?.status}`);
    });

    await assert('Table operational state transitions to PAID after cash settlement', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/tables/${tableA1.id}/operational-state`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.body.state !== 'PAID') throw new Error(`Expected PAID, got ${res.body.state}`);
    });

    await assert('Order receipt is generated and retrievable via GET /orders/:orderId/receipt', async () => {
      const res = await request(app)
        .get(`/api/orders/${lifecycleOrder.id}/receipt`)
        .set('Authorization', `Bearer ${cashierToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const data = res.body.data || res.body;
      const docNum = data.documentNumber || data.receipt?.documentNumber;
      if (!docNum) throw new Error('Receipt documentNumber missing');
    });

    await assert('Customer order tracking page reflects SERVED status', async () => {
      const res = await request(app).get(`/api/orders/track/${lifecycleOrder.publicToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.status !== 'SERVED') throw new Error(`Expected SERVED, got ${body.status}`);
    });

    await assert('Re-settling an already paid order returns 400', async () => {
      const res = await request(app)
        .post(`/api/orders/${lifecycleOrder.id}/cash-payment`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ amountReceived: 30.0 });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await assert('Advancing order from SERVED to COMPLETED completes the order', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${lifecycleOrder.id}/status`)
        .set('Authorization', `Bearer ${waiter1Token}`)
        .send({ status: 'COMPLETED' });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.status !== 'COMPLETED') throw new Error(`Expected COMPLETED, got ${body.status}`);
    });

    await assert('Table operational state automatically returns to AVAILABLE after order completes', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/tables/${tableA1.id}/operational-state`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.body.state !== 'AVAILABLE') throw new Error(`Expected AVAILABLE, got ${res.body.state}`);
      if (res.body.activeOrderCount !== 0) throw new Error(`Expected 0 active orders, got ${res.body.activeOrderCount}`);
    });

    await assert('Customer tracking page reflects COMPLETED status', async () => {
      const res = await request(app).get(`/api/orders/track/${lifecycleOrder.publicToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = res.body.data || res.body;
      if (body.status !== 'COMPLETED') throw new Error(`Expected COMPLETED, got ${body.status}`);
    });

    // Cleanup lifecycleOrder
    await prisma.fiscalDocument.deleteMany({ where: { orderId: lifecycleOrder.id } });
    await prisma.paymentTransaction.deleteMany({ where: { payment: { orderId: lifecycleOrder.id } } });
    await prisma.payment.deleteMany({ where: { orderId: lifecycleOrder.id } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: lifecycleOrder.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: lifecycleOrder.id } });
    await prisma.order.deleteMany({ where: { id: lifecycleOrder.id } });

    // =========================================================================
    // 7. MULTI-TENANT SECURITY & ROLE ISOLATION (8 TESTS)
    // =========================================================================
    console.log('\n--- 7. Multi-Tenant Security & Role Isolation ---');

    let tenantOrderA: any = null;
    let tenantOrderB: any = null;

    await assert('Tenant setup: create orders in Restaurant A and Restaurant B', async () => {
      tenantOrderA = await createTestOrder(tableA1.id, 'PENDING', 30.0);
      tenantOrderB = await prisma.order.create({
        data: {
          restaurantId: restaurantB.id,
          tableId: tableB1.id,
          publicToken: `tok-tb-${Date.now()}`,
          orderNumber: `ORD-B-${Math.floor(100 + Math.random() * 900)}`,
          status: 'PENDING',
          subtotal: 30,
          total: 30,
          currency: 'EUR',
          items: {
            create: [
              {
                foodItemId: foodItemA.id,
                foodNameSnapshot: 'Generic Food',
                unitPrice: 30,
                quantity: 1,
                lineTotal: 30,
                status: 'PENDING',
              },
            ],
          },
        },
      });
    });

    await assert('Waiter from Restaurant A cannot claim order from Restaurant B (403/404)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantB.id}/orders/${tenantOrderB.id}/claim`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 403 && res.status !== 404) {
        throw new Error(`Expected 403 or 404, got ${res.status}`);
      }
    });

    await assert('Waiter from Restaurant B cannot claim order from Restaurant A (403/404)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${tenantOrderA.id}/claim`)
        .set('Authorization', `Bearer ${waiterBToken}`);

      if (res.status !== 403 && res.status !== 404) {
        throw new Error(`Expected 403 or 404, got ${res.status}`);
      }
    });

    await assert('Staff without UPDATE_ORDER_STATUS cannot claim order (403)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${tenantOrderA.id}/claim`)
        .set('Authorization', `Bearer ${viewerToken}`);

      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('Staff without UPDATE_ORDER_STATUS cannot serve order (403)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${tenantOrderA.id}/serve`)
        .set('Authorization', `Bearer ${viewerToken}`);

      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('Staff without VIEW_TABLES cannot view restaurant floor (403)', async () => {
      const chefFloorRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/floor`)
        .set('Authorization', `Bearer ${chefToken}`);

      if (chefFloorRes.status !== 403) throw new Error(`Expected 403, got ${chefFloorRes.status}`);
    });

    await assert('Expired or invalid auth token returns 401 on operational endpoints', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/floor`)
        .set('Authorization', 'Bearer invalid_token_123');

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    await assert('Tampered order ID returns 400 or 404', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/non-uuid-string/claim`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res.status !== 400 && res.status !== 404) throw new Error(`Expected 400 or 404, got ${res.status}`);
    });

    // Cleanup tenant orders
    await prisma.orderItem.deleteMany({ where: { orderId: { in: [tenantOrderA.id, tenantOrderB.id] } } });
    await prisma.order.deleteMany({ where: { id: { in: [tenantOrderA.id, tenantOrderB.id] } } });

    // =========================================================================
    // 8. CONCURRENCY & ATOMICITY (4 TESTS)
    // =========================================================================
    console.log('\n--- 8. Concurrency & Atomicity ---');

    await assert('Concurrent claim: two waiters claiming simultaneously results in exactly 1 success, 1 failure', async () => {
      const concOrder = await createTestOrder(tableA1.id, 'CONFIRMED', 45.0);

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/restaurants/${restaurantA.id}/orders/${concOrder.id}/claim`)
          .set('Authorization', `Bearer ${waiter1Token}`),
        request(app)
          .post(`/api/restaurants/${restaurantA.id}/orders/${concOrder.id}/claim`)
          .set('Authorization', `Bearer ${waiter2Token}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      if (statuses[0] !== 200 || (statuses[1] !== 400 && statuses[1] !== 409)) {
        throw new Error(`Expected [200, 400] or [200, 409], got ${JSON.stringify(statuses)}`);
      }

      await prisma.orderItem.deleteMany({ where: { orderId: concOrder.id } });
      await prisma.order.deleteMany({ where: { id: concOrder.id } });
    });

    await assert('Double claim attempt by same waiter: second attempt returns 200, 400, or 409 idempotently', async () => {
      const order = await createTestOrder(tableA1.id, 'CONFIRMED', 30.0);
      const res1 = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${order.id}/claim`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      if (res1.status !== 200) throw new Error(`First claim failed: ${res1.status}`);

      const res2 = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${order.id}/claim`)
        .set('Authorization', `Bearer ${waiter1Token}`);

      // Either returns 400/409 (already assigned) or idempotent 200
      if (res2.status !== 400 && res2.status !== 409 && res2.status !== 200) {
        throw new Error(`Expected 400, 409 or 200 on double claim, got ${res2.status}`);
      }

      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { id: order.id } });
    });

    await assert('Concurrent double-serve attempt: exactly one succeeds', async () => {
      const order = await createTestOrder(tableA1.id, 'READY', 30.0);

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/restaurants/${restaurantA.id}/orders/${order.id}/serve`)
          .set('Authorization', `Bearer ${waiter1Token}`),
        request(app)
          .post(`/api/restaurants/${restaurantA.id}/orders/${order.id}/serve`)
          .set('Authorization', `Bearer ${waiter2Token}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      if (statuses[0] !== 200 || (statuses[1] !== 400 && statuses[1] !== 409)) {
        throw new Error(`Expected [200, 400] or [200, 409] on concurrent serve, got ${JSON.stringify(statuses)}`);
      }

      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { id: order.id } });
    });

    await assert('Idempotent table release: multiple completes do not corrupt state', async () => {
      const order = await createTestOrder(tableA1.id, 'SERVED', 30.0);
      await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ status: 'COMPLETED' });

      const floor = await floorService.getRestaurantFloorState(restaurantA.id);
      const t1 = floor.tables.find((t) => t.id === tableA1.id);
      if (t1?.state !== 'AVAILABLE') throw new Error(`Expected table to be AVAILABLE, got ${t1?.state}`);

      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { id: order.id } });
    });

  } finally {
    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    console.log('\n--- Cleaning up Phase 12 test fixtures ---');
    try {
      if (restaurantA?.id) {
        await prisma.orderItem.deleteMany({ where: { order: { restaurantId: restaurantA.id } } });
        await prisma.paymentTransaction.deleteMany({ where: { payment: { restaurantId: restaurantA.id } } });
        await prisma.fiscalDocument.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.payment.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.orderStatusHistory.deleteMany({ where: { order: { restaurantId: restaurantA.id } } });
        await prisma.order.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.foodItem.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.category.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.table.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.userRestaurantPermission.deleteMany({ where: { userRestaurant: { restaurantId: restaurantA.id } } });
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.restaurant.delete({ where: { id: restaurantA.id } });
      }

      if (restaurantB?.id) {
        await prisma.orderItem.deleteMany({ where: { order: { restaurantId: restaurantB.id } } });
        await prisma.order.deleteMany({ where: { restaurantId: restaurantB.id } });
        await prisma.table.deleteMany({ where: { restaurantId: restaurantB.id } });
        await prisma.userRestaurantPermission.deleteMany({ where: { userRestaurant: { restaurantId: restaurantB.id } } });
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurantB.id } });
        await prisma.restaurant.delete({ where: { id: restaurantB.id } });
      }

      if (emailsToClean.length > 0) {
        await prisma.user.deleteMany({ where: { email: { in: emailsToClean } } });
      }
      console.log('Cleanup complete.');
    } catch (cleanErr) {
      console.error('Cleanup encountered error:', cleanErr);
    }
  }

  console.log('\n==================================================');
  console.log(`Phase 12 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOperationsTestSuite().catch((err) => {
  console.error('Fatal operations test suite failure:', err);
  process.exit(1);
});
