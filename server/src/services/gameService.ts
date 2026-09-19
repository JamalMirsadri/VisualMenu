import jwt from 'jsonwebtoken';
import { GameMode, GameStatus, GameType } from '@prisma/client';
import { prisma } from '../prisma';
import { getJwtSecret } from '../config';
import { applyMovement, BOARD_SIZE, rollDice } from '../constants/game';
import { broadcastGameEvent, broadcastTableEvent } from './gameRealtime';
import { isValidUuid } from '../middleware/validation';
import { LoyaltyService } from './loyaltyService';

const TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const DEFAULT_WAITING_LOBBY_TIMEOUT_SECONDS = 600;
const DEFAULT_INACTIVITY_TIMEOUT_SECONDS = 900;

export interface GamePlayerTokenPayload {
  sub: string; // GamePlayer.id
  restaurantId: string;
  gameSessionId: string;
  alias: string;
}

function gameError(statusCode: number, errorCode: string, message: string): Error {
  const e: any = new Error(message);
  e.statusCode = statusCode;
  e.errorCode = errorCode;
  return e;
}

export interface GameConfigResolved {
  id: string;
  enabled: boolean;
  modes: GameMode[];
  minPlayers: number;
  maxPlayers: number;
  turnTimeoutSeconds: number;
}

export class GameService {
  // ---------------------------------------------------------------------------
  // Player token
  // ---------------------------------------------------------------------------
  static issueGamePlayerToken(payload: GamePlayerTokenPayload): string {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_TTL_SECONDS });
  }

  static verifyGamePlayerToken(token: string): GamePlayerTokenPayload | null {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as any;
      if (!payload?.sub || !payload?.restaurantId || !payload?.gameSessionId) return null;
      return {
        sub: payload.sub,
        restaurantId: payload.restaurantId,
        gameSessionId: payload.gameSessionId,
        alias: payload.alias,
      };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  static async resolveConfig(restaurantId: string, requiredMode?: GameMode): Promise<GameConfigResolved> {
    const config = await prisma.gameConfig.findUnique({ where: { restaurantId } });
    if (!config || !config.enabled) {
      throw gameError(403, 'GAMES_DISABLED', 'Games are not enabled for this restaurant.');
    }
    if (requiredMode && config.modes.length > 0 && !config.modes.includes(requiredMode)) {
      throw gameError(403, 'GAME_MODE_DISABLED', `Game mode ${requiredMode} is not enabled for this restaurant.`);
    }
    return {
      id: config.id,
      enabled: config.enabled,
      modes: config.modes as GameMode[],
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      turnTimeoutSeconds: config.turnTimeoutSeconds,
    };
  }

  // ---------------------------------------------------------------------------
  // Private (same-table) lobby
  // ---------------------------------------------------------------------------
  static async createPrivate(
    restaurantId: string,
    tableId: string,
    alias: string,
    playerKey?: string,
    customerId?: string
  ): Promise<{ session: any; player: any; token: string }> {
    const config = await this.resolveConfig(restaurantId, GameMode.PRIVATE);
    await this.assertTableBelongsToRestaurant(restaurantId, tableId);
    await this.assertPlayerNotInActiveGame(playerKey);
    const linkedCustomerId = await this.resolveLinkedCustomerId(restaurantId, customerId);

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.gameSession.create({
        data: {
          restaurantId,
          gameType: GameType.SNAKES_LADDERS,
          mode: GameMode.PRIVATE,
          tableId,
          status: GameStatus.WAITING,
          maxPlayers: config.maxPlayers,
          eventVersion: 1,
          boardState: this.initialBoardState(),
        },
      });

      const player = await tx.gamePlayer.create({
        data: {
          gameSessionId: session.id,
          alias: alias.trim(),
          playerKey,
          customerId: linkedCustomerId,
          seatOrder: 0,
          isHost: true,
          position: 1,
        },
      });

      await tx.gameSession.update({
        where: { id: session.id },
        data: { hostPlayerId: player.id },
      });

      return this.packJoin(tx, session.id, player.id);
    });

    this.emitPlayerJoined(result.session, result.player);
    this.emitTableLobby(result.session, 'PLAYER_JOINED', result.player);
    return result;
  }

  static async getTableWaitingGame(restaurantId: string, tableId: string) {
    await this.assertTableBelongsToRestaurant(restaurantId, tableId);
    const session = await prisma.gameSession.findFirst({
      where: { restaurantId, tableId, mode: GameMode.PRIVATE, status: GameStatus.WAITING },
      orderBy: { createdAt: 'asc' },
      include: { players: { orderBy: { seatOrder: 'asc' } } },
    });
    return session ? this.sanitizeSession(session) : null;
  }

  static async joinPrivate(
    restaurantId: string,
    gameSessionId: string,
    tableId: string,
    alias: string,
    playerKey?: string,
    customerId?: string
  ): Promise<{ session: any; player: any; token: string }> {
    await this.resolveConfig(restaurantId, GameMode.PRIVATE);
    await this.assertTableBelongsToRestaurant(restaurantId, tableId);
    await this.assertPlayerNotInActiveGame(playerKey);
    const linkedCustomerId = await this.resolveLinkedCustomerId(restaurantId, customerId);

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.gameSession.findUnique({ where: { id: gameSessionId }, include: { players: true } });
      if (!session || session.restaurantId !== restaurantId) {
        throw gameError(404, 'GAME_NOT_FOUND', 'Game session not found.');
      }
      if (session.mode !== GameMode.PRIVATE || session.tableId !== tableId) {
        throw gameError(403, 'CROSS_TABLE_JOIN_FORBIDDEN', 'Cannot join a game from a different table.');
      }
      if (session.status !== GameStatus.WAITING) {
        throw gameError(409, 'GAME_NOT_JOINABLE', 'This game has already started or ended.');
      }
      if (session.players.length >= session.maxPlayers) {
        throw gameError(409, 'GAME_FULL', 'This game is already full.');
      }

      const nextSeat = this.nextSeatOrder(session.players);
      const player = await tx.gamePlayer.create({
        data: {
          gameSessionId: session.id,
          alias: alias.trim(),
          playerKey,
          customerId: linkedCustomerId,
          seatOrder: nextSeat,
          position: 1,
        },
      });

      await tx.gameSession.update({
        where: { id: session.id },
        data: { eventVersion: { increment: 1 } },
      });

      return this.packJoin(tx, session.id, player.id);
    });

    this.emitPlayerJoined(result.session, result.player);
    this.emitTableLobby(result.session, 'PLAYER_JOINED', result.player);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Random matchmaking
  // ---------------------------------------------------------------------------
  static async joinRandom(
    restaurantId: string,
    alias: string,
    playerKey?: string,
    customerId?: string
  ): Promise<{ session: any; player: any; token: string; started: boolean }> {
    const config = await this.resolveConfig(restaurantId, GameMode.RANDOM);
    await this.assertPlayerNotInActiveGame(playerKey);
    const linkedCustomerId = await this.resolveLinkedCustomerId(restaurantId, customerId);

    const result = await prisma.$transaction(async (tx) => {
      // Reuse a waiting random session with open seats (candidate read).
      const candidate = await tx.gameSession.findFirst({
        where: { restaurantId, mode: GameMode.RANDOM, status: GameStatus.WAITING },
        orderBy: { createdAt: 'asc' },
        include: { players: true },
      });

      let session: any = candidate ?? null;

      if (session) {
        // Lock the session row so concurrent joins cannot both reuse (and
        // potentially both auto-start) the same lobby, then re-read its live state.
        await tx.$queryRaw`SELECT "id" FROM "game_sessions" WHERE "id" = ${session.id}::uuid FOR UPDATE`;
        const live = await tx.gameSession.findUnique({
          where: { id: session.id },
          include: { players: true },
        });
        if (!live || live.status !== GameStatus.WAITING || live.players.length >= live.maxPlayers) {
          session = null;
        } else {
          session = live;
        }
      }

      if (!session) {
        session = await tx.gameSession.create({
          data: {
            restaurantId,
            gameType: GameType.SNAKES_LADDERS,
            mode: GameMode.RANDOM,
            status: GameStatus.WAITING,
            maxPlayers: config.maxPlayers,
            eventVersion: 1,
            boardState: this.initialBoardState(),
          },
        });
      }

      const seat = this.nextSeatOrder(session.players ?? []);
      const player = await tx.gamePlayer.create({
        data: {
          gameSessionId: session.id,
          alias: alias.trim(),
          playerKey,
          customerId: linkedCustomerId,
          seatOrder: seat,
          position: 1,
        },
      });

      if (!session.hostPlayerId) {
        await tx.gameSession.update({ where: { id: session.id }, data: { hostPlayerId: player.id } });
      }

      // Auto-start a random session as soon as it reaches the minimum players
      // (never wait for maxPlayers).
      let started = false;
      const playerCount = (session.players?.length ?? 0) + 1;
      if (playerCount >= config.minPlayers) {
        const firstPlayer = await tx.gamePlayer.findFirst({ where: { gameSessionId: session.id }, orderBy: { seatOrder: 'asc' } });
        await tx.gameSession.update({
          where: { id: session.id },
          data: {
            status: GameStatus.IN_PROGRESS,
            startedAt: new Date(),
            currentTurnPlayerId: firstPlayer!.id,
            lastTurnAt: new Date(),
            eventVersion: { increment: 1 },
          },
        });
        started = true;
      } else {
        await tx.gameSession.update({
          where: { id: session.id },
          data: { eventVersion: { increment: 1 } },
        });
      }

      const packed = await this.packJoin(tx, session.id, player.id);
      return { ...packed, started };
    });

    this.emitPlayerJoined(result.session, result.player);
    if (result.started) {
      this.emitGameStarted(result.session);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Shared game actions
  // ---------------------------------------------------------------------------
  static async getGame(restaurantId: string, gameSessionId: string, playerId: string) {
    const { session } = await this.assertActivePlayer(restaurantId, gameSessionId, playerId);
    if (session.status !== GameStatus.WAITING && session.status !== GameStatus.IN_PROGRESS) {
      throw gameError(409, 'GAME_ENDED', 'This game has already ended.');
    }
    await this.assertSessionNotExpired(session);
    return this.sanitizeSession(session);
  }

  static async start(restaurantId: string, gameSessionId: string, playerId: string) {
    const config = await this.resolveConfig(restaurantId);

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.gameSession.findUnique({ where: { id: gameSessionId }, include: { players: { orderBy: { seatOrder: 'asc' } } } });
      if (!session || session.restaurantId !== restaurantId) throw gameError(404, 'GAME_NOT_FOUND', 'Game session not found.');
      if (session.hostPlayerId !== playerId) throw gameError(403, 'HOST_ONLY', 'Only the host can start the game.');
      if (session.status !== GameStatus.WAITING) throw gameError(409, 'GAME_NOT_STARTABLE', 'Game is not waiting to start.');
      if (session.players.length < config.minPlayers) throw gameError(409, 'NOT_ENOUGH_PLAYERS', `At least ${config.minPlayers} players are required.`);
      if (session.players.length > config.maxPlayers) throw gameError(409, 'TOO_MANY_PLAYERS', 'Too many players.');

      const first = session.players[0];
      const updated = await tx.gameSession.update({
        where: { id: gameSessionId },
        data: {
          status: GameStatus.IN_PROGRESS,
          startedAt: new Date(),
          currentTurnPlayerId: first.id,
          turnNumber: 1,
          lastTurnAt: new Date(),
          eventVersion: { increment: 1 },
        },
        include: { players: { orderBy: { seatOrder: 'asc' } } },
      });
      return this.sanitizeSession(updated);
    });

    this.emitGameStarted(result);
    this.emitTableLobby(result, 'GAME_STARTED');
    return result;
  }

  static async cancel(restaurantId: string, gameSessionId: string, playerId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.gameSession.findUnique({ where: { id: gameSessionId } });
      if (!session || session.restaurantId !== restaurantId) throw gameError(404, 'GAME_NOT_FOUND', 'Game session not found.');
      if (session.hostPlayerId !== playerId) throw gameError(403, 'HOST_ONLY', 'Only the host can cancel the game.');
      if (session.status !== GameStatus.WAITING) throw gameError(409, 'GAME_NOT_CANCELLABLE', 'Only a waiting game can be cancelled.');

      const updated = await tx.gameSession.update({
        where: { id: gameSessionId },
        data: { status: GameStatus.CANCELLED, endedAt: new Date(), eventVersion: { increment: 1 } },
        include: { players: { orderBy: { seatOrder: 'asc' } } },
      });
      return this.sanitizeSession(updated);
    });

    this.emitGameCancelled(result);
    this.emitTableLobby(result, 'GAME_CANCELLED');
    return result;
  }

  static async roll(restaurantId: string, gameSessionId: string, playerId: string, diceFn: () => number = rollDice) {
    const config = await this.resolveConfig(restaurantId);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const session = await tx.gameSession.findUnique({ where: { id: gameSessionId } });
        if (!session || session.restaurantId !== restaurantId) throw gameError(404, 'GAME_NOT_FOUND', 'Game session not found.');

        const player = await tx.gamePlayer.findFirst({ where: { id: playerId, gameSessionId } });
        if (!player) throw gameError(403, 'NOT_IN_GAME', 'You are not a player in this game.');

        if (session.status === GameStatus.FINISHED || session.status === GameStatus.CANCELLED) {
          throw gameError(409, 'GAME_ENDED', 'This game has already ended.');
        }
        if (session.status !== GameStatus.IN_PROGRESS) {
          throw gameError(409, 'GAME_NOT_STARTED', 'This game has not started yet.');
        }

        // Fast turn timeout: skip the current player if their turn expired.
        if (session.lastTurnAt && Date.now() - session.lastTurnAt.getTime() > config.turnTimeoutSeconds * 1000) {
          const skipped = await this.advanceTurn(tx, session);
          return { skipped: true, session: this.sanitizeSession(skipped) };
        }

        if (session.currentTurnPlayerId !== player.id) {
          throw gameError(409, 'NOT_YOUR_TURN', 'It is not your turn.');
        }

        const dice = diceFn();
        const movement = applyMovement(player.position, dice);

        // Unique (gameSessionId, turnNumber) makes concurrent rolls for the same turn impossible.
        const move = await tx.gameMove.create({
          data: {
            gameSessionId: session.id,
            gamePlayerId: player.id,
            turnNumber: session.turnNumber,
            diceRoll: dice,
            fromPosition: movement.fromPosition,
            toPosition: movement.toPosition,
            movedByLadder: movement.movedByLadder,
            movedBySnake: movement.movedBySnake,
          },
        });

        await tx.gamePlayer.update({ where: { id: player.id }, data: { position: movement.toPosition } });

        if (movement.won) {
          const finished = await tx.gameSession.update({
            where: { id: session.id },
            data: { status: GameStatus.FINISHED, endedAt: new Date(), winnerPlayerId: player.id, eventVersion: { increment: 1 } },
            include: { players: { orderBy: { seatOrder: 'asc' } } },
          });
          return { move, movement, won: true, session: this.sanitizeSession(finished) };
        }

        const next = await this.advanceTurn(tx, session);
        return { move, movement, won: false, session: this.sanitizeSession(next) };
      });

      if (result.skipped) {
        broadcastGameEvent(gameSessionId, 'TURN_CHANGED', {
          gameSessionId,
          version: result.session.eventVersion,
          currentTurnPlayerId: result.session.currentTurnPlayerId,
          turnNumber: result.session.turnNumber,
        });
        return result;
      }

      this.emitRollEvents(gameSessionId, result);

      // Award loyalty points exactly once when a game finishes (best-effort,
      // idempotent by gameSessionId; never blocks or breaks the game result).
      if (result.won) {
        await LoyaltyService.awardGameWin(gameSessionId).catch((err) => {
          console.error(`[Loyalty] game win award failed for ${gameSessionId}:`, err?.message);
        });
      }

      return result;
    } catch (err: any) {
      // Concurrent double-roll surfaces as a unique constraint violation.
      if (err?.code === 'P2002') {
        throw gameError(409, 'TURN_ALREADY_PROCESSED', 'This turn has already been processed.');
      }
      throw err;
    }
  }

  static async leave(restaurantId: string, gameSessionId: string, playerId: string) {
    const existing = await prisma.gameSession.findUnique({
      where: { id: gameSessionId },
      include: { players: { orderBy: { seatOrder: 'asc' } } },
    });
    if (!existing || existing.restaurantId !== restaurantId) throw gameError(404, 'GAME_NOT_FOUND', 'Game session not found.');

    const player = existing.players.find((p) => p.id === playerId);
    if (!player) throw gameError(403, 'NOT_IN_GAME', 'You are not a player in this game.');

    if (existing.status === GameStatus.FINISHED || existing.status === GameStatus.CANCELLED) {
      throw gameError(409, 'GAME_ENDED', 'This game has already ended.');
    }

    const result = await this.removePlayerFromSession(gameSessionId, playerId);

    if (result.cancelled) {
      if (result.session) {
        this.emitGameCancelled(result.session);
        this.emitTableLobby(result.session, 'GAME_CANCELLED');
      }
      return null;
    }

    broadcastGameEvent(gameSessionId, 'PLAYER_LEFT', {
      gameSessionId,
      version: result.session.eventVersion,
      playerId,
      alias: player.alias,
    });
    this.emitTableLobby(result.session, 'PLAYER_LEFT');
    return result.session;
  }

  // ---------------------------------------------------------------------------
  // Realtime emitters (safe payloads only)
  // ---------------------------------------------------------------------------
  private static emitPlayerJoined(session: any, player: any) {
    broadcastGameEvent(session.id, 'PLAYER_JOINED', {
      gameSessionId: session.id,
      version: session.eventVersion,
      player,
    });
  }

  private static emitGameStarted(session: any) {
    broadcastGameEvent(session.id, 'GAME_STARTED', {
      gameSessionId: session.id,
      version: session.eventVersion,
      currentTurnPlayerId: session.currentTurnPlayerId,
      turnNumber: session.turnNumber,
    });
  }

  private static emitGameCancelled(session: any) {
    broadcastGameEvent(session.id, 'GAME_CANCELLED', {
      gameSessionId: session.id,
      version: session.eventVersion,
    });
  }

  private static emitRollEvents(gameSessionId: string, result: any) {
    const version = result.session.eventVersion;
    broadcastGameEvent(gameSessionId, 'DICE_ROLLED', {
      gameSessionId,
      version,
      playerId: result.move.gamePlayerId,
      diceRoll: result.move.diceRoll,
      fromPosition: result.move.fromPosition,
      toPosition: result.move.toPosition,
      turnNumber: result.move.turnNumber,
    });
    broadcastGameEvent(gameSessionId, 'PLAYER_MOVED', {
      gameSessionId,
      version,
      playerId: result.move.gamePlayerId,
      position: result.move.toPosition,
    });
    if (result.movement.movedByLadder || result.movement.movedBySnake) {
      broadcastGameEvent(gameSessionId, 'SNAKE_LADDER', {
        gameSessionId,
        version,
        playerId: result.move.gamePlayerId,
        fromPosition: result.move.fromPosition,
        toPosition: result.move.toPosition,
        movedByLadder: result.movement.movedByLadder,
        movedBySnake: result.movement.movedBySnake,
      });
    }
    if (result.won) {
      broadcastGameEvent(gameSessionId, 'GAME_FINISHED', {
        gameSessionId,
        version,
        winnerPlayerId: result.move.gamePlayerId,
      });
    } else {
      broadcastGameEvent(gameSessionId, 'TURN_CHANGED', {
        gameSessionId,
        version,
        currentTurnPlayerId: result.session.currentTurnPlayerId,
        turnNumber: result.session.turnNumber,
      });
    }
  }

  private static emitTableLobby(session: any, event: string, player?: any) {
    if (!session.tableId) return;
    broadcastTableEvent(session.tableId, event, {
      gameSessionId: session.id,
      tableId: session.tableId,
      status: session.status,
      playerCount: session.players?.length ?? 0,
      player: player ? { id: player.id, alias: player.alias, isHost: player.isHost } : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private static initialBoardState() {
    return { boardSize: BOARD_SIZE, snakes: {}, ladders: {} };
  }

  private static nextSeatOrder(players: { seatOrder: number }[]): number {
    if (players.length === 0) return 0;
    return Math.max(...players.map((p) => p.seatOrder)) + 1;
  }

  private static async assertTableBelongsToRestaurant(restaurantId: string, tableId: string) {
    const table = await prisma.table.findUnique({ where: { id: tableId }, select: { restaurantId: true } });
    if (!table || table.restaurantId !== restaurantId) {
      throw gameError(403, 'TABLE_NOT_FOUND', 'Table does not belong to this restaurant.');
    }
  }

  private static async assertPlayerNotInActiveGame(playerKey?: string) {
    if (!playerKey) return;
    const existing = await prisma.gamePlayer.findFirst({
      where: {
        playerKey,
        gameSession: { status: { in: [GameStatus.WAITING, GameStatus.IN_PROGRESS] } },
      },
      include: { gameSession: true },
    });
    if (!existing) return;

    const waitingTimeout = DEFAULT_WAITING_LOBBY_TIMEOUT_SECONDS * 1000;
    const inactivityTimeout = DEFAULT_INACTIVITY_TIMEOUT_SECONDS * 1000;

    // A waiting lobby that outlived its TTL is stale: cancel it so all queued
    // players are released (server timestamps only, never client time).
    if (existing.gameSession.status === GameStatus.WAITING) {
      if (existing.gameSession.createdAt.getTime() < Date.now() - waitingTimeout) {
        const cancelled = await prisma.gameSession.update({
          where: { id: existing.gameSession.id },
          data: { status: GameStatus.CANCELLED, endedAt: new Date(), eventVersion: { increment: 1 } },
        });
        broadcastGameEvent(cancelled.id, 'GAME_CANCELLED', {
          gameSessionId: cancelled.id,
          version: cancelled.eventVersion,
        });
        return;
      }
    }

    // An in-progress player that has been inactive past its TTL is released on
    // their own; the match keeps running for everyone else.
    if (existing.gameSession.status === GameStatus.IN_PROGRESS) {
      const lastActive = existing.updatedAt ?? existing.joinedAt ?? existing.createdAt;
      if (lastActive.getTime() < Date.now() - inactivityTimeout) {
        const result = await this.removePlayerFromSession(existing.gameSession.id, existing.id);
        if (result.session) {
          broadcastGameEvent(existing.gameSession.id, 'PLAYER_LEFT', {
            gameSessionId: existing.gameSession.id,
            version: result.session.eventVersion,
            playerId: existing.id,
            alias: existing.alias,
          });
        }
        return;
      }
    }

    throw gameError(409, 'ALREADY_IN_GAME', 'This player is already in an active game or queue.');
  }

  private static async assertSessionNotExpired(session: any) {
    if (session.status === GameStatus.WAITING) {
      const timeout = DEFAULT_WAITING_LOBBY_TIMEOUT_SECONDS * 1000;
      if (session.createdAt.getTime() < Date.now() - timeout) {
        throw gameError(409, 'GAME_EXPIRED', 'This game lobby has expired.');
      }
    } else if (session.status === GameStatus.IN_PROGRESS) {
      const timeout = DEFAULT_INACTIVITY_TIMEOUT_SECONDS * 1000;
      const lastActivity = session.lastTurnAt ?? session.startedAt ?? session.createdAt;
      if (lastActivity.getTime() < Date.now() - timeout) {
        throw gameError(409, 'GAME_EXPIRED', 'This game has expired due to inactivity.');
      }
    }
  }

  /**
   * Removes a single player from a WAITING or IN_PROGRESS session without
   * tearing down the match for the remaining players. If the session is left
   * empty it is cancelled. Host/current-turn pointers are repaired.
   */
  private static async removePlayerFromSession(gameSessionId: string, playerId: string) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.gameSession.findUnique({
        where: { id: gameSessionId },
        include: { players: { orderBy: { seatOrder: 'asc' } } },
      });
      if (!session) return { cancelled: true, session: null };

      const remaining = session.players.filter((p) => p.id !== playerId);

      if (remaining.length === 0) {
        const cancelled = await tx.gameSession.update({
          where: { id: gameSessionId },
          data: { status: GameStatus.CANCELLED, endedAt: new Date(), eventVersion: { increment: 1 } },
          include: { players: { orderBy: { seatOrder: 'asc' } } },
        });
        return { cancelled: true, session: this.sanitizeSession(cancelled) };
      }

      await tx.gamePlayer.delete({ where: { id: playerId } });

      const hostPlayerId = session.hostPlayerId === playerId ? remaining[0].id : session.hostPlayerId;
      const currentTurnPlayerId = session.currentTurnPlayerId === playerId ? remaining[0].id : session.currentTurnPlayerId;

      const updated = await tx.gameSession.update({
        where: { id: gameSessionId },
        data: {
          hostPlayerId,
          currentTurnPlayerId,
          eventVersion: { increment: 1 },
        },
        include: { players: { orderBy: { seatOrder: 'asc' } } },
      });

      return { cancelled: false, session: this.sanitizeSession(updated) };
    });
  }

  /**
   * Resolves an optional customer link for a game player. Anonymous players
   * (no customerId) return null and remain valid. When a customerId is
   * supplied, it MUST already exist and belong to the same restaurant — this
   * never creates a Customer and never links across tenants (no duplicates,
   * no cross-tenant identity leakage). NIF/taxId is never required or used.
   */
  private static async resolveLinkedCustomerId(restaurantId: string, customerId?: string): Promise<string | null> {
    if (!customerId) return null;
    if (!isValidUuid(customerId)) {
      throw gameError(400, 'INVALID_CUSTOMER_ID', 'customerId must be a valid UUID.');
    }
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, restaurantId: true },
    });
    if (!customer) {
      throw gameError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    }
    if (customer.restaurantId !== restaurantId) {
      throw gameError(403, 'CUSTOMER_NOT_IN_RESTAURANT', 'Customer does not belong to this restaurant.');
    }
    return customer.id;
  }

  private static async assertActivePlayer(restaurantId: string, gameSessionId: string, playerId: string) {
    const player = await prisma.gamePlayer.findFirst({
      where: { id: playerId, gameSessionId },
      include: { gameSession: { include: { players: { orderBy: { seatOrder: 'asc' } } } } },
    });
    if (!player || player.gameSession.restaurantId !== restaurantId) {
      throw gameError(403, 'NOT_IN_GAME', 'Player does not belong to this game.');
    }
    return { player, session: player.gameSession };
  }

  private static async advanceTurn(tx: any, session: any): Promise<any> {
    const players = await tx.gamePlayer.findMany({ where: { gameSessionId: session.id }, orderBy: { seatOrder: 'asc' } });
    if (players.length === 0) return session;

    const currentIndex = players.findIndex((p: any) => p.id === session.currentTurnPlayerId);
    const nextIndex = (currentIndex + 1) % players.length;
    const nextPlayer = players[nextIndex];

    return tx.gameSession.update({
      where: { id: session.id },
      data: {
        currentTurnPlayerId: nextPlayer.id,
        turnNumber: session.turnNumber + 1,
        lastTurnAt: new Date(),
        eventVersion: { increment: 1 },
      },
      include: { players: { orderBy: { seatOrder: 'asc' } } },
    });
  }

  private static async packJoin(tx: any, gameSessionId: string, playerId: string) {
    const session = await tx.gameSession.findUnique({
      where: { id: gameSessionId },
      include: { players: { orderBy: { seatOrder: 'asc' } } },
    });
    const player = session.players.find((p: any) => p.id === playerId);
    const token = this.issueGamePlayerToken({
      sub: player.id,
      restaurantId: session.restaurantId,
      gameSessionId: session.id,
      alias: player.alias,
    });
    return { session: this.sanitizeSession(session), player: this.sanitizePlayer(player), token };
  }

  private static sanitizePlayer(player: any) {
    return {
      id: player.id,
      alias: player.alias,
      position: player.position,
      seatOrder: player.seatOrder,
      isHost: player.isHost,
    };
  }

  private static sanitizeSession(session: any) {
    return {
      id: session.id,
      gameType: session.gameType,
      mode: session.mode,
      status: session.status,
      tableId: session.mode === GameMode.PRIVATE ? session.tableId : null,
      turnNumber: session.turnNumber,
      eventVersion: session.eventVersion,
      currentTurnPlayerId: session.currentTurnPlayerId,
      winnerPlayerId: session.winnerPlayerId,
      maxPlayers: session.maxPlayers,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      lastTurnAt: session.lastTurnAt,
      players: (session.players ?? []).map((p: any) => this.sanitizePlayer(p)),
    };
  }
}
