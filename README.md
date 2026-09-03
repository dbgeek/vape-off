# vape-off

A personal, local-only iPhone PWA for reducing and eventually stopping vaping.

**Live:** [vape-off.ba78.me](https://vape-off.ba78.me/)

## What it does

You log a Puff Session with a tap each time you pick up the device — no
account, no server, nothing leaves your phone. After a seven-day Baseline, the
app sets a daily Target below what you actually vape and shows Pace, a
rolling read-out of how long you can wait before the next Puff Session, spread
across the rest of the day. Hold the Target for enough days and a Ratchet
lowers it automatically; miss it and the Target holds until you do. The loop
repeats, Target after Target, down toward zero.

Read [`CONTEXT.md`](./CONTEXT.md) first — it says what the app is, and every
capitalised term in this repo is defined there and nowhere else. The build order
lives in
[`docs/spec/slices.md`](./docs/spec/slices.md), the reasoning in
[`docs/adr/`](./docs/adr/).

## Running it

```
pnpm install
pnpm dev         # Vite dev server
pnpm test        # Vitest, once
pnpm typecheck   # tsc, no emit
pnpm build       # typecheck + production build into dist/
pnpm preview     # serve dist/ — the only way to exercise the service worker
pnpm icons       # regenerate public/*.png from scripts/generate-icons.mjs
```

The service worker is not registered by the dev server, so **offline and update
behaviour can only be exercised against `pnpm preview`** or a real deploy.

## The shape of it

```
src/
  App.tsx              the shell — replaced piece by piece from S6 onward
  shell/
    build-identity.ts  git SHA + build time, injected at build time
    install-state.ts   is this running from the Home Screen?
    routing.ts         history routing: / /stats /settings
    update-control.ts  serve-offline and control-updates, the worker's two jobs
```

Deployment lives in [`docs/deploy.md`](./docs/deploy.md), including the two
Vercel toggles no file here can assert.
