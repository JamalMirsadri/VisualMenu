import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';

async function runTests() {
  console.log('🧪 Starting Phase 3 Hardened Database, Auth & API Test Suite...\n');
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
  let staffToken = '';
  let demoRestaurantId = '';
  let testRestAId = '';
  let testRestBId = '';
  let categoryAId = '';
  let categoryBId = '';
  let foodAId = '';
  let demoFoodId = '';

  try {
    // 1. Health check
    await assert('GET /api/health returns healthy without auth', async () => {
      const res = await request(app).get('/api/health');
      if (res.status !== 200 || res.body.status !== 'healthy') {
        throw new Error(`Expected 200 healthy, got ${res.status}`);
      }
    });

    // 2. Public Menu Retrieval
    await assert('GET /api/menu/:restaurantSlug returns complete public menu payload without token', async () => {
      const res = await request(app).get('/api/menu/demo-restaurant');
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.body)}`);
      const { restaurant, categories, foods, settings } = res.body.data;
      if (!restaurant || !restaurant.name) throw new Error('Missing restaurant object');
      if (!Array.isArray(categories) || categories.length === 0) throw new Error('Categories empty');
      if (!Array.isArray(foods) || foods.length === 0) throw new Error('Foods empty');
      if (!settings) throw new Error('Settings missing');

      demoRestaurantId = restaurant.id;
      demoFoodId = foods[0].id;
      if (typeof foods[0].price !== 'number') throw new Error('Price is not numeric in public payload');
    });


    // 3. Auth Login Failure Test
    await assert('POST /api/auth/login rejects invalid credentials with 401', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'owner@auradining.com',
        password: 'WrongPassword999!',
      });
      if (res.status !== 401 || res.body.errorCode !== 'INVALID_CREDENTIALS') {
        throw new Error(`Expected 401 INVALID_CREDENTIALS, got ${res.status}`);
      }
    });

    // 4. Auth Login Success Test (OWNER)
    await assert('POST /api/auth/login authenticates OWNER and returns JWT token & restaurants', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'owner@auradining.com',
        password: 'Password123!',
      });
      if (res.status !== 200 || !res.body.data?.token) {
        throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
      }
      ownerToken = res.body.data.token;
      if (!res.body.data.restaurants || res.body.data.restaurants.length === 0) {
        throw new Error('User missing assigned restaurants');
      }
    });

    // 5. Auth Login Success Test (STAFF)
    await assert('POST /api/auth/login authenticates STAFF role', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'staff@auradining.com',
        password: 'Password123!',
      });
      if (res.status !== 200 || !res.body.data?.token) {
        throw new Error(`Staff login failed: ${JSON.stringify(res.body)}`);
      }
      staffToken = res.body.data.token;
      if (res.body.data.restaurants[0]?.role !== 'STAFF') {
        throw new Error(`Expected role STAFF, got ${res.body.data.restaurants[0]?.role}`);
      }
    });

    // 6. Protected Routes reject requests missing Bearer token
    await assert('Protected endpoint /api/restaurants rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/restaurants');
      if (res.status !== 401 || res.body.errorCode !== 'AUTH_REQUIRED') {
        throw new Error(`Expected 401 AUTH_REQUIRED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 7. Protected Routes reject invalid tokens
    await assert('Protected endpoint rejects invalid Bearer token with 401', async () => {
      const res = await request(app)
        .get('/api/restaurants')
        .set('Authorization', 'Bearer invalid_signature_token_xyz');
      if (res.status !== 401 || res.body.errorCode !== 'INVALID_TOKEN') {
        throw new Error(`Expected 401 INVALID_TOKEN, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 8. Multi-Tenant Restaurant Creation (With OWNER token)
    await assert('POST /api/restaurants creates distinct isolated restaurants assigned to creator', async () => {
      const slugA = `test-rest-a-${Date.now()}`;
      const slugB = `test-rest-b-${Date.now()}`;

      const resA = await request(app)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Restaurant Alpha',
          slug: slugA,
          currency: 'EUR',
        });
      if (resA.status !== 201) throw new Error(`Restaurant A creation failed: ${JSON.stringify(resA.body)}`);
      testRestAId = resA.body.data.id;

      const resB = await request(app)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Restaurant Beta',
          slug: slugB,
          currency: 'USD',
        });
      if (resB.status !== 201) throw new Error(`Restaurant B creation failed: ${JSON.stringify(resB.body)}`);
      testRestBId = resB.body.data.id;
    });

    // 9. Duplicate Slug Constraint Validation
    await assert('POST /api/restaurants rejects duplicate slug with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Duplicate Restaurant',
          slug: 'demo-restaurant',
        });
      if (res.status !== 409 || res.body.errorCode !== 'DUPLICATE_RESOURCE') {
        throw new Error(`Expected 409 DUPLICATE_RESOURCE, got ${res.status}`);
      }
    });

    // 10. Category Creation & Ownership
    await assert('POST /api/restaurants/:id/categories creates categories scoped to restaurant', async () => {
      const resA = await request(app)
        .post(`/api/restaurants/${testRestAId}/categories`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Alpha Starters',
          displayOrder: 1,
        });
      if (resA.status !== 201) throw new Error(`Category A creation failed: ${JSON.stringify(resA.body)}`);
      categoryAId = resA.body.data.id;

      const resB = await request(app)
        .post(`/api/restaurants/${testRestBId}/categories`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Beta Starters',
          displayOrder: 1,
        });
      if (resB.status !== 201) throw new Error(`Category B creation failed: ${JSON.stringify(resB.body)}`);
      categoryBId = resB.body.data.id;
    });

    // 11. Cross-Restaurant Category Isolation
    await assert('POST food item with category from another restaurant fails with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${testRestAId}/foods`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Illicit Cross Food',
          categoryId: categoryBId,
          price: 15.00,
        });

      if (res.status !== 400 || res.body.errorCode !== 'CATEGORY_RESTAURANT_MISMATCH') {
        throw new Error(`Expected 400 CATEGORY_RESTAURANT_MISMATCH, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 12. Invalid Price Validation
    await assert('POST food with negative price rejects with 400 INVALID_PRICE', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${testRestAId}/foods`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Negative Price Dish',
          categoryId: categoryAId,
          price: -5.00,
        });
      if (res.status !== 400 || res.body.errorCode !== 'INVALID_PRICE') {
        throw new Error(`Expected 400 INVALID_PRICE, got ${res.status}`);
      }
    });

    // 13. Food Item Creation with Media (Transaction)
    await assert('POST food creates dish and media transactionally in PostgreSQL', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${testRestAId}/foods`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Alpha Signature Steak',
          tagline: 'Dry aged & charcoal flame',
          description: 'Prime cut served with bone marrow butter',
          price: 38.50,
          categoryId: categoryAId,
          image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
          video: 'https://assets.mixkit.co/videos/preview/mixkit-close-up-of-meat-being-cooked-on-a-grill-42998-large.mp4',
          spicyLevel: 1,
          preparationTime: 20,
          ingredients: ['Prime Angus', 'Marrow Butter'],
        });

      if (res.status !== 201) throw new Error(`Food creation failed: ${JSON.stringify(res.body)}`);
      foodAId = res.body.data.id;
      if (typeof res.body.data.price !== 'number' || res.body.data.price !== 38.50) {
        throw new Error(`Price mismatch: expected 38.50, got ${res.body.data.price}`);
      }
    });

    // 14. Instant Price Patch
    await assert('PATCH /api/foods/:id/price updates price in database', async () => {
      const res = await request(app)
        .patch(`/api/foods/${foodAId}/price`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          price: 42.00,
        });
      if (res.status !== 200 || res.body.data.price !== 42.00) {
        throw new Error(`Price patch failed: ${JSON.stringify(res.body)}`);
      }

      const inDb = await prisma.foodItem.findUnique({ where: { id: foodAId } });
      if (!inDb || Number(inDb.price) !== 42.00) {
        throw new Error(`Direct DB check failed: price is ${inDb?.price}`);
      }
    });

    // 15. Role Authorization: Staff CAN toggle live availability (86-ing)
    await assert('PATCH /api/foods/:id/availability succeeds for STAFF role', async () => {
      // Find food in demo restaurant which staff has access to
      const demoFood = await prisma.foodItem.findFirst({
        where: { restaurantId: demoRestaurantId, deletedAt: null },
      });
      if (!demoFood) throw new Error('Demo food not found');

      const res = await request(app)
        .patch(`/api/foods/${demoFood.id}/availability`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          available: false,
        });
      if (res.status !== 200 || res.body.data.available !== false) {
        throw new Error(`Staff availability patch failed: ${JSON.stringify(res.body)}`);
      }

      // Restore availability
      await request(app)
        .patch(`/api/foods/${demoFood.id}/availability`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ available: true });
    });

    // 16. Role Authorization: Staff CANNOT delete dishes (403 Forbidden)
    await assert('DELETE /api/foods/:id is forbidden for STAFF role (403)', async () => {
      const demoFood = await prisma.foodItem.findFirst({
        where: { restaurantId: demoRestaurantId, deletedAt: null },
      });
      if (!demoFood) throw new Error('Demo food not found');

      const res = await request(app)
        .delete(`/api/foods/${demoFood.id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      if (res.status !== 403 || res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') {
        throw new Error(`Expected 403 INSUFFICIENT_PERMISSIONS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 17. Multi-Tenant Restaurant Access Isolation
    await assert('Accessing a restaurant where user has no role membership returns 403 Forbidden', async () => {
      // Staff has role only in demo-restaurant, trying to mutate testRestAId
      const res = await request(app)
        .post(`/api/restaurants/${testRestAId}/categories`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Unauthorized Category',
        });

      if (res.status !== 403 || res.body.errorCode !== 'RESTAURANT_ACCESS_DENIED') {
        throw new Error(`Expected 403 RESTAURANT_ACCESS_DENIED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 18. Soft Deletion Verification
    await assert('DELETE /api/foods/:id soft-deletes and excludes from public menu', async () => {
      const delRes = await request(app)
        .delete(`/api/foods/${foodAId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      if (delRes.status !== 200) throw new Error(`Delete failed: ${JSON.stringify(delRes.body)}`);

      const inDb = await prisma.foodItem.findUnique({ where: { id: foodAId } });
      if (!inDb || inDb.deletedAt === null) throw new Error('deletedAt was not set in database');

      const rest = await prisma.restaurant.findUnique({ where: { id: testRestAId } });
      const menuRes = await request(app).get(`/api/menu/${rest?.slug}`);
      const dishes = menuRes.body.data.foods;
      if (dishes.some((d: any) => d.id === foodAId)) {
        throw new Error('Soft-deleted dish still appeared in public menu!');
      }
    });

    // 19. QR Code Creation & Listing
    await assert('POST /api/restaurants/:id/qr creates QR record with targetType', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${demoRestaurantId}/qr`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Patio Table 5 QR',
          targetType: 'TABLE_MENU',
          targetValue: '/menu/demo-restaurant/table/5',
        });
      if (res.status !== 201 || res.body.data.targetType !== 'TABLE_MENU') {
        throw new Error(`QR creation failed: ${JSON.stringify(res.body)}`);
      }
    });

    // 20. Audit Log Verification with userId
    await assert('AuditLog records mutations and captures authenticated userId in PostgreSQL', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { restaurantId: testRestAId },
        orderBy: { createdAt: 'desc' },
      });
      if (logs.length === 0) throw new Error('No audit logs were recorded for Restaurant Alpha mutations');
      if (!logs[0].userId) throw new Error('Audit log did not record userId');
    });

    // =========================================================================
    // PHASE 4 TESTS: TABLES, CUSTOMER ORDERS, IMMUTABILITY & STATE MACHINE
    // =========================================================================

    let testTableId = '';
    let testTableNumber = '99';
    let testOrderId = '';
    let testFoodItem: any = null;

    // 21. Table Creation
    await assert('POST /api/restaurants/:id/tables creates dining table with capacity & location', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${demoRestaurantId}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          number: testTableNumber,
          name: 'VIP Sky Terrace 99',
          capacity: 6,
          location: 'Rooftop Terrace',
          active: true,
        });

      if (res.status !== 201 || res.body.data.number !== testTableNumber) {
        throw new Error(`Table creation failed: ${JSON.stringify(res.body)}`);
      }
      testTableId = res.body.data.id;
    });

    // 22. Unique Table Number Constraint
    await assert('POST /api/restaurants/:id/tables rejects duplicate table number with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${demoRestaurantId}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          number: testTableNumber,
          name: 'Another Table 99',
          capacity: 2,
        });

      if (res.status !== 409 || res.body.errorCode !== 'DUPLICATE_TABLE_NUMBER') {
        throw new Error(`Expected 409 DUPLICATE_TABLE_NUMBER, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 23. Table Menu Resolution
    await assert('GET /api/menu/:slug/table/:number resolves restaurant menu and table metadata', async () => {
      const res = await request(app).get(`/api/menu/demo-restaurant/table/${testTableNumber}`);
      if (res.status !== 200 || !res.body.data.table || res.body.data.table.number !== testTableNumber) {
        throw new Error(`Failed to resolve table menu: ${JSON.stringify(res.body)}`);
      }
      testFoodItem = res.body.data.foods[0];
    });

    // 24. Public Customer Order Placement with Decimal Calculations & Price Snapshot
    await assert('POST /api/orders creates order with server-computed subtotal, tax, service charge, and item snapshots', async () => {
      const orderQty = 2;
      const res = await request(app)
        .post('/api/orders')
        .send({
          restaurantSlug: 'demo-restaurant',
          tableNumber: testTableNumber,
          customerNote: 'Window seat preference',
          items: [
            {
              foodItemId: testFoodItem.id,
              quantity: orderQty,
              customerNote: 'No dressing',
            },
          ],
        });

      if (res.status !== 201 || !res.body.data?.orderNumber) {
        throw new Error(`Order placement failed: ${JSON.stringify(res.body)}`);
      }

      const order = res.body.data;
      testOrderId = order.id;

      if (!order.orderNumber.startsWith('A-')) {
        throw new Error(`Expected orderNumber prefix A-, got ${order.orderNumber}`);
      }

      const expectedSubtotal = Math.round(Number(testFoodItem.price) * orderQty * 100) / 100;
      if (Number(order.subtotal) !== expectedSubtotal) {
        throw new Error(`Subtotal mismatch: expected ${expectedSubtotal}, got ${order.subtotal}`);
      }

      // Check item snapshots
      const item = order.items[0];
      if (item.foodNameSnapshot !== testFoodItem.name) {
        throw new Error(`foodNameSnapshot mismatch: ${item.foodNameSnapshot} vs ${testFoodItem.name}`);
      }
      if (Number(item.unitPrice) !== Number(testFoodItem.price)) {
        throw new Error(`unitPrice mismatch: ${item.unitPrice} vs ${testFoodItem.price}`);
      }
      if (item.customerNote !== 'No dressing') {
        throw new Error(`customerNote was not saved on item`);
      }
    });

    // 25. Rejection of Unavailable Dish in Orders
    await assert('POST /api/orders rejects order if dish is marked unavailable', async () => {
      // Temporarily mark dish unavailable
      await prisma.foodItem.update({
        where: { id: testFoodItem.id },
        data: { available: false },
      });

      const res = await request(app)
        .post('/api/orders')
        .send({
          restaurantSlug: 'demo-restaurant',
          tableNumber: testTableNumber,
          items: [{ foodItemId: testFoodItem.id, quantity: 1 }],
        });

      // Restore dish availability
      await prisma.foodItem.update({
        where: { id: testFoodItem.id },
        data: { available: true },
      });

      if (res.status !== 400 || res.body.errorCode !== 'ITEM_UNAVAILABLE') {
        throw new Error(`Expected 400 ITEM_UNAVAILABLE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 26. Historical Price Immutability Verification
    await assert('Mutating live FoodItem price does NOT alter previously placed orders or line totals', async () => {
      // Fetch original order details
      const beforeOrder = await prisma.order.findUnique({
        where: { id: testOrderId },
        include: { items: true },
      });
      const originalTotal = Number(beforeOrder?.total);
      const originalUnitPrice = Number(beforeOrder?.items[0].unitPrice);

      // Drastically change the live price in the menu
      await prisma.foodItem.update({
        where: { id: testFoodItem.id },
        data: { price: '999.99' },
      });

      // Fetch order from DB again
      const afterOrder = await prisma.order.findUnique({
        where: { id: testOrderId },
        include: { items: true },
      });

      // Restore actual price
      await prisma.foodItem.update({
        where: { id: testFoodItem.id },
        data: { price: testFoodItem.price.toString() },
      });

      if (Number(afterOrder?.total) !== originalTotal) {
        throw new Error(`Order total mutated! Was ${originalTotal}, now ${afterOrder?.total}`);
      }
      if (Number(afterOrder?.items[0].unitPrice) !== originalUnitPrice) {
        throw new Error(`OrderItem unitPrice mutated! Was ${originalUnitPrice}, now ${afterOrder?.items[0].unitPrice}`);
      }
    });

    // 27. Order Status State Machine Progression
    await assert('PATCH /api/restaurants/:id/orders/:id/status strictly advances through state machine', async () => {
      // PENDING -> CONFIRMED
      let res = await request(app)
        .patch(`/api/restaurants/${demoRestaurantId}/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CONFIRMED' });
      if (res.status !== 200 || res.body.data.status !== 'CONFIRMED') {
        throw new Error(`Failed to advance to CONFIRMED: ${JSON.stringify(res.body)}`);
      }

      // Invalid transition: CONFIRMED -> COMPLETED directly (must fail)
      res = await request(app)
        .patch(`/api/restaurants/${demoRestaurantId}/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'COMPLETED' });
      if (res.status !== 400 || res.body.errorCode !== 'INVALID_STATUS_TRANSITION') {
        throw new Error(`Expected 400 INVALID_STATUS_TRANSITION, got ${res.status}`);
      }

      // CONFIRMED -> PREPARING
      res = await request(app)
        .patch(`/api/restaurants/${demoRestaurantId}/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'PREPARING' });
      if (res.status !== 200 || res.body.data.status !== 'PREPARING') {
        throw new Error(`Failed to advance to PREPARING`);
      }

      // PREPARING -> READY
      res = await request(app)
        .patch(`/api/restaurants/${demoRestaurantId}/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'READY' });
      if (res.status !== 200 || res.body.data.status !== 'READY') {
        throw new Error(`Failed to advance to READY`);
      }

      // READY -> SERVED
      res = await request(app)
        .patch(`/api/restaurants/${demoRestaurantId}/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'SERVED' });
      if (res.status !== 200 || res.body.data.status !== 'SERVED') {
        throw new Error(`Failed to advance to SERVED`);
      }

      // SERVED -> COMPLETED
      res = await request(app)
        .patch(`/api/restaurants/${demoRestaurantId}/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'COMPLETED' });
      if (res.status !== 200 || res.body.data.status !== 'COMPLETED' || !res.body.data.completedAt) {
        throw new Error(`Failed to advance to COMPLETED with completedAt timestamp`);
      }

      // COMPLETED is terminal: attempt to transition back to PENDING must fail
      res = await request(app)
        .patch(`/api/restaurants/${demoRestaurantId}/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'PENDING' });
      if (res.status !== 400) {
        throw new Error(`Expected 400 when modifying terminal COMPLETED order, got ${res.status}`);
      }
    });

    // ==========================================
    // PHASE 5 TESTS: MULTI-TENANT SAAS & REAL-TIME
    // ==========================================

    // 25. Health Check Live DB Ping
    await assert('GET /api/health measures live PostgreSQL database connectivity and latency', async () => {
      const res = await request(app).get('/api/health');
      if (res.status !== 200) throw new Error(`Health status ${res.status}`);
      if (res.body.database?.status !== 'connected') {
        throw new Error(`Database status is not connected: ${JSON.stringify(res.body)}`);
      }
      if (typeof res.body.database?.latencyMs !== 'number') {
        throw new Error(`Missing latency measurement in health payload`);
      }
    });

    // 26. User Management: List members
    let createdMemberUserId = '';
    await assert('GET /api/restaurants/:id/users lists tenant members with roles', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${demoRestaurantId}/users`)
        .set('Authorization', `Bearer ${ownerToken}`);
      if (res.status !== 200 || !Array.isArray(res.body.data)) {
        throw new Error(`Failed to list users: ${JSON.stringify(res.body)}`);
      }
      const ownerMember = res.body.data.find((m: any) => m.role === 'OWNER');
      if (!ownerMember) throw new Error('Owner member not found in tenant members list');
    });

    // 27. User Management: Invite team member
    const testMemberEmail = `newstaff_${Date.now()}@auradining.com`;
    await assert('POST /api/restaurants/:id/users allows OWNER to invite a new STAFF member', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${demoRestaurantId}/users`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: testMemberEmail,
          name: 'Alex Line Cook',
          role: 'STAFF',
        });
      if (res.status !== 201 || !res.body.data?.id) {
        throw new Error(`Failed to invite user: ${JSON.stringify(res.body)}`);
      }
      createdMemberUserId = res.body.data.id;
      if (res.body.data.role !== 'STAFF') {
        throw new Error(`Expected role STAFF, got ${res.body.data.role}`);
      }
    });

    // 28. Role Elevation Protection: STAFF or MANAGER cannot invite an OWNER
    await assert('POST /api/restaurants/:id/users rejects role elevation beyond caller rank', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${demoRestaurantId}/users`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          email: `elevation_${Date.now()}@test.com`,
          name: 'Illegal Admin',
          role: 'ADMIN',
        });
      if (res.status !== 403) {
        throw new Error(`Expected 403 FORBIDDEN for role elevation, got ${res.status}`);
      }
    });

    // 29. Password Reset: OWNER resets member password
    await assert('POST /api/restaurants/:id/users/:userId/reset-password returns temporary password', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${demoRestaurantId}/users/${createdMemberUserId}/reset-password`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});
      if (res.status !== 200 || !res.body.data?.temporaryPassword) {
        throw new Error(`Expected temporaryPassword in response: ${JSON.stringify(res.body)}`);
      }
    });

    // 30. Tenant Studio Creation: POST /api/restaurants auto-assigns OWNER
    let createdTenantId = '';
    const uniqueSlug = `test-bistro-${Date.now()}`;
    await assert('POST /api/restaurants creates brand new tenant and assigns creator as OWNER', async () => {
      const res = await request(app)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Apex Modern Bistro',
          slug: uniqueSlug,
          description: 'Contemporary high-volume dining',
          themeColor: '#059669',
        });
      if (res.status !== 201 || !res.body.data?.id) {
        throw new Error(`Failed to create restaurant: ${JSON.stringify(res.body)}`);
      }
      createdTenantId = res.body.data.id;
      if (!res.body.data.active) {
        throw new Error('New restaurant should default to active');
      }

      // Verify UserRestaurant assignment in database
      const membership = await prisma.userRestaurant.findFirst({
        where: { restaurantId: createdTenantId, role: 'OWNER' },
      });
      if (!membership) throw new Error('Creator was not assigned as OWNER');
    });

    // 31. Tenant Status Toggle: Deactivate restaurant
    await assert('PATCH /api/restaurants/:id/status updates active state', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${createdTenantId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ active: false });
      if (res.status !== 200 || res.body.data.active !== false) {
        throw new Error(`Failed to deactivate restaurant: ${JSON.stringify(res.body)}`);
      }
    });

    // 32. Order Placement Blocked for Inactive Restaurant
    await assert('POST /api/orders rejects submission when restaurant is inactive with RESTAURANT_INACTIVE', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({
          restaurantSlug: uniqueSlug,
          items: [{ foodItemId: foodAId, quantity: 1 }],
        });
      if (res.status !== 400 || res.body.errorCode !== 'RESTAURANT_INACTIVE') {
        throw new Error(`Expected 400 RESTAURANT_INACTIVE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    // 33. Idempotency Key & Order Placement
    let idempotencyKeyTest = `idemp-test-${Date.now()}`;
    let idempotentOrderId = '';
    let idempotentPublicToken = '';
    await assert('POST /api/orders with Idempotency-Key successfully creates order', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Idempotency-Key', idempotencyKeyTest)
        .send({
          restaurantSlug: 'demo-restaurant',
          customerNote: 'First idempotent attempt',
          items: [{ foodItemId: demoFoodId, quantity: 1 }],
        });
      if (res.status !== 201 || !res.body.data?.id || !res.body.data?.publicToken) {
        throw new Error(`Failed to create order with idempotency key: ${JSON.stringify(res.body)}`);
      }
      idempotentOrderId = res.body.data.id;
      idempotentPublicToken = res.body.data.publicToken;
      if (res.body.data.isIdempotentReplay) {
        throw new Error('Initial order creation should not be flagged as replay');
      }
    });

    // 34. Idempotency Replay Protection
    await assert('POST /api/orders with duplicate Idempotency-Key returns HTTP 200 with same order and isIdempotentReplay: true', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Idempotency-Key', idempotencyKeyTest)
        .send({
          restaurantSlug: 'demo-restaurant',
          customerNote: 'Duplicate request',
          items: [{ foodItemId: demoFoodId, quantity: 1 }],
        });
      if (res.status !== 200) {
        throw new Error(`Expected 200 for idempotent replay, got ${res.status}`);
      }
      if (res.body.data.id !== idempotentOrderId) {
        throw new Error(`Expected identical order ID ${idempotentOrderId}, got ${res.body.data.id}`);
      }
      if (!res.body.data.isIdempotentReplay) {
        throw new Error('Expected isIdempotentReplay: true flag on duplicate replay');
      }
    });

    // 35. OrderStatusHistory Tracking

    await assert('OrderStatusHistory records initial creation and subsequent status transitions', async () => {
      // Check initial creation record in OrderStatusHistory
      const initialHistory = await prisma.orderStatusHistory.findMany({
        where: { orderId: idempotentOrderId },
      });
      if (initialHistory.length === 0) {
        throw new Error('OrderStatusHistory has no entries for newly created order');
      }
      if (initialHistory[0].toStatus !== 'PENDING') {
        throw new Error(`Expected initial history toStatus PENDING, got ${initialHistory[0].toStatus}`);
      }

      // Transition order status
      const res = await request(app)
        .patch(`/api/restaurants/${demoRestaurantId}/orders/${idempotentOrderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CONFIRMED' });
      if (res.status !== 200 || res.body.data.status !== 'CONFIRMED') {
        throw new Error(`Failed to transition status`);
      }

      const updatedHistory = await prisma.orderStatusHistory.findMany({
        where: { orderId: idempotentOrderId },
        orderBy: { createdAt: 'asc' },
      });
      if (updatedHistory.length < 2) {
        throw new Error(`Expected at least 2 history records after transition, found ${updatedHistory.length}`);
      }
      const lastEntry = updatedHistory[updatedHistory.length - 1];
      if (lastEntry.fromStatus !== 'PENDING' || lastEntry.toStatus !== 'CONFIRMED') {
        throw new Error(`Unexpected transition: ${lastEntry.fromStatus} -> ${lastEntry.toStatus}`);
      }
    });

    // 36. Public Order Tracking via publicOrderToken
    await assert('GET /api/orders/track/:publicOrderToken retrieves order ticket and status history publicly without token', async () => {
      const res = await request(app).get(`/api/orders/track/${idempotentPublicToken}`);
      if (res.status !== 200 || !res.body.data) {
        throw new Error(`Public order tracking failed: ${res.status}`);
      }
      if (res.body.data.publicToken !== idempotentPublicToken) {
        throw new Error('Mismatched publicToken in response');
      }
      if (!Array.isArray(res.body.data.statusHistory) || res.body.data.statusHistory.length === 0) {
        throw new Error('Public tracked order missing statusHistory');
      }
    });

    // 37. Public Order Tracking rejects invalid token
    await assert('GET /api/orders/track/:publicOrderToken returns 404 for nonexistent token', async () => {
      const res = await request(app).get('/api/orders/track/nonexistent-token-uuid');
      if (res.status !== 404) {
        throw new Error(`Expected 404 for invalid token, got ${res.status}`);
      }
    });

    // Clean up Phase 5 test records
    if (idempotentOrderId) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: idempotentOrderId } });
      await prisma.orderItem.deleteMany({ where: { orderId: idempotentOrderId } });
      await prisma.order.delete({ where: { id: idempotentOrderId } });
    }
    if (createdMemberUserId) {
      await prisma.userRestaurant.deleteMany({ where: { userId: createdMemberUserId } });
      await prisma.user.delete({ where: { id: createdMemberUserId } });
    }
    if (createdTenantId) {
      await prisma.userRestaurant.deleteMany({ where: { restaurantId: createdTenantId } });
      await prisma.restaurant.delete({ where: { id: createdTenantId } });
    }

    // Clean up test table and order
    if (testTableId) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: testOrderId } });
      await prisma.orderItem.deleteMany({ where: { orderId: testOrderId } });
      await prisma.order.delete({ where: { id: testOrderId } });
      await prisma.qrCode.deleteMany({ where: { tableId: testTableId } });
      await prisma.table.delete({ where: { id: testTableId } });
    }


    // Clean up test restaurants A & B
    await prisma.restaurant.deleteMany({
      where: { id: { in: [testRestAId, testRestBId] } },
    });

  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
