import { useState } from 'react'
import { supabase } from '../supabase'

export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          setNotice('Compte créé ! Vérifie tes emails pour confirmer, puis connecte-toi.')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(translate((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 52 }}>🧶</div>
        <h1 style={{ fontSize: 30, margin: '8px 0 4px' }}>Maille</h1>
        <p className="subtitle" style={{ margin: 0 }}>Ton tricot, synchronisé partout.</p>
      </div>

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>Adresse email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            required
          />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={6}
            required
          />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 14, margin: '4px 0' }}>{error}</p>}
        {notice && <p style={{ color: 'var(--accent)', fontSize: 14, margin: '4px 0' }}>{notice}</p>}

        <button className="btn block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
          {busy ? '…' : mode === 'signin' ? 'Se connecter' : 'Créer un compte'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 18, fontSize: 14 }}>
        {mode === 'signin' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
        <button
          className="link"
          style={{ background: 'none', border: 'none', padding: 0 }}
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'signin' ? "S'inscrire" : 'Se connecter'}
        </button>
      </p>
    </div>
  )
}

function translate(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.'
  if (/already registered/i.test(msg)) return 'Cette adresse a déjà un compte.'
  if (/at least 6/i.test(msg)) return 'Le mot de passe doit faire au moins 6 caractères.'
  return msg
}
