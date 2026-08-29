# Deploying

Vercel, from `main`. Most of the deploy is in [`vercel.json`](../vercel.json); the
rest is dashboard state that no file in this repo can assert, and that is what
this page is for.

## What `vercel.json` already does

- **SPA rewrite.** Every path that is not a real file falls through to
  `/index.html`, because routing is history routing and the 30-minute update
  catch-up reloads the page — a reload landing on `/stats` is a request the
  server really serves.
- **`/assets/*` immutable for a year.** Vite content-hashes those filenames.
- **`index.html`, `sw.js` and the webmanifest `no-cache`.** A stale edge `sw.js`
  means updates never arrive at all.
- **`X-Robots-Tag: noindex, nofollow` on everything**, alongside the `noindex`
  meta in `index.html` and the disallow in `public/robots.txt`.

## What you have to set in the dashboard

These are one-click Vercel defaults rather than decisions, so they are written
down.

- **Deployment Protection: off.** This is the active hazard. Protection gates on
  a cookie, so when that cookie lapses the installed app cold-starts into a
  login page inside a chrome-less window with no way out. The deploy is public.
- **Web Analytics: off. Speed Insights: off.** No telemetry of any kind — see
  the v1 spec's exclusions. Nothing in `package.json` may gain
  `@vercel/analytics` or `@vercel/speed-insights`.

Both are worth re-checking after any Vercel project setting is touched, because
each is a toggle someone can flip without a commit.

## The build identity

`vite.config.ts` injects a short git SHA and the build timestamp at build time.
Vercel does not ship a `.git` directory to the build container, so the SHA comes
from `VERCEL_GIT_COMMIT_SHA` there and from `git rev-parse` locally. Updates are
silent, so this readout is the only way to tell what is running.

## Checking a deploy

```
curl -sI https://<deployment>/sw.js        | grep -i cache-control   # no-cache
curl -sI https://<deployment>/assets/…     | grep -i cache-control   # immutable
curl -sI https://<deployment>/stats        | grep -i 'HTTP/\|robots' # 200 + noindex
curl -s  https://<deployment>/robots.txt                            # Disallow: /
```

A `200` on `/stats` — not a `404` — is the SPA rewrite working.
