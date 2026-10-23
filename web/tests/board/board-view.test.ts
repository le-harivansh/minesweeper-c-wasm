/**
 * Tests the pure half of web/src/lab/minesweeper/board/board-view.ts: where
 * each grid key moves the focus, and a cell's neighbors. The half that builds
 * and paints the cells needs a page; it is checked in the browser. Each cell's
 * name is cell-names', and when its motion starts is move-timing's.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellAfterKey, neighborIndexes } from '../../src/lab/minesweeper/board/board-view.ts';

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

/** Corners have three, edges five, the inside eight; never the cell itself. */
test("a cell's neighbors stay on the board", () => {
  assert.deepEqual(neighborIndexes(0, KEYS_BOARD), [1, 4, 5]);
  assert.deepEqual(neighborIndexes(7, KEYS_BOARD), [2, 3, 6, 10, 11]);
  assert.deepEqual(neighborIndexes(5, KEYS_BOARD), [0, 1, 2, 4, 6, 8, 9, 10]);
  assert.deepEqual(neighborIndexes(11, KEYS_BOARD), [6, 7, 10]);
});
