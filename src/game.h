/**
 * @file
 * The rules of Minesweeper: the board, the moves, winning and losing. No
 * drawing, timing or sound: the browser does all of that from the events these
 * functions write.
 *
 * Commands in, events out. Each command changes the game and writes what
 * changed to game->event_buffer: one event for each change the player can
 * see, in the order they happened. A command that changes nothing writes no
 * events.
 *
 * A game is one flat value that you own: no globals, no clock, no I/O, no
 * allocation. game_create() returns one; every other function takes a Game *
 * and changes only that game.
 * Deterministic: the same difficulty, seed and first reveal always place the
 * mines in the same cells. The seed comes from the caller, since this code has
 * no source of randomness.
 *
 * Cells are numbered row by row: cell_index = row * columns + column.
 *
 *     Game game = game_create(DIFFICULTY_BEGINNER, seed);
 *     game_reveal(&game, 40);  // the center of 9×9
 *
 *     for (int i = 0; i < game.event_buffer.count; i++) {
 *       show(game.event_buffer.events[i]);
 *     }
 */
#ifndef GAME_H
#define GAME_H

#include <stdint.h>

/** How a board is set up: rows × columns, and how many mines. */
typedef struct {
  int rows;
  int columns;
  int mines;
} BoardSetup;

constexpr BoardSetup BOARD_SETUP_BEGINNER = {9, 9, 10};
constexpr BoardSetup BOARD_SETUP_INTERMEDIATE = {16, 16, 40};
constexpr BoardSetup BOARD_SETUP_EXPERT = {16, 30, 99};

/**
 * Cells on the largest board, and the length of every per-cell array. All
 * storage is sized for it, so a game never allocates.
 */
constexpr int MAX_CELLS = BOARD_SETUP_EXPERT.columns * BOARD_SETUP_EXPERT.rows;

/** Names a board setup: DIFFICULTY_EXPERT plays on BOARD_SETUP_EXPERT. */
typedef enum : uint8_t {
  DIFFICULTY_BEGINNER,
  DIFFICULTY_INTERMEDIATE,
  DIFFICULTY_EXPERT,
} Difficulty;

/**
 * Where a game is: ready, then playing, then won or lost. Once won or lost,
 * every command is ignored: game_create() starts the next game.
 */
typedef enum : uint8_t {
  /** No mines yet: the first reveal places them. Flags are allowed. */
  GAME_STATUS_READY,
  /** Game currently underway. */
  GAME_STATUS_PLAYING,
  /** Every safe cell revealed. Every mine is then flagged too. */
  GAME_STATUS_WON,
  /** A mine revealed. */
  GAME_STATUS_LOST,
} GameStatus;

/**
 * What changed. Each event is one change the player can see: applied in
 * order, a move's events take the browser's board from before the move to
 * after it. Each says which member of Event holds its data.
 */
typedef enum : uint8_t {
  /** A new, empty board. Uses game_created. */
  EVENT_GAME_CREATED,
  /**
   * A safe cell uncovered. Uses cell_revealed. A reveal writes its cells in
   * the order it reached them, ring by ring.
   */
  EVENT_CELL_REVEALED,
  /** A flag put on a hidden cell: by the player, or on a mine by a win. Uses cell. */
  EVENT_CELL_FLAGGED,
  /** Uses cell. */
  EVENT_CELL_UNFLAGGED,
  /** The revealed cell is a mine, and the game is lost. Uses cell. */
  EVENT_MINE_EXPLODED,
  /** After an explosion: a mine that wasn't flagged. Uses cell. */
  EVENT_MINE_SHOWN,
  /** After an explosion: a flag on a cell with no mine. Uses cell. */
  EVENT_WRONG_FLAG_SHOWN,
  /** The last safe cell revealed. No data. */
  EVENT_GAME_WON,
  /** Ends a loss. No data. */
  EVENT_GAME_LOST,
} EventType;

/**
 * One change: type says what happened, and which member of the union holds
 * its data. EVENT_GAME_WON and EVENT_GAME_LOST have none.
 *
 * Compare two events field by field, not with memcmp(): the bytes after type
 * are padding, and an event that uses cell leaves the rest of the union unset.
 */
typedef struct {
  EventType type;
  union {
    struct {
      int rows;
      int columns;
      int mines;
    } game_created;
    struct {
      int cell_index;
      /**
       * Steps from where the reveal started: 0 for the revealed cell, 1 for
       * the cells it reached, and so on. The browser uncovers a cascade
       * outward, ring by ring.
       */
      int ring;
      /** The number the cell shows, 0 to 8. */
      int neighbor_mine_count;
    } cell_revealed;
    /** For every other event that names a cell. */
    struct {
      int cell_index;
    } cell;
  };
} Event;

/**
 * The most events one move can write. A move names each cell at most once,
 * then may end the game: a winning reveal reveals each safe cell and flags
 * each mine at most once; a loss explodes or shows each mine and shows each
 * wrong flag at most once.
 */
constexpr int MAX_MOVE_EVENTS = MAX_CELLS + 1;

/** A move's events, in the order they happened. */
typedef struct {
  /** How many of events are in use. */
  int count;
  Event events[MAX_MOVE_EVENTS];
} EventBuffer;

/** A cell's cover. One state, not two bools: never revealed and flagged. */
typedef enum : uint8_t {
  /** Zero, so a new game's zeroed cells are all hidden. */
  CELL_HIDDEN,
  /** Still hidden, under a flag: reveals and cascades leave it alone. */
  CELL_FLAGGED,
  CELL_REVEALED,
} CellState;

/** One square of the board. */
typedef struct {
  bool has_mine;
  /**
   * Mines among the up to 8 cells around it. Set once, when the mines are
   * placed; 0 before that.
   */
  uint8_t neighbor_mine_count;
  CellState state;
} Cell;

/**
 * One whole game. A flat value with no pointers: copying it copies the game,
 * and the copy plays on by itself.
 *
 * Read any field; change them only through the game_ functions, which keep
 * them consistent. Compare two games field by field, not with memcmp(): a Game
 * has padding, and so do its events.
 */
typedef struct {
  // Setup: chosen by game_create
  int columns;
  int rows;
  int mines;
  /** With the first reveal, decides where the mines go. */
  uint32_t seed;

  // Play
  GameStatus status;
  /**
   * The board, row by row: cells[row * columns + column]. Only the first
   * columns × rows are in use.
   */
  Cell cells[MAX_CELLS];

  // The last command
  /**
   * What the last command changed, for the browser to show. Every command
   * empties it first, so a command that changed nothing leaves it empty.
   */
  EventBuffer event_buffer;
} Game;

/**
 * Creates a new game on an empty board of the difficulty's size.
 *
 * No mines yet: the first game_reveal() places them, away from the revealed
 * cell and its neighbors, so the first reveal is never a mine and always
 * reveals its neighbors too.
 *
 * The new game's event_buffer holds EVENT_GAME_CREATED. For an unknown
 * difficulty, the game is all zeros: no cells and no events, so every command
 * on it does nothing.
 *
 * @param difficulty The board's size and mine count.
 * @param seed       Decides where the mines go. Any value: the same seed and
 *                   first reveal always put them in the same cells.
 * @return The new game, ready for its first reveal.
 */
Game game_create(Difficulty difficulty, uint32_t seed);

/**
 * Reveals a hidden cell. On a game's first reveal, places the mines first.
 *
 * A cell with no neighbor mines reveals its hidden neighbors too, and each of
 * them with none does the same: the cascade. Flagged cells stay as they are.
 *
 * Writes, in order:
 * - for a safe cell, EVENT_CELL_REVEALED for each cell revealed, ring by
 *   ring. If that was the last safe cell, then EVENT_CELL_FLAGGED for each
 *   mine not yet flagged, and EVENT_GAME_WON.
 * - for a mine, EVENT_MINE_EXPLODED; then, in cell order, EVENT_MINE_SHOWN
 *   for each other unflagged mine and EVENT_WRONG_FLAG_SHOWN for each flag
 *   with no mine; then EVENT_GAME_LOST.
 * - nothing if the cell is off the board, flagged or already revealed, or the
 *   game is over.
 *
 * @param game       The game to play.
 * @param cell_index The cell to reveal.
 */
void game_reveal(Game *game, int cell_index);

/**
 * Puts a flag on a hidden cell, or takes it off.
 *
 * A flag is the player's note that a mine is there. Nothing checks it and a
 * win doesn't need it, but it guards the cell: a flagged cell can't be
 * revealed. Allowed before the first reveal too, and on more cells than there
 * are mines.
 *
 * Writes EVENT_CELL_FLAGGED or EVENT_CELL_UNFLAGGED. Writes nothing if the
 * cell is off the board or revealed, or the game is over.
 *
 * @param game       The game to play.
 * @param cell_index The cell to flag or unflag.
 */
void game_toggle_flag(Game *game, int cell_index);

#endif
