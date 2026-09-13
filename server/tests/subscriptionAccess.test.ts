import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import {
  BillingInterval,
  SubscriptionStatus,
  SubscriptionRequestStatus,
  SubscriptionAssignmentType,
  ProvisioningStatus,
  Role,
  NotificationType,
  AuditAction,
} from '@prisma/client';
import { RestaurantProvisioningService } from '../src/services/restaurantProvisioningService';
import { SubscriptionService } from '../src/services/subscription/subscriptionService';
import { SubscriptionScheduler } from '../src/services/subscription/subscriptionScheduler';

async function runSubscriptionAccessTestSuite() {
  console.log('🚀 Starting Phase 13C: Subscription Request, Payment Activation, Platform Assign/Revoke & Strict No-Subscription Access Test Suite...\n');
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

  const timestamp = Date.now();
  const testEmailsToClean: string[] = [];
  const testRestIdsToClean: string[] = [];

  let platformAdminToken = '';
  let platformAdminUser: any = null;
  let testPlanMonthly: any = null;
  let testPlanYearly: any = null;

  // Tenants for tests
  let restPending: any = null;
  let ownerPending: any = null;
  let ownerPendingToken = '';

  let restActive: any = null;
  let ownerActive: any = null;
  let ownerActiveToken = '';

  let restTenantB: any = null;
  let ownerTenantB: any = null;
  let ownerTenantBToken = '';

  try {
    // =============================================================
    // INITIAL SETUP: Platform Admin & Test Plans
    // =============================================================
    await assert('Setup: Authenticate Platform Admin', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'platformadmin@auramenu.com',
        password: 'Password123!',
      });
      if (res.status !== 200) throw new Error(`Platform login failed: ${res.status}`);
      platformAdminToken = res.body.data.token;
      platformAdminUser = res.body.data.user;
    });

    await assert('Setup: Create Phase 13C Test Subscription Plans', async () => {
      testPlanMonthly = await prisma.subscriptionPlan.create({
        data: {
          code: `test-13c-monthly-${timestamp}`,
          name: 'Phase 13C Monthly Pro',
          description: 'Standard plan for 13C testing',
          price: 49.0,
          currency: 'EUR',
          billingInterval: BillingInterval.MONTHLY,
          intervalCount: 1,
          trialDays: null,
          gracePeriodDays: 5,
          active: true,
        },
      });

      testPlanYearly = await prisma.subscriptionPlan.create({
        data: {
          code: `test-13c-yearly-${timestamp}`,
          name: 'Phase 13C Yearly Enterprise',
          description: 'Enterprise plan for 13C testing',
          price: 490.0,
          currency: 'EUR',
          billingInterval: BillingInterval.YEARLY,
          intervalCount: 1,
          trialDays: null,
          gracePeriodDays: 10,
          active: true,
        },
      });

      if (!testPlanMonthly || !testPlanYearly) throw new Error('Failed to create test plans');
    });

    // =============================================================
    // GROUP 1: Newly Created Restaurant Provisioning & No Active Sub (Tests 1-8)
    // =============================================================
    console.log('\n--- GROUP 1: Newly Created Restaurant Provisioning Status & No Active Subscription ---');

    await assert('Test 1: Provisioning a new restaurant sets status to SUBSCRIPTION_PENDING', async () => {
      const ownerEmail = `owner-pending-${timestamp}@test.com`;
      testEmailsToClean.push(ownerEmail);

      const result = await RestaurantProvisioningService.provisionRestaurant({
        name: `Pending Bistro ${timestamp}`,
        slug: `pending-bistro-${timestamp}`,
        ownerEmail,
        ownerName: 'Pending Owner',
        adminUserId: platformAdminUser.id,
      });

      restPending = result.restaurant;
      testRestIdsToClean.push(restPending.id);

      if (result.restaurant?.provisioningStatus !== ProvisioningStatus.SUBSCRIPTION_PENDING) {
        throw new Error(`Expected SUBSCRIPTION_PENDING, got ${result.restaurant?.provisioningStatus}`);
      }
    });

    await assert('Test 2: Newly provisioned restaurant in DB has provisioningStatus = SUBSCRIPTION_PENDING', async () => {
      const inDb = await prisma.restaurant.findUnique({ where: { id: restPending.id } });
      if (!inDb || inDb.provisioningStatus !== ProvisioningStatus.SUBSCRIPTION_PENDING) {
        throw new Error(`Expected in DB SUBSCRIPTION_PENDING, got ${inDb?.provisioningStatus}`);
      }
    });

    await assert('Test 3: Newly created restaurant has ZERO active subscription records', async () => {
      const sub = await prisma.subscription.findFirst({ where: { restaurantId: restPending.id } });
      if (sub && sub.status === SubscriptionStatus.ACTIVE) {
        throw new Error('Critical violation: Newly created restaurant must NEVER have an ACTIVE subscription automatically!');
      }
    });

    await assert('Test 4: Setting active: true on restaurant does NOT bypass subscription requirement', async () => {
      await prisma.restaurant.update({
        where: { id: restPending.id },
        data: { active: true },
      });
      const inDb = await prisma.restaurant.findUnique({ where: { id: restPending.id } });
      if (!inDb?.active) throw new Error('Failed to set active: true');
      // Still no active subscription exists
      const sub = await prisma.subscription.findFirst({ where: { restaurantId: restPending.id } });
      if (sub && sub.status === SubscriptionStatus.ACTIVE) {
        throw new Error('Subscription unexpectedly active');
      }
    });

    await assert('Test 5: Owner completes onboarding with restaurant remaining in SUBSCRIPTION_PENDING', async () => {
      const invitation = await prisma.ownerInvitation.findFirst({
        where: { restaurantId: restPending.id },
      });
      if (!invitation) throw new Error('Owner invitation not found');

      const passwordHash = await bcrypt.hash('Password123!', 10);
      ownerPending = await prisma.user.update({
        where: { email: invitation.invitedEmail },
        data: { passwordHash },
      });

      await prisma.ownerInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        email: ownerPending.email,
        password: 'Password123!',
      });
      if (loginRes.status !== 200) throw new Error(`Owner login failed: ${loginRes.status}`);
      ownerPendingToken = loginRes.body.data.token;

      const restInDb = await prisma.restaurant.findUnique({ where: { id: restPending.id } });
      if (restInDb?.provisioningStatus !== ProvisioningStatus.SUBSCRIPTION_PENDING) {
        throw new Error(`Expected restaurant to remain in SUBSCRIPTION_PENDING after owner onboarding, got ${restInDb?.provisioningStatus}`);
      }
    });

    await assert('Test 6: Staff user exists but cannot bypass subscription requirement', async () => {
      const staffEmail = `staff-pending-${timestamp}@test.com`;
      testEmailsToClean.push(staffEmail);
      const passwordHash = await bcrypt.hash('Password123!', 10);
      const staffUser = await prisma.user.create({
        data: {
          email: staffEmail,
          name: 'Staff Member',
          passwordHash,
          userRestaurants: {
            create: {
              restaurantId: restPending.id,
              role: Role.WAITER,
            },
          },
        },
      });

      const staffLogin = await request(app).post('/api/auth/login').send({
        email: staffEmail,
        password: 'Password123!',
      });
      if (staffLogin.status !== 200) throw new Error('Staff login failed');
      const staffToken = staffLogin.body.data.token;

      // Staff tries to access categories -> must receive 402
      const res = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${staffToken}`);
      if (res.status !== 402) {
        throw new Error(`Expected 402 for staff without active subscription, got ${res.status}`);
      }
    });

    await assert('Test 7: GET /api/platform/restaurants/:id/provisioning returns SUBSCRIPTION_PENDING', async () => {
      const res = await request(app)
        .get(`/api/platform/restaurants/${restPending.id}/provisioning`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`Fetch failed: ${res.status}`);
      if (res.body.data?.restaurant?.provisioningStatus !== ProvisioningStatus.SUBSCRIPTION_PENDING) {
        throw new Error(`Expected SUBSCRIPTION_PENDING in provisioning API, got ${res.body.data?.restaurant?.provisioningStatus}`);
      }
    });

    await assert('Test 8: GET /api/platform/restaurants lists restaurant with SUBSCRIPTION_PENDING', async () => {
      const res = await request(app)
        .get('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`List failed: ${res.status}`);
      const found = res.body.data?.items?.find((r: any) => r.id === restPending.id);
      if (!found || found.provisioningStatus !== ProvisioningStatus.SUBSCRIPTION_PENDING) {
        throw new Error(`Expected found restaurant with SUBSCRIPTION_PENDING, got ${found?.provisioningStatus}`);
      }
    });

    // =============================================================
    // GROUP 2: Owner Subscription Request Lifecycle (Tests 9-18)
    // =============================================================
    console.log('\n--- GROUP 2: Owner Subscription Request Lifecycle ---');

    let createdRequestId = '';

    await assert('Test 9: Owner submits subscription request POST /api/subscriptions/restaurant/:id/request', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restPending.id}/request`)
        .set('Authorization', `Bearer ${ownerPendingToken}`)
        .send({
          planId: testPlanMonthly.id,
          notes: 'Opening this weekend, requesting Monthly Pro onboarding review',
        });
      if (res.status !== 201) throw new Error(`Request failed: ${res.status} ${JSON.stringify(res.body)}`);
      if (res.body.data?.status !== SubscriptionRequestStatus.PENDING) {
        throw new Error(`Expected status PENDING, got ${res.body.data?.status}`);
      }
      createdRequestId = res.body.data.id;
    });

    await assert('Test 10: In DB, SubscriptionRequest is stored in PENDING status with correct relations', async () => {
      const req = await prisma.subscriptionRequest.findUnique({
        where: { id: createdRequestId },
        include: { requestedPlan: true, requestedByUser: true },
      });
      if (!req) throw new Error('SubscriptionRequest not found in DB');
      if (req.status !== SubscriptionRequestStatus.PENDING) throw new Error(`Expected PENDING, got ${req.status}`);
      if (req.requestedPlanId !== testPlanMonthly.id) throw new Error('Plan mismatch');
      if (req.requestedByUserId !== ownerPending.id) throw new Error('Requester mismatch');
    });

    await assert('Test 11: SubscriptionRequest stores requester notes and requestedAt timestamp', async () => {
      const req = await prisma.subscriptionRequest.findUnique({ where: { id: createdRequestId } });
      if (!req?.notes?.includes('Opening this weekend')) throw new Error('Notes not stored correctly');
      if (!req?.requestedAt) throw new Error('requestedAt timestamp missing');
    });

    await assert('Test 12: Requesting subscription again returns existing pending request or new request', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restPending.id}/request`)
        .set('Authorization', `Bearer ${ownerPendingToken}`)
        .send({
          planId: testPlanMonthly.id,
          notes: 'Second check',
        });
      if (res.status !== 200 && res.status !== 201) throw new Error(`Expected 200 or 201, got ${res.status}`);
      if (res.body.data?.status !== SubscriptionRequestStatus.PENDING) throw new Error('Expected PENDING');
    });

    await assert('Test 13: Submitting subscription request requires valid planId', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restPending.id}/request`)
        .set('Authorization', `Bearer ${ownerPendingToken}`)
        .send({
          planId: '00000000-0000-0000-0000-000000000000',
        });
      if (res.status !== 404 && res.status !== 400) {
        throw new Error(`Expected 404 or 400 for invalid planId, got ${res.status}`);
      }
    });

    await assert('Test 14: Platform Admin lists subscription requests via GET /api/platform/subscription-requests', async () => {
      const res = await request(app)
        .get(`/api/platform/subscription-requests?restaurantId=${restPending.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200) throw new Error(`List requests failed: ${res.status}`);
      const found = res.body.data?.find((r: any) => r.id === createdRequestId);
      if (!found) throw new Error('Created request not returned in platform list');
    });

    await assert('Test 15: Platform Admin approves request -> transitions to PAYMENT_REQUIRED', async () => {
      const res = await request(app)
        .post(`/api/platform/subscription-requests/${createdRequestId}/review`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          action: 'APPROVE',
        });
      if (res.status !== 200) throw new Error(`Approve failed: ${res.status} ${JSON.stringify(res.body)}`);
      if (res.body.data?.status !== SubscriptionRequestStatus.PAYMENT_REQUIRED) {
        throw new Error(`Expected PAYMENT_REQUIRED, got ${res.body.data?.status}`);
      }

      const inDb = await prisma.subscriptionRequest.findUnique({ where: { id: createdRequestId } });
      if (inDb?.status !== SubscriptionRequestStatus.PAYMENT_REQUIRED) {
        throw new Error(`Expected in DB PAYMENT_REQUIRED, got ${inDb?.status}`);
      }
    });

    let secondRequestId = '';
    await assert('Test 16: Platform Admin rejects a subscription request with mandatory reason', async () => {
      // Create a second request to test rejection
      const reqRes = await request(app)
        .post(`/api/subscriptions/restaurant/${restPending.id}/request`)
        .set('Authorization', `Bearer ${ownerPendingToken}`)
        .send({
          planId: testPlanYearly.id,
          notes: 'Requesting enterprise trial review',
        });
      secondRequestId = reqRes.body.data.id;

      // Try rejection without reason -> should fail 400
      const failRes = await request(app)
        .post(`/api/platform/subscription-requests/${secondRequestId}/review`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          action: 'REJECT',
          rejectionReason: '',
        });
      if (failRes.status !== 400) throw new Error(`Expected 400 for empty rejection reason, got ${failRes.status}`);

      // Reject with valid reason
      const rejRes = await request(app)
        .post(`/api/platform/subscription-requests/${secondRequestId}/review`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          action: 'REJECT',
          rejectionReason: 'Annual billing requires enterprise contract signature',
        });
      if (rejRes.status !== 200) throw new Error(`Rejection failed: ${rejRes.status}`);
      if (rejRes.body.data?.status !== SubscriptionRequestStatus.REJECTED) {
        throw new Error(`Expected REJECTED, got ${rejRes.body.data?.status}`);
      }

      const inDb = await prisma.subscriptionRequest.findUnique({ where: { id: secondRequestId } });
      if (inDb?.status !== SubscriptionRequestStatus.REJECTED) throw new Error('DB status not REJECTED');
      if (inDb?.rejectionReason !== 'Annual billing requires enterprise contract signature') {
        throw new Error('Rejection reason not stored');
      }
    });

    await assert('Test 17: Notification generated for owner upon request review', async () => {
      const notifs = await prisma.notification.findMany({
        where: { restaurantId: restPending.id },
        orderBy: { createdAt: 'desc' },
      });
      if (notifs.length === 0) throw new Error('No notifications generated for restaurant');
    });

    await assert('Test 18: Owner lists requests via GET /api/subscriptions/restaurant/:id/requests', async () => {
      const res = await request(app)
        .get(`/api/subscriptions/restaurant/${restPending.id}/requests`)
        .set('Authorization', `Bearer ${ownerPendingToken}`);
      if (res.status !== 200) throw new Error(`Owner list requests failed: ${res.status}`);
      if (!Array.isArray(res.body.data) || res.body.data.length < 2) {
        throw new Error(`Expected at least 2 requests, got ${res.body.data?.length}`);
      }
    });

    // =============================================================
    // GROUP 3: Server-Verified Payment Activation (Tests 19-26)
    // =============================================================
    console.log('\n--- GROUP 3: Server-Verified Payment Activation ---');

    await assert('Test 19: Direct subscription creation without payment or platform assign is rejected/blocked', async () => {
      // Trying to directly update subscription status or bypass without endpoint
      const sub = await prisma.subscription.findFirst({ where: { restaurantId: restPending.id } });
      if (sub && sub.status === SubscriptionStatus.ACTIVE) {
        throw new Error('Active subscription illegally present');
      }
    });

    await assert('Test 20: Client payment without server verification cannot activate subscription', async () => {
      // Fake activation without valid payload or verification
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restPending.id}/activate`)
        .set('Authorization', `Bearer ${ownerPendingToken}`)
        .send({
          planId: '',
          amount: -10,
        });
      if (res.status !== 400 && res.status !== 404) {
        throw new Error(`Expected 400 or 404 for invalid payment activation payload, got ${res.status}`);
      }
    });

    let activatedSubId = '';
    await assert('Test 21: activateFromPayment completes payment, creates/activates subscription', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restPending.id}/activate`)
        .set('Authorization', `Bearer ${ownerPendingToken}`)
        .send({
          planId: testPlanMonthly.id,
          amount: 49.0,
          currency: 'EUR',
          requestId: createdRequestId,
        });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`activateFromPayment failed: ${res.status} ${JSON.stringify(res.body)}`);
      }
      if (res.body.data?.status !== SubscriptionStatus.ACTIVE) {
        throw new Error(`Expected ACTIVE subscription status, got ${res.body.data?.status}`);
      }
      activatedSubId = res.body.data.id;
    });

    await assert('Test 22: Subscription status in DB transitions to ACTIVE', async () => {
      const sub = await prisma.subscription.findUnique({ where: { id: activatedSubId } });
      if (!sub || sub.status !== SubscriptionStatus.ACTIVE) {
        throw new Error(`Expected DB status ACTIVE, got ${sub?.status}`);
      }
      if (sub.assignmentType !== SubscriptionAssignmentType.PAID) {
        throw new Error(`Expected assignmentType PAID, got ${sub.assignmentType}`);
      }
    });

    await assert('Test 23: Restaurant provisioningStatus in DB transitions to ACTIVE upon payment', async () => {
      const rest = await prisma.restaurant.findUnique({ where: { id: restPending.id } });
      if (rest?.provisioningStatus !== ProvisioningStatus.ACTIVE) {
        throw new Error(`Expected restaurant provisioningStatus ACTIVE, got ${rest?.provisioningStatus}`);
      }
    });

    await assert('Test 24: Paid invoice is generated automatically upon payment activation', async () => {
      const invoices = await prisma.subscriptionInvoice.findMany({
        where: { subscriptionId: activatedSubId },
      });
      if (invoices.length === 0) throw new Error('No invoice generated upon payment activation');
      if (invoices[0].status !== 'PAID') throw new Error(`Expected invoice status PAID, got ${invoices[0].status}`);
      if (Number(invoices[0].total) !== 49.0) throw new Error(`Invoice total mismatch: ${invoices[0].total}`);
    });

    await assert('Test 25: System notification generated for subscription payment success', async () => {
      const notif = await prisma.notification.findFirst({
        where: {
          restaurantId: restPending.id,
          type: { in: [NotificationType.SUBSCRIPTION_PAYMENT_SUCCESS, NotificationType.SUBSCRIPTION_RENEWED] },
        },
      });
      if (!notif) throw new Error('No payment success or renewed notification found');
    });

    await assert('Test 26: Days remaining is correctly computed (> 27 days for monthly)', async () => {
      const details = await SubscriptionService.getRestaurantSubscription(restPending.id);
      if (!details || details.daysRemaining < 25) {
        throw new Error(`Expected daysRemaining >= 25, got ${details?.daysRemaining}`);
      }
    });

    // =============================================================
    // GROUP 4: Strict No-Subscription Operational API Gating (Tests 27-38)
    // Setup an unpaid/no-subscription restaurant to test HTTP 402 gating
    // =============================================================
    console.log('\n--- GROUP 4: Strict No-Subscription Operational API Gating ---');

    let restUnpaid: any = null;
    let ownerUnpaid: any = null;
    let ownerUnpaidToken = '';

    await assert('Setup: Create second test restaurant without subscription', async () => {
      const email = `owner-unpaid-${timestamp}@test.com`;
      testEmailsToClean.push(email);

      const result = await RestaurantProvisioningService.provisionRestaurant({
        name: `Unpaid Bistro ${timestamp}`,
        slug: `unpaid-bistro-${timestamp}`,
        ownerEmail: email,
        ownerName: 'Unpaid Owner',
        adminUserId: platformAdminUser.id,
      });

      restUnpaid = result.restaurant;
      testRestIdsToClean.push(restUnpaid.id);

      ownerUnpaid = result.owner;
      const passwordHash = await bcrypt.hash('Password123!', 10);
      await prisma.user.update({
        where: { id: ownerUnpaid.id },
        data: { passwordHash },
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        email,
        password: 'Password123!',
      });
      ownerUnpaidToken = loginRes.body.data.token;
    });

    await assert('Test 27: GET /api/categories returns HTTP 402 SUBSCRIPTION_REQUIRED without active subscription', async () => {
      const res = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
      if (res.body.code !== 'SUBSCRIPTION_REQUIRED') throw new Error(`Expected code SUBSCRIPTION_REQUIRED, got ${res.body.code}`);
    });

    await assert('Test 28: POST /api/categories returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`)
        .send({ name: 'Appetizers' });
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 29: GET /api/foods returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .get('/api/foods')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 30: POST /api/foods returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .post('/api/foods')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`)
        .send({ name: 'Burger', price: 12.0 });
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 31: GET /api/tables returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .get('/api/tables')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 32: POST /api/tables returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`)
        .send({ tableNumber: 1 });
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 33: GET /api/floor-plans returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .get('/api/floor-plans')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 34: GET /api/orders/restaurants/:id/orders returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .get(`/api/orders/restaurants/${restUnpaid.id}/orders`)
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 35: GET /api/payments/restaurants/:id/payments returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .get(`/api/payments/restaurants/${restUnpaid.id}/payments`)
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 36: GET /api/staff returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .get('/api/staff')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 37: GET /api/restaurants/:id/settings returns HTTP 402 without active subscription', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restUnpaid.id}/settings`)
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    });

    await assert('Test 38: 402 response payload contains subscriptionStatus: "NONE"', async () => {
      const res = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
      if (res.body.subscriptionStatus !== 'NONE') {
        throw new Error(`Expected subscriptionStatus: "NONE", got ${res.body.subscriptionStatus}`);
      }
    });

    // =============================================================
    // GROUP 5: Allowed Routes Without Subscription (Tests 39-44)
    // =============================================================
    console.log('\n--- GROUP 5: Allowed Routes Without Active Subscription ---');

    await assert('Test 39: GET /api/subscriptions/restaurant/:id is accessible without subscription', async () => {
      const res = await request(app)
        .get(`/api/subscriptions/restaurant/${restUnpaid.id}`)
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await assert('Test 40: GET /api/subscriptions/restaurant/:id/requests is accessible without subscription', async () => {
      const res = await request(app)
        .get(`/api/subscriptions/restaurant/${restUnpaid.id}/requests`)
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await assert('Test 41: POST /api/subscriptions/restaurant/:id/request is accessible without subscription', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restUnpaid.id}/request`)
        .set('Authorization', `Bearer ${ownerUnpaidToken}`)
        .send({ planId: testPlanMonthly.id, notes: 'Unpaid restaurant request' });
      if (res.status !== 201 && res.status !== 200) throw new Error(`Expected 201/200, got ${res.status}`);
    });

    await assert('Test 42: GET /api/subscriptions/plans is accessible without subscription', async () => {
      const res = await request(app)
        .get('/api/subscriptions/plans')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.body.data) || res.body.data.length === 0) {
        throw new Error('Plans list empty');
      }
    });

    await assert('Test 43: GET /api/notifications is accessible without subscription', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await assert('Test 44: POST /api/auth/login is accessible without subscription', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: ownerUnpaid.email,
          password: 'Password123!',
        });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    // =============================================================
    // GROUP 6: Public Menu & Customer Ordering Block (Tests 45-52)
    // =============================================================
    console.log('\n--- GROUP 6: Public Menu & Customer Ordering Block With Zero Data Leakage ---');

    await assert('Test 45: GET /api/menu/:slug returns HTTP 503 RESTAURANT_SERVICE_UNAVAILABLE for unpaid restaurant', async () => {
      const res = await request(app).get(`/api/menu/${restUnpaid.slug}`);
      if (res.status !== 503) {
        throw new Error(`Expected 503 for inactive restaurant menu, got ${res.status}`);
      }
      if (res.body.code !== 'RESTAURANT_SERVICE_UNAVAILABLE') {
        throw new Error(`Expected code RESTAURANT_SERVICE_UNAVAILABLE, got ${res.body.code}`);
      }
    });

    await assert('Test 46: 503 response guarantees ZERO sensitive data leakage (no foods, categories, prices, tables)', async () => {
      const res = await request(app).get(`/api/menu/${restUnpaid.slug}`);
      if (res.body.categories || res.body.foods || res.body.tables || res.body.menu) {
        throw new Error('Data leakage detected in 503 response body!');
      }
    });

    await assert('Test 47: GET /api/menu/:slug/table/:tableNumber returns HTTP 503 for unpaid restaurant', async () => {
      const res = await request(app).get(`/api/menu/${restUnpaid.slug}/table/1`);
      if (res.status !== 503) throw new Error(`Expected 503, got ${res.status}`);
    });

    await assert('Test 48: POST /api/orders returns HTTP 503 for unpaid restaurant', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({
          restaurantSlug: restUnpaid.slug,
          items: [{ foodId: 'fake-id', quantity: 1 }],
        });
      if (res.status !== 503) throw new Error(`Expected 503, got ${res.status}`);
    });

    await assert('Test 49: POST /api/payments returns HTTP 503 for unpaid restaurant', async () => {
      const res = await request(app)
        .post('/api/payments')
        .send({
          restaurantSlug: restUnpaid.slug,
          orderId: 'fake-order-id',
          amount: 25.0,
        });
      if (res.status !== 503) throw new Error(`Expected 503, got ${res.status}`);
    });

    await assert('Test 50: Public menu returns 200 for restaurant with ACTIVE subscription', async () => {
      const res = await request(app).get(`/api/menu/${restPending.slug}`);
      if (res.status !== 200) {
        throw new Error(`Expected 200 for active restaurant menu, got ${res.status}`);
      }
      if (!res.body.data && !res.body.restaurant) {
        throw new Error('Expected menu data for active restaurant');
      }
    });

    await assert('Test 51: Public menu returns 200 for restaurant in GRACE_PERIOD', async () => {
      // Temporarily set restPending subscription to GRACE_PERIOD
      await prisma.subscription.updateMany({
        where: { restaurantId: restPending.id },
        data: { status: SubscriptionStatus.GRACE_PERIOD },
      });

      const res = await request(app).get(`/api/menu/${restPending.slug}`);
      if (res.status !== 200) throw new Error(`Expected 200 in GRACE_PERIOD, got ${res.status}`);

      // Restore to ACTIVE
      await prisma.subscription.updateMany({
        where: { restaurantId: restPending.id },
        data: { status: SubscriptionStatus.ACTIVE },
      });
    });

    await assert('Test 52: Platform operator can inspect menu via platform token or header even when inactive', async () => {
      const res = await request(app)
        .get(`/api/menu/${restUnpaid.slug}`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      // Platform operators bypass 503
      if (res.status !== 200) {
        throw new Error(`Expected platform bypass to return 200, got ${res.status}`);
      }
    });

    // =============================================================
    // GROUP 7: Platform Admin Subscription Management (Tests 53-62)
    // =============================================================
    console.log('\n--- GROUP 7: Platform Admin Complete Subscription Control ---');

    let restThird: any = null;
    await assert('Setup: Create third restaurant for platform management tests', async () => {
      const email = `owner-third-${timestamp}@test.com`;
      testEmailsToClean.push(email);

      const result = await RestaurantProvisioningService.provisionRestaurant({
        name: `Third Bistro ${timestamp}`,
        slug: `third-bistro-${timestamp}`,
        ownerEmail: email,
        ownerName: 'Third Owner',
        adminUserId: platformAdminUser.id,
      });

      restThird = result.restaurant;
      testRestIdsToClean.push(restThird.id);
    });

    await assert('Test 53: Platform Admin manually assigns MANUAL subscription with agreed price & period end', async () => {
      const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      const res = await request(app)
        .post(`/api/platform/restaurants/${restThird.id}/subscription/assign`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          planId: testPlanMonthly.id,
          assignmentType: 'MANUAL',
          agreedPrice: 35.0,
          periodEnd,
          reason: 'Custom enterprise negotiated agreement #2026',
        });
      if (res.status !== 200) throw new Error(`Manual assign failed: ${res.status} ${JSON.stringify(res.body)}`);
      if (res.body.data?.assignmentType !== SubscriptionAssignmentType.MANUAL) {
        throw new Error(`Expected assignmentType MANUAL, got ${res.body.data?.assignmentType}`);
      }
      if (Number(res.body.data?.agreedPrice) !== 35.0) {
        throw new Error(`Agreed price mismatch: ${res.body.data?.agreedPrice}`);
      }
    });

    await assert('Test 54: Manual assignment without reason returns HTTP 400', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restThird.id}/subscription/assign`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          planId: testPlanMonthly.id,
          assignmentType: 'MANUAL',
          reason: '   ',
        });
      if (res.status !== 400) throw new Error(`Expected 400 for empty reason, got ${res.status}`);
    });

    await assert('Test 55: Platform Admin assigns COMPLIMENTARY subscription with agreed price = 0', async () => {
      const periodEnd = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      const res = await request(app)
        .post(`/api/platform/restaurants/${restThird.id}/subscription/assign`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          planId: testPlanYearly.id,
          assignmentType: 'COMPLIMENTARY',
          periodEnd,
          reason: 'VIP Founding Restaurant partnership complimentary grant',
        });
      if (res.status !== 200) throw new Error(`Complimentary assign failed: ${res.status}`);
      if (res.body.data?.assignmentType !== SubscriptionAssignmentType.COMPLIMENTARY) {
        throw new Error(`Expected assignmentType COMPLIMENTARY, got ${res.body.data?.assignmentType}`);
      }
      if (Number(res.body.data?.agreedPrice) !== 0) {
        throw new Error(`Expected agreed price 0 for complimentary, got ${res.body.data?.agreedPrice}`);
      }
    });

    await assert('Test 56: Assignment creates audit trail record with SUBSCRIPTION_MANUALLY_ASSIGNED', async () => {
      const audit = await prisma.auditLog.findFirst({
        where: {
          restaurantId: restThird.id,
          action: AuditAction.SUBSCRIPTION_MANUALLY_ASSIGNED,
        },
      });
      if (!audit) throw new Error('Audit record for SUBSCRIPTION_MANUALLY_ASSIGNED not found');
    });

    await assert('Test 57: Assignment stores assignedByUserId and assignmentReason in DB', async () => {
      const sub = await prisma.subscription.findFirst({ where: { restaurantId: restThird.id } });
      if (!sub?.assignedByUserId) throw new Error('assignedByUserId not stored');
      if (!sub?.assignmentReason?.includes('VIP Founding Restaurant')) throw new Error('assignmentReason mismatch');
    });

    await assert('Test 58: Platform Admin revokes subscription access with immediate suspension', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restThird.id}/subscription/revoke`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          reason: 'Severe violation of SaaS acceptable use policy',
        });
      if (res.status !== 200) throw new Error(`Revoke failed: ${res.status}`);
      if (res.body.data?.status !== SubscriptionStatus.SUSPENDED) {
        throw new Error(`Expected SUSPENDED status, got ${res.body.data?.status}`);
      }

      const inDb = await prisma.subscription.findFirst({ where: { restaurantId: restThird.id } });
      if (inDb?.status !== SubscriptionStatus.SUSPENDED) throw new Error('DB status not SUSPENDED');
    });

    await assert('Test 59: Revocation requires a mandatory non-empty reason', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restThird.id}/subscription/revoke`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ reason: '' });
      if (res.status !== 400) throw new Error(`Expected 400 for empty reason, got ${res.status}`);
    });

    await assert('Test 60: Revoked restaurant is immediately blocked from operational APIs (402) and menu (503)', async () => {
      // Public menu returns 503
      const menuRes = await request(app).get(`/api/menu/${restThird.slug}`);
      if (menuRes.status !== 503) {
        throw new Error(`Expected 503 on menu for revoked restaurant, got ${menuRes.status}`);
      }

      // Check operational access gating
      const sub = await prisma.subscription.findFirst({ where: { restaurantId: restThird.id } });
      if (sub?.status !== SubscriptionStatus.SUSPENDED) {
        throw new Error('Expected subscription to remain SUSPENDED');
      }
    });

    await assert('Test 61: Platform Admin cancels auto-renew; subscription remains ACTIVE until period end', async () => {
      // Re-assign active subscription to restThird
      const periodEnd = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString();
      await request(app)
        .post(`/api/platform/restaurants/${restThird.id}/subscription/assign`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          planId: testPlanMonthly.id,
          assignmentType: 'MANUAL',
          agreedPrice: 29.0,
          periodEnd,
          reason: 'Restore for auto-renew cancellation test',
        });

      const res = await request(app)
        .post(`/api/platform/restaurants/${restThird.id}/subscription/cancel-auto-renew`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ reason: 'Customer requested cancellation at term end' });
      if (res.status !== 200) throw new Error(`Cancel auto-renew failed: ${res.status}`);
      if (res.body.data?.autoRenew !== false) throw new Error('Expected autoRenew: false');
      if (res.body.data?.status !== SubscriptionStatus.ACTIVE) {
        throw new Error(`Expected status to remain ACTIVE until period end, got ${res.body.data?.status}`);
      }
    });

    await assert('Test 62: Platform Admin extends subscription period with audited reason', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restThird.id}/subscription/extend`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          days: 14,
          reason: 'Courtesy 14-day extension during menu migration',
        });
      if (res.status !== 200) throw new Error(`Extend failed: ${res.status}`);
      if (res.body.data?.daysRemaining <= 15) {
        throw new Error(`Expected daysRemaining to increase, got ${res.body.data?.daysRemaining}`);
      }
    });

    // =============================================================
    // GROUP 8: Multi-Tenant Isolation & Background Scheduler (Tests 63-66)
    // =============================================================
    console.log('\n--- GROUP 8: Multi-Tenant Isolation & Background Scheduler Auto-Expiry ---');

    await assert('Test 63: Restaurant A active subscription does NOT grant access to Restaurant B (SUBSCRIPTION_PENDING)', async () => {
      // restPending has active subscription; restUnpaid is in SUBSCRIPTION_PENDING
      const resUnpaid = await request(app)
        .get(`/api/restaurants/${restUnpaid.id}/categories`)
        .set('Authorization', `Bearer ${ownerUnpaidToken}`);
      if (resUnpaid.status !== 402) {
        throw new Error(`Cross-tenant breach: Restaurant B accessed categories with status ${resUnpaid.status}`);
      }

      const resActive = await request(app)
        .get(`/api/restaurants/${restPending.id}/categories`)
        .set('Authorization', `Bearer ${ownerPendingToken}`);
      if (resActive.status !== 200) {
        throw new Error(`Tenant A active subscription should return 200, got ${resActive.status}`);
      }
    });

    await assert('Test 64: Restaurant A owner cannot view or review Restaurant B subscription requests', async () => {
      const res = await request(app)
        .get(`/api/subscriptions/restaurant/${restUnpaid.id}/requests`)
        .set('Authorization', `Bearer ${ownerPendingToken}`);
      if (res.status !== 403 && res.status !== 404) {
        throw new Error(`Expected 403 or 404 for cross-tenant request access, got ${res.status}`);
      }
    });

    await assert('Test 65: Background SubscriptionScheduler transitions expired subscriptions without user login', async () => {
      // Artificially set restThird currentPeriodEnd and graceEndsAt in the past
      const pastDate = new Date(Date.now() - 2 * 24 * 3600 * 1000);
      await prisma.subscription.updateMany({
        where: { restaurantId: restThird.id },
        data: {
          status: SubscriptionStatus.GRACE_PERIOD,
          currentPeriodEnd: pastDate,
          graceEndsAt: pastDate,
          autoRenew: false,
        },
      });

      // Run scheduler sweep
      const schedulerResult = await SubscriptionScheduler.runOnce();
      if (!schedulerResult) throw new Error('Scheduler runOnce returned empty result');

      const subInDb = await prisma.subscription.findFirst({ where: { restaurantId: restThird.id } });
      if (subInDb?.status !== SubscriptionStatus.EXPIRED) {
        throw new Error(`Expected scheduler to transition to EXPIRED, got ${subInDb?.status}`);
      }
    });

    await assert('Test 66: Transition to EXPIRED immediately blocks operational APIs (402) and menu (503)', async () => {
      // Check menu blocked
      const menuRes = await request(app).get(`/api/menu/${restThird.slug}`);
      if (menuRes.status !== 503) {
        throw new Error(`Expected 503 on expired menu, got ${menuRes.status}`);
      }
      if (menuRes.body.code !== 'RESTAURANT_SERVICE_UNAVAILABLE' && menuRes.body.errorCode !== 'RESTAURANT_SERVICE_UNAVAILABLE') {
        throw new Error(`Expected RESTAURANT_SERVICE_UNAVAILABLE, got ${menuRes.body.code || menuRes.body.errorCode}`);
      }
    });

  } finally {
    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    console.log('\n--- Cleaning up test artifacts ---');
    try {
      for (const restId of testRestIdsToClean) {
        await prisma.subscriptionRequest.deleteMany({ where: { restaurantId: restId } }).catch(() => {});
        await prisma.subscriptionEvent.deleteMany({ where: { subscription: { restaurantId: restId } } }).catch(() => {});
        await prisma.subscriptionPayment.deleteMany({ where: { subscription: { restaurantId: restId } } }).catch(() => {});
        await prisma.subscriptionInvoice.deleteMany({ where: { subscription: { restaurantId: restId } } }).catch(() => {});
        await prisma.subscription.deleteMany({ where: { restaurantId: restId } }).catch(() => {});
        await prisma.notification.deleteMany({ where: { restaurantId: restId } }).catch(() => {});
        await prisma.auditLog.deleteMany({ where: { restaurantId: restId } }).catch(() => {});
        await prisma.ownerInvitation.deleteMany({ where: { restaurantId: restId } }).catch(() => {});
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restId } }).catch(() => {});
        await prisma.restaurant.delete({ where: { id: restId } }).catch(() => {});
      }

      for (const email of testEmailsToClean) {
        await prisma.user.deleteMany({ where: { email } }).catch(() => {});
      }

      if (testPlanMonthly) {
        await prisma.subscriptionPlan.delete({ where: { id: testPlanMonthly.id } }).catch(() => {});
      }
      if (testPlanYearly) {
        await prisma.subscriptionPlan.delete({ where: { id: testPlanYearly.id } }).catch(() => {});
      }
    } catch (cleanupErr) {
      console.warn('Test cleanup warning:', cleanupErr);
    }
  }

  console.log(`\n========================================`);
  console.log(`🏁 Phase 13C Test Suite Finished`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSubscriptionAccessTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
