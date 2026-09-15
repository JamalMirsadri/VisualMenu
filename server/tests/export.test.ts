import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { ensureActiveSubscription } from './helpers';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { resolvePeriodBounds, buildCsv, buildXlsx } from '../src/services/exportService';

async function createTenant(unique: string, idx: number) {
  const slug = `export-tenant-${idx}-${unique}`;
  const restaurant = await prisma.restaurant.create({
    data: { name: `Tenant ${idx}`, slug, active: true, timezone: 'UTC' },
  });
  await ensureActiveSubscription(restaurant.id);
  return restaurant;
}

async function createPayment(
  restaurantId: string,
  orderNumber: string,
  method: 'CASH' | 'CARD',
  createdAtIso: string
) {
  const order = await prisma.order.create({
    data: {
      restaurantId,
      orderNumber,
      subtotal: 10,
      tax: 0,
      total: 10,
      status: 'PENDING',
    },
  });
  return prisma.payment.create({
    data: {
      restaurantId,
      orderId: order.id,
      method,
      provider: 'TEST',
      status: 'PAID',
      amount: 10,
      currency: 'EUR',
      createdAt: new Date(createdAtIso),
    },
  });
}

async function runTests() {
  console.log('🧪 Payment & Cash Register Export Regression Suite (9 Tests)...\n');
  let passed = 0;
  let failed = 0;

  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/9] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/9] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let ownerToken = '';
  let tenantA: any;
  let tenantB: any;

  try {
    // ----- Unit: period boundary resolution -----
    await assert(1, 'Day period boundaries resolve correctly', async () => {
      const b = resolvePeriodBounds('day', '2026-09-15', 'UTC');
      if (b.start.toISOString() !== '2026-09-15T00:00:00.000Z') throw new Error(`start=${b.start.toISOString()}`);
      if (b.end.toISOString() !== '2026-09-16T00:00:00.000Z') throw new Error(`end=${b.end.toISOString()}`);
      if (b.filenameDate !== '2026-09-15') throw new Error(`filenameDate=${b.filenameDate}`);
    });

    await assert(2, 'Month period boundaries resolve correctly', async () => {
      const b = resolvePeriodBounds('month', '2026-09', 'UTC');
      if (b.start.toISOString() !== '2026-09-01T00:00:00.000Z') throw new Error(`start=${b.start.toISOString()}`);
      if (b.end.toISOString() !== '2026-10-01T00:00:00.000Z') throw new Error(`end=${b.end.toISOString()}`);
      if (b.filenameDate !== '2026-09') throw new Error(`filenameDate=${b.filenameDate}`);
    });

    await assert(3, 'Year period boundaries resolve correctly', async () => {
      const b = resolvePeriodBounds('year', '2026', 'UTC');
      if (b.start.toISOString() !== '2026-01-01T00:00:00.000Z') throw new Error(`start=${b.start.toISOString()}`);
      if (b.end.toISOString() !== '2027-01-01T00:00:00.000Z') throw new Error(`end=${b.end.toISOString()}`);
      if (b.filenameDate !== '2026') throw new Error(`filenameDate=${b.filenameDate}`);
    });

    // ----- Unit: CSV generation -----
    await assert(4, 'CSV generation escapes values and includes BOM', async () => {
      const csv = buildCsv(
        ['Name', 'Note'],
        [{ Name: 'Doe, John', Note: 'Says "hi"\nnewline' }, { Name: 'Plain', Note: 'ok' }]
      );
      if (!csv.startsWith('\uFEFF')) throw new Error('missing BOM');
      if (!csv.includes('"Doe, John"')) throw new Error('comma not escaped');
      if (!csv.includes('"Says ""hi""\nnewline"')) throw new Error('quote/newline not escaped');
    });

    // ----- Unit: XLSX generation -----
    await assert(5, 'XLSX generation produces a valid zip (PK) buffer', async () => {
      const buf = await buildXlsx(['Name', 'Amount'], [{ Name: 'Doe', Amount: 10 }], 'Payments');
      if (!Buffer.isBuffer(buf) || buf.length < 4) throw new Error('not a buffer');
      if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
        throw new Error('not a valid xlsx/zip signature');
      }
    });

    // ----- Integration setup -----
    tenantA = await createTenant(unique, 1);
    tenantB = await createTenant(unique, 2);

    const ownerEmail = `export-owner-${unique}@test.com`;
    const ownerPassword = 'Password123!';
    const owner = await prisma.user.create({
      data: { email: ownerEmail, name: 'Owner', passwordHash: await bcrypt.hash(ownerPassword, 10) },
    });
    await prisma.userRestaurant.create({
      data: { userId: owner.id, restaurantId: tenantA.id, role: 'OWNER' },
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ownerEmail, password: ownerPassword });
    if (loginRes.status !== 200 || !loginRes.body.data?.token) {
      throw new Error(`owner login failed: ${loginRes.status}`);
    }
    ownerToken = loginRes.body.data.token;

    await createPayment(tenantA.id, 'A-CASH-0915', 'CASH', '2026-09-15T10:00:00Z');
    await createPayment(tenantA.id, 'A-CARD-0915', 'CARD', '2026-09-15T11:00:00Z');
    await createPayment(tenantA.id, 'A-CASH-0920', 'CASH', '2026-09-20T10:00:00Z');
    await createPayment(tenantA.id, 'A-CASH-1001', 'CASH', '2026-10-01T10:00:00Z');
    await createPayment(tenantA.id, 'A-CASH-2025', 'CASH', '2025-12-31T10:00:00Z');

    await createPayment(tenantB.id, 'B-CASH-0915', 'CASH', '2026-09-15T10:00:00Z');

    const paymentsExport = (id: string, period: string, date: string) =>
      request(app)
        .get(`/api/restaurants/${id}/payments/export?period=${period}&date=${date}&format=csv`)
        .set('Authorization', `Bearer ${ownerToken}`);

    // ----- Integration: day filtering -----
    await assert(6, 'Day filtering returns only that day (payments)', async () => {
      const res = await paymentsExport(tenantA.id, 'day', '2026-09-15');
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const text = res.text;
      if (!text.includes('A-CASH-0915') || !text.includes('A-CARD-0915')) throw new Error('missing day records');
      if (text.includes('A-CASH-0920') || text.includes('A-CASH-1001') || text.includes('A-CASH-2025')) {
        throw new Error('leaked out-of-day records');
      }
    });

    // ----- Integration: month filtering -----
    await assert(7, 'Month filtering returns only that month (payments)', async () => {
      const res = await paymentsExport(tenantA.id, 'month', '2026-09');
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const text = res.text;
      if (!text.includes('A-CASH-0915') || !text.includes('A-CASH-0920')) throw new Error('missing month records');
      if (text.includes('A-CASH-1001') || text.includes('A-CASH-2025')) throw new Error('leaked out-of-month records');
    });

    // ----- Integration: year filtering -----
    await assert(8, 'Year filtering returns only that year (payments)', async () => {
      const res = await paymentsExport(tenantA.id, 'year', '2026');
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const text = res.text;
      if (!text.includes('A-CASH-1001') || !text.includes('A-CASH-0920')) throw new Error('missing year records');
      if (text.includes('A-CASH-2025')) throw new Error('leaked out-of-year records');
    });

    // ----- Integration: restaurant isolation + cash-only separation -----
    await assert(9, 'Restaurant isolation is enforced and cash export excludes non-cash', async () => {
      const blocked = await paymentsExport(tenantB.id, 'day', '2026-09-15');
      if (blocked.status !== 403) throw new Error(`expected 403 for other tenant, got ${blocked.status}`);

      const cashRes = await request(app)
        .get(`/api/restaurants/${tenantA.id}/cash-operations/export?period=day&date=2026-09-15&format=csv`)
        .set('Authorization', `Bearer ${ownerToken}`);
      if (cashRes.status !== 200) throw new Error(`cash export status ${cashRes.status}`);
      const cashText = cashRes.text;
      if (!cashText.includes('A-CASH-0915')) throw new Error('missing cash record');
      if (cashText.includes('A-CARD-0915')) throw new Error('cash export leaked a card payment');
      if (cashText.includes('B-CASH-0915')) throw new Error('cash export leaked another tenant');
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (tenantA?.id) await RestaurantDeletionService.hardDelete(tenantA.id).catch(() => {});
    if (tenantB?.id) await RestaurantDeletionService.hardDelete(tenantB.id).catch(() => {});
    await prisma.user.deleteMany({ where: { email: `export-owner-${unique}@test.com` } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nExport Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
