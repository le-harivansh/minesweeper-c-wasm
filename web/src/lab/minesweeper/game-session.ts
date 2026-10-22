/**
 * The session: the browser's one copy of the game.
 *
 * The module never answers questions; it only sends events. The session
 * folds each move into its own board, once, and the views read that board:
 * the board says what is true now, the move says what just changed and in
 * what order. A cell's ring belongs to the move, so the board doesn't keep it.
 *
 * Two parts. applyMove() is pure: a board and a move in, a new board out, no
 * core, clock or page. createGameSession() wraps it with what isn't pure: the
 * core, the clock, the seed and the one listener.
 */
import type { Difficulty, GameCore, GameEvent } from './game-core.ts';

/** Where the game stands; it only moves forward until the next game. */
export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

/**
 * What a cell shows. 'exploded', 'mine' and 'wrong-flag' appear only when a
 * loss shows what the covers hid; the module itself never changes a mine's
 * cover.
 */
export type CellState = 'hidden' | 'flagged' | 'revealed' | 'exploded' | 'mine' | 'wrong-flag';

export interface Cell {
  readonly state: CellState;
  /** Known once the cell is revealed; 0 until then. */
  readonly neighborMineCount: number;
}

/** The game as the player sees it. Never changed: each move makes a new one. */
export interface Board {
  readonly rows: number;
  readonly columns: number;
  readonly mines: number;
  readonly status: GameStatus;
  /** Row by row, as in C: a cell's index is row × columns + column. */
  readonly cells: readonly Cell[];
}

const HIDDEN_CELL: Cell = { state: 'hidden', neighborMineCount: 0 };

/** The board before the first game, like C's all-zeros game: no cells. */
export const EMPTY_BOARD: Board = {
  rows: 0,
  columns: 0,
  mines: 0,
  status: 'ready',
  cells: [],
};

/**
 * Folds a move into a board. Returns a new board and leaves the one it was
 * given as it was, so a caller can keep the board from before a move.
 * gameCreated starts a new board of hidden cells.
 */
export function applyMove(board: Board, move: readonly GameEvent[]): Board {
  let { rows, columns, mines, status } = board;
  let cells = [...board.cells];

  for (const event of move) {
    switch (event.type) {
      case 'gameCreated':
        ({ rows, columns, mines } = event);
        status = 'ready';
        cells = Array.from({ length: rows * columns }, () => HIDDEN_CELL);
        break;
      case 'cellRevealed':
        cells[event.cellIndex] = {
          state: 'revealed',
          neighborMineCount: event.neighborMineCount,
        };
        // The module sends nothing once a game is over, so a reveal always
        // means play: the first one starts it, a winning one comes before
        // gameWon.
        status = 'playing';
        break;
      case 'cellFlagged':
        cells[event.cellIndex] = { state: 'flagged', neighborMineCount: 0 };
        break;
      case 'cellUnflagged':
        cells[event.cellIndex] = HIDDEN_CELL;
        break;
      case 'mineExploded':
        cells[event.cellIndex] = { state: 'exploded', neighborMineCount: 0 };
        break;
      case 'mineShown':
        cells[event.cellIndex] = { state: 'mine', neighborMineCount: 0 };
        break;
      case 'wrongFlagShown':
        cells[event.cellIndex] = { state: 'wrong-flag', neighborMineCount: 0 };
        break;
      case 'gameWon':
        status = 'won';
        break;
      case 'gameLost':
        status = 'lost';
        break;
      default:
        // Every event has a case: a new one makes this a type error.
        event satisfies never;
    }
  }

  return { rows, columns, mines, status, cells };
}

function countCells(board: Board, states: readonly CellState[]): number {
  return board.cells.filter((cell) => states.includes(cell.state)).length;
}

/**
 * Mines minus flags; negative when there are more flags than mines. A wrong
 * flag is still a flag, so the count holds when a loss shows it.
 */
export function minesRemaining(board: Board): number {
  return board.mines - countCells(board, ['flagged', 'wrong-flag']);
}

export function revealedCount(board: Board): number {
  return countCells(board, ['revealed']);
}

/** The cells to reveal to win. */
export function safeCellCount(board: Board): number {
  return board.rows * board.columns - board.mines;
}

/**
 * The game in play: its board, its clock and the three commands. A command
 * returns nothing: what it changed goes to onMove.
 */
export interface GameSession {
  /** The board as the player sees it now: a new value after every move. */
  readonly board: Board;
  /** Milliseconds played: 0 before the first reveal, fixed once the game is over. */
  elapsedMs(): number;
  /** Starts a game with a new seed; until the first one, the board is EMPTY_BOARD. */
  newGame(difficulty: Difficulty): void;
  reveal(cellIndex: number): void;
  toggleFlag(cellIndex: number): void;
}

export interface GameSessionOptions {
  /**
   * Called after each move that changed something, once `board` shows it. A
   * move that changed nothing calls no one.
   */
  onMove(move: readonly GameEvent[]): void;
  /** The clock, in milliseconds. Defaults to performance.now(). */
  now?: () => number;
  /** A new game's seed, from 0 to 2³² − 1. Defaults to a random one. */
  createSeed?: () => number;
}

export function createGameSession(
  core: GameCore,
  { onMove, now = () => performance.now(), createSeed = createRandomSeed }: GameSessionOptions,
): GameSession {
  let board = EMPTY_BOARD;
  let startedAt: number | null = null;
  let endedAt: number | null = null;

  function play(move: readonly GameEvent[]): void {
    if (move.length === 0) {
      return;
    }

    const statusBefore = board.status;
    board = applyMove(board, move);

    // The clock follows the status, and the status follows the events.
    if (board.status !== statusBefore) {
      const time = now();

      switch (board.status) {
        case 'ready':
          startedAt = null;
          endedAt = null;
          break;
        case 'playing':
          startedAt = time;
          break;
        // A first reveal that wins goes from ready straight to won, so
        // startedAt stays null: the game took no time.
        case 'won':
        case 'lost':
          endedAt = time;
          break;
        default:
          board.status satisfies never;
      }
    }

    onMove(move);
  }

  return {
    get board() {
      return board;
    },
    elapsedMs: () => (startedAt === null ? 0 : (endedAt ?? now()) - startedAt),
    newGame: (difficulty) => play(core.newGame(difficulty, createSeed())),
    reveal: (cellIndex) => play(core.reveal(cellIndex)),
    toggleFlag: (cellIndex) => play(core.toggleFlag(cellIndex)),
  };
}

function createRandomSeed(): number {
  const [seed] = crypto.getRandomValues(new Uint32Array(1));

  return seed;
}
