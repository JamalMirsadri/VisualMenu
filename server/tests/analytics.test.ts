import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';

async function createPlan(code: string, features: string[]) {
  return prisma.subscriptionPlan.create({
    data: { code, name: code, price: 10, active: true, features },
  });
}

async function createRestaurant(unique: string, idx: number) {
  return prisma.restaurant.create({
    data: { name: `Analytics ${idx}`, slug: `analytics-${idx}-${unique}`, active: true, timezone: 'UTC' },
  });
}

async function attachSubscription(restaurantId: string, planId: string) {
  const now = new Date();
  await prisma.subscription.create({
    data: {
      restaurantId,
      planId,
      status: 'ACTIVE',
      startsAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      agreedPrice: 10,
      agreedCurrency: 'EUR',
    },
  });
}

async function createOwner(restaurantId: string, email: string) {
  const user = await prisma.user.create({
    data: { email, name: 'Owner', passwordHash: await bcrypt.hash('Password123!', 10) },
  });
  await prisma.userRestaurant.create({ data: { userId: user.id, restaurantId, role: 'OWNER' } });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
  return res.body.data?.token;
}

async function createCategory(restaurantId: string, name: string, slug: string) {
  return prisma.category.create({ data: { restaurantId, name, slug } });
}

async function createFood(restaurantId: string, categoryId: string, name: string, slug: string, price: number) {
  return prisma.foodItem.create({ data: { restaurantId, categoryId, name, slug, price } });
}

async function createOrder(
  restaurantId: string,
  orderNumber: string,
  createdAt: string,
  status: string,
  items: { foodId: string; name: string; price: number; quantity: number }[],
  payment?: { method: string; refund?: number }
) {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const order = await prisma.order.create({
    data: {
      restaurantId,
      orderNumber,
      status: status as any,
      subtotal,
      tax: 0,
      total: subtotal,
      createdAt: new Date(createdAt),
      items: {
        create: items.map((i) => ({
          foodItemId: i.foodId,
          foodNameSnapshot: i.name,
          unitPrice: i.price,
          quantity: i.quantity,
          lineTotal: i.price * i.quantity,
        })),
      },
    },
  });

  if (payment) {
    const p = await prisma.payment.create({
      data: {
        restaurantId,
        orderId: order.id,
        method: payment.method as any,
        provider: 'TEST',
        status: 'PAID',
        amount: subtotal,
        currency: 'EUR',
      },
    });
    if (payment.refund) {
      await prisma.paymentTransaction.create({
        data: { paymentId: p.id, type: 'REFUND', amount: payment.refund, currency: 'EUR', status: 'SUCCESS' },
      });
    }
  }

  return order;
}

function analyticsUrl(id: string, params: string) {
  return `/api/restaurants/${id}/analytics?${params}`;
}

async function runTests() {
  console.log('🧪 Restaurant Analytics Regression Suite (16 Tests)...\n');
  let passed = 0;
  let failed = 0;
  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/16] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/16] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let r1: any, r2: any, r3: any;
  let plan1: any, plan2: any, plan3: any;
  let t1 = '', t2 = '', t3 = '';

  try {
    plan1 = await createPlan(`ANA1-${unique}`, ['ADVANCED_ANALYTICS', 'ANALYTICS_EXPORT']);
    plan2 = await createPlan(`ANA2-${unique}`, ['ADVANCED_ANALYTICS']);
    plan3 = await createPlan(`ANA3-${unique}`, []);

    r1 = await createRestaurant(unique, 1);
    r2 = await createRestaurant(unique, 2);
    r3 = await createRestaurant(unique, 3);
    await attachSubscription(r1.id, plan1.id);
    await attachSubscription(r2.id, plan2.id);
    await attachSubscription(r3.id, plan3.id);

    t1 = await createOwner(r1.id, `ana-owner1-${unique}@test.com`);
    t2 = await createOwner(r2.id, `ana-owner2-${unique}@test.com`);
    t3 = await createOwner(r3.id, `ana-owner3-${unique}@test.com`);

    // R1 catalog
    const mains = await createCategory(r1.id, 'Main Course', 'mains');
    const drinks = await createCategory(r1.id, 'Drinks', 'drinks');
    const desserts = await createCategory(r1.id, 'Desserts', 'desserts');
    const burger = await createFood(r1.id, mains.id, 'Burger', `burger-${unique}`, 50);
    const cola = await createFood(r1.id, drinks.id, 'Cola', `cola-${unique}`, 10);
    const cake = await createFood(r1.id, desserts.id, 'Cake', `cake-${unique}`, 20);

    await createOrder(r1.id, 'O1', '2026-09-15T10:00:00Z', 'PENDING', [
      { foodId: burger.id, name: 'Burger', price: 50, quantity: 1 },
      { foodId: cola.id, name: 'Cola', price: 10, quantity: 1 },
      { foodId: cake.id, name: 'Cake', price: 20, quantity: 1 },
    ], { method: 'CASH' });

    await createOrder(r1.id, 'O2', '2026-09-20T10:00:00Z', 'PENDING', [
      { foodId: burger.id, name: 'Burger', price: 50, quantity: 1 },
    ], { method: 'CARD', refund: 10 });

    await createOrder(r1.id, 'O5', '2026-09-25T10:00:00Z', 'PENDING', [
      { foodId: burger.id, name: 'Burger', price: 50, quantity: 1 },
      { foodId: cake.id, name: 'Cake', price: 20, quantity: 1 },
    ], { method: 'CASH' });

    await createOrder(r1.id, 'O3', '2026-10-01T10:00:00Z', 'PENDING', [
      { foodId: cola.id, name: 'Cola', price: 10, quantity: 1 },
    ], { method: 'MBWAY' });

    await createOrder(r1.id, 'O6', '2026-08-10T10:00:00Z', 'PENDING', [
      { foodId: burger.id, name: 'Burger', price: 50, quantity: 1 },
    ], { method: 'CASH' });

    await createOrder(r1.id, 'OCANCEL', '2026-09-18T10:00:00Z', 'CANCELLED', [
      { foodId: burger.id, name: 'Burger', price: 50, quantity: 1 },
    ]);

    // R2 catalog + one order (isolation marker)
    const r2mains = await createCategory(r2.id, 'Main Course', 'mains');
    const r2food = await createFood(r2.id, r2mains.id, 'R2-Dish', `r2-dish-${unique}`, 99);
    await createOrder(r2.id, 'R2-ORDER', '2026-09-15T10:00:00Z', 'PENDING', [
      { foodId: r2food.id, name: 'R2-Dish', price: 99, quantity: 1 },
    ], { method: 'CASH' });

    await assert(1, 'Day filtering returns only the selected day', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=day&date=2026-09-15')).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (res.body.data.summary.orders !== 1) throw new Error(`expected 1 order, got ${res.body.data.summary.orders}`);
      if (res.body.data.summary.revenue !== 80) throw new Error(`expected 80 revenue, got ${res.body.data.summary.revenue}`);
    });

    await assert(2, 'Week filtering returns only that ISO week', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=week&date=2026-09-15')).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (res.body.data.summary.orders !== 2) throw new Error(`expected 2 orders, got ${res.body.data.summary.orders}`);
    });

    await assert(3, 'Month filtering returns only that month', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (res.body.data.summary.orders !== 3) throw new Error(`expected 3 orders, got ${res.body.data.summary.orders}`);
    });

    await assert(4, 'Year filtering returns only that year', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=year&date=2026')).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (res.body.data.summary.orders !== 5) throw new Error(`expected 5 orders, got ${res.body.data.summary.orders}`);
    });

    await assert(5, 'Custom date range filtering', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=custom&startDate=2026-09-15&endDate=2026-09-25')).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (res.body.data.summary.orders !== 3) throw new Error(`expected 3 orders, got ${res.body.data.summary.orders}`);
    });

    await assert(6, 'Previous-period comparison', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t1}`);
      if (res.body.data.summary.orders !== 3) throw new Error(`current orders ${res.body.data.summary.orders}`);
      if (res.body.data.summary.previous.orders !== 1) throw new Error(`expected previous 1 order, got ${res.body.data.summary.previous.orders}`);
    });

    await assert(7, 'Cancelled/refunded orders handled consistently', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t1}`);
      const s = res.body.data.summary;
      if (s.cancelledOrders !== 1) throw new Error(`expected 1 cancelled order, got ${s.cancelledOrders}`);
      if (s.refunds !== 10) throw new Error(`expected 10 refunds, got ${s.refunds}`);
      if (s.revenue !== 200) throw new Error(`expected gross 200, got ${s.revenue}`);
      if (s.netRevenue !== 190) throw new Error(`expected net 190, got ${s.netRevenue}`);
    });

    await assert(8, 'Payment method breakdown', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t1}`);
      const pb = res.body.data.paymentBreakdown;
      const cash = pb.find((p: any) => p.method === 'CASH');
      const card = pb.find((p: any) => p.method === 'CARD');
      if (!cash || cash.amount !== 150) throw new Error(`cash ${JSON.stringify(cash)}`);
      if (!card || card.amount !== 50) throw new Error(`card ${JSON.stringify(card)}`);
    });

    await assert(9, 'Food + drink + dessert combinations', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t1}`);
      const c = res.body.data.combinations;
      const fd = c.foodDrink.find((x: any) => x.combination.join('+') === 'Burger+Cola');
      const fdd = c.foodDrinkDessert.find((x: any) => x.combination.join('+') === 'Burger+Cola+Cake');
      if (!fd || fd.count !== 1) throw new Error(`foodDrink ${JSON.stringify(c.foodDrink)}`);
      if (!fdd || fdd.count !== 1) throw new Error(`foodDrinkDessert ${JSON.stringify(c.foodDrinkDessert)}`);
    });

    await assert(10, 'Restaurant isolation (no cross-tenant access)', async () => {
      const res = await request(app).get(analyticsUrl(r2.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });

    await assert(11, 'RBAC: unauthenticated is rejected', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=month&date=2026-09'));
      if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
    });

    await assert(12, 'ADVANCED_ANALYTICS access gate', async () => {
      const res = await request(app).get(analyticsUrl(r3.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t3}`);
      if (res.status !== 403 || res.body.errorCode !== 'FEATURE_NOT_AVAILABLE') {
        throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${res.status} ${JSON.stringify(res.body)}`);
      }
    });

    await assert(13, 'ANALYTICS_EXPORT access gate', async () => {
      const analytics = await request(app).get(analyticsUrl(r2.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t2}`);
      if (analytics.status !== 200) throw new Error(`analytics should be 200, got ${analytics.status}`);

      const exp = await request(app).get(`/api/restaurants/${r2.id}/analytics/export?period=month&date=2026-09&format=csv&report=summary`).set('Authorization', `Bearer ${t2}`);
      if (exp.status !== 403 || exp.body.errorCode !== 'FEATURE_NOT_AVAILABLE') {
        throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${exp.status} ${JSON.stringify(exp.body)}`);
      }
    });

    await assert(14, 'CSV export generation', async () => {
      const res = await request(app).get(`/api/restaurants/${r1.id}/analytics/export?period=month&date=2026-09&format=csv&report=summary`).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!res.text.startsWith('\uFEFF')) throw new Error('missing BOM');
      if (!res.text.includes('Revenue')) throw new Error('missing header');
    });

    await assert(15, 'XLSX export generation', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${r1.id}/analytics/export?period=month&date=2026-09&format=xlsx&report=summary`)
        .set('Authorization', `Bearer ${t1}`)
        .buffer(true)
        .parse((res: any, cb: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      const buf: Buffer = res.body;
      if (!Buffer.isBuffer(buf) || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('invalid xlsx');
    });

    await assert(16, 'No cross-tenant leakage in analytics data', async () => {
      const res = await request(app).get(analyticsUrl(r1.id, 'period=month&date=2026-09')).set('Authorization', `Bearer ${t1}`);
      const names = (res.body.data.topFoods || []).map((x: any) => x.name);
      if (names.includes('R2-Dish')) throw new Error('R2 product leaked into R1 analytics');
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    for (const r of [r1, r2, r3]) if (r?.id) await RestaurantDeletionService.hardDelete(r.id).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: [`ana-owner1-${unique}@test.com`, `ana-owner2-${unique}@test.com`, `ana-owner3-${unique}@test.com`] } } }).catch(() => {});
    for (const p of [plan1, plan2, plan3]) if (p?.id) await prisma.subscriptionPlan.deleteMany({ where: { id: p.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nAnalytics Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
