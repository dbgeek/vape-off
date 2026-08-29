# Data model

Six Dexie stores, one Backup file format, three version numbers of which one is load-bearing. Everything here follows from [ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md), [ADR 0004](../adr/0004-a-backup-replaces-and-never-merges.md) and [ADR 0005](../adr/0005-the-schema-only-moves-forward.md).

## The stores

```ts
db.version(1).stores({
  puffSessions:  '&id, logicalDay, at, [logicalDay+at]',
  resistedUrges: '&id, logicalDay, at, [logicalDay+at]',
  clearDays:     '&logicalDay',
  ratchetSteps:  '&id, &effectiveFrom',
  exports:       '&id, logicalDay, at',
  meta:          '&key',
})
```

The `stores()` string lists indexes, not fields. The records:

```ts
type LogicalDayKey = string   // 'YYYY-MM-DD', the date the Logical Day *starts* on
type Instant       = string   // ISO 8601 with offset, e.g. '2026-08-29T21:14:03.221+02:00'

type PuffSession = {
  id: string              // UUID (crypto.randomUUID)
  at: Instant             // the FIRST tap of the sitting — see Merge Window below
  lastTapAt: Instant      // the most recent tap; the sliding Merge Window is measured from this
  count: number           // integer >= 1
  logicalDay: LogicalDayKey
  tz: string              // IANA zone at write time, e.g. 'Europe/Stockholm'
}

type ResistedUrge = {
  id: string
  at: Instant
  logicalDay: LogicalDayKey
  tz: string
}

type ClearDay = {
  logicalDay: LogicalDayKey   // the primary key; the record is the assertion
  at: Instant                 // when it was declared
  tz: string
}

type RatchetStep = {
  id: string
  effectiveFrom: LogicalDayKey   // unique; the day it was COMPUTED, never backdated
  target: number                 // integer >= 0
  kind: 'earned' | 'declared'
  at: Instant
}

type ExportRecord = {
  id: string
  at: Instant
  logicalDay: LogicalDayKey
  restoredFrom?: string   // present only on the row a restore writes: the file's installId
}

type MetaRecord = { key: string; value: unknown }
```

`meta` holds exactly three keys in v1: `installId` (a UUID minted on first run), `firstRunCardDismissed` (boolean), and `lastBackupNagDismissedAt` (an `ExportRecord`-relative counter — see [rules.md](./rules.md#the-export-nag)). Future migration bookkeeping goes here too.

### Why these fields

- **`&id` is a UUID.** The one thing that cannot be retrofitted: stable identity cannot be invented for records already written without it. It is what keeps merge permanently *available* as something the app declines to do ([ADR 0004](../adr/0004-a-backup-replaces-and-never-merges.md)).
- **`logicalDay` is stamped at write time**, from the device's local zone at that moment, keyed to the date the Logical Day starts on — 02:00 on the 15th stamps as `2026-01-14`. Never computed on read: a computed key would silently re-bucket the whole history the first time the user travels, and IndexedDB cannot index a computed expression anyway. It also disposes of DST — one Logical Day a year is 23 hours and one is 25, and nobody cares, because the key came from the wall clock in front of the user.
- **`at` is the audit trail; `logicalDay` is the aggregation key.** Never aggregate by parsing `at`.
- **`tz`** costs nothing and keeps the time-of-day dial truthful across travel.
- **`[logicalDay+at]`** serves both *everything on this day, in order* and the dial's time-of-day scan.
- **`lastTapAt` is this spec's one addition to [#4](https://github.com/dbgeek/vape-off/issues/4)'s schema**, and it is mechanical rather than a design choice. The Merge Window slides, so a tap has to be compared against the previous *tap*, not against the session's start. Holding that in memory would break the window across a cold start — and on an app opened twenty times a day that iOS may evict at will, a relaunch inside the window would split a single sitting in two, which is exactly what [#6](https://github.com/dbgeek/vape-off/issues/6) pinned the sliding window to prevent.
- **`kind` on a Ratchet Step** distinguishes Earned from Declared ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)). **Step Cadence reads Earned Steps only**, so this field is load-bearing rather than descriptive.
- **`&effectiveFrom` is unique**, which is how *at most one Step per evaluation* is enforced by the schema rather than by the code remembering ([ADR 0009](../adr/0009-the-ratchet-is-adaptive-not-a-taper.md)).
- **Hard delete, no tombstones.**

### `meta` is outside the history

`meta` is excluded from the Backup's contents **and** from the restore transaction. It describes the *store*, not the history — which is precisely what lets `installId` distinguish a duplicate Home Screen icon from a wipe ([#12](https://github.com/dbgeek/vape-off/issues/12)). A restoring install keeps its own `installId`; the file's is recorded as `restoredFrom` on the `ExportRecord` the restore writes. Overwriting it would let two icons claim the same identity and destroy the only signal in the system that can tell them apart.

### Opening the database

1. Open. On failure, retry **once** automatically — iOS has a history of a failed first open after a crash.
2. On success, compare `db.verno` against the highest version the code declares. **If the database is ahead, stop** and show the *older than your data* state ([screens.md](./screens.md#3-the-app-is-older-than-its-data)). Dexie 4 no longer raises `VersionError` here and silently adapts instead, which for a rolled-back deploy means permanent, invisible corruption — so the app performs the check the library abandoned.
3. On failure after retry, show the failed-open state ([screens.md](./screens.md#2-the-database-would-not-open)). **Never fall through to the first-run card**: the data is intact and merely unreadable by this build.
4. If `meta.installId` is absent, mint one.

### Migrations, after v1 ships

- **`version(1)` is frozen the day the app holds history worth grieving, and not before.** Until then the build churns freely with `deleteDatabase`. Crossing that line is a deliberate act and it is easy to cross by accident.
- Every `version(n).upgrade()` stays in the bundle **forever**. There is no floor.
- **Every upgrader does all its work on the `tx` it is handed and awaits nothing outside it.** A single stray non-Dexie await lets the `versionchange` transaction commit early and silently removes the atomicity the whole failure model rests on.
- **Migrations are additive by default.** One that rewrites or drops rows snapshots the affected tables into a `preMigration` store *declared by that migration*, inside the same transaction; the next version drops it.
- **Never roll back a release carrying a migration.** Roll forward.

## The Backup file

One JSON file, pretty-printed with 2-space indent and stable key order, named `vape-off-YYYY-MM-DD.json`.

```jsonc
{
  "formatVersion": 1,
  "schemaVersion": 1,              // diagnostic only
  "appBuild": { "sha": "…", "builtAt": "…" },   // diagnostic only
  "exportedAt": "2026-08-29T21:14:03.221+02:00",
  "installId": "…",                // the exporting store's id
  "summary": {                     // NON-AUTHORITATIVE, never read back into the app
    "puffSessions": 4820, "resistedUrges": 611, "clearDays": 12, "ratchetSteps": 9,
    "firstLogicalDay": "2026-01-04", "lastLogicalDay": "2026-08-29",
    "currentTarget": 11
  },
  "puffSessions":  [ /* … */ ],
  "resistedUrges": [ /* … */ ],
  "clearDays":     [ /* … */ ],
  "ratchetSteps":  [ /* … */ ],
  "exports":       [ /* … */ ]
}
```

Five tables. `meta` is not among them. Nothing derived is in the file, because nothing derived is on disk — a Backup carrying Target, Met or Momentum would carry a second, ageing copy of facts the events already determine.

**The summary is written for the human and for the replace-confirmation, and is never read back.** Import recomputes everything from the events and uses the summary only to cross-check for truncation. The duplication is the point of tension and it is worth paying: a Backup you cannot identify before restoring is one you hesitate to use, and hesitating is how the responsible thing stops happening.

**An export cannot contain its own row.** The `exports` array is the log as it stood before this export; `exportedAt` covers this one. The exporting app appends its own `ExportRecord` after the file is handed off.

### The three version numbers

| Field | What it versions | Import branches on it? |
| --- | --- | --- |
| `formatVersion` | the shape of *this file* | **yes — the only one** |
| `schemaVersion` | the Dexie version that wrote it | no, diagnostic |
| `appBuild` | git SHA + build timestamp | no, diagnostic |

They are independent **on purpose**: a Dexie migration that adds an index need not change the file, and a change to the file's layout need not touch the database. Coupling them would make every schema migration a breaking change for every Backup ever written.

- **Older `formatVersion`** — migrated forward through an explicit chain of transforms at import. No floor: a Backup written today opens in a decade.
- **Higher `formatVersion` than the app knows** — **refused outright**, with *"This backup was made by a newer version of vape-off."* Parsing what you recognise and ignoring the rest restores a history minus whatever the newer version added, silently, for a file that is by construction the only copy.
- **`formatVersion` bumps when a migration changes what is *in* the record set** — a field that cannot be defaulted, a table split, a changed meaning — **and never for an index-only change.** The app never refuses a Backup on `schemaVersion` grounds; refusing on the diagnostic would re-couple exactly what was paid to separate.

### Measured facts about the file

From the on-device probe in [#24](https://github.com/dbgeek/vape-off/issues/24), iOS 18.7 / WebKit 605.1.15. Build to these numbers rather than to guesses:

- Two years at ~20 Puff Sessions a day is **2.5 MB** pretty-printed (16,843 records). Ten years is **12 MB** — generated in 169 ms, imported in 18 ms. **There is no size cliff.**
- `navigator.canShare({ files })` is `true`, and **stays true with `title`/`text` alongside**.
- **The export can be built at tap time.** The full 2.5 MB serialised synchronously inside the click handler still opened the share sheet — user activation survived ~170 ms of synchronous work. No pre-built blob, no spinner, no pre-warmed file.
- The round trip is **byte-identical by SHA-256**; the filename survives Save to Files verbatim; the MIME type comes back `application/json`; AirDrop and Mail both work.
- **`<a download>` works** — it produced a save sheet. It stays a *fallback*, because the share sheet reaches AirDrop and Mail while a download reaches only Files — but it is **live code to write, not dead code to drop**. A working second path for the only copy of an irreplaceable record is where redundancy earns its keep.
