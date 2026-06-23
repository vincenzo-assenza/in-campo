import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { makeTeams, ladderNextRound } from './lib/tournament.js';
import { splitConfirmedWaitlist } from './lib/poll.js';
import { DEFAULT_CAPACITY, isAdmin } from './config.js';

export default function TournamentScreen({ date }) {
  const [state, setState] = useState(null); // { turno, courts }
  const [confirmed, setConfirmed] = useState([]);
  const [courtsInput, setCourtsInput] = useState(3);
  const admin = isAdmin();

  async function load() {
    const { data: su } = await supabase.from('signups').select('*').eq('session_date', date);
    const { data: se } = await supabase.from('sessions').select('capacity').eq('session_date', date).single();
    const cap = se?.capacity ?? DEFAULT_CAPACITY;
    setConfirmed(splitConfirmedWaitlist(su || [], cap).confirmed.map((s) => s.player_name));
    const { data: t } = await supabase.from('tournaments').select('state').eq('session_date', date).single();
    setState(t?.state ?? null);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`tournament-${date}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `session_date=eq.${date}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function save(next) {
    setState(next);
    await supabase.from('tournaments').upsert({ session_date: date, state: next, updated_at: new Date().toISOString() });
  }

  const generate = () => save({ turno: 1, courts: makeTeams(confirmed, Number(courtsInput)) });
  const newTurno = () => save({ turno: (state.turno || 1) + 1, courts: makeTeams(confirmed, state.courts.length) });
  const nextRound = () => save({ turno: state.turno, courts: ladderNextRound(state.courts) });

  const setWinner = (courtIdx, ab) => {
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, winner: ab } : c));
    save({ ...state, courts });
  };

  const allDecided = state?.courts.every((c) => c.winner === 'A' || c.winner === 'B');
  const adminParam = new URLSearchParams(location.search).get('admin');

  return (
    <div>
      <p className="muted"><a href={`?${adminParam ? 'admin=' + adminParam : ''}`}>← Sondaggio</a></p>
      <h1>Torneo · {date}</h1>
      <p className="muted">{confirmed.length} giocatori presenti</p>

      {!state && admin && (
        <section className="card">
          <label>Campi prenotati:{' '}
            <input type="number" min="1" max="5" value={courtsInput} onChange={(e) => setCourtsInput(e.target.value)} />
          </label>
          <div className="btn-row"><button className="primary" onClick={generate}>Genera formazioni</button></div>
        </section>
      )}
      {!state && !admin && <p className="muted">In attesa che l'organizzatore generi le formazioni…</p>}

      {state && (
        <div>
          <h2>Turno {state.turno}</h2>
          {state.courts.map((c, i) => (
            <section className="card" key={i}>
              <h3>Campo {i + 1}{i === 0 ? ' 👑' : ''}</h3>
              <Team team={c.teamA} win={c.winner === 'A'} onWin={() => admin && setWinner(i, 'A')} admin={admin} />
              <p className="vs">vs</p>
              <Team team={c.teamB} win={c.winner === 'B'} onWin={() => admin && setWinner(i, 'B')} admin={admin} />
            </section>
          ))}
          {admin && (
            <div className="btn-row">
              <button className="primary" disabled={!allDecided} onClick={nextRound}>Prossimo round (scala)</button>
              <button onClick={() => { if (confirm('Rimescolare tutte le squadre?')) newTurno(); }}>Nuovo turno (rimescola)</button>
              <button onClick={() => { if (confirm('Rigenerare il turno corrente?')) generate(); }}>Rigenera</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Team({ team, win, onWin, admin }) {
  return (
    <div className={win ? 'team win' : 'team'}>
      <b>{team.players.join(', ')}</b>{' '}
      {admin && <button onClick={onWin}>{win ? '✓ vincente' : 'ha vinto'}</button>}
    </div>
  );
}
