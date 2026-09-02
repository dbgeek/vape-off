# Unlogged days are unknown, not zero

The Ratchet lowers the Target after five Met days in seven, and Met means a total puff count at or below Target. A Logical Day with no Puff Sessions totals zero, which is at or below any Target — so under the obvious reading, abandoning the app for a week earns a step down and seven points of Momentum, and the mechanism pays out for exactly the behaviour that destroys the data it runs on. We therefore treat an unlogged Logical Day as **Unknown** — an absence of evidence, never a record of zero — and an Unknown Logical Day is never Met.

## Considered options

- **Unknown, never Met** (chosen). A gap stalls the Ratchet instead of driving it, with no new mechanism: the window stays seven Logical Days needing five Met, so at most two of them can be Unknown.
- **Count it as zero.** What the rules said. Broken as above.
- **Infer from app usage** — opened but nothing logged is a real zero. Rejected: opening the app is not evidence about whether you vaped, and storing app-opens adds a fourth data stream that buys ambiguity rather than truth.
- **Require an explicit daily close-out** for any day to count. Rejected: a compulsory daily chore in an app whose thesis is that logging stays one tap.
- **Accept it** — a single-user app need not be defended from its only user. Rejected because the Ratchet exists to test whether you can hold a Target, and it cannot test a week it has no observations of.

## Consequences

- A day with genuinely no puffs — the best day available — is invisible unless declared. That is what the **Clear Day** mark is for, offered in a non-blocking catch-up strip when you return after a gap.
- **Do not read that as *always give the user a way to declare*.** The Clear Day exists because an Unknown Logical Day is *costly* — it stalls the Ratchet. Where an Unknown costs nothing, the app offers no control and the Unknown stands; the unmarked Puff Session is the case that goes the other way ([ADR 0015](./0015-an-unknown-earns-a-control-only-where-it-costs.md)).
- **Absence is stalling, not punishment.** Momentum holds across Unknown days rather than decaying, and the trend chart breaks the line rather than drawing zeros. The Ratchet not advancing is consequence enough; anything more would punish not-logging the way the design already refuses to punish honest over-Target logging.
- **The Baseline extends rather than closing on partial evidence.** It waits for seven Known Logical Days, however long that takes. Since the Baseline Average is frozen at close and is the origin of every Target ever, a Baseline diluted by unlogged days would set a first Target you had never actually hit and could never withdraw.
- **Backfilled days are first-class.** Recall is the only route out of a gap, so a day reconstructed from memory counts like any other. The reward is already delayed rather than retroactive: a Ratchet Step triggered by backfill is dated the day it was computed.
