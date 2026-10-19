# Spacing scales your recent sitting, and the loop that makes is accepted

Spacing recommends when the next Puff Session is due and how many puffs it should hold. The size is your **habit** — the lower median count of your Puff Sessions across the 14 most recent Logical Days — scaled by `currentTarget ÷ Baseline Average` and floored. The habit is rolling. That makes a loop, and the loop is kept on purpose.

## The question it answers

Pace spreads what is left of the Target one puff at a time. No Puff Session in the record has ever been one puff: of 505 in the export of 2026-09-13 the minimum is 2, the median is 5, 251 are exactly 5 and 103 are exactly 10. So Pace's slots said nothing about the one decision a sitting actually involves, which is how many to take. Spacing is Pace counted in sittings, and the size of a sitting is the new quantity it needs.

## The loop

Scaling a rolling habit applies the scale to a number it has already shrunk. Hold the Target at 223 and log exactly what Spacing says:

| habit | size | sittings at 07:00 | interval |
| --- | --- | --- | --- |
| 5 | 4 | 56 | 17m |
| 4 | 3 | 75 | 12.8m |
| 3 | 2 | 112 | 8.6m — silent |
| 2 | 1 | 223 | silent |

About every 14 days the median catches up with the recommendation and the size steps down again, with the Target unchanged. At size 2 the interval is under Pace's ten-minute floor and Spacing goes silent. Drift back to your habit and the median climbs until it speaks again. Followed faithfully, it oscillates.

**It is accepted because of where it ends.** A second ratchet running on a schedule is what [ADR 0009](./0009-the-ratchet-is-adaptive-not-a-taper.md) forbids, and this would be one if it ended in pressure. It ends in silence instead: *silent rather than approximate* is the existing rule doing its job, and a reading that has gone quiet tightens nothing. The Target, Met, Momentum and the Ratchet never read Spacing, so the loop moves no figure the programme keeps.

## Considered options

- **A rolling 14-day habit** (chosen). The size answers to how you vape now, in the same window Kicks Marked uses. Its cost is the loop above.
- **The Baseline's median sitting, frozen when the Baseline closes**, as the Baseline Average is. Only the Ratchet would ever change the size, and there is no loop. Not chosen.
- **A floor of 2 on the size**, the smallest count the record has ever held. Rejected: it only moves the point at which the loop goes quiet, and adds a constant that would then be asked to be configurable.
- **Your habit, capped at what is left, with no scaling.** Honest, and it reads `5 puffs` almost every time, which tells you only what you already do. Not chosen.
- **The remainder divided by the sittings you usually have left at this hour.** Rejected: it recommends counts like 3 or 7 that the habit never produces.

## The line against #118

[#118](https://github.com/dbgeek/vape-off/issues/118) refused pre-filling the count control from what is left of the Target, because a suggested number placed where your thumb lands overturns a habit rather than correcting a near-miss. Spacing recommends a sitting *below* your habit, which is the same pressure. **It is acceptable only as printed text**: never pre-filled into the `…` sheet, never offered on the arc, never marking `+5` or `+10`. The line is the control, not the number.

## Consequences

- **It reads `4 puffs` today.** At the first Target the size is `floor(0.9 × habit)`, and a habit of 5 is 4.50. Floor, not `round`, so it never recommends more than the Ratchet's own proportion.
- **The divisor is the Baseline Average as frozen**, `firstStep.target ÷ 0.9`, not `baselineAverage()`. The function is recomputed — it moves with a Correction into the Baseline window and is 0 for seven Clear Days — while the first Step is what froze it. The recovered figure is within 0.56 puffs of the true average.
- **On the day's last sitting it prints what is left of the Target**, the first time the remainder appears on Track. Accepted on the same line: beside a duration, about the next Puff Session, never in a control.
- **It is a countdown**, `Next in 1h 20m`, where ghost slots were made ambient and the Current Gap has no seconds to avoid one. Minute resolution, rounded up, and at zero it reads `now` rather than going negative or leaving.
- **Pace is no longer drawn.** Track's ghost slots are Spacing's, one per sitting. Pace keeps its definition: its window, anchor and silences are Spacing's, and at a sitting of one puff the two are the same reading.
- **The loop is the first thing to look at** if Spacing ever reads as nagging. Freezing the habit to the Baseline's median is the change that removes it, and it is a one-line change to the rule.
