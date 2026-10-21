# Needs only GNU Make 3.81, the version macOS ships: no 4.x features
# (.ONESHELL, .RECIPEPREFIX, $(file ...), !=).

# Homebrew's LLVM, not Apple's clang: Apple's has no wasm32 target, and the
# native tests and the wasm build should use the same compiler. Homebrew
# keeps it off PATH (keg-only), hence the full path. `make CC=gcc test`
# still overrides it; a CC in the environment doesn't.
CC := /opt/homebrew/opt/llvm/bin/clang

# Keep in sync with compile_flags.txt, which tells clangd the same flags.
CFLAGS := -std=c23 -Wall -Wextra -pedantic -g

# AddressSanitizer + UndefinedBehaviorSanitizer. By default UBSan prints a
# report and carries on, so the run still passes; -fno-sanitize-recover=all
# makes every report stop the run and fail `make test`.
SANITIZE := -fsanitize=address,undefined -fno-sanitize-recover=all

BUILD := build

# The game core. src/minesweeper.c (the wasm exports) must stay out of the
# native build.
CORE := src/game.c src/random.c

# Not files: always run these, even if a file named "test" or "clean" exists.
.PHONY: test clean

# The first target is the default, so plain `make` runs the tests.
# `make test ONLY=chord` runs only the tests whose name contains "chord".
# Quoted so the shell passes ONLY through as is (an unquoted * would expand
# to file names); an empty ONLY matches every test.
test: $(BUILD)/tests
	./$(BUILD)/tests '$(ONLY)'

# One compiler call, sources straight to the binary, no .o files: the whole
# build takes well under a second, so incremental builds would save nothing.
# Any header, or this Makefile (flags), changing rebuilds it.
#
# $@ is the target; $^ the prerequisites, filtered down to the .c files.
# After the |, $(BUILD) is order-only: it must exist first, but its
# timestamp (which changes whenever a file in it does) never forces a
# rebuild.
#
# -O1 here, not in CFLAGS: about 4× faster than -O0 under the sanitizers; a
# debugger may show some variables as "optimized out".
$(BUILD)/tests: $(CORE) $(wildcard tests/*.c src/*.h tests/*.h) Makefile | $(BUILD)
	$(CC) $(CFLAGS) -O1 $(SANITIZE) -Isrc -o $@ $(filter %.c,$^)

$(BUILD):
	mkdir -p $@

# Also removes build/tests.dSYM, where macOS puts -g's debug info.
clean:
	rm -rf $(BUILD)
