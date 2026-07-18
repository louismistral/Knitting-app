import { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStore, saveFile, gramsToMeters } from '../store'
import { Thumb, PatternPreview, useObjectUrl } from '../components/FileView'
import { Modal } from '../components/Modal'

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

  const [pickYarn, setPickYarn] = useState(false)
  const [pickPattern, setPickPattern] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)

  if (!project) {
    return (
      <div className="screen">
        <p>Projet introuvable.</p>
      </div>
    )
  }

  const pattern = patterns.find((p) => p.id === project.patternId) ?? null
  const yarnById = new Map(yarns.map((y) => [y.id, y]))
  const availableYarns = yarns.filter((y) => !project.yarns.some((a) => a.yarnId === y.id))

  async function onAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const refs = await Promise.all(files.map(saveFile))
    update(project!.id, { photos: [...project!.photos, ...refs] })
    e.target.value = ''
  }

  return (
    <div className="screen">
      <div className="appbar">
        <button className="back" onClick={() => nav(-1)}>
          ‹
        </button>
        <h1>{project.name || 'Projet'}</h1>
        <span className={`chip ${project.endDate ? 'done' : 'active'}`}>
          {project.endDate ? 'Terminé' : 'En cours'}
        </span>
      </div>

      {/* Basic info */}
      <div className="card">
        <div className="field">
          <label>Nom</label>
          <input value={project.name} onChange={(e) => update(project.id, { name: e.target.value })} />
        </div>
        <div className="row">
          <div className="field">
            <label>Taille</label>
            <input
              value={project.size}
              onChange={(e) => update(project.id, { size: e.target.value })}
              placeholder="M"
            />
          </div>
          <div className="field">
            <label>Gauge (m. / 10cm)</label>
            <input
              inputMode="decimal"
              value={project.gauge ?? ''}
              onChange={(e) => update(project.id, { gauge: parseNum(e.target.value) })}
              placeholder="22"
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Aiguilles (mm)</label>
            <input
              inputMode="decimal"
              value={project.needleSize ?? ''}
              onChange={(e) => update(project.id, { needleSize: parseNum(e.target.value) })}
              placeholder="4"
            />
          </div>
          <div className="field">
            <label>Début</label>
            <input
              type="date"
              value={project.startDate ?? ''}
              onChange={(e) => update(project.id, { startDate: e.target.value || null })}
            />
          </div>
        </div>
        {project.endDate && (
          <div className="field">
            <label>Fin</label>
            <input
              type="date"
              value={project.endDate}
              onChange={(e) => update(project.id, { endDate: e.target.value || null })}
            />
          </div>
        )}
      </div>

      {/* Pattern */}
      <div className="section-label">Patron</div>
      {pattern ? (
        <div className="card" style={{ padding: 10 }}>
          <Link to={`/library/${pattern.id}`}>
            <PatternPreview file={pattern.file} />
          </Link>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn ghost sm" onClick={() => setPickPattern(true)}>
              Changer
            </button>
            <button className="btn ghost sm" onClick={() => update(project.id, { patternId: null })}>
              Retirer
            </button>
          </div>
        </div>
      ) : (
        <button className="btn ghost block" onClick={() => setPickPattern(true)}>
          📚 Associer un patron
        </button>
      )}

      {/* Yarn */}
      <div className="section-label">Laine utilisée</div>
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

      {/* Notes */}
      <div className="section-label">Notes</div>
      <textarea
        value={project.notes}
        onChange={(e) => update(project.id, { notes: e.target.value })}
        placeholder="Modifications, rangs, idées…"
      />

      {/* Photos */}
      <div className="section-label">Photos</div>
      <div className="photo-strip">
        <button className="add-photo" onClick={() => photoInput.current?.click()}>
          ＋
        </button>
        {project.photos.map((ph) => (
          <ProjectPhoto
            key={ph.id}
            fileId={ph.id}
            file={ph}
            onRemove={() =>
              update(project.id, { photos: project.photos.filter((x) => x.id !== ph.id) })
            }
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

      {/* Actions */}
      <div className="fab-row">
        {project.endDate ? (
          <button className="btn ghost block" onClick={() => reopen(project.id)}>
            ↩︎ Rouvrir le projet
          </button>
        ) : (
          <button className="btn block" onClick={() => finish(project.id)}>
            ✓ J'ai fini le projet
          </button>
        )}
      </div>
      <div className="fab-row">
        <button
          className="btn danger block"
          onClick={() => {
            if (confirm('Supprimer ce projet ? La laine réservée retournera au stash.')) {
              del(project.id)
              nav('/projects')
            }
          }}
        >
          Supprimer le projet
        </button>
      </div>

      {pickPattern && (
        <Modal title="Choisir un patron" onClose={() => setPickPattern(false)}>
          {patterns.length === 0 && <p className="empty">Aucun patron dans la bibliothèque.</p>}
          {patterns.map((p) => (
            <button
              key={p.id}
              className="list-item"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                update(project.id, { patternId: p.id })
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

function ProjectPhoto({
  file,
  onRemove,
}: {
  fileId: string
  file: { id: string; name: string; type: string }
  onRemove: () => void
}) {
  const url = useObjectUrl(file)
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
