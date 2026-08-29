# Store the Ratchet's decisions; derive everything else

The database holds two kinds of thing and nothing else: **events the user reported** — Puff Sessions, Resisted Urges, Clear Days — and **decisions the app made** — Ratchet Steps, and the record of when a Backup was taken. Every other quantity in the glossary is computed on read and never written down: Target, Met, Momentum, Pace, Steps Remaining, Step Cadence, the Quit Horizon, Longest Gap, the Baseline Average.

Recorded here late; decided in [#4](https://github.com/dbgeek/vape-off/issues/4), which is where the reasoning and the schema came from.

## The shape

A **Ratchet Step** is `{ effectiveFrom, target }`, appended and never amended. The Target in force on any Logical Day is the value from the most recent Step at or before it.

This works because the Ratchet is already forward-only and irreversible: it never lowers on a schedule and — the `1 ↔ 0` Declared boundary of [ADR 0006](./0006-the-ratchet-stops-at-target-1.md) aside — never raises. That is an event, so it is stored as one. Two to five rows a year, no per-day rows, and no *does today's row exist yet* branch on every read.

## Why not a row per Logical Day

The obvious alternative is a `days` table carrying the Target, the total and a Met flag. It has one virtue — history is fixed once written — and three costs:

- **A write path on every read.** Something has to create today's row, which means every reader is also a writer, and the first read of a Logical Day behaves differently from the rest.
- **Derived state ages.** A Met flag written on Tuesday is a claim about a Target that could still be recomputed differently on Wednesday. Two sources of truth for the same fact is a bug waiting for a backfill.
- **The Baseline needs a special case,** because the first seven Known Logical Days have no Target to store.

The Step log gets the immutability without any of them. Backfilling a Puff Session into March cannot change what the Target *was* in March, because the Step that set it is still sitting there with its date on it. And the Baseline needs no special case at all: it is simply the period before the first Step.

## Why not derive the Target too

The other alternative is to store nothing and recompute the whole descent from the events on every read. It is exactly wrong for the same reason the Step log is right: **a Target the app once showed you is a fact about the past, not a function of the current record.** Recompute it and a backfilled day silently rewrites what you were being judged against last month, which is [ADR 0010](./0010-logging-is-never-punished.md) violated through the back door.

## Consequences

- **A Step is dated the Logical Day it was computed, and never backdated.** Nothing runs while the app is closed ([#2](https://github.com/dbgeek/vape-off/issues/2)), so evaluation is a lazy catch-up on open plus a re-evaluation after any edit, and both can discover that the window was satisfied days ago. Neither backdates: a Target applies from the moment the app could have shown it to you.
- **At most one Step per evaluation,** enforced by `&effectiveFrom` being unique rather than by the code remembering. See [ADR 0009](./0009-the-ratchet-is-adaptive-not-a-taper.md).
- **The frozen Baseline Average is not a number anywhere.** It is materialised as the first Ratchet Step's target. This is what makes a partial Backup safe: the origin of every Target that follows travels in one row, even if the seven Baseline days are only partly present in the file ([ADR 0004](./0004-a-backup-replaces-and-never-merges.md)).
- **The Backup is therefore the whole of what cannot be recomputed,** which is what lets [ADR 0004](./0004-a-backup-replaces-and-never-merges.md) define it in one sentence and carry nothing derived.
- **Correcting the past moves the derived numbers, and the app must say so.** Log a session you forgot three days ago and Momentum drops. That is right — it describes the record and you just corrected the record — but it argues for an edit confirmation that names the change rather than one that moves the number silently.
- **Every event stores its Logical Day key and its IANA zone at write time.** The key cannot be computed on read without re-bucketing history the first time the user travels, and IndexedDB cannot index a computed expression anyway. See [ADR 0008](./0008-the-logical-day-runs-0400-to-0400.md).
- **Every event carries a UUID.** Cheap insurance, and the one thing that cannot be retrofitted — stable identity cannot be invented for records already written without it. It is what leaves merge permanently available as a thing the app *declines* to do rather than a door the schema closed ([ADR 0004](./0004-a-backup-replaces-and-never-merges.md)).
- **Hard delete, no tombstones.** Right for a single-device app that never merges. Cheap to add later if that ever changes; unlike ids.
- **`meta` is the exception that proves the rule.** `installId` describes the *store* rather than the history, which is precisely why it can distinguish a duplicate Home Screen icon from a wipe ([#12](https://github.com/dbgeek/vape-off/issues/12)) — so it lives outside the tables a restore replaces ([ADR 0005](./0005-the-schema-only-moves-forward.md)).
