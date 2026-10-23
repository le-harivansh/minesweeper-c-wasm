/**
 * The worlds: how the stage looks. Presentation only: the session and the
 * module never hear of them. Each is a stylesheet of its own in this folder
 * (deep-sea.css, …), chosen by the stage's data-world; worlds.css imports
 * the four.
 *
 * main.ts attaches the World group at boot, before the game loads, so the
 * stage is in the player's world from the start and a change of world needs
 * no game. A change repaints the stage and nothing else: the game in play
 * carries on. The particles round the board follow the stage's world by
 * themselves (particles.ts).
 */
import type { Preferences } from '../preferences.ts';
import { requireElement } from '../utils.ts';

/** The worlds, as the markup, the stylesheets and storage name them; the first is the default. */
export const WORLD_NAMES = ['deep-sea', 'night-sky', 'dune', 'rainforest'] as const;

export type WorldName = (typeof WORLD_NAMES)[number];

/** Each world's name on its button. */
export const WORLD_LABELS: Record<WorldName, string> = {
  'deep-sea': 'Deep sea',
  'night-sky': 'Night sky',
  dune: 'Dune',
  rainforest: 'Rainforest',
};

export function isWorldName(name: string): name is WorldName {
  return (WORLD_NAMES as readonly string[]).includes(name);
}

/**
 * Paints the stage under `root` in the remembered world, and runs the World
 * group: a press paints its world and remembers it.
 */
export function attachWorlds(
  root: HTMLElement,
  preferences: Pick<Preferences, 'world' | 'setWorld'>,
): void {
  const stage = requireElement(root, '.minesweeper__stage');
  const group = requireElement(root, '.minesweeper__worlds');
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[data-world]')];

  function showWorld(world: WorldName): void {
    stage.dataset.world = world;

    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.world === world));
    }
  }

  group.addEventListener('click', (event) => {
    const name = (event.target as Element).closest<HTMLElement>('[data-world]')?.dataset.world;

    if (name !== undefined && isWorldName(name)) {
      showWorld(name);
      preferences.setWorld(name);
    }
  });

  showWorld(preferences.world);
}
