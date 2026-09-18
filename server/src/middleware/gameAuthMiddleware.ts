import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { GameService } from '../services/gameService';

declare global {
  namespace Express {
    interface Request {
      gamePlayerId?: string;
      gameSessionId?: string;
      gameRestaurantId?: string;
      gamePlayerAlias?: string;
    }
  }
}

/**
 * Authenticates a game player via their short-lived signed gamePlayerToken.
 * The token (not the URL) is the authority for player/session/restaurant scope.
 */
export async function requireGamePlayerToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const token = headerToken || queryToken;

  if (!token) {
    res.status(401).json({ success: false, errorCode: 'AUTH_REQUIRED', message: 'Game player token required.' });
    return;
  }

  const payload = GameService.verifyGamePlayerToken(token);
  if (!payload) {
    res.status(401).json({ success: false, errorCode: 'INVALID_TOKEN', message: 'Invalid or expired game player token.' });
    return;
  }

  const player = await prisma.gamePlayer.findFirst({
    where: { id: payload.sub, gameSessionId: payload.gameSessionId },
    include: { gameSession: { select: { restaurantId: true } } },
  });

  if (!player || player.gameSession.restaurantId !== payload.restaurantId) {
    res.status(403).json({ success: false, errorCode: 'NOT_IN_GAME', message: 'Game player does not belong to this session.' });
    return;
  }

  // Defense in depth: URL restaurant must match the token's restaurant.
  if (req.params.restaurantId && req.params.restaurantId !== payload.restaurantId) {
    res.status(403).json({ success: false, errorCode: 'TENANT_MISMATCH', message: 'Restaurant context does not match the game token.' });
    return;
  }

  // The requested game session must match the token's game session.
  if (req.params.gameSessionId && req.params.gameSessionId !== payload.gameSessionId) {
    res.status(403).json({ success: false, errorCode: 'GAME_MISMATCH', message: 'Game session does not match the game token.' });
    return;
  }

  req.gamePlayerId = player.id;
  req.gameSessionId = payload.gameSessionId;
  req.gameRestaurantId = payload.restaurantId;
  req.gamePlayerAlias = payload.alias;

  next();
}
