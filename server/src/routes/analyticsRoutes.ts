import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken, requirePermission } from '../middleware/authMiddleware';
import { requireFeature } from '../middleware/featureMiddleware';
import { validateUuidParams } from '../middleware/validation';
import { AnalyticsService } from '../services/analytics/analyticsService';
import { buildCsv, buildXlsx, type ExportRow } from '../services/exportService';
import type { AnalyticsPeriod } from '../services/analytics/periods';

export const analyticsRouter = Router();

function parseFilter(req: Request): { period: AnalyticsPeriod; date?: string; startDate?: string; endDate?: string } {
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
  };
}

function reportRows(data: any, report: string): { headers: string[]; rows: ExportRow[] } {
  switch (report) {
    case 'products': {
      const rows: ExportRow[] = [];
      for (const [kind, list] of [['Food', data.topFoods], ['Drink', data.topDrinks], ['Dessert', data.topDesserts]] as const) {
        for (const p of list) rows.push({ Kind: kind, Product: p.name, Category: p.category, Quantity: p.quantity, Revenue: p.revenue });
      }
      return { headers: ['Kind', 'Product', 'Category', 'Quantity', 'Revenue'], rows };
    }
    case 'categories':
      return {
        headers: ['Category', 'Quantity', 'Revenue', 'Revenue Share %'],
        rows: data.categoryPerformance.map((c: any) => ({ Category: c.name, Quantity: c.quantity, Revenue: c.revenue, 'Revenue Share %': c.revenueShare })),
      };
    case 'payments':
      return {
        headers: ['Method', 'Count', 'Amount', 'Share %'],
        rows: data.paymentBreakdown.map((p: any) => ({ Method: p.method, Count: p.count, Amount: p.amount, 'Share %': p.share })),
      };
    case 'combinations': {
      const rows: ExportRow[] = [];
      for (const c of data.combinations.foodDrink) rows.push({ Type: 'Food + Drink', Items: c.combination.join(' + '), Count: c.count });
      for (const c of data.combinations.foodDessert) rows.push({ Type: 'Food + Dessert', Items: c.combination.join(' + '), Count: c.count });
      for (const c of data.combinations.foodDrinkDessert) rows.push({ Type: 'Food + Drink + Dessert', Items: c.combination.join(' + '), Count: c.count });
      return { headers: ['Type', 'Items', 'Count'], rows };
    }
    case 'summary':
    default:
      return {
        headers: ['Metric', 'Value'],
        rows: [
          { Metric: 'Revenue', Value: data.summary.revenue },
          { Metric: 'Net Revenue', Value: data.summary.netRevenue },
          { Metric: 'Orders', Value: data.summary.orders },
          { Metric: 'Average Order Value', Value: data.summary.averageOrderValue },
          { Metric: 'Items Sold', Value: data.summary.itemsSold },
          { Metric: 'Average Items Per Order', Value: data.summary.averageItemsPerOrder },
          { Metric: 'Refunds', Value: data.summary.refunds },
          { Metric: 'Cancelled Orders', Value: data.summary.cancelledOrders },
          { Metric: 'New Customers', Value: data.summary.newCustomers },
          { Metric: 'Returning Customers', Value: data.summary.returningCustomers },
        ],
      };
  }
}

/**
 * GET /api/restaurants/:id/analytics
 * Restaurant analytics dashboard + insights (ADVANCED_ANALYTICS).
 */
analyticsRouter.get(
  '/restaurants/:id/analytics',
  validateUuidParams('id'),
  authenticateToken,
  requirePermission('VIEW_ORDERS'),
  requireFeature('ADVANCED_ANALYTICS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = parseFilter(req);
      const data = await AnalyticsService.getAnalytics(req.params.id, filter);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:id/analytics/export
 * CSV / XLSX export of filtered analytics (ANALYTICS_EXPORT).
 */
analyticsRouter.get(
  '/restaurants/:id/analytics/export',
  validateUuidParams('id'),
  authenticateToken,
  requirePermission('VIEW_ORDERS'),
  requireFeature('ANALYTICS_EXPORT'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = parseFilter(req);
      const format = String(req.query.format || 'csv');
      if (!['csv', 'xlsx'].includes(format)) {
        res.status(400).json({ success: false, errorCode: 'INVALID_EXPORT_FORMAT', message: 'Format must be one of: csv, xlsx.' });
        return;
      }
      const report = String(req.query.report || 'summary');
      const data = await AnalyticsService.getAnalytics(req.params.id, filter);
      const { headers, rows } = reportRows(data, report);

      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      const filename = `analytics_${report}.${ext}`;

      if (format === 'xlsx') {
        const buffer = await buildXlsx(headers, rows, `Analytics ${report}`);
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
  }
);
