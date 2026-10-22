/**
 * Preferences: what the game remembers on this device between visits, the
 * difficulty, the world, sound on or off, and the best time at each
 * difficulty, as JSON under one localStorage key. One copy per page (main.ts loads it): each change
 * writes the whole of it.
 *
 * Storage can fail. Blocked site data throws on access, a full quota throws
 * on writes, and what's stored may be from an older version or edited by
 * hand. None of it stops the game: what can't be read starts from the
 * defaults, and what can't be written lasts for the visit.
 */
import { isDifficultyName, type DifficultyName } from './game-core.ts';
import { isWorldName, type WorldName } from './worlds.ts';

export const STORAGE_KEY = 'minesweeper';

/** A won game's time, and the best at its difficulty before it, if any. */
export interface WinRecord {
  readonly timeMs: number;
  readonly previousBestMs: number | null;
}

export interface Preferences {
  /** The difficulty last played; Beginner on a first visit. */
  readonly difficulty: DifficultyName;
  setDifficulty(difficulty: DifficultyName): void;
  /** The world last chosen; deep sea on a first visit. */
  readonly world: WorldName;
  setWorld(world: WorldName): void;
  /** Whether sound is on; off on a first visit (a page never starts making noise). */
  readonly sound: boolean;
  setSound(on: boolean): void;
  /** Records a won game's time, keeping the best for its difficulty. */
  recordWin(difficulty: DifficultyName, timeMs: number): WinRecord;
}

/** Where preferences live: localStorage in the page, a fake in the tests. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface Stored {
  difficulty: DifficultyName;
  world: WorldName;
  sound: boolean;
  bestTimesMs: Partial<Record<DifficultyName, number>>;
}

/**
 * Reads the preferences from `storage`; null, where the page can't have
 * storage at all, keeps them for the visit only.
 */
export function loadPreferences(storage: PreferenceStorage | null): Preferences {
  const stored = read(storage);

  return {
    get difficulty() {
      return stored.difficulty;
    },
    setDifficulty(difficulty) {
      stored.difficulty = difficulty;
      write(storage, stored);
    },
    get world() {
      return stored.world;
    },
    setWorld(world) {
      stored.world = world;
      write(storage, stored);
    },
    get sound() {
      return stored.sound;
    },
    setSound(on) {
      stored.sound = on;
      write(storage, stored);
    },
    recordWin(difficulty, timeMs) {
      const previousBestMs = stored.bestTimesMs[difficulty] ?? null;

      if (previousBestMs === null || timeMs < previousBestMs) {
        stored.bestTimesMs[difficulty] = timeMs;
        write(storage, stored);
      }

      return { timeMs, previousBestMs };
    },
  };
}

/** What's stored, keeping only what is valid; the defaults for the rest. */
function read(storage: PreferenceStorage | null): Stored {
  const stored: Stored = {
    difficulty: 'beginner',
    world: 'deep-sea',
    sound: false,
    bestTimesMs: {},
  };
  let data: unknown;

  try {
    data = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return stored;
  }

  if (typeof data !== 'object' || data === null) {
    return stored;
  }

  if ('difficulty' in data && typeof data.difficulty === 'string') {
    if (isDifficultyName(data.difficulty)) {
      stored.difficulty = data.difficulty;
    }
  }

  if ('world' in data && typeof data.world === 'string' && isWorldName(data.world)) {
    stored.world = data.world;
  }

  if ('sound' in data && typeof data.sound === 'boolean') {
    stored.sound = data.sound;
  }

  if ('bestTimesMs' in data && typeof data.bestTimesMs === 'object' && data.bestTimesMs) {
    for (const [name, timeMs] of Object.entries(data.bestTimesMs)) {
      if (isDifficultyName(name) && typeof timeMs === 'number' && timeMs >= 0) {
        stored.bestTimesMs[name] = timeMs;
      }
    }
  }

  return stored;
}

function write(storage: PreferenceStorage | null, stored: Stored): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Refused or full: kept for this visit.
  }
}

/** localStorage, or null where the browser refuses it (reading it can throw). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
