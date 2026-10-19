# The rules

The programme as unambiguous logic. Every function here is **pure over the record** — it reads the six stores and returns a number; nothing in this file writes anything except `evaluate()`, which writes at most one Ratchet Step ([ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)).

Pseudocode is TypeScript-shaped but not TypeScript. Where a rule looks arbitrary, the ADR that decided it is linked.

## 0. Rounding

One rounding function, used everywhere:

```
round(x) = Math.floor(x + 0.5)      // half away from zero; JS Math.round for positive x
```

This is not incidental. It is what reproduces [ADR 0002](../adr/0002-the-quit-horizon-simulates-the-ratchet.md)'s published step counts exactly, and those counts are the fixtures in §12. Banker's rounding gives different answers.

§8a's `floor` and `ceil` are not exceptions to this: they are bounds, not rounding, and say so where they stand.

## 1. Time

```
logicalDayKeyOf(instant, tz):
    local = instant rendered in tz
    if local.hour < 4: local = local minus one calendar day
    return local formatted 'YYYY-MM-DD'
```

The key names the date the Logical Day **starts** on. Stamped at write time, never recomputed ([ADR 0008](../adr/0008-the-logical-day-runs-0400-to-0400.md)).

```
today()            = logicalDayKeyOf(now, deviceZone)
isCompleted(d)     = d < today()
completedDays(n)   = the n consecutive keys ending at today() - 1 day
                     — calendar-consecutive, Unknown days included
```

A Logical Day is **Unknown**, **in progress** (it is `today()`), or **completed and Known**. Only the third is ever judged.

## 2. Evidence

```
dayTotal(d)  = sum of count over puffSessions where logicalDay == d      // 0 if none
isKnown(d)   = any puffSession, resistedUrge, or clearDay has logicalDay == d
```

Opening the app is not evidence and is not stored.

**The record beats the declaration.** Writing a Puff Session into a Clear Day deletes the `clearDays` row — silently, not as an error and not as a dialogue. Enforced in the write path *and* re-applied at import ([ADR 0004](../adr/0004-a-backup-replaces-and-never-merges.md): semantic repair is not rejection). A Clear Day may be declared while the Logical Day is still running; it self-corrects if the day turns out otherwise ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)).

## 3. The Baseline

```
baselineDays()    = the first 7 keys of (completed Known Logical Days, ascending)
                    — undefined until there are 7
baselineAverage() = sum(dayTotal(d) for d in baselineDays()) / 7
```

An Unknown Logical Day **extends** the Baseline rather than closing it, so it can stall indefinitely ([ADR 0001](../adr/0001-unlogged-days-are-unknown-not-zero.md)). A Clear Day counts as a Known day with a total of 0 and pulls the average down, which is correct.

The Baseline Average is never stored. It is frozen by being materialised as the first Ratchet Step's `target` ([ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)), so backfilling into the Baseline window afterwards records the session and does not move the origin.

## 4. The Target in force

```
targetOn(d):
    steps = ratchetSteps where effectiveFrom <= d, sorted by effectiveFrom
    if steps is empty: return NONE        // the Baseline
    return last(steps).target

currentTarget() = targetOn(today())
```

`NONE` is a real state, not zero. During the Baseline there is no Target, no Met, no Momentum, no Pace, no Steps Remaining and no Quit Horizon.

## 5. Met

```
isMet(d):
    if not isCompleted(d): return false      // today is never judged
    if not isKnown(d):     return false      // Unknown is never Met
    t = targetOn(d)
    if t is NONE: return false               // outside the programme
    return dayTotal(d) <= t
```

**At Target 0 this admits a Clear Day or a day carrying nothing but Resisted Urges** — any Known day with no Puff Sessions on it. `CONTEXT.md` says "only a Clear Day", which is the common case rather than the whole rule: [#5](https://github.com/dbgeek/vape-off/issues/5) settled that a Resisted Urge alone makes a day both Known and Met, and that holds at every Target including zero. The glossary entry has been corrected to match.

## 6. The Ratchet

The step function, and the only place 10% appears:

```
nextEarnedTarget(t) = t - max(1, round(0.1 * t))        // only defined for t >= 2
```

The window:

```
windowSatisfied(step):
    eligible = [d in completedDays(7) where d > step.effectiveFrom]
    return count(d in eligible where isMet(d)) >= 5
```

Seven **calendar-consecutive** completed Logical Days, Unknown ones occupying their slot — so at most two of the seven may be Unknown before a Step is impossible ([ADR 0001](../adr/0001-unlogged-days-are-unknown-not-zero.md)). Days at or before the current Step are excluded, so each step down is earned again *at the new Target* and the day a Target changed is never judged against it ([#5](https://github.com/dbgeek/vape-off/issues/5)). That exclusion is what produces the **six-day cadence floor**: five Met days are needed, the earliest five are `E+1 … E+5`, and the earliest evaluation that can see all five completed is on `E+6`.

The evaluation. **Runs on every cold start, on `visibilitychange` → visible, and after every write, edit, delete and import.** Nothing runs while the app is closed ([#2](https://github.com/dbgeek/vape-off/issues/2)), so this is a lazy catch-up, and it must be idempotent:

```
evaluate():
    if any ratchetStep has effectiveFrom == today(): return    // at most one Step per day
    steps = ratchetSteps sorted by effectiveFrom

    if steps is empty:                                          // still in the Baseline
        if count(completed Known Logical Days) >= 7:
            avg = baselineAverage()
            writeStep(today(), max(1, round(0.9 * avg)), 'earned')
        return

    t = last(steps).target
    if t == 0: return                        // dormant — only a Declared 0 -> 1 wakes it
    if t == 1:
        if windowSatisfied(last(steps)): offerHandover()        // OFFERED, never written
        return
    if windowSatisfied(last(steps)):
        writeStep(today(), nextEarnedTarget(t), 'earned')
```

Four things this encodes, each of which is a decision rather than a detail:

- **A Step is dated the Logical Day it was computed, never backdated.** A Target applies from the moment the app could have shown it to you ([ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)).
- **At most one Step per evaluation.** A twelve-day gap resolved by backfill can satisfy the window three times over; compounding them would cut the Target 27% for going on holiday. The `&effectiveFrom` unique index is the enforcement; the early return is the courtesy ([ADR 0009](../adr/0009-the-ratchet-is-adaptive-not-a-taper.md)).
- **The first Target is `max(1, round(0.9 × Baseline Average))`.** The `max(1, …)` guard is not cosmetic: a Baseline of seven Clear Days averages 0 and would otherwise open the programme at Target 0, which only a Declared Step may ever reach ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)).
- **The Ratchet stops at 1 and is dormant at 0.** It never writes `1 → 0`.

### Declared Steps

The only two writes the user makes to the Step log, and the only raise anywhere in the programme ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)):

```
declareHandover():   // 1 -> 0. Offered on Track once currentTarget() == 1 and the window is satisfied.
    writeStep(today(), 0, 'declared')

declareStepBack():   // 0 -> 1. Available in Stats whenever currentTarget() == 0, behind a deliberate trip.
    writeStep(today(), 1, 'declared')
```

Both are subject to one Step per Logical Day. If a Step already exists for today, the act is refused with *"You have already changed your target today"* — the collision is only reachable by declaring in both directions on one day, and `&effectiveFrom` would reject it regardless.

A free choice of number was rejected: a Target you can set is not a Target. Both directions land in the same append-only log, so a wobble is **visible in the record rather than erased**.

## 7. Momentum

```
momentum():
    m = 0
    for d in (completed Known Logical Days with targetOn(d) != NONE, ascending):
        m = isMet(d) ? m + 1 : max(0, m - 1)
    return m
```

Unknown Logical Days are skipped entirely — Momentum **holds** across a gap and resumes where it left off. Days before the first Target are skipped for the same reason: they have nothing to be Met against.

Never zeroed by a miss. That is the whole reason **Streak** was renamed ([ADR 0010](../adr/0010-logging-is-never-punished.md)).

Momentum is derived, so correcting the past moves it. An edit that changes it says so out loud — see [screens.md](./screens.md#editing-the-record).

## 8. Pace

A reading, not a mechanism, and nothing about it is stored ([#17](https://github.com/dbgeek/vape-off/issues/17)).

```
PACE_WINDOW_OPEN  = 07:00 local
PACE_WINDOW_CLOSE = 23:00 local
MIN_INTERVAL      = 10 minutes

pace():
    t = currentTarget()
    if t is NONE:                        return SILENT      // the Baseline
    remaining = t - dayTotal(today())
    if remaining <= 0:                   return SILENT      // nothing left; permanent at Target 0
    if now < open or now >= close:       return SILENT      // outside the Pace Window
    interval = (close - now) / remaining
    if interval < MIN_INTERVAL:          return SILENT

    anchor = max(open, at of the latest puffSession with logicalDay == today())
    slots  = [anchor + k * interval for k in 1..remaining]
    return { interval, nextDue: slots[0], slots }
```

- **The three silences are identical on screen** and carry no explanatory copy. "Outside waking hours" would advertise a hard-coded constant that is wrong on some nights, and an app that announces its assumption is an app being asked to make it configurable.
- **The silence keys on the interval, never on the due time being close.** A due time approaching is normal operation.
- **The anchor rule collapses two edges into one**, so there is no special case for the start of the day: "nothing logged yet" is just the case where the last session sits at negative infinity, and the insomnia case — four sessions before 07:00, all counted, all silent — falls out of the same `max()`. The anchor is not a fabricated 07:00 Puff Session; the rule is that due times spread from when your day starts and re-spread after each real session.
- **No slot can land past the close.** `anchor <= now`, so the last slot is at most `now + (close - now)`.
- **Slots at or before `now` are past due, and the reading is *clear now*.** Fewer than `remaining` visible ghosts is correct, not the bug [#6](https://github.com/dbgeek/vape-off/issues/6) found: that bug was a *fixed* schedule that could never re-spread. Here the moment you log, the anchor becomes now and all remaining slots are ahead of you again.
- **An unlogged morning makes the due time drift earlier on its own** as the window shrinks, until it goes past due. Correct, and accepted with eyes open.
- Recompute on every write and on a one-minute tick while Track is visible.

At **Target 1** the `16h ÷ 1` reading is kept: it says *hold out until the end of the day*, the only useful thing Pace can say there. At **Target 0** Pace is permanently silent.

**Pace is not drawn.** Track's ghost slots are §8a's, which spreads the same remainder in sittings. Pace stays the rule §8a is built on: its window, anchor and silences are Spacing's, and at a sitting of one puff the two are the same reading.

## 8a. Spacing

> Numbered `8a` for the reason `12a` is. It belongs beside §8, which it counts in sittings.

A reading, not a mechanism, and nothing about it is stored ([ADR 0018](../adr/0018-spacing-scales-your-recent-sitting.md)).

```
SPACING_HABIT_DAYS = 14                 // the Kicks Marked window (§12a)

spacing():
    t = currentTarget()
    if t is NONE:                        return SILENT      // the Baseline
    remaining = t - dayTotal(today())
    if remaining <= 0:                   return SILENT      // nothing left; permanent at Target 0
    if now < open or now >= close:       return SILENT      // outside the Pace Window

    firstDay = today() shifted back 13 Logical Days
    counts   = count of every puffSession where firstDay <= logicalDay <= today(), ascending
    if counts is empty:                  return SILENT      // no habit to scale
    habit    = counts[floor((length(counts) - 1) / 2)]      // the lower median

    origin   = first(ratchetSteps by effectiveFrom).target / 0.9   // the Baseline Average, as frozen
    size     = max(1, floor(habit * t / origin))
    sittings = ceil(remaining / size)
    interval = (close - now) / sittings
    if interval < MIN_INTERVAL:          return SILENT

    anchor = max(open, at of the latest puffSession with logicalDay == today())
    slots  = [anchor + k * interval for k in 1..sittings]
    return { interval, nextDue: slots[0], puffs: min(size, remaining), slots }
```

- **Pace, counted in sittings.** Same window, same anchor, same `MIN_INTERVAL`, and §8's notes on the anchor, past-due slots and the drifting morning hold here unchanged. `sittings <= remaining`, so Spacing's interval is never shorter than Pace's and it speaks on some evenings Pace has gone quiet on. **At `size == 1` the two are identical**: `sittings == remaining`, and the slots are Pace's.
- **The origin is the Baseline Average as it was frozen**, not `baselineAverage()`. §3's function is recomputed, so it moves when a Puff Session is backfilled into the Baseline window and is 0 for a Baseline of seven Clear Days. The frozen figure is the first Step's `target`, which is `max(1, round(0.9 × average))`, so dividing it by 0.9 recovers the average to within 0.56 puffs and is never below 1.11. A consequence: **at the first Target the size is `floor(0.9 × habit)`** — a habit of 5 reads `4 puffs`.
- **Floor and ceil, not §0's `round`.** They are bounds, not rounding. The floor keeps the size at or below the Ratchet's own proportion, so Spacing never recommends a sitting the Target does not support; the ceil counts the day's last, smaller sitting, which `puffs: min(size, remaining)` then prints.
- **The habit includes today**, and an Unknown Logical Day adds nothing to it. A large sitting today can raise it before the day is out.
- **The habit is rolling, and following Spacing shrinks it.** Hold a Target of 223 and log exactly what Spacing says: about every 14 days the size steps `4 → 3 → 2 → 1`, and at 07:00 with 223 left the interval goes `17m → 12.8m → 8.6m`. At size 2 it is under `MIN_INTERVAL` and Spacing is silent. Drift back to your habit and the median climbs until it speaks again. **The loop ends in silence, not pressure, and is accepted** ([ADR 0018](../adr/0018-spacing-scales-your-recent-sitting.md)).
- **It reads the Target and the first Step, and nothing reads it.** Not Met, not Momentum, not the Ratchet, not the badge. It ignores Kicks.
- **The rule computes; the screen gates.** `spacing()` answers inside an open Merge Window. Whether it is *printed* there is [screens.md](./screens.md#spacing)'s to say.
- Derived, so a Correction moves it. Recompute on every write and on the one-minute tick while Track is visible.

## 9. Steps Remaining

Exact, never estimated. It counts to the end of the **programme**, so the Declared handover is included ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)).

```
stepsRemaining():
    t = currentTarget()
    if t is NONE: return ABSENT      // the Baseline has no Target to count down from
    if t == 0:    return RETIRED
    n = 0
    while t > 1: t = nextEarnedTarget(t); n = n + 1
    return n + 1                     // the Declared 1 -> 0
```

**Absent during the Baseline, and this corrects an error made mid-session in [#7](https://github.com/dbgeek/vape-off/issues/7)**: the step count is *not* true on day 1. A provisional count needs a provisional Target, which smuggles in exactly what the Baseline exists to withhold.

## 10. Step Cadence

```
stepCadence():
    e = ratchetSteps where kind == 'earned', sorted by effectiveFrom
    if e.length < 2: return ABSENT
    return daysBetween(e[0].effectiveFrom, last(e).effectiveFrom) / (e.length - 1)
```

Logical Days per Step, over the **whole** history. No window parameter and no stall detector: a stall merely lengthens the interval containing it, and sensitivity to any one interval decays as `1/n`, so the number calms down as the programme lengthens. The accepted cost is that a rough opening month never fully washes out.

**Earned Steps only.** Cadence estimates the rate of the mechanism, and a Declared Step is timed by a decision of yours; counting a `0 → 1` would record a backwards move as an interval of descent.

## 11. Quit Horizon

```
quitHorizon():
    if currentTarget() is NONE: return ABSENT
    if currentTarget() == 0:    return RETIRED
    c = stepCadence()
    if c is ABSENT:             return ABSENT          // fewer than two Earned Steps
    openInterval = daysBetween(last Earned Step .effectiveFrom, today())
    if openInterval > 2 * c:    return WITHDRAWN
    days = stepsRemaining() * c
    if days >  84: return "about " + round(days / 30.44) + " months"
    if days >= 14: return "about " + round(days / 7)     + " weeks"
    return the actual date (today plus days)
```

Silence is a valid reading, three times over: during the Baseline, before two Earned Steps exist, and once a stall has made the existing cadence a lie. **Steps Remaining stands alone in every one of those cases.**

**A stall withdraws the Horizon; it never makes it creep.** Counting the open interval live would push the date out ~3½ days for every day not stepped — a month away costing three months of Horizon, displayed while the month is already going badly. That is a penalty on absence, which this design refuses everywhere ([ADR 0010](../adr/0010-logging-is-never-punished.md)).

It **lengthens on screen and is never announced.** Both readouts live in Stats and appear nowhere on Track — no badge, no notification, no copy remarking that it moved.

## 12. Longest Gap

```
longestGap():
    s = all puffSessions sorted by at
    if s is empty: return ABSENT
    best = ABSENT
    for each consecutive pair (a, b) in s:
        if every Logical Day key from a.logicalDay to b.logicalDay is Known:
            best = max(best, b.at - a.at)
    // the still-running stretch is the Current Gap (§12b)
    best = max(best, currentGap())
    return best
```

A stretch crossing an Unknown Logical Day is not evidence that you did not vape and is **never eligible**, so the figure is a floor on your best run rather than a measure of it. After a twelve-day absence the honest answer is 22 hours, not twelve days — and the screen says so in one factual footnote rather than showing a number that looks broken.

**The Logical Day still running is exempt, and only for the still-running stretch.** This corrects the rule as first written, which demanded every key *through* `today()` be Known: today is not Known until something is written on it, so on any morning with nothing logged yet the running stretch was excluded — and the footnote could fire when the only Unknown day was the one still in progress. Today is not yet judged, exactly as it is never yet Met or not. A consecutive pair needs no exemption, since a Puff Session on today already makes today Known. **`longestGap() >= currentGap()` whenever both are present**, so Track's Current Gap never reads longer than the Longest Gap on Stats ([#138](https://github.com/dbgeek/vape-off/issues/138)).

This makes **Clear Day load-bearing for a stat it was not introduced to serve**: in the reference scenario the winning gap is produced by three consecutive Clear Days. The readout is exactly as trustworthy as that mark and no more.

At Target 0, Longest Gap **takes the headline** as Steps Remaining and the Quit Horizon retire.

## 12a. Kicks Marked

> Numbered `12a` rather than `13` so that `§13`, `§14` and `§15` keep the anchors the rest of the spec links to. It belongs here, beside the other floor.

```
kicksMarked():
    firstDay = today() shifted back 13 Logical Days
    n = count of puffSessions where firstDay <= logicalDay <= today()
                                and kickMarkedAt is present
    if n == 0: return ABSENT
    return n
```

- **The same window as the Dial**, keyed the same way: 14 calendar-consecutive Logical Day keys ending at `today()`, **today's running day included**. Marking reaches only today's sessions ([screens.md](./screens.md#marking-a-kick)), so **every Kick is born on today** — a window excluding today would hide a mark for up to 24 hours immediately after it was made, which reads as the app failing to register the act. A rolling 14×24h from `now` was refused for putting the figure on a different time axis from the picture directly above it.
- **Counted in Puff Sessions, never rolled up to Logical Days.** A day with one Kick and a day with six are different facts, and the session is the only unit a Kick was ever attached to.
- **Absent at zero**, on the `Quit Horizon` pattern. *"At least 0 of your sittings delivered"* is content-free and reads as a reproach.
- **No Unknown-day exclusion, and it is vacuous rather than omitted.** §2 makes a Logical Day Known if it carries any Puff Session, so every session this reaches already sits in a Known day. Nothing is ever disqualified — unlike `Longest Gap`, whose eligibility rule is load-bearing.
- **Never a footnote.** A floor can only be *understated* by missing evidence, never falsified by it, so a footnote here would fire constantly and teach the reader the number is damaged when it is only small. The tile degrades by going absent, and in no other way.
- **Never divided.** The honest denominator — sessions you answered about — does not exist, by construction ([ADR 0015](../adr/0015-an-unknown-earns-a-control-only-where-it-costs.md)).

## 12b. Current Gap

> Numbered `12b` for the reason `12a` is. It belongs beside §12, whose still-running stretch it is.

```
currentGap():
    s = all puffSessions sorted by at
    if s is empty: return ABSENT
    last = last(s)
    if now < last.at:              return ABSENT     // stamped ahead of the clock (ADR 0008)
    if last.logicalDay > today():  return ABSENT     // keys running backwards vouch for nothing
    // the Logical Day still running is not yet judged; every completed one crossed must be Known
    if every Logical Day key from last.logicalDay to the day before today() is Known:
        return now - last.at
    return ABSENT
```

A last Puff Session on today makes that range empty, and an empty range is vacuously Known: the stretch since a session logged today is always eligible.

- **Measured from `at`**, as Pace and §12 are — so it is literally the Longest Gap's still-running stretch, not a second quantity that almost agrees with it. It differs from a reading off `lastTapAt` by the length of one sitting, whose median is 2.4 seconds.
- **The rule computes; the screen gates.** `currentGap()` answers whenever a stretch is eligible — during the Baseline and inside an open Merge Window included — because §12 reads it there. Where it is *shown*, from the first Target onward and never beside an open session, is [screens.md](./screens.md#the-current-gap)'s to say.
- **A whole Logical Day with nothing on it silences it at 04:00.** Puff at 22:00 on Monday, hold off all of Tuesday without writing anything — not even a Resisted Urge — and at 04:00 on Wednesday the stretch crosses a completed Unknown Logical Day. That is [ADR 0001](../adr/0001-unlogged-days-are-unknown-not-zero.md) as written: nothing distinguishes *held off all day* from *was not using the app*. Declaring Tuesday a Clear Day, from the catch-up strip that arrives in the same moment, makes the stretch eligible again; at Target 0 it is also what makes Tuesday Met. Today can be declared Clear before 04:00 to the same effect. **Clear Day is load-bearing here exactly as it is for §12**, and the reading is as trustworthy as that mark and no more.
- **It reads no mechanism and moves none.** Nothing in Target, Met, Momentum, the Ratchet or Pace reads it, and it reads none of them. Pace anchors on the same `at`; that is a shared fact, not a dependency.
- **Returning to zero is not a cost.** Every Puff Session logged resets it, and that withholds nothing the app could give — what you have built is kept by §12, which a log never shortens ([ADR 0010](../adr/0010-logging-is-never-punished.md)). What would make it a cost is presentation, and the rules against that are [screens.md](./screens.md#the-current-gap)'s.
- **Never on the badge**, for §14's own reason: a badge updates only while the app runs, so a gap shown there would be stale the moment it mattered.

## 13. The export nag

```
uncoveredDays():
    if exports is empty: return count(Known Logical Days)
    lastDay = max(logicalDay over exports)
    return count(Known Logical Days with key > lastDay)
```

- **Silent entirely while not installed.** ADR 0003's permanent bar is already on screen saying *install*, which is the more useful advice; two competing warnings is how both get ignored.
- **A quiet status line in Stats from the first uncovered day** — *"Last backup: 3 Logical Days ago"* — phrased as a reading, not a warning.
- **A dismissible card at 30 uncovered days.** Dismissal stores the current `uncoveredDays()` in `meta.lastBackupNagDismissedAt`; the card returns at `dismissedAt + 30`, and taking a Backup resets it to 0. Dismissing resets it for another 30, **never forever** — the failure it guards against does not go away because you tapped ×.
- **Never modal, and never on Track.**

Keyed to **Known Logical Days**, never elapsed time. Elapsed time nags you for a fortnight you did not use the app, which is absence-punishing ([ADR 0010](../adr/0010-logging-is-never-punished.md)). Uncovered Known days measure the thing actually at risk: record you would have to reconstruct from memory.

## 14. The badge

The only out-of-app signal available; nothing on-device can schedule a notification ([#2](https://github.com/dbgeek/vape-off/issues/2)).

```
updateBadge():
    t = currentTarget()
    if t is NONE or t == 0: navigator.clearAppBadge()
    else:                   navigator.setAppBadge(max(0, t - dayTotal(today())))
```

It carries remaining Target, not time-to-next — a badge only updates while the app runs, so a countdown would be stale the moment it mattered. Call it after every write and on every evaluation.

## 15. Fixtures

Test against these. They are [ADR 0002](../adr/0002-the-quit-horizon-simulates-the-ratchet.md)'s published figures and the prototype in [#8](https://github.com/dbgeek/vape-off/issues/8) reproduces them exactly; if your implementation disagrees, your rounding is wrong.

| Baseline Average | First Target | Steps Remaining at the first Target |
| --- | --- | --- |
| 20 | 18 | **16** |
| 60 | 54 | **26** |
| 150 | 135 | **35** |

The descent from 18: `18 → 16 → 14 → 13 → 12 → 11 → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 → 1 → 0`.

**The tail is most of the programme.** From Target 14 down, every Step is a single puff — a constant **14 Steps whatever the Baseline**, which for a Baseline Average of 20 is 14 of the 16 Steps and, at the six-day floor, about 84 days. This is not a corner case to hide; any readout that conceals it will feel like a betrayal at Target 8.

Two more worth asserting in tests:

- A seven-day absence produces seven Unknown days, **no Step and no Momentum change**.
- Restoring a three-week-old Backup fires **no Step**: the seven most recent completed days are all Unknown, so no window is satisfied. The catch-up is self-correcting and needs no special case — stated here so nobody later adds one ([ADR 0004](../adr/0004-a-backup-replaces-and-never-merges.md)).
