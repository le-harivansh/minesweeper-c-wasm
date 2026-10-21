/**
 * @file
 * Tests for random.h.
 *
 * Two kinds of test. The reference tests compare exact outputs with values
 * worked out without this code: PCG's published outputs, or arithmetic done by
 * hand on them. They are the only tests that know the right numbers, so they
 * are the ones that catch a change to what a seed produces (which would deal a
 * different board from the same seed). The statistical tests count many draws
 * and compare the counts with what a fair generator gives; any good generator
 * passes them.
 *
 * Every test starts from a fixed seed, so it draws the same numbers on every
 * run and can't pass once and fail the next time. The statistical windows are
 * about 5 standard deviations wide: a correct generator with some other seed
 * would fall outside one less than once in a million runs, while the bug each
 * test looks for lands thousands of draws outside.
 */
#include <stddef.h>

#include "random.h"
#include "test.h"

/**
 * The seed and stream of PCG's demo program, pcg32-demo.c in
 * github.com/imneme/pcg-c-basic. Its first line of output is the expected
 * sequence in create_and_next_match_the_pcg_reference().
 */
static constexpr uint64_t REFERENCE_SEED = 42;
static constexpr uint64_t REFERENCE_STREAM = 54;

/**
 * The seed and stream for every other test. Any values work; what matters is
 * that they are fixed.
 */
static constexpr uint64_t SEED = 1;
static constexpr uint64_t STREAM = 1;

/**
 * random_create() and random_next() give the same numbers as PCG's own code.
 *
 * The expected values are the first 6 numbers pcg32-demo prints, its
 * "32bit:" line. A wrong multiplier, shift or rotation, or a change to the
 * seeding steps, changes all of them.
 */
static void create_and_next_match_the_pcg_reference(void) {
  constexpr uint32_t expected[] = {
    0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e,
  };

  Random random = random_create(REFERENCE_SEED, REFERENCE_STREAM);

  for (size_t i = 0; i < sizeof expected / sizeof expected[0]; i++) {
    CHECK_INT_EQUAL(random_next(&random), expected[i]);
  }
}

/**
 * random_below() skips the raw values under the threshold, 2^32 % bound, and
 * reduces the rest with %, step for step like pcg32_boundedrand_r.
 *
 * The statistical tests would also pass with another unbiased method, such as
 * Lemire's multiply-and-shift, but a different method deals different boards
 * from the same seed. This test pins the method.
 *
 * Bound 2^31 + 1 keeps the arithmetic doable by hand: the threshold is
 * 2^32 - (2^31 + 1) = 0x7fffffff, so a raw value under it is skipped, and each
 * kept value here lies between bound and 2 * bound, so % bound subtracts the
 * bound once. The raw values are the reference sequence from
 * create_and_next_match_the_pcg_reference(), and the second one is skipped.
 */
static void below_skips_raw_values_under_the_threshold(void) {
  constexpr uint32_t bound = 0x80000001;  // 2^31 + 1
  constexpr uint32_t expected[] = {
    0xa15c02b7 - bound,
    // 0x7b47f409 is under the threshold: skipped, the next value is drawn.
    0xba1d3330 - bound,
    0x83d2f293 - bound,
    0xbfa4784b - bound,
    0xcbed606e - bound,
  };

  Random random = random_create(REFERENCE_SEED, REFERENCE_STREAM);

  for (size_t i = 0; i < sizeof expected / sizeof expected[0]; i++) {
    CHECK_INT_EQUAL(random_below(&random, bound), expected[i]);
  }
}

/**
 * random_below() never returns the bound or more.
 *
 * The game uses every result as an array index (the shuffle in
 * place_mines()), so a single value too big reads past the array. The bounds
 * cover each kind of input the method treats differently.
 */
static void below_returns_less_than_the_bound(void) {
  constexpr uint32_t bounds[] = {
    1,           // The smallest: 0 is the only answer.
    2,           // A power of two divides 2^32, so nothing is skipped.
    3, 7,        // Small and not powers of two: 1 and 4 raw values are skipped.
    81, 480,     // Board sizes in cells: Beginner and Expert.
    720,         // MAX_CELLS, the largest board.
    0x80000001,  // 2^31 + 1, the most skipping: almost half of all raw values.
    UINT32_MAX,  // The largest: results reach 2^32 - 2.
  };
  // An off-by-one returns the bound about once every `bound` draws, so the
  // small bounds show it hundreds of times.
  constexpr int draws_per_bound = 1000;

  Random random = random_create(SEED, STREAM);

  for (size_t b = 0; b < sizeof bounds / sizeof bounds[0]; b++) {
    bool is_in_range = true;

    for (int i = 0; i < draws_per_bound; i++) {
      if (random_below(&random, bounds[b]) >= bounds[b]) {
        is_in_range = false;
      }
    }

    CHECK(is_in_range);
  }
}

/**
 * random_below() returns each value equally often.
 *
 * Rolls a die 60,000 times: each face should come up 10,000 times, give or
 * take 91 (one standard deviation, sqrt(60000 * 1/6 * 5/6)). The window,
 * ±500, is about 5.5 standard deviations. A face that never comes up, or one
 * that comes up far too often, falls outside.
 *
 * It can't catch modulo bias: at bound 6 the bias is 4 raw values in 2^32,
 * far too few to count. below_has_no_modulo_bias() picks a bound where it
 * shows.
 */
static void below_returns_each_value_equally_often(void) {
  constexpr uint32_t bound = 6;
  constexpr int draw_count = 60000;
  constexpr int expected_count = draw_count / bound;  // 10,000
  constexpr int tolerance = expected_count / 20;      // 5%: 500
  int counts[bound] = {};

  Random random = random_create(SEED, STREAM);

  for (int i = 0; i < draw_count; i++) {
    counts[random_below(&random, bound)]++;
  }

  for (uint32_t value = 0; value < bound; value++) {
    CHECK_INT_NEAR(counts[value], expected_count, tolerance);
  }
}

/**
 * random_below() has no modulo bias, even at a bound where the bias is huge.
 *
 * `random_next() % bound` alone favours the results under 2^32 % bound. At
 * bound 3 * 2^30, the raw values 0 to 2^32 - 1 cover the bound's range once
 * and its bottom third a second time, so the bottom third comes up half the
 * time instead of a third.
 *
 * Out of 30,000 draws, about 10,000 should land in the bottom third, give or
 * take 82 (sqrt(30000 * 1/3 * 2/3)). The window, ±500, is about 6 standard
 * deviations; the biased count, about 15,000, misses it by 4,500.
 */
static void below_has_no_modulo_bias(void) {
  constexpr uint32_t bound = 3u << 30;  // 3 * 2^30, 0xc0000000
  constexpr int draw_count = 30000;
  constexpr int expected_count = draw_count / 3;  // 10,000
  constexpr int tolerance = expected_count / 20;  // 5%: 500
  int bottom_third_count = 0;

  Random random = random_create(SEED, STREAM);

  for (int i = 0; i < draw_count; i++) {
    if (random_below(&random, bound) < bound / 3) {
      bottom_third_count++;
    }
  }

  CHECK_INT_NEAR(bottom_third_count, expected_count, tolerance);
}

void test_suite_random(void) {
  RUN(create_and_next_match_the_pcg_reference);
  RUN(below_skips_raw_values_under_the_threshold);
  RUN(below_returns_less_than_the_bound);
  RUN(below_returns_each_value_equally_often);
  RUN(below_has_no_modulo_bias);
}
