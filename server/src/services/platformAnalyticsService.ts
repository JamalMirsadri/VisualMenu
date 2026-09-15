import { PaymentStatus, PaymentTransactionType } from '@prisma/client';
import { prisma } from '../prisma';
import { classifyItemKind } from './analytics/classification';
import {
  resolveAnalyticsPeriod,
  dateKeyInTz,
  hourInTz,
  weekdayInTz,
  addDays,
  type AnalyticsFilter,
} from './analytics/periods';

const MIN_COMBINATION_COUNT = 3;

interface OrderRow {
  id: string;
  restaurantId: string;
  restaurantName: string;
  timezone: string;
  createdAt: Date;
  total: number;
  status: string;
  customerId: string | null;
  items: ItemRow[];
  payments: PaymentRow[];
  refunds: { amount: number; partial: boolean }[];
}

interface ItemRow {
  name: string;
  kind: string;
  category: string;
  quantity: number;
  revenue: number;
}

interface PaymentRow {
  method: string;
  amount: number;
  status: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return round2(((current - previous) / previous) * 100);
}

function sortDescBy(map: Map<string, number>, keySplit = '||'): { key: string; value: number }[] {
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

export interface PlatformAnalyticsFilter extends AnalyticsFilter {
  restaurantId?: string;
}

export class PlatformAnalyticsService {
  static async getPlatformAnalytics(filter: PlatformAnalyticsFilter) {
    const resolved = resolveAnalyticsPeriod(filter, 'UTC');

    const orderWhere: any = {
      createdAt: { gte: resolved.current.start, lt: resolved.current.end },
      ...(filter.restaurantId ? { restaurantId: filter.restaurantId } : {}),
    };

    const [orders, restaurants] = await Promise.all([
      prisma.order.findMany({
        where: orderWhere,
        include: {
          restaurant: { select: { id: true, name: true, timezone: true } },
          items: { include: { foodItem: { include: { category: { select: { name: true, slug: true } } } } } },
          payments: { include: { transactions: true } },
          customer: { select: { id: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.restaurant.findMany({ select: { id: true, name: true, timezone: true } }),
    ]);

    // Previous-period orders for growth/comparison (same scope, previous range).
    const prevOrders = await prisma.order.findMany({
      where: {
        createdAt: { gte: resolved.previous.start, lt: resolved.previous.end },
        ...(filter.restaurantId ? { restaurantId: filter.restaurantId } : {}),
      },
      include: {
        restaurant: { select: { id: true, timezone: true } },
        items: { include: { foodItem: { include: { category: { select: { name: true, slug: true } } } } } },
        payments: { include: { transactions: true } },
        customer: { select: { id: true } },
      },
    });

    const rows = orders.map(enrichOrder);
    const prevRows = prevOrders.map(enrichOrder);

    const cur = aggregate(rows);
    const prev = aggregate(prevRows);

    // Returning customers (had an order before current period start).
    const currentCustomerIds = Array.from(cur.customerIds);
    const returningSet = new Set<string>();
    if (currentCustomerIds.length > 0) {
      const earlier = await prisma.order.findMany({
        where: {
          customerId: { in: currentCustomerIds },
          createdAt: { lt: resolved.current.start },
          ...(filter.restaurantId ? { restaurantId: filter.restaurantId } : {}),
        },
        select: { customerId: true },
        distinct: ['customerId'],
      });
      earlier.forEach((o) => returningSet.add(o.customerId!));
    }

    const kpis = buildKpis(cur, prev, returningSet, currentCustomerIds.length);
    const timeAnalysis = buildTimeAnalysis(rows);
    const restaurantPerformance = buildRestaurantPerformance(rows, prevRows, restaurants, filter.restaurantId);
    const productIntelligence = buildProductIntelligence(cur, prev);
    const combinations = computeCombinations(rows);
    const timeProductBehavior = buildTimeProductBehavior(rows);
    const customerBehavior = buildCustomerBehavior(cur, returningSet, currentCustomerIds.length);
    const paymentIntelligence = buildPaymentIntelligence(cur, rows);
    const cancellationRefund = buildCancellationRefund(cur, rows, prevRows);
    const benchmarks = buildBenchmarks(restaurantPerformance);
    const growth = buildGrowth(cur, prev, rows, prevRows);

    return {
      period: {
        period: resolved.period,
        current: { start: resolved.current.start.toISOString(), end: resolved.current.end.toISOString() },
        previous: { start: resolved.previous.start.toISOString(), end: resolved.previous.end.toISOString() },
      },
      scope: { restaurantId: filter.restaurantId || null, restaurants: restaurants.length },
      kpis,
      timeAnalysis,
      restaurantPerformance,
      productIntelligence,
      combinations,
      timeProductBehavior,
      customerBehavior,
      paymentIntelligence,
      cancellationRefund,
      benchmarks,
      growth,
      sampleSizes: {
        orders: cur.ordersCount,
        items: cur.itemsSold,
        customers: currentCustomerIds.length,
        restaurants: restaurantPerformance.length,
        combinationsEvaluated: cur.pairCount,
      },
    };
  }
}

function enrichOrder(o: any): OrderRow {
  const refunds = (o.payments || [])
    .flatMap((p: any) => (p.transactions || []).map((t: any) => ({ t, method: p.method })))
    .filter((x: any) => (x.t.type === PaymentTransactionType.REFUND || x.t.type === PaymentTransactionType.PARTIAL_REFUND) && x.t.status === 'SUCCESS')
    .map((x: any) => ({ amount: Number(x.t.amount), partial: x.t.type === PaymentTransactionType.PARTIAL_REFUND }));

  return {
    id: o.id,
    restaurantId: o.restaurantId,
    restaurantName: o.restaurant?.name || 'Unknown',
    timezone: o.restaurant?.timezone || 'UTC',
    createdAt: o.createdAt,
    total: Number(o.total),
    status: o.status,
    customerId: o.customerId,
    items: (o.items || [])
      .filter((i: any) => i.status !== 'CANCELLED')
      .map((i: any) => {
        const category = i.foodItem?.category;
        const name = i.foodNameSnapshot || i.foodItem?.name || 'Unknown';
        const categoryName = category?.name || 'Uncategorized';
        return {
          name,
          kind: classifyItemKind(i.foodItem?.analyticsType, category?.slug || '', categoryName, name),
          category: categoryName,
          quantity: i.quantity,
          revenue: Number(i.lineTotal ?? i.unitPrice * i.quantity),
        };
      }),
    payments: (o.payments || [])
      .filter((p: any) => p.status === PaymentStatus.PAID || p.status === PaymentStatus.PARTIALLY_REFUNDED)
      .map((p: any) => ({ method: p.method, amount: Number(p.amount), status: p.status })),
    refunds,
  };
}

function aggregate(rows: OrderRow[]) {
  let revenue = 0;
  let refundAmount = 0;
  let refundCount = 0;
  let partialRefunds = 0;
  let ordersCount = 0;
  let cancelledOrders = 0;
  let cancelledItems = 0;
  let itemsSold = 0;
  const customerIds = new Set<string>();
  const customerOrderCount = new Map<string, number>();
  const itemMap = new Map<string, { name: string; kind: string; category: string; quantity: number; revenue: number; restaurants: Set<string> }>();
  const categoryMap = new Map<string, { quantity: number; revenue: number }>();
  const paymentMap = new Map<string, { count: number; amount: number }>();
  const pairCount = 0;

  for (const o of rows) {
    if (o.status === 'CANCELLED') {
      cancelledOrders++;
      continue;
    }
    ordersCount++;
    revenue += o.total;
    if (o.customerId) {
      customerIds.add(o.customerId);
      customerOrderCount.set(o.customerId, (customerOrderCount.get(o.customerId) || 0) + 1);
    }
    for (const r of o.refunds) {
      refundCount++;
      refundAmount += r.amount;
      if (r.partial) partialRefunds++;
    }
    for (const p of o.payments) {
      const cur = paymentMap.get(p.method) || { count: 0, amount: 0 };
      paymentMap.set(p.method, { count: cur.count + 1, amount: round2(cur.amount + p.amount) });
    }
    for (const item of o.items) {
      itemsSold += item.quantity;
      const existing = itemMap.get(item.name) || { name: item.name, kind: item.kind, category: item.category, quantity: 0, revenue: 0, restaurants: new Set<string>() };
      existing.quantity += item.quantity;
      existing.revenue = round2(existing.revenue + item.revenue);
      existing.restaurants.add(o.restaurantId);
      itemMap.set(item.name, existing);

      const c = categoryMap.get(item.category) || { quantity: 0, revenue: 0 };
      c.quantity += item.quantity;
      c.revenue = round2(c.revenue + item.revenue);
      categoryMap.set(item.category, c);
    }
  }

  return {
    revenue: round2(revenue),
    netRevenue: round2(revenue - refundAmount),
    refundAmount: round2(refundAmount),
    refundCount,
    partialRefunds,
    ordersCount,
    cancelledOrders,
    cancelledItems,
    itemsSold,
    customerIds,
    customerOrderCount,
    itemMap,
    categoryMap,
    paymentMap,
    pairCount,
  };
}

function buildKpis(cur: any, prev: any, returningSet: Set<string>, uniqueCustomers: number) {
  const returningCount = returningSet.size;
  return {
    totalRevenue: cur.revenue,
    netRevenue: cur.netRevenue,
    refundAmount: cur.refundAmount,
    totalOrders: cur.ordersCount,
    averageOrderValue: cur.ordersCount > 0 ? round2(cur.revenue / cur.ordersCount) : 0,
    itemsSold: cur.itemsSold,
    averageItemsPerOrder: cur.ordersCount > 0 ? round2(cur.itemsSold / cur.ordersCount) : 0,
    uniqueCustomers,
    returningCustomerRate: uniqueCustomers > 0 ? round2((returningCount / uniqueCustomers) * 100) : 0,
    cancellationRate: cur.ordersCount + cur.cancelledOrders > 0 ? round2((cur.cancelledOrders / (cur.ordersCount + cur.cancelledOrders)) * 100) : 0,
    revenueGrowthPct: pctChange(cur.revenue, prev.revenue),
    orderGrowthPct: pctChange(cur.ordersCount, prev.ordersCount),
    previous: {
      totalRevenue: prev.revenue,
      totalOrders: prev.ordersCount,
      averageOrderValue: prev.ordersCount > 0 ? round2(prev.revenue / prev.ordersCount) : 0,
      itemsSold: prev.itemsSold,
    },
  };
}

function buildTimeAnalysis(rows: OrderRow[]) {
  const revenueByDay = new Map<string, number>();
  const ordersByDay = new Map<string, number>();
  const revenueByMonth = new Map<string, number>();
  const revenueByYear = new Map<string, number>();
  const revenueByWeek = new Map<string, number>();
  const ordersByWeekday = new Map<number, number>();
  const ordersByHour = new Map<number, number>();
  const revenueByHour = new Map<number, number>();
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  for (const o of rows) {
    if (o.status === 'CANCELLED') continue;
    const tz = o.timezone;
    const day = dateKeyInTz(o.createdAt, tz);
    const hour = hourInTz(o.createdAt, tz);
    const weekday = weekdayInTz(o.createdAt, tz);
    const dow = weekdayInTz(o.createdAt, tz);
    const daysSinceMonday = (dow + 6) % 7;
    const monday = addDays(o.createdAt, -daysSinceMonday);
    const weekKey = dateKeyInTz(monday, tz);

    revenueByDay.set(day, round2((revenueByDay.get(day) || 0) + o.total));
    ordersByDay.set(day, (ordersByDay.get(day) || 0) + 1);
    revenueByMonth.set(day.slice(0, 7), round2((revenueByMonth.get(day.slice(0, 7)) || 0) + o.total));
    revenueByYear.set(day.slice(0, 4), round2((revenueByYear.get(day.slice(0, 4)) || 0) + o.total));
    revenueByWeek.set(weekKey, round2((revenueByWeek.get(weekKey) || 0) + o.total));
    ordersByWeekday.set(weekday, (ordersByWeekday.get(weekday) || 0) + 1);
    ordersByHour.set(hour, (ordersByHour.get(hour) || 0) + 1);
    revenueByHour.set(hour, round2((revenueByHour.get(hour) || 0) + o.total));
    heatmap[weekday][hour]++;
  }

  const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: ordersByHour.get(hour) || 0,
    revenue: revenueByHour.get(hour) || 0,
  }));
  const sortedHours = [...hourBuckets].sort((a, b) => b.orders - a.orders);
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    revenueByDay: sortMapByKey(revenueByDay),
    ordersByDay: sortMapByKey(ordersByDay),
    revenueByWeek: sortMapByKey(revenueByWeek),
    revenueByMonth: sortMapByKey(revenueByMonth),
    revenueByYear: sortMapByKey(revenueByYear),
    ordersByWeekday: weekdayNames.map((weekday, idx) => ({ weekday, orders: ordersByWeekday.get(idx) || 0 })),
    ordersByHour: hourBuckets,
    revenueByHour: hourBuckets,
    heatmap: { weekday: weekdayNames, hours: Array.from({ length: 24 }, (_, i) => i), data: heatmap },
    peakHours: sortedHours.slice(0, 5),
    quietHours: sortedHours.slice(-5).reverse(),
  };
}

function sortMapByKey(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildRestaurantPerformance(rows: OrderRow[], prevRows: OrderRow[], restaurants: any[], restaurantFilter?: string) {
  const targetRestaurants = restaurantFilter
    ? restaurants.filter((r) => r.id === restaurantFilter)
    : restaurants;

  const byRestaurant = new Map<string, any>();
  for (const r of targetRestaurants) {
    byRestaurant.set(r.id, {
      restaurantId: r.id,
      name: r.name,
      revenue: 0,
      orders: 0,
      cancelledOrders: 0,
      refunds: 0,
      itemsSold: 0,
      customers: new Set<string>(),
    });
  }
  for (const o of rows) {
    const b = byRestaurant.get(o.restaurantId);
    if (!b) continue;
    if (o.status === 'CANCELLED') {
      b.cancelledOrders++;
      continue;
    }
    b.revenue = round2(b.revenue + o.total);
    b.orders++;
    b.refunds = round2(b.refunds + o.refunds.reduce((s, x) => s + x.amount, 0));
    b.itemsSold += o.items.reduce((s, x) => s + x.quantity, 0);
    if (o.customerId) b.customers.add(o.customerId);
  }

  const prevByRestaurant = new Map<string, number>();
  for (const o of prevRows) {
    if (o.status === 'CANCELLED') continue;
    prevByRestaurant.set(o.restaurantId, (prevByRestaurant.get(o.restaurantId) || 0) + o.total);
  }

  return Array.from(byRestaurant.values()).map((b) => {
    const prevRevenue = prevByRestaurant.get(b.restaurantId) || 0;
    const totalOrders = b.orders + b.cancelledOrders;
    return {
      restaurantId: b.restaurantId,
      name: b.name,
      revenue: b.revenue,
      orders: b.orders,
      averageOrderValue: b.orders > 0 ? round2(b.revenue / b.orders) : 0,
      itemsSold: b.itemsSold,
      customers: b.customers.size,
      cancellationRate: totalOrders > 0 ? round2((b.cancelledOrders / totalOrders) * 100) : 0,
      refunds: b.refunds,
      growthPct: pctChange(b.revenue, prevRevenue),
      returningCustomerRate: null,
    };
  });
}

function buildProductIntelligence(cur: any, prev: any) {
  const items: any[] = Array.from(cur.itemMap.values());
  const prevQty = new Map<string, number>();
  prev.itemMap.forEach((v: any, k: string) => prevQty.set(k, v.quantity));

  const totalRevenue = cur.revenue || 1;
  const totalQty = cur.itemsSold || 1;

  const topFoods = items.filter((i) => i.kind === 'FOOD').sort((a, b) => b.quantity - a.quantity).slice(0, 15);
  const topDrinks = items.filter((i) => i.kind === 'DRINK').sort((a, b) => b.quantity - a.quantity).slice(0, 15);
  const topDesserts = items.filter((i) => i.kind === 'DESSERT').sort((a, b) => b.quantity - a.quantity).slice(0, 15);

  const categoryPerformance = Array.from(cur.categoryMap.entries())
    .map(([name, agg]: any) => ({ name, quantity: agg.quantity, revenue: agg.revenue, revenueShare: round2((agg.revenue / totalRevenue) * 100) }))
    .sort((a, b) => b.revenue - a.revenue);

  const productGrowthDecline = items
    .map((i) => ({ name: i.name, kind: i.kind, currentQuantity: i.quantity, previousQuantity: prevQty.get(i.name) || 0, changePct: prevQty.get(i.name) ? round2(((i.quantity - prevQty.get(i.name)!) / prevQty.get(i.name)!) * 100) : (i.quantity > 0 ? 100 : 0) }))
    .sort((a, b) => b.currentQuantity - a.currentQuantity)
    .slice(0, 20);

  const productPenetration = items
    .map((i) => ({ name: i.name, kind: i.kind, restaurants: i.restaurants.size, quantity: i.quantity, revenue: i.revenue, revenueShare: round2((i.revenue / totalRevenue) * 100), quantityShare: round2((i.quantity / totalQty) * 100) }))
    .sort((a, b) => b.restaurants - a.restaurants || b.revenue - a.revenue)
    .slice(0, 20);

  return { topFoods, topDrinks, topDesserts, categoryPerformance, productGrowthDecline, productPenetration };
}

// Combination computation is performed over raw rows for correct support/confidence/lift.
function computeCombinations(rows: OrderRow[]) {
  const foodDrink = new Map<string, number>();
  const foodDessert = new Map<string, number>();
  const foodDrinkDessert = new Map<string, number>();
  const foodCount = new Map<string, number>();
  const drinkCount = new Map<string, number>();
  const dessertCount = new Map<string, number>();
  const drinkPerFood = new Map<string, Map<string, number>>();
  const dessertPerFood = new Map<string, Map<string, number>>();

  const validOrders = rows.filter((o) => o.status !== 'CANCELLED');
  const N = validOrders.length;

  for (const o of validOrders) {
    const foods = Array.from(new Set(o.items.filter((i) => i.kind === 'FOOD').map((i) => i.name)));
    const drinks = Array.from(new Set(o.items.filter((i) => i.kind === 'DRINK').map((i) => i.name)));
    const desserts = Array.from(new Set(o.items.filter((i) => i.kind === 'DESSERT').map((i) => i.name)));

    for (const f of foods) foodCount.set(f, (foodCount.get(f) || 0) + 1);
    for (const d of drinks) drinkCount.set(d, (drinkCount.get(d) || 0) + 1);
    for (const d of desserts) dessertCount.set(d, (dessertCount.get(d) || 0) + 1);

    for (const f of foods) {
      for (const d of drinks) {
        foodDrink.set(`${f}||${d}`, (foodDrink.get(`${f}||${d}`) || 0) + 1);
        const m = drinkPerFood.get(f) || new Map();
        m.set(d, (m.get(d) || 0) + 1);
        drinkPerFood.set(f, m);
      }
      for (const d of desserts) {
        foodDessert.set(`${f}||${d}`, (foodDessert.get(`${f}||${d}`) || 0) + 1);
        const m = dessertPerFood.get(f) || new Map();
        m.set(d, (m.get(d) || 0) + 1);
        dessertPerFood.set(f, m);
      }
      for (const d of drinks) {
        for (const de of desserts) {
          foodDrinkDessert.set(`${f}||${d}||${de}`, (foodDrinkDessert.get(`${f}||${d}||${de}`) || 0) + 1);
        }
      }
    }
  }

  const pair = (map: Map<string, number>, kindA: Map<string, number>, kindB: Map<string, number>) =>
    sortDescBy(map)
      .filter((x) => x.value >= MIN_COMBINATION_COUNT)
      .map((x) => {
        const [a, b] = x.key.split('||');
        const support = N > 0 ? round2(x.value / N) : 0;
        const confidence = (kindA.get(a) || 1) > 0 ? round2(x.value / (kindA.get(a) || 1)) : 0;
        const supportB = N > 0 ? (kindB.get(b) || 0) / N : 0;
        const lift = supportB > 0 ? round2(confidence / supportB) : 0;
        return { combination: [a, b], count: x.value, support, confidence, lift };
      })
      .slice(0, 20);

  return {
    foodDrink: pair(foodDrink, foodCount, drinkCount),
    foodDessert: pair(foodDessert, foodCount, dessertCount),
    foodDrinkDessert: sortDescBy(foodDrinkDessert)
      .filter((x) => x.value >= MIN_COMBINATION_COUNT)
      .map((x) => ({ combination: x.key.split('||'), count: x.value }))
      .slice(0, 20),
    mostCommonDrinkPerFood: Array.from(drinkPerFood.entries()).map(([food, m]) => {
      const top = sortDescBy(m)[0];
      return { food, drink: top?.key, count: top?.value || 0 };
    }).sort((a, b) => b.count - a.count).slice(0, 20),
    mostCommonDessertPerFood: Array.from(dessertPerFood.entries()).map(([food, m]) => {
      const top = sortDescBy(m)[0];
      return { food, dessert: top?.key, count: top?.value || 0 };
    }).sort((a, b) => b.count - a.count).slice(0, 20),
    sampleThreshold: MIN_COMBINATION_COUNT,
    totalOrders: N,
  };
}

function buildTimeProductBehavior(rows: OrderRow[]) {
  const byHourFood = new Map<string, number>();
  const byHourDrink = new Map<string, number>();
  const byHourDessert = new Map<string, number>();
  const byWeekdayProduct = new Map<string, number>();
  const comboByHour = new Map<number, number>();

  for (const o of rows) {
    if (o.status === 'CANCELLED') continue;
    const hour = hourInTz(o.createdAt, o.timezone);
    const weekday = weekdayInTz(o.createdAt, o.timezone);
    const foods = new Set(o.items.filter((i) => i.kind === 'FOOD').map((i) => i.name));
    const drinks = new Set(o.items.filter((i) => i.kind === 'DRINK').map((i) => i.name));
    const desserts = new Set(o.items.filter((i) => i.kind === 'DESSERT').map((i) => i.name));

    for (const f of foods) byHourFood.set(`${hour}||${f}`, (byHourFood.get(`${hour}||${f}`) || 0) + 1);
    for (const d of drinks) byHourDrink.set(`${hour}||${d}`, (byHourDrink.get(`${hour}||${d}`) || 0) + 1);
    for (const de of desserts) byHourDessert.set(`${hour}||${de}`, (byHourDessert.get(`${hour}||${de}`) || 0) + 1);
    for (const f of new Set([...foods, ...drinks, ...desserts])) byWeekdayProduct.set(`${weekday}||${f}`, (byWeekdayProduct.get(`${weekday}||${f}`) || 0) + 1);
    if (foods.size > 0 && drinks.size > 0) comboByHour.set(hour, (comboByHour.get(hour) || 0) + 1);
  }

  return {
    popularFoodsByHour: splitHourMap(byHourFood),
    popularDrinksByHour: splitHourMap(byHourDrink),
    popularDessertsByHour: splitHourMap(byHourDessert),
    popularCombosByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: comboByHour.get(hour) || 0 })),
    popularProductsByWeekday: splitWeekdayMap(byWeekdayProduct),
  };
}

function splitHourMap(map: Map<string, number>) {
  return sortDescBy(map).slice(0, 30).map((x) => ({ hour: Number(x.key.split('||')[0]), product: x.key.split('||')[1], count: x.value }));
}

function splitWeekdayMap(map: Map<string, number>) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return sortDescBy(map).slice(0, 30).map((x) => ({ weekday: names[Number(x.key.split('||')[0])], product: x.key.split('||')[1], count: x.value }));
}

function buildCustomerBehavior(cur: any, returningSet: Set<string>, uniqueCustomers: number) {
  const repeatCustomers = Array.from(cur.customerOrderCount.entries()).filter(([, n]) => n > 1).length;
  return {
    newCustomers: uniqueCustomers - returningSet.size,
    returningCustomers: returningSet.size,
    repeatPurchaseRate: uniqueCustomers > 0 ? round2((repeatCustomers / uniqueCustomers) * 100) : 0,
    ordersPerCustomer: uniqueCustomers > 0 ? round2(cur.ordersCount / uniqueCustomers) : 0,
    revenuePerCustomer: uniqueCustomers > 0 ? round2(cur.revenue / uniqueCustomers) : 0,
    averageCustomerValue: uniqueCustomers > 0 ? round2(cur.revenue / uniqueCustomers) : 0,
    visitFrequency: uniqueCustomers > 0 ? round2(cur.ordersCount / uniqueCustomers) : 0,
    retentionTrend: [],
  };
}

function buildPaymentIntelligence(cur: any, rows: OrderRow[]) {
  const byMethod = Array.from(cur.paymentMap.entries())
    .map(([method, agg]: any) => ({ method, count: agg.count, revenue: agg.amount, share: cur.revenue > 0 ? round2((agg.amount / cur.revenue) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const byHour = new Map<string, { count: number; amount: number }>();
  const byDay = new Map<string, { count: number; amount: number }>();
  const byRestaurant = new Map<string, { method: string; count: number; amount: number }>();

  for (const o of rows) {
    if (o.status === 'CANCELLED') continue;
    for (const p of o.payments) {
      const hour = hourInTz(o.createdAt, o.timezone);
      const day = dateKeyInTz(o.createdAt, o.timezone);
      const hk = `${hour}||${p.method}`;
      const dk = `${day}||${p.method}`;
      const rk = `${o.restaurantName}||${p.method}`;
      const h = byHour.get(hk) || { count: 0, amount: 0 };
      byHour.set(hk, { count: h.count + 1, amount: round2(h.amount + p.amount) });
      const d = byDay.get(dk) || { count: 0, amount: 0 };
      byDay.set(dk, { count: d.count + 1, amount: round2(d.amount + p.amount) });
      const r = byRestaurant.get(rk) || { method: p.method, count: 0, amount: 0 };
      byRestaurant.set(rk, { method: p.method, count: r.count + 1, amount: round2(r.amount + p.amount) });
    }
  }

  return {
    byMethod,
    byHour: Array.from(byHour.entries()).map(([k, v]) => ({ hour: Number(k.split('||')[0]), method: k.split('||')[1], ...v })),
    byDay: Array.from(byDay.entries()).map(([k, v]) => ({ date: k.split('||')[0], method: k.split('||')[1], ...v })),
    byRestaurant: Array.from(byRestaurant.entries()).map(([k, v]) => ({ restaurant: k.split('||')[0], method: k.split('||')[1], ...v })),
  };
}

function buildCancellationRefund(cur: any, rows: OrderRow[], prevRows: OrderRow[]) {
  const byRestaurant = new Map<string, { cancelled: number; refunds: number; refundAmount: number }>();
  const byProduct = new Map<string, number>();

  for (const o of rows) {
    if (o.status === 'CANCELLED') {
      const b = byRestaurant.get(o.restaurantName) || { cancelled: 0, refunds: 0, refundAmount: 0 };
      b.cancelled++;
      byRestaurant.set(o.restaurantName, b);
      for (const i of o.items) byProduct.set(i.name, (byProduct.get(i.name) || 0) + i.quantity);
    } else {
      const refundAmt = o.refunds.reduce((s, x) => s + x.amount, 0);
      if (refundAmt > 0) {
        const b = byRestaurant.get(o.restaurantName) || { cancelled: 0, refunds: 0, refundAmount: 0 };
        b.refunds += o.refunds.length;
        b.refundAmount = round2(b.refundAmount + refundAmt);
        byRestaurant.set(o.restaurantName, b);
      }
    }
  }

  const total = cur.ordersCount + cur.cancelledOrders;

  return {
    cancelledOrders: cur.cancelledOrders,
    cancellationRate: total > 0 ? round2((cur.cancelledOrders / total) * 100) : 0,
    refundCount: cur.refundCount,
    partialRefunds: cur.partialRefunds,
    refundAmount: cur.refundAmount,
    grossRevenue: cur.revenue,
    netRevenue: cur.netRevenue,
    netRevenueImpact: round2(cur.refundAmount),
    byRestaurant: Array.from(byRestaurant.entries()).map(([name, v]) => ({ restaurant: name, ...v })),
    byProduct: sortDescBy(byProduct).slice(0, 20).map((x) => ({ product: x.key, cancelledQuantity: x.value })),
    trend: [],
  };
}

function buildBenchmarks(restaurantPerformance: any[]) {
  const active = restaurantPerformance.filter((r) => r.orders > 0);
  const revenues = active.map((r) => r.revenue);
  const orders = active.map((r) => r.orders);
  const aovs = active.map((r) => r.averageOrderValue);
  const cancellationRates = active.map((r) => r.cancellationRate);

  return {
    medianRestaurantRevenue: round2(median(revenues)),
    medianOrders: round2(median(orders)),
    medianAOV: round2(median(aovs)),
    medianCancellationRate: round2(median(cancellationRates)),
    medianReturningRate: null,
    methodology: 'Medians are computed across active restaurants (those with at least one non-cancelled order) in the selected period.',
    sampleSize: active.length,
  };
}

function buildGrowth(cur: any, prev: any, rows: OrderRow[], prevRows: OrderRow[]) {
  const paymentMethodShift = (a: Map<string, any>, b: Map<string, any>) => {
    const methods = new Set([...a.keys(), ...b.keys()]);
    return Array.from(methods).map((m) => {
      const curAmt = a.get(m)?.amount || 0;
      const prevAmt = b.get(m)?.amount || 0;
      return { method: m, current: curAmt, previous: prevAmt, changePct: pctChange(curAmt, prevAmt) };
    });
  };

  return {
    revenueGrowth: { current: cur.revenue, previous: prev.revenue, changePct: pctChange(cur.revenue, prev.revenue) },
    orderGrowth: { current: cur.ordersCount, previous: prev.ordersCount, changePct: pctChange(cur.ordersCount, prev.ordersCount) },
    customerGrowth: { current: cur.customerIds.size, previous: prev.customerIds.size, changePct: pctChange(cur.customerIds.size, prev.customerIds.size) },
    paymentMethodShifts: paymentMethodShift(cur.paymentMap, prev.paymentMap),
    peakHourChanges: [],
  };
}
