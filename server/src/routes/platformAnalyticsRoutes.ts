import { Router, Request, Response, NextFunction } from 'express';
import { PlatformRole } from '@prisma/client';
import { requirePlatformRole } from '../middleware/authMiddleware';
import { PlatformAnalyticsService, type PlatformAnalyticsFilter } from '../services/platformAnalyticsService';
import { InsightService, flattenInsights } from '../services/insightService';
import { buildCsv, buildXlsx, type ExportRow } from '../services/exportService';
import type { AnalyticsPeriod } from '../services/analytics/periods';

export const platformAnalyticsRouter = Router();

platformAnalyticsRouter.use(requirePlatformRole(PlatformRole.PLATFORM_ADMIN));

function parseFilter(req: Request): PlatformAnalyticsFilter {
  const period = String(req.query.period || 'month') as AnalyticsPeriod;
  if (!['day', 'week', 'month', 'year', 'custom'].includes(period)) {
    const err: any = new Error("Period must be one of: day, week, month, year, custom.");
    err.statusCode = 400;
    err.errorCode = 'INVALID_ANALYTICS_PERIOD';
    throw err;
  }
  return {
    period,
    date: req.query.date ? String(req.query.date) : undefined,
    startDate: req.query.startDate ? String(req.query.startDate) : undefined,
    endDate: req.query.endDate ? String(req.query.endDate) : undefined,
    restaurantId: req.query.restaurantId ? String(req.query.restaurantId) : undefined,
  };
}

function reportRows(data: any, report: string): { headers: string[]; rows: ExportRow[] } {
  switch (report) {
    case 'restaurants':
      return {
        headers: ['Restaurant', 'Revenue', 'Orders', 'AOV', 'Items Sold', 'Customers', 'Cancellation %', 'Refunds', 'Growth %'],
        rows: data.restaurantPerformance.map((r: any) => ({
          Restaurant: r.name, Revenue: r.revenue, Orders: r.orders, AOV: r.averageOrderValue,
          'Items Sold': r.itemsSold, Customers: r.customers, 'Cancellation %': r.cancellationRate,
          Refunds: r.refunds, 'Growth %': r.growthPct ?? '',
        })),
      };
    case 'products': {
      const rows: ExportRow[] = [];
      for (const [kind, list] of [['Food', data.productIntelligence.topFoods], ['Drink', data.productIntelligence.topDrinks], ['Dessert', data.productIntelligence.topDesserts]] as const) {
        for (const p of list) rows.push({ Type: kind, Product: p.name, Category: p.category, Quantity: p.quantity, Revenue: p.revenue });
      }
      return { headers: ['Type', 'Product', 'Category', 'Quantity', 'Revenue'], rows };
    }
    case 'combinations': {
      const rows: ExportRow[] = [];
      for (const c of data.combinations.foodDrink) rows.push({ Type: 'Food + Drink', Items: c.combination.join(' + '), Count: c.count, Support: c.support, Confidence: c.confidence, Lift: c.lift });
      for (const c of data.combinations.foodDessert) rows.push({ Type: 'Food + Dessert', Items: c.combination.join(' + '), Count: c.count, Support: c.support, Confidence: c.confidence, Lift: c.lift });
      return { headers: ['Type', 'Items', 'Count', 'Support', 'Confidence', 'Lift'], rows };
    }
    case 'payments':
      return {
        headers: ['Method', 'Count', 'Revenue', 'Share %'],
        rows: data.paymentIntelligence.byMethod.map((p: any) => ({ Method: p.method, Count: p.count, Revenue: p.revenue, 'Share %': p.share })),
      };
    case 'cancellations':
      return {
        headers: ['Metric', 'Value'],
        rows: [
          { Metric: 'Cancelled Orders', Value: data.cancellationRefund.cancelledOrders },
          { Metric: 'Cancellation Rate %', Value: data.cancellationRefund.cancellationRate },
          { Metric: 'Refund Count', Value: data.cancellationRefund.refundCount },
          { Metric: 'Partial Refunds', Value: data.cancellationRefund.partialRefunds },
          { Metric: 'Refund Amount', Value: data.cancellationRefund.refundAmount },
          { Metric: 'Gross Revenue', Value: data.cancellationRefund.grossRevenue },
          { Metric: 'Net Revenue', Value: data.cancellationRefund.netRevenue },
        ],
      };
    case 'summary':
    default:
      return {
        headers: ['Metric', 'Value'],
        rows: [
          { Metric: 'Total Revenue', Value: data.kpis.totalRevenue },
          { Metric: 'Net Revenue', Value: data.kpis.netRevenue },
          { Metric: 'Total Orders', Value: data.kpis.totalOrders },
          { Metric: 'Average Order Value', Value: data.kpis.averageOrderValue },
          { Metric: 'Items Sold', Value: data.kpis.itemsSold },
          { Metric: 'Unique Customers', Value: data.kpis.uniqueCustomers },
          { Metric: 'Returning Customer Rate %', Value: data.kpis.returningCustomerRate },
          { Metric: 'Cancellation Rate %', Value: data.kpis.cancellationRate },
          { Metric: 'Refund Amount', Value: data.kpis.refundAmount },
          { Metric: 'Average Items / Order', Value: data.kpis.averageItemsPerOrder },
          { Metric: 'Revenue Growth %', Value: data.kpis.revenueGrowthPct ?? '' },
          { Metric: 'Order Growth %', Value: data.kpis.orderGrowthPct ?? '' },
        ],
      };
  }
}

platformAnalyticsRouter.get('/analytics', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter = parseFilter(req);
    const data = await PlatformAnalyticsService.getPlatformAnalytics(filter);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

platformAnalyticsRouter.get('/analytics/export', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter = parseFilter(req);
    const format = String(req.query.format || 'csv');
    if (!['csv', 'xlsx'].includes(format)) {
      res.status(400).json({ success: false, errorCode: 'INVALID_EXPORT_FORMAT', message: 'Format must be one of: csv, xlsx.' });
      return;
    }
    const report = String(req.query.report || 'summary');
    const data = await PlatformAnalyticsService.getPlatformAnalytics(filter);
    const { headers, rows } = reportRows(data, report);

    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    const filename = `platform-analytics_${report}.${ext}`;

    if (format === 'xlsx') {
      const buffer = await buildXlsx(headers, rows, `Platform ${report}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buildCsv(headers, rows));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/platform/ai-insights
 * Platform-wide data-driven insights (PLATFORM_ADMIN only).
 */
platformAnalyticsRouter.get('/ai-insights', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter = parseFilter(req);
    const analytics = await PlatformAnalyticsService.getPlatformAnalytics(filter);
    const result = InsightService.generatePlatformInsights(analytics);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/platform/ai-insights/export
 * CSV / XLSX export of platform insights (PLATFORM_ADMIN only).
 */
platformAnalyticsRouter.get('/ai-insights/export', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter = parseFilter(req);
    const format = String(req.query.format || 'csv');
    if (!['csv', 'xlsx'].includes(format)) {
      res.status(400).json({ success: false, errorCode: 'INVALID_EXPORT_FORMAT', message: 'Format must be one of: csv, xlsx.' });
      return;
    }
    const analytics = await PlatformAnalyticsService.getPlatformAnalytics(filter);
    const result = InsightService.generatePlatformInsights(analytics);
    const { headers, rows } = flattenInsights(result);

    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    const filename = `platform-ai-insights.${ext}`;

    if (format === 'xlsx') {
      const buffer = await buildXlsx(headers, rows, 'Platform AI Insights');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buildCsv(headers, rows));
  } catch (err) {
    next(err);
  }
});
