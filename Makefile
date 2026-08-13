.PHONY: help install dev build preview check test clean

help: # Show help for each Makefile command.
	@grep -E '^[a-zA-Z0-9 -]+:.*#' Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

install: # Install dependencies (also self-hosts ffmpeg-core and the whisper model).
	@cd www && pnpm install

dev: # Run the app in development.
	@cd www && pnpm dev

build: # Build the app for production.
	@cd www && pnpm build

preview: # Serve the production build locally.
	@cd www && pnpm preview

check: # Type-check the app.
	@cd www && pnpm check

test: # Run unit tests.
	@cd www && pnpm test

clean: # Clean build artifacts.
	@cd www && rm -rf build .svelte-kit
