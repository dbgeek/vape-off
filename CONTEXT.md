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

**Merge Window**:
The short period after a Puff Session during which another tap increments that session's puff count rather than creating a new one.

### Time

**Logical Day**:
The 04:00-to-04:00 local period that all daily aggregation is computed against. Deliberately not the calendar day.
_Avoid_: Day (unqualified), Date

### The programme

**Baseline**:
The first seven Logical Days, during which Puff Sessions are recorded but no Target is shown or enforced.

**Baseline Average**:
The mean puff count per Logical Day across the Baseline. The origin point for every Target that follows. Frozen when the Baseline closes: a Puff Session backfilled into the Baseline window afterwards is still recorded, but does not move the origin.

**Target**:
The puff allowance for a Logical Day. The first Target is 90% of the Baseline Average; thereafter it is set by the Ratchet.
_Avoid_: Goal, Limit, Quota, Allowance

**Ratchet**:
The mechanism that lowers the Target. It steps down by 10% (minimum one puff) once five of the last seven Logical Days were Met — counting only Logical Days from the current Ratchet Step onward, so each step down has to be earned again at the new Target. It never raises the Target, never lowers it on a schedule, and never lowers it twice for the same seven days.
_Avoid_: Taper, Schedule, Plan

**Ratchet Step**:
A single act of the Ratchet: the Target became this number, from this Logical Day onward. Steps accumulate and are never amended or withdrawn, so the Target in force on any past Logical Day is the most recent Step at or before it. The first Step is the Baseline's conclusion.
_Avoid_: Adjustment, Change, Level

**Met**:
Said of a Logical Day whose total puff count is at or below its Target.

**Pace**:
The Target divided across waking hours, surfaced as the time the next Puff Session would be due. A read-out derived from the Target, not a second mechanism.

**Momentum**:
A running score over Met Logical Days: a Met day adds one, a day that is not Met subtracts one, and it never falls below zero or resets. Deliberately not a count of consecutive days — one bad day costs a point, not everything you have built.
_Avoid_: Streak, Chain, Combo

**Projected Quit Date**:
The date the Target is expected to reach zero, extrapolated from the observed rate of Ratchet descent. It moves as that rate changes, and is the app's pressure signal in place of a fixed deadline.
