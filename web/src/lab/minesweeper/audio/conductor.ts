/**
 * The conductor: it makes no sound itself, but says what plays and when,
 * once sound is on: the world's soundscape, the next one every 45 seconds
 * heard, and the game's sounds for each move. sound.ts loads this file, in a
 * chunk of its own, the first time sound is on, and hands it the page's
 * AudioContext, already started by the press that turned sound on.
 *
 * Sound is heard while it's on, the game is on screen and the page is shown.
 * One function, reconcile(), brings the context in line with that, whatever
 * changed:
 *
 *   heard       the context resumes and the master fades in (1 s); the
 *               world's soundscape plays, fading in (2.5 s) the first time
 *   not heard   the master fades out (1 s) and the context is suspended once
 *               the tails are done; at once when the page is hidden
 *
 * A soundscape is kept while nothing is heard, not rebuilt: it pauses (its
 * timers wait) and carries on where it was. It also pauses while the context
 * isn't running for another reason (iOS suspends it for a call), so that
 * nothing piles up to play at once on the way back; the game's sounds play
 * only while it runs. A new world crossfades to its own soundscape (2.5 s),
 * now if heard, else on the way back.
 */
import type { GameEvent } from '../game/core.ts';
import type { Preferences } from '../preferences.ts';
import type { WorldName } from '../worlds/worlds.ts';
import { createAudioEngine, MASTER_LEVEL } from './engine.ts';
import { soundsForMove } from './move-sounds.ts';
import { playClick, SOUND_EFFECTS } from './sfx.ts';
import { DEEP_SEA_SOUNDSCAPES } from './soundscapes/deep-sea.ts';
import { DUNE_SOUNDSCAPES } from './soundscapes/dune.ts';
import { NIGHT_SKY_SOUNDSCAPES } from './soundscapes/night-sky.ts';
import { RAINFOREST_SOUNDSCAPES } from './soundscapes/rainforest.ts';
import {
  createSoundscapeRotation,
  firstSoundscape,
  nextSoundscape,
  SOUNDSCAPE_CROSSFADE_SECONDS,
} from './soundscapes/rotation.ts';
import {
  createSoundscapePlayer,
  fadeOutLastsMs,
  type Soundscape,
} from './soundscapes/soundscape.ts';

/** A world's soundscape fading in, as sound turns on or the world changes: the prototype's. */
export const FADE_IN_SECONDS = 2.5;

/** The master fading in and out as the sound is heard or not: the prototype's sound-off fade. */
export const MASTER_FADE_SECONDS = 1;

/** When the master's fade-out and its tails are done, and the context can be suspended. */
const SUSPEND_AFTER_MS = fadeOutLastsMs(MASTER_FADE_SECONDS);

/** Each world's four soundscapes, in the order they turn. */
export const SOUNDSCAPES: Record<WorldName, readonly Soundscape[]> = {
  'deep-sea': DEEP_SEA_SOUNDSCAPES,
  'night-sky': NIGHT_SKY_SOUNDSCAPES,
  dune: DUNE_SOUNDSCAPES,
  rainforest: RAINFOREST_SOUNDSCAPES,
};

export interface Conductor {
  /** Sound on or off: the player's choice. */
  setOn(isOn: boolean): void;
  /** Whether the game whose world plays is on screen. */
  setOnScreen(isOnScreen: boolean): void;
  /** The world whose soundscape plays. */
  setWorld(world: WorldName): void;
  /** The page was shown or hidden. */
  pageVisibilityChanged(): void;
  /** Whether a press would start the sound now: it should be heard, but the context isn't running. */
  readonly needsPress: boolean;
  /** Plays a move's sounds in `world`, on a board `columns` wide; nothing while not heard. */
  playMove(move: readonly GameEvent[], columns: number, world: WorldName): void;
  /** A press on a Difficulty or World button. */
  playClick(): void;
}

export interface ConductorOptions {
  world: WorldName;
  isOnScreen: boolean;
  /** Where each world's soundscapes stand. */
  preferences: Pick<Preferences, 'soundscape' | 'setSoundscape'>;
  isPageHidden: () => boolean;
  /** Draws a world's first soundscape; Math.random by default. */
  random?: () => number;
  /** Where errors in sounds go; the console by default. */
  reportError?: (error: unknown) => void;
}

export function createConductor(
  context: AudioContext,
  {
    world: initialWorld,
    isOnScreen: isInitiallyOnScreen,
    preferences,
    isPageHidden,
    random = Math.random,
    reportError = (error) => console.error(error),
  }: ConductorOptions,
): Conductor {
  let isOn = false;
  let isOnScreen = isInitiallyOnScreen;
  let world = initialWorld;
  let isHeard = false;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  // What the player plays: its world and name, so a new world or the
  // rotation knows where it stands.
  let playing: { world: WorldName; name: string } | null = null;

  /** Heard, and the context running: sounds made now are heard now. */
  const isSounding = () => isHeard && context.state === 'running';
  const engine = createAudioEngine(context, {
    isPaused: () => !isSounding() || isPageHidden(),
    reportError,
  });
  const player = createSoundscapePlayer(engine);
  const rotation = createSoundscapeRotation();
  const isWanted = () => isOn && isOnScreen && !isPageHidden();
  const soundscapeNames = (forWorld: WorldName) =>
    SOUNDSCAPES[forWorld].map((soundscape) => soundscape.name);

  // Both are refused outside a press, or once the page is closing: the next
  // reconcile, or the next press, tries again.
  function resumeContext(): void {
    context.resume().catch(() => {});
  }

  function suspendContext(): void {
    suspendTimer = null;
    context.suspend().catch(() => {});
  }

  function fadeMaster(level: number): void {
    engine.master.gain.setTargetAtTime(level, engine.now(), MASTER_FADE_SECONDS / 3);
  }

  /** Plays `name` from the world's four, fading over `fadeSeconds`, and remembers it. */
  function playSoundscape(name: string, fadeSeconds: number): void {
    const soundscape = SOUNDSCAPES[world].find((candidate) => candidate.name === name);

    if (!soundscape) {
      return;
    }

    preferences.setSoundscape(world, name);
    player.play(soundscape, fadeSeconds);
    playing = { world, name };
    rotation.restart();
  }

  function playWorld(fadeSeconds: number): void {
    playSoundscape(
      firstSoundscape(soundscapeNames(world), preferences.soundscape(world), random),
      fadeSeconds,
    );
  }

  function reconcile(): void {
    const shouldBeHeard = isWanted();

    if (shouldBeHeard && !isHeard) {
      isHeard = true;

      if (suspendTimer !== null) {
        clearTimeout(suspendTimer);
        suspendTimer = null;
      }

      resumeContext();
      fadeMaster(MASTER_LEVEL);

      if (playing?.world !== world) {
        playWorld(FADE_IN_SECONDS);
      }
    } else if (!shouldBeHeard && isHeard) {
      isHeard = false;
      fadeMaster(0);

      if (isPageHidden()) {
        suspendContext();
      } else {
        suspendTimer = setTimeout(suspendContext, SUSPEND_AFTER_MS);
      }
    } else if (!shouldBeHeard && context.state === 'running' && suspendTimer === null) {
      // A press started the context while nothing should be heard: suspend it again.
      suspendContext();
    } else if (shouldBeHeard && context.state !== 'running') {
      // Suspended by the browser (iOS for a call): a press will start it again.
      resumeContext();
    }
  }

  context.addEventListener('statechange', reconcile);

  // Only seconds heard count towards the next soundscape.
  setInterval(() => {
    if (isSounding() && !isPageHidden() && playing && rotation.tick()) {
      playSoundscape(
        nextSoundscape(soundscapeNames(world), playing.name),
        SOUNDSCAPE_CROSSFADE_SECONDS,
      );
    }
  }, 1000);

  return {
    setOn(next) {
      isOn = next;
      reconcile();
    },
    setOnScreen(next) {
      isOnScreen = next;
      reconcile();
    },
    setWorld(next) {
      world = next;

      if (isHeard && playing?.world !== world) {
        playWorld(FADE_IN_SECONDS);
      }
    },
    pageVisibilityChanged: reconcile,
    get needsPress() {
      return isWanted() && context.state !== 'running';
    },
    playMove(move, columns, moveWorld) {
      if (!isSounding()) {
        return;
      }

      const at = engine.now();
      const effects = SOUND_EFFECTS[moveWorld];

      for (const { sound, delayMs, order } of soundsForMove(move, columns)) {
        try {
          if (sound === 'reveal' || sound === 'mineShown') {
            effects[sound](engine, at + delayMs / 1000, order);
          } else {
            effects[sound](engine, at + delayMs / 1000);
          }
        } catch (error) {
          reportError(error);
        }
      }
    },
    playClick() {
      if (isSounding()) {
        playClick(engine, engine.now());
      }
    },
  };
}
