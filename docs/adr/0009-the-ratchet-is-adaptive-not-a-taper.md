# The Ratchet is adaptive, never a schedule

The **Target** comes down when the user has demonstrated they can hold the one they have — five of the seven most recent completed Logical Days **Met** — and at no other time. It never comes down on a date, and there is no plan, curve or end date fixed in advance.

Settled while the map was being charted; recorded here late because [ADR 0002](./0002-the-quit-horizon-simulates-the-ratchet.md) and [ADR 0006](./0006-the-ratchet-stops-at-target-1.md) both reason from it and neither states it.

## Why not a taper

A fixed taper — 10% a week, or a quit date with a straight line drawn back to today — is the obvious design, and it is what most reduction apps do. It fails in one specific way that matters more than everything it gets right:

**A schedule keeps moving whether or not the user is with it.** A bad fortnight leaves the Target three steps below where the user actually is, and every subsequent day is a failure by arithmetic. At that point the app has two things to offer: a number the user cannot hit, and a record of missing it. The rational move is to stop logging — and the entire mechanism is built on the log being true ([ADR 0010](./0010-logging-is-never-punished.md)).

An adaptive Ratchet cannot do this. The Target only moves when there is evidence for the move, so it is never further ahead of the user than the user has already been. A stall is a stall — the Target simply stays where it is, which is the honest description of what happened.

The cost is real and is the whole trade: **the app cannot promise a date.** What it offers instead is [ADR 0002](./0002-the-quit-horizon-simulates-the-ratchet.md)'s **Quit Horizon** — an estimate that lengthens as readily as it shortens, deliberately imprecise, and withdrawn entirely once a stall has made it a lie.

## Considered options

- **Adaptive: step down on demonstrated evidence** (chosen). The Ratchet tests one thing — can you hold *this* number — and answers it before asking the next one.
- **A fixed percentage taper on a clock.** Rejected as above: it diverges from the user precisely when they are struggling, and the divergence is permanent because it never waits.
- **A user-set quit date with a computed schedule.** Rejected for the same reason plus authorship: the date is a guess made on day one by the person with the least information about how this will go, and it cannot be revised downward without the app admitting the plan failed.
- **Adaptive in both directions** — raise the Target when the user is struggling. Rejected: a Target that rises when you miss it is not a Target, and it converts every hard week into a permanent concession. The one exception, at the `0 → 1` boundary only, is [ADR 0006](./0006-the-ratchet-stops-at-target-1.md)'s **Declared Step**, and it is written by the user rather than the mechanism.

## Consequences

- **Only the cadence is unknown, and it is the one thing the app has to estimate.** The step arithmetic determines the whole remaining descent from any Target, which is why [ADR 0002](./0002-the-quit-horizon-simulates-the-ratchet.md) simulates the rule forward rather than fitting a curve, and why **Steps Remaining** is exact while the **Quit Horizon** is not.
- **A gap stalls the Ratchet rather than advancing it,** because an Unknown Logical Day is never Met ([ADR 0001](./0001-unlogged-days-are-unknown-not-zero.md)). Under a taper a gap costs the user their standing; here it costs them time and nothing else.
- **There is a cadence floor and it is six Logical Days.** Five Met days are needed and only days strictly after the current Step count, so the earliest a Step can follow another is the sixth day after it. The fastest possible descent is roughly 10% per six days — which is what bounds the whole programme's length, and what makes the single-puff tail of [ADR 0006](./0006-the-ratchet-stops-at-target-1.md) as long as it is.
- **At most one Step per evaluation.** The window can be satisfied several times over after a long absence with backfill; compounding those into a single evaluation would cut the Target by 27% for having gone on holiday. Enforced by the schema, not by the code remembering: `&effectiveFrom` is unique.
- **The Ratchet only ever judges completed Logical Days.** Judging today would let a Step fire at 09:00 on two puffs, against a day whose end it has not seen.
- **Nothing about the descent is configurable, and nothing about it is announced.** There is no plan screen, because there is no plan — only the current Target and the evidence for the last change.
