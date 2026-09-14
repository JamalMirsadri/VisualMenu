import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl, getAuthToken } from '../config';
import { activityService, type AdminActivityCounts } from '../services/activityService';
import { notificationService } from '../services/notificationService';

export type BadgeKey = keyof AdminActivityCounts;

const EMPTY_COUNTS: AdminActivityCounts = {
  liveOrders: 0,
  notifications: 0,
  payments: 0,
  kitchen: 0,
  staffInvitations: 0,
  tables: 0,
};

const SEEN_KEY_PREFIX = 'aura_badge_seen_';

function loadSeen(restaurantId: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(`${SEEN_KEY_PREFIX}${restaurantId}`) || '{}');
  } catch {
    return {};
  }
}

function persistSeen(restaurantId: string, seen: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${SEEN_KEY_PREFIX}${restaurantId}`, JSON.stringify(seen));
  } catch {
    // storage unavailable — non-blocking
  }
}

/**
 * Fetches tenant-scoped activity counts and keeps them fresh over the existing
 * restaurant SSE stream. "Seen" watermarks (per section) implement the
 * open-section → mark-read/handled behaviour without duplicating the server
 * notification system; notifications use the server `readAt` state directly.
 */
export function useAdminBadges(restaurantId?: string | null) {
  const [counts, setCounts] = useState<AdminActivityCounts>(EMPTY_COUNTS);
  const [seen, setSeen] = useState<Record<string, number>>(() =>
    loadSeen(restaurantId || '')
  );
  const seenRef = useRef(seen);
  seenRef.current = seen;

  const fetch = useCallback(async () => {
    if (!restaurantId) {
      setCounts(EMPTY_COUNTS);
      return;
    }
    try {
      const data = await activityService.getBadges(restaurantId);
      setCounts(data);
    } catch {
      // Non-blocking — badges simply stay at their previous value.
    }
  }, [restaurantId]);

  useEffect(() => {
    setSeen(loadSeen(restaurantId || ''));
    fetch();
  }, [restaurantId, fetch]);

  // Realtime refresh over the existing SSE restaurant channel.
  useEffect(() => {
    if (!restaurantId) return;
    let es: EventSource | null = null;
    try {
      const token = getAuthToken() || '';
      es = new EventSource(
        `${buildApiUrl(`/restaurants/${restaurantId}/events`)}?token=${encodeURIComponent(token)}`
      );
      const refresh = () => fetch();
      const events = [
        'order_created',
        'order_status_changed',
        'order_item_status_changed',
        'payment_status_changed',
        'notification',
        'notification_created',
        'platform_message',
        'floor_updated',
        'order_ready',
        'order_served',
        'order_assigned',
      ];
      events.forEach((name) => es!.addEventListener(name, refresh));
    } catch {
      // Fallback to polling-free static counts.
    }
    return () => {
      if (es) es.close();
    };
  }, [restaurantId, fetch]);

  const badgeCount = useCallback(
    (key: BadgeKey): number => {
      const current = counts[key] || 0;
      if (key === 'notifications') return current;
      const lastSeen = seen[key] || 0;
      return Math.max(0, current - lastSeen);
    },
    [counts, seen]
  );

  const markSeen = useCallback(
    async (key: BadgeKey) => {
      if (!restaurantId) return;
      if (key === 'notifications') {
        try {
          await notificationService.markAllRead(restaurantId);
          setCounts((prev) => ({ ...prev, notifications: 0 }));
        } catch {
          // Non-blocking
        }
        return;
      }

      const next = { ...seenRef.current, [key]: counts[key] || 0 };
      setSeen(next);
      persistSeen(restaurantId, next);
    },
    [restaurantId, counts]
  );

  return { counts, badgeCount, markSeen, refresh: fetch };
}
