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
 * Each cell holds its cover, the tile the CSS takes away when the cell is
 * revealed. The motion is CSS; the view only says when each cell's part of
 * it starts, from move-timing.ts: a reveal ripples out ring by ring from the
 * click, and a loss shows the other mines nearest the exploded one first.
 *
 * Hovering a revealed number with a mouse marks its hidden neighbors, to
 * help count them.
 *
 * Each cell's name is cell-names.ts's. cellAfterKey() and neighborIndexes()
 * are pure and tested in Node; the rest needs a page.
 */
import type { GameEvent } from '../game/core.ts';
import type { Board } from '../game/session.ts';
import { requireElement } from '../utils.ts';
import { createStarField } from '../worlds/star-field.ts';
import { cellLabel } from './cell-names.ts';
import { revealDelayMs, showDelayMs } from './move-timing.ts';

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

/** The cells around `cellIndex`, without it, in reading order: three to eight. */
export function neighborIndexes(
  cellIndex: number,
  { rows, columns }: Pick<Board, 'rows' | 'columns'>,
): number[] {
  const row = Math.floor(cellIndex / columns);
  const column = cellIndex % columns;
  const neighbors: number[] = [];

  for (let neighborRow = row - 1; neighborRow <= row + 1; neighborRow++) {
    for (let neighborColumn = column - 1; neighborColumn <= column + 1; neighborColumn++) {
      const isOnBoard =
        neighborRow >= 0 && neighborRow < rows && neighborColumn >= 0 && neighborColumn < columns;

      if (isOnBoard && (neighborRow !== row || neighborColumn !== column)) {
        neighbors.push(neighborRow * columns + neighborColumn);
      }
    }
  }

  return neighbors;
}

export interface BoardView {
  /**
   * Shows a move the session has applied: `board` is the session's board
   * after it. A new game builds the cells when the board's size changed and
   * repaints them all; any other move repaints only the cells it names, and
   * times their motion. The grid's data-status follows the game's, for the
   * CSS.
   */
  showMove(move: readonly GameEvent[], board: Board): void;
  /** Puts the focus on the cell in the tab order, without scrolling the page. */
  focus(): void;
}

/** The cell an event happened on, if any. */
function cellIndexOf(target: EventTarget | null): number | null {
  const cell = target instanceof Element ? target.closest<HTMLElement>('[data-cell-index]') : null;
  return cell ? Number(cell.dataset.cellIndex) : null;
}

/** Shows the board in the grid of the game's markup under `root`. */
export function createBoardView(root: HTMLElement): BoardView {
  const grid = requireElement(root, '.minesweeper__board');
  let rows = 0;
  let columns = 0;
  let cells: HTMLButtonElement[] = [];
  // The cell in the tab order.
  let focusableIndex = 0;
  // The board last shown, for the hover.
  let shownBoard: Board | null = null;
  // The revealed number under the mouse, and the neighbors it marks.
  let hoveredIndex: number | null = null;
  let highlighted: number[] = [];

  // The night sky's stars: night-sky.css draws them, in that world only.
  const stars = createStarField();
  grid.style.setProperty('--star-field', stars.fixed);
  grid.style.setProperty('--twinkling-stars', stars.twinkling);

  function createCell(cellIndex: number): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'minesweeper__cell';
    cell.setAttribute('role', 'gridcell');
    cell.dataset.cellIndex = String(cellIndex);
    cell.tabIndex = cellIndex === focusableIndex ? 0 : -1;
    // The column sets a flag's place in its idle motion and a cell's in the
    // win's wave.
    cell.style.setProperty('--column', String(cellIndex % columns));

    // The tile over the cell: it carries the flag, and goes when the cell is
    // revealed.
    const cover = document.createElement('span');
    cover.className = 'minesweeper__cover';
    cell.append(cover);
    return cell;
  }

  // A new size starts the tab order at the first cell: the controls that
  // change the size have the focus, not the grid.
  function buildCells(board: Board): void {
    rows = board.rows;
    columns = board.columns;
    focusableIndex = 0;
    hoveredIndex = null;
    highlighted = [];
    cells = board.cells.map((_, cellIndex) => createCell(cellIndex));

    // The CSS sizes the cells to the width from the number of columns.
    grid.style.setProperty('--columns', String(columns));
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

  /**
   * Marks the hidden neighbors of the number under the mouse, while the game
   * takes clicks. Flagged neighbors aren't marked: they are counted already.
   */
  function showHighlight(): void {
    for (const cellIndex of highlighted) {
      delete cells[cellIndex].dataset.highlighted;
    }

    highlighted = [];
    const board = shownBoard;
    const hovered = hoveredIndex === null ? undefined : board?.cells[hoveredIndex];

    if (
      !board ||
      hoveredIndex === null ||
      hovered?.state !== 'revealed' ||
      hovered.neighborMineCount === 0 ||
      board.status === 'won' ||
      board.status === 'lost'
    ) {
      return;
    }

    highlighted = neighborIndexes(hoveredIndex, board).filter(
      (cellIndex) => board.cells[cellIndex].state === 'hidden',
    );

    for (const cellIndex of highlighted) {
      cells[cellIndex].dataset.highlighted = '';
    }
  }

  // A finger has no hover: a touch only reveals or flags.
  grid.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'touch') {
      hoveredIndex = cellIndexOf(event.target);
      showHighlight();
    }
  });

  grid.addEventListener('pointerleave', () => {
    hoveredIndex = null;
    showHighlight();
  });

  return {
    showMove(move, board) {
      // The exploded mine comes first in a loss; the others surface around it.
      let explodedIndex: number | null = null;

      for (const event of move) {
        if (event.type === 'gameCreated') {
          if (board.rows !== rows || board.columns !== columns) {
            buildCells(board);
          }

          board.cells.forEach((_, cellIndex) => paintCell(board, cellIndex));
        } else if ('cellIndex' in event) {
          const { style } = cells[event.cellIndex];

          if (event.type === 'cellRevealed') {
            style.setProperty('--reveal-delay', `${revealDelayMs(event.ring)}ms`);
          } else if (event.type === 'mineExploded') {
            explodedIndex = event.cellIndex;
          } else if (event.type === 'mineShown' && explodedIndex !== null) {
            style.setProperty(
              '--show-delay',
              `${showDelayMs(event.cellIndex, explodedIndex, columns)}ms`,
            );
          }

          paintCell(board, event.cellIndex);
        }
      }

      grid.dataset.status = board.status;
      // What's under the mouse may have changed: a neighbor flagged, the
      // game over.
      shownBoard = board;
      showHighlight();
    },
    focus() {
      cells[focusableIndex]?.focus({ preventScroll: true });
    },
  };
}
