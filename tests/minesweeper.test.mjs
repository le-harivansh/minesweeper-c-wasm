/**
 * Tests src/minesweeper.c, the wasm boundary, through the built module, loaded
 * the way the browser will load it: what it exports and imports, and that each
 * event reaches its JS function with its data. The rules themselves are tested
 * natively, in tests/game.test.c.
 *
 * Run with `make test-wasm`, which builds build/minesweeper.wasm first.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/** Each event's JS function, in EventType's order (src/game.h). */
const EVENT_NAMES = [
  'onGameCreated',
  'onCellRevealed',
  'onCellFlagged',
  'onCellUnflagged',
  'onMineExploded',
  'onMineShown',
  'onWrongFlagShown',
  'onGameWon',
  'onGameLost',
];

/** Difficulty's values, from src/game.h. */
const DIFFICULTY_BEGINNER = 0;
const DIFFICULTY_EXPERT = 2;

/** A beginner board: 9 × 9 cells, 10 mines (BOARD_SETUP_BEGINNER). */
const BEGINNER_CELL_COUNT = 81;
const BEGINNER_MINE_COUNT = 10;

/**
 * Any seed and first reveal would do. These two reveal 28 cells over rings 0
 * to 4, so a cell's ring and its number differ (checked against the native
 * build).
 */
const SEED = 42;
const FIRST_CELL = 5;

const wasmModule = await WebAssembly.compile(
  await readFile(new URL('../build/minesweeper.wasm', import.meta.url)),
);

/**
 * Loads a fresh copy of the module, with a JS function for each event that
 * records its call as [name, ...arguments]: exactly what crossed the boundary.
 * Each command returns the calls it caused.
 */
async function load() {
  let calls = [];
  const events = Object.fromEntries(
    EVENT_NAMES.map((name) => [name, (...args) => calls.push([name, ...args])]),
  );
  const instance = await WebAssembly.instantiate(wasmModule, { events });
  const command =
    (name) =>
    (...args) => {
      calls = [];

      instance.exports[name](...args);

      return calls;
    };

  return {
    newGame: command('newGame'),
    reveal: command('reveal'),
    toggleFlag: command('toggleFlag'),
  };
}

/**
 * Finds a beginner game's mines by playing it once per cell: after the first
 * reveal has placed the mines, revealing a mine calls onMineExploded. Checks
 * it found them all, so a broken search fails here, not later in the test
 * that uses it.
 */
async function findMines(seed, firstCell) {
  const game = await load();
  const mines = [];

  for (let cell = 0; cell < BEGINNER_CELL_COUNT; cell++) {
    game.newGame(DIFFICULTY_BEGINNER, seed);
    game.reveal(firstCell);

    if (game.reveal(cell).some(([name]) => name === 'onMineExploded')) {
      mines.push(cell);
    }
  }

  assert.equal(mines.length, BEGINNER_MINE_COUNT);

  return mines;
}

const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * The module's whole surface: the three commands in, the nine events out, and
 * nothing else. wasm-ld always exports the memory, though JS never reads it.
 */
test('the module exports the commands and imports one function per event', () => {
  assert.deepEqual(WebAssembly.Module.exports(wasmModule).sort(byName), [
    { name: 'memory', kind: 'memory' },
    { name: 'newGame', kind: 'function' },
    { name: 'reveal', kind: 'function' },
    { name: 'toggleFlag', kind: 'function' },
  ]);
  assert.deepEqual(
    WebAssembly.Module.imports(wasmModule).sort(byName),
    EVENT_NAMES.map((name) => ({ module: 'events', name, kind: 'function' })).sort(byName),
  );
});

/**
 * Before the first newGame, the module's game is all zeros: a board with no
 * cells, so every command is off the board and sends nothing.
 */
test('commands before newGame send nothing', async () => {
  const game = await load();

  assert.deepEqual(game.reveal(0), []);
  assert.deepEqual(game.toggleFlag(0), []);
});

/** onGameCreated gets the board's size: Expert is 16 rows, 30 columns, 99 mines. */
test('newGame calls onGameCreated with the board size', async () => {
  const game = await load();

  assert.deepEqual(game.newGame(DIFFICULTY_EXPERT, SEED), [['onGameCreated', 16, 30, 99]]);
});

/**
 * Difficulty is one byte in C, so without the wrapper's range check 256 would
 * start a beginner game. -1 is out of range too; 3 fits a byte but names no
 * difficulty. None of them sends anything, and the flag set before them shows
 * the same game plays on.
 */
test('newGame ignores a difficulty out of range', async () => {
  const game = await load();
  game.newGame(DIFFICULTY_BEGINNER, SEED);
  game.toggleFlag(0);

  for (const difficulty of [256, -1, 3]) {
    assert.deepEqual(game.newGame(difficulty, SEED), [], `difficulty ${difficulty}`);
  }

  assert.deepEqual(game.toggleFlag(0), [['onCellUnflagged', 0]]);
});

/**
 * Every revealed cell arrives as (cellIndex, ring, neighborMineCount), in
 * the order the cascade reached it. The last cell's ring (4) and number (3)
 * differ, so swapped arguments would show.
 */
test('reveal sends each revealed cell with its ring and number', async () => {
  const game = await load();
  game.newGame(DIFFICULTY_BEGINNER, SEED);
  const calls = game.reveal(FIRST_CELL);

  assert.equal(calls.length, 28);
  assert.ok(calls.every(([name]) => name === 'onCellRevealed'));
  assert.deepEqual(calls[0], ['onCellRevealed', 5, 0, 0]);
  assert.deepEqual(calls.at(-1), ['onCellRevealed', 42, 4, 3]);
  assert.ok(calls.every(([, , ring], i) => i === 0 || ring >= calls[i - 1][2]));
});

/** One call per toggle, to the function for its direction. */
test('toggleFlag calls onCellFlagged, then onCellUnflagged', async () => {
  const game = await load();
  game.newGame(DIFFICULTY_BEGINNER, SEED);

  assert.deepEqual(game.toggleFlag(7), [['onCellFlagged', 7]]);
  assert.deepEqual(game.toggleFlag(7), [['onCellUnflagged', 7]]);
});

/**
 * A loss uses the four loss events: the explosion, then in cell order each
 * other mine and the wrong flag, then onGameLost. The wrong flag goes on the
 * first cell that is neither a mine nor revealed.
 */
test('a loss sends the explosion, the other mines, the wrong flags, then onGameLost', async () => {
  const mines = await findMines(SEED, FIRST_CELL);
  const game = await load();
  game.newGame(DIFFICULTY_BEGINNER, SEED);
  const revealed = game.reveal(FIRST_CELL).map(([, cell]) => cell);
  let wrongFlag = 0;

  while (mines.includes(wrongFlag) || revealed.includes(wrongFlag)) {
    wrongFlag++;
  }

  game.toggleFlag(wrongFlag);
  const exploded = mines[0];
  const expected = [['onMineExploded', exploded]];

  for (let cell = 0; cell < BEGINNER_CELL_COUNT; cell++) {
    if (cell !== exploded && mines.includes(cell)) {
      expected.push(['onMineShown', cell]);
    } else if (cell === wrongFlag) {
      expected.push(['onWrongFlagShown', cell]);
    }
  }

  expected.push(['onGameLost']);
  assert.deepEqual(game.reveal(exploded), expected);
});

/** The winning move ends by flagging each mine, in cell order, then onGameWon. */
test('a win flags the mines, then calls onGameWon', async () => {
  const mines = await findMines(SEED, FIRST_CELL);
  const game = await load();
  game.newGame(DIFFICULTY_BEGINNER, SEED);
  let lastMove = game.reveal(FIRST_CELL);

  for (let cell = 0; cell < BEGINNER_CELL_COUNT; cell++) {
    const calls = mines.includes(cell) ? [] : game.reveal(cell);

    if (calls.length > 0) {
      lastMove = calls;
    }
  }

  const expectedEnd = [...mines.map((cell) => ['onCellFlagged', cell]), ['onGameWon']];
  assert.deepEqual(lastMove.slice(-expectedEnd.length), expectedEnd);
});
