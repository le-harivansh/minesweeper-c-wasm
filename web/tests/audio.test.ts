/**
 * Tests web/src/lab/minesweeper/audio/audio.ts on a fake AudioContext
 * (fake-audio-context.ts): when the sound is heard, when the context is
 * suspended and resumed, which soundscape plays and when the next one comes,
 * and that nothing plays, or waits to play, while nothing is heard.
 *
 * Run with `make test-wasm`. Node runs this file as it is, by stripping the
 * types without checking them; `pnpm check` (astro check) checks them.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createGameAudio } from '../src/lab/minesweeper/audio/audio.ts';
import type { GameEvent } from '../src/lab/minesweeper/game-core.ts';
import type { WorldName } from '../src/lab/minesweeper/worlds.ts';
import {
  createVirtualClock,
  FakeAudioContext,
  settle,
  type VirtualClock,
} from './fake-audio-context.ts';

/** When the context is suspended after sound stops being heard: the 1 s fade's tails (1 × 1.6 s + 0.8 s). */
const SUSPEND_AFTER_MS = 2_400;

const FLAG: GameEvent[] = [{ type: 'cellFlagged', cellIndex: 0 }];

let clock: VirtualClock | null = null;

afterEach(() => clock?.restore());

/**
 * The game's audio on a fresh, suspended context, in the deep sea, on
 * screen. Draws the first soundscape with `random`: the first of four by
 * default.
 */
function setUp({ random = () => 0 }: { random?: () => number } = {}) {
  clock = createVirtualClock();
  clock.install();
  const context = new FakeAudioContext(clock);
  const remembered = new Map<WorldName, string>();
  const errors: unknown[] = [];
  let hidden = false;
  const audio = createGameAudio(context as unknown as AudioContext, {
    world: 'deep-sea',
    onScreen: true,
    preferences: {
      soundscape: (world) => remembered.get(world) ?? null,
      setSoundscape: (world, name) => void remembered.set(world, name),
    },
    pageHidden: () => hidden,
    random,
    reportError: (error) => errors.push(error),
  });
  // The engine makes the master first.
  const master = context.nodes.find((node) => node.kind === 'Gain');
  assert.ok(master);

  return {
    clock,
    context,
    audio,
    remembered,
    errors,
    masterAutomation: () => master.params.gain.automation,
    count: (kind: string) => context.nodes.filter((node) => node.kind === kind).length,
    setHidden(value: boolean) {
      hidden = value;
      audio.pageVisibilityChanged();
    },
  };
}

/** The first time, a random one of the four (here the first), remembered. */
test("sound on resumes the context and plays the world's soundscape", async () => {
  const { context, audio, remembered, count } = setUp();

  audio.setOn(true);
  await settle();

  assert.equal(context.state, 'running');
  assert.deepEqual(context.stateCalls, ['resume']);
  assert.equal(remembered.get('deep-sea'), 'sounding');
  // Every soundscape has a room: one reverb.
  assert.equal(count('Convolver'), 1);
});

test('a world plays the soundscape it played last', async () => {
  const { audio, remembered } = setUp({ random: () => 0.6 });
  remembered.set('deep-sea', 'kelp-current');

  audio.setOn(true);
  await settle();

  assert.equal(remembered.get('deep-sea'), 'kelp-current');
});

/**
 * Off screen, the master fades over 1 s, the context is suspended once the
 * tails are done, and nothing more is made meanwhile. Back on screen, the
 * same soundscape carries on: nothing is rebuilt.
 */
test('off screen, the sound fades and stops; back, it carries on where it was', async () => {
  const { clock, context, audio, remembered, count, masterAutomation } = setUp();
  audio.setOn(true);
  await settle();

  audio.setOnScreen(false);
  await settle();

  assert.equal(context.state, 'running');
  assert.match(masterAutomation().at(-1) ?? '', /^setTargetAtTime\(0,/);

  clock.advance(SUSPEND_AFTER_MS);
  await settle();
  const madeWhenSuspended = context.nodes.length;
  clock.advance(60_000);

  assert.equal(context.state, 'suspended');
  assert.equal(context.nodes.length, madeWhenSuspended);

  audio.setOnScreen(true);
  await settle();

  assert.equal(context.state, 'running');
  assert.match(masterAutomation().at(-1) ?? '', /^setTargetAtTime\(0\.6,/);
  assert.equal(count('Convolver'), 1);
  assert.equal(remembered.get('deep-sea'), 'sounding');
});

/** A quick scroll away and back: the fade turns round, and the context never stops. */
test('back on screen before the fade is done, the context runs on', async () => {
  const { clock, context, audio } = setUp();
  audio.setOn(true);
  await settle();

  audio.setOnScreen(false);
  clock.advance(1_000);
  audio.setOnScreen(true);
  clock.advance(SUSPEND_AFTER_MS);
  await settle();

  assert.equal(context.state, 'running');
  assert.deepEqual(context.stateCalls, ['resume', 'resume']);
});

test('sound off fades and stops the same way', async () => {
  const { clock, context, audio } = setUp();
  audio.setOn(true);
  await settle();

  audio.setOn(false);
  clock.advance(SUSPEND_AFTER_MS);
  await settle();

  assert.equal(context.state, 'suspended');
});

/** As the prototype did: no fade while no one is there to hear it, and nothing made meanwhile. */
test('a hidden page stops the sound at once, and carries on when shown', async () => {
  const { clock, context, audio, setHidden } = setUp();
  audio.setOn(true);
  await settle();

  setHidden(true);
  await settle();
  const madeWhenHidden = context.nodes.length;
  clock.advance(60_000);

  assert.equal(context.state, 'suspended');
  assert.equal(context.nodes.length, madeWhenHidden);

  setHidden(false);
  await settle();

  assert.equal(context.state, 'running');
});

/** Sounds queued on a stopped context would all play at once on the way back. */
test('a move sounds only while the sound is heard', async () => {
  const { clock, context, audio } = setUp();
  audio.setOn(true);
  await settle();
  let made = context.nodes.length;

  audio.playMove(FLAG, 9, 'deep-sea');

  assert.ok(context.nodes.length > made);

  audio.setOnScreen(false);
  clock.advance(SUSPEND_AFTER_MS);
  await settle();
  made = context.nodes.length;
  audio.playMove(FLAG, 9, 'deep-sea');
  audio.playClick();

  assert.equal(context.nodes.length, made);
});

/** A new world crossfades in now if heard, else when the sound is back. */
test("a new world's soundscape waits until the sound is heard again", async () => {
  const { clock, audio, remembered, count } = setUp();
  audio.setOn(true);
  await settle();
  audio.setOnScreen(false);
  clock.advance(SUSPEND_AFTER_MS);
  await settle();

  audio.setWorld('dune');

  assert.equal(remembered.get('dune'), undefined);
  assert.equal(count('Convolver'), 1);

  audio.setOnScreen(true);
  await settle();

  assert.equal(remembered.get('dune'), 'noon');
  assert.equal(count('Convolver'), 2);
});

/**
 * 44 s heard, then 100 s off screen (none of them count), then the 45th
 * second heard: the next soundscape crossfades in, and is remembered.
 */
test('the next soundscape comes after 45 seconds heard, not counting the rest', async () => {
  const { clock, audio, remembered } = setUp();
  audio.setOn(true);
  await settle();

  clock.advance(44_000);
  audio.setOnScreen(false);
  clock.advance(SUSPEND_AFTER_MS + 100_000);
  await settle();
  audio.setOnScreen(true);
  await settle();

  assert.equal(remembered.get('deep-sea'), 'sounding');

  clock.advance(1_000);

  assert.equal(remembered.get('deep-sea'), 'reef-shelf');
});

/** sound.ts may have started the context in a press for sound that is then off. */
test('a running context with nothing to play is suspended', async () => {
  const { context, audio } = setUp();
  context.start();

  audio.setOn(false);
  await settle();

  assert.equal(context.state, 'suspended');
  assert.equal(audio.needsPress, false);
});

/**
 * iOS suspends the context for a call, and won't resume it without a press.
 * Meanwhile nothing is made or counted, so nothing plays all at once on the
 * way back; the next press (sound.ts) starts it again, and it carries on.
 */
test('a context the browser stops waits for a press, and holds the soundscape meanwhile', async () => {
  const { clock, context, audio, remembered } = setUp();
  audio.setOn(true);
  await settle();

  context.interrupt();
  await settle();
  const madeWhenInterrupted = context.nodes.length;
  clock.advance(90_000);

  assert.equal(audio.needsPress, true);
  assert.equal(context.nodes.length, madeWhenInterrupted);
  assert.equal(remembered.get('deep-sea'), 'sounding');

  context.allowResume();
  await context.resume();
  await settle();
  clock.advance(5_000);

  assert.equal(audio.needsPress, false);
  assert.ok(context.nodes.length > madeWhenInterrupted);
});

test('nothing goes wrong along the way', async () => {
  const { clock, audio, errors, setHidden } = setUp();
  audio.setOn(true);
  await settle();
  clock.advance(200_000);
  setHidden(true);
  clock.advance(10_000);
  setHidden(false);
  await settle();
  audio.setWorld('rainforest');
  clock.advance(200_000);

  assert.deepEqual(errors, []);
});
