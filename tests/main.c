#include "test.h"

int test_failure_count = 0;

int main(void) {
  test_rng();
  test_game();

  if (test_failure_count > 0) {
    fprintf(stderr, "%d check(s) failed\n", test_failure_count);

    return 1;
  }

  printf("all tests passed\n");

  return 0;
}
