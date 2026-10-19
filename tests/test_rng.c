#include <stddef.h>

#include "rng.h"
#include "test.h"

static void matches_reference_outputs(void) {
  constexpr uint32_t expected[] = {
    0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e,
  };

  Rng rng;
  rng_seed(&rng, 42, 54);

  for (size_t i = 0; i < sizeof expected / sizeof expected[0]; i++) {
    CHECK(rng_next(&rng) == expected[i]);
  }
}

static void below_stays_in_range(void) {
  constexpr uint32_t bounds[] = {1, 2, 3, 7, 81, 480, 720, 0x80000001, UINT32_MAX};
  Rng rng;
  rng_seed(&rng, 1, 1);
  for (size_t b = 0; b < sizeof bounds / sizeof bounds[0]; b++) {
    bool is_in_range = true;
    for (int i = 0; i < 1000; i++) {
      if (rng_below(&rng, bounds[b]) >= bounds[b]) {
        is_in_range = false;
      }
    }

    CHECK(is_in_range);
  }
}

static void below_is_uniform(void) {
  constexpr uint32_t bound = 6;
  int counts[bound] = {};
  Rng rng;
  rng_seed(&rng, 2, 1);
  for(int i = 0; i < 60000; i++) {
    counts[rng_below(&rng, bound)]++;
  }
  for (uint32_t value = 0; value < bound; value++) {
    CHECK(counts[value] > 9500 && counts[value] < 10500);
  }
}

static void below_has_no_modulo_bias(void) {
  constexpr uint32_t bound = 0xC0000000;
  int bottom_third_count = 0;
  Rng rng;
  rng_seed(&rng, 3, 1);
  for (int i = 0; i < 30000; i++) {
    if (rng_below(&rng, bound) < bound / 3) {
      bottom_third_count++;
    }
  }
  CHECK(bottom_third_count > 9500 && bottom_third_count < 10500);
}

void test_rng(void) {
  matches_reference_outputs();
  below_stays_in_range();
  below_is_uniform();
  below_has_no_modulo_bias();
}
