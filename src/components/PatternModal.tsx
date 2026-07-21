import { useRef, useState } from 'react'
import { useStore } from '../store'
import { uploadFile } from '../files'
import type { FileRef, Pattern } from '../types'
import { Modal } from './Modal'
import { TagPicker } from './TagPicker'

interface Props {
  /** When provided, the modal edits this pattern; otherwise it creates a new one. */
  pattern?: Pattern | null
  onClose: () => void
}

export function PatternModal({ pattern, onClose }: Props) {
  const addPattern = useStore((s) => s.addPattern)
  const updatePattern = useStore((s) => s.updatePattern)

  const [name, setName] = useState(pattern?.name ?? '')
  const [author, setAuthor] = useState(pattern?.author ?? '')
  const [category, setCategory] = useState(pattern?.category ?? '')
  const [file, setFile] = useState<FileRef | null>(pattern?.file ?? null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      setFile(await uploadFile('patterns', f))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const data = {
      name: name.trim(),
      author: author.trim(),
      category: category.trim(),
      file,
    }
    if (pattern) await updatePattern(pattern.id, data)
    else await addPattern(data)
    onClose()
  }

  return (
    <Modal title={pattern ? 'Modifier le patron' : 'Nouveau patron'} onClose={onClose}>
      <div className="field">
        <label>Nom du patron</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pull Sophie" />
      </div>

      <TagPicker
        kind="patternAuthor"
        label="Auteur·rice"
        value={author}
        onChange={setAuthor}
        placeholder="PetiteKnit"
      />

      <TagPicker
        kind="patternCategory"
        label="Catégorie"
        value={category}
        onChange={setCategory}
        placeholder="Pull"
      />

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
        {file && (
          <button
            className="btn ghost block"
            style={{ marginTop: 6, color: 'var(--danger)' }}
            onClick={() => setFile(null)}
          >
            Retirer le fichier
          </button>
        )}
      </div>

      <button
        className="btn block"
        disabled={!name.trim() || busy}
        style={{ marginTop: 8, opacity: name.trim() && !busy ? 1 : 0.5 }}
        onClick={save}
      >
        Enregistrer
      </button>
    </Modal>
  )
}
