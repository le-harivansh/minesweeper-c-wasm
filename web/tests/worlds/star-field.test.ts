/**
 * Tests web/src/lab/minesweeper/worlds/star-field.ts: the night sky is the
 * prototype's, star for star. How it looks on the board is checked in the
 * browser.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStarField } from '../../src/lab/minesweeper/worlds/star-field.ts';

/** One background-image list, star by star. */
const starsOf = (list: string) => list.split(/,(?=radial-gradient)/);

/**
 * The expected stars are the prototype's own output: its stars() in
 * tmp/Minesweeper.html (C repo), run as it is. The first and last of each
 * list pin the order of the draws, which a reordering would change for
 * every star after it.
 */
test("the sky is the prototype's: 80 stars that stay, 16 that twinkle", () => {
  const fixed = starsOf(createStarField().fixed);
  const twinkling = starsOf(createStarField().twinkling);

  assert.equal(fixed.length, 80);
  assert.equal(twinkling.length, 16);
  assert.equal(
    fixed[0],
    'radial-gradient(circle at 60.7% 56.0%, rgba(255,255,255,0.68) 0 1.27px, transparent 2.07px)',
  );
  assert.equal(
    fixed[79],
    'radial-gradient(circle at 23.3% 25.1%, rgba(255,255,255,0.48) 0 1.19px, transparent 1.99px)',
  );
  assert.equal(
    twinkling[0],
    'radial-gradient(circle at 96.8% 8.0%, rgba(255,255,255,0.62) 0 1.05px, transparent 1.85px)',
  );
  assert.equal(
    twinkling[15],
    'radial-gradient(circle at 41.1% 40.6%, rgba(255,255,255,0.91) 0 1.61px, transparent 2.41px)',
  );
});

test('every board gets the same sky', () => {
  assert.deepEqual(createStarField(), createStarField());
});
