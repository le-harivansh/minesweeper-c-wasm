/**
 * The particles round the board: what moves in the stage around it, each
 * world its own. Presentation only: the session and the module never hear
 * of them.
 *
 *   deep sea    bubbles rising; now and then a cluster from one spot
 *   night sky   a shooting star now and then
 *   dune        grains on the wind; now and then a gust of them
 *   rainforest  drops falling from the canopy; now and then a run of them
 *               off one leaf
 *
 * The particles lie in a layer of their own, under the HUD, the board
 * and the footer, so they pass behind the board and show around it. This
 * file says when and where each goes; its world's stylesheet how it looks
 * and moves. They come two ways:
 *
 *   steady  a number in view, kept up: as one leaves, the next starts. The
 *           number follows the stage's size, so they're as thick on a
 *           phone as on a desktop.
 *   events  one now and then, after a random wait around an average.
 *
 * A particle lives once: an element with its own place, size and speed in
 * custom properties, removed when its motion ends. Nothing moves while the
 * stage is off screen, and nothing ever does with motion off: the layer
 * stays empty.
 *
 * The particles follow the stage's data-world, whoever sets it (worlds.ts),
 * so the World buttons need not know of them. main.ts loads this file in a
 * chunk of its own once the game nears the viewport.
 */
import { requireElement } from '../utils.ts';
import { isWorldName, type WorldName } from './worlds.ts';

/**
 * How many particles each world has, how fast and how faint: tuned by eye,
 * 2026-10-22.
 */
export const PARTICLES = {
  'deep-sea': {
    /** Bubbles in view per 100 px of the stage's width. */
    bubbles: 3.5,
    /** Seconds a bubble takes to rise through the stage, on average; the large rise faster. */
    riseSeconds: 11.5,
    /** The largest bubble's width, in px; the smallest is 2. */
    largest: 9,
    opacity: 0.45,
    /** Seconds between clusters, on average. */
    clusterEvery: 10,
  },
  'night-sky': {
    /** Seconds between shooting stars, on average. */
    starEvery: 2.5,
    /** The longest tail, in px. */
    tail: 140,
    flightSeconds: 1.5,
    brightness: 0.75,
  },
  dune: {
    /** Grains in view per 100 px of the stage's height. */
    grains: 6,
    /** Seconds a grain takes to cross the stage, on average. */
    crossSeconds: 6,
    opacity: 0.6,
    /** Seconds between gusts, on average. */
    gustEvery: 16,
    /** A gust's streaks, as many times the grains in view. */
    gustStrength: 4,
  },
  rainforest: {
    /** Seconds between drops, on average. */
    dripEvery: 0.7,
    /** Seconds a drop takes from the canopy to the floor. */
    fallSeconds: 1.65,
    opacity: 0.75,
    /** Seconds between runs off a leaf, on average. */
    pourEvery: 9,
  },
} as const;

/** Numbers from 0 to 1 (1 excluded), as Math.random gives them. */
type Random = () => number;

/** The particle layer's size, which is the stage's. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A box in the layer's pixels. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A shooting star's flight: from (x, y), `distance` px along `angle`. */
export interface Flight {
  readonly x: number;
  readonly y: number;
  /** Degrees clockwise from rightward: 8 to 50 falls to the right, 130 to 172 to the left. */
  readonly angle: number;
  readonly distance: number;
}

/**
 * A shooting star's tries at a flight that shows. Over Expert's board only
 * the band above it shows, which one try in seven finds: 24 tries missed it
 * three times in a hundred, 48 miss it once in a thousand.
 */
const FLIGHT_TRIES = 48;
/** A flight seen this much is taken without more tries. */
const SEEN_ENOUGH = 0.85;
/** The points along a flight that seenShare() looks at, less one. */
const SEEN_STEPS = 12;
/** How far round the board a shooting star counts as hidden, in px: one that grazes its edge is. */
const BOARD_MARGIN = 6;

/** A wait around `average` seconds, in milliseconds: 40 to 160 % of it, so never a beat and never a long silence. */
export function waitAround(average: number, random: Random): number {
  return average * (0.4 + 1.2 * random()) * 1000;
}

/** How many steady particles a stage of `size` holds in `world`: bubbles by its width, grains by its height. */
export function steadyCount(world: WorldName, size: Size): number {
  switch (world) {
    case 'deep-sea':
      return Math.round((PARTICLES['deep-sea'].bubbles * size.width) / 100);
    case 'dune':
      return Math.round((PARTICLES.dune.grains * size.height) / 100);
    default:
      return 0;
  }
}

/** How much of `flight` lies in the stage and off the board, from 0 to 1: the share of points along it that do. */
export function seenShare(flight: Flight, size: Size, board: Box): number {
  const radians = (flight.angle * Math.PI) / 180;
  let seen = 0;

  for (let step = 0; step <= SEEN_STEPS; step += 1) {
    const along = (flight.distance * step) / SEEN_STEPS;
    const x = flight.x + Math.cos(radians) * along;
    const y = flight.y + Math.sin(radians) * along;
    const isInStage = x > 0 && x < size.width && y > 0 && y < size.height;
    const isOnBoard = x > board.left && x < board.right && y > board.top && y < board.bottom;

    if (isInStage && !isOnBoard) {
      seen += 1;
    }
  }

  return seen / (SEEN_STEPS + 1);
}

/**
 * A shooting star's flight: of up to 48 random ones, each falling 8 to 50°
 * below level to the left or the right, the one seen most. Beside a small
 * board that's anywhere; over a board that fills the stage, the band above
 * it, where the HUD is.
 */
export function chooseFlight(size: Size, board: Box, random: Random): Flight {
  const randomFlight = (): Flight => {
    const dip = 8 + random() * 42;

    return {
      x: (0.04 + random() * 0.92) * size.width,
      y: (0.03 + random() * 0.72) * size.height,
      angle: random() < 0.5 ? dip : 180 - dip,
      distance: 170 + random() * 170,
    };
  };

  let best = randomFlight();
  let bestSeen = seenShare(best, size, board);

  for (let tries = 1; tries < FLIGHT_TRIES && bestSeen <= SEEN_ENOUGH; tries += 1) {
    const flight = randomFlight();
    const seen = seenShare(flight, size, board);

    if (seen > bestSeen) {
      best = flight;
      bestSeen = seen;
    }
  }

  return best;
}

const px = (value: number) => `${value.toFixed(1)}px`;
const percent = (value: number) => `${value.toFixed(2)}%`;
const seconds = (value: number) => `${value.toFixed(2)}s`;

/** Something that happens now and then: its average wait, in seconds, and what it does. */
interface ParticleEvent {
  readonly every: number;
  readonly fire: () => void;
}

/** A world's particles: its steady ones, if it has any (one more, `isAtStart` along its way), and its events. */
interface WorldParticles {
  readonly addSteady?: (isAtStart: boolean) => void;
  readonly events: readonly ParticleEvent[];
}

/**
 * Runs the particles in the stage under `root`: its world's, while the stage
 * is on screen and motion is on.
 */
export function attachParticles(root: HTMLElement): void {
  const stage = requireElement(root, '.minesweeper__stage');
  const layer = requireElement(root, '.minesweeper__particles');
  const board = requireElement(root, '.minesweeper__board');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const random: Random = Math.random;
  const between = (low: number, high: number) => low + random() * (high - low);

  // The world whose particles are moving; null while they're still.
  let world: WorldName | null = null;
  let isOnScreen = false;
  let size: Size = { width: layer.clientWidth, height: layer.clientHeight };
  // The steady particles in the layer, and how many.
  const steadyParticles = new WeakSet<Element>();
  let steady = 0;
  const timers = new Set<number>();

  /** Adds a particle: its classes name its look in its world's stylesheet; `properties` are its own numbers. */
  function add(className: string, properties: Record<string, string>): HTMLElement {
    const particle = document.createElement('span');
    particle.className = className;

    for (const [name, value] of Object.entries(properties)) {
      particle.style.setProperty(`--${name}`, value);
    }

    layer.append(particle);
    return particle;
  }

  function keepSteady(particle: Element): void {
    steadyParticles.add(particle);
    steady += 1;
  }

  /** A steady particle's delay: as the particles start, it's somewhere along its way already, so the layer is never empty. */
  const startAlong = (isAtStart: boolean, duration: number) =>
    isAtStart ? -random() * duration : 0;

  // Deep sea: a bubble rises from under the stage to over it, swaying. The
  // large rise faster, as real ones do.

  function riseSeconds(width: number): number {
    const largeness = (width - 2) / (PARTICLES['deep-sea'].largest - 2);
    return PARTICLES['deep-sea'].riseSeconds * (1.25 - 0.5 * largeness) * between(0.85, 1.15);
  }

  function addBubble(width: number, x: number, duration: number, delay: number): HTMLElement {
    return add('minesweeper__bubble', {
      x: percent(x),
      size: px(width),
      duration: seconds(duration),
      delay: seconds(delay),
      sway: px(between(1.5, 2.5 + width * 0.6)),
      'sway-duration': seconds(between(1.8, 3.4)),
      opacity: (PARTICLES['deep-sea'].opacity * between(0.55, 1)).toFixed(2),
    });
  }

  function bubble(isAtStart: boolean): void {
    const width = between(2, PARTICLES['deep-sea'].largest);
    const duration = riseSeconds(width);
    keepSteady(addBubble(width, between(1, 99), duration, startAlong(isAtStart, duration)));
  }

  // A cluster: three to six small bubbles from one spot, one after another,
  // a little quicker than the rest.
  function bubbleCluster(): void {
    const x = between(4, 96);
    const count = 3 + Math.floor(random() * 4);
    let delay = 0;

    for (let index = 0; index < count; index += 1) {
      const width = between(2, 3.6);
      addBubble(width, x + between(-0.8, 0.8), riseSeconds(width) * 0.8, delay);
      delay += between(0.12, 0.32);
    }
  }

  // Night sky: a shooting star, on the flight seen most of a few.
  function shootingStar(): void {
    const star = PARTICLES['night-sky'];
    const flight = chooseFlight(size, boardBox(), random);
    const radians = (flight.angle * Math.PI) / 180;

    add('minesweeper__meteor', {
      x: px(flight.x),
      y: px(flight.y),
      angle: `${flight.angle.toFixed(1)}deg`,
      dx: px(Math.cos(radians) * flight.distance),
      dy: px(Math.sin(radians) * flight.distance),
      length: px(star.tail * between(0.55, 1)),
      duration: seconds(star.flightSeconds * between(0.8, 1.25)),
      brightness: (star.brightness * between(0.7, 1)).toFixed(2),
    });
  }

  // Dune: a grain blown across from the left (the dune's wind: a tile blows
  // off to the right), hopping as it goes; a third are streaks, faster. Most
  // are the shadow face's umber, the rest light, catching the sun.

  function crossSeconds(isStreak: boolean): number {
    return PARTICLES.dune.crossSeconds * between(0.75, 1.3) * (isStreak ? 0.75 : 1);
  }

  function addGrain(isStreak: boolean, duration: number, delay: number): HTMLElement {
    const classes = ['minesweeper__grain'];

    if (random() < 0.45) {
      classes.push('minesweeper__grain--light');
    }

    if (isStreak) {
      classes.push('minesweeper__grain--streak');
    }

    return add(classes.join(' '), {
      y: percent(between(3, 97)),
      length: px(isStreak ? between(10, 30) : between(1.6, 2.6)),
      thickness: px(isStreak ? 1 : between(1.6, 2.6)),
      duration: seconds(duration),
      delay: seconds(delay),
      hop: px(isStreak ? between(-3, 3) : between(-7, -2)),
      'hop-duration': seconds(between(0.3, 0.7)),
      opacity: (PARTICLES.dune.opacity * between(0.5, 1)).toFixed(2),
    });
  }

  function grain(isAtStart: boolean): void {
    const isStreak = random() < 0.35;
    const duration = crossSeconds(isStreak);
    keepSteady(addGrain(isStreak, duration, startAlong(isAtStart, duration)));
  }

  // A gust: a burst of streaks, quicker still, set off over a second and a
  // half or so.
  function gust(): void {
    const spread = between(1.3, 1.9);
    const count = Math.round(PARTICLES.dune.gustStrength * steadyCount('dune', size));

    for (let index = 0; index < count; index += 1) {
      addGrain(true, crossSeconds(true) * 0.7, between(0, spread));
    }
  }

  // Rainforest: a drop falls from the canopy (the stage's top) to the floor
  // (its foot), quicker as it goes, and rings where it lands (splash()).

  function drip(x = between(2, 98), delay = 0): void {
    add('minesweeper__drip', {
      x: percent(x),
      length: px(between(8, 13)),
      land: px(between(6, 26)),
      duration: seconds(PARTICLES.rainforest.fallSeconds * between(0.9, 1.1)),
      delay: seconds(delay),
      opacity: (PARTICLES.rainforest.opacity * between(0.6, 1)).toFixed(2),
    });
  }

  function splash(drop: HTMLElement): void {
    add('minesweeper__splash', {
      x: drop.style.getPropertyValue('--x'),
      land: drop.style.getPropertyValue('--land'),
      opacity: drop.style.getPropertyValue('--opacity'),
      size: px(between(12, 22)),
      duration: seconds(between(0.5, 0.8)),
    });
  }

  // A run off one leaf: four to seven drops from one tip, close together.
  function leafPour(): void {
    const x = between(4, 96);
    const count = 4 + Math.floor(random() * 4);
    let delay = 0;

    for (let index = 0; index < count; index += 1) {
      drip(x + between(-0.15, 0.15), delay);
      delay += between(0.12, 0.24);
    }
  }

  const WORLDS: Record<WorldName, WorldParticles> = {
    'deep-sea': {
      addSteady: bubble,
      events: [{ every: PARTICLES['deep-sea'].clusterEvery, fire: bubbleCluster }],
    },
    'night-sky': {
      events: [{ every: PARTICLES['night-sky'].starEvery, fire: shootingStar }],
    },
    dune: {
      addSteady: grain,
      events: [{ every: PARTICLES.dune.gustEvery, fire: gust }],
    },
    rainforest: {
      events: [
        { every: PARTICLES.rainforest.dripEvery, fire: () => drip() },
        { every: PARTICLES.rainforest.pourEvery, fire: leafPour },
      ],
    },
  };

  /** The board's box in the layer's pixels, a margin larger. */
  function boardBox(): Box {
    const layerBox = layer.getBoundingClientRect();
    const box = board.getBoundingClientRect();

    return {
      left: box.left - layerBox.left - BOARD_MARGIN,
      top: box.top - layerBox.top - BOARD_MARGIN,
      right: box.right - layerBox.left + BOARD_MARGIN,
      bottom: box.bottom - layerBox.top + BOARD_MARGIN,
    };
  }

  /** Tops the steady particles up to the number the stage holds; `isAtStart`, along their way. */
  function fill(isAtStart = false): void {
    const current = world;
    const addSteady = current === null ? undefined : WORLDS[current].addSteady;

    if (current === null || addSteady === undefined) {
      return;
    }

    while (steady < steadyCount(current, size)) {
      addSteady(isAtStart);
    }
  }

  function schedule(event: ParticleEvent): void {
    const timer = window.setTimeout(
      () => {
        timers.delete(timer);

        // A hidden page runs no motion, so nothing would leave: add nothing.
        if (!document.hidden) {
          event.fire();
        }

        schedule(event);
      },
      waitAround(event.every, random),
    );

    timers.add(timer);
  }

  function start(next: WorldName): void {
    world = next;
    fill(true);

    for (const event of WORLDS[next].events) {
      schedule(event);
    }
  }

  function stop(): void {
    world = null;

    for (const timer of timers) {
      clearTimeout(timer);
    }

    timers.clear();
    layer.replaceChildren();
    steady = 0;
  }

  /** Moves the stage's world's particles while the stage is on screen and motion is on, and none otherwise. */
  function update(): void {
    const name = stage.dataset.world;
    const next =
      isOnScreen && !reducedMotion.matches && name !== undefined && isWorldName(name) ? name : null;

    if (next !== world) {
      stop();

      if (next !== null) {
        start(next);
      }
    }
  }

  layer.addEventListener('animationend', (event) => {
    const particle = event.target as HTMLElement;

    // A particle's own motion ends its life; its parts' (a tail, a ring) don't.
    if (particle.parentElement !== layer || event.pseudoElement !== '') {
      return;
    }

    particle.remove();

    if (steadyParticles.delete(particle)) {
      steady -= 1;
      fill();
    }

    if (particle.classList.contains('minesweeper__drip')) {
      splash(particle);
    }
  });

  // Each observer reports changes in order: the last is how things stand.

  new ResizeObserver((entries) => {
    for (const entry of entries) {
      size = { width: entry.contentRect.width, height: entry.contentRect.height };
    }

    fill();
  }).observe(layer);

  new IntersectionObserver((entries) => {
    for (const entry of entries) {
      isOnScreen = entry.isIntersecting;
    }

    update();
  }).observe(stage);

  new MutationObserver(update).observe(stage, { attributeFilter: ['data-world'] });
  reducedMotion.addEventListener('change', update);
}
