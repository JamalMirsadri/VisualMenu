import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { ensureActiveSubscription } from './helpers';

async function createCategory(restaurantId: string, name: string, slug: string) {
  return prisma.category.create({ data: { restaurantId, name, slug } });
}

async function createFood(restaurantId: string, categoryId: string, name: string, slug: string, analyticsType: string, price: number) {
  return prisma.foodItem.create({ data: { restaurantId, categoryId, name, slug, analyticsType: analyticsType as any, price } });
}

async function createOrder(
  restaurantId: string,
  orderNumber: string,
  createdAt: string,
  status: string,
  items: { foodId: string; name: string; price: number }[],
  payment?: { method: string; refund?: number }
) {
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const order = await prisma.order.create({
    data: {
      restaurantId,
      orderNumber,
      status: status as any,
      subtotal,
      tax: 0,
      total: subtotal,
      createdAt: new Date(createdAt),
      items: { create: items.map((i) => ({ foodItemId: i.foodId, foodNameSnapshot: i.name, unitPrice: i.price, quantity: 1, lineTotal: i.price })) },
    },
  });
  if (payment) {
    const p = await prisma.payment.create({ data: { restaurantId, orderId: order.id, method: payment.method as any, provider: 'TEST', status: 'PAID', amount: subtotal, currency: 'EUR' } });
    if (payment.refund) {
      await prisma.paymentTransaction.create({ data: { paymentId: p.id, type: 'REFUND', amount: payment.refund, currency: 'EUR', status: 'SUCCESS' } });
    }
  }
  return order;
}

async function runTests() {
  console.log('🧪 Platform Analytics Regression Suite (15 Tests)...\n');
  let passed = 0;
  let failed = 0;
  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/15] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/15] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let r1: any, r2: any;
  let platformToken = '';
  let ownerToken = '';

  try {
    const plat = await request(app).post('/api/auth/login').send({ email: 'platformadmin@auramenu.com', password: 'Password123!' });
    platformToken = plat.body.data?.token;

    r1 = await prisma.restaurant.create({ data: { name: 'P1', slug: `p1-${unique}`, active: true, timezone: 'UTC' } });
    r2 = await prisma.restaurant.create({ data: { name: 'P2', slug: `p2-${unique}`, active: true, timezone: 'America/New_York' } });
    await ensureActiveSubscription(r1.id);

    // Owner (restaurant admin) for authorization test.
    const ownerEmail = `pa-owner-${unique}@test.com`;
    const owner = await prisma.user.create({ data: { email: ownerEmail, name: 'Owner', passwordHash: await bcrypt.hash('Password123!', 10) } });
    await prisma.userRestaurant.create({ data: { userId: owner.id, restaurantId: r1.id, role: 'OWNER' } });
    const own = await request(app).post('/api/auth/login').send({ email: ownerEmail, password: 'Password123!' });
    ownerToken = own.body.data?.token;

    // R1 catalog
    const mains = await createCategory(r1.id, 'Main Course', 'mains');
    const drinks = await createCategory(r1.id, 'Drinks', 'drinks');
    const desserts = await createCategory(r1.id, 'Desserts', 'desserts');
    const burger = await createFood(r1.id, mains.id, 'Burger', `pa-burger-${unique}`, 'FOOD', 20);
    const cola = await createFood(r1.id, drinks.id, 'Cola', `pa-cola-${unique}`, 'DRINK', 10);
    const cake = await createFood(r1.id, desserts.id, 'Cake', `pa-cake-${unique}`, 'DESSERT', 10);
    const pizza = await createFood(r1.id, mains.id, 'Pizza', `pa-pizza-${unique}`, 'FOOD', 15);
    const soda = await createFood(r1.id, drinks.id, 'Soda', `pa-soda-${unique}`, 'DRINK', 15);

    await createOrder(r1.id, 'O1', '2099-09-15T10:00:00Z', 'PENDING', [
      { foodId: burger.id, name: 'Burger', price: 20 }, { foodId: cola.id, name: 'Cola', price: 10 }, { foodId: cake.id, name: 'Cake', price: 10 },
    ], { method: 'CASH', refund: 10 });
    await createOrder(r1.id, 'O2', '2099-09-16T10:00:00Z', 'PENDING', [
      { foodId: burger.id, name: 'Burger', price: 20 }, { foodId: cola.id, name: 'Cola', price: 10 },
    ], { method: 'CASH' });
    await createOrder(r1.id, 'O3', '2099-09-17T10:00:00Z', 'PENDING', [
      { foodId: burger.id, name: 'Burger', price: 20 }, { foodId: cola.id, name: 'Cola', price: 10 },
    ], { method: 'CASH' });
    await createOrder(r1.id, 'O4', '2099-09-18T10:00:00Z', 'PENDING', [
      { foodId: pizza.id, name: 'Pizza', price: 15 }, { foodId: soda.id, name: 'Soda', price: 15 },
    ], { method: 'CARD' });
    await createOrder(r1.id, 'OCANCEL', '2099-09-19T10:00:00Z', 'CANCELLED', [
      { foodId: burger.id, name: 'Burger', price: 20 },
    ]);
    await createOrder(r1.id, 'O_PREV', '2099-08-10T10:00:00Z', 'PENDING', [
      { foodId: burger.id, name: 'Burger', price: 20 },
    ], { method: 'CASH' });

    // R2 catalog
    const r2mains = await createCategory(r2.id, 'Main Course', 'mains');
    const r2drinks = await createCategory(r2.id, 'Drinks', 'drinks');
    const pizza2 = await createFood(r2.id, r2mains.id, 'Pizza2', `pa-pizza2-${unique}`, 'FOOD', 15);
    const soda2 = await createFood(r2.id, r2drinks.id, 'Soda2', `pa-soda2-${unique}`, 'DRINK', 15);
    await createOrder(r2.id, 'R2-O1', '2099-09-15T10:00:00Z', 'PENDING', [
      { foodId: pizza2.id, name: 'Pizza2', price: 15 }, { foodId: soda2.id, name: 'Soda2', price: 15 },
    ], { method: 'CARD' });

    const url = (params: string) => `/api/platform/analytics?${params}`;

    await assert(1, 'Platform authorization (PLATFORM_ADMIN only)', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${ownerToken}`);
      if (res.status !== 403) throw new Error(`restaurant admin expected 403, got ${res.status}`);
      const noAuth = await request(app).get(url('period=month&date=2099-09'));
      if (noAuth.status !== 401) throw new Error(`expected 401, got ${noAuth.status}`);
    });

    await assert(2, 'Multi-restaurant aggregation', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const k = res.body.data.kpis;
      if (k.totalOrders !== 5) throw new Error(`expected 5 orders, got ${k.totalOrders}`);
      if (k.totalRevenue !== 160) throw new Error(`expected 160 revenue, got ${k.totalRevenue}`);
    });

    await assert(3, 'Date filters (day/month/year)', async () => {
      const day = await request(app).get(url('period=day&date=2099-09-15')).set('Authorization', `Bearer ${platformToken}`);
      if (day.body.data.kpis.totalOrders !== 2) throw new Error(`day expected 2, got ${day.body.data.kpis.totalOrders}`);
      const year = await request(app).get(url('period=year&date=2099')).set('Authorization', `Bearer ${platformToken}`);
      if (year.body.data.kpis.totalOrders !== 6) throw new Error(`year expected 6, got ${year.body.data.kpis.totalOrders}`);
    });

    await assert(4, 'Previous-period comparison', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      const k = res.body.data.kpis;
      if (k.previous.totalOrders !== 1) throw new Error(`expected previous 1 order, got ${k.previous.totalOrders}`);
      if (k.revenueGrowthPct !== 700) throw new Error(`expected 700% growth, got ${k.revenueGrowthPct}`);
    });

    await assert(5, 'Timezone handling (per-restaurant)', async () => {
      const r2res = await request(app).get(url('period=month&date=2099-09&restaurantId=' + r2.id)).set('Authorization', `Bearer ${platformToken}`);
      const hour6 = r2res.body.data.timeAnalysis.ordersByHour.find((h: any) => h.hour === 6);
      if (!hour6 || hour6.orders !== 1) throw new Error(`R2 hour 6 expected 1, got ${JSON.stringify(hour6)}`);
    });

    await assert(6, 'Product type classification', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      const drinks = (res.body.data.productIntelligence.topDrinks || []).map((x: any) => x.name);
      const foods = (res.body.data.productIntelligence.topFoods || []).map((x: any) => x.name);
      const desserts = (res.body.data.productIntelligence.topDesserts || []).map((x: any) => x.name);
      if (!drinks.includes('Cola')) throw new Error(`Cola missing from drinks: ${drinks}`);
      if (!foods.includes('Burger')) throw new Error(`Burger missing from foods: ${foods}`);
      if (!desserts.includes('Cake')) throw new Error(`Cake missing from desserts: ${desserts}`);
    });

    await assert(7, 'Payment aggregation', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      const cash = res.body.data.paymentIntelligence.byMethod.find((p: any) => p.method === 'CASH');
      const card = res.body.data.paymentIntelligence.byMethod.find((p: any) => p.method === 'CARD');
      if (!cash || cash.count !== 3 || cash.revenue !== 100) throw new Error(`cash ${JSON.stringify(cash)}`);
      if (!card || card.count !== 2 || card.revenue !== 60) throw new Error(`card ${JSON.stringify(card)}`);
    });

    await assert(8, 'Cancellation/refund logic', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      const c = res.body.data.cancellationRefund;
      if (c.cancelledOrders !== 1) throw new Error(`cancelled ${c.cancelledOrders}`);
      if (c.refundAmount !== 10) throw new Error(`refund ${c.refundAmount}`);
      if (c.netRevenue !== 150) throw new Error(`net ${c.netRevenue}`);
    });

    await assert(9, 'Combination analysis with support/confidence/lift', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      const fd = res.body.data.combinations.foodDrink.find((x: any) => x.combination.join('+') === 'Burger+Cola');
      if (!fd || fd.count !== 3) throw new Error(`Burger+Cola ${JSON.stringify(fd)}`);
      if (fd.support !== 0.6 || fd.confidence !== 1) throw new Error(`metrics ${fd.support}/${fd.confidence}`);
    });

    await assert(10, 'Benchmark calculations (medians)', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      const b = res.body.data.benchmarks;
      if (b.medianRestaurantRevenue !== 80) throw new Error(`median revenue ${b.medianRestaurantRevenue}`);
      if (b.medianOrders !== 2.5) throw new Error(`median orders ${b.medianOrders}`);
    });

    await assert(11, 'Minimum sample-size handling (suppress weak combos)', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      const fd = res.body.data.combinations.foodDrink;
      if (fd.some((x: any) => x.combination.join('+') === 'Pizza+Soda')) throw new Error('weak combo not suppressed');
      if (res.body.data.combinations.sampleThreshold !== 3) throw new Error('sample threshold mismatch');
    });

    await assert(12, 'Restaurant isolation (no cross-tenant leak in restaurant filter)', async () => {
      const res = await request(app).get(url('period=month&date=2099-09&restaurantId=' + r1.id)).set('Authorization', `Bearer ${platformToken}`);
      const names = (res.body.data.productIntelligence.topFoods || []).map((x: any) => x.name);
      if (names.includes('Pizza2')) throw new Error('R2 product leaked into R1 filtered view');
    });

    await assert(13, 'CSV export', async () => {
      const res = await request(app).get(`/api/platform/analytics/export?period=month&date=2099-09&format=csv&report=summary`).set('Authorization', `Bearer ${platformToken}`);
      if (res.status !== 200 || !res.text.startsWith('\uFEFF') || !res.text.includes('Total Revenue')) throw new Error('CSV invalid');
    });

    await assert(14, 'XLSX export', async () => {
      const res = await request(app).get(`/api/platform/analytics/export?period=month&date=2099-09&format=xlsx&report=summary`).set('Authorization', `Bearer ${platformToken}`).buffer(true).parse((res: any, cb: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      const buf: Buffer = res.body;
      if (!Buffer.isBuffer(buf) || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('invalid xlsx');
    });

    await assert(15, 'No cross-tenant leakage', async () => {
      const res = await request(app).get(url('period=month&date=2099-09')).set('Authorization', `Bearer ${platformToken}`);
      const names = (res.body.data.productIntelligence.topFoods || []).map((x: any) => x.name).concat((res.body.data.productIntelligence.topDrinks || []).map((x: any) => x.name));
      if (!names.includes('Pizza2') || !names.includes('Soda2')) throw new Error('aggregation did not include R2 products');
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (r1?.id) await RestaurantDeletionService.hardDelete(r1.id).catch(() => {});
    if (r2?.id) await RestaurantDeletionService.hardDelete(r2.id).catch(() => {});
    await prisma.user.deleteMany({ where: { email: `pa-owner-${unique}@test.com` } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nPlatform Analytics Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
