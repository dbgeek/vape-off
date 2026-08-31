# A lane is its marks, not its furniture

The `Lane` module draws one Logical Day's marks — fanned, placed, with their spokes — and nothing else. The Yesterday lane's head stays in `YesterdayLane`; the now-line, the unlived tone, the ghost slots, the Target hairline and the axis itself stay in `TrackScreen`. So the two lanes are folded into one module and *still* do not look alike: yesterday is a `<div>` you can point at, the live lane is a set of siblings hanging on `--spine`.

Recorded because that asymmetry reads as an oversight, and the obvious tidy-up — give the live lane a container too, so `Lane` owns everything in a lane — is wrong for two reasons that are invisible from the TypeScript.

## The Yesterday lane is a container because it needs to be

`.yesterday-lane` carries `opacity: 0.42` and `pointer-events: none`. Both are properties of the *lane*, not of its contents: the lane is uniformly dim top to bottom because all of yesterday happened, and one number is what keeps it uniform; read-only is a fact about the lane rather than a habit each mark has to remember. Neither can be expressed without an element to hang it on.

The live lane has no equivalent. Its unlived tone is a separate overlay painted from `now` downward, not a property of the lane, and it must be tappable. There is nothing for a container to carry.

## The live lane's contents interleave with things that are not marks

Inside `.timeline`, the live lane layers by `z-index` against elements that would stay outside any container it was given:

| | `z-index` |
| --- | --- |
| `.timeline-unlived` | 0 |
| `.now-line` | 1 |
| `.fan-spoke`, `.target-reached` | 3 |
| `.puff-mark`, `.resisted-mark`, `.pace-slot` | 4 |

The last row is one rule. A Puff Session's mark and a Pace ghost slot are deliberately co-layered — they sit on the same spine at the same depth, and the fan is what keeps them apart horizontally. A container around the marks would put them in a new stacking context and the ghost slots in the old one, and no `z-index` restores an interleaving once the two sets are in different contexts.

The Yesterday lane does not have this problem, and it is instructive *why*: its `opacity` already forms a stacking context, so it layers by document order instead — "drawn first, stays under the axis labels and the whole of the live lane". The two lanes use opposite mechanisms, and each is correct for a lane shaped the way that one is. **Yesterday layers by being a container; the live lane layers by not being one.**

## Considered options

- **`Lane` draws the marks only** (chosen). It is exactly the part that was duplicated. The seven-step protocol — room, events, fan, index, place, spoke — was written out at both call sites; the furniture was written out at one.
- **`Lane` also draws each lane's spine.** Tempting, and only one line at each site. Rejected: it needs the container, so it buys the smaller half of the fold at the cost of the whole hazard above.
- **`Lane` is the whole lane, furniture included.** Rejected on depth as well as on CSS. `screens.md` guarantees the Yesterday lane gets no Target hairline, no red, no `now` and no ghost slots — *ever*, and for stated reasons: the hairline is horizontal, so yesterday's would be a second one at a different height, and after a Ratchet Step it would be a different number on one axis. So four more props, permanently unused by one of the module's two instances. Interface grows, shared behaviour does not; that is the definition of the shallow direction.

## Consequences

- **`TrackScreen` keeps the timeline's furniture, and that is not debt.** A future reader who notices the live lane has no element of its own has found this ADR's subject, not a loose end.
- **The stylesheet stays split per lane.** `.puff-mark`/`.yesterday-mark`, `.resisted-mark`/`.yesterday-ring`, `.fan-spoke`/`.yesterday-spoke` remain six rules. They differ in dimness, cursor, tap affordance and layering, so folding them to one concept plus a lane modifier is a separate change with its own argument to make — but note that if it is ever made, the `z-index` table above is the constraint it has to satisfy.
- **A third lane is still not available**, and this ADR does not make it more so. `LaneAxis` is a type rather than a closed union because the point is to keep one lane's facts together, not to police how many there are; the ban on a third Logical Day on Track is `screens.md`'s and stands on its own.
- **`renderMark` is load-bearing, not a convenience.** It is what keeps *read-only, hard* structural: `Lane` never decides that a mark is tappable, so a lane with no source cannot acquire a handle. Switching on the axis inside the module to draw a `button` for one lane and a `span` for the other would reintroduce, in TypeScript, exactly the guarantee that `pointer-events: none` is making in CSS — in a place where it could be got wrong.
