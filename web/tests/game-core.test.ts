/**
 * Tests web/src/lab/minesweeper/game-core.ts, the browser's side of the
 * boundary, over the built module: each command returns its own move, every
 * event typed and in order. What crosses the boundary is tested in
 * tests/minesweeper.test.mjs; the rules natively, in tests/game.test.c.
 *
 * Run with `make test-wasm`, which builds build/minesweeper.wasm first. Node
 * runs this file as it is, by stripping the types without checking them;
 * `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DIFFICULTY, loadGameCore, type GameEvent } from '../src/lab/minesweeper/game-core.ts';

const WASM_BYTES = new Uint8Array(
  await readFile(new URL('../../build/minesweeper.wasm', import.meta.url)),
);

/** A beginner board: 9 × 9 cells, 10 mines (BOARD_SETUP_BEGINNER). */
const BEGINNER_CELL_COUNT = 81;
const BEGINNER_MINE_COUNT = 10;

/**
 * As in tests/minesweeper.test.mjs: these two reveal 28 cells over rings 0
 * to 4, so a cell's ring and its number differ.
 */
const SEED = 42;
const FIRST_CELL = 5;

/**
 * A fresh core, from the module's bytes served the way the browser gets them:
 * instantiateStreaming refuses a response that isn't application/wasm.
 */
function load() {
  return loadGameCore(
    new Response(WASM_BYTES, { headers: { 'Content-Type': 'application/wasm' } }),
  );
}

/**
 * Finds the game's mines by playing it once per cell: after the first reveal
 * has placed the mines, revealing a mine returns mineExploded. Checks it found
 * them all, so a broken search fails here, not in the test that uses it.
 */
async function findMines(): Promise<number[]> {
  const game = await load();
  const mines: number[] = [];

  for (let cell = 0; cell < BEGINNER_CELL_COUNT; cell++) {
    game.newGame(DIFFICULTY.beginner, SEED);
    game.reveal(FIRST_CELL);

    if (game.reveal(cell).some((event) => event.type === 'mineExploded')) {
      mines.push(cell);
    }
  }

  assert.equal(mines.length, BEGINNER_MINE_COUNT);

  return mines;
}

/** The cells a move revealed. */
const revealedCells = (move: GameEvent[]) =>
  move.flatMap((event) => (event.type === 'cellRevealed' ? [event.cellIndex] : []));

test('newGame returns gameCreated with the board size', async () => {
  const game = await load();

  assert.deepEqual(game.newGame(DIFFICULTY.beginner, SEED), [
    { type: 'gameCreated', rows: 9, columns: 9, mines: BEGINNER_MINE_COUNT },
  ]);
});

/**
 * Each revealed cell is one cellRevealed, in the order the cascade reached
 * it. The last cell's ring (4) and number (3) differ, so swapped fields would
 * show.
 */
test('reveal returns each revealed cell with its ring and number, in order', async () => {
  const game = await load();
  game.newGame(DIFFICULTY.beginner, SEED);
  const move = game.reveal(FIRST_CELL);

  assert.equal(move.length, 28);
  assert.ok(move.every((event) => event.type === 'cellRevealed'));
  assert.deepEqual(move[0], { type: 'cellRevealed', cellIndex: 5, ring: 0, neighborMineCount: 0 });
  assert.deepEqual(move.at(-1), {
    type: 'cellRevealed',
    cellIndex: 42,
    ring: 4,
    neighborMineCount: 3,
  });
});

/**
 * Each command starts a new list: the flag's move holds none of the reveal's
 * events, and the list the reveal returned stays as it was after later
 * commands.
 */
test('each command returns only its own move', async () => {
  const game = await load();
  game.newGame(DIFFICULTY.beginner, SEED);
  const reveal = game.reveal(FIRST_CELL);
  const revealed = revealedCells(reveal);
  let hiddenCell = 0;

  while (revealed.includes(hiddenCell)) {
    hiddenCell++;
  }

  assert.deepEqual(game.toggleFlag(hiddenCell), [{ type: 'cellFlagged', cellIndex: hiddenCell }]);
  assert.deepEqual(game.toggleFlag(hiddenCell), [{ type: 'cellUnflagged', cellIndex: hiddenCell }]);
  assert.equal(reveal.length, 28);
});

/**
 * Before the first newGame the module's game has no cells, so every command
 * changes nothing; once playing, revealing a revealed cell changes nothing.
 */
test('a command that changes nothing returns no events', async () => {
  const game = await load();

  assert.deepEqual(game.reveal(0), []);
  assert.deepEqual(game.toggleFlag(0), []);

  game.newGame(DIFFICULTY.beginner, SEED);
  game.reveal(FIRST_CELL);

  assert.deepEqual(game.reveal(FIRST_CELL), []);
});

/**
 * A loss: the explosion, then in cell order each other mine and the wrong
 * flag, then gameLost. The wrong flag goes on the first cell that is neither
 * a mine nor revealed.
 */
test('a loss returns the explosion, the other mines, the wrong flag, then gameLost', async () => {
  const mines = await findMines();
  const game = await load();
  game.newGame(DIFFICULTY.beginner, SEED);
  const revealed = revealedCells(game.reveal(FIRST_CELL));
  let wrongFlag = 0;

  while (mines.includes(wrongFlag) || revealed.includes(wrongFlag)) {
    wrongFlag++;
  }

  game.toggleFlag(wrongFlag);
  const exploded = mines[0];
  const expected: GameEvent[] = [{ type: 'mineExploded', cellIndex: exploded }];

  for (let cell = 0; cell < BEGINNER_CELL_COUNT; cell++) {
    if (cell !== exploded && mines.includes(cell)) {
      expected.push({ type: 'mineShown', cellIndex: cell });
    } else if (cell === wrongFlag) {
      expected.push({ type: 'wrongFlagShown', cellIndex: cell });
    }
  }

  expected.push({ type: 'gameLost' });
  assert.deepEqual(game.reveal(exploded), expected);
});

/** The winning move ends by flagging each mine, in cell order, then gameWon. */
test('a win returns a flag on each mine, then gameWon', async () => {
  const mines = await findMines();
  const game = await load();
  game.newGame(DIFFICULTY.beginner, SEED);
  let lastMove = game.reveal(FIRST_CELL);

  for (let cell = 0; cell < BEGINNER_CELL_COUNT; cell++) {
    const move = mines.includes(cell) ? [] : game.reveal(cell);

    if (move.length > 0) {
      lastMove = move;
    }
  }

  const expectedEnd: GameEvent[] = [
    ...mines.map((cell): GameEvent => ({ type: 'cellFlagged', cellIndex: cell })),
    { type: 'gameWon' },
  ];
  assert.deepEqual(lastMove.slice(-expectedEnd.length), expectedEnd);
});

/**
 * The difficulty buttons (Minesweeper.astro) give each board's size, as
 * "9×9 · 10 mines" or "16×16 · 40": columns × rows, then mines (the word
 * only on the first, as in the prototype). The module decides the sizes
 * (src/game.c); this keeps the markup's copy true to them.
 */
test("each difficulty button gives its board's size as the module deals it", async () => {
  const markup = readFileSync(
    new URL('../src/lab/minesweeper/Minesweeper.astro', import.meta.url),
    'utf8',
  );
  const game = await load();

  for (const [name, difficulty] of Object.entries(DIFFICULTY)) {
    const created = game.newGame(difficulty, SEED)[0];
    const button = new RegExp(`data-difficulty="${name}"[^>]*>\\s*\\w+ <span[^>]*>([^<]+)</span>`);

    assert.equal(created.type, 'gameCreated');
    assert.equal(
      button.exec(markup)?.[1]?.replace(/ mines$/, ''),
      created.type === 'gameCreated' && `${created.columns}×${created.rows} · ${created.mines}`,
      name,
    );
  }
});
