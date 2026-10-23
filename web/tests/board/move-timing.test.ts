/**
 * Tests web/src/lab/minesweeper/board/move-timing.ts: when each revealed cell
 * and each mine a loss shows takes its turn, which the board's motion and the
 * sound both follow.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revealDelayMs, showDelayMs } from '../../src/lab/minesweeper/board/move-timing.ts';

/**
 * A board 4 columns wide, by cell index:
 *
 *    0  1  2  3
 *    4  5  6  7
 *    8  9 10 11
 */
const COLUMNS = 4;

/** The prototype's ripple: 32 ms a ring, every ring from the 14th on together. */
test('a revealed cell waits for its ring, up to the 14th', () => {
  assert.equal(revealDelayMs(0), 0);
  assert.equal(revealDelayMs(1), 32);
  assert.equal(revealDelayMs(14), 448);
  assert.equal(revealDelayMs(30), 448);
});

/**
 * The prototype's loss: the other mines surface from 140 ms, 55 ms per ring
 * of cells around the exploded one, the larger of rows and columns apart.
 * With cell 5 exploded: 6, 10 and 8 (diagonally) are next to it; 3 and 11
 * are two columns away.
 */
test('a shown mine surfaces by its distance from the exploded one', () => {
  assert.equal(showDelayMs(6, 5, COLUMNS), 195);
  assert.equal(showDelayMs(10, 5, COLUMNS), 195);
  assert.equal(showDelayMs(3, 5, COLUMNS), 250);
  assert.equal(showDelayMs(8, 5, COLUMNS), 195);
  assert.equal(showDelayMs(11, 5, COLUMNS), 250);
});
