#ifndef RNG_H
#define RNG_H

#include <stdint.h>

typedef struct {
  uint64_t state;
  uint64_t increment;
} Rng;

void rng_seed(Rng *rng, uint64_t seed, uint64_t stream);
uint32_t rng_next(Rng *rng);
uint32_t rng_below(Rng *rng, uint32_t bound);

#endif
