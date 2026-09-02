# An Unknown earns a control only where it costs

The app offers a control for resolving an Unknown **only where leaving it Unknown costs the user something**. Where the Unknown is free, no control is offered and the Unknown stands.

This records a tie-breaker, not a rule about Unknowns. [ADR 0001](./0001-unlogged-days-are-unknown-not-zero.md) treats an absence of evidence as Unknown and then *builds a control for it* — the `Clear Day` — while [ADR 0010](./0010-logging-is-never-punished.md) refuses anything that taxes an honest entry. Applied to the `Kick` those two point in opposite directions, and what breaks the tie is written in neither.

## The two instances, and why they go opposite ways

**An Unknown Logical Day is costly.** It is never Met, so a run of them stalls the Ratchet, and the user needs a route out that does not involve inventing Puff Sessions. Hence `Clear Day` — and [ADR 0001](./0001-unlogged-days-are-unknown-not-zero.md)'s Consequences say so in as many words: *"A day with genuinely no puffs — the best day available — is invisible unless declared. That is what the Clear Day mark is for."*

**An unmarked Puff Session is free.** A `Kick` touches no mechanism — not `Target`, not `Met`, not `Momentum`, not the `Ratchet`, not `Pace` — so leaving a session unmarked costs the user nothing whatsoever. Hence no control: only Kicks are marked, and absence means *you didn't say* ([#88](https://github.com/dbgeek/vape-off/issues/88), [#91](https://github.com/dbgeek/vape-off/issues/91)).

Same rule, opposite outcomes. **The cost is the only variable.**

## Why the free case is actively refused rather than merely skipped

A *no Kick* control is a second decision on every log. That is precisely the tax [ADR 0010](./0010-logging-is-never-punished.md) exists to prevent: it does not discourage vaping, it discourages *recording* it, and it does so on every single entry rather than only the bad ones.

## What this does **not** claim

**It does not claim that Unknowns should be left alone.** `Clear Day` is the counterexample, it is correct, and it is required — at Target 0 it is the only way to be Met. The rule is a **test**, not an answer: a future Unknown that genuinely costs the user earns its control *by* this rule rather than despite it. Read without this paragraph, `0015` deletes the `Clear Day` and breaks the end of the programme.

## Consequences

- **A reading over optional marks is a floor, never a rate.** Refusing the control is exactly what makes the honest denominator — *sessions you answered about* — unavailable by construction. So `Kicks Marked` is a bare count and can never become a rate, and **the app never says what fraction of vaping delivers**. It does not have the evidence for it. Same shape as `Longest Gap`, which is a floor on your best run rather than a measure of it.
- **The floor has to be written down somewhere, and the glossary is where.** With no on-screen caveat, `CONTEXT.md`'s `Kicks Marked` entry is the only place the app says what kind of number it is.
- **How it breaks, in one line: add a *no Kick* button.** It looks strictly more informative, it is locally correct, and it silently converts the floor into a rate while taxing every log. Neither consequence is visible at the call site.

## A stated limitation

This generalises from **two** instances. It earns its place on the **conflict** between them — two existing ADRs pointing opposite ways with no tie-breaker on record — rather than on the weight of a pattern. A third instance tests the rule rather than merely confirming it.
