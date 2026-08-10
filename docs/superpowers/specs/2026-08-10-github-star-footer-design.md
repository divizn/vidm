# GitHub Icon + Star Count Footer — Design Spec

**Goal:** Add a footer with a GitHub icon linking to the repo. When online,
show the live star count next to it; when offline, show the icon only — no
stale or missing-data placeholder, since vidm is a fully client-side,
offline-capable app and a star count is inherently a network-dependent
extra, not core functionality.

**Scope:** New `Footer.svelte`, mounted in the root layout. No existing
files change behavior; `+layout.svelte` gains one new child.

## Current state

No footer exists yet. `www/src/routes/+layout.svelte` only renders
`{@render children()}` plus the favicon link. The repo is
`github.com/divizn/vidm` (from `git remote`). Icons already come from
`@lucide/svelte`, imported per-icon (e.g. `@lucide/svelte/icons/sun`) for
tree-shaking — `@lucide/svelte/icons/github` follows the same pattern.

## Component

`www/src/lib/components/Footer.svelte`:

- A link (`<a href="https://github.com/divizn/vidm" target="_blank"
  rel="noopener noreferrer">`) wrapping the GitHub icon.
- Next to it, the star count — rendered only once a successful fetch
  resolves; otherwise the icon renders alone (no layout placeholder, no
  loading spinner, since this is a decorative footer element and any delay
  is invisible if nothing shifts).
- Mounted once in `+layout.svelte`, below `{@render children()}`.

## Data flow

On mount (`$effect` or top-level in `<script>`, since SSR is disabled
app-wide so `window`/`navigator` are always available):

1. Read a cached `{ count, fetchedAt }` from `localStorage`
   (`vidm-github-stars`), if present, and show it immediately — avoids a
   flash of icon-only on repeat visits.
2. If `navigator.onLine` is `true` and the cache is missing or older than a
   short TTL (e.g. 1 hour), fetch
   `https://api.github.com/repos/divizn/vidm` (public, unauthenticated
   GitHub REST API) and read `.stargazers_count` from the response.
   - On success: update the displayed count and overwrite the
     `localStorage` cache with the new count + timestamp.
   - On failure (network error, GitHub rate-limit 403, etc.): treat
     identically to offline — fall back to icon-only if there was no prior
     cached count to show; leave a previously-shown cached count as-is
     otherwise (don't blank out a number that was already on screen).
3. If `navigator.onLine` is `false`, skip the fetch entirely — show the
   icon only, unless a cached count already rendered from step 1 (a cached
   number from a prior online session is not "live" but isn't stale-looking
   either since it's just what shipped in step 1; re-fetching is what's
   skipped, not the cached display).
4. Listen for the `offline` window event while mounted: if it fires,
   nothing needs to happen to an already-rendered count (no requirement to
   hide a number that's already showing) — this listener exists only so a
   future `online` event, if added later, has a place to hook a retry.
   `online`-triggered retry is not required for this spec; noted as a
   natural follow-up, not built now.

## Error handling

No user-visible error states. A failed or skipped fetch simply means the
star count doesn't render (or keeps showing the last cached value) — this
is a non-critical, decorative footer element, not a feature that can fail
in a way that needs surfacing.

## Out of scope

- Any other footer content (links, credits, version number) — icon + star
  count only, for this spec.
- Authenticated GitHub API requests (would need a backend to hold a token;
  vidm has none by design — see repo `CLAUDE.md` scope note).
- Retrying the fetch on the `online` event — listener is wired for a future
  enhancement, not acted on now.
