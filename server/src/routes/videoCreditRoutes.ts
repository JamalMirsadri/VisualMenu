import { Router, Request, Response, NextFunction } from 'express';
import { PlatformRole, AuditAction } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePlatformRole } from '../middleware/authMiddleware';
import { validateUuidParams } from '../middleware/validation';
import { VideoCreditService } from '../services/video/videoCreditService';
import { AuditService } from '../services/auditService';

export const videoCreditRouter = Router();
videoCreditRouter.use(requirePlatformRole(PlatformRole.PLATFORM_ADMIN));

// -----------------------------------------------------------------------------
// Credit packs (configurable)
// -----------------------------------------------------------------------------

videoCreditRouter.get('/video-credit-packs', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const packs = await prisma.videoCreditPack.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, data: packs });
  } catch (err) {
    next(err);
  }
});

videoCreditRouter.post('/video-credit-packs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, credits, price, currency, sortOrder } = req.body || {};
    if (!name || !credits || price === undefined) {
      res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'name, credits, and price are required.' });
      return;
    }
    const pack = await prisma.videoCreditPack.create({
      data: {
        name: String(name).trim(),
        credits: Math.floor(Number(credits)),
        price: Number(price),
        currency: currency ? String(currency) : 'EUR',
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        active: true,
      },
    });
    res.status(201).json({ success: true, data: pack });
  } catch (err) {
    next(err);
  }
});

videoCreditRouter.patch('/video-credit-packs/:id', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await prisma.videoCreditPack.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, errorCode: 'PACK_NOT_FOUND', message: 'Credit pack not found.' });
      return;
    }
    const { name, credits, price, currency, sortOrder, active } = req.body || {};
    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (credits !== undefined) data.credits = Math.floor(Number(credits));
    if (price !== undefined) data.price = Number(price);
    if (currency !== undefined) data.currency = String(currency);
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    if (active !== undefined) data.active = Boolean(active);

    const pack = await prisma.videoCreditPack.update({ where: { id: existing.id }, data });
    res.json({ success: true, data: pack });
  } catch (err) {
    next(err);
  }
});

videoCreditRouter.delete('/video-credit-packs/:id', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await prisma.videoCreditPack.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, errorCode: 'PACK_NOT_FOUND', message: 'Credit pack not found.' });
      return;
    }
    await prisma.videoCreditPack.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Credit pack deleted.' });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// Restaurant credit administration
// -----------------------------------------------------------------------------

// GET /api/platform/video-credits/restaurants — balances across restaurants
videoCreditRouter.get('/video-credits/restaurants', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const restaurants = await prisma.restaurant.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true, slug: true, active: true } });
    const rows = [];
    for (const r of restaurants) {
      const s = await VideoCreditService.getBalanceSummary(r.id);
      rows.push({ id: r.id, name: r.name, slug: r.slug, active: r.active, ...s });
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/platform/video-credits/restaurants/:id — balance + ledger + purchases
videoCreditRouter.get('/video-credits/restaurants/:id', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.params.id } });
    if (!restaurant) {
      res.status(404).json({ success: false, errorCode: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
      return;
    }
    const [summary, ledger, purchases] = await Promise.all([
      VideoCreditService.getBalanceSummary(restaurant.id),
      VideoCreditService.listLedger(restaurant.id),
      prisma.videoCreditPurchase.findMany({ where: { restaurantId: restaurant.id }, orderBy: { createdAt: 'desc' }, include: { pack: true } }),
    ]);
    res.json({ success: true, data: { restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug }, ...summary, ledger, purchases } });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform/video-credits/restaurants/:id/grants — manual grant
videoCreditRouter.post('/video-credits/restaurants/:id/grants', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.params.id } });
    if (!restaurant) {
      res.status(404).json({ success: false, errorCode: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
      return;
    }
    const result = await VideoCreditService.grantManual(restaurant.id, req.body?.amount, req.user?.id, req.body?.reference);
    await AuditService.log({
      restaurantId: restaurant.id,
      userId: req.user?.id,
      action: AuditAction.UPDATE,
      entityType: 'VideoCredit',
      entityId: result.ledgerId,
      metadata: { action: 'manual_grant', amount: req.body?.amount },
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err?.statusCode && err?.errorCode) {
      res.status(err.statusCode).json({ success: false, errorCode: err.errorCode, message: err.message });
      return;
    }
    next(err);
  }
});

// POST /api/platform/video-credits/restaurants/:id/purchases — purchased pack
videoCreditRouter.post('/video-credits/restaurants/:id/purchases', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.params.id } });
    if (!restaurant) {
      res.status(404).json({ success: false, errorCode: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
      return;
    }
    if (!req.body?.packId) {
      res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'packId is required.' });
      return;
    }
    const result = await VideoCreditService.purchaseCredits(restaurant.id, String(req.body.packId), req.user?.id);
    await AuditService.log({
      restaurantId: restaurant.id,
      userId: req.user?.id,
      action: AuditAction.UPDATE,
      entityType: 'VideoCredit',
      entityId: result.purchase.id,
      metadata: { action: 'purchase', packId: req.body.packId, credits: result.purchase.credits },
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err?.statusCode && err?.errorCode) {
      res.status(err.statusCode).json({ success: false, errorCode: err.errorCode, message: err.message });
      return;
    }
    next(err);
  }
});
