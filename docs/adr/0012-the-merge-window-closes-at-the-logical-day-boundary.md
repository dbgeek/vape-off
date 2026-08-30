# The Merge Window closes at the Logical Day boundary

A tap within 90 seconds of the last one joins that **Puff Session** — unless the two fall on different **Logical Days**. A sitting that straddles 04:00 is two Puff Sessions, one on each side of the boundary.

The rule was never written down, and the code answered it twice, differently: the write tested the **Merge Window** against every Puff Session ever recorded, and the Track read-out tested it against the current Logical Day's only ([#59](https://github.com/dbgeek/vape-off/issues/59)). Both looked correct, because nothing said which was.

## Why the Window closes

Under the other reading, a tap at 04:00:30 joins the Puff Session opened at 03:59:30 and increments its count. That count belongs to a Logical Day that is now **completed** — one the **Ratchet** is already entitled to judge, inside the seven days it counts **Met** days from. So an ordinary tap, made in the ordinary way, silently changes what the record says about a finished day.

That is a **Correction**, and the glossary is explicit that a Correction is *"always deliberate and always the reader's — nothing corrects the record on its own."* Everywhere else the app honours this: a Correction is proposed, named, and shown its effect on **Momentum** before it is made. A Merge Window that reaches across 04:00 makes the app the author of one, with no proposal and nothing on screen — the mark lands on a day Track is not drawing, so the reader sees a button that says `PUFF`, taps it, and their record changes somewhere they cannot see.

[ADR 0008](./0008-the-logical-day-runs-0400-to-0400.md) also chose 04:00 precisely because almost nobody is awake and vaping then. The straddling sitting is the rarest case the Window has, so the reading that preserves it is buying fidelity in the case that matters least, at the price of a rule the design holds everywhere else.

## Considered options

- **The Window closes at the boundary** (chosen). A tap on the far side of 04:00 opens a new Puff Session on the new Logical Day. Both daily totals are correct, no completed day moves, and no puff is lost.
- **The Window ignores the Logical Day** — a pickup is a pickup, and one that began at 03:59 began yesterday. Genuinely the more faithful account of the physical event, and what the write already did. Rejected as above: it buys that fidelity with a silent Correction, and the glossary already rules that a Puff Session's timestamp records *when the pickup began*, not which day the puffs count against — those are separate questions, and only the second one is load-bearing.
- **Clamp the Window by arithmetic** rather than by comparing Logical Days — the Window runs `min(90s, time to the next 04:00)`. Rejected as the same decision wearing a disguise: "the next 04:00" is only meaningful in some time zone, so the ambiguity moves out of the signature and into the arithmetic, where it cannot be seen.
- **Leave it undecided and make the two callers agree by hand.** Rejected: they already disagreed once without either looking wrong, which is the argument for the rule living in one module rather than in a convention.

## Consequences

- **The population and the tie-break move inside the module.** `domain/merge-window.ts` exports one function, which is given every Puff Session the caller holds and returns the one a tap would join. The write and the read-out now make the same call, so they cannot drift again. The predicate underneath it is private: a caller that could compose it itself could also scope it wrongly.
- **The tie-break is the last tap, not the first.** Where more than one Puff Session is open, the tap joins the one whose Window was most recently pushed out — the sitting you are still in. The write already did this; the read-out did not, and the two would have disagreed the first time sessions overlapped.
- **A Logical Day key is compared, so a tap taken after crossing time zones may not merge.** A Puff Session carries the key computed in its own zone. Fly east between two taps seconds apart and the keys differ, so the second opens a new Puff Session. This fails safe — no puff is lost and both days total correctly — and matches the direction [ADR 0008](./0008-the-logical-day-runs-0400-to-0400.md) already takes on travel, where a stretch of negative length is treated as evidence of nothing.
- **The unconditional Clear Day delete in the write is now safe, and only because of this.** `logPuff` drops the **Clear Day** on the Logical Day it writes to without consulting the Correction rules. That was reachable across the boundary before — a tap after 04:00 could drop *yesterday's* Clear Day. It no longer is, because the Puff Session can no longer land there. The duplication of that rule across `corrections.ts`, `event-writes.ts`, `track-writes.ts` and `backup-file.ts` is left standing and should be consolidated on its own; whoever does so should not assume the boundary rule away.
