/**
 * @file
 * Seeded pseudo-random numbers: PCG32 (PCG-XSH-RR, 64-bit state, 32-bit
 * output) by Melissa O'Neill, pcg-random.org.
 *
 * Deterministic: the same seed and stream give the same numbers on every
 * platform, native and wasm32 alike, so a board can be dealt again from its
 * seed. No globals, no libc, no allocation: a generator is a 16-byte value
 * that you own.
 *
 *     Random random = random_create(seed, stream);
 *     uint32_t pick = random_below(&random, 10);  // 0 to 9
 */
#ifndef RANDOM_H
#define RANDOM_H

#include <stdint.h>

/**
 * A PCG32 generator. Each draw steps a 64-bit linear congruential generator
 * and scrambles the old state into 32 output bits, so the step's weak low
 * bits never show.
 *
 * Create one with random_create() and treat the fields as private: they are
 * in the header only because C needs the struct's size to hold it by value.
 * Copying a Random gives a second generator that repeats the same numbers.
 */
typedef struct {
  /** Position in the sequence; changes on every draw. */
  uint64_t state;
  /** Added on every step. Always odd; picks one of 2^63 streams. */
  uint64_t increment;
} Random;

/**
 * Creates a generator at the start of the sequence chosen by seed and stream.
 *
 * The same seed and stream always give the same sequence. Different streams
 * give unrelated sequences from the same seed, so one seed can serve several
 * independent uses. Matches pcg32_srandom_r from the PCG reference, so the
 * outputs can be checked against its published values.
 *
 * @param seed   Where to start. Any value.
 * @param stream Which sequence. Any value; the top bit is ignored.
 * @return A ready generator.
 */
Random random_create(uint64_t seed, uint64_t stream);

/**
 * Returns the next raw 32-bit value and advances the generator.
 *
 * Every 32-bit value is equally likely. Meant for tests and for making seeds.
 * For a number in a range, use random_below(): random_next() % n is biased.
 *
 * @param random The generator to advance.
 * @return The next value, from 0 to 2^32 - 1.
 */
uint32_t random_next(Random *random);

/**
 * Returns a value from 0 to bound - 1, every one equally likely, and advances
 * the generator.
 *
 * Unbiased: it skips the few raw values that would make some results more
 * likely than others, so it may draw more than once (the chance of a retry is
 * below bound / 2^32). Matches pcg32_boundedrand_r from the PCG reference.
 *
 * @param random The generator to advance.
 * @param bound  How many possible results. Must be greater than 0
 *               (0 is undefined behaviour).
 * @return A value from 0 to bound - 1.
 */
uint32_t random_below(Random *random, uint32_t bound);

#endif
