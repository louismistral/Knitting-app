import { useState } from 'react'
import { useStore, tagUniverse } from '../store'
import type { TagKind } from '../store'

interface Props {
  kind: TagKind
  label: string
  /** Currently selected value ('' means none). */
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/**
 * Tag field: pick one value from a managed universe of tags. You can create a
 * new tag on the fly and delete existing ones (which also detaches them from
 * every pattern / yarn that used them).
 */
export function TagPicker({ kind, label, value, onChange, placeholder }: Props) {
  const options = useStore((s) => tagUniverse(s, kind))
  const addTag = useStore((s) => s.addTag)
  const deleteTag = useStore((s) => s.deleteTag)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  // Make sure the currently-selected value is always visible as a chip, even
  // if it isn't part of the known universe yet.
  const chips =
    value && !options.some((o) => o.toLowerCase() === value.toLowerCase())
      ? [value, ...options]
      : options

  function commitNew() {
    const v = draft.trim()
    if (v) {
      addTag(kind, v)
      onChange(v)
    }
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="tagpicker">
        {chips.map((c) => {
          const selected = c.toLowerCase() === value.toLowerCase()
          return (
            <span key={c} className={`tag ${selected ? 'sel' : ''}`}>
              <button
                type="button"
                className="tag-label"
                onClick={() => onChange(selected ? '' : c)}
              >
                {c}
              </button>
              <button
                type="button"
                className="tag-x"
                title="Supprimer ce tag"
                onClick={() => {
                  if (
                    confirm(
                      `Supprimer le tag « ${c} » ? Il sera retiré de tous les éléments qui l'utilisent.`,
                    )
                  ) {
                    deleteTag(kind, c)
                    if (selected) onChange('')
                  }
                }}
              >
                ×
              </button>
            </span>
          )
        })}

        {adding ? (
          <input
            className="tag-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitNew()
              } else if (e.key === 'Escape') {
                setDraft('')
                setAdding(false)
              }
            }}
            placeholder={placeholder ?? 'Nouveau tag'}
          />
        ) : (
          <button type="button" className="tag tag-add" onClick={() => setAdding(true)}>
            ＋ Nouveau
          </button>
        )}
      </div>
    </div>
  )
}
