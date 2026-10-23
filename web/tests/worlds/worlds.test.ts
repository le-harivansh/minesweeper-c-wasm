/**
 * Tests the worlds as files: each world's stylesheet (in
 * web/src/lab/minesweeper/worlds/) against the tokens stage.css, board.css
 * and controls.css read, the names in worlds.ts, the glyph files, and the
 * contrast each world's colours reach. What a world looks like, its motion,
 * and the World buttons' clicks, are checked in the browser.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isWorldName, WORLD_LABELS, WORLD_NAMES } from '../../src/lab/minesweeper/worlds/worlds.ts';

const GAME_FOLDER = new URL('../../src/lab/minesweeper/', import.meta.url);

/** A file of the game's folder, by its path there, without its comments. */
function source(path: string): string {
  return readFileSync(new URL(path, GAME_FOLDER), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The worlds' stylesheets, in the order worlds/worlds.css imports them. */
const WORLD_FILES = [...source('worlds/worlds.css').matchAll(/@import '\.\/([a-z-]+\.css)';/g)].map(
  ([, file]) => `worlds/${file}`,
);
// The parts: the stage, its board, and the controls (the World buttons read
// their world's flag and fill).
const PART_FILES = ['ui/stage.css', 'board/board.css', 'ui/controls.css'];

const WORLDS_CSS = WORLD_FILES.map(source).join('');
const PARTS_CSS = PART_FILES.map(source).join('');

/**
 * Each world's tokens, by name, from its block on the stage and its button
 * (`:is(.minesweeper__stage, .minesweeper__world)[data-world='dune'] { … }`),
 * in the order they come.
 */
function worldTokens(): Map<string, Map<string, string>> {
  const worlds = new Map<string, Map<string, string>>();
  const blocks =
    /:is\(\.minesweeper__stage, \.minesweeper__world\)\[data-world='([a-z-]+)'\]\s*\{([^}]*)\}/g;

  for (const [, world, body] of WORLDS_CSS.matchAll(blocks)) {
    const tokens = worlds.get(world) ?? new Map<string, string>();

    for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
      tokens.set(name, value.trim());
    }

    worlds.set(world, tokens);
  }

  return worlds;
}

/**
 * What the parts read that no world sets, besides what they set themselves:
 * the page's type stacks, and what the scripts set (hud.ts the progress;
 * board-view.ts the number of columns, each cell's column and when its
 * motion starts).
 */
const NOT_A_WORLD_TOKEN = new Set([
  '--font-sans',
  '--font-mono',
  '--progress',
  '--columns',
  '--column',
  '--reveal-delay',
  '--show-delay',
]);

/**
 * The contract between the worlds and the parts: a world that missed a token
 * would fall back to the page's colours there; a token no part reads is dead.
 */
test('every world sets exactly the tokens the parts read', () => {
  const tokens = (pattern: RegExp) =>
    new Set([...PARTS_CSS.matchAll(pattern)].map(([, name]) => name));
  const read = tokens(/var\((--[a-z0-9-]+)/g);
  const setByTheParts = tokens(/(--[a-z0-9-]+):/g);
  const expected = [...read]
    .filter((name) => !NOT_A_WORLD_TOKEN.has(name) && !setByTheParts.has(name))
    .sort();

  for (const [world, tokens] of worldTokens()) {
    assert.deepEqual([...tokens.keys()].sort(), expected, world);
  }
});

/**
 * The markup draws a button per name in worlds.ts, the first world pressed.
 * worlds.css imports a stylesheet per world, named after it, in that order.
 */
test('the stylesheets and worlds.ts name the same worlds, in the same order', () => {
  assert.deepEqual(
    WORLD_FILES,
    WORLD_NAMES.map((world) => `worlds/${world}.css`),
  );
  assert.deepEqual([...worldTokens().keys()], [...WORLD_NAMES]);
  assert.deepEqual(Object.keys(WORLD_LABELS), [...WORLD_NAMES]);
  assert.equal(isWorldName('dune'), true);
  assert.equal(isWorldName('moon'), false);
});

/**
 * Without ?no-inline, Vite turns a small file into a data: URL, which the
 * site's Content-Security-Policy (img-src 'self') refuses: the glyph would
 * not show, and nothing would say why.
 */
test('every glyph is a file in assets/glyphs/, kept out of line', () => {
  // Each url() with the stylesheet it's in: it resolves from there.
  const urls = (path: string) =>
    [...source(path).matchAll(/url\('([^']+)'\)/g)].map(([, url]) => ({ url, path }));
  const glyphs = [
    ...WORLD_FILES.flatMap(urls),
    ...PART_FILES.flatMap(urls).filter(({ url }) => url.includes('/glyphs/')),
  ];

  assert.equal(
    glyphs.length,
    WORLD_NAMES.length * 2 + 2,
    "a flag and a mine per world, and the wrong flag's cross with its halo",
  );

  for (const { url, path } of glyphs) {
    assert.match(url, /^\.\.\/assets\/glyphs\/[a-z-]+\.svg\?no-inline$/);
    assert.ok(existsSync(new URL(url.replace('?no-inline', ''), new URL(path, GAME_FOLDER))), url);
  }
});

type Rgba = [number, number, number, number];

/** The colour forms the worlds' stylesheets use: #rrggbb, rgba(r, g, b, a), transparent. */
function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
  const channels = /^rgba\(([^)]+)\)$/.exec(value)?.[1];

  if (value === 'transparent') {
    return [0, 0, 0, 0];
  }

  if (hex !== undefined) {
    const rgb = parseInt(hex, 16);
    return [rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff, 1];
  }

  if (channels !== undefined) {
    const [r, g, b, a] = channels.split(',').map(Number);
    return [r, g, b, a];
  }

  throw new Error(`Not a colour this test reads: ${value}`);
}

/** `top` painted over the opaque `bottom`. */
function over([r, g, b, a]: Rgba, [red, green, blue]: Rgba): Rgba {
  return [a * r + (1 - a) * red, a * g + (1 - a) * green, a * b + (1 - a) * blue, 1];
}

/** WCAG 2.2's relative luminance. */
function luminance([r, g, b]: Rgba): number {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2.2's contrast ratio, 1 to 21. */
function contrast(x: Rgba, y: Rgba): number {
  const [lighter, darker] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2.2, 1.4.3: text. The labels, the HUD's numbers and the message, and
 * the numbers on the board too: a number is its cell's size times the
 * world's --number-scale, 13 to 25 px, so it is large text (24 px, or 18.7
 * bold) only on the biggest cells.
 */
const TEXT = 4.5;
/** WCAG 2.2, 1.4.11: what tells a state or a shape apart from what's next to it. */
const NON_TEXT = 3;

/**
 * Each pair that has to stand apart in a world, with its contrast and its
 * target. Clear colours are painted over what lies under them: a tile over
 * the board, the board over the stage.
 *
 * The worlds are the prototype's colours as they are (a deliberate choice,
 * 2026-10-22), and they don't reach every target: night sky's cloud is
 * hardly lighter than the sky it parts from (1.12), rainforest's scarlet
 * leaf is as light as the canopy (2.0), and a few exploded mines sit under
 * 3. Their texture, glyph and motion carry those states instead. What's left
 * here is what the prototype does reach, so a change can't make it worse.
 * Text is the exception: every piece of it reaches 4.5, as the site it sits
 * in claims (2026-10-23). Four of the prototype's colours were lifted for it,
 * in the same hue: dune's muted ink (3.04) and its 3 and 5 (3.99, 3.28), and
 * rainforest's 5 (3.93).
 *
 * A wrong flag's cross is ours, not the prototype's (a deliberate choice too):
 * it lies on its halo, and the halo on the flag, so each pair must stand
 * apart, as must the cross from the tile around it. So is the chosen World
 * button's fill, which its name and its flag lie on.
 */
function figures(tokens: Map<string, string>): [string, number, number][] {
  const color = (name: string) => parseColor(tokens.get(name) ?? 'missing');
  const ground = color('--ground');
  const board = over(color('--board-color'), ground);
  const tile = over(color('--tile-color'), board);
  const revealed = over(color('--revealed-color'), board);
  const accent = color('--accent');
  const halo = color('--wrong-flag-halo-color');
  // The cursor's ring is the accent with the ground inside it: either may show.
  const ringOn = (under: Rgba) => Math.max(contrast(accent, under), contrast(ground, under));

  return [
    ['ink on ground', contrast(color('--ink'), ground), TEXT],
    ['muted on ground', contrast(over(color('--muted'), ground), ground), TEXT],
    ...Array.from({ length: 8 }, (_, i): [string, number, number] => [
      `number ${i + 1} on revealed`,
      contrast(color(`--number-${i + 1}-color`), revealed),
      TEXT,
    ]),
    ['mine on the board', contrast(color('--mine-color'), board), NON_TEXT],
    ['accent on ground', contrast(accent, ground), NON_TEXT],
    ['cursor on hidden', ringOn(tile), NON_TEXT],
    ['cursor on revealed', ringOn(revealed), NON_TEXT],
    ['cross on its halo', contrast(color('--wrong-flag-color'), halo), NON_TEXT],
    ['cross halo on the flag', contrast(halo, color('--flag-color')), NON_TEXT],
    ['cross on hidden', contrast(color('--wrong-flag-color'), tile), NON_TEXT],
    ['name on the chosen World button', contrast(color('--ink'), color('--picker-color')), TEXT],
    [
      'flag on the chosen World button',
      contrast(color('--flag-color'), color('--picker-color')),
      NON_TEXT,
    ],
  ];
}

/** What the prototype's colours reach; a later change must keep it. */
test('every world reaches the contrast targets', () => {
  for (const [world, tokens] of worldTokens()) {
    for (const [pair, value, target] of figures(tokens)) {
      assert.ok(value >= target, `${world}: ${pair} is ${value.toFixed(2)}, under ${target}`);
    }
  }
});
