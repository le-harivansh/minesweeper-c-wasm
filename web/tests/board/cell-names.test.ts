/**
 * Tests web/src/lab/minesweeper/board/cell-names.ts: each cell's accessible
 * name, what it shows and where it is.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellLabel } from '../../src/lab/minesweeper/board/cell-names.ts';
import { applyMove, EMPTY_BOARD, type Board } from '../../src/lab/minesweeper/game/session.ts';

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
