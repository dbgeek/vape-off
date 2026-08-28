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
The mean puff count per Logical Day across the Baseline. The origin point for every Target that follows.

**Target**:
The puff allowance for a Logical Day. The first Target is 90% of the Baseline Average; thereafter it is set by the Ratchet.
_Avoid_: Goal, Limit, Quota, Allowance

**Ratchet**:
The mechanism that lowers the Target. It steps down by 10% (minimum one puff) once the Target has been met on five of the last seven Logical Days. It never raises the Target and never lowers it on a schedule.
_Avoid_: Taper, Schedule, Plan

**Met**:
Said of a Logical Day whose total puff count is at or below its Target.

**Pace**:
The Target divided across waking hours, surfaced as the time the next Puff Session would be due. A read-out derived from the Target, not a second mechanism.

**Streak**:
The count of consecutive Met Logical Days. A day that is not Met decrements it by one; it is never reset to zero.

**Projected Quit Date**:
The date the Target is expected to reach zero, extrapolated from the observed rate of Ratchet descent. It moves as that rate changes, and is the app's pressure signal in place of a fixed deadline.
