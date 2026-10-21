# Needs only GNU Make 3.81, the version macOS ships: no 4.x features
# (.ONESHELL, .RECIPEPREFIX, $(file ...), !=).

# Homebrew's LLVM, not Apple's clang: Apple's has no wasm32 target, and the
# native tests and the wasm build should use the same compiler. Homebrew
# keeps it off PATH (keg-only), hence the full path. `make CC=gcc test`
# still overrides it; a CC in the environment doesn't. The wasm linker,
# wasm-ld, is Homebrew's separate lld package (`brew install llvm lld`):
# clang finds it on PATH.
CC := /opt/homebrew/opt/llvm/bin/clang

# Keep in sync with compile_flags.txt, which tells clangd the same flags.
CFLAGS := -std=c23 -Wall -Wextra -pedantic

# AddressSanitizer + UndefinedBehaviorSanitizer. By default UBSan prints a
# report and carries on, so the run still passes; -fno-sanitize-recover=all
# makes every report stop the run and fail `make test`.
SANITIZE := -fsanitize=address,undefined -fno-sanitize-recover=all

BUILD := build

# The game core. src/minesweeper.c (the wasm exports) must stay out of the
# native build.
CORE := src/game.c src/random.c

# The wasm build: for wasm32, with no OS and no libc (-ffreestanding,
# -nostdlib), a library the browser calls rather than a program (--no-entry),
# optimized for size. -Werror: a warning stops the build, so none can ship.
# -mbulk-memory: the compiler zeroes and copies a Game with memory.fill and
# memory.copy, not with calls to memset and memcpy, which -nostdlib leaves out.
WASM_FLAGS := --target=wasm32 -mbulk-memory -Os -Werror -ffreestanding -nostdlib -Wl,--no-entry

# Not files: always run these, even if a file named "test" or "clean" exists.
.PHONY: test wasm test-wasm clean

# The first target is the default, so plain `make` runs the tests.
# `make test ONLY=flag` runs only the tests whose name contains "flag".
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
# -g and -O1 here, not in CFLAGS, which the wasm build shares. -g: debug info
# for a debugger. -O1: about 4× faster than -O0 under the sanitizers; a
# debugger may show some variables as "optimized out".
$(BUILD)/tests: $(CORE) $(wildcard tests/*.c src/*.h tests/*.h) Makefile | $(BUILD)
	$(CC) $(CFLAGS) -g -O1 $(SANITIZE) -Isrc -o $@ $(filter %.c,$^)

# `make wasm` builds the module the browser loads: the core plus
# src/minesweeper.c. wasm-ld refuses an undefined function that isn't
# declared as an import, so a stray libc call (memcpy, say) fails the link.
wasm: $(BUILD)/minesweeper.wasm

$(BUILD)/minesweeper.wasm: $(CORE) src/minesweeper.c $(wildcard src/*.h) Makefile | $(BUILD)
	$(CC) $(CFLAGS) $(WASM_FLAGS) -o $@ $(filter %.c,$^)

# Tests the built module in Node, loaded the way the browser will load it:
# its exports and imports, and that each event reaches its JS function.
test-wasm: $(BUILD)/minesweeper.wasm
	node --test tests/minesweeper.test.mjs

$(BUILD):
	mkdir -p $@

# Also removes build/tests.dSYM, where macOS puts -g's debug info.
clean:
	rm -rf $(BUILD)
