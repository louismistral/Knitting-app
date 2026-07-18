import { useRef, useState } from 'react'
import { useStore, saveFile, skeinsInStash } from '../store'
import type { FileRef, Yarn } from '../types'
import { Thumb } from '../components/FileView'
import { Modal } from '../components/Modal'

const EMPTY: YarnForm = {
  brand: '',
  name: '',
  metersPerSkein: '',
  gramsPerSkein: '',
  gramsInStash: '',
  blend: '',
  color: '',
  dyeLot: '',
  photo: null,
}

interface YarnForm {
  brand: string
  name: string
  metersPerSkein: string
  gramsPerSkein: string
  gramsInStash: string
  blend: string
  color: string
  dyeLot: string
  photo: FileRef | null
}

export function YarnStash() {
  const yarns = useStore((s) => s.yarns)
  const addYarn = useStore((s) => s.addYarn)
  const [editing, setEditing] = useState<Yarn | null>(null)
  const [prefill, setPrefill] = useState<YarnForm | null>(null)

  const totalGrams = yarns.reduce((n, y) => n + y.gramsInStash, 0)

  return (
    <div className="screen">
      <div className="screen-title">Yarn Stash</div>
      <p className="subtitle">
        {yarns.length} laine{yarns.length > 1 ? 's' : ''} · {Math.round(totalGrams)} g en stock
      </p>

      {/* Inline add row */}
      <button
        className="list-item"
        style={{ width: '100%', border: '2px dashed var(--line)', boxShadow: 'none' }}
        onClick={() => setPrefill(EMPTY)}
      >
        <div className="thumb">＋</div>
        <div className="li-main">
          <div className="li-title">Ajouter une laine</div>
          <div className="li-sub">Nouveau rouleau dans le stash</div>
        </div>
      </button>

      <div style={{ height: 12 }} />

      {yarns.length === 0 ? (
        <div className="empty">
          <div className="emoji">🧶</div>
          <p>Ton stash est vide.</p>
        </div>
      ) : (
        yarns.map((y) => (
          <button
            key={y.id}
            className="list-item"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => setEditing(y)}
          >
            <Thumb file={y.photo} />
            <div className="li-main">
              <div className="li-title">
                {y.name || y.brand || 'Sans nom'}
                {y.color ? ` · ${y.color}` : ''}
              </div>
              <div className="li-sub">
                {[y.brand, y.blend].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="li-right">
              <div className="big">{Math.round(y.gramsInStash)} g</div>
              <div className="li-sub">{skeinsInStash(y)} pelotes</div>
            </div>
          </button>
        ))
      )}

      {(prefill || editing) && (
        <YarnModal
          yarn={editing}
          initial={prefill ?? undefined}
          onClose={() => {
            setEditing(null)
            setPrefill(null)
          }}
          onDuplicate={(form) => {
            setEditing(null)
            setPrefill({ ...form, color: '', dyeLot: '', gramsInStash: '', photo: null })
          }}
          onSave={(form) => {
            const data = {
              brand: form.brand.trim(),
              name: form.name.trim(),
              metersPerSkein: num(form.metersPerSkein),
              gramsPerSkein: num(form.gramsPerSkein),
              gramsInStash: num(form.gramsInStash),
              blend: form.blend.trim(),
              color: form.color.trim(),
              dyeLot: form.dyeLot.trim(),
              photo: form.photo,
            }
            if (editing) {
              useStore.getState().updateYarn(editing.id, data)
            } else {
              addYarn(data)
            }
            setEditing(null)
            setPrefill(null)
          }}
        />
      )}
    </div>
  )
}

function num(s: string): number {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function YarnModal({
  yarn,
  initial,
  onClose,
  onSave,
  onDuplicate,
}: {
  yarn: Yarn | null
  initial?: YarnForm
  onClose: () => void
  onSave: (f: YarnForm) => void
  onDuplicate: (f: YarnForm) => void
}) {
  const deleteYarn = useStore((s) => s.deleteYarn)
  const [f, setF] = useState<YarnForm>(
    initial ??
      (yarn
        ? {
            brand: yarn.brand,
            name: yarn.name,
            metersPerSkein: String(yarn.metersPerSkein || ''),
            gramsPerSkein: String(yarn.gramsPerSkein || ''),
            gramsInStash: String(yarn.gramsInStash || ''),
            blend: yarn.blend,
            color: yarn.color,
            dyeLot: yarn.dyeLot,
            photo: yarn.photo,
          }
        : EMPTY),
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof YarnForm, v: string) => setF((p) => ({ ...p, [k]: v }))

  const gps = num(f.gramsPerSkein)
  const gis = num(f.gramsInStash)
  const skeins = gps ? Math.round((gis / gps) * 100) / 100 : 0

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setF((p) => ({ ...p, photo: null }))
    const ref = await saveFile(file)
    setF((p) => ({ ...p, photo: ref }))
  }

  return (
    <Modal title={yarn ? 'Modifier la laine' : 'Nouvelle laine'} onClose={onClose}>
      <div className="row">
        <div className="field">
          <label>Marque</label>
          <input value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Tilia" />
        </div>
        <div className="field">
          <label>Nom</label>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Merino" />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Mètres / pelote</label>
          <input
            inputMode="decimal"
            value={f.metersPerSkein}
            onChange={(e) => set('metersPerSkein', e.target.value)}
            placeholder="180"
          />
        </div>
        <div className="field">
          <label>Grammes / pelote</label>
          <input
            inputMode="decimal"
            value={f.gramsPerSkein}
            onChange={(e) => set('gramsPerSkein', e.target.value)}
            placeholder="50"
          />
        </div>
      </div>

      <div className="field">
        <label>Grammes dans le stash</label>
        <input
          inputMode="decimal"
          value={f.gramsInStash}
          onChange={(e) => set('gramsInStash', e.target.value)}
          placeholder="1000"
        />
        <div className="hint">≈ {skeins} pelotes (calcul auto)</div>
      </div>

      <div className="field">
        <label>Composition (blend)</label>
        <input
          value={f.blend}
          onChange={(e) => set('blend', e.target.value)}
          placeholder="80% laine, 20% nylon"
        />
      </div>

      <div className="row">
        <div className="field">
          <label>Couleur</label>
          <input value={f.color} onChange={(e) => set('color', e.target.value)} placeholder="Rouille" />
        </div>
        <div className="field">
          <label>Dye lot</label>
          <input value={f.dyeLot} onChange={(e) => set('dyeLot', e.target.value)} placeholder="A123" />
        </div>
      </div>

      <div className="field">
        <label>Photo</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          style={{ display: 'none' }}
        />
        <button className="btn ghost block" onClick={() => inputRef.current?.click()}>
          {f.photo ? '✓ Photo ajoutée' : '📷 Ajouter une photo'}
        </button>
      </div>

      <button
        className="btn block"
        style={{ marginTop: 8, opacity: f.name.trim() || f.brand.trim() ? 1 : 0.5 }}
        disabled={!f.name.trim() && !f.brand.trim()}
        onClick={() => onSave(f)}
      >
        Enregistrer
      </button>

      {yarn && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={() => onDuplicate(f)}>
            Dupliquer (autre couleur)
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Supprimer cette laine ?')) {
                deleteYarn(yarn.id)
                onClose()
              }
            }}
          >
            Supprimer
          </button>
        </div>
      )}
    </Modal>
  )
}
