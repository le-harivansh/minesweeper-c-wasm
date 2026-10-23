/**
 * The game's sounds, each world its own: a new game, a reveal (one per ring
 * of the ripple), a flag, an unflag, the explosion, each mine a loss shows,
 * and a win; and the click the Difficulty and World buttons share.
 * move-sounds.ts says which a move plays, and when.
 *
 * The prototype's sounds, verbatim, but for two changes: its refused chord's
 * thud went with chording, and the new-game sounds are new. Those four were
 * picked by ear, 2026-10-23: each rises or holds level (a fall reads as
 * "back"), in its world's family of sounds, but apart from its world's other
 * sounds and soundscapes.
 */
import type { WorldName } from '../worlds/worlds.ts';
import { withJitter, type AudioEngine, type StruckPartial } from './engine.ts';

export interface WorldSoundEffects {
  newGame(engine: AudioEngine, at: number): void;
  /** `ring`: how far the ripple has come, 0 at the click; up to 14. */
  reveal(engine: AudioEngine, at: number, ring: number): void;
  flag(engine: AudioEngine, at: number): void;
  unflag(engine: AudioEngine, at: number): void;
  explosion(engine: AudioEngine, at: number): void;
  /** `order`: 0 for the mine nearest the exploded one, then out; each quieter. */
  mineShown(engine: AudioEngine, at: number, order: number): void;
  win(engine: AudioEngine, at: number): void;
}

/** The night sky's scale for the reveals: E major, from E5. */
const E_MAJOR = [659.25, 739.99, 830.61, 880, 987.77, 1108.73, 1244.51, 1318.51];

/** The rainforest's: a pentatonic on G, G A C D E (C major's, from G), from G4. */
const G_PENTATONIC = [392, 440, 523.25, 587.33, 659.25];

/** The dune's: the hijaz scale on D, its augmented second between E♭ and F♯. Its ney plays it too. */
export const D_HIJAZ = [293.66, 311.13, 369.99, 392, 440, 466.16, 523.25, 587.33];

/**
 * Each new-game sound's level, measured so that it sits between its world's
 * flag and win (A-weighted, the loudest 400 ms).
 */
const NEW_GAME_LEVELS: Record<WorldName, number> = {
  'deep-sea': 0.22,
  'night-sky': 0.0861,
  dune: 0.174,
  rainforest: 0.122,
};

/** A glockenspiel bar: a free bar's modes, 1 : 2.756 : 5.404; the upper two die at once. */
const GLOCKENSPIEL_BAR: readonly StruckPartial[] = [
  [1, 0.5, 1.3],
  [2.756, 0.12, 0.22],
  [5.404, 0.05, 0.07],
];

/** A kalimba tine: its note, and the one overtone near 5.9 times it, heard only in the pluck. */
const KALIMBA_TINE: readonly StruckPartial[] = [
  [1, 0.5, 1],
  [5.9, 0.14, 0.05],
];

/**
 * A new-game sound's output and its send into the echo, at its world's level.
 * Let go once the sound has rung out.
 */
function levelled(engine: AudioEngine, world: WorldName): { output: GainNode; echo: GainNode } {
  const level = NEW_GAME_LEVELS[world];
  const output = engine.context.createGain();
  output.gain.value = level;
  output.connect(engine.effectsBus);
  const echo = engine.context.createGain();
  echo.gain.value = level;
  echo.connect(engine.echo);
  setTimeout(() => {
    output.disconnect();
    echo.disconnect();
  }, 6000);

  return { output, echo };
}

/** A glassy sonar ping: the note, a faint octave edge, and a share into the echo. */
function sonarPing(
  engine: AudioEngine,
  { output, echo }: { output: GainNode; echo: GainNode },
  at: number,
  frequency: number,
  decay: number,
): void {
  engine.tone({ frequency, at, attack: 0.004, decay, gain: 0.12, output });
  engine.tone({
    frequency: frequency * 2,
    at,
    attack: 0.003,
    decay: decay * 0.25,
    gain: 0.02,
    output,
  });
  engine.tone({ frequency, at, attack: 0.004, decay: decay * 0.8, gain: 0.06, output: echo });
}

/** A kalimba tine, plucked, with the thumb's click. */
function kalimbaTine(
  engine: AudioEngine,
  output: GainNode,
  at: number,
  frequency: number,
  pan: number,
): void {
  engine.strike({ at, frequency, partials: KALIMBA_TINE, pan, output });
  engine.burst({
    filter: 'highpass',
    frequency: 4000,
    at,
    attack: 0.001,
    decay: 0.006,
    gain: 0.04,
    output,
  });
}

export const SOUND_EFFECTS: Record<WorldName, WorldSoundEffects> = {
  // Sine pings and bubbles, through the echo: a survey ship's sonar.
  'deep-sea': {
    /** Sonar lock-on: two glassy pings a fifth apart, E5 then B5, the second ringing on. */
    newGame(engine, at) {
      const outputs = levelled(engine, 'deep-sea');
      sonarPing(engine, outputs, at, 659.25, 0.45);
      sonarPing(engine, outputs, at + 0.2, 987.77, 1.2);
    },
    reveal(engine, at, ring) {
      const frequency = withJitter(380 * Math.pow(1.04, Math.min(ring, 14)));
      engine.tone({
        wave: 'sine',
        frequency,
        endFrequency: frequency * 2.4,
        at,
        attack: 0.004,
        decay: 0.07,
        gain: 0.07,
      });
    },
    flag(engine, at) {
      engine.tone({
        wave: 'sine',
        frequency: withJitter(1180),
        at,
        attack: 0.002,
        decay: 0.3,
        gain: 0.05,
      });
      engine.tone({
        wave: 'sine',
        frequency: 1180 * 2.4,
        at,
        attack: 0.002,
        decay: 0.18,
        gain: 0.025,
      });
    },
    unflag(engine, at) {
      engine.tone({ wave: 'sine', frequency: 880, at, attack: 0.002, decay: 0.2, gain: 0.04 });
      engine.tone({
        wave: 'sine',
        frequency: 880 * 2.4,
        at,
        attack: 0.002,
        decay: 0.1,
        gain: 0.015,
      });
    },
    explosion(engine, at) {
      engine.duckAmbience(at);
      engine.burst({
        at,
        attack: 0.004,
        decay: 0.9,
        gain: 0.45,
        filter: 'lowpass',
        frequency: 600,
        endFrequency: 45,
        q: 0.7,
      });
      engine.tone({
        wave: 'sine',
        frequency: 48,
        endFrequency: 18,
        at,
        attack: 0.005,
        decay: 1.1,
        gain: 0.5,
      });
      engine.tone({
        wave: 'sine',
        frequency: 700,
        endFrequency: 200,
        at,
        attack: 0.002,
        decay: 0.3,
        gain: 0.06,
        output: engine.echo,
      });
    },
    mineShown(engine, at, order) {
      const strength = Math.pow(0.88, order);
      engine.burst({ at, decay: 0.12, gain: 0.14 * strength, filter: 'lowpass', frequency: 260 });
      engine.tone({
        wave: 'sine',
        frequency: 110,
        endFrequency: 60,
        at,
        attack: 0.004,
        decay: 0.12,
        gain: 0.06 * strength,
      });
    },
    win(engine, at) {
      [660, 784, 988, 1319].forEach((frequency, index) =>
        engine.tone({
          wave: 'sine',
          frequency,
          endFrequency: frequency * 0.96,
          at: at + index * 0.14,
          attack: 0.004,
          decay: 0.4,
          gain: 0.05,
          output: engine.echo,
        }),
      );
    },
  },

  // Triangle and sine tones on E major, bright and high: starlight.
  'night-sky': {
    /** Glockenspiel: two bars, G6 then D7. */
    newGame(engine, at) {
      const { output, echo } = levelled(engine, 'night-sky');
      engine.strike({ at, frequency: 1567.98, partials: GLOCKENSPIEL_BAR, pan: -0.2, output });
      engine.strike({
        at: at + 0.14,
        frequency: 2349.32,
        partials: GLOCKENSPIEL_BAR,
        pan: 0.2,
        output,
      });
      engine.tone({
        frequency: 2349.32,
        at: at + 0.14,
        attack: 0.002,
        decay: 0.8,
        gain: 0.05,
        output: echo,
      });
    },
    reveal(engine, at, ring) {
      const frequency = withJitter(E_MAJOR[Math.min(ring, 7)] * (ring > 7 ? 2 : 1));
      engine.tone({ wave: 'triangle', frequency, at, attack: 0.003, decay: 0.18, gain: 0.06 });
      engine.tone({
        wave: 'sine',
        frequency: frequency * 2,
        at,
        attack: 0.002,
        decay: 0.05,
        gain: 0.02,
      });
    },
    flag(engine, at) {
      engine.tone({
        wave: 'sine',
        frequency: withJitter(1568),
        at,
        attack: 0.002,
        decay: 0.35,
        gain: 0.045,
      });
      engine.tone({
        wave: 'sine',
        frequency: 1568 * 2.76,
        at,
        attack: 0.002,
        decay: 0.15,
        gain: 0.02,
      });
    },
    unflag(engine, at) {
      engine.tone({ wave: 'sine', frequency: 1175, at, attack: 0.002, decay: 0.25, gain: 0.04 });
    },
    explosion(engine, at) {
      engine.duckAmbience(at);
      engine.burst({
        at,
        attack: 0.004,
        decay: 0.9,
        gain: 0.4,
        filter: 'lowpass',
        frequency: 400,
        endFrequency: 40,
        q: 0.8,
      });
      engine.tone({
        wave: 'sine',
        frequency: 42,
        endFrequency: 16,
        at,
        attack: 0.005,
        decay: 1.2,
        gain: 0.45,
      });
      engine.tone({
        wave: 'sine',
        frequency: 880,
        endFrequency: 110,
        at,
        attack: 0.003,
        decay: 0.6,
        gain: 0.07,
      });
    },
    mineShown(engine, at, order) {
      const strength = Math.pow(0.88, order);
      engine.burst({ at, decay: 0.07, gain: 0.1 * strength, filter: 'lowpass', frequency: 500 });
      engine.tone({
        wave: 'sine',
        frequency: 160,
        at,
        attack: 0.004,
        decay: 0.08,
        gain: 0.05 * strength,
      });
    },
    win(engine, at) {
      [1047, 1319, 1568, 2093, 2637].forEach((frequency, index) =>
        engine.tone({
          wave: 'sine',
          frequency,
          at: at + index * 0.1,
          attack: 0.01,
          decay: 0.5,
          gain: 0.04,
          output: engine.echo,
        }),
      );
      engine.tone({ wave: 'sine', frequency: 262, at, attack: 0.05, decay: 1.2, gain: 0.04 });
    },
  },

  // Sand in pink noise, a dry thump, and hijaz: wind over dunes.
  dune: {
    /** Oud: one strum across three courses, D3, A3, D4, each two strings a few cents apart. */
    newGame(engine, at) {
      const { output } = levelled(engine, 'dune');
      [146.83, 220, 293.66].forEach((frequency, index) =>
        engine.pluck({
          at: at + index * 0.025,
          frequency,
          gain: 0.16,
          decay: 1.2,
          brightness: 12,
          detuneCents: 5,
          pan: (index - 1) * 0.3,
          output,
        }),
      );
    },
    reveal(engine, at, ring) {
      const capped = Math.min(ring, 14);
      engine.burst({
        at,
        attack: 0.003,
        decay: 0.085,
        gain: 0.24,
        noise: 'pink',
        filter: 'bandpass',
        frequency: withJitter(900 + capped * 70),
        q: 1.1,
      });
      engine.tone({
        wave: 'sine',
        frequency: 170,
        endFrequency: 80,
        at,
        attack: 0.003,
        decay: 0.09,
        gain: 0.07,
      });
      engine.burst({
        at: at + 0.02,
        attack: 0.004,
        decay: 0.05,
        gain: 0.09,
        filter: 'highpass',
        frequency: 3500,
      });
    },
    flag(engine, at) {
      engine.tone({
        wave: 'triangle',
        frequency: withJitter(320),
        at,
        attack: 0.002,
        decay: 0.07,
        gain: 0.1,
      });
      engine.burst({ at, decay: 0.012, gain: 0.06, frequency: 2500 });
    },
    unflag(engine, at) {
      engine.tone({ wave: 'triangle', frequency: 240, at, attack: 0.002, decay: 0.06, gain: 0.07 });
    },
    explosion(engine, at) {
      engine.duckAmbience(at);
      engine.burst({
        at,
        attack: 0.002,
        decay: 0.12,
        gain: 0.3,
        filter: 'highpass',
        frequency: 3000,
        endFrequency: 800,
      });
      engine.burst({
        at: at + 0.02,
        attack: 0.004,
        decay: 0.8,
        gain: 0.45,
        filter: 'lowpass',
        frequency: 900,
        endFrequency: 50,
        q: 0.6,
      });
      engine.tone({
        wave: 'sine',
        frequency: 60,
        endFrequency: 24,
        at: at + 0.02,
        attack: 0.005,
        decay: 0.8,
        gain: 0.4,
      });
    },
    mineShown(engine, at, order) {
      engine.burst({
        at,
        decay: 0.06,
        gain: 0.1 * Math.pow(0.9, order),
        filter: 'lowpass',
        frequency: withJitter(500),
      });
    },
    win(engine, at) {
      [0, 1, 2, 3, 4, 7].forEach((step, index) =>
        engine.tone({
          wave: 'triangle',
          frequency: D_HIJAZ[step],
          at: at + index * 0.11,
          attack: 0.004,
          decay: 0.5,
          gain: 0.06,
          output: index > 3 ? engine.echo : undefined,
        }),
      );
    },
  },

  // A marimba on the pentatonic, drips and birdsong: a wet forest.
  rainforest: {
    /** Kalimba: two tines, G5 then D6. */
    newGame(engine, at) {
      const { output } = levelled(engine, 'rainforest');
      kalimbaTine(engine, output, at, 783.99, -0.15);
      kalimbaTine(engine, output, at + 0.13, 1174.66, 0.15);
    },
    reveal(engine, at, ring) {
      engine.marimba(withJitter(G_PENTATONIC[ring % 5] * (ring > 4 ? 2 : 1)), at, 0.07);
      engine.burst({ at, decay: 0.03, gain: 0.04, filter: 'highpass', frequency: 2000 });
    },
    flag(engine, at) {
      engine.tone({
        wave: 'sine',
        frequency: withJitter(880),
        endFrequency: 600,
        at,
        attack: 0.002,
        decay: 0.06,
        gain: 0.12,
      });
      engine.burst({ at, decay: 0.02, gain: 0.1, frequency: 1800, q: 3 });
    },
    unflag(engine, at) {
      engine.tone({
        wave: 'sine',
        frequency: 600,
        endFrequency: 420,
        at,
        attack: 0.002,
        decay: 0.05,
        gain: 0.09,
      });
    },
    explosion(engine, at) {
      engine.duckAmbience(at);
      engine.burst({
        at,
        attack: 0.002,
        decay: 0.05,
        gain: 0.25,
        filter: 'highpass',
        frequency: 2500,
      });
      engine.burst({
        at,
        attack: 0.01,
        decay: 1.2,
        gain: 0.5,
        filter: 'lowpass',
        frequency: 1800,
        endFrequency: 50,
        q: 0.8,
      });
      engine.tone({
        wave: 'sine',
        frequency: 50,
        endFrequency: 20,
        at,
        attack: 0.005,
        decay: 1.1,
        gain: 0.4,
      });
    },
    mineShown(engine, at, order) {
      const strength = Math.pow(0.88, order);
      engine.tone({
        wave: 'sine',
        frequency: withJitter(1200),
        endFrequency: 1800,
        at,
        attack: 0.002,
        decay: 0.05,
        gain: 0.05 * strength,
      });
      engine.burst({ at, decay: 0.05, gain: 0.07 * strength, filter: 'lowpass', frequency: 600 });
    },
    win(engine, at) {
      [392, 523, 659, 784, 1047].forEach((frequency, index) =>
        engine.marimba(frequency, at + index * 0.09, 0.08, 0.5),
      );
      engine.tone({
        wave: 'sine',
        frequency: 2600,
        endFrequency: 2100,
        at: at + 0.65,
        attack: 0.01,
        decay: 0.18,
        gain: 0.03,
        output: engine.echo,
      });
    },
  },
};

/** A press on a Difficulty or World button: a short tick of noise, the same in every world. */
export function playClick(engine: AudioEngine, at: number): void {
  engine.burst({ at, decay: 0.012, gain: 0.05, frequency: 2500, q: 1.2 });
}
