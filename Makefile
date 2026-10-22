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

# The game's folder in the web harness (web/): everything the site will get.
GAME := web/src/lab/minesweeper

# The wasm build: for wasm32, with no OS and no libc (-ffreestanding,
# -nostdlib), a library the browser calls rather than a program (--no-entry),
# optimized for size. -Werror: a warning stops the build, so none can ship.
# -mbulk-memory: the compiler zeroes and copies a Game with memory.fill and
# memory.copy, not with calls to memset and memcpy, which -nostdlib leaves out.
WASM_FLAGS := --target=wasm32 -mbulk-memory -Os -Werror -ffreestanding -nostdlib -Wl,--no-entry

# Not files: always run these, even if a file named "test" or "clean" exists.
.PHONY: test wasm test-wasm dev preview clean

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
# It also refreshes the harness's copy, so with `make dev` running, `make
# wasm` in another terminal reloads the page.
wasm: $(BUILD)/minesweeper.wasm $(GAME)/minesweeper.wasm

$(BUILD)/minesweeper.wasm: $(CORE) src/minesweeper.c $(wildcard src/*.h) Makefile | $(BUILD)
	$(CC) $(CFLAGS) $(WASM_FLAGS) -o $@ $(filter %.c,$^)

# The game's folder imports nothing from outside itself, so it gets its own
# copy of the module (git ignores it). $< is the first prerequisite.
$(GAME)/minesweeper.wasm: $(BUILD)/minesweeper.wasm
	cp $< $@

# Tests the built module in Node, loaded the way the browser will load it:
# its exports and imports, and that each event reaches its JS function. Then
# game-core.ts, the browser's side of the boundary, over the same module
# (Node runs TypeScript as is, with no build step).
test-wasm: $(BUILD)/minesweeper.wasm
	node --test tests/minesweeper.test.mjs web/tests/game-core.test.ts

# The harness's packages, installed again whenever package.json or the
# lockfile changes. --frozen-lockfile installs exactly what the lockfile says
# and fails rather than change it. touch: pnpm may leave node_modules' own
# timestamp as it was, and make would then reinstall every time.
web/node_modules: web/package.json web/pnpm-lock.yaml
	pnpm --dir web install --frozen-lockfile
	touch $@

# Serves the harness with Astro's dev server, which prints the address.
dev: wasm web/node_modules
	pnpm --dir web dev

# Builds the harness for production and serves the build. The site's
# Content-Security-Policy applies there (web/src/layouts/Lab.astro), so this
# is how to see the game run under it.
preview: wasm web/node_modules
	pnpm --dir web build
	pnpm --dir web preview

$(BUILD):
	mkdir -p $@

# Also removes build/tests.dSYM, where macOS puts -g's debug info, and the
# harness's build, its cache and its copy of the module (its packages stay).
clean:
	rm -rf $(BUILD) web/dist web/.astro $(GAME)/minesweeper.wasm
