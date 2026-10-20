#include <string.h>

#include "game.h"
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
}
