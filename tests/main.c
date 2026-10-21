#include <stdio.h>
#include <string.h>

#include "test.h"

/**
 * The text a test's full name must contain for it to run: the test binary's
 * argument, which `make test ONLY=chord` passes. Every string contains "", so
 * the default, like an empty ONLY, runs every test.
 */
static const char *test_filter = "";

/**
 * The module whose suite is running, set by run_suite(): the "game" in
 * game/chord_with_a_wrong_flag_loses.
 */
static const char *test_module = "";

/** The checks that failed, across every test. */
static int failed_check_count = 0;

/** The tests that ran: the ones whose name contains the filter. */
static int test_count = 0;

/** The tests with at least one failed check. */
static int failed_test_count = 0;

void test_check(
  bool condition,
  const char *condition_text,
  const char *file,
  int line
) {
  if (condition) {
    return;
  }

  failed_check_count++;

  // file:line first, the format compilers use, so an editor or terminal can
  // jump straight to the check.
  fprintf(stderr, "%s:%d: CHECK failed: %s\n", file, line, condition_text);
}

void test_check_int_equal(
  long long actual,
  long long expected,
  const char *actual_text,
  const char *expected_text,
  const char *file,
  int line
) {
  if (actual == expected) {
    return;
  }

  failed_check_count++;

  // Print the expected expression as written, unless it is just the number:
  // "expected MOVE_OPENED (1)", but "expected 58", not "expected 58 (58)".
  // 24 bytes hold any long long: LLONG_MIN is 20 characters, plus the null.
  char expected_number[24];
  snprintf(expected_number, sizeof expected_number, "%lld", expected);

  if (strcmp(expected_text, expected_number) == 0) {
    fprintf(
      stderr,
      "%s:%d: CHECK_INT_EQUAL failed: %s is %lld, expected %lld\n",
      file,
      line,
      actual_text,
      actual,
      expected
    );
  } else {
    fprintf(
      stderr,
      "%s:%d: CHECK_INT_EQUAL failed: %s is %lld, expected %s (%lld)\n",
      file,
      line,
      actual_text,
      actual,
      expected_text,
      expected
    );
  }
}

void test_check_int_near(
  long long actual,
  long long expected,
  long long tolerance,
  const char *actual_text,
  const char *file,
  int line
) {
  // Both ends count as near: 10000 ± 500 passes 9500 and 10500. The sums
  // overflow only within tolerance of LLONG_MIN or LLONG_MAX, far past any
  // count of draws.
  if (actual >= expected - tolerance && actual <= expected + tolerance) {
    return;
  }

  failed_check_count++;

  fprintf(
    stderr,
    "%s:%d: CHECK_INT_NEAR failed: %s is %lld, expected %lld ± %lld\n",
    file,
    line,
    actual_text,
    actual,
    expected,
    tolerance
  );
}

void test_check_string_equal(
  const char *actual,
  const char *expected,
  const char *actual_text,
  const char *expected_text,
  const char *file,
  int line
) {
  // strcmp() is the whole check. The loop below runs only on a failure, to
  // find where the strings differ.
  if (strcmp(actual, expected) == 0) {
    return;
  }

  failed_check_count++;

  // The index of the first character that differs. Testing only actual for
  // its end is enough: if expected ends first, its null doesn't match.
  size_t difference = 0;

  while (actual[difference] != '\0' && actual[difference] == expected[difference]) {
    difference++;
  }

  fprintf(
    stderr,
    "%s:%d: CHECK_STRING_EQUAL failed: %s differs from %s at index %zu\n",
    file,
    line,
    actual_text,
    expected_text,
    difference
  );
  fprintf(stderr, "  actual:   %s\n", actual);
  fprintf(stderr, "  expected: %s\n", expected);

  // Both labels are 12 characters wide, so both strings start in column 13.
  // `%*s` pads "" to `difference` spaces, which puts the ^ under the first
  // character that differs.
  fprintf(stderr, "            %*s^\n", (int)difference, "");
}

void test_run(const char *name, void (*test)(void)) {
  // "module/test", as FAIL prints it and ONLY= matches it. Test names stay
  // well under 128 characters; snprintf would cut a longer one, not overflow.
  char full_name[128];
  snprintf(full_name, sizeof full_name, "%s/%s", test_module, name);

  if (strstr(full_name, test_filter) == nullptr) {
    return;
  }

  // The test failed if any of its checks did: the count went up while it ran.
  int failed_check_count_before = failed_check_count;

  test_count++;
  test();

  if (failed_check_count > failed_check_count_before) {
    failed_test_count++;
    fprintf(stderr, "FAIL %s\n", full_name);
  }
}

/**
 * Runs one module's suite, so each test it RUN()s is named module/test.
 */
static void run_suite(const char *module, void (*suite)(void)) {
  test_module = module;
  suite();
}

/**
 * Runs every suite, then prints the totals. Exits 1 if a check failed or no
 * test matched the filter, so `make test` fails too.
 */
int main(int argc, char *argv[]) {
  // `make test` always passes ONLY, as "" when it isn't set. Run by hand with
  // no argument, the filter stays "" and every test runs.
  if (argc > 1) {
    test_filter = argv[1];
  }

  run_suite("random", test_suite_random);
  run_suite("game", test_suite_game);

  // A filter that matches nothing is most likely a typo. Fail, so it can't
  // pass for a green run of zero tests.
  if (test_count == 0) {
    fprintf(stderr, "no test name contains \"%s\"\n", test_filter);

    return 1;
  }

  if (failed_check_count > 0) {
    fprintf(
      stderr,
      "%d check(s) failed in %d of %d test(s)\n",
      failed_check_count,
      failed_test_count,
      test_count
    );

    return 1;
  }

  printf("%d test(s) passed\n", test_count);

  return 0;
}
