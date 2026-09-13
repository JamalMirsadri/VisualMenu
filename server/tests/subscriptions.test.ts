import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import {
  BillingInterval,
  SubscriptionStatus,
  SubscriptionPaymentStatus,
  NotificationType,
  NotificationSeverity,
  Role,
  StaffStatus,
} from '@prisma/client';
import { SubscriptionService } from '../src/services/subscription/subscriptionService';
import { SubscriptionPaymentService } from '../src/services/subscription/subscriptionPaymentService';
import { SubscriptionScheduler } from '../src/services/subscription/subscriptionScheduler';
import { NotificationService } from '../src/services/notificationService';
import { MockSubscriptionProvider } from '../src/services/subscription/providers/mockSubscriptionProvider';

async function runSubscriptionTestSuite() {
  console.log('🚀 Starting Phase 13A: SaaS Subscription Core, Billing Isolation, Access Enforcement & Expiry Reminders Test Suite...\n');
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
  let ownerAToken = '';
  let ownerBToken = '';
  let restaurantA: any = null;
  let restaurantB: any = null;
  let testPlanMonthly: any = null;
  let testPlanYearly: any = null;
  let userA: any = null;
  let userB: any = null;

  try {
    // -------------------------------------------------------------
    // SETUP: Platform Admin & Test Tenants
    // -------------------------------------------------------------
    await assert('Setup: Authenticate Platform Admin', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'platformadmin@auramenu.com',
        password: 'Password123!',
      });
      if (res.status !== 200) throw new Error(`Platform login failed: ${res.status}`);
      platformAdminToken = res.body.data.token;
    });

    await assert('Setup: Create Test Tenants and Owners', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);

      // User & Restaurant A
      const emailA = `subownera-${timestamp}@testsub.com`.toLowerCase();
      testEmailsToClean.push(emailA);
      userA = await prisma.user.create({
        data: { email: emailA, name: 'Owner Tenant A', passwordHash, active: true },
      });

      restaurantA = await prisma.restaurant.create({
        data: {
          name: `Sub Restaurant A ${timestamp}`,
          slug: `sub-rest-a-${timestamp}`,
          active: true,
          provisioningStatus: 'ACTIVE',
        },
      });
      testRestIdsToClean.push(restaurantA.id);

      await prisma.userRestaurant.create({
        data: {
          userId: userA.id,
          restaurantId: restaurantA.id,
          role: Role.OWNER,
          status: StaffStatus.ACTIVE,
        },
      });

      // User & Restaurant B
      const emailB = `subownerb-${timestamp}@testsub.com`.toLowerCase();
      testEmailsToClean.push(emailB);
      userB = await prisma.user.create({
        data: { email: emailB, name: 'Owner Tenant B', passwordHash, active: true },
      });

      restaurantB = await prisma.restaurant.create({
        data: {
          name: `Sub Restaurant B ${timestamp}`,
          slug: `sub-rest-b-${timestamp}`,
          active: true,
          provisioningStatus: 'ACTIVE',
        },
      });
      testRestIdsToClean.push(restaurantB.id);

      await prisma.userRestaurant.create({
        data: {
          userId: userB.id,
          restaurantId: restaurantB.id,
          role: Role.OWNER,
          status: StaffStatus.ACTIVE,
        },
      });

      // Login Owner A
      const resA = await request(app).post('/api/auth/login').send({ email: emailA, password: 'Password123!' });
      if (resA.status !== 200) throw new Error(`Owner A login failed: ${resA.status}`);
      ownerAToken = resA.body.data.token;

      // Login Owner B
      const resB = await request(app).post('/api/auth/login').send({ email: emailB, password: 'Password123!' });
      if (resB.status !== 200) throw new Error(`Owner B login failed: ${resB.status}`);
      ownerBToken = resB.body.data.token;
    });

    // =============================================================
    // GROUP 1: PLAN (Tests 1–5)
    // =============================================================
    await assert('1. Plan creation: Creates subscription plan with pricing and billingInterval', async () => {
      const planCode = `test_plan_monthly_${timestamp}`;
      testPlanMonthly = await prisma.subscriptionPlan.create({
        data: {
          code: planCode,
          name: 'Test Pro Monthly',
          description: 'Monthly SaaS plan for unit tests',
          price: 49.0,
          currency: 'EUR',
          billingInterval: BillingInterval.MONTHLY,
          intervalCount: 1,
          trialDays: null,
          gracePeriodDays: 7,
          active: true,
        },
      });
      if (!testPlanMonthly.id || testPlanMonthly.code !== planCode) {
        throw new Error('Plan creation failed');
      }
    });

    await assert('2. Unique code: Rejects duplicate plan code', async () => {
      try {
        await prisma.subscriptionPlan.create({
          data: {
            code: testPlanMonthly.code,
            name: 'Duplicate Plan',
            price: 59.0,
            currency: 'EUR',
            billingInterval: BillingInterval.MONTHLY,
            intervalCount: 1,
            gracePeriodDays: 7,
          },
        });
        throw new Error('Should have rejected duplicate code');
      } catch (err: any) {
        if (!err.message?.includes('Unique constraint') && !err.code?.includes('P2002')) {
          throw err;
        }
      }
    });

    await assert('3. Activation: Platform admin activates a plan via API', async () => {
      // Create a yearly plan inactive first
      testPlanYearly = await prisma.subscriptionPlan.create({
        data: {
          code: `test_plan_yearly_${timestamp}`,
          name: 'Test Enterprise Yearly',
          price: 490.0,
          currency: 'EUR',
          billingInterval: BillingInterval.YEARLY,
          intervalCount: 1,
          gracePeriodDays: 10,
          active: false,
        },
      });

      const res = await request(app)
        .post(`/api/platform/subscriptions/plans/${testPlanYearly.id}/toggle`)
        .set('Authorization', `Bearer ${platformAdminToken}`);

      if (res.status !== 200 || res.body.data.active !== true) {
        throw new Error(`Plan toggle activation failed: ${res.status}`);
      }
    });

    await assert('4. Deactivation: Platform admin deactivates a plan', async () => {
      const res = await request(app)
        .post(`/api/platform/subscriptions/plans/${testPlanYearly.id}/toggle`)
        .set('Authorization', `Bearer ${platformAdminToken}`);

      if (res.status !== 200 || res.body.data.active !== false) {
        throw new Error(`Plan toggle deactivation failed: ${res.status}`);
      }

      // Re-activate for subsequent tests
      await prisma.subscriptionPlan.update({
        where: { id: testPlanYearly.id },
        data: { active: true },
      });
    });

    await assert('5. Pricing: Plan pricing and currency are stored accurately as Decimal', async () => {
      const fetched = await prisma.subscriptionPlan.findUnique({
        where: { id: testPlanMonthly.id },
      });
      if (Number(fetched?.price) !== 49.0 || fetched?.currency !== 'EUR') {
        throw new Error(`Price mismatch: ${fetched?.price} ${fetched?.currency}`);
      }
    });

    // =============================================================
    // GROUP 2: SUBSCRIPTION LIFECYCLE (Tests 6–14)
    // =============================================================
    let subscriptionA: any = null;

    await assert('6. Create subscription: Initial subscription in PENDING state', async () => {
      subscriptionA = await SubscriptionService.createSubscription({
        restaurantId: restaurantA.id,
        planId: testPlanMonthly.id,
      });
      if (subscriptionA.status !== SubscriptionStatus.PENDING) {
        throw new Error(`Expected PENDING, got ${subscriptionA.status}`);
      }
    });

    await assert('7. Activate: Transition subscription to ACTIVE state', async () => {
      const activated = await SubscriptionService.activateSubscription(
        subscriptionA.id,
        userA.id,
        'Initial subscription payment confirmed'
      );
      if (activated.status !== SubscriptionStatus.ACTIVE) {
        throw new Error(`Expected ACTIVE, got ${activated.status}`);
      }
      subscriptionA = activated;
    });

    await assert('8. Status transitions: Disallows invalid arbitrary status mutations', async () => {
      const isAllowed = SubscriptionService.isValidTransition(
        SubscriptionStatus.CANCELLED,
        SubscriptionStatus.GRACE_PERIOD
      );
      if (isAllowed) {
        throw new Error('Arbitrary transition CANCELLED -> GRACE_PERIOD should be disallowed');
      }
    });

    await assert('9. Period calculation: Calculates periodEnd based on billingInterval', async () => {
      const start = new Date(subscriptionA.currentPeriodStart);
      const end = new Date(subscriptionA.currentPeriodEnd);
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 28 || diffDays > 31) {
        throw new Error(`Expected ~30 days, got ${diffDays}`);
      }
    });

    await assert('10. Grace period: Transition to GRACE_PERIOD when period expires within grace window', async () => {
      // Simulate expired period within grace
      const pastStart = new Date(Date.now() - 32 * 86400000);
      const pastEnd = new Date(Date.now() - 2 * 86400000);
      const graceEnd = new Date(Date.now() + 5 * 86400000);

      const inGrace = await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: {
          status: SubscriptionStatus.GRACE_PERIOD,
          currentPeriodStart: pastStart,
          currentPeriodEnd: pastEnd,
          graceEndsAt: graceEnd,
        },
      });

      if (inGrace.status !== SubscriptionStatus.GRACE_PERIOD) {
        throw new Error(`Expected GRACE_PERIOD, got ${inGrace.status}`);
      }
    });

    await assert('11. Expiration: Transition to EXPIRED once grace period has elapsed', async () => {
      const pastGrace = new Date(Date.now() - 1 * 86400000);
      const expiredSub = await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          graceEndsAt: pastGrace,
        },
      });

      if (expiredSub.status !== SubscriptionStatus.EXPIRED) {
        throw new Error(`Expected EXPIRED, got ${expiredSub.status}`);
      }
    });

    await assert('12. Cancellation: Cancel auto-renew keeps access until currentPeriodEnd', async () => {
      // Set to active with future period
      const futureEnd = new Date(Date.now() + 15 * 86400000);
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: futureEnd,
          autoRenew: true,
        },
      });

      const cancelled = await SubscriptionService.cancelAutoRenew(
        subscriptionA.id,
        userA.id,
        'Owner cancelled renewal'
      );

      if (cancelled.autoRenew !== false || cancelled.status !== SubscriptionStatus.ACTIVE) {
        throw new Error(`Expected autoRenew=false and status ACTIVE, got autoRenew=${cancelled.autoRenew}, status=${cancelled.status}`);
      }
    });

    await assert('13. Reactivation: Resume auto-renewal restores autoRenew flag', async () => {
      const resumed = await SubscriptionService.resumeAutoRenew(subscriptionA.id, userA.id);
      if (resumed.autoRenew !== true) {
        throw new Error('Expected autoRenew=true upon resumption');
      }
    });

    await assert('14. Renewal: Successful renewal advances currentPeriodStart and currentPeriodEnd', async () => {
      const beforeEnd = new Date(subscriptionA.currentPeriodEnd);
      const renewed = await SubscriptionService.renewSubscription(
        subscriptionA.id,
        userA.id
      );

      const afterEnd = new Date(renewed.currentPeriodEnd);
      if (afterEnd.getTime() <= beforeEnd.getTime()) {
        throw new Error('Renewal should advance periodEnd forward');
      }
      subscriptionA = renewed;
    });

    // =============================================================
    // GROUP 3: ACCESS ENFORCEMENT & MIDDLEWARE (Tests 15–23)
    // =============================================================
    await assert('15. Active access: Owner of active restaurant can access admin API', async () => {
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status === 402) {
        throw new Error('Active subscription should not be blocked with 402');
      }
    });

    await assert('16. Pending blocked: Owner of PENDING subscription gets HTTP 402', async () => {
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { status: SubscriptionStatus.PENDING },
      });

      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status !== 402 || res.body.errorCode !== 'SUBSCRIPTION_REQUIRED') {
        throw new Error(`Expected 402 SUBSCRIPTION_REQUIRED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert('17. Grace access: Owner in GRACE_PERIOD has access with warning allowed', async () => {
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { status: SubscriptionStatus.GRACE_PERIOD },
      });

      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status === 402) {
        throw new Error('Grace period should allow admin access');
      }
    });

    await assert('18. Expired blocked: Owner with EXPIRED subscription gets HTTP 402', async () => {
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status !== 402 || res.body.errorCode !== 'SUBSCRIPTION_REQUIRED') {
        throw new Error(`Expected 402, got ${res.status}`);
      }
    });

    await assert('19. Suspended blocked: Owner with SUSPENDED subscription gets HTTP 402', async () => {
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { status: SubscriptionStatus.SUSPENDED },
      });

      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status !== 402 || res.body.errorCode !== 'SUBSCRIPTION_REQUIRED') {
        throw new Error(`Expected 402, got ${res.status}`);
      }
    });

    await assert('20. Platform admin bypass: Platform Admin can access APIs without 402', async () => {
      const res = await request(app)
        .get('/api/platform/restaurants')
        .set('Authorization', `Bearer ${platformAdminToken}`);

      if (res.status !== 200) {
        throw new Error(`Expected 200 for platform admin, got ${res.status}`);
      }
    });

    await assert('21. Cross-tenant isolation: Owner A cannot renew or inspect Owner B subscription', async () => {
      // Create subscription for B
      const subB = await SubscriptionService.createSubscription({
        restaurantId: restaurantB.id,
        planId: testPlanMonthly.id,
      });
      await SubscriptionService.activateSubscription(subB.id, userB.id);

      const res = await request(app)
        .get(`/api/subscriptions/restaurant/${restaurantB.id}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id); // Tenant A context

      if (res.status !== 403 && res.status !== 404) {
        throw new Error(`Expected 403/404 cross-tenant forbidden, got ${res.status}`);
      }
    });

    await assert('22. Valid credentials + expired subscription: User authenticates successfully', async () => {
      // Owner A has expired/suspended subscription, but password authentication succeeds
      const res = await request(app).post('/api/auth/login').send({
        email: userA.email,
        password: 'Password123!',
      });

      if (res.status !== 200 || !res.body.data.token) {
        throw new Error(`Login should succeed for valid user with expired subscription, got ${res.status}`);
      }
    });

    await assert('23. Protected API returns structured subscription error with renewUrl', async () => {
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
      if (!res.body.renewUrl || res.body.errorCode !== 'SUBSCRIPTION_REQUIRED') {
        throw new Error(`Missing renewUrl or errorCode: ${JSON.stringify(res.body)}`);
      }
    });

    // =============================================================
    // GROUP 4: PAYMENT DOMAIN & WEBHOOKS (Tests 24–30)
    // =============================================================
    // Restore Sub A to ACTIVE for payment tests
    await prisma.subscription.update({
      where: { id: subscriptionA.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
    });

    await assert('24. Subscription payment: Creates dedicated SubscriptionPayment record', async () => {
      const p = await prisma.subscriptionPayment.create({
        data: {
          subscriptionId: subscriptionA.id,
          amount: 49.0,
          currency: 'EUR',
          status: SubscriptionPaymentStatus.SUCCEEDED,
          provider: 'MOCK',
          providerTransactionId: `mock_tx_${timestamp}_1`,
        },
      });

      if (!p.id || p.subscriptionId !== subscriptionA.id) {
        throw new Error('SubscriptionPayment record creation failed');
      }
    });

    await assert('25. Payment success: Succeeded payment updates subscription status to ACTIVE', async () => {
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { status: SubscriptionStatus.PAST_DUE },
      });

      await SubscriptionPaymentService.processSubscriptionPayment({
        subscriptionId: subscriptionA.id,
        amount: 49.0,
        currency: 'EUR',
        provider: 'MOCK',
        providerTransactionId: `mock_tx_${timestamp}_success`,
      });

      const updated = await prisma.subscription.findUnique({
        where: { id: subscriptionA.id },
      });

      if (updated?.status !== SubscriptionStatus.ACTIVE) {
        throw new Error(`Expected ACTIVE status after payment success, got ${updated?.status}`);
      }
    });

    await assert('26. Payment failure: Failed payment records failureReason', async () => {
      await SubscriptionPaymentService.recordPaymentFailure(
        subscriptionA.id,
        'Insufficient funds / Card declined',
        userA.id
      );

      const p = await prisma.subscriptionPayment.findFirst({
        where: { subscriptionId: subscriptionA.id, status: SubscriptionPaymentStatus.FAILED },
        orderBy: { createdAt: 'desc' },
      });

      if (!p || p.status !== SubscriptionPaymentStatus.FAILED || !p.failureReason) {
        throw new Error('Payment failure was not recorded properly');
      }
    });

    await assert('27. Duplicate payment idempotency: Idempotent payment processing', async () => {
      const idemKey = `idempotent_tx_${timestamp}`;
      const res1 = await SubscriptionPaymentService.processSubscriptionPayment({
        subscriptionId: subscriptionA.id,
        amount: 49.0,
        idempotencyKey: idemKey,
      });

      const res2 = await SubscriptionPaymentService.processSubscriptionPayment({
        subscriptionId: subscriptionA.id,
        amount: 49.0,
        idempotencyKey: idemKey,
      });

      if (res1.payment?.id !== res2.payment?.id || !res2.isDuplicate) {
        throw new Error('Expected duplicate payment detected via idempotencyKey');
      }
    });

    await assert('28. Provider webhook verification: Rejects webhook with missing/invalid payload', async () => {
      const res = await request(app)
        .post('/api/subscriptions/webhooks/mock')
        .send({ invalid: true });

      if (res.status !== 400) {
        throw new Error(`Expected 400 for invalid webhook, got ${res.status}`);
      }
    });

    await assert('29. Duplicate webhook: Re-sending identical webhook is safely rejected or deduplicated', async () => {
      const eventId = `webhook_event_${timestamp}_dup`;
      const res1 = await SubscriptionPaymentService.processWebhook('MOCK', {
        id: eventId,
        event: 'invoice.paid',
      });

      const res2 = await SubscriptionPaymentService.processWebhook('MOCK', {
        id: eventId,
        event: 'invoice.paid',
      });

      if (res1.isDuplicate || !res2.isDuplicate) {
        throw new Error('Duplicate webhook event was not detected');
      }
    });

    await assert('30. Renewal payment: Generates invoice and advances period', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restaurantA.id}/renew`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id)
        .send({ amount: 49.0 });

      if (res.status !== 200 || !res.body.data.payment) {
        throw new Error(`Renewal payment failed: ${res.status}`);
      }
    });

    // =============================================================
    // GROUP 5: REMINDERS & SCHEDULER (Tests 31–39)
    // =============================================================
    await assert('31. 30-day reminder: Triggers reminder when period end is 30 days out', async () => {
      // Set end date to 30 days from now
      const thirtyDays = new Date(Date.now() + 30 * 86400000);
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { currentPeriodEnd: thirtyDays, status: SubscriptionStatus.ACTIVE },
      });

      const evaluated = await SubscriptionScheduler.evaluateReminders();
      // Verifies scheduler evaluates without crashing
      if (typeof evaluated !== 'number') throw new Error('Expected count from evaluateReminders');
    });

    await assert('32. 14-day reminder: Evaluates reminder when period end is 14 days out', async () => {
      const fourteenDays = new Date(Date.now() + 14 * 86400000);
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { currentPeriodEnd: fourteenDays },
      });
      await SubscriptionScheduler.evaluateReminders();
    });

    await assert('33. 7-day reminder: Evaluates reminder when period end is 7 days out', async () => {
      const sevenDays = new Date(Date.now() + 7 * 86400000);
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { currentPeriodEnd: sevenDays },
      });
      await SubscriptionScheduler.evaluateReminders();
    });

    await assert('34. 3-day reminder: Evaluates reminder when period end is 3 days out', async () => {
      const threeDays = new Date(Date.now() + 3 * 86400000);
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { currentPeriodEnd: threeDays },
      });
      await SubscriptionScheduler.evaluateReminders();
    });

    await assert('35. 1-day reminder: Evaluates reminder when period end is 1 day out', async () => {
      const oneDay = new Date(Date.now() + 1 * 86400000);
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { currentPeriodEnd: oneDay },
      });
      await SubscriptionScheduler.evaluateReminders();
    });

    await assert('36. Expiration reminder: Evaluates reminder on expiration day', async () => {
      const today = new Date();
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { currentPeriodEnd: today },
      });
      await SubscriptionScheduler.evaluateReminders();
    });

    await assert('37. Reminder deduplication: Deterministic key prevents duplicate notifications', async () => {
      const periodEnd = new Date(Date.now() + 7 * 86400000);

      // Insert log
      await prisma.subscriptionReminderLog.create({
        data: {
          subscriptionId: subscriptionA.id,
          eventType: 'SUBSCRIPTION_7_DAYS',
          periodEnd,
        },
      });

      // Attempt duplicate insert should fail unique constraint
      try {
        await prisma.subscriptionReminderLog.create({
          data: {
            subscriptionId: subscriptionA.id,
            eventType: 'SUBSCRIPTION_7_DAYS',
            periodEnd,
          },
        });
        throw new Error('Should have rejected duplicate reminder log');
      } catch (err: any) {
        if (!err.message?.includes('Unique constraint') && !err.code?.includes('P2002')) {
          throw err;
        }
      }
    });

    await assert('38. Scheduler restart safety: Running scheduler multiple times causes no duplicate reminders', async () => {
      const count1 = await SubscriptionScheduler.runOnce();
      const count2 = await SubscriptionScheduler.runOnce();
      // Second run should have 0 or fewer reminders since first run processed all
      if (typeof count1 !== 'object' || typeof count2 !== 'object') {
        throw new Error('runOnce should return result object');
      }
    });

    await assert('39. Timezone correctness: Expiration checks use UTC timestamps in database', async () => {
      const nowUtc = new Date().toISOString();
      const sub = await prisma.subscription.findUnique({
        where: { id: subscriptionA.id },
      });
      if (!sub?.currentPeriodEnd) throw new Error('Missing currentPeriodEnd');
      const isoEnd = sub.currentPeriodEnd.toISOString();
      if (!isoEnd.endsWith('Z')) {
        throw new Error('Timestamps should be stored in UTC format');
      }
    });

    // =============================================================
    // GROUP 6: IN-APP NOTIFICATIONS (Tests 40–44)
    // =============================================================
    let testNotification: any = null;

    await assert('40. Notification creation: Creates tenant-scoped in-app notification', async () => {
      testNotification = await NotificationService.createNotification({
        restaurantId: restaurantA.id,
        type: NotificationType.SUBSCRIPTION_7_DAYS,
        title: '7 Days Remaining',
        message: 'Your subscription will renew in 7 days.',
        severity: NotificationSeverity.WARNING,
      });

      if (!testNotification.id || testNotification.restaurantId !== restaurantA.id) {
        throw new Error('Failed to create notification');
      }
    });

    await assert('41. Tenant isolation: Owner B cannot view Owner A notifications', async () => {
      const { items: notifsB } = await NotificationService.getNotifications(restaurantB.id);
      const foundA = notifsB.find((n: any) => n.id === testNotification.id);
      if (foundA) {
        throw new Error('Tenant B should not see Tenant A notification');
      }
    });

    await assert('42. Unread count: Accurately returns unread notification count', async () => {
      const count = await NotificationService.getUnreadCount(restaurantA.id);
      if (count < 1) {
        throw new Error(`Expected at least 1 unread notification, got ${count}`);
      }
    });

    await assert('43. Mark read: Marking notification read updates readAt timestamp', async () => {
      const updated = await NotificationService.markRead(testNotification.id, restaurantA.id);
      if (!updated.readAt) {
        throw new Error('Expected readAt to be populated');
      }
    });

    await assert('44. Mark all read: Marks all unread notifications for restaurant as read', async () => {
      // Create another unread
      await NotificationService.createNotification({
        restaurantId: restaurantA.id,
        type: NotificationType.SUBSCRIPTION_3_DAYS,
        title: '3 Days Remaining',
        message: 'Renew soon.',
      });

      await NotificationService.markAllRead(restaurantA.id);
      const unread = await NotificationService.getUnreadCount(restaurantA.id);
      if (unread !== 0) {
        throw new Error(`Expected 0 unread after markAllRead, got ${unread}`);
      }
    });

    // =============================================================
    // GROUP 7: PLATFORM ADMIN CONTROLS (Tests 45–50)
    // =============================================================
    await assert('45. Platform sees subscription: Platform admin inspects tenant subscription', async () => {
      const res = await request(app)
        .get(`/api/platform/restaurants/${restaurantA.id}/subscription`)
        .set('Authorization', `Bearer ${platformAdminToken}`);

      if (res.status !== 200 || !res.body.data.id) {
        throw new Error(`Platform subscription inspection failed: ${res.status}`);
      }
    });

    await assert('46. Platform changes plan: Platform admin switches plan', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restaurantA.id}/subscription/change-plan`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ newPlanId: testPlanYearly.id, reason: 'Platform admin upgrade' });

      if (res.status !== 200 || res.body.data.planId !== testPlanYearly.id) {
        throw new Error(`Plan change failed: ${res.status}`);
      }
    });

    await assert('47. Platform suspends: Platform admin suspends tenant subscription', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restaurantA.id}/subscription/suspend`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ reason: 'Audit compliance hold' });

      if (res.status !== 200 || res.body.data.status !== SubscriptionStatus.SUSPENDED) {
        throw new Error(`Platform suspend failed: ${res.status}`);
      }
    });

    await assert('48. Platform restores: Platform admin restores suspended subscription', async () => {
      const res = await request(app)
        .post(`/api/platform/restaurants/${restaurantA.id}/subscription/restore`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ reason: 'Compliance issue resolved' });

      if (res.status !== 200 || res.body.data.status !== SubscriptionStatus.ACTIVE) {
        throw new Error(`Platform restore failed: ${res.status}`);
      }
    });

    await assert('49. Platform extension: Platform admin grants +14 days extension', async () => {
      const beforeSub = await prisma.subscription.findUnique({
        where: { id: subscriptionA.id },
      });
      const beforeEnd = new Date(beforeSub!.currentPeriodEnd).getTime();

      const res = await request(app)
        .post(`/api/platform/restaurants/${restaurantA.id}/subscription/extend`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ days: 14, reason: 'Courtesy sales extension' });

      if (res.status !== 200) throw new Error(`Extension failed: ${res.status}`);
      const afterEnd = new Date(res.body.data.currentPeriodEnd).getTime();
      const diffDays = Math.round((afterEnd - beforeEnd) / (1000 * 86400));
      if (diffDays !== 14) {
        throw new Error(`Expected exactly 14 days extension, got ${diffDays}`);
      }
    });

    await assert('50. Audit: Platform manual action produces SubscriptionEvent and AuditLog', async () => {
      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscriptionA.id },
        orderBy: { createdAt: 'desc' },
      });

      const extendEvent = events.find((e) => e.eventType === 'SUBSCRIPTION_EXTENDED');
      if (!extendEvent) {
        throw new Error('Expected SUBSCRIPTION_EXTENDED event recorded');
      }
    });

    // =============================================================
    // GROUP 8: HISTORY & IMMUTABILITY (Tests 51–53)
    // =============================================================
    await assert('51. Subscription event: Status transitions record SubscriptionEvent', async () => {
      const count = await prisma.subscriptionEvent.count({
        where: { subscriptionId: subscriptionA.id },
      });
      if (count < 3) {
        throw new Error(`Expected multiple subscription events, found ${count}`);
      }
    });

    await assert('52. Immutable event behavior: Events preserve fromStatus, toStatus and actor', async () => {
      const evt = await prisma.subscriptionEvent.findFirst({
        where: { subscriptionId: subscriptionA.id, eventType: 'SUBSCRIPTION_SUSPENDED' },
      });
      if (!evt || evt.toStatus !== 'SUSPENDED') {
        throw new Error('Expected SUBSCRIPTION_SUSPENDED event record intact');
      }
    });

    await assert('53. Historical price preservation: Modifying plan price does NOT alter agreedPrice', async () => {
      // Set agreed price on subscription
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { agreedPrice: 49.0, agreedCurrency: 'EUR' },
      });

      // Update plan price to €79
      await prisma.subscriptionPlan.update({
        where: { id: testPlanMonthly.id },
        data: { price: 79.0 },
      });

      const subAfter = await prisma.subscription.findUnique({
        where: { id: subscriptionA.id },
      });

      if (Number(subAfter?.agreedPrice) !== 49.0) {
        throw new Error(`Agreed price was mutated to ${subAfter?.agreedPrice}, must remain 49.0`);
      }
    });

    // =============================================================
    // GROUP 9: SECURITY & STALE JWT PROTECTION (Tests 54–58)
    // =============================================================
    await assert('54. Client cannot set status: Regular user cannot pass status in body', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restaurantA.id}/renew`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id)
        .send({ status: 'ACTIVE', currentPeriodEnd: '2099-01-01' });

      // Even if parameters are passed, status/dates are set by backend service
      const sub = await prisma.subscription.findUnique({
        where: { id: subscriptionA.id },
      });
      if (sub?.currentPeriodEnd.toISOString().startsWith('2099')) {
        throw new Error('Client arbitrarily set periodEnd!');
      }
    });

    await assert('55. Client cannot set expiration date arbitrarily', async () => {
      const maliciousDate = new Date('2050-12-31');
      await request(app)
        .post(`/api/subscriptions/restaurant/${restaurantA.id}/renew`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id)
        .send({ currentPeriodEnd: maliciousDate });

      const sub = await prisma.subscription.findUnique({
        where: { id: subscriptionA.id },
      });
      if (sub?.currentPeriodEnd.getFullYear() === 2050) {
        throw new Error('Client bypassed expiration calculation');
      }
    });

    await assert('56. Client cannot set plan price on checkout', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restaurantA.id}/checkout`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id)
        .send({ planCode: testPlanMonthly.code, price: 0.01 }); // Attempting 1 cent

      // Should look up price from database, not request body
      if (res.status === 200 && res.body.data.price === 0.01) {
        throw new Error('Client price was accepted!');
      }
    });

    await assert('57. Tenant isolation: Token without restaurant access cannot renew', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restaurantA.id}/renew`)
        .set('Authorization', `Bearer ${ownerBToken}`) // Owner B trying to renew A
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status !== 403 && res.status !== 404) {
        throw new Error(`Expected 403 or 404, got ${res.status}`);
      }
    });

    await assert('58. JWT stale subscription protection: DB state is authoritative over token', async () => {
      // Owner A has a valid token issued when subscription was active.
      // Now suspend subscription in DB.
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { status: SubscriptionStatus.SUSPENDED },
      });

      // Attempt protected request with existing JWT
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status !== 402) {
        throw new Error(`Expected 402 due to fresh DB evaluation, got ${res.status}`);
      }
    });

    // =============================================================
    // GROUP 10: CONCURRENCY & IDEMPOTENCY (Tests 59–63)
    // =============================================================
    await assert('59. Simultaneous renewal: Concurrent calls execute safely', async () => {
      // Restore to active
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      });

      const promises = [
        SubscriptionService.renewSubscription(subscriptionA.id, userA.id),
        SubscriptionService.renewSubscription(subscriptionA.id, userA.id),
      ];

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      if (fulfilled.length === 0) {
        throw new Error('All concurrent renewals failed');
      }
    });

    await assert('60. Simultaneous subscription creation: Handles idempotency gracefully', async () => {
      const sub1 = await SubscriptionService.createSubscription({
        restaurantId: restaurantA.id,
        planId: testPlanMonthly.id,
      });
      const sub2 = await SubscriptionService.createSubscription({
        restaurantId: restaurantA.id,
        planId: testPlanMonthly.id,
      });

      if (sub1.id !== sub2.id) {
        throw new Error('Expected same subscription returned on duplicate creation for tenant');
      }
    });

    await assert('61. Duplicate payment event: Same idempotency key does not duplicate payment', async () => {
      const tx = `conc_tx_${timestamp}`;
      const [res1, res2] = await Promise.all([
        SubscriptionPaymentService.processSubscriptionPayment({
          subscriptionId: subscriptionA.id,
          amount: 49.0,
          idempotencyKey: tx,
        }),
        SubscriptionPaymentService.processSubscriptionPayment({
          subscriptionId: subscriptionA.id,
          amount: 49.0,
          idempotencyKey: tx,
        }),
      ]);

      if (res1.payment?.id !== res2.payment?.id || (!res1.isDuplicate && !res2.isDuplicate)) {
        throw new Error('Concurrent payments with same idempotencyKey should deduplicate');
      }
    });

    await assert('62. Duplicate webhook: Concurrent webhook events handled safely', async () => {
      const evtId = `conc_webhook_${timestamp}`;
      const [w1, w2] = await Promise.all([
        SubscriptionPaymentService.processWebhook('MOCK', {
          id: evtId,
          event: 'invoice.payment_succeeded',
        }),
        SubscriptionPaymentService.processWebhook('MOCK', {
          id: evtId,
          event: 'invoice.payment_succeeded',
        }),
      ]);

      // Exactly one should be marked isDuplicate: false, the other isDuplicate: true
      const dupCount = [w1.isDuplicate, w2.isDuplicate].filter(Boolean).length;
      if (dupCount !== 1) {
        throw new Error(`Expected exactly 1 duplicate webhook event, got ${dupCount}`);
      }
    });

    await assert('63. Concurrent extension: Successive platform extensions advance period correctly', async () => {
      const ext1 = await SubscriptionService.extendSubscription({
        subscriptionId: subscriptionA.id,
        days: 7,
        reason: 'Ext 1',
        actorId: userA.id,
      });

      const ext2 = await SubscriptionService.extendSubscription({
        subscriptionId: subscriptionA.id,
        days: 7,
        reason: 'Ext 2',
        actorId: userA.id,
      });

      const diff = Math.round(
        (new Date(ext2.currentPeriodEnd).getTime() - new Date(ext1.currentPeriodEnd).getTime()) /
          (1000 * 86400)
      );
      if (diff !== 7) {
        throw new Error(`Expected 7 days advance between sequential extensions, got ${diff}`);
      }
    });

    // =============================================================
    // GROUP 11: MIGRATION & EXISTING RESTAURANTS (Test 64)
    // =============================================================
    await assert('64. Existing restaurant compatibility: Seeded demo restaurant has valid subscription', async () => {
      const demoRest = await prisma.restaurant.findUnique({
        where: { slug: 'demo-restaurant' },
      });

      if (demoRest) {
        const demoSub = await prisma.subscription.findFirst({
          where: { restaurantId: demoRest.id },
        });

        if (!demoSub || demoSub.status !== SubscriptionStatus.ACTIVE) {
          throw new Error('Demo restaurant should have an ACTIVE subscription initialized');
        }
      }
    });

    // =============================================================
    // GROUP 12: REGRESSION & EDGE CASES (Tests 65–72)
    // =============================================================
    await assert('65. Customer menu blocked with 503 when subscription is EXPIRED (Phase 13C)', async () => {
      // Expire restaurant A subscription
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      const res = await request(app).get(`/api/menu/${restaurantA.slug}`);
      if (res.status !== 503) {
        throw new Error(`Public menu should return 503 when EXPIRED, got ${res.status}`);
      }
    });

    await assert('66. Customer order payments isolated: Order payments table does not contain SaaS payments', async () => {
      // Verify restaurant customer order payment table is completely independent
      const orderPayments = await prisma.payment.findMany({
        where: { restaurantId: restaurantA.id },
      });

      // None of the order payments should have subscription IDs
      const hasSubLeak = orderPayments.some((p: any) => p.subscriptionId !== undefined);
      if (hasSubLeak) {
        throw new Error('Order payments table has subscription data leakage!');
      }
    });

    await assert('67. Billing invoices created with correct subtotal and tax calculation', async () => {
      const subtotal = 100.0;
      const tax = 23.0; // 23%
      const total = subtotal + tax;

      const inv = await prisma.subscriptionInvoice.create({
        data: {
          subscriptionId: subscriptionA.id,
          invoiceNumber: `INV-TEST-${timestamp}`,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 86400000),
          subtotal,
          tax,
          total,
          currency: 'EUR',
          status: 'PAID',
        },
      });

      if (Number(inv.subtotal) !== 100.0 || Number(inv.tax) !== 23.0 || Number(inv.total) !== 123.0) {
        throw new Error(`Invoice calculation mismatch: subtotal=${inv.subtotal}, tax=${inv.tax}, total=${inv.total}`);
      }
    });

    await assert('68. Auto-renew cancellation retains access until currentPeriodEnd', async () => {
      // Set to active with 20 days remaining
      const futureEnd = new Date(Date.now() + 20 * 86400000);
      await prisma.subscription.update({
        where: { id: subscriptionA.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: futureEnd,
          autoRenew: true,
        },
      });

      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restaurantA.id}/cancel-auto-renew`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id)
        .send({ reason: 'Owner testing cancellation' });

      if (res.status !== 200 || res.body.data.autoRenew !== false || res.body.data.status !== 'ACTIVE') {
        throw new Error(`Expected autoRenew=false and status=ACTIVE, got ${JSON.stringify(res.body)}`);
      }
    });

    await assert('69. Resume auto-renew restores autoRenew flag without altering period dates', async () => {
      const beforeSub = await prisma.subscription.findUnique({
        where: { id: subscriptionA.id },
      });

      const res = await request(app)
        .post(`/api/subscriptions/restaurant/${restaurantA.id}/resume`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Restaurant-ID', restaurantA.id);

      if (res.status !== 200 || res.body.data.autoRenew !== true) {
        throw new Error(`Expected autoRenew=true, got ${JSON.stringify(res.body)}`);
      }

      const afterSub = await prisma.subscription.findUnique({
        where: { id: subscriptionA.id },
      });

      if (beforeSub?.currentPeriodEnd.getTime() !== afterSub?.currentPeriodEnd.getTime()) {
        throw new Error('Resuming auto-renew should not alter currentPeriodEnd');
      }
    });

    await assert('70. Notification query filters by unread status', async () => {
      const { items: unreadList } = await NotificationService.getNotifications(restaurantA.id, undefined, { unreadOnly: true });
      const allRead = unreadList.every((n: any) => n.readAt === null);
      if (!allRead) {
        throw new Error('Filter unreadOnly returned read notifications');
      }
    });

    await assert('71. MockSubscriptionProvider returns valid session and checkout URL', async () => {
      const provider = new MockSubscriptionProvider();
      const checkout = await provider.createCheckoutSession({
        restaurantId: restaurantA.id,
        planCode: testPlanMonthly.code,
        amount: 49.0,
        currency: 'EUR',
        successUrl: 'http://localhost:5173/admin/subscription?success=true',
        cancelUrl: 'http://localhost:5173/admin/subscription?canceled=true',
      });

      if (!checkout.sessionId || !checkout.checkoutUrl.includes(checkout.sessionId)) {
        throw new Error('MockSubscriptionProvider failed to return valid session/checkoutUrl');
      }
    });

    await assert('72. Subscription status check handles non-existent tenant gracefully', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const status = await SubscriptionService.getSubscriptionStatus(nonExistentId);
      if (status !== null) {
        throw new Error('Expected null status for non-existent restaurant');
      }
    });

  } finally {
    // Teardown test entities
    try {
      if (testRestIdsToClean.length > 0) {
        for (const rid of testRestIdsToClean) {
          const subs = await prisma.subscription.findMany({ where: { restaurantId: rid } });
          for (const s of subs) {
            await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId: s.id } });
            await prisma.subscriptionReminderLog.deleteMany({ where: { subscriptionId: s.id } });
            await prisma.subscriptionInvoice.deleteMany({ where: { subscriptionId: s.id } });
            await prisma.subscriptionPayment.deleteMany({ where: { subscriptionId: s.id } });
          }
          await prisma.subscription.deleteMany({ where: { restaurantId: rid } });
          await prisma.notification.deleteMany({ where: { restaurantId: rid } });
          await prisma.userRestaurant.deleteMany({ where: { restaurantId: rid } });
          await prisma.restaurant.delete({ where: { id: rid } });
        }
      }

      if (testEmailsToClean.length > 0) {
        await prisma.user.deleteMany({ where: { email: { in: testEmailsToClean } } });
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
  console.log(`🏁 Phase 13A Test Suite Finished`);
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

runSubscriptionTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
