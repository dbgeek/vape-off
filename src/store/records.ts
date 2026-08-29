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
