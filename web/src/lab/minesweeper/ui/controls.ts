/**
 * The controls above the board: the difficulty and New game. They show which
 * difficulty is in play and report what the player picks; what to do about it
 * is start-game.ts's.
 */
import { isDifficultyName, type DifficultyName } from '../game/core.ts';
import { requireElement } from '../utils.ts';

export interface ControlsActions {
  /** A difficulty button was pressed, the one in play included. */
  onChooseDifficulty(difficulty: DifficultyName): void;
  onNewGame(): void;
}

export interface Controls {
  /** Marks `difficulty`'s button as the one pressed. */
  showDifficulty(difficulty: DifficultyName): void;
}

/** Runs the controls in the markup under `root`. */
export function createControls(root: HTMLElement, actions: ControlsActions): Controls {
  const difficultyGroup = requireElement(root, '.minesweeper__difficulty');
  const difficultyButtons = [
    ...difficultyGroup.querySelectorAll<HTMLButtonElement>('button[data-difficulty]'),
  ];
  const newGameButton = requireElement<HTMLButtonElement>(root, '.minesweeper__new-game');

  difficultyGroup.addEventListener('click', (event) => {
    const name = (event.target as Element).closest<HTMLElement>('[data-difficulty]')?.dataset
      .difficulty;

    if (name !== undefined && isDifficultyName(name)) {
      actions.onChooseDifficulty(name);
    }
  });

  newGameButton.addEventListener('click', () => actions.onNewGame());

  return {
    showDifficulty(difficulty) {
      for (const button of difficultyButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.difficulty === difficulty));
      }
    },
  };
}
