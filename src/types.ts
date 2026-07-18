// Domain model for the knitting app.

/** A reference to a file (image / pdf) stored as a blob in IndexedDB. */
export interface FileRef {
  id: string
  name: string
  type: string // MIME type
}

/** A knitting pattern in the library. */
export interface Pattern {
  id: string
  name: string
  author: string
  /** Garment category, e.g. "Pull", "Chaussettes", "Bonnet". */
  category: string
  file: FileRef | null
  createdAt: number
}

/**
 * A yarn entry in the stash. One entry = one brand/name in one colorway + dye lot.
 * The same base yarn (brand..blend) can be duplicated into several colorways.
 */
export interface Yarn {
  id: string
  brand: string
  name: string
  metersPerSkein: number
  gramsPerSkein: number
  /** Grams currently available in the stash (auto-adjusted by project allocations). */
  gramsInStash: number
  /** Fiber composition, free text e.g. "80% laine, 20% nylon". */
  blend: string
  color: string
  dyeLot: string
  photo: FileRef | null
  createdAt: number
}

/** A yarn allocated to a project, with grams currently reserved/used. */
export interface YarnAllocation {
  yarnId: string
  gramsUsed: number
}

/** A knitting project. */
export interface Project {
  id: string
  name: string
  patternId: string | null
  size: string
  /** Stitches per 10cm. */
  gauge: number | null
  /** Needle size in mm (1–10). */
  needleSize: number | null
  startDate: string | null // ISO date
  endDate: string | null // ISO date — set when project is finished
  yarns: YarnAllocation[]
  notes: string
  photos: FileRef[]
  createdAt: number
}
