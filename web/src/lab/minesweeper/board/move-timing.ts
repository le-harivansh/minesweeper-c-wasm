/**
 * When each part of a move shows: a reveal ripples out ring by ring from the
 * click, and a loss shows the other mines nearest the exploded one first.
 * The timings are the prototype's.
 *
 * The board view times the motion from these, and the sound times its notes
 * from them, so the two keep together. A file of its own, so the sound's
 * chunk needn't carry the board view.
 */

/** The time between one ring of a cascade and the next. */
export const RIPPLE_STEP_MS = 32;

/** Rings past this one go with it: a long cascade's last ring starts within half a second. */
export const LAST_RIPPLE_RING = 14;

/** When the first of the other mines surfaces after a loss. */
export const MINE_SHOWN_START_MS = 140;

/** The wait for each ring of cells further out from the exploded mine. */
export const MINE_SHOWN_STEP_MS = 55;

/** When a revealed cell's cover starts to go: its ring's turn in the ripple. */
export function revealDelayMs(ring: number): number {
  return Math.min(ring, LAST_RIPPLE_RING) * RIPPLE_STEP_MS;
}

/**
 * When a mine that a loss shows surfaces: nearest the exploded one first,
 * by how many rows or columns apart they are, whichever is more (the rings
 * of cells around the exploded mine).
 */
export function showDelayMs(cellIndex: number, explodedIndex: number, columns: number): number {
  const rowsApart = Math.abs(Math.floor(cellIndex / columns) - Math.floor(explodedIndex / columns));
  const columnsApart = Math.abs((cellIndex % columns) - (explodedIndex % columns));

  return MINE_SHOWN_START_MS + Math.max(rowsApart, columnsApart) * MINE_SHOWN_STEP_MS;
}
