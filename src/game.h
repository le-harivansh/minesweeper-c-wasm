#ifndef GAME_H
#define GAME_H

#include <stdint.h>

constexpr int MAX_COLUMNS = 30;
constexpr int MAX_ROWS = 24;
constexpr int MAX_CELLS = MAX_COLUMNS * MAX_ROWS;

typedef enum : uint8_t {
  DIFFICULTY_BEGINNER,
  DIFFICULTY_INTERMEDIATE,
  DIFFICULTY_EXPERT,
} Difficulty;

typedef enum : uint8_t {
  GAME_STATUS_READY,
  GAME_STATUS_PLAYING,
  GAME_STATUS_WON,
  GAME_STATUS_LOST,
} GameStatus;

typedef enum : uint8_t {
  MOVE_IGNORED,
  MOVE_OPENED,
  MOVE_FLAGGED,
  MOVE_UNFLAGGED,
  MOVE_REFUSED,
  MOVE_LOST,
  MOVE_WON,
} MoveResult;

typedef enum : uint8_t {
  // 0–8: open, the value is the adjacent mine count
  CELL_VIEW_HIDDEN = 9,
  CELL_VIEW_FLAGGED,
  CELL_VIEW_MINE,
  CELL_VIEW_EXPLODED,
  CELL_VIEW_WRONG_FLAG,
} CellView;

static_assert(sizeof(CellView) == 1);

typedef struct {
  uint16_t cell_index;
  uint16_t ring;
} OpenedCell;

static_assert(sizeof(OpenedCell) == 4);
static_assert(MAX_CELLS <= UINT16_MAX + 1);

typedef struct {
  bool has_mine;
  bool is_revealed;
  bool is_flagged;
  uint8_t adjacent_mine_count;
} Cell;

typedef struct {
  GameStatus status;
  int columns;
  int rows;
  int mine_count;
  uint32_t seed;
  int first_cell;
  int revealed_count;
  int flag_count;
  int exploded_cell;
  Cell cells[MAX_CELLS];
  OpenedCell opened_cells[MAX_CELLS];
  int opened_count;
} Game;

bool game_new(Game *game, Difficulty difficulty, uint32_t seed);
MoveResult game_reveal(Game *game, int cell_index);

#endif
