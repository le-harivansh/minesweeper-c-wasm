/**
 * Small, general helpers that two or more of the game's folders use and that
 * belong to no part of the game. A part's own code lives in its folder; a
 * feature (preferences.ts) is a module of its own, not a helper.
 */

/**
 * The element under `root` that `selector` matches: a part of the game's
 * markup (Minesweeper.astro). A missing part is a bug in the markup, so this
 * throws rather than play on without it.
 */
export function requireElement<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Minesweeper: no element matches '${selector}'`);
  }

  return element;
}
