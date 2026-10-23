/**
 * Tests web/src/lab/minesweeper/audio/soundscapes/rotation.ts: when the next
 * soundscape is due, and where each world starts.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSoundscapeRotation,
  firstSoundscape,
  nextSoundscape,
  SOUNDSCAPE_SECONDS,
} from '../../../src/lab/minesweeper/audio/soundscapes/rotation.ts';

/** The deep sea's, in their order. */
const NAMES = ['sounding', 'reef-shelf', 'abyss', 'kelp-current'];

/** 45 seconds, by choice. */
test('the next soundscape is due after 45 seconds heard, then 45 more', () => {
  const rotation = createSoundscapeRotation();
  const due: number[] = [];

  for (let second = 1; second <= 2 * SOUNDSCAPE_SECONDS; second++) {
    if (rotation.tick()) {
      due.push(second);
    }
  }

  assert.equal(SOUNDSCAPE_SECONDS, 45);
  assert.deepEqual(due, [45, 90]);
  assert.equal(rotation.secondsLeft, 45);
});

/** A new soundscape gets its full 45 seconds. */
test('restarting the count gives the soundscape its whole time again', () => {
  const rotation = createSoundscapeRotation();

  for (let second = 0; second < 40; second++) {
    rotation.tick();
  }

  rotation.restart();

  assert.equal(rotation.secondsLeft, 45);
});

/** The first time, a random one; then the one it played last, if the world still has it. */
test('a world starts where it was, else at a random soundscape', () => {
  assert.equal(
    firstSoundscape(NAMES, 'abyss', () => 0),
    'abyss',
  );
  assert.equal(
    firstSoundscape(NAMES, null, () => 0),
    'sounding',
  );
  assert.equal(
    firstSoundscape(NAMES, null, () => 0.99),
    'kelp-current',
  );
  assert.equal(
    firstSoundscape(NAMES, 'a take since renamed', () => 0.5),
    'abyss',
  );
});

test('the soundscapes turn in order, round and round', () => {
  assert.equal(nextSoundscape(NAMES, 'sounding'), 'reef-shelf');
  assert.equal(nextSoundscape(NAMES, 'kelp-current'), 'sounding');
});
