.PHONY: help dev build auth clean

help: # Show help for each Makefile command.
	@grep -E '^[a-zA-Z0-9 -]+:.*#' Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

dev: # Run backend and frontend for development.
	@echo "Starting Go backend..."
	@go run ./server/main.go &
	@echo "Starting SvelteKit frontend..."
	@cd www && pnpm dev

build: # Build Rust engine (WASM) and SvelteKit frontend.
	@echo "Building Rust engine..."
	@cd engine && cargo build --release --target wasm32-unknown-unknown
	@echo "Building SvelteKit frontend..."
	@cd www && pnpm build

auth: # Setup authentication with Goth.
	@echo "Setting up authentication..."
	@cd server && go run cmd/auth_setup.go

clean: # Clean all build artifacts.
	@echo "Cleaning qRust engine..."
	@cd engine && cargo clean
	@echo "Cleaning SvelteKit build..."
	@cd www && rm -rf build .svelte-kit
	@echo "Cleaning Go binaries..."
	@find server -type f -name '*.out' -delete
