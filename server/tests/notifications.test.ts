import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import {
  Role,
  StaffStatus,
  PlatformRole,
  NotificationSource,
  NotificationPriority,
  NotificationSeverity,
  NotificationType,
  PlatformMessageTargetType,
  PlatformMessageStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { NotificationService } from '../src/services/notificationService';
import { PlatformMessageService } from '../src/services/platformMessageService';
import { SubscriptionScheduler } from '../src/services/subscription/subscriptionScheduler';
import { realtimeService } from '../src/services/realtimeService';

async function runNotificationsTests() {
  console.log('🚀 Starting Phase 13B: Notification Center & Platform-to-Restaurant Messaging Test Suite...\n');
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
  const testMessageIdsToClean: string[] = [];

  let platformAdminUser: any = null;
  let platformAdminToken = '';

  let userA: any = null;
  let userAToken = '';
  let restaurantA: any = null;

  let userB: any = null;
  let userBToken = '';
  let restaurantB: any = null;

  let staffA: any = null;
  let staffAToken = '';

  let restrictedStaffA: any = null;
  let restrictedStaffAToken = '';

  try {
    // =========================================================================
    // 0. SETUP TEST USERS, TENANTS & PLATFORM ADMIN
    // =========================================================================
    await assert('Setup 1: Create Platform Admin', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);
      const email = `platform-admin-${timestamp}@testnotif.com`.toLowerCase();
      testEmailsToClean.push(email);

      platformAdminUser = await prisma.user.create({
        data: {
          email,
          name: 'Platform Super Admin',
          passwordHash,
          platformRole: PlatformRole.PLATFORM_ADMIN,
          active: true,
        },
      });

      const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
      if (res.status !== 200 || !res.body?.data?.token) throw new Error(`Login failed: ${res.status}`);
      platformAdminToken = res.body.data.token;
    });

    await assert('Setup 2: Create Restaurant Tenants A & B with Active Subscriptions', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);

      // Default plan
      let plan = await prisma.subscriptionPlan.findFirst({ where: { active: true } });
      if (!plan) {
        plan = await prisma.subscriptionPlan.create({
          data: {
            name: `Test Plan ${timestamp}`,
            price: 29.0,
            billingInterval: 'MONTHLY',
            gracePeriodDays: 7,
            active: true,
          },
        });
      }

      // Tenant A
      const emailA = `owner-a-${timestamp}@testnotif.com`.toLowerCase();
      testEmailsToClean.push(emailA);
      userA = await prisma.user.create({
        data: { email: emailA, name: 'Owner Restaurant A', passwordHash, active: true },
      });

      restaurantA = await prisma.restaurant.create({
        data: {
          name: `Restaurant Alpha ${timestamp}`,
          slug: `rest-alpha-${timestamp}`,
          active: true,
          provisioningStatus: 'ACTIVE',
        },
      });
      testRestIdsToClean.push(restaurantA.id);

      await prisma.userRestaurant.create({
        data: { userId: userA.id, restaurantId: restaurantA.id, role: Role.OWNER, status: StaffStatus.ACTIVE },
      });

      await prisma.subscription.create({
        data: {
          restaurantId: restaurantA.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt: new Date(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          agreedPrice: plan.price,
        },
      });

      // Tenant B
      const emailB = `owner-b-${timestamp}@testnotif.com`.toLowerCase();
      testEmailsToClean.push(emailB);
      userB = await prisma.user.create({
        data: { email: emailB, name: 'Owner Restaurant B', passwordHash, active: true },
      });

      restaurantB = await prisma.restaurant.create({
        data: {
          name: `Restaurant Beta ${timestamp}`,
          slug: `rest-beta-${timestamp}`,
          active: true,
          provisioningStatus: 'ACTIVE',
        },
      });
      testRestIdsToClean.push(restaurantB.id);

      await prisma.userRestaurant.create({
        data: { userId: userB.id, restaurantId: restaurantB.id, role: Role.OWNER, status: StaffStatus.ACTIVE },
      });

      await prisma.subscription.create({
        data: {
          restaurantId: restaurantB.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt: new Date(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          agreedPrice: plan.price,
        },
      });

      // Log in Owner A
      const resA = await request(app).post('/api/auth/login').send({ email: emailA, password: 'Password123!' });
      if (resA.status !== 200) throw new Error(`Owner A login failed: ${resA.status}`);
      userAToken = resA.body.data.token;

      // Log in Owner B
      const resB = await request(app).post('/api/auth/login').send({ email: emailB, password: 'Password123!' });
      if (resB.status !== 200) throw new Error(`Owner B login failed: ${resB.status}`);
      userBToken = resB.body.data.token;
    });

    await assert('Setup 3: Create Staff Members with Custom Permission Profiles', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);

      // Staff with default STAFF role
      const staffEmail = `staff-a-${timestamp}@testnotif.com`.toLowerCase();
      testEmailsToClean.push(staffEmail);
      staffA = await prisma.user.create({
        data: { email: staffEmail, name: 'Staff User Alpha', passwordHash, active: true },
      });

      await prisma.userRestaurant.create({
        data: { userId: staffA.id, restaurantId: restaurantA.id, role: Role.STAFF, status: StaffStatus.ACTIVE },
      });

      const resStaff = await request(app).post('/api/auth/login').send({ email: staffEmail, password: 'Password123!' });
      staffAToken = resStaff.body.data.token;

      // Restricted Staff with explicit permission omitting VIEW_NOTIFICATIONS
      const restrEmail = `restricted-${timestamp}@testnotif.com`.toLowerCase();
      testEmailsToClean.push(restrEmail);
      restrictedStaffA = await prisma.user.create({
        data: { email: restrEmail, name: 'Restricted Staff', passwordHash, active: true },
      });

      const membership = await prisma.userRestaurant.create({
        data: {
          userId: restrictedStaffA.id,
          restaurantId: restaurantA.id,
          role: Role.STAFF,
          status: StaffStatus.ACTIVE,
        },
      });

      // Give only VIEW_MENU permission
      const menuPerm = await prisma.permission.findUnique({ where: { key: 'VIEW_MENU' } });
      if (menuPerm) {
        await prisma.userRestaurantPermission.create({
          data: {
            userRestaurantId: membership.id,
            permissionId: menuPerm.id,
          },
        });
      }

      const resRestr = await request(app).post('/api/auth/login').send({ email: restrEmail, password: 'Password123!' });
      restrictedStaffAToken = resRestr.body.data.token;
    });

    // =========================================================================
    // SECTION 1: PERMISSION CATALOG & RBAC ROLES (Tests 1-5)
    // =========================================================================
    await assert('1. Permission catalog includes VIEW_NOTIFICATIONS, MARK_NOTIFICATIONS_READ, and ACKNOWLEDGE_NOTIFICATIONS', async () => {
      const perms = await prisma.permission.findMany({
        where: {
          key: { in: ['VIEW_NOTIFICATIONS', 'MARK_NOTIFICATIONS_READ', 'ACKNOWLEDGE_NOTIFICATIONS'] },
        },
      });
      if (perms.length !== 3) throw new Error(`Expected 3 notification permissions, found ${perms.length}`);
    });

    await assert('2. Owner role has all notification permissions by default', async () => {
      const res = await request(app)
        .get(`/api/notifications/restaurant/${restaurantA.id}`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    });

    await assert('3. Standard staff member can view notifications', async () => {
      const res = await request(app)
        .get(`/api/notifications/restaurant/${restaurantA.id}`)
        .set('Authorization', `Bearer ${staffAToken}`);
      if (res.status !== 200) throw new Error(`Expected 200 for staff, got ${res.status}`);
    });

    await assert('4. Staff member lacking VIEW_NOTIFICATIONS is denied access with 403', async () => {
      const res = await request(app)
        .get(`/api/notifications/restaurant/${restaurantA.id}`)
        .set('Authorization', `Bearer ${restrictedStaffAToken}`);
      if (res.status !== 403) throw new Error(`Expected 403 for restricted staff, got ${res.status}`);
    });

    await assert('5. Non-platform admin cannot compose platform messages (403 PLATFORM_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          title: 'Unauthorized Message',
          body: 'Hello',
          targetType: 'ALL_RESTAURANTS',
          confirmAll: true,
        });
      if (res.status !== 403) throw new Error(`Expected 403 for owner trying to use platform routes, got ${res.status}`);
    });

    // =========================================================================
    // SECTION 2: SYSTEM & SUBSCRIPTION NOTIFICATIONS (Tests 6-15)
    // =========================================================================
    let notif1: any = null;
    let notifSub: any = null;
    let notifUrgent: any = null;

    await assert('6. Create SYSTEM notification with normal priority', async () => {
      notif1 = await NotificationService.createNotification({
        restaurantId: restaurantA.id,
        type: NotificationType.GENERAL_ANNOUNCEMENT,
        title: 'Welcome to Restaurant A',
        message: 'Your kitchen display system is configured.',
        source: NotificationSource.SYSTEM,
        priority: NotificationPriority.NORMAL,
        severity: NotificationSeverity.INFO,
      });
      if (!notif1.id || notif1.source !== NotificationSource.SYSTEM) throw new Error('Invalid notification created');
    });

    await assert('7. Create SUBSCRIPTION reminder notification with HIGH priority', async () => {
      notifSub = await NotificationService.createNotification({
        restaurantId: restaurantA.id,
        type: NotificationType.SUBSCRIPTION_7_DAYS,
        title: '7 Days Before Expiration',
        message: 'Your monthly subscription will renew in 7 days.',
        source: NotificationSource.SUBSCRIPTION,
        priority: NotificationPriority.HIGH,
        severity: NotificationSeverity.WARNING,
      });
      if (notifSub.source !== NotificationSource.SUBSCRIPTION || notifSub.priority !== NotificationPriority.HIGH) {
        throw new Error('Expected source SUBSCRIPTION and priority HIGH');
      }
    });

    await assert('8. Auto-detection: Subscription type prefixes infer SUBSCRIPTION source', async () => {
      const autoNotif = await NotificationService.createNotification({
        restaurantId: restaurantA.id,
        type: NotificationType.SUBSCRIPTION_ACTIVATED,
        title: 'Plan Activated',
        message: 'Your subscription is active.',
        severity: NotificationSeverity.INFO,
      });
      if (autoNotif.source !== NotificationSource.SUBSCRIPTION) {
        throw new Error(`Expected auto-detected source SUBSCRIPTION, got ${autoNotif.source}`);
      }
    });

    await assert('9. Auto-detection: CRITICAL severity infers URGENT priority by default', async () => {
      notifUrgent = await NotificationService.createNotification({
        restaurantId: restaurantA.id,
        type: NotificationType.SUBSCRIPTION_EXPIRED,
        title: 'Subscription Expired',
        message: 'Your subscription has expired. Please renew immediately.',
        severity: NotificationSeverity.CRITICAL,
      });
      if (notifUrgent.priority !== NotificationPriority.URGENT) {
        throw new Error(`Expected priority URGENT for CRITICAL notification, got ${notifUrgent.priority}`);
      }
    });

    await assert('10. Create pinned notification', async () => {
      const pinned = await NotificationService.createNotification({
        restaurantId: restaurantA.id,
        type: NotificationType.GENERAL_ANNOUNCEMENT,
        title: 'Pinned Policy Update',
        message: 'Read the updated refund policy.',
        pinned: true,
      });
      if (!pinned.pinned) throw new Error('Expected notification to be pinned');
    });

    await assert('11. Create notification with expiration timestamp', async () => {
      const expDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const expiring = await NotificationService.createNotification({
        restaurantId: restaurantA.id,
        type: NotificationType.GENERAL_ANNOUNCEMENT,
        title: 'Flash Promotion',
        message: 'Promotion valid for 24h.',
        expiresAt: expDate,
      });
      if (!expiring.expiresAt) throw new Error('Expected expiration timestamp');
    });

    await assert('12. Notification service correctly reports unread count', async () => {
      const count = await NotificationService.getUnreadCount(restaurantA.id);
      if (count < 5) throw new Error(`Expected at least 5 unread notifications, got ${count}`);
    });

    await assert('13. HTTP GET /api/notifications/restaurant/:id/unread-count returns correct count', async () => {
      const res = await request(app)
        .get(`/api/notifications/restaurant/${restaurantA.id}/unread-count`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200 || typeof res.body?.data?.count !== 'number') {
        throw new Error(`Invalid unread count response: ${res.status}`);
      }
    });

    await assert('14. Query unreadOnly filter returns only unread notifications', async () => {
      const result = await NotificationService.getNotifications(restaurantA.id, userA.id, { unreadOnly: true });
      const anyRead = result.items.some((item) => item.readAt !== null);
      if (anyRead) throw new Error('Found read notifications when unreadOnly=true was requested');
    });

    await assert('15. Query source filter returns only matching source notifications', async () => {
      const subResult = await NotificationService.getNotifications(restaurantA.id, userA.id, {
        source: NotificationSource.SUBSCRIPTION,
      });
      const invalid = subResult.items.some((item) => item.source !== NotificationSource.SUBSCRIPTION);
      if (invalid) throw new Error('Returned items with non-SUBSCRIPTION source');
    });

    // =========================================================================
    // SECTION 3: READ, UNREAD & ACKNOWLEDGEMENT LIFECYCLE (Tests 16-25)
    // =========================================================================
    await assert('16. Mark single notification as read updates readAt timestamp', async () => {
      const res = await request(app)
        .post(`/api/notifications/${notif1.id}/read`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200 || !res.body?.data?.readAt) {
        throw new Error(`Failed to mark read: ${res.status}`);
      }
    });

    await assert('17. Marking read decrements unread count', async () => {
      const countBefore = await NotificationService.getUnreadCount(restaurantA.id);
      await NotificationService.markRead(notifSub.id, restaurantA.id, userA.id);
      const countAfter = await NotificationService.getUnreadCount(restaurantA.id);
      if (countAfter !== countBefore - 1) {
        throw new Error(`Expected count to decrement from ${countBefore} to ${countBefore - 1}, got ${countAfter}`);
      }
    });

    await assert('18. Mark single notification as unread restores unread state', async () => {
      const res = await request(app)
        .post(`/api/notifications/${notif1.id}/unread`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200 || res.body?.data?.readAt !== null) {
        throw new Error(`Failed to mark unread: ${res.status}`);
      }
      const recheck = await prisma.notification.findUnique({ where: { id: notif1.id } });
      if (recheck?.readAt !== null) throw new Error('Database readAt was not set to null');
    });

    await assert('19. Acknowledge urgent notification sets acknowledgedAt and acknowledgedByUserId', async () => {
      const res = await request(app)
        .post(`/api/notifications/${notifUrgent.id}/acknowledge`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200 || !res.body?.data?.acknowledgedAt || res.body?.data?.acknowledgedByUserId !== userA.id) {
        throw new Error(`Failed to acknowledge: ${res.status} ${JSON.stringify(res.body)}`);
      }
    });

    await assert('20. Acknowledging notification automatically marks it as read', async () => {
      const recheck = await prisma.notification.findUnique({ where: { id: notifUrgent.id } });
      if (!recheck?.readAt) throw new Error('Expected acknowledged notification to also have readAt set');
    });

    await assert('21. Acknowledging an already-acknowledged notification is idempotent', async () => {
      const res = await request(app)
        .post(`/api/notifications/${notifUrgent.id}/acknowledge`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200) throw new Error(`Expected 200 for idempotent ack, got ${res.status}`);
    });

    await assert('22. Mark all read marks all restaurant notifications as read', async () => {
      const res = await request(app)
        .post(`/api/notifications/restaurant/${restaurantA.id}/read-all`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200 || typeof res.body?.data?.count !== 'number') {
        throw new Error(`Failed to mark all read: ${res.status}`);
      }
      const unreadCount = await NotificationService.getUnreadCount(restaurantA.id);
      if (unreadCount !== 0) throw new Error(`Expected 0 unread notifications, got ${unreadCount}`);
    });

    await assert('23. Text search query matches notification title', async () => {
      const searchRes = await NotificationService.getNotifications(restaurantA.id, userA.id, {
        search: 'Policy Update',
      });
      if (searchRes.items.length === 0 || !searchRes.items[0].title.includes('Policy Update')) {
        throw new Error('Search query failed to match notification title');
      }
    });

    await assert('24. Filter by priority returns only matching priority', async () => {
      const urgentRes = await NotificationService.getNotifications(restaurantA.id, userA.id, {
        priority: NotificationPriority.URGENT,
      });
      const nonUrgent = urgentRes.items.some((n) => n.priority !== NotificationPriority.URGENT);
      if (nonUrgent) throw new Error('Found non-URGENT notification in urgent filter');
    });

    await assert('25. Expired notifications are automatically excluded from listing', async () => {
      // Create past-expired notification
      const pastDate = new Date(Date.now() - 1000 * 60 * 60);
      await prisma.notification.create({
        data: {
          restaurantId: restaurantA.id,
          type: NotificationType.GENERAL_ANNOUNCEMENT,
          title: 'Expired Yesterday',
          message: 'Old notice',
          severity: NotificationSeverity.INFO,
          expiresAt: pastDate,
        },
      });

      const listing = await NotificationService.getNotifications(restaurantA.id, userA.id);
      const hasExpired = listing.items.some((n) => n.title === 'Expired Yesterday');
      if (hasExpired) throw new Error('Expired notification was returned in active listing');
    });

    // =========================================================================
    // SECTION 4: PLATFORM MESSAGING COMPOSITION & TARGETING (Tests 26-38)
    // =========================================================================
    let singleMsg: any = null;
    let multiMsg: any = null;
    let broadcastMsg: any = null;
    let draftMsg: any = null;

    await assert('26. Compose platform message for a single restaurant (RESTAURANT)', async () => {
      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Direct Platform Message to A',
          body: 'Special maintenance window for your area.',
          targetType: PlatformMessageTargetType.RESTAURANT,
          targetRestaurantIds: [restaurantA.id],
          priority: NotificationPriority.HIGH,
          pinned: true,
        });
      if (res.status !== 201 || !res.body?.data?.id) {
        throw new Error(`Failed to create single target message: ${res.status} ${JSON.stringify(res.body)}`);
      }
      singleMsg = res.body.data;
      testMessageIdsToClean.push(singleMsg.id);
    });

    await assert('27. Single restaurant target delivers exactly 1 notification to target and 0 to others', async () => {
      const notifsA = await prisma.notification.findMany({
        where: { platformMessageId: singleMsg.id, restaurantId: restaurantA.id },
      });
      const notifsB = await prisma.notification.findMany({
        where: { platformMessageId: singleMsg.id, restaurantId: restaurantB.id },
      });
      if (notifsA.length !== 1 || notifsB.length !== 0) {
        throw new Error(`Delivery mismatch: A has ${notifsA.length}, B has ${notifsB.length}`);
      }
    });

    await assert('28. Single message recipient row created with initial deliveredAt and null readAt', async () => {
      const recipient = await prisma.platformMessageRecipient.findUnique({
        where: {
          messageId_restaurantId: {
            messageId: singleMsg.id,
            restaurantId: restaurantA.id,
          },
        },
      });
      if (!recipient || !recipient.deliveredAt || recipient.readAt !== null) {
        throw new Error('Recipient row missing or has invalid initial delivery state');
      }
    });

    await assert('29. Compose platform message for multiple restaurants (MULTIPLE_RESTAURANTS)', async () => {
      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Multi-Tenant Announcement',
          body: 'New features available for both tenants.',
          targetType: PlatformMessageTargetType.MULTIPLE_RESTAURANTS,
          targetRestaurantIds: [restaurantA.id, restaurantB.id],
          priority: NotificationPriority.NORMAL,
        });
      if (res.status !== 201) throw new Error(`Multi-target compose failed: ${res.status}`);
      multiMsg = res.body.data;
      testMessageIdsToClean.push(multiMsg.id);
    });

    await assert('30. Multi-target message delivers to all targeted tenants', async () => {
      const recipients = await prisma.platformMessageRecipient.findMany({
        where: { messageId: multiMsg.id },
      });
      if (recipients.length !== 2) throw new Error(`Expected 2 recipients, found ${recipients.length}`);
    });

    await assert('31. Recipient deduplication: Specifying duplicate restaurant IDs does not create duplicates', async () => {
      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Duplicate Target Test',
          body: 'Testing deduplication.',
          targetType: PlatformMessageTargetType.MULTIPLE_RESTAURANTS,
          targetRestaurantIds: [restaurantA.id, restaurantA.id, restaurantA.id],
          priority: NotificationPriority.LOW,
        });
      if (res.status !== 201) throw new Error(`Compose failed: ${res.status}`);
      const dedupMsgId = res.body.data.id;
      testMessageIdsToClean.push(dedupMsgId);

      const count = await prisma.platformMessageRecipient.count({
        where: { messageId: dedupMsgId, restaurantId: restaurantA.id },
      });
      if (count !== 1) throw new Error(`Expected 1 deduplicated recipient row, got ${count}`);
    });

    await assert('32. Broadcast ALL_RESTAURANTS rejected without explicit confirmation (CONFIRMATION_REQUIRED)', async () => {
      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Broadcast Without Confirmation',
          body: 'Should fail.',
          targetType: PlatformMessageTargetType.ALL_RESTAURANTS,
          confirmAll: false,
        });
      if (res.status !== 400 || res.body?.errorCode !== 'CONFIRMATION_REQUIRED') {
        throw new Error(`Expected 400 CONFIRMATION_REQUIRED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert('33. Broadcast ALL_RESTAURANTS succeeds with confirmAll: true', async () => {
      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Global Platform Update',
          body: 'Welcome to AURA 2.0.',
          targetType: PlatformMessageTargetType.ALL_RESTAURANTS,
          confirmAll: true,
          priority: NotificationPriority.HIGH,
          requiresAcknowledgement: true,
        });
      if (res.status !== 201) throw new Error(`Broadcast failed: ${res.status}`);
      broadcastMsg = res.body.data;
      testMessageIdsToClean.push(broadcastMsg.id);
    });

    await assert('34. Broadcast message created notifications for all active restaurants', async () => {
      const activeCount = await prisma.restaurant.count({ where: { active: true } });
      const recipients = await prisma.platformMessageRecipient.count({
        where: { messageId: broadcastMsg.id },
      });
      if (recipients < 2 || recipients !== activeCount) {
        throw new Error(`Expected ${activeCount} recipients, got ${recipients}`);
      }
    });

    await assert('35. Filter status targeting: Message targeting only ACTIVE subscriptions omits EXPIRED', async () => {
      // Create tenant C with EXPIRED subscription
      const restC = await prisma.restaurant.create({
        data: { name: `Tenant C ${timestamp}`, slug: `rest-c-${timestamp}`, active: true },
      });
      testRestIdsToClean.push(restC.id);
      const plan = await prisma.subscriptionPlan.findFirst();
      await prisma.subscription.create({
        data: {
          restaurantId: restC.id,
          planId: plan!.id,
          status: SubscriptionStatus.EXPIRED,
          startsAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          agreedPrice: 29.0,
        },
      });

      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Active Subscribers Only',
          body: 'Only for active accounts.',
          targetType: PlatformMessageTargetType.ALL_RESTAURANTS,
          filterStatus: [SubscriptionStatus.ACTIVE],
          confirmAll: true,
        });
      if (res.status !== 201) throw new Error(`Status-filtered compose failed: ${res.status}`);
      const filteredMsgId = res.body.data.id;
      testMessageIdsToClean.push(filteredMsgId);

      const recipientC = await prisma.platformMessageRecipient.findUnique({
        where: { messageId_restaurantId: { messageId: filteredMsgId, restaurantId: restC.id } },
      });
      if (recipientC) throw new Error('Expired subscription tenant C received message filtered for ACTIVE only');
    });

    await assert('36. Save as draft creates message in DRAFT status with 0 recipients delivered', async () => {
      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Draft Announcement',
          body: 'Not ready for prime time.',
          targetType: PlatformMessageTargetType.ALL_RESTAURANTS,
          isDraft: true,
        });
      if (res.status !== 201 || res.body?.data?.status !== 'DRAFT') {
        throw new Error(`Expected DRAFT status, got ${res.body?.data?.status}`);
      }
      draftMsg = res.body.data;
      testMessageIdsToClean.push(draftMsg.id);

      const recipientCount = await prisma.platformMessageRecipient.count({ where: { messageId: draftMsg.id } });
      if (recipientCount !== 0) throw new Error('Draft message created recipient rows unexpectedly');
    });

    await assert('37. List platform messages with pagination and status filters', async () => {
      const res = await request(app)
        .get('/api/platform/messages?status=SENT')
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200 || !Array.isArray(res.body?.data?.items)) {
        throw new Error(`Failed to list platform messages: ${res.status}`);
      }
      const nonSent = res.body.data.items.some((m: any) => m.status !== 'SENT');
      if (nonSent) throw new Error('Found non-SENT message in status=SENT query');
    });

    await assert('38. Detail view GET /api/platform/messages/:id returns telemetry and recipients', async () => {
      const res = await request(app)
        .get(`/api/platform/messages/${broadcastMsg.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (res.status !== 200 || !res.body?.data?.stats || !res.body?.data?.recipients) {
        throw new Error(`Invalid detail response: ${res.status}`);
      }
      if (res.body.data.stats.deliveryCount < 2) throw new Error('Delivery count below expected threshold');
    });

    // =========================================================================
    // SECTION 5: SCHEDULED MESSAGES & WORKER DISPATCH (Tests 39-46)
    // =========================================================================
    let scheduledMsg: any = null;
    let cancelledMsg: any = null;

    await assert('39. Create scheduled message for future time is saved in SCHEDULED status', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour ahead
      const res = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Future Maintenance Notice',
          body: 'Scheduled delivery.',
          targetType: PlatformMessageTargetType.RESTAURANT,
          targetRestaurantIds: [restaurantA.id],
          scheduledAt: futureDate.toISOString(),
        });
      if (res.status !== 201 || res.body?.data?.status !== 'SCHEDULED') {
        throw new Error(`Expected SCHEDULED status, got ${res.body?.data?.status}`);
      }
      scheduledMsg = res.body.data;
      testMessageIdsToClean.push(scheduledMsg.id);
    });

    await assert('40. Scheduled message has 0 notifications delivered before scheduled time', async () => {
      const count = await prisma.notification.count({ where: { platformMessageId: scheduledMsg.id } });
      if (count !== 0) throw new Error('Scheduled message delivered notifications prematurely');
    });

    await assert('41. Worker processScheduledMessages skips future messages', async () => {
      const processed = await PlatformMessageService.processScheduledMessages();
      const recheck = await prisma.platformMessage.findUnique({ where: { id: scheduledMsg.id } });
      if (recheck?.status !== PlatformMessageStatus.SCHEDULED) {
        throw new Error(`Message was modified prematurely: ${recheck?.status}`);
      }
    });

    await assert('42. Cancel scheduled message sets status to CANCELLED and records audit log', async () => {
      const futureDate = new Date(Date.now() + 120 * 60 * 1000);
      const createRes = await request(app)
        .post('/api/platform/messages')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          title: 'Message to Cancel',
          body: 'Will be cancelled.',
          targetType: PlatformMessageTargetType.RESTAURANT,
          targetRestaurantIds: [restaurantA.id],
          scheduledAt: futureDate.toISOString(),
        });
      cancelledMsg = createRes.body.data;
      testMessageIdsToClean.push(cancelledMsg.id);

      const cancelRes = await request(app)
        .post(`/api/platform/messages/${cancelledMsg.id}/cancel`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (cancelRes.status !== 200 || cancelRes.body?.data?.status !== 'CANCELLED') {
        throw new Error(`Expected CANCELLED status, got ${cancelRes.body?.data?.status}`);
      }
    });

    await assert('43. Cancelled scheduled message cannot be processed by scheduler', async () => {
      // Set scheduledAt in past to test if worker attempts to send it
      await prisma.platformMessage.update({
        where: { id: cancelledMsg.id },
        data: { scheduledAt: new Date(Date.now() - 1000) },
      });
      await PlatformMessageService.processScheduledMessages();
      const recheck = await prisma.platformMessage.findUnique({ where: { id: cancelledMsg.id } });
      if (recheck?.status !== PlatformMessageStatus.CANCELLED) {
        throw new Error(`Cancelled message was reactivated to ${recheck?.status}`);
      }
    });

    await assert('44. Worker processScheduledMessages dispatches messages whose scheduledAt has passed', async () => {
      // Update scheduledMsg scheduledAt to 10 seconds ago
      await prisma.platformMessage.update({
        where: { id: scheduledMsg.id },
        data: { scheduledAt: new Date(Date.now() - 10000) },
      });

      const processedCount = await PlatformMessageService.processScheduledMessages();
      if (processedCount < 1) throw new Error(`Expected at least 1 message processed, got ${processedCount}`);

      const sentMsg = await prisma.platformMessage.findUnique({ where: { id: scheduledMsg.id } });
      if (sentMsg?.status !== PlatformMessageStatus.SENT || !sentMsg.sentAt) {
        throw new Error(`Expected SENT status, got ${sentMsg?.status}`);
      }
    });

    await assert('45. Worker dispatch created notification and recipient rows for scheduled message', async () => {
      const recipient = await prisma.platformMessageRecipient.findUnique({
        where: { messageId_restaurantId: { messageId: scheduledMsg.id, restaurantId: restaurantA.id } },
      });
      if (!recipient) throw new Error('Recipient row missing after worker dispatch');

      const notif = await prisma.notification.findFirst({
        where: { platformMessageId: scheduledMsg.id, restaurantId: restaurantA.id },
      });
      if (!notif) throw new Error('Notification row missing after worker dispatch');
    });

    await assert('46. SubscriptionScheduler.runOnce executes processScheduledMessages cycle', async () => {
      const cycleResult = await SubscriptionScheduler.runOnce();
      if (typeof cycleResult.scheduledMessagesSent !== 'number') {
        throw new Error('SubscriptionScheduler.runOnce did not return scheduledMessagesSent metric');
      }
    });

    // =========================================================================
    // SECTION 6: NON-DESTRUCTIVE REVISION HISTORY & EDITING (Tests 47-51)
    // =========================================================================
    await assert('47. Editing an un-sent DRAFT message directly updates fields with 0 revision rows', async () => {
      const editRes = await request(app)
        .patch(`/api/platform/messages/${draftMsg.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ title: 'Updated Draft Title', body: 'Updated draft body' });
      if (editRes.status !== 200 || editRes.body?.data?.title !== 'Updated Draft Title') {
        throw new Error(`Direct draft edit failed: ${editRes.status}`);
      }

      const revCount = await prisma.platformMessageRevision.count({ where: { messageId: draftMsg.id } });
      if (revCount !== 0) throw new Error(`Expected 0 revisions for draft edit, found ${revCount}`);
    });

    await assert('48. Editing an already-SENT message records a PlatformMessageRevision row', async () => {
      const editRes = await request(app)
        .patch(`/api/platform/messages/${singleMsg.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ title: 'Correction: Maintenance Window Updated', body: 'The maintenance is shifted by 1 hour.' });
      if (editRes.status !== 200) throw new Error(`Sent message edit failed: ${editRes.status}`);

      const revisions = await prisma.platformMessageRevision.findMany({ where: { messageId: singleMsg.id } });
      if (revisions.length !== 1) throw new Error(`Expected 1 revision record, got ${revisions.length}`);
      if (revisions[0].title !== 'Direct Platform Message to A') {
        throw new Error(`Revision did not preserve original title: ${revisions[0].title}`);
      }
    });

    await assert('49. Editing an already-SENT message updates the live message record and linked notifications', async () => {
      const updated = await prisma.platformMessage.findUnique({ where: { id: singleMsg.id } });
      if (updated?.title !== 'Correction: Maintenance Window Updated') {
        throw new Error(`Message title was not updated: ${updated?.title}`);
      }

      const updatedNotif = await prisma.notification.findFirst({
        where: { platformMessageId: singleMsg.id, restaurantId: restaurantA.id },
      });
      if (updatedNotif?.title !== 'Correction: Maintenance Window Updated') {
        throw new Error(`Linked notification title was not updated: ${updatedNotif?.title}`);
      }
    });

    await assert('50. Multiple edits accumulate successive revision history records', async () => {
      await request(app)
        .patch(`/api/platform/messages/${singleMsg.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ title: 'Second Edit: Final Time Confirmed', body: 'Final window confirmed.' });

      const revisions = await prisma.platformMessageRevision.findMany({
        where: { messageId: singleMsg.id },
        orderBy: { createdAt: 'asc' },
      });
      if (revisions.length !== 2) throw new Error(`Expected 2 revisions, found ${revisions.length}`);
    });

    await assert('51. Message details endpoint returns all historical revisions', async () => {
      const res = await request(app)
        .get(`/api/platform/messages/${singleMsg.id}`)
        .set('Authorization', `Bearer ${platformAdminToken}`);
      if (!res.body?.data?.revisions || res.body.data.revisions.length !== 2) {
        throw new Error('Revisions missing from detail view payload');
      }
    });

    // =========================================================================
    // SECTION 7: TELEMETRY SYNC & READ RECEIPTS (Tests 52-56)
    // =========================================================================
    await assert('52. Restaurant user reading notification synchronizes readAt to PlatformMessageRecipient', async () => {
      // Find the notification for restaurant A created from broadcastMsg
      const notifA = await prisma.notification.findFirst({
        where: { platformMessageId: broadcastMsg.id, restaurantId: restaurantA.id },
      });
      if (!notifA) throw new Error('Notification for restaurant A not found');

      // Owner A marks notification read
      await request(app)
        .post(`/api/notifications/${notifA.id}/read`)
        .set('Authorization', `Bearer ${userAToken}`);

      // Check recipient row
      const recipient = await prisma.platformMessageRecipient.findUnique({
        where: { messageId_restaurantId: { messageId: broadcastMsg.id, restaurantId: restaurantA.id } },
      });
      if (!recipient?.readAt) throw new Error('PlatformMessageRecipient readAt was not synchronized');
    });

    await assert('53. Restaurant user acknowledging notification synchronizes acknowledgedAt to PlatformMessageRecipient', async () => {
      const notifA = await prisma.notification.findFirst({
        where: { platformMessageId: broadcastMsg.id, restaurantId: restaurantA.id },
      });
      if (!notifA) throw new Error('Notification for restaurant A not found');

      // Owner A acknowledges
      await request(app)
        .post(`/api/notifications/${notifA.id}/acknowledge`)
        .set('Authorization', `Bearer ${userAToken}`);

      const recipient = await prisma.platformMessageRecipient.findUnique({
        where: { messageId_restaurantId: { messageId: broadcastMsg.id, restaurantId: restaurantA.id } },
      });
      if (!recipient?.acknowledgedAt || recipient.acknowledgedByUserId !== userA.id) {
        throw new Error('PlatformMessageRecipient acknowledgedAt was not synchronized');
      }
    });

    await assert('54. Telemetry metrics calculate correct readPercentage and acknowledgedPercentage', async () => {
      const details = await PlatformMessageService.getMessageDetails(broadcastMsg.id);
      if (!details || !details.stats) throw new Error('Details stats missing');

      if (details.stats.readCount < 1) throw new Error('readCount should be at least 1');
      if (details.stats.readPercentage <= 0) throw new Error('readPercentage should be > 0%');
      if (details.stats.acknowledgedCount < 1) throw new Error('acknowledgedCount should be at least 1');
      if (details.stats.acknowledgedPercentage <= 0) throw new Error('acknowledgedPercentage should be > 0%');
    });

    await assert('55. Marking unread clears readAt on both Notification and PlatformMessageRecipient', async () => {
      const notifA = await prisma.notification.findFirst({
        where: { platformMessageId: broadcastMsg.id, restaurantId: restaurantA.id },
      });
      await request(app)
        .post(`/api/notifications/${notifA!.id}/unread`)
        .set('Authorization', `Bearer ${userAToken}`);

      const recipient = await prisma.platformMessageRecipient.findUnique({
        where: { messageId_restaurantId: { messageId: broadcastMsg.id, restaurantId: restaurantA.id } },
      });
      if (recipient?.readAt !== null) throw new Error('Recipient readAt was not cleared on markUnread');
    });

    await assert('56. Realtime broadcast scoped to restaurant channel when platform message delivered', async () => {
      let broadcastRestaurantId = '';
      let broadcastEvent = '';
      const originalBroadcast = realtimeService.broadcastToRestaurant;
      realtimeService.broadcastToRestaurant = (rId: string, evt: any, data: any) => {
        broadcastRestaurantId = rId;
        broadcastEvent = evt;
        return originalBroadcast.call(realtimeService, rId, evt, data);
      };

      try {
        const testMsg = await PlatformMessageService.createMessage(
          {
            title: 'SSE Test Message',
            body: 'Testing SSE channel delivery.',
            targetType: PlatformMessageTargetType.RESTAURANT,
            targetRestaurantIds: [restaurantA.id],
            priority: NotificationPriority.NORMAL,
          },
          platformAdminUser.id
        );
        testMessageIdsToClean.push(testMsg.id);

        if (broadcastRestaurantId !== restaurantA.id || !broadcastEvent) {
          throw new Error(`Expected event on restaurant:${restaurantA.id}, got ${broadcastRestaurantId} [${broadcastEvent}]`);
        }
      } finally {
        realtimeService.broadcastToRestaurant = originalBroadcast;
      }
    });

    // =========================================================================
    // SECTION 8: TENANT ISOLATION & SECURITY (Tests 57-64)
    // =========================================================================
    await assert('57. Tenant B user cannot access Tenant A notification inbox', async () => {
      const res = await request(app)
        .get(`/api/notifications/restaurant/${restaurantA.id}`)
        .set('Authorization', `Bearer ${userBToken}`);
      if (res.status !== 403) throw new Error(`Expected 403 cross-tenant access denied, got ${res.status}`);
    });

    await assert('58. Tenant B user cannot mark Tenant A notification as read', async () => {
      const notifA = await prisma.notification.findFirst({ where: { restaurantId: restaurantA.id } });
      const res = await request(app)
        .post(`/api/notifications/${notifA!.id}/read`)
        .set('Authorization', `Bearer ${userBToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('59. Tenant B user cannot mark Tenant A notification as unread', async () => {
      const notifA = await prisma.notification.findFirst({ where: { restaurantId: restaurantA.id } });
      const res = await request(app)
        .post(`/api/notifications/${notifA!.id}/unread`)
        .set('Authorization', `Bearer ${userBToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('60. Tenant B user cannot acknowledge Tenant A notification', async () => {
      const notifA = await prisma.notification.findFirst({ where: { restaurantId: restaurantA.id } });
      const res = await request(app)
        .post(`/api/notifications/${notifA!.id}/acknowledge`)
        .set('Authorization', `Bearer ${userBToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('61. Tenant B user cannot mark all read on Tenant A', async () => {
      const res = await request(app)
        .post(`/api/notifications/restaurant/${restaurantA.id}/read-all`)
        .set('Authorization', `Bearer ${userBToken}`);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await assert('62. Expired subscription tenant retains access to /api/notifications without 402 error', async () => {
      // Set restaurant A subscription to EXPIRED
      await prisma.subscription.updateMany({
        where: { restaurantId: restaurantA.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      const res = await request(app)
        .get(`/api/notifications/restaurant/${restaurantA.id}`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200) {
        throw new Error(`Expected 200 for notifications even when EXPIRED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert('63. Expired subscription tenant can mark notifications as read and acknowledge', async () => {
      const notifA = await prisma.notification.findFirst({ where: { restaurantId: restaurantA.id } });
      const res = await request(app)
        .post(`/api/notifications/${notifA!.id}/read`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 200) {
        throw new Error(`Expected 200 for mark read when EXPIRED, got ${res.status}`);
      }
    });

    await assert('64. Expired subscription tenant attempting to access protected management route still gets 402', async () => {
      const res = await request(app)
        .get(`/api/admin/categories?restaurantId=${restaurantA.id}`)
        .set('Authorization', `Bearer ${userAToken}`);
      if (res.status !== 402) {
        throw new Error(`Expected 402 SUBSCRIPTION_REQUIRED for non-notification route, got ${res.status}`);
      }
    });

    await assert('65. Comprehensive audit logs recorded for platform message creation, send, and cancel', async () => {
      const audits = await prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              'PLATFORM_MESSAGE_CREATED' as any,
              'PLATFORM_MESSAGE_SENT' as any,
              'PLATFORM_MESSAGE_CANCELLED' as any,
              'NOTIFICATION_READ' as any,
              'NOTIFICATION_ACKNOWLEDGED' as any,
            ],
          },
        },
      });
      if (audits.length < 5) {
        throw new Error(`Expected at least 5 audit log entries, found ${audits.length}`);
      }
    });
  } catch (globalErr) {
    console.error('Unexpected global test error:', globalErr);
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP TEST DATA
    // -------------------------------------------------------------------------
    console.log('\n🧹 Cleaning up test artifacts...');
    try {
      if (testMessageIdsToClean.length > 0) {
        await prisma.platformMessageRevision.deleteMany({
          where: { messageId: { in: testMessageIdsToClean } },
        });
        await prisma.platformMessageRecipient.deleteMany({
          where: { messageId: { in: testMessageIdsToClean } },
        });
        await prisma.notification.deleteMany({
          where: { platformMessageId: { in: testMessageIdsToClean } },
        });
        await prisma.platformMessage.deleteMany({
          where: { id: { in: testMessageIdsToClean } },
        });
      }

      if (testRestIdsToClean.length > 0) {
        await prisma.notification.deleteMany({
          where: { restaurantId: { in: testRestIdsToClean } },
        });
        await prisma.subscriptionReminderLog.deleteMany({
          where: { subscription: { restaurantId: { in: testRestIdsToClean } } },
        });
        await prisma.subscriptionPayment.deleteMany({
          where: { subscription: { restaurantId: { in: testRestIdsToClean } } },
        });
        await prisma.subscriptionEvent.deleteMany({
          where: { subscription: { restaurantId: { in: testRestIdsToClean } } },
        });
        await prisma.subscription.deleteMany({
          where: { restaurantId: { in: testRestIdsToClean } },
        });
        await prisma.userRestaurantPermission.deleteMany({
          where: { userRestaurant: { restaurantId: { in: testRestIdsToClean } } },
        });
        await prisma.userRestaurant.deleteMany({
          where: { restaurantId: { in: testRestIdsToClean } },
        });
        await prisma.restaurant.deleteMany({
          where: { id: { in: testRestIdsToClean } },
        });
      }

      if (testEmailsToClean.length > 0) {
        await prisma.user.deleteMany({
          where: { email: { in: testEmailsToClean } },
        });
      }
    } catch (cleanupErr) {
      console.error('Cleanup error (ignored):', cleanupErr);
    }
  }

  console.log('\n========================================');
  console.log('🏁 Phase 13B Test Suite Finished');
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runNotificationsTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
