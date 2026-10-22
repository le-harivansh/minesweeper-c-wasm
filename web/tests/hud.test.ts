/**
 * Tests the pure half of web/src/lab/minesweeper/hud.ts: how the clock shows
 * a time, and the messages read out when a game ends, with the part each sets
 * in bold. The half that updates the page is checked in the browser.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameEvent } from '../src/lab/minesweeper/game-core.ts';
import { applyMove, EMPTY_BOARD } from '../src/lab/minesweeper/game-session.ts';
import {
  formatDuration,
  lossMessage,
  messageText,
  winMessage,
  type MessagePart,
} from '../src/lab/minesweeper/hud.ts';

/** A lost 3 × 3 game, mines at 2, 3 and 6, after these flags (as in game-session.test.ts). */
function lostWithFlags(flags: { cellIndex: number; isMine: boolean }[]) {
  const move: GameEvent[] = [
    { type: 'gameCreated', rows: 3, columns: 3, mines: 3 },
    { type: 'cellRevealed', cellIndex: 8, ring: 0, neighborMineCount: 0 },
    ...flags.map(({ cellIndex }): GameEvent => ({ type: 'cellFlagged', cellIndex })),
    { type: 'mineExploded', cellIndex: 6 },
    ...flags
      .filter(({ isMine }) => !isMine)
      .map(({ cellIndex }): GameEvent => ({ type: 'wrongFlagShown', cellIndex })),
    { type: 'gameLost' },
  ];

  return applyMove(EMPTY_BOARD, move);
}

/** What a message sets in bold, in order. */
function strongParts(parts: readonly MessagePart[]): string[] {
  return parts.flatMap((part) => (typeof part === 'string' ? [] : [part.strong]));
}

/** Whole seconds, rounded down, as a clock counts; minutes go past 59. */
test('a duration shows as minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(999), '0:00');
  assert.equal(formatDuration(7_000), '0:07');
  assert.equal(formatDuration(83_500), '1:23');
  assert.equal(formatDuration(3_665_000), '61:05');
});

/** The text a screen reader hears: every part, the bold ones' too, in order. */
test("a message's text is its parts joined", () => {
  assert.equal(messageText([]), '');
  assert.equal(
    messageText(['Mine at ', { strong: 'row 3, column 1' }, '.']),
    'Mine at row 3, column 1.',
  );
});

/** The exploded mine is 6: row 3, column 1, the part in bold whatever follows. */
test('a loss names the mine, then how the flags fared', () => {
  const cases: [{ cellIndex: number; isMine: boolean }[], string][] = [
    [[], 'Mine at row 3, column 1.'],
    [[{ cellIndex: 2, isMine: true }], 'Mine at row 3, column 1. Every flag was right.'],
    [
      [
        { cellIndex: 0, isMine: false },
        { cellIndex: 2, isMine: true },
      ],
      'Mine at row 3, column 1. 1 flag was wrong.',
    ],
    [
      [
        { cellIndex: 0, isMine: false },
        { cellIndex: 1, isMine: false },
      ],
      'Mine at row 3, column 1. 2 flags were wrong.',
    ],
  ];

  for (const [flags, text] of cases) {
    const message = lossMessage(lostWithFlags(flags));

    assert.equal(messageText(message), text);
    assert.deepEqual(strongParts(message), ['row 3, column 1'], text);
  }
});

/**
 * A tie isn't a new best; a gain under a second shows as such, not as 0:00.
 * Only the time of the clear is in bold, not the best it's set against.
 */
test('a win gives the time against the best', () => {
  const cases: [Parameters<typeof winMessage>[0], string, string][] = [
    [
      { timeMs: 83_000, previousBestMs: null },
      'Cleared in 1:23. First clear at this size on this device.',
      '1:23',
    ],
    [{ timeMs: 71_000, previousBestMs: 83_000 }, 'Cleared in 1:11. New best, 0:12 faster.', '1:11'],
    [
      { timeMs: 82_600, previousBestMs: 83_000 },
      'Cleared in 1:22. New best, by under a second.',
      '1:22',
    ],
    [
      { timeMs: 83_000, previousBestMs: 83_000 },
      'Cleared in 1:23. Best on this device: 1:23.',
      '1:23',
    ],
    [
      { timeMs: 90_000, previousBestMs: 65_000 },
      'Cleared in 1:30. Best on this device: 1:05.',
      '1:30',
    ],
  ];

  for (const [record, text, time] of cases) {
    const message = winMessage(record);

    assert.equal(messageText(message), text);
    assert.deepEqual(strongParts(message), [time], text);
  }
});
