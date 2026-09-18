import crypto from 'crypto';

/** Snakes & Ladders board size (squares 1..100). */
export const BOARD_SIZE = 100;

/** Fixed ladder map: landing square -> climb-to square. */
export const LADDERS: Record<number, number> = {
  4: 14,
  9: 31,
  20: 38,
  28: 84,
  40: 59,
  63: 81,
  71: 91,
};

/** Fixed snake map: landing square -> slide-down square. */
export const SNAKES: Record<number, number> = {
  17: 7,
  54: 34,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  99: 78,
};

/** Server-authoritative dice roll: 1..6. */
export function rollDice(): number {
  return crypto.randomInt(1, 7);
}

export interface MovementResult {
  fromPosition: number;
  toPosition: number;
  diceRoll: number;
  overshoot: boolean;
  won: boolean;
  movedByLadder: boolean;
  movedBySnake: boolean;
}

/**
 * Pure movement resolver. Applies one snake/ladder at most; a roll that would
 * exceed BOARD_SIZE leaves the player in place (`overshoot`), landing exactly on
 * BOARD_SIZE wins. Clients never supply position — this is the only authority.
 */
export function applyMovement(position: number, diceRoll: number): MovementResult {
  let toPosition = position + diceRoll;
  const overshoot = toPosition > BOARD_SIZE;
  if (overshoot) {
    return { fromPosition: position, toPosition: position, diceRoll, overshoot: true, won: false, movedByLadder: false, movedBySnake: false };
  }

  const won = toPosition === BOARD_SIZE;
  let movedByLadder = false;
  let movedBySnake = false;

  if (!won) {
    if (LADDERS[toPosition] !== undefined) {
      toPosition = LADDERS[toPosition];
      movedByLadder = true;
    } else if (SNAKES[toPosition] !== undefined) {
      toPosition = SNAKES[toPosition];
      movedBySnake = true;
    }
  }

  return { fromPosition: position, toPosition, diceRoll, overshoot: false, won, movedByLadder, movedBySnake };
}
