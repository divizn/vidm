# vidm

![CI](https://github.com/divizn/vidm/actions/workflows/ci.yml/badge.svg)

A browser-based tool that reformats landscape video into short-form
portrait video (9:16) with auto-generated, styled captions burned in.
Runs entirely client-side (ffmpeg.wasm + whisper.wasm) — no video is
uploaded to a server. Offline PWA support is the long-term goal, not
yet built (see Status).

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
cross-device project sync). See [CLAUDE.md](./CLAUDE.md) for the full
spec, architecture, and roadmap.

## Setup

```bash
cd www
pnpm install  # postinstall self-hosts ffmpeg-core and downloads the
              # whisper model (~32MB from Hugging Face) — first install
              # will take a minute
pnpm dev
```

Then open the printed local URL and upload a short video file.

## Tests

```bash
cd www
pnpm check  # type-check (svelte-check)
pnpm test   # unit tests (vitest)
pnpm build  # production build
```

Same three commands run in CI (`.github/workflows/ci.yml`) on every PR
and push to main — `main` is branch-protected on them passing.

## Deployment

`.github/workflows/deploy.yml` builds `www/` and deploys it to
Cloudflare Pages (project `vidm`) via `wrangler pages deploy` on every
push to `main`. Requires `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repo secrets.

**Currently broken, no live URL yet**: the first deploy failed because
`ffmpeg-core.wasm` (31.2 MiB) exceeds Cloudflare Pages' 25 MiB
per-file limit on static assets. This is the asset-hosting problem
called out in [CLAUDE.md](./CLAUDE.md)'s "Known Hard Part" /
Roadmap phase 4 — self-hosting the large ffmpeg-core/Whisper-model
blobs needs a real strategy, not a plain static deploy. A `wrangler.jsonc`
R2 bucket binding (`ASSETS_BUCKET`) is reserved for this but not yet
wired up to serve those assets.

## Status

- **Reformat (done)**: upload a video, reformat to portrait 9:16 (also
  1:1/4:5/16:9) via center-crop or blur-padded fill, preview, download.
  Playback speed control (0.5x–2x). Compression: quality preset, target
  file size, custom CRF, or none.
- **Auto-captions (partial)**: whisper.cpp compiled to WASM, self-hosted,
  transcribes audio client-side — no server, no third-party API. Captions
  are editable per-segment, there's a read-only transcript view, and you
  can download the transcript as `.srt`. Captions are **not** yet burned
  into the exported video — that's FFmpeg subtitle/drawtext filter work,
  tracked on `feat/caption-burn-in`, not started.
- **Caption styling & burn-in**: not started.
- **Offline PWA**: not started. No service worker yet — the app does
  *not* currently work offline. OPFS storage and the ffmpeg-core/whisper
  asset caching strategy are still to come.
- **UI**: redesigned on shadcn-svelte + Tailwind v4, with a manual
  dark/light theme toggle (defaults to system preference, persisted).
- **Deployment**: CI/CD configured (GitHub Actions → Cloudflare Pages)
  but the first deploy fails on asset size — see
  [Deployment](#deployment). No live URL yet.
