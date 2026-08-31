# Screens

Three screens — **Track**, **Stats**, **Settings** — and four exceptional states that are not screens you navigate to.

Routing is **history routing**: `/` Track, `/stats` Stats, `/settings` Settings. Not for deep links — there are none — but for the iOS edge-swipe back gesture, which a standalone web app honours even with no chrome, and which does nothing at all if there is only one URL. The Vercel SPA rewrite is load-bearing rather than theoretical, because the 30-minute update catch-up reloads the page and a reload landing on `/stats` is a request the server really serves.

**`viewport-fit=cover` and `env(safe-area-inset-bottom)` are a hard constraint everywhere**, because PUFF sits on the home indicator.

---

## Track — the logging screen

**The screen is the Logical Day, not a counter.** A vertical timeline running 04:00 → 04:00; the count is spatial before it is numeric. Chosen over a full-bleed tap slab and a depleting-allowance reservoir; the Baseline decided it — Reservoir's whole metaphor is a ceiling and days 1–7 have none, where Track simply drops the ghost slots and still has a job on day 1 ([#6](https://github.com/dbgeek/vape-off/issues/6)).

> This section was rewritten by [the Track timeline map](https://github.com/dbgeek/vape-off/issues/62). It previously said the timeline *runs 04:00 → 04:00* **and** put *now in the middle*, which are two statements no implementation can satisfy at once — the shipped screen honoured the second at the cost of the first. Everything from here to *The controls* is new or restated.

### The axis

One statement, and it is meant literally:

> **The timeline is one fixed mapping over the Logical Day. 04:00 at the top, 04:00 at the bottom, linear.** `position = logicalMinuteOf(at) / 1440`.

- **The same scale all day, and the same scale every day.** Equal distance is equal time, everywhere on the screen and on both lanes.
- **The mapping is a pure function of the clock** — not of `now`, and never of the record ([ADR 0013](../adr/0013-time-axes-are-never-fitted-to-the-record.md)). `timelinePosition` takes no `now` parameter; anyone reaching for one has reintroduced the class of bug that ADR exists to forbid, in a line that does not look like a decision.
- **`now` is a line drawn on the axis.** It divides nothing and sizes nothing. It starts at the top at 04:00 and travels down the screen through the day. There is no *lived band*, no *band ahead* and no *band below now* — that vocabulary named a structure that no longer exists and is retired, not renamed ([#67](https://github.com/dbgeek/vape-off/issues/67)).
- **Both 04:00 boundaries are visible, and genuinely at the edges.** A Puff Session at 01:00 sits near the bottom, inside the Logical Day that began the previous morning, and the boundary above it says so ([ADR 0008](../adr/0008-the-logical-day-runs-0400-to-0400.md)).
- The now-line and a 04:00 boundary label are allowed to coincide just after and just before 04:00. Both statements are true, and it is a few minutes twice a day.

**The morning is not fixed by the axis, and is not meant to be.** At 07:51 `now` sits at 16% and today's two Puff Sessions are in the top sixth of the screen. What fills the rest is yesterday, drawn full height beside it. The screen is full because there is something true on it, never because the axis was bent to hide an empty stretch ([#63](https://github.com/dbgeek/vape-off/issues/63)).

**The exchange rate is fixed and knowable, and every size on this screen is denominated in it.** At a 500px timeline one hour is ~21px and one pixel is ~2.9 minutes. A single mark is taller than the hour it sits in. That is the constraint the mark tiers, the fan and the floor below all answer to.

### The two lanes

The timeline holds two lanes side by side, both drawn on the one axis above.

| | spine, across the timeline's width | width it may spend | contents |
| --- | --- | --- | --- |
| **The Yesterday lane** | 16% | ~30% | the previous Logical Day, dim, read-only |
| **The live lane** | 46% | ~54% | today's marks, rings, ghost slots, `now`, the Target hairline |

Yesterday sits to the left of today. **Both lanes fan right**, so the reading direction never changes, and yesterday fans into the gap between the two spines.

**The live lane's hours below `now` read unlived — as tone, not as structure.** They have not happened, and the reader has to know which content is real. **The tone is the live lane's alone**: the Yesterday lane is uniformly dim from top to bottom, because all of yesterday happened.

### Marks, rings and slots

**A Puff Session is a solid mark at its own time, in one of four sizes:**

| puffs | mark |
| --- | --- |
| 1–2 | 20px |
| 3–5 | 28px |
| 6–10 | 36px |
| 11+ | 44px |

- **The count is printed inside every mark**, dim ones included. Size is the redundant, at-a-glance channel; the numeral is the exact value. Every tier is above the legible floor *by construction* — that is what the tiers are for, and it is what the old `min(44, 12 + √count × 7)` floor was buying without saying so. A faithful `√count` area encoding is **disqualified rather than merely expensive**: it draws a one-puff session as an 8px fleck, which evicts the numeral from the mark and breaks the thing [#64](https://github.com/dbgeek/vape-off/issues/64) relied on to refuse a header figure ([#70](https://github.com/dbgeek/vape-off/issues/70)).
- **Size is a function of the single session's count alone**, never of the day's largest. A session draws the same size on a quiet day and a heavy one, so improving cannot inflate your own marks.
- **The day's biggest Puff Session is read off its mark.** It is already the largest object on the screen with its number printed on it; there is no second figure anywhere ([#64](https://github.com/dbgeek/vape-off/issues/64)).
- **The tap target is the drawn mark, and it may be under 44px.** What makes a small mark a handle is the fan below leaving it unobstructed, not its diameter. Expanding every mark to a 44px hit area is unaffordable at *every* timeline height — 20 invisible clashes on the busiest screen at a generous 520px, 38 at 192px — so there is no height at which it could have been bought ([#72](https://github.com/dbgeek/vape-off/issues/72)).

**Resisted Urges are hollow rings on the same track, fixed at 14px.** They carry no count, so they have no sizing rule to obey. Against the smallest 20px solid mark they read as a different kind of thing by shape as well as by size.

**Ghost slots** sit in the empty part of the day ahead — `pace().slots` that are still in the future. Ambient, not a countdown. **Live lane only.** Absent during the Baseline and whenever Pace is silent ([rules.md §8](./rules.md#8-pace)).

> **Derived, not decided.** The live lane now carries two hollow things: a Resisted Urge ring and a ghost slot. They never coincide, because a Resisted Urge on the live lane is always at or before `now` and a ghost slot is always after it — the now-line is what tells them apart, and no ticket decided that it should have to. If the two ever read as one vocabulary on a device, the slot is the one that changes shape.

**Over-Target is factual**: a red hairline at the moment the Target was reached, labelled *Target reached 19:04*, with marks past it drawn red. No zeroing, no scolding ([ADR 0010](../adr/0010-logging-is-never-punished.md)). **The hairline spans the live lane only, and the Yesterday lane is never red** — see below.

### When marks collide — the fan

Under a uniform 24-hour axis a 20px mark covers roughly 55 minutes, so collision is a property of the **hour**, not of a pair of sessions: on a busy evening screen every mark collides with something at any plausible size. The fan is therefore the normal case, not an exception ([#65](https://github.com/dbgeek/vape-off/issues/65), [#70](https://github.com/dbgeek/vape-off/issues/70)).

- **Vertical position stays exactly time. Collisions are answered sideways, in the free dimension.** Nothing is ever displaced through time and nothing is ever merged into a combined mark — a timeline owes its one axis the truth, and a merged run would be a domain object whose membership depends on pixel density rather than on the record.
- **Each event takes the leftmost column free at its own height**, in time order, and keeps a hairline spoke back to its lane's spine at its true height. Colouring into the leftmost *free* column rather than stepping every member of a group is what keeps the fan cheap: two or three columns answer every realistic live-lane collision.
- **The column step is the widest mark in the group plus 4px** — group-local, not a uniform global step. A global step would spend the widest tier's 44px on every column everywhere, and the timeline's floor below was derived against the group-local step. The cost, named: columns do not line up into a visible grid down the timeline.
- **Resisted Urge rings fan with everything else**, keeping their own size, so a fanned run reads its kinds as well as its counts.
- **When a clique is deeper than its lane affords, the outermost column takes the remainder and those marks overlap.** Clipping them would delete a Puff Session from the picture; overlapping keeps it visible and reachable. This is the one place the whole-circle guarantee degrades, and at or above the timeline's floor it is not reachable on any measured screen — the deepest genuine clique measured is five events inside fourteen minutes.

**Every Puff Session keeps its own whole circle.** That is the point of the fan: the mark is the handle for correcting a mis-tap, and a session you cannot reach is a session you cannot correct.

### The Yesterday lane

The previous Logical Day, drawn dim on today's exact axis, so equal height is equal time of day on both days and the comparison is literal rather than shape-against-shape. It draws the **whole** completed Logical Day, full height, always — truncating it at `now` would both restore the empty morning and draw a day that is still being compared identically to one that genuinely ended early ([#63](https://github.com/dbgeek/vape-off/issues/63), [#67](https://github.com/dbgeek/vape-off/issues/67)).

**Not "the ghost".** *Ghost slots* already names Pace's future slots, and the two sit in adjacent lanes both dim; one word on both is one word too few in the one place they are hardest to tell apart. They are told apart by **shape and lane, not by dimness** — slots hollow and ambient on the live lane, yesterday solid-but-dim in its own.

- **The lane is always yesterday**, never the most recent Known Logical Day. A lane whose identity depends on where your gaps are changes the comparison silently underneath the reader, and would put a third Logical Day on Track in all but name.
- **The lane is read-only, hard.** Not a premise of convenience: a tappable second lane roughly doubles the tap targets on the one screen whose thesis is that logging costs under a second, and the wrong tap there is a mis-log on *today*. A Correction is deliberate by definition; that gesture belongs on a surface about the record, not on a glanceable comparison. The inconsistency is real — a mark you can tap today and cannot tap in the lane — and dimness is what has to carry it.
- **No Target hairline and no red, ever.** The hairline is horizontal, so yesterday's would be a second one at a different height; and after a Ratchet Step yesterday's Target is a different number from today's, so one axis would be carrying two. Yesterday's relationship to its Target is a reading, and readings live on Stats.
- **The lane draws yesterday's Resisted Urges** as dim hollow rings — for honesty rather than completeness. A Logical Day Known only by Resisted Urges has no Puff Sessions, so dropping the rings would draw it identically to a Clear Day, and would make a day that was fought read as one that was quiet.

**The lane's head carries a single dim `Yesterday`, once**, and it appears if and only if the lane does. Nothing else on screen said the dim lane meant *yesterday specifically* rather than an average or a typical day, and a permanent unexplained second lane is a worse tax than one dim word. **The live lane gets no `Today` label**: it is the screen, and labelling the default implies a choice of lanes where there is none. This keeps the timeline to exactly one word of text.

`Yesterday` names the **previous Logical Day**, and is knowingly loose between 00:00 and 04:00 — at 02:00 on a Tuesday the lane draws the Logical Day that began Sunday 04:00, two calendar days back. Kept anyway: printing the weekday is *worse in precisely that window*, and the frame is established on this very screen, where the 04:00 boundary is drawn and Track **is** the Logical Day. **`Yesterday` is a label, not a term — it must not enter `CONTEXT.md`.**

#### The four states of yesterday

| yesterday | the lane's head | the lane's body | the catch-up strip |
| --- | --- | --- | --- |
| Known, with Puff Sessions and/or Resisted Urges | `Yesterday` | dim marks and dim hollow rings | no chip |
| Known, declared a Clear Day | `Yesterday`, with the *Clear* token directly beneath | empty | no chip |
| Unknown, within the app's history | nothing — no lane, so no head | nothing | a yesterday chip |
| Unknown, before the app's history began | nothing — no lane, so no head | nothing | no chip |

The *Clear* token sits **beneath** the label rather than merged into `Yesterday: Clear`, which would read as the value of a field; a Clear Day is a deliberate assertion, not a field value. Drawing the programme's most deliberate act as an empty lane is the one thing this lane must not do.

**An Unknown yesterday draws nothing at all** — no lane, no hatched rail, not the word *Unknown*. The tempting invariant *yesterday is Unknown if and only if the strip offers it* is **false**: `catchUpDays` is filtered to days at or after the app's first evidence, so on day one of use yesterday is Unknown and correctly offered nothing at all. The honest reading of an empty lane is not *the strip will tell you* but **the lane only ever asserts what the app knows** — content when yesterday is Known, a token when it was declared Clear, silence when there is nothing to assert. Silence is the correct drawing of an absence of evidence ([ADR 0001](../adr/0001-unlogged-days-are-unknown-not-zero.md)); it is the strip, arriving separately, that turns it into an offer.

**The cost, recorded rather than smoothed over.** The lane is what makes the empty morning affordable — and it is **absent on exactly the morning after a gap**, the returning user, the screen this app most has to get right. That morning is bare again. Accepted on the grounds that the strip is on screen in that same moment and is content of a different kind: the one screen where the timeline has nothing to show is the one screen with something to do ([#69](https://github.com/dbgeek/vape-off/issues/69)).

### Track carries exactly one number about a Logical Day

> **Track carries exactly one number about a whole Logical Day — today's running count against its Target. Every other quantity is read off the marks, or it lives on Stats.**

The header chip carries it, for the times you want it: `9 / 24`. During the Baseline it shows the count alone. **Nothing else lands on the header**, at Target 0 or during the Baseline either.

The rule is stated forward-looking because two candidates have now been refused on *different* reasoning, and a third will be proposed:

- **The day's biggest Puff Session** — refused on redundancy. A maximum is free to the eye: under the four tiers it is literally the largest object on the screen, with its number printed on it ([#64](https://github.com/dbgeek/vape-off/issues/64)).
- **Yesterday's total** — refused, but **not** on redundancy, because a sum is never free to the eye and refusing it costs something real. It is a like-for-like reading for about one hour in twenty-four (`2` against `14` at 07:51); it would be absent on exactly the morning after a gap and a bare `0` on a Clear yesterday, so it fails at both ends of its coverage; and the full-height lane on today's exact scale *is* the reading it would duplicate. The runner-up was the symmetric version — both lanes carrying their own total at their heads — and it lost only because it reopens the header. If a total is ever wanted, that is the shape to want ([#71](https://github.com/dbgeek/vape-off/issues/71)).

The rule is about **whole Logical Days**. It does not touch numbers about a single Puff Session: the open session's running count and the `+1 → 3` button below are the Merge Window making itself visible, and they stay.

### The timeline's floor, and the chrome budget

**`.timeline` has a floor of 14rem (224px), and it is derived rather than picked**: it is the shortest timeline on which the fan still resolves every collision it is handed, measured on the 335px-wide timeline an iPhone SE produces. Below it, height shortage presents as a *width* failure — a shorter timeline packs more marks into each collision, the fan answers with more columns, and the Yesterday lane overspends its 30% first and runs into the live lane's spine.

**The timeline is clipped to its own box and never draws under the controls.** Stated as a rule because the shipped screen violates it and nothing previously forbade it: `.timeline` is `overflow: visible` while `.track-screen` reserves 7.5rem of bottom padding, so when the minimum binds the excess runs *down into that padding*, under PUFF and Resisted. Measured at the old `min-height: 12rem`: **65px of timeline — 8h 08m of Logical Day — painted underneath the controls, untappable.** A minimum that nothing enforces is not a minimum, and this failure gets worse, not better, if the number is merely raised.

**The chrome above the timeline is budgeted, not discovered.** On the smallest supported screen about 90px is available between the header and the timeline. Two things compete for it — the install bar and the catch-up strip — and that is the whole set: the first-run card is `position: absolute` and spends no layout height, and it renders only on an empty store while the strip needs history, so the two are mutually exclusive. The reachable squeeze is **a returning user on a small phone who has not installed**, which is exactly the person the catch-up strip exists for.

The strip is what gives: compacted from 149px to 74px, it lands an iPhone SE in a tab on exactly 224px. Suppressing the install bar instead was refused — it hides a permanent, non-dismissible warning from the one person with history to lose in a tab ([ADR 0003](../adr/0003-install-before-data.md)) — and trimming PUFF's bottom padding frees only ~16px of the ~110 needed. Dropping the floor and simply clipping is honest and never broken, but at ~114px a mark covers nine hours and the timeline stops being readable on the screen that most needs it ([#72](https://github.com/dbgeek/vape-off/issues/72)).

### The controls

- **PUFF, bottom-right**, above the safe-area inset. The prototype put it bottom-left, which is the hardest corner for a right thumb on the one screen whose thesis is that logging costs under a second.
- **Resisted, to its left.** One tap, no follow-up question.
- **PUFF never changes** — same position, same size, at every Target including 0. Shrinking the log button at the moment logging is hardest is a penalty on honest logging in all but name.

### The Merge Window

**90 seconds, sliding.** A tap within 90 s of the previous *tap* increments the open session's `count` and pushes the window out, so a sitting of any length stays one Puff Session. The session keeps the timestamp of its **first** tap.

**It is visible, not inferred**: the open session pulses and shows its running count, and the button reads `+1 → 3`. Merging must not be a silent behaviour the user has to deduce from a total that sometimes fails to move.

The window is measured from the stored `lastTapAt`, so it survives a cold start ([data-model.md](./data-model.md#why-these-fields)).

### The catch-up strip

Shown on reopening when there are Unknown Logical Days behind you. **Non-blocking, capped at the last seven**, and never offered for days before the app's first evidence. Each day is resolvable by logging what you remember or by marking the day a **Clear Day**.

**One horizontally scrollable row of day chips, both actions as glyphs on the chip** — 74px, against the 149px that a stack of dated rows with two 2.2rem buttons apiece was spending. This is a deliberate trade, and the timeline's floor is what bought it: the strip is transient, existing only while there are Unknown Logical Days behind you, and the timeline is the screen. Spending a transient offer's spelled-out buttons to keep the permanent thing legible is the right way round.

**Leaving a day Unknown must stay a comfortable option** — the strip is an offer, never a debt. Tone matters here more than layout: this is the screen a returning user meets after a bad fortnight. No count of what you owe, no red, no "you missed 6 days".

**The tone rule constrains the compaction rather than surviving it.** The row carries one line of text above the chips, and it carries both halves:

> **Anything you remember?** It is fine to leave a day unknown.

The second sentence is the one holding the *offer, never a debt* framing, and it is not what gives if the line is tight. If the row cannot afford both, the chips shrink.

### The Clear Day control

The affordance for *no puffs that day*, and the only way an empty day becomes Known. Offered for past days as a glyph on their chip, and **for today**, since a premature declaration self-corrects when a Puff Session is written into it ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)). Today also becomes Known simply by logging.

### The first-run card

Over Track, dismissible, on an empty store. **An overlay — it spends no layout height**, which is why it never competes with the chrome budget above. **The app opens straight into Track with PUFF live from the first second** — the first run is a greeting, not a fork ([ADR 0007](../adr/0007-the-first-run-is-a-greeting-not-a-fork.md)).

> The first week just measures. Log every time you pick it up. After seven days of logging, vape-off sets your first daily target and starts bringing it down.
>
> Used vape-off before? **Restore from a backup**

*"Used vape-off before?"* self-selects the rare user without telling the common one that something is wrong. *"Seven days of logging"* is the plain phrasing that happens to be the precise one, since an Unknown Logical Day extends the Baseline. **The card is where the Baseline gets explained** — nothing else tells a new user why there is no Target — and that is what earns it a place in front of everyone.

**There is no *Start fresh* control.** It named the no-op half of a fork that does not exist, and a term for *what happens if you do nothing* invites someone to rebuild the button.

Behind the restore door, and only there, the full account:

> Your history may be in a backup file. It may also be behind a **second icon** — check your Home Screen and App Library, open it, export from there, and come back.
>
> The other icon has to still exist. If you deleted it, its history went with it, and only a backup file will bring it back.

That second paragraph is not optional. Without it the advice sends a user who deleted and re-added their icon hunting for something that cannot be found, implying their history is one tap away when it is unrecoverable ([#24](https://github.com/dbgeek/vape-off/issues/24)).

**Restore is refused outright while running in a tab** — here and in Settings alike — pointing at the install bar instead ([ADR 0007](../adr/0007-the-first-run-is-a-greeting-not-a-fork.md)).

Dismissed by the first write or by the ×, whichever comes first, and **never returns**. A completed restore also marks it dismissed. Dismissal is stored in `meta.firstRunCardDismissed`, not held in memory, or a cold start turns a one-time greeting into a nag.

### The handover offer

When `currentTarget() == 1` and the window is satisfied, Track offers the Declared `1 → 0` Step. **Earned, rare, and worth seeing** — and with no notifications available anywhere, an offer the app declines to surface may never be seen at all ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)).

The step-back (`0 → 1`) is **not here**. A standing *raise my target* control on the screen you open twenty times a day is a give-up button.

### The install bar

When not installed and history exists: a **permanent, non-dismissible** bar above the timeline.

**The old reasoning for budgeting it is void, and the budget survives on different grounds.** It said a bar "either compresses the day or displaces now-from-the-middle". `now` is never in the middle, so there is no second horn — and under a fixed uniform axis a bar does not compress *the day* either: it rescales the whole Logical Day uniformly, exactly as a smaller screen does, which [ADR 0013](../adr/0013-time-axes-are-never-fitted-to-the-record.md) expressly permits.

What replaces it is arithmetic rather than a dilemma. The bar is one of the two things spending the ~90px chrome budget above the timeline, and the timeline's 14rem floor is what that budget exists to protect. It is still budgeted for in the layout rather than discovered on a device — but because it costs height that the floor has already claimed, not because it distorts time.

### Editing the record

> **Derived, not decided.** No ticket designed this surface. What follows is the minimum the settled rules force; treat it as a default to review rather than a resolved screen. See [README](./README.md#where-this-spec-is-thinner-than-the-map-and-why).

Backfill is first-class and recall is the only route out of a gap ([ADR 0001](../adr/0001-unlogged-days-are-unknown-not-zero.md)), and deletes are hard ([ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)). So:

- **Tapping a mark opens it**: adjust `count`, adjust the time, or delete. Deleting is a hard delete. **Live lane only** — the Yesterday lane is read-only.
- **Adding a Puff Session or Resisted Urge at a past time** is reachable from the same surface and from the catch-up strip.
- Any write re-stamps `logicalDay` and `tz` from the time being set, then calls `evaluate()` and `updateBadge()`.
- **An edit that moves Momentum says so before it lands** — *"This will change your momentum from 6 to 4."* Momentum is derived, so correcting the past moves it; that is right, because you just corrected the record, but it must not move silently ([ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)).
- **Corrections must stay cheap.** No confirmation on a plain count adjustment, no "are you sure", no record of having edited. The design wants corrections ([ADR 0010](../adr/0010-logging-is-never-punished.md)).

**A gap this map exposed and did not close.** Correcting a *completed* Logical Day now has no route on Track. Tapping a mark is the only stated way to open an existing Puff Session, and only today's marks are tappable; a Known yesterday carries no catch-up chip, so a mis-typed `6` from yesterday can now be **seen and not touched**. The hole is pre-existing — before the Yesterday lane, yesterday was not on Track at all — but the lane makes it visible, which is new. Closing it means designing the editing surface, which no ticket has done. It wants an issue of its own.

---

## Stats — and the Baseline screen it grows out of

One column. **It never becomes a dashboard.**

### During the Baseline, this is not Stats

**Stats does not exist during the Baseline; a Baseline screen stands in its place** and converts on close. It is the dial plus an honest *N of 7 Known Logical Days* account, and **no programme tiles at all**. Three tiles reading "Baseline" teaches the user the screen is empty and they stop opening it; hiding the tab is worse, since the Baseline can stall indefinitely and the tab could be absent for a fortnight with no explanation ([#8](https://github.com/dbgeek/vape-off/issues/8)).

### The Dial

**The heatmap is a clock, and it throws the date away.** One 24-hour ring with **04:00 at the top**, so the ring *is* the Logical Day.

- **Puff Sessions grow outward** from the ring; **Resisted Urges grow inward** from the same ring. **Each is scaled independently** — in the reference scenario it is 455 against 102, and any shared or diverging scale loses precisely the comparison the dial exists to make.
- **Window fixed at 14 days, with no control.** The dial collapses hours across days, so the window decides *whose* day you are looking at: over all history a Baseline at ~23/day swamps a current ~10 and the dial shows the person you used to be. At the observed cadence 14 days is one to two Ratchet Steps, so the dial describes your current Target regime. A toggle on a glanced-at screen is cost with no payoff, and *All* is actively misleading.
- **Unknown Logical Days contribute no observations** — never a row of empty hours diluting the clock.
- A Puff Session is bucketed by when the pickup **began**, since the Merge Window slides and the session keeps its first tap's time.
- **The centre carries the peak-hour readout**: *Your largest hour is 21:00.* That sentence is a reading of the picture already on screen. *Try X* is advice and is out of v1 — **the line is at the verb**.

**What the Dial costs, recorded because it is real:** *"Tuesdays are bad"* is now unanswerable, and the Dial does not inherit Track's visual language, so the two screens do not read as one object. Both were judged worth paying for a heatmap that works on day 1.

### Beneath it, in order

1. **Steps Remaining** and the **Quit Horizon**, as a pair of tiles. Two tiles rather than one number, because one is exact and the other is a guess and a single readout re-hides which is which. Each degrades to its own silence independently ([rules.md §9–11](./rules.md#9-steps-remaining)).
2. **The trend**, kept small: a **28-day sparkline** of daily total with the **Target as a dashed step line**, **breaking across Unknown Logical Days** rather than drawing zeros. Not promoted — its real job is carrying the Target line and the breaks. Not dropped either: Steps Remaining says the *Target* is falling, which is not the same as whether you are hugging it.
3. **Longest Gap.** When the honest figure has been disqualified by an Unknown day, one factual footnote says so — kept small, never a telling-off.
4. **The backup status line**, from the first uncovered Known Logical Day: *"Last backup: 3 Logical Days ago."* A reading, not a warning. The **card at 30** appears here too, dismissible ([rules.md §13](./rules.md#13-the-export-nag)).

### At Target 0

Steps Remaining and the Quit Horizon **retire**; **Longest Gap takes the headline**, with Momentum beneath it. There is no graduation screen: an app that declares victory has nothing to offer on the day after, which is the day it is most needed ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)).

**The step-back lives here**, behind a deliberate trip — not a button on the surface. The asymmetry with the handover matches the authorship: the app surfaces what it has evidence for, and only you have evidence that you are not holding zero.

---

## Settings

**Present from the first run, unreduced.** This closes a hole the map nearly shipped: ADR 0004 homes restore in settings and [#8](https://github.com/dbgeek/vape-off/issues/8) made Stats a reduced screen during the Baseline, but nothing said whether *settings* existed yet. If it did not, restore would be unreachable for the first seven Known Logical Days — precisely the window in which a mistaken start needs undoing ([ADR 0007](../adr/0007-the-first-run-is-a-greeting-not-a-fork.md)). Settings is the container for the app; the Baseline is a state of the programme.

It holds:

- **Back up now.** Share sheet primary, `<a download>` fallback ([slices.md S9](./slices.md)).
- **Restore from a backup.** Behind a confirmation naming the counts on both sides — *"Replace 96 Logical Days with the 74 in this backup?"* — which is the only place in the app where a number from the file is put in front of the user. **The confirmation appears whenever there is something to replace, and so not on an empty store**: confirming the destruction of zero records trains you to tap through the one that matters.
- **Refused entirely in a tab**, pointing at the install bar.
- **The build identity** — git SHA and build timestamp. Updates are silent, so this is the only way to tell what is running.

---

## The four exceptional states

Distinct from each other and from the first-run card. Getting them confused is how the app destroys a database that was fine.

### 1. Not installed, and no history yet

A **full-screen install wall**: a picture of the Share glyph and a sentence. Shown before any Puff Session can be written and before restore is offered at all — restoring a year of history into a tab writes the entire irreplaceable archive onto a seven-day fuse ([ADR 0003](../adr/0003-install-before-data.md)).

It carries a small, honest **Continue anyway**. A hard block on a personal tool is a tool that cannot be tried. Taking it lands the user in the permanently-barred logging state — **logging, not restoring**.

iOS never fires `beforeinstallprompt`, so there is no one-tap install and no compliance signal. The app learns it worked by later finding itself standalone: `matchMedia('(display-mode: standalone)').matches || navigator.standalone`, either being sufficient. **`navigator.storage.persisted()` is not the check** — it returned `false` on two installed instances on a real device ([#12](https://github.com/dbgeek/vape-off/issues/12)).

### 2. The database would not open

After one automatic retry. Offers **Try again** and **Restore from a backup**, shows the build identity, and **omits *Start fresh* entirely — absent, not de-emphasised.**

It omits rather than ranks because **it cannot tell a first-ever run from a thousandth**: the only record of that is inside the database it could not open. The data is almost certainly intact — Dexie runs every intervening upgrader in a single `versionchange` transaction and reverts on abort, so a failed migration leaves data intact and merely unreadable by this build ([ADR 0005](../adr/0005-the-schema-only-moves-forward.md)).

Wiping is reachable only behind a second screen that names what it destroys. Rebuilding from a Backup is **recovery, never migration**.

### 3. The app is older than its data

`db.verno` exceeds the highest version the code declares — in practice, a rolled-back deploy.

*This app is older than your data.* The advice is to **update**, not to restore, and there is no retry: a version mismatch is not transient. **Restore is not offered**, because it would destroy the newer history to fix a problem that resolves itself the moment the newer build returns. There is deliberately **no read-only escape to take a Backup first** — old code exporting newer data writes it at the old `formatVersion`, silently dropping what it does not understand ([ADR 0005](../adr/0005-the-schema-only-moves-forward.md)).

### 4. Installed, with history, still in a tab

Not a screen: the **permanent non-dismissible bar** above Track. The app never blocks logging once history exists. Refusing to log would discard the Puff Sessions the whole Ratchet runs on in the name of protecting them ([ADR 0003](../adr/0003-install-before-data.md)).

Restore stays refused in this state; the export nag stays silent, because the bar is already giving better advice.
