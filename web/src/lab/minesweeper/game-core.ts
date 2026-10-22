/**
 * The game's core: the WebAssembly module (src/minesweeper.c in the C repo)
 * behind three commands, each of which returns what it changed.
 *
 * This is the only file that knows the module: its exports, its event
 * functions and Difficulty's numbers. Everything else sees GameCore and
 * GameEvent.
 *
 * The module calls one of nine event functions per visible change, in order,
 * before the command returns. Here each of them only appends a typed event to
 * the current move, and the command returns the move as one list. The page
 * needs a whole move before it acts on it (the cascade's rings, whether the
 * game ended), and a function that only appends can never call a command
 * while the module is still sending.
 */

/** Difficulty's values (src/game.h); the module takes the number. */
export const DIFFICULTY = {
  beginner: 0,
  intermediate: 1,
  expert: 2,
} as const;

export type Difficulty = (typeof DIFFICULTY)[keyof typeof DIFFICULTY];

/**
 * One visible change: an event of src/game.h, named after it
 * (EVENT_CELL_REVEALED → 'cellRevealed'). A cell's `ring` is how many steps
 * from the clicked cell (ring 0) the cascade reached it in.
 */
export type GameEvent =
  | { type: 'gameCreated'; rows: number; columns: number; mines: number }
  | { type: 'cellRevealed'; cellIndex: number; ring: number; neighborMineCount: number }
  | { type: 'cellFlagged'; cellIndex: number }
  | { type: 'cellUnflagged'; cellIndex: number }
  | { type: 'mineExploded'; cellIndex: number }
  | { type: 'mineShown'; cellIndex: number }
  | { type: 'wrongFlagShown'; cellIndex: number }
  | { type: 'gameWon' }
  | { type: 'gameLost' };

/**
 * The three commands. Each returns its move: every event it caused, in
 * order, or none - if it changed nothing.
 */
export interface GameCore {
  /**
   * Starts a game; its mines are placed on the first reveal.
   *
   * @param seed Any whole number from 0 to 2³² − 1; the same seed and the same
   *   first reveal place the same mines.
   */
  newGame(difficulty: Difficulty, seed: number): GameEvent[];
  reveal(cellIndex: number): GameEvent[];
  toggleFlag(cellIndex: number): GameEvent[];
}

/** The module's exports (src/minesweeper.c); every argument is an i32. */
interface WasmExports {
  newGame(difficulty: number, seed: number): void;
  reveal(cellIndex: number): void;
  toggleFlag(cellIndex: number): void;
}

/**
 * Compiles and starts the module. Each call starts its own instance, and so
 * its own game.
 *
 * @param source The module, as a response served as application/wasm:
 *   `fetch(url)` in the browser, which compiles it while it downloads, or a
 *   `new Response(bytes, …)` in the tests.
 */
export async function loadGameCore(source: Response | PromiseLike<Response>): Promise<GameCore> {
  let move: GameEvent[] = [];

  const events = {
    onGameCreated: (rows: number, columns: number, mines: number) =>
      move.push({ type: 'gameCreated', rows, columns, mines }),

    onCellRevealed: (cellIndex: number, ring: number, neighborMineCount: number) =>
      move.push({ type: 'cellRevealed', cellIndex, ring, neighborMineCount }),

    onCellFlagged: (cellIndex: number) => move.push({ type: 'cellFlagged', cellIndex }),

    onCellUnflagged: (cellIndex: number) => move.push({ type: 'cellUnflagged', cellIndex }),

    onMineExploded: (cellIndex: number) => move.push({ type: 'mineExploded', cellIndex }),

    onMineShown: (cellIndex: number) => move.push({ type: 'mineShown', cellIndex }),

    onWrongFlagShown: (cellIndex: number) => move.push({ type: 'wrongFlagShown', cellIndex }),

    onGameWon: () => move.push({ type: 'gameWon' }),

    onGameLost: () => move.push({ type: 'gameLost' }),
  };

  const { instance } = await WebAssembly.instantiateStreaming(source, { events });
  const wasm = instance.exports as unknown as WasmExports;

  // A new list per command, not the old one emptied: a move already returned
  // stays as it was.
  function run(command: () => void): GameEvent[] {
    move = [];

    command();

    return move;
  }

  return {
    newGame: (difficulty, seed) => run(() => wasm.newGame(difficulty, seed)),
    reveal: (cellIndex) => run(() => wasm.reveal(cellIndex)),
    toggleFlag: (cellIndex) => run(() => wasm.toggleFlag(cellIndex)),
  };
}
