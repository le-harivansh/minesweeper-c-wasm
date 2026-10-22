/**
 * The night sky's stars: 80 that stay and 16 that twinkle, each a small
 * radial gradient somewhere on the board, as the prototype draws them
 * (tmp/Minesweeper.html in the C repo). A star's place is in percent, so the
 * sky spreads with the board; its size is in pixels, so a star stays a point.
 *
 * Seeded, so the sky is the same on every board and every visit. The board
 * view sets the two lists on the board (--star-field, --twinkling-stars) and
 * worlds.css draws them in the night sky, where the cloud has parted.
 */

/** The prototype's seed: with it, its sky. */
const SKY_SEED = 20261019;

const FIXED_STARS = 80;
const TWINKLING_STARS = 16;

export interface StarField {
  /** The stars that stay, as a background-image list. */
  readonly fixed: string;
  /** The stars that twinkle, as a background-image list. */
  readonly twinkling: string;
}

/** Numbers from 0 to 1 (1 excluded), the same for the same seed: Mulberry32, as the prototype's. */
function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The prototype's sky, star by star. The order of the draws matters, so it
 * follows the prototype's: a star's brightness and size first, then where it
 * is.
 */
export function createStarField(): StarField {
  const random = createRandom(SKY_SEED);

  const star = (alpha: number, radius: number) => {
    const x = (random() * 100).toFixed(1);
    const y = (random() * 100).toFixed(1);
    const edge = (radius + 0.8).toFixed(2);

    return `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,${alpha.toFixed(2)}) 0 ${radius}px, transparent ${edge}px)`;
  };

  const stars = (count: number, alpha: [number, number], radius: [number, number]) =>
    Array.from({ length: count }, () => {
      const starAlpha = alpha[0] + random() * alpha[1];
      const starRadius = Number((radius[0] + random() * radius[1]).toFixed(2));

      return star(starAlpha, starRadius);
    }).join(',');

  // Faint to mid stars for the field; brighter, larger ones twinkle over it.
  return {
    fixed: stars(FIXED_STARS, [0.2, 0.6], [0.5, 0.8]),
    twinkling: stars(TWINKLING_STARS, [0.6, 0.4], [0.9, 0.9]),
  };
}
