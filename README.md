# Minesweeper in C

Minesweeper with its rules written in C23 and compiled straight to WebAssembly by clang: no Emscripten, no C standard library, no generated glue code. A small TypeScript front end draws the board, animates it and plays the sound.

Play it, and read about it in the Lab at [harivansh.dev/lab/minesweeper](https://harivansh.dev/lab/minesweeper).

## Features

- **Three boards:** Beginner (9 × 9, 10 mines), Intermediate (16 × 16, 40) and Expert (16 × 30, 99).
- **A safe start:** the mines are placed on the first reveal, never in the 3 × 3 around it, so the first reveal always opens an area.
- **Four worlds:** deep sea, night sky, dune and rainforest, each with its own colours, motion, ambient particles and sound.
- **Sound:** effects and changing soundscapes synthesised with the Web Audio API, with no audio files. Off by default, and loaded only once it is turned on.
- **Mouse, touch and keyboard,** with every cell a real button in an ARIA grid, labelled like "Flagged, row 3, column 27". Motion follows `prefers-reduced-motion`.
- **Remembered on the device:** the difficulty, the world, sound on or off, and the best time at each difficulty.
- **Small:** the WebAssembly module is about 3.5 KB, and nothing loads until the board nears the viewport.

### Controls

| Action             | Mouse       | Touch      | Keyboard                                                                    |
| ------------------ | ----------- | ---------- | --------------------------------------------------------------------------- |
| Reveal a cell      | Click       | Tap        | Enter or Space                                                              |
| Flag or unflag     | Right-click | Long press | F                                                                           |
| Move between cells |             |            | Arrow keys; Home and End for the row's ends, with Ctrl for the board's ends |

## How it works

C owns everything that decides the outcome: the board, the mines, the rules, winning and losing. The browser owns everything else: drawing, motion, sound, input, the timer and storage. The C side has no clock, no randomness, no I/O and no allocation.

The two talk through **commands in, events out**. The module exports three commands, `newGame(difficulty, seed)`, `reveal(cellIndex)` and `toggleFlag(cellIndex)`, and imports nine event functions. Each command changes the game, then calls one JavaScript function for each change the player can see, in the order they happened, before it returns:

```
click ──► input ──► session ──► core.ts ──► reveal(40)          (WebAssembly)
                                                │
                                   game.c applies the rules and
                                   writes the move's events
                                                │
board, HUD, sound ◄── session ◄── core.ts ◄─────┘  onCellRevealed(40, 0, 0)
                                                   onCellRevealed(30, 1, 1)
                                                   …
```

| Event                                               | Data                                     |
| --------------------------------------------------- | ---------------------------------------- |
| `onGameCreated`                                     | `rows`, `columns`, `mines`               |
| `onCellRevealed`                                    | `cellIndex`, `ring`, `neighborMineCount` |
| `onCellFlagged`, `onCellUnflagged`                  | `cellIndex`                              |
| `onMineExploded`, `onMineShown`, `onWrongFlagShown` | `cellIndex`                              |
| `onGameWon`, `onGameLost`                           | none                                     |

A `ring` is how many steps a revealed cell is from the one clicked; the front end times the cascade's ripple and its sound from it. JavaScript never reads the module's memory and never asks the game anything: it keeps its own copy of the board, built from the events.

- **No libc.** The module is built with `-ffreestanding -nostdlib`, and `wasm-ld` refuses any undefined function that isn't a declared import, so a stray `memcpy` fails the build rather than the page.
- **Deterministic.** The mines are placed by a partial Fisher–Yates shuffle driven by [PCG32](https://www.pcg-random.org), seeded by the page from `crypto.getRandomValues`. The same difficulty, seed and first reveal always give the same board, which is what the tests rely on.
- **Static memory.** A game is one flat value of about 9 KB, and the cascade is a breadth-first search that uses the move's own events as its queue.

The front end is one self-contained folder, [`web/src/lab/minesweeper/`](web/src/lab/minesweeper/), whose only entry is `Minesweeper.astro`. It imports nothing from outside itself, so it goes into the site as it is. Around it, `web/` is a minimal Astro project that mirrors harivansh.dev: the same versions, a stand-in Lab page and, in production builds, the site's Content Security Policy.

To embed it elsewhere, note that compiling WebAssembly needs `'wasm-unsafe-eval'` in the page's `script-src`. Without it the browser refuses the module, and the game says it failed to load.

## Getting started

### Requirements

- **clang with the wasm32 target, and `wasm-ld`.** Apple's clang has no wasm32 target, so on macOS install Homebrew's: `brew install llvm lld`. The Makefile uses `/opt/homebrew/opt/llvm/bin/clang`; to use another, pass it in, as in `make CC=clang`.
- **GNU Make** 3.81 or later (the version macOS ships is enough).
- **Node.js** 22.18 or later: the tests run the TypeScript directly.
- **pnpm** 11 or later, for the harness.

### Run it

```sh
git clone https://github.com/le-harivansh/minesweeper-c-wasm.git
cd minesweeper-c-wasm
make dev
```

`make dev` builds the module, installs the harness's packages and starts Astro's dev server. Open the address it prints (http://localhost:4321 by default).

### Commands

Run from the repo root.

| Command                       | What it does                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `make` or `make test`         | Builds and runs the C tests under AddressSanitizer and UndefinedBehaviorSanitizer                      |
| `make test ONLY=reveal`       | Runs only the tests whose name contains `reveal`; `ONLY=random/` runs one module                       |
| `make wasm`                   | Builds `build/minesweeper.wasm` and copies it into the game folder, which reloads a running `make dev` |
| `make test-wasm`              | Tests the built module in Node, loaded the way the browser loads it, then the front end's TypeScript   |
| `make dev`                    | Serves the harness with Astro's dev server                                                             |
| `make preview`                | Builds the harness for production and serves it under the site's Content Security Policy               |
| `make clean`                  | Removes the build output; the harness's packages stay                                                  |
| `pnpm --dir web check`        | Type-checks the harness (`astro check`)                                                                |
| `pnpm --dir web format:check` | Checks the formatting with Prettier                                                                    |

## Tests

- **The rules,** in C, test-first, with a small harness of its own ([`tests/test.h`](tests/test.h)): PCG32 against its reference outputs, each rule, golden boards drawn from the events, determinism, and a fuzzer that plays random commands on random seeds and checks every rule after each one. Any sanitizer report fails the run.
- **The module,** in Node ([`tests/minesweeper.test.mjs`](tests/minesweeper.test.mjs)): its exact exports and imports, and that each event reaches its function with its data.
- **The front end,** with Node's built-in test runner and no framework, in [`web/tests/`](web/tests/), whose folders mirror the game's. The audio runs against a fake `AudioContext` with a virtual clock, and every world is checked for contrast.

## Project layout

```
.
├── src/                          the rules, in C
│   ├── game.h, game.c            board, moves, winning and losing
│   ├── random.h, random.c        PCG32
│   └── minesweeper.c             the WebAssembly boundary: 3 exports, 9 event imports
├── tests/                        the C tests, and the Node test of the built module
├── web/                          the Astro harness, mirroring harivansh.dev
│   ├── src/lab/minesweeper/      the front end, one self-contained folder
│   │   ├── Minesweeper.astro     its only entry: the markup
│   │   ├── main.ts               boot: loads the module as the board nears the viewport
│   │   ├── game/                 the module's loader and the game session
│   │   ├── board/                the grid, input and move timing
│   │   ├── ui/                   controls and HUD
│   │   ├── worlds/               the four worlds: colours, motion, particles
│   │   ├── audio/                the Web Audio engine, effects and soundscapes
│   │   └── assets/               fonts and glyphs
│   └── tests/                    the front end's tests
└── Makefile
```

## Roadmap

- [ ] No-guess boards, from a solver in C
- [ ] An Emscripten build, to compare against

## Acknowledgements

- [PCG](https://www.pcg-random.org) by Melissa O'Neill: [`src/random.c`](src/random.c) implements PCG32 and its unbiased bounded draw.
- [IBM Plex Mono](https://github.com/IBM/plex), under the SIL Open Font License 1.1: the game bundles its 300 and 600 weights.

## License

None; all rights reserved.
