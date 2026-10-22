/**
 * The Sound button: on or off, remembered. Silent for now: the audio engine
 * comes in step 7 and listens to this switch.
 *
 * The button is an icon, a speaker with waves or crossed out (controls.css).
 * A press marks it (data-toggled), and only then does the icon move: the
 * remembered setting, shown as the page loads, appears as it is.
 *
 * main.ts attaches it at boot, as it does the worlds: it isn't the game's,
 * and it works before the game loads.
 */
import { findPart } from './find-part.ts';
import type { Preferences } from './preferences.ts';

/** Shows the remembered setting on the Sound button under `root`, and runs it. */
export function attachSoundButton(
  root: HTMLElement,
  preferences: Pick<Preferences, 'sound' | 'setSound'>,
): void {
  const button = findPart<HTMLButtonElement>(root, '.minesweeper__sound');

  button.addEventListener('click', () => {
    preferences.setSound(!preferences.sound);
    button.dataset.toggled = '';
    button.setAttribute('aria-pressed', String(preferences.sound));
  });

  button.setAttribute('aria-pressed', String(preferences.sound));
}
