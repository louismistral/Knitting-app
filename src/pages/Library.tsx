import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, saveFile } from '../store'
import type { FileRef } from '../types'
import { Thumb } from '../components/FileView'
import { Modal } from '../components/Modal'

export function Library() {
  const patterns = useStore((s) => s.patterns)
  const addPattern = useStore((s) => s.addPattern)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')

  const categories = Array.from(new Set(patterns.map((p) => p.category).filter(Boolean)))
  const shown = filter ? patterns.filter((p) => p.category === filter) : patterns

  return (
    <div className="screen">
      <div className="screen-title">Bibliothèque</div>
      <p className="subtitle">Tes patrons de tricot, classés et prêts à tricoter.</p>

      {categories.length > 0 && (
        <div className="photo-strip" style={{ marginBottom: 14 }}>
          <button
            className={`chip ${!filter ? 'active' : ''}`}
            style={{ border: 'none' }}
            onClick={() => setFilter('')}
          >
            Tous
          </button>
          {categories.map((c) => (
            <button
              key={c}
              className={`chip ${filter === c ? 'active' : ''}`}
              style={{ border: 'none' }}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          <div className="emoji">📚</div>
          <p>Ta bibliothèque est vide.</p>
        </div>
      ) : (
        shown.map((p) => (
          <Link key={p.id} className="list-item" to={`/library/${p.id}`}>
            <Thumb file={p.file} fallback="📄" />
            <div className="li-main">
              <div className="li-title">{p.name}</div>
              <div className="li-sub">
                {[p.author, p.category].filter(Boolean).join(' · ') || 'Sans catégorie'}
              </div>
            </div>
            <span className="icon-btn">›</span>
          </Link>
        ))
      )}

      <div className="fab-row">
        <button className="btn block" onClick={() => setAdding(true)}>
          + Ajouter un patron
        </button>
      </div>

      {adding && (
        <AddPatternModal
          onClose={() => setAdding(false)}
          onSave={(data) => {
            addPattern(data)
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

interface NewPattern {
  name: string
  author: string
  category: string
  file: FileRef | null
}

function AddPatternModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (p: NewPattern) => void
}) {
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [category, setCategory] = useState('')
  const [file, setFile] = useState<FileRef | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    setFile(await saveFile(f))
    setBusy(false)
  }

  return (
    <Modal title="Nouveau patron" onClose={onClose}>
      <div className="field">
        <label>Nom du patron</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pull Sophie" />
      </div>
      <div className="row">
        <div className="field">
          <label>Auteur·rice</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="PetiteKnit" />
        </div>
        <div className="field">
          <label>Catégorie</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Pull"
            list="cat-list"
          />
        </div>
      </div>
      <div className="field">
        <label>Fichier (PDF ou image)</label>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          onChange={onPick}
          style={{ display: 'none' }}
        />
        <button className="btn ghost block" onClick={() => inputRef.current?.click()}>
          {busy ? 'Chargement…' : file ? `✓ ${file.name}` : '📎 Choisir un fichier'}
        </button>
      </div>
      <button
        className="btn block"
        disabled={!name.trim()}
        style={{ marginTop: 8, opacity: name.trim() ? 1 : 0.5 }}
        onClick={() => onSave({ name: name.trim(), author: author.trim(), category: category.trim(), file })}
      >
        Enregistrer
      </button>
    </Modal>
  )
}
