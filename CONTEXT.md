# vape-off

A personal, local-only PWA for reducing and eventually stopping vaping. It establishes how much you currently vape, then shrinks a daily allowance as you demonstrate you can hold it.

## Language

### Events

**Puff Session**:
A single pickup of the device: one timestamp plus a puff count. The atomic unit of logging — never an individual puff.
_Avoid_: Puff (as a record), Hit, Log, Entry

**Resisted Urge**:
A wanted-one-didn't moment, recorded as a bare timestamp. Carries no intensity or trigger.
_Avoid_: Craving, Temptation, Urge (unqualified)

**Clear Day**:
A Logical Day you have declared had no Puff Sessions. A deliberate assertion, never an inferred zero — it is the only way a day with nothing on it becomes Known. Writing a Puff Session into a Clear Day drops the mark.
_Avoid_: Zero Day, Clean Day, Abstinent Day, Rest Day

**Merge Window**:
The 90 seconds after a tap during which another tap increments that Puff Session's puff count rather than creating a new one. It **slides**: every tap pushes the window out again, so a sitting of any length stays a single Puff Session. The session keeps the timestamp of its first tap, which is therefore when the pickup began, not when it ended.

### Time

**Logical Day**:
The 04:00-to-04:00 local period that all daily aggregation is computed against. Deliberately not the calendar day.
_Avoid_: Day (unqualified), Date

**Known Logical Day**:
A Logical Day the app has evidence about: it carries a Puff Session, a Resisted Urge, or a Clear Day. Its complement is an **Unknown Logical Day**, which is an absence of evidence and not a record of zero. Opening the app is not evidence.
_Avoid_: Logged Day, Empty Day, Missed Day, Gap Day

### The programme

**Baseline**:
The first seven Known Logical Days, during which Puff Sessions are recorded but no Target is shown or enforced. An Unknown Logical Day extends the Baseline rather than closing it — the origin of every Target is never taken from a day the app knows nothing about.

**Baseline Average**:
The mean puff count per Logical Day across the Baseline. The origin point for every Target that follows. Frozen when the Baseline closes: a Puff Session backfilled into the Baseline window afterwards is still recorded, but does not move the origin.

**Target**:
The puff allowance for a Logical Day. The first Target is 90% of the Baseline Average; thereafter it is set by the Ratchet.
_Avoid_: Goal, Limit, Quota, Allowance

**Ratchet**:
The mechanism that lowers the Target. It steps down by 10% (minimum one puff) once five of the seven most recent completed Logical Days were Met — counting only Logical Days strictly after the current Ratchet Step, so each step down has to be earned again at the new Target and the day a Target changed is never judged against it. Unknown Logical Days are not Met, so a stretch of unlogged days stalls the Ratchet rather than advancing it. It never raises the Target, never lowers it on a schedule, and never lowers it twice for the same seven days.
_Avoid_: Taper, Schedule, Plan

**Ratchet Step**:
A single act of the Ratchet: the Target became this number, from this Logical Day onward. Steps accumulate and are never amended or withdrawn, so the Target in force on any past Logical Day is the most recent Step at or before it. The first Step is the Baseline's conclusion.
_Avoid_: Adjustment, Change, Level

**Met**:
Said of a completed, Known Logical Day whose total puff count is at or below its Target. An Unknown Logical Day is never Met, and a Logical Day still in progress is not yet judged either way.

**Pace**:
Whatever is left of the Target, spread across the waking hours that are left, surfaced as the time the next Puff Session would be due. **Rolling, not a fixed schedule from waking**: cut into fixed slots from the start of the day, the read-out goes stale the moment you drop under it and reads *now* for the rest of the day, saying nothing. Rolling, it re-spreads after every Puff Session and keeps meaning something all day. A read-out derived from the Target, not a second mechanism — and a passive one, since nothing on the device can fire a notification to push it.
_Avoid_: Schedule, Budget, Slots

**Momentum**:
A running score over Met Logical Days: a Met day adds one, a day that is not Met subtracts one, and it never falls below zero or resets. Unknown Logical Days move it in neither direction: it holds across a gap and resumes where it left off. Deliberately not a count of consecutive days — one bad day costs a point, not everything you have built.
_Avoid_: Streak, Chain, Combo

**Projected Quit Date**:
The date the Target is expected to reach zero, extrapolated from the observed rate of Ratchet descent. It moves as that rate changes, and is the app's pressure signal in place of a fixed deadline.
