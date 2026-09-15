import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../prisma';
import type { FeatureKey } from '../constants/features';

/**
 * Resolves a restaurant's currently entitled feature keys from its active
 * subscription plan. Returns an empty array when no active/grace subscription
 * exists (feature access is derived from the subscription, never a hard-coded
 * plan tier).
 */
export class FeatureService {
  static async getRestaurantFeatures(restaurantId: string): Promise<string[]> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        restaurantId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD] },
      },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { features: true } } },
    });

    if (!subscription) return [];
    return subscription.plan.features ?? [];
  }

  static async hasFeature(restaurantId: string, feature: FeatureKey): Promise<boolean> {
    const features = await this.getRestaurantFeatures(restaurantId);
    return features.includes(feature);
  }
}
