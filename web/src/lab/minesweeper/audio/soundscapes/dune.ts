/**
 * The dune's four soundscapes, and the calls only it has. The prototype's,
 * verbatim.
 */
import { randomBetween, type AudioEngine } from '../engine.ts';
import { D_HIJAZ } from '../sfx.ts';
import { chorusVoice, deepRumble, rockTick } from './shared-calls.ts';
import {
  drone,
  grains,
  noiseLayer,
  occasionalSound,
  room,
  wander,
  type Soundscape,
} from './soundscape.ts';

/** A hawk far overhead. */
function hawk(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.glide({
    at,
    path: [
      [2400, 0],
      [2600, 0.12],
      [1500, 0.7],
    ],
    gain: 0.016,
    attack: 0.04,
    release: 0.3,
    output,
  });
}

/** The singing dune: a low drone, rising and falling over seven seconds, with its octave. */
function singingDune(engine: AudioEngine, at: number, output: AudioNode): void {
  engine.glide({
    at,
    path: [
      [95, 0],
      [101, 4],
      [92, 7],
    ],
    gain: 0.03,
    attack: 2.5,
    release: 2.5,
    lowpassFrequency: 300,
    output,
  });
  engine.glide({
    at,
    path: [
      [190, 0],
      [202, 4],
      [184, 7],
    ],
    gain: 0.009,
    attack: 2.5,
    release: 2.5,
    lowpassFrequency: 400,
    output,
  });
}

/** A camel's bells, two to four, shaken. */
function camelBells(engine: AudioEngine, at: number, output: AudioNode): void {
  const bells = 2 + Math.floor(Math.random() * 3);
  let next = at;

  for (let bell = 0; bell < bells; bell++) {
    const frequency = randomBetween(1800, 2600);
    engine.tone({ frequency, at: next, attack: 0.001, decay: 0.5, gain: 0.015, output });
    engine.tone({
      frequency: frequency * 2.7,
      at: next,
      attack: 0.001,
      decay: 0.2,
      gain: 0.005,
      output,
    });
    engine.burst({
      at: next,
      attack: 0.001,
      decay: 0.008,
      gain: 0.02,
      filter: 'highpass',
      frequency: 5000,
      output,
    });
    next += randomBetween(0.15, 0.35);
  }
}

/** A ney flute's phrase far off, in hijaz: four to six breathy notes, stepping. */
function neyPhrase(engine: AudioEngine, at: number, output: AudioNode): void {
  const notes = 4 + Math.floor(Math.random() * 3);
  let next = at;
  let step = Math.floor(Math.random() * 4);

  for (let note = 0; note < notes; note++) {
    const frequency = D_HIJAZ[step] * 2;
    const length = randomBetween(0.35, 0.8);
    engine.glide({
      at: next,
      wave: 'triangle',
      path: [
        [frequency * 0.985, 0],
        [frequency, 0.12],
        [frequency, length],
      ],
      gain: 0.02,
      attack: 0.08,
      release: 0.25,
      lowpassFrequency: 2200,
      vibrato: [5, 4],
      output,
    });
    engine.burst({
      at: next,
      attack: 0.06,
      decay: length,
      gain: 0.008,
      noise: 'pink',
      filter: 'bandpass',
      frequency: frequency * 1.02,
      q: 6,
      output,
    });
    next += length + randomBetween(0.05, 0.2);
    step = Math.max(
      0,
      Math.min(
        D_HIJAZ.length - 1,
        step + (Math.random() < 0.5 ? 1 : -1) * (1 + Math.floor(Math.random() * 2)),
      ),
    );
  }
}

/** A jackal far off: three yelps, then a howl. */
function jackal(engine: AudioEngine, at: number, output: AudioNode): void {
  for (let yelp = 0; yelp < 3; yelp++) {
    engine.glide({
      at: at + yelp * 0.22,
      path: [
        [1100, 0],
        [1700, 0.07],
        [1200, 0.15],
      ],
      gain: 0.012,
      attack: 0.01,
      release: 0.05,
      output,
    });
  }

  engine.glide({
    at: at + 0.9,
    path: [
      [900, 0],
      [1300, 0.4],
      [800, 1.2],
    ],
    gain: 0.014,
    attack: 0.15,
    release: 0.4,
    vibrato: [7, 12],
    output,
  });
}

export const DUNE_SOUNDSCAPES: readonly Soundscape[] = [
  {
    // Flat light, dry wind.
    name: 'noon',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 1.1, 0.6, 0.3);
      // Two wind bands wandering on either side, a high whistle, ground pressure.
      const left = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 600,
        q: 0.5,
        gain: 0.06,
        noise: 'pink',
        pan: -0.4,
      });
      wander(scene, left.filter.frequency, 380, 1100, 1200, 4000, 0.9);
      wander(scene, left.gain.gain, 0.02, 0.08, 900, 3000, 0.7);
      wander(scene, left.panner.pan, -0.7, -0.1, 4000, 9000, 2.5);
      const right = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 1300,
        q: 0.5,
        gain: 0.045,
        noise: 'pink',
        pan: 0.4,
      });
      wander(scene, right.filter.frequency, 900, 2200, 1500, 4500, 1);
      wander(scene, right.gain.gain, 0.015, 0.06, 1100, 3500, 0.8);
      wander(scene, right.panner.pan, 0.1, 0.7, 4000, 9000, 2.5);
      const whistle = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 2200,
        q: 14,
        gain: 0.004,
        noise: 'white',
      });
      wander(scene, whistle.filter.frequency, 1500, 3200, 2000, 6000, 1.5);
      wander(scene, whistle.gain.gain, 0.0005, 0.007, 1500, 5000, 1.2);
      const ground = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 90,
        q: 1,
        gain: 0.03,
        noise: 'brown',
      });
      wander(scene, ground.gain.gain, 0.015, 0.04, 3000, 7000, 2);
      // Sand hitting sand, a dry, sparse hiss across the field.
      grains(scene, [70, 320], (at) =>
        engine.burst({
          at,
          attack: 0.002,
          decay: randomBetween(0.008, 0.03),
          gain: randomBetween(0.006, 0.016),
          filter: 'highpass',
          frequency: randomBetween(5000, 9000),
          output: engine.pan(scene.output, randomBetween(-0.9, 0.9), 2000),
        }),
      );
      // A gust: both wind bands lift, and the sand thickens.
      occasionalSound(
        scene,
        (at) => {
          left.gain.gain.setTargetAtTime(0.16, at, 0.9);
          right.gain.gain.setTargetAtTime(0.12, at, 0.9);
          left.gain.gain.setTargetAtTime(0.05, at + 2.4, 1.4);
          right.gain.gain.setTargetAtTime(0.035, at + 2.4, 1.4);

          for (let grain = 0; grain < 40; grain++) {
            engine.burst({
              at: at + 0.4 + grain * randomBetween(0.03, 0.08),
              attack: 0.002,
              decay: 0.02,
              gain: 0.014,
              filter: 'highpass',
              frequency: randomBetween(5000, 9000),
              output: engine.pan(scene.output, randomBetween(-0.9, 0.9), 5000),
            });
          }
        },
        14000,
        28000,
      );
      occasionalSound(
        scene,
        (at) => hawk(engine, at, engine.pan(far, randomBetween(-0.8, 0.8))),
        30000,
        60000,
      );
      occasionalSound(scene, (at) => singingDune(engine, at, scene.output), 40000, 80000);
      occasionalSound(
        scene,
        (at) => rockTick(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        25000,
        55000,
      );
    },
  },
  {
    // Someone else is crossing too.
    name: 'caravan',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 1.4, 0.55, 0.35);
      // The wind lighter and lower; a soft ground pressure.
      const wind = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 500,
        q: 0.5,
        gain: 0.035,
        noise: 'pink',
        pan: -0.3,
      });
      wander(scene, wind.filter.frequency, 320, 900, 1500, 4500, 1);
      wander(scene, wind.gain.gain, 0.012, 0.05, 1000, 3500, 0.8);
      wander(scene, wind.panner.pan, -0.6, 0.2, 4000, 9000, 2.5);
      const ground = noiseLayer(scene, {
        filter: 'lowpass',
        frequency: 90,
        q: 1,
        gain: 0.025,
        noise: 'brown',
      });
      wander(scene, ground.gain.gain, 0.012, 0.035, 3000, 7000, 2);
      // Footfalls in sand at a walking pace, left, right, each with its crunch.
      let footfall = 0;
      grains(scene, [1050, 1150], (at) => {
        const output = engine.pan(scene.output, footfall % 2 ? 0.25 : -0.25, 2000);
        footfall++;
        engine.burst({
          at,
          attack: 0.01,
          decay: 0.12,
          gain: 0.028,
          noise: 'brown',
          filter: 'lowpass',
          frequency: 220,
          output,
        });
        engine.burst({
          at: at + 0.01,
          attack: 0.002,
          decay: 0.045,
          gain: 0.012,
          filter: 'highpass',
          frequency: 4000,
          output,
        });
      });
      // Small bells that never quite keep time.
      grains(scene, [700, 2400], (at) => {
        const frequency = randomBetween(2000, 2700);
        engine.tone({
          frequency,
          at,
          attack: 0.001,
          decay: 0.35,
          gain: 0.008,
          output: engine.pan(far, randomBetween(-0.7, 0.7), 3000),
        });
        engine.tone({
          frequency: frequency * 2.7,
          at,
          attack: 0.001,
          decay: 0.12,
          gain: 0.003,
          output: engine.pan(far, 0, 3000),
        });
      });
      occasionalSound(
        scene,
        (at) => neyPhrase(engine, at, engine.pan(far, randomBetween(-0.8, 0.8), 12000)),
        45000,
        90000,
      );
      // A gust.
      occasionalSound(
        scene,
        (at) => {
          wind.gain.gain.setTargetAtTime(0.1, at, 0.9);
          wind.gain.gain.setTargetAtTime(0.035, at + 2.4, 1.4);
        },
        18000,
        35000,
      );
      occasionalSound(
        scene,
        (at) => hawk(engine, at, engine.pan(far, randomBetween(-0.8, 0.8))),
        40000,
        80000,
      );
      occasionalSound(
        scene,
        (at) => camelBells(engine, at, engine.pan(far, randomBetween(-0.8, 0.8))),
        12000,
        25000,
      );
    },
  },
  {
    // The wind has dropped. Everything ticks.
    name: 'night-cold',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 2.6, 0.45, 0.5);
      // Almost no wind, a very low cold drone, a thin hiss above.
      const cold = engine.context.createBiquadFilter();
      cold.type = 'lowpass';
      cold.frequency.value = 160;
      cold.connect(scene.output);
      const hum = drone(scene, 'sine', 50, 0.025, cold);
      wander(scene, hum.gain.gain, 0.012, 0.03, 3000, 8000, 2.5);
      const wind = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 900,
        q: 0.6,
        gain: 0.008,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, wind.filter.frequency, 600, 1400, 2000, 5000, 1.5);
      wander(scene, wind.gain.gain, 0.002, 0.012, 1500, 4000, 1);
      const hiss = noiseLayer(scene, {
        filter: 'highpass',
        frequency: 6000,
        q: 1,
        gain: 0.003,
        noise: 'pink',
        pan: 0,
      });
      wander(scene, hiss.gain.gain, 0.001, 0.004, 2000, 5000, 1.5);
      // Rocks cooling and cracking; one desert cricket, slow and alone.
      grains(scene, [1200, 5000], (at) =>
        rockTick(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
      );
      chorusVoice(scene, {
        periodSeconds: 1.6,
        pulses: 2,
        gapSeconds: 0.07,
        frequency: 4000,
        q: 12,
        gain: 0.006,
        position: 0.5,
      });
      occasionalSound(
        scene,
        (at) => jackal(engine, at, engine.pan(far, randomBetween(-0.9, 0.9))),
        40000,
        80000,
      );
      // A gust from nowhere that dies.
      occasionalSound(
        scene,
        (at) => {
          wind.gain.gain.setTargetAtTime(0.05, at, 1);
          wind.gain.gain.setTargetAtTime(0.008, at + 2.5, 1.5);
        },
        25000,
        50000,
      );
      // A stone rolling down a face.
      occasionalSound(
        scene,
        (at) => {
          for (let knock = 0; knock < 7; knock++) {
            engine.burst({
              at: at + knock * randomBetween(0.06, 0.14),
              attack: 0.002,
              decay: 0.03,
              gain: 0.03 * (1 - knock / 8),
              filter: 'bandpass',
              frequency: randomBetween(900, 1600),
              q: 3,
              output: engine.pan(far, randomBetween(-0.6, 0.6)),
            });
          }
        },
        35000,
        70000,
      );
      // The singing dune, quieter.
      occasionalSound(
        scene,
        (at) => {
          engine.glide({
            at,
            path: [
              [95, 0],
              [100, 4],
              [93, 7],
            ],
            gain: 0.018,
            attack: 2.5,
            release: 2.5,
            lowpassFrequency: 300,
            output: scene.output,
          });
        },
        50000,
        100000,
      );
    },
  },
  {
    // A wall of sand on the horizon, not here yet.
    name: 'storm-edge',
    build(scene) {
      const { engine } = scene;
      const far = room(scene, 1, 0.45, 0.25);
      // The wind heavier and lower than at noon, a rumble under it, the whistle stronger.
      const left = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 400,
        q: 0.5,
        gain: 0.09,
        noise: 'pink',
        pan: -0.4,
      });
      wander(scene, left.filter.frequency, 250, 800, 900, 3000, 0.8);
      wander(scene, left.gain.gain, 0.05, 0.13, 800, 2500, 0.7);
      wander(scene, left.panner.pan, -0.8, 0, 3000, 7000, 2);
      const right = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 1100,
        q: 0.5,
        gain: 0.06,
        noise: 'pink',
        pan: 0.4,
      });
      wander(scene, right.filter.frequency, 700, 1800, 1200, 3500, 0.9);
      wander(scene, right.gain.gain, 0.03, 0.09, 900, 3000, 0.7);
      wander(scene, right.panner.pan, 0, 0.8, 3000, 7000, 2);
      const rumble = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 160,
        q: 0.7,
        gain: 0.05,
        noise: 'brown',
        pan: 0,
      });
      wander(scene, rumble.gain.gain, 0.03, 0.09, 2000, 5000, 1.5);
      wander(scene, rumble.filter.frequency, 110, 220, 3000, 7000, 2);
      const whistle = noiseLayer(scene, {
        filter: 'bandpass',
        frequency: 2600,
        q: 16,
        gain: 0.006,
        noise: 'white',
      });
      wander(scene, whistle.filter.frequency, 1800, 3800, 1500, 4500, 1.2);
      wander(scene, whistle.gain.gain, 0.002, 0.012, 1200, 4000, 1);
      // Sand hiss, dense and constant, swelling in waves.
      const density = { value: 1 };
      wander(
        scene,
        { setTargetAtTime: (value: number) => (density.value = value) },
        0.5,
        1.4,
        1500,
        5000,
      );
      grains(scene, [25, 140], (at) => {
        if (Math.random() > density.value * 0.7) {
          return;
        }

        engine.burst({
          at,
          attack: 0.002,
          decay: randomBetween(0.008, 0.03),
          gain: randomBetween(0.008, 0.02),
          filter: 'highpass',
          frequency: randomBetween(4500, 9000),
          output: engine.pan(scene.output, randomBetween(-0.9, 0.9), 1500),
        });
      });
      // A gust front: hits hard, takes a while to pass.
      occasionalSound(
        scene,
        (at) => {
          left.gain.gain.setTargetAtTime(0.26, at, 1.2);
          right.gain.gain.setTargetAtTime(0.18, at, 1.2);
          rumble.gain.gain.setTargetAtTime(0.14, at, 1.2);
          left.gain.gain.setTargetAtTime(0.08, at + 4.5, 2.2);
          right.gain.gain.setTargetAtTime(0.05, at + 4.5, 2.2);
          rumble.gain.gain.setTargetAtTime(0.05, at + 4.5, 2.2);
        },
        16000,
        32000,
      );
      occasionalSound(scene, (at) => deepRumble(engine, at, scene.output), 30000, 60000);
      // The whistle breaking into a howl.
      occasionalSound(
        scene,
        (at) => {
          whistle.gain.gain.setTargetAtTime(0.03, at, 0.8);
          whistle.filter.frequency.setTargetAtTime(3400, at, 0.8);
          whistle.gain.gain.setTargetAtTime(0.006, at + 2.5, 1.5);
        },
        25000,
        50000,
      );
      occasionalSound(
        scene,
        (at) => hawk(engine, at, engine.pan(far, randomBetween(-0.8, 0.8))),
        45000,
        90000,
      );
    },
  },
];
