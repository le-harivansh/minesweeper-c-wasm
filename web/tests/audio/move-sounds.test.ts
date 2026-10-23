/**
 * Tests web/src/lab/minesweeper/audio/move-sounds.ts: which of the game's
 * sounds each move plays, and when, in time with the board's motion.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MOST_MINE_SOUNDS,
  soundsForMove,
  type ScheduledSound,
} from '../../src/lab/minesweeper/audio/move-sounds.ts';
import type { GameEvent } from '../../src/lab/minesweeper/game/core.ts';

/** Expert's width. */
const COLUMNS = 30;

/** Each sound as "name@delay#order", to compare at a glance. */
const listed = (sounds: readonly ScheduledSound[]) =>
  sounds.map(({ sound, delayMs, order }) => `${sound}@${delayMs}#${order}`);

/**
 * A cascade 40 rings deep plays rings 0 to 14, 32 ms apart, as its covers go:
 * rings past the 14th go with it (move-timing.ts).
 */
test('a cascade plays one reveal sound per ring, up to the 14th', () => {
  const move: GameEvent[] = Array.from({ length: 40 }, (_, ring) => ({
    type: 'cellRevealed',
    cellIndex: ring,
    ring,
    neighborMineCount: 0,
  }));
  const sounds = soundsForMove(move, COLUMNS);

  assert.equal(sounds.length, 15);
  assert.deepEqual(sounds[0], { sound: 'reveal', delayMs: 0, order: 0 });
  assert.deepEqual(sounds[14], { sound: 'reveal', delayMs: 448, order: 14 });
});

/** Two cells in ring 1 play once: one sound per ring, not per cell. */
test('cells in the same ring share one sound', () => {
  const move: GameEvent[] = [
    { type: 'cellRevealed', cellIndex: 40, ring: 0, neighborMineCount: 0 },
    { type: 'cellRevealed', cellIndex: 41, ring: 1, neighborMineCount: 1 },
    { type: 'cellRevealed', cellIndex: 39, ring: 1, neighborMineCount: 2 },
  ];

  assert.deepEqual(listed(soundsForMove(move, COLUMNS)), ['reveal@0#0', 'reveal@32#1']);
});

/** A win flags every mine left; its own sound says so, the flags don't. */
test('a win plays its rings and the win, and no flag sounds', () => {
  const move: GameEvent[] = [
    { type: 'cellRevealed', cellIndex: 5, ring: 0, neighborMineCount: 1 },
    { type: 'cellFlagged', cellIndex: 6 },
    { type: 'cellFlagged', cellIndex: 7 },
    { type: 'gameWon' },
  ];

  assert.deepEqual(listed(soundsForMove(move, COLUMNS)), ['win@0#0', 'reveal@0#0']);
});

test('a flag and an unflag each play their sound', () => {
  assert.deepEqual(listed(soundsForMove([{ type: 'cellFlagged', cellIndex: 3 }], COLUMNS)), [
    'flag@0#0',
  ]);
  assert.deepEqual(listed(soundsForMove([{ type: 'cellUnflagged', cellIndex: 3 }], COLUMNS)), [
    'unflag@0#0',
  ]);
});

test('a new game plays its sound', () => {
  const move: GameEvent[] = [{ type: 'gameCreated', rows: 16, columns: 30, mines: 99 }];

  assert.deepEqual(listed(soundsForMove(move, COLUMNS)), ['newGame@0#0']);
});

/**
 * A loss on Expert, exploding at row 15, column 15, with 25 mines shown along
 * a diagonal: the explosion, then the 18 nearest, each at its surfacing time
 * (140 ms + 55 ms per ring out), nearest first. Wrong flags and the loss
 * itself add nothing.
 */
test('a loss plays the explosion, then the nearest 18 mines as they surface', () => {
  const exploded = 15 * COLUMNS + 15;
  const shown: GameEvent[] = Array.from({ length: 25 }, (_, step) => ({
    type: 'mineShown',
    cellIndex: (15 + step - 12) * COLUMNS + (15 + step - 12),
  }));
  const move: GameEvent[] = [
    { type: 'mineExploded', cellIndex: exploded },
    ...shown,
    { type: 'wrongFlagShown', cellIndex: 1 },
    { type: 'gameLost' },
  ];
  const sounds = soundsForMove(move, COLUMNS);
  const mines = sounds.filter(({ sound }) => sound === 'mineShown');

  assert.equal(sounds.length, 1 + MOST_MINE_SOUNDS);
  assert.deepEqual(sounds[0], { sound: 'explosion', delayMs: 0, order: 0 });
  assert.deepEqual(
    mines.map(({ order }) => order),
    [...Array(MOST_MINE_SOUNDS).keys()],
  );
  // The diagonal's own cell, 0 rings out, then 1, 1, 2, 2, ...
  assert.deepEqual(
    mines.slice(0, 5).map(({ delayMs }) => delayMs),
    [140, 195, 195, 250, 250],
  );
});
