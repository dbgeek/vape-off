# Logging is never punished

Writing a **Puff Session** never costs the user anything the app could have withheld. Going over **Target** turns the day red and costs one point of **Momentum**; it does not zero Momentum, does not reset the **Ratchet**, does not invalidate the descent already walked, and is never accompanied by copy that tells the user off.

This is the premise the rest of the map keeps deferring to, and it has been cited by name in six ADRs without ever being written down. Recorded here.

## The argument

Every number the app produces is derived from the log. The Ratchet cannot test whether a Target is holdable, the Baseline cannot set an origin, and the dial cannot show a shape, unless the log is a true account of what happened.

The user is the only source of that log, and they can stop supplying it at any moment, for free, with no consequence the app can detect — an unlogged day is Unknown and Unknown is untouched ([ADR 0001](./0001-unlogged-days-are-unknown-not-zero.md)).

So any penalty attached to an honest entry is a penalty attached to honesty. It does not discourage vaping; it discourages *recording* vaping, and it does so most strongly on exactly the days the record matters most. An app that makes a bad day expensive to admit has taught the user to under-report, and every number downstream quietly becomes fiction.

The rule follows: the app may make a bad day **visible**, and must not make it **costly**.

## The line this draws

Visible is fine, and is most of the design. Costly is not.

| Visible — kept | Costly — refused |
| --- | --- |
| A red hairline marking *Target reached 19:04*, and marks past it drawn red | Zeroing Momentum on an over-Target day |
| The trend line running above the Target step line | Resetting the Ratchet, or pushing the Target back up |
| Momentum falling by one | Withholding the Ratchet's next Step as a sanction |
| The Quit Horizon lengthening on its own | Announcing that the Horizon moved |
| *Your largest hour is 21:00* | *Your 21:00 cluster is your largest, try X* |

## Considered options

- **Never punish an entry** (chosen). Over-Target is shown factually, costs one point of Momentum, and nothing else.
- **Zero Momentum on an over-Target day** — the streak model. Rejected: it makes one honest entry destroy weeks of accumulated standing, which is the largest single incentive to under-report the app could construct. This is why **Streak** was renamed **Momentum** in [#4](https://github.com/dbgeek/vape-off/issues/4): a consecutive count is by definition zeroed by a miss, and the name kept arguing for behaviour the design refuses.
- **Reset the Ratchet's window on a miss.** Rejected: the window already handles a miss correctly by not being satisfied. Discarding the Met days either side of it punishes the days that went well for the company they kept.
- **Escalating copy — nudges, warnings, encouragement to do better.** Rejected: the boundary is at the verb ([#8](https://github.com/dbgeek/vape-off/issues/8)). A reading of the record is information; an instruction is a judgement, and a judgement is a cost.

## Consequences

- **Absence must not be punished either, or the rule leaks.** If not logging is cheaper than logging badly, the incentive survives through the back door. So Momentum holds across Unknown Logical Days rather than decaying, the Quit Horizon is withdrawn rather than allowed to creep during a stall ([ADR 0002](./0002-the-quit-horizon-simulates-the-ratchet.md)), and the export nag keys off Known Logical Days since the last **Backup** rather than elapsed time ([#9](https://github.com/dbgeek/vape-off/issues/9)). Each of those is this rule applied to a different mechanism.
- **It reaches the container, not just the numbers.** Once history exists the app never blocks logging — the uninstalled user gets a permanent bar and logs normally, because refusing the entry would discard the Puff Sessions the whole Ratchet runs on ([ADR 0003](./0003-install-before-data.md)).
- **The one asymmetry is deliberate and holds exactly.** Restore *is* refused outright in a browser tab. Refusing to log discards Puff Sessions; refusing to restore discards nothing, the Backup file being safe on disk ([ADR 0007](./0007-the-first-run-is-a-greeting-not-a-fork.md)). The rule is about the record, not about friction.
- **It closed a hole at Target 0 that had nothing to do with over-Target days.** With no `0 → 1` raise available, honest logging during a relapse drained Momentum while simply not logging did not — a penalty on honesty produced by the *absence* of a mechanism rather than the presence of one. See [ADR 0006](./0006-the-ratchet-stops-at-target-1.md).
- **PUFF never changes.** Same position, same size, at every Target including 0. Shrinking or hedging the log button at the moment logging is hardest is this penalty in all but name.
- **Correcting the record is not a confession.** Backfilled days are first-class, a Clear Day declared early self-corrects when a Puff Session is written into it, and an edit that moves Momentum says so plainly rather than moving it silently. The design wants corrections, so corrections must be cheap.
