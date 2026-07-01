import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <p style={{ color: 'rgba(255,153,51,0.75)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', margin: '0 0 8px' }}>
            Antwerp · 2026
          </p>
          <h1 style={{ color: 'var(--text)', fontSize: 30, fontWeight: 900, margin: 0, letterSpacing: '-0.6px', lineHeight: 1.15 }}>
            Mega Event Cricket
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 14, margin: '8px 0 0' }}>Choose a tournament</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Link to="/womens" style={{ textDecoration: 'none' }}>
            <div className="tap" style={{
              background: 'linear-gradient(135deg, #251508 0%, #1a0f06 100%)',
              border: '1px solid rgba(255,153,51,0.30)', borderRadius: 20, padding: '24px 22px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ color: 'rgba(255,153,51,0.75)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.16em', margin: '0 0 6px' }}>Live Scoring</p>
                <h2 style={{ color: 'var(--text)', fontSize: 21, fontWeight: 800, margin: 0 }}>Women's Cricket</h2>
                <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '4px 0 0' }}>Mega Event Woman Tournament</p>
              </div>
              <span style={{ color: 'var(--green)', fontSize: 26, fontWeight: 800 }}>→</span>
            </div>
          </Link>

          <Link to="/mens" style={{ textDecoration: 'none' }}>
            <div className="tap" style={{
              background: 'linear-gradient(135deg, #0a1628 0%, #081019 100%)',
              border: '1px solid rgba(56,132,255,0.30)', borderRadius: 20, padding: '24px 22px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ color: 'rgba(120,170,255,0.8)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.16em', margin: '0 0 6px' }}>Live Scoring</p>
                <h2 style={{ color: 'var(--text)', fontSize: 21, fontWeight: 800, margin: 0 }}>Men's +50 Cricket</h2>
                <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '4px 0 0' }}>4 teams · round robin + final</p>
              </div>
              <span style={{ color: 'var(--blue)', fontSize: 26, fontWeight: 800 }}>→</span>
            </div>
          </Link>
        </div>

        <p style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center', margin: '28px 0 0' }}>
          Antwerp Indian Cricket Club · Mega Sports
        </p>
      </div>
    </div>
  );
}
