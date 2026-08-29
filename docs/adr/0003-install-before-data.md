# The app teaches install before it accepts data

vape-off is a Home Screen web app or it is nothing. Run in a Safari tab, the Puff Session log it exists to accumulate sits on WebKit's seven-day cap on script-writable storage, which names IndexedDB explicitly; installed to the Home Screen, the same origin is exempt by name and isolated from Safari entirely. That is not a difference in polish. It is the difference between a record that survives a fortnight's holiday and one that does not.

So the app treats installation as a precondition rather than a preference, and it spends its very first screen on it. A first run in a browser tab opens full-screen on the Share-sheet instruction, before any Puff Session can be written and before *Restore from a backup* is offered at all.

The order is the whole point. Restoring a year of history into a tab writes the entire irreplaceable archive into a store on a seven-day fuse — the worst outcome the app can produce, reached by the user doing exactly the responsible thing.

## Considered options

- **Teach install first, then let the user through** (chosen). A full-screen instruction on first run in a tab, carrying a small, honest escape. Once history exists, never block again: log normally under a permanent bar.
- **Refuse to log until installed.** The strictest reading, and the one the storage facts appear to argue for. Rejected: it makes the app punish the user for a state they did not know they were in, and it does so by discarding the Puff Sessions the entire Ratchet runs on. An app that would rather lose the data than store it imperfectly has misread which of the two it is protecting.
- **Warn once and trust the user.** Rejected in the other direction: a dismissed warning is indistinguishable from no warning a month later, and the failure it guards against is silent, total, and arrives during an absence — precisely when no one is around to re-read the warning.
- **Detect the wipe instead of preventing it,** with a server-set cookie as the canary. Genuinely the only reliable detector, and ruled out of scope on the map: it costs the local-only premise for a diagnosis after the fact, where installation is a one-tap cure.

## Consequences

- **The escape hatch is deliberately small but real.** "Continue anyway" is present on the first-run wall, because a hard block on a personal tool is a tool that cannot be tried. It is the only way past, and taking it lands the user directly in the permanently-barred state — *logging*, not restoring. **Restore stays refused for as long as the app is in a tab**, on the card and in settings alike; see [ADR 0007](./0007-the-first-run-is-a-greeting-not-a-fork.md). Without that, the escape hatch reopens the exact hole this ADR exists to close, since the user who takes it can then write an irreplaceable archive onto the seven-day fuse.
- **The posture inverts once data exists.** Before there is anything to lose, the app blocks; after, it never does. Blocking a user with three months of history would destroy the evidence the Ratchet runs on in the name of protecting it, which is the same trade rejected above, made worse by timing. This is *logging is never punished* applied to the container: see [ADR 0001](./0001-unlogged-days-are-unknown-not-zero.md).
- **Installation state drives more than this screen.** It is the input to the export nag's aggressiveness, since the two populations differ by orders of magnitude in risk. Read it from `display-mode: standalone` and the legacy `navigator.standalone`, either being sufficient; `navigator.storage.persisted()` is a corroborating diagnostic and explicitly **not** the safety mechanism — WebKit grants persistence on the basis of Home Screen installation anyway, and the change that would have let it override the seven-day cap was closed unmerged in July 2025.
- **A permanent bar costs screen space on the one screen that cannot spare it.** The logging screen is a vertical timeline where position *is* time, so a bar pinned above it is not free furniture.
- **iOS never fires `beforeinstallprompt`,** so there is no one-tap install to offer and no way to know the user complied. The instruction is a picture of the Share glyph and a sentence, and the app learns it worked only by later finding itself standalone.
- **Nothing here detects a wipe, and nothing here claims to.** WebKit evicts an origin whole, so no same-origin marker outlives the data it vouches for. This ADR reduces how often the ambiguous first run happens; it does not resolve it.

---

**Amended by [ADR 0007](./0007-the-first-run-is-a-greeting-not-a-fork.md).** The *Start fresh / Restore from a backup* choice this ADR referred to no longer exists: first run offers only restore, because *Start fresh* was a no-op in all three cases that produce an empty store. The install-before-restore ordering is unchanged and strengthened — restore is now refused outright in a tab rather than merely sequenced behind the wall.
