# vape-off

A personal, local-only iPhone PWA for reducing and eventually stopping vaping.

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
