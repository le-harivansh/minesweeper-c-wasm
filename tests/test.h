/**
 * @file
 * The test harness: checks that say what went wrong, and a runner that names
 * each test and can pick tests by name.
 *
 * A failed check prints its file and line, what it checked and the values it
 * got, then lets the test carry on, so one run shows every failure. A test is
 * a static function with no parameters, and each test file has one suite that
 * RUN()s its tests:
 *
 *     static void reveal_ignores_cells_off_the_board(void) {
 *       Game game;
 *       CHECK(game_new(&game, DIFFICULTY_BEGINNER, 1));
 *       CHECK_INT_EQUAL(game_reveal(&game, -1), MOVE_IGNORED);
 *     }
 *
 *     void test_suite_game(void) {
 *       RUN(reveal_ignores_cells_off_the_board);
 *     }
 *
 * Each macro evaluates each argument exactly once, so an argument can be a
 * call that changes the game. In which order is unspecified, though: don't let
 * one argument change what another reads.
 */
#ifndef TEST_H
#define TEST_H

/**
 * Checks that a condition holds. When it doesn't, prints it as written:
 *
 *     tests/game.test.c:511: CHECK failed: game.first_cell == -1
 *
 * To compare two integers, use CHECK_INT_EQUAL(), which prints both values too.
 *
 * @param condition Anything that converts to bool: nonzero or non-null passes.
 */
#define CHECK(condition) \
  test_check(condition, #condition, __FILE__, __LINE__)

/**
 * Checks that two integers are equal: any integer type, enum or bool.
 *
 * When they differ, prints both values, and the expected expression as
 * written unless it is just a number:
 *
 *     CHECK_INT_EQUAL failed: game.status is 1, expected GAME_STATUS_READY (0)
 *     CHECK_INT_EQUAL failed: game.columns is 16, expected 9
 *
 * Both are compared as long long, so each must fit in one: a uint64_t above
 * LLONG_MAX doesn't. A pointer doesn't compile; a floating-point value would
 * be cut to an integer without a warning, so don't pass one.
 *
 * @param actual   The value the code under test gave.
 * @param expected The value it should be.
 */
#define CHECK_INT_EQUAL(actual, expected) \
  test_check_int_equal(actual, expected, #actual, #expected, __FILE__, __LINE__)

/**
 * Checks that an integer is within tolerance of the expected value, both ends
 * included. For counts of random draws, which are never exact.
 *
 *     CHECK_INT_NEAR failed: bottom_third_count is 14834, expected 10000 ± 500
 *
 * Integers only, as in CHECK_INT_EQUAL().
 *
 * @param actual    The value the code under test gave.
 * @param expected  The value it should be near.
 * @param tolerance How far from expected it may be. 0 or more.
 */
#define CHECK_INT_NEAR(actual, expected, tolerance) \
  test_check_int_near(actual, expected, tolerance, #actual, __FILE__, __LINE__)

/**
 * Checks that two strings are equal. For the golden boards, one character a
 * cell.
 *
 * When they differ, prints both, one above the other, with a ^ under the
 * first character that differs:
 *
 *     CHECK_STRING_EQUAL failed: board differs from expected at index 3
 *       actual:   0001
 *       expected: 0000
 *                    ^
 *
 * The ^ lines up only if neither string has a newline or tab before it.
 *
 * @param actual   The string the code under test gave. Not null.
 * @param expected The string it should be. Not null.
 */
#define CHECK_STRING_EQUAL(actual, expected) \
  test_check_string_equal(actual, expected, #actual, #expected, __FILE__, __LINE__)

/**
 * Runs a test and reports it by name.
 *
 * The name is module/test, as in game/chord_with_a_wrong_flag_loses. The test
 * is skipped unless its name contains the filter given to the test binary
 * (`make test ONLY=chord`). If any of its checks fail, prints FAIL and the
 * name after their messages.
 *
 * @param test A test function, `static void test(void)`, by name.
 */
#define RUN(test) test_run(#test, test)

/**
 * The suites, one per module: test_suite_<module>() in
 * tests/<module>.test.c RUN()s every test in that file. main() runs each one
 * under its module's name, so a new suite is declared here and added to main().
 */
void test_suite_random(void);
void test_suite_game(void);

/*
 * The functions behind the macros, in main.c. Tests call the macros instead:
 * only a macro can pass an expression as text (#actual) and the file and line
 * it is on. A failed check counts the failure and prints to stderr.
 */

/** Does the work of CHECK(). */
void test_check(
  bool condition,
  const char *condition_text,
  const char *file,
  int line
);

/** Does the work of CHECK_INT_EQUAL(). */
void test_check_int_equal(
  long long actual,
  long long expected,
  const char *actual_text,
  const char *expected_text,
  const char *file,
  int line
);

/** Does the work of CHECK_INT_NEAR(). */
void test_check_int_near(
  long long actual,
  long long expected,
  long long tolerance,
  const char *actual_text,
  const char *file,
  int line
);

/** Does the work of CHECK_STRING_EQUAL(). */
void test_check_string_equal(
  const char *actual,
  const char *expected,
  const char *actual_text,
  const char *expected_text,
  const char *file,
  int line
);

/** Does the work of RUN(). */
void test_run(const char *name, void (*test)(void));

#endif
