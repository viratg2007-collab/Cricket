import { useState } from 'react';
import { supabase, supabaseEnabled } from '../lib/supabase';

const LOCAL_EMAIL = 'Gandhi';
const LOCAL_PASSWORD = 'Virat';
const LOCAL_SESSION_KEY = 'cricket_scorer_auth';

interface Props {
  onLogin: () => void;
}

export function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (email.trim() === LOCAL_EMAIL && password === LOCAL_PASSWORD) {
        sessionStorage.setItem(LOCAL_SESSION_KEY, '1');
        if (supabaseEnabled && supabase) {
          supabase.auth.signInWithPassword({ email: email.trim(), password }).catch(() => {});
        }
        onLogin();
        return;
      }

      if (supabaseEnabled && supabase) {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (!authError) { onLogin(); return; }
      }

      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'var(--green-2)', border: '1px solid rgba(255,153,51,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 26,
          }}>
            🏏
          </div>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.4px' }}>
            Cricket Scorer
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 12px' }}>
            Women 2026 — Scorer Login
          </p>
          {supabaseEnabled && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              color: 'var(--green)', fontSize: 11, fontWeight: 600,
            }}>
              <span className="live-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              Connected to Supabase
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-3)', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
              Email
            </label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              required
              placeholder={LOCAL_EMAIL}
              style={{
                width: '100%', background: 'var(--surface)', color: 'var(--text)',
                borderRadius: 12, padding: '13px 16px', fontSize: 15,
                border: '1px solid var(--border)', outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-3)', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              style={{
                width: '100%', background: 'var(--surface)', color: 'var(--text)',
                borderRadius: 12, padding: '13px 16px', fontSize: 15,
                border: '1px solid var(--border)', outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center', margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="tap"
            style={{
              width: '100%', padding: '15px', borderRadius: 12,
              background: 'var(--green)', color: '#1a0800',
              fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.6 : 1, marginTop: 4,
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {!supabaseEnabled && (
          <p style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center', marginTop: 16 }}>
            Local mode · {LOCAL_EMAIL} / {LOCAL_PASSWORD}
          </p>
        )}
      </div>
    </div>
  );
}

export function checkLocalAuth(): boolean {
  return sessionStorage.getItem(LOCAL_SESSION_KEY) === '1';
}
