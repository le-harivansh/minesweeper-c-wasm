#include "game.h"
#include "random.h"

/**
 * Each difficulty's board, indexed by Difficulty. The designated indices keep
 * every setup on its own difficulty, whatever order the enum lists them in.
 */
static constexpr BoardSetup BOARD_SETUPS[] = {
  [DIFFICULTY_BEGINNER] = BOARD_SETUP_BEGINNER,
  [DIFFICULTY_INTERMEDIATE] = BOARD_SETUP_INTERMEDIATE,
  [DIFFICULTY_EXPERT] = BOARD_SETUP_EXPERT,
};

/** How many difficulties there are: a Difficulty at or past it is unknown. */
static constexpr int DIFFICULTY_COUNT = sizeof BOARD_SETUPS / sizeof BOARD_SETUPS[0];

/** The random stream the mines are placed from. The game uses no other. */
static constexpr uint64_t PLACEMENT_STREAM = 0;

static int cell_count(const Game *game) {
  return game->columns * game->rows;
}

/**
 * Whether cell_index names a cell on this board. On the all-zeros game of an
 * unknown difficulty none does, so every command on it stops here, before
 * find_neighboring_cells() can divide by its 0 columns.
 */
static bool is_cell_on_board(const Game *game, int cell_index) {
  return cell_index >= 0 && cell_index < cell_count(game);
}

static bool is_over(const Game *game) {
  return game->status == GAME_STATUS_WON || game->status == GAME_STATUS_LOST;
}

/** The cells around one cell: 8, or 5 on an edge, or 3 in a corner. */
typedef struct {
  int count;
  int cell_indices[8];
} Neighbors;

/**
 * Finds the cells around cell_index that are on the board, in cell order.
 *
 * Works in rows and columns, not index offsets: cell_index - 1 from the first
 * column is the last cell of the row above, which isn't a neighbor.
 */
static Neighbors find_neighboring_cells(const Game *game, int cell_index) {
  int row = cell_index / game->columns;
  int column = cell_index % game->columns;
  Neighbors neighbors = {};

  for (int neighbor_row = row - 1; neighbor_row <= row + 1; neighbor_row++) {
    for (int neighbor_column = column - 1; neighbor_column <= column + 1; neighbor_column++) {
      bool is_on_board = neighbor_row >= 0 && neighbor_row < game->rows && neighbor_column >= 0 && neighbor_column < game->columns;
      bool is_self = neighbor_row == row && neighbor_column == column;

      if (is_on_board && !is_self) {
        neighbors.cell_indices[neighbors.count++] = neighbor_row * game->columns + neighbor_column;
      }
    }
  }

  return neighbors;
}

static int count_cells_with_state(const Game *game, CellState state) {
  int count = 0;

  for (int cell_index = 0; cell_index < cell_count(game); cell_index++) {
    if (game->cells[cell_index].state == state) {
      count++;
    }
  }

  return count;
}

/**
 * Adds an event to the move's buffer. No bounds check: MAX_MOVE_EVENTS is the
 * most one move can write (game.h shows why), so it can't overflow.
 */
static void push_event(Game *game, Event event) {
  game->event_buffer.events[game->event_buffer.count++] = event;
}

/**
 * Empties the buffer for a new command. game_reveal() and game_toggle_flag()
 * call this first, and game_create() starts from an empty one, so the buffer
 * holds one move's events at most, which push_event() relies on.
 */
static void clear_event_buffer(Game *game) {
  game->event_buffer.count = 0;
}

// Each change the player can see is made right next to the event that reports
// it, so the events can't miss one.

/**
 * Uncovers a cell and writes its EVENT_CELL_REVEALED. Checks nothing: callers
 * pass only hidden cells with no mine.
 */
static void reveal_cell(Game *game, int cell_index, int ring) {
  Cell *cell = &game->cells[cell_index];

  cell->state = CELL_REVEALED;
  push_event(game, (Event) {
    .type = EVENT_CELL_REVEALED,
    .cell_revealed = {
      .cell_index = cell_index,
      .ring = ring,
      .neighbor_mine_count = cell->neighbor_mine_count,
    },
  });
}

static void flag_cell(Game *game, int cell_index) {
  game->cells[cell_index].state = CELL_FLAGGED;
  push_event(game, (Event) {.type = EVENT_CELL_FLAGGED, .cell.cell_index = cell_index});
}

static void unflag_cell(Game *game, int cell_index) {
  game->cells[cell_index].state = CELL_HIDDEN;
  push_event(game, (Event) {.type = EVENT_CELL_UNFLAGGED, .cell.cell_index = cell_index});
}

/**
 * Puts a mine in a cell and counts it in each neighbor's neighbor_mine_count,
 * so the counts are finished when the last mine is placed.
 */
static void place_mine(Game *game, int cell_index) {
  Neighbors neighbors = find_neighboring_cells(game, cell_index);

  game->cells[cell_index].has_mine = true;

  for (int i = 0; i < neighbors.count; i++) {
    game->cells[neighbors.cell_indices[i]].neighbor_mine_count++;
  }
}

/**
 * Places the game's mines from its seed, anywhere but first_cell and its
 * neighbors: first_cell's count is then 0, so the first reveal cascades.
 *
 * Needs at most rows × columns − 9 mines, or the candidates run out and
 * random_below() gets a bound of 0. Every BoardSetup is well inside that:
 * Expert keeps at least 471 candidates for its 99 mines.
 */
static void place_mines(Game *game, int first_cell) {
  // Nothing here is for the player to see, so it writes no events.
  bool is_kept_clear[MAX_CELLS] = {};
  Neighbors neighbors = find_neighboring_cells(game, first_cell);

  is_kept_clear[first_cell] = true;

  for (int i = 0; i < neighbors.count; i++) {
    is_kept_clear[neighbors.cell_indices[i]] = true;
  }

  int candidates[MAX_CELLS];
  int candidate_count = 0;

  for (int cell_index = 0; cell_index < cell_count(game); cell_index++) {
    if (!is_kept_clear[cell_index]) {
      candidates[candidate_count++] = cell_index;
    }
  }

  // A partial Fisher–Yates shuffle: each pick swaps a random remaining
  // candidate to the front, so the first `mines` candidates end up a uniform
  // random choice.
  Random random = random_create(game->seed, PLACEMENT_STREAM);

  for (int i = 0; i < game->mines; i++) {
    int pick = i + (int)random_below(&random, (uint32_t)(candidate_count - i));
    int picked_cell = candidates[pick];
    candidates[pick] = candidates[i];
    candidates[i] = picked_cell;
    place_mine(game, picked_cell);
  }
}

/**
 * Reveals cell_index and spreads from every revealed cell with a count of 0
 * to its hidden neighbors. Never reaches a mine: a count of 0 means no mine
 * is around, so every cell it spreads to is safe.
 */
static void reveal_cascade(Game *game, int cell_index) {
  // Breadth first, with this move's own CELL_REVEALED events as the queue:
  // cells go in at the back and spread from the front, which writes them ring
  // by ring.
  int next = game->event_buffer.count;

  reveal_cell(game, cell_index, 0);

  while (next < game->event_buffer.count) {
    // Only reveal_cell() writes during the cascade, so this is a
    // CELL_REVEALED and cell_revealed is the member to read.
    Event reached = game->event_buffer.events[next++];
    int reached_cell = reached.cell_revealed.cell_index;

    if (game->cells[reached_cell].neighbor_mine_count != 0) {
      continue;
    }

    Neighbors neighbors = find_neighboring_cells(game, reached_cell);

    for (int i = 0; i < neighbors.count; i++) {
      int neighbor = neighbors.cell_indices[i];

      // reveal_cell() marks a cell revealed as it joins the queue, so a cell
      // reached from two sides joins once. Flagged cells are skipped too.
      if (game->cells[neighbor].state == CELL_HIDDEN) {
        reveal_cell(game, neighbor, reached.cell_revealed.ring + 1);
      }
    }
  }
}

/**
 * Ends the game on a revealed mine: explodes it, shows every other unflagged
 * mine and every wrong flag in cell order, then writes EVENT_GAME_LOST.
 *
 * Changes no cell, so the exploded mine stays CELL_HIDDEN: only the events
 * show what the covers hid.
 */
static void lose(Game *game, int exploded_cell) {
  push_event(game, (Event) {.type = EVENT_MINE_EXPLODED, .cell.cell_index = exploded_cell});

  for (int cell_index = 0; cell_index < cell_count(game); cell_index++) {
    Cell cell = game->cells[cell_index];

    if (cell_index == exploded_cell) {
      continue;
    }

    if (cell.has_mine && cell.state != CELL_FLAGGED) {
      push_event(game, (Event) {.type = EVENT_MINE_SHOWN, .cell.cell_index = cell_index});
    } else if (!cell.has_mine && cell.state == CELL_FLAGGED) {
      push_event(game, (Event) {.type = EVENT_WRONG_FLAG_SHOWN, .cell.cell_index = cell_index});
    }
  }

  game->status = GAME_STATUS_LOST;
  push_event(game, (Event) {.type = EVENT_GAME_LOST});
}

/**
 * Wins the game once every safe cell is revealed: flags each mine not yet
 * flagged, then writes EVENT_GAME_WON.
 *
 * Counting revealed cells is enough: revealing a mine loses the game, so
 * every revealed cell is safe.
 */
static void check_win(Game *game) {
  if (count_cells_with_state(game, CELL_REVEALED) < cell_count(game) - game->mines) {
    return;
  }

  for (int cell_index = 0; cell_index < cell_count(game); cell_index++) {
    Cell cell = game->cells[cell_index];

    if (cell.has_mine && cell.state != CELL_FLAGGED) {
      flag_cell(game, cell_index);
    }
  }

  game->status = GAME_STATUS_WON;
  push_event(game, (Event) {.type = EVENT_GAME_WON});
}

Game game_create(Difficulty difficulty, uint32_t seed) {
  // Difficulty is unsigned, so this one check catches every unknown value.
  if (difficulty >= DIFFICULTY_COUNT) {
    return (Game) {};
  }

  BoardSetup setup = BOARD_SETUPS[difficulty];

  Game game = {
    .rows = setup.rows,
    .columns = setup.columns,
    .mines = setup.mines,
    .seed = seed,
    .status = GAME_STATUS_READY,
  };

  push_event(&game, (Event) {
    .type = EVENT_GAME_CREATED,
    .game_created = {
      .rows = setup.rows,
      .columns = setup.columns,
      .mines = setup.mines,
    },
  });

  return game;
}

void game_reveal(Game *game, int cell_index) {
  clear_event_buffer(game);

  if (!is_cell_on_board(game, cell_index) || is_over(game)) {
    return;
  }

  if (game->cells[cell_index].state != CELL_HIDDEN) {
    return;
  }

  if (game->status == GAME_STATUS_READY) {
    place_mines(game, cell_index);
    game->status = GAME_STATUS_PLAYING;
  }

  if (game->cells[cell_index].has_mine) {
    lose(game, cell_index);
  } else {
    reveal_cascade(game, cell_index);
    check_win(game);
  }
}

void game_toggle_flag(Game *game, int cell_index) {
  clear_event_buffer(game);

  if (!is_cell_on_board(game, cell_index) || is_over(game)) {
    return;
  }

  switch (game->cells[cell_index].state) {
    case CELL_HIDDEN:
      flag_cell(game, cell_index);
      break;
    case CELL_FLAGGED:
      unflag_cell(game, cell_index);
      break;
    case CELL_REVEALED:
      // A revealed cell takes no flag. Listed, not left to a default case, so
      // -Wswitch warns about a CellState missing here.
      break;
  }
}
