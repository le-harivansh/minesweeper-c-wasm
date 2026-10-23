/**
 * The deep sea's four soundscapes, and the calls only it has. The
 * prototype's, verbatim (tmp/Minesweeper.html in the C repo).
 */
import { randomBetween, withJitter, type AudioEngine } from '../engine.ts';
import { deepRumble } from './shared-calls.ts';
import {
  drone,
  grains,
  noiseLayer,
  occasionalSound,
  room,
  slowOscillator,
  wander,
  type Scene,
  type Soundscape,
} from './soundscape.ts';

/** Four whale calls, each a path of [hertz, seconds]. */
const WHALE_CALLS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [150, 0],
    [330, 1.6],
    [240, 2.8],
  ],
  [
    [320, 0],
    [180, 1.4],
    [205, 2.3],
  ],
  [
    [180, 0],
    [200, 0.6],
    [420, 2.1],
    [380, 2.7],
  ],
  [
    [260, 0],
    [240, 0.8],
    [520, 1.9],
    [300, 3.1],
  ],
];

/** One whale call, pitched by `ratio`, with its octave; returns how long it lasts. */
function whaleCall(
  engine: AudioEngine,
  at: number,
  output: AudioNode,
  ratio: number,
  gain: number,
): number {
  const path = WHALE_CALLS[Math.floor(Math.random() * WHALE_CALLS.length)].map(
    ([hertz, seconds]) => [hertz * ratio, seconds] as const,
  );
  engine.glide({
    at,
    path,
    gain,
    attack: 0.5,
    release: 0.7,
    lowpassFrequency: 800,
    vibrato: [5.2, 5 * ratio],
    output,
  });
  engine.glide({
    at,
    path: path.map(([hertz, seconds]) => [hertz * 2.01, seconds] as const),
    gain: gain * 0.22,
    attack: 0.5,
    release: 0.7,
    lowpassFrequency: 1500,
    output,
  });
  return path[path.length - 1][1];
}

/** One to three calls from one whale; half the time another answers, lower and further off. */
function whalePhrase(engine: AudioEngine, at: number, output: AudioNode): void {
  const ratio = 0.8 + Math.random() * 0.5;
  const calls = 1 + Math.floor(Math.random() * 3);
  let next = at;

  for (let call = 0; call < calls; call++) {
    next += whaleCall(engine, next, output, ratio, 0.04) + 0.7 + Math.random() * 0.6;
  }

  if (Math.random() < 0.5) {
    whaleCall(engine, next + 2.5 + Math.random() * 2.5, output, ratio * 0.72, 0.016);
  }
}

/** The hull, creaking. */
function creak(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.glide({
    at,
    wave: 'sawtooth',
    path: [
      [58, 0],
      [49, 0.9],
      [52, 1.3],
    ],
    gain: 0.016,
    attack: 0.25,
    release: 0.4,
    lowpassFrequency: 260,
    output,
  });
  engine.burst({
    at: at + 0.1,
    attack: 0.2,
    decay: 0.9,
    gain: 0.012,
    noise: 'brown',
    filter: 'lowpass',
    frequency: 200,
    output,
  });
}

/** A shoal's clicks: ten to nineteen, quick and high. */
function clicks(engine: AudioEngine, at: number, output: AudioNode): void {
  const count = 10 + Math.floor(Math.random() * 10);
  let next = at;

  for (let click = 0; click < count; click++) {
    engine.burst({
      at: next,
      attack: 0.001,
      decay: 0.012,
      gain: 0.03,
      filter: 'bandpass',
      frequency: randomBetween(2400, 4200),
      q: 3,
      output,
    });
    next += randomBetween(0.025, 0.07);
  }
}

/** A parrotfish crunching coral. */
function parrotfish(engine: AudioEngine, at: number, output: AudioNode): void {
  const bites = 3 + Math.floor(Math.random() * 3);

  for (let bite = 0; bite < bites; bite++) {
    engine.burst({
      at: at + bite * 0.13,
      attack: 0.003,
      decay: 0.045,
      gain: 0.03,
      noise: 'pink',
      filter: 'bandpass',
      frequency: withJitter(1200),
      q: 1.2,
      output,
    });
  }
}

/** A boat passing far off: a low throb that swells and fades over nine seconds. */
function boatThrob(engine: AudioEngine, at: number, output: AudioNode): void {
  const { context } = engine;
  const oscillator = context.createOscillator();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 42;
  const throb = context.createGain();
  throb.gain.value = 0.5;
  const pulse = context.createOscillator();
  pulse.frequency.value = 2.2;
  const pulseDepth = context.createGain();
  pulseDepth.gain.value = 0.5;
  pulse.connect(pulseDepth).connect(throb.gain);
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 120;
  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.035, at + 3);
  level.gain.setValueAtTime(0.035, at + 5);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 9);
  oscillator.connect(throb).connect(lowpass).connect(level).connect(output);
  oscillator.start(at);
  pulse.start(at);
  oscillator.stop(at + 9.2);
  pulse.stop(at + 9.2);
}

/** One to three dolphin whistles. */
function dolphin(engine: AudioEngine, at: number, output: AudioNode): void {
  const whistles = 1 + Math.floor(Math.random() * 3);

  for (let whistle = 0; whistle < whistles; whistle++) {
    engine.glide({
      at: at + whistle * 0.5,
      path: [
        [5000, 0],
        [9000, 0.18],
        [6500, 0.38],
      ],
      gain: 0.012,
      attack: 0.02,
      release: 0.1,
      output,
    });
  }
}

/** The bloop: a low sound that takes three seconds to fall. */
function bloop(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.glide({
    at,
    path: [
      [130, 0],
      [70, 1.2],
      [60, 2.6],
    ],
    gain: 0.05,
    attack: 0.4,
    release: 1,
    lowpassFrequency: 300,
    output,
  });
}

/** A blue whale: six slow, deep pulses. */
function bluePulses(engine: AudioEngine, at: number, output: AudioNode): void {
  for (let pulse = 0; pulse < 6; pulse++) {
    engine.tone({
      frequency: 45,
      at: at + pulse * 0.9,
      attack: 0.08,
      decay: 0.45,
      gain: 0.035,
      output,
    });
  }
}

/** A structural groan: low sawtooth, wavering, sinking. */
function groan(engine: AudioEngine, at: number, output: AudioNode): void {
  const { context } = engine;
  const oscillator = context.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(38, at);
  oscillator.frequency.linearRampToValueAtTime(33, at + 2.5);
  const waver = context.createGain();
  waver.gain.value = 0.6;
  const tremolo = context.createOscillator();
  tremolo.frequency.value = 4;
  const tremoloDepth = context.createGain();
  tremoloDepth.gain.value = 0.4;
  tremolo.connect(tremoloDepth).connect(waver.gain);
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 180;
  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.02, at + 0.6);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
  oscillator.connect(waver).connect(lowpass).connect(level).connect(output);
  oscillator.start(at);
  tremolo.start(at);
  oscillator.stop(at + 3);
  tremolo.stop(at + 3);
}

/** One to three gulls above the surface. */
function gull(engine: AudioEngine, at: number, output: AudioNode): void {
  const calls = 1 + Math.floor(Math.random() * 3);

  for (let call = 0; call < calls; call++) {
    engine.glide({
      at: at + call * 0.75,
      path: [
        [1800, 0],
        [2600, 0.15],
        [1500, 0.6],
      ],
      gain: 0.012,
      attack: 0.03,
      release: 0.2,
      vibrato: [25, 80],
      output,
    });
  }
}

/** Sea lions barking on a rock. */
function seaLion(engine: AudioEngine, at: number, output: AudioNode): void {
  const barks = 2 + Math.floor(Math.random() * 2);

  for (let bark = 0; bark < barks; bark++) {
    engine.burst({
      at: at + bark * 0.42,
      attack: 0.01,
      decay: 0.18,
      gain: 0.03,
      noise: 'pink',
      filter: 'bandpass',
      frequency: 500,
      q: 2,
      output,
    });
    engine.tone({
      frequency: 180,
      endFrequency: 120,
      at: at + bark * 0.42,
      attack: 0.01,
      decay: 0.18,
      gain: 0.02,
      output,
    });
  }
}

/** A buoy's bell. */
function buoyBell(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.tone({ frequency: 740, at, attack: 0.002, decay: 1.2, gain: 0.02, output });
  engine.tone({ frequency: 740 * 2.9, at, attack: 0.002, decay: 0.5, gain: 0.008, output });
}

/** A wave breaking far off. */
function waveBreak(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.burst({
    at,
    attack: 0.8,
    decay: 2.5,
    gain: 0.045,
    noise: 'brown',
    filter: 'bandpass',
    frequency: 500,
    q: 0.5,
    output,
  });
  engine.burst({
    at: at + 0.5,
    attack: 0.6,
    decay: 2.2,
    gain: 0.012,
    filter: 'highpass',
    frequency: 4000,
    output,
  });
}

interface BubbleClusterOptions {
  bubbles: number;
  /** Each bubble's pitch, from `low` to `high` hertz, before it rises. */
  low: number;
  high: number;
  /** The seconds between one bubble and the next, from and to. */
  spacing: readonly [number, number];
  gain: number;
}

/** A cluster of small bubbles from one place. */
function bubbleCluster(
  scene: Scene,
  at: number,
  { bubbles, low, high, spacing, gain }: BubbleClusterOptions,
): void {
  const { engine } = scene;
  const output = engine.pan(scene.output, randomBetween(-0.8, 0.8));

  for (let bubble = 0; bubble < bubbles; bubble++) {
    const frequency = randomBetween(low, high);
    engine.tone({
      frequency,
      endFrequency: frequency * 2.6,
      at: at + bubble * randomBetween(spacing[0], spacing[1]),
      attack: 0.003,
      decay: 0.06,
      gain,
      output,
    });
  }
}

export const DEEP_SEA_SOUNDSCAPES: readonly Soundscape[] = [
  {
    // Mid-water. The chart being made.
    name: 'sounding',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 3.6, 0.22, 0.55);
      // The hull's hum.
      const hum = engine.context.createBiquadFilter();
      hum.type = 'lowpass';
      hum.frequency.value = 150;
      hum.connect(scene.output);
      drone(scene, 'sine', 48, 0.06, hum);
      drone(scene, 'sine', 72, 0.025, hum, 4);
      // Water pressure, and a band of moving water drifting across.
      const pressure = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 110,
        q: 1,
        gain: 0.05,
        noise: 'brown',
      });
      wander(scene, pressure.gain.gain, 0.03, 0.07, 2500, 6000, 1.5);
      const water = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 420,
        q: 0.7,
        gain: 0.03,
        noise: 'pink',
      });
      wander(scene, water.filter.frequency, 250, 700, 2000, 5000, 1.2);
      wander(scene, water.gain.gain, 0.012, 0.04, 1500, 4000, 0.9);
      wander(scene, water.panner.pan, -0.6, 0.6, 4000, 9000, 2.5);
      // A fizz of small bubbles, each somewhere in the field.
      grains(scene, [180, 900], (at) => {
        const frequency = randomBetween(420, 1300);
        engine.tone({
          frequency,
          endFrequency: frequency * 2.3,
          at,
          attack: 0.003,
          decay: randomBetween(0.03, 0.06),
          gain: randomBetween(0.004, 0.011),
          output: engine.pan(scene.output, randomBetween(-0.9, 0.9), 3000),
        });
      });
      // Sonar every nine seconds.
      occasionalSound(
        scene,
        (at) =>
          engine.tone({
            frequency: 820,
            endFrequency: 760,
            at,
            attack: 0.004,
            decay: 0.6,
            gain: 0.03,
            output: engine.pan(engine.echo, randomBetween(-0.3, 0.3)),
          }),
        9000,
        9000,
      );
      occasionalSound(
        scene,
        (at) =>
          bubbleCluster(scene, at, {
            bubbles: 2 + Math.floor(Math.random() * 4),
            low: 260,
            high: 480,
            spacing: [0.07, 0.12],
            gain: 0.014,
          }),
        4000,
        9000,
      );
      occasionalSound(
        scene,
        (at) => whalePhrase(engine, at, engine.pan(far, randomBetween(-0.7, 0.7), 30000)),
        22000,
        42000,
      );
      occasionalSound(
        scene,
        (at) => creak(engine, at, engine.pan(scene.output, randomBetween(-0.5, 0.5))),
        30000,
        60000,
      );
      occasionalSound(
        scene,
        (at) => clicks(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        40000,
        80000,
      );
      occasionalSound(scene, (at) => deepRumble(engine, at, scene.output), 45000, 90000);
    },
  },
  {
    // Shallow and bright. Shrimp crackle everywhere.
    name: 'reef-shelf',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 1.6, 0.5, 0.4);
      // The surface swell, warm water moving, a faint hiss of light.
      const swell = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 300,
        q: 0.7,
        gain: 0.04,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, swell.gain.gain, 0.02, 0.06, 2500, 5000, 1.8);
      wander(scene, swell.filter.frequency, 200, 420, 3000, 7000, 2);
      const water = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 700,
        q: 0.7,
        gain: 0.02,
        noise: 'pink',
      });
      wander(scene, water.filter.frequency, 400, 1100, 2000, 5000, 1.2);
      wander(scene, water.gain.gain, 0.008, 0.03, 1500, 4000, 0.9);
      wander(scene, water.panner.pan, -0.7, 0.7, 4000, 9000, 2.5);
      const light = noiseLayer(scene, {
        filter: 'highpass',
        frequency: 6000,
        q: 1,
        gain: 0.003,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, light.gain.gain, 0.001, 0.005, 2000, 6000, 1.5);
      // Snapping shrimp: tiny clicks across the whole field.
      grains(scene, [9, 45], (at) =>
        engine.burst({
          at,
          attack: 0.001,
          decay: randomBetween(0.002, 0.006),
          gain: randomBetween(0.006, 0.02),
          filter: 'bandpass',
          frequency: randomBetween(3000, 7500),
          q: 2,
          output: engine.pan(scene.output, randomBetween(-0.95, 0.95), 1200),
        }),
      );
      occasionalSound(
        scene,
        (at) => parrotfish(engine, at, engine.pan(scene.output, randomBetween(-0.8, 0.8))),
        15000,
        30000,
      );
      occasionalSound(
        scene,
        (at) => {
          dolphin(engine, at, engine.pan(far, randomBetween(-0.9, 0.9)));

          if (Math.random() < 0.6) {
            clicks(engine, at + randomBetween(0.5, 1.5), engine.pan(far, randomBetween(-0.9, 0.9)));
          }
        },
        30000,
        60000,
      );
      occasionalSound(
        scene,
        (at) => boatThrob(engine, at, engine.pan(far, randomBetween(-0.9, 0.9), 12000)),
        60000,
        120000,
      );
      // The swell lifting the whole bed.
      occasionalSound(
        scene,
        (at) => {
          swell.gain.gain.setTargetAtTime(0.11, at, 1.5);
          swell.gain.gain.setTargetAtTime(0.04, at + 4, 2);
        },
        12000,
        22000,
      );
    },
  },
  {
    // Four thousand metres. Pressure, and little else.
    name: 'abyss',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 5, 0.15, 0.6);
      // A very low rumble, a hydrothermal vent's hiss, a sub-bass pulse.
      const rumble = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 70,
        q: 1,
        gain: 0.05,
        noise: 'brown',
        pan: 0,
      });
      wander(scene, rumble.gain.gain, 0.03, 0.07, 3000, 8000, 2.5);
      const vent = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 350,
        q: 0.6,
        gain: 0.012,
        noise: 'pink',
        pan: 0.3,
      });
      wander(scene, vent.gain.gain, 0.006, 0.02, 2000, 6000, 1.5);
      wander(scene, vent.filter.frequency, 250, 500, 3000, 7000, 2);
      const deep = engine.context.createBiquadFilter();
      deep.type = 'lowpass';
      deep.frequency.value = 90;
      deep.connect(scene.output);
      const pulse = drone(scene, 'sine', 36, 0.04, deep);
      slowOscillator(scene, 0.045, 0.03, pulse.gain.gain);
      // Sparse bubbles, far apart, deep.
      grains(scene, [1500, 5000], (at) => {
        const frequency = randomBetween(200, 420);
        engine.tone({
          frequency,
          endFrequency: frequency * 2.2,
          at,
          attack: 0.004,
          decay: 0.08,
          gain: randomBetween(0.006, 0.012),
          output: engine.pan(far, randomBetween(-0.8, 0.8), 6000),
        });
      });
      occasionalSound(
        scene,
        (at) => bloop(engine, at, engine.pan(far, randomBetween(-0.6, 0.6), 10000)),
        35000,
        70000,
      );
      occasionalSound(scene, (at) => bluePulses(engine, at, scene.output), 50000, 100000);
      occasionalSound(
        scene,
        (at) => groan(engine, at, engine.pan(scene.output, randomBetween(-0.5, 0.5))),
        30000,
        60000,
      );
      // The vent flaring.
      occasionalSound(
        scene,
        (at) => {
          vent.gain.gain.setTargetAtTime(0.05, at, 1);
          vent.gain.gain.setTargetAtTime(0.012, at + 3, 2);
        },
        25000,
        50000,
      );
    },
  },
  {
    // Near the surface. The sea moving through a forest.
    name: 'kelp-current',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 2, 0.4, 0.45);
      // A current through kelp, faster than anywhere else; the surface overhead.
      const current = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 700,
        q: 0.6,
        gain: 0.045,
        noise: 'pink',
      });
      wander(scene, current.filter.frequency, 400, 1300, 900, 2500, 0.7);
      wander(scene, current.gain.gain, 0.02, 0.06, 800, 2200, 0.6);
      wander(scene, current.panner.pan, -0.7, 0.7, 2500, 6000, 1.8);
      const surface = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 240,
        q: 0.8,
        gain: 0.03,
        noise: 'brown',
        pan: 0,
      });
      wander(scene, surface.gain.gain, 0.015, 0.045, 2500, 6000, 1.8);
      // Fronds brushing, and air fizzing off the surface.
      grains(scene, [60, 260], (at) =>
        engine.burst({
          at,
          attack: 0.004,
          decay: randomBetween(0.02, 0.05),
          gain: randomBetween(0.006, 0.014),
          noise: 'pink',
          filter: 'bandpass',
          frequency: randomBetween(600, 1400),
          q: 1.2,
          output: engine.pan(scene.output, randomBetween(-0.9, 0.9), 1500),
        }),
      );
      grains(scene, [300, 1200], (at) => {
        const frequency = randomBetween(900, 1800);
        engine.tone({
          frequency,
          endFrequency: frequency * 2,
          at,
          attack: 0.002,
          decay: 0.03,
          gain: randomBetween(0.003, 0.008),
          output: engine.pan(scene.output, randomBetween(-0.9, 0.9), 1500),
        });
      });
      occasionalSound(
        scene,
        (at) => waveBreak(engine, at, engine.pan(far, randomBetween(-0.8, 0.8), 8000)),
        9000,
        16000,
      );
      occasionalSound(
        scene,
        (at) => gull(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        25000,
        50000,
      );
      occasionalSound(
        scene,
        (at) => seaLion(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        40000,
        80000,
      );
      occasionalSound(
        scene,
        (at) => buoyBell(engine, at, engine.pan(far, randomBetween(-0.6, 0.6))),
        30000,
        60000,
      );
      occasionalSound(
        scene,
        (at) =>
          bubbleCluster(scene, at, {
            bubbles: 3 + Math.floor(Math.random() * 4),
            low: 300,
            high: 600,
            spacing: [0.06, 0.1],
            gain: 0.012,
          }),
        8000,
        16000,
      );
    },
  },
];
