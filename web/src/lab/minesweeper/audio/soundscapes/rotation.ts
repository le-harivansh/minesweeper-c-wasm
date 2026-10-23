/**
 * Which soundscape plays, and when the next is due. Each world has four; one
 * plays for 45 seconds heard, then crossfades into the next, round and round.
 *
 * Only seconds heard count: none while the sound is paused (off, off screen,
 * the page hidden), so a soundscape always gets its 45 seconds. The count
 * starts again with each new soundscape.
 *
 * A world starts at a random one of its four the first time it plays, and at
 * the one it played last after that, which the preferences keep by name.
 */

/** How long a soundscape plays before the next: 45 seconds, by choice (2026-10-23). */
export const SOUNDSCAPE_SECONDS = 45;

/** The crossfade from one soundscape to the next: the prototype's. */
export const SOUNDSCAPE_CROSSFADE_SECONDS = 15;

export interface SoundscapeRotation {
  readonly secondsLeft: number;
  restart(): void;
  /** Counts one second heard: true when the next soundscape is due, and the count starts over. */
  tick(): boolean;
}

export function createSoundscapeRotation(seconds = SOUNDSCAPE_SECONDS): SoundscapeRotation {
  let secondsLeft = seconds;

  return {
    get secondsLeft() {
      return secondsLeft;
    },
    restart() {
      secondsLeft = seconds;
    },
    tick() {
      secondsLeft -= 1;

      if (secondsLeft > 0) {
        return false;
      }

      secondsLeft = seconds;
      return true;
    },
  };
}

/**
 * Where a world starts: the soundscape it played last, if it still has one by
 * that name, else one of `names` drawn with `random`.
 */
export function firstSoundscape(
  names: readonly string[],
  remembered: string | null,
  random: () => number = Math.random,
): string {
  return remembered !== null && names.includes(remembered)
    ? remembered
    : names[Math.floor(random() * names.length)];
}

/** The soundscape after `name`, round and round. */
export function nextSoundscape(names: readonly string[], name: string): string {
  return names[(names.indexOf(name) + 1) % names.length];
}
