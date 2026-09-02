export type LogicalDayKey = string
export type Instant = string

export interface EventStamp {
  at: Instant
  logicalDay: LogicalDayKey
  tz: string
}

export interface PuffSession extends EventStamp {
  id: string
  lastTapAt: Instant
  count: number
  /**
   * The Kick, whole: presence is the mark and absence is Unknown, so there is no
   * `false` to hold — the app never asks whether a sitting delivered *nothing*
   * (ADR 0015). The instant is when you *said* so, which is minutes after the
   * Kick landed and is not derivable later.
   */
  kickMarkedAt?: Instant
}

export interface ResistedUrge extends EventStamp {
  id: string
}

export type ClearDay = EventStamp

export interface RatchetStep {
  id: string
  effectiveFrom: LogicalDayKey
  target: number
  kind: 'earned' | 'declared'
  at: Instant
}

export interface ExportRecord {
  id: string
  at: Instant
  logicalDay: LogicalDayKey
  restoredFrom?: string
}

export interface MetaRecord {
  key: string
  value: unknown
}
