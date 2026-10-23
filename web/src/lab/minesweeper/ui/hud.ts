/**
 * The HUD: mines left, the clock, how much of the board is cleared, the
 * game's status, and the message line a screen reader reads out.
 *
 * The message changes only when a game starts or ends, so a screen reader
 * hears it then and not on every move; the cells carry the rest. The clock
 * ticks while the game is in play, once a second, on the second.
 *
 * A message is a list of parts, so the line can set what matters in bold (as
 * the prototype does): where the mine was, how long a clear took. The parts
 * become text and <b> elements, never HTML.
 *
 * formatDuration() and the messages are pure and tested in Node; the rest
 * needs a page.
 */
import { cellPosition } from '../board/cell-names.ts';
import type { GameEvent } from '../game/core.ts';
import {
  minesRemaining,
  revealedCount,
  safeCellCount,
  type Board,
  type GameStatus,
} from '../game/session.ts';
import type { WinRecord } from '../preferences.ts';
import { requireElement } from '../utils.ts';

const STATUS_LABELS: Record<GameStatus, string> = {
  ready: 'Ready',
  playing: 'Clearing',
  won: 'Cleared',
  lost: 'Lost',
};

export const READY_MESSAGE =
  'First click is always safe and opens an area. Right-click, long-press or press F to flag.';

/** A part of a message: plain text, or text the line shows in bold. */
export type MessagePart = string | { readonly strong: string };

/** A message as one string, as a screen reader reads it. */
export function messageText(parts: readonly MessagePart[]): string {
  return parts.map((part) => (typeof part === 'string' ? part : part.strong)).join('');
}

/** A time as the clock shows it, in whole seconds: "0:07", "1:23", "61:05". */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Where the mine went off, in bold, and how the flags fared, if there were any. */
export function lossMessage(board: Board): MessagePart[] {
  const exploded = board.cells.findIndex((cell) => cell.state === 'exploded');
  const wrongFlags = board.cells.filter((cell) => cell.state === 'wrong-flag').length;
  const rightFlags = board.cells.filter((cell) => cell.state === 'flagged').length;
  const where: MessagePart[] = ['Mine at ', { strong: cellPosition(board, exploded) }, '.'];

  if (wrongFlags > 0) {
    return [...where, ` ${wrongFlags} ${wrongFlags === 1 ? 'flag was' : 'flags were'} wrong.`];
  }

  return rightFlags > 0 ? [...where, ' Every flag was right.'] : where;
}

/** The time, in bold, and how it stands against the best at this difficulty. */
export function winMessage({ timeMs, previousBestMs }: WinRecord): MessagePart[] {
  const cleared: MessagePart[] = ['Cleared in ', { strong: formatDuration(timeMs) }];

  if (previousBestMs === null) {
    return [...cleared, '. First clear at this size on this device.'];
  }

  if (timeMs < previousBestMs) {
    const gainMs = previousBestMs - timeMs;
    const by = gainMs < 1000 ? 'by under a second' : `${formatDuration(gainMs)} faster`;

    return [...cleared, `. New best, ${by}.`];
  }

  return [...cleared, `. Best on this device: ${formatDuration(previousBestMs)}.`];
}

/** A count as the HUD shows it, with a true minus sign when negative. */
function formatCount(count: number): string {
  return count < 0 ? `−${-count}` : String(count);
}

export interface Hud {
  /** Shows a move the session has applied: `board` is its board after it. */
  showMove(move: readonly GameEvent[], board: Board): void;
  /** Says how a won game went; called after showMove for the winning move. */
  showWin(record: WinRecord): void;
}

/**
 * Shows the game in the HUD of the markup under `root`.
 *
 * @param elapsedMs The time played so far (GameSession.elapsedMs).
 */
export function createHud(root: HTMLElement, elapsedMs: () => number): Hud {
  const mines = requireElement(root, '.minesweeper__mines');
  const time = requireElement(root, '.minesweeper__time');
  const statusLabel = requireElement(root, '.minesweeper__status-label');
  const progress = requireElement(root, '.minesweeper__progress');
  const message = requireElement(root, '.minesweeper__message');
  let tick: number | undefined;

  function showTime(): number {
    const ms = elapsedMs();
    time.textContent = formatDuration(ms);
    return ms;
  }

  function startClock(): void {
    if (tick !== undefined) {
      return;
    }

    // Wakes just after each whole second, so the display never lags it.
    const step = () => {
      tick = window.setTimeout(step, 1000 - (showTime() % 1000));
    };
    step();
  }

  function stopClock(): void {
    clearTimeout(tick);
    tick = undefined;
    showTime();
  }

  // An unchanged text isn't set again, so a screen reader doesn't repeat it.
  function say(parts: readonly MessagePart[]): void {
    if (message.textContent === messageText(parts)) {
      return;
    }

    message.replaceChildren(
      ...parts.map((part) => {
        if (typeof part === 'string') {
          return document.createTextNode(part);
        }

        const strong = document.createElement('b');
        strong.textContent = part.strong;
        return strong;
      }),
    );
  }

  return {
    showMove(move, board) {
      const revealed = revealedCount(board);
      const safe = safeCellCount(board);

      mines.textContent = formatCount(minesRemaining(board));
      statusLabel.textContent = STATUS_LABELS[board.status];
      progress.setAttribute('aria-valuenow', String(Math.round((100 * revealed) / safe)));
      progress.setAttribute('aria-valuetext', `${revealed} of ${safe} cells revealed`);
      progress.style.setProperty('--progress', String(revealed / safe));

      if (board.status === 'playing') {
        startClock();
      } else {
        stopClock();
      }

      for (const event of move) {
        if (event.type === 'gameCreated') {
          say([READY_MESSAGE]);
        } else if (event.type === 'gameLost') {
          say(lossMessage(board));
        }
      }
    },
    showWin(record) {
      say(winMessage(record));
    },
  };
}
