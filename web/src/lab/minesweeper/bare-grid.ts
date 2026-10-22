/**
 * A bare grid: the smallest page that plays the game through the core, so
 * the whole path (click → module → events → board) runs in the browser.
 * Scaffolding, to be replaced by the real session, board view, input and
 * HUD.
 *
 * The page keeps its own board, built only from the events: it never asks the
 * module anything.
 */
import { DIFFICULTY, type GameCore, type GameEvent } from './game-core.ts';

/** What a cell shows. A loss changes no cell in C; here it shows what the covers hid. */
type CellState = 'hidden' | 'flagged' | 'revealed' | 'exploded' | 'mine' | 'wrong-flag';

type Status = 'ready' | 'playing' | 'won' | 'lost';

interface Cell {
  state: CellState;
  neighborMineCount: number;
}

interface Board {
  rows: number;
  columns: number;
  mines: number;
  cells: Cell[];
  status: Status;
  flags: number;
  revealed: number;
}

/** What each state shows, except a revealed cell, which shows its number. */
const SYMBOLS: Record<Exclude<CellState, 'revealed'>, string> = {
  hidden: '',
  flagged: '⚑',
  exploded: '✸',
  mine: '✸',
  'wrong-flag': '✕',
};

const STATUS_TEXT: Record<Status, string> = {
  ready: 'Ready',
  playing: 'Playing',
  won: 'Won',
  lost: 'Lost',
};

function createBoard(rows: number, columns: number, mines: number): Board {
  return {
    rows,
    columns,
    mines,
    cells: Array.from({ length: rows * columns }, () => ({
      state: 'hidden',
      neighborMineCount: 0,
    })),
    status: 'ready',
    flags: 0,
    revealed: 0,
  };
}

/** Folds one event into the board. gameCreated makes a new board instead. */
function applyEvent(board: Board, event: Exclude<GameEvent, { type: 'gameCreated' }>): void {
  switch (event.type) {
    case 'cellRevealed':
      board.cells[event.cellIndex] = {
        state: 'revealed',
        neighborMineCount: event.neighborMineCount,
      };
      board.revealed += 1;
      board.status = 'playing';
      break;
    case 'cellFlagged':
      board.cells[event.cellIndex].state = 'flagged';
      board.flags += 1;
      break;
    case 'cellUnflagged':
      board.cells[event.cellIndex].state = 'hidden';
      board.flags -= 1;
      break;
    case 'mineExploded':
      board.cells[event.cellIndex].state = 'exploded';
      break;
    case 'mineShown':
      board.cells[event.cellIndex].state = 'mine';
      break;
    case 'wrongFlagShown':
      board.cells[event.cellIndex].state = 'wrong-flag';
      break;
    case 'gameWon':
      board.status = 'won';
      break;
    case 'gameLost':
      board.status = 'lost';
      break;
    default:
      // Every event has a case: a new one makes this a type error.
      event satisfies never;
  }
}

/** Finds a part of the game's markup (Minesweeper.astro). */
function part<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Minesweeper: no '${selector}' selector found`);
  }

  return element;
}

function isDifficultyName(name: string): name is keyof typeof DIFFICULTY {
  return Object.hasOwn(DIFFICULTY, name);
}

/** Plays the game in the markup under `root`, starting with a new game. */
export function startBareGrid(root: HTMLElement, core: GameCore): void {
  const difficultySelect = part<HTMLSelectElement>(root, '.minesweeper__difficulty');
  const newGameButton = part<HTMLButtonElement>(root, '.minesweeper__new-game');
  const status = part<HTMLElement>(root, '.minesweeper__status');
  const boardElement = part<HTMLElement>(root, '.minesweeper__board');
  let board: Board | null = null;

  function buildCells(board: Board): void {
    boardElement.style.setProperty('--columns', String(board.columns));
    boardElement.replaceChildren(
      ...board.cells.map((_, cellIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.cellIndex = String(cellIndex);
        return button;
      }),
    );
  }

  function paint(board: Board): void {
    board.cells.forEach((cell, cellIndex) => {
      const button = boardElement.children[cellIndex] as HTMLButtonElement;
      button.dataset.state = cell.state;
      button.textContent =
        cell.state === 'revealed'
          ? cell.neighborMineCount > 0
            ? String(cell.neighborMineCount)
            : ''
          : SYMBOLS[cell.state];
    });

    const safeCells = board.rows * board.columns - board.mines;
    status.textContent =
      `${STATUS_TEXT[board.status]} · ${board.mines - board.flags} mines left` +
      ` · ${board.revealed} of ${safeCells} cells revealed`;
  }

  function play(move: GameEvent[]): void {
    for (const event of move) {
      if (event.type === 'gameCreated') {
        board = createBoard(event.rows, event.columns, event.mines);
        buildCells(board);
      } else if (board) {
        applyEvent(board, event);
      }
    }

    if (board) {
      paint(board);
    }
  }

  function newGame(): void {
    const name = difficultySelect.value;

    if (isDifficultyName(name)) {
      const [seed] = crypto.getRandomValues(new Uint32Array(1));
      play(core.newGame(DIFFICULTY[name], seed));
    }
  }

  /** The cell a pointer event happened on, if any. */
  function cellIndexOf(event: Event): number | null {
    const button = (event.target as Element).closest<HTMLElement>('[data-cell-index]');
    return button ? Number(button.dataset.cellIndex) : null;
  }

  boardElement.addEventListener('click', (event) => {
    const cellIndex = cellIndexOf(event);

    if (cellIndex !== null) {
      play(core.reveal(cellIndex));
    }
  });

  boardElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const cellIndex = cellIndexOf(event);

    if (cellIndex !== null) {
      play(core.toggleFlag(cellIndex));
    }
  });

  newGameButton.addEventListener('click', newGame);
  difficultySelect.addEventListener('change', newGame);
  newGame();
}
