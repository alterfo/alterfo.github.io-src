EMCC     := emcc
OUT_DIR  := ../web
WASM_OUT := $(OUT_DIR)/engine.wasm
JS_OUT   := $(OUT_DIR)/engine.js

SRCS     := engine.c
CFLAGS   := -O2 -std=c11

EXPORTED_FUNCTIONS := \
	_engine_init,\
	_engine_reset,\
	_engine_push_samples,\
	_engine_get_frame,\
	_engine_set_envelope,\
	_malloc,\
	_free

EXPORTED_RUNTIME  := ccall,cwrap,setValue,getValue,HEAPF32

EMFLAGS := \
	-s WASM=1 \
	-s EXPORTED_FUNCTIONS='[$(EXPORTED_FUNCTIONS)]' \
	-s EXPORTED_RUNTIME_METHODS='[$(EXPORTED_RUNTIME)]' \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s MODULARIZE=1 \
	-s EXPORT_NAME=AudioEngine \
	-s ENVIRONMENT=web \
	--no-entry

.PHONY: all clean

all: $(WASM_OUT)

$(OUT_DIR):
	mkdir -p $(OUT_DIR)

$(WASM_OUT): $(SRCS) engine.h | $(OUT_DIR)
	$(EMCC) $(CFLAGS) $(EMFLAGS) $(SRCS) -o $(JS_OUT)
	@echo "Built: $(JS_OUT) + $(WASM_OUT)"

clean:
	rm -f $(JS_OUT) $(WASM_OUT)
