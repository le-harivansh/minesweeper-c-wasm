CC := /opt/homebrew/opt/llvm/bin/clang
CFLAGS := -std=c23 -Wall -Wextra -pedantic -g
SANITIZE := -fsanitize=address,undefined -fno-sanitize-recover=all

BUILD := build

.PHONY: test clean

test: $(BUILD)/tests
			./$(BUILD)/tests

$(BUILD)/tests: $(wildcard src/*.c src/*.h tests/*.c tests/*.h) | $(BUILD)
		$(CC) $(CFLAGS) $(SANITIZE) -Isrc -o $@ $(filter %.c,$^)

$(BUILD):
		mkdir -p $@

clean:
	rm -rf $(BUILD)
