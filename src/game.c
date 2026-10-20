#include "game.h"
#include "rng.h"

typedef struct {
  int columns;
  int rows;
  int mine_count;
} Preset;

static constexpr Preset PRESETS[] = {
  [DIFFICULTY_BEGINNER] = {9, 9, 10},
  [DIFFICULTY_INTERMEDIATE] = {16, 16, 40},
  [DIFFICULTY_EXPERT] = {30, 16, 99},
};

static constexpr uint64_t PLACEMENT_STREAM = 0;

bool game_new(Game *game, Difficulty difficulty, uint32_t seed) {
  if (difficulty >= sizeof PRESETS / sizeof PRESETS[0]) {
    return false;
  }

  Preset preset = PRESETS[difficulty];
  *game = (Game) {
    .status = GAME_STATUS_READY,
    .columns = preset.columns,
    .rows = preset.rows,
    .mine_count = preset.mine_count,
    .seed = seed,
    .first_cell = -1,
    .exploded_cell = -1,
  };

  return true;
}

static void place_mines(Game *game, int first_cell) {
  int first_row = first_cell / game->columns;
  int first_column = first_cell % game->columns;

  int candidates[MAX_CELLS];
  int candidate_count = 0;

  for (int cell_index = 0; cell_index < game->columns * game->rows; cell_index++) {
    int row = cell_index / game->columns;
    int column = cell_index % game->columns;
    bool is_near_first_cell = row >= first_row - 1 && row <= first_row + 1 && column >= first_column - 1 && column <= first_column + 1;

    if (!is_near_first_cell) {
      candidates[candidate_count++] = cell_index;
    }
  }

  Rng rng;

  rng_seed(&rng, game->seed, PLACEMENT_STREAM);

  for (int i = 0; i < game->mine_count; i++) {
    int pick = i + (int)rng_below(&rng, (uint32_t)(candidate_count - i));
    int picked_cell = candidates[pick];
    candidates[pick] = candidates[i];
    candidates[i] = picked_cell;
    game->cells[picked_cell].has_mine = true;
  }
}

static int find_neighbors(const Game *game, int cell_index, int neighbors[static 8]) {
  int row = cell_index / game->columns;
  int column = cell_index % game->columns;
  int neighbor_count = 0;

  for (int near_row = row - 1; near_row <= row + 1; near_row++) {
    for (int near_column = column - 1; near_column <= column + 1; near_column++) {
      bool is_on_board = near_row >= 0 && near_row < game->rows && near_column >= 0 && near_column < game->columns;
      bool is_self = near_row == row && near_column == column;

      if (is_on_board && !is_self) {
        neighbors[neighbor_count++] = near_row * game->columns + near_column;
      }
    }
  }

  return neighbor_count;
}

static void count_adjacent_mines(Game *game) {
  for (int cell_index = 0; cell_index < game->columns * game->rows; cell_index++) {
    int neighbors[8];
    int neighbor_count = find_neighbors(game, cell_index, neighbors);
    uint8_t adjacent_mine_count = 0;

    for (int i = 0; i < neighbor_count; i++) {
      if (game->cells[neighbors[i]].has_mine) {
        adjacent_mine_count++;
      }
    }

    game->cells[cell_index].adjacent_mine_count = adjacent_mine_count;
  }
}

MoveResult game_reveal(Game *game, int cell_index) {
  if (cell_index < 0 || cell_index >= game->columns * game->rows) {
    return MOVE_IGNORED;
  }

  if (game->status == GAME_STATUS_READY) {
    place_mines(game, cell_index);
    count_adjacent_mines(game);
    game->first_cell = cell_index;
    game->status = GAME_STATUS_PLAYING;
  }

  game->cells[cell_index].is_revealed = true;
  game->revealed_count++;

  return MOVE_OPENED;
}
