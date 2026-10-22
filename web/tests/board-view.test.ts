/**
 * Tests the pure half of web/src/lab/minesweeper/board-view.ts: each cell's
 * accessible name, where each grid key moves the focus, when each cell's
 * motion starts, and a cell's neighbors. The half that builds and paints the
 * cells needs a page; it is checked in the browser.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cellAfterKey,
  cellLabel,
  neighborIndexes,
  revealDelayMs,
  showDelayMs,
} from '../src/lab/minesweeper/board-view.ts';
import { applyMove, EMPTY_BOARD, type Board } from '../src/lab/minesweeper/game-session.ts';

/**
 * A 3 × 3 board that shows every state at once, as no game does: a lost game
 * with revealed cells around it.
 */
const EVERY_STATE: Board = {
  rows: 3,
  columns: 3,
  mines: 3,
  status: 'lost',
  cells: [
    { state: 'revealed', neighborMineCount: 0 },
    { state: 'revealed', neighborMineCount: 2 },
    { state: 'hidden', neighborMineCount: 0 },
    { state: 'flagged', neighborMineCount: 0 },
    { state: 'exploded', neighborMineCount: 0 },
    { state: 'mine', neighborMineCount: 0 },
    { state: 'wrong-flag', neighborMineCount: 0 },
    { state: 'hidden', neighborMineCount: 0 },
    { state: 'revealed', neighborMineCount: 1 },
  ],
};

/**
 * A 3 × 4 board for the keys, by cell index:
 *
 *    0  1  2  3
 *    4  5  6  7
 *    8  9 10 11
 */
const KEYS_BOARD = { rows: 3, columns: 4 };

/** A key press, as cellAfterKey reads it from the KeyboardEvent. */
const press = (key: string, ctrlKey = false) => ({ key, ctrlKey });

/** Rows and columns count from 1; a revealed 0 is "Empty". */
test('each cell is named by what it shows, then its row and column', () => {
  assert.deepEqual(
    EVERY_STATE.cells.map((_, cellIndex) => cellLabel(EVERY_STATE, cellIndex)),
    [
      'Empty, row 1, column 1',
      '2, row 1, column 2',
      'Hidden, row 1, column 3',
      'Flagged, row 2, column 1',
      'Exploded mine, row 2, column 2',
      'Mine, row 2, column 3',
      'Wrong flag, row 3, column 1',
      'Hidden, row 3, column 2',
      '1, row 3, column 3',
    ],
  );
});

/**
 * Expert's last cell. The prototype named columns with letters and ran past Z
 * on Expert's 30 columns; numbers don't run out.
 */
test("an Expert board's last cell is row 16, column 30", () => {
  const expert = applyMove(EMPTY_BOARD, [
    { type: 'gameCreated', rows: 16, columns: 30, mines: 99 },
  ]);

  assert.equal(cellLabel(expert, 479), 'Hidden, row 16, column 30');
});

test('arrows move one cell', () => {
  assert.equal(cellAfterKey(5, press('ArrowLeft'), KEYS_BOARD), 4);
  assert.equal(cellAfterKey(5, press('ArrowRight'), KEYS_BOARD), 6);
  assert.equal(cellAfterKey(5, press('ArrowUp'), KEYS_BOARD), 1);
  assert.equal(cellAfterKey(5, press('ArrowDown'), KEYS_BOARD), 9);
});

/** At an edge an arrow stays put, and a row's end never wraps to the next row. */
test('arrows stop at the edges', () => {
  assert.equal(cellAfterKey(0, press('ArrowLeft'), KEYS_BOARD), 0);
  assert.equal(cellAfterKey(0, press('ArrowUp'), KEYS_BOARD), 0);
  assert.equal(cellAfterKey(3, press('ArrowRight'), KEYS_BOARD), 3);
  assert.equal(cellAfterKey(4, press('ArrowLeft'), KEYS_BOARD), 4);
  assert.equal(cellAfterKey(11, press('ArrowRight'), KEYS_BOARD), 11);
  assert.equal(cellAfterKey(11, press('ArrowDown'), KEYS_BOARD), 11);
});

test("Home and End go to the row's ends; with Control, to the board's", () => {
  assert.equal(cellAfterKey(6, press('Home'), KEYS_BOARD), 4);
  assert.equal(cellAfterKey(5, press('End'), KEYS_BOARD), 7);
  assert.equal(cellAfterKey(6, press('Home', true), KEYS_BOARD), 0);
  assert.equal(cellAfterKey(5, press('End', true), KEYS_BOARD), 11);
});

/** Null leaves the key to the page and to input: Tab, Enter, F for a flag. */
test('any other key moves nothing', () => {
  for (const key of ['Tab', 'Enter', ' ', 'f', 'PageDown']) {
    assert.equal(cellAfterKey(5, press(key), KEYS_BOARD), null, key);
  }
});

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
 * On KEYS_BOARD, with cell 5 exploded: 6, 10 and 8 (diagonally) are next
 * to it; 3 and 11 are two columns away.
 */
test('a shown mine surfaces by its distance from the exploded one', () => {
  assert.equal(showDelayMs(6, 5, KEYS_BOARD.columns), 195);
  assert.equal(showDelayMs(10, 5, KEYS_BOARD.columns), 195);
  assert.equal(showDelayMs(3, 5, KEYS_BOARD.columns), 250);
  assert.equal(showDelayMs(8, 5, KEYS_BOARD.columns), 195);
  assert.equal(showDelayMs(11, 5, KEYS_BOARD.columns), 250);
});

/** Corners have three, edges five, the inside eight; never the cell itself. */
test("a cell's neighbors stay on the board", () => {
  assert.deepEqual(neighborIndexes(0, KEYS_BOARD), [1, 4, 5]);
  assert.deepEqual(neighborIndexes(7, KEYS_BOARD), [2, 3, 6, 10, 11]);
  assert.deepEqual(neighborIndexes(5, KEYS_BOARD), [0, 1, 2, 4, 6, 8, 9, 10]);
  assert.deepEqual(neighborIndexes(11, KEYS_BOARD), [6, 7, 10]);
});
