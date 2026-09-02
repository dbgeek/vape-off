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
>
> **The Kicked halo was tested against this hatch and does not trip it.** The hatch exists because the ring and the slot are told apart *only* by which side of the now-line they fall on. The halo is in no such predicament: it is **never free-floating** — it always encircles a solid paper mark with a numeral printed in it — it uses a hue neither hollow thing uses, and it appears on both sides of the now-line without ever depending on that line to be read. It is not a third member of the hollow set; it is not a member of it. Recorded so the next ring on this lane does not re-litigate it ([#97](https://github.com/dbgeek/vape-off/issues/97)).

**Over-Target is factual**: a red hairline at the moment the Target was reached, labelled *Target reached 19:04*, with marks past it drawn red. No zeroing, no scolding ([ADR 0010](../adr/0010-logging-is-never-punished.md)). **The hairline spans the live lane only, and the Yesterday lane is never red** — see below.

#### The Kicked halo

**A Kicked Puff Session keeps everything it already was and gains a detached ring just outside it.** Tier, printed numeral, paper fill, over-Target red and the open-session pulse all survive unchanged, because the Kick is written in the one channel nothing else on a mark uses: the space *outside* it. The fill is over-Target's; the border is the mark's separation from one overlapping it; a detached pip is the one thing a neighbour can paint over. The outside is what is free ([#90](https://github.com/dbgeek/vape-off/issues/90)).

**4px per side, in three bands, and the mark's own rim is nested rather than replaced:**

| band | what |
| --- | --- |
| 0–1px | the mark's own rim — paper at 25%, or `#ef685f` at 40% when over-Target |
| 1–2px | `--color-ink` — the detachment gap |
| 2–4px | `--kick-accent: #c9a8f0` — the halo |

**The nesting is a fix, not a flourish.** `.puff-mark` already carries its rim as a `box-shadow`; a halo written as a `box-shadow` on the same element **silently deletes it**, and on an over-Target mark deletes its red one. Nesting keeps the same 4px footprint and the same 2px accent width while the mark keeps everything it had ([#97](https://github.com/dbgeek/vape-off/issues/97)).

**It costs no tap area.** A `box-shadow` is not hit-tested, so a Kicked mark's handle is exactly the handle it was — the drawn mark, and not a pixel more. A treatment that grew the tap target would take room from the neighbour the fan just worked to keep reachable ([#72](https://github.com/dbgeek/vape-off/issues/72)).

**Lilac, at 267°, because chroma is load-bearing.** Track's wheel is otherwise spoken for — teal 164° is a Resisted Urge, red 4° is over-Target, paper 43° is the mark, amber 39° is the app's chrome. An **achromatic paper ring was refused on a collision no ticket had named: it attacks the size channel.** Mark size is the redundant, at-a-glance encoding of count, so a bright paper ring around a paper mark inflates apparent size and a Kicked 20px mark reads as a bigger count. **The halo must be a different substance to stay out of the tier system, and that means chroma.** Amber was refused for dilution rather than collision: it is spent so widely that it means *interactive chrome*, so a Kicked mark in amber reads as **selected** rather than **delivered**. The accent's contrast against ink is 9.69 — between the teal ring's 11.32 and the red fill's 6.38 — because the halo is a *modifier on a mark*, not an event class like a ring or an over-Target fill, and must never outshout one on the lane it shares.

> **The separator is hue, not luminance, and this is a constraint rather than an observation.** On the Yesterday lane at `0.42` over near-black, compositing preserves hue and destroys luminance: every candidate lands within a 1.02–1.25 luminance ratio of the dim teal ring, so **hue is the only separator left** — dim lilac `#5b4d6c` 267°, dim teal `#376056` 165°, dim paper `#686766` 30°. The obvious cool accent fails on exactly this: a light blue dims to a 1.02 ratio against dim teal in the same colour family. **The accent is therefore not free to be re-toned to a lower-chroma value later.** Chroma is the whole mechanism.

**A Kicked over-Target mark draws both.** Red fill, red rim nested, ink band, lilac halo. The two chromas are near-equiluminant but 263° apart, and the ink band means they never touch. *You went past Target and that one delivered* is a legible sentence and both halves are facts about the same session; the red is factual rather than scolding ([ADR 0010](../adr/0010-logging-is-never-punished.md)), so it has no standing to censor the Kick, and the Kick none to hide the red.

**The halo breathes with the open mark.** `.open-mark` animates `scale: 1.08` and a box-shadow scales with its element, so on a 44px mark the halo transiently reaches ~2px past its static edge. This is the common case, not an edge one — you are usually long-pressing while the Merge Window is still open. Accepted: the 4px below is a **static-layout** ceiling, only one session is ever open, and `prefers-reduced-motion` already stills it.

**The halo is state and nothing else** — no count, no *3 of 9*. **Lilac appears on the halo and on the editor's `Kicked` toggle in its on-state, and nowhere else**; `Kicks Marked` on Stats stays amber like every other tile, whose corner brackets are grid furniture rather than meaning. **Screen readers get it from the mark's `aria-label`**, which gains `, Kicked` in either lane.

### When marks collide — the fan

Under a uniform 24-hour axis a 20px mark covers roughly 55 minutes, so collision is a property of the **hour**, not of a pair of sessions: on a busy evening screen every mark collides with something at any plausible size. The fan is therefore the normal case, not an exception ([#65](https://github.com/dbgeek/vape-off/issues/65), [#70](https://github.com/dbgeek/vape-off/issues/70)).

- **Vertical position stays exactly time. Collisions are answered sideways, in the free dimension.** Nothing is ever displaced through time and nothing is ever merged into a combined mark — a timeline owes its one axis the truth, and a merged run would be a domain object whose membership depends on pixel density rather than on the record.
- **Each event takes the leftmost column free at its own height**, in time order, and keeps a hairline spoke back to its lane's spine at its true height. Colouring into the leftmost *free* column rather than stepping every member of a group is what keeps the fan cheap: two or three columns answer every realistic live-lane collision.
- **The column step is the widest mark in the group plus 4px** — group-local, not a uniform global step. A global step would spend the widest tier's 44px on every column everywhere, and the timeline's floor below was derived against the group-local step. The cost, named: columns do not line up into a visible grid down the timeline.
- **Resisted Urge rings fan with everything else**, keeping their own size, so a fanned run reads its kinds as well as its counts.
- **A lane's head takes the spine's own column for as long as it reaches down the lane.** The Yesterday lane carries one and the live lane carries none. The head stands *left* of the spine, so it is only ever the spine's column it takes — a fanned column starts a whole step out and never reaches back past the spine — but a mark on the spine is centred on it and reaches half its own width into the head. So an early-morning mark in the Yesterday lane starts one column out and hangs off the axis on its spoke, which is what the fan does everywhere else. The reservation is the head's *drawn* height, so it is one line where yesterday is only Known and two where it was declared Clear, and it grows with the reader's text. At the timeline's floor it costs the lane one column for the first hour or two of the Logical Day. It only ever binds at that floor: on a taller timeline the same head reaches a smaller share of the day.
- **When a clique is deeper than its lane affords, the outermost column takes the remainder and those marks overlap.** Clipping them would delete a Puff Session from the picture; overlapping keeps it visible and reachable. This is the one place the whole-circle guarantee degrades, and at or above the timeline's floor it is not reachable on any measured screen — the deepest genuine clique measured is five events inside fourteen minutes.
- **Two adjacent Kicked marks share one 4px band and read as a single merged ring.** The halo's band is *exactly* `MARK_GAP`, so a Kicked mark's halo abuts an unkicked neighbour without covering it, and two Kicked neighbours occupy the same gutter. Only marks at their group's widest tier ever sit at the 4px minimum, so this is the busy-evening worst case rather than the normal reading. **Recorded as an accepted degradation, not a rendering bug** — unsaid, whoever meets it first will "fix" it by re-opening [#96](https://github.com/dbgeek/vape-off/issues/96).

**Every Puff Session keeps its own whole circle.** That is the point of the fan: the mark is the handle for correcting a mis-tap, and a session you cannot reach is a session you cannot correct.

**The whole circle is the mark's *own*, and a treatment drawn outside the box is outside the fan's protection by design.** `size` is the mark's **box**, never its drawn extent: the fan tests collision on it and steps columns by `max(size) + MARK_GAP`, and the Kicked halo lies 4px outside it on every side. **The fan is not taught the halo**, and that is a decision rather than an oversight ([#96](https://github.com/dbgeek/vape-off/issues/96)) — teaching it pushes the live lane at the floor into the marks-overlap degradation it never reaches today, merges two collision groups into a chain of twelve, and tips on **3 Kicks out of 18**, because the column step is the group's *widest* mark. Marking those three moves 14 of 18 marks sideways, one by 128px, under the thumb doing the long-press. **A Kick-blind layout is what keeps that gesture honest: marking never moves a mark.** The sentence above stays true while its most natural extension is false, which is exactly how it gets extended by accident.

### The Yesterday lane

The previous Logical Day, drawn dim on today's exact axis, so equal height is equal time of day on both days and the comparison is literal rather than shape-against-shape. It draws the **whole** completed Logical Day, full height, always — truncating it at `now` would both restore the empty morning and draw a day that is still being compared identically to one that genuinely ended early ([#63](https://github.com/dbgeek/vape-off/issues/63), [#67](https://github.com/dbgeek/vape-off/issues/67)).

**Not "the ghost".** *Ghost slots* already names Pace's future slots, and the two sit in adjacent lanes both dim; one word on both is one word too few in the one place they are hardest to tell apart. They are told apart by **shape and lane, not by dimness** — slots hollow and ambient on the live lane, yesterday solid-but-dim in its own.

- **The lane is always yesterday**, never the most recent Known Logical Day. A lane whose identity depends on where your gaps are changes the comparison silently underneath the reader, and would put a third Logical Day on Track in all but name.
- **The lane is read-only, hard.** Not a premise of convenience: a tappable second lane roughly doubles the tap targets on the one screen whose thesis is that logging costs under a second, and the wrong tap there is a mis-log on *today*. A Correction is deliberate by definition; that gesture belongs on a surface about the record, not on a glanceable comparison. The inconsistency is real — a mark you can tap today and cannot tap in the lane — and dimness is what has to carry it.
- **No Target hairline and no red, ever.** The hairline is horizontal, so yesterday's would be a second one at a different height; and after a Ratchet Step yesterday's Target is a different number from today's, so one axis would be carrying two. Yesterday's relationship to its Target is a reading, and readings live on Stats.
- **The lane draws yesterday's Resisted Urges** as dim hollow rings — for honesty rather than completeness. A Logical Day Known only by Resisted Urges has no Puff Sessions, so dropping the rings would draw it identically to a Clear Day, and would make a day that was fought read as one that was quiet.
- **The lane draws yesterday's Kicks**, in the same halo at the lane's own dimness, **on the identical honesty argument**: withholding them would draw a day that delivered identically to one that did nothing. It gets **nothing beyond the lane's `0.42`** — no boosted accent, no per-mark exception — which [ADR 0014](../adr/0014-a-lane-is-its-marks-not-its-furniture.md) puts close to forbidden, and which is safe only *because* the separator is hue rather than luminance. **Read-only survives it structurally rather than by discipline**: the lane is handed a set of ids and never a handler, so drawing the Kick adds a fact to the picture and no gesture, which is precisely what a read-only lane is for.

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

- **A Kick count** — refused by this rule before it was proposed, and it is the third candidate the rule was stated forward-looking for. A Kicked mark shows **state** and carries no number; the reading is `Kicks Marked` and it lives on Stats. *3 of 9 delivered* on the header, at a lane's head, or anywhere else on this screen is out.

The rule is about **whole Logical Days**. It does not touch numbers about a single Puff Session: the open session's running count and the `+1 → 3` button below are the Merge Window making itself visible, and they stay.

### The timeline's floor, and the chrome budget

**`.timeline` has a floor of 14rem (224px), and it is derived rather than picked**: it is the shortest timeline on which the fan still resolves every collision it is handed, measured on the 335px-wide timeline an iPhone SE produces. Below it, height shortage presents as a *width* failure — a shorter timeline packs more marks into each collision, the fan answers with more columns, and the Yesterday lane overspends its 30% first and runs into the live lane's spine.

**The floor was derived against the mark's own box**, and that condition is part of the number. The floor and the fan's measurement are derived from each other and only one of them was ever written down. Re-derived with the fan measuring the Kicked halo, the same procedure yields **17.44rem** — 55px more, on the screen the catch-up strip was compacted from 149px to 74px to buy 14rem for — and it does not even remove the reflow, only the overlap. That counterfactual is why the fan stays blind ([#96](https://github.com/dbgeek/vape-off/issues/96)); the corollary is that **any future change to what the fan measures re-opens this number**.

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

### Marking a Kick

**The mark is the whole surface. Two routes, one act** ([#89](https://github.com/dbgeek/vape-off/issues/89)).

- **Long-press a mark toggles its Kick.** The everyday path: one held press, no dialog, no chrome.
- **Tap a mark opens the editor, which carries a `Kicked` toggle.** The findable path: three taps.
- **They are the same toggle**, so marking and un-marking are one act, and taking one back is the same gesture that made it, by either route.
- **The reach is any of today's marks, live lane only.** A sitting inside its open Merge Window is markable, because the open mark is a mark like any other.

**Neither half survives alone, and they fail in opposite directions.** A long-press alone is undiscoverable — nothing on Track teaches a held press, and this app has no notifications and no onboarding to teach it anywhere else, so a floor count built on it would be a floor on who guessed the gesture. The editor alone costs three taps for something that happens several times a day on the screen whose thesis is that logging costs under a second. **They are one act with a fast path and a findable one**, on the same target, with the same reach and the same semantics. The pairing is also what makes the act reachable at all: a long-press has no keyboard and no screen-reader equivalent, and a `<button>` in a dialog has both.

**No new chrome, and no prompt.** A third `Kick` button beside `PUFF` and `Resisted` was refused on the chrome budget — a standing cost on every screen for an act that could only ever reach the *latest* session. A readout that lingers past the Merge Window asking `Kicked?` was refused more sharply: surfacing a question after every sitting is the **second decision on every log** that [ADR 0010](../adr/0010-logging-is-never-punished.md) exists to prevent ([ADR 0015](../adr/0015-an-unknown-earns-a-control-only-where-it-costs.md)). Both routes here are silent until you go to them.

**With them goes the assumption that the session you mean is the latest one.** Reach is governed by the **Logical Day** — not a clock, not a window, not a recency rule. A Kick that lands after you have already begun the next sitting still reaches the sitting that delivered it, and one you only get round to recording an hour later is still yours to record.

**Marking is a live write, not a Correction**, and neither is un-marking. The record is *silent* on whether a session delivered; marking fills that silence rather than changing an answer, which is the same exemption `Clear Day` already has. So none of the Correction machinery applies: nothing is proposed, nothing is named, no Momentum impact is shown, because a Kick moves no derived figure. **Marking does not close or extend the Merge Window** — the window stays keyed to taps alone.

#### Inside the editor

The editor is a **Correction** surface: fields are proposed and nothing commits until `Save changes`. The Kick is not. So the toggle **sits above the fields rather than among them, applies on tap, and says so**:

> **Kicked**  ⟨toggle⟩
> Applies straight away. You can also long-press the mark.

That second line is doing two jobs, and both are load-bearing. It states the commit rule, because two commit rules in one dialog is a real cost and the dialog has to carry it rather than hide it. And it **teaches the long-press** — without it, the two routes are two affordances rather than one act with two doors, and the fast path is never found. Deferring the Kick to `Save changes` instead was refused: it would make marking, and worse *un*-marking, ride a Correction, and would need a rollback path on Cancel for a write that touches nothing derived.

The toggle's on-state is the halo's lilac. It is the only place other than the halo that lilac appears, and it is there because marking the on-state teaches the vocabulary at the one moment it is being created.

#### The costs, recorded rather than smoothed over

1. **The smallest mark is now a 20px long-press target.** The fan is what makes a sub-44px mark a handle at all and it keeps working here, but a held press on 20px is harder than a tap on it. The editor route is what you fall back to when the press misses — the pairing earning its keep a second time.
2. **Long-press is a new interaction vocabulary on Track**, which was taps only. One gesture, on one kind of target, is the whole of the addition.
3. **iOS will fight it, and the fix is owed by the build slice.** `.puff-mark` sets neither `-webkit-touch-callout: none` nor `user-select: none`, so a held press raises the selection callout over the mark. Both, plus suppressing the context menu.
4. **A Kick across the 04:00 boundary can be unrecordable.** A sitting straddling 04:00 is two Puff Sessions, and only today's marks are tappable — so at 04:00:30 the pre-boundary session sits on a completed Logical Day and cannot be opened. **No tie-break rule is needed; the reach rule already answers it.** The cost is a sitting running 03:58–03:59 whose Kick lands at 04:02: the mark is simply unavailable. Accepted, and it is exactly what the floor semantics were bought for — an unreachable Kick *lowers* the floor rather than corrupting it. A rule reaching backwards across 04:00 would be marking a completed Logical Day, which has no route on Track at all.

**A backfilled Puff Session is markable if and only if it lands in the current Logical Day.** That falls out of the reach rule and is not a separate decision.

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

- **Tapping a mark opens it**: adjust `count`, adjust the time, or delete. Deleting is a hard delete. **Live lane only** — the Yesterday lane is read-only. The surface also carries the `Kicked` toggle, which is *not* part of the Correction — see [Marking a Kick](#inside-the-editor).
- **Adding a Puff Session or Resisted Urge at a past time** is reachable from the same surface and from the catch-up strip.
- Any write re-stamps `logicalDay` and `tz` from the time being set, then calls `evaluate()` and `updateBadge()`.
- **An edit that moves Momentum says so before it lands** — *"This will change your momentum from 6 to 4."* Momentum is derived, so correcting the past moves it; that is right, because you just corrected the record, but it must not move silently ([ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)).
- **Corrections must stay cheap.** No confirmation on a plain count adjustment, no "are you sure", no record of having edited. The design wants corrections ([ADR 0010](../adr/0010-logging-is-never-punished.md)).

**A gap this map exposed and did not close.** Correcting a *completed* Logical Day now has no route on Track. Tapping a mark is the only stated way to open an existing Puff Session, and only today's marks are tappable; a Known yesterday carries no catch-up chip, so a mis-typed `6` from yesterday can now be **seen and not touched**. The hole is pre-existing — before the Yesterday lane, yesterday was not on Track at all — but the lane makes it visible, which is new. Closing it means designing the editing surface, which no ticket has done. It wants an issue of its own.

**The Kick widens it by one.** A completed Logical Day now has a *second* thing it cannot be told about: a Kick you did not get round to marking before 04:00 is unrecordable, and yesterday's halos are visible and untouchable in the dim lane exactly as yesterday's counts are. Retro-marking inherits this limit rather than closing it, and it strengthens the case for that separate effort rather than changing its shape.

---

## Stats — and the Baseline screen it grows out of

One column. **It never becomes a dashboard.**

### During the Baseline, this is not Stats

**Stats does not exist during the Baseline; a Baseline screen stands in its place** and converts on close. It is the dial plus an honest *N of 7 Known Logical Days* account. Three tiles reading "Baseline" teaches the user the screen is empty and they stop opening it; hiding the tab is worse, since the Baseline can stall indefinitely and the tab could be absent for a fortnight with no explanation ([#8](https://github.com/dbgeek/vape-off/issues/8)).

**The exclusion is a content test, not a category one**, and this is the wording rather than a change of mind — *no programme tiles at all* was always aimed at the failure above. **The screen carries no tile that is empty because the programme has not started.** That still keeps out everything it was keeping out: `Steps Remaining`, the `Quit Horizon`, the sparkline's `Target` step line, and `Momentum` — during the Baseline there is no Target, no Met, no Momentum, no Pace, no Steps Remaining and no Quit Horizon. It also keeps out **`Longest Gap`**, which a bare *not a programme tile* test would have admitted: it has its own reason to stay out, since it only becomes interesting at zero ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)). The sharpening is not an opening ([#99](https://github.com/dbgeek/vape-off/issues/99)).

**`Kicks Marked` passes that test and appears here**, beneath the dial, after the *N of 7* account — the account is the screen's job, and a descriptive side reading must not sit above it. It has real content from the first tap and, by its own silence rule, is either a true number or absent — never a placeholder — so it is never what greets a new user on day 1. A Kick means the same thing on day 2 as it does at `Target 3`, because marking was never gated on a Target.

**Its window is uniform across the conversion**: the 14 most recent Logical Days throughout, Baseline days counted like any other, and **nothing observable happens on the day the Baseline closes**. The `Baseline Average` freeze is not a precedent — that figure is frozen because it is an *origin* the whole descent is measured from, and `Kicks Marked` is an origin for nothing. The Dial directly above it already draws Baseline days without a special case. Excluding them would make the count **fall** at the exact moment the app starts asking more of you.

### The Dial

**The heatmap is a clock, and it throws the date away.** One 24-hour ring with **04:00 at the top**, so the ring *is* the Logical Day.

- **Puff Sessions grow outward** from the ring; **Resisted Urges grow inward** from the same ring. **Each is scaled independently** — in the reference scenario it is 455 against 102, and any shared or diverging scale loses precisely the comparison the dial exists to make.
- **Window fixed at 14 days, with no control.** The dial collapses hours across days, so the window decides *whose* day you are looking at: over all history a Baseline at ~23/day swamps a current ~10 and the dial shows the person you used to be. At the observed cadence 14 days is one to two Ratchet Steps, so the dial describes your current Target regime. A toggle on a glanced-at screen is cost with no payoff, and *All* is actively misleading.
- **Unknown Logical Days contribute no observations** — never a row of empty hours diluting the clock.
- A Puff Session is bucketed by when the pickup **began**, since the Merge Window slides and the session keeps its first tap's time.
- **The centre carries the peak-hour readout**: *Your largest hour is 21:00.* That sentence is a reading of the picture already on screen. *Try X* is advice and is out of v1 — **the line is at the verb**.
- **The Dial draws no Kicks** — nothing on the ring, nothing in the centre, nothing in the per-hour accessible description. **Stated positively, because the channel exists and is declined rather than absent**: the outward bar's *hue* is genuinely free, and the halo's lilac 267° separates cleanly from the Dial's amber 38°. It is declined because **the Dial is the wrong home**. A clock that throws the date away can only make claims about *time of day*, so a Kick layer is capable of exactly one reading — *Kicks cluster at 21:00* — which is the correlation this app does not do. That the Dial already draws two distributions against time of day is not a precedent: those two are the picture's **subject**, the comparison it exists to make. Recorded independently, and surviving even if the scope were ever redrawn: **the outward bar sums puffs while a Kick attaches to a session**, so an hour's share of its Kicks is not recoverable from a bar whose length is a puff count — the bar is the wrong carrier as well as the wrong place. The centre keeps the peak-hour reading alone; a Kick sentence there would be a reading of a picture that is not on screen. And the spoke's `aria-label` carries no Kicks either — appending `, 2 Kicks` costs no pixels and collides with nothing, which is exactly why it has to be shut explicitly: it would hand a screen-reader user the banned distribution spoke by spoke, and would make the non-visual Dial describe more than the visual one contains ([#98](https://github.com/dbgeek/vape-off/issues/98)).

**What the Dial costs, recorded because it is real:** *"Tuesdays are bad"* is now unanswerable, and the Dial does not inherit Track's visual language, so the two screens do not read as one object. Both were judged worth paying for a heatmap that works on day 1. **And *when* your Kicks landed is unanswerable too, deliberately** — the same species of cost as the first, and it belongs beside it.

### Beneath it, in order

1. **Steps Remaining** and the **Quit Horizon**, as a pair of tiles. Two tiles rather than one number, because one is exact and the other is a guess and a single readout re-hides which is which. Each degrades to its own silence independently ([rules.md §9–11](./rules.md#9-steps-remaining)).
2. **The trend**, kept small: a **28-day sparkline** of daily total with the **Target as a dashed step line**, **breaking across Unknown Logical Days** rather than drawing zeros. Not promoted — its real job is carrying the Target line and the breaks. Not dropped either: Steps Remaining says the *Target* is falling, which is not the same as whether you are hugging it.
3. **Longest Gap.** When the honest figure has been disqualified by an Unknown day, one factual footnote says so — kept small, never a telling-off.
4. **Kicks Marked.** A bare count of the Puff Sessions you marked as having delivered, over the same 14 Logical Days the Dial uses, today's running day included ([rules.md §12a](./rules.md#12a-kicks-marked)). **Absent entirely when the window holds none.** A tile of its own, not fused into a pair with `Longest Gap`: the `Steps Remaining` / `Quit Horizon` pairing exists to keep an exact figure and a guess visibly distinct, and two floors have no such tension to display. Here because this is the screen's *descriptive floors* neighbourhood, and before the backup line because that line is housekeeping rather than a reading.
5. **The backup status line**, from the first uncovered Known Logical Day: *"Last backup: 3 Logical Days ago."* A reading, not a warning. The **card at 30** appears here too, dismissible ([rules.md §13](./rules.md#13-the-export-nag)).

**`Kicks Marked` never carries a denominator, and never a footnote.** `12 of 87` was refused as the worst of the three options rather than a compromise — it invites the reader to perform the division the app declined to perform, and a number the reader computes is one the app cannot caveat. The honest denominator does not exist ([ADR 0015](../adr/0015-an-unknown-earns-a-control-only-where-it-costs.md)), so **the app never says what fraction of vaping delivers**; that is the correct outcome, not a shortfall in the reading. The floor rides in the participle — `Marked` names the act of recording, not the event — and is written down once, in the glossary, the way `Longest Gap` keeps its own. There is no on-screen *at least*. A bare number under that label can only be misread as *exactly this many Kicks occurred*, which is an **understatement**, and understating is the safe direction.

**The boundary, stated positively.** `Kicks Marked` is one number about a span of your own record and nothing else. It is **not** a comparison, so it never divides; **not** a distribution, so it never breaks down by gap length, hour or day of week; **not** a judgement, so it never appears beside `Target`, `Met`, `Momentum` or the `Ratchet`; and **not** a trend, so it draws nothing and carries no direction of travel. The 28-day sparkline is not a home for it.

### At Target 0

Steps Remaining and the Quit Horizon **retire**; **Longest Gap takes the headline**, with Momentum beneath it. There is no graduation screen: an app that declares victory has nothing to offer on the day after, which is the day it is most needed ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)).

**`Kicks Marked` is unchanged here, and that has to be said rather than left to be inferred.** This is a paragraph about things that retire, so a reader who watches the tile vanish will conclude it retired alongside them — and the obvious "fix" for that is an explicit retirement rule, which is the suppression refused below. What actually happens needs no special case: at `Target 0` a Met day admits no Puff Sessions, so in the steady state there is nothing to Kick, the count reaches zero and the silence rule empties the tile unaided.

**And when it is not the steady state, the tile returns — unsuppressed.** On a day at `Target 0` when you are not holding zero, marking a Kick brings it back. That is not a reproach, on a ground sharper than [ADR 0010](../adr/0010-logging-is-never-punished.md)'s *visible is fine, costly is not*: **the tile is not the app noticing, it is the app repeating back a sentence you volunteered.** Over-Target red is the app noticing — derived, unbidden, from a log you had to keep. A Kick exists only because you long-pressed a mark to say so, and the app cannot reproach you with your own statement. Suppressing it would mean **hiding your own mark from you** at the one moment you would most want to see it, having decided your record is embarrassing — the under-reporting incentive arriving through the display instead of the mechanics. **The step-back is not a precedent for hiding it**: that sits behind a deliberate trip because it is a *control*, and a standing *raise my target* button is a give-up button. This is a *reading*, and the app has your own mark as evidence.

**Order at `Target 0`: `Longest Gap` (headline) → `Momentum` → `Kicks Marked` → the backup status line.** The tile does not move up to chase `Longest Gap`. **`Momentum` has no home on ordinary Stats at all** — it is a newcomer here, promoted to fill the hole the two retirements left — so the *descriptive floors* adjacency does not survive `Longest Gap`'s promotion out of the tile stack, and chasing it would wedge a descriptive tile between the headline and the programme figure promoted to support it. In ordinary Stats the tile is the last reading before housekeeping; here it stays the last reading before housekeeping. **Its position is defined by what it sits above, not by what it sits below**, and that never changed.

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
