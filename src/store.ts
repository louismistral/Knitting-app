import { create } from 'zustand'
import type { Pattern, Project, Yarn, FileRef } from './types'
import { supabase } from './supabase'
import { removeFile } from './files'

// ---- Custom tags (categories / authors / brands) ----
// These universes are seeded from existing rows, plus any custom tags the user
// created that aren't attached to anything yet. The custom part is persisted
// locally so freshly-created (still unused) tags survive a reload.

export type TagKind = 'patternCategory' | 'patternAuthor' | 'yarnBrand'

export interface CustomTags {
  patternCategory: string[]
  patternAuthor: string[]
  yarnBrand: string[]
}

const TAGS_KEY = 'maille.customTags'

function loadCustomTags(): CustomTags {
  const empty: CustomTags = { patternCategory: [], patternAuthor: [], yarnBrand: [] }
  try {
    const raw = JSON.parse(localStorage.getItem(TAGS_KEY) ?? '{}')
    return {
      patternCategory: Array.isArray(raw.patternCategory) ? raw.patternCategory : [],
      patternAuthor: Array.isArray(raw.patternAuthor) ? raw.patternAuthor : [],
      yarnBrand: Array.isArray(raw.yarnBrand) ? raw.yarnBrand : [],
    }
  } catch {
    return empty
  }
}

function persistCustomTags(t: CustomTags) {
  try {
    localStorage.setItem(TAGS_KEY, JSON.stringify(t))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v.trim() !== ''))).sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' }),
  )
}

// ---- Row <-> model mapping ----

interface PatternRow {
  id: string
  name: string
  author: string
  category: string
  file_path: string | null
  file_name: string | null
  file_type: string | null
  created_at: string
}
interface YarnRow {
  id: string
  brand: string
  name: string
  meters_per_skein: number
  grams_per_skein: number
  grams_in_stash: number
  blend: string
  color: string
  dye_lot: string
  photo_path: string | null
  photo_name: string | null
  photo_type: string | null
  created_at: string
}
interface ProjectRow {
  id: string
  name: string
  pattern_id: string | null
  size: string
  gauge: number | null
  needle_size: number | null
  start_date: string | null
  end_date: string | null
  notes: string
  created_at: string
  project_yarns: { yarn_id: string; grams_used: number }[]
  project_photos: { id: string; path: string; name: string; type: string }[]
}

function toPattern(r: PatternRow): Pattern {
  return {
    id: r.id,
    name: r.name,
    author: r.author,
    category: r.category,
    file: r.file_path
      ? { bucket: 'patterns', path: r.file_path, name: r.file_name ?? '', type: r.file_type ?? '' }
      : null,
    createdAt: Date.parse(r.created_at),
  }
}
function toYarn(r: YarnRow): Yarn {
  return {
    id: r.id,
    brand: r.brand,
    name: r.name,
    metersPerSkein: Number(r.meters_per_skein),
    gramsPerSkein: Number(r.grams_per_skein),
    gramsInStash: Number(r.grams_in_stash),
    blend: r.blend,
    color: r.color,
    dyeLot: r.dye_lot,
    photo: r.photo_path
      ? { bucket: 'photos', path: r.photo_path, name: r.photo_name ?? '', type: r.photo_type ?? '' }
      : null,
    createdAt: Date.parse(r.created_at),
  }
}
function toProject(r: ProjectRow): Project {
  // Merge any duplicate allocations that reference the same yarn (sum their grams).
  const mergedYarns = new Map<string, number>()
  for (const a of r.project_yarns ?? []) {
    mergedYarns.set(a.yarn_id, (mergedYarns.get(a.yarn_id) ?? 0) + Number(a.grams_used))
  }
  return {
    id: r.id,
    name: r.name,
    patternId: r.pattern_id,
    size: r.size,
    gauge: r.gauge === null ? null : Number(r.gauge),
    needleSize: r.needle_size === null ? null : Number(r.needle_size),
    startDate: r.start_date,
    endDate: r.end_date,
    notes: r.notes,
    yarns: [...mergedYarns].map(([yarnId, gramsUsed]) => ({ yarnId, gramsUsed })),
    photos: (r.project_photos ?? []).map((p) => ({
      bucket: 'photos' as const,
      path: p.path,
      name: p.name,
      type: p.type,
    })),
    createdAt: Date.parse(r.created_at),
  }
}

interface State {
  loaded: boolean
  patterns: Pattern[]
  yarns: Yarn[]
  projects: Project[]
  customTags: CustomTags

  load: () => Promise<void>
  reset: () => void

  // Managed tag universes (category / author / brand).
  addTag: (kind: TagKind, value: string) => void
  deleteTag: (kind: TagKind, value: string) => Promise<void>

  addPattern: (p: { name: string; author: string; category: string; file: FileRef | null }) => Promise<void>
  updatePattern: (
    id: string,
    patch: Partial<{ name: string; author: string; category: string; file: FileRef | null }>,
  ) => Promise<void>
  deletePattern: (id: string) => Promise<void>

  addYarn: (y: Omit<Yarn, 'id' | 'createdAt'>) => Promise<void>
  updateYarn: (id: string, patch: Partial<Omit<Yarn, 'id' | 'createdAt'>>) => Promise<void>
  deleteYarn: (id: string) => Promise<void>

  addProject: (name: string) => Promise<string>
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  finishProject: (id: string) => Promise<void>
  reopenProject: (id: string) => Promise<void>

  setAllocation: (projectId: string, yarnId: string, gramsUsed: number) => Promise<void>
  removeAllocation: (projectId: string, yarnId: string) => Promise<void>
  addProjectPhotos: (projectId: string, refs: FileRef[]) => Promise<void>
  removeProjectPhoto: (projectId: string, ref: FileRef) => Promise<void>
}

export const useStore = create<State>()((set, get) => ({
  loaded: false,
  patterns: [],
  yarns: [],
  projects: [],
  customTags: loadCustomTags(),

  load: async () => {
    const [pats, yrns, projs] = await Promise.all([
      supabase.from('patterns').select('*').order('created_at', { ascending: false }),
      supabase.from('yarns').select('*').order('created_at', { ascending: false }),
      supabase
        .from('projects')
        .select('*, project_yarns(*), project_photos(*)')
        .order('created_at', { ascending: false }),
    ])
    set({
      patterns: (pats.data ?? []).map(toPattern),
      yarns: (yrns.data ?? []).map(toYarn),
      projects: (projs.data ?? []).map(toProject),
      loaded: true,
    })
  },

  reset: () => set({ patterns: [], yarns: [], projects: [], loaded: false }),

  addTag: (kind, value) => {
    const v = value.trim()
    if (!v) return
    set((s) => {
      if (s.customTags[kind].some((t) => t.toLowerCase() === v.toLowerCase())) return s
      const customTags = { ...s.customTags, [kind]: [...s.customTags[kind], v] }
      persistCustomTags(customTags)
      return { customTags }
    })
  },
  deleteTag: async (kind, value) => {
    const v = value.trim()
    if (!v) return
    const eq = (a: string) => a.trim().toLowerCase() === v.toLowerCase()

    // Detach the tag from every entity that still uses it.
    if (kind === 'patternCategory') {
      for (const p of get().patterns.filter((x) => eq(x.category))) {
        await get().updatePattern(p.id, { category: '' })
      }
    } else if (kind === 'patternAuthor') {
      for (const p of get().patterns.filter((x) => eq(x.author))) {
        await get().updatePattern(p.id, { author: '' })
      }
    } else if (kind === 'yarnBrand') {
      for (const y of get().yarns.filter((x) => eq(x.brand))) {
        await get().updateYarn(y.id, { brand: '' })
      }
    }

    set((s) => {
      const customTags = {
        ...s.customTags,
        [kind]: s.customTags[kind].filter((t) => !eq(t)),
      }
      persistCustomTags(customTags)
      return { customTags }
    })
  },

  addPattern: async (p) => {
    const { data } = await supabase
      .from('patterns')
      .insert({
        name: p.name,
        author: p.author,
        category: p.category,
        file_path: p.file?.path ?? null,
        file_name: p.file?.name ?? null,
        file_type: p.file?.type ?? null,
      })
      .select('*')
      .single()
    if (data) set((s) => ({ patterns: [toPattern(data), ...s.patterns] }))
  },
  updatePattern: async (id, patch) => {
    const current = get().patterns.find((x) => x.id === id)
    // If the pattern file is being replaced/removed, clean up the old one.
    if ('file' in patch && current?.file && current.file.path !== patch.file?.path) {
      await removeFile(current.file)
    }
    const cols: Record<string, unknown> = {}
    if (patch.name !== undefined) cols.name = patch.name
    if (patch.author !== undefined) cols.author = patch.author
    if (patch.category !== undefined) cols.category = patch.category
    if ('file' in patch) {
      cols.file_path = patch.file?.path ?? null
      cols.file_name = patch.file?.name ?? null
      cols.file_type = patch.file?.type ?? null
    }
    await supabase.from('patterns').update(cols).eq('id', id)
    set((s) => ({ patterns: s.patterns.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  },
  deletePattern: async (id) => {
    const p = get().patterns.find((x) => x.id === id)
    await removeFile(p?.file)
    await supabase.from('patterns').delete().eq('id', id)
    set((s) => ({
      patterns: s.patterns.filter((x) => x.id !== id),
      projects: s.projects.map((pr) => (pr.patternId === id ? { ...pr, patternId: null } : pr)),
    }))
  },

  addYarn: async (y) => {
    const { data } = await supabase
      .from('yarns')
      .insert({
        brand: y.brand,
        name: y.name,
        meters_per_skein: y.metersPerSkein,
        grams_per_skein: y.gramsPerSkein,
        grams_in_stash: y.gramsInStash,
        blend: y.blend,
        color: y.color,
        dye_lot: y.dyeLot,
        photo_path: y.photo?.path ?? null,
        photo_name: y.photo?.name ?? null,
        photo_type: y.photo?.type ?? null,
      })
      .select('*')
      .single()
    if (data) set((s) => ({ yarns: [toYarn(data), ...s.yarns] }))
  },
  updateYarn: async (id, patch) => {
    const current = get().yarns.find((y) => y.id === id)
    // If replacing the photo, clean up the old one.
    if ('photo' in patch && current?.photo && current.photo.path !== patch.photo?.path) {
      await removeFile(current.photo)
    }
    const cols: Record<string, unknown> = {}
    if (patch.brand !== undefined) cols.brand = patch.brand
    if (patch.name !== undefined) cols.name = patch.name
    if (patch.metersPerSkein !== undefined) cols.meters_per_skein = patch.metersPerSkein
    if (patch.gramsPerSkein !== undefined) cols.grams_per_skein = patch.gramsPerSkein
    if (patch.gramsInStash !== undefined) cols.grams_in_stash = patch.gramsInStash
    if (patch.blend !== undefined) cols.blend = patch.blend
    if (patch.color !== undefined) cols.color = patch.color
    if (patch.dyeLot !== undefined) cols.dye_lot = patch.dyeLot
    if ('photo' in patch) {
      cols.photo_path = patch.photo?.path ?? null
      cols.photo_name = patch.photo?.name ?? null
      cols.photo_type = patch.photo?.type ?? null
    }
    await supabase.from('yarns').update(cols).eq('id', id)
    set((s) => ({ yarns: s.yarns.map((y) => (y.id === id ? { ...y, ...patch } : y)) }))
  },
  deleteYarn: async (id) => {
    const y = get().yarns.find((x) => x.id === id)
    await removeFile(y?.photo)
    await supabase.from('yarns').delete().eq('id', id)
    set((s) => ({
      yarns: s.yarns.filter((x) => x.id !== id),
      projects: s.projects.map((pr) => ({
        ...pr,
        yarns: pr.yarns.filter((a) => a.yarnId !== id),
      })),
    }))
  },

  addProject: async (name) => {
    const { data } = await supabase
      .from('projects')
      .insert({ name, start_date: new Date().toISOString().slice(0, 10) })
      .select('*, project_yarns(*), project_photos(*)')
      .single()
    const project = toProject(data as ProjectRow)
    set((s) => ({ projects: [project, ...s.projects] }))
    return project.id
  },
  updateProject: async (id, patch) => {
    const cols: Record<string, unknown> = {}
    if (patch.name !== undefined) cols.name = patch.name
    if (patch.patternId !== undefined) cols.pattern_id = patch.patternId
    if (patch.size !== undefined) cols.size = patch.size
    if (patch.gauge !== undefined) cols.gauge = patch.gauge
    if (patch.needleSize !== undefined) cols.needle_size = patch.needleSize
    if (patch.startDate !== undefined) cols.start_date = patch.startDate
    if (patch.endDate !== undefined) cols.end_date = patch.endDate
    if (patch.notes !== undefined) cols.notes = patch.notes
    await supabase.from('projects').update(cols).eq('id', id)
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  },
  deleteProject: async (id) => {
    const pr = get().projects.find((x) => x.id === id)
    if (pr) {
      // Return reserved grams to the stash before deleting.
      for (const a of pr.yarns) {
        await get().setAllocation(id, a.yarnId, 0)
      }
      await Promise.all(pr.photos.map((ph) => removeFile(ph)))
    }
    await supabase.from('projects').delete().eq('id', id)
    set((s) => ({ projects: s.projects.filter((x) => x.id !== id) }))
  },
  finishProject: async (id) => {
    const today = new Date().toISOString().slice(0, 10)
    const p = get().projects.find((x) => x.id === id)
    if (p?.endDate) return
    await get().updateProject(id, { endDate: today })
  },
  reopenProject: async (id) => {
    await get().updateProject(id, { endDate: null })
  },

  setAllocation: async (projectId, yarnId, gramsUsed) => {
    const project = get().projects.find((p) => p.id === projectId)
    const yarn = get().yarns.find((y) => y.id === yarnId)
    if (!project || !yarn) return
    const prev = project.yarns.find((a) => a.yarnId === yarnId)?.gramsUsed ?? 0
    const next = Math.max(0, gramsUsed)
    const delta = next - prev

    // Optimistic local mirror of the server-side reconciliation.
    set((s) => ({
      yarns: s.yarns.map((y) =>
        y.id === yarnId
          ? { ...y, gramsInStash: Math.max(0, +(y.gramsInStash - delta).toFixed(2)) }
          : y,
      ),
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              yarns: p.yarns.some((a) => a.yarnId === yarnId)
                ? p.yarns.map((a) => (a.yarnId === yarnId ? { ...a, gramsUsed: next } : a))
                : [...p.yarns, { yarnId, gramsUsed: next }],
            }
          : p,
      ),
    }))

    await supabase.rpc('set_allocation', { p_project: projectId, p_yarn: yarnId, p_grams: next })
  },
  removeAllocation: async (projectId, yarnId) => {
    const project = get().projects.find((p) => p.id === projectId)
    const prev = project?.yarns.find((a) => a.yarnId === yarnId)?.gramsUsed ?? 0
    // Return grams locally, then drop the allocation.
    set((s) => ({
      yarns: s.yarns.map((y) =>
        y.id === yarnId ? { ...y, gramsInStash: +(y.gramsInStash + prev).toFixed(2) } : y,
      ),
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, yarns: p.yarns.filter((a) => a.yarnId !== yarnId) } : p,
      ),
    }))
    await supabase.rpc('remove_allocation', { p_project: projectId, p_yarn: yarnId })
  },

  addProjectPhotos: async (projectId, refs) => {
    const { data } = await supabase
      .from('project_photos')
      .insert(
        refs.map((r) => ({ project_id: projectId, path: r.path, name: r.name, type: r.type })),
      )
      .select('*')
    if (data) {
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, photos: [...p.photos, ...refs] } : p,
        ),
      }))
    }
  },
  removeProjectPhoto: async (projectId, ref) => {
    await removeFile(ref)
    await supabase.from('project_photos').delete().eq('project_id', projectId).eq('path', ref.path)
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, photos: p.photos.filter((x) => x.path !== ref.path) } : p,
      ),
    }))
  },
}))

// ---- Derived helpers ----

/** All known values for a tag universe: those in use + custom (still-unused) ones. */
export function tagUniverse(state: State, kind: TagKind): string[] {
  let inUse: string[] = []
  if (kind === 'patternCategory') inUse = state.patterns.map((p) => p.category)
  else if (kind === 'patternAuthor') inUse = state.patterns.map((p) => p.author)
  else if (kind === 'yarnBrand') inUse = state.yarns.map((y) => y.brand)
  return uniqSorted([...inUse, ...state.customTags[kind]])
}

export function skeinsInStash(y: Yarn): number {
  if (!y.gramsPerSkein) return 0
  return +(y.gramsInStash / y.gramsPerSkein).toFixed(2)
}

export function gramsToMeters(y: Yarn, grams: number): number {
  if (!y.gramsPerSkein) return 0
  return +((grams / y.gramsPerSkein) * y.metersPerSkein).toFixed(0)
}
