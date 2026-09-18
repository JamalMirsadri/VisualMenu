import { Router, Request, Response, NextFunction } from 'express';
import { validateUuidParams } from '../middleware/validation';
import { requirePublicFeature } from '../middleware/featureMiddleware';
import { requireGamePlayerToken } from '../middleware/gameAuthMiddleware';
import { gameActionRateLimiter, gameRollRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../prisma';
import { GameService } from '../services/gameService';
import { realtimeService } from '../services/realtimeService';
import { GAME_CHANNEL, TABLE_CHANNEL } from '../services/gameRealtime';
import { LADDERS, SNAKES } from '../constants/game';

/**
 * Customer-facing Snakes & Ladders endpoints.
 *
 * Public + restaurant-scoped + GAMES_LOYALTY-gated. Actions that mutate a game
 * require a short-lived signed gamePlayerToken (issued on create/join).
 */
export const gameRouter = Router();

const gate = [validateUuidParams('restaurantId'), requirePublicFeature('GAMES_LOYALTY')];

/**
 * GET /api/restaurants/:restaurantId/games/availability
 * Public game availability + enabled modes (feature-gated). Used by the
 * customer lobby to decide whether/how to surface "Play While You Wait".
 */
gameRouter.get(
  '/restaurants/:restaurantId/games/availability',
  gate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await prisma.gameConfig.findUnique({ where: { restaurantId: req.params.restaurantId } });
      res.status(200).json({
        success: true,
        data: {
          enabled: Boolean(config?.enabled),
          modes: config?.modes ?? [],
          minPlayers: config?.minPlayers ?? 2,
          maxPlayers: config?.maxPlayers ?? 6,
          turnTimeoutSeconds: config?.turnTimeoutSeconds ?? 30,
          ladders: Object.entries(LADDERS).map(([from, to]) => ({ from: Number(from), to })),
          snakes: Object.entries(SNAKES).map(([from, to]) => ({ from: Number(from), to })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/games/private
 * Create a private same-table lobby; caller becomes host.
 */
gameRouter.post(
  '/restaurants/:restaurantId/games/private',
  [gameActionRateLimiter, ...gate],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tableId, alias, playerKey, customerId } = req.body || {};
      if (!tableId || !alias) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'tableId and alias are required.' });
        return;
      }
      const result = await GameService.createPrivate(req.params.restaurantId, tableId, String(alias), playerKey, customerId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/games/table/:tableId
 * Discover the waiting private game for a table (or null).
 */
gameRouter.get(
  '/restaurants/:restaurantId/games/table/:tableId',
  [...gate, validateUuidParams('tableId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await GameService.getTableWaitingGame(req.params.restaurantId, req.params.tableId);
      res.status(200).json({ success: true, data: { game } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/games/random
 * Join random matchmaking within this restaurant.
 */
gameRouter.post(
  '/restaurants/:restaurantId/games/random',
  [gameActionRateLimiter, ...gate],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { alias, playerKey, customerId } = req.body || {};
      if (!alias) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'alias is required.' });
        return;
      }
      const result = await GameService.joinRandom(req.params.restaurantId, String(alias), playerKey, customerId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/games/:gameSessionId/join
 * Join a waiting private game from the same table.
 */
gameRouter.post(
  '/restaurants/:restaurantId/games/:gameSessionId/join',
  [gameActionRateLimiter, ...gate, validateUuidParams('gameSessionId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tableId, alias, playerKey, customerId } = req.body || {};
      if (!tableId || !alias) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'tableId and alias are required.' });
        return;
      }
      const result = await GameService.joinPrivate(req.params.restaurantId, req.params.gameSessionId, tableId, String(alias), playerKey, customerId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/games/:gameSessionId
 * Get the current game state for the authenticated player.
 */
gameRouter.get(
  '/restaurants/:restaurantId/games/:gameSessionId',
  [...gate, validateUuidParams('gameSessionId'), requireGamePlayerToken],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await GameService.getGame(req.gameRestaurantId!, req.gameSessionId!, req.gamePlayerId!);
      res.status(200).json({ success: true, data: { game } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/games/:gameSessionId/start
 * Host starts a waiting game.
 */
gameRouter.post(
  '/restaurants/:restaurantId/games/:gameSessionId/start',
  [gameActionRateLimiter, ...gate, validateUuidParams('gameSessionId'), requireGamePlayerToken],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await GameService.start(req.gameRestaurantId!, req.gameSessionId!, req.gamePlayerId!);
      res.status(200).json({ success: true, data: { game } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/games/:gameSessionId/cancel
 * Host cancels a waiting game.
 */
gameRouter.post(
  '/restaurants/:restaurantId/games/:gameSessionId/cancel',
  [gameActionRateLimiter, ...gate, validateUuidParams('gameSessionId'), requireGamePlayerToken],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await GameService.cancel(req.gameRestaurantId!, req.gameSessionId!, req.gamePlayerId!);
      res.status(200).json({ success: true, data: { game } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/games/:gameSessionId/roll
 * Server-authoritative dice roll for the current player's turn.
 */
gameRouter.post(
  '/restaurants/:restaurantId/games/:gameSessionId/roll',
  [gameRollRateLimiter, ...gate, validateUuidParams('gameSessionId'), requireGamePlayerToken],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await GameService.roll(req.gameRestaurantId!, req.gameSessionId!, req.gamePlayerId!);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/games/:gameSessionId/leave
 * Leave a waiting lobby.
 */
gameRouter.post(
  '/restaurants/:restaurantId/games/:gameSessionId/leave',
  [gameActionRateLimiter, ...gate, validateUuidParams('gameSessionId'), requireGamePlayerToken],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await GameService.leave(req.gameRestaurantId!, req.gameSessionId!, req.gamePlayerId!);
      res.status(200).json({ success: true, data: { game } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/games/:gameSessionId/events
 * SSE stream for a game player. Sends an authoritative snapshot immediately,
 * then live game events. SSE is transport only; recovery is via snapshot.
 */
gameRouter.get(
  '/restaurants/:restaurantId/games/:gameSessionId/events',
  validateUuidParams(['restaurantId', 'gameSessionId']),
  requireGamePlayerToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const snapshot = await GameService.getGame(req.gameRestaurantId!, req.gameSessionId!, req.gamePlayerId!);
      realtimeService.subscribe(GAME_CHANNEL(req.gameSessionId!), res);
      realtimeService.send(res, 'GAME_SNAPSHOT', {
        gameSessionId: req.gameSessionId,
        version: snapshot.eventVersion,
        snapshot,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/games/table/:tableId/events
 * SSE discovery stream for a private same-table lobby. Exposes only safe lobby
 * information (no customerId leakage).
 */
gameRouter.get(
  '/restaurants/:restaurantId/games/table/:tableId/events',
  [...gate, validateUuidParams('tableId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await GameService.getTableWaitingGame(req.params.restaurantId, req.params.tableId);
      realtimeService.subscribe(TABLE_CHANNEL(req.params.tableId), res);
      realtimeService.send(res, 'TABLE_SNAPSHOT', { tableId: req.params.tableId, game });
    } catch (err) {
      next(err);
    }
  }
);
