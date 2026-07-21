import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStore, gramsToMeters } from '../store'
import { uploadFile } from '../files'
import type { FileRef, Project } from '../types'
import { Thumb, PatternPreview, useFileUrl } from '../components/FileView'
import { Modal } from '../components/Modal'
import { registerNavGuard, runNavGuard } from '../navGuard'

interface Draft {
  name: string
  size: string
  gauge: number | null
  needleSize: number | null
  startDate: string | null
  endDate: string | null
  notes: string
  patternId: string | null
}

function toDraft(p: Project): Draft {
  return {
    name: p.name,
    size: p.size,
    gauge: p.gauge,
    needleSize: p.needleSize,
    startDate: p.startDate,
    endDate: p.endDate,
    notes: p.notes,
    patternId: p.patternId,
  }
}

export function ProjectDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const project = useStore((s) => s.projects.find((p) => p.id === id))
  const patterns = useStore((s) => s.patterns)
  const yarns = useStore((s) => s.yarns)
  const update = useStore((s) => s.updateProject)
  const finish = useStore((s) => s.finishProject)
  const reopen = useStore((s) => s.reopenProject)
  const del = useStore((s) => s.deleteProject)
  const setAllocation = useStore((s) => s.setAllocation)
  const removeAllocation = useStore((s) => s.removeAllocation)
  const addProjectPhotos = useStore((s) => s.addProjectPhotos)
  const removeProjectPhoto = useStore((s) => s.removeProjectPhoto)

  const [pickYarn, setPickYarn] = useState(false)
  const [pickPattern, setPickPattern] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(project ? toDraft(project) : null)
  const [dirty, setDirty] = useState(false)
  const [leavePrompt, setLeavePrompt] = useState<{ resolve: (v: boolean) => void } | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  // Re-seed the draft only when we navigate to a different project.
  useEffect(() => {
    if (project) {
      setDraft(toDraft(project))
      setDirty(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Keep the nav guard in sync with the latest dirty state / save handler.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    registerNavGuard(async () => {
      if (!dirtyRef.current) return true
      return new Promise<boolean>((resolve) => setLeavePrompt({ resolve }))
    })
    return () => registerNavGuard(null)
  }, [])

  if (!project || !draft) {
    return (
      <div className="screen">
        <p>Projet introuvable.</p>
      </div>
    )
  }

  const pattern = patterns.find((p) => p.id === draft.patternId) ?? null
  const yarnById = new Map(yarns.map((y) => [y.id, y]))
  const availableYarns = yarns.filter((y) => !project.yarns.some((a) => a.yarnId === y.id))

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
    setDirty(true)
  }

  function patch(d: Draft): Partial<Project> {
    return {
      name: d.name,
      size: d.size,
      gauge: d.gauge,
      needleSize: d.needleSize,
      startDate: d.startDate,
      endDate: d.endDate,
      notes: d.notes,
      patternId: d.patternId,
    }
  }

  async function save() {
    const d = draftRef.current
    if (!d) return
    await update(project!.id, patch(d))
    setDirty(false)
  }

  async function onFinish() {
    const today = new Date().toISOString().slice(0, 10)
    const d = { ...draftRef.current!, endDate: today }
    await update(project!.id, patch(d))
    await finish(project!.id)
    setDraft(d)
    setDirty(false)
  }

  async function onReopen() {
    const d = { ...draftRef.current!, endDate: null }
    await update(project!.id, patch(d))
    await reopen(project!.id)
    setDraft(d)
    setDirty(false)
  }

  async function goBack() {
    if (await runNavGuard()) nav(-1)
  }

  function answerLeave(proceed: boolean) {
    leavePrompt?.resolve(proceed)
    setLeavePrompt(null)
  }

  async function onAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const refs = await Promise.all(files.map((f) => uploadFile('photos', f)))
    await addProjectPhotos(project!.id, refs)
  }

  return (
    <div className="screen with-footer">
      <div className="appbar">
        <button className="back" onClick={goBack}>
          ‹
        </button>
        <h1>{draft.name || 'Projet'}</h1>
        <span className={`chip ${draft.endDate ? 'done' : 'active'}`}>
          {draft.endDate ? 'Terminé' : 'En cours'}
        </span>
      </div>

      {/* 1 — Infos */}
      <div className="section-label">Informations</div>
      <div className="card">
        <div className="field">
          <label>Nom</label>
          <input value={draft.name} onChange={(e) => field('name', e.target.value)} />
        </div>
        <div className="row">
          <div className="field">
            <label>Taille</label>
            <input
              value={draft.size}
              onChange={(e) => field('size', e.target.value)}
              placeholder="M"
            />
          </div>
          <div className="field">
            <label>Gauge (m. / 10cm)</label>
            <input
              inputMode="decimal"
              value={draft.gauge ?? ''}
              onChange={(e) => field('gauge', parseNum(e.target.value))}
              placeholder="22"
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Aiguilles (mm)</label>
            <input
              inputMode="decimal"
              value={draft.needleSize ?? ''}
              onChange={(e) => field('needleSize', parseNum(e.target.value))}
              placeholder="4"
            />
          </div>
          <div className="field">
            <label>Début</label>
            <input
              type="date"
              value={draft.startDate ?? ''}
              onChange={(e) => field('startDate', e.target.value || null)}
            />
          </div>
        </div>
        {draft.endDate && (
          <div className="field">
            <label>Fin</label>
            <input
              type="date"
              value={draft.endDate}
              onChange={(e) => field('endDate', e.target.value || null)}
            />
          </div>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Notes</label>
          <textarea
            value={draft.notes}
            onChange={(e) => field('notes', e.target.value)}
            placeholder="Modifications, rangs, idées…"
          />
        </div>
      </div>

      {/* 2 — Patron */}
      <div className="section-label">Patron</div>
      {pattern ? (
        <div className="card" style={{ padding: 10 }}>
          <PatternPreview file={pattern.file} />
          <div className="li-title" style={{ marginTop: 8 }}>
            {pattern.name}
          </div>
          <div className="li-sub">
            {[pattern.author, pattern.category].filter(Boolean).join(' · ') || 'Sans catégorie'}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Link className="btn ghost sm" to={`/library/${pattern.id}`} style={{ flex: 1 }}>
              Ouvrir
            </Link>
            <button className="btn ghost sm" onClick={() => setPickPattern(true)}>
              Changer
            </button>
            <button className="btn ghost sm" onClick={() => field('patternId', null)}>
              Retirer
            </button>
          </div>
        </div>
      ) : (
        <button className="btn ghost block" onClick={() => setPickPattern(true)}>
          📚 Associer un patron
        </button>
      )}

      {/* 3 — Laines associées */}
      <div className="section-label">Laines associées</div>
      {project.yarns.length === 0 && (
        <p className="hint" style={{ marginBottom: 8 }}>
          Associe de la laine de ton stash. Les grammes indiqués sont retirés du stash ; si tu en
          utilises moins, remets la quantité à jour et le reste retourne au stash.
        </p>
      )}
      {project.yarns.map((a) => {
        const y = yarnById.get(a.yarnId)
        if (!y) return null
        return (
          <div className="card" key={a.yarnId} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Thumb file={y.photo} />
            <div className="li-main">
              <div className="li-title">
                {y.name || y.brand} {y.color ? `· ${y.color}` : ''}
              </div>
              <div className="li-sub">
                {gramsToMeters(y, a.gramsUsed)} m · reste {Math.round(y.gramsInStash)} g au stash
              </div>
            </div>
            <div style={{ width: 92, flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <input
                  inputMode="decimal"
                  value={a.gramsUsed || ''}
                  onChange={(e) => setAllocation(project.id, a.yarnId, parseNum(e.target.value) ?? 0)}
                  style={{ paddingRight: 26, textAlign: 'right' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: 9,
                    top: 11,
                    color: 'var(--muted)',
                    fontSize: 13,
                  }}
                >
                  g
                </span>
              </div>
              <button
                className="icon-btn"
                style={{ width: '100%', color: 'var(--danger)', fontSize: 12 }}
                onClick={() => removeAllocation(project.id, a.yarnId)}
              >
                retirer
              </button>
            </div>
          </div>
        )
      })}
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setPickYarn(true)}>
        🧶 Ajouter de la laine
      </button>

      {/* 4 — Photos */}
      <div className="section-label">Photos</div>
      <div className="photo-strip">
        <button className="add-photo" onClick={() => photoInput.current?.click()}>
          ＋
        </button>
        {project.photos.map((ph) => (
          <ProjectPhoto
            key={ph.path}
            file={ph}
            onRemove={() => removeProjectPhoto(project.id, ph)}
          />
        ))}
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        multiple
        onChange={onAddPhotos}
        style={{ display: 'none' }}
      />

      {/* Danger zone */}
      <div className="fab-row">
        <button
          className="btn danger block"
          onClick={() => {
            if (confirm('Supprimer ce projet ? La laine réservée retournera au stash.')) {
              registerNavGuard(null)
              del(project.id)
              nav('/projects')
            }
          }}
        >
          Supprimer le projet
        </button>
      </div>

      {/* Always-visible action overlay */}
      <div className="project-footer">
        <button className="btn ghost" disabled={!dirty} onClick={save}>
          {dirty ? '💾 Enregistrer' : '✓ Enregistré'}
        </button>
        {draft.endDate ? (
          <button className="btn" onClick={onReopen}>
            ↩︎ Rouvrir
          </button>
        ) : (
          <button className="btn" onClick={onFinish}>
            ✓ Terminé
          </button>
        )}
      </div>

      {leavePrompt && (
        <Modal title="Modifications non enregistrées" onClose={() => answerLeave(false)}>
          <p className="hint" style={{ marginTop: 0 }}>
            Tu as des changements non enregistrés sur ce projet. Que veux-tu faire ?
          </p>
          <button
            className="btn block"
            style={{ marginTop: 8 }}
            onClick={async () => {
              await save()
              answerLeave(true)
            }}
          >
            💾 Enregistrer et quitter
          </button>
          <button
            className="btn ghost block"
            style={{ marginTop: 8 }}
            onClick={() => answerLeave(true)}
          >
            Quitter sans enregistrer
          </button>
          <button
            className="btn ghost block"
            style={{ marginTop: 8 }}
            onClick={() => answerLeave(false)}
          >
            Annuler
          </button>
        </Modal>
      )}

      {pickPattern && (
        <Modal title="Choisir un patron" onClose={() => setPickPattern(false)}>
          {patterns.length === 0 && <p className="empty">Aucun patron dans la bibliothèque.</p>}
          {patterns.map((p) => (
            <button
              key={p.id}
              className="list-item"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                field('patternId', p.id)
                setPickPattern(false)
              }}
            >
              <Thumb file={p.file} fallback="📄" />
              <div className="li-main">
                <div className="li-title">{p.name}</div>
                <div className="li-sub">{[p.author, p.category].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
        </Modal>
      )}

      {pickYarn && (
        <Modal title="Ajouter de la laine" onClose={() => setPickYarn(false)}>
          {availableYarns.length === 0 && (
            <p className="empty">Toutes tes laines sont déjà ajoutées (ou ton stash est vide).</p>
          )}
          {availableYarns.map((y) => (
            <button
              key={y.id}
              className="list-item"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                setAllocation(project.id, y.id, 0)
                setPickYarn(false)
              }}
            >
              <Thumb file={y.photo} />
              <div className="li-main">
                <div className="li-title">
                  {y.name || y.brand} {y.color ? `· ${y.color}` : ''}
                </div>
                <div className="li-sub">{Math.round(y.gramsInStash)} g disponibles</div>
              </div>
            </button>
          ))}
        </Modal>
      )}
    </div>
  )
}

function ProjectPhoto({ file, onRemove }: { file: FileRef; onRemove: () => void }) {
  const url = useFileUrl(file)
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {url ? (
        <img src={url} alt="" style={{ width: 110, height: 110, borderRadius: 14, objectFit: 'cover' }} />
      ) : (
        <div className="add-photo">🖼️</div>
      )}
      <button
        onClick={onRemove}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          border: 'none',
          borderRadius: '50%',
          width: 24,
          height: 24,
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}

function parseNum(s: string): number | null {
  if (s.trim() === '') return null
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}
