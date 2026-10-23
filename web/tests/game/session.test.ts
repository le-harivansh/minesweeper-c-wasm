/**
 * Tests web/src/lab/minesweeper/game/session.ts: the board that applyMove
 * folds from each move, and the session around it. No module here: the moves
 * are written out by hand, as the module sends them, and a fake core returns
 * them. What the module sends is tested in core.test.ts.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIFFICULTY,
  type GameCore,
  type GameEvent,
} from '../../src/lab/minesweeper/game/core.ts';
import {
  applyMove,
  createGameSession,
  EMPTY_BOARD,
  minesRemaining,
  revealedCount,
  safeCellCount,
  type Board,
  type CellState,
  type GameSession,
} from '../../src/lab/minesweeper/game/session.ts';

/**
 * A 3 × 3 game with mines at 2, 3 and 6, one move at a time. Its cells, and
 * what is under them:
 *
 *   0 1 2     1 2 *
 *   3 4 5     * 3 1
 *   6 7 8     * 2 0
 */
const NEW_GAME: GameEvent[] = [{ type: 'gameCreated', rows: 3, columns: 3, mines: 3 }];

/** The first reveal: 8 is a 0, so its neighbors 4, 5 and 7 come too, one ring out. */
const REVEAL_8: GameEvent[] = [
  { type: 'cellRevealed', cellIndex: 8, ring: 0, neighborMineCount: 0 },
  { type: 'cellRevealed', cellIndex: 4, ring: 1, neighborMineCount: 3 },
  { type: 'cellRevealed', cellIndex: 5, ring: 1, neighborMineCount: 1 },
  { type: 'cellRevealed', cellIndex: 7, ring: 1, neighborMineCount: 2 },
];

/** 0 has no mine: a wrong flag. */
const FLAG_0: GameEvent[] = [{ type: 'cellFlagged', cellIndex: 0 }];
const UNFLAG_0: GameEvent[] = [{ type: 'cellUnflagged', cellIndex: 0 }];

/** 2 has a mine: a right flag. */
const FLAG_2: GameEvent[] = [{ type: 'cellFlagged', cellIndex: 2 }];

/**
 * A loss, with 0 and 2 flagged: 6 explodes, then in cell order the wrong flag
 * on 0 and the one mine left unflagged, 3.
 */
const REVEAL_6: GameEvent[] = [
  { type: 'mineExploded', cellIndex: 6 },
  { type: 'wrongFlagShown', cellIndex: 0 },
  { type: 'mineShown', cellIndex: 3 },
  { type: 'gameLost' },
];

const REVEAL_0: GameEvent[] = [
  { type: 'cellRevealed', cellIndex: 0, ring: 0, neighborMineCount: 1 },
];

/** A win: 1 is the last safe cell, so every mine gets a flag, in cell order. */
const REVEAL_1: GameEvent[] = [
  { type: 'cellRevealed', cellIndex: 1, ring: 0, neighborMineCount: 2 },
  { type: 'cellFlagged', cellIndex: 2 },
  { type: 'cellFlagged', cellIndex: 3 },
  { type: 'cellFlagged', cellIndex: 6 },
  { type: 'gameWon' },
];

/** The C tests' characters for what a cell shows, except a revealed cell's number. */
const CHARACTERS: Record<Exclude<CellState, 'revealed'>, string> = {
  hidden: '#',
  flagged: 'F',
  exploded: 'X',
  mine: '*',
  'wrong-flag': 'W',
};

/** A board as text, one string a row, like the C tests' golden boards. */
function boardText(board: Board): string[] {
  const characters = board.cells.map((cell) =>
    cell.state === 'revealed' ? String(cell.neighborMineCount) : CHARACTERS[cell.state],
  );

  return Array.from({ length: board.rows }, (_, row) =>
    characters.slice(row * board.columns, (row + 1) * board.columns).join(''),
  );
}

/** The board after these moves, from the empty board. */
function boardAfter(...moves: GameEvent[][]): Board {
  return moves.reduce(applyMove, EMPTY_BOARD);
}

/**
 * Stands in for the module: each command returns the next of `moves`, or no
 * events once they run out, and is written down in `commands`.
 */
function fakeCore(moves: GameEvent[][]): GameCore & { commands: string[] } {
  const commands: string[] = [];

  function next(command: string): GameEvent[] {
    commands.push(command);

    return moves.shift() ?? [];
  }

  return {
    commands,
    newGame: (difficulty, seed) => next(`newGame(${difficulty}, ${seed})`),
    reveal: (cellIndex) => next(`reveal(${cellIndex})`),
    toggleFlag: (cellIndex) => next(`toggleFlag(${cellIndex})`),
  };
}

/**
 * A session over a fake core that returns `moves`. The test sets the clock's
 * time; the seeds are 1, 2, 3, … in turn; `moved` lists each move onMove got.
 */
function startSession(...moves: GameEvent[][]) {
  const core = fakeCore(moves);
  const clock = { time: 0 };
  const moved: (readonly GameEvent[])[] = [];
  let seed = 0;

  const session = createGameSession(core, {
    onMove: (move) => moved.push(move),
    now: () => clock.time,
    createSeed: () => (seed += 1),
  });

  return { session, clock, moved, commands: core.commands };
}

/** A new game replaces whatever was there: here the lost game. */
test('gameCreated starts a board of hidden cells', () => {
  const fresh = boardAfter(NEW_GAME);

  assert.deepEqual(fresh, {
    rows: 3,
    columns: 3,
    mines: 3,
    status: 'ready',
    cells: Array(9).fill({ state: 'hidden', neighborMineCount: 0 }),
  });
  assert.deepEqual(boardAfter(NEW_GAME, FLAG_0, REVEAL_8, FLAG_2, REVEAL_6, NEW_GAME), fresh);
});

/** Flags may go on before the first reveal; only a reveal starts play. */
test('the first reveal starts play, a flag does not', () => {
  assert.equal(boardAfter(NEW_GAME, FLAG_0).status, 'ready');
  assert.equal(boardAfter(NEW_GAME, FLAG_0, REVEAL_8).status, 'playing');
});

/**
 * A loss shows what the covers hid: the exploded mine (X), the wrong flag (W)
 * and the mine left unflagged (*). The right flag on 2 stays a flag.
 */
test('a loss shows the exploded mine, the wrong flags and the other mines', () => {
  const flagged = boardAfter(NEW_GAME, FLAG_0, REVEAL_8, FLAG_2);
  const lost = applyMove(flagged, REVEAL_6);

  assert.deepEqual(boardText(flagged), ['F#F', '#31', '#20']);
  assert.deepEqual(boardText(lost), ['W#F', '*31', 'X20']);
  assert.equal(lost.status, 'lost');
});

/** The winning move reveals the last safe cell, then flags every mine. */
test('a win reveals every safe cell and flags every mine', () => {
  const playing = boardAfter(NEW_GAME, REVEAL_8);
  const won = boardAfter(NEW_GAME, REVEAL_8, REVEAL_0, REVEAL_1);

  assert.equal(revealedCount(playing), 4);
  assert.deepEqual(boardText(won), ['12F', 'F31', 'F20']);
  assert.equal(won.status, 'won');
  assert.equal(revealedCount(won), safeCellCount(won));
  assert.equal(minesRemaining(won), 0);
});

/**
 * Mines remaining is mines minus flags. A wrong flag is still a flag, so the
 * count holds when a loss shows it as wrong. With more flags than mines it
 * goes below zero.
 */
test('mines remaining counts every flag, wrong ones too', () => {
  const flagged = boardAfter(NEW_GAME, FLAG_0, REVEAL_8, FLAG_2);
  const fourFlags = [0, 1, 2, 3].map((cellIndex): GameEvent[] => [
    { type: 'cellFlagged', cellIndex },
  ]);

  assert.equal(minesRemaining(flagged), 1);
  assert.equal(minesRemaining(applyMove(flagged, REVEAL_6)), 1);
  assert.equal(minesRemaining(boardAfter(NEW_GAME, ...fourFlags)), -1);
});

test('cellUnflagged hides the cell again', () => {
  const unflagged = boardAfter(NEW_GAME, FLAG_0, UNFLAG_0);

  assert.deepEqual(boardText(unflagged), ['###', '###', '###']);
  assert.equal(minesRemaining(unflagged), 3);
});

/**
 * applyMove returns a new board and leaves the old one as it was, so a view
 * can keep the board from before a move. The copy is taken before the move.
 */
test('applyMove leaves the board it is given unchanged', () => {
  const board = boardAfter(NEW_GAME, FLAG_0, REVEAL_8);
  const copy = structuredClone(board);

  applyMove(board, [...FLAG_2, ...REVEAL_6]);

  assert.deepEqual(board, copy);
});

/**
 * Before the first game the module has no cells, so every command returns no
 * events; so does revealing a revealed cell. Either way onMove isn't called
 * and the board stays the same value.
 */
test('a command that changes nothing calls no one', () => {
  const { session, moved } = startSession([], [], NEW_GAME, REVEAL_8, []);

  session.reveal(0);
  session.toggleFlag(0);

  assert.equal(session.board, EMPTY_BOARD);
  assert.equal(moved.length, 0);

  session.newGame(DIFFICULTY.beginner);
  session.reveal(8);
  const board = session.board;
  session.reveal(8);

  assert.equal(session.board, board);
  assert.equal(moved.length, 2);
});

/** Commands pass through as given, and each game gets a seed of its own. */
test('each command reaches the core, newGame with a new seed', () => {
  const { session, commands } = startSession();

  session.newGame(DIFFICULTY.expert);
  session.reveal(8);
  session.toggleFlag(0);
  session.newGame(DIFFICULTY.beginner);

  assert.deepEqual(commands, ['newGame(2, 1)', 'reveal(8)', 'toggleFlag(0)', 'newGame(0, 2)']);
});

/**
 * onMove gets each move as the core returned it, and by then the session's
 * board already shows it, so a view can repaint the move's cells from it.
 */
test('onMove is called once the board shows the move', () => {
  const calls: { move: readonly GameEvent[]; board: Board }[] = [];
  const session: GameSession = createGameSession(fakeCore([NEW_GAME, REVEAL_8]), {
    onMove: (move) => calls.push({ move, board: session.board }),
  });

  session.newGame(DIFFICULTY.beginner);
  session.reveal(8);

  assert.deepEqual(
    calls.map((call) => call.move),
    [NEW_GAME, REVEAL_8],
  );
  assert.deepEqual(boardText(calls[0].board), ['###', '###', '###']);
  assert.deepEqual(boardText(calls[1].board), ['###', '#31', '#20']);
});

/**
 * The clock starts at the first reveal, not at a flag before it, and stops
 * when the game ends: time after either changes nothing.
 */
test('the clock runs from the first reveal until the game ends', () => {
  const { session, clock } = startSession(NEW_GAME, FLAG_0, REVEAL_8, FLAG_2, REVEAL_6);

  session.newGame(DIFFICULTY.beginner);
  clock.time = 1_000;
  session.toggleFlag(0);
  clock.time = 2_000;

  assert.equal(session.elapsedMs(), 0);

  session.reveal(8);
  clock.time = 5_000;
  session.toggleFlag(2);

  assert.equal(session.elapsedMs(), 3_000);

  clock.time = 6_500;
  session.reveal(6);
  clock.time = 10_000;

  assert.equal(session.elapsedMs(), 4_500);
});

/**
 * A 1 × 3 game with a mine at 2: the first reveal, at 0, reveals both safe
 * cells and wins at once. The game never played, so it took no time.
 */
test('a game won on its first reveal took no time', () => {
  const { session, clock } = startSession(
    [{ type: 'gameCreated', rows: 1, columns: 3, mines: 1 }],
    [
      { type: 'cellRevealed', cellIndex: 0, ring: 0, neighborMineCount: 0 },
      { type: 'cellRevealed', cellIndex: 1, ring: 1, neighborMineCount: 1 },
      { type: 'cellFlagged', cellIndex: 2 },
      { type: 'gameWon' },
    ],
  );

  session.newGame(DIFFICULTY.beginner);
  clock.time = 2_000;
  session.reveal(0);
  clock.time = 9_000;

  assert.equal(session.board.status, 'won');
  assert.equal(session.elapsedMs(), 0);
});

test('a new game resets the clock', () => {
  const { session, clock } = startSession(NEW_GAME, REVEAL_8, NEW_GAME);

  session.newGame(DIFFICULTY.beginner);
  clock.time = 1_000;
  session.reveal(8);
  clock.time = 4_000;

  assert.equal(session.elapsedMs(), 3_000);

  session.newGame(DIFFICULTY.beginner);
  clock.time = 9_000;

  assert.equal(session.elapsedMs(), 0);
});
