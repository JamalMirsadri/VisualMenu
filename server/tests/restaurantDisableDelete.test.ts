import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { ensureActiveSubscription } from './helpers';

async function runTests() {
  console.log('🧪 Restaurant Disable & Hard Delete Regression Suite (10 Tests)...\n');
  let passed = 0;
  let failed = 0;

  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/10] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/10] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  const ownerEmail = `owner-${unique}@test.com`;
  const ownerPassword = 'Password123!';
  const slug = `tenant-${unique}`;
  let platformToken = '';
  let ownerToken = '';
  let restaurant: any;

  try {
    await assert(1, 'Platform admin logs in', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'platformadmin@auramenu.com', password: 'Password123!' });
      if (res.status !== 200 || !res.body.data?.token) {
        throw new Error(`expected 200, got ${res.status}`);
      }
      platformToken = res.body.data.token;
    });

    // Build a fresh tenant with representative data.
    restaurant = await prisma.restaurant.create({
      data: { name: `Tenant ${unique}`, slug, active: true },
    });
    await ensureActiveSubscription(restaurant.id);

    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Owner',
        passwordHash: await bcrypt.hash(ownerPassword, 10),
      },
    });
    await prisma.userRestaurant.create({
      data: { userId: owner.id, restaurantId: restaurant.id, role: 'OWNER' },
    });

    const category = await prisma.category.create({
      data: { restaurantId: restaurant.id, name: 'Starters', slug: `starters-${unique}` },
    });
    await prisma.foodItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: 'Dish',
        slug: `dish-${unique}`,
        price: 10,
      },
    });
    await prisma.table.create({ data: { restaurantId: restaurant.id, number: '1' } });
    await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        orderNumber: `ORD-${unique}`,
        subtotal: 10,
        tax: 0,
        total: 10,
        status: 'PENDING',
      },
    });
    await prisma.customer.create({ data: { restaurantId: restaurant.id, name: 'Customer' } });
    await prisma.notification.create({
      data: {
        restaurantId: restaurant.id,
        title: 'Hello',
        message: 'World',
        type: 'GENERAL_ANNOUNCEMENT',
      },
    });

    await assert(2, 'Owner can log in while restaurant is active', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: ownerEmail, password: ownerPassword });
      if (res.status !== 200 || !res.body.data?.token) {
        throw new Error(`expected 200, got ${res.status}`);
      }
      ownerToken = res.body.data.token;
    });

    await assert(3, 'Platform admin disables the restaurant', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restaurant.id}/deactivate`)
        .set('Authorization', `Bearer ${platformToken}`);
      if (res.status !== 200) {
        throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(4, 'Owner login is blocked after disable (RESTAURANT_DISABLED)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: ownerEmail, password: ownerPassword });
      if (res.status !== 403 || res.body.errorCode !== 'RESTAURANT_DISABLED') {
        throw new Error(`expected 403 RESTAURANT_DISABLED, got ${res.status} ${JSON.stringify(res.body)}`);
      }
    });

    await assert(5, 'Owner admin API is blocked after disable (RESTAURANT_DISABLED)', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurant.id}/foods`)
        .set('Authorization', `Bearer ${ownerToken}`);
      if (res.status !== 403 || res.body.errorCode !== 'RESTAURANT_DISABLED') {
        throw new Error(`expected 403 RESTAURANT_DISABLED, got ${res.status} ${JSON.stringify(res.body)}`);
      }
    });

    await assert(6, 'Public menu is blocked after disable (503)', async () => {
      const res = await request(app).get(`/api/menu/${slug}`);
      if (res.status !== 503) {
        throw new Error(`expected 503, got ${res.status}`);
      }
    });

    await assert(7, 'Platform admin re-enables the restaurant', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restaurant.id}/activate`)
        .set('Authorization', `Bearer ${platformToken}`);
      if (res.status !== 200) {
        throw new Error(`expected 200, got ${res.status}`);
      }
    });

    await assert(8, 'Owner login is restored after re-enable', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: ownerEmail, password: ownerPassword });
      if (res.status !== 200) {
        throw new Error(`expected 200, got ${res.status}`);
      }
    });

    await assert(9, 'Platform admin permanently deletes the restaurant', async () => {
      const res = await request(app)
        .delete(`/api/platform/restaurants/${restaurant.id}`)
        .set('Authorization', `Bearer ${platformToken}`);
      if (res.status !== 200) {
        throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(10, 'No orphan tenant records remain after delete', async () => {
      const [restaurants, categories, foods, tables, orders, customers, notifications, memberships, subscriptions] =
        await Promise.all([
          prisma.restaurant.count({ where: { id: restaurant.id } }),
          prisma.category.count({ where: { restaurantId: restaurant.id } }),
          prisma.foodItem.count({ where: { restaurantId: restaurant.id } }),
          prisma.table.count({ where: { restaurantId: restaurant.id } }),
          prisma.order.count({ where: { restaurantId: restaurant.id } }),
          prisma.customer.count({ where: { restaurantId: restaurant.id } }),
          prisma.notification.count({ where: { restaurantId: restaurant.id } }),
          prisma.userRestaurant.count({ where: { restaurantId: restaurant.id } }),
          prisma.subscription.count({ where: { restaurantId: restaurant.id } }),
        ]);
      const remaining = [restaurants, categories, foods, tables, orders, customers, notifications, memberships, subscriptions];
      if (remaining.some((n) => n !== 0)) {
        throw new Error(`orphan counts: ${JSON.stringify(remaining)}`);
      }
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (restaurant) {
      await prisma.restaurant.deleteMany({ where: { id: restaurant.id } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: ownerEmail } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nRestaurant Disable & Delete Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
