/**
 * The rainforest's four soundscapes, and the calls only it has. The
 * prototype's, verbatim (tmp/Minesweeper.html in the C repo).
 */
import { randomBetween, withJitter, type AudioEngine } from '../engine.ts';
import { chorusVoice, frog, owl } from './shared-calls.ts';
import {
  drone,
  grains,
  noiseLayer,
  occasionalSound,
  room,
  wander,
  type Soundscape,
} from './soundscape.ts';

type Call = (engine: AudioEngine, at: number, output: AudioNode) => void;

/** Six birds, each a short path of pitches. */
const BIRDS: Record<'whistle' | 'trill' | 'whoop' | 'warble' | 'whip' | 'dove', Call> = {
  whistle(engine, at, output) {
    engine.tone({
      frequency: 2600,
      endFrequency: 2100,
      at,
      attack: 0.01,
      decay: 0.18,
      gain: 0.022,
      output,
    });
    engine.tone({
      frequency: 2200,
      endFrequency: 1700,
      at: at + 0.24,
      attack: 0.01,
      decay: 0.2,
      gain: 0.018,
      output,
    });
  },
  trill(engine, at, output) {
    const base = randomBetween(1900, 2400);

    for (let note = 0; note < 6; note++) {
      engine.tone({
        frequency: withJitter(base),
        endFrequency: base * 1.2,
        at: at + note * 0.075,
        attack: 0.004,
        decay: 0.04,
        gain: 0.014,
        output,
      });
    }
  },
  whoop(engine, at, output) {
    engine.glide({
      at,
      path: [
        [700, 0],
        [1500, 0.32],
        [1100, 0.48],
      ],
      gain: 0.02,
      attack: 0.05,
      release: 0.12,
      output,
    });
  },
  warble(engine, at, output) {
    engine.glide({
      at,
      path: [
        [2300, 0],
        [2500, 0.25],
        [1900, 0.6],
      ],
      gain: 0.016,
      attack: 0.05,
      release: 0.15,
      vibrato: [13, 140],
      output,
    });
  },
  whip(engine, at, output) {
    engine.glide({
      at,
      path: [
        [900, 0],
        [3000, 0.17],
        [2400, 0.24],
      ],
      gain: 0.022,
      attack: 0.03,
      release: 0.05,
      output,
    });
  },
  dove(engine, at, output) {
    for (let coo = 0; coo < 3; coo++) {
      engine.tone({
        frequency: withJitter(330),
        at: at + coo * 0.22,
        attack: 0.05,
        decay: 0.17,
        gain: 0.028,
        output,
      });
    }
  },
};

const BIRD_NAMES = Object.keys(BIRDS) as (keyof typeof BIRDS)[];

/**
 * The dawn chorus: one bird, and up to three more answering, each a different
 * species from somewhere in the room.
 */
function dawnChorus(engine: AudioEngine, at: number, far: AudioNode): void {
  const used = new Set<keyof typeof BIRDS>();
  const pick = () => {
    let name: keyof typeof BIRDS;

    do {
      name = BIRD_NAMES[Math.floor(Math.random() * BIRD_NAMES.length)];
    } while (used.has(name) && used.size < BIRD_NAMES.length);

    used.add(name);
    return name;
  };

  BIRDS[pick()](engine, at, engine.pan(far, randomBetween(-0.9, 0.9)));
  const roll = Math.random();

  if (roll < 0.55) {
    BIRDS[pick()](engine, at + randomBetween(0.4, 1.2), engine.pan(far, randomBetween(-0.9, 0.9)));
  }

  if (roll < 0.25) {
    BIRDS[pick()](engine, at + randomBetween(1.1, 2.0), engine.pan(far, randomBetween(-0.9, 0.9)));
  }

  if (roll < 0.08) {
    BIRDS[pick()](engine, at + randomBetween(1.8, 2.6), engine.pan(far, randomBetween(-0.9, 0.9)));
  }
}

/** Thunder, closer than anywhere else. */
function thunder(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.burst({
    at,
    attack: 1.2,
    decay: 3,
    gain: 0.06,
    noise: 'brown',
    filter: 'lowpass',
    frequency: 120,
    q: 0.7,
    output,
  });
  engine.burst({
    at: at + 0.3,
    attack: 0.4,
    decay: 1.2,
    gain: 0.02,
    noise: 'brown',
    filter: 'lowpass',
    frequency: 260,
    output,
  });
}

/** Howler monkeys far off: a roar of brown noise, wavering. */
function howler(engine: AudioEngine, at: number, output: AudioNode): void {
  const { context } = engine;
  const source = engine.noise('brown');
  const throat = context.createBiquadFilter();
  throat.type = 'bandpass';
  throat.frequency.value = 190;
  throat.Q.value = 2.2;
  const waver = context.createGain();
  waver.gain.value = 0.5;
  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.05, at + 1.2);
  level.gain.setValueAtTime(0.05, at + 2.2);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 3.6);
  source.connect(throat).connect(waver).connect(level).connect(output);
  const tremolo = context.createOscillator();
  tremolo.frequency.value = 6.5;
  const tremoloDepth = context.createGain();
  tremoloDepth.gain.value = 0.5;
  tremolo.connect(tremoloDepth).connect(waver.gain);
  source.start(at);
  tremolo.start(at);
  source.stop(at + 3.8);
  tremolo.stop(at + 3.8);
}

/** A woodpecker: nine to fourteen knocks. */
function woodpecker(engine: AudioEngine, at: number, output: AudioNode): void {
  const knocks = 9 + Math.floor(Math.random() * 6);

  for (let knock = 0; knock < knocks; knock++) {
    engine.burst({
      at: at + knock * 0.055,
      attack: 0.001,
      decay: 0.018,
      gain: 0.035,
      filter: 'bandpass',
      frequency: 1250,
      q: 4,
      output,
    });
  }
}

/** A bird taking off close by. */
function flutter(engine: AudioEngine, at: number, output: AudioNode): void {
  for (let beat = 0; beat < 9; beat++) {
    engine.burst({
      at: at + beat * 0.045,
      attack: 0.004,
      decay: 0.03,
      gain: 0.03,
      noise: 'pink',
      filter: 'bandpass',
      frequency: 900,
      q: 1,
      output,
    });
  }
}

/** A drop of water, between `low` and `high` hertz, rising as it lands. */
function drip(
  engine: AudioEngine,
  at: number,
  output: AudioNode,
  low: number,
  high: number,
  gain: number,
): void {
  const frequency = randomBetween(low, high);
  engine.tone({
    frequency,
    endFrequency: frequency * 1.5,
    at,
    attack: 0.002,
    decay: 0.09,
    gain,
    output,
  });
}

/** A big drop into a puddle. */
function puddle(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.tone({
    frequency: randomBetween(600, 800),
    endFrequency: 300,
    at,
    attack: 0.003,
    decay: 0.06,
    gain: 0.022,
    output,
  });
}

/** Water pouring off a leaf. */
function leafPour(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.burst({
    at,
    attack: 0.08,
    decay: 1.1,
    gain: 0.03,
    noise: 'pink',
    filter: 'bandpass',
    frequency: 1100,
    endFrequency: 600,
    q: 0.9,
    output,
  });
}

/** A bullfrog: two or three deep croaks. */
function bullfrog(engine: AudioEngine, at: number, output: AudioNode): void {
  const croaks = 2 + Math.floor(Math.random() * 2);

  for (let croak = 0; croak < croaks; croak++) {
    engine.glide({
      at: at + croak * 0.42,
      wave: 'triangle',
      path: [
        [115, 0],
        [92, 0.26],
      ],
      gain: 0.03,
      attack: 0.03,
      release: 0.1,
      lowpassFrequency: 400,
      output,
    });
  }
}

/** A potoo far off: one falling cry. */
function potoo(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.glide({
    at,
    path: [
      [880, 0],
      [760, 0.5],
      [520, 1.3],
    ],
    gain: 0.02,
    attack: 0.12,
    release: 0.4,
    output,
  });
}

/** A twig underfoot. */
function twig(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.burst({
    at,
    attack: 0.001,
    decay: 0.02,
    gain: 0.06,
    filter: 'bandpass',
    frequency: 1600,
    q: 6,
    output,
  });
  engine.burst({
    at: at + 0.01,
    attack: 0.002,
    decay: 0.05,
    gain: 0.03,
    noise: 'brown',
    filter: 'lowpass',
    frequency: 300,
    output,
  });
}

/** Something passing on wings: a buzz crossing from left to right. */
function insectPass(engine: AudioEngine, at: number, output: AudioNode): void {
  const { context } = engine;
  const panner = context.createStereoPanner();
  panner.pan.setValueAtTime(-1, at);
  panner.pan.linearRampToValueAtTime(1, at + 1.6);
  panner.connect(output);
  const oscillator = context.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(170, at);
  oscillator.frequency.linearRampToValueAtTime(140, at + 1.6);
  const buzz = context.createGain();
  buzz.gain.value = 0.5;
  const wings = context.createOscillator();
  wings.frequency.value = 24;
  const wingDepth = context.createGain();
  wingDepth.gain.value = 0.5;
  wings.connect(wingDepth).connect(buzz.gain);
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 900;
  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.012, at + 0.6);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 1.7);
  oscillator.connect(buzz).connect(lowpass).connect(level).connect(panner);
  oscillator.start(at);
  wings.start(at);
  oscillator.stop(at + 1.8);
  wings.stop(at + 1.8);
  setTimeout(() => panner.disconnect(), 4000);
}

/** A bellbird: one sharp, metallic note; sometimes a second. */
function bellbird(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.tone({ frequency: 2900, at, attack: 0.001, decay: 0.4, gain: 0.045, output });
  engine.tone({ frequency: 2900 * 2.41, at, attack: 0.001, decay: 0.16, gain: 0.014, output });
  engine.burst({
    at,
    attack: 0.001,
    decay: 0.01,
    gain: 0.03,
    filter: 'highpass',
    frequency: 4000,
    output,
  });

  if (Math.random() < 0.4) {
    bellbirdAgain(engine, at + randomBetween(0.5, 0.9), output);
  }
}

/** The bellbird's second note, a little softer. */
function bellbirdAgain(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.tone({ frequency: 2900, at, attack: 0.001, decay: 0.4, gain: 0.04, output });
  engine.tone({ frequency: 2900 * 2.41, at, attack: 0.001, decay: 0.16, gain: 0.012, output });
}

/** A quetzal's two falling notes. */
function quetzal(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.glide({
    at,
    wave: 'triangle',
    path: [
      [700, 0],
      [640, 0.45],
    ],
    gain: 0.022,
    attack: 0.06,
    release: 0.2,
    lowpassFrequency: 1500,
    output,
  });
  engine.glide({
    at: at + 0.6,
    wave: 'triangle',
    path: [
      [760, 0],
      [700, 0.5],
    ],
    gain: 0.02,
    attack: 0.06,
    release: 0.2,
    lowpassFrequency: 1500,
    output,
  });
}

/** Slow wing beats. */
function wingbeats(engine: AudioEngine, at: number, output: AudioNode): void {
  for (let beat = 0; beat < 4; beat++) {
    engine.burst({
      at: at + beat * 0.24,
      attack: 0.02,
      decay: 0.09,
      gain: 0.035,
      noise: 'pink',
      filter: 'lowpass',
      frequency: 320,
      output,
    });
  }
}

/** A hummingbird passing close, right to left. */
function hummingbird(engine: AudioEngine, at: number, output: AudioNode): void {
  const { context } = engine;
  const panner = context.createStereoPanner();
  panner.pan.setValueAtTime(0.9, at);
  panner.pan.linearRampToValueAtTime(-0.9, at + 1.1);
  panner.connect(output);
  const oscillator = context.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.value = 62;
  const buzz = context.createGain();
  buzz.gain.value = 0.5;
  const wings = context.createOscillator();
  wings.frequency.value = 55;
  const wingDepth = context.createGain();
  wingDepth.gain.value = 0.5;
  wings.connect(wingDepth).connect(buzz.gain);
  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1400;
  bandpass.Q.value = 1.5;
  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.01, at + 0.35);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
  oscillator.connect(buzz).connect(bandpass).connect(level).connect(panner);
  oscillator.start(at);
  wings.start(at);
  oscillator.stop(at + 1.3);
  wings.stop(at + 1.3);
  setTimeout(() => panner.disconnect(), 4000);
}

export const RAINFOREST_SOUNDSCAPES: readonly Soundscape[] = [
  {
    // The forest waking. Birds carry it.
    name: 'first-light',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 2.2, 0.55, 0.5);
      // Mist hushing on both sides, a river below, the forest breathing low.
      const mistLeft = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 900,
        q: 0.6,
        gain: 0.03,
        noise: 'pink',
        pan: -0.6,
      });
      wander(scene, mistLeft.gain.gain, 0.015, 0.04, 2500, 6000, 1.5);
      wander(scene, mistLeft.filter.frequency, 600, 1300, 3000, 7000, 2);
      const mistRight = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 1000,
        q: 0.6,
        gain: 0.025,
        noise: 'pink',
        pan: 0.6,
      });
      wander(scene, mistRight.gain.gain, 0.012, 0.035, 2500, 6000, 1.5);
      wander(scene, mistRight.filter.frequency, 600, 1300, 3000, 7000, 2);
      const river = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 180,
        q: 1,
        gain: 0.022,
        noise: 'brown',
        pan: 0,
      });
      wander(scene, river.gain.gain, 0.012, 0.03, 3000, 7000, 2);
      // Dew dripping everywhere, some of it close, some far back.
      grains(scene, [420, 1700], (at) =>
        drip(
          engine,
          at,
          Math.random() < 0.5
            ? engine.pan(far, randomBetween(-0.9, 0.9), 3000)
            : engine.pan(scene.output, randomBetween(-0.7, 0.7), 3000),
          1100,
          2300,
          randomBetween(0.006, 0.016),
        ),
      );
      occasionalSound(scene, (at) => dawnChorus(engine, at, far), 3500, 8000);
      occasionalSound(
        scene,
        (at) => howler(engine, at, engine.pan(far, randomBetween(-0.8, 0.8), 8000)),
        40000,
        80000,
      );
      occasionalSound(
        scene,
        (at) => woodpecker(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        25000,
        50000,
      );
      occasionalSound(
        scene,
        (at) => flutter(engine, at, engine.pan(scene.output, randomBetween(-0.6, 0.6))),
        30000,
        60000,
      );
    },
  },
  {
    // Rain on the canopy. Everything else shelters.
    name: 'downpour',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 1.4, 0.35, 0.35);
      // The rain's body, its low thickness, and the river running high.
      const rain = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 1800,
        q: 0.4,
        gain: 0.05,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, rain.gain.gain, 0.03, 0.075, 3000, 9000, 2.5);
      wander(scene, rain.filter.frequency, 1400, 2400, 4000, 9000, 3);
      const body = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 400,
        q: 0.7,
        gain: 0.03,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, body.gain.gain, 0.02, 0.045, 3000, 8000, 2);
      const river = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 160,
        q: 1,
        gain: 0.03,
        noise: 'brown',
        pan: -0.2,
      });
      wander(scene, river.gain.gain, 0.02, 0.04, 3000, 7000, 2);
      // Drops on broad leaves, dense and everywhere; big drops into puddles now and then.
      const density = { value: 1 };
      wander(
        scene,
        { setTargetAtTime: (value: number) => (density.value = value) },
        0.6,
        1.5,
        2000,
        6000,
      );
      grains(scene, [14, 70], (at) => {
        if (Math.random() > density.value * 0.7) {
          return;
        }

        engine.burst({
          at,
          attack: 0.001,
          decay: randomBetween(0.004, 0.012),
          gain: randomBetween(0.02, 0.05),
          filter: 'bandpass',
          frequency: randomBetween(2500, 5200),
          q: 3,
          output: engine.pan(scene.output, randomBetween(-0.95, 0.95), 1500),
        });
      });
      grains(scene, [300, 1500], (at) =>
        puddle(engine, at, engine.pan(scene.output, randomBetween(-0.8, 0.8), 2000)),
      );
      occasionalSound(
        scene,
        (at) => {
          thunder(engine, at, scene.output);
          engine.burst({
            at: at + randomBetween(0, 0.2),
            attack: 0.002,
            decay: 0.08,
            gain: 0.12,
            filter: 'highpass',
            frequency: 1800,
            output: scene.output,
          });
        },
        25000,
        60000,
      );
      // A surge of rain.
      occasionalSound(
        scene,
        (at) => {
          rain.gain.gain.setTargetAtTime(0.12, at, 0.8);
          rain.gain.gain.setTargetAtTime(0.05, at + 2.5, 1.5);

          for (let drop = 0; drop < 90; drop++) {
            engine.burst({
              at: at + 0.3 + drop * randomBetween(0.012, 0.03),
              attack: 0.001,
              decay: 0.008,
              gain: 0.04,
              filter: 'bandpass',
              frequency: randomBetween(2500, 5200),
              q: 3,
              output: engine.pan(scene.output, randomBetween(-0.95, 0.95), 5000),
            });
          }
        },
        20000,
        40000,
      );
      occasionalSound(
        scene,
        (at) => leafPour(engine, at, engine.pan(scene.output, randomBetween(-0.7, 0.7))),
        15000,
        35000,
      );
      occasionalSound(
        scene,
        (at) => frog(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        30000,
        60000,
      );
      // One bird calling from shelter.
      occasionalSound(
        scene,
        (at) => BIRDS.whistle(engine, at, engine.pan(far, randomBetween(-0.6, 0.6))),
        40000,
        80000,
      );
    },
  },
  {
    // Understory after dark. Insects own it.
    name: 'night-floor',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 2.4, 0.3, 0.5);
      // A humid drone, a very low wind.
      const humid = engine.context.createBiquadFilter();
      humid.type = 'lowpass';
      humid.frequency.value = 200;
      humid.connect(scene.output);
      drone(scene, 'sine', 55, 0.03, humid);
      drone(scene, 'triangle', 110, 0.012, humid, 5);
      const wind = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 250,
        q: 0.6,
        gain: 0.012,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, wind.gain.gain, 0.006, 0.02, 2500, 6000, 1.5);
      // A katydid, a cricket and a tree frog, each in its own place, pausing on its own.
      chorusVoice(scene, {
        periodSeconds: 1.15,
        pulses: 4,
        gapSeconds: 0.07,
        frequency: 3800,
        q: 10,
        gain: 0.012,
        position: -0.6,
      });
      chorusVoice(scene, {
        periodSeconds: 0.8,
        pulses: 3,
        gapSeconds: 0.058,
        frequency: 4400,
        q: 12,
        gain: 0.007,
        position: -0.2,
      });
      const peeper = engine.pan(scene.output, 0.6, 1e9);
      let rest = 0;
      grains(scene, [900, 900], (at) => {
        if (rest > 0) {
          rest--;
          return;
        }

        if (Math.random() < 0.06) {
          rest = 2 + Math.floor(Math.random() * 4);
        }

        engine.tone({
          frequency: withJitter(2400),
          endFrequency: 2900,
          at,
          attack: 0.004,
          decay: 0.07,
          gain: 0.014,
          output: peeper,
        });
      });
      occasionalSound(
        scene,
        (at) => bullfrog(engine, at, engine.pan(scene.output, randomBetween(-0.8, 0.8))),
        10000,
        20000,
      );
      occasionalSound(
        scene,
        (at) => potoo(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        40000,
        80000,
      );
      occasionalSound(
        scene,
        (at) => twig(engine, at, engine.pan(scene.output, randomBetween(-0.8, 0.8))),
        30000,
        60000,
      );
      occasionalSound(scene, (at) => insectPass(engine, at, scene.output), 35000, 70000);
      occasionalSound(
        scene,
        (at) => owl(engine, at, engine.pan(far, randomBetween(-0.8, 0.8))),
        50000,
        90000,
      );
    },
  },
  {
    // High, wet, wide open. Wind and bells.
    name: 'cloud-forest',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 3.2, 0.55, 0.6);
      // Wind through the canopy, wide and slow; a higher band; a mist hush up top.
      const low = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 500,
        q: 0.4,
        gain: 0.05,
        noise: 'pink',
        pan: -0.5,
      });
      wander(scene, low.filter.frequency, 320, 900, 2500, 6000, 1.8);
      wander(scene, low.gain.gain, 0.02, 0.07, 1500, 4500, 1.2);
      wander(scene, low.panner.pan, -0.8, 0, 5000, 10000, 3);
      const high = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 1400,
        q: 0.5,
        gain: 0.02,
        noise: 'pink',
        pan: 0.5,
      });
      wander(scene, high.filter.frequency, 900, 2000, 2500, 6000, 1.8);
      wander(scene, high.gain.gain, 0.008, 0.03, 1500, 4500, 1.2);
      wander(scene, high.panner.pan, 0, 0.8, 5000, 10000, 3);
      const mist = noiseLayer(scene, {
        filter: 'highpass',
        frequency: 4000,
        q: 1,
        gain: 0.005,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, mist.gain.gain, 0.002, 0.008, 2000, 5000, 1.5);
      // Bromeliads dripping high up in the room, leaf tips closer, and a slow wash of water.
      grains(scene, [700, 2600], (at) =>
        drip(
          engine,
          at,
          engine.pan(far, randomBetween(-0.9, 0.9), 4000),
          800,
          1700,
          randomBetween(0.01, 0.022),
        ),
      );
      grains(scene, [900, 3000], (at) =>
        drip(
          engine,
          at,
          engine.pan(scene.output, randomBetween(-0.6, 0.6), 3000),
          500,
          900,
          randomBetween(0.006, 0.012),
        ),
      );
      const wash = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 600,
        q: 0.7,
        gain: 0.015,
        noise: 'pink',
        pan: 0.2,
      });
      wander(scene, wash.gain.gain, 0.005, 0.03, 2000, 6000, 1.5);
      occasionalSound(
        scene,
        (at) => bellbird(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        20000,
        45000,
      );
      occasionalSound(
        scene,
        (at) => quetzal(engine, at, engine.pan(far, randomBetween(-0.8, 0.8))),
        40000,
        80000,
      );
      occasionalSound(
        scene,
        (at) => wingbeats(engine, at, engine.pan(scene.output, randomBetween(-0.7, 0.7))),
        45000,
        90000,
      );
      // A gust.
      occasionalSound(
        scene,
        (at) => {
          low.gain.gain.setTargetAtTime(0.13, at, 1.2);
          high.gain.gain.setTargetAtTime(0.05, at, 1.2);
          low.gain.gain.setTargetAtTime(0.045, at + 3, 1.8);
          high.gain.gain.setTargetAtTime(0.02, at + 3, 1.8);
        },
        20000,
        40000,
      );
      occasionalSound(scene, (at) => hummingbird(engine, at, scene.output), 30000, 60000);
    },
  },
];
