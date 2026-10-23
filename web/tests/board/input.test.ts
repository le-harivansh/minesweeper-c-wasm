/**
 * Tests the pure part of web/src/lab/minesweeper/board/input.ts: which key
 * flags. The pointer and touch handling needs a page; it is checked in the
 * browser.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFlagKey } from '../../src/lab/minesweeper/board/input.ts';

/** A key press, as isFlagKey reads it from the KeyboardEvent. */
const press = (
  key: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

/** With Shift too (Caps Lock gives "F"); not with a modifier the browser uses. */
test('F flags, but Ctrl+F, ⌘F and Option+F stay the browser’s', () => {
  assert.equal(isFlagKey(press('f')), true);
  assert.equal(isFlagKey(press('F')), true);
  assert.equal(isFlagKey(press('f', { ctrlKey: true })), false);
  assert.equal(isFlagKey(press('f', { metaKey: true })), false);
  assert.equal(isFlagKey(press('f', { altKey: true })), false);
  assert.equal(isFlagKey(press('g')), false);
  assert.equal(isFlagKey(press('Enter')), false);
});
