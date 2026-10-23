/**
 * Sound: the Sound button, and what turns the sound on and off and feeds it.
 * main.ts attaches each game to it at boot and hands start-game what this
 * returns. The sound itself (conductor.ts) loads in a chunk of its own the
 * first time sound is on: only its types are imported here.
 *
 * One page, one sound. Every game on the page shares one AudioContext and
 * one soundscape, which follows the game pressed last; every Sound button
 * shows the one setting; each game's moves sound in its own world.
 *
 * Browsers let a page make sound only after a press (a click, a tap, a key),
 * so the AudioContext is made and started here, in the press itself, before
 * the chunk has loaded. Sound left on at the end of a visit starts at the
 * next visit's first press, wherever it lands, but for a press on a Sound
 * button (which is turning it off) and Tab or a modifier key. Whenever sound
 * should play and the context isn't running (iOS stops it for a call), the
 * next press starts it again.
 *
 * The sound follows the page rather than being told: each stage's data-world
 * (its soundscape), presses on the Difficulty and World buttons (a click),
 * whether the game is on screen, and whether the page is shown.
 *
 * The button is an icon, a speaker with waves or crossed out (controls.css).
 * A press marks it (data-toggled), and only then does the icon move: the
 * remembered setting, shown as the page loads, appears as it is. Without Web
 * Audio the button is hidden.
 */
import type { GameEvent } from '../game/core.ts';
import type { Board } from '../game/session.ts';
import type { Preferences } from '../preferences.ts';
import { requireElement } from '../utils.ts';
import { isWorldName, type WorldName } from '../worlds/worlds.ts';
import type { Conductor } from './conductor.ts';

/** What a game hands its moves to. */
export interface Sound {
  /** Plays a move the session has applied; `board` is the session's after it. */
  playMove(move: readonly GameEvent[], board: Board): void;
}

/** The presses that let a page start its sound: a tap counts on pointerup, not pointerdown. */
const PRESSES = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;

/** Keys that don't start the sound: they move the focus, or go with another key. */
const QUIET_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape']);

interface Game {
  readonly root: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly stage: HTMLElement;
  isOnScreen: boolean;
}

interface PageSound {
  add(root: HTMLElement): Sound;
}

// One for the page, made with its first game.
let page: PageSound | null = null;

/** Attaches the game under `root` to the page's sound. */
export function attachSound(root: HTMLElement, preferences: Preferences): Sound {
  page ??= createPageSound(preferences);
  return page.add(root);
}

function createPageSound(preferences: Preferences): PageSound {
  const games: Game[] = [];
  const isSupported = typeof AudioContext === 'function';
  // The game pressed last: its world plays, while it's on screen.
  let active: Game | null = null;
  let context: AudioContext | null = null;
  let loading: Promise<Conductor | null> | null = null;
  let conductor: Conductor | null = null;

  function worldOf(game: Game): WorldName {
    const name = game.stage.dataset.world ?? '';
    return isWorldName(name) ? name : 'deep-sea';
  }

  function gameUnder(target: EventTarget | null): Game | undefined {
    return target instanceof Node ? games.find((game) => game.root.contains(target)) : undefined;
  }

  function makeActive(game: Game): void {
    if (game !== active) {
      active = game;
      conductor?.setWorld(worldOf(game));
      conductor?.setOnScreen(game.isOnScreen);
    }
  }

  /**
   * Starts the page's audio, inside a press, and loads the sound once. A load
   * that fails is forgotten, so the next press tries again.
   */
  function wake(): void {
    const activation = navigator.userActivation as UserActivation | undefined;

    // Outside a press the browser refuses, and says so in the console.
    if (!isSupported || (activation && !activation.isActive)) {
      return;
    }

    const started = (context ??= new AudioContext());
    // Refused outside a press: the next press tries again.
    started.resume().catch(() => {});
    loading ??= import('./conductor.ts')
      .then(({ createConductor }) => {
        const game = active ?? games[0];
        conductor = createConductor(started, {
          world: worldOf(game),
          isOnScreen: game.isOnScreen,
          preferences,
          isPageHidden: () => document.hidden,
        });
        conductor.setOn(preferences.isSoundOn);
        return conductor;
      })
      .catch((error: unknown) => {
        console.error(error);

        // Not loaded, or not made: the next press tries again.
        if (!conductor) {
          loading = null;
        }

        return conductor;
      });
  }

  function toggle(pressed: Game): void {
    preferences.setSound(!preferences.isSoundOn);
    pressed.button.dataset.toggled = '';

    for (const game of games) {
      game.button.setAttribute('aria-pressed', String(preferences.isSoundOn));
    }

    makeActive(pressed);

    if (preferences.isSoundOn) {
      wake();
    }

    conductor?.setOn(preferences.isSoundOn);
  }

  function onPress(event: Event): void {
    const game = gameUnder(event.target);

    if (game && (event.type === 'pointerdown' || event.type === 'keydown')) {
      makeActive(game);
    }

    if (
      !preferences.isSoundOn ||
      (conductor && !conductor.needsPress) ||
      (event instanceof KeyboardEvent &&
        (QUIET_KEYS.has(event.key) || event.ctrlKey || event.metaKey || event.altKey)) ||
      (event.target instanceof Element && event.target.closest('.minesweeper__sound'))
    ) {
      return;
    }

    wake();
  }

  for (const type of PRESSES) {
    document.addEventListener(type, onPress, true);
  }

  document.addEventListener('visibilitychange', () => conductor?.pageVisibilityChanged());

  return {
    add(root) {
      const game: Game = {
        root,
        button: requireElement<HTMLButtonElement>(root, '.minesweeper__sound'),
        stage: requireElement(root, '.minesweeper__stage'),
        isOnScreen: true,
      };
      games.push(game);
      active ??= game;

      game.button.hidden = !isSupported;
      game.button.setAttribute('aria-pressed', String(preferences.isSoundOn));
      game.button.addEventListener('click', () => toggle(game));

      new MutationObserver(() => {
        if (game === active) {
          conductor?.setWorld(worldOf(game));
        }
      }).observe(game.stage, { attributeFilter: ['data-world'] });

      // Entries can come in a batch: the last is how things stand now.
      new IntersectionObserver((entries) => {
        game.isOnScreen = entries[entries.length - 1].isIntersecting;

        if (game === active) {
          conductor?.setOnScreen(game.isOnScreen);
        }
      }).observe(root);

      root.addEventListener('click', (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.minesweeper__segmented button')
        ) {
          conductor?.playClick();
        }
      });

      return {
        playMove(move, board) {
          conductor?.playMove(move, board.columns, worldOf(game));
        },
      };
    },
  };
}
