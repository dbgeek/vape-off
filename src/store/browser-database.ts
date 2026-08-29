import { VapeOffDatabase } from './database.ts'

/** One connection owner shared by startup and every browser adapter. */
export const browserDatabase = new VapeOffDatabase()
