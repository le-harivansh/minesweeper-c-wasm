/**
 * Starts one game in the markup under `root` and wires its parts:
 *
 *   controls, input ──commands──▶ session ──onMove──▶ board view, HUD
 *                                    │
 *                              core (wasm)         preferences: the difficulty,
 *                                                  best times
 *
 * The session is the one copy of the game; the views only read its board.
 * This file holds what belongs to none of them: which difficulty is in
 * play, and recording a win's time.
 */
import { createBoardView } from './board-view.ts';
import { createControls } from './controls.ts';
import { DIFFICULTY, loadGameCore, type DifficultyName } from './game-core.ts';
import { createGameSession } from './game-session.ts';
import { createHud } from './hud.ts';
import { attachInput } from './input.ts';
import { loadPreferences } from './preferences.ts';

/**
 * @param wasm The module's response; main.ts starts the download before this
 *   file has loaded.
 */
export async function startGame(root: HTMLElement, wasm: Promise<Response>): Promise<void> {
  const core = await loadGameCore(wasm);
  const preferences = loadPreferences(browserStorage());
  let difficulty = preferences.difficulty;

  // The session calls onMove only after a command, and the first command
  // comes once the views exist.
  const session = createGameSession(core, {
    onMove: (move) => {
      boardView.showMove(move, session.board);
      hud.showMove(move, session.board);

      if (move.some((event) => event.type === 'gameWon')) {
        // Whole milliseconds: the clock's own fractions say nothing.
        hud.showWin(preferences.recordWin(difficulty, Math.round(session.elapsedMs())));
      }
    },
  });
  const boardView = createBoardView(root);
  const hud = createHud(root, () => session.elapsedMs());
  const controls = createControls(root, {
    // The difficulty in play is already a game: New game is for another.
    onChooseDifficulty: (chosen) => {
      if (chosen !== difficulty) {
        newGame(chosen);
      }
    },
    onNewGame: () => newGame(difficulty),
  });

  attachInput(root, session);

  function newGame(next: DifficultyName): void {
    difficulty = next;
    preferences.setDifficulty(next);
    controls.showDifficulty(next);
    session.newGame(DIFFICULTY[next]);
  }

  newGame(difficulty);
}

/** localStorage, or null where the browser refuses it (reading it can throw). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
