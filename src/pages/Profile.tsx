import { useState } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { supabase } from '../supabase'

export function Profile() {
  const patterns = useStore((s) => s.patterns)
  const yarns = useStore((s) => s.yarns)
  const projects = useStore((s) => s.projects)
  const { session } = useAuth()

  const [name, setName] = useState<string>(
    (session?.user.user_metadata?.full_name as string) ?? '',
  )
  const [saved, setSaved] = useState(false)

  const totalStash = Math.round(yarns.reduce((n, y) => n + y.gramsInStash, 0))

  async function saveName() {
    await supabase.auth.updateUser({ data: { full_name: name } })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="screen">
      <div className="screen-title">Profil</div>
      <p className="subtitle">{session?.user.email}</p>

      <div className="card">
        <div className="field" style={{ margin: 0 }}>
          <label>Ton prénom</label>
          <div className="row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Comment tu t'appelles ?"
            />
            <button className="btn sm" style={{ flex: '0 0 auto' }} onClick={saveName}>
              {saved ? '✓' : 'OK'}
            </button>
          </div>
        </div>
      </div>

      <div className="section-label">En résumé</div>
      <div className="stats-grid">
        <Stat value={projects.length} label="Projets" />
        <Stat value={patterns.length} label="Patrons" />
        <Stat value={yarns.length} label="Laines au stash" />
        <Stat value={`${totalStash} g`} label="Stock total" />
      </div>

      <div className="section-label">Compte</div>
      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          Tes données sont synchronisées via ton compte : retrouve-les sur tous tes appareils en te
          connectant avec la même adresse email.
        </p>
        <button className="btn ghost block" onClick={() => supabase.auth.signOut()}>
          Se déconnecter
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
