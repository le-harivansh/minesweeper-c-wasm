/**
 * Tests the sound's engine and what is made with it, on a fake AudioContext
 * (fake-audio-context.ts): every world's game sounds and every soundscape
 * play without a slip the fake would catch, and a soundscape that has faded
 * out stops for good.
 *
 * What they sound like is for the ear.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { SOUNDSCAPES } from '../../src/lab/minesweeper/audio/conductor.ts';
import { createAudioEngine, MASTER_LEVEL } from '../../src/lab/minesweeper/audio/engine.ts';
import { playClick, SOUND_EFFECTS } from '../../src/lab/minesweeper/audio/sfx.ts';
import {
  createSoundscapePlayer,
  type Soundscape,
} from '../../src/lab/minesweeper/audio/soundscapes/soundscape.ts';
import { WORLD_NAMES } from '../../src/lab/minesweeper/worlds/worlds.ts';
import { createVirtualClock, FakeAudioContext, type VirtualClock } from './fake-audio-context.ts';

/** How long each soundscape plays: four of its occasional sounds' longest waits. */
const PLAY_MS = 300_000;

/** Long enough for a 15 s fade-out to stop its sources (15 × 1.6 s + 0.8 s). */
const FADE_OUT_DONE_MS = 30_000;

/** A soundscape that plays nothing: what's made after it starts is someone else's. */
const SILENCE: Soundscape = { name: 'silence', build() {} };

let clock: VirtualClock | null = null;

afterEach(() => clock?.restore());

/** A running fake context, an engine on it, and the errors it reports. */
function setUp() {
  clock = createVirtualClock();
  clock.install();
  const context = new FakeAudioContext(clock);
  context.start();
  const errors: unknown[] = [];
  const engine = createAudioEngine(context as unknown as BaseAudioContext, {
    isPaused: () => false,
    reportError: (error) => errors.push(error),
  });

  return { clock, context, engine, errors };
}

/** The prototype's volume slider sat at 0.6; the system volume does the rest now. */
test("the mix's master is the prototype's 0.6", () => {
  const { engine } = setUp();

  assert.equal(MASTER_LEVEL, 0.6);
  assert.equal(engine.master.gain.value, MASTER_LEVEL);
  assert.equal(engine.ambienceBus.gain.value, 1);
});

/**
 * Each game sound once, as the moves play them: the reveal at every ring the
 * ripple has, a shown mine at every place a loss sounds. Every source a sound
 * starts stops by itself.
 */
test("every world's game sounds play, and stop by themselves", () => {
  for (const world of WORLD_NAMES) {
    const { context, engine } = setUp();
    const effects = SOUND_EFFECTS[world];
    const at = engine.now();

    effects.newGame(engine, at);
    effects.flag(engine, at);
    effects.unflag(engine, at);
    effects.explosion(engine, at);
    effects.win(engine, at);

    for (let ring = 0; ring <= 14; ring++) {
      effects.reveal(engine, at + ring * 0.032, ring);
    }

    for (let order = 0; order < 18; order++) {
      effects.mineShown(engine, at + 0.14 + order * 0.055, order);
    }

    playClick(engine, at);

    assert.ok(context.started.size > 40, world);
    assert.ok(
      [...context.started].every((source) => source.stoppedAt !== null),
      `${world}: a game sound left a source running`,
    );
  }
});

/**
 * Five minutes of each soundscape, its occasional sounds included, then a
 * crossfade to silence. Once the fade is done, every source the soundscape
 * started has stopped, and it makes nothing more: its timers are dead.
 */
test('every soundscape plays five minutes, then fades out for good', () => {
  for (const world of WORLD_NAMES) {
    for (const soundscape of SOUNDSCAPES[world]) {
      const { clock, context, engine, errors } = setUp();
      const player = createSoundscapePlayer(engine);
      const label = `${world}/${soundscape.name}`;

      player.play(soundscape, 2.5);
      clock.advance(PLAY_MS);
      const startedWhilePlaying = [...context.started];
      player.play(SILENCE, 15);
      clock.advance(FADE_OUT_DONE_MS);
      const madeOnceFaded = context.nodes.length;
      clock.advance(120_000);

      assert.deepEqual(errors, [], label);
      assert.ok(startedWhilePlaying.length > 10, `${label} played next to nothing`);
      assert.ok(
        startedWhilePlaying.every((source) => source.stoppedAt !== null),
        `${label} left a source running`,
      );
      assert.equal(context.nodes.length, madeOnceFaded, `${label} played on after its fade`);
      assert.equal(player.playing, SILENCE);
    }
  }
});

/** Paused (the page hidden, nothing heard): the timed parts wait rather than pile up. */
test('a paused soundscape plays nothing until it carries on', () => {
  clock = createVirtualClock();
  clock.install();
  const context = new FakeAudioContext(clock);
  context.start();
  let isPaused = false;
  const engine = createAudioEngine(context as unknown as BaseAudioContext, {
    isPaused: () => isPaused,
  });
  const player = createSoundscapePlayer(engine);

  player.play(SOUNDSCAPES.rainforest[1], 2.5);
  clock.advance(10_000);
  isPaused = true;
  // Grains already scheduled ahead play out first.
  clock.advance(1_000);
  const madeWhenPaused = context.nodes.length;
  clock.advance(60_000);

  assert.equal(context.nodes.length, madeWhenPaused);

  isPaused = false;
  clock.advance(5_000);

  assert.ok(context.nodes.length > madeWhenPaused);
});

/**
 * Hidden 5 s into a 15 s crossfade, for a minute: the clock runs on, the
 * context's time doesn't. The old scene must not be cut off mid-fade while
 * hidden, and stops once its fade is done in the context's time.
 */
test("a fade-out ends in the context's time, not the clock's", async () => {
  const { clock, context, engine } = setUp();
  const player = createSoundscapePlayer(engine);

  player.play(SOUNDSCAPES['deep-sea'][0], 2.5);
  clock.advance(10_000);
  const running = [...context.started].filter((source) => source.stoppedAt === null);
  player.play(SILENCE, 15);
  clock.advance(5_000);
  await context.suspend();
  clock.advance(60_000);

  assert.ok(running.length > 0);
  assert.ok(running.every((source) => source.stoppedAt === null));

  await context.resume();
  clock.advance(FADE_OUT_DONE_MS);

  assert.ok(running.every((source) => source.stoppedAt !== null));
});
