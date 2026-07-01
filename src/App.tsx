import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import { Login, checkLocalAuth } from './pages/Login';
import { ScorerView } from './pages/ScorerView';
import { ViewerPage } from './pages/ViewerPage';
import { PublicHome } from './pages/PublicHome';
import { TournamentPage } from './pages/TournamentPage';
import { StatsPage } from './pages/StatsPage';
import { PlayerProfile } from './pages/PlayerProfile';
import { ScorerDashboard } from './pages/ScorerDashboard';
import { LandingPage } from './pages/LandingPage';
import { MensHome } from './pages/MensHome';
import { MensDashboard } from './pages/MensDashboard';
import { supabase, supabaseEnabled } from './lib/supabase';
import { refreshBracket } from './lib/matchData';
import { computeMensStandings } from './lib/mensData';
import { anyMatchRecord, isMensId } from './lib/resolve';

type AuthState = 'loading' | 'authed' | 'unauthed';

function ScorerRoute() {
  const { matchId: mId } = useParams<{ matchId: string }>();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [bracketReady, setBracketReady] = useState(false);

  const mens = mId ? isMensId(mId) : false;

  // Pull the bracket/standings from the cloud so Round 2 / Final teams resolve on
  // ANY device, not just the one that scored the earlier rounds.
  useEffect(() => {
    const p = mens ? computeMensStandings() : refreshBracket();
    p.finally(() => setBracketReady(true));
  }, [mens]);

  // Validate the match exists (resolves teams from the just-loaded cloud bracket)
  const rec = mId ? anyMatchRecord(mId) : undefined;
  const isBracketMatch = rec ? (rec.round === 2 || rec.round === 'final') : false;

  useEffect(() => {
    // Local auth always wins — check it first regardless of Supabase
    if (checkLocalAuth()) { setAuthState('authed'); return; }

    if (supabaseEnabled && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (checkLocalAuth()) { setAuthState('authed'); return; }
        setAuthState(session ? 'authed' : 'unauthed');
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (checkLocalAuth()) return; // never kick out a locally-authed scorer
          setAuthState(session ? 'authed' : 'unauthed');
        }
      );
      return () => subscription.unsubscribe();
    } else {
      setAuthState('unauthed');
    }
  }, []);

  if (!rec) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Match not found.</p>
      </div>
    );
  }

  // Wait for the cloud bracket before deciding a Round 2/Final match's teams are unknown.
  if (isBracketMatch && !bracketReady) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  // Round-2 / final matches can't be scored until their teams are known
  // (the earlier round must finish first).
  if (isBracketMatch && (!rec.match.home_team_id || !rec.match.away_team_id)) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>⏳</div>
        <p style={{ color: 'var(--text)', fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>Teams not decided yet</p>
        <p style={{ color: 'var(--text-3)', fontSize: 13, maxWidth: 300 }}>
          This {rec.roundLabel} match is set once the previous round finishes. Complete all earlier matches first.
        </p>
      </div>
    );
  }

  if (authState === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  if (authState === 'unauthed') {
    return <Login onLogin={() => setAuthState('authed')} />;
  }

  return (
    <GameProvider matchId={mId!}>
      <ScorerView />
    </GameProvider>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {/* Women's tournament */}
        <Route path="/womens" element={<PublicHome />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/score" element={<ScorerDashboard />} />
        <Route path="/admin" element={<TournamentPage />} />
        {/* Men's +50 tournament */}
        <Route path="/mens" element={<MensHome />} />
        <Route path="/mens/score" element={<MensDashboard />} />
        {/* Shared (resolved by match id) */}
        <Route path="/match/:matchId" element={<ViewerPage />} />
        <Route path="/match/:matchId/score" element={<ScorerRoute />} />
        <Route path="/player/:playerId" element={<PlayerProfile />} />
      </Routes>
    </BrowserRouter>
  );
}
