/**
 * The fan: what the Track timeline does when two marks land on the same spot
 * (`screens.md` § When marks collide — the fan).
 *
 * Under `timelinePosition`'s uniform 24-hour axis a 20px mark covers roughly 55
 * minutes, so **collision is a property of the hour, not of a pair of Puff
 * Sessions** — on a busy evening every mark touches something at any plausible
 * size. The fan is the normal case, and no mark size escapes it.
 *
 * The answer is sideways. Vertical position stays exactly time: nothing here
 * moves an event through time and nothing merges two events into one, because a
 * timeline owes its one axis the truth and a merged run would be a domain object
 * whose membership depends on pixel density rather than on the record. This
 * module only ever says how far **right of its lane's spine** an event is drawn.
 *
 * A pure function of the events and the room the lane has. It reads no clock and
 * no record, and it renders nothing.
 */

/** An event the lane has to place: the height it hangs at, and how big it is drawn. */
export interface FannedEvent {
  /** Its height as a percentage of the timeline — `timelinePosition`'s answer. */
  top: number
  /** Its drawn diameter in px: `markSize` for a Puff Session, the ring for a Resisted Urge. */
  size: number
}

/** The room a lane has to fan into, in px. */
export interface Lane {
  /** The timeline's drawn height, which is what turns a percentage into a distance. */
  height: number
  /** How far right of the spine the lane may reach before it meets the next one. */
  width: number
  /**
   * How far down the top of the lane its head reaches, in px — zero, or absent,
   * for a lane with no head.
   *
   * The Yesterday lane carries one, the live lane carries none (`screens.md` §
   * The Yesterday lane), and it is the *drawn* height rather than a number
   * written down twice: the head is a word, and a `Clear` token beneath it when
   * yesterday was declared Clear, so how far it reaches depends on which of the
   * four states yesterday is in and on how large the reader has set their text.
   */
  head?: number
}

/**
 * The breathing room between two marks sharing a column, and the margin the
 * column step adds to the group's widest mark. One number for both because they
 * are the same question asked on the two axes: how close is touching.
 */
const MARK_GAP = 4

/** An event with its height resolved to pixels, which is where collision is decided. */
interface Placed {
  index: number
  y: number
  size: number
}

/** Whether two events are far enough apart to share a column without touching. */
function clears(one: Placed, other: Placed): boolean {
  return Math.abs(one.y - other.y) >= (one.size + other.size) / 2 + MARK_GAP
}

/**
 * Consecutive events that touch, as maximal runs in time order.
 *
 * A group is a **transitive chain**, not a clique: on the evening screen the
 * first and fourth mark of a group never touch each other. That is what makes
 * the fan cheap, and it is also why the column step below is group-local.
 */
function collisionGroups(events: readonly Placed[]): Placed[][] {
  const groups: Placed[][] = []
  for (const event of events) {
    const previous = groups.at(-1)?.at(-1)
    if (previous !== undefined && !clears(previous, event)) {
      groups.at(-1)!.push(event)
    } else {
      groups.push([event])
    }
  }
  return groups
}

/**
 * How many columns the lane affords at this step — at least one, because the
 * spine itself is a column and an event is never drawn outside its lane.
 *
 * The outermost column has to keep its whole circle inside the lane, and the
 * widest circle a column can carry is the group's widest mark, which is the
 * step less its margin.
 */
function columnsAfforded(lane: Lane, step: number): number {
  const widest = step - MARK_GAP
  return Math.max(1, Math.floor((lane.width - widest / 2) / step) + 1)
}

/**
 * Whether an event is drawn far enough down the lane to take the spine's own
 * column, the head standing where it does.
 *
 * The head sits *left* of the spine, so it is the spine's column alone it takes
 * — a fanned column starts a whole step out and never reaches back past the
 * spine. But a mark on the spine is **centred** on it, so it reaches half its
 * own width back into the head's strip: 22px at the widest tier, against the
 * few px of clearance the head leaves itself. The answer is the fan's usual
 * one — the mark takes the next column out and hangs off the axis on its spoke
 * — and it costs the lane one column for as long as the head reaches, which at
 * the timeline's floor is the first hour or two of the Logical Day.
 */
function clearsHead(event: Placed, lane: Lane): boolean {
  return event.y - event.size / 2 >= (lane.head ?? 0) + MARK_GAP
}

/**
 * How far right of the lane's spine each event is drawn, in px, in the order the
 * events were given.
 *
 * Each event takes **the leftmost column free at its own height**, in time
 * order. Colouring into the leftmost free column — rather than stepping every
 * member of a group sideways — is what collapses the evening screen from one
 * column per mark to about three: the group is a chain, so a column a mark has
 * left behind is free again a little further down.
 *
 * **The column step is the widest mark in that group plus `MARK_GAP`, group-local
 * rather than uniform.** A global step would spend the widest tier's 44px on
 * every column everywhere, and the timeline's 224px floor was derived against the
 * group-local one. The cost, named: columns do not line up into a visible grid
 * down the timeline.
 *
 * **When a clique is deeper than its lane affords, the outermost column takes the
 * remainder and those marks overlap.** Clipping would delete a Puff Session from
 * the picture; overlapping keeps it visible and reachable, and the mark is the
 * handle for correcting a mis-tap.
 */
export function fanOffsets(events: readonly FannedEvent[], lane: Lane): number[] {
  const inTimeOrder: Placed[] = events
    .map((event, index) => ({
      index,
      y: (event.top / 100) * lane.height,
      size: event.size,
    }))
    .sort((one, other) => one.y - other.y)

  const offsets = new Array<number>(events.length).fill(0)

  for (const group of collisionGroups(inTimeOrder)) {
    const step = Math.max(...group.map((event) => event.size)) + MARK_GAP
    const afforded = columnsAfforded(lane, step)
    const columns: Placed[][] = []

    for (const event of group) {
      // The head takes the spine's column from the events inside its reach, and
      // from nothing else: this is a floor on where an event may start, not a
      // column reserved down the length of the lane. A lane with room for one
      // column has none to give, and there the mark keeps the spine and the
      // head is drawn over — the same degradation the outermost column makes,
      // and for the same reason: a mark is never drawn outside its lane.
      const first = clearsHead(event, lane) ? 0 : Math.min(1, afforded - 1)
      let column = columns.findIndex(
        (occupants, index) =>
          index >= first && occupants.every((placed) => clears(event, placed)),
      )
      if (column === -1) {
        column = columns.length < afforded ? Math.max(first, columns.length) : afforded - 1
        while (columns.length <= column) columns.push([])
      }
      columns[column]!.push(event)
      offsets[event.index] = column * step
    }
  }

  return offsets
}
