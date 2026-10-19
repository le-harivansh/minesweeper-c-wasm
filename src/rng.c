#include "rng.h"

static constexpr uint64_t MULTIPLIER = 6364136223846793005u;

void rng_seed(Rng *rng, uint64_t seed, uint64_t stream) {
  rng->state = 0;
  rng->increment = (stream << 1) | 1;

  rng_next(rng);

  rng->state += seed;
  rng_next(rng);
}

uint32_t rng_next(Rng *rng) {
  uint64_t old_state = rng->state;
  rng->state = old_state * MULTIPLIER + rng->increment;

  uint32_t xorshifted = (uint32_t)(((old_state >> 18) ^ old_state) >> 27);
  uint32_t rotation = (uint32_t)(old_state >> 59);
  return (xorshifted >> rotation) | (xorshifted << (-rotation & 31));
}

uint32_t rng_below(Rng *rng, uint32_t bound) {
  uint32_t threshold = -bound % bound;
  for (;;) {
    uint32_t value = rng_next(rng);
    if (value >= threshold) {
      return value % bound;
    }
  }
}
