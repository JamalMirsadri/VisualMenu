import { PaymentStatus, PaymentTransactionType } from '@prisma/client';
import { prisma } from '../../prisma';
import { classifyItemKind } from './classification';
import {
  resolveAnalyticsPeriod,
  dateKeyInTz,
  hourInTz,
  weekdayInTz,
  type AnalyticsFilter,
  type ResolvedPeriod,
} from './periods';

interface ItemAgg {
  name: string;
  kind: string;
  category: string;
  quantity: number;
  revenue: number;
}

interface CategoryAgg {
  quantity: number;
  revenue: number;
}

interface BucketAgg {
  orders: number;
  revenue: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function enrichOrders(orders: any[]): any[] {
  return orders.map((o) => {
    const payments = o.payments || [];
    const refunds = payments.flatMap((p: any) => p.transactions || []).filter(
      (t: any) =>
        (t.type === PaymentTransactionType.REFUND || t.type === PaymentTransactionType.PARTIAL_REFUND) &&
        t.status === 'SUCCESS'
    );
    return { ...o, refunds };
  });
}

/**
 * Cancellation / refund rule (documented, applied consistently):
 * - Orders with status CANCELLED are excluded from revenue, order counts, and
 *   item/product metrics, but are counted in `cancelledOrders`.
 * - Line items with status CANCELLED are excluded from quantity/revenue and
 *   counted in `cancelledItems`.
 * - Gross revenue is the sum of non-cancelled order totals. Refunds are the sum
 *   of successful REFUND / PARTIAL_REFUND transactions; net revenue = gross − refunds.
 * - Payment breakdown includes only PAID and PARTIALLY_REFUNDED payments.
 */
function computeMetrics(orders: any[], timezone: string) {
  let revenue = 0;
  let refundAmount = 0;
  let refundCount = 0;
  let ordersCount = 0;
  let itemsSold = 0;
  let cancelledOrders = 0;
  let cancelledItems = 0;

  const itemMap = new Map<string, ItemAgg>();
  const categoryMap = new Map<string, CategoryAgg>();
  const hourMap = new Map<number, BucketAgg>();
  const weekdayMap = new Map<number, BucketAgg>();
  const dateMap = new Map<string, BucketAgg>();
  const paymentMap = new Map<string, { count: number; amount: number }>();
  const customerIds = new Set<string>();

  // Combination structures
  const foodDrinkMap = new Map<string, number>();
  const foodDessertMap = new Map<string, number>();
  const foodDrinkDessertMap = new Map<string, number>();
  const drinkPerFood = new Map<string, Map<string, number>>();
  const dessertPerFood = new Map<string, Map<string, number>>();
  const cooccurrenceMap = new Map<string, number>();
  const comboByHour = new Map<number, number>();
  const comboByWeekday = new Map<number, number>();

  const bump = (m: Map<any, number>, k: any, n = 1) => m.set(k, (m.get(k) || 0) + n);

  for (const raw of orders) {
    const order = raw;
    const cancelled = order.status === 'CANCELLED';
    if (cancelled) {
      cancelledOrders++;
      continue;
    }

    ordersCount++;
    revenue += Number(order.total);
    const hour = hourInTz(order.createdAt, timezone);
    const weekday = weekdayInTz(order.createdAt, timezone);
    const dateKey = dateKeyInTz(order.createdAt, timezone);

    hourMap.set(hour, { orders: (hourMap.get(hour)?.orders || 0) + 1, revenue: round2((hourMap.get(hour)?.revenue || 0) + Number(order.total)) });
    weekdayMap.set(weekday, { orders: (weekdayMap.get(weekday)?.orders || 0) + 1, revenue: round2((weekdayMap.get(weekday)?.revenue || 0) + Number(order.total)) });
    dateMap.set(dateKey, { orders: (dateMap.get(dateKey)?.orders || 0) + 1, revenue: round2((dateMap.get(dateKey)?.revenue || 0) + Number(order.total)) });

    if (order.customerId) customerIds.add(order.customerId);

    // Refunds
    for (const t of order.refunds || []) {
      refundCount++;
      refundAmount += Number(t.amount);
    }

    // Payment breakdown (collected only)
    for (const p of order.payments || []) {
      if (p.status === PaymentStatus.PAID || p.status === PaymentStatus.PARTIALLY_REFUNDED) {
        const cur = paymentMap.get(p.method) || { count: 0, amount: 0 };
        paymentMap.set(p.method, { count: cur.count + 1, amount: round2(cur.amount + Number(p.amount)) });
      }
    }

    // Items
    const foods: string[] = [];
    const drinks: string[] = [];
    const desserts: string[] = [];

    for (const item of order.items || []) {
      if (item.status === 'CANCELLED') {
        cancelledItems++;
        continue;
      }
      const qty = item.quantity;
      const line = Number(item.lineTotal ?? item.unitPrice * qty);
      itemsSold += qty;

      const category = item.foodItem?.category;
      const name = item.foodNameSnapshot || item.foodItem?.name || 'Unknown';
      const categoryName = category?.name || 'Uncategorized';
      const kind = classifyItemKind(item.foodItem?.analyticsType, category?.slug || '', categoryName, name);

      const existing = itemMap.get(name) || { name, kind, category: categoryName, quantity: 0, revenue: 0 };
      existing.quantity += qty;
      existing.revenue = round2(existing.revenue + line);
      itemMap.set(name, existing);

      const catAgg = categoryMap.get(categoryName) || { quantity: 0, revenue: 0 };
      catAgg.quantity += qty;
      catAgg.revenue = round2(catAgg.revenue + line);
      categoryMap.set(categoryName, catAgg);

      if (kind === 'DRINK') drinks.push(name);
      else if (kind === 'DESSERT') desserts.push(name);
      else if (kind === 'FOOD') foods.push(name);
      // OTHER items are intentionally excluded from food/drink/dessert combinations.
    }

    // Combinations (only meaningful when a food is present)
    for (const food of foods) {
      for (const drink of drinks) {
        bump(foodDrinkMap, `${food}||${drink}`);
        const m = drinkPerFood.get(food) || new Map<string, number>();
        bump(m, drink);
        drinkPerFood.set(food, m);
      }
      for (const dessert of desserts) {
        bump(foodDessertMap, `${food}||${dessert}`);
        const m = dessertPerFood.get(food) || new Map<string, number>();
        bump(m, dessert);
        dessertPerFood.set(food, m);
      }
      for (const drink of drinks) {
        for (const dessert of desserts) {
          bump(foodDrinkDessertMap, `${food}||${drink}||${dessert}`);
        }
      }
    }

    const hasFoodDrink = foods.length > 0 && drinks.length > 0;
    if (hasFoodDrink) bump(comboByHour, hour);
    if (hasFoodDrink) bump(comboByWeekday, weekday);

    // Co-occurrence (cross-sell) for all distinct item pairs
    const uniqueNames = Array.from(new Set([...foods, ...drinks, ...desserts]));
    for (let i = 0; i < uniqueNames.length; i++) {
      for (let j = i + 1; j < uniqueNames.length; j++) {
        const a = uniqueNames[i];
        const b = uniqueNames[j];
        const key = a < b ? `${a}||${b}` : `${b}||${a}`;
        bump(cooccurrenceMap, key);
      }
    }
  }

  return {
    revenue: round2(revenue),
    refundAmount: round2(refundAmount),
    refundCount,
    netRevenue: round2(revenue - refundAmount),
    ordersCount,
    itemsSold,
    cancelledOrders,
    cancelledItems,
    customerIds,
    itemMap,
    categoryMap,
    hourMap,
    weekdayMap,
    dateMap,
    paymentMap,
    foodDrinkMap,
    foodDessertMap,
    foodDrinkDessertMap,
    drinkPerFood,
    dessertPerFood,
    cooccurrenceMap,
    comboByHour,
    comboByWeekday,
  };
}

function sortMap(map: Map<string, number>, limit = 10) {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export class AnalyticsService {
  static async getAnalytics(restaurantId: string, filter: AnalyticsFilter) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    if (!restaurant) {
      const err: any = new Error('Restaurant not found.');
      err.statusCode = 404;
      err.errorCode = 'RESTAURANT_NOT_FOUND';
      throw err;
    }

    const resolved: ResolvedPeriod = resolveAnalyticsPeriod(filter, restaurant.timezone || 'UTC');

    const [currentOrders, previousOrders] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: resolved.current.start, lt: resolved.current.end } },
        include: {
          items: { include: { foodItem: { include: { category: { select: { name: true, slug: true } } } } } },
          payments: { include: { transactions: true } },
          customer: { select: { id: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: resolved.previous.start, lt: resolved.previous.end } },
        include: {
          items: { include: { foodItem: { include: { category: { select: { name: true, slug: true } } } } } },
          payments: { include: { transactions: true } },
          customer: { select: { id: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const current = computeMetrics(enrichOrders(currentOrders), resolved.timezone);
    const previous = computeMetrics(enrichOrders(previousOrders), resolved.timezone);

    // New vs returning customers (relative to current period start)
    const currentCustomerIds = Array.from(current.customerIds);
    const returningCustomerIds = new Set<string>();
    if (currentCustomerIds.length > 0) {
      const earlier = await prisma.order.findMany({
        where: {
          restaurantId,
          customerId: { in: currentCustomerIds },
          createdAt: { lt: resolved.current.start },
        },
        select: { customerId: true },
        distinct: ['customerId'],
      });
      earlier.forEach((o) => returningCustomerIds.add(o.customerId!));
    }

    const items = Array.from(current.itemMap.values());
    const topFoods = items.filter((i) => i.kind === 'FOOD').sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    const topDrinks = items.filter((i) => i.kind === 'DRINK').sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    const topDesserts = items.filter((i) => i.kind === 'DESSERT').sort((a, b) => b.quantity - a.quantity).slice(0, 10);

    const totalItemsQty = current.itemsSold || 1;
    const totalRevenue = current.revenue || 1;

    // Product growth/decline vs previous period
    const prevItemQty = new Map<string, number>();
    previous.itemMap.forEach((v, k) => prevItemQty.set(k, v.quantity));
    const growthDecline = items
      .map((i) => {
        const prev = prevItemQty.get(i.name) || 0;
        const changePct = prev > 0 ? ((i.quantity - prev) / prev) * 100 : i.quantity > 0 ? 100 : 0;
        return { name: i.name, kind: i.kind, currentQuantity: i.quantity, previousQuantity: prev, changePct: round2(changePct) };
      })
      .sort((a, b) => b.currentQuantity - a.currentQuantity)
      .slice(0, 15);

    const productShare = items
      .map((i) => ({
        name: i.name,
        kind: i.kind,
        revenue: i.revenue,
        quantity: i.quantity,
        revenueShare: round2((i.revenue / totalRevenue) * 100),
        quantityShare: round2((i.quantity / totalItemsQty) * 100),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    const categoryPerformance = Array.from(current.categoryMap.entries())
      .map(([name, agg]) => ({
        name,
        quantity: agg.quantity,
        revenue: agg.revenue,
        revenueShare: round2((agg.revenue / totalRevenue) * 100),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const paymentBreakdown = Array.from(current.paymentMap.entries())
      .map(([method, agg]) => ({
        method,
        count: agg.count,
        amount: agg.amount,
        share: round2((agg.amount / totalRevenue) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);

    const salesByHour = Array.from({ length: 24 }, (_, hour) => {
      const b = current.hourMap.get(hour) || { orders: 0, revenue: 0 };
      return { hour, orders: b.orders, revenue: b.revenue };
    });

    const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const salesByWeekday = weekdayLabels.map((weekday, idx) => {
      const b = current.weekdayMap.get(idx) || { orders: 0, revenue: 0 };
      return { weekday, orders: b.orders, revenue: b.revenue };
    });

    const salesByDate = Array.from(current.dateMap.entries())
      .map(([date, b]) => ({ date, orders: b.orders, revenue: b.revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const sortedHours = salesByHour.map((h) => ({ ...h })).sort((a, b) => b.orders - a.orders);
    const peakQuiet = {
      peak: sortedHours.slice(0, 5),
      quiet: sortedHours.slice(-5).reverse(),
    };

    const combinations = {
      foodDrink: sortMap(current.foodDrinkMap, 10).map((x) => ({ combination: x.key.split('||'), count: x.count })),
      foodDessert: sortMap(current.foodDessertMap, 10).map((x) => ({ combination: x.key.split('||'), count: x.count })),
      foodDrinkDessert: sortMap(current.foodDrinkDessertMap, 10).map((x) => ({ combination: x.key.split('||'), count: x.count })),
      mostCommonDrinkPerFood: Array.from(current.drinkPerFood.entries())
        .map(([food, drinks]) => {
          const top = sortMap(drinks, 1)[0];
          return { food, drink: top?.key, count: top?.count || 0 };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
      mostCommonDessertPerFood: Array.from(current.dessertPerFood.entries())
        .map(([food, desserts]) => {
          const top = sortMap(desserts, 1)[0];
          return { food, dessert: top?.key, count: top?.count || 0 };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
      byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: current.comboByHour.get(hour) || 0 })),
      byWeekday: weekdayLabels.map((weekday, idx) => ({ weekday, count: current.comboByWeekday.get(idx) || 0 })),
    };

    const crossSellUpsell = sortMap(current.cooccurrenceMap, 20).map((x) => ({ items: x.key.split('||'), count: x.count }));
    const suggestedBundles = sortMap(current.foodDrinkDessertMap, 10).map((x) => ({ items: x.key.split('||'), count: x.count }));

    const summary = {
      revenue: current.revenue,
      netRevenue: current.netRevenue,
      orders: current.ordersCount,
      averageOrderValue: current.ordersCount > 0 ? round2(current.revenue / current.ordersCount) : 0,
      itemsSold: current.itemsSold,
      averageItemsPerOrder: current.ordersCount > 0 ? round2(current.itemsSold / current.ordersCount) : 0,
      refunds: current.refundAmount,
      refundCount: current.refundCount,
      cancelledOrders: current.cancelledOrders,
      cancelledItems: current.cancelledItems,
      newCustomers: currentCustomerIds.length - returningCustomerIds.size,
      returningCustomers: returningCustomerIds.size,
      previous: {
        revenue: previous.revenue,
        orders: previous.ordersCount,
        averageOrderValue: previous.ordersCount > 0 ? round2(previous.revenue / previous.ordersCount) : 0,
        itemsSold: previous.itemsSold,
      },
    };

    return {
      period: {
        period: resolved.period,
        timezone: resolved.timezone,
        current: { start: resolved.current.start.toISOString(), end: resolved.current.end.toISOString() },
        previous: { start: resolved.previous.start.toISOString(), end: resolved.previous.end.toISOString() },
      },
      summary,
      topFoods,
      topDrinks,
      topDesserts,
      salesByHour,
      salesByWeekday,
      salesByDate,
      peakQuiet,
      paymentBreakdown,
      categoryPerformance,
      combinations,
      productInsights: { growthDecline, productShare, crossSellUpsell, suggestedBundles },
    };
  }
}
