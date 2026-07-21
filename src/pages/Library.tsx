import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, tagUniverse } from '../store'
import { Thumb } from '../components/FileView'
import { PatternModal } from '../components/PatternModal'

export function Library() {
  const patterns = useStore((s) => s.patterns)
  const categories = useStore((s) => tagUniverse(s, 'patternCategory'))
  const authors = useStore((s) => tagUniverse(s, 'patternAuthor'))
  const [adding, setAdding] = useState(false)
  const [cat, setCat] = useState('')
  const [author, setAuthor] = useState('')

  const shown = patterns.filter(
    (p) => (!cat || p.category === cat) && (!author || p.author === author),
  )

  return (
    <div className="screen">
      <div className="screen-title">Bibliothèque</div>
      <p className="subtitle">Tes patrons de tricot, classés et prêts à tricoter.</p>

      {categories.length > 0 && (
        <FilterRow label="Catégorie" options={categories} value={cat} onChange={setCat} />
      )}
      {authors.length > 0 && (
        <FilterRow label="Auteur" options={authors} value={author} onChange={setAuthor} />
      )}

      {shown.length === 0 ? (
        <div className="empty">
          <div className="emoji">📚</div>
          <p>{patterns.length === 0 ? 'Ta bibliothèque est vide.' : 'Aucun patron pour ce filtre.'}</p>
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

      {adding && <PatternModal onClose={() => setAdding(false)} />}
    </div>
  )
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="filter-row">
      <span className="filter-label">{label}</span>
      <div className="photo-strip">
        <button
          className={`chip ${!value ? 'active' : ''}`}
          style={{ border: 'none' }}
          onClick={() => onChange('')}
        >
          Tous
        </button>
        {options.map((o) => (
          <button
            key={o}
            className={`chip ${value === o ? 'active' : ''}`}
            style={{ border: 'none' }}
            onClick={() => onChange(value === o ? '' : o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}
