# A Backup replaces, and the app never merges histories

Restoring a Backup discards everything currently in the app and installs the file's history in its place. There is no merge, no reconciliation, and no per-record conflict rule. The app holds exactly one account of any period, always.

This looks harder to justify than it is, because there is a scenario that appears to demand a merge. Two Home Screen icons for the same URL get **separate stores** — measured on-device in [#12](https://github.com/dbgeek/vape-off/issues/12) — so a user can genuinely end up with two live, divergent histories on one phone. That is the merge case, and it still resolves without one: reaching the other store's data at all means opening the other icon, and once there you can take a Backup from whichever history is the one you want to keep, then replace with it. The workaround is two taps. The merge is a permanent second definition of the record.

The event ids that would make a merge possible were already put in place by [#4](https://github.com/dbgeek/vape-off/issues/4) as cheap insurance, so this decision closes no doors in the data model. It is a decision about what the app promises, not about what the schema permits.

## Considered options

- **Replace the whole history** (chosen). One transaction, one account of the record, and a confirmation that names both sides before anything is destroyed.
- **Merge by event id**, taking the union. Rejected: the union of two divergent histories is not a history anyone lived. A day present in both with different Puff Sessions has no correct answer, and the Baseline Average — frozen once and the origin of every Target that follows — would be recomputed from a set of days that never coexisted.
- **Merge with the newer record winning per id.** Rejected for the same reason plus a worse one: it needs tombstones to represent a deletion, so a hard delete stops being a delete, and every record grows a lifetime to support a case with a two-tap workaround.
- **Offer merge only when the histories do not overlap.** Rejected as the worst of both: it is a merge, with all the machinery, that refuses to run in precisely the situation that motivated it.

## Consequences

- **Restore must stay reachable after first run.** The duplicate-icon user has an app with data in it, so hiding restore behind an empty database would strand exactly the person it exists for. It lives in settings, behind a confirmation that names the counts on both sides.
- **Import is all-or-nothing, and validated before the database is touched.** A structurally bad file is rejected whole; the write happens in a single transaction across every table. A half-restored history does not announce itself — it just produces a wrong Baseline Average and a Ratchet running from an origin that never existed, permanently and silently.
- **Semantic repair is not the same as rejection.** A Backup describing a Clear Day that also holds Puff Sessions is not corrupt; the glossary already rules that writing a Puff Session drops the mark, so import applies the rule. Refusing a good Backup over a case the domain has an answer for would be a bug wearing the costume of rigour.
- **The gap between a Backup and its restore needs no special case,** and this is worth stating so nobody later adds one. Restoring a three-week-old Backup lands the user behind a run of Unknown Logical Days, and [ADR 0001](./0001-unlogged-days-are-unknown-not-zero.md) already governs them: they stall the Ratchet and hold Momentum. The catch-up evaluation is self-correcting — after three weeks the seven most recent completed Logical Days are all Unknown, so no window is satisfied and no Step fires; restore a one-day-old Backup and it fires the Step it would have fired anyway.
- **A partial Backup cannot corrupt the Baseline origin.** Nothing derived is stored ([#4](https://github.com/dbgeek/vape-off/issues/4)), so the frozen Baseline Average is not a number in the file — it is the first Ratchet Step's target. A Backup taken after the Baseline closed carries the exact origin even if the seven Baseline days are only partly present; one taken mid-Baseline carries no Steps, and the Baseline simply resumes counting Known Logical Days.
- **The file's format is versioned independently of the database schema.** They evolve for different reasons, and a Backup written today has to open in a year. A Backup from a newer version than the app understands is refused outright rather than partially read, since silently dropping unknown fields would restore a history minus whatever the newer version added.
