import request from 'supertest';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { ensureActiveSubscription } from './helpers';

const LAYOUT_CONFIG = [
  { id: 'qr', type: 'QR_CODE', x: 20, y: 20, w: 60, h: 60 },
  { id: 'logo', type: 'LOGO', x: 90, y: 20, w: 40, h: 25 },
  { id: 'rname', type: 'RESTAURANT_NAME', x: 90, y: 60, w: 100, h: 22, fontSize: 24, fontFamily: 'Times New Roman', fontWeight: 700, color: '#000000', textAlign: 'center' },
  { id: 'tname', type: 'TABLE_NAME', x: 90, y: 86, w: 100, h: 16, fontSize: 16, fontFamily: 'Times New Roman', fontWeight: 400, color: '#000000', textAlign: 'center' },
  { id: 'tnum', type: 'TABLE_NUMBER', x: 90, y: 106, w: 100, h: 14, fontSize: 14, fontFamily: 'Times New Roman', fontWeight: 400, color: '#000000', textAlign: 'center' },
];

async function runTests() {
  console.log('🧪 QR Print Template Editor Regression Suite (7 Tests)...\n');
  let passed = 0;
  let failed = 0;

  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/7] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/7] ${desc}:`, err.message || err);
      failed++;
    }
  };

  let token = '';
  let templateId = '';
  const restaurantIds: string[] = [];

  try {
    await assert(1, 'Platform admin logs in', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'platformadmin@auramenu.com', password: 'Password123!' });
      if (res.status !== 200 || !res.body.data?.token) throw new Error(`expected 200, got ${res.status}`);
      token = res.body.data.token;
    });

    await assert(2, 'Create A5 template with full layoutConfig', async () => {
      const res = await request(app)
        .post('/api/platform/qr-templates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Editor A5',
          description: 'regression',
          layout: 'A5',
          backgroundUrl: 'https://example.com/bg.png',
          layoutConfig: LAYOUT_CONFIG,
        });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (res.body.data.layout !== 'A5') throw new Error('layout not A5');
      if (!Array.isArray(res.body.data.layoutConfig) || res.body.data.layoutConfig.length !== 5) {
        throw new Error('layoutConfig not persisted');
      }
      templateId = res.body.data.id;
    });

    await assert(3, 'List round-trips layoutConfig with all 5 placeholder types', async () => {
      const res = await request(app)
        .get('/api/platform/qr-templates')
        .set('Authorization', `Bearer ${token}`);
      const t = res.body.data.find((x: any) => x.id === templateId);
      if (!t || t.layout !== 'A5' || t.layoutConfig.length !== 5) throw new Error('round-trip failed');
      const types = t.layoutConfig.map((e: any) => e.type);
      const expected = ['QR_CODE', 'LOGO', 'RESTAURANT_NAME', 'TABLE_NAME', 'TABLE_NUMBER'];
      if (JSON.stringify(types) !== JSON.stringify(expected)) throw new Error(`types mismatch: ${JSON.stringify(types)}`);
    });

    await assert(4, 'Update layoutConfig positions', async () => {
      const shifted = LAYOUT_CONFIG.map((e) => ({ ...e, x: e.x + 5 }));
      const res = await request(app)
        .patch(`/api/platform/qr-templates/${templateId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ layoutConfig: shifted });
      if (res.status !== 200 || res.body.data.layoutConfig[0].x !== 25) throw new Error('update failed');
    });

    await assert(5, 'Active list exposes the shared A5 template', async () => {
      const res = await request(app)
        .get('/api/qr-templates/active')
        .set('Authorization', `Bearer ${token}`);
      if (!res.body.data.some((t: any) => t.id === templateId && t.layout === 'A5')) {
        throw new Error('A5 template missing from active list');
      }
    });

    await assert(6, 'Two restaurants, three tables + unique QR code each', async () => {
      for (let r = 0; r < 2; r++) {
        const restaurant = await prisma.restaurant.create({
          data: { name: `Editor Tenant ${r}`, slug: `editor-tenant-${r}-${Date.now().toString(36)}` },
        });
        restaurantIds.push(restaurant.id);
        await ensureActiveSubscription(restaurant.id);
        for (let n = 1; n <= 3; n++) {
          const table = await prisma.table.create({
            data: { restaurantId: restaurant.id, number: `${n}`, name: `Table ${n}` },
          });
          await prisma.qrCode.create({
            data: {
              restaurantId: restaurant.id,
              tableId: table.id,
              name: `Table ${n} QR`,
              slug: `qr-editor-${r}-${n}-${Date.now().toString(36)}`,
              targetType: 'TABLE_MENU',
              targetValue: `/menu/${restaurant.slug}/table/${n}`,
            },
          });
        }
      }

      for (const rid of restaurantIds) {
        const tables = await prisma.table.findMany({
          where: { restaurantId: rid },
          include: { qrCodes: { select: { targetValue: true } } },
        });
        if (tables.length !== 3) throw new Error(`expected 3 tables, got ${tables.length}`);
        for (const t of tables) {
          if (t.qrCodes.length !== 1 || !t.qrCodes[0].targetValue.includes(`/table/${t.number}`)) {
            throw new Error('table missing its unique QR code');
          }
        }
      }
    });

    await assert(7, 'Delete the template', async () => {
      const res = await request(app)
        .delete(`/api/platform/qr-templates/${templateId}`)
        .set('Authorization', `Bearer ${token}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    });
  } catch (err: any) {
    failed++;
    console.error('  Setup error:', err.message || err);
  } finally {
    if (templateId) await prisma.qrPrintTemplate.deleteMany({ where: { id: templateId } }).catch(() => {});
    for (const rid of restaurantIds) {
      await prisma.restaurant.deleteMany({ where: { id: rid } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\nQR Template Editor Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
