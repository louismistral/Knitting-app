import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store'
import { PatternPreview } from '../components/FileView'
import { PatternModal } from '../components/PatternModal'

export function PatternDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const pattern = useStore((s) => s.patterns.find((p) => p.id === id))
  const projects = useStore((s) => s.projects.filter((p) => p.patternId === id))
  const deletePattern = useStore((s) => s.deletePattern)
  const [editing, setEditing] = useState(false)

  if (!pattern) {
    return (
      <div className="screen">
        <p>Patron introuvable.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="appbar">
        <button className="back" onClick={() => nav(-1)}>
          ‹
        </button>
        <h1>{pattern.name}</h1>
        <button className="btn ghost sm" style={{ flex: '0 0 auto' }} onClick={() => setEditing(true)}>
          Modifier
        </button>
      </div>

      <div className="card" style={{ padding: 10 }}>
        <PatternPreview file={pattern.file} />
      </div>

      <div className="card">
        <div className="li-sub" style={{ fontSize: 14 }}>
          {pattern.author && <div>✍️ {pattern.author}</div>}
          {pattern.category && (
            <div style={{ marginTop: 4 }}>
              <span className="chip">{pattern.category}</span>
            </div>
          )}
        </div>
      </div>

      {projects.length > 0 && (
        <>
          <div className="section-label">Projets liés</div>
          {projects.map((p) => (
            <Link key={p.id} className="list-item" to={`/projects/${p.id}`}>
              <div className="li-main">
                <div className="li-title">{p.name || 'Projet sans nom'}</div>
                <div className="li-sub">{p.endDate ? 'Terminé' : 'En cours'}</div>
              </div>
              <span className="icon-btn">›</span>
            </Link>
          ))}
        </>
      )}

      <div className="fab-row">
        <button
          className="btn danger block"
          onClick={() => {
            if (confirm('Supprimer ce patron ?')) {
              deletePattern(pattern.id)
              nav('/library')
            }
          }}
        >
          Supprimer le patron
        </button>
      </div>

      {editing && <PatternModal pattern={pattern} onClose={() => setEditing(false)} />}
    </div>
  )
}
