import { useState } from 'react'
import { useStore } from '../store'

export function Profile() {
  const patterns = useStore((s) => s.patterns)
  const yarns = useStore((s) => s.yarns)
  const projects = useStore((s) => s.projects)

  const [name, setName] = useState(() => localStorage.getItem('maille-name') ?? '')

  const totalStash = Math.round(yarns.reduce((n, y) => n + y.gramsInStash, 0))

  return (
    <div className="screen">
      <div className="screen-title">Profil</div>
      <p className="subtitle">Tes infos et la gestion de tes données.</p>

      <div className="card">
        <div className="field" style={{ margin: 0 }}>
          <label>Ton prénom</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              localStorage.setItem('maille-name', e.target.value)
            }}
            placeholder="Comment tu t'appelles ?"
          />
        </div>
      </div>

      <div className="section-label">En résumé</div>
      <div className="stats-grid">
        <Stat value={projects.length} label="Projets" />
        <Stat value={patterns.length} label="Patrons" />
        <Stat value={yarns.length} label="Laines au stash" />
        <Stat value={`${totalStash} g`} label="Stock total" />
      </div>

      <div className="section-label">Données</div>
      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          Tes données sont enregistrées localement sur cet appareil (aucun compte, aucun serveur).
        </p>
        <button
          className="btn danger block"
          onClick={() => {
            if (confirm('Effacer toutes les données (projets, laines, patrons) ?')) {
              localStorage.removeItem('maille-store')
              indexedDB.deleteDatabase('maille-files')
              location.reload()
            }
          }}
        >
          Réinitialiser l'application
        </button>
      </div>

      <p className="hint" style={{ textAlign: 'center', marginTop: 24 }}>
        Maille · app de tricot 🧶
      </p>
    </div>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  )
}
