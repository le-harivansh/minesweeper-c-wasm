/**
 * A cell in words, for a screen reader: what it shows and where it is. The
 * board view names each cell with these, and the HUD says where the mine
 * was. Pure, so tested in Node.
 */
import type { Board, CellState } from '../game/session.ts';

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
