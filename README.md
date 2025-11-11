# vidm

A browser-based video editor using **SvelteKit 5 frontend**, **FFmpeg wasm** for encoding, **Rust wasm** for CPU-heavy video processing, and **Go + Goth** for authentication.

---

## **Folder Structure**

```py
project/
├ www/                         # SvelteKit frontend (UI + wasm integration)
│  ├ src/
│  │  ├ routes/
│  │  │  └ +page.svelte        # main editor page
│  │  ├ lib/
│  │  │  ├ ffmpegWorker.js     # calls ffmpeg wasm in a web worker
│  │  │  └ wasm/               # processing wasm pkg
│  │  │     └ pkg/
│  │  │        ├ video_processing.js
│  │  │        └ video_processing_bg.wasm
│  └ package.json
│
├ internal/                     # Go internal packages (business logic)
│  ├ auth/                      # authentication logic (Goth)
│  ├ store/                     # file/video storage logic (optional)
│  └ video/                     # optional video helper packages
│
├ api/                          # Go server entrypoint
│  ├ main.go                    # HTTP server, route handlers
│  └ go.mod
│
├ engine/                       # CPU-heavy tasks compiled to wasm
│  ├ src/
│  │  └ lib.rs                  # Rust code for frame processing / filters
│  ├ Cargo.toml
│  └ pkg/                       # output of `wasm-pack build --target web`
│
├ Makefile                      # orchestrates frontend, wasm, backend dev/build
└ README.md
```

---

## **Project Overview**

* **Frontend (`www/`)**
  Handles video editor UI, timeline, file input, and video preview.
  Calls **FFmpeg wasm** for trimming, merging, and encoding.
  Calls **Rust wasm** for heavy per-frame processing or AI filters.

* **Engine (`engine/`)**
  Rust project compiled to WebAssembly.
  Performs CPU-heavy operations like frame filters, AI inference, or transformations.
  Output is imported into SvelteKit frontend.

* **Backend (`api/` + `internal/`)**
  Go api handles authentication via **Goth**, user management, and optionally video storage.
  `internal/` contains business logic packages (`auth/`, `store/`, `video/`).

---

## **Development Workflow**

All development commands are handled via the **Makefile**.
Run:

```bash
make help
```

to see available commands for:

* Frontend development (`www`)
* Rust wasm build (`engine`)
* Go backend server (`server`)
* Full project build/dev orchestration

---

## **Next Steps / TODO**

* Start project
* Implement file upload/download UI in SvelteKit.
* Add timeline and multi-clip editing.
* Integrate JWT authentication from Go backend using Goth.
* Add progress reporting for FFmpeg wasm tasks.
* Implement optional AI-based video enhancements in Rust wasm.
