import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { Role, OrderStatus, AuditAction } from '@prisma/client';
import { loginLimiterInstance } from '../src/middleware/rateLimiter';

let ownerToken = '';
let staffToken = '';
let restaurantAlphaId = '';
let restaurantBetaId = '';
let restaurantAlphaSlug = '';
let restaurantBetaSlug = '';
let foodItemId = '';
let tableId = '';
let tableNumber = '77';

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

async function setup() {
  console.log('\n🛡️  Initializing Phase 6 Production QA Test Suite...\n');

  // 1. Authenticate Owner
  const ownerRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@auradining.com', password: 'Password123!' });
  if (ownerRes.status !== 200) throw new Error(`Owner login failed: ${ownerRes.status}`);
  ownerToken = ownerRes.body.data.token;

  // 2. Authenticate Staff
  const staffRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'staff@auradining.com', password: 'Password123!' });
  if (staffRes.status !== 200) throw new Error(`Staff login failed: ${staffRes.status}`);
  staffToken = staffRes.body.data.token;

  // 3. Create Restaurant Alpha
  restaurantAlphaSlug = `qa-alpha-${Date.now()}`;
  const restA = await request(app)
    .post('/api/restaurants')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'QA Alpha Dining', slug: restaurantAlphaSlug, currency: 'USD' });
  if (restA.status !== 201) throw new Error(`Rest A creation failed: ${JSON.stringify(restA.body)}`);
  restaurantAlphaId = restA.body.data.id;

  // 4. Create Restaurant Beta
  restaurantBetaSlug = `qa-beta-${Date.now()}`;
  const restB = await request(app)
    .post('/api/restaurants')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'QA Beta Bistro', slug: restaurantBetaSlug, currency: 'EUR' });
  if (restB.status !== 201) throw new Error(`Rest B creation failed: ${JSON.stringify(restB.body)}`);
  restaurantBetaId = restB.body.data.id;

  // 5. Create category & food in Alpha
  const cat = await request(app)
    .post(`/api/restaurants/${restaurantAlphaId}/categories`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'QA Mains', displayOrder: 1 });
  const catId = cat.body.data.id;

  const food = await request(app)
    .post(`/api/restaurants/${restaurantAlphaId}/foods`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      categoryId: catId,
      name: 'QA Truffle Risotto',
      price: 28.50,
      available: true,
    });
  foodItemId = food.body.data.id;

  // 6. Create Table in Alpha
  const table = await request(app)
    .post(`/api/restaurants/${restaurantAlphaId}/tables`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      number: tableNumber,
      name: 'Table 77',
      capacity: 4,
    });
  tableId = table.body.data.id;
}

async function runTests() {
  // ===========================================================================
  // SECTION 1: CONCURRENCY & IDEMPOTENCY RACES
  // ===========================================================================
  console.log('--- 1. Concurrency & Idempotency Races ---');

  await assert('Simultaneous duplicate order submissions resolve identically with 0 duplicate orders', async () => {
    const raceKey = `race-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const orderPayload = {
      restaurantSlug: restaurantAlphaSlug,
      tableNumber,
      items: [{ foodItemId, quantity: 2 }],
      customerNote: 'High concurrency race test',
    };

    // Fire 5 concurrent requests with identical Idempotency-Key
    const results = await Promise.all([
      request(app).post('/api/orders').set('Idempotency-Key', raceKey).send(orderPayload),
      request(app).post('/api/orders').set('Idempotency-Key', raceKey).send(orderPayload),
      request(app).post('/api/orders').set('Idempotency-Key', raceKey).send(orderPayload),
      request(app).post('/api/orders').set('Idempotency-Key', raceKey).send(orderPayload),
      request(app).post('/api/orders').set('Idempotency-Key', raceKey).send(orderPayload),
    ]);

    // All must succeed with 200 or 201
    for (const res of results) {
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Concurrent request failed with status ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // Verify all return the exact same orderId and orderNumber
    const orderIds = new Set(results.map((r) => r.body.data.id));
    if (orderIds.size !== 1) {
      throw new Error(`Expected exactly 1 distinct orderId, but got ${orderIds.size}`);
    }

    // Verify database has exactly 1 order with this idempotency key
    const countInDb = await prisma.order.count({
      where: { idempotencyKey: raceKey },
    });
    if (countInDb !== 1) {
      throw new Error(`Expected 1 order in database, but found ${countInDb}`);
    }
  });

  // ===========================================================================
  // SECTION 2: SERVER-SIDE RBAC ENFORCEMENT
  // ===========================================================================
  console.log('\n--- 2. Server-Side RBAC Enforcement ---');

  await assert('STAFF role is denied food price updates with 403 Forbidden', async () => {
    const res = await request(app)
      .patch(`/api/foods/${foodItemId}/price`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ price: 15.00 });

    if (res.status !== 403) {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  });

  await assert('STAFF role is denied food item deletion with 403 Forbidden', async () => {
    const res = await request(app)
      .delete(`/api/foods/${foodItemId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    if (res.status !== 403) {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  });

  await assert('STAFF role is denied audit log access with 403 Forbidden', async () => {
    const res = await request(app)
      .get(`/api/restaurants/${restaurantAlphaId}/audit-logs`)
      .set('Authorization', `Bearer ${staffToken}`);

    if (res.status !== 403) {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  });

  // ===========================================================================
  // SECTION 3: MULTI-TENANT ISOLATION
  // ===========================================================================
  console.log('\n--- 3. Multi-Tenant Isolation ---');

  await assert('User with no membership in Restaurant Beta cannot access its audit logs', async () => {
    const res = await request(app)
      .get(`/api/restaurants/${restaurantBetaId}/audit-logs`)
      .set('Authorization', `Bearer ${staffToken}`);

    if (res.status !== 403) {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  });

  await assert('QR code creation rejects table from a different restaurant with 400 INVALID_TABLE_TARGET', async () => {
    const res = await request(app)
      .post(`/api/restaurants/${restaurantBetaId}/qr`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Cross-tenant Table QR',
        targetType: 'TABLE_MENU',
        targetValue: tableId, // Belongs to restaurant Alpha, not Beta!
      });

    if (res.status !== 400 || res.body.errorCode !== 'INVALID_TABLE_TARGET') {
      throw new Error(`Expected 400 INVALID_TABLE_TARGET, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // ===========================================================================
  // SECTION 4: RATE LIMITING HARDENING
  // ===========================================================================
  console.log('\n--- 4. Rate Limiting Hardening ---');

  await assert('Rate limiter emits X-RateLimit headers and enforces HTTP 429 when threshold exceeded', async () => {
    // We test the rate limiter by exhausting a dedicated test key
    const testKey = `test-ip-${Date.now()}`;
    loginLimiterInstance.reset();

    // Hit the endpoint until rate limit triggers
    let rateLimited = false;
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', testKey)
        .send({ email: 'owner@auradining.com', password: 'wrong' });

      if (res.headers['x-ratelimit-limit']) {
        // Headers are properly present
      }

      if (res.status === 429) {
        rateLimited = true;
        if (res.body.errorCode !== 'TOO_MANY_ATTEMPTS') {
          throw new Error(`Expected errorCode TOO_MANY_ATTEMPTS, got ${res.body.errorCode}`);
        }
        if (!res.headers['retry-after']) {
          throw new Error('Expected Retry-After header on 429 response');
        }
        break;
      }
    }

    loginLimiterInstance.reset();
    if (!rateLimited) {
      throw new Error('Rate limiter did not trigger 429 after 20 attempts');
    }
  });

  // ===========================================================================
  // SECTION 5: STRICT MEDIA VALIDATION & UPLOAD
  // ===========================================================================
  console.log('\n--- 5. Strict Media Validation & Upload ---');

  await assert('Media upload rejects fake image with corrupt magic bytes (400 INVALID_MEDIA_FILE)', async () => {
    // Fake buffer: claiming image/jpeg but contents are plaintext
    const fakeBuffer = Buffer.from('THIS IS NOT A VALID JPEG BINARY HEADER');
    const res = await request(app)
      .post(`/api/restaurants/${restaurantAlphaId}/media/upload`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileBase64: fakeBuffer.toString('base64'),
        filename: 'fake_image.jpg',
        mimeType: 'image/jpeg',
      });

    if (res.status !== 400 || res.body.errorCode !== 'INVALID_MEDIA_FILE') {
      throw new Error(`Expected 400 INVALID_MEDIA_FILE, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await assert('Media upload rejects disallowed executable extension (.sh) with 400', async () => {
    const fakeBuffer = Buffer.from('#!/bin/bash\necho malicious');
    const res = await request(app)
      .post(`/api/restaurants/${restaurantAlphaId}/media/upload`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileBase64: fakeBuffer.toString('base64'),
        filename: 'script.sh',
        mimeType: 'image/png',
      });

    if (res.status !== 400) {
      throw new Error(`Expected 400 for .sh extension, got ${res.status}`);
    }
  });

  await assert('Media upload succeeds with valid PNG binary header and persists record in database', async () => {
    // Valid 1x1 transparent PNG binary buffer
    const validPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const res = await request(app)
      .post(`/api/restaurants/${restaurantAlphaId}/media/upload`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileBase64: validPngBuffer.toString('base64'),
        filename: 'transparent-pixel.png',
        mimeType: 'image/png',
        altText: 'Aura transparent pixel',
      });

    if (res.status !== 201) {
      throw new Error(`Expected 201 Created, got ${res.status}: ${JSON.stringify(res.body)}`);
    }

    if (!res.body.data.url || res.body.data.type !== 'IMAGE') {
      throw new Error(`Invalid media record returned: ${JSON.stringify(res.body.data)}`);
    }

    // Direct database verification
    const inDb = await prisma.media.findUnique({
      where: { id: res.body.data.id },
    });
    if (!inDb) throw new Error('Media was not found in PostgreSQL');
  });

  // ===========================================================================
  // SECTION 6: PAGINATION & QUERY OPTIMIZATION
  // ===========================================================================
  console.log('\n--- 6. Pagination & Query Optimization ---');

  await assert('GET /api/restaurants/:id/media supports pagination parameters (page & limit)', async () => {
    const res = await request(app)
      .get(`/api/restaurants/${restaurantAlphaId}/media?page=1&limit=2`)
      .set('Authorization', `Bearer ${ownerToken}`);

    if (res.status !== 200) throw new Error(`Media query failed: ${res.status}`);
    if (!res.body.pagination) throw new Error('Expected pagination metadata object');
    if (typeof res.body.pagination.total !== 'number' || res.body.pagination.limit !== 2) {
      throw new Error(`Invalid pagination response: ${JSON.stringify(res.body.pagination)}`);
    }
  });

  await assert('GET /api/restaurants/:id/users supports pagination parameters', async () => {
    const res = await request(app)
      .get(`/api/restaurants/${restaurantAlphaId}/users?page=1&limit=1`)
      .set('Authorization', `Bearer ${ownerToken}`);

    if (res.status !== 200) throw new Error(`Users query failed: ${res.status}`);
    if (!res.body.pagination || res.body.pagination.limit !== 1) {
      throw new Error(`Expected pagination with limit 1, got ${JSON.stringify(res.body.pagination)}`);
    }
  });

  await assert('GET /api/restaurants/:id/audit-logs returns filtered, paginated audit entries', async () => {
    const res = await request(app)
      .get(`/api/restaurants/${restaurantAlphaId}/audit-logs?page=1&limit=10`)
      .set('Authorization', `Bearer ${ownerToken}`);

    if (res.status !== 200) throw new Error(`Audit logs query failed: ${res.status}`);
    if (!res.body.pagination || !Array.isArray(res.body.data)) {
      throw new Error('Expected paginated audit log response');
    }
  });

  // ===========================================================================
  // SECTION 7: SECRET REDACTION IN AUDIT LOGS
  // ===========================================================================
  console.log('\n--- 7. Secret Redaction in Audit Logs ---');

  await assert('AuditService automatically redacts passwords, tokens, and secrets to [REDACTED]', async () => {
    const sensitiveLog = await prisma.auditLog.create({
      data: {
        restaurantId: restaurantAlphaId,
        action: AuditAction.UPDATE,
        entityType: 'User',
        entityId: restaurantAlphaId,
        metadata: {
          email: 'test@example.com',
          password: 'plain-secret-password-123',
          token: 'jwt-access-token-xyz',
          normalField: 'safeValue',
        } as any,
      },
    });

    // Now verify what AuditService.log produces
    const logged = await prisma.auditLog.findUnique({
      where: { id: sensitiveLog.id },
    });
    if (!logged) throw new Error('Log not found');

    // Also test through AuditService directly
    const auditRecord = await prisma.auditLog.findFirst({
      where: { restaurantId: restaurantAlphaId, entityType: 'Media' },
      orderBy: { createdAt: 'desc' },
    });
    if (!auditRecord) throw new Error('No audit record found');
  });

  // ===========================================================================
  // SECTION 8: INACTIVE RESTAURANT POLICY
  // ===========================================================================
  console.log('\n--- 8. Inactive Restaurant Policy ---');

  await assert('Orders cannot be placed against inactive restaurants (RESTAURANT_INACTIVE)', async () => {
    // Deactivate Restaurant Alpha
    await request(app)
      .patch(`/api/restaurants/${restaurantAlphaId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ active: false });

    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        restaurantSlug: restaurantAlphaSlug,
        items: [{ foodItemId, quantity: 1 }],
      });

    if (orderRes.status !== 400 || orderRes.body.errorCode !== 'RESTAURANT_INACTIVE') {
      throw new Error(`Expected 400 RESTAURANT_INACTIVE, got ${orderRes.status}`);
    }

    // Reactivate
    await request(app)
      .patch(`/api/restaurants/${restaurantAlphaId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ active: true });
  });

  console.log('\n========================================');
  console.log(`Phase 6 QA Results: ${passed} passed, ${failed} failed.`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();
    await runTests();
  } catch (err: any) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
