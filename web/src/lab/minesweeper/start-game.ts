/**
 * Starts one game in the markup under `root` and wires its parts:
 *
 *   controls, input ──commands──▶ session ──onMove──▶ board view, HUD, sound
 *                                    │
 *                              core (wasm)         preferences: the difficulty,
 *                                                  best times
 *
 * The session is the one copy of the game; the views only read its board.
 * This file holds what belongs to none of them: which difficulty is in
 * play, and recording a win's time. The world isn't the game's: main.ts runs
 * it (worlds.ts).
 */
import { createBoardView } from './board-view.ts';
import { createControls } from './controls.ts';
import { DIFFICULTY, loadGameCore, type DifficultyName } from './game-core.ts';
import { createGameSession } from './game-session.ts';
import { createHud } from './hud.ts';
import { attachInput } from './input.ts';
import type { Preferences } from './preferences.ts';
import type { Sound } from './sound.ts';

/**
 * @param wasm The module's response; main.ts starts the download before this
 *   file has loaded.
 * @param preferences The page's one copy, which main.ts has loaded already.
 * @param sound The page's sound (sound.ts), which plays each move.
 */
export async function startGame(
  root: HTMLElement,
  wasm: Promise<Response>,
  preferences: Preferences,
  sound: Sound,
): Promise<void> {
  const core = await loadGameCore(wasm);
  let difficulty = preferences.difficulty;
  // The page's first game is dealt in silence, as the prototype's is.
  let firstGameDealt = false;

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

      // Last, and guarded: the sound never stops the game.
      if (firstGameDealt) {
        try {
          sound.playMove(move, session.board);
        } catch (error) {
          console.error(error);
        }
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
    onNewGame: () => {
      newGame(difficulty);
      // New game hides until the first reveal, which would leave the
      // keyboard nowhere: it goes on from the board, where the next move is.
      boardView.focus();
    },
  });

  attachInput(root, session);

  function newGame(next: DifficultyName): void {
    difficulty = next;
    preferences.setDifficulty(next);
    controls.showDifficulty(next);
    session.newGame(DIFFICULTY[next]);
  }

  newGame(difficulty);
  firstGameDealt = true;
}
