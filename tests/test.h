#ifndef TEST_H
#define TEST_H

#include <stdio.h>

extern int test_failure_count;

#define CHECK(condition) \
  do { \
    if (!(condition)) { \
      test_failure_count++; \
      fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #condition); \
    } \
  } while(0)

void test_rng(void);

#endif
