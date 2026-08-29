const MERGE_WINDOW_MS = 90 * 1000

export function isMergeWindowOpen(lastTapAt: string, at: Date): boolean {
  const elapsed = at.getTime() - Date.parse(lastTapAt)
  return elapsed >= 0 && elapsed <= MERGE_WINDOW_MS
}
