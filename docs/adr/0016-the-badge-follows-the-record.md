# The badge follows the record, and nothing else maintains it

The icon badge shows what is left of today's Target. It is a projection of the record and holds nothing of its own, so the only question worth settling is *when* it is recomputed — and the answer is: whenever the record is read, by the module that read it.

`StoreSession.readRecord` refreshes the badge itself. There is no separate refresh to call, because a refresh a caller can call is one a caller can forget.

## The failure that prompted it

The session's own doc comment already claimed the badge followed a read. It did not. Track refreshed it and Stats refreshed it; Backup did neither, and neither `restore` nor `recover` touched it at all. So restoring a Backup — replacing the whole history, and every derived figure with it — left yesterday's number on the icon until the reader happened to open Track or Stats.

That is the worst moment for the badge to be wrong. A restore is usually the first thing that happens on a new device, and the icon is the only surface the app has when it is not open.

The cause was not that anyone was careless. It was that refreshing the badge was a **separate step beside the read** rather than part of it, so getting it right meant remembering it at eleven call sites, and Backup's two were simply never written.

## Considered options

- **A read refreshes the badge** (chosen). One member, no order to get right, and the invariant holds for every caller that exists and every caller that will. The cost is that a caller wanting the record without touching the badge no longer has a way to ask — and no caller wants that.
- **Each slice refreshes its own badge.** What the code did. Rejected by the evidence: three slices, two of them remembered, and the one that forgot was the one where it mattered most.
- **Refresh on write only.** Cheaper — writes are rarer than reads. Rejected: a cold start that writes nothing would show the previous day's count until the first tap, and the Logical Day rolls over at 04:00 without anyone writing anything.
- **A separate `refreshBadge` retained beside the read**, for callers that want it. Rejected: it is the shape that failed, and keeping it available keeps the failure available.

## Consequences

- **`refreshBadge` and `ensureOpen` are both off `StoreSession`.** They were the two members that asked a caller to remember an order; the session now opens for itself and badges for itself, and the interface is smaller for losing them.
- **The Backup slice badges now**, on `load`, `restore` and `recover`. `restore` and `recover` go through `session.write`, which reads the record back the way every write does.
- **Reading is still not deciding.** `readRecord` refreshes the badge but does **not** evaluate the Ratchet, because the Backup's read must not: evaluating mid-export could write a Ratchet Step into the very file being handed off. Evaluation stays an explicit call, and every *write* makes it.
- **A badge that refuses still never fails the read behind it.** Badging is a best-effort browser affordance; that was true when it was its own member and stays true inside the read.
- **A future slice gets this for free**, which is the point. It cannot read the record without leaving the badge agreeing with what it read.
