/**
 * Starts every game on the page. The page shows the game's static parts
 * without this; once a game nears the viewport, this downloads the module
 * and, side by side, the rest of the game's code (start-game.ts, its own
 * chunk), then starts it. The particles round the board (particles.ts)
 * come then too, in a chunk of its own: they belong to the stage, not the
 * game, so they move even if the game fails to load.
 *
 * The world and the sound come first, at once: each stage is painted in the
 * world chosen last before its game loads, so it doesn't change colour as it
 * starts, and the Sound button works from the start. The sound's own code
 * loads only once sound is on (sound.ts).
 *
 * The import() also keeps this entry an external script. Astro inlines a
 * small script that imports nothing into the page, and the site's
 * Content-Security-Policy blocks inline scripts.
 */

import { attachSound, type Sound } from './audio/sound.ts';
// no-inline: Vite inlines a file under 4 KiB into the script as a data: URL,
// which the site's policy won't fetch (connect-src 'self'). As its own file,
// the module is cached on its own and compiles while it downloads.
import wasmUrl from './game/minesweeper.wasm?url&no-inline';
import { browserStorage, loadPreferences, type Preferences } from './preferences.ts';
import { attachWorlds } from './worlds/worlds.ts';

/** How far below the viewport a game starts loading. */
const LOAD_MARGIN = '200px';

async function start(root: HTMLElement, preferences: Preferences, sound: Sound): Promise<void> {
  const wasm = fetch(wasmUrl);
  const { startGame } = await import('./start-game.ts');

  await startGame(root, wasm, preferences, sound);
}

// One copy for the page: every game reads and writes this one.
const preferences = loadPreferences(browserStorage());

for (const root of document.querySelectorAll<HTMLElement>('.minesweeper')) {
  attachWorlds(root, preferences);
  const sound = attachSound(root, preferences);

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      observer.disconnect();
      import('./worlds/particles.ts')
        .then(({ attachParticles }) => attachParticles(root))
        .catch((error: unknown) => console.error(error));
      start(root, preferences, sound).catch((error: unknown) => {
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
