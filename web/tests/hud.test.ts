/**
 * Tests the pure half of web/src/lab/minesweeper/hud.ts: how the clock shows
 * a time, and the messages read out when a game ends. The half that updates
 * the page is checked in the browser.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameEvent } from '../src/lab/minesweeper/game-core.ts';
import { applyMove, EMPTY_BOARD } from '../src/lab/minesweeper/game-session.ts';
import { formatDuration, lossMessage, winMessage } from '../src/lab/minesweeper/hud.ts';

/** A lost 3 × 3 game, mines at 2, 3 and 6, after these flags (as in game-session.test.ts). */
function lostWithFlags(flags: { cellIndex: number; isMine: boolean }[]) {
  const move: GameEvent[] = [
    { type: 'gameCreated', rows: 3, columns: 3, mines: 3 },
    { type: 'cellRevealed', cellIndex: 8, ring: 0, neighborMineCount: 0 },
    ...flags.map(({ cellIndex }): GameEvent => ({ type: 'cellFlagged', cellIndex })),
    { type: 'mineExploded', cellIndex: 6 },
    ...flags
      .filter(({ isMine }) => !isMine)
      .map(({ cellIndex }): GameEvent => ({ type: 'wrongFlagShown', cellIndex })),
    { type: 'gameLost' },
  ];

  return applyMove(EMPTY_BOARD, move);
}

/** Whole seconds, rounded down, as a clock counts; minutes go past 59. */
test('a duration shows as minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(999), '0:00');
  assert.equal(formatDuration(7_000), '0:07');
  assert.equal(formatDuration(83_500), '1:23');
  assert.equal(formatDuration(3_665_000), '61:05');
});

/** The exploded mine is 6: row 3, column 1. */
test('a loss names the mine, then how the flags fared', () => {
  assert.equal(lossMessage(lostWithFlags([])), 'Mine at row 3, column 1.');
  assert.equal(
    lossMessage(lostWithFlags([{ cellIndex: 2, isMine: true }])),
    'Mine at row 3, column 1. Every flag was right.',
  );
  assert.equal(
    lossMessage(
      lostWithFlags([
        { cellIndex: 0, isMine: false },
        { cellIndex: 2, isMine: true },
      ]),
    ),
    'Mine at row 3, column 1. 1 flag was wrong.',
  );
  assert.equal(
    lossMessage(
      lostWithFlags([
        { cellIndex: 0, isMine: false },
        { cellIndex: 1, isMine: false },
      ]),
    ),
    'Mine at row 3, column 1. 2 flags were wrong.',
  );
});

/** A tie isn't a new best; a gain under a second shows as such, not as 0:00. */
test('a win gives the time against the best', () => {
  assert.equal(
    winMessage({ timeMs: 83_000, previousBestMs: null }),
    'Cleared in 1:23. Your first clear at this level on this device.',
  );
  assert.equal(
    winMessage({ timeMs: 71_000, previousBestMs: 83_000 }),
    'Cleared in 1:11. A new best, 0:12 faster.',
  );
  assert.equal(
    winMessage({ timeMs: 82_600, previousBestMs: 83_000 }),
    'Cleared in 1:22. A new best, by under a second.',
  );
  assert.equal(
    winMessage({ timeMs: 83_000, previousBestMs: 83_000 }),
    'Cleared in 1:23. Best on this device: 1:23.',
  );
  assert.equal(
    winMessage({ timeMs: 90_000, previousBestMs: 65_000 }),
    'Cleared in 1:30. Best on this device: 1:05.',
  );
});
