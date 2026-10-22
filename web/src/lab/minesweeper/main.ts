/**
 * Starts every game on the page. The page shows the game's static parts
 * without this; once a game nears the viewport, this loads the core and the
 * grid, each in its own chunk, and starts them.
 *
 * The import() calls also keep this entry an external script. Astro inlines a
 * small script that imports nothing into the page, and the site's
 * Content-Security-Policy blocks inline scripts.
 */

// no-inline: Vite inlines a file under 4 KiB into the script as a data: URL,
// which the site's policy won't fetch (connect-src 'self'). As its own file,
// the module is cached on its own and compiles while it downloads.
import wasmUrl from './minesweeper.wasm?url&no-inline';

/** How far below the viewport a game starts loading. */
const LOAD_MARGIN = '200px';

async function start(root: HTMLElement): Promise<void> {
  const [{ loadGameCore }, { startBareGrid }] = await Promise.all([
    import('./game-core.ts'),
    import('./bare-grid.ts'),
  ]);

  startBareGrid(root, await loadGameCore(fetch(wasmUrl)));
}

for (const root of document.querySelectorAll<HTMLElement>('.minesweeper')) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      observer.disconnect();
      start(root).catch((error: unknown) => {
        const status = root.querySelector('.minesweeper__status');

        if (status) {
          status.textContent = 'The game failed to load.';
        }

        console.error(error);
      });
    },
    { rootMargin: LOAD_MARGIN },
  );

  observer.observe(root);
}
