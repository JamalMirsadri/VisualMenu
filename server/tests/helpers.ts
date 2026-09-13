import { prisma } from '../src/prisma';
import { SubscriptionStatus } from '@prisma/client';

/**
 * Creates a restaurant together with an ACTIVE subscription, so tests that
 * exercise subscription-gated admin routes don't rely on any automatic
 * fallback (which Phase 14 removed).
 */
export async function createRestaurantWithSubscription(args: any): Promise<any> {
  const restaurant = await prisma.restaurant.create(args);
  await ensureActiveSubscription(restaurant.id);
  return restaurant;
}

/**
 * Attaches an ACTIVE subscription to an existing restaurant (for tests that
 * create the restaurant through API routes or other means).
 */
export async function ensureActiveSubscription(restaurantId: string): Promise<void> {
  const plan = await prisma.subscriptionPlan.findFirst({ where: { active: true } });
  if (!plan) return;

  const now = new Date();
  await prisma.subscription.create({
    data: {
      restaurantId,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      autoRenew: true,
      provider: 'TEST',
      agreedPrice: plan.price,
      agreedCurrency: plan.currency,
    },
  });
}
