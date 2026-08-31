# The Logical Day runs 04:00 to 04:00

Every daily quantity in the app — the total that decides **Met**, the seven days the **Ratchet** looks at, the ring the stats dial draws — is computed against a day that begins and ends at **04:00 local time**, not midnight.

This was settled while the map was being charted and is recorded here late, because the whole programme is built on it and nothing else in `docs/adr/` says why.

## Why not midnight

Vaping clusters in the evening, and the evening does not stop at midnight. Under a calendar day, a 01:00 puff belongs to the day you are about to wake up into rather than the one you are still living. Three separate mechanisms break on that:

- **Met becomes a lottery at the boundary.** Stay up late and the last few puffs of an evening land against tomorrow's Target, which you have then already spent before waking. The user learns to stop logging after midnight.
- **The Ratchet's window inherits the error.** A late night can push one day under Target and the next over it, so the five-of-seven count reflects when the user went to bed as much as how much they vaped.
- **The heatmap splits the shape it exists to show.** A 00:00–23:00 axis cuts an evening cluster in half and draws the two halves on different days. [#8](https://github.com/dbgeek/vape-off/issues/8) found this concretely: the dial had to be rotated so 04:00 sits at the top, and the one place the rejected matrix variant fought the domain was having to re-order its rows to run 04→03.

04:00 is chosen because almost nobody is awake and vaping at 04:00, so the boundary falls in the quietest hour available. It is not derived from the user's own behaviour, for the reason [#17](https://github.com/dbgeek/vape-off/issues/17) later gave for the **Pace Window**: a boundary that moves with your record moves *because* your record changed.

## Considered options

- **04:00 to 04:00, hard-coded** (chosen). One constant, no configuration, no derivation, no seed problem on day one.
- **Midnight to midnight.** The conventional answer, broken as above.
- **A configurable boundary.** Rejected on the map's single-user, no-configurability premise, and because a setting that shifts the boundary retroactively re-buckets every day of history at once.
- **Derive it from the quietest observed hour.** Rejected: it needs the Baseline to have finished before the Baseline can be computed, and it would silently re-bucket history each time the quietest hour moved.

## Consequences

- **The day key is stamped at write time, never computed on read.** A Logical Day is 04:00–04:00 *local*, so a key computed on read would silently re-bucket an entire history the first time the user travelled. The record carries the key it was written under and the IANA zone alongside it. This also disposes of daylight saving: one Logical Day a year is 23 hours and one is 25, and it does not matter, because the key came from the wall clock in front of the user. See [ADR 0011](./0011-store-the-ratchets-decisions-derive-everything-else.md).
- **The key names the date the Logical Day starts on.** 02:00 on the 15th is stamped `2026-01-14`. Anything that renders a Logical Day has to say so, or the user reads the wrong date for their own worst night.
- **The 04:00 boundary must be visible wherever days are drawn.** [#8](https://github.com/dbgeek/vape-off/issues/8) made this a constraint on the stats view rather than a preference. A chart that does not show where the day breaks will be read against the calendar day the user already has in their head.
- **A Logical Day is one of three things, not two** — Unknown, in progress, or completed and Known — and only the third is judged. See [ADR 0001](./0001-unlogged-days-are-unknown-not-zero.md).
- **The Pace Window must lie wholly inside one Logical Day.** 07:00–23:00 does; 07:00–05:00 would spread one day's Target across two. This is the only constraint the Logical Day places on the Pace Window, which is otherwise a reading concept with no bearing on Known, Met or Clear ([#17](https://github.com/dbgeek/vape-off/issues/17)).
- **This boundary is one instance of a general rule**, written down later: no axis of time in this app is fitted to the record ([ADR 0013](./0013-time-axes-are-never-fitted-to-the-record.md)).
