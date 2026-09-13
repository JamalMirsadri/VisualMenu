import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { createRestaurantWithSubscription } from './helpers';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { Role, StaffStatus } from '@prisma/client';

async function runOperationalAccessTests() {
  console.log('🚀 Starting Phase 11B: Operational Access Control & Role Workspaces Test Suite...\n');
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
  let restaurantA: any = null;
  let restaurantB: any = null;
  let categoryA: any = null;
  let foodItemA: any = null;
  let tableA: any = null;
  let testOrderA: any = null;
  let testOrderB: any = null;
  let testPaymentA: any = null;
  let testCustomerA: any = null;
  let testMediaA: any = null;

  // Tokens
  let ownerAToken = '';
  let ownerBToken = '';
  let waiterToken = '';
  let kitchenToken = '';
  let cashierToken = '';
  let menuManagerToken = '';
  let pricingManagerToken = '';
  let availabilityClerkToken = '';
  let mediaSpecialistToken = '';
  let tableManagerToken = '';
  let guestHostToken = '';
  let complianceAuditorToken = '';
  let financialAuditorToken = '';
  let disabledStaffToken = '';
  let foreignStaffToken = '';

  const emailsToClean: string[] = [];

  // Helper to create a user and assign to restaurant with permissions
  async function createStaffWithPermissions(
    restaurantId: string,
    prefix: string,
    perms: string[],
    role: Role = Role.STAFF,
    status: StaffStatus = StaffStatus.ACTIVE
  ) {
    const email = `${prefix}-${timestamp}@testrbac.com`;
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

    const ur = await prisma.userRestaurant.create({
      data: {
        userId: user.id,
        restaurantId,
        role,
        status,
      },
    });

    if (perms.length > 0) {
      const dbPerms = await prisma.permission.findMany({
        where: { key: { in: perms } },
      });
      if (dbPerms.length > 0) {
        await prisma.userRestaurantPermission.createMany({
          data: dbPerms.map((p) => ({
            userRestaurantId: ur.id,
            permissionId: p.id,
          })),
        });
      }
    }

    const loginRes = await request(app).post('/api/auth/login').send({
      email,
      password: 'Password123!',
    });

    return { user, userRestaurant: ur, token: loginRes.body.data.token };
  }

  try {
    // -------------------------------------------------------------------------
    // SETUP: RESTAURANTS, SEED ENTITIES, AND STAFF USERS
    // -------------------------------------------------------------------------
    await assert('0. Setup Restaurant A & B and seed operational staff roles', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);

      // 1. Owner A
      const ownerAEmail = `owner-a-${timestamp}@testrbac.com`;
      emailsToClean.push(ownerAEmail);
      const ownerAUser = await prisma.user.create({
        data: { email: ownerAEmail, name: 'Alice Owner', passwordHash, active: true },
      });

      restaurantA = await createRestaurantWithSubscription({
        data: {
          name: `Operational Bistro A ${timestamp}`,
          slug: `op-bistro-a-${timestamp}`,
          currency: 'EUR',
          currencySymbol: '€',
          defaultLanguage: 'pt',
          userRestaurants: {
            create: { userId: ownerAUser.id, role: Role.OWNER, status: StaffStatus.ACTIVE },
          },
        },
      });

      const ownerALogin = await request(app).post('/api/auth/login').send({
        email: ownerAEmail,
        password: 'Password123!',
      });
      ownerAToken = ownerALogin.body.data.token;

      // 2. Owner B (Restaurant B)
      const ownerBEmail = `owner-b-${timestamp}@testrbac.com`;
      emailsToClean.push(ownerBEmail);
      const ownerBUser = await prisma.user.create({
        data: { email: ownerBEmail, name: 'Bob Owner', passwordHash, active: true },
      });

      restaurantB = await createRestaurantWithSubscription({
        data: {
          name: `Operational Cantina B ${timestamp}`,
          slug: `op-cantina-b-${timestamp}`,
          currency: 'EUR',
          currencySymbol: '€',
          defaultLanguage: 'pt',
          userRestaurants: {
            create: { userId: ownerBUser.id, role: Role.OWNER, status: StaffStatus.ACTIVE },
          },
        },
      });

      const ownerBLogin = await request(app).post('/api/auth/login').send({
        email: ownerBEmail,
        password: 'Password123!',
      });
      ownerBToken = ownerBLogin.body.data.token;

      // 3. Category & Food Item in Restaurant A
      categoryA = await prisma.category.create({
        data: {
          restaurantId: restaurantA.id,
          name: 'Main Courses',
          slug: `mains-${timestamp}`,
          displayOrder: 1,
        },
      });

      foodItemA = await prisma.foodItem.create({
        data: {
          restaurantId: restaurantA.id,
          categoryId: categoryA.id,
          name: 'Grilled Bacalhau',
          slug: `grilled-bacalhau-${timestamp}`,
          price: 22.5,
          currency: 'EUR',
          available: true,
          displayOrder: 1,
        },
      });

      // 4. Dining Table in Restaurant A
      tableA = await prisma.table.create({
        data: {
          restaurantId: restaurantA.id,
          number: '12',
          name: 'Table 12',
          capacity: 4,
          active: true,
        },
      });

      // 5. Seed Specialized Staff Roles for Restaurant A
      const waiter = await createStaffWithPermissions(restaurantA.id, 'waiter', [
        'VIEW_DASHBOARD',
        'VIEW_ORDERS',
        'VIEW_ORDER_DETAILS',
        'CONFIRM_ORDER',
        'MARK_ORDER_SERVED',
      ]);
      waiterToken = waiter.token;

      const kitchen = await createStaffWithPermissions(restaurantA.id, 'kitchen', [
        'VIEW_DASHBOARD',
        'VIEW_KITCHEN',
        'VIEW_ORDERS',
        'VIEW_ORDER_DETAILS',
        'CONFIRM_PREPARATION',
        'MARK_READY',
        'UPDATE_KITCHEN_STATUS',
      ]);
      kitchenToken = kitchen.token;

      const cashier = await createStaffWithPermissions(restaurantA.id, 'cashier', [
        'VIEW_DASHBOARD',
        'VIEW_PAYMENTS',
        'VIEW_PAYMENT_STATUS',
        'CONFIRM_CASH_PAYMENT',
        'PROCESS_PAYMENTS',
      ]);
      cashierToken = cashier.token;

      const menuMgr = await createStaffWithPermissions(restaurantA.id, 'menumgr', [
        'VIEW_DASHBOARD',
        'VIEW_MENU',
        'MANAGE_FOODS',
      ]);
      menuManagerToken = menuMgr.token;

      const priceMgr = await createStaffWithPermissions(restaurantA.id, 'pricemgr', [
        'VIEW_DASHBOARD',
        'VIEW_MENU',
        'MANAGE_FOODS',
        'MANAGE_FOOD_PRICES',
      ]);
      pricingManagerToken = priceMgr.token;

      const availClerk = await createStaffWithPermissions(restaurantA.id, 'availclerk', [
        'VIEW_DASHBOARD',
        'VIEW_MENU',
        'TOGGLE_FOOD_AVAILABILITY',
      ]);
      availabilityClerkToken = availClerk.token;

      const mediaSpec = await createStaffWithPermissions(restaurantA.id, 'mediaspec', [
        'VIEW_DASHBOARD',
        'VIEW_MEDIA',
        'UPLOAD_MEDIA',
      ]);
      mediaSpecialistToken = mediaSpec.token;

      const tableMgr = await createStaffWithPermissions(restaurantA.id, 'tablemgr', [
        'VIEW_DASHBOARD',
        'VIEW_TABLES',
        'MANAGE_TABLES',
        'MANAGE_TABLE_QR',
      ]);
      tableManagerToken = tableMgr.token;

      const guestHost = await createStaffWithPermissions(restaurantA.id, 'guesthost', [
        'VIEW_DASHBOARD',
        'VIEW_CUSTOMERS',
      ]);
      guestHostToken = guestHost.token;

      const compAuditor = await createStaffWithPermissions(restaurantA.id, 'compauditor', [
        'VIEW_DASHBOARD',
        'VIEW_CUSTOMERS',
        'VIEW_CUSTOMER_FISCAL_DATA',
      ]);
      complianceAuditorToken = compAuditor.token;

      const finAuditor = await createStaffWithPermissions(restaurantA.id, 'finauditor', [
        'VIEW_DASHBOARD',
        'VIEW_FINANCIAL_REPORTS',
      ]);
      financialAuditorToken = finAuditor.token;

      const disabledStaff = await createStaffWithPermissions(
        restaurantA.id,
        'disabledstaff',
        ['VIEW_DASHBOARD', 'VIEW_ORDERS', 'VIEW_MENU'],
        Role.STAFF,
        StaffStatus.DISABLED
      );
      disabledStaffToken = disabledStaff.token;

      const foreignStaff = await createStaffWithPermissions(
        restaurantB.id,
        'foreignstaff',
        ['VIEW_DASHBOARD', 'VIEW_ORDERS', 'VIEW_MENU', 'MANAGE_TABLES']
      );
      foreignStaffToken = foreignStaff.token;
    });

    // =========================================================================
    // SECTION 1: DASHBOARD METRICS & FINANCIAL VISIBILITY (Tests 1-6)
    // =========================================================================
    await assert('1. Owner A can view dashboard metrics including financialMetrics', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${ownerAToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data.financialMetrics) throw new Error('Owner must receive financialMetrics');
      if (!res.body.data.orderMetrics || !res.body.data.kitchenMetrics) throw new Error('Missing base metrics');
    });

    await assert('2. Financial Auditor with VIEW_FINANCIAL_REPORTS receives full financialMetrics', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${financialAuditorToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data.financialMetrics) throw new Error('Financial auditor must receive financialMetrics');
      if (typeof res.body.data.financialMetrics.todayRevenue !== 'number') throw new Error('Invalid financialMetrics format');
    });

    await assert('3. Waiter without VIEW_FINANCIAL_REPORTS receives 200 with order/kitchen metrics, but financialMetrics is omitted', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${waiterToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.financialMetrics !== undefined) throw new Error('financialMetrics must be omitted for Waiter');
      if (!res.body.data.orderMetrics) throw new Error('Waiter should receive operational orderMetrics');
    });

    await assert('4. Kitchen staff without VIEW_FINANCIAL_REPORTS receives 200 with kitchen metrics, but financialMetrics is omitted', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${kitchenToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.financialMetrics !== undefined) throw new Error('financialMetrics must be omitted for Kitchen staff');
      if (!res.body.data.kitchenMetrics) throw new Error('Kitchen staff should receive kitchenMetrics');
    });

    await assert('5. Cross-tenant user attempting to access Restaurant A dashboard metrics is rejected (403 TENANT_FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${foreignStaffToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (
        res.body.errorCode !== 'TENANT_FORBIDDEN' &&
        res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS' &&
        res.body.errorCode !== 'RESTAURANT_ACCESS_DENIED'
      ) {
        throw new Error(`Expected TENANT_FORBIDDEN, got ${res.body.errorCode}`);
      }
    });

    await assert('6. Disabled staff member requesting dashboard metrics is rejected (403 STAFF_DISABLED)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${disabledStaffToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (res.body.errorCode !== 'STAFF_DISABLED') throw new Error(`Expected STAFF_DISABLED, got ${res.body.errorCode}`);
    });

    // =========================================================================
    // SECTION 2: GRANULAR ORDER STATUS TRANSITIONS (Tests 7-18)
    // =========================================================================
    await assert('7. Public customer places an order in Restaurant A (status PENDING)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({
          restaurantSlug: restaurantA.slug,
          tableNumber: tableA.number,
          paymentMethod: 'CASH',
          nif: '999999990',
          items: [{ foodItemId: foodItemA.id, quantity: 2, customerNote: 'Medium cooked' }],
        });
      if (res.status !== 201 || !res.body.success) throw new Error(`Order placement failed: ${res.status}`);
      testOrderA = res.body.data;
      if (testOrderA.status !== 'PENDING') throw new Error(`Expected status PENDING, got ${testOrderA.status}`);
    });

    await assert('8. Waiter with CONFIRM_ORDER can transition order from PENDING to CONFIRMED', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ status: 'CONFIRMED' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.status !== 'CONFIRMED') throw new Error('Status not updated to CONFIRMED');
      testOrderA = res.body.data;
    });

    await assert('9. Waiter without CONFIRM_PREPARATION cannot transition CONFIRMED to PREPARING (403 INSUFFICIENT_PERMISSIONS)', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ status: 'PREPARING' });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') throw new Error('Expected INSUFFICIENT_PERMISSIONS');
    });

    await assert('10. Kitchen staff with CONFIRM_PREPARATION can transition CONFIRMED to PREPARING', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'PREPARING' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.status !== 'PREPARING') throw new Error('Status not updated to PREPARING');
      testOrderA = res.body.data;
    });

    await assert('11. Waiter without MARK_READY cannot transition PREPARING to READY (403)', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ status: 'READY' });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('12. Kitchen staff with MARK_READY can transition PREPARING to READY', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'READY' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.status !== 'READY') throw new Error('Status not updated to READY');
      testOrderA = res.body.data;
    });

    await assert('13. Kitchen staff without MARK_ORDER_SERVED cannot transition READY to SERVED (403)', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'SERVED' });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('14. Waiter with MARK_ORDER_SERVED can transition READY to SERVED', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ status: 'SERVED' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.status !== 'SERVED') throw new Error('Status not updated to SERVED');
      testOrderA = res.body.data;
    });

    await assert('15. Waiter without MARK_ORDER_COMPLETED cannot transition SERVED to COMPLETED (403)', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ status: 'COMPLETED' });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('16. Owner with implicit administrative permissions can transition SERVED to COMPLETED', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/status`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ status: 'COMPLETED' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.status !== 'COMPLETED') throw new Error('Status not updated to COMPLETED');
      testOrderA = res.body.data;
    });

    await assert('17. Waiter without CANCEL_ORDER cannot cancel an order (403)', async () => {
      // Create another order for cancellation testing
      const newOrderRes = await request(app)
        .post('/api/orders')
        .send({
          restaurantSlug: restaurantA.slug,
          tableNumber: tableA.number,
          paymentMethod: 'CASH',
          items: [{ foodItemId: foodItemA.id, quantity: 1 }],
        });
      testOrderB = newOrderRes.body.data;

      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${testOrderB.id}/cancel`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ reason: 'Customer changed mind' });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('18. Owner with CANCEL_ORDER can cancel an order with reason and transition history', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/orders/${testOrderB.id}/cancel`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ reason: 'Customer cancelled at table' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.status !== 'CANCELLED') throw new Error('Expected CANCELLED status');
    });

    // =========================================================================
    // SECTION 3: KITCHEN DISPLAY & ITEM STATUSES (Tests 19-24)
    // =========================================================================
    await assert('19. Kitchen staff with VIEW_KITCHEN can view order list', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders`)
        .set('Authorization', `Bearer ${kitchenToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.body.data)) throw new Error('Expected array of orders');
    });

    await assert('20. Staff without VIEW_ORDERS or VIEW_KITCHEN cannot view orders (403)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders`)
        .set('Authorization', `Bearer ${availabilityClerkToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('21. Waiter without UPDATE_KITCHEN_STATUS cannot update order item status (403)', async () => {
      const itemId = testOrderA.items[0].id;
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/items/${itemId}/status`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ status: 'PREPARING' });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('22. Kitchen staff with UPDATE_KITCHEN_STATUS can advance item status to PREPARING', async () => {
      const itemId = testOrderA.items[0].id;
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/items/${itemId}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'PREPARING' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.status !== 'PREPARING') throw new Error('Item status not updated');
    });

    await assert('23. Kitchen staff with UPDATE_KITCHEN_STATUS can advance item status to READY', async () => {
      const itemId = testOrderA.items[0].id;
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}/items/${itemId}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'READY' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.status !== 'READY') throw new Error('Item status not updated');
    });

    await assert('24. Order details endpoint /restaurants/:id/orders/:orderId verifies VIEW_ORDER_DETAILS', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders/${testOrderA.id}`)
        .set('Authorization', `Bearer ${waiterToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.id !== testOrderA.id) throw new Error('Mismatch order ID');
    });

    // =========================================================================
    // SECTION 4: PAYMENTS & CASH SETTLEMENT PERMISSIONS (Tests 25-30)
    // =========================================================================
    await assert('25. Waiter without VIEW_PAYMENTS cannot list payments (403)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/payments`)
        .set('Authorization', `Bearer ${waiterToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('26. Cashier with VIEW_PAYMENTS can list payments', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/payments`)
        .set('Authorization', `Bearer ${cashierToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.body.data)) throw new Error('Expected array of payments');
    });

    await assert('27. Waiter without CONFIRM_CASH_PAYMENT cannot settle cash on /orders/:id/cash-payment (403)', async () => {
      const res = await request(app)
        .post(`/api/orders/${testOrderA.id}/cash-payment`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ amountReceived: 50.0, changeGiven: 5.0 });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('28. Cashier with CONFIRM_CASH_PAYMENT can settle cash payment and generate receipt', async () => {
      const res = await request(app)
        .post(`/api/orders/${testOrderA.id}/cash-payment`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ amountReceived: 50.0, changeGiven: 5.0 });
      if (res.status !== 200 || !res.body.success) throw new Error(`Cash payment failed: ${res.status}`);
      if (!res.body.data.payment || !res.body.data.receipt) throw new Error('Missing payment/receipt');
      testPaymentA = res.body.data.payment;
    });

    await assert('29. Waiter without PROCESS_PAYMENTS cannot issue a refund (403)', async () => {
      const res = await request(app)
        .post(`/api/payments/${testPaymentA.id}/refund`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ amount: 10.0, reason: 'Dissatisfied diner' });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('30. Cashier with PROCESS_PAYMENTS can issue a refund on settled payment', async () => {
      const res = await request(app)
        .post(`/api/payments/${testPaymentA.id}/refund`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ amount: 5.0, reason: 'Complimentary adjustment' });
      if (res.status !== 200 || !res.body.success) throw new Error(`Refund failed: ${res.status}`);
      if (!res.body.data.refundedAmount && res.body.data.status !== 'REFUNDED' && res.body.data.status !== 'PARTIALLY_REFUNDED') {
        throw new Error('Expected refund result');
      }
    });

    // =========================================================================
    // SECTION 5: MENU CATALOG, FOOD CRUD & PRICE SECURITY (Tests 31-38)
    // =========================================================================
    await assert('31. Staff with VIEW_MENU can list foods', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/foods`)
        .set('Authorization', `Bearer ${menuManagerToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.body.data)) throw new Error('Expected array of foods');
    });

    await assert('32. Staff without VIEW_MENU cannot list foods (403)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/foods`)
        .set('Authorization', `Bearer ${cashierToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('33. Menu Manager without MANAGE_FOOD_PRICES cannot create food specifying price (403)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/foods`)
        .set('Authorization', `Bearer ${menuManagerToken}`)
        .send({
          categoryId: categoryA.id,
          name: 'Forbidden Priced Steak',
          price: 35.0,
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') throw new Error('Expected INSUFFICIENT_PERMISSIONS');
    });

    await assert('34. Menu Manager without MANAGE_FOOD_PRICES cannot update price of existing food (403)', async () => {
      const res = await request(app)
        .put(`/api/foods/${foodItemA.id}`)
        .set('Authorization', `Bearer ${menuManagerToken}`)
        .send({
          name: 'Updated Bacalhau',
          price: 99.0, // Changing price
        });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('35. Menu Manager with MANAGE_FOODS can update food name, description without changing price', async () => {
      const res = await request(app)
        .put(`/api/foods/${foodItemA.id}`)
        .set('Authorization', `Bearer ${menuManagerToken}`)
        .send({
          name: 'Grilled Bacalhau Supreme',
          description: 'Slow roasted with extra virgin olive oil and garlic',
          price: foodItemA.price, // Same price
        });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.name !== 'Grilled Bacalhau Supreme') throw new Error('Food name not updated');
    });

    await assert('36. Pricing Manager with MANAGE_FOOD_PRICES can update food item price', async () => {
      const res = await request(app)
        .put(`/api/foods/${foodItemA.id}`)
        .set('Authorization', `Bearer ${pricingManagerToken}`)
        .send({
          price: 24.0,
        });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (Number(res.body.data.price) !== 24.0) throw new Error('Price not updated');
      foodItemA.price = 24.0;
    });

    await assert('37. Availability Clerk without MANAGE_FOODS can toggle availability on PATCH /foods/:id/availability', async () => {
      const res = await request(app)
        .patch(`/api/foods/${foodItemA.id}/availability`)
        .set('Authorization', `Bearer ${availabilityClerkToken}`)
        .send({ available: false });
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.available !== false) throw new Error('Availability not toggled to false');
    });

    await assert('38. Waiter without TOGGLE_FOOD_AVAILABILITY cannot toggle availability (403)', async () => {
      const res = await request(app)
        .patch(`/api/foods/${foodItemA.id}/availability`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ available: true });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    // =========================================================================
    // SECTION 6: CATEGORIES & MEDIA LIBRARY PERMISSIONS (Tests 39-44)
    // =========================================================================
    await assert('39. Staff without MANAGE_CATEGORIES cannot create categories (403)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/categories`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ name: 'Desserts', slug: `desserts-${timestamp}` });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('40. Owner with MANAGE_CATEGORIES can create new category', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/categories`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ name: 'Desserts', slug: `desserts-${timestamp}` });
      if (res.status !== 201 || !res.body.success) throw new Error(`Expected 201, got ${res.status}`);
    });

    await assert('41. Staff without VIEW_MEDIA cannot list media assets (403)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/media`)
        .set('Authorization', `Bearer ${waiterToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('42. Media Specialist with VIEW_MEDIA can list media assets', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/media`)
        .set('Authorization', `Bearer ${mediaSpecialistToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
    });

    await assert('43. Media Specialist with UPLOAD_MEDIA can register a media asset', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/media`)
        .set('Authorization', `Bearer ${mediaSpecialistToken}`)
        .send({
          type: 'IMAGE',
          url: 'https://images.unsplash.com/photo-1544025162-d76694265947',
          filename: 'bacalhau-photo.jpg',
          size: 102400,
        });
      if (res.status !== 201 || !res.body.success) throw new Error(`Media registration failed: ${res.status}`);
      testMediaA = res.body.data;
    });

    await assert('44. Media Specialist without MANAGE_MEDIA cannot delete media (403), while Owner can delete', async () => {
      const failRes = await request(app)
        .delete(`/api/media/${testMediaA.id}`)
        .set('Authorization', `Bearer ${mediaSpecialistToken}`);
      if (failRes.status !== 403) throw new Error(`Expected 403, got ${failRes.status}`);

      const passRes = await request(app)
        .delete(`/api/media/${testMediaA.id}`)
        .set('Authorization', `Bearer ${ownerAToken}`);
      if (passRes.status !== 200) throw new Error(`Owner delete failed: ${passRes.status}`);
    });

    // =========================================================================
    // SECTION 7: DINING TABLES & TABLE QR PERMISSIONS (Tests 45-48)
    // =========================================================================
    await assert('45. Staff without VIEW_TABLES cannot list dining tables (403)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/tables`)
        .set('Authorization', `Bearer ${cashierToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('46. Table Manager with VIEW_TABLES can list tables and resolve /tables/:tableId', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/tables`)
        .set('Authorization', `Bearer ${tableManagerToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);

      const singleRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/tables/${tableA.id}`)
        .set('Authorization', `Bearer ${tableManagerToken}`);
      if (singleRes.status !== 200) throw new Error(`Single table lookup failed: ${singleRes.status}`);
    });

    await assert('47. Waiter without MANAGE_TABLES cannot create a table (403)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/tables`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ number: '99', capacity: 2 });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('48. Table Manager with MANAGE_TABLES can create and update tables', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/tables`)
        .set('Authorization', `Bearer ${tableManagerToken}`)
        .send({ number: '99', name: 'Table 99', capacity: 2 });
      if (res.status !== 201 || !res.body.success) throw new Error(`Table create failed: ${res.status}`);
      const createdId = res.body.data.id;

      const updateRes = await request(app)
        .put(`/api/restaurants/${restaurantA.id}/tables/${createdId}`)
        .set('Authorization', `Bearer ${tableManagerToken}`)
        .send({ capacity: 4 });
      if (updateRes.status !== 200) throw new Error(`Table update failed: ${updateRes.status}`);

      // Clean up test table
      await prisma.table.delete({ where: { id: createdId } });
    });

    // =========================================================================
    // SECTION 8: CUSTOMER DIRECTORY & FISCAL DATA PRIVACY (Tests 49-52)
    // =========================================================================
    await assert('49. Staff without VIEW_CUSTOMERS cannot view customer directory (403)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/customers`)
        .set('Authorization', `Bearer ${kitchenToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('50. Guest Host with VIEW_CUSTOMERS can view customer directory', async () => {
      // Create a test customer with fiscal profile
      testCustomerA = await prisma.customer.create({
        data: {
          restaurantId: restaurantA.id,
          name: 'Joao Silva',
          email: `joao-${timestamp}@test.com`,
          phone: '+351912345678',
          fiscalProfiles: {
            create: {
              taxId: '212345679',
              taxCountry: 'PT',
              billingName: 'Joao Silva Lda',
            },
          },
        },
      });

      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/customers`)
        .set('Authorization', `Bearer ${guestHostToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.body.data.customers)) throw new Error('Expected customers array');
    });

    await assert('51. Guest Host WITHOUT VIEW_CUSTOMER_FISCAL_DATA querying customer detail gets masked/stripped fiscal profiles', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/customers/${testCustomerA.id}`)
        .set('Authorization', `Bearer ${guestHostToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.fiscalProfiles && res.body.data.fiscalProfiles.length > 0) {
        throw new Error('fiscalProfiles must be stripped for caller without VIEW_CUSTOMER_FISCAL_DATA');
      }
    });

    await assert('52. Compliance Auditor WITH VIEW_CUSTOMER_FISCAL_DATA querying customer detail receives fiscal profiles', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/customers/${testCustomerA.id}`)
        .set('Authorization', `Bearer ${complianceAuditorToken}`);
      if (res.status !== 200 || !res.body.success) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data.fiscalProfiles || res.body.data.fiscalProfiles.length === 0) {
        throw new Error('Compliance auditor must receive customer fiscalProfiles');
      }
      if (res.body.data.fiscalProfiles[0].taxId !== '212345679') {
        throw new Error('Fiscal taxId mismatch');
      }
    });

    // =========================================================================
    // SECTION 9: DISABLED STAFF, CROSS-TENANT & REAL-TIME ISOLATION (Tests 53-56)
    // =========================================================================
    await assert('53. Disabled staff member calling operational API is rejected (403 STAFF_DISABLED)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/foods`)
        .set('Authorization', `Bearer ${disabledStaffToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (res.body.errorCode !== 'STAFF_DISABLED') throw new Error(`Expected STAFF_DISABLED, got ${res.body.errorCode}`);
    });

    await assert('54. Disabled staff member attempting to connect to real-time SSE is rejected (403 STAFF_DISABLED)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/events?token=${disabledStaffToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (res.body.errorCode !== 'STAFF_DISABLED') throw new Error(`Expected STAFF_DISABLED, got ${res.body.errorCode}`);
    });

    await assert('55. Cross-tenant user attempting table creation in another restaurant is rejected (403 TENANT_FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/tables`)
        .set('Authorization', `Bearer ${foreignStaffToken}`)
        .send({ number: '404', capacity: 2 });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (
        res.body.errorCode !== 'TENANT_FORBIDDEN' &&
        res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS' &&
        res.body.errorCode !== 'RESTAURANT_ACCESS_DENIED'
      ) {
        throw new Error(`Expected tenant rejection, got ${res.body.errorCode}`);
      }
    });

    await assert('56. Unauthenticated requests to operational endpoints receive 401 UNAUTHORIZED', async () => {
      const res1 = await request(app).get(`/api/restaurants/${restaurantA.id}/orders`);
      if (res1.status !== 401) throw new Error(`Expected 401 on orders, got ${res1.status}`);

      const res2 = await request(app).get(`/api/restaurants/${restaurantA.id}/payments`);
      if (res2.status !== 401) throw new Error(`Expected 401 on payments, got ${res2.status}`);

      const res3 = await request(app).get(`/api/restaurants/${restaurantA.id}/dashboard-metrics`);
      if (res3.status !== 401) throw new Error(`Expected 401 on dashboard-metrics, got ${res3.status}`);
    });
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    try {
      if (restaurantA?.id) {
        await prisma.fiscalDocument.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.payment.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.orderItem.deleteMany({ where: { order: { restaurantId: restaurantA.id } } });
        await prisma.order.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.customerFiscalProfile.deleteMany({ where: { customer: { restaurantId: restaurantA.id } } });
        await prisma.customer.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.media.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.foodItem.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.category.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.table.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.userRestaurantPermission.deleteMany({ where: { userRestaurant: { restaurantId: restaurantA.id } } });
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.restaurant.delete({ where: { id: restaurantA.id } });
      }

      if (restaurantB?.id) {
        await prisma.userRestaurantPermission.deleteMany({ where: { userRestaurant: { restaurantId: restaurantB.id } } });
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurantB.id } });
        await prisma.restaurant.delete({ where: { id: restaurantB.id } });
      }

      if (emailsToClean.length > 0) {
        await prisma.user.deleteMany({ where: { email: { in: emailsToClean } } });
      }
    } catch (cleanupErr) {
      console.warn('Test cleanup warning:', cleanupErr);
    }
  }

  console.log(`\n========================================`);
  console.log(`Phase 11B Operational Access Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runOperationalAccessTests().catch((err) => {
  console.error('Unhandled test execution failure:', err);
  process.exit(1);
});
