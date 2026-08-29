/**
 * Asserts the facts about `dist/` that S1 rests on and that unit tests cannot
 * see, because they are properties of the built output rather than of any
 * module. Runs as part of `pnpm build`, so a later slice that changes
 * `vite.config.ts` fails here rather than on a device a week later.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')
const failures = []

function check(description, condition) {
  if (!condition) failures.push(description)
}

// --- the service worker: serve offline, control updates, and nothing else ---

const sw = readFileSync(join(dist, 'sw.js'), 'utf8')

check(
  'sw.js listens for SKIP_WAITING, which is how the catch-up takes a worker over',
  sw.includes('SKIP_WAITING'),
)

// The only legitimate skipWaiting() in this app is the one the page asks for by
// message. An unconditional one — what `registerType: 'autoUpdate'` produces —
// takes over mid-session, which is the thing S1 exists to prevent.
const skipWaitingCalls = [...sw.matchAll(/skipWaiting\(\)/g)]
check('sw.js calls skipWaiting() exactly once', skipWaitingCalls.length === 1)
check(
  'sw.js calls skipWaiting() only from the SKIP_WAITING listener — never on its own',
  skipWaitingCalls.every((match) => sw.lastIndexOf('SKIP_WAITING', match.index) > match.index - 200),
)
check('sw.js does not claim clients out from under the running page', !sw.includes('clientsClaim'))
check('sw.js precaches the app shell', sw.includes('url:"index.html"'))
check(
  'sw.js falls back to index.html for navigations, so history routing works offline',
  sw.includes('createHandlerBoundToURL') && sw.includes('"/index.html"'),
)
check(
  'sw.js is self-contained, with no second file to cache wrongly',
  readdirSync(dist).every((name) => !name.startsWith('workbox-')),
)

const precached = [...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1])
check(
  'sw.js precaches each URL exactly once',
  new Set(precached).size === precached.length,
)

// --- the manifest: what makes it installable ---

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'))

for (const field of ['id', 'start_url', 'background_color']) {
  check(`the manifest carries ${field}`, Boolean(manifest[field]))
}
check('the manifest is standalone', manifest.display === 'standalone')
check('the manifest offers a maskable icon', manifest.icons?.some((icon) => icon.purpose === 'maskable'))

// --- index.html: the layout constraint and the deploy posture ---

const html = readFileSync(join(dist, 'index.html'), 'utf8')

check('index.html sets viewport-fit=cover, so env(safe-area-inset-*) is not zero', html.includes('viewport-fit=cover'))
check('index.html links an apple-touch-icon', html.includes('rel="apple-touch-icon"'))
check('index.html carries the legacy apple-mobile-web-app-capable', html.includes('apple-mobile-web-app-capable'))
check('index.html is noindex', /name="robots"[^>]*noindex/.test(html))
check('index.html links the manifest', html.includes('rel="manifest"'))

// --- no telemetry, stated because it is a one-click default ---

check(
  'the bundle carries no Vercel analytics',
  !readFileSync(join(dist, 'index.html'), 'utf8').includes('/_vercel/insights'),
)

// --- robots ---

check('robots.txt disallows everything', readFileSync(join(dist, 'robots.txt'), 'utf8').includes('Disallow: /'))

if (failures.length > 0) {
  console.error('Build output does not satisfy S1:')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}

console.log(`Build output satisfies S1 (${precached.length} precached entries).`)
