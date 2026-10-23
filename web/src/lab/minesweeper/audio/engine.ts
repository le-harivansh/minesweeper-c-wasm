/**
 * The sound engine: the page's mix, the noise every sound is made of, and
 * the ways of making a sound. Everything is synthesised; nothing is a file.
 *
 *   game sounds ─▶ effects bus ─────────────────────────────────┐
 *        └─▶ echo: delay 0.34 s, feedback 0.42, lowpass 2.4 kHz ┤
 *   soundscapes ─▶ ambience bus (ducks under an explosion) ─────┴─▶ master 0.6 ─▶ speakers
 *
 * It is the prototype's (tmp/Minesweeper.html in the C repo), node for node:
 * the same nodes made in the same order, the same values, the same random
 * draws. Only the names are new, in words: a sound is told when (at), how
 * fast it rises (attack), how long it dies over (decay) and how loud it peaks
 * (gain). The prototype's own levels stay: its volume slider's 0.6 is the
 * master, and the system volume does the rest.
 *
 * Nothing here touches the page: the soundscapes ask isPaused() rather than
 * reading document.hidden, so Node can run it all on a fake context.
 */

/** The three noises: white for clicks, pink for air, leaves and water, brown for rumble. */
export type NoiseColor = 'white' | 'pink' | 'brown';

/** The master level: the prototype's volume, at its default. */
export const MASTER_LEVEL = 0.6;

/** Each noise's length, looped. */
const NOISE_SECONDS = 3;

/** How long a one-shot's panner stays connected, by default. */
const PANNER_LIFE_MS = 8000;

export interface ToneOptions {
  frequency: number;
  /** Where the frequency glides to by the end, exponentially. */
  endFrequency?: number;
  wave?: OscillatorType;
  /** In the context's seconds; now by default. */
  at?: number;
  attack?: number;
  decay?: number;
  gain?: number;
  output?: AudioNode;
}

export interface BurstOptions {
  noise?: NoiseColor;
  filter?: BiquadFilterType;
  frequency?: number;
  endFrequency?: number;
  /** The filter's Q: how narrow its band, or how sharp its edge. */
  q?: number;
  at?: number;
  attack?: number;
  decay?: number;
  gain?: number;
  output?: AudioNode;
}

export interface GlideOptions {
  /** The pitch's path: [hertz, seconds from the start], the first at 0. */
  path: readonly (readonly [number, number])[];
  wave?: OscillatorType;
  at?: number;
  attack?: number;
  /** How long it fades out over before the path ends. */
  release?: number;
  gain: number;
  /** Where a lowpass filter cuts, if it has one. */
  lowpassFrequency?: number;
  /** [rate, depth], both in hertz. */
  vibrato?: readonly [number, number];
  output?: AudioNode;
}

/** One partial of a struck sound: [its frequency over the note's, gain, seconds to die]. */
export type StruckPartial = readonly [ratio: number, gain: number, decay: number];

export interface StrikeOptions {
  at: number;
  frequency: number;
  partials: readonly StruckPartial[];
  attack?: number;
  pan?: number;
  /** Scales every partial's gain. */
  strength?: number;
  output: AudioNode;
}

export interface PluckOptions {
  at: number;
  frequency: number;
  gain: number;
  decay: number;
  /** The lowpass starts this many times the note, and closes to 1.5 times it. */
  brightness?: number;
  /** A course of two strings, this far either side of the note. */
  detuneCents?: number;
  pan?: number;
  output: AudioNode;
}

export interface AudioEngine {
  readonly context: BaseAudioContext;
  readonly master: GainNode;
  /** Where the soundscapes play. */
  readonly ambienceBus: GainNode;
  /** Where the game's sounds play. */
  readonly effectsBus: GainNode;
  /** A send into the echo: the dry sound goes on to the effects bus. */
  readonly echo: GainNode;
  now(): number;
  /** Whether the soundscapes should hold their timers: the page hidden, or nothing heard. */
  isPaused(): boolean;
  /**
   * Reports an error in a sound a timer plays, which then carries on: one
   * failing call mustn't silence a soundscape.
   */
  reportError(error: unknown): void;
  /** A looping noise source; each time round, it loops back to somewhere in its first 2 s. */
  noise(color?: NoiseColor): AudioBufferSourceNode;
  /** A stereo place in front of `output`, let go after `lifeMs`. */
  pan(output: AudioNode, position: number, lifeMs?: number): StereoPannerNode;
  /** A stereo place that moves from `from` to `to` over `seconds`, let go after 6 s. */
  travel(
    output: AudioNode,
    at: number,
    from: number,
    to?: number,
    seconds?: number,
  ): StereoPannerNode;
  tone(options: ToneOptions): void;
  /** A burst of filtered noise. */
  burst(options: BurstOptions): void;
  /** A tone along a path of pitches, with an optional lowpass and vibrato. */
  glide(options: GlideOptions): void;
  marimba(frequency: number, at: number, gain?: number, decay?: number, output?: AudioNode): void;
  /** A struck, inharmonic sound: each partial a sine that dies on its own. */
  strike(options: StrikeOptions): void;
  /** A plucked string: sawtooth through a lowpass that closes as the note dies. */
  pluck(options: PluckOptions): void;
  /** Dips the soundscapes to 18 % for an explosion, then lets them back. */
  duckAmbience(at: number): void;
}

/** `value`, up to 3 % either way: no two flags quite alike. */
export function withJitter(value: number): number {
  return value * (1 + (Math.random() - 0.5) * 0.06);
}

export function randomBetween(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

export interface AudioEngineOptions {
  /** Whether the soundscapes should hold their timers. */
  isPaused: () => boolean;
  /** Where errors in timed sounds go; the console by default. */
  reportError?: (error: unknown) => void;
}

/** Builds the mix and the noise on `context`. */
export function createAudioEngine(
  context: BaseAudioContext,
  { isPaused, reportError = (error) => console.error(error) }: AudioEngineOptions,
): AudioEngine {
  const master = context.createGain();
  master.gain.value = MASTER_LEVEL;
  master.connect(context.destination);
  const ambienceBus = context.createGain();
  ambienceBus.gain.value = 1;
  ambienceBus.connect(master);
  const effectsBus = context.createGain();
  effectsBus.gain.value = 1;
  effectsBus.connect(master);

  const delay = context.createDelay(1);
  delay.delayTime.value = 0.34;
  const feedback = context.createGain();
  feedback.gain.value = 0.42;
  const darken = context.createBiquadFilter();
  darken.type = 'lowpass';
  darken.frequency.value = 2400;
  const echo = context.createGain();
  echo.gain.value = 1;
  echo.connect(effectsBus);
  echo.connect(delay);
  delay.connect(darken).connect(feedback).connect(delay);
  feedback.connect(master);

  const noises = createNoises(context);
  const now = () => context.currentTime;

  function noise(color: NoiseColor = 'white'): AudioBufferSourceNode {
    const source = context.createBufferSource();
    source.buffer = noises[color];
    source.loop = true;
    source.loopStart = Math.random() * 2;
    return source;
  }

  function pan(output: AudioNode, position: number, lifeMs?: number): StereoPannerNode {
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, position));
    panner.connect(output);
    setTimeout(() => panner.disconnect(), lifeMs || PANNER_LIFE_MS);
    return panner;
  }

  function travel(
    output: AudioNode,
    at: number,
    from: number,
    to = from,
    seconds = 0,
  ): StereoPannerNode {
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(from, at);

    if (seconds > 0) {
      panner.pan.linearRampToValueAtTime(to, at + seconds);
    }

    panner.connect(output);
    setTimeout(() => panner.disconnect(), 6000);
    return panner;
  }

  /** Rises from silence to `peak` over `attack`, then dies over `decay`. */
  function envelope(gain: GainNode, at: number, attack: number, peak: number, decay: number): void {
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  function tone({
    frequency,
    endFrequency,
    wave,
    at = now(),
    attack = 0.005,
    decay = 0.15,
    gain = 0.1,
    output,
  }: ToneOptions): void {
    const oscillator = context.createOscillator();
    oscillator.type = wave || 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);

    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + attack + decay);
    }

    const level = context.createGain();
    envelope(level, at, attack, gain, decay);
    oscillator.connect(level).connect(output || effectsBus);
    oscillator.start(at);
    oscillator.stop(at + attack + decay + 0.05);
  }

  function burst({
    noise: color,
    filter,
    frequency,
    endFrequency,
    q = 1,
    at = now(),
    attack = 0.002,
    decay = 0.04,
    gain = 0.15,
    output,
  }: BurstOptions): void {
    const source = noise(color);
    const shape = context.createBiquadFilter();
    shape.type = filter || 'bandpass';
    shape.frequency.setValueAtTime(frequency || 1800, at);

    if (endFrequency) {
      shape.frequency.exponentialRampToValueAtTime(endFrequency, at + attack + decay);
    }

    shape.Q.value = q;
    const level = context.createGain();
    envelope(level, at, attack, gain, decay);
    source
      .connect(shape)
      .connect(level)
      .connect(output || effectsBus);
    source.start(at);
    source.stop(at + attack + decay + 0.05);
  }

  function glide({
    path,
    wave,
    at = now(),
    attack = 0.3,
    release = 0.5,
    gain,
    lowpassFrequency,
    vibrato,
    output,
  }: GlideOptions): void {
    const oscillator = context.createOscillator();
    oscillator.type = wave || 'sine';
    oscillator.frequency.setValueAtTime(path[0][0], at);

    for (let index = 1; index < path.length; index++) {
      oscillator.frequency.exponentialRampToValueAtTime(path[index][0], at + path[index][1]);
    }

    const end = at + path[path.length - 1][1];
    const level = context.createGain();
    const hold = Math.max(at + attack, end - release);
    level.gain.setValueAtTime(0.0001, at);
    level.gain.exponentialRampToValueAtTime(gain, at + attack);
    level.gain.setValueAtTime(gain, hold);
    level.gain.exponentialRampToValueAtTime(0.0001, end);
    let head: AudioNode = oscillator;

    if (lowpassFrequency) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpassFrequency;
      oscillator.connect(filter);
      head = filter;
    }

    head.connect(level).connect(output || effectsBus);

    if (vibrato) {
      const wobble = context.createOscillator();
      wobble.frequency.value = vibrato[0];
      const depth = context.createGain();
      depth.gain.value = vibrato[1];
      wobble.connect(depth).connect(oscillator.frequency);
      wobble.start(at);
      wobble.stop(end + 0.1);
    }

    oscillator.start(at);
    oscillator.stop(end + 0.1);
  }

  /** A bar: its note, a fourth harmonic that dies fast, and the mallet's knock. */
  function marimba(
    frequency: number,
    at: number,
    gain = 0.09,
    decay = 0.4,
    output?: AudioNode,
  ): void {
    tone({ wave: 'sine', frequency, at, attack: 0.003, decay, gain, output });
    tone({
      wave: 'sine',
      frequency: frequency * 4,
      at,
      attack: 0.002,
      decay: decay * 0.22,
      gain: gain * 0.3,
      output,
    });
    burst({ at, decay: 0.012, gain: gain * 0.45, frequency: 2600, q: 0.7, output });
  }

  function strike({
    at,
    frequency,
    partials,
    attack = 0.002,
    pan: position = 0,
    strength = 1,
    output,
  }: StrikeOptions): void {
    const place = travel(output, at, position);

    for (const [ratio, gain, decay] of partials) {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency * ratio;
      const level = context.createGain();
      level.gain.setValueAtTime(0.0001, at);
      level.gain.exponentialRampToValueAtTime(gain * strength, at + attack);
      level.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
      oscillator.connect(level).connect(place);
      oscillator.start(at);
      oscillator.stop(at + attack + decay + 0.05);
    }
  }

  function pluck({
    at,
    frequency,
    gain,
    decay,
    brightness = 8,
    detuneCents = 0,
    pan: position = 0,
    output,
  }: PluckOptions): void {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(Math.min(frequency * brightness, 16000), at);
    filter.frequency.exponentialRampToValueAtTime(frequency * 1.5, at + decay * 0.8);
    const level = context.createGain();
    level.gain.setValueAtTime(0.0001, at);
    level.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    level.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    filter.connect(level).connect(travel(output, at, position));

    for (const cents of detuneCents ? [-detuneCents, detuneCents] : [0]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = cents;
      oscillator.connect(filter);
      oscillator.start(at);
      oscillator.stop(at + decay + 0.05);
    }
  }

  function duckAmbience(at: number): void {
    const { gain } = ambienceBus;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
    gain.linearRampToValueAtTime(0.18, at + 0.04);
    gain.setTargetAtTime(1, at + 1.2, 0.8);
  }

  return {
    context,
    master,
    ambienceBus,
    effectsBus,
    echo,
    now,
    isPaused,
    reportError,
    noise,
    pan,
    travel,
    tone,
    burst,
    glide,
    marimba,
    strike,
    pluck,
    duckAmbience,
  };
}

/**
 * The three noises, 3 s each, from one stream of random numbers: white as
 * drawn; pink through Paul Kellet's filter; brown as white's leaky sum.
 */
function createNoises(context: BaseAudioContext): Record<NoiseColor, AudioBuffer> {
  const length = context.sampleRate * NOISE_SECONDS;
  const white = context.createBuffer(1, length, context.sampleRate);
  const pink = context.createBuffer(1, length, context.sampleRate);
  const brown = context.createBuffer(1, length, context.sampleRate);
  const whiteSamples = white.getChannelData(0);
  const pinkSamples = pink.getChannelData(0);
  const brownSamples = brown.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let last = 0;

  for (let index = 0; index < length; index++) {
    const x = Math.random() * 2 - 1;
    whiteSamples[index] = x;
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    pinkSamples[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    brownSamples[index] = last * 3.5;
  }

  return { white, pink, brown };
}
