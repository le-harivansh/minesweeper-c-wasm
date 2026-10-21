#include "random.h"

/**
 * The LCG multiplier from Knuth's MMIX, also PCG's default. With an odd
 * increment and a multiplier one more than a multiple of 4, the step visits
 * all 2^64 states before repeating (the Hull–Dobell theorem).
 */
static constexpr uint64_t MULTIPLIER = 6364136223846793005u;

Random random_create(uint64_t seed, uint64_t stream) {
  // The full period needs an odd increment: shift the stream up and set bit 0.
  // Bit 63 of the stream falls off, which leaves 2^63 streams.
  Random random = {
    .state = 0,
    .increment = (stream << 1) | 1,
  };

  // Step, add the seed, step again. The second step's multiply spreads the
  // seed across all 64 bits, so nearby seeds (1, 2, 3) don't start alike.
  // This is pcg32_srandom_r step for step, so the outputs match PCG's
  // published values.
  random_next(&random);
  random.state += seed;
  random_next(&random);

  return random;
}

uint32_t random_next(Random *random) {
  // The output comes from the old state, not the new one: the two don't depend
  // on each other, so the CPU can work on both at once.
  uint64_t old_state = random->state;

  // The LCG step. Unsigned arithmetic wraps, so the mod 2^64 is free.
  random->state = old_state * MULTIPLIER + random->increment;

  // XSH, "xorshift high": XOR each bit with the one 18 above it, which mixes
  // the top bits into the middle, then keep bits 27–58. The LCG's weak low
  // bits (0–26) never reach the output.
  uint32_t xorshifted = (uint32_t)(((old_state >> 18) ^ old_state) >> 27);
  // RR, "random rotation": the top 5 bits, the strongest, pick a rotation
  // from 0 to 31.
  uint32_t rotation = (uint32_t)(old_state >> 59);

  // Rotate right. `-rotation & 31` is (32 - rotation) % 32: the plain
  // `xorshifted << (32 - rotation)` shifts by 32 when rotation is 0, which is
  // undefined behaviour. Clang compiles this to a single rotate instruction.
  return (xorshifted >> rotation) | (xorshifted << (-rotation & 31));
}

uint32_t random_below(Random *random, uint32_t bound) {
  // `value % bound` alone is biased unless bound divides 2^32: results 0 to
  // (2^32 % bound) - 1 come up one extra time each. Skipping that many raw
  // values leaves an exact multiple of bound, so every result is equally
  // likely. `-bound` wraps to 2^32 - bound, which makes `-bound % bound` equal
  // 2^32 % bound without a 64-bit division.
  uint32_t threshold = -bound % bound;

  while (true) {
    uint32_t value = random_next(random);
    if (value >= threshold) {
      return value % bound;
    }
  }
}
