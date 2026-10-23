/**
 * The night sky's four soundscapes, and the calls only it has. The
 * prototype's, verbatim (tmp/Minesweeper.html in the C repo).
 */
import { randomBetween, withJitter, type AudioEngine } from '../audio-engine.ts';
import {
  drone,
  grains,
  noiseLayer,
  occasionalSound,
  room,
  wander,
  type Soundscape,
} from '../soundscape.ts';
import { chorusVoice, frog, owl, rockTick } from './shared-calls.ts';

/** A star twinkling: one of C7, E7, G7, from somewhere in the room `far`. */
function twinkle(engine: AudioEngine, at: number, far: AudioNode, gain: number): void {
  engine.tone({
    frequency: [2093, 2637, 3136][Math.floor(Math.random() * 3)],
    at,
    attack: 0.01,
    decay: 0.4,
    gain,
    output: engine.pan(far, randomBetween(-0.8, 0.8)),
  });
}

/** A nightjar's churr: thirty-six fast clicks. */
function nightjar(engine: AudioEngine, at: number, output: AudioNode): void {
  for (let click = 0; click < 36; click++) {
    engine.burst({
      at: at + click * 0.042,
      attack: 0.002,
      decay: 0.014,
      gain: 0.012,
      filter: 'bandpass',
      frequency: 1100,
      q: 4,
      output,
    });
  }
}

/** A meteor's hiss: a falling whistle in a breath of noise. */
function meteorHiss(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.tone({
    frequency: 3200,
    endFrequency: 700,
    at,
    attack: 0.05,
    decay: 0.6,
    gain: 0.012,
    output,
  });
  engine.burst({
    at,
    attack: 0.05,
    decay: 0.5,
    gain: 0.012,
    filter: 'highpass',
    frequency: 5000,
    output,
  });
}

/** A nightingale: five to nine notes from its five, often repeating one, then a falling slur. */
function nightingale(engine: AudioEngine, at: number, output: AudioNode): void {
  const notes = [1800, 2100, 2400, 2800, 3200];
  const count = 5 + Math.floor(Math.random() * 5);
  let next = at;
  let previous = notes[Math.floor(Math.random() * notes.length)];

  for (let note = 0; note < count; note++) {
    const frequency =
      Math.random() < 0.45 ? previous : notes[Math.floor(Math.random() * notes.length)];
    engine.tone({
      frequency: withJitter(frequency),
      at: next,
      attack: 0.005,
      decay: 0.08,
      gain: 0.02,
      output,
    });
    previous = frequency;
    // The prototype meant a longer gap after a new note, but its test always
    // matched: every gap is 0.11 s.
    next += 0.11;
  }

  engine.glide({
    at: next + 0.05,
    path: [
      [2400, 0],
      [1600, 0.3],
    ],
    gain: 0.016,
    attack: 0.02,
    release: 0.1,
    output,
  });
}

/** Coyotes: three to five yips, then a howl. */
function coyote(engine: AudioEngine, at: number, output: AudioNode): void {
  const yips = 3 + Math.floor(Math.random() * 3);

  for (let yip = 0; yip < yips; yip++) {
    engine.glide({
      at: at + yip * 0.26,
      path: [
        [900, 0],
        [1400, 0.08],
        [1000, 0.16],
      ],
      gain: 0.018,
      attack: 0.01,
      release: 0.05,
      output,
    });
  }

  engine.glide({
    at: at + yips * 0.26 + 0.2,
    path: [
      [700, 0],
      [1100, 0.5],
      [900, 1.6],
      [600, 2.3],
    ],
    gain: 0.022,
    attack: 0.2,
    release: 0.5,
    vibrato: [6, 15],
    output,
  });
}

/** A train horn's chord, through miles of night air. */
function trainHorn(engine: AudioEngine, at: number, output: AudioNode): void {
  [311, 370, 466].forEach((frequency, index) => {
    engine.glide({
      at,
      path: [
        [frequency, 0],
        [frequency * 1.001, 3.6],
      ],
      gain: [0.014, 0.012, 0.006][index],
      attack: 1.2,
      release: 1.5,
      lowpassFrequency: 1200,
      output,
    });
    engine.glide({
      at,
      wave: 'triangle',
      path: [
        [frequency, 0],
        [frequency * 0.999, 3.6],
      ],
      gain: [0.006, 0.005, 0.003][index],
      attack: 1.2,
      release: 1.5,
      lowpassFrequency: 900,
      output,
    });
  });
}

/** The telescope's servo slewing. */
function servo(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.burst({
    at,
    attack: 0.1,
    decay: 2.1,
    gain: 0.012,
    noise: 'pink',
    filter: 'bandpass',
    frequency: 400,
    endFrequency: 1600,
    q: 3,
    output,
  });
  engine.glide({
    at,
    path: [
      [220, 0],
      [480, 1.1],
      [230, 2.2],
    ],
    gain: 0.006,
    attack: 0.1,
    release: 0.3,
    output,
  });
}

/** A relay's two clicks. */
function relay(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.burst({
    at,
    attack: 0.001,
    decay: 0.01,
    gain: 0.04,
    filter: 'bandpass',
    frequency: 2500,
    q: 4,
    output,
  });
  engine.burst({
    at: at + 0.07,
    attack: 0.001,
    decay: 0.01,
    gain: 0.03,
    filter: 'bandpass',
    frequency: 2100,
    q: 4,
    output,
  });
}

/** A pulsar on the speaker: five to eight ticks, 0.72 s apart. */
function pulsar(engine: AudioEngine, at: number, output: AudioNode): void {
  const ticks = 5 + Math.floor(Math.random() * 4);

  for (let tick = 0; tick < ticks; tick++) {
    engine.tone({
      frequency: 1200,
      at: at + tick * 0.72,
      attack: 0.002,
      decay: 0.03,
      gain: 0.012,
      output,
    });
  }
}

export const NIGHT_SKY_SOUNDSCAPES: readonly Soundscape[] = [
  {
    // Still, cold enough to hear far.
    name: 'clear-night',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 2.8, 0.45, 0.5);
      // A quiet pad; three high partials breathing at their own pace; night air.
      const pad = engine.context.createBiquadFilter();
      pad.type = 'lowpass';
      pad.frequency.value = 500;
      pad.connect(scene.output);
      drone(scene, 'sine', 130.8, 0.02, pad);
      drone(scene, 'sine', 196, 0.012, pad, -5);
      [1046.5, 1568, 2093].forEach((frequency, index) => {
        const partial = drone(
          scene,
          'sine',
          frequency,
          0.004,
          engine.pan(scene.output, [-0.5, 0.5, 0][index], 1e9),
        );
        wander(scene, partial.gain.gain, 0.0005, 0.006, 3000, 9000, 2.5);
      });
      const air = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 320,
        q: 0.5,
        gain: 0.014,
        noise: 'pink',
      });
      wander(scene, air.filter.frequency, 220, 520, 3000, 7000, 2);
      wander(scene, air.gain.gain, 0.006, 0.02, 2000, 6000, 1.5);
      wander(scene, air.panner.pan, -0.5, 0.5, 5000, 11000, 3);
      // Two crickets, each with its own pitch, pace and place, pausing now and then.
      (
        [
          [4300, 0.86, -0.6],
          [4650, 1.07, 0.55],
        ] as const
      ).forEach(([frequency, periodSeconds, position]) => {
        const output = engine.pan(scene.output, position, 1e9);
        let rest = 0;
        grains(scene, [periodSeconds * 1000, periodSeconds * 1000], (at) => {
          if (rest > 0) {
            rest--;
            return;
          }

          if (Math.random() < 0.04) {
            rest = 3 + Math.floor(Math.random() * 5);
          }

          for (let chirp = 0; chirp < 3; chirp++) {
            engine.tone({
              frequency: withJitter(frequency),
              at: at + chirp * 0.058,
              attack: 0.003,
              decay: 0.02,
              gain: 0.0065,
              output,
            });
          }
        });
      });
      occasionalSound(scene, (at) => twinkle(engine, at, far, 0.015), 3000, 7000);
      occasionalSound(
        scene,
        (at) => owl(engine, at, engine.pan(far, randomBetween(-0.8, 0.8))),
        25000,
        50000,
      );
      occasionalSound(
        scene,
        (at) => nightjar(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        40000,
        80000,
      );
      occasionalSound(
        scene,
        (at) => meteorHiss(engine, at, engine.pan(far, randomBetween(-0.6, 0.6))),
        30000,
        60000,
      );
    },
  },
  {
    // Warm, humming, grass to the horizon.
    name: 'summer-meadow',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 2.2, 0.45, 0.45);
      // A warm breeze through fluttering grass, the pad lower and warmer.
      const pad = engine.context.createBiquadFilter();
      pad.type = 'lowpass';
      pad.frequency.value = 420;
      pad.connect(scene.output);
      drone(scene, 'sine', 98, 0.024, pad);
      drone(scene, 'sine', 147, 0.012, pad, 6);
      const grass = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 1500,
        q: 0.7,
        gain: 0.012,
        noise: 'pink',
      });
      wander(scene, grass.gain.gain, 0.004, 0.022, 150, 450, 0.08);
      wander(scene, grass.filter.frequency, 1100, 2200, 2000, 5000, 1.5);
      wander(scene, grass.panner.pan, -0.6, 0.6, 4000, 9000, 2.5);
      // Two crickets, a katydid and a cicada's tail, each in its own place.
      chorusVoice(scene, {
        periodSeconds: 0.82,
        pulses: 3,
        gapSeconds: 0.058,
        frequency: 4400,
        q: 12,
        gain: 0.007,
        position: -0.6,
      });
      chorusVoice(scene, {
        periodSeconds: 1.0,
        pulses: 3,
        gapSeconds: 0.06,
        frequency: 4700,
        q: 12,
        gain: 0.006,
        position: 0.6,
      });
      chorusVoice(scene, {
        periodSeconds: 1.3,
        pulses: 5,
        gapSeconds: 0.065,
        frequency: 3700,
        q: 10,
        gain: 0.01,
        position: -0.15,
      });
      const cicada = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 5200,
        q: 8,
        gain: 0.003,
        noise: 'pink',
        pan: 0.3,
      });
      wander(scene, cicada.gain.gain, 0.001, 0.005, 2000, 6000, 1.5);
      wander(scene, cicada.filter.frequency, 4800, 5600, 3000, 8000, 2);
      occasionalSound(
        scene,
        (at) => nightingale(engine, at, engine.pan(far, randomBetween(-0.8, 0.8))),
        14000,
        28000,
      );
      occasionalSound(
        scene,
        (at) => frog(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        15000,
        30000,
      );
      // A gust through the grass.
      occasionalSound(
        scene,
        (at) => {
          grass.gain.gain.setTargetAtTime(0.06, at, 0.8);
          grass.gain.gain.setTargetAtTime(0.012, at + 2.5, 1.5);
        },
        20000,
        40000,
      );
      occasionalSound(scene, (at) => twinkle(engine, at, far, 0.012), 5000, 11000);
    },
  },
  {
    // Vast and cold. Sound carries for miles.
    name: 'high-desert',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 4, 0.5, 0.55);
      // Thin, dry wind with a hiss on top; a low, cold drone.
      const wind = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 1800,
        q: 0.6,
        gain: 0.02,
        noise: 'pink',
      });
      wander(scene, wind.filter.frequency, 1100, 2600, 2000, 5000, 1.5);
      wander(scene, wind.gain.gain, 0.008, 0.03, 1500, 4000, 1);
      wander(scene, wind.panner.pan, -0.7, 0.7, 4000, 9000, 2.5);
      const hiss = noiseLayer(scene, {
        filter: 'highpass',
        frequency: 5000,
        q: 1,
        gain: 0.004,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, hiss.gain.gain, 0.002, 0.006, 2000, 5000, 1.5);
      const cold = engine.context.createBiquadFilter();
      cold.type = 'lowpass';
      cold.frequency.value = 200;
      cold.connect(scene.output);
      drone(scene, 'sine', 52, 0.022, cold);
      // Rocks ticking as they cool, across the field.
      grains(scene, [2500, 9000], (at) =>
        rockTick(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
      );
      occasionalSound(
        scene,
        (at) => coyote(engine, at, engine.pan(far, randomBetween(-0.9, 0.9), 10000)),
        40000,
        80000,
      );
      // A great horned owl, low and slow.
      occasionalSound(
        scene,
        (at) => {
          [310, 280].forEach((frequency, index) =>
            engine.tone({
              frequency,
              at: at + index * 0.55,
              attack: 0.1,
              decay: 0.4,
              gain: 0.03,
              output: engine.pan(far, randomBetween(-0.6, 0.6)),
            }),
          );
        },
        30000,
        60000,
      );
      occasionalSound(
        scene,
        (at) => trainHorn(engine, at, engine.pan(far, randomBetween(-0.8, 0.8), 12000)),
        90000,
        160000,
      );
      occasionalSound(
        scene,
        (at) => meteorHiss(engine, at, engine.pan(far, randomBetween(-0.6, 0.6))),
        30000,
        60000,
      );
    },
  },
  {
    // Inside the dome. Instruments, and the sky through the slit.
    name: 'observatory',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 1.3, 0.55, 0.3);
      // The dome's hum in three harmonics, the receiver's hiss, wind through the slit.
      const hum = engine.context.createBiquadFilter();
      hum.type = 'lowpass';
      hum.frequency.value = 400;
      hum.connect(scene.output);
      drone(scene, 'sine', 60, 0.02, hum);
      const second = drone(scene, 'sine', 120, 0.009, hum);
      drone(scene, 'sine', 180, 0.004, hum);
      wander(scene, second.gain.gain, 0.004, 0.012, 2000, 6000, 1.5);
      const receiver = noiseLayer(scene, {
        filter: 'highpass',
        frequency: 6000,
        q: 1,
        gain: 0.004,
        noise: 'white',
        pan: 0,
      });
      wander(scene, receiver.gain.gain, 0.002, 0.006, 1500, 4000, 1);
      const slit = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 600,
        q: 1.5,
        gain: 0.012,
        noise: 'pink',
        pan: 0.6,
      });
      wander(scene, slit.filter.frequency, 400, 900, 2000, 5000, 1.5);
      wander(scene, slit.gain.gain, 0.005, 0.018, 1500, 4000, 1);
      // Relays and small ticks from the instruments, sparse and dry.
      grains(scene, [1800, 7000], (at) =>
        Math.random() < 0.5
          ? relay(engine, at, engine.pan(scene.output, randomBetween(-0.8, 0.8)))
          : engine.burst({
              at,
              attack: 0.001,
              decay: 0.012,
              gain: 0.02,
              filter: 'bandpass',
              frequency: randomBetween(1500, 3500),
              q: 5,
              output: engine.pan(scene.output, randomBetween(-0.8, 0.8)),
            }),
      );
      occasionalSound(
        scene,
        (at) => servo(engine, at, engine.pan(scene.output, randomBetween(-0.5, 0.5), 6000)),
        30000,
        60000,
      );
      occasionalSound(
        scene,
        (at) => pulsar(engine, at, engine.pan(scene.output, 0.5, 10000)),
        40000,
        80000,
      );
      occasionalSound(scene, (at) => owl(engine, at, engine.pan(far, 0.7)), 50000, 100000);
      occasionalSound(scene, (at) => twinkle(engine, at, far, 0.01), 6000, 14000);
    },
  },
];
