/**
 * Starts every game on the page. The page shows the game's static parts
 * without this; once a game nears the viewport, this downloads the module
 * and, side by side, the rest of the game's code (start-game.ts, its own
 * chunk), then starts it. The air round the board (ambience.ts) comes then
 * too, in a chunk of its own: it belongs to the stage, not the game, so it
 * moves even if the game fails to load.
 *
 * The world and the Sound button come first, at once: each stage is painted
 * in the world chosen last before its game loads, so it doesn't change
 * colour as it starts.
 *
 * The import() also keeps this entry an external script. Astro inlines a
 * small script that imports nothing into the page, and the site's
 * Content-Security-Policy blocks inline scripts.
 */

// no-inline: Vite inlines a file under 4 KiB into the script as a data: URL,
// which the site's policy won't fetch (connect-src 'self'). As its own file,
// the module is cached on its own and compiles while it downloads.
import wasmUrl from './minesweeper.wasm?url&no-inline';
import { browserStorage, loadPreferences, type Preferences } from './preferences.ts';
import { attachSoundButton } from './sound.ts';
import { attachWorlds } from './worlds.ts';

/** How far below the viewport a game starts loading. */
const LOAD_MARGIN = '200px';

async function start(root: HTMLElement, preferences: Preferences): Promise<void> {
  const wasm = fetch(wasmUrl);
  const { startGame } = await import('./start-game.ts');

  await startGame(root, wasm, preferences);
}

// One copy for the page: every game reads and writes this one.
const preferences = loadPreferences(browserStorage());

for (const root of document.querySelectorAll<HTMLElement>('.minesweeper')) {
  attachWorlds(root, preferences);
  attachSoundButton(root, preferences);

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      observer.disconnect();
      import('./ambience.ts')
        .then(({ attachAmbience }) => attachAmbience(root))
        .catch((error: unknown) => console.error(error));
      start(root, preferences).catch((error: unknown) => {
        const message = root.querySelector('.minesweeper__message');

        if (message) {
          message.textContent = 'The game failed to load.';
        }

        console.error(error);
      });
    },
    { rootMargin: LOAD_MARGIN },
  );

  observer.observe(root);
}
