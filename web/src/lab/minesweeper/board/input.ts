/**
 * Input: the mouse, touch and the keyboard, turned into the two commands a
 * player gives on the board, reveal and toggle a flag.
 *
 * - Mouse: a click reveals, a right-click flags.
 * - Touch and pen: a tap reveals; a long press flags, while the finger is
 *   still down, so the player feels when it took. A press that moves is a
 *   scroll (Expert scrolls sideways on a phone), not a press.
 * - Keyboard: Enter and Space reveal, F flags the focused cell. Moving
 *   between cells is the board view's.
 *
 * Every reveal comes from a click: a mouse click, a tap, and Enter or Space
 * on a cell's button all end in one. So a long press, which may still end in
 * a click when the finger lifts, has to cancel that click.
 */
import type { GameSession } from '../game/session.ts';
import { requireElement } from '../utils.ts';

/** How long a touch stays down on a cell to flag it. */
export const LONG_PRESS_MS = 400;

/** How far a touch may move and still be a press rather than a scroll. */
export const PRESS_SLOP_PX = 10;

/**
 * F, on its own: with Control, Command or Option it stays the browser's
 * (Ctrl+F and ⌘F find in the page).
 */
export function isFlagKey({
  key,
  ctrlKey,
  metaKey,
  altKey,
}: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return (key === 'f' || key === 'F') && !ctrlKey && !metaKey && !altKey;
}

/** The cell an event happened on, if any. */
function cellIndexOf(target: EventTarget | null): number | null {
  const cell = target instanceof Element ? target.closest<HTMLElement>('[data-cell-index]') : null;
  return cell ? Number(cell.dataset.cellIndex) : null;
}

/** Sends what the player does on the board under `root` to the session. */
export function attachInput(
  root: HTMLElement,
  session: Pick<GameSession, 'reveal' | 'toggleFlag'>,
): void {
  const board = requireElement(root, '.minesweeper__board');

  // A touch held on a cell, until it lifts, moves away or flags.
  let press: { pointerId: number; cellIndex: number; x: number; y: number; timer: number } | null =
    null;
  // Set once a long press has flagged: the click its release may bring is
  // not a reveal. Any new press or key clears it.
  let hasPressFlagged = false;

  function endPress(): void {
    if (press) {
      clearTimeout(press.timer);
      press = null;
    }
  }

  function flagFromPress(): void {
    if (!press) {
      return;
    }

    const { cellIndex } = press;
    endPress();
    hasPressFlagged = true;
    session.toggleFlag(cellIndex);
  }

  board.addEventListener('pointerdown', (event) => {
    hasPressFlagged = false;
    endPress();
    const cellIndex = cellIndexOf(event.target);

    // A mouse flags with its right button, not by holding the left.
    if (cellIndex === null || event.pointerType === 'mouse' || !event.isPrimary) {
      return;
    }

    press = {
      pointerId: event.pointerId,
      cellIndex,
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(flagFromPress, LONG_PRESS_MS),
    };
  });

  board.addEventListener('pointermove', (event) => {
    if (
      press &&
      event.pointerId === press.pointerId &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > PRESS_SLOP_PX
    ) {
      endPress();
    }
  });

  // The browser cancels the pointer when it takes the touch for a scroll.
  board.addEventListener('pointerup', endPress);
  board.addEventListener('pointercancel', endPress);

  board.addEventListener('click', (event) => {
    const cellIndex = cellIndexOf(event.target);

    if (cellIndex === null) {
      return;
    }

    if (hasPressFlagged) {
      hasPressFlagged = false;
      return;
    }

    session.reveal(cellIndex);
  });

  // A right-click opens the context menu, and so does a long press on some
  // phones, sometimes before the press's own timer.
  board.addEventListener('contextmenu', (event) => {
    const cellIndex = cellIndexOf(event.target);

    if (cellIndex === null) {
      return;
    }

    event.preventDefault();

    if (press) {
      flagFromPress();
    } else if (!hasPressFlagged) {
      session.toggleFlag(cellIndex);
    }
  });

  board.addEventListener('keydown', (event) => {
    hasPressFlagged = false;
    const cellIndex = cellIndexOf(event.target);

    if (cellIndex !== null && isFlagKey(event)) {
      event.preventDefault();
      session.toggleFlag(cellIndex);
    }
  });
}
