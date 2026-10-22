/**
 * The board view: the game's board as an ARIA grid, painted from the
 * session's board.
 *
 * The grid has real rows, so a screen reader can move by row and column. Each
 * cell is a button with the gridcell role: it keeps the button's own focus and
 * its click on Enter and Space. The view writes only what a cell is
 * (data-state, data-count, aria-label); the CSS draws it.
 *
 * One cell at a time is in the page's tab order (a roving tabindex): Tab
 * enters the grid at that cell and leaves it at the next control. Arrows,
 * Home and End move between cells, as a grid's keys do. Game keys (flag,
 * reveal) are input's, not the view's.
 *
 * cellLabel() and cellAfterKey() are pure and tested in Node; the rest needs
 * a page.
 */
import { findPart } from './find-part.ts';
import type { GameEvent } from './game-core.ts';
import type { Board, CellState } from './game-session.ts';

/** What a screen reader says for each state, except a revealed cell's number. */
const STATE_LABELS: Record<Exclude<CellState, 'revealed'>, string> = {
  hidden: 'Hidden',
  flagged: 'Flagged',
  exploded: 'Exploded mine',
  mine: 'Mine',
  'wrong-flag': 'Wrong flag',
};

/** Where a cell is, in words, counted from 1: "row 3, column 27". */
export function cellPosition(board: Pick<Board, 'columns'>, cellIndex: number): string {
  const row = Math.floor(cellIndex / board.columns) + 1;
  const column = (cellIndex % board.columns) + 1;

  return `row ${row}, column ${column}`;
}

/**
 * A cell's accessible name: what it shows, then where it is, as in
 * "Flagged, row 3, column 27". What it shows comes first: moving between
 * cells, it's what changes.
 */
export function cellLabel(board: Board, cellIndex: number): string {
  const cell = board.cells[cellIndex];
  const shows =
    cell.state !== 'revealed'
      ? STATE_LABELS[cell.state]
      : cell.neighborMineCount > 0
        ? String(cell.neighborMineCount)
        : 'Empty';

  return `${shows}, ${cellPosition(board, cellIndex)}`;
}

/**
 * The cell a key moves to from `cellIndex`: arrows one cell, Home and End to
 * the row's ends, Control with Home or End to the board's first or last cell.
 * At an edge it stays put; it never wraps to the next row. Null for any other
 * key, which the view then leaves alone.
 */
export function cellAfterKey(
  cellIndex: number,
  { key, ctrlKey }: Pick<KeyboardEvent, 'key' | 'ctrlKey'>,
  { rows, columns }: Pick<Board, 'rows' | 'columns'>,
): number | null {
  const row = Math.floor(cellIndex / columns);
  const column = cellIndex % columns;
  const at = (row: number, column: number) => row * columns + column;

  switch (key) {
    case 'ArrowLeft':
      return at(row, Math.max(column - 1, 0));
    case 'ArrowRight':
      return at(row, Math.min(column + 1, columns - 1));
    case 'ArrowUp':
      return at(Math.max(row - 1, 0), column);
    case 'ArrowDown':
      return at(Math.min(row + 1, rows - 1), column);
    case 'Home':
      return ctrlKey ? 0 : at(row, 0);
    case 'End':
      return ctrlKey ? rows * columns - 1 : at(row, columns - 1);
    default:
      return null;
  }
}

export interface BoardView {
  /**
   * Shows a move the session has applied: `board` is the session's board
   * after it. A new game builds the cells when the board's size changed and
   * repaints them all; any other move repaints only the cells it names. The
   * grid's data-status follows the game's, for the CSS.
   */
  showMove(move: readonly GameEvent[], board: Board): void;
}

/** Shows the board in the grid of the game's markup under `root`. */
export function createBoardView(root: HTMLElement): BoardView {
  const grid = findPart(root, '.minesweeper__board');
  let rows = 0;
  let columns = 0;
  let cells: HTMLButtonElement[] = [];
  // The cell in the tab order.
  let focusableIndex = 0;

  function createCell(cellIndex: number): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'minesweeper__cell';
    cell.setAttribute('role', 'gridcell');
    cell.dataset.cellIndex = String(cellIndex);
    cell.tabIndex = cellIndex === focusableIndex ? 0 : -1;
    return cell;
  }

  // A new size starts the tab order at the first cell: the controls that
  // change the size have the focus, not the grid.
  function buildCells(board: Board): void {
    rows = board.rows;
    columns = board.columns;
    focusableIndex = 0;
    cells = board.cells.map((_, cellIndex) => createCell(cellIndex));

    grid.replaceChildren(
      ...Array.from({ length: rows }, (_, row) => {
        const rowElement = document.createElement('div');
        rowElement.className = 'minesweeper__row';
        rowElement.setAttribute('role', 'row');
        rowElement.append(...cells.slice(row * columns, (row + 1) * columns));
        return rowElement;
      }),
    );
    grid.removeAttribute('aria-busy');
  }

  function paintCell(board: Board, cellIndex: number): void {
    const element = cells[cellIndex];
    const cell = board.cells[cellIndex];

    element.dataset.state = cell.state;
    element.setAttribute('aria-label', cellLabel(board, cellIndex));

    if (cell.state === 'revealed' && cell.neighborMineCount > 0) {
      element.dataset.count = String(cell.neighborMineCount);
    } else {
      delete element.dataset.count;
    }
  }

  /** Puts `cellIndex` in the tab order, in place of the cell that was. */
  function makeFocusable(cellIndex: number): void {
    cells[focusableIndex].tabIndex = -1;
    focusableIndex = cellIndex;
    cells[focusableIndex].tabIndex = 0;
  }

  // A cell focused by a click or by Tab becomes the one the keys move from.
  grid.addEventListener('focusin', (event) => {
    const cell = (event.target as Element).closest<HTMLElement>('[data-cell-index]');

    if (cell) {
      makeFocusable(Number(cell.dataset.cellIndex));
    }
  });

  grid.addEventListener('keydown', (event) => {
    const next = cellAfterKey(focusableIndex, event, { rows, columns });

    if (next === null) {
      return;
    }

    // Even at an edge: an arrow key that stays put mustn't scroll the page.
    event.preventDefault();
    makeFocusable(next);
    cells[next].focus();
  });

  return {
    showMove(move, board) {
      for (const event of move) {
        if (event.type === 'gameCreated') {
          if (board.rows !== rows || board.columns !== columns) {
            buildCells(board);
          }

          board.cells.forEach((_, cellIndex) => paintCell(board, cellIndex));
        } else if ('cellIndex' in event) {
          paintCell(board, event.cellIndex);
        }
      }

      grid.dataset.status = board.status;
    },
  };
}
