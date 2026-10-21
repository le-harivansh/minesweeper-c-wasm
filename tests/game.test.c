/**
 * @file
 * Tests for game.h.
 *
 * Three kinds of test. The board tests play on one fixed board, Beginner from
 * SEED (written out in a_seed_always_places_the_same_mines()), and compare
 * exact boards and event lists with ones written out here, one character a
 * cell. They can be checked by eye against that board, and a failure shows the
 * cell that changed. The property tests play many seeds and compare the game
 * with a second, simpler working-out: a recount of the neighbor mines, a
 * recursive flood fill, rings worked out from the cascade, counts of where the
 * mines land. The fuzzer plays random commands and checks the rules every move
 * must keep after each one; above all, that the events alone build the board
 * the game holds, since the events are all the browser sees.
 *
 * The tests read the game's fields to check it, mines included. The browser
 * can't: PlayerBoard is its side, a board built from events alone.
 *
 * Every test starts from fixed seeds, so it plays the same games on every run
 * and can't pass once and fail the next time.
 */
#include <stdio.h>
#include <string.h>

#include "game.h"
#include "random.h"
#include "test.h"

/**
 * The seed for every test that doesn't loop over seeds. Any value works, but
 * the board tests name cells of its Beginner board by index (the mine at 14,
 * the 2 at 5), so a new seed means rewriting them.
 */
static constexpr uint32_t SEED = 42;

/** The cells on a Beginner board: 9 × 9. */
static constexpr int BEGINNER_CELLS = BOARD_SETUP_BEGINNER.rows * BOARD_SETUP_BEGINNER.columns;

/** The center of a Beginner board, row 4, column 4: the board tests' first reveal. */
static constexpr int BEGINNER_CENTER = 40;

/**
 * How many cells the first reveal at BEGINNER_CENTER reveals on SEED's board:
 * the digits on a_zero_reveals_everything_around_it()'s board.
 */
static constexpr int FIRST_CASCADE_CELL_COUNT = 58;

/** How many difficulties there are: a Difficulty at or past it is unknown. */
static constexpr int DIFFICULTY_COUNT = DIFFICULTY_EXPERT + 1;

static int count_mines(const Game *game) {
  int mine_count = 0;

  for (int i = 0; i < game->columns * game->rows; i++) {
    if (game->cells[i].has_mine) {
      mine_count++;
    }
  }

  return mine_count;
}

static int count_cells_with_state(const Game *game, CellState state) {
  int count = 0;

  for (int i = 0; i < game->columns * game->rows; i++) {
    if (game->cells[i].state == state) {
      count++;
    }
  }

  return count;
}

/**
 * Counts the mines in the 3×3 neighborhood of cell_index: its neighbors and
 * the cell itself. A recount apart from game.c, which counts as it places each
 * mine.
 */
static int count_mines_in_neighborhood(const Game *game, int cell_index) {
  int row = cell_index / game->columns;
  int column = cell_index % game->columns;
  int mine_count = 0;

  for (int neighbor_row = row - 1; neighbor_row <= row + 1; neighbor_row++) {
    for (int neighbor_column = column - 1; neighbor_column <= column + 1; neighbor_column++) {
      bool is_on_board = neighbor_row >= 0 && neighbor_row < game->rows && neighbor_column >= 0 && neighbor_column < game->columns;

      if (is_on_board && game->cells[neighbor_row * game->columns + neighbor_column].has_mine) {
        mine_count++;
      }
    }
  }

  return mine_count;
}

/**
 * The reference for the cascade: the textbook recursive flood fill, where
 * game.c uses a breadth-first queue. Marks in is_revealed every cell a reveal
 * of cell_index should reveal: the cell, and from each marked cell with a
 * count of 0, its neighbors, skipping flagged cells. Marks stay, so one
 * is_revealed follows a whole game.
 */
static void reveal_recursively(const Game *game, bool is_revealed[], int cell_index) {
  Cell cell = game->cells[cell_index];

  if (is_revealed[cell_index] || cell.state == CELL_FLAGGED) {
    return;
  }

  is_revealed[cell_index] = true;

  if (cell.neighbor_mine_count != 0) {
    return;
  }

  int row = cell_index / game->columns;
  int column = cell_index % game->columns;

  for (int neighbor_row = row - 1; neighbor_row <= row + 1; neighbor_row++) {
    for (int neighbor_column = column - 1; neighbor_column <= column + 1; neighbor_column++) {
      bool is_on_board = neighbor_row >= 0 && neighbor_row < game->rows && neighbor_column >= 0 && neighbor_column < game->columns;

      if (is_on_board) {
        reveal_recursively(game, is_revealed, neighbor_row * game->columns + neighbor_column);
      }
    }
  }
}

// The events a test expects, built the way game.c builds them.

static Event cell_event(EventType type, int cell_index) {
  return (Event) {.type = type, .cell.cell_index = cell_index};
}

static Event revealed_event(int cell_index, int ring, int neighbor_mine_count) {
  return (Event) {
    .type = EVENT_CELL_REVEALED,
    .cell_revealed = {
      .cell_index = cell_index,
      .ring = ring,
      .neighbor_mine_count = neighbor_mine_count,
    },
  };
}

static Event game_created_event(BoardSetup setup) {
  return (Event) {
    .type = EVENT_GAME_CREATED,
    .game_created = {
      .rows = setup.rows,
      .columns = setup.columns,
      .mines = setup.mines,
    },
  };
}

/**
 * Compares two events field by field, reading only the member their type
 * uses. Not memcmp(): it would compare padding and unset union bytes (game.h).
 */
static bool events_are_equal(Event a, Event b) {
  if (a.type != b.type) {
    return false;
  }

  // No default case, so -Wswitch warns about an EventType missing here.
  switch (a.type) {
    case EVENT_GAME_CREATED:
      return a.game_created.rows == b.game_created.rows &&
        a.game_created.columns == b.game_created.columns &&
        a.game_created.mines == b.game_created.mines;
    case EVENT_CELL_REVEALED:
      return a.cell_revealed.cell_index == b.cell_revealed.cell_index &&
        a.cell_revealed.ring == b.cell_revealed.ring &&
        a.cell_revealed.neighbor_mine_count == b.cell_revealed.neighbor_mine_count;
    case EVENT_CELL_FLAGGED:
    case EVENT_CELL_UNFLAGGED:
    case EVENT_MINE_EXPLODED:
    case EVENT_MINE_SHOWN:
    case EVENT_WRONG_FLAG_SHOWN:
      return a.cell.cell_index == b.cell.cell_index;
    case EVENT_GAME_WON:
    case EVENT_GAME_LOST:
      return true;
  }

  return false;
}

/** Whether the game's last move wrote exactly these events, in this order. */
static bool event_buffer_is(const Game *game, const Event expected[], int expected_count) {
  if (game->event_buffer.count != expected_count) {
    return false;
  }

  for (int i = 0; i < expected_count; i++) {
    if (!events_are_equal(game->event_buffer.events[i], expected[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Whether two games are in the same state: every field but the event buffer.
 * memcmp() is safe on cells, unlike on a whole Game: a Cell is three one-byte
 * fields, with no padding. It compares all MAX_CELLS of them, so a write past
 * the board shows too.
 */
static bool states_are_equal(const Game *a, const Game *b) {
  return a->columns == b->columns &&
    a->rows == b->rows &&
    a->mines == b->mines &&
    a->seed == b->seed &&
    a->status == b->status &&
    memcmp(a->cells, b->cells, sizeof a->cells) == 0;
}

/** Whether two games are in the same state and their last moves wrote the same events. */
static bool games_are_equal(const Game *a, const Game *b) {
  return states_are_equal(a, b) && event_buffer_is(a, b->event_buffer.events, b->event_buffer.count);
}

/**
 * Whether a command left the game as it was before, and wrote no events: what
 * game.h promises for every command it ignores.
 */
static bool changed_nothing(const Game *before, const Game *after) {
  return after->event_buffer.count == 0 && states_are_equal(before, after);
}

static bool is_over(const Game *game) {
  return game->status == GAME_STATUS_WON || game->status == GAME_STATUS_LOST;
}

/**
 * The browser's board, in test form: built only from events, one character a
 * cell, so it compares with a board written out by hand.
 *
 *     #    hidden                     X  the mine that exploded
 *     F    flagged                    *  a mine shown after a loss
 *     0–8  revealed, its number       W  a wrong flag shown after a loss
 *
 * cells is a string: a null follows the board's last cell.
 */
typedef struct {
  int columns;
  int rows;
  char cells[MAX_CELLS + 1];
} PlayerBoard;

/**
 * Applies the game's last move to the board, event by event, as the browser
 * would. EVENT_GAME_CREATED sets the board up, so the first move it sees must
 * be a new game's.
 */
static void see_move(PlayerBoard *board, const Game *game) {
  for (int i = 0; i < game->event_buffer.count; i++) {
    Event event = game->event_buffer.events[i];

    switch (event.type) {
      case EVENT_GAME_CREATED:
        board->rows = event.game_created.rows;
        board->columns = event.game_created.columns;
        memset(board->cells, '\0', sizeof board->cells);
        memset(board->cells, '#', (size_t)(board->rows * board->columns));
        break;
      case EVENT_CELL_REVEALED:
        board->cells[event.cell_revealed.cell_index] = (char)('0' + event.cell_revealed.neighbor_mine_count);
        break;
      case EVENT_CELL_FLAGGED:
        board->cells[event.cell.cell_index] = 'F';
        break;
      case EVENT_CELL_UNFLAGGED:
        board->cells[event.cell.cell_index] = '#';
        break;
      case EVENT_MINE_EXPLODED:
        board->cells[event.cell.cell_index] = 'X';
        break;
      case EVENT_MINE_SHOWN:
        board->cells[event.cell.cell_index] = '*';
        break;
      case EVENT_WRONG_FLAG_SHOWN:
        board->cells[event.cell.cell_index] = 'W';
        break;
      case EVENT_GAME_WON:
      case EVENT_GAME_LOST:
        break;
    }
  }
}

/**
 * Writes the board the player should see, in PlayerBoard's characters, worked
 * out from the game's state instead of its events. The fuzzer checks that the
 * two agree after every move.
 *
 * exploded_cell is the mine that exploded, or -1. The game doesn't keep it:
 * only EVENT_MINE_EXPLODED names it.
 */
static void write_board_from_game(const Game *game, int exploded_cell, char board[static MAX_CELLS + 1]) {
  bool is_lost = game->status == GAME_STATUS_LOST;
  int cell_count = game->columns * game->rows;

  for (int i = 0; i < cell_count; i++) {
    Cell cell = game->cells[i];

    if (i == exploded_cell) {
      board[i] = 'X';
    } else if (cell.state == CELL_REVEALED) {
      board[i] = (char)('0' + cell.neighbor_mine_count);
    } else if (cell.state == CELL_FLAGGED) {
      board[i] = is_lost && !cell.has_mine ? 'W' : 'F';
    } else {
      board[i] = is_lost && cell.has_mine ? '*' : '#';
    }
  }

  board[cell_count] = '\0';
}

/** Reveals each safe cell not yet revealed, in cell order: the game is then won. */
static void reveal_every_safe_cell(Game *game) {
  for (int i = 0; i < game->columns * game->rows; i++) {
    Cell cell = game->cells[i];

    if (!cell.has_mine && cell.state != CELL_REVEALED) {
      game_reveal(game, i);
    }
  }
}

/**
 * Whether the game ignores every command: a reveal and a flag on each cell,
 * each leaving the game as it was and writing no events.
 */
static bool ignores_every_command(Game *game) {
  for (int i = 0; i < game->columns * game->rows; i++) {
    Game before = *game;

    game_reveal(game, i);

    if (!changed_nothing(&before, game)) {
      return false;
    }

    game_toggle_flag(game, i);

    if (!changed_nothing(&before, game)) {
      return false;
    }
  }

  return true;
}

/**
 * Whether the last move's EVENT_CELL_REVEALEDs list each cell it revealed
 * exactly once, the clicked cell first. revealed_before is how many cells were
 * revealed before the move.
 */
static bool lists_each_new_cell_once(const Game *game, int clicked_cell, int revealed_before) {
  bool is_listed[MAX_CELLS] = {};
  int listed_count = 0;

  for (int i = 0; i < game->event_buffer.count; i++) {
    Event event = game->event_buffer.events[i];

    if (event.type != EVENT_CELL_REVEALED) {
      continue;
    }

    int cell_index = event.cell_revealed.cell_index;

    if (listed_count == 0 && cell_index != clicked_cell) {
      return false;
    }

    if (is_listed[cell_index] || game->cells[cell_index].state != CELL_REVEALED) {
      return false;
    }

    is_listed[cell_index] = true;
    listed_count++;
  }

  return listed_count == count_cells_with_state(game, CELL_REVEALED) - revealed_before;
}

/**
 * Whether each cell the last move revealed has the right ring, worked out from
 * the move's own events: 0 for the clicked cell; for each other cell, one more
 * than the lowest ring among the neighbors it can have been reached from, the
 * ones this move revealed with a count of 0. Also checks that the rings never
 * go down, so the events come ring by ring.
 */
static bool rings_count_cascade_steps(const Game *game) {
  // Each cell's ring in this move, or -1 if the move didn't reveal it.
  int rings[MAX_CELLS];

  for (int i = 0; i < MAX_CELLS; i++) {
    rings[i] = -1;
  }

  for (int i = 0; i < game->event_buffer.count; i++) {
    Event event = game->event_buffer.events[i];

    if (event.type == EVENT_CELL_REVEALED) {
      rings[event.cell_revealed.cell_index] = event.cell_revealed.ring;
    }
  }

  bool is_first = true;
  int previous_ring = 0;

  for (int i = 0; i < game->event_buffer.count; i++) {
    Event event = game->event_buffer.events[i];

    if (event.type != EVENT_CELL_REVEALED) {
      continue;
    }

    int ring = event.cell_revealed.ring;

    if (is_first) {
      if (ring != 0) {
        return false;
      }

      is_first = false;
      continue;
    }

    int row = event.cell_revealed.cell_index / game->columns;
    int column = event.cell_revealed.cell_index % game->columns;
    // Higher than any ring, so a cell no neighbor can have reached fails the
    // check below.
    int closest_ring = MAX_CELLS;

    for (int neighbor_row = row - 1; neighbor_row <= row + 1; neighbor_row++) {
      for (int neighbor_column = column - 1; neighbor_column <= column + 1; neighbor_column++) {
        bool is_on_board = neighbor_row >= 0 && neighbor_row < game->rows && neighbor_column >= 0 && neighbor_column < game->columns;
        bool is_self = neighbor_row == row && neighbor_column == column;

        if (!is_on_board || is_self) {
          continue;
        }

        int neighbor_cell = neighbor_row * game->columns + neighbor_column;
        bool is_spreading = rings[neighbor_cell] != -1 && game->cells[neighbor_cell].neighbor_mine_count == 0;

        if (is_spreading && rings[neighbor_cell] < closest_ring) {
          closest_ring = rings[neighbor_cell];
        }
      }
    }

    if (ring != closest_ring + 1 || ring < previous_ring) {
      return false;
    }

    previous_ring = ring;
  }

  return true;
}

// The fuzzer: random commands, and the rules every move must keep.

/** The commands the fuzzer plays, named in its report. */
typedef enum : uint8_t {
  COMMAND_NEW_GAME,
  COMMAND_REVEAL,
  COMMAND_TOGGLE_FLAG,
} Command;

static const char *const COMMAND_NAMES[] = {
  [COMMAND_NEW_GAME] = "new game",
  [COMMAND_REVEAL] = "reveal",
  [COMMAND_TOGGLE_FLAG] = "toggle flag",
};

/**
 * The random stream the fuzzer draws its commands from. Any but the game's own,
 * 0: the_same_seed_and_commands_play_the_same_game() seeds the commands and the
 * game with the same number, and on the same stream the commands would draw
 * the very numbers that placed the mines.
 */
static constexpr uint64_t COMMAND_STREAM = 1;

/**
 * How many random commands a fuzzer run plays after its first new game. Enough
 * for most runs to see several games end, nearly all of them in a loss.
 */
static constexpr int COMMANDS_PER_RUN = 150;

static bool is_hidden_and_safe(Cell cell) {
  return !cell.has_mine && cell.state == CELL_HIDDEN;
}

static bool is_unflagged_mine(Cell cell) {
  return cell.has_mine && cell.state != CELL_FLAGGED;
}

/**
 * Finds the first cell that matches, from start on, wrapping around the board;
 * start if none does. A random start spreads the picks over the board.
 */
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

/**
 * Plays one random command on the game, and writes which one to command and
 * cell_index, for the report. Some commands are aimed (a hidden safe cell to
 * reveal, an unflagged mine to flag), so games get far enough to win; the rest
 * go anywhere, so losses, wrong flags and ignored commands happen too.
 */
static void play_random_command(Game *game, Random *random, Command *command, int *cell_index) {
  int cell_count = game->columns * game->rows;
  int random_cell = (int)random_below(random, (uint32_t)cell_count);
  uint32_t roll = random_below(random, 100);

  // roll is a percentage. Each branch's share is given while playing, then,
  // in brackets, once the game is over.
  if (roll < (is_over(game) ? 20 : 2)) {
    // A new game, 2% (20%): rare while playing, so games get far; common once
    // over, so few commands go to a finished game, while some still check
    // that it ignores them.
    *command = COMMAND_NEW_GAME;
    *cell_index = 0;
    // One draw per line: C leaves the order of a call's arguments unspecified.
    Difficulty difficulty = (Difficulty)random_below(random, DIFFICULTY_COUNT);
    uint32_t seed = random_next(random);
    *game = game_create(difficulty, seed);
  } else if (roll < 27) {
    // A reveal anywhere, 25% (7%): most of the losses, and reveals of
    // revealed and flagged cells.
    *command = COMMAND_REVEAL;
    *cell_index = random_cell;
    game_reveal(game, *cell_index);
  } else if (roll < 62) {
    // A reveal of a hidden safe cell, 35%: the cascades and the wins.
    *command = COMMAND_REVEAL;
    *cell_index = find_cell_from(game, random_cell, is_hidden_and_safe);
    game_reveal(game, *cell_index);
  } else if (roll < 81) {
    // A flag anywhere, 19%: wrong flags, flags taken off, and flags on
    // revealed cells.
    *command = COMMAND_TOGGLE_FLAG;
    *cell_index = random_cell;
    game_toggle_flag(game, *cell_index);
  } else {
    // A flag on an unflagged mine, 19%: a win then finds some mines flagged
    // already, and a loss some mines it mustn't show.
    *command = COMMAND_TOGGLE_FLAG;
    *cell_index = find_cell_from(game, random_cell, is_unflagged_mine);
    game_toggle_flag(game, *cell_index);
  }
}

/** Whether no mine is revealed: not even the one that explodes, which stays hidden. */
static bool no_mine_is_revealed(const Game *game) {
  for (int i = 0; i < game->columns * game->rows; i++) {
    Cell cell = game->cells[i];

    if (cell.state == CELL_REVEALED && cell.has_mine) {
      return false;
    }
  }

  return true;
}

/**
 * Whether a move names each cell at most once: the rule that keeps a move's
 * events within MAX_MOVE_EVENTS (game.h).
 */
static bool names_each_cell_at_most_once(const EventBuffer *move) {
  bool is_named[MAX_CELLS] = {};

  for (int i = 0; i < move->count; i++) {
    Event event = move->events[i];

    if (event.type == EVENT_GAME_CREATED || event.type == EVENT_GAME_WON || event.type == EVENT_GAME_LOST) {
      continue;
    }

    // cell_index comes first in both cell and cell_revealed, so this reads it
    // for every event that names a cell.
    if (is_named[event.cell.cell_index]) {
      return false;
    }

    is_named[event.cell.cell_index] = true;
  }

  return true;
}

/**
 * Whether the move writes EVENT_GAME_WON or EVENT_GAME_LOST exactly when it
 * wins or loses the game: once, as its last event. A move that doesn't end
 * the game writes neither.
 */
static bool ends_exactly_when_the_game_ends(const Game *before, const Game *after) {
  const EventBuffer *move = &after->event_buffer;
  bool has_won = before->status != GAME_STATUS_WON && after->status == GAME_STATUS_WON;
  bool has_lost = before->status != GAME_STATUS_LOST && after->status == GAME_STATUS_LOST;
  int end_count = 0;

  for (int i = 0; i < move->count; i++) {
    EventType type = move->events[i].type;

    if (type == EVENT_GAME_WON || type == EVENT_GAME_LOST) {
      end_count++;
    }
  }

  if (!has_won && !has_lost) {
    return end_count == 0;
  }

  if (move->count == 0) {
    return false;
  }

  EventType last = move->events[move->count - 1].type;

  return end_count == 1 && last == (has_won ? EVENT_GAME_WON : EVENT_GAME_LOST);
}

/**
 * Whether the move's events are ones its command can write (game.h): a new
 * game, EVENT_GAME_CREATED alone; a flag, one flag event on its cell; a
 * reveal, either an explosion of the revealed mine or a cascade that starts
 * at the revealed cell, ring 0. No events at all always fits: other rules
 * check that the command then changed nothing.
 */
static bool move_fits_the_command(const Game *after, Command command, int cell_index) {
  const EventBuffer *move = &after->event_buffer;

  if (command == COMMAND_NEW_GAME) {
    return move->count == 1 && move->events[0].type == EVENT_GAME_CREATED;
  }

  if (move->count == 0) {
    return true;
  }

  Event first = move->events[0];

  if (command == COMMAND_TOGGLE_FLAG) {
    bool is_flag_event = first.type == EVENT_CELL_FLAGGED || first.type == EVENT_CELL_UNFLAGGED;

    return move->count == 1 && is_flag_event && first.cell.cell_index == cell_index;
  }

  bool has_flag = false;

  // A reveal never starts a game or takes a flag off, and a mine explodes
  // only as its first event.
  for (int i = 0; i < move->count; i++) {
    EventType type = move->events[i].type;

    if (type == EVENT_GAME_CREATED || type == EVENT_CELL_UNFLAGGED || (type == EVENT_MINE_EXPLODED && i != 0)) {
      return false;
    }

    if (type == EVENT_CELL_FLAGGED) {
      has_flag = true;
    }
  }

  // A reveal flags cells only when it wins.
  if (has_flag && move->events[move->count - 1].type != EVENT_GAME_WON) {
    return false;
  }

  if (first.type == EVENT_MINE_EXPLODED) {
    return first.cell.cell_index == cell_index && after->cells[cell_index].has_mine;
  }

  return first.type == EVENT_CELL_REVEALED && first.cell_revealed.cell_index == cell_index && first.cell_revealed.ring == 0;
}

/**
 * Whether the status only moved forward: ready, then playing, then won or
 * lost, and nowhere from won or lost. `after >= before` relies on GameStatus
 * listing them in that order.
 */
static bool status_moves_forward(GameStatus before, GameStatus after) {
  if (before == GAME_STATUS_WON || before == GAME_STATUS_LOST) {
    return after == before;
  }

  return after >= before;
}

/**
 * Checks one move against every rule, and returns the first rule it breaks,
 * as the sentence the report prints, or nullptr if it keeps them all. before
 * and after are the game either side of the move; board has seen the move.
 */
static const char *find_broken_rule(
  const Game *before,
  const Game *after,
  Command command,
  int cell_index,
  const PlayerBoard *board,
  int exploded_cell
) {
  char board_from_game[MAX_CELLS + 1];
  write_board_from_game(after, exploded_cell, board_from_game);

  if (!no_mine_is_revealed(after)) {
    return "no mine is revealed";
  }

  if (strcmp(board->cells, board_from_game) != 0) {
    return "the events build the game's board";
  }

  if (!move_fits_the_command(after, command, cell_index)) {
    return "the move fits the command";
  }

  if (!names_each_cell_at_most_once(&after->event_buffer)) {
    return "a move names each cell at most once";
  }

  // The rules below compare the game with the one before the move, which a
  // new game replaces.
  if (command == COMMAND_NEW_GAME) {
    return nullptr;
  }

  if (after->event_buffer.count == 0 && !states_are_equal(before, after)) {
    return "a move with no events changes nothing";
  }

  if (!ends_exactly_when_the_game_ends(before, after)) {
    return "a move ends the game exactly when the game ends";
  }

  if (!status_moves_forward(before->status, after->status)) {
    return "status moves forward";
  }

  if (is_over(before) && after->event_buffer.count != 0) {
    return "a game that is over ignores every command";
  }

  return nullptr;
}

/** The first rule the fuzzer saw broken, and the move that broke it. */
typedef struct {
  const char *rule;
  int run;
  uint32_t seed;
  int move;
  Command command;
  int cell_index;
  int event_count;
} BrokenRule;

/**
 * game_create() sets up each difficulty's board, and its EVENT_GAME_CREATED
 * says so.
 *
 * The sizes are classic Minesweeper's: 9 × 9 with 10 mines, 16 × 16 with 40,
 * and 30 columns × 16 rows with 99. Written out as numbers, not read from the
 * BoardSetup constants, so a change to a constant shows up here.
 */
static void create_uses_each_board_setup(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  CHECK_INT_EQUAL(game.columns, 9);
  CHECK_INT_EQUAL(game.rows, 9);
  CHECK_INT_EQUAL(game.mines, 10);

  Event beginner_created[] = {game_created_event(BOARD_SETUP_BEGINNER)};
  CHECK(event_buffer_is(&game, beginner_created, 1));

  game = game_create(DIFFICULTY_INTERMEDIATE, SEED);
  CHECK_INT_EQUAL(game.columns, 16);
  CHECK_INT_EQUAL(game.rows, 16);
  CHECK_INT_EQUAL(game.mines, 40);

  Event intermediate_created[] = {game_created_event(BOARD_SETUP_INTERMEDIATE)};
  CHECK(event_buffer_is(&game, intermediate_created, 1));

  game = game_create(DIFFICULTY_EXPERT, SEED);
  CHECK_INT_EQUAL(game.columns, 30);
  CHECK_INT_EQUAL(game.rows, 16);
  CHECK_INT_EQUAL(game.mines, 99);

  Event expert_created[] = {game_created_event(BOARD_SETUP_EXPERT)};
  CHECK(event_buffer_is(&game, expert_created, 1));
}

/**
 * Every board fits in MAX_CELLS, and has room for its mines outside the first
 * reveal's 3×3 neighborhood (the 9), which the placement keeps clear.
 *
 * Without that room, the candidates for a mine would run out before the last
 * one, and random_below() would get a bound of 0.
 */
static void every_board_setup_fits_and_leaves_room_for_the_first_click(void) {
  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    Game game = game_create(difficulty, SEED);
    CHECK(game.columns * game.rows <= MAX_CELLS);
    CHECK(game.mines <= game.columns * game.rows - 9);
  }
}

/**
 * game_create() returns a game ready for its first reveal: the seed kept, no
 * mines, every cell hidden with a count of 0, and EVENT_GAME_CREATED as its
 * only event.
 */
static void create_returns_a_ready_and_empty_game(void) {
  Game game = game_create(DIFFICULTY_EXPERT, SEED);

  CHECK_INT_EQUAL(game.status, GAME_STATUS_READY);
  CHECK_INT_EQUAL(game.seed, SEED);

  Event expected[] = {game_created_event(BOARD_SETUP_EXPERT)};
  CHECK(event_buffer_is(&game, expected, 1));

  bool is_empty = true;

  for (int i = 0; i < game.columns * game.rows; i++) {
    Cell cell = game.cells[i];

    if (cell.has_mine || cell.state != CELL_HIDDEN || cell.neighbor_mine_count != 0) {
      is_empty = false;
    }
  }

  CHECK(is_empty);
}

/**
 * game_create() returns the all-zeros game for an unknown difficulty, seed
 * included, and every command on it does nothing.
 *
 * Only a bug sends one: minesweeper_new_game() checks the difficulty first.
 * The commands must stop at their on-board check, since a board of 0 columns
 * would divide by 0 past it.
 */
static void create_returns_all_zeros_for_an_unknown_difficulty(void) {
  // The first value past the last difficulty.
  Game game = game_create((Difficulty)DIFFICULTY_COUNT, SEED);
  Game all_zeros = {};
  CHECK(games_are_equal(&game, &all_zeros));

  game_reveal(&game, 0);
  CHECK(changed_nothing(&all_zeros, &game));

  game_toggle_flag(&game, 0);
  CHECK(changed_nothing(&all_zeros, &game));
}

/**
 * game_reveal() ignores a cell off the board, even as the first reveal, which
 * would otherwise place the mines around it.
 *
 * BEGINNER_CELLS is the first index past the board, but still inside cells,
 * which is sized for Expert: a check against MAX_CELLS instead of the board's
 * own size would let it through.
 */
static void reveal_ignores_cells_off_the_board(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  Game before = game;

  game_reveal(&game, -1);
  CHECK(changed_nothing(&before, &game));

  game_reveal(&game, BEGINNER_CELLS);
  CHECK(changed_nothing(&before, &game));
}

/** The first reveal places all of the board's mines and starts play, on every difficulty. */
static void first_reveal_places_every_mine(void) {
  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    Game game = game_create(difficulty, SEED);

    int center = (game.rows / 2) * game.columns + game.columns / 2;

    game_reveal(&game, center);
    CHECK_INT_EQUAL(count_mines(&game), game.mines);
    CHECK_INT_EQUAL(game.status, GAME_STATUS_PLAYING);
  }
}

/**
 * The first reveal never has a mine in its 3×3 neighborhood, so it is never a
 * mine itself and always cascades.
 *
 * On Expert, from 100 seeds, at each corner and near the center. Each corner
 * is clipped by two edges, so between them they try all four of the
 * neighborhood's edge checks. Mines placed anywhere, or only the clicked cell
 * kept clear, would land in some neighborhood here: by chance, a corner's
 * 3 neighbors are all clear only about half the time.
 */
static void first_reveal_keeps_the_first_click_clear(void) {
  // Expert is 30 columns × 16 rows.
  constexpr int clicks[] = {
    0,            // Top-left corner.
    29,           // Top-right corner.
    7 * 30 + 15,  // Row 7, column 15: near the center, with all 8 neighbors.
    15 * 30,      // Bottom-left corner.
    16 * 30 - 1,  // Bottom-right corner, the last cell.
  };

  bool is_clear = true;

  for (uint32_t seed = 0; seed < 100; seed++) {
    for (size_t i = 0; i < sizeof clicks / sizeof clicks[0]; i++) {
      Game game = game_create(DIFFICULTY_EXPERT, seed);
      game_reveal(&game, clicks[i]);

      if (count_mines_in_neighborhood(&game, clicks[i]) != 0) {
        is_clear = false;
      }
    }
  }

  CHECK(is_clear);
}

/**
 * Every cell outside the first reveal's neighborhood holds a mine equally
 * often: the placement favours none.
 *
 * 7,200 Beginner games, first revealed at the center. Each places 10 mines
 * among the 72 cells outside the center's 3×3, so each of those cells should
 * hold a mine in 7200 × 10/72 = 1,000 games, give or take 29 (one standard
 * deviation, sqrt(7200 × 10/72 × 62/72)). The window, ±150, is about 5
 * standard deviations.
 *
 * A placement that picks any cell and moves on to the next free one when the
 * pick is kept clear or taken falls outside: the cell after the 3×3 in each of
 * its rows also gets the picks of the 3 cells before it, and holds a mine in
 * about 2,900 games.
 */
static void every_cell_can_hold_a_mine_equally_often(void) {
  constexpr int game_count = 7200;
  constexpr int candidate_count = BEGINNER_CELLS - 9;                                         // 72
  constexpr int expected_count = game_count * BOARD_SETUP_BEGINNER.mines / candidate_count;  // 1,000
  constexpr int tolerance = 150;
  int mine_counts[BEGINNER_CELLS] = {};

  for (uint32_t seed = 0; seed < game_count; seed++) {
    Game game = game_create(DIFFICULTY_BEGINNER, seed);
    game_reveal(&game, BEGINNER_CENTER);

    for (int i = 0; i < BEGINNER_CELLS; i++) {
      if (game.cells[i].has_mine) {
        mine_counts[i]++;
      }
    }
  }

  for (int i = 0; i < BEGINNER_CELLS; i++) {
    int row = i / 9;
    int column = i % 9;
    // Rows and columns 3 to 5: the 3×3 around the center, row 4, column 4.
    bool is_kept_clear = row >= 3 && row <= 5 && column >= 3 && column <= 5;

    if (!is_kept_clear) {
      CHECK_INT_NEAR(mine_counts[i], expected_count, tolerance);
    }
  }
}

/**
 * Every cell's neighbor_mine_count, a mine's included, matches a recount of
 * the mines around it, on every difficulty from 100 seeds. The first reveal, at
 * cell 0, only places the mines.
 */
static void neighbor_counts_match_a_recount(void) {
  bool is_match = true;

  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    for (uint32_t seed = 0; seed < 100; seed++) {
      Game game = game_create(difficulty, seed);
      game_reveal(&game, 0);

      for (int i = 0; i < game.columns * game.rows; i++) {
        Cell cell = game.cells[i];
        // The neighborhood includes the cell, and a cell's own mine isn't one
        // of its neighbors'.
        int recount = count_mines_in_neighborhood(&game, i) - cell.has_mine;

        if (cell.neighbor_mine_count != recount) {
          is_match = false;
        }
      }
    }
  }

  CHECK(is_match);
}

/**
 * SEED, first revealed at the center, places the mines in these cells, on
 * every run and every build: * a mine, a digit its count.
 *
 * This is the board the board tests play on, and the map for reading them.
 * If the placement changes (random.h's numbers, random_below()'s method, the
 * order of the candidates, the shuffle), this test shows the new board, and
 * they fail with it.
 *
 * Worked out apart from game.c too, by a separate program: the 72 candidates
 * in cell order, each pick i swapped with the candidate at
 * i + random_below(&random, 72 − i), from random_create(42, 0).
 */
static void a_seed_always_places_the_same_mines(void) {
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

  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);

  char board[BEGINNER_CELLS + 1] = {};

  for (int i = 0; i < BEGINNER_CELLS; i++) {
    Cell cell = game.cells[i];

    board[i] = cell.has_mine ? '*' : (char)('0' + cell.neighbor_mine_count);
  }

  CHECK_STRING_EQUAL(board, expected);
}

/**
 * game_reveal() ignores a cell already revealed, by the click or by its
 * cascade, and a flagged cell. The flagged cell, 8, is a 0: revealing it
 * would reveal its neighbors too.
 */
static void reveal_ignores_revealed_and_flagged_cells(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);
  game_toggle_flag(&game, 8);

  Game before = game;

  game_reveal(&game, BEGINNER_CENTER);
  CHECK(changed_nothing(&before, &game));

  game_reveal(&game, 0);
  CHECK(changed_nothing(&before, &game));

  game_reveal(&game, 8);
  CHECK(changed_nothing(&before, &game));
}

/**
 * Revealing a number reveals only that cell: one event, ring 0, with its
 * count. Cell 5 is a 2, beside the mines at 6 and 14.
 */
static void reveal_of_a_number_writes_one_event(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);

  game_reveal(&game, 5);

  Event expected[] = {revealed_event(5, 0, 2)};
  CHECK(event_buffer_is(&game, expected, 1));
}

/**
 * The first reveal, a 0, cascades: from each revealed 0 to its neighbors,
 * stopping at the numbers that fence in the mines. # is a cell left hidden.
 * The move doesn't win, so its events are exactly one for each revealed cell.
 */
static void a_zero_reveals_everything_around_it(void) {
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

  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);

  char board[BEGINNER_CELLS + 1] = {};

  for (int i = 0; i < BEGINNER_CELLS; i++) {
    Cell cell = game.cells[i];

    board[i] = cell.state == CELL_REVEALED ? (char)('0' + cell.neighbor_mine_count) : '#';
  }

  CHECK_STRING_EQUAL(board, expected);
  CHECK_INT_EQUAL(count_cells_with_state(&game, CELL_REVEALED), FIRST_CASCADE_CELL_COUNT);
  CHECK_INT_EQUAL(game.event_buffer.count, FIRST_CASCADE_CELL_COUNT);
}

/**
 * A cascade leaves a flagged cell hidden: cell 0, a 0 the first reveal would
 * reveal, keeps its flag, and the move reveals one cell fewer. The flag goes
 * on before the first reveal, which game.h allows.
 */
static void a_cascade_leaves_flagged_cells_hidden(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);

  game_toggle_flag(&game, 0);
  game_reveal(&game, BEGINNER_CENTER);

  CHECK_INT_EQUAL(game.cells[0].state, CELL_FLAGGED);
  CHECK_INT_EQUAL(count_cells_with_state(&game, CELL_REVEALED), FIRST_CASCADE_CELL_COUNT - 1);
  CHECK_INT_EQUAL(game.event_buffer.count, FIRST_CASCADE_CELL_COUNT - 1);
}

/**
 * Every reveal reveals the same cells as reveal_recursively(), the textbook
 * flood fill.
 *
 * From 200 Beginner seeds, each game reveals every safe cell in turn, from a
 * different start, and the whole board is compared after each reveal. On odd
 * seeds, every 7th cell is flagged first, so the cascades must go around
 * flags.
 */
static void reveal_matches_a_recursive_fill(void) {
  bool is_match = true;

  for (uint32_t seed = 0; seed < 200; seed++) {
    Game game = game_create(DIFFICULTY_BEGINNER, seed);

    if (seed % 2 == 1) {
      for (int i = 0; i < BEGINNER_CELLS; i += 7) {
        game_toggle_flag(&game, i);
      }
    }

    bool is_revealed[BEGINNER_CELLS] = {};
    int start = (int)(seed % BEGINNER_CELLS);

    for (int step = 0; step < BEGINNER_CELLS; step++) {
      int cell_index = (start + step) % BEGINNER_CELLS;
      Cell cell = game.cells[cell_index];

      if (cell.has_mine || cell.state == CELL_REVEALED) {
        continue;
      }

      game_reveal(&game, cell_index);
      reveal_recursively(&game, is_revealed, cell_index);

      int revealed_count = 0;

      for (int i = 0; i < BEGINNER_CELLS; i++) {
        if ((game.cells[i].state == CELL_REVEALED) != is_revealed[i]) {
          is_match = false;
        }

        if (is_revealed[i]) {
          revealed_count++;
        }
      }

      if (count_cells_with_state(&game, CELL_REVEALED) != revealed_count) {
        is_match = false;
      }
    }
  }

  CHECK(is_match);
}

/**
 * The first reveal's rings, each cell's digit here: 0 at the click, then one
 * more for each step the cascade takes. # is a cell left hidden.
 *
 * A ring counts steps through the cascade, not distance: cell 56 (row 6,
 * column 2) is two cells from the click but in ring 8. The cascade spreads
 * only from 0s, so it reaches 56 the long way round, down the left edge.
 */
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

  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);

  char board[BEGINNER_CELLS + 1] = {};
  memset(board, '#', BEGINNER_CELLS);

  // The move doesn't win, so every event is an EVENT_CELL_REVEALED.
  for (int i = 0; i < game.event_buffer.count; i++) {
    Event event = game.event_buffer.events[i];

    board[event.cell_revealed.cell_index] = (char)('0' + event.cell_revealed.ring);
  }

  CHECK_STRING_EQUAL(board, expected);
}

/**
 * Every reveal writes one EVENT_CELL_REVEALED for each cell it revealed, the
 * clicked cell first, and in rings that count the cascade's steps, in order.
 *
 * On every difficulty, from 100 seeds, each game reveals every safe cell in
 * turn from a different start: cascades of every size and shape, down to
 * single numbers. rings_spread_out_from_the_click() is one of them, written
 * out.
 */
static void every_reveal_lists_its_cells_ring_by_ring(void) {
  bool is_listed_once = true;
  bool is_ring_correct = true;

  for (Difficulty difficulty = DIFFICULTY_BEGINNER; difficulty <= DIFFICULTY_EXPERT; difficulty++) {
    for (uint32_t seed = 0; seed < 100; seed++) {
      Game game = game_create(difficulty, seed);

      int cell_count = game.columns * game.rows;
      int start = (int)(seed % (uint32_t)cell_count);

      for (int step = 0; step < cell_count; step++) {
        int cell_index = (start + step) % cell_count;
        Cell cell = game.cells[cell_index];

        if (cell.has_mine || cell.state == CELL_REVEALED) {
          continue;
        }

        int revealed_before = count_cells_with_state(&game, CELL_REVEALED);
        game_reveal(&game, cell_index);

        if (!lists_each_new_cell_once(&game, cell_index, revealed_before)) {
          is_listed_once = false;
        }

        if (!rings_count_cascade_steps(&game)) {
          is_ring_correct = false;
        }
      }
    }
  }

  CHECK(is_listed_once);
  CHECK(is_ring_correct);
}

/**
 * game_toggle_flag() flags a hidden cell, and unflags it the second time, with
 * one event each. Before the first reveal, a flag places no mines: the game
 * stays ready. After it, flags work the same: 14 is a mine.
 */
static void toggle_flag_flags_and_unflags_a_hidden_cell(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);

  game_toggle_flag(&game, BEGINNER_CENTER);
  Event flagged[] = {cell_event(EVENT_CELL_FLAGGED, BEGINNER_CENTER)};
  CHECK(event_buffer_is(&game, flagged, 1));
  CHECK_INT_EQUAL(game.cells[BEGINNER_CENTER].state, CELL_FLAGGED);
  CHECK_INT_EQUAL(count_cells_with_state(&game, CELL_FLAGGED), 1);
  CHECK_INT_EQUAL(game.status, GAME_STATUS_READY);

  game_toggle_flag(&game, BEGINNER_CENTER);
  Event unflagged[] = {cell_event(EVENT_CELL_UNFLAGGED, BEGINNER_CENTER)};
  CHECK(event_buffer_is(&game, unflagged, 1));
  CHECK_INT_EQUAL(game.cells[BEGINNER_CENTER].state, CELL_HIDDEN);
  CHECK_INT_EQUAL(count_cells_with_state(&game, CELL_FLAGGED), 0);

  game_reveal(&game, BEGINNER_CENTER);
  game_toggle_flag(&game, 14);
  Event flagged_after_a_reveal[] = {cell_event(EVENT_CELL_FLAGGED, 14)};
  CHECK(event_buffer_is(&game, flagged_after_a_reveal, 1));
}

/**
 * game_toggle_flag() ignores a revealed cell, which takes no flag, and a cell
 * off the board: -1, and BEGINNER_CELLS, which is past the board but inside
 * cells (see reveal_ignores_cells_off_the_board()).
 */
static void toggle_flag_ignores_revealed_cells_and_cells_off_the_board(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);

  Game before = game;

  game_toggle_flag(&game, BEGINNER_CENTER);
  CHECK(changed_nothing(&before, &game));

  game_toggle_flag(&game, -1);
  CHECK(changed_nothing(&before, &game));

  game_toggle_flag(&game, BEGINNER_CELLS);
  CHECK(changed_nothing(&before, &game));
}

/**
 * The player can put down more flags than there are mines: nothing checks a
 * flag (game.h). The browser's mine counter, mines − flags, then goes below 0.
 */
static void flags_can_outnumber_the_mines(void) {
  constexpr int flag_count = BOARD_SETUP_BEGINNER.mines + 1;

  Game game = game_create(DIFFICULTY_BEGINNER, SEED);

  for (int i = 0; i < flag_count; i++) {
    game_toggle_flag(&game, i);
    CHECK_INT_EQUAL(game.event_buffer.count, 1);
  }

  CHECK_INT_EQUAL(count_cells_with_state(&game, CELL_FLAGGED), flag_count);
}

/**
 * Revealing a mine loses. The mine explodes; then, in cell order, every other
 * mine shows unless it's flagged, and every wrong flag shows; then
 * EVENT_GAME_LOST. No cell changes: the exploded mine stays hidden, and only
 * the events show what the covers hid.
 *
 * Two flags go down first: on 15, a 2, which is wrong, and on 26, a mine. The
 * wrong flag shows between the mines at 6 and 47; the flagged mine doesn't.
 */
static void revealing_a_mine_loses(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);
  game_toggle_flag(&game, 15);
  game_toggle_flag(&game, 26);

  game_reveal(&game, 14);

  CHECK_INT_EQUAL(game.status, GAME_STATUS_LOST);
  CHECK_INT_EQUAL(game.cells[14].state, CELL_HIDDEN);
  CHECK_INT_EQUAL(count_cells_with_state(&game, CELL_REVEALED), FIRST_CASCADE_CELL_COUNT);

  Event expected[] = {
    cell_event(EVENT_MINE_EXPLODED, 14),
    cell_event(EVENT_MINE_SHOWN, 6),
    cell_event(EVENT_WRONG_FLAG_SHOWN, 15),
    cell_event(EVENT_MINE_SHOWN, 47),
    cell_event(EVENT_MINE_SHOWN, 62),
    cell_event(EVENT_MINE_SHOWN, 66),
    cell_event(EVENT_MINE_SHOWN, 69),
    cell_event(EVENT_MINE_SHOWN, 70),
    cell_event(EVENT_MINE_SHOWN, 71),
    cell_event(EVENT_MINE_SHOWN, 77),
    {.type = EVENT_GAME_LOST},
  };
  CHECK(event_buffer_is(&game, expected, 11));
}

/**
 * Revealing every safe cell wins, with no flag ever put down: a flag is the
 * player's note, and a win doesn't need it. The winning move ends with
 * EVENT_GAME_WON.
 */
static void revealing_every_safe_cell_wins_without_any_flags(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);

  reveal_every_safe_cell(&game);

  CHECK_INT_EQUAL(game.status, GAME_STATUS_WON);
  CHECK_INT_EQUAL(count_cells_with_state(&game, CELL_REVEALED), BEGINNER_CELLS - BOARD_SETUP_BEGINNER.mines);
  CHECK_INT_EQUAL(game.event_buffer.events[game.event_buffer.count - 1].type, EVENT_GAME_WON);
}

/**
 * A win flags every mine the player hadn't, in cell order, then writes
 * EVENT_GAME_WON, so the browser's mine counter ends at 0. The player flagged
 * the mine at 14 already, so the win flags the other 9.
 */
static void a_win_flags_every_mine(void) {
  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&game, BEGINNER_CENTER);
  game_toggle_flag(&game, 14);

  reveal_every_safe_cell(&game);

  CHECK_INT_EQUAL(count_cells_with_state(&game, CELL_FLAGGED), game.mines);

  bool is_every_mine_flagged = true;

  for (int i = 0; i < BEGINNER_CELLS; i++) {
    Cell cell = game.cells[i];

    if (cell.has_mine != (cell.state == CELL_FLAGGED)) {
      is_every_mine_flagged = false;
    }
  }

  CHECK(is_every_mine_flagged);

  // The winning move's last events: the reveals that come before them depend
  // on which cell was revealed last.
  Event expected_end[] = {
    cell_event(EVENT_CELL_FLAGGED, 6),
    cell_event(EVENT_CELL_FLAGGED, 26),
    cell_event(EVENT_CELL_FLAGGED, 47),
    cell_event(EVENT_CELL_FLAGGED, 62),
    cell_event(EVENT_CELL_FLAGGED, 66),
    cell_event(EVENT_CELL_FLAGGED, 69),
    cell_event(EVENT_CELL_FLAGGED, 70),
    cell_event(EVENT_CELL_FLAGGED, 71),
    cell_event(EVENT_CELL_FLAGGED, 77),
    {.type = EVENT_GAME_WON},
  };
  int end_count = (int)(sizeof expected_end / sizeof expected_end[0]);
  int end_start = game.event_buffer.count - end_count;
  bool is_end_match = end_start >= 0;

  for (int i = 0; is_end_match && i < end_count; i++) {
    is_end_match = events_are_equal(game.event_buffer.events[end_start + i], expected_end[i]);
  }

  CHECK(is_end_match);
}

/**
 * Once a game is won or lost, it ignores every command on every cell. The lost
 * game has a flag on 15, a safe cell, so the commands include taking a flag
 * off.
 */
static void every_command_after_the_end_is_ignored(void) {
  Game lost = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&lost, BEGINNER_CENTER);
  game_toggle_flag(&lost, 15);
  game_reveal(&lost, 14);
  CHECK_INT_EQUAL(lost.status, GAME_STATUS_LOST);
  CHECK(ignores_every_command(&lost));

  Game won = game_create(DIFFICULTY_BEGINNER, SEED);
  game_reveal(&won, BEGINNER_CENTER);
  reveal_every_safe_cell(&won);
  CHECK_INT_EQUAL(won.status, GAME_STATUS_WON);
  CHECK(ignores_every_command(&won));
}

/**
 * While the game is on, the events show the player no mine: the board built
 * from them holds the first reveal's cascade and the player's flag on 14, a
 * mine, which shows as a flag like any other.
 */
static void events_hide_every_mine_while_playing(void) {
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

  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  PlayerBoard board;

  see_move(&board, &game);
  game_reveal(&game, BEGINNER_CENTER);
  see_move(&board, &game);
  game_toggle_flag(&game, 14);
  see_move(&board, &game);

  CHECK_STRING_EQUAL(board.cells, expected);
}

/**
 * After a loss, the events show the exploded mine (X), every other mine not
 * flagged (*), and every wrong flag (W). The flag on 14, a mine, stays a flag;
 * the flag on 5, a 2, shows as wrong. The mine revealed is 6.
 */
static void events_show_every_mine_and_wrong_flag_after_a_loss(void) {
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

  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  PlayerBoard board;

  see_move(&board, &game);
  game_reveal(&game, BEGINNER_CENTER);
  see_move(&board, &game);
  game_toggle_flag(&game, 14);
  see_move(&board, &game);
  game_toggle_flag(&game, 5);
  see_move(&board, &game);
  game_reveal(&game, 6);
  see_move(&board, &game);

  CHECK_STRING_EQUAL(board.cells, expected);
}

/**
 * After a win, the events show every safe cell revealed and every mine
 * flagged: a_seed_always_places_the_same_mines()'s board, with an F for each *.
 */
static void events_flag_every_mine_after_a_win(void) {
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

  Game game = game_create(DIFFICULTY_BEGINNER, SEED);
  PlayerBoard board;

  see_move(&board, &game);
  game_reveal(&game, BEGINNER_CENTER);
  see_move(&board, &game);

  for (int i = 0; i < BEGINNER_CELLS; i++) {
    Cell cell = game.cells[i];

    if (!cell.has_mine && cell.state != CELL_REVEALED) {
      game_reveal(&game, i);
      see_move(&board, &game);
    }
  }

  CHECK_INT_EQUAL(game.status, GAME_STATUS_WON);
  CHECK_STRING_EQUAL(board.cells, expected);
}

/**
 * 300 runs of random commands, 45,000 moves, keep every rule in
 * find_broken_rule(), checked after each move.
 *
 * The other tests check chosen moves on chosen boards; these rules hold for
 * any move on any board: the events alone build the game's board, a command
 * writes only its own kinds of event, a move names each cell at most once, an
 * end event comes exactly when the game ends, and a game that is over ignores
 * every command. The first broken rule prints with the move that broke it,
 * which a debugger can stop at.
 *
 * The counts at the end check the fuzzer itself: its runs must play every
 * kind of move, so a change to its mix can't leave a rule untried.
 */
static void random_play_keeps_every_rule(void) {
  BrokenRule first_broken = {};
  int ignored_count = 0;
  int revealed_count = 0;
  int flagged_count = 0;
  int unflagged_count = 0;
  int lost_count = 0;
  int won_count = 0;

  Random random = random_create(SEED, COMMAND_STREAM);

  for (int run = 0; run < 300; run++) {
    Game game = game_create((Difficulty)(run % DIFFICULTY_COUNT), random_next(&random));
    PlayerBoard board;
    int exploded_cell = -1;

    see_move(&board, &game);

    for (int move = 0; move < COMMANDS_PER_RUN; move++) {
      Game before = game;
      Command command;
      int cell_index;

      play_random_command(&game, &random, &command, &cell_index);
      see_move(&board, &game);

      if (command == COMMAND_NEW_GAME) {
        exploded_cell = -1;
      } else if (before.status != GAME_STATUS_LOST && game.status == GAME_STATUS_LOST) {
        exploded_cell = cell_index;
      }

      const char *broken_rule = find_broken_rule(&before, &game, command, cell_index, &board, exploded_cell);

      if (broken_rule != nullptr && first_broken.rule == nullptr) {
        first_broken = (BrokenRule) {
          .rule = broken_rule,
          .run = run,
          // The game the move was played on: after a new game, the new one.
          .seed = game.seed,
          .move = move,
          .command = command,
          .cell_index = cell_index,
          .event_count = game.event_buffer.count,
        };
      }

      // Each move counts as the kind its last event says.
      const EventBuffer *played = &game.event_buffer;
      EventType last = played->count > 0 ? played->events[played->count - 1].type : EVENT_GAME_CREATED;

      if (played->count == 0) {
        ignored_count++;
      } else if (last == EVENT_GAME_WON) {
        won_count++;
      } else if (last == EVENT_GAME_LOST) {
        lost_count++;
      } else if (last == EVENT_CELL_REVEALED) {
        revealed_count++;
      } else if (last == EVENT_CELL_FLAGGED) {
        flagged_count++;
      } else if (last == EVENT_CELL_UNFLAGGED) {
        unflagged_count++;
      }
    }
  }

  CHECK(first_broken.rule == nullptr);

  if (first_broken.rule != nullptr) {
    fprintf(
      stderr,
      "  \"%s\" broke in run %d (seed %u), move %d: %s %d → %d events\n",
      first_broken.rule,
      first_broken.run,
      first_broken.seed,
      first_broken.move,
      COMMAND_NAMES[first_broken.command],
      first_broken.cell_index,
      first_broken.event_count
    );
  }

  CHECK(ignored_count > 0);
  CHECK(revealed_count > 0);
  CHECK(flagged_count > 0);
  CHECK(unflagged_count > 0);
  CHECK(lost_count > 0);
  CHECK(won_count > 0);
}

/**
 * Two games from the same seed, given the same commands, stay equal move for
 * move: the same state and the same events.
 *
 * The two are played side by side, a command each in turn, so anything they
 * share outside their Game, such as a static variable in game.c, would make
 * them differ. 100 seeds, each a run of COMMANDS_PER_RUN random commands,
 * across every difficulty. The first move where they differ is printed.
 */
static void the_same_seed_and_commands_play_the_same_game(void) {
  bool is_same = true;
  uint32_t differing_seed = 0;
  int differing_move = 0;

  for (uint32_t seed = 0; seed < 100; seed++) {
    Game first = game_create((Difficulty)(seed % DIFFICULTY_COUNT), seed);
    Game second = game_create((Difficulty)(seed % DIFFICULTY_COUNT), seed);

    Random first_random = random_create(seed, COMMAND_STREAM);
    Random second_random = random_create(seed, COMMAND_STREAM);

    for (int move = 0; move < COMMANDS_PER_RUN; move++) {
      Command command;
      int cell_index;

      play_random_command(&first, &first_random, &command, &cell_index);
      play_random_command(&second, &second_random, &command, &cell_index);

      if (is_same && !games_are_equal(&first, &second)) {
        is_same = false;
        differing_seed = seed;
        differing_move = move;
      }
    }
  }

  CHECK(is_same);

  if (!is_same) {
    fprintf(stderr, "  the games from seed %u first differ after move %d\n", differing_seed, differing_move);
  }
}

void test_suite_game(void) {
  RUN(create_uses_each_board_setup);
  RUN(every_board_setup_fits_and_leaves_room_for_the_first_click);
  RUN(create_returns_a_ready_and_empty_game);
  RUN(create_returns_all_zeros_for_an_unknown_difficulty);

  RUN(reveal_ignores_cells_off_the_board);
  RUN(first_reveal_places_every_mine);
  RUN(first_reveal_keeps_the_first_click_clear);
  RUN(every_cell_can_hold_a_mine_equally_often);
  RUN(neighbor_counts_match_a_recount);
  RUN(a_seed_always_places_the_same_mines);

  RUN(reveal_ignores_revealed_and_flagged_cells);
  RUN(reveal_of_a_number_writes_one_event);
  RUN(a_zero_reveals_everything_around_it);
  RUN(a_cascade_leaves_flagged_cells_hidden);
  RUN(reveal_matches_a_recursive_fill);
  RUN(rings_spread_out_from_the_click);
  RUN(every_reveal_lists_its_cells_ring_by_ring);

  RUN(toggle_flag_flags_and_unflags_a_hidden_cell);
  RUN(toggle_flag_ignores_revealed_cells_and_cells_off_the_board);
  RUN(flags_can_outnumber_the_mines);

  RUN(revealing_a_mine_loses);
  RUN(revealing_every_safe_cell_wins_without_any_flags);
  RUN(a_win_flags_every_mine);
  RUN(every_command_after_the_end_is_ignored);

  RUN(events_hide_every_mine_while_playing);
  RUN(events_show_every_mine_and_wrong_flag_after_a_loss);
  RUN(events_flag_every_mine_after_a_win);

  RUN(random_play_keeps_every_rule);
  RUN(the_same_seed_and_commands_play_the_same_game);
}
