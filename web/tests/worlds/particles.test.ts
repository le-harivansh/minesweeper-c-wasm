/**
 * Tests web/src/lab/minesweeper/worlds/particles.ts: how many particles a
 * stage holds, how long its waits are, and where a shooting star flies. How
 * the particles look and move, and that they stop off screen and with motion
 * off, is checked in the browser.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PARTICLES,
  chooseFlight,
  seenShare,
  steadyCount,
  waitAround,
  type Box,
  type Size,
} from '../../src/lab/minesweeper/worlds/particles.ts';

/** Numbers from 0 to 1, the same on every run: Mulberry32, as star-field.ts draws its sky. */
function seeded(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** The particles are as thick on a phone as on a desktop: what crosses the stage counts by the side it crosses. */
test("bubbles count by the stage's width, grains by its height; the other worlds keep none", () => {
  const stage: Size = { width: 1000, height: 500 };
  const wider: Size = { width: 2000, height: 500 };
  const taller: Size = { width: 1000, height: 1000 };

  assert.equal(steadyCount('deep-sea', stage), Math.round(PARTICLES['deep-sea'].bubbles * 10));
  assert.equal(steadyCount('deep-sea', wider), 2 * steadyCount('deep-sea', stage));
  assert.equal(steadyCount('deep-sea', taller), steadyCount('deep-sea', stage));

  assert.equal(steadyCount('dune', stage), Math.round(PARTICLES.dune.grains * 5));
  assert.equal(steadyCount('dune', taller), 2 * steadyCount('dune', stage));
  assert.equal(steadyCount('dune', wider), steadyCount('dune', stage));

  assert.equal(steadyCount('night-sky', stage), 0);
  assert.equal(steadyCount('rainforest', stage), 0);
});

test('a wait is 40 to 160 % of its average, in milliseconds', () => {
  assert.equal(
    waitAround(10, () => 0),
    4000,
  );
  assert.equal(
    waitAround(10, () => 0.5),
    10000,
  );
  assert.ok(waitAround(10, () => 0.999999) < 16000);
});

const STAGE: Size = { width: 1000, height: 600 };
const SMALL_BOARD: Box = { left: 300, top: 100, right: 700, bottom: 500 };

test('a flight counts as seen where it lies in the stage and off the board', () => {
  // Over the board all the way: never seen.
  assert.equal(seenShare({ x: 350, y: 200, angle: 10, distance: 200 }, STAGE, SMALL_BOARD), 0);
  // Down the open side, left of the board: seen all the way.
  assert.equal(seenShare({ x: 50, y: 150, angle: 80, distance: 170 }, STAGE, SMALL_BOARD), 1);
  // Rightward into the board: seen up to its edge, 7 of the 13 points.
  assert.equal(seenShare({ x: 100, y: 300, angle: 0, distance: 400 }, STAGE, SMALL_BOARD), 7 / 13);
  // Out past the stage's right edge: seen only inside it.
  assert.ok(seenShare({ x: 900, y: 50, angle: 10, distance: 300 }, STAGE, SMALL_BOARD) < 0.5);
});

/**
 * On Expert the board fills the stage but for a band above it, where the HUD
 * is: there a shooting star can show, so it starts there.
 */
test('a shooting star takes the open sky: over a board that fills the stage, the band above it', () => {
  const stage: Size = { width: 1000, height: 700 };
  const wideBoard: Box = { left: 10, top: 90, right: 990, bottom: 690 };
  const random = seeded(20261022);
  const flights = Array.from({ length: 200 }, () => chooseFlight(stage, wideBoard, random));
  const inTheBand = flights.filter((flight) => flight.y < wideBoard.top);

  assert.ok(inTheBand.length >= 190, `${inTheBand.length} of 200 start above the board`);

  for (const flight of flights) {
    assert.ok(flight.x > 0 && flight.x < stage.width && flight.y > 0 && flight.y < stage.height);
    assert.ok(
      flight.angle >= 8 && flight.angle <= 172 && (flight.angle <= 50 || flight.angle >= 130),
    );
  }
});

test('beside a small board, a shooting star is seen nearly all the way', () => {
  const random = seeded(7);
  const seen = Array.from({ length: 200 }, () =>
    seenShare(chooseFlight(STAGE, SMALL_BOARD, random), STAGE, SMALL_BOARD),
  );
  const mean = seen.reduce((sum, share) => sum + share, 0) / seen.length;

  assert.ok(mean > 0.85, `seen ${mean.toFixed(2)} of the way on average`);
});
