import request from 'supertest';
import './setup';
import { createRestaurantWithSubscription } from './helpers';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { MediaService } from '../src/services/mediaService';

async function runFoodMediaTests() {
  console.log('🧪 Starting Food Media Architecture & Optional Media Test Suite (25 Tests)...\n');
  let passed = 0;
  let failed = 0;

  async function assert(testNum: number, desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ [Test ${testNum}/25] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${testNum}/25] ${desc}:`, err.message || err);
      failed++;
    }
  }

  let adminToken = '';
  let restaurant: any;
  let starterCategory: any;
  let mainCategory: any;
  let dessertCategory: any;
  let beverageCategory: any;

  // Track created food items for edits
  let noMediaFood: any;
  let imageOnlyFood: any;
  let videoOnlyFood: any;
  let bothMediaFood: any;
  let uploadedMediaItem: any;
  let uploadedVideoItem: any;

  try {
    // Setup environment & login
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'owner@auradining.com',
      password: 'Password123!',
    });
    if (loginRes.status !== 200 || !loginRes.body.data?.token) {
      throw new Error(`Failed to log in owner: ${loginRes.status}`);
    }
    adminToken = loginRes.body.data.token;
    const ownerUser = loginRes.body.data.user;

    // Get or create test restaurant
    restaurant = await prisma.restaurant.findFirst({
      where: { slug: 'aura-dining' },
    });
    if (!restaurant) {
      restaurant = await createRestaurantWithSubscription({
        data: {
          name: 'Aura Dining Test',
          slug: 'aura-dining',
          currency: 'EUR',
        },
      });
    }

    // Ensure owner has access to restaurant
    const existingLink = await prisma.userRestaurant.findFirst({
      where: { userId: ownerUser.id, restaurantId: restaurant.id },
    });
    if (!existingLink) {
      await prisma.userRestaurant.create({
        data: {
          userId: ownerUser.id,
          restaurantId: restaurant.id,
          role: 'OWNER',
        },
      });
    }

    // Ensure categories exist
    starterCategory = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, name: 'Starters' },
    });
    if (!starterCategory) {
      starterCategory = await prisma.category.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Starters',
          slug: 'starters',
          displayOrder: 1,
        },
      });
    }

    mainCategory = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, name: 'Main Course' },
    });
    if (!mainCategory) {
      mainCategory = await prisma.category.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Main Course',
          slug: 'main-course',
          displayOrder: 2,
        },
      });
    }

    dessertCategory = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, name: 'Desserts' },
    });
    if (!dessertCategory) {
      dessertCategory = await prisma.category.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Desserts',
          slug: 'desserts',
          displayOrder: 3,
        },
      });
    }

    beverageCategory = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, name: 'Beverages' },
    });
    if (!beverageCategory) {
      beverageCategory = await prisma.category.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Beverages',
          slug: 'beverages',
          displayOrder: 4,
        },
      });
    }

    // Clean up any old test items
    await prisma.foodItem.deleteMany({
      where: {
        restaurantId: restaurant.id,
        name: { startsWith: 'TEST_MEDIA_' },
      },
    });

    // -------------------------------------------------------------
    // TEST 1: Create food item with NO image and NO video (pure text dish)
    // -------------------------------------------------------------
    await assert(1, 'Create food item with NO image and NO video (pure text dish)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/foods`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          restaurantId: restaurant.id,
          categoryId: starterCategory.id,
          name: 'TEST_MEDIA_No_Media_Dish',
          description: 'A classic dish with text description only.',
          price: 12.5,
          // image and video omitted
        });

      if (res.status !== 201) {
        throw new Error(`Expected status 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      noMediaFood = res.body.data;
      if (noMediaFood.image) {
        throw new Error(`Expected image to be null/undefined, got: ${noMediaFood.image}`);
      }
      if (noMediaFood.video) {
        throw new Error(`Expected video to be null/undefined, got: ${noMediaFood.video}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 2: Create food item with image only
    // -------------------------------------------------------------
    await assert(2, 'Create food item with image only', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/foods`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          restaurantId: restaurant.id,
          categoryId: mainCategory.id,
          name: 'TEST_MEDIA_Image_Only_Dish',
          description: 'Dish with high-fidelity photo only.',
          price: 24.0,
          image: 'https://images.unsplash.com/photo-1544025162-d76694265947',
        });

      if (res.status !== 201) {
        throw new Error(`Expected status 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      imageOnlyFood = res.body.data;
      if (!imageOnlyFood.image) {
        throw new Error('Expected image to be present');
      }
      if (imageOnlyFood.video) {
        throw new Error(`Expected video to be undefined, got: ${imageOnlyFood.video}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 3: Create food item with video only
    // -------------------------------------------------------------
    await assert(3, 'Create food item with video only', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/foods`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          restaurantId: restaurant.id,
          categoryId: starterCategory.id,
          name: 'TEST_MEDIA_Video_Only_Dish',
          description: 'Dish with Google Flow looping MP4 only.',
          price: 18.0,
          video: 'https://assets.mixkit.co/videos/preview/mixkit-hands-holding-a-bowl-of-steaming-ramen-42994-large.mp4',
        });

      if (res.status !== 201) {
        throw new Error(`Expected status 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      videoOnlyFood = res.body.data;
      if (!videoOnlyFood.video) {
        throw new Error('Expected video to be present');
      }
      if (videoOnlyFood.image) {
        throw new Error(`Expected image to be null/undefined, got: ${videoOnlyFood.image}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 4: Create food item with both image and video
    // -------------------------------------------------------------
    await assert(4, 'Create food item with both image and video', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/foods`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          restaurantId: restaurant.id,
          categoryId: dessertCategory.id,
          name: 'TEST_MEDIA_Both_Media_Dish',
          description: 'Dish with both photo and video.',
          price: 9.5,
          image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b',
          video: 'https://assets.mixkit.co/videos/preview/mixkit-pouring-chocolate-sauce-on-ice-cream-43527-large.mp4',
        });

      if (res.status !== 201) {
        throw new Error(`Expected status 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      bothMediaFood = res.body.data;
      if (!bothMediaFood.image) throw new Error('Expected image to be present');
      if (!bothMediaFood.video) throw new Error('Expected video to be present');
    });

    // -------------------------------------------------------------
    // TEST 5: Create food items across multiple diverse categories without media
    // -------------------------------------------------------------
    await assert(5, 'Create food items across multiple categories without media', async () => {
      const categoriesToTest = [
        'Starters',
        'Main Course',
        'Grill',
        'Pizza',
        'Burger',
        'Pasta',
        'Salad',
        'Soup',
        'Rice',
        'Desserts',
        'Drinks',
        'Hot Drinks',
      ];

      for (const catName of categoriesToTest) {
        let cat = await prisma.category.findFirst({
          where: { restaurantId: restaurant.id, name: catName },
        });
        if (!cat) {
          cat = await prisma.category.create({
            data: {
              restaurantId: restaurant.id,
              name: catName,
              slug: catName.toLowerCase().replace(/\s+/g, '-'),
              displayOrder: 99,
            },
          });
        }

        const res = await request(app)
          .post(`/api/restaurants/${restaurant.id}/foods`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            restaurantId: restaurant.id,
            categoryId: cat.id,
            name: `TEST_MEDIA_${catName.replace(/\s+/g, '_')}_Dish`,
            description: `Testing optional media for category ${catName}`,
            price: 15.0,
          });

        if (res.status !== 201) {
          throw new Error(`Failed to create media-less dish in category ${catName}: ${res.status}`);
        }
      }
    });

    // -------------------------------------------------------------
    // TEST 6: Edit food item: remove image while keeping video intact
    // -------------------------------------------------------------
    await assert(6, 'Edit food item: remove image while keeping video intact', async () => {
      const res = await request(app)
        .put(`/api/foods/${bothMediaFood.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: null, // explicit removal
        });

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      const updated = res.body.data;
      if (updated.image) {
        throw new Error(`Expected image to be removed, got: ${updated.image}`);
      }
      if (!updated.video) {
        throw new Error('Expected video to remain intact');
      }
    });

    // -------------------------------------------------------------
    // TEST 7: Edit food item: remove video while keeping image intact
    // -------------------------------------------------------------
    await assert(7, 'Edit food item: remove video while keeping image intact', async () => {
      // First restore image on bothMediaFood
      await request(app)
        .put(`/api/foods/${bothMediaFood.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b',
        });

      // Now remove video
      const res = await request(app)
        .put(`/api/foods/${bothMediaFood.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          video: '', // empty string removal
        });

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      const updated = res.body.data;
      if (updated.video) {
        throw new Error(`Expected video to be removed, got: ${updated.video}`);
      }
      if (!updated.image) {
        throw new Error('Expected image to remain intact');
      }
    });

    // -------------------------------------------------------------
    // TEST 8: Edit food item: remove BOTH image and video
    // -------------------------------------------------------------
    await assert(8, 'Edit food item: remove BOTH image and video', async () => {
      const res = await request(app)
        .put(`/api/foods/${bothMediaFood.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: null,
          video: null,
        });

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      const updated = res.body.data;
      if (updated.image) throw new Error('Expected image to be null');
      if (updated.video) throw new Error('Expected video to be null');

      // Verify item still exists in database
      const dbFood = await prisma.foodItem.findUnique({
        where: { id: bothMediaFood.id },
      });
      if (!dbFood) throw new Error('FoodItem was unexpectedly deleted from database');
    });

    // -------------------------------------------------------------
    // TEST 9: Edit food item: replace image URL with new URL
    // -------------------------------------------------------------
    await assert(9, 'Edit food item: replace image URL with new URL', async () => {
      const newUrl = 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38';
      const res = await request(app)
        .put(`/api/foods/${imageOnlyFood.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: newUrl,
        });

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.body.data.image !== newUrl) {
        throw new Error(`Expected new image URL, got: ${res.body.data.image}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 10: Edit food item: replace video URL with new URL
    // -------------------------------------------------------------
    await assert(10, 'Edit food item: replace video URL with new URL', async () => {
      const newVideo = 'https://assets.mixkit.co/videos/preview/mixkit-fresh-salad-ingredients-42988-large.mp4';
      const res = await request(app)
        .put(`/api/foods/${videoOnlyFood.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          video: newVideo,
        });

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.body.data.video !== newVideo) {
        throw new Error(`Expected new video URL, got: ${res.body.data.video}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 11: Edit food item: add image to previously media-less food
    // -------------------------------------------------------------
    await assert(11, 'Edit food item: add image to previously media-less food', async () => {
      const res = await request(app)
        .put(`/api/foods/${noMediaFood.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999',
        });

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (!res.body.data.image) {
        throw new Error('Expected image to be added to dish');
      }
      if (res.body.data.video) {
        throw new Error('Video should remain empty');
      }
    });

    // -------------------------------------------------------------
    // TEST 12: Edit food item: add video to previously media-less food
    // -------------------------------------------------------------
    await assert(12, 'Edit food item: add video to previously media-less food', async () => {
      const res = await request(app)
        .put(`/api/foods/${noMediaFood.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          video: 'https://assets.mixkit.co/videos/preview/mixkit-chef-cooking-vegetables-in-a-pan-43003-large.mp4',
        });

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (!res.body.data.video) {
        throw new Error('Expected video to be added to dish');
      }
      if (!res.body.data.image) {
        throw new Error('Image added in Test 11 should still be present');
      }
    });

    // -------------------------------------------------------------
    // TEST 13: Direct upload endpoint: multipart upload of PNG buffer sets sourceType: UPLOAD
    // -------------------------------------------------------------
    await assert(13, 'Direct upload endpoint: multipart upload of PNG buffer sets sourceType: UPLOAD', async () => {
      // Valid PNG header (8 bytes) + dummy IDAT/IEND chunk
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82
      ]);

      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/media/upload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('restaurantId', restaurant.id)
        .field('title', 'Direct Uploaded PNG Photo')
        .attach('file', pngBuffer, 'direct-dish.png');

      if (res.status !== 201) {
        throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      uploadedMediaItem = res.body.data;
      if (uploadedMediaItem.sourceType !== 'UPLOAD') {
        throw new Error(`Expected sourceType UPLOAD, got: ${uploadedMediaItem.sourceType}`);
      }
      if (!uploadedMediaItem.url.startsWith('/uploads/')) {
        throw new Error(`Expected local upload URL path, got: ${uploadedMediaItem.url}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 14: Direct upload endpoint: multipart upload of MP4 buffer sets sourceType: UPLOAD
    // -------------------------------------------------------------
    await assert(14, 'Direct upload endpoint: multipart upload of MP4 buffer sets sourceType: UPLOAD', async () => {
      // Valid MP4 header: 4 bytes length, 'ftyp', 'isom'
      const mp4Buffer = Buffer.from([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
        0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
        0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
        0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08
      ]);

      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/media/upload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('restaurantId', restaurant.id)
        .field('title', 'Google Flow Cinematic Loop MP4')
        .attach('file', mp4Buffer, 'flow-reel.mp4');

      if (res.status !== 201) {
        throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      uploadedVideoItem = res.body.data;
      if (uploadedVideoItem.sourceType !== 'UPLOAD') {
        throw new Error(`Expected sourceType UPLOAD, got: ${uploadedVideoItem.sourceType}`);
      }
      if (uploadedVideoItem.type !== 'VIDEO') {
        throw new Error(`Expected type VIDEO, got: ${uploadedVideoItem.type}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 15: Direct upload endpoint: base64 image upload sets sourceType: UPLOAD
    // -------------------------------------------------------------
    await assert(15, 'Direct upload endpoint: base64 image upload sets sourceType: UPLOAD', async () => {
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUri = `data:image/png;base64,${pngBase64}`;

      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/media/upload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          restaurantId: restaurant.id,
          title: 'Base64 Upload Dish',
          fileBase64: dataUri,
          filename: 'base64-dish.png',
          mimeType: 'image/png',
        });

      if (res.status !== 201) {
        throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      if (res.body.data.sourceType !== 'UPLOAD') {
        throw new Error(`Expected sourceType UPLOAD, got: ${res.body.data.sourceType}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 16: Direct upload endpoint: reject unsupported extension / mime type
    // -------------------------------------------------------------
    await assert(16, 'Direct upload endpoint: reject unsupported extension or corrupted binary', async () => {
      const textBuffer = Buffer.from('hello world this is plain text not an image');

      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/media/upload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('restaurantId', restaurant.id)
        .field('title', 'Dangerous Script')
        .attach('file', textBuffer, 'virus.exe');

      if (res.status !== 400) {
        throw new Error(`Expected 400 Bad Request for executable/plain text, got: ${res.status}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 17: Direct upload endpoint: enforce file size limit (>10MB image)
    // -------------------------------------------------------------
    await assert(17, 'Direct upload endpoint: enforce file size limit (>10MB for image)', async () => {
      // Generate a buffer with PNG magic bytes but >10MB
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);
      oversizedBuffer[0] = 0x89;
      oversizedBuffer[1] = 0x50;
      oversizedBuffer[2] = 0x4e;
      oversizedBuffer[3] = 0x47;
      oversizedBuffer[4] = 0x0d;
      oversizedBuffer[5] = 0x0a;
      oversizedBuffer[6] = 0x1a;
      oversizedBuffer[7] = 0x0a;

      const res = await request(app)
        .post(`/api/restaurants/${restaurant.id}/media/upload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('restaurantId', restaurant.id)
        .field('title', 'Oversized PNG')
        .attach('file', oversizedBuffer, 'oversized.png');

      if (res.status !== 400 && res.status !== 413) {
        throw new Error(`Expected 400 or 413 for oversized image, got: ${res.status}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 18: Media model in database: verify sourceType accurately persisted
    // -------------------------------------------------------------
    await assert(18, 'Media model in database: verify sourceType persisted in PostgreSQL', async () => {
      const mediaInDb = await prisma.media.findUnique({
        where: { id: uploadedMediaItem.id },
      });

      if (!mediaInDb) throw new Error('Media item not found in DB');
      if (mediaInDb.sourceType !== 'UPLOAD') {
        throw new Error(`Expected DB sourceType to be UPLOAD, got: ${mediaInDb.sourceType}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 19: Media service: unlinkFromFood unlinks media without deleting food
    // -------------------------------------------------------------
    await assert(19, 'Media service: unlinkFromFood unlinks media without deleting food', async () => {
      // Link media to noMediaFood
      await prisma.media.update({
        where: { id: uploadedMediaItem.id },
        data: { foodItemId: noMediaFood.id },
      });

      await MediaService.unlinkFromFood(uploadedMediaItem.id);

      const updatedMedia = await prisma.media.findUnique({
        where: { id: uploadedMediaItem.id },
      });
      if (updatedMedia?.foodItemId !== null) {
        throw new Error(`Expected media foodItemId to be null, got: ${updatedMedia?.foodItemId}`);
      }

      // Check food item still exists
      const foodStillExists = await prisma.foodItem.findUnique({
        where: { id: noMediaFood.id },
      });
      if (!foodStillExists) {
        throw new Error('Food item was unexpectedly deleted by unlinkFromFood');
      }
    });

    // -------------------------------------------------------------
    // TEST 20: Media library listing (GET /api/media): includes foodItem: { id, name }
    // -------------------------------------------------------------
    await assert(20, 'Media library listing: includes associated foodItem: { id, name }', async () => {
      // Link video item to noMediaFood
      await prisma.media.update({
        where: { id: uploadedVideoItem.id },
        data: { foodItemId: noMediaFood.id },
      });

      const res = await request(app)
        .get(`/api/restaurants/${restaurant.id}/media`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`);
      }

      const found = res.body.data.find((m: any) => m.id === uploadedVideoItem.id);
      if (!found) {
        throw new Error('Uploaded video not found in listing');
      }
      if (!found.foodItem || found.foodItem.id !== noMediaFood.id) {
        throw new Error(`Expected foodItem info linked, got: ${JSON.stringify(found.foodItem)}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 21: Media deletion safety: deleting media linked to a dish without force returns 409
    // -------------------------------------------------------------
    await assert(21, 'Media deletion safety: unforced delete of linked media returns 409 Conflict', async () => {
      const res = await request(app)
        .delete(`/api/media/${uploadedVideoItem.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.status !== 409) {
        throw new Error(`Expected 409 Conflict when deleting linked media, got: ${res.status}`);
      }
      if (!res.body.dishes || res.body.dishes.length === 0) {
        throw new Error('Expected linked dishes list in 409 error response');
      }
    });

    // -------------------------------------------------------------
    // TEST 22: Media deletion safety: force=true unlinks and keeps food item intact
    // -------------------------------------------------------------
    await assert(22, 'Media deletion safety: force=true deletes media and preserves food item', async () => {
      const res = await request(app)
        .delete(`/api/media/${uploadedVideoItem.id}?force=true`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.status !== 200) {
        throw new Error(`Expected 200 on force delete, got: ${res.status}`);
      }

      // Check food item is STILL in database
      const foodStillExists = await prisma.foodItem.findUnique({
        where: { id: noMediaFood.id },
      });
      if (!foodStillExists) {
        throw new Error('CRITICAL: Dish was deleted when media was deleted!');
      }
    });

    // -------------------------------------------------------------
    // TEST 23: Customer public menu (GET /api/menu/:slug): returns dishes with NO media gracefully
    // -------------------------------------------------------------
    await assert(23, 'Customer public menu: returns dishes with NO media gracefully', async () => {
      const res = await request(app).get(`/api/menu/${restaurant.slug}`);

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`);
      }

      const foods = res.body.data.foods;
      const target = foods.find((f: any) => f.id === bothMediaFood.id);
      if (!target) {
        throw new Error('Target dish not found in customer public menu');
      }

      // Dish has neither image nor video (removed in Test 8)
      if (target.video) {
        throw new Error(`Expected video to be undefined/null, got: ${target.video}`);
      }
      // Image should be empty string or null, but never throw or crash
      if (target.image && target.image !== '') {
        throw new Error(`Expected empty image, got: ${target.image}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 24: Customer public menu: returns dishes with video only correctly
    // -------------------------------------------------------------
    await assert(24, 'Customer public menu: returns dishes with video only correctly', async () => {
      const res = await request(app).get(`/api/menu/${restaurant.slug}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

      const foods = res.body.data.foods;
      const target = foods.find((f: any) => f.id === videoOnlyFood.id);
      if (!target) {
        throw new Error('Video-only dish not found in customer public menu');
      }

      if (!target.video) {
        throw new Error('Expected video URL on video-only dish');
      }
    });

    // -------------------------------------------------------------
    // TEST 25: Customer public menu: returns dishes with image only correctly
    // -------------------------------------------------------------
    await assert(25, 'Customer public menu: returns dishes with image only correctly', async () => {
      const res = await request(app).get(`/api/menu/${restaurant.slug}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

      const foods = res.body.data.foods;
      const target = foods.find((f: any) => f.id === imageOnlyFood.id);
      if (!target) {
        throw new Error('Image-only dish not found in customer public menu');
      }

      if (!target.image) {
        throw new Error('Expected image URL on image-only dish');
      }
      if (target.video) {
        throw new Error(`Expected video to be undefined, got: ${target.video}`);
      }
    });

  } finally {
    // Clean up test items
    if (restaurant) {
      await prisma.foodItem.deleteMany({
        where: {
          restaurantId: restaurant.id,
          name: { startsWith: 'TEST_MEDIA_' },
        },
      });
      if (uploadedMediaItem) {
        await prisma.media.deleteMany({ where: { id: uploadedMediaItem.id } });
      }
    }
  }

  console.log(`\n📊 Food Media Test Results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runFoodMediaTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
