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

static void start_game(Game *game, Preset preset, uint32_t seed) {
  *game = (Game) {
    .status = GAME_STATUS_READY,
    .columns = preset.columns,
    .rows = preset.rows,
    .mine_count = preset.mine_count,
    .seed = seed,
    .first_cell = -1,
    .exploded_cell = -1,
  };
}

bool game_new(Game *game, Difficulty difficulty, uint32_t seed) {
  if (difficulty >= sizeof PRESETS / sizeof PRESETS[0]) {
    return false;
  }

  start_game(game, PRESETS[difficulty], seed);

  return true;
}

static bool is_cell_on_board(const Game *game, int cell_index) {
  return cell_index >= 0 && cell_index < game->columns * game->rows;
}

static bool is_over(const Game *game) {
  return game->status == GAME_STATUS_WON || game->status == GAME_STATUS_LOST;
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

static void open_cell(Game *game, int cell_index, int ring) {
  game->cells[cell_index].is_revealed = true;
  game->revealed_count++;
  game->opened_cells[game->opened_count++] = (OpenedCell) {
    .cell_index = (uint16_t)cell_index,
    .ring = (uint16_t)ring,
  };
}

static void open_cascade(Game *game, const int first_cells[], int first_cell_count) {
  game->opened_count = 0;

  for (int i = 0; i < first_cell_count; i++) {
    open_cell(game, first_cells[i], 0);
  }

  for (int next = 0; next < game->opened_count; next++) {
    int cell_index = game->opened_cells[next].cell_index;
    int ring = game->opened_cells[next].ring;

    if (game->cells[cell_index].adjacent_mine_count != 0) {
      continue;
    }

    int neighbors[8];
    int neighbor_count = find_neighbors(game, cell_index, neighbors);

    for (int i = 0; i < neighbor_count; i++) {
      Cell neighbor = game->cells[neighbors[i]];

      if (!neighbor.is_revealed && !neighbor.is_flagged) {
        open_cell(game, neighbors[i], ring + 1);
      }
    }
  }
}

static MoveResult lose(Game *game, int exploded_cell) {
  game->status = GAME_STATUS_LOST;
  game->exploded_cell = exploded_cell;
  game->opened_count = 0;

  return MOVE_LOST;
}

static MoveResult check_win(Game *game) {
  int safe_cell_count = game->columns * game->rows - game->mine_count;

  if (game->revealed_count < safe_cell_count) {
    return MOVE_OPENED;
  }

  game->status = GAME_STATUS_WON;

  for (int cell_index = 0; cell_index < game->columns * game->rows; cell_index++) {
    Cell *cell = &game->cells[cell_index];

    if (cell->has_mine && !cell->is_flagged) {
      cell->is_flagged = true;
      game->flag_count++;
    }
  }

  return MOVE_WON;
}

MoveResult game_reveal(Game *game, int cell_index) {
  if (!is_cell_on_board(game, cell_index) || is_over(game)) {
    return MOVE_IGNORED;
  }

  Cell cell = game->cells[cell_index];

  if (cell.is_revealed || cell.is_flagged) {
    return MOVE_IGNORED;
  }

  if (game->status == GAME_STATUS_READY) {
    place_mines(game, cell_index);
    count_adjacent_mines(game);
    game->first_cell = cell_index;
    game->status = GAME_STATUS_PLAYING;
  }

  if (game->cells[cell_index].has_mine) {
    return lose(game, cell_index);
  }

  open_cascade(game, &cell_index, 1);

  return check_win(game);
}

MoveResult game_toggle_flag(Game *game, int cell_index) {
  if (!is_cell_on_board(game, cell_index) || is_over(game)) {
    return MOVE_IGNORED;
  }

  Cell *cell = &game->cells[cell_index];

  if (cell->is_revealed) {
    return MOVE_IGNORED;
  }

  game->opened_count = 0;
  cell->is_flagged = !cell->is_flagged;

  if (cell->is_flagged) {
    game->flag_count++;

    return MOVE_FLAGGED;
  }

  game->flag_count--;

  return MOVE_UNFLAGGED;
}

MoveResult game_chord(Game *game, int cell_index) {
  if (!is_cell_on_board(game, cell_index) || game->status != GAME_STATUS_PLAYING) {
    return MOVE_IGNORED;
  }

  Cell cell = game->cells[cell_index];

  if (!cell.is_revealed) {
    return MOVE_IGNORED;
  }

  int neighbors[8];
  int neighbor_count = find_neighbors(game, cell_index, neighbors);
  int flagged_neighbor_count = 0;
  int hidden_neighbors[8];
  int hidden_neighbor_count = 0;

  for (int i = 0; i < neighbor_count; i++) {
    Cell neighbor = game->cells[neighbors[i]];

    if (neighbor.is_flagged) {
      flagged_neighbor_count++;
    } else if (!neighbor.is_revealed) {
      hidden_neighbors[hidden_neighbor_count++] = neighbors[i];
    }
  }

  if (hidden_neighbor_count == 0) {
    return MOVE_IGNORED;
  }

  if (flagged_neighbor_count != cell.adjacent_mine_count) {
    return MOVE_REFUSED;
  }

  for (int i = 0; i < hidden_neighbor_count; i++) {
    if (game->cells[hidden_neighbors[i]].has_mine) {
      return lose(game, hidden_neighbors[i]);
    }
  }

  open_cascade(game, hidden_neighbors, hidden_neighbor_count);

  return check_win(game);
}

MoveResult game_replay(Game *game) {
  int first_cell = game->first_cell;

  if (first_cell == -1) {
    return MOVE_IGNORED;
  }

  Preset preset = {game->columns, game->rows, game->mine_count};

  start_game(game, preset, game->seed);

  return game_reveal(game, first_cell);
}

static CellView view_cell(const Game *game, int cell_index) {
  Cell cell = game->cells[cell_index];
  bool is_lost = game->status == GAME_STATUS_LOST;

  if (cell.is_revealed) {
    return (CellView)cell.adjacent_mine_count;
  }

  if (cell_index == game->exploded_cell) {
    return CELL_VIEW_EXPLODED;
  }

  if (cell.is_flagged) {
    return is_lost && !cell.has_mine ? CELL_VIEW_WRONG_FLAG : CELL_VIEW_FLAGGED;
  }

  if (is_lost && cell.has_mine) {
    return CELL_VIEW_MINE;
  }

  return CELL_VIEW_HIDDEN;
}

void game_write_views(const Game *game, CellView views[static MAX_CELLS]) {
  for (int cell_index = 0; cell_index < game->columns * game->rows; cell_index++) {
    views[cell_index] = view_cell(game, cell_index);
  }
}
