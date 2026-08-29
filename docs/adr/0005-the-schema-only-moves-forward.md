# The schema only moves forward

Every Dexie schema version the app has ever shipped keeps its `upgrade()` function in the bundle permanently, and the app **refuses to run** if it finds a database newer than the code that opened it. There is no floor below which old data stops being upgradeable, and no path by which the schema goes backwards. The corresponding rule for deployment is that a release carrying a migration is never rolled back — it is rolled forward.

This is more opinionated than the usual advice, and the reasons are specific to an app with no server, no telemetry, and one device.

## Why there is no floor

The conventional escape hatch for an ancient database is to tell the user to export and reinstall. That eats itself here: exporting requires *opening* the database, which is exactly what a floor refuses to do. Honouring a floor would mean shipping a read-only legacy reader alongside the migration chain — strictly more code than keeping the upgrader it was meant to replace.

The chain also has to be long. [ADR 0003](./0003-install-before-data.md) made updates silent and deferred to the next cold start, so a phone that sat unopened for a year arrives at the oldest version needing the whole sequence in one go. That is the normal case, not the pathological one.

Keeping upgraders is close to free. They are pure transformations over a few thousand rows of timestamps and integers, and the measured quota on the real device is 41.2 GB ([#12](https://github.com/dbgeek/vape-off/issues/12)).

## Why the app stops when it is older than its data

The obvious way to reach this state is a rolled-back deployment: one tap in Vercel, and yesterday's build meets today's database.

Dexie used to make this loud. Since 4.0.1-beta.8 it does not — it silently adapts to the installed version instead of raising `VersionError`. For this app that trades a stop for something worse. The old code opens the newer database, writes records missing whatever the newer schema added, and because the stored version never goes backwards, the newer build's upgrader has **already run** and will never revisit those rows. The corruption is permanent, silent, and — with no telemetry by deliberate choice — invisible.

So the app does the check itself: compare `db.verno` after open against the highest version the code declares, and stop if the database is ahead. The screen says *this app is older than your data*, and the advice is to update, not to restore.

Restoring here would be actively wrong: it would destroy the newer history to fix a problem that resolves itself the moment the newer build returns. There is deliberately **no read-only escape** to take a Backup first, either — old code writing a Backup of newer data would emit it at the old `formatVersion`, silently dropping whatever it did not understand, which is the failure mode [ADR 0004](./0004-a-backup-replaces-and-never-merges.md) refuses in the import direction and should not admit through the export one.

## Consequences

- **A failed open is never the first-run screen.** Dexie runs every intervening upgrader inside a single IndexedDB `versionchange` transaction and reverts on abort, so a failed migration leaves the data *intact and unreadable* rather than half-written. That makes the danger a UI one: falling through to a first-run screen invites the user to tap *Start fresh* over a database that is perfectly fine. The failed-open state is distinct, offers *Try again* and *Restore from a Backup*, and omits *Start fresh* entirely — it cannot know whether there is anything to destroy, because the only record of that is inside the database it could not open.
- **Every upgrader must do all its work on the transaction it is given, and await nothing outside it.** The atomicity above is the guarantee the whole failure model rests on, and a single stray non-Dexie await lets the `versionchange` transaction commit early and takes it away.
- **Rebuilding from a Backup is recovery, never migration.** In-place migration is atomic and self-reverting; wipe-and-reimport puts a destructive delete outside any transaction that could undo it, and assumes a current Backup. It is what the failed-open screen does after *Try again* fails, and nothing else.
- **Migrations are additive by default.** An additive change needs no data pass and therefore cannot corrupt anything. A migration that rewrites or drops existing rows is the exception, and carries a snapshot of the affected tables into a `preMigration` store inside the same `versionchange` transaction — declared by the migration that needs it, dropped by the next one. Atomicity protects against an upgrader that throws; nothing but a snapshot protects against one that runs clean and is wrong.
- **`formatVersion` bumps when the record set changes, not when the schema does.** [ADR 0004](./0004-a-backup-replaces-and-never-merges.md) made the Backup's format version independent of the database's, and the rule joining them is that a migration bumps `formatVersion` only if it changes *what is in* the records — a field that cannot be defaulted, a table split, a changed meaning. Index-only migrations, the common case, cost the file nothing. Conversely the app never refuses a Backup on `schemaVersion` grounds, only `formatVersion`; refusing on the diagnostic would re-couple what was deliberately separated.
- **`version(1)` is frozen the day the app holds history worth grieving,** and not before. Schema churn during the build deletes and recreates the database, because writing upgraders for shapes no user ever held bakes in migrations that were never exercised against real data. Crossing that line is a deliberate act, and it is easy to cross by accident.
