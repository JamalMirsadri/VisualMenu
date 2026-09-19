import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { OrderStatus, PaymentMethod, PaymentStatus, Role, Prisma } from '@prisma/client';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';

async function setupRestaurant(unique: string, idx: number) {
  const plan = await prisma.subscriptionPlan.create({
    data: { code: `PAYL-${idx}-${unique}`, name: `PayLife Plan ${idx}`, price: 10, features: ['PAYMENTS'], active: true },
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: `PayLife Rest ${idx}`, slug: `paylife-rest-${idx}-${unique}`, active: true },
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
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const user = await prisma.user.create({
    data: { email: `paylife-owner-${idx}-${unique}@test.com`, name: 'PayLife Owner', passwordHash },
  });
  await prisma.userRestaurant.create({ data: { userId: user.id, restaurantId: restaurant.id, role: Role.OWNER } });
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' });
  const table = await prisma.table.create({ data: { restaurantId: restaurant.id, number: `P${idx}` } });
  return { restaurant, plan, user, token: login.body.data?.token, table };
}

async function createOrder(restaurantId: string, tableId: string, n: number, unique: string, status: OrderStatus = OrderStatus.PENDING) {
  return prisma.order.create({
    data: {
      restaurantId,
      tableId,
      orderNumber: `PL-${n}-${unique}`,
      status,
      subtotal: new Prisma.Decimal('50.00'),
      total: new Prisma.Decimal('50.00'),
    },
  });
}

async function createPayment(restaurantId: string, orderId: string, method: PaymentMethod, status: PaymentStatus, amount = '50.00') {
  return prisma.payment.create({
    data: {
      restaurantId,
      orderId,
      method,
      provider: method === PaymentMethod.CASH ? 'MANUAL_CASH' : 'MOCK',
      status,
      amount: new Prisma.Decimal(amount),
    },
  });
}

async function runTests() {
  const TOTAL = 10;
  console.log(`💳 Payment Transaction Lifecycle + Pagination Test Suite (${TOTAL} Tests)...\n`);
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
  const emails: string[] = [];

  try {
    const R = await setupRestaurant(unique, 1);
    const R2 = await setupRestaurant(unique, 2);
    const R3 = await setupRestaurant(unique, 3);
    for (const r of [R, R2, R3]) {
      planIds.push(r.plan.id);
      restaurantIds.push(r.restaurant.id);
      emails.push(r.user.email);
    }

    // 1. Unpaid payment is cancelled when order is cancelled (with attribution)
    await assert(1, 'Order cancellation sets unpaid payment to CANCELLED with attribution', async () => {
      const order = await createOrder(R.restaurant.id, R.table.id, 1, unique);
      const payment = await createPayment(R.restaurant.id, order.id, PaymentMethod.CASH, PaymentStatus.UNPAID);

      const res = await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${R.token}`)
        .send({ reason: 'Customer walked out' });

      if (res.status !== 200) throw new Error(`cancel failed ${res.status}: ${JSON.stringify(res.body)}`);

      const o = await prisma.order.findUnique({ where: { id: order.id } });
      if (o?.status !== OrderStatus.CANCELLED) throw new Error(`order not CANCELLED: ${o?.status}`);
      if (!o?.cancelledAt) throw new Error('order.cancelledAt missing');
      if (o.cancelledByActorType !== 'STAFF') throw new Error(`actorType=${o.cancelledByActorType}`);
      if (o.cancelledByUserId !== R.user.id) throw new Error('cancelledByUserId mismatch');
      if (o.cancellationReason !== 'Customer walked out') throw new Error(`reason=${o.cancellationReason}`);

      const p = await prisma.payment.findUnique({ where: { id: payment.id } });
      if (p?.status !== PaymentStatus.CANCELLED) throw new Error(`payment not CANCELLED: ${p?.status}`);
      if (!p?.cancelledAt) throw new Error('payment.cancelledAt missing');
      if (p.cancelledByActorType !== 'STAFF') throw new Error(`payment actorType=${p.cancelledByActorType}`);
      if (p.cancelledByUserId !== R.user.id) throw new Error('payment cancelledByUserId mismatch');
      if (p.cancellationReason !== 'Customer walked out') throw new Error(`payment reason=${p.cancellationReason}`);
    });

    // 2. Paid order is unchanged when order is cancelled
    await assert(2, 'Order cancellation leaves PAID payment unchanged', async () => {
      const order = await createOrder(R.restaurant.id, R.table.id, 2, unique);
      const payment = await createPayment(R.restaurant.id, order.id, PaymentMethod.CARD, PaymentStatus.PAID);

      const res = await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${R.token}`)
        .send({ reason: 'test' });
      if (res.status !== 200) throw new Error(`cancel failed ${res.status}`);

      const p = await prisma.payment.findUnique({ where: { id: payment.id } });
      if (p?.status !== PaymentStatus.PAID) throw new Error(`PAID payment changed to ${p?.status}`);
    });

    // 3. PATCH status route also records STAFF attribution + cancels payments
    await assert(3, 'PATCH status to CANCELLED records STAFF attribution and cancels pending payment', async () => {
      const order = await createOrder(R.restaurant.id, R.table.id, 3, unique, OrderStatus.CONFIRMED);
      const payment = await createPayment(R.restaurant.id, order.id, PaymentMethod.MBWAY, PaymentStatus.PENDING);

      const res = await request(app)
        .patch(`/api/restaurants/${R.restaurant.id}/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${R.token}`)
        .send({ status: 'CANCELLED' });
      if (res.status !== 200) throw new Error(`patch failed ${res.status}: ${JSON.stringify(res.body)}`);

      const o = await prisma.order.findUnique({ where: { id: order.id } });
      if (o?.cancelledByActorType !== 'STAFF' || o.cancelledByUserId !== R.user.id) throw new Error('order attribution missing');

      const p = await prisma.payment.findUnique({ where: { id: payment.id } });
      if (p?.status !== PaymentStatus.CANCELLED) throw new Error(`pending payment not cancelled: ${p?.status}`);
    });

    // 4. CANCELLED excluded from financial summary totals
    await assert(4, 'Financial summary excludes CANCELLED from gross/outstanding', async () => {
      const o1 = await createOrder(R2.restaurant.id, R2.table.id, 4, unique);
      await createPayment(R2.restaurant.id, o1.id, PaymentMethod.CARD, PaymentStatus.PAID, '100.00');
      const o2 = await createOrder(R2.restaurant.id, R2.table.id, 5, unique);
      await createPayment(R2.restaurant.id, o2.id, PaymentMethod.CARD, PaymentStatus.CANCELLED, '50.00');
      const o3 = await createOrder(R2.restaurant.id, R2.table.id, 6, unique);
      await createPayment(R2.restaurant.id, o3.id, PaymentMethod.CASH, PaymentStatus.UNPAID, '30.00');

      const res = await request(app)
        .get(`/api/restaurants/${R2.restaurant.id}/payments`)
        .set('Authorization', `Bearer ${R2.token}`);
      if (res.status !== 200) throw new Error(`payments list failed ${res.status}`);

      const { summary } = res.body.data;
      if (Math.round(summary.totalAmount * 100) / 100 !== 100) throw new Error(`gross should be 100, got ${summary.totalAmount}`);
      if (Math.round(summary.outstandingAmount * 100) / 100 !== 30) throw new Error(`outstanding should be 30, got ${summary.outstandingAmount}`);
      if (summary.paidCount !== 1) throw new Error(`paidCount should be 1, got ${summary.paidCount}`);
    });

    // 5. CANCELLED cash excluded from cash register totals
    await assert(5, 'Cash register summary excludes CANCELLED cash', async () => {
      const o1 = await createOrder(R2.restaurant.id, R2.table.id, 7, unique);
      await createPayment(R2.restaurant.id, o1.id, PaymentMethod.CASH, PaymentStatus.PAID, '80.00');
      const o2 = await createOrder(R2.restaurant.id, R2.table.id, 8, unique);
      await createPayment(R2.restaurant.id, o2.id, PaymentMethod.CASH, PaymentStatus.CANCELLED, '40.00');

      const res = await request(app)
        .get(`/api/restaurants/${R2.restaurant.id}/cash-operations`)
        .set('Authorization', `Bearer ${R2.token}`);
      if (res.status !== 200) throw new Error(`cash-operations failed ${res.status}`);

      const { summary } = res.body.data;
      if (Math.round(summary.totalCashCollected * 100) / 100 !== 80) throw new Error(`cash collected should be 80, got ${summary.totalCashCollected}`);
      if (summary.transactionCount !== 1) throw new Error(`transactionCount should be 1, got ${summary.transactionCount}`);
    });

    // 6. Idempotent cancellation (second cancel is rejected, payment stays cancelled)
    await assert(6, 'Cancelling an already-cancelled order is rejected and leaves payment cancelled', async () => {
      const order = await createOrder(R.restaurant.id, R.table.id, 9, unique);
      await createPayment(R.restaurant.id, order.id, PaymentMethod.CASH, PaymentStatus.UNPAID);

      await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${R.token}`)
        .send({ reason: 'first' });

      const second = await request(app)
        .post(`/api/restaurants/${R.restaurant.id}/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${R.token}`)
        .send({ reason: 'second' });
      if (second.status !== 400) throw new Error(`second cancel should be 400, got ${second.status}`);

      const p = await prisma.payment.findFirst({ where: { orderId: order.id } });
      if (p?.status !== PaymentStatus.CANCELLED) throw new Error(`payment should stay CANCELLED, got ${p?.status}`);
    });

    // 7. Default pagination is 10 per page
    await assert(7, 'Payments list defaults to 10 per page', async () => {
      for (let i = 0; i < 12; i++) {
        const o = await createOrder(R3.restaurant.id, R3.table.id, 100 + i, unique);
        await createPayment(R3.restaurant.id, o.id, PaymentMethod.CASH, PaymentStatus.PAID, '10.00');
      }

      const res = await request(app)
        .get(`/api/restaurants/${R3.restaurant.id}/payments`)
        .set('Authorization', `Bearer ${R3.token}`);
      if (res.status !== 200) throw new Error(`list failed ${res.status}`);

      const { payments, pagination } = res.body.data;
      if (payments.length !== 10) throw new Error(`expected 10 rows, got ${payments.length}`);
      if (pagination.limit !== 10) throw new Error(`limit should be 10, got ${pagination.limit}`);
      if (pagination.totalPages !== 2) throw new Error(`totalPages should be 2, got ${pagination.totalPages}`);
    });

    // 8. Page size changes via limit param
    await assert(8, 'Payments list honours page-size (limit=25)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${R3.restaurant.id}/payments?limit=25`)
        .set('Authorization', `Bearer ${R3.token}`);
      if (res.status !== 200) throw new Error(`list failed ${res.status}`);

      const { payments, pagination } = res.body.data;
      if (pagination.limit !== 25) throw new Error(`limit should be 25, got ${pagination.limit}`);
      if (payments.length < 12) throw new Error(`expected >=12 rows, got ${payments.length}`);
      if (pagination.totalPages !== 1) throw new Error(`totalPages should be 1, got ${pagination.totalPages}`);
    });

    // 9. Filters persist across pages
    await assert(9, 'Status filter is preserved across pagination', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${R3.restaurant.id}/payments?status=PAID&page=1&limit=5`)
        .set('Authorization', `Bearer ${R3.token}`);
      if (res.status !== 200) throw new Error(`list failed ${res.status}`);

      const { payments, pagination } = res.body.data;
      const allPaid = payments.every((p: any) => p.status === 'PAID');
      if (!allPaid) throw new Error('non-PAID payment leaked into filtered page');
      if (payments.length !== 5) throw new Error(`expected 5 rows, got ${payments.length}`);
      if (pagination.totalPages < 1) throw new Error('pagination totalPages missing');
    });

    // 10. Pagination is stable and respects filters (page beyond range is empty)
    await assert(10, 'Pagination returns empty page beyond range without error', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${R3.restaurant.id}/payments?page=999&limit=10`)
        .set('Authorization', `Bearer ${R3.token}`);
      if (res.status !== 200) throw new Error(`list failed ${res.status}`);
      const { payments } = res.body.data;
      if (payments.length !== 0) throw new Error(`expected empty page, got ${payments.length}`);
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    for (const rid of restaurantIds) {
      await prisma.fiscalDocument.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.paymentTransaction.deleteMany({ where: { payment: { restaurantId: rid } } }).catch(() => {});
      await prisma.payment.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.orderStatusHistory.deleteMany({ where: { order: { restaurantId: rid } } }).catch(() => {});
      await prisma.orderItem.deleteMany({ where: { order: { restaurantId: rid } } }).catch(() => {});
      await prisma.order.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.table.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await prisma.subscription.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
      await RestaurantDeletionService.hardDelete(rid).catch(() => {});
    }
    if (emails.length) await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    if (planIds.length) await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nPayment Transaction Lifecycle Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
