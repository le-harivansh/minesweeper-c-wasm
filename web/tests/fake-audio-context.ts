/**
 * A fake AudioContext for the sound's tests, and a virtual clock to run it
 * on. Node has no Web Audio, and the real thing can't be listened to in a
 * test anyway: the fake records what the sound does instead.
 *
 * The fake is strict, so a slip in the sound fails here rather than going
 * quiet in a page: its nodes are sealed (setting a property a real node
 * hasn't throws), a method it doesn't have throws, a source started twice or
 * stopped before it starts throws, and an exponential ramp to 0 throws, as
 * the real ones do.
 *
 * The clock stands in for setTimeout and setInterval: advance() runs each
 * callback at its own due time, ties in the order they were set, and the
 * context's currentTime follows it while the context runs. Like a real one,
 * a suspended context's time stands still, and resume() and suspend()
 * change the state a moment later, then say so in a statechange event:
 * settle() lets that happen. interrupt() suspends it as iOS does for a call,
 * refusing to resume until allowResume().
 *
 * `trace`, when given, hears every call as a line of text: the verbatim check
 * against the prototype (tmp/verify-sound/ in the C repo) compares those.
 */

type Callback = () => void;

interface Timer {
  id: number;
  due: number;
  order: number;
  run: Callback;
  every: number | null;
}

export interface VirtualClock {
  /** The time, in milliseconds since the clock was made. */
  readonly now: number;
  /** How many callbacks are waiting. */
  readonly pending: number;
  /** Puts the clock in place of the global timers, until restore(). */
  install(): void;
  restore(): void;
  /** Runs every callback due in the next `ms`, each at its time. */
  advance(ms: number): void;
}

// The real timers, kept once: a clock installed over another restores these.
const REAL_TIMERS = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};

/** Whether `a` runs before `b`: the earlier, or the one set first. */
const before = (a: Timer, b: Timer) => a.due < b.due || (a.due === b.due && a.order < b.order);

export function createVirtualClock(): VirtualClock {
  let now = 0;
  let nextId = 1;
  let nextOrder = 0;
  // A binary heap, the next due at the top; cleared timers stay in it until they surface.
  const heap: Timer[] = [];
  const live = new Map<number, Timer>();

  function push(timer: Timer): void {
    heap.push(timer);
    let index = heap.length - 1;

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (!before(heap[index], heap[parent])) {
        break;
      }

      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  }

  function pop(): Timer | undefined {
    const top = heap[0];
    const last = heap.pop();

    if (heap.length > 0 && last) {
      heap[0] = last;
      let index = 0;

      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let first = index;

        if (left < heap.length && before(heap[left], heap[first])) {
          first = left;
        }

        if (right < heap.length && before(heap[right], heap[first])) {
          first = right;
        }

        if (first === index) {
          break;
        }

        [heap[index], heap[first]] = [heap[first], heap[index]];
        index = first;
      }
    }

    return top;
  }

  function add(run: Callback, ms: number | undefined, every: number | null): number {
    const timer = { id: nextId++, due: now + Math.max(0, ms ?? 0), order: nextOrder++, run, every };
    live.set(timer.id, timer);
    push(timer);
    return timer.id;
  }

  const clear = (id: number) => void live.delete(id);
  const fakes = {
    setTimeout: (run: Callback, ms?: number) => add(run, ms, null),
    clearTimeout: clear,
    setInterval: (run: Callback, ms?: number) => add(run, ms, Math.max(1, ms ?? 0)),
    clearInterval: clear,
  };

  return {
    get now() {
      return now;
    },
    get pending() {
      return live.size;
    },
    install() {
      Object.assign(globalThis, fakes);
    },
    restore() {
      Object.assign(globalThis, REAL_TIMERS);
    },
    advance(ms) {
      const end = now + ms;

      while (heap.length > 0 && heap[0].due <= end) {
        const timer = pop();

        if (!timer || live.get(timer.id) !== timer) {
          continue;
        }

        now = timer.due;

        if (timer.every === null) {
          live.delete(timer.id);
        } else {
          // An interval goes back in for its next turn.
          timer.due += timer.every;
          timer.order = nextOrder++;
          push(timer);
        }

        timer.run();
      }

      now = end;
    },
  };
}

/** Throws, as a real node does, for a time that isn't a finite number from 0 up. */
function checkTime(owner: string, at: number): void {
  if (!Number.isFinite(at) || at < 0) {
    throw new RangeError(`${owner}: no such time as ${at}`);
  }
}

/** Throws, as a real param does, for a value that isn't a finite number. */
function checkValue(owner: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${owner}: ${value} isn't a value`);
  }
}

/** A number as text, exactly: the shortest that reads back the same, and −0 kept. */
function exact(value: unknown): string {
  return typeof value === 'number' && Object.is(value, -0) ? '-0' : String(value);
}

/** Text for a value in a trace: a node or param by its name, a number exactly. */
function described(value: unknown): string {
  if (value instanceof FakeParam) {
    return value.name;
  }

  if (value instanceof FakeNode || value instanceof FakeBuffer) {
    return value.name;
  }

  if (Array.isArray(value)) {
    return `[${value.map(described).join(',')}]`;
  }

  return exact(value);
}

export class FakeParam {
  readonly name: string;
  readonly context: FakeAudioContext;
  /** Every automation call, as text, for a test to read back. */
  readonly automation: string[] = [];
  /** What value was last set, as a real param's value reads between automations. */
  private current: number;

  constructor(context: FakeAudioContext, name: string, value: number) {
    this.context = context;
    this.name = name;
    this.current = value;
    Object.seal(this);
  }

  private automate(call: string): this {
    this.automation.push(call);
    this.context.record(`${this.name}.${call}`);
    return this;
  }

  get value(): number {
    return this.current;
  }

  set value(value: number) {
    checkValue(this.name, value);
    this.context.record(`${this.name}.value=${exact(value)}`);
    this.current = value;
  }

  setValueAtTime(value: number, at: number): this {
    checkValue(this.name, value);
    checkTime(this.name, at);
    this.current = value;
    return this.automate(`setValueAtTime(${exact(value)},${exact(at)})`);
  }

  linearRampToValueAtTime(value: number, at: number): this {
    checkValue(this.name, value);
    checkTime(this.name, at);
    return this.automate(`linearRampToValueAtTime(${exact(value)},${exact(at)})`);
  }

  exponentialRampToValueAtTime(value: number, at: number): this {
    checkTime(this.name, at);

    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(
        `${this.name}: an exponential ramp needs a target above 0, not ${value}`,
      );
    }

    return this.automate(`exponentialRampToValueAtTime(${exact(value)},${exact(at)})`);
  }

  setTargetAtTime(value: number, at: number, timeConstant: number): this {
    checkValue(this.name, value);
    checkTime(this.name, at);

    if (!(timeConstant >= 0)) {
      throw new RangeError(`${this.name}: a time constant can't be ${timeConstant}`);
    }

    return this.automate(`setTargetAtTime(${exact(value)},${exact(at)},${exact(timeConstant)})`);
  }

  cancelScheduledValues(at: number): this {
    checkTime(this.name, at);
    return this.automate(`cancelScheduledValues(${exact(at)})`);
  }
}

export class FakeBuffer {
  readonly name: string;
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly channels: Float32Array[];
  // Hashed once, when first given to a node: by then it is filled.
  private hashed: string | null = null;

  constructor(name: string, channels: number, length: number, sampleRate: number) {
    this.name = name;
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
    Object.seal(this);
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }

  /** A hash of every sample, for a trace: the same noise hashes the same. */
  hash(): string {
    if (this.hashed !== null) {
      return this.hashed;
    }

    let hash = 0x811c9dc5;

    for (const channel of this.channels) {
      const bytes = new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength);

      for (const byte of bytes) {
        hash = Math.imul(hash ^ byte, 0x01000193);
      }
    }

    this.hashed = (hash >>> 0).toString(16);
    return this.hashed;
  }
}

const WAVES = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const FILTERS = new Set([
  'lowpass',
  'highpass',
  'bandpass',
  'lowshelf',
  'highshelf',
  'peaking',
  'notch',
  'allpass',
]);

export class FakeNode {
  readonly name: string;
  readonly kind: string;
  readonly context: FakeAudioContext;
  readonly params: Record<string, FakeParam> = {};
  /** For sources: when started and stopped, if they have been. */
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  private properties: Record<string, unknown> = {};

  constructor(context: FakeAudioContext, kind: string, params: Record<string, number>) {
    this.context = context;
    this.kind = kind;
    this.name = context.nameFor(kind);

    for (const [param, value] of Object.entries(params)) {
      this.params[param] = new FakeParam(context, `${this.name}.${param}`, value);
    }

    context.record(`new ${this.name}`);
  }

  connect(destination: FakeNode | FakeParam): FakeNode | undefined {
    this.context.record(`${this.name}->${described(destination)}`);
    return destination instanceof FakeNode ? destination : undefined;
  }

  disconnect(): void {
    this.context.record(`${this.name}.disconnect()`);
  }

  protected setProperty(property: string, value: unknown): void {
    this.context.record(`${this.name}.${property}=${described(value)}`);
    this.properties[property] = value;
  }

  protected getProperty(property: string): unknown {
    return this.properties[property];
  }

  start(at = 0, offset?: number): void {
    checkTime(this.name, at);
    checkTime(this.name, offset ?? 0);

    if (this.startedAt !== null) {
      throw new Error(`InvalidStateError: ${this.name} started twice`);
    }

    this.context.record(
      `${this.name}.start(${exact(at)}${offset === undefined ? '' : `,${exact(offset)}`})`,
    );
    this.startedAt = at;
    this.context.started.add(this);
  }

  stop(at = 0): void {
    checkTime(this.name, at);

    if (this.startedAt === null) {
      throw new Error(`InvalidStateError: ${this.name} stopped before it started`);
    }

    this.context.record(`${this.name}.stop(${exact(at)})`);
    this.stoppedAt = at;
  }
}

class FakeGain extends FakeNode {
  constructor(context: FakeAudioContext) {
    super(context, 'Gain', { gain: 1 });
    Object.seal(this);
  }

  get gain(): FakeParam {
    return this.params.gain;
  }
}

class FakeOscillator extends FakeNode {
  constructor(context: FakeAudioContext) {
    super(context, 'Oscillator', { frequency: 440, detune: 0 });
    Object.seal(this);
  }

  get frequency(): FakeParam {
    return this.params.frequency;
  }

  get detune(): FakeParam {
    return this.params.detune;
  }

  get type(): unknown {
    return this.getProperty('type') ?? 'sine';
  }

  set type(value: string) {
    if (!WAVES.has(value)) {
      throw new TypeError(`${this.name}: no wave '${value}'`);
    }

    this.setProperty('type', value);
  }
}

class FakeBiquadFilter extends FakeNode {
  constructor(context: FakeAudioContext) {
    super(context, 'BiquadFilter', { frequency: 350, Q: 1, gain: 0, detune: 0 });
    Object.seal(this);
  }

  get frequency(): FakeParam {
    return this.params.frequency;
  }

  get Q(): FakeParam {
    return this.params.Q;
  }

  get gain(): FakeParam {
    return this.params.gain;
  }

  get type(): unknown {
    return this.getProperty('type') ?? 'lowpass';
  }

  set type(value: string) {
    if (!FILTERS.has(value)) {
      throw new TypeError(`${this.name}: no filter '${value}'`);
    }

    this.setProperty('type', value);
  }
}

class FakeBufferSource extends FakeNode {
  constructor(context: FakeAudioContext) {
    super(context, 'BufferSource', { playbackRate: 1, detune: 0 });
    Object.seal(this);
  }

  get buffer(): unknown {
    return this.getProperty('buffer') ?? null;
  }

  set buffer(value: FakeBuffer) {
    this.context.recordBuffer(value);
    this.setProperty('buffer', value);
  }

  get loop(): unknown {
    return this.getProperty('loop') ?? false;
  }

  set loop(value: boolean) {
    this.setProperty('loop', value);
  }

  get loopStart(): unknown {
    return this.getProperty('loopStart') ?? 0;
  }

  set loopStart(value: number) {
    this.setProperty('loopStart', value);
  }
}

class FakeStereoPanner extends FakeNode {
  constructor(context: FakeAudioContext) {
    super(context, 'StereoPanner', { pan: 0 });
    Object.seal(this);
  }

  get pan(): FakeParam {
    return this.params.pan;
  }
}

class FakeDelay extends FakeNode {
  constructor(context: FakeAudioContext) {
    super(context, 'Delay', { delayTime: 0 });
    Object.seal(this);
  }

  get delayTime(): FakeParam {
    return this.params.delayTime;
  }
}

class FakeConvolver extends FakeNode {
  constructor(context: FakeAudioContext) {
    super(context, 'Convolver', {});
    Object.seal(this);
  }

  get buffer(): unknown {
    return this.getProperty('buffer') ?? null;
  }

  set buffer(value: FakeBuffer) {
    this.context.recordBuffer(value);
    this.setProperty('buffer', value);
  }
}

export class FakeAudioContext {
  readonly sampleRate = 48_000;
  readonly destination: FakeNode;
  /** Every node made, in order. */
  readonly nodes: FakeNode[] = [];
  /** Every source started. */
  readonly started = new Set<FakeNode>();
  /** Calls to resume() and suspend(), in order. */
  readonly stateCalls: ('resume' | 'suspend')[] = [];
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  /** Set by interrupt(): resume() changes nothing until allowResume(). */
  private resumeRefused = false;
  private readonly clock: VirtualClock;
  private readonly trace: ((line: string) => void) | null;
  private readonly counts = new Map<string, number>();
  private readonly listeners: Callback[] = [];
  // The context's own time: it stands still while suspended.
  private runningSince: number | null = null;
  private elapsedMs = 0;

  constructor(clock: VirtualClock, { trace }: { trace?: (line: string) => void } = {}) {
    this.clock = clock;
    this.trace = trace ?? null;
    this.destination = new FakeNode(this, 'Destination', {});
  }

  get currentTime(): number {
    const running = this.runningSince === null ? 0 : this.clock.now - this.runningSince;
    return (this.elapsedMs + running) / 1000;
  }

  /** Runs the context from now, as a press would. */
  start(): void {
    this.setState('running');
  }

  record(line: string): void {
    this.trace?.(line);
  }

  /** A buffer's samples, by their hash: only when tracing, since hashing takes a while. */
  recordBuffer(buffer: FakeBuffer): void {
    if (this.trace) {
      this.trace(`${buffer.name}#${buffer.hash()}`);
    }
  }

  nameFor(kind: string): string {
    const count = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, count);
    return `${kind}${count}`;
  }

  private made<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  createGain() {
    return this.made(new FakeGain(this));
  }

  createOscillator() {
    return this.made(new FakeOscillator(this));
  }

  createBiquadFilter() {
    return this.made(new FakeBiquadFilter(this));
  }

  createBufferSource() {
    return this.made(new FakeBufferSource(this));
  }

  createStereoPanner() {
    return this.made(new FakeStereoPanner(this));
  }

  createDelay() {
    return this.made(new FakeDelay(this));
  }

  createConvolver() {
    return this.made(new FakeConvolver(this));
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const buffer = new FakeBuffer(this.nameFor('Buffer'), channels, length, sampleRate);
    this.record(`new ${buffer.name}(${channels},${length},${sampleRate})`);
    return buffer;
  }

  async resume(): Promise<void> {
    this.stateCalls.push('resume');
    await Promise.resolve();

    if (!this.resumeRefused) {
      this.setState('running');
    }
  }

  async suspend(): Promise<void> {
    this.stateCalls.push('suspend');
    await Promise.resolve();
    this.setState('suspended');
  }

  /** Suspends the context from outside, as iOS does for a call; resume() is refused until allowResume(). */
  interrupt(): void {
    this.resumeRefused = true;
    this.setState('suspended');
  }

  /** A press, after interrupt(): resume() works again. */
  allowResume(): void {
    this.resumeRefused = false;
  }

  addEventListener(type: string, listener: Callback): void {
    if (type !== 'statechange') {
      throw new Error(`no ${type} events on a fake context`);
    }

    this.listeners.push(listener);
  }

  /** Changes the state, and says so after the code that changed it, as a browser does. */
  private setState(state: 'suspended' | 'running'): void {
    if (state === this.state) {
      return;
    }

    if (state === 'running') {
      this.runningSince = this.clock.now;
    } else if (this.runningSince !== null) {
      this.elapsedMs += this.clock.now - this.runningSince;
      this.runningSince = null;
    }

    this.state = state;
    queueMicrotask(() => this.listeners.forEach((listener) => listener()));
  }
}

/** Lets the context's state changes, its statechange events and what they set off run. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) {
    await Promise.resolve();
  }
}
