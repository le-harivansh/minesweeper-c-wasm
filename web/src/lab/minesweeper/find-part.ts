/**
 * Finds a part of the game's markup (Minesweeper.astro) by its selector. A
 * missing part is a bug in the markup, so it throws rather than play on
 * without it.
 */
export function findPart<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Minesweeper: no '${selector}' selector found`);
  }

  return element;
}
