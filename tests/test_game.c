#include <string.h>

#include "game.h"
#include "rng.h"
#include "test.h"

static int count_mines(const Game *game) {
  int mine_count = 0;

  for (int i = 0; i < game->columns * game->rows; i++) {
    if (game->cells[i].has_mine) {
      mine_count++;
    }
  }

  return mine_count;
}

static int count_mines_near(const Game *game, int cell_index) {
  int row = cell_index / game->columns;
  int column = cell_index % game->columns;
  int mine_count = 0;

  for (int near_row = row - 1; near_row <= row +1; near_row++) {
    for (int near_column = column - 1; near_column <= column +1; near_column++) {
      bool is_on_board = near_row >= 0 && near_row < game->rows && near_column >= 0 && near_column < game->columns;

      if (is_on_board && game->cells[near_row * game->columns + near_column].has_mine) {
        mine_count++;
      }
    }
  }

  return mine_count;
}

static void open_recursively(const Game *game, bool is_open[], int cell_index) {
  Cell cell = game->cells[cell_index];

  if (is_open[cell_index] || cell.is_flagged) {
    return;
  }

  is_open[cell_index] = true;

  if (cell.adjacent_mine_count != 0) {
    return;
  }

  int row = cell_index / game->columns;
  int column = cell_index % game->columns;

  for (int near_row = row - 1; near_row <= row + 1; near_row++) {
    for (int near_column = column - 1; near_column <= column + 1; near_column++) {
      bool is_on_board = near_row >= 0 && near_row < game->rows && near_column >= 0 && near_column < game->columns;

      if (is_on_board) {
        open_recursively(game, is_open, near_row * game->columns + near_column);
      }
    }
  }
}

static bool lists_each_new_cell_once(const Game *game, int clicked_cell, int revealed_before) {
  if (game->opened_count != game->revealed_count - revealed_before) {
    return false;
  }

  if (game->opened_cells[0].cell_index != clicked_cell) {
    return false;
  }

  bool is_listed[MAX_CELLS] = {};

  for (int i = 0; i < game->opened_count; i++) {
    int cell_index = game->opened_cells[i].cell_index;

    if (is_listed[cell_index] || !game->cells[cell_index].is_revealed) {
      return false;
    }

    is_listed[cell_index] = true;
  }

  return true;
}

static bool rings_count_cascade_steps(const Game *game, int first_cell_count) {
  int rings[MAX_CELLS];

  for (int i = 0; i < MAX_CELLS; i++) {
    rings[i] = -1;
  }

  for (int i = 0; i < game->opened_count; i++) {
    OpenedCell opened = game->opened_cells[i];

    rings[opened.cell_index] = opened.ring;
  }

  for (int i = 0; i < first_cell_count; i++) {
    if (game->opened_cells[i].ring != 0) {
      return false;
    }
  }

  for (int i = first_cell_count; i < game->opened_count; i++) {
    OpenedCell opened = game->opened_cells[i];
    int row = opened.cell_index / game->columns;
    int column = opened.cell_index % game->columns;
    int closest_ring = MAX_CELLS;

    for (int near_row = row - 1; near_row <= row + 1; near_row++) {
      for (int near_column = column - 1; near_column <= column + 1; near_column++) {
        bool is_on_board = near_row >= 0 && near_row < game->rows && near_column >= 0 && near_column < game->columns;
        bool is_self = near_row == row && near_column == column;

        if (!is_on_board || is_self) {
          continue;
        }

        int near_cell = near_row * game->columns + near_column;
        bool is_spreading = rings[near_cell] != -1 && game->cells[near_cell].adjacent_mine_count == 0;

        if (is_spreading && rings[near_cell] < closest_ring) {
          closest_ring = rings[near_cell];
        }
      }
    }

    if (opened.ring != closest_ring + 1) {
      return false;
    }

    if (opened.ring < game->opened_cells[i - 1].ring) {
      return false;
    }
  }

  return true;
}

static bool games_are_equal(const Game *a, const Game *b) {
  bool are_fields_equal =
    a->status == b->status &&
    a->columns == b->columns &&
    a->rows == b->rows &&
    a->mine_count == b->mine_count &&
    a->seed == b->seed &&
    a->first_cell == b->first_cell &&
    a->revealed_count == b->revealed_count &&
    a->flag_count == b->flag_count &&
    a->exploded_cell == b->exploded_cell &&
    a->opened_count == b->opened_count;

  return are_fields_equal &&
    memcmp(a->cells, b->cells, sizeof a->cells) == 0 &&
    memcmp(a->opened_cells, b->opened_cells, (size_t)a->opened_count * sizeof a->opened_cells[0]) == 0;
}

static MoveResult reveal_every_safe_cell(Game *game) {
  MoveResult result = MOVE_IGNORED;

  for (int i = 0; i < game->columns * game->rows; i++) {
    Cell cell = game->cells[i];

    if (!cell.has_mine && !cell.is_revealed) {
      result = game_reveal(game, i);
    }
  }

  return result;
}

static bool ignores_every_command(Game *game) {
  Game before = *game;

  for (int i = 0; i < game->columns * game->rows; i++) {
    if (game_reveal(game, i) != MOVE_IGNORED) {
      return false;
    }

    if (game_toggle_flag(game, i) != MOVE_IGNORED) {
      return false;
    }

    if (game_chord(game, i) != MOVE_IGNORED) {
      return false;
    }
  }

  return games_are_equal(game, &before);
}

static void write_view_board(const Game *game, char board[static 9 * 9 + 1]) {
  constexpr char view_characters[] = "012345678#F*XW";
  CellView views[MAX_CELLS];

  game_write_views(game, views);

  for (int i = 0; i < 9 * 9; i++) {
    board[i] = view_characters[views[i]];
  }

  board[9 * 9] = '\0';
}

typedef enum : uint8_t {
  COMMAND_REVEAL,
  COMMAND_TOGGLE_FLAG,
  COMMAND_CHORD,
  COMMAND_REPLAY,
} Command;

static bool is_hidden_and_safe(Cell cell) {
  return !cell.has_mine && !cell.is_revealed && !cell.is_flagged;
}

static bool is_unflagged_mine(Cell cell) {
  return cell.has_mine && !cell.is_flagged;
}

static bool is_open(Cell cell) {
  return cell.is_revealed;
}

static int find_cell_from(const Game *game, int start, bool (*matches)(Cell cell)) {
  int cell_count = game->columns * game->rows;

  for (int step = 0; step < cell_count; step++) {
    int cell_index = (start + step) % cell_count;

    if (matches(game->cells[cell_index])) {
      return cell_index;
    }
  }

  return start;
}

static MoveResult play_random_command(Game *game, Rng *rng, Command *command) {
  int cell_count = game->columns * game->rows;
  int cell_index = (int)rng_below(rng, (uint32_t)cell_count);
  uint32_t roll = rng_below(rng, 100);
  bool is_finished = game->status == GAME_STATUS_WON || game->status == GAME_STATUS_LOST;

  if (roll < (is_finished ? 20 : 2)) {
    *command = COMMAND_REPLAY;

    return game_replay(game);
  }

  if (roll < 20) {
    *command = COMMAND_REVEAL;

    return game_reveal(game, cell_index);
  }

  if (roll < 50) {
    *command = COMMAND_REVEAL;

    return game_reveal(game, find_cell_from(game, cell_index, is_hidden_and_safe));
  }

  if (roll < 65) {
    *command = COMMAND_TOGGLE_FLAG;

    return game_toggle_flag(game, cell_index);
  }

  if (roll < 80) {
    *command = COMMAND_TOGGLE_FLAG;

    return game_toggle_flag(game, find_cell_from(game, cell_index, is_unflagged_mine));
  }

  *command = COMMAND_CHORD;

  return game_chord(game, find_cell_from(game, cell_index, is_open));
}

static bool counts_match_the_cells(const Game *game) {
  int revealed_count = 0;
  int flag_count = 0;

  for (int i = 0; i < game->columns * game->rows; i++) {
    Cell cell = game->cells[i];

    if (cell.is_revealed && (cell.has_mine || cell.is_flagged)) {
      return false;
    }

    revealed_count += cell.is_revealed;
    flag_count += cell.is_flagged;
  }

  bool is_lost = game->status == GAME_STATUS_LOST;
  bool has_exploded = game->exploded_cell != -1;

  if (is_lost != has_exploded) {
    return false;
  }

  if (has_exploded && !game->cells[game->exploded_cell].has_mine) {
    return false;
  }

  return revealed_count == game->revealed_count && flag_count == game->flag_count;
}

static bool views_hide_the_mines_until_a_loss(const Game *game) {
  CellView views[MAX_CELLS];
  bool is_lost = game->status == GAME_STATUS_LOST;

  game_write_views(game, views);

  for (int i = 0; i < game->columns * game->rows; i++) {
    Cell cell = game->cells[i];
    CellView view = views[i];

    if (cell.is_revealed && view != (CellView)cell.adjacent_mine_count) {
      return false;
    }

    if (!cell.is_revealed && !is_lost && view != CELL_VIEW_HIDDEN && view != CELL_VIEW_FLAGGED) {
      return false;
    }

    if ((view == CELL_VIEW_FLAGGED || view == CELL_VIEW_WRONG_FLAG) && !cell.is_flagged) {
      return false;
    }
  }

  return true;
}

static bool status_moves_forward(GameStatus before, GameStatus after) {
  if (before == GAME_STATUS_WON || before == GAME_STATUS_LOST) {
    return after == before;
  }

  return after >= before;
}

static bool result_fits_the_command(Command command, MoveResult result) {
  switch (command) {
    case COMMAND_REVEAL:
      return result == MOVE_IGNORED || result == MOVE_OPENED || result == MOVE_WON || result == MOVE_LOST;
    case COMMAND_TOGGLE_FLAG:
      return result == MOVE_IGNORED || result == MOVE_FLAGGED || result == MOVE_UNFLAGGED;
    case COMMAND_CHORD:
      return result != MOVE_FLAGGED && result != MOVE_UNFLAGGED;
    case COMMAND_REPLAY:
      return result == MOVE_IGNORED || result == MOVE_OPENED || result == MOVE_WON;
  }

  return false;
}

static bool result_matches_the_change(const Game *before, const Game *after, MoveResult result) {
  int safe_cell_count = after->columns * after->rows - after->mine_count;
  int opened_count = after->revealed_count - before->revealed_count;

  switch (result) {
    case MOVE_IGNORED:
    case MOVE_REFUSED:
      return games_are_equal(before, after);
    case MOVE_OPENED:
      return after->status == GAME_STATUS_PLAYING && opened_count > 0 && after->opened_count == opened_count;
    case MOVE_WON:
      return after->status == GAME_STATUS_WON && after->revealed_count == safe_cell_count && after->flag_count == after->mine_count;
    case MOVE_LOST:
      return after->status == GAME_STATUS_LOST && opened_count == 0 && after->opened_count == 0;
    case MOVE_FLAGGED:
      return after->status == before->status && after->flag_count == before->flag_count + 1 && after->opened_count == 0;
    case MOVE_UNFLAGGED:
      return after->status == before->status && after->flag_count == before->flag_count - 1 && after->opened_count == 0;
  }

  return false;
}

static void new_game_uses_each_preset(void) {
  Game game;

  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 1));
  CHECK(game.columns == 9 && game.rows == 9 && game.mine_count == 10);

  CHECK(game_new(&game, DIFFICULTY_INTERMEDIATE, 1));
  CHECK(game.columns == 16 && game.rows == 16 && game.mine_count == 40);

  CHECK(game_new(&game, DIFFICULTY_EXPERT, 1));
  CHECK(game.columns == 30 && game.rows == 16 && game.mine_count == 99);
}

static void every_preset_fits_and_leaves_room_for_the_first_click(void) {
  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    Game game;

    CHECK(game_new(&game, difficulty, 1));
    CHECK(game.columns <= MAX_COLUMNS && game.rows <= MAX_ROWS);
    CHECK(game.mine_count <= game.columns * game.rows - 9);
  }
}

static void new_game_starts_ready_and_empty(void) {
  Game game;
  memset(&game, 0xAB, sizeof game);

  CHECK(game_new(&game, DIFFICULTY_EXPERT, 12345));

  CHECK(game.status == GAME_STATUS_READY);
  CHECK(game.seed == 12345);
  CHECK(game.first_cell == -1);
  CHECK(game.exploded_cell == -1);
  CHECK(game.revealed_count == 0);
  CHECK(game.flag_count == 0);
  CHECK(game.opened_count == 0);

  bool is_empty = true;

  for (int i = 0; i < game.columns * game.rows; i++) {
    Cell cell = game.cells[i];

    if (cell.has_mine || cell.is_revealed || cell.is_flagged || cell.adjacent_mine_count != 0) {
      is_empty = false;
    }
  }

  CHECK(is_empty);
}

static void new_game_rejects_unknown_difficulty(void) {
  Game game;

  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 7));

  CHECK(!game_new(&game, (Difficulty)3, 99));
  CHECK(game.columns == 9);
  CHECK(game.seed == 7);
}

static void reveal_ignores_cells_off_the_board(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 1));

  CHECK(game_reveal(&game, -1) == MOVE_IGNORED);
  CHECK(game_reveal(&game, 9 * 9) == MOVE_IGNORED);
  CHECK(game.status == GAME_STATUS_READY);
  CHECK(game.first_cell == -1);
}

static void first_reveal_places_every_mine(void) {
  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    Game game;

    CHECK(game_new(&game, difficulty, 1));

    int center = (game.rows / 2) * game.columns + game.columns / 2;

    CHECK(game_reveal(&game, center) == MOVE_OPENED);
    CHECK(count_mines(&game) == game.mine_count);
    CHECK(game.status == GAME_STATUS_PLAYING);
    CHECK(game.first_cell == center);
  }
}

static void first_reveal_keeps_the_first_click_clear(void) {
  constexpr int clicks[] = {0, 29, 7 * 30 + 15, 15 * 30, 16 * 30 - 1};

  bool is_clear = true;

  for (uint32_t seed = 0; seed < 100; seed++) {
    for (size_t i = 0; i < sizeof clicks / sizeof clicks[0]; i++) {
      Game game;

      CHECK(game_new(&game, DIFFICULTY_EXPERT, seed));
      game_reveal(&game, clicks[i]);
      if (count_mines_near(&game, clicks[i]) != 0) {
        is_clear = false;
      }
    }
  }
  CHECK(is_clear);
}

static void every_cell_can_hold_a_mine_equally_often(void) {
  constexpr uint32_t game_count = 7200;
  int mine_counts[9 * 9] = {};

  for (uint32_t seed = 0; seed < game_count; seed++) {
    Game game;
    CHECK(game_new(&game, DIFFICULTY_BEGINNER, seed));
    game_reveal(&game, 40);

    for (int i = 0; i < 9 * 9; i++) {
      if (game.cells[i].has_mine) {
        mine_counts[i]++;
      }
    }
  }

  bool is_uniform = true;

  for (int i = 0; i < 9 * 9; i++) {
    int row = i / 9;
    int column = i % 9;
    bool is_near_click = row >= 3 && row <= 5 && column >= 3 && column <= 5;

    if (!is_near_click && (mine_counts[i] < 850 || mine_counts[i] > 1150)) {
      is_uniform = false;
    }
  }

  CHECK(is_uniform);
}

static void adjacent_counts_match_a_recount(void) {
  bool is_match = true;

  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    for (uint32_t seed = 0; seed < 100; seed++) {
      Game game;

      CHECK(game_new(&game, difficulty, seed));
      game_reveal(&game, 0);

      for (int i = 0; i < game.columns * game.rows; i++) {
        Cell cell = game.cells[i];
        int recount = count_mines_near(&game, i) - cell.has_mine;

        if (cell.adjacent_mine_count != recount) {
          is_match = false;
        }
      }
    }
  }

  CHECK(is_match);
}

static void a_seed_always_deals_the_same_board(void) {
  constexpr char expected[] =
    "000012*10"
    "00001*221"
    "00001111*"
    "000000011"
    "011100000"
    "01*100011"
    "01221124*"
    "001*22***"
    "00112*332";

  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  game_reveal(&game, 40);

  char board[9 * 9 + 1] = {};

  for (int i = 0; i < 9 * 9; i++) {
    Cell cell = game.cells[i];

    board[i] = cell.has_mine ? '*' : (char)('0' + cell.adjacent_mine_count);
  }

  CHECK(strcmp(board, expected) == 0);
}

static void reveal_ignores_open_and_flagged_cells(void) {
  Game game;

  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);

  int revealed_count = game.revealed_count;

  CHECK(game_reveal(&game, 40) == MOVE_IGNORED);
  CHECK(game_reveal(&game, 0) == MOVE_IGNORED);

  CHECK(game_toggle_flag(&game, 8) == MOVE_FLAGGED);
  CHECK(game_reveal(&game, 8) == MOVE_IGNORED);
  CHECK(!game.cells[8].is_revealed);
  CHECK(game.revealed_count == revealed_count);
}

static void a_zero_opens_everything_around_it(void) {
  constexpr char expected[] =
    "00001####"
    "00001####"
    "00001111#"
    "000000011"
    "011100000"
    "01#100011"
    "01221124#"
    "001######"
    "001######";

  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);

  char board[9 * 9 + 1] = {};

  for (int i = 0; i < 9 * 9; i++) {
    Cell cell = game.cells[i];

    board[i] = cell.is_revealed ? (char)('0' + cell.adjacent_mine_count) : '#';
  }

  CHECK(strcmp(board, expected) == 0);
  CHECK(game.revealed_count == 58);
}

static void a_cascade_leaves_flagged_cells_closed(void) {
  Game game;

  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));

  CHECK(game_toggle_flag(&game, 0) == MOVE_FLAGGED);
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(game.cells[0].is_flagged && !game.cells[0].is_revealed);
  CHECK(game.revealed_count == 57);
}

static void reveal_opens_what_a_recursive_fill_opens(void) {
  bool is_match = true;

  for (uint32_t seed = 0; seed < 200; seed++) {
    Game game;
    CHECK(game_new(&game, DIFFICULTY_BEGINNER, seed));

    bool is_open[9 * 9] = {};
    int start = (int)(seed % (9 * 9));

    for (int step = 0; step < 9 * 9; step++) {
      int cell_index = (start + step) % (9 * 9);
      Cell cell = game.cells[cell_index];

      if (cell.has_mine || cell.is_revealed) {
        continue;
      }

      game_reveal(&game, cell_index);
      open_recursively(&game, is_open, cell_index);

      int open_count = 0;

      for (int i = 0; i < 9 * 9; i++) {
        if (game.cells[i].is_revealed != is_open[i]) {
          is_match = false;
        }

        if (is_open[i]) {
          open_count++;
        }
      }

      if (game.revealed_count != open_count) {
        is_match = false;
      }
    }
  }

  CHECK(is_match);
}

static void rings_spread_out_from_the_click(void) {
  constexpr char expected[] =
    "44444####"
    "43333####"
    "43222223#"
    "432111234"
    "432101234"
    "55#111234"
    "66822223#"
    "778######"
    "888######";

  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);

  char board[9 * 9 + 1] = {};
  memset(board, '#', 9 * 9);

  for (int i = 0; i < game.opened_count; i++) {
    OpenedCell opened = game.opened_cells[i];

    board[opened.cell_index] = (char)('0' + opened.ring);
  }

  CHECK(strcmp(board, expected) == 0);
}

static void every_reveal_lists_its_cells_ring_by_ring(void) {
  bool is_listed_once = true;
  bool is_ring_correct = true;

  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    for (uint32_t seed = 0; seed < 100; seed++) {
      Game game;
      CHECK(game_new(&game, difficulty, seed));

      int cell_count = game.columns * game.rows;
      int start = (int)(seed % (uint32_t)cell_count);

      for (int step = 0; step < cell_count; step++) {
        int cell_index = (start + step) % cell_count;
        Cell cell = game.cells[cell_index];

        if (cell.has_mine || cell.is_revealed) {
          continue;
        }

        int revealed_before = game.revealed_count;
        game_reveal(&game, cell_index);

        if (!lists_each_new_cell_once(&game, cell_index, revealed_before)) {
          is_listed_once = false;
        }

        if (!rings_count_cascade_steps(&game, 1)) {
          is_ring_correct = false;
        }
      }
    }
  }

  CHECK(is_listed_once);
  CHECK(is_ring_correct);
}

static void flag_toggles_a_hidden_cell(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));

  CHECK(game_toggle_flag(&game, 40) == MOVE_FLAGGED);
  CHECK(game.cells[40].is_flagged && game.flag_count == 1);
  CHECK(game.status == GAME_STATUS_READY);

  CHECK(game_toggle_flag(&game, 40) == MOVE_UNFLAGGED);
  CHECK(!game.cells[40].is_flagged && game.flag_count == 0);

  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(game_toggle_flag(&game, 14) == MOVE_FLAGGED);
  CHECK(game.opened_count == 0);
}

static void flag_ignores_open_cells_and_cells_off_the_board(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);

  Game before = game;

  CHECK(game_toggle_flag(&game, 40) == MOVE_IGNORED);
  CHECK(game_toggle_flag(&game, -1) == MOVE_IGNORED);
  CHECK(game_toggle_flag(&game, 9 * 9) == MOVE_IGNORED);
  CHECK(games_are_equal(&game, &before));
}

static void flags_can_outnumber_the_mines(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));

  for (int i = 0; i < 11; i++) {
    CHECK(game_toggle_flag(&game, i) == MOVE_FLAGGED);
  }

  CHECK(game.flag_count == 11);
  CHECK(game.mine_count - game.flag_count == -1);
}

static void revealing_a_mine_loses(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);

  CHECK(game_reveal(&game, 14) == MOVE_LOST);
  CHECK(game.status == GAME_STATUS_LOST);
  CHECK(game.exploded_cell == 14);
  CHECK(!game.cells[14].is_revealed);
  CHECK(game.revealed_count == 58);
  CHECK(game.opened_count == 0);
}

static void chord_opens_the_rest_of_a_satisfied_number(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(game_toggle_flag(&game, 26) == MOVE_FLAGGED);

  CHECK(game_chord(&game, 25) == MOVE_OPENED);
  CHECK(game.cells[15].is_revealed && game.cells[16].is_revealed && game.cells[17].is_revealed);
  CHECK(game.revealed_count == 61);
  CHECK(game.opened_count == 3);

  bool is_ring_zero = true;

  for (int i = 0; i < game.opened_count; i++) {
    if (game.opened_cells[i].ring != 0) {
      is_ring_zero = false;
    }
  }

  CHECK(is_ring_zero);
}

static void chord_with_the_wrong_flag_count_is_refused(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);

  Game before = game;

  CHECK(game_chord(&game, 25) == MOVE_REFUSED);
  CHECK(games_are_equal(&game, &before));

  CHECK(game_toggle_flag(&game, 26) == MOVE_FLAGGED);
  CHECK(game_toggle_flag(&game, 15) == MOVE_FLAGGED);
  before = game;

  CHECK(game_chord(&game, 25) == MOVE_REFUSED);
  CHECK(games_are_equal(&game, &before));
}

static void chord_with_a_wrong_flag_loses(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(game_toggle_flag(&game, 15) == MOVE_FLAGGED);

  CHECK(game_chord(&game, 25) == MOVE_LOST);
  CHECK(game.status == GAME_STATUS_LOST);
  CHECK(game.exploded_cell == 26);
  CHECK(!game.cells[16].is_revealed && !game.cells[17].is_revealed);
  CHECK(game.revealed_count == 58);
}

static void chord_ignores_hidden_cells_and_cells_with_nothing_left_to_open(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));

  CHECK(game_chord(&game, 40) == MOVE_IGNORED);
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);

  Game before = game;

  CHECK(game_chord(&game, 26) == MOVE_IGNORED);
  CHECK(game_chord(&game, 40) == MOVE_IGNORED);
  CHECK(game_chord(&game, -1) == MOVE_IGNORED);
  CHECK(game_chord(&game, 9 * 9) == MOVE_IGNORED);
  CHECK(games_are_equal(&game, &before));

  CHECK(game_toggle_flag(&game, 5) == MOVE_FLAGGED);
  CHECK(game_toggle_flag(&game, 14) == MOVE_FLAGGED);
  before = game;

  CHECK(game_chord(&game, 4) == MOVE_IGNORED);
  CHECK(games_are_equal(&game, &before));
}

static void chord_opens_what_revealing_each_hidden_neighbor_opens(void) {
  bool is_match = true;
  bool is_ring_correct = true;
  int win_count = 0;

  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    for (uint32_t seed = 0; seed < 50; seed++) {
      Game game;
      CHECK(game_new(&game, difficulty, seed));

      int cell_count = game.columns * game.rows;

      game_reveal(&game, (game.rows / 2) * game.columns + game.columns / 2);

      for (int i = 0; i < cell_count; i++) {
        if (game.cells[i].has_mine) {
          game_toggle_flag(&game, i);
        }
      }

      bool has_chorded = true;

      while (has_chorded && game.status == GAME_STATUS_PLAYING) {
        has_chorded = false;

        for (int cell_index = 0; cell_index < cell_count && game.status == GAME_STATUS_PLAYING; cell_index++) {
          if (!game.cells[cell_index].is_revealed) {
            continue;
          }

          int row = cell_index / game.columns;
          int column = cell_index % game.columns;
          int hidden_neighbors[8];
          int hidden_neighbor_count = 0;

          for (int near_row = row - 1; near_row <= row + 1; near_row++) {
            for (int near_column = column - 1; near_column <= column + 1; near_column++) {
              bool is_on_board = near_row >= 0 && near_row < game.rows && near_column >= 0 && near_column < game.columns;

              if (!is_on_board) {
                continue;
              }

              int near_cell = near_row * game.columns + near_column;

              if (is_hidden_and_safe(game.cells[near_cell])) {
                hidden_neighbors[hidden_neighbor_count++] = near_cell;
              }
            }
          }

          if (hidden_neighbor_count == 0) {
            continue;
          }

          Game reference = game;

          for (int i = 0; i < hidden_neighbor_count; i++) {
            game_reveal(&reference, hidden_neighbors[i]);
          }

          game_chord(&game, cell_index);
          has_chorded = true;

          if (game.status != reference.status || game.revealed_count != reference.revealed_count) {
            is_match = false;
          }

          for (int i = 0; i < cell_count; i++) {
            if (game.cells[i].is_revealed != reference.cells[i].is_revealed) {
              is_match = false;
            }
          }

          if (!rings_count_cascade_steps(&game, hidden_neighbor_count)) {
            is_ring_correct = false;
          }
        }
      }

      if (game.status == GAME_STATUS_WON) {
        win_count++;
      }
    }
  }

  CHECK(is_match);
  CHECK(is_ring_correct);
  CHECK(win_count > 0);
}

static void revealing_every_safe_cell_wins_without_any_flags(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);

  CHECK(reveal_every_safe_cell(&game) == MOVE_WON);
  CHECK(game.status == GAME_STATUS_WON);
  CHECK(game.revealed_count == 9 * 9 - 10);
}

static void a_win_flags_every_mine(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(game_toggle_flag(&game, 14) == MOVE_FLAGGED);

  CHECK(reveal_every_safe_cell(&game) == MOVE_WON);
  CHECK(game.flag_count == game.mine_count);

  bool is_every_mine_flagged = true;

  for (int i = 0; i < 9 * 9; i++) {
    Cell cell = game.cells[i];

    if (cell.has_mine != cell.is_flagged) {
      is_every_mine_flagged = false;
    }
  }

  CHECK(is_every_mine_flagged);
}

static void every_command_after_the_end_is_ignored(void) {
  Game lost;
  CHECK(game_new(&lost, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&lost, 40) == MOVE_OPENED);
  CHECK(game_toggle_flag(&lost, 15) == MOVE_FLAGGED);
  CHECK(game_reveal(&lost, 14) == MOVE_LOST);
  CHECK(ignores_every_command(&lost));

  Game won;
  CHECK(game_new(&won, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&won, 40) == MOVE_OPENED);
  CHECK(reveal_every_safe_cell(&won) == MOVE_WON);
  CHECK(ignores_every_command(&won));
}

static void replay_deals_the_same_board_and_replays_the_first_click(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(game_toggle_flag(&game, 26) == MOVE_FLAGGED);
  CHECK(game_chord(&game, 25) == MOVE_OPENED);
  CHECK(game_reveal(&game, 14) == MOVE_LOST);

  Game fresh;
  CHECK(game_new(&fresh, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&fresh, 40) == MOVE_OPENED);

  CHECK(game_replay(&game) == MOVE_OPENED);
  CHECK(games_are_equal(&game, &fresh));
}

static void replay_before_the_first_reveal_is_ignored(void) {
  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_toggle_flag(&game, 3) == MOVE_FLAGGED);

  Game before = game;

  CHECK(game_replay(&game) == MOVE_IGNORED);
  CHECK(games_are_equal(&game, &before));
}

static void views_hide_every_mine_while_playing(void) {
  constexpr char expected[] =
    "00001####"
    "00001F###"
    "00001111#"
    "000000011"
    "011100000"
    "01#100011"
    "01221124#"
    "001######"
    "001######";

  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(game_toggle_flag(&game, 14) == MOVE_FLAGGED);

  char board[9 * 9 + 1];
  write_view_board(&game, board);

  CHECK(strcmp(board, expected) == 0);
}

static void views_show_every_mine_and_wrong_flag_after_a_loss(void) {
  constexpr char expected[] =
    "00001WX##"
    "00001F###"
    "00001111*"
    "000000011"
    "011100000"
    "01*100011"
    "01221124*"
    "001*##***"
    "001##*###";

  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(game_toggle_flag(&game, 14) == MOVE_FLAGGED);
  CHECK(game_toggle_flag(&game, 5) == MOVE_FLAGGED);
  CHECK(game_reveal(&game, 6) == MOVE_LOST);

  char board[9 * 9 + 1];
  write_view_board(&game, board);

  CHECK(strcmp(board, expected) == 0);
}

static void views_show_every_mine_flagged_after_a_win(void) {
  constexpr char expected[] =
    "000012F10"
    "00001F221"
    "00001111F"
    "000000011"
    "011100000"
    "01F100011"
    "01221124F"
    "001F22FFF"
    "00112F332";

  Game game;
  CHECK(game_new(&game, DIFFICULTY_BEGINNER, 42));
  CHECK(game_reveal(&game, 40) == MOVE_OPENED);
  CHECK(reveal_every_safe_cell(&game) == MOVE_WON);

  char board[9 * 9 + 1];
  write_view_board(&game, board);

  CHECK(strcmp(board, expected) == 0);
}

static void random_play_keeps_every_rule(void) {
  bool is_counted = true;
  bool is_hidden = true;
  bool is_forward = true;
  bool is_consistent = true;
  int result_counts[MOVE_WON + 1] = {};
  int chord_open_count = 0;

  Rng rng;
  rng_seed(&rng, 2026, 1);

  for (int game_number = 0; game_number < 300; game_number++) {
    Game game;
    CHECK(game_new(&game, (Difficulty)(game_number % 3), rng_next(&rng)));

    for (int move = 0; move < 150; move++) {
      Game before = game;
      Command command;
      MoveResult result = play_random_command(&game, &rng, &command);
      bool was_finished = before.status == GAME_STATUS_WON || before.status == GAME_STATUS_LOST;

      result_counts[result]++;

      if (command == COMMAND_CHORD && (result == MOVE_OPENED || result == MOVE_WON)) {
        chord_open_count++;
      }

      if (!counts_match_the_cells(&game)) {
        is_counted = false;
      }

      if (!views_hide_the_mines_until_a_loss(&game)) {
        is_hidden = false;
      }

      if (command != COMMAND_REPLAY && !status_moves_forward(before.status, game.status)) {
        is_forward = false;
      }

      if (!result_fits_the_command(command, result)) {
        is_consistent = false;
      }

      if (command != COMMAND_REPLAY && !result_matches_the_change(&before, &game, result)) {
        is_consistent = false;
      }

      if (command != COMMAND_REPLAY && was_finished && result != MOVE_IGNORED) {
        is_consistent = false;
      }
    }
  }

  CHECK(is_counted);
  CHECK(is_hidden);
  CHECK(is_forward);
  CHECK(is_consistent);

  CHECK(result_counts[MOVE_IGNORED] > 0);
  CHECK(result_counts[MOVE_OPENED] > 0);
  CHECK(result_counts[MOVE_FLAGGED] > 0);
  CHECK(result_counts[MOVE_UNFLAGGED] > 0);
  CHECK(result_counts[MOVE_REFUSED] > 0);
  CHECK(result_counts[MOVE_LOST] > 0);
  CHECK(result_counts[MOVE_WON] > 0);
  CHECK(chord_open_count > 0);
}

static void the_same_seed_and_commands_play_the_same_game(void) {
  bool is_same = true;

  for (uint32_t seed = 0; seed < 100; seed++) {
    Game first;
    Game second;
    memset(&second, 0xAB, sizeof second);

    CHECK(game_new(&first, (Difficulty)(seed % 3), seed));
    CHECK(game_new(&second, (Difficulty)(seed % 3), seed));

    Rng first_rng;
    Rng second_rng;
    rng_seed(&first_rng, seed, 1);
    rng_seed(&second_rng, seed, 1);

    for (int move = 0; move < 150; move++) {
      Command command;

      play_random_command(&first, &first_rng, &command);
      play_random_command(&second, &second_rng, &command);

      if (!games_are_equal(&first, &second)) {
        is_same = false;
      }
    }
  }

  CHECK(is_same);
}

void test_game(void) {
  new_game_uses_each_preset();
  every_preset_fits_and_leaves_room_for_the_first_click();
  new_game_starts_ready_and_empty();
  new_game_rejects_unknown_difficulty();

  reveal_ignores_cells_off_the_board();
  first_reveal_places_every_mine();
  first_reveal_keeps_the_first_click_clear();
  every_cell_can_hold_a_mine_equally_often();
  adjacent_counts_match_a_recount();
  a_seed_always_deals_the_same_board();

  reveal_ignores_open_and_flagged_cells();
  a_zero_opens_everything_around_it();
  a_cascade_leaves_flagged_cells_closed();
  reveal_opens_what_a_recursive_fill_opens();

  rings_spread_out_from_the_click();
  every_reveal_lists_its_cells_ring_by_ring();

  flag_toggles_a_hidden_cell();
  flag_ignores_open_cells_and_cells_off_the_board();
  flags_can_outnumber_the_mines();
  revealing_a_mine_loses();
  chord_opens_the_rest_of_a_satisfied_number();
  chord_with_the_wrong_flag_count_is_refused();
  chord_with_a_wrong_flag_loses();
  chord_ignores_hidden_cells_and_cells_with_nothing_left_to_open();
  chord_opens_what_revealing_each_hidden_neighbor_opens();
  revealing_every_safe_cell_wins_without_any_flags();
  a_win_flags_every_mine();
  every_command_after_the_end_is_ignored();

  replay_deals_the_same_board_and_replays_the_first_click();
  replay_before_the_first_reveal_is_ignored();
  views_hide_every_mine_while_playing();
  views_show_every_mine_and_wrong_flag_after_a_loss();
  views_show_every_mine_flagged_after_a_win();

  random_play_keeps_every_rule();
  the_same_seed_and_commands_play_the_same_game();
}
