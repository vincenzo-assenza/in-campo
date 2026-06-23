import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { makeTeamsAvoidingRepeats, ladderNextRound, recordPairs } from './lib/tournament.js';
import { splitConfirmedWaitlist } from './lib/poll.js';
import { DEFAULT_CAPACITY, isAdmin } from './config.js';

const btnBase =
  'font-semibold text-sm px-4 py-3 rounded-xl border transition active:scale-95 hover:-translate-y-px disabled:opacity-50 disabled:pointer-events-none';
const btn = `${btnBase} border-line bg-surface text-ink hover:shadow-[var(--shadow-card)]`;
const btnPrimary = `${btnBase} border-coral bg-coral text-white shadow-[0_8px_18px_-8px_rgba(255,90,54,0.7)]`;
const btnGhost = `${btnBase} border-transparent bg-transparent text-coral`;

function Stat({ n, k }) {
  return (
    <div>
      <div className="font-display text-3xl leading-none">{n}</div>
      <div className="text-[0.7rem] uppercase tracking-[0.12em] opacity-80 mt-1">{k}</div>
    </div>
  );
}

function TeamRow({ team, win, onWin, admin }) {
  return (
    <div
      className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition ${
        win ? 'bg-winbg border-win/35' : 'border-line'
      }`}
    >
      <div className={`flex flex-wrap gap-x-2 gap-y-1 font-semibold text-sm ${win ? 'text-winink' : ''}`}>
        {team.players.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
      {admin && (
        <button
          onClick={onWin}
          className={`shrink-0 text-[0.78rem] font-bold px-3 py-2 rounded-full border transition ${
            win ? 'bg-win text-white border-win win-pop' : 'bg-surface text-muted border-line'
          }`}
        >
          {win ? '✓ Vince' : 'ha vinto'}
        </button>
      )}
    </div>
  );
}

export default function TournamentScreen({ date }) {
  const [state, setState] = useState(null); // { turno, courts }
  const [confirmed, setConfirmed] = useState([]);
  const [courtsInput, setCourtsInput] = useState(3);
  const admin = isAdmin();
  const adminParam = new URLSearchParams(window.location.search).get('admin');

  async function load() {
    const { data: su } = await supabase.from('signups').select('*').eq('session_date', date);
    const { data: se } = await supabase.from('sessions').select('capacity').eq('session_date', date).maybeSingle();
    const cap = se?.capacity ?? DEFAULT_CAPACITY;
    setConfirmed(splitConfirmedWaitlist(su || [], cap).confirmed.map((s) => s.player_name));
    const { data: t } = await supabase.from('tournaments').select('state').eq('session_date', date).maybeSingle();
    setState(t?.state ?? null);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`tournament-${date}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments', filter: `session_date=eq.${date}` },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function save(next) {
    setState(next);
    await supabase
      .from('tournaments')
      .upsert({ session_date: date, state: next, updated_at: new Date().toISOString() });
  }

  // Genera turno 1 (storico coppie da zero).
  const generate = () => {
    const courts = makeTeamsAvoidingRepeats(confirmed, Number(courtsInput));
    save({ turno: 1, courts, history: recordPairs({}, courts) });
  };
  // Nuovo turno: rimescola evitando i compagni dei turni precedenti.
  const newTurno = () => {
    const history = state.history || {};
    const courts = makeTeamsAvoidingRepeats(confirmed, state.courts.length, history);
    save({ turno: (state.turno || 1) + 1, courts, history: recordPairs(history, courts) });
  };
  // La scala sposta le squadre tra i campi ma non cambia le coppie: lo storico resta.
  const nextRound = () => save({ ...state, courts: ladderNextRound(state.courts) });

  const setWinner = (courtIdx, ab) => {
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, winner: ab } : c));
    save({ ...state, courts });
  };

  const allDecided = state?.courts.every((c) => c.winner === 'A' || c.winner === 'B');
  const courtCount = state ? state.courts.length : Number(courtsInput);
  const tag = (i, last) => (i === 0 ? 'Top' : i === last ? 'Basso' : 'Centro');

  return (
    <main className="max-w-[600px] mx-auto px-4 pb-16">
      <header className="hero-sea anim-rise relative overflow-hidden rounded-3xl p-6 mt-4 text-white shadow-[var(--shadow-lift)]">
        <div
          className="absolute -right-8 -bottom-12 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,194,51,0.25), transparent 65%)' }}
        />
        <div className="relative">
          <a className="text-white/80 text-sm no-underline" href={`?${adminParam ? 'admin=' + adminParam : ''}`}>
            ← Sondaggio
          </a>
          <h1 className="font-display text-4xl mt-2.5 leading-none">Torneo</h1>
          <div className="text-white/80 text-sm mt-1">{date}</div>
          <div className="flex gap-7 mt-4">
            <Stat n={confirmed.length} k="giocatori" />
            <Stat n={courtCount} k="campi" />
            <Stat n={25} k="punti / set" />
          </div>
        </div>
      </header>

      {!state && admin && (
        <section className="anim-rise bg-surface border border-line rounded-2xl p-5 mt-5 shadow-[var(--shadow-card)]">
          <label className="block text-sm font-semibold mb-2">Campi prenotati</label>
          <input
            type="number"
            min="1"
            max="5"
            value={courtsInput}
            onChange={(e) => setCourtsInput(e.target.value)}
            className="w-24 px-3 py-2.5 rounded-lg border border-line bg-surface outline-none focus:border-coral"
          />
          <div className="mt-4">
            <button className={btnPrimary} onClick={generate}>
              Genera formazioni
            </button>
          </div>
        </section>
      )}
      {!state && !admin && (
        <p className="text-muted mt-5 mx-1">In attesa che l'organizzatore generi le formazioni…</p>
      )}

      {state && (
        <>
          <div className="flex items-center gap-3 mt-6 mx-1">
            <span className="font-display text-xl">Turno {state.turno}</span>
            <span className="flex-1 h-px bg-line" />
          </div>

          {state.courts.map((c, i) => (
            <section
              key={i}
              className={`anim-rise relative bg-surface rounded-2xl p-4 my-3 border shadow-[var(--shadow-card)] ${
                i === 0 ? 'border-sun/60 court-king' : 'border-line'
              }`}
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              {i === 0 && (
                <div
                  className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
                  style={{ background: 'linear-gradient(90deg, #FFC233, #FF5A36)' }}
                />
              )}
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-display text-lg flex items-center gap-1.5">
                  {i === 0 && <span className="crown">👑</span>} Campo {i + 1}
                </span>
                <span className="text-[0.68rem] font-bold uppercase tracking-wider text-muted">
                  {tag(i, state.courts.length - 1)}
                </span>
              </div>
              <TeamRow team={c.teamA} win={c.winner === 'A'} admin={admin} onWin={() => setWinner(i, 'A')} />
              <div className="text-center font-extrabold text-[0.7rem] tracking-[0.1em] text-muted my-1.5 uppercase">
                vs
              </div>
              <TeamRow team={c.teamB} win={c.winner === 'B'} admin={admin} onWin={() => setWinner(i, 'B')} />
            </section>
          ))}

          {admin && (
            <div className="flex flex-wrap gap-2.5 mt-4">
              <button className={btnPrimary} disabled={!allDecided} onClick={nextRound}>
                Prossimo round ↑
              </button>
              <button
                className={btn}
                onClick={() => {
                  if (confirm('Rimescolare tutte le squadre?')) newTurno();
                }}
              >
                Nuovo turno
              </button>
              <button
                className={btnGhost}
                onClick={() => {
                  if (confirm('Rigenerare il turno corrente?')) generate();
                }}
              >
                Rigenera
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
