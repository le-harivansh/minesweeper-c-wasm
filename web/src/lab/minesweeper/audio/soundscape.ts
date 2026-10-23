/**
 * A soundscape: what a world sounds like between moves. Every one follows the
 * prototype's recipe (tmp/Minesweeper.html in the C repo):
 *
 *   bed          two or three continuous layers, drifting
 *   texture      one continuous stream of grains, or a chorus
 *   occasional   four to six sounds, each on its own random interval
 *   room         a reverb of its own, which the far-off sounds go through
 *
 * A scene is one soundscape playing: the gain it plays through, the sources
 * that run until it stops, and its timers. The player starts one, and fades
 * the one before out under it.
 *
 * The parts here are the prototype's, node for node and random draw for
 * random draw; only the names are new. Timed parts hold while the engine is
 * paused (the page hidden, or nothing heard), as the prototype's held while
 * the page was hidden: nothing piles up to play at once on the way back.
 */
import { randomBetween, type AudioEngine, type NoiseColor } from './audio-engine.ts';

export interface Soundscape {
  /** Its name in words, as the preferences keep it: 'reef-shelf'. */
  readonly name: string;
  build(scene: Scene): void;
}

export interface Scene {
  readonly engine: AudioEngine;
  /** What the soundscape plays through: it fades in and out here. */
  readonly output: GainNode;
  /** The continuous sources, stopped once the scene has faded out. */
  readonly sources: AudioScheduledSourceNode[];
  readonly timers: ReturnType<typeof setTimeout>[];
  /** False once fading out: its timers then do nothing. */
  live: boolean;
}

export interface SoundscapePlayer {
  /** The soundscape playing, if any. */
  readonly playing: Soundscape | null;
  /** Fades the playing soundscape out and `soundscape` in, over `fadeSeconds`. */
  play(soundscape: Soundscape, fadeSeconds: number): void;
}

/** The parts and their own sounds are timed with timers, kept to this many at most. */
const MOST_TIMERS = 400;

/** Within this much of a fade-out's end, its sources may stop. */
const STOP_SLACK_SECONDS = 0.05;

/** How long a fade-out runs before the scene's sources stop: the prototype's, its tails included. */
export function fadeOutLastsMs(fadeSeconds: number): number {
  return fadeSeconds * 1600 + 800;
}

export function createSoundscapePlayer(engine: AudioEngine): SoundscapePlayer {
  let current: { soundscape: Soundscape; scene: Scene } | null = null;

  /**
   * Fades the scene out, stops its timers at once, and its sources once the
   * fade is done. Done in the context's time, which stands still while the
   * context is suspended: by the clock alone, a scene left fading as the
   * page was hidden would be cut off mid-fade on the way back.
   */
  function fadeOut(fadeSeconds: number): void {
    if (!current) {
      return;
    }

    const { scene } = current;
    current = null;
    scene.live = false;
    scene.timers.forEach(clearTimeout);
    scene.output.gain.setTargetAtTime(0, engine.now(), Math.max(0.3, fadeSeconds / 3));
    const fadedAt = engine.now() + fadeOutLastsMs(fadeSeconds) / 1000;

    const stopWhenFaded = () => {
      const secondsLeft = fadedAt - engine.now();

      if (secondsLeft > STOP_SLACK_SECONDS) {
        setTimeout(stopWhenFaded, secondsLeft * 1000);
        return;
      }

      for (const source of scene.sources) {
        try {
          source.stop();
        } catch {
          // Stopped already: nothing left to stop.
        }
      }

      scene.output.disconnect();
    };

    setTimeout(stopWhenFaded, fadeOutLastsMs(fadeSeconds));
  }

  return {
    get playing() {
      return current?.soundscape ?? null;
    },
    play(soundscape, fadeSeconds) {
      const fade = Math.max(0.4, fadeSeconds);
      fadeOut(fade);
      const scene: Scene = {
        engine,
        output: engine.context.createGain(),
        sources: [],
        timers: [],
        live: true,
      };
      scene.output.gain.value = 0;
      scene.output.connect(engine.ambienceBus);
      soundscape.build(scene);
      scene.output.gain.setTargetAtTime(1, engine.now(), fade / 3);
      current = { soundscape, scene };
    },
  };
}

// ---- The parts every soundscape is made of ----

/** Runs `run` after `delayMs`, unless the scene has faded out by then. */
export function schedule(scene: Scene, run: () => void, delayMs: number): void {
  // Old timers have long fired: drop the oldest half rather than keep them all.
  if (scene.timers.length > MOST_TIMERS) {
    scene.timers.splice(0, MOST_TIMERS / 2);
  }

  scene.timers.push(
    setTimeout(() => {
      if (scene.live) {
        run();
      }
    }, delayMs),
  );
}

/**
 * A room: a reverb and a quiet dry path, both into the scene. Returns its
 * input, where every far-off sound goes, so they share one space. `seconds`
 * sets the tail; `brightness`, 0 to 1, how bright it is; `wet`, how much of it.
 */
export function room(scene: Scene, seconds: number, brightness: number, wet: number): GainNode {
  const { context } = scene.engine;
  const far = context.createGain();
  far.gain.value = 1;
  const reverb = createReverb(context, seconds, brightness);
  const wetLevel = context.createGain();
  wetLevel.gain.value = wet;
  const dryLevel = context.createGain();
  dryLevel.gain.value = 0.35;
  far.connect(reverb).connect(wetLevel).connect(scene.output);
  far.connect(dryLevel).connect(scene.output);
  return far;
}

/**
 * A synthetic room's impulse: stereo noise with an exponential tail, darker
 * through a one-pole lowpass as `brightness` falls.
 */
function createReverb(
  context: BaseAudioContext,
  seconds: number,
  brightness: number,
): ConvolverNode {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    let filtered = 0;

    for (let index = 0; index < length; index++) {
      const fade = Math.pow(1 - index / length, 2.6) * (index < 400 ? index / 400 : 1);
      const x = (Math.random() * 2 - 1) * fade;
      filtered += brightness * (x - filtered);
      samples[index] = filtered;
    }
  }

  const reverb = context.createConvolver();
  reverb.buffer = impulse;
  return reverb;
}

/** A continuous oscillator into `output`, at its own gain; it runs until the scene stops. */
export function drone(
  scene: Scene,
  wave: OscillatorType,
  frequency: number,
  gain: number,
  output: AudioNode,
  detune?: number,
): { oscillator: OscillatorNode; gain: GainNode } {
  const { context } = scene.engine;
  const oscillator = context.createOscillator();
  oscillator.type = wave;
  oscillator.frequency.value = frequency;

  if (detune) {
    oscillator.detune.value = detune;
  }

  const level = context.createGain();
  level.gain.value = gain;
  oscillator.connect(level).connect(output);
  oscillator.start();
  scene.sources.push(oscillator);
  return { oscillator, gain: level };
}

/**
 * A slow oscillator (a synth's LFO) moving `target` by `depth` either way;
 * it runs until the scene stops.
 */
export function slowOscillator(
  scene: Scene,
  frequency: number,
  depth: number,
  target: AudioParam,
): void {
  const { context } = scene.engine;
  const oscillator = context.createOscillator();
  oscillator.frequency.value = frequency;
  const level = context.createGain();
  level.gain.value = depth;
  oscillator.connect(level).connect(target);
  oscillator.start();
  scene.sources.push(oscillator);
}

export interface NoiseLayerOptions {
  filter: BiquadFilterType;
  frequency: number;
  /** The filter's Q: how narrow its band, or how sharp its edge. */
  q: number;
  gain: number;
  noise?: NoiseColor;
  pan?: number;
}

/**
 * A continuous layer of filtered noise in its own stereo place: the bed's
 * stuff. Returns its filter, gain and panner, for wander() to move.
 */
export function noiseLayer(
  scene: Scene,
  { filter: type, frequency, q, gain, noise, pan }: NoiseLayerOptions,
): { filter: BiquadFilterNode; gain: GainNode; panner: StereoPannerNode } {
  const { context } = scene.engine;
  const source = scene.engine.noise(noise);
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const level = context.createGain();
  level.gain.value = gain;
  const panner = context.createStereoPanner();
  panner.pan.value = pan || 0;
  source.connect(filter).connect(level).connect(panner).connect(scene.output);
  source.start(0, Math.random() * 2);
  scene.sources.push(source);
  return { filter, gain: level, panner };
}

/** What wander() can move: an AudioParam, or anything that takes a target as one does. */
export interface Wanderable {
  setTargetAtTime(target: number, at: number, timeConstant: number): unknown;
}

/**
 * Moves `parameter` to a new random value between `low` and `high` every
 * `minMs` to `maxMs`, gliding there with `timeConstant`: what keeps a bed
 * from sounding like a loop.
 */
export function wander(
  scene: Scene,
  parameter: Wanderable,
  low: number,
  high: number,
  minMs: number,
  maxMs: number,
  timeConstant = 0.6,
): void {
  const step = () => {
    parameter.setTargetAtTime(randomBetween(low, high), scene.engine.now(), timeConstant);
    schedule(scene, step, randomBetween(minMs, maxMs));
  };

  step();
}

/**
 * A stream of grains: `play(at)` every `minMs` to `maxMs`, scheduled 250 ms
 * ahead, so a late timer never reaches the sound.
 */
export function grains(
  scene: Scene,
  [minMs, maxMs]: readonly [number, number],
  play: (at: number) => void,
): void {
  const { engine } = scene;
  let next = engine.now() + 0.05;

  const tick = () => {
    if (engine.paused()) {
      next = engine.now() + 0.05;
      schedule(scene, tick, 400);
      return;
    }

    const horizon = engine.now() + 0.25;

    while (next < horizon) {
      try {
        play(next);
      } catch (error) {
        engine.reportError(error);
      }

      next += randomBetween(minMs, maxMs) / 1000;
    }

    schedule(scene, tick, 110);
  };

  tick();
}

/**
 * An occasional sound: `play(at)` every `minMs` to `maxMs`, the first
 * sooner, within 30 to 80 % of `minMs`.
 */
export function occasionalSound(
  scene: Scene,
  play: (at: number) => void,
  minMs: number,
  maxMs: number,
): void {
  const { engine } = scene;

  const loop = () => {
    if (engine.paused()) {
      schedule(scene, loop, 1500);
      return;
    }

    try {
      play(engine.now());
    } catch (error) {
      engine.reportError(error);
    }

    schedule(scene, loop, minMs + Math.random() * (maxMs - minMs));
  };

  schedule(scene, loop, minMs * 0.3 + Math.random() * minMs * 0.5);
}
