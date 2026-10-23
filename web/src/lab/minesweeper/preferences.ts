/**
 * Preferences: what the game remembers on this device between visits, the
 * difficulty, the world, sound on or off, the best time at each difficulty
 * and where each world's soundscapes stand, as JSON under one localStorage
 * key. One copy per page (main.ts loads it).
 *
 * Each change writes only its own part: it reads what's stored first, which
 * another tab may have changed since this page loaded, and puts the change
 * into that. The soundscapes move on every 45 seconds, and that mustn't wipe
 * a best time another tab has just recorded.
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
  /** The soundscape `world` played last, by name; null until it has played one. */
  soundscape(world: WorldName): string | null;
  setSoundscape(world: WorldName, name: string): void;
}

/** Where preferences live: localStorage in the page, a fake in the tests. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface Stored {
  difficulty: DifficultyName;
  world: WorldName;
  sound: boolean;
  bestTimesMs: Partial<Record<DifficultyName, number>>;
  soundscapes: Partial<Record<WorldName, string>>;
}

/** A first visit's preferences. */
function defaults(): Stored {
  return {
    difficulty: 'beginner',
    world: 'deep-sea',
    sound: false,
    bestTimesMs: {},
    soundscapes: {},
  };
}

/**
 * Reads the preferences from `storage`; null, where the page can't have
 * storage at all, keeps them for the visit only.
 */
export function loadPreferences(storage: PreferenceStorage | null): Preferences {
  // This page's copy: what was stored as it loaded, and its own changes since.
  const current = read(storage) ?? defaults();

  /**
   * Makes a change to this page's copy and to what's stored now, and writes
   * that back. Where nothing usable is stored, this page's copy is written.
   */
  function save(change: (stored: Stored) => void): void {
    change(current);
    const latest = read(storage);

    if (latest) {
      change(latest);
    }

    write(storage, latest ?? current);
  }

  return {
    get difficulty() {
      return current.difficulty;
    },
    setDifficulty(difficulty) {
      save((stored) => (stored.difficulty = difficulty));
    },
    get world() {
      return current.world;
    },
    setWorld(world) {
      save((stored) => (stored.world = world));
    },
    get sound() {
      return current.sound;
    },
    setSound(on) {
      save((stored) => (stored.sound = on));
    },
    recordWin(difficulty, timeMs) {
      // This page's best, or another tab's if it's better: storage that reads
      // but won't write keeps an older best than this page has.
      const bests = [current.bestTimesMs[difficulty], read(storage)?.bestTimesMs[difficulty]];
      const known = bests.filter((best) => best !== undefined);
      const previousBestMs = known.length > 0 ? Math.min(...known) : null;

      if (previousBestMs === null || timeMs < previousBestMs) {
        save((stored) => (stored.bestTimesMs[difficulty] = timeMs));
      }

      return { timeMs, previousBestMs };
    },
    soundscape(world) {
      return current.soundscapes[world] ?? null;
    },
    setSoundscape(world, name) {
      save((stored) => (stored.soundscapes[world] = name));
    },
  };
}

/**
 * What's stored, keeping only what is valid, with the defaults for the rest;
 * null when there's nothing usable: no storage, storage that throws, nothing
 * stored yet, or what isn't a JSON object.
 */
function read(storage: PreferenceStorage | null): Stored | null {
  const stored = defaults();
  let data: unknown;

  try {
    data = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }

  if (typeof data !== 'object' || data === null) {
    return null;
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

  // A name the world doesn't have (any more) is the audio's to drop.
  if ('soundscapes' in data && typeof data.soundscapes === 'object' && data.soundscapes) {
    for (const [world, name] of Object.entries(data.soundscapes)) {
      if (isWorldName(world) && typeof name === 'string') {
        stored.soundscapes[world] = name;
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
