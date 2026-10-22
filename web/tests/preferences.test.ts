/**
 * Tests web/src/lab/minesweeper/preferences.ts: the difficulty and best times
 * kept between visits, over a fake storage, including storage that is
 * missing, refuses every call, or holds something it shouldn't.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadPreferences,
  STORAGE_KEY,
  type PreferenceStorage,
} from '../src/lab/minesweeper/preferences.ts';

/** A storage that keeps its items in a map; `stored` starts it with a value. */
function fakeStorage(stored?: string): PreferenceStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();

  if (stored !== undefined) {
    items.set(STORAGE_KEY, stored);
  }

  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

/** A storage that throws on every call, as blocked or full storage does. */
const REFUSING_STORAGE: PreferenceStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

test('a first visit starts at Beginner with no best times', () => {
  const preferences = loadPreferences(fakeStorage());

  assert.equal(preferences.difficulty, 'beginner');
  assert.deepEqual(preferences.recordWin('beginner', 5_000), {
    timeMs: 5_000,
    previousBestMs: null,
  });
});

/**
 * Each loadPreferences over the same storage is the next visit. Each change
 * is saved as it's made, on its own: a difficulty with no win after it too.
 */
test('the difficulty and best times come back on the next visit', () => {
  const storage = fakeStorage();

  loadPreferences(storage).setDifficulty('expert');

  assert.equal(loadPreferences(storage).difficulty, 'expert');

  loadPreferences(storage).recordWin('intermediate', 90_000);
  const nextVisit = loadPreferences(storage);

  assert.equal(nextVisit.difficulty, 'expert');
  assert.equal(nextVisit.recordWin('intermediate', 100_000).previousBestMs, 90_000);
});

/** A tie isn't a new best: the best stays the time set first. */
test('only a faster time replaces the best', () => {
  const preferences = loadPreferences(fakeStorage());
  preferences.recordWin('beginner', 60_000);

  assert.equal(preferences.recordWin('beginner', 70_000).previousBestMs, 60_000);
  assert.equal(preferences.recordWin('beginner', 60_000).previousBestMs, 60_000);
  assert.equal(preferences.recordWin('beginner', 50_000).previousBestMs, 60_000);
  assert.equal(preferences.recordWin('beginner', 55_000).previousBestMs, 50_000);
});

test('each difficulty keeps its own best', () => {
  const preferences = loadPreferences(fakeStorage());
  preferences.recordWin('beginner', 10_000);

  assert.equal(preferences.recordWin('intermediate', 80_000).previousBestMs, null);
  assert.equal(preferences.recordWin('beginner', 20_000).previousBestMs, 10_000);
});

/**
 * Stored data may be from another version or edited by hand: what isn't
 * valid is dropped, and what is valid next to it is kept.
 */
test('what was stored wrongly is ignored', () => {
  const garbled = loadPreferences(fakeStorage('not JSON'));
  const mixed = loadPreferences(
    fakeStorage(
      JSON.stringify({
        difficulty: 'legendary',
        bestTimesMs: { beginner: -5, intermediate: 42_000, expert: 'fast', custom: 10 },
      }),
    ),
  );

  assert.equal(garbled.difficulty, 'beginner');
  assert.equal(mixed.difficulty, 'beginner');
  assert.equal(mixed.recordWin('beginner', 1_000).previousBestMs, null);
  assert.equal(mixed.recordWin('intermediate', 50_000).previousBestMs, 42_000);
  assert.equal(mixed.recordWin('expert', 1_000).previousBestMs, null);
});

/** No storage, or storage that throws: the game remembers for the visit only. */
test('without working storage, preferences last for the visit', () => {
  for (const storage of [null, REFUSING_STORAGE]) {
    const preferences = loadPreferences(storage);
    preferences.setDifficulty('intermediate');
    preferences.recordWin('intermediate', 30_000);

    assert.equal(preferences.difficulty, 'intermediate');
    assert.equal(preferences.recordWin('intermediate', 40_000).previousBestMs, 30_000);
  }
});
