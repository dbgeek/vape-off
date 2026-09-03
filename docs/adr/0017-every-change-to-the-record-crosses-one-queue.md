# Every change to the record crosses one queue, in order

Track is one tap away from a write at all times, and the writes are not independent: a `PUFF` extends a Merge Window, a Kick lands on the Puff Session that window produced, a Correction re-times a session someone may be looking at, and a restore replaces the lot. Each answers with the whole record, and whichever answers last is what the screen shows.

So the order is the guarantee. Every change goes through `useLiveRecord`'s queue — one at a time, in the order it was made — and there is no second route.

## The failure that prompted it

The queue existed. What it did not have was a seam: it was a `useRef` inside `TrackScreen`, and the rule was a comment above it —

> One write at a time, in order.

`restoreFrom` was added later and went straight around it:

```tsx
const candidate = await prepareRestore(file)
if (candidate !== undefined && await completeRestore(candidate)) {
  setRecord(await source.load())   // not through writeQueue.current
```

A restore landing while a tap was still settling did exactly what the visibility refresh two hundred lines above had been carefully written to prevent — and the restore is the worst case, because it replaces the entire history rather than adding to it. A tap in flight either lands in a record about to be discarded, or lands after the replacement and writes a Puff Session into someone else's restored history.

Nobody ignored the rule. The rule was prose next to a ref, and the new code had no interface to go through.

## Considered options

- **One queue, reached only through the live record's own members** (chosen). The screen calls `logPuff`, `toggleKick`, `restore`; it holds no queue, no ref and no ordering concern, and there is no `setRecord` for a new write to reach for.
- **Keep the queue in the screen and remember to use it.** What we had. Rejected by the evidence: the one write added after the rule was written did not.
- **Serialise in the store instead**, below `TrackSource`. Tempting, and it would cover every caller. Rejected: the ordering that matters is *the screen's* — which answer wins the race to `setRecord` — and a store-level queue would still let two screen-level updates arrive out of order. It also puts a UI concern behind a seam that has no UI.
- **Drop the queue and let the last write win.** Rejected: taps are deliberately cheap and deliberately fast, and `screens.md` promises rapid taps are preserved. Last-write-wins loses a puff whenever two land together.

## Consequences

- **A restore is a member of the live record**, not something the screen arranges. It takes the caller's completion rather than a file, so the Backup module keeps owning what a Backup is and this one owns only when the replacement lands.
- **The screen cannot write to the record at all.** It has no `source` and no setter — only named actions. That is what makes the invariant structural rather than remembered.
- **A failed write is not a failed read.** They were one flag while both lived in the screen, so a tap that failed to save reported *"Track could not read your record."* The module names them separately and the screen words each.
- **The queue is one promise chain**, so an operation that throws must be caught inside it. A rejection escaping would wedge every write behind it for the life of the screen; the module's tests hold that line.
- **`pending` is the screen's only window onto the queue**, and it drives `aria-busy` and nothing else. A screen that could ask more would be a screen that could act on the answer.
