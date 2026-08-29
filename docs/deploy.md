# Deploying

Vercel, from `main`. Most of the deploy is in [`vercel.json`](../vercel.json); the
rest is dashboard state that no file in this repo can assert, and that is what
this page is for.

## What `vercel.json` already does

Read the file for the rules; two of them are load-bearing in ways the JSON
cannot say:

- **The SPA rewrite is not theoretical.** The 30-minute update catch-up reloads
  the page, so a reload landing on `/stats` is a request the server really
  serves.
- **`no-cache` on `sw.js` is the whole update mechanism.** A stale edge `sw.js`
  means updates never arrive at all.

Every route serves the same `index.html` through the rewrite, so each one is
named in the `no-cache` rules. **Adding a route to `src/shell/routing.ts` means
adding it here too.** Vercel's default for a static file already revalidates, so
forgetting costs correctness of intent rather than behaviour — but the intent is
that no document in this app is ever served from a cache without asking.

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
