import { NotificationPriority, NotificationSeverity, NotificationSource, NotificationType, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../prisma';
import { NotificationService } from '../notificationService';
import { PlatformMessageService } from '../platformMessageService';
import { SubscriptionService } from './subscriptionService';

interface ReminderRule {
  daysBefore: number;
  eventType: NotificationType;
  title: string;
  messageTemplate: (days: number, dateStr: string) => string;
  severity: NotificationSeverity;
  priority: NotificationPriority;
}

const REMINDER_RULES: ReminderRule[] = [
  {
    daysBefore: 30,
    eventType: NotificationType.SUBSCRIPTION_30_DAYS,
    title: 'Subscription Renewal Notice (30 Days)',
    messageTemplate: (_days, dateStr) => `Your subscription expires in 30 days on ${dateStr}.`,
    severity: NotificationSeverity.INFO,
    priority: NotificationPriority.LOW,
  },
  {
    daysBefore: 14,
    eventType: NotificationType.SUBSCRIPTION_14_DAYS,
    title: 'Subscription Renewal Notice (14 Days)',
    messageTemplate: (_days, dateStr) => `Your subscription expires in 14 days on ${dateStr}.`,
    severity: NotificationSeverity.INFO,
    priority: NotificationPriority.NORMAL,
  },
  {
    daysBefore: 7,
    eventType: NotificationType.SUBSCRIPTION_7_DAYS,
    title: 'Subscription Renewal Notice (7 Days)',
    messageTemplate: (_days, dateStr) => `Your subscription expires in 7 days on ${dateStr}. Please renew to prevent interruption.`,
    severity: NotificationSeverity.WARNING,
    priority: NotificationPriority.HIGH,
  },
  {
    daysBefore: 3,
    eventType: NotificationType.SUBSCRIPTION_3_DAYS,
    title: 'Subscription Urgent Reminder (3 Days)',
    messageTemplate: (_days, dateStr) => `Your subscription expires in 3 days on ${dateStr}. Renew now to avoid losing admin access.`,
    severity: NotificationSeverity.WARNING,
    priority: NotificationPriority.HIGH,
  },
  {
    daysBefore: 1,
    eventType: NotificationType.SUBSCRIPTION_1_DAY,
    title: 'Subscription Expires Tomorrow',
    messageTemplate: (_days, dateStr) => `Your subscription expires tomorrow on ${dateStr}.`,
    severity: NotificationSeverity.CRITICAL,
    priority: NotificationPriority.URGENT,
  },
];

export class SubscriptionScheduler {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning: boolean = false;

  /**
   * Run a single evaluation cycle (evaluates expiration transitions and sends reminders)
   */
  static async runOnce(): Promise<{
    transitions: { graceCount: number; expiredCount: number };
    remindersSent: number;
    scheduledMessagesSent: number;
  }> {
    if (this.isRunning) {
      return { transitions: { graceCount: 0, expiredCount: 0 }, remindersSent: 0, scheduledMessagesSent: 0 };
    }

    this.isRunning = true;
    try {
      // 1. Process transitions: ACTIVE -> GRACE_PERIOD -> EXPIRED
      const transitions = await SubscriptionService.processExpirationTransitions();

      // 2. Process upcoming reminders
      const remindersSent = await this.processReminders();

      // 3. Process scheduled platform messages
      const scheduledMessagesSent = await PlatformMessageService.processScheduledMessages();

      return { transitions, remindersSent, scheduledMessagesSent };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Alias for evaluating reminders (used in testing and manual triggers)
   */
  static async evaluateReminders(): Promise<number> {
    return this.processReminders();
  }

  /**
   * Process reminder notifications with deduplication
   */
  static async processReminders(): Promise<number> {
    const now = new Date();
    let count = 0;

    // Fetch active or grace period subscriptions
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD] },
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            timezone: true,
          },
        },
      },
    });

    for (const sub of subscriptions) {
      const periodEnd = sub.currentPeriodEnd;
      const diffMs = periodEnd.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Check which reminder rule applies
      for (const rule of REMINDER_RULES) {
        if (diffDays <= rule.daysBefore && diffDays > (rule.daysBefore === 1 ? 0 : rule.daysBefore - 1)) {
          // Attempt to record in SubscriptionReminderLog (atomic deduplication via unique constraint)
          try {
            const alreadySent = await prisma.subscriptionReminderLog.findFirst({
              where: {
                subscriptionId: sub.id,
                eventType: rule.eventType,
                periodEnd: sub.currentPeriodEnd,
              },
            });
            if (alreadySent) continue;

            await prisma.subscriptionReminderLog.create({
              data: {
                subscriptionId: sub.id,
                eventType: rule.eventType,
                periodEnd: sub.currentPeriodEnd,
                sentAt: now,
              },
            });

            // Format date in restaurant timezone
            const tz = sub.restaurant.timezone || 'UTC';
            let dateStr: string;
            try {
              dateStr = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              }).format(periodEnd);
            } catch {
              dateStr = periodEnd.toISOString().split('T')[0];
            }

            // Create notification
            await NotificationService.createNotification({
              restaurantId: sub.restaurantId,
              type: rule.eventType,
              title: rule.title,
              message: rule.messageTemplate(diffDays, dateStr),
              severity: rule.severity,
              source: NotificationSource.SUBSCRIPTION,
              priority: rule.priority,
              metadata: {
                subscriptionId: sub.id,
                currentPeriodEnd: periodEnd.toISOString(),
                daysRemaining: diffDays,
              },
            });

            count++;
          } catch (e: any) {
            // P2002 is Prisma unique constraint violation -> already sent for this billing period!
            if (e.code !== 'P2002') {
              console.error('Error logging reminder:', e);
            }
          }
        }
      }
    }

    return count;
  }

  /**
   * Start hourly background interval
   */
  static start(intervalMs: number = 60 * 60 * 1000) {
    if (this.timer) {
      clearInterval(this.timer);
    }
    // Run once on boot
    this.runOnce().catch((err) => console.error('Initial subscription scheduler run failed:', err));
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => console.error('Subscription scheduler interval failed:', err));
    }, intervalMs);
  }

  /**
   * Stop background interval
   */
  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
