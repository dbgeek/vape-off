# vape-off v1 spec

This is the hand-off from [the wayfinder map](https://github.com/dbgeek/vape-off/issues/1). Thirteen tickets settled what the app is; this spells it out at the resolution a build agent needs, sliced so each slice is one session.

A second map, [the Track timeline's use of space](https://github.com/dbgeek/vape-off/issues/62), rewrote how Track spends its vertical space after the screen shipped. It replaced the *Track* section of [`screens.md`](./screens.md), added [ADR 0013](../adr/0013-time-axes-are-never-fitted-to-the-record.md) and the tenth invariant below, and added the **T** slices at the end of [`slices.md`](./slices.md).

## How to read it

Read in this order. The first two are short and everything else assumes them.

1. **[`CONTEXT.md`](../../CONTEXT.md)** — the glossary. Every capitalised term below is defined there and nowhere else. When this spec and the glossary disagree, the glossary wins and the spec is wrong.
2. **[`docs/adr/`](../adr/)** — the decisions with their reasoning. This spec states *what*; the ADRs state *why*, and they are what you consult before changing anything here.
3. **[`data-model.md`](./data-model.md)** — the six Dexie stores, the Backup file, the version rules.
4. **[`rules.md`](./rules.md)** — the programme as unambiguous logic, with worked figures to test against.
5. **[`screens.md`](./screens.md)** — Track, Stats, Settings, and the four exceptional states.
6. **[`slices.md`](./slices.md)** — the build order. Eleven slices, each one agent session.

## What the app is

A personal, local-only iPhone PWA for reducing and stopping vaping. It measures how much you vape for seven days, sets a daily **Target** at 90% of that, and brings the Target down by 10% every time you show you can hold it. There are two screens and no accounts.

**Stack, fixed:** React, TypeScript, Vite, `vite-plugin-pwa`, Tailwind, Dexie over IndexedDB, deployed on Vercel. **Target device:** one iPhone, iOS 16.4+. Desktop Chrome is a dev convenience with no support promise.

## The invariants

Ten rules that outrank any local decision you make while building. Each is an ADR in one line.

1. **Logging is never punished.** Going over Target is shown, never charged for. Absence is not charged for either, or the rule leaks. — [ADR 0010](../adr/0010-logging-is-never-punished.md)
2. **An unlogged Logical Day is Unknown, not zero, and never Met.** — [ADR 0001](../adr/0001-unlogged-days-are-unknown-not-zero.md)
3. **The Logical Day runs 04:00–04:00 local**, and its key is stamped at write time. — [ADR 0008](../adr/0008-the-logical-day-runs-0400-to-0400.md)
4. **The Ratchet is adaptive.** It moves on evidence, never on a clock, and never raises the Target. — [ADR 0009](../adr/0009-the-ratchet-is-adaptive-not-a-taper.md)
5. **Store the Ratchet's decisions; derive everything else.** No derived state on disk, ever. — [ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)
6. **The Ratchet stops at Target 1.** The `1 → 0` and `0 → 1` Steps are Declared by the user. — [ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)
7. **Install before data; and once data exists, never block logging.** — [ADR 0003](../adr/0003-install-before-data.md)
8. **A Backup replaces and never merges**, and import is all-or-nothing on structure. — [ADR 0004](../adr/0004-a-backup-replaces-and-never-merges.md)
9. **The schema only moves forward**, and the app refuses to run against a database newer than itself. — [ADR 0005](../adr/0005-the-schema-only-moves-forward.md)
10. **Time axes are never fitted to the record.** Every axis of *time* the app draws or reckons against is fixed in advance. Magnitude scales are excluded and may fit — the Dial's radial scales do. — [ADR 0013](../adr/0013-time-axes-are-never-fitted-to-the-record.md)

Plus one that is not an ADR but governs every string in the app: **the boundary is at the verb.** *Your largest hour is 21:00* is a reading and is in. *Your 21:00 cluster is your largest, try X* is advice and is out of v1 entirely ([#8](https://github.com/dbgeek/vape-off/issues/8)).

## What v1 does not have

Ruled out on the map, listed here so nobody rediscovers them as gaps:

accounts, cloud sync, multi-device · notifications of any kind (nothing on-device can schedule one — [#2](https://github.com/dbgeek/vape-off/issues/2)) · money-saved or nicotine-saved metrics · intensity or trigger tags on a Resisted Urge · Android, desktop, or any non-iPhone target · analytics, Speed Insights or telemetry · hour-by-day-of-week analysis and any *"Tuesdays are bad"* reading · merging two histories · re-measuring after a collapse (a second Baseline) · a server-set cookie to detect a storage wipe · advice, suggestions or interventions of any kind.

## Where this spec is thinner than the map, and why

Two places, flagged rather than hidden. Both are marked **derived, not decided** where they appear.

**1. The editing surface was never grilled.** The map settled that backfill exists and is first-class ([ADR 0001](../adr/0001-unlogged-days-are-unknown-not-zero.md)), that the catch-up strip resolves Unknown days ([#5](https://github.com/dbgeek/vape-off/issues/5), [#6](https://github.com/dbgeek/vape-off/issues/6)), that deletes are hard ([#4](https://github.com/dbgeek/vape-off/issues/4)), and that an edit which moves Momentum should say so out loud — but no ticket ever designed the surface for correcting a mis-tap. [`screens.md`](./screens.md#editing-the-record) specifies the minimum the decided rules force. Treat it as a default to review, not as a settled screen.

The second map sharpened this into a concrete hole rather than closing it: the Yesterday lane is **read-only**, and a Known yesterday carries no catch-up chip, so **correcting a completed Logical Day has no route on Track** — you can now see yesterday's mis-typed count and cannot touch it. The hole predates the lane; the lane made it visible.

**2. The live lane carries two hollow vocabularies.** A Resisted Urge ring and a Pace ghost slot are both hollow, both on the live lane, and are told apart only by which side of the now-line they fall on — rings are always at or before `now`, slots always after it. That separation is exact, and no ticket chose it; it fell out of two decisions that were made independently ([#67](https://github.com/dbgeek/vape-off/issues/67), [#70](https://github.com/dbgeek/vape-off/issues/70)). If the two read as one thing on a device, the slot changes shape.
