# Time axes are never fitted to the record

Every axis of **time** the app draws or reckons against is fixed in advance — a constant, or a function of the clock. None of them is fitted to where the user's **Puff Sessions** happen to fall.

The **Logical Day**'s 04:00 boundary, the **Pace Window**'s 07:00–23:00, the stats dial's 24-hour ring and its 14-day window, the trend's 28 days and Track's timeline axis are all already like this. The rule has been paid for three separate times, for three different mechanisms, and never once written down as itself. Recorded here, because the fourth instance ([#67](https://github.com/dbgeek/vape-off/issues/67)) is a single line of arithmetic that anyone can undo without noticing they have decided anything.

## The argument

An axis fitted to where the marks fall narrows as the marks thin out. Improve, and the same behaviour is redrawn on a tighter axis: fewer Puff Sessions, a narrower span, the remaining marks spread wider apart. A good day is drawn as busy as a bad one, and neither can be read against the other.

That is [#17](https://github.com/dbgeek/vape-off/issues/17)'s argument, first paid for when a **Pace Window** derived from the user's own Puff Sessions was killed — a window that shrank as you improved would divide the same allowance into shorter intervals and so grow *more permissive*. [ADR 0008](./0008-the-logical-day-runs-0400-to-0400.md) paid for it again at the Logical Day boundary. [#63](https://github.com/dbgeek/vape-off/issues/63) and [#67](https://github.com/dbgeek/vape-off/issues/67) paid for it a third time in the visual, where the tempting version is *"the morning is empty, why not compress the empty stretches"* — locally correct, and wrong for a reason that is not visible from the code.

Time is what closes the loop, and not arbitrarily. The record **is** a log of events in time, so a time axis fitted to the record is fitted to the very thing being read off it. Improvement moves the events, the axis follows them, and the reading is cancelled out.

## The exclusion, and it is load-bearing

**Magnitude scales are not covered by this rule and may fit the record.** The stats dial's two radial scales do, deliberately: *"Puff Sessions grow outward from the ring; Resisted Urges grow inward from the same ring. Each is scaled independently — in the reference scenario it is 455 against 102, and any shared or diverging scale loses precisely the comparison the dial exists to make."*

A magnitude scale does not close the loop above. The dial's radius already means nothing absolute — it carries two independent scales on one ring — so fitting it corrupts no reading. Without this paragraph a future reader applies the rule to the dial and "fixes" the independent scaling, destroying the one comparison the dial exists to make.

Surveyed, the pattern is total and was already consistent before this ADR existed:

| axis | fitted to the record? |
| --- | --- |
| Logical Day boundary (04:00) | no — fixed |
| Pace Window (07:00–23:00) | no — fixed |
| Dial's ring (24h, 04:00 at top) | no — fixed |
| Dial's window (14 days) | no — fixed, *with no control* |
| Trend (28 days) | no — fixed |
| Track's timeline axis | no — fixed |
| Dial's radial scales | **yes — deliberately** |
| Trend's y-extent | **yes** |

**Fitting a time axis to the room is not fitting it to the record.** Track's timeline rescales when the screen is short or the install bar is up; that is permitted, and bounded separately by the timeline's own floor ([screens.md](../spec/screens.md#the-timelines-floor-and-the-chrome-budget)).

## What this ADR does not decide

**It does not decide Track's axis.** A *fixed piecewise clock scale* — the Pace Window given most of the height, the night compressed — obeys this rule perfectly: identical every day, never consults the record, no more derived than the hard-coded Pace Window it would key off. It was the strongest surviving alternative in [#67](https://github.com/dbgeek/vape-off/issues/67) and was refused on a **separate** ground, that equal distance would still not be equal time.

So this rule *under-determines* Track's axis. A reader who takes uniformity as mandated here cannot tell which of the two decisions is open to revisiting. Track's uniform axis is spec text and revisitable on its own terms; this rule is not.

## How it breaks

In one line, silently. `timelinePosition` reduces to `logicalMinuteOf(at) / 1440` and takes no `now` parameter at all. Anyone reaching for `now` — or for the day's first or last event — inside a position function reintroduces the whole class without touching anything that looks like a policy choice.

[#67](https://github.com/dbgeek/vape-off/issues/67) found two live instances of exactly that in a prototype, and neither was visible as a decision:

- Sizing a band by ghost-slot count gave that band **zero height for eight hours every night**, because Pace is silent outside the Pace Window and there are never any slots between 23:00 and 07:00.
- Stretching the day's lived part to `(minute / nowMinute)` spread **five minutes of the day across the entire screen at 04:05**, and swung the scale roughly 300× between 04:05 and 21:30.

## Neighbours, not family

[ADR 0010](./0010-logging-is-never-punished.md) is the closest rule and is a different one. *Logging is never punished* is about **cost attached to an honest entry**; a derived Pace Window grows more permissive as you improve, which is not a penalty, and a compressed empty morning costs the user nothing at all.

**0010 protects the truthfulness of the record. This protects the comparability of what is drawn from it.** The shared parent — the record is factual and the app does not bend around it — is too thin to be worth writing.

## Consequences

- **`now` is not a layout parameter.** On Track it selects where one line is drawn and changes nothing about where anything else lands. It is not in the middle of the screen, and it travels down the screen through the day. That is a consequence of this rule, not a second decision.
- **Equal height is equal time of day, across days.** Two Logical Days drawn on the same fixed axis are literally comparable, which is what makes drawing yesterday beside today worth anything ([#63](https://github.com/dbgeek/vape-off/issues/63), [#67](https://github.com/dbgeek/vape-off/issues/67)).
- **Emptiness is answered with content, never with distortion.** An empty stretch of a time axis stays empty and stays proportionate; if a screen reads as bare, the fix is to put something true on it.
