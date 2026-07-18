import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Pattern, Project, Yarn, YarnAllocation, FileRef } from './types'
import { deleteFile, putFile } from './db'

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Store a file blob in IndexedDB and return a metadata ref. */
export async function saveFile(file: File): Promise<FileRef> {
  const id = uid()
  await putFile(id, file)
  return { id, name: file.name, type: file.type }
}

interface State {
  patterns: Pattern[]
  yarns: Yarn[]
  projects: Project[]

  // Patterns
  addPattern: (p: Omit<Pattern, 'id' | 'createdAt'>) => string
  updatePattern: (id: string, patch: Partial<Pattern>) => void
  deletePattern: (id: string) => void

  // Yarns
  addYarn: (y: Omit<Yarn, 'id' | 'createdAt'>) => string
  updateYarn: (id: string, patch: Partial<Yarn>) => void
  deleteYarn: (id: string) => void

  // Projects
  addProject: (p: Omit<Project, 'id' | 'createdAt'>) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  finishProject: (id: string) => void
  reopenProject: (id: string) => void

  // Yarn <-> project allocation (adjusts stash automatically)
  setAllocation: (projectId: string, yarnId: string, gramsUsed: number) => void
  removeAllocation: (projectId: string, yarnId: string) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      patterns: [],
      yarns: [],
      projects: [],

      addPattern: (p) => {
        const id = uid()
        set((s) => ({ patterns: [{ ...p, id, createdAt: Date.now() }, ...s.patterns] }))
        return id
      },
      updatePattern: (id, patch) =>
        set((s) => ({
          patterns: s.patterns.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deletePattern: (id) => {
        const p = get().patterns.find((x) => x.id === id)
        if (p?.file) deleteFile(p.file.id)
        set((s) => ({
          patterns: s.patterns.filter((x) => x.id !== id),
          // Detach from any project referencing it.
          projects: s.projects.map((pr) =>
            pr.patternId === id ? { ...pr, patternId: null } : pr,
          ),
        }))
      },

      addYarn: (y) => {
        const id = uid()
        set((s) => ({ yarns: [{ ...y, id, createdAt: Date.now() }, ...s.yarns] }))
        return id
      },
      updateYarn: (id, patch) =>
        set((s) => ({ yarns: s.yarns.map((y) => (y.id === id ? { ...y, ...patch } : y)) })),
      deleteYarn: (id) => {
        const y = get().yarns.find((x) => x.id === id)
        if (y?.photo) deleteFile(y.photo.id)
        set((s) => ({
          yarns: s.yarns.filter((x) => x.id !== id),
          projects: s.projects.map((pr) => ({
            ...pr,
            yarns: pr.yarns.filter((a) => a.yarnId !== id),
          })),
        }))
      },

      addProject: (p) => {
        const id = uid()
        set((s) => ({ projects: [{ ...p, id, createdAt: Date.now() }, ...s.projects] }))
        return id
      },
      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deleteProject: (id) => {
        const pr = get().projects.find((x) => x.id === id)
        if (pr) {
          // Return all allocated grams to the stash before deleting.
          pr.yarns.forEach((a) => get().setAllocation(id, a.yarnId, 0))
          pr.photos.forEach((ph) => deleteFile(ph.id))
        }
        set((s) => ({ projects: s.projects.filter((x) => x.id !== id) }))
      },
      finishProject: (id) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, endDate: p.endDate ?? new Date().toISOString().slice(0, 10) }
              : p,
          ),
        })),
      reopenProject: (id) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, endDate: null } : p)),
        })),

      setAllocation: (projectId, yarnId, gramsUsed) => {
        const project = get().projects.find((p) => p.id === projectId)
        const yarn = get().yarns.find((y) => y.id === yarnId)
        if (!project || !yarn) return

        const existing = project.yarns.find((a) => a.yarnId === yarnId)
        const prev = existing?.gramsUsed ?? 0
        const next = Math.max(0, gramsUsed)
        // Delta of what we now reserve vs. before. Stash decreases when we reserve more.
        const delta = next - prev

        const newAllocations: YarnAllocation[] = existing
          ? project.yarns.map((a) => (a.yarnId === yarnId ? { ...a, gramsUsed: next } : a))
          : [...project.yarns, { yarnId, gramsUsed: next }]

        set((s) => ({
          yarns: s.yarns.map((y) =>
            y.id === yarnId
              ? { ...y, gramsInStash: Math.max(0, +(y.gramsInStash - delta).toFixed(2)) }
              : y,
          ),
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, yarns: newAllocations } : p,
          ),
        }))
      },

      removeAllocation: (projectId, yarnId) => {
        // Return the grams to the stash, then drop the allocation.
        get().setAllocation(projectId, yarnId, 0)
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, yarns: p.yarns.filter((a) => a.yarnId !== yarnId) }
              : p,
          ),
        }))
      },
    }),
    { name: 'maille-store' },
  ),
)

// ---- Derived helpers ----

export function skeinsInStash(y: Yarn): number {
  if (!y.gramsPerSkein) return 0
  return +(y.gramsInStash / y.gramsPerSkein).toFixed(2)
}

export function gramsToMeters(y: Yarn, grams: number): number {
  if (!y.gramsPerSkein) return 0
  return +((grams / y.gramsPerSkein) * y.metersPerSkein).toFixed(0)
}
