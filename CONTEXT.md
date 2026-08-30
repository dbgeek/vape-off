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
A Logical Day you have declared had no Puff Sessions. A deliberate assertion, never an inferred zero — it is the only way a day with nothing on it becomes Known. Writing a Puff Session into a Clear Day drops the mark, so the declaration can be made while the Logical Day is still running and corrects itself if the day turns out otherwise. That matters at Target 0, where a Clear Day is the only way to be Met and a mark you could apply only in hindsight would fall due at 04:00.
_Avoid_: Zero Day, Clean Day, Abstinent Day, Rest Day

**Merge Window**:
The 90 seconds after a tap during which another tap increments that Puff Session's puff count rather than creating a new one. It **slides**: every tap pushes the window out again, so a sitting of any length within one Logical Day stays a single Puff Session. The session keeps the timestamp of its first tap, which is therefore when the pickup began, not when it ended. It **closes at the Logical Day boundary**, so a sitting that straddles 04:00 is two Puff Sessions: a tap that joined one across the boundary would raise the total on a Logical Day already completed, and changing what the record says about a finished day is a Correction, which is never the app's to make on its own.

**Correction**:
A change to what the record already says: a Puff Session or Resisted Urge added after the fact, re-timed, re-counted or removed. Always deliberate and always the reader's — nothing corrects the record on its own. Because the app stores only events and the Ratchet's decisions, a Correction moves every derived figure that depends on the day it lands in, Momentum included, which is why one is proposed and named before it is made rather than applied silently. Declaring a Clear Day is not a Correction: it asserts something about a day the record has nothing on, rather than changing what the record already says.
_Avoid_: Edit, Amendment, Fix, Backfill (which names only one kind of Correction)

### Time

**Logical Day**:
The 04:00-to-04:00 local period that all daily aggregation is computed against. Deliberately not the calendar day.
_Avoid_: Day (unqualified), Date

**Known Logical Day**:
A Logical Day the app has evidence about: it carries a Puff Session, a Resisted Urge, or a Clear Day. Its complement is an **Unknown Logical Day**, which is an absence of evidence and not a record of zero. Opening the app is not evidence.
_Avoid_: Logged Day, Empty Day, Missed Day, Gap Day

**Pace Window**:
The 07:00-to-23:00 local period across which Pace spreads whatever is left of the Target. Hard-coded, like the Logical Day, and for the same reason it is not derived from your own Puff Sessions: a window that shrank as you improved would divide the same allowance into shorter intervals and so grow more permissive. Unlike the Logical Day it is a reading concept only — it has no bearing on what is Known, Met or Clear, and a Puff Session logged outside it counts exactly as any other. It always lies wholly within one Logical Day.
_Avoid_: Waking Hours, Waking Window, Active Hours, Day (unqualified)

### The programme

**Baseline**:
The first seven Known Logical Days, during which Puff Sessions are recorded but no Target is shown or enforced. An Unknown Logical Day extends the Baseline rather than closing it — the origin of every Target is never taken from a day the app knows nothing about.

**Baseline Average**:
The mean puff count per Logical Day across the Baseline. The origin point for every Target that follows. Frozen when the Baseline closes: a Puff Session backfilled into the Baseline window afterwards is still recorded, but does not move the origin.

**Target**:
The puff allowance for a Logical Day. The first Target is 90% of the Baseline Average; thereafter it is set by the Ratchet.
_Avoid_: Goal, Limit, Quota, Allowance

**Ratchet**:
The mechanism that lowers the Target. It steps down by 10% (minimum one puff) once five of the seven most recent completed Logical Days were Met — counting only Logical Days strictly after the current Ratchet Step, so each step down has to be earned again at the new Target and the day a Target changed is never judged against it. Unknown Logical Days are not Met, so a stretch of unlogged days stalls the Ratchet rather than advancing it. It never raises the Target, never lowers it on a schedule, and never lowers it twice for the same seven days. **It stops at Target 1**: the last step to zero is not the Ratchet's to write, and at Target 0 it is dormant rather than finished, waking only if a Declared Step puts Target 1 back in force.
_Avoid_: Taper, Schedule, Plan

**Ratchet Step**:
A single act on the Target: it became this number, from this Logical Day onward. Steps accumulate and are never amended or withdrawn, so the Target in force on any past Logical Day is the most recent Step at or before it. The first Step is the Baseline's conclusion. Every Step is either Earned or Declared.
_Avoid_: Adjustment, Change, Level

**Earned Step**:
A Ratchet Step written by the Ratchet on its own evidence, always downward. Every Step from the Baseline's conclusion down to Target 1 is Earned, and only Earned Steps feed Step Cadence.

**Declared Step**:
A Ratchet Step you write yourself, by tap — the only kind that can raise the Target, and the only kind whose timing is not the mechanism's. It exists solely at the boundary between Target 1 and Target 0, in either direction: the app offers `1 → 0` once you have held Target 1, and `0 → 1` stands available while Target 0 is in force. Because it is available nowhere else on the descent, the Target is never a number you picked.
_Avoid_: Manual Step, Override, Reset, Restart

**Met**:
Said of a completed, Known Logical Day whose total puff count is at or below its Target. An Unknown Logical Day is never Met, and a Logical Day still in progress is not yet judged either way. At Target 0 that admits only a day with no Puff Sessions on it at all — a Clear Day, or a day carrying nothing but Resisted Urges — which makes it the single point in the programme where staying Met takes a deliberate daily act rather than simply staying under a number.

**Pace**:
Whatever is left of the Target, spread across the remainder of the Pace Window, surfaced as the time the next Puff Session would be due — reckoned from the later of your last Puff Session and the Window's opening, so hours outside the Window count neither as spreading time nor as waiting time. **Rolling, not a fixed schedule from waking**: cut into fixed slots from the start of the day, the read-out goes stale the moment you drop under it and reads *now* for the rest of the day, saying nothing. Rolling, it re-spreads after every Puff Session and keeps meaning something all day. **Silent rather than approximate**: outside the Pace Window, once the interval it would report falls under ten minutes, and whenever nothing is left of the Target (permanently so at Target 0, and from your one Puff Session onward at Target 1), Pace shows nothing at all and the count that is left stands alone — a reading you have learned to distrust exerts no pressure. A read-out derived from the Target, not a second mechanism — and a passive one, since nothing on the device can fire a notification to push it.
_Avoid_: Schedule, Budget, Slots

**Momentum**:
A running score over Met Logical Days: a Met day adds one, a day that is not Met subtracts one, and it never falls below zero or resets. Unknown Logical Days move it in neither direction: it holds across a gap and resumes where it left off. It begins where the first Target does — a Logical Day with no Target in force has nothing to be Met against and moves it in neither direction either, so the Baseline neither builds Momentum nor spends it. Deliberately not a count of consecutive days — one bad day costs a point, not everything you have built.
_Avoid_: Streak, Chain, Combo

**Steps Remaining**:
The number of Ratchet Steps between the current Target and zero, the Declared Step out of Target 1 included: it counts to the end of the programme, not to the end of the Ratchet's part in it. Exact, never estimated: the Ratchet's arithmetic is fixed, so the entire descent from any Target is already determined and only its speed is open. Undefined during the Baseline, which has no Target to count down from, and retired at Target 0, where there is nothing left to count.
_Avoid_: Steps Left, Countdown, Progress, Levels

**Step Cadence**:
How long a Ratchet Step takes, averaged across every Earned Step so far — the one quantity in the programme that is estimated rather than derived. Declared Steps are excluded, since Cadence estimates the rate of the mechanism and a Declared Step is timed by a decision of yours. Distinct from Pace, which is a reading within a single Logical Day; Step Cadence is measured in Logical Days per Step and spans the whole programme. A stall inflates it rather than hiding in it, because the interval containing the stall is simply a long one.
_Avoid_: Pace (which means something else here), Rate, Velocity, Speed

**Quit Horizon**:
How far off the end of the programme looks: Steps Remaining at the Step Cadence kept so far. An estimate, and named as one — a horizon is a region, not a point. Shown as a duration that coarsens with distance and hardens into an actual date only once it is close enough to deserve one. It lengthens as readily as it shortens, and it is absent whenever it would be a guess: before any Step Cadence exists, and once a stall has made the existing one a lie. Retired at Target 0 alongside Steps Remaining, there being no distance left to project; past zero it is Longest Gap that carries the reading. The app's pressure signal in place of a fixed deadline, and deliberately a soft one.
_Avoid_: Projected Quit Date, Deadline, ETA, Target Date, Finish Line

**Longest Gap**:
The longest stretch between consecutive Puff Sessions lying wholly within Known Logical Days, the still-running stretch included. A stretch crossing an Unknown Logical Day is not evidence that you did not vape and is never eligible, so the figure is a floor on your best run rather than a measure of it — and after a long absence it is smaller, not larger, than the calendar suggests.
_Avoid_: Longest Break, Clean Time, Abstinence, Time Since Last Puff

### The record

**Backup**:
A complete copy of everything the app has been told: every Puff Session, Resisted Urge and Clear Day, together with every Ratchet Step and the app's own record of when Backups were taken — which travels inside the file, so a restored history knows how well backed up it already is rather than starting from no knowledge. Because the app holds no derived state, a Backup is the whole of what cannot be recomputed — and, there being no sync, it is the only way a history reaches another device. Restoring one **replaces** the app's history rather than merging into it, so the app never holds two accounts of the same period and never has to decide between them.
_Avoid_: Sync, Save, Snapshot, Archive, Export (as a noun for the file)
