# vidm

![CI](https://github.com/divizn/vidm/actions/workflows/ci.yml/badge.svg)
![Deploy](https://github.com/divizn/vidm/actions/workflows/deploy.yml/badge.svg)

A browser-based, lightweight video editor: reformat to portrait (or
another ratio), adjust speed, compress, and auto-generate styled,
burned-in captions — each an independent, optional tool. Runs entirely
client-side (ffmpeg.wasm + whisper.wasm) — no video is uploaded to a
server. Offline PWA support is the long-term goal, not yet built (see
Status).

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
Cloudflare Workers (project `vidm`) via `wrangler deploy` on every
push to `main`. Requires `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repo secrets. See the Deploy badge above for
current status.

## Status

- **Reformat (done, optional)**: reformat to portrait 9:16 (also
  1:1/4:5/16:9) via center-crop or blur-padded fill, or skip reformatting
  entirely ("no reformat" keeps the source frame). Preview, download.
  Playback speed control (0.5x–2x). Compression: quality preset, target
  file size, custom CRF, or none. Every tool is independently optional;
  at least one must be active to export.
- **Auto-captions (done)**: whisper.cpp compiled to WASM, self-hosted,
  transcribes audio client-side — no server, no third-party API. Captions
  are editable per-segment, there's a read-only transcript view, and you
  can download the transcript as `.srt`.
- **Caption styling & burn-in (done)**: font, position, and color
  controls; captions burn into the exported video via FFmpeg's `ass`
  (libass) filter, with word-by-word karaoke-style highlight timed from
  whisper's token timestamps. A live CSS preview shows the exact same
  text/timing before you export, no ffmpeg run needed to check a style
  change.
- **Offline PWA**: not started. No service worker yet — the app does
  *not* currently work offline. OPFS storage and the ffmpeg-core/whisper
  asset caching strategy are still to come.
- **UI**: redesigned on shadcn-svelte + Tailwind v4, with a manual
  dark/light theme toggle (defaults to system preference, persisted).
- **Deployment**: CI/CD configured (GitHub Actions → Cloudflare Workers),
  see [Deployment](#deployment) and the badge above for current status.
