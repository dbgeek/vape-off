# The first run is a greeting, not a fork

The first screen the app ever shows is **Track**, empty, with a dismissible card over it. The card explains that the first week only measures, and offers *Restore from a backup* to anyone who has used vape-off before. There is no *Start fresh* control, because there is nothing for it to do.

This reverses the position the map held while charting, which was that first run must offer *Start fresh* and *Restore from a backup* **with equal weight**, on the grounds that the app cannot tell a genuine first run from a storage wipe and must not steer a returning user into destroying their history. The premise is sound. The conclusion does not follow, because **the choice was never destructive**.

There are three ways the app can find an empty store, and *Start fresh* destroys nothing in any of them:

- **A genuine first run.** There is nothing to destroy.
- **A storage wipe.** The data is already gone. Nothing that survived the wipe is at risk from what the user taps next.
- **A duplicate Home Screen icon.** Two installs of the same URL keep separate stores, measured on-device in [#12](https://github.com/dbgeek/vape-off/issues/12). The history is intact behind the other icon, in a store this one cannot reach and therefore cannot harm.

And the tap is reversible on top of that: [ADR 0004](./0004-a-backup-replaces-and-never-merges.md) keeps restore permanently reachable, and a restore **replaces**, so a user who logs for a week before remembering their Backup loses that week's throwaway records and nothing else.

So the screen is low-stakes, and the design that follows from believing it high-stakes — a full-screen fork, two weighted options, careful hedging about which case the user might be in — spends the first impression of every new user on a danger that is not there. Worse, it asks that user to choose between "start" and "restore something you have never had", which is a question about the app's storage model dressed up as a question about them.

## Considered options

- **A card over Track** (chosen). The app opens straight into the logging screen; PUFF is live from the first second; the card carries the Baseline explanation and the restore door and disappears on the first write.
- **The equal-weight fork**, as charted. Rejected once the non-destructiveness argument landed: equal weight is a way of saying *this choice matters and we cannot help you make it*, which is false here and alarming to the majority.
- **A greeting screen with a "Continue" button.** Rejected as the same ceremony relocated: the button is still the no-op, and it puts two gates in a row behind [ADR 0003](./0003-install-before-data.md)'s install wall.
- **No first-run surface at all**, with restore living only in settings. Rejected in the other direction. It is the wiped and duplicate-icon users who need the exit and are least likely to hunt for it, and the moment of confusion is when the app opens empty, not later.

## Consequences

- **The greeting is silent about why the store is empty; the restore door carries the whole account.** The card's hook is *"Used vape-off before?"*, which self-selects the rare user without telling the common one that something is wrong. Behind it sits the explanation the app cannot put on a greeting: that the history may be in a Backup file, and that it may instead be **behind a second icon** — check the Home Screen and App Library, open it, export from there, come back. That puts the duplicate-icon advice in front of exactly the population it is true for, and it is the only advice the app can give that recovers data it cannot see.
- **Restore is refused entirely while running in a tab** — on the card and in settings alike — pointing at the install bar instead. This is [ADR 0003](./0003-install-before-data.md)'s *install before restore* made airtight: without it, the wall's "Continue anyway" escape leads to a card whose restore door writes an irreplaceable archive onto a seven-day fuse. The asymmetry with *logging is never punished* holds exactly rather than being an exception to it: **refusing to log discards Puff Sessions, refusing to restore discards nothing** — the Backup file is safe on disk and the user loses only the time it takes to install.
- **The card is dismissed by the first write or by tapping the ×, whichever comes first, and never returns.** Dismissal is stored in the `meta` store from [#14](https://github.com/dbgeek/vape-off/issues/14) rather than held in memory, or a cold start would bring it back and turn a one-time greeting into a nag. A completed restore also marks it dismissed.
- **The card is where the Baseline is explained.** Nothing else tells a new user why there is no Target: [#6](https://github.com/dbgeek/vape-off/issues/6) has Track simply drop the ghost slots, and [#8](https://github.com/dbgeek/vape-off/issues/8) put the *N of 7 Known Logical Days* account in Stats, a screen no one opens on day one. The card says it once, at the only moment it is news, which is what earns it a place in front of the common user at all.
- **The replace-confirmation appears whenever there is something to replace, and so not on first run.** [ADR 0004](./0004-a-backup-replaces-and-never-merges.md) puts restore behind a confirmation naming the counts on both sides; on an empty store that dialog asks the user to confirm destroying zero records, which trains them to tap through the one dialog that will later matter. This is the general rule applied, not an exception carved for first run.
- **"Start fresh" is retired as a term.** It named the no-op half of a fork that no longer exists, and a term for *the thing that happens if you do nothing* invites someone to rebuild the button. It never reached `CONTEXT.md`, which in hindsight was the model saying so.
- **Nothing here reaches the glossary.** The card, the install check and the tab refusal are platform, not domain — the same grounds on which [#10](https://github.com/dbgeek/vape-off/issues/10) and [#14](https://github.com/dbgeek/vape-off/issues/14) declined a glossary entry.
- **A fourth cause of an empty store is unmeasured.** Whether deleting a Home Screen icon and re-adding it destroys the store is unknown; [#12](https://github.com/dbgeek/vape-off/issues/12) measured only concurrent icons. It bears on the *check for a second icon* advice, which would point at an icon that no longer exists. The copy above does not depend on the answer, and the probe is folded into [#24](https://github.com/dbgeek/vape-off/issues/24).
