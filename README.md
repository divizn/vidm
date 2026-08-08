# vidm

A browser-based tool that reformats landscape video into short-form
portrait video (9:16) with auto-generated, styled captions burned in.
Runs entirely client-side (ffmpeg.wasm + whisper.wasm) and works offline
after the first load.

**Status**: phase 1 — upload a video, reformat to portrait (center-crop
or blur-padded), preview, and download. No captions yet.

## Run locally

```bash
cd www
pnpm install
pnpm dev
```

Then open the printed local URL and upload a short video file.

## Repo layout

```
www/         SvelteKit app — the actual tool (start here)
api/         Go HTTP server — reserved for a later, separate auth phase
internal/    Go packages (auth/store/video) — reserved, empty stub
engine/      Rust-wasm stub — reserved placeholder
```

`api/`, `internal/`, `go.mod`, and `engine/` are not part of the
client-side roadmap and aren't built yet — they're reserved for a later,
separate phase (user accounts/auth via Go + Goth, and possibly
cross-device project sync).
