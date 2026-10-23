/**
 * Tests web/src/lab/minesweeper/preferences.ts: the difficulty, the world,
 * sound, the best times and each world's soundscape kept between visits, over
 * a fake storage, including storage that is missing, refuses every call,
 * holds something it shouldn't, or is shared with another tab.
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

test('a first visit starts at Beginner, in deep sea, silent, with no best times', () => {
  const preferences = loadPreferences(fakeStorage());

  assert.equal(preferences.difficulty, 'beginner');
  assert.equal(preferences.world, 'deep-sea');
  assert.equal(preferences.sound, false);
  assert.deepEqual(preferences.recordWin('beginner', 5_000), {
    timeMs: 5_000,
    previousBestMs: null,
  });
});

/**
 * Each loadPreferences over the same storage is the next visit. Each change
 * is saved as it's made, on its own: a difficulty with no win after it too.
 */
test('the difficulty, world, sound and best times come back on the next visit', () => {
  const storage = fakeStorage();

  loadPreferences(storage).setDifficulty('expert');
  loadPreferences(storage).setWorld('dune');
  loadPreferences(storage).setSound(true);

  assert.equal(loadPreferences(storage).difficulty, 'expert');
  assert.equal(loadPreferences(storage).world, 'dune');

  loadPreferences(storage).recordWin('intermediate', 90_000);
  const nextVisit = loadPreferences(storage);

  assert.equal(nextVisit.difficulty, 'expert');
  assert.equal(nextVisit.world, 'dune');
  assert.equal(nextVisit.sound, true);
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
        world: 'moon',
        sound: 'loud',
        bestTimesMs: { beginner: -5, intermediate: 42_000, expert: 'fast', custom: 10 },
        soundscapes: { 'deep-sea': 3, moon: 'craters', dune: 'noon' },
      }),
    ),
  );

  assert.equal(garbled.difficulty, 'beginner');
  assert.equal(mixed.difficulty, 'beginner');
  assert.equal(mixed.world, 'deep-sea');
  assert.equal(mixed.sound, false);
  assert.equal(loadPreferences(fakeStorage('{"world": 42}')).world, 'deep-sea');
  assert.equal(mixed.recordWin('beginner', 1_000).previousBestMs, null);
  assert.equal(mixed.recordWin('intermediate', 50_000).previousBestMs, 42_000);
  assert.equal(mixed.recordWin('expert', 1_000).previousBestMs, null);
  assert.equal(mixed.soundscape('deep-sea'), null);
  assert.equal(mixed.soundscape('dune'), 'noon');
});

/**
 * A full quota: what's stored reads, but nothing more is written. The page's
 * own best, which storage never kept, still counts against the next win.
 */
test("storage that won't write still has this visit's best count", () => {
  const items = new Map([[STORAGE_KEY, JSON.stringify({ bestTimesMs: { beginner: 60_000 } })]]);
  const preferences = loadPreferences({
    getItem: (key) => items.get(key) ?? null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  });

  assert.equal(preferences.recordWin('beginner', 50_000).previousBestMs, 60_000);
  assert.equal(preferences.recordWin('beginner', 55_000).previousBestMs, 50_000);
  assert.equal(preferences.recordWin('beginner', 52_000).previousBestMs, 50_000);
});

/** No storage, or storage that throws: the game remembers for the visit only. */
test('without working storage, preferences last for the visit', () => {
  for (const storage of [null, REFUSING_STORAGE]) {
    const preferences = loadPreferences(storage);
    preferences.setDifficulty('intermediate');
    preferences.setWorld('rainforest');
    preferences.setSound(true);
    preferences.recordWin('intermediate', 30_000);
    preferences.setSoundscape('dune', 'storm-edge');

    assert.equal(preferences.difficulty, 'intermediate');
    assert.equal(preferences.world, 'rainforest');
    assert.equal(preferences.sound, true);
    assert.equal(preferences.recordWin('intermediate', 40_000).previousBestMs, 30_000);
    assert.equal(preferences.soundscape('dune'), 'storm-edge');
  }
});

/** The soundscapes move on every 45 s: each world keeps its own place, by name. */
test("each world's soundscape comes back on the next visit", () => {
  const storage = fakeStorage();
  const preferences = loadPreferences(storage);

  assert.equal(preferences.soundscape('night-sky'), null);

  preferences.setSoundscape('night-sky', 'high-desert');
  preferences.setSoundscape('dune', 'caravan');
  preferences.setSoundscape('dune', 'night-cold');
  const nextVisit = loadPreferences(storage);

  assert.equal(nextVisit.soundscape('night-sky'), 'high-desert');
  assert.equal(nextVisit.soundscape('dune'), 'night-cold');
  assert.equal(nextVisit.soundscape('rainforest'), null);
});

/**
 * Two tabs, each with its own copy, over one storage. Each change writes only
 * its own part into what's stored now, so neither tab undoes the other's: a
 * best time survives the other tab's next soundscape, and the other tab's
 * next win counts it.
 */
test("one tab's changes don't undo another's", () => {
  const storage = fakeStorage();
  const first = loadPreferences(storage);
  const second = loadPreferences(storage);

  first.recordWin('expert', 200_000);
  second.setSoundscape('deep-sea', 'abyss');
  second.setWorld('rainforest');

  assert.equal(second.recordWin('expert', 250_000).previousBestMs, 200_000);

  const nextVisit = loadPreferences(storage);

  assert.equal(nextVisit.recordWin('expert', 300_000).previousBestMs, 200_000);
  assert.equal(nextVisit.soundscape('deep-sea'), 'abyss');
  assert.equal(nextVisit.world, 'rainforest');
});
