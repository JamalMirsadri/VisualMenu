import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { ensureActiveSubscription } from './helpers';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';

const VALID_NIF = '123456789';

async function createTenant(unique: string, idx: number) {
  const slug = `pay-tenant-${idx}-${unique}`;
  const restaurant = await prisma.restaurant.create({
    data: { name: `Tenant ${idx} ${unique}`, slug, active: true },
  });
  await ensureActiveSubscription(restaurant.id);

  const category = await prisma.category.create({
    data: { restaurantId: restaurant.id, name: 'Starters', slug: `starters-${idx}-${unique}` },
  });
  const foodItem = await prisma.foodItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: 'Dish',
      slug: `dish-${idx}-${unique}`,
      price: 10,
    },
  });

  return { restaurant, foodItemId: foodItem.id };
}

async function placeOrder(slug: string, foodItemId: string, overrides: Record<string, any> = {}) {
  return request(app)
    .post('/api/orders')
    .send({
      restaurantSlug: slug,
      items: [{ foodItemId, quantity: 1 }],
      nif: VALID_NIF,
      customerName: 'Test Customer',
      gdprConsent: true,
      ...overrides,
    });
}

async function runTests() {
  console.log('🧪 Customer Profiles & Payment Settings Regression Suite (7 Tests)...\n');
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

  const unique = Date.now().toString(36);
  let ownerToken = '';
  let tenant1: any;
  let tenant2: any;
  let firstOrderCustomerId: string | null = null;

  try {
    // Remove leftovers from any previously aborted run of this suite so the
    // global NIF count assertion stays deterministic.
    const leftovers = await prisma.restaurant.findMany({
      where: { slug: { startsWith: 'pay-tenant-' } },
      select: { id: true },
    });
    for (const r of leftovers) {
      await RestaurantDeletionService.hardDelete(r.id).catch(() => {});
    }

    tenant1 = await createTenant(unique, 1);
    tenant2 = await createTenant(unique, 2);

    // Owner account for tenant 1 (required for payment-settings mutations).
    const ownerEmail = `pay-owner-${unique}@test.com`;
    const ownerPassword = 'Password123!';
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Owner',
        passwordHash: await bcrypt.hash(ownerPassword, 10),
      },
    });
    await prisma.userRestaurant.create({
      data: { userId: owner.id, restaurantId: tenant1.restaurant.id, role: 'OWNER' },
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ownerEmail, password: ownerPassword });
    if (loginRes.status !== 200 || !loginRes.body.data?.token) {
      throw new Error(`owner login failed: ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
    }
    ownerToken = loginRes.body.data.token;

    await assert(1, 'New NIF creates a customer profile', async () => {
      const res = await placeOrder(tenant1.restaurant.slug, tenant1.foodItemId);
      if (res.status !== 201 || !res.body.data?.customerId) {
        throw new Error(`expected 201 with customerId, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      firstOrderCustomerId = res.body.data.customerId;

      const count = await prisma.customer.count({
        where: { restaurantId: tenant1.restaurant.id, taxId: VALID_NIF },
      });
      if (count !== 1) {
        throw new Error(`expected 1 customer for tenant1, got ${count}`);
      }
    });

    await assert(2, 'Same NIF reuses the same profile (no duplicate)', async () => {
      const res = await placeOrder(tenant1.restaurant.slug, tenant1.foodItemId);
      if (res.status !== 201 || !res.body.data?.customerId) {
        throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.body.data.customerId !== firstOrderCustomerId) {
        throw new Error('same NIF produced a different customer id');
      }

      const count = await prisma.customer.count({
        where: { restaurantId: tenant1.restaurant.id, taxId: VALID_NIF },
      });
      if (count !== 1) {
        throw new Error(`expected still 1 customer, got ${count}`);
      }
    });

    await assert(3, 'Different restaurants keep profiles isolated', async () => {
      const res = await placeOrder(tenant2.restaurant.slug, tenant2.foodItemId);
      if (res.status !== 201 || !res.body.data?.customerId) {
        throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.body.data.customerId === firstOrderCustomerId) {
        throw new Error('different restaurant reused the tenant1 customer id');
      }

      const total = await prisma.customer.count({
        where: {
          taxId: VALID_NIF,
          restaurantId: { in: [tenant1.restaurant.id, tenant2.restaurant.id] },
        },
      });
      if (total !== 2) {
        throw new Error(`expected 2 total profiles across restaurants, got ${total}`);
      }
    });

    await assert(4, 'GDPR consent recorded on the profile', async () => {
      const customer = await prisma.customer.findFirst({
        where: { restaurantId: tenant1.restaurant.id, taxId: VALID_NIF },
      });
      if (!customer) throw new Error('tenant1 customer not found');
      if (customer.gdprConsent !== true || !customer.gdprConsentAt) {
        throw new Error(`gdpr consent not recorded: ${JSON.stringify({ gdprConsent: customer.gdprConsent, gdprConsentAt: customer.gdprConsentAt })}`);
      }
    });

    await assert(5, 'Order linked to the resolved customer', async () => {
      const order = await prisma.order.findFirst({
        where: { restaurantId: tenant1.restaurant.id, customerTaxId: VALID_NIF },
        orderBy: { createdAt: 'desc' },
      });
      if (!order) throw new Error('tenant1 order not found');
      if (order.customerId !== firstOrderCustomerId) {
        throw new Error(`order.customerId ${order.customerId} != resolved customer ${firstOrderCustomerId}`);
      }
    });

    await assert(6, 'Payment methods enable/disable are respected', async () => {
      // Fresh restaurant settings default: CASH available independently.
      let res = await request(app).get(`/api/payment-methods/${tenant1.restaurant.slug}`);
      if (res.status !== 200 || !Array.isArray(res.body.data)) {
        throw new Error(`expected 200 array, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (!res.body.data.includes('CASH')) {
        throw new Error('CASH should be available by default');
      }

      // Disable CASH.
      res = await request(app)
        .put(`/api/restaurants/${tenant1.restaurant.id}/payment-settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ cashEnabled: false });
      if (res.status !== 200) {
        throw new Error(`disable cash failed: ${res.status}: ${JSON.stringify(res.body)}`);
      }

      res = await request(app).get(`/api/payment-methods/${tenant1.restaurant.slug}`);
      if (res.body.data.includes('CASH')) {
        throw new Error('CASH should be unavailable after being disabled');
      }

      // Re-enable CASH.
      res = await request(app)
        .put(`/api/restaurants/${tenant1.restaurant.id}/payment-settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ cashEnabled: true });
      if (res.status !== 200) {
        throw new Error(`re-enable cash failed: ${res.status}: ${JSON.stringify(res.body)}`);
      }

      res = await request(app).get(`/api/payment-methods/${tenant1.restaurant.slug}`);
      if (!res.body.data.includes('CASH')) {
        throw new Error('CASH should be available again after re-enabling');
      }
    });

    await assert(7, 'Provider secrets are never returned by the API', async () => {
      const stripeSecret = 'sk_test_secret_do_not_leak';
      const mbwaySecret = 'mbway_secret_do_not_leak';

      const putRes = await request(app)
        .put(`/api/restaurants/${tenant1.restaurant.id}/payment-settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          stripeEnabled: true,
          stripeAccountId: 'acct_connect_1',
          stripePublishableKey: 'pk_test_publishable',
          stripeSecretKey: stripeSecret,
          mbwayApiKey: mbwaySecret,
        });

      if (putRes.status !== 200) {
        throw new Error(`PUT payment-settings failed: ${putRes.status}: ${JSON.stringify(putRes.body)}`);
      }
      const putRaw = JSON.stringify(putRes.body);
      if (putRaw.includes(stripeSecret) || putRaw.includes(mbwaySecret)) {
        throw new Error('PUT response leaked a secret value');
      }
      if (putRaw.includes('stripeSecretKeyEnc') || putRaw.includes('mbwayApiKeyEnc')) {
        throw new Error('PUT response exposed encrypted secret fields');
      }

      const getRes = await request(app)
        .get(`/api/restaurants/${tenant1.restaurant.id}/payment-settings`)
        .set('Authorization', `Bearer ${ownerToken}`);
      if (getRes.status !== 200) {
        throw new Error(`GET payment-settings failed: ${getRes.status}: ${JSON.stringify(getRes.body)}`);
      }
      const getRaw = JSON.stringify(getRes.body);
      if (getRaw.includes(stripeSecret) || getRaw.includes(mbwaySecret)) {
        throw new Error('GET payment-settings leaked a secret value');
      }
      if (getRes.body.data?.stripeConfigured !== true || getRes.body.data?.mbwayConfigured !== true) {
        throw new Error(`expected configured=true flags, got ${JSON.stringify(getRes.body.data)}`);
      }

      const settingsRes = await request(app)
        .get(`/api/restaurants/${tenant1.restaurant.id}/settings`)
        .set('Authorization', `Bearer ${ownerToken}`);
      if (settingsRes.status !== 200) {
        throw new Error(`GET settings failed: ${settingsRes.status}: ${JSON.stringify(settingsRes.body)}`);
      }
      const settingsRaw = JSON.stringify(settingsRes.body);
      if (settingsRaw.includes('stripeSecretKeyEnc') || settingsRaw.includes('mbwayApiKeyEnc')) {
        throw new Error('GET settings exposed encrypted secret fields');
      }
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (tenant1?.restaurant?.id) await RestaurantDeletionService.hardDelete(tenant1.restaurant.id).catch(() => {});
    if (tenant2?.restaurant?.id) await RestaurantDeletionService.hardDelete(tenant2.restaurant.id).catch(() => {});
    await prisma.user.deleteMany({ where: { email: `pay-owner-${unique}@test.com` } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nCustomer Profiles & Payment Settings Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
