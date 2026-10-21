/**
 * @file
 * The wasm module's boundary: the one game the browser plays, the commands it
 * calls, and the events it gets back.
 *
 * Commands in, events out, as in game.h. The browser calls an exported
 * command; before that call returns, each event the command wrote reaches the
 * browser's function for that event, in order. A command that changed nothing
 * calls none.
 *
 * Only numbers cross: an event's data arrives as its function's arguments, so
 * the browser never reads this module's memory. It loads the module with one
 * function per event, under "events":
 *
 *     WebAssembly.instantiate(bytes, {
 *       events: {
 *         onCellRevealed(cellIndex, ring, neighborMineCount) { … },
 *         …
 *       },
 *     });
 *
 * Built for wasm32 only (`make wasm`), never natively: the import and export
 * attributes mean nothing there.
 */
#include "game.h"

/**
 * Makes the declaration after it a function JS supplies: its body is the JS
 * function under `name` in the import object's "events".
 */
#define JS_FUNCTION(name) [[clang::import_module("events"), clang::import_name(name)]]

JS_FUNCTION("onGameCreated")
void js_on_game_created(int rows, int columns, int mines);

JS_FUNCTION("onCellRevealed")
void js_on_cell_revealed(int cell_index, int ring, int neighbor_mine_count);

JS_FUNCTION("onCellFlagged")
void js_on_cell_flagged(int cell_index);

JS_FUNCTION("onCellUnflagged")
void js_on_cell_unflagged(int cell_index);

JS_FUNCTION("onMineExploded")
void js_on_mine_exploded(int cell_index);

JS_FUNCTION("onMineShown")
void js_on_mine_shown(int cell_index);

JS_FUNCTION("onWrongFlagShown")
void js_on_wrong_flag_shown(int cell_index);

JS_FUNCTION("onGameWon")
void js_on_game_won(void);

JS_FUNCTION("onGameLost")
void js_on_game_lost(void);

/**
 * The game the browser plays. All zeros until the first
 * minesweeper_new_game(): a board with no cells, so every command before it
 * does nothing.
 */
static Game game;

/**
 * Sends the last command's events to the browser, in order, each to its own
 * function.
 *
 * No default case: -Wswitch warns about an event type missing here, and the
 * wasm build's -Werror makes that an error.
 *
 * The JS functions must not call a command: it would empty the buffer this
 * loop is reading.
 */
static void send_events(void) {
  for (int i = 0; i < game.event_buffer.count; i++) {
    Event event = game.event_buffer.events[i];

    switch (event.type) {
      case EVENT_GAME_CREATED:
        js_on_game_created(
          event.game_created.rows,
          event.game_created.columns,
          event.game_created.mines
        );
        break;
      case EVENT_CELL_REVEALED:
        js_on_cell_revealed(
          event.cell_revealed.cell_index,
          event.cell_revealed.ring,
          event.cell_revealed.neighbor_mine_count
        );
        break;
      case EVENT_CELL_FLAGGED:
        js_on_cell_flagged(event.cell.cell_index);
        break;
      case EVENT_CELL_UNFLAGGED:
        js_on_cell_unflagged(event.cell.cell_index);
        break;
      case EVENT_MINE_EXPLODED:
        js_on_mine_exploded(event.cell.cell_index);
        break;
      case EVENT_MINE_SHOWN:
        js_on_mine_shown(event.cell.cell_index);
        break;
      case EVENT_WRONG_FLAG_SHOWN:
        js_on_wrong_flag_shown(event.cell.cell_index);
        break;
      case EVENT_GAME_WON:
        js_on_game_won();
        break;
      case EVENT_GAME_LOST:
        js_on_game_lost();
        break;
    }
  }
}

/**
 * Starts a new game: game_create(), then its events.
 *
 * @param difficulty A Difficulty. Any other value does nothing.
 * @param seed       Any 32 bits. JS converts the number it passes to 32 bits,
 *                   so 0 to 2³² − 1 all arrive as themselves.
 */
[[clang::export_name("newGame")]]
void minesweeper_new_game(int difficulty, uint32_t seed) {
  // Checked here, before converting: Difficulty is one byte, so 256 would
  // become 0, Beginner; and game_create() would replace the game being played
  // with an empty one for any other value it doesn't know.
  if (difficulty < 0 || difficulty > DIFFICULTY_EXPERT) {
    return;
  }

  game = game_create((Difficulty)difficulty, seed);
  send_events();
}

/**
 * Reveals a cell: game_reveal(), then its events.
 *
 * @param cell_index The cell to reveal. Off the board, nothing happens.
 */
[[clang::export_name("reveal")]]
void minesweeper_reveal(int cell_index) {
  game_reveal(&game, cell_index);
  send_events();
}

/**
 * Flags or unflags a cell: game_toggle_flag(), then its events.
 *
 * @param cell_index The cell to flag or unflag. Off the board, nothing happens.
 */
[[clang::export_name("toggleFlag")]]
void minesweeper_toggle_flag(int cell_index) {
  game_toggle_flag(&game, cell_index);
  send_events();
}
