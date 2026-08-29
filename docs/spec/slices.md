# The build order

Eleven slices, each sized for one agent session. Build them in order — every slice depends on the ones above it and none depends on the ones below.

**Every slice:** read [`CONTEXT.md`](../../CONTEXT.md) and [`README.md`](./README.md)'s invariants first, use the glossary's vocabulary in names and tests, and do not invent behaviour this spec does not describe. If you find a genuine gap, say so in the PR rather than filling it silently — the only one known in advance is flagged in the README.

**Slices S3–S5 are pure logic and must be unit-tested.** They are where every rule in the app lives; the screens above them are rendering. Test against [rules.md §15](./rules.md#15-fixtures).

---

## S1 · Shell, install, deploy

The container from [ADR 0003](../adr/0003-install-before-data.md) and [#10](https://github.com/dbgeek/vape-off/issues/10). No data, no domain.

- Vite + React + TypeScript + Tailwind. `vite-plugin-pwa` with `generateSW` and **`registerType: 'prompt'`** — a misnomer here, meaning *do not `skipWaiting` automatically*.
- **Hard offline**: precache the whole app. With no server cookie and no telemetry the app has *no* runtime network dependency, which is what makes precache-everything reachable. The worker's only two jobs are serve-offline and control-updates.
- **Updates are silent and never mid-session.** A new version installs in the background and takes over on the next cold start. Plus the bounded catch-up: on `visibilitychange` → visible, if a worker is waiting *and* the app was hidden longer than **30 minutes**, call `skipWaiting()` and reload on `controllerchange`. A plain `location.reload()` does **not** let a waiting worker activate — the client is never unloaded — so the catch-up necessarily calls `skipWaiting()`, made safe by reloading immediately.
- Manifest: `id`, `start_url`, `display: standalone`, `background_color`, `apple-touch-icon`, plus legacy `apple-mobile-web-app-capable`. **Splash screens skipped for v1.**
- **`viewport-fit=cover`** and `env(safe-area-inset-bottom)` wired into the layout from the start.
- History routing with a Vercel SPA rewrite; `/assets/*` immutable for a year; **`index.html` and `sw.js` `no-cache`** — a stale edge `sw.js` means updates never arrive at all.
- **Public deploy with `noindex` + robots disallow.** Deployment protection is an active hazard: it gates on a cookie, so when that lapses the installed app cold-starts into a login page inside a chrome-less window.
- **No Analytics, no Speed Insights, no telemetry.** Stated because it is a one-click Vercel default rather than a decision.
- Build identity — git SHA and build timestamp injected at build time — exposed to the app.
- Install detection helper: `matchMedia('(display-mode: standalone)').matches || navigator.standalone`.

**Done when** the empty app installs to the Home Screen, opens offline from the icon, survives airplane mode, and shows its build identity.

## S2 · The store

[data-model.md](./data-model.md), [ADR 0005](../adr/0005-the-schema-only-moves-forward.md), [ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md).

- The six stores exactly as declared. Record types as specified.
- `logicalDayKeyOf()` and the write-time stamping of `logicalDay` + `tz`. **Never compute the key on read.**
- The open sequence: one automatic retry, then the `db.verno` check, then `installId` minting. Return a discriminated result — `ok` / `failed-open` / `older-than-data` — as *data*. The screens come in S11.
- `meta` accessors.
- **Keep `deleteDatabase` churn until the app holds history worth grieving.** `version(1)` freezes the day it does, and that is a deliberate act.

**Done when** records round-trip, the day key is correct across the 04:00 boundary and across a simulated timezone change, and the three open outcomes are reachable in tests.

## S3 · The day ledger

[rules.md §1–3, §5](./rules.md#1-time). Pure functions over the record.

`dayTotal`, `isKnown`, `isCompleted`, `completedDays(n)`, `baselineDays`, `baselineAverage`, `isMet`. Plus the write-path rule that a Puff Session into a Clear Day drops the mark.

**Done when** unit tests cover: Unknown is never Met; a Resisted-Urge-only day is Known and Met at every Target including 0; a Clear Day is a Known zero; an Unknown day extends the Baseline; today is never judged.

## S4 · The Ratchet

[rules.md §6](./rules.md#6-the-ratchet), [ADR 0009](../adr/0009-the-ratchet-is-adaptive-not-a-taper.md), [ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md).

`nextEarnedTarget`, `windowSatisfied`, `targetOn`, `evaluate()`, and the two Declared writes.

**Done when** the fixtures in [rules.md §15](./rules.md#15-fixtures) pass exactly — 16 / 26 / 35 Steps from Baseline Averages of 20 / 60 / 150 — and tests cover: the six-day cadence floor; at most one Step per evaluation across a twelve-day backfilled gap; no Step and no Momentum change across a seven-day absence; a Step is never backdated; the Ratchet never writes `1 → 0`; it is dormant at 0 and a Declared `0 → 1` wakes it.

## S5 · The readouts

[rules.md §7–12](./rules.md#7-momentum). Pure functions, no UI.

`momentum`, `pace`, `stepsRemaining`, `stepCadence`, `quitHorizon`, `longestGap`.

**Done when** tests cover: Momentum holds across a gap and never goes below zero; each of Pace's three silences; a Pace slot never lands past the close; the unlogged-morning drift; the Horizon absent during the Baseline, absent before two Earned Steps, and *withdrawn* past 2× cadence rather than crept; Longest Gap reading 22 hours rather than 12 days after a twelve-day absence.

## S6 · Track, the logging path

[screens.md](./screens.md#track--the-logging-screen).

The timeline, marks and rings, the header chip, the ghost slots, the over-Target hairline, PUFF and Resisted in the bottom-right, the sliding 90-second Merge Window with its visible open session and `+1 → 3` button, and the badge.

**Done when** logging costs one tap with no looking, a burst of taps two minutes apart stays one Puff Session, the window survives a cold start, and over-Target reads as a fact rather than a telling-off.

## S7 · Track, the returning and the new user

The catch-up strip (non-blocking, capped at seven), the Clear Day control for past days and for today, the editing surface, and the first-run card with its restore door.

**The editing surface is the one place this spec is thinner than the map** — build the default in [screens.md](./screens.md#editing-the-record) and flag it for review rather than elaborating on it.

**Done when** a returning user can resolve a fortnight without being told off, leaving a day Unknown is comfortable, an edit that moves Momentum says so first, and the first-run card carries the Baseline explanation and both paragraphs of the restore door.

## S8 · Stats and the Baseline screen

[screens.md](./screens.md#stats--and-the-baseline-screen-it-grows-out-of).

The Dial (04:00 at the top, outward/inward, independently scaled, 14-day window, no control), the *N of 7* Baseline screen that converts on close, the two tiles, the 28-day sparkline with the Target step line breaking across Unknown days, Longest Gap with its footnote, the peak-hour readout, and the Target 0 layout with the step-back behind its trip.

**Done when** the screen is useful on day 3 and at Target 0, and no string on it crosses the verb boundary.

## S9 · Backup — export

[data-model.md](./data-model.md#the-backup-file), [rules.md §13](./rules.md#13-the-export-nag).

The envelope, the five tables, the non-authoritative summary, `installId`, the `exports` append after hand-off. **Build the file at tap time** — measured safe at 2.5 MB inside the handler ([#24](https://github.com/dbgeek/vape-off/issues/24)) — so no pre-built blob and no spinner. `navigator.share({ files })` primary, guarded by `canShare`; **`<a download>` as a live fallback, not dead code.** Filename `vape-off-YYYY-MM-DD.json`, pretty-printed, stable key order. Plus the nag: silent in a tab, status line from day one, card at 30.

**Done when** a 2.5 MB export opens the share sheet from a single tap, saves to Files under its own name, and the nag counts Known Logical Days rather than elapsed ones.

## S10 · Backup — restore

[ADR 0004](../adr/0004-a-backup-replaces-and-never-merges.md), [ADR 0005](../adr/0005-the-schema-only-moves-forward.md).

`<input type="file">`; **validate the whole file in memory before touching the database**; the `formatVersion` chain forward and outright refusal of anything newer; **semantic repair** of a Clear Day holding Puff Sessions; then clear-and-insert in **one Dexie transaction across all five tables**, leaving `meta` untouched so the install keeps its own `installId`. Write the `ExportRecord` carrying `restoredFrom`. Confirm with counts from both sides — and not at all when there is nothing to replace. Run `evaluate()` afterwards. **Refused entirely in a tab.**

**Done when** a force-quit mid-import leaves the previous database exactly as it was, a newer-format file is refused whole, and restoring a three-week-old Backup fires no Step.

## S11 · The exceptional states, and Settings

[screens.md](./screens.md#the-four-exceptional-states).

The install wall with its small honest escape; the permanent bar; the failed-open state with *Try again* and *Restore* and **no *Start fresh***; the *older than your data* state with no restore and no retry; and Settings — present from first run, unreduced — carrying backup, restore, and the build identity.

**Done when** all four are reachable in a test harness and none of them can be confused for the first-run card.

---

## Before it is done

- **The whole thing runs from the Home Screen icon on a real iPhone**, offline, for a week. Every storage fact this app rests on is a WebKit fact ([#3](https://github.com/dbgeek/vape-off/issues/3), [#12](https://github.com/dbgeek/vape-off/issues/12), [#24](https://github.com/dbgeek/vape-off/issues/24)) and two of the three device trips this map made overturned something.
- **Take a Backup and restore it on a second device.** Migration survival is the one thing the probes could not test — it was recorded as unknown and treated as loss, which is what *export is the only migration path* already assumed.
- **`version(1)` freezes** the moment real history exists.
