# Screens

Three screens — **Track**, **Stats**, **Settings** — and four exceptional states that are not screens you navigate to.

Routing is **history routing**: `/` Track, `/stats` Stats, `/settings` Settings. Not for deep links — there are none — but for the iOS edge-swipe back gesture, which a standalone web app honours even with no chrome, and which does nothing at all if there is only one URL. The Vercel SPA rewrite is load-bearing rather than theoretical, because the 30-minute update catch-up reloads the page and a reload landing on `/stats` is a request the server really serves.

**`viewport-fit=cover` and `env(safe-area-inset-bottom)` are a hard constraint everywhere**, because PUFF sits on the home indicator.

---

## Track — the logging screen

**The screen is the Logical Day, not a counter.** A vertical timeline with **now in the middle**; the count is spatial before it is numeric. Chosen over a full-bleed tap slab and a depleting-allowance reservoir; the Baseline decided it — Reservoir's whole metaphor is a ceiling and days 1–7 have none, where Track simply drops the ghost slots and still has a job on day 1 ([#6](https://github.com/dbgeek/vape-off/issues/6)).

### The timeline

- Runs 04:00 → 04:00. The boundary is visible.
- **Puff Sessions are marks placed at their time, sized by `count`.**
- **Resisted Urges are hollow rings on the same track.**
- **Ghost slots** sit in the empty part of the day ahead — `pace().slots` that are still in the future. Ambient, not a countdown; they cost no chrome because they occupy the part of the day that is empty anyway. Absent during the Baseline and whenever Pace is silent ([rules.md §8](./rules.md#8-pace)).
- **Over-Target is factual**: a red hairline at the moment the Target was reached, labelled *Target reached 19:04*, with marks past it drawn red. No zeroing, no scolding ([ADR 0010](../adr/0010-logging-is-never-punished.md)).
- A header chip carries the number for the times you want it: `9 / 24`. During the Baseline it shows the count alone.

### The controls

- **PUFF, bottom-right**, above the safe-area inset. The prototype put it bottom-left, which is the hardest corner for a right thumb on the one screen whose thesis is that logging costs under a second.
- **Resisted, to its left.** One tap, no follow-up question.
- **PUFF never changes** — same position, same size, at every Target including 0. Shrinking the log button at the moment logging is hardest is a penalty on honest logging in all but name.

### The Merge Window

**90 seconds, sliding.** A tap within 90 s of the previous *tap* increments the open session's `count` and pushes the window out, so a sitting of any length stays one Puff Session. The session keeps the timestamp of its **first** tap.

**It is visible, not inferred**: the open session pulses and shows its running count, and the button reads `+1 → 3`. Merging must not be a silent behaviour the user has to deduce from a total that sometimes fails to move.

The window is measured from the stored `lastTapAt`, so it survives a cold start ([data-model.md](./data-model.md#why-these-fields)).

### The catch-up strip

Shown on reopening when there are Unknown Logical Days behind you. **Non-blocking, capped at the last seven.** Each row is resolvable by logging what you remember or by marking the day a **Clear Day**.

**Leaving a day Unknown must stay a comfortable option** — the strip is an offer, never a debt. Tone matters here more than layout: this is the screen a returning user meets after a bad fortnight. No count of what you owe, no red, no "you missed 6 days".

### The Clear Day control

The affordance for *no puffs that day*, and the only way an empty day becomes Known. Offered for past days in the strip, and **for today**, since a premature declaration self-corrects when a Puff Session is written into it ([ADR 0006](../adr/0006-the-ratchet-stops-at-target-1.md)). Today also becomes Known simply by logging.

### The first-run card

Over Track, dismissible, on an empty store. **The app opens straight into Track with PUFF live from the first second** — the first run is a greeting, not a fork ([ADR 0007](../adr/0007-the-first-run-is-a-greeting-not-a-fork.md)).

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

When not installed and history exists: a **permanent, non-dismissible** bar above the timeline. Budget for it in the layout rather than discovering it on a device — Track is a timeline where position *is* time, so a bar either compresses the day or displaces now-from-the-middle ([#6](https://github.com/dbgeek/vape-off/issues/6)).

### Editing the record

> **Derived, not decided.** No ticket designed this surface. What follows is the minimum the settled rules force; treat it as a default to review rather than a resolved screen. See [README](./README.md#where-this-spec-is-thinner-than-the-map-and-why).

Backfill is first-class and recall is the only route out of a gap ([ADR 0001](../adr/0001-unlogged-days-are-unknown-not-zero.md)), and deletes are hard ([ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)). So:

- **Tapping a mark opens it**: adjust `count`, adjust the time, or delete. Deleting is a hard delete.
- **Adding a Puff Session or Resisted Urge at a past time** is reachable from the same surface and from the catch-up strip.
- Any write re-stamps `logicalDay` and `tz` from the time being set, then calls `evaluate()` and `updateBadge()`.
- **An edit that moves Momentum says so before it lands** — *"This will change your momentum from 6 to 4."* Momentum is derived, so correcting the past moves it; that is right, because you just corrected the record, but it must not move silently ([ADR 0011](../adr/0011-store-the-ratchets-decisions-derive-everything-else.md)).
- **Corrections must stay cheap.** No confirmation on a plain count adjustment, no "are you sure", no record of having edited. The design wants corrections ([ADR 0010](../adr/0010-logging-is-never-punished.md)).

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
