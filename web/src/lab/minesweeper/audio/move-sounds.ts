/**
 * Which of the game's sounds a move plays, and when. Pure, so the rules can
 * be tested without a page or a sound; audio.ts plays what this returns.
 *
 * The sounds keep time with the board's motion, from the same numbers
 * (move-timing.ts), as the prototype's do:
 *
 *   a reveal     one sound per ring, as the ripple reaches it, not one per
 *                cell: a cascade of 200 cells plays at most 15
 *   a flag       flag or unflag
 *   a loss       the explosion at once (it ducks the soundscape), then one
 *                sound per mine shown as it surfaces, nearest first: the
 *                first 18 only
 *   a win        its own sound; the flags it puts on the mines play none
 *   a new game   its own sound
 *
 * Wrong flags and the loss itself play nothing: the explosion says it all.
 */
import type { GameEvent } from '../game-core.ts';
import { LAST_RIPPLE_RING, revealDelayMs, showDelayMs } from '../move-timing.ts';

/** The most mines a loss sounds (the prototype's); the rest surface in silence. */
export const MOST_MINE_SOUNDS = 18;

export type GameSound =
  'newGame' | 'reveal' | 'flag' | 'unflag' | 'explosion' | 'mineShown' | 'win';

export interface ScheduledSound {
  readonly sound: GameSound;
  /** After the move. */
  readonly delayMs: number;
  /** A reveal's ring; a shown mine's place, 0 for the nearest; else 0. */
  readonly order: number;
}

/** The sounds `move` plays, on a board `columns` wide. */
export function soundsForMove(move: readonly GameEvent[], columns: number): ScheduledSound[] {
  const won = move.some((event) => event.type === 'gameWon');
  const sounds: ScheduledSound[] = [];
  let deepestRing = -1;
  let explodedIndex: number | null = null;
  const mineDelaysMs: number[] = [];

  for (const event of move) {
    switch (event.type) {
      case 'gameCreated':
        sounds.push({ sound: 'newGame', delayMs: 0, order: 0 });
        break;
      case 'cellRevealed':
        deepestRing = Math.max(deepestRing, Math.min(event.ring, LAST_RIPPLE_RING));
        break;
      case 'cellFlagged':
        if (!won) {
          sounds.push({ sound: 'flag', delayMs: 0, order: 0 });
        }
        break;
      case 'cellUnflagged':
        sounds.push({ sound: 'unflag', delayMs: 0, order: 0 });
        break;
      case 'mineExploded':
        explodedIndex = event.cellIndex;
        sounds.push({ sound: 'explosion', delayMs: 0, order: 0 });
        break;
      case 'mineShown':
        if (explodedIndex !== null) {
          mineDelaysMs.push(showDelayMs(event.cellIndex, explodedIndex, columns));
        }
        break;
      case 'gameWon':
        sounds.push({ sound: 'win', delayMs: 0, order: 0 });
        break;
      case 'wrongFlagShown':
      case 'gameLost':
        break;
      default:
        // Every event has a case: a new one makes this a type error.
        event satisfies never;
    }
  }

  // Every ring from the click to the deepest has cells: a cascade spreads
  // one ring at a time.
  for (let ring = 0; ring <= deepestRing; ring++) {
    sounds.push({ sound: 'reveal', delayMs: revealDelayMs(ring), order: ring });
  }

  mineDelaysMs
    .sort((a, b) => a - b)
    .slice(0, MOST_MINE_SOUNDS)
    .forEach((delayMs, order) => sounds.push({ sound: 'mineShown', delayMs, order }));

  return sounds;
}
