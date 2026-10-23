/**
 * Calls heard in more than one world's soundscapes: a deep rumble (deep sea,
 * dune), an owl (night sky, rainforest), a frog (night sky, rainforest), a
 * rock ticking as it cools (night sky, dune), and an insect's pulsing voice
 * (night sky, dune, rainforest). The prototype's, verbatim.
 *
 * A call plays at `at`, into `output`: usually a panner in front of the
 * scene, or in front of its room for one far off.
 */
import { randomBetween, withJitter, type AudioEngine } from '../engine.ts';
import { grains, type Scene } from './soundscape.ts';

/** A long, low swell of brown noise: pressure, or a far-off wall of sand. */
export function deepRumble(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.burst({
    at,
    attack: 1.5,
    decay: 3,
    gain: 0.06,
    noise: 'brown',
    filter: 'lowpass',
    frequency: 60,
    q: 0.8,
    output,
  });
}

/** Two hoots, falling a step, with breath in them. */
export function owl(engine: AudioEngine, at: number, output: AudioNode): void {
  [390, 350].forEach((frequency, index) => {
    engine.tone({ frequency, at: at + index * 0.42, attack: 0.06, decay: 0.3, gain: 0.03, output });
    engine.burst({
      at: at + index * 0.42,
      attack: 0.05,
      decay: 0.3,
      gain: 0.006,
      filter: 'bandpass',
      frequency: 400,
      q: 1,
      output,
    });
  });
}

/** Two to four frogs, each three quick croaks on its own pitch. */
export function frog(engine: AudioEngine, at: number, output: AudioNode): void {
  const frogs = 2 + Math.floor(Math.random() * 3);

  for (let frogIndex = 0; frogIndex < frogs; frogIndex++) {
    const frequency = randomBetween(150, 210);

    for (let croak = 0; croak < 3; croak++) {
      engine.tone({
        wave: 'triangle',
        frequency,
        at: at + frogIndex * 0.6 + croak * 0.11,
        attack: 0.005,
        decay: 0.05,
        gain: 0.018,
        output,
      });
    }
  }
}

/** A rock ticking as it cools; half the time, a second tick after it. */
export function rockTick(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.burst({
    at,
    attack: 0.001,
    decay: 0.03,
    gain: 0.05,
    filter: 'bandpass',
    frequency: randomBetween(1800, 2600),
    q: 5,
    output,
  });

  if (Math.random() < 0.5) {
    engine.burst({
      at: at + randomBetween(0.08, 0.2),
      attack: 0.001,
      decay: 0.025,
      gain: 0.03,
      filter: 'bandpass',
      frequency: randomBetween(2000, 3000),
      q: 5,
      output,
    });
  }
}

export interface ChorusVoiceOptions {
  /** How often it sings. */
  periodSeconds: number;
  /** Pulses each time, `gapSeconds` apart. */
  pulses: number;
  gapSeconds: number;
  frequency: number;
  /** The filter's Q: how narrow its band. */
  q: number;
  gain: number;
  /** Where it is, −1 (left) to 1 (right). */
  position: number;
}

/**
 * An insect's voice: every `periodSeconds`, `pulses` pulses of filtered noise
 * `gapSeconds` apart, around `frequency`, from its own place; now and then
 * it rests for a few periods. Runs for as long as the scene does.
 */
export function chorusVoice(
  scene: Scene,
  { periodSeconds, pulses, gapSeconds, frequency, q, gain, position }: ChorusVoiceOptions,
): void {
  const { engine } = scene;
  const output = engine.pan(scene.output, position, 1e9);
  let rest = 0;

  grains(scene, [periodSeconds * 1000, periodSeconds * 1000], (at) => {
    if (rest > 0) {
      rest--;
      return;
    }

    if (Math.random() < 0.05) {
      rest = 2 + Math.floor(Math.random() * 5);
    }

    for (let pulse = 0; pulse < pulses; pulse++) {
      engine.burst({
        at: at + pulse * gapSeconds,
        attack: 0.002,
        decay: gapSeconds * 0.55,
        gain,
        filter: 'bandpass',
        frequency: withJitter(frequency),
        q,
        output,
      });
    }
  });
}
