import request from 'supertest';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';

async function runTests() {
  console.log('🧪 QR Print Template Regression Suite (7 Tests)...\n');
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

  try {
    await assert(1, 'Platform admin logs in', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'platformadmin@auramenu.com', password: 'Password123!' });
      if (res.status !== 200 || !res.body.data?.token) {
        throw new Error(`expected 200, got ${res.status}`);
      }
      token = res.body.data.token;
    });

    await assert(2, 'Create a QR print template', async () => {
      const res = await request(app)
        .post('/api/platform/qr-templates')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Template', description: 'Regression', layout: 'CARD' });
      if (res.status !== 201 || !res.body.data?.id) {
        throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      templateId = res.body.data.id;
    });

    await assert(3, 'List templates includes the created template', async () => {
      const res = await request(app)
        .get('/api/platform/qr-templates')
        .set('Authorization', `Bearer ${token}`);
      if (res.status !== 200 || !res.body.data.some((t: any) => t.id === templateId)) {
        throw new Error(`template not found in list (status ${res.status})`);
      }
    });

    await assert(4, 'Toggle disables the template', async () => {
      const res = await request(app)
        .patch(`/api/platform/qr-templates/${templateId}/toggle`)
        .set('Authorization', `Bearer ${token}`);
      if (res.status !== 200 || res.body.data.active !== false) {
        throw new Error(`expected active=false, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(5, 'Active list excludes the disabled template', async () => {
      const res = await request(app)
        .get('/api/qr-templates/active')
        .set('Authorization', `Bearer ${token}`);
      if (res.status !== 200) {
        throw new Error(`expected 200, got ${res.status}`);
      }
      if (res.body.data.some((t: any) => t.id === templateId)) {
        throw new Error('disabled template appeared in active list');
      }
    });

    await assert(6, 'Edit template name/description', async () => {
      const res = await request(app)
        .patch(`/api/platform/qr-templates/${templateId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed Template', description: 'Updated description' });
      if (res.status !== 200 || res.body.data.name !== 'Renamed Template') {
        throw new Error(`expected renamed, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(7, 'Delete the template', async () => {
      const res = await request(app)
        .delete(`/api/platform/qr-templates/${templateId}`)
        .set('Authorization', `Bearer ${token}`);
      if (res.status !== 200) {
        throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });
  } catch (err: any) {
    failed++;
    console.error('  Setup error:', err.message || err);
  } finally {
    if (templateId) {
      await prisma.qrPrintTemplate.deleteMany({ where: { id: templateId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\nQR Template Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
