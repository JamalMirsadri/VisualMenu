import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { createRestaurantWithSubscription } from './helpers';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { Role } from '@prisma/client';

async function runPhase7Tests() {
  console.log('🧪 Starting Phase 7 Product UX, Branding, Theme Engine & Media Studio Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function assert(desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${desc}:`, err.message || err);
      failed++;
    }
  }

  let ownerToken = '';
  let restaurantA: any;
  let restaurantB: any;
  let otherOwnerToken = '';
  let testCategory: any;
  let testFood: any;
  let testMedia: any;

  try {
    // 0. Setup test data
    await assert('Setup Phase 7 multi-tenant test restaurants & accounts', async () => {
      // Clean up previous runs
      await prisma.orderStatusHistory.deleteMany({ where: { order: { restaurant: { slug: { in: ['p7-rest-a', 'p7-rest-b'] } } } } });
      await prisma.orderItem.deleteMany({ where: { order: { restaurant: { slug: { in: ['p7-rest-a', 'p7-rest-b'] } } } } });
      await prisma.order.deleteMany({ where: { restaurant: { slug: { in: ['p7-rest-a', 'p7-rest-b'] } } } });
      await prisma.media.deleteMany({ where: { restaurant: { slug: { in: ['p7-rest-a', 'p7-rest-b'] } } } });
      await prisma.foodItem.deleteMany({ where: { restaurant: { slug: { in: ['p7-rest-a', 'p7-rest-b'] } } } });
      await prisma.category.deleteMany({ where: { restaurant: { slug: { in: ['p7-rest-a', 'p7-rest-b'] } } } });
      await prisma.restaurantSettings.deleteMany({ where: { restaurant: { slug: { in: ['p7-rest-a', 'p7-rest-b'] } } } });
      await prisma.restaurant.deleteMany({ where: { slug: { in: ['p7-rest-a', 'p7-rest-b'] } } });
      await prisma.userRestaurant.deleteMany({ where: { user: { email: 'p7-owner-b@test.com' } } });
      await prisma.user.deleteMany({ where: { email: 'p7-owner-b@test.com' } });

      // Authenticate seeded owner
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'owner@auradining.com',
        password: 'Password123!',
      });
      if (loginRes.status !== 200 || !loginRes.body.data?.token) {
        throw new Error(`Failed to log in owner: ${loginRes.status}`);
      }
      ownerToken = loginRes.body.data.token;
      const ownerUser = loginRes.body.data.user;

      // Create Restaurant A
      restaurantA = await createRestaurantWithSubscription({
        data: {
          name: 'Phase 7 Gastronomy A',
          slug: 'p7-rest-a',
          tagline: 'Culinary Masterpieces',
          description: 'Atmospheric dining studio',
          logo: 'https://images.unsplash.com/photo-logo-a.jpg',
          coverImage: 'https://images.unsplash.com/photo-cover-a.jpg',
          favicon: 'https://example.com/favicon-a.ico',
          currency: 'EUR',
          currencySymbol: '€',
          defaultLanguage: 'en',
          active: true,
        },
      });

      // Grant owner access to Restaurant A
      await prisma.userRestaurant.create({
        data: {
          userId: ownerUser.id,
          restaurantId: restaurantA.id,
          role: Role.OWNER,
        },
      });

      // Create Restaurant B
      restaurantB = await createRestaurantWithSubscription({
        data: {
          name: 'Phase 7 Bistro B',
          slug: 'p7-rest-b',
          currency: 'USD',
          currencySymbol: '$',
          defaultLanguage: 'en',
          active: true,
        },
      });

      // Create separate owner B for multi-tenant isolation tests
      const passwordHash = await bcrypt.hash('Password123!', 10);
      const userB = await prisma.user.create({
        data: {
          email: 'p7-owner-b@test.com',
          passwordHash,
          name: 'Owner B',
        },
      });

      await prisma.userRestaurant.create({
        data: {
          userId: userB.id,
          restaurantId: restaurantB.id,
          role: Role.OWNER,
        },
      });

      const loginB = await request(app).post('/api/auth/login').send({
        email: 'p7-owner-b@test.com',
        password: 'Password123!',
      });
      otherOwnerToken = loginB.body.data.token;

      // Create test Category and Food in Restaurant A
      testCategory = await prisma.category.create({
        data: {
          restaurantId: restaurantA.id,
          name: 'Main Courses',
          slug: 'main-courses',
          description: 'Prime meats and seafood',
          displayOrder: 1,
          active: true,
        },
      });

      testFood = await prisma.foodItem.create({
        data: {
          restaurantId: restaurantA.id,
          categoryId: testCategory.id,
          name: 'Wagyu A5 Striploin',
          slug: 'wagyu-a5-striploin',
          tagline: 'Miyazaki Prefecture with truffle jus',
          description: 'Seared to perfection over binchotan charcoal.',
          price: 85.0,
          currency: 'EUR',
          ingredients: ['Wagyu A5', 'Black Truffle', 'Maldon Salt'],
          allergens: ['Soy'],
          spicyLevel: 0,
          preparationTime: 20,
          calories: 680,
          available: true,
          featured: true,
          displayOrder: 1,
        },
      });
    });

    // 1. Restaurant Branding & Favicon
    await assert('PUT /api/restaurants/:id updates brand identity including favicon', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${restaurantA.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Phase 7 Gastronomy & Lounge',
          tagline: 'Redefining Luxury Dining',
          favicon: 'https://example.com/custom-favicon.ico',
          description: 'Updated brand story.',
        });

      if (res.status !== 200 || !res.body.success) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.body.data.favicon !== 'https://example.com/custom-favicon.ico') {
        throw new Error(`Favicon mismatch: ${res.body.data.favicon}`);
      }
    });

    await assert('GET /api/menu/:slug exposes updated favicon and brand on public endpoint', async () => {
      const res = await request(app).get(`/api/menu/${restaurantA.slug}`);
      if (res.status !== 200 || !res.body.success) {
        throw new Error(`Expected 200, got ${res.status}`);
      }
      if (res.body.data.restaurant.favicon !== 'https://example.com/custom-favicon.ico') {
        throw new Error(`Favicon not in public menu: ${res.body.data.restaurant.favicon}`);
      }
    });

    // 2. Theme Engine & Settings Validation
    await assert('PUT /api/restaurants/:id/settings rejects invalid theme preset (400 Bad Request)', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${restaurantA.id}/settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ theme: 'INVALID_THEME_KEY' });

      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`Expected 400 VALIDATION_ERROR, got ${res.status}`);
      }
    });

    await assert('PUT /api/restaurants/:id/settings rejects invalid presentation mode (400 Bad Request)', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${restaurantA.id}/settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ presentationMode: 'UNSUPPORTED_MODE' });

      if (res.status !== 400 || res.body.errorCode !== 'VALIDATION_ERROR') {
        throw new Error(`Expected 400 VALIDATION_ERROR, got ${res.status}`);
      }
    });

    await assert('PUT /api/restaurants/:id/settings successfully persists all Phase 7 settings', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${restaurantA.id}/settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          theme: 'WARM_RESTAURANT',
          presentationMode: 'SHARED_ENVIRONMENT',
          primaryColor: '#f97316',
          accentColor: '#ea580c',
          secondaryColor: '#1c1512',
          textStyle: 'SERIF',
          buttonStyle: 'PILL',
          cardStyle: 'ROUNDED_2XL',
          categoryStyle: 'MINIMAL',
          foodInfoPosition: 'SIDE',
          progressIndicatorStyle: 'DOTS',
          lightingPreset: 'DRAMATIC',
          foodEntranceAnimation: 'SCALE_UP',
          cameraMotion: 'SLOW_PAN',
          showPrices: true,
          showCalories: true,
          showPreparationTime: true,
          showAllergens: true,
          showIngredients: true,
          showFavoriteButton: true,
          showDetailsButton: true,
          showOrderButton: true,
        });

      if (res.status !== 200 || !res.body.success) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      const d = res.body.data;
      if (d.theme !== 'WARM_RESTAURANT') throw new Error(`Theme mismatch: ${d.theme}`);
      if (d.presentationMode !== 'SHARED_ENVIRONMENT') throw new Error(`Mode mismatch: ${d.presentationMode}`);
      if (d.lightingPreset !== 'DRAMATIC') throw new Error(`Lighting mismatch: ${d.lightingPreset}`);
      if (d.accentColor !== '#ea580c') throw new Error(`Accent mismatch: ${d.accentColor}`);
      if (d.foodInfoPosition !== 'SIDE') throw new Error(`FoodInfo position mismatch: ${d.foodInfoPosition}`);
    });

    await assert('GET /api/menu/:slug includes all Phase 7 theme tokens and settings in public payload', async () => {
      const res = await request(app).get(`/api/menu/${restaurantA.slug}`);
      if (res.status !== 200 || !res.body.success) {
        throw new Error(`Expected 200, got ${res.status}`);
      }
      const s = res.body.data.settings;
      if (s.theme !== 'WARM_RESTAURANT') throw new Error(`Public theme mismatch: ${s.theme}`);
      if (s.presentationMode !== 'SHARED_ENVIRONMENT') throw new Error(`Public mode mismatch: ${s.presentationMode}`);
      if (s.lightingPreset !== 'DRAMATIC') throw new Error(`Public lighting mismatch: ${s.lightingPreset}`);
    });

    // 3. Multi-Tenant Isolation
    await assert('PUT /api/restaurants/:id/settings enforces tenant isolation (403 Access Denied for other restaurant)', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${restaurantA.id}/settings`)
        .set('Authorization', `Bearer ${otherOwnerToken}`)
        .send({ theme: 'LIGHT_MINIMAL' });

      if (res.status !== 403 || !['ACCESS_DENIED', 'RESTAURANT_ACCESS_DENIED'].includes(res.body.errorCode)) {
        throw new Error(`Expected 403 ACCESS_DENIED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 4. Media Studio: Phase 7 Metadata Registration
    await assert('POST /api/restaurants/:id/media records width, height, duration, and posterUrl metadata', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/media`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          foodItemId: testFood.id,
          type: 'VIDEO',
          url: 'https://assets.mixkit.co/videos/steak-phase7.mp4',
          posterUrl: 'https://images.unsplash.com/photo-steak-poster.jpg',
          desktopUrl: 'https://assets.mixkit.co/videos/steak-desktop.mp4',
          mobileUrl: 'https://assets.mixkit.co/videos/steak-mobile.mp4',
          duration: '14.5',
          size: 15400000,
          width: 1920,
          height: 1080,
          isPrimary: true,
        });

      if (res.status !== 201 || !res.body.success) {
        throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      testMedia = res.body.data;
      if (testMedia.width !== 1920 || testMedia.height !== 1080) {
        throw new Error(`Dimensions mismatch: ${testMedia.width}x${testMedia.height}`);
      }
      if (testMedia.duration !== '14.5') throw new Error(`Duration mismatch: ${testMedia.duration}`);
      if (testMedia.posterUrl !== 'https://images.unsplash.com/photo-steak-poster.jpg') {
        throw new Error(`Poster mismatch: ${testMedia.posterUrl}`);
      }
    });

    // 5. Media Replace Action
    await assert('PUT /api/media/:id/replace updates media asset and syncs linked food items', async () => {
      const res = await request(app)
        .put(`/api/media/${testMedia.id}/replace`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          url: 'https://assets.mixkit.co/videos/steak-replaced-v2.mp4',
          posterUrl: 'https://images.unsplash.com/photo-steak-poster-v2.jpg',
          width: 3840,
          height: 2160,
          duration: '18.0',
        });

      if (res.status !== 200 || !res.body.success) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.body.data.url !== 'https://assets.mixkit.co/videos/steak-replaced-v2.mp4') {
        throw new Error(`URL mismatch: ${res.body.data.url}`);
      }
      if (res.body.data.width !== 3840) throw new Error(`Width mismatch: ${res.body.data.width}`);

      // Verify linked food item in public menu reflects updated media
      const menuRes = await request(app).get(`/api/menu/${restaurantA.slug}`);
      const foodInMenu = menuRes.body.data?.foods?.find((f: any) => f.id === testFood.id);
      if (foodInMenu?.video !== 'https://assets.mixkit.co/videos/steak-replaced-v2.mp4') {
        throw new Error(`Linked food item video not synced in public menu: ${foodInMenu?.video}`);
      }
    });

    // 6. Active Dish Deletion Protection
    await assert('DELETE /api/media/:id protects media linked to active dishes (MEDIA_IN_USE)', async () => {
      const res = await request(app)
        .delete(`/api/media/${testMedia.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      if (![400, 409].includes(res.status) || res.body.errorCode !== 'MEDIA_IN_USE') {
        throw new Error(`Expected 400 or 409 MEDIA_IN_USE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (!Array.isArray(res.body.linkedDishes) || res.body.linkedDishes.length === 0) {
        throw new Error('Missing linkedDishes details in error response');
      }
      if (res.body.linkedDishes[0].name !== 'Wagyu A5 Striploin') {
        throw new Error(`Dish name mismatch: ${res.body.linkedDishes[0].name}`);
      }
    });

    await assert('DELETE /api/media/:id?force=true overrides protection and deletes successfully', async () => {
      const res = await request(app)
        .delete(`/api/media/${testMedia.id}?force=true`)
        .set('Authorization', `Bearer ${ownerToken}`);

      if (res.status !== 200 || !res.body.success) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }

      const check = await prisma.media.findUnique({ where: { id: testMedia.id } });
      if (check !== null) throw new Error('Media record was not deleted');
    });

  } finally {
    console.log(`\n========================================`);
    console.log(`Phase 7 Tests Finished: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    await prisma.$disconnect();

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runPhase7Tests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
