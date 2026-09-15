import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { InsightService } from '../src/services/insightService';
import { ensureActiveSubscription } from './helpers';

function restaurantAnalytics(over: any = {}) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  return {
    period: { current: { start: '2099-09-01T00:00:00.000Z', end: '2099-10-01T00:00:00.000Z' }, previous: { start: '', end: '' } },
    summary: {
      revenue: 100, netRevenue: 90, orders: 10, averageOrderValue: 10, itemsSold: 20, averageItemsPerOrder: 2,
      refunds: 10, refundCount: 1, cancelledOrders: 0, cancelledItems: 0, newCustomers: 5, returningCustomers: 5,
      previous: { revenue: 50, orders: 10, averageOrderValue: 5, itemsSold: 10 },
    },
    topFoods: [], topDrinks: [], topDesserts: [],
    salesByHour: hours,
    paymentBreakdown: [],
    combinations: { foodDrink: [], foodDessert: [], foodDrinkDessert: [], byHour: [], byWeekday: [] },
    productInsights: { growthDecline: [], productShare: [], crossSellUpsell: [], suggestedBundles: [] },
    ...over,
  };
}

function platformAnalytics(over: any = {}) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  return {
    period: { current: { start: '', end: '' }, previous: { start: '', end: '' } },
    kpis: { totalRevenue: 100, netRevenue: 90, refundAmount: 10, totalOrders: 10, averageOrderValue: 10, itemsSold: 20, averageItemsPerOrder: 2, uniqueCustomers: 10, returningCustomerRate: 50, cancellationRate: 0, revenueGrowthPct: 100, orderGrowthPct: 0, previous: { totalRevenue: 50, totalOrders: 10 } },
    productIntelligence: { topFoods: [], topDrinks: [], topDesserts: [], categoryPerformance: [], productGrowthDecline: [], productPenetration: [] },
    combinations: { foodDrink: [], foodDessert: [], foodDrinkDessert: [], mostCommonDrinkPerFood: [], mostCommonDessertPerFood: [] },
    paymentIntelligence: { byMethod: [] },
    customerBehavior: { newCustomers: 5, returningCustomers: 5, repeatPurchaseRate: 50, ordersPerCustomer: 1, revenuePerCustomer: 10 },
    cancellationRefund: {},
    benchmarks: { medianRestaurantRevenue: 100, medianOrders: 5, medianAOV: 10, medianCancellationRate: 0, medianReturningRate: null },
    restaurantPerformance: [],
    timeAnalysis: { ordersByHour: hours },
    growth: {},
    ...over,
  };
}

function assertEvidence(items: any[]) {
  for (const i of items) {
    if (!i.title || !i.explanation) throw new Error('missing title/explanation');
    if (!i.methodology) throw new Error('missing methodology');
    if (!i.supportingData || Object.keys(i.supportingData).length === 0) throw new Error('missing evidence');
    if (typeof i.sampleSize !== 'number') throw new Error('missing sample size');
    if (!i.confidence) throw new Error('missing confidence');
    if (!i.dateRange) throw new Error('missing date range');
  }
}

async function runTests() {
  console.log('🧪 AI Insights Regression Suite (15 Tests)...\n');
  let passed = 0;
  let failed = 0;
  const assert = async (num: number, desc: string, fn: () => Promise<void> | void) => {
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
  let r1: any, r2: any, plan1: any, plan2: any;
  let t1 = '', t2 = '', platformToken = '';

  try {
    // ----- Unit: engine -----
    await assert(1, 'Trend insight generated from real metric', () => {
      const r = InsightService.generateRestaurantInsights(restaurantAnalytics());
      const trend = r.insights.find((i) => i.type === 'TREND');
      if (!trend) throw new Error('no trend insight');
      if (trend.comparison?.changePct !== 100) throw new Error(`changePct ${trend.comparison?.changePct}`);
      if (trend.value !== 100) throw new Error(`value ${trend.value}`);
    });

    await assert(2, 'Minimum sample threshold suppresses trend', () => {
      const r = InsightService.generateRestaurantInsights(restaurantAnalytics({ summary: { ...restaurantAnalytics().summary, orders: 3, previous: { revenue: 50, orders: 3 } } }));
      if (r.insights.some((i) => i.type === 'TREND')) throw new Error('trend should be suppressed');
      if (!r.insufficientData.some((m) => m.toLowerCase().includes('insufficient orders'))) throw new Error('missing insufficient-data note');
    });

    await assert(3, 'Product share suppressed below threshold', () => {
      const r = InsightService.generateRestaurantInsights(restaurantAnalytics({ topFoods: [{ name: 'Burger', category: 'Mains', quantity: 2, revenue: 20 }] }));
      if (r.insights.some((i) => i.type === 'PRODUCT_SHARE')) throw new Error('low-quantity product should be suppressed');
    });

    await assert(4, 'Restaurant combination insight with count', () => {
      const r = InsightService.generateRestaurantInsights(restaurantAnalytics({ combinations: { ...restaurantAnalytics().combinations, foodDrink: [{ combination: ['Burger', 'Cola'], count: 3 }] } }));
      const c = r.insights.find((i) => i.type === 'COMBINATION');
      if (!c || c.value !== 3) throw new Error('combination insight missing');
    });

    await assert(5, 'Platform combination uses support/confidence/lift', () => {
      const r = InsightService.generatePlatformInsights(platformAnalytics({ combinations: { ...platformAnalytics().combinations, foodDrink: [{ combination: ['Burger', 'Cola'], count: 3, support: 0.6, confidence: 1, lift: 1.67 }] } }));
      const c = r.insights.find((i) => i.type === 'COMBINATION');
      if (!c || c.supportingData.lift !== 1.67) throw new Error('lift not attached');
    });

    await assert(6, 'Anomaly detection via z-score', () => {
      const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: hour === 12 ? 1000 : 10 }));
      const r = InsightService.generateRestaurantInsights(restaurantAnalytics({ salesByHour: hours }));
      if (!r.anomalies.some((a) => a.type === 'ANOMALY_HIGH' && a.supportingData.hour === 12)) throw new Error('spike anomaly not detected');
    });

    await assert(7, 'Evidence attached to every insight', () => {
      const r = InsightService.generateRestaurantInsights(restaurantAnalytics({
        topFoods: [{ name: 'Burger', category: 'Mains', quantity: 10, revenue: 50 }],
        paymentBreakdown: [{ method: 'CASH', count: 10, amount: 100, share: 100 }],
        combinations: { ...restaurantAnalytics().combinations, foodDrink: [{ combination: ['Burger', 'Cola'], count: 3 }] },
      }));
      assertEvidence([...r.insights, ...r.recommendations, ...r.anomalies]);
    });

    await assert(8, 'No fabricated values (value matches metric)', () => {
      const r = InsightService.generateRestaurantInsights(restaurantAnalytics({ topFoods: [{ name: 'Burger', category: 'Mains', quantity: 12, revenue: 50 }] }));
      const p = r.insights.find((i) => i.type === 'PRODUCT_SHARE');
      if (!p) throw new Error('missing product share');
      if (p.sampleSize !== 12) throw new Error(`sampleSize ${p.sampleSize} != 12`);
    });

    // ----- Integration -----
    plan1 = await prisma.subscriptionPlan.create({ data: { code: `INS1-${unique}`, name: 'Insights On', price: 10, active: true, features: ['AI_INSIGHTS', 'ADVANCED_ANALYTICS'] } });
    plan2 = await prisma.subscriptionPlan.create({ data: { code: `INS2-${unique}`, name: 'Insights Off', price: 10, active: true, features: ['ADVANCED_ANALYTICS'] } });
    r1 = await prisma.restaurant.create({ data: { name: 'R1', slug: `ins1-${unique}`, active: true, timezone: 'UTC' } });
    r2 = await prisma.restaurant.create({ data: { name: 'R2', slug: `ins2-${unique}`, active: true, timezone: 'UTC' } });
    await ensureActiveSubscription(r1.id);
    await ensureActiveSubscription(r2.id);
    await prisma.subscription.updateMany({ where: { restaurantId: r1.id }, data: { planId: plan1.id } });
    await prisma.subscription.updateMany({ where: { restaurantId: r2.id }, data: { planId: plan2.id } });

    const owner1 = await prisma.user.create({ data: { email: `ins-o1-${unique}@test.com`, name: 'O1', passwordHash: await bcrypt.hash('Password123!', 10) } });
    const owner2 = await prisma.user.create({ data: { email: `ins-o2-${unique}@test.com`, name: 'O2', passwordHash: await bcrypt.hash('Password123!', 10) } });
    await prisma.userRestaurant.create({ data: { userId: owner1.id, restaurantId: r1.id, role: 'OWNER' } });
    await prisma.userRestaurant.create({ data: { userId: owner2.id, restaurantId: r2.id, role: 'OWNER' } });
    t1 = (await request(app).post('/api/auth/login').send({ email: `ins-o1-${unique}@test.com`, password: 'Password123!' })).body.data?.token;
    t2 = (await request(app).post('/api/auth/login').send({ email: `ins-o2-${unique}@test.com`, password: 'Password123!' })).body.data?.token;
    platformToken = (await request(app).post('/api/auth/login').send({ email: 'platformadmin@auramenu.com', password: 'Password123!' })).body.data?.token;

    await assert(9, 'Feature gating: AI_INSIGHTS enabled → 200', async () => {
      const res = await request(app).get(`/api/restaurants/${r1.id}/ai-insights?period=month&date=2099-09`).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    });

    await assert(10, 'Feature gating: AI_INSIGHTS disabled → 403', async () => {
      const res = await request(app).get(`/api/restaurants/${r2.id}/ai-insights?period=month&date=2099-09`).set('Authorization', `Bearer ${t2}`);
      if (res.status !== 403 || res.body.errorCode !== 'FEATURE_NOT_AVAILABLE') throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${res.status} ${JSON.stringify(res.body)}`);
    });

    await assert(11, 'Tenant isolation for insights', async () => {
      const res = await request(app).get(`/api/restaurants/${r2.id}/ai-insights?period=month&date=2099-09`).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });

    await assert(12, 'Platform aggregation access (PLATFORM_ADMIN)', async () => {
      const res = await request(app).get(`/api/platform/ai-insights?period=month&date=2099-09`).set('Authorization', `Bearer ${platformToken}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    });

    await assert(13, 'Restaurant admin blocked from platform insights', async () => {
      const res = await request(app).get(`/api/platform/ai-insights?period=month&date=2099-09`).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });

    await assert(14, 'CSV export of insights', async () => {
      const res = await request(app).get(`/api/restaurants/${r1.id}/ai-insights/export?period=month&date=2099-09&format=csv`).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200 || !res.text.startsWith('\uFEFF')) throw new Error('csv invalid');
    });

    await assert(15, 'XLSX export of insights', async () => {
      const res = await request(app).get(`/api/restaurants/${r1.id}/ai-insights/export?period=month&date=2099-09&format=xlsx`).set('Authorization', `Bearer ${t1}`).buffer(true).parse((res: any, cb: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      const buf: Buffer = res.body;
      if (!Buffer.isBuffer(buf) || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('invalid xlsx');
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (r1?.id) await RestaurantDeletionService.hardDelete(r1.id).catch(() => {});
    if (r2?.id) await RestaurantDeletionService.hardDelete(r2.id).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: [`ins-o1-${unique}@test.com`, `ins-o2-${unique}@test.com`] } } }).catch(() => {});
    for (const p of [plan1, plan2]) if (p?.id) await prisma.subscriptionPlan.deleteMany({ where: { id: p.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nAI Insights Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
