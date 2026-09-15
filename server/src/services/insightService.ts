export interface InsightComparison {
  current: number;
  previous: number;
  changePct: number;
}

export interface Insight {
  type: string;
  title: string;
  explanation: string;
  metric: string;
  value: number | string;
  comparison: InsightComparison | null;
  sampleSize: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  supportingData: Record<string, any>;
  dateRange: { start: string; end: string };
  methodology: string;
}

export interface InsightResult {
  insights: Insight[];
  recommendations: Insight[];
  anomalies: Insight[];
  insufficientData: string[];
}

export const INSIGHT_THRESHOLDS = {
  minOrdersForTrend: 5,
  minOrdersForPeak: 5,
  minCombinationCount: 3,
  minProductQuantity: 5,
  minPaymentsForShare: 5,
  minReturningRateSample: 10,
  significantChangePct: 20,
  anomalyZScore: 2,
  minAnomalyTotalOrders: 30,
  minAnomalyNonZeroHours: 5,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return round2(((current - previous) / previous) * 100);
}

function confidenceFor(sampleSize: number, threshold: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (sampleSize >= threshold * 3) return 'HIGH';
  return 'MEDIUM';
}

function dateRangeFrom(analytics: any): { start: string; end: string } {
  const p = analytics?.period?.current;
  return { start: p?.start || '', end: p?.end || '' };
}

export function flattenInsights(result: InsightResult): { headers: string[]; rows: Record<string, string | number>[] } {
  const headers = ['Type', 'Title', 'Explanation', 'Metric', 'Value', 'Sample Size', 'Confidence', 'Methodology'];
  const rows: Record<string, string | number>[] = [];
  for (const list of [result.insights, result.recommendations, result.anomalies]) {
    for (const i of list) {
      rows.push({
        Type: i.type,
        Title: i.title,
        Explanation: i.explanation,
        Metric: i.metric,
        Value: i.value,
        'Sample Size': i.sampleSize,
        Confidence: i.confidence,
        Methodology: i.methodology,
      });
    }
  }
  return { headers, rows };
}

function make(partial: Omit<Insight, 'dateRange'>, analytics: any): Insight {
  return { ...partial, dateRange: dateRangeFrom(analytics) };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Hourly anomaly detection via transparent z-score rule (>2 std from mean).
 * Suppresses anomalies when the sample is too sparse to be reliable.
 */
function detectHourlyAnomalies(
  analytics: any,
  buckets: any[],
  metricKey: string,
  totalOrders: number,
): { anomalies: Insight[]; insufficient: boolean } {
  const list = buckets || [];
  const nonZeroHours = list.filter((b) => (Number(b[metricKey]) || 0) > 0).length;
  if (
    totalOrders < INSIGHT_THRESHOLDS.minAnomalyTotalOrders ||
    nonZeroHours < INSIGHT_THRESHOLDS.minAnomalyNonZeroHours
  ) {
    return { anomalies: [], insufficient: true };
  }

  const values = list.map((b) => Number(b[metricKey]) || 0);
  const m = mean(values);
  const sd = stddev(values);
  const out: Insight[] = [];
  if (sd === 0) return { anomalies: out, insufficient: false };
  for (const b of list) {
    const v = Number(b[metricKey]) || 0;
    const z = (v - m) / sd;
    if (z > INSIGHT_THRESHOLDS.anomalyZScore) {
      out.push(make({
        type: 'ANOMALY_HIGH',
        title: `Unusually high ${metricKey} at hour ${b.hour}`,
        explanation: `Hour ${b.hour} recorded ${metricKey} of ${v}, ${round2(z)} standard deviations above the period hourly mean of ${round2(m)}.`,
        metric: metricKey,
        value: v,
        comparison: null,
        sampleSize: list.length,
        confidence: 'MEDIUM',
        supportingData: { hour: b.hour, value: v, mean: round2(m), stdDev: round2(sd), zScore: round2(z) },
        methodology: 'Anomaly flagged when a value exceeds 2 standard deviations from the period hourly mean (z-score rule).',
      }, analytics));
    } else if (z < -INSIGHT_THRESHOLDS.anomalyZScore) {
      out.push(make({
        type: 'ANOMALY_LOW',
        title: `Unusually low ${metricKey} at hour ${b.hour}`,
        explanation: `Hour ${b.hour} recorded ${metricKey} of ${v}, ${round2(z)} standard deviations below the period hourly mean of ${round2(m)}.`,
        metric: metricKey,
        value: v,
        comparison: null,
        sampleSize: list.length,
        confidence: 'MEDIUM',
        supportingData: { hour: b.hour, value: v, mean: round2(m), stdDev: round2(sd), zScore: round2(z) },
        methodology: 'Anomaly flagged when a value falls below 2 standard deviations from the period hourly mean (z-score rule).',
      }, analytics));
    }
  }
  return { anomalies: out, insufficient: false };
}

function trendInsight(analytics: any, current: number, previous: number, sampleSize: number, label: string, metricKey: string): Insight | null {
  if (sampleSize < INSIGHT_THRESHOLDS.minOrdersForTrend) return null;
  if (!previous) return null;
  const changePct = pctChange(current, previous);
  if (changePct === null || Math.abs(changePct) < INSIGHT_THRESHOLDS.significantChangePct) return null;
  const dir = changePct >= 0 ? 'increased' : 'decreased';
  return make({
    type: 'TREND',
    title: `${label} ${dir} by ${Math.abs(changePct)}%`,
    explanation: `${label} was ${current} in the current period versus ${previous} in the previous equivalent period (${changePct}% ${dir}).`,
    metric: metricKey,
    value: current,
    comparison: { current, previous, changePct },
    sampleSize,
    confidence: confidenceFor(sampleSize, INSIGHT_THRESHOLDS.minOrdersForTrend),
    supportingData: { current, previous, changePct },
    methodology: 'Trend computed as percentage change versus the previous equivalent period; shown only when sample size exceeds the configured minimum.',
  }, analytics);
}

export class InsightService {
  static generateRestaurantInsights(analytics: any): InsightResult {
    const insights: Insight[] = [];
    const recommendations: Insight[] = [];
    const insufficient: string[] = [];
    const s = analytics?.summary || {};

    // Revenue trend
    const revTrend = trendInsight(analytics, s.revenue, s.previous?.revenue, s.orders, 'Revenue', 'revenue');
    if (revTrend) insights.push(revTrend);

    // Product share (top items)
    for (const [kindLabel, list] of [['Food', analytics?.topFoods], ['Drink', analytics?.topDrinks], ['Dessert', analytics?.topDesserts]] as const) {
      for (const p of (list || []).slice(0, 3)) {
        if (p.quantity >= INSIGHT_THRESHOLDS.minProductQuantity) {
          const share = s.revenue > 0 ? round2((p.revenue / s.revenue) * 100) : 0;
          insights.push(make({
            type: 'PRODUCT_SHARE',
            title: `${p.name} sold ${p.quantity} units (${share}% of revenue)`,
            explanation: `${p.name} (${kindLabel}) sold ${p.quantity} units and generated €${round2(p.revenue)} in revenue, representing ${share}% of total revenue.`,
            metric: `${kindLabel.toLowerCase()}_revenue_share`,
            value: `${share}%`,
            comparison: null,
            sampleSize: p.quantity,
            confidence: confidenceFor(p.quantity, INSIGHT_THRESHOLDS.minProductQuantity),
            supportingData: { name: p.name, kind: kindLabel, quantity: p.quantity, revenue: round2(p.revenue), share },
            methodology: 'Product share is quantity and revenue as a percentage of the period total; only shown when quantity meets the minimum sample threshold.',
          }, analytics));
        }
      }
    }

    // Product growth/decline
    for (const g of (analytics?.productInsights?.growthDecline || []).slice(0, 10)) {
      if (g.previousQuantity >= INSIGHT_THRESHOLDS.minProductQuantity && Math.abs(g.changePct) >= INSIGHT_THRESHOLDS.significantChangePct) {
        const dir = g.changePct >= 0 ? 'increased' : 'declined';
        insights.push(make({
          type: 'PRODUCT_TREND',
          title: `${g.name} ${dir} by ${Math.abs(g.changePct)}%`,
          explanation: `${g.name} moved from ${g.previousQuantity} to ${g.currentQuantity} units (${g.changePct}% ${dir}) versus the previous period.`,
          metric: 'product_quantity_change',
          value: `${g.changePct}%`,
          comparison: { current: g.currentQuantity, previous: g.previousQuantity, changePct: g.changePct },
          sampleSize: g.previousQuantity,
          confidence: confidenceFor(g.previousQuantity, INSIGHT_THRESHOLDS.minProductQuantity),
          supportingData: { name: g.name, currentQuantity: g.currentQuantity, previousQuantity: g.previousQuantity, changePct: g.changePct },
          methodology: 'Product trend is quantity change versus the previous equivalent period; correlation is not implied.',
        }, analytics));

        if (g.changePct <= -INSIGHT_THRESHOLDS.significantChangePct) {
          recommendations.push(make({
            type: 'RECOMMENDATION_DECLINING',
            title: `Review ${g.name} (sales declined ${Math.abs(g.changePct)}%)`,
            explanation: `${g.name} declined from ${g.previousQuantity} to ${g.currentQuantity} units (${g.changePct}%). Review its menu placement or availability.`,
            metric: 'product_quantity_change',
            value: `${g.changePct}%`,
            comparison: { current: g.currentQuantity, previous: g.previousQuantity, changePct: g.changePct },
            sampleSize: g.previousQuantity,
            confidence: confidenceFor(g.previousQuantity, INSIGHT_THRESHOLDS.minProductQuantity),
            supportingData: { name: g.name, currentQuantity: g.currentQuantity, previousQuantity: g.previousQuantity },
            methodology: 'Recommendation emitted only when a product shows a measured decline above the significance threshold.',
          }, analytics));
        }
      }
    }

    // Combinations (co-occurrence)
    for (const c of (analytics?.combinations?.foodDrink || []).slice(0, 10)) {
      if (c.count >= INSIGHT_THRESHOLDS.minCombinationCount) {
        insights.push(make({
          type: 'COMBINATION',
          title: `${c.combination.join(' + ')} occurred together ${c.count} times`,
          explanation: `The combination "${c.combination.join(' + ')}" was ordered together ${c.count} times in the selected period.`,
          metric: 'co_occurrence_count',
          value: c.count,
          comparison: null,
          sampleSize: c.count,
          confidence: confidenceFor(c.count, INSIGHT_THRESHOLDS.minCombinationCount),
          supportingData: { combination: c.combination, count: c.count },
          methodology: 'Combination frequency is the number of orders containing both items; low-frequency combinations are suppressed.',
        }, analytics));

        if (c.count >= INSIGHT_THRESHOLDS.minCombinationCount * 2) {
          recommendations.push(make({
            type: 'RECOMMENDATION_BUNDLE',
            title: `Bundle opportunity: ${c.combination.join(' + ')}`,
            explanation: `The combination "${c.combination.join(' + ')}" appears ${c.count} times, exceeding the bundle recommendation threshold.`,
            metric: 'co_occurrence_count',
            value: c.count,
            comparison: null,
            sampleSize: c.count,
            confidence: confidenceFor(c.count, INSIGHT_THRESHOLDS.minCombinationCount),
            supportingData: { combination: c.combination, count: c.count },
            methodology: 'Bundle recommended only when co-occurrence count exceeds twice the minimum sample threshold.',
          }, analytics));
        }
      }
    }

    // Peak / quiet hours
    const hourBuckets = analytics?.salesByHour || [];
    const maxHour = [...hourBuckets].sort((a, b) => b.orders - a.orders)[0];
    if (maxHour && maxHour.orders >= INSIGHT_THRESHOLDS.minOrdersForPeak) {
      insights.push(make({
        type: 'TIME_PEAK',
        title: `Peak demand at hour ${maxHour.hour}`,
        explanation: `Hour ${maxHour.hour} had the highest order volume (${maxHour.orders} orders, €${round2(maxHour.revenue)} revenue).`,
        metric: 'hourly_orders',
        value: maxHour.orders,
        comparison: null,
        sampleSize: maxHour.orders,
        confidence: confidenceFor(maxHour.orders, INSIGHT_THRESHOLDS.minOrdersForPeak),
        supportingData: { hour: maxHour.hour, orders: maxHour.orders, revenue: round2(maxHour.revenue) },
        methodology: 'Peak hour is the hour with the maximum order count in the selected period.',
      }, analytics));
    }

    // Payment share
    for (const p of (analytics?.paymentBreakdown || []).slice(0, 5)) {
      if (p.count >= INSIGHT_THRESHOLDS.minPaymentsForShare) {
        insights.push(make({
          type: 'PAYMENT_SHARE',
          title: `${p.method} represents ${p.share}% of transactions`,
          explanation: `${p.method} accounted for ${p.count} payments (€${round2(p.amount)}), ${p.share}% of collected transactions.`,
          metric: 'payment_share',
          value: `${p.share}%`,
          comparison: null,
          sampleSize: p.count,
          confidence: confidenceFor(p.count, INSIGHT_THRESHOLDS.minPaymentsForShare),
          supportingData: { method: p.method, count: p.count, amount: round2(p.amount), share: p.share },
          methodology: 'Payment share is the method count/amount as a percentage of the period total.',
        }, analytics));
      }
    }

    // Returning customer rate
    const customerSample = (s.newCustomers || 0) + (s.returningCustomers || 0);
    if (customerSample >= INSIGHT_THRESHOLDS.minReturningRateSample) {
      const rate = customerSample > 0 ? round2(((s.returningCustomers || 0) / customerSample) * 100) : 0;
      insights.push(make({
        type: 'CUSTOMER_RETENTION',
        title: `Returning customer rate is ${rate}%`,
        explanation: `${s.returningCustomers} of ${customerSample} customers were returning customers (${rate}%).`,
        metric: 'returning_customer_rate',
        value: `${rate}%`,
        comparison: null,
        sampleSize: customerSample,
        confidence: confidenceFor(customerSample, INSIGHT_THRESHOLDS.minReturningRateSample),
        supportingData: { returning: s.returningCustomers || 0, new: s.newCustomers || 0, rate },
        methodology: 'Returning rate is returning customers divided by total distinct customers in the period.',
      }, analytics));

      if (rate < 30) {
        recommendations.push(make({
          type: 'RECOMMENDATION_RETENTION',
          title: 'Customer retention opportunity',
          explanation: `Only ${rate}% of customers returned in this period, below the 30% reference point.`,
          metric: 'returning_customer_rate',
          value: `${rate}%`,
          comparison: null,
          sampleSize: customerSample,
          confidence: confidenceFor(customerSample, INSIGHT_THRESHOLDS.minReturningRateSample),
          supportingData: { rate, returning: s.returningCustomers || 0, new: s.newCustomers || 0 },
          methodology: 'Retention opportunity flagged when returning rate is below 30% with sufficient sample.',
        }, analytics));
      }
    }

    const anomalyResult = detectHourlyAnomalies(analytics, hourBuckets, 'revenue', s.orders || 0);
    const anomalies = anomalyResult.anomalies;
    if (anomalyResult.insufficient) {
      insufficient.push('Insufficient data for reliable anomaly detection.');
    }
    if (s.orders < INSIGHT_THRESHOLDS.minOrdersForTrend) {
      insufficient.push('Insufficient orders to compute reliable trends.');
    }

    return { insights, recommendations, anomalies, insufficientData: insufficient };
  }

  static generatePlatformInsights(analytics: any): InsightResult {
    const insights: Insight[] = [];
    const recommendations: Insight[] = [];
    const insufficient: string[] = [];
    const k = analytics?.kpis || {};
    const pi = analytics?.productIntelligence || {};

    const revTrend = trendInsight(analytics, k.totalRevenue, k.previous?.totalRevenue, k.totalOrders, 'Platform revenue', 'revenue');
    if (revTrend) insights.push(revTrend);
    const ordTrend = trendInsight(analytics, k.totalOrders, k.previous?.totalOrders, k.totalOrders, 'Platform orders', 'orders');
    if (ordTrend) insights.push(ordTrend);

    for (const [kindLabel, list] of [['Food', pi.topFoods], ['Drink', pi.topDrinks], ['Dessert', pi.topDesserts]] as const) {
      for (const p of (list || []).slice(0, 3)) {
        if (p.quantity >= INSIGHT_THRESHOLDS.minProductQuantity) {
          insights.push(make({
            type: 'PRODUCT_SHARE',
            title: `${p.name} is a top ${kindLabel.toLowerCase()} (${p.quantity} units)`,
            explanation: `${p.name} sold ${p.quantity} units and €${round2(p.revenue)} across the platform.`,
            metric: `${kindLabel.toLowerCase()}_quantity`,
            value: p.quantity,
            comparison: null,
            sampleSize: p.quantity,
            confidence: confidenceFor(p.quantity, INSIGHT_THRESHOLDS.minProductQuantity),
            supportingData: { name: p.name, kind: kindLabel, quantity: p.quantity, revenue: round2(p.revenue) },
            methodology: 'Top products ranked by quantity; only shown above the minimum sample threshold.',
          }, analytics));
        }
      }
    }

    // Combinations with support/confidence/lift
    for (const c of (analytics?.combinations?.foodDrink || []).slice(0, 10)) {
      if (c.count >= INSIGHT_THRESHOLDS.minCombinationCount) {
        insights.push(make({
          type: 'COMBINATION',
          title: `${c.combination.join(' + ')} — support ${c.support}, lift ${c.lift}`,
          explanation: `${c.combination.join(' + ')} co-occurred ${c.count} times with support ${c.support}, confidence ${c.confidence}, and lift ${c.lift}.`,
          metric: 'market_basket',
          value: c.count,
          comparison: null,
          sampleSize: c.count,
          confidence: confidenceFor(c.count, INSIGHT_THRESHOLDS.minCombinationCount),
          supportingData: { combination: c.combination, count: c.count, support: c.support, confidence: c.confidence, lift: c.lift },
          methodology: 'Support = count / total orders; confidence = count / antecedent count; lift = confidence / consequent support. Low-frequency pairs are suppressed.',
        }, analytics));

        if (c.lift > 1 && c.count >= INSIGHT_THRESHOLDS.minCombinationCount * 2) {
          recommendations.push(make({
            type: 'RECOMMENDATION_BUNDLE',
            title: `Strong affinity: ${c.combination.join(' + ')}`,
            explanation: `${c.combination.join(' + ')} has lift ${c.lift} (>1), indicating a positive association suitable for bundling.`,
            metric: 'lift',
            value: c.lift,
            comparison: null,
            sampleSize: c.count,
            confidence: confidenceFor(c.count, INSIGHT_THRESHOLDS.minCombinationCount),
            supportingData: { combination: c.combination, count: c.count, lift: c.lift },
            methodology: 'Bundle recommended when lift > 1 and sample exceeds twice the minimum threshold.',
          }, analytics));
        }
      }
    }

    // Product growth/decline
    for (const g of (pi.productGrowthDecline || []).slice(0, 10)) {
      if (g.previousQuantity >= INSIGHT_THRESHOLDS.minProductQuantity && Math.abs(g.changePct) >= INSIGHT_THRESHOLDS.significantChangePct) {
        insights.push(make({
          type: 'PRODUCT_TREND',
          title: `${g.name} ${g.changePct >= 0 ? 'grew' : 'declined'} ${Math.abs(g.changePct)}%`,
          explanation: `${g.name} moved from ${g.previousQuantity} to ${g.currentQuantity} units (${g.changePct}%).`,
          metric: 'product_quantity_change',
          value: `${g.changePct}%`,
          comparison: { current: g.currentQuantity, previous: g.previousQuantity, changePct: g.changePct },
          sampleSize: g.previousQuantity,
          confidence: confidenceFor(g.previousQuantity, INSIGHT_THRESHOLDS.minProductQuantity),
          supportingData: { name: g.name, currentQuantity: g.currentQuantity, previousQuantity: g.previousQuantity, changePct: g.changePct },
          methodology: 'Product trend is quantity change versus the previous period.',
        }, analytics));
      }
    }

    // Payment share
    for (const p of (analytics?.paymentIntelligence?.byMethod || []).slice(0, 5)) {
      if (p.count >= INSIGHT_THRESHOLDS.minPaymentsForShare) {
        insights.push(make({
          type: 'PAYMENT_SHARE',
          title: `${p.method} represents ${p.share}% of payments`,
          explanation: `${p.method} accounted for ${p.count} transactions (€${round2(p.revenue)}), ${p.share}% of collected payments.`,
          metric: 'payment_share',
          value: `${p.share}%`,
          comparison: null,
          sampleSize: p.count,
          confidence: confidenceFor(p.count, INSIGHT_THRESHOLDS.minPaymentsForShare),
          supportingData: { method: p.method, count: p.count, revenue: round2(p.revenue), share: p.share },
          methodology: 'Payment share is method count/revenue as a percentage of the platform total.',
        }, analytics));
      }
    }

    // Customer retention
    const cb = analytics?.customerBehavior || {};
    const customerSample = (cb.newCustomers || 0) + (cb.returningCustomers || 0);
    if (customerSample >= INSIGHT_THRESHOLDS.minReturningRateSample) {
      insights.push(make({
        type: 'CUSTOMER_RETENTION',
        title: `Platform returning customer rate is ${cb.repeatPurchaseRate}%`,
        explanation: `${cb.returningCustomers} of ${customerSample} customers returned; repeat purchase rate is ${cb.repeatPurchaseRate}%.`,
        metric: 'returning_customer_rate',
        value: `${cb.repeatPurchaseRate}%`,
        comparison: null,
        sampleSize: customerSample,
        confidence: confidenceFor(customerSample, INSIGHT_THRESHOLDS.minReturningRateSample),
        supportingData: { new: cb.newCustomers, returning: cb.returningCustomers, repeatPurchaseRate: cb.repeatPurchaseRate },
        methodology: 'Returning rate derived from aggregated anonymized customer counts.',
      }, analytics));
    }

    // Benchmark deviations
    const median = analytics?.benchmarks?.medianRestaurantRevenue || 0;
    for (const r of (analytics?.restaurantPerformance || []).slice(0, 20)) {
      if (r.orders > 0 && median > 0) {
        const dev = pctChange(r.revenue, median);
        if (dev !== null && Math.abs(dev) >= INSIGHT_THRESHOLDS.significantChangePct) {
          insights.push(make({
            type: 'BENCHMARK_DEVIATION',
            title: `${r.name} revenue is ${Math.abs(dev)}% ${dev >= 0 ? 'above' : 'below'} platform median`,
            explanation: `${r.name} revenue (€${round2(r.revenue)}) is ${Math.abs(dev)}% ${dev >= 0 ? 'above' : 'below'} the platform median (€${round2(median)}).`,
            metric: 'revenue_vs_median',
            value: `${dev}%`,
            comparison: { current: r.revenue, previous: median, changePct: dev },
            sampleSize: r.orders,
            confidence: confidenceFor(r.orders, INSIGHT_THRESHOLDS.minOrdersForTrend),
            supportingData: { restaurant: r.name, revenue: round2(r.revenue), median: round2(median), deviationPct: dev },
            methodology: 'Deviation is the percentage difference between restaurant revenue and the platform median.',
          }, analytics));
        }
      }
    }

    const anomalyResult = detectHourlyAnomalies(analytics, analytics?.timeAnalysis?.ordersByHour || [], 'orders', k.totalOrders || 0);
    const anomalies = anomalyResult.anomalies;
    if (anomalyResult.insufficient) {
      insufficient.push('Insufficient data for reliable anomaly detection.');
    }
    if ((k.totalOrders || 0) < INSIGHT_THRESHOLDS.minOrdersForTrend) {
      insufficient.push('Insufficient orders to compute reliable platform trends.');
    }

    return { insights, recommendations, anomalies, insufficientData: insufficient };
  }
}
