import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { makeTeamsAvoidingRepeats, secondRound, roundOneResults, recordPairs } from './lib/tournament.js';
import { splitConfirmedWaitlist } from './lib/poll.js';
import { DEFAULT_CAPACITY, MAX_SCORE, isAdmin } from './config.js';

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

function MoveBadge({ move, from }) {
  const map = {
    won: { t: `↑ vincente · Campo ${from + 1}`, c: 'text-win bg-winbg' },
    lost: { t: `↓ perdente · Campo ${from + 1}`, c: 'text-coral bg-coral/10' },
  };
  const m = map[move];
  if (!m) return null;
  return (
    <span className={`inline-block text-[0.62rem] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 mb-1 ${m.c}`}>
      {m.t}
    </span>
  );
}

function TeamRow({ team, score, win, onScore, admin }) {
  return (
    <div
      className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition ${
        win ? 'bg-winbg border-win/35' : 'border-line'
      }`}
    >
      <div className="min-w-0">
        {team.move && <MoveBadge move={team.move} from={team.fromCourt} />}
        <div className={`flex flex-wrap gap-x-2 gap-y-1 font-semibold text-sm ${win ? 'text-winink' : ''}`}>
          {team.players.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      </div>
      {admin ? (
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max={MAX_SCORE}
          placeholder="–"
          value={score ?? ''}
          onChange={(e) => onScore(e.target.value)}
          aria-label="Punteggio"
          className={`shrink-0 w-14 text-center font-display text-xl tabular-nums px-1 py-1.5 rounded-lg border outline-none focus:border-coral ${
            win ? 'border-win bg-winbg text-winink' : 'border-line bg-surface'
          }`}
        />
      ) : (
        <span className={`shrink-0 font-display text-2xl tabular-nums ${win ? 'text-win' : 'text-muted'}`}>
          {score ?? '–'}
        </span>
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
    save({ turno: 1, round: 1, lastResults: null, courts, history: recordPairs({}, courts) });
  };
  // Nuovo turno: rimescola evitando i compagni dei turni precedenti, riparte dal Round 1.
  const newTurno = () => {
    const history = state.history || {};
    const courts = makeTeamsAvoidingRepeats(confirmed, state.courts.length, history);
    save({ turno: (state.turno || 1) + 1, round: 1, lastResults: null, courts, history: recordPairs(history, courts) });
  };
  // Round 2: i vincenti si sfidano tra loro, i perdenti tra loro. Le coppie non cambiano → storico invariato.
  const goToRound2 = () =>
    save({ ...state, round: 2, lastResults: roundOneResults(state.courts), courts: secondRound(state.courts) });

  // Inserimento punteggio: il vincente del campo si deriva dal punteggio più alto.
  const setScore = (courtIdx, side, raw) => {
    const value = raw === '' ? null : Math.min(MAX_SCORE, Math.max(0, Math.floor(Number(raw)) || 0));
    const courts = state.courts.map((c, i) => {
      if (i !== courtIdx) return c;
      const nc = { ...c, scoreA: side === 'A' ? value : c.scoreA, scoreB: side === 'B' ? value : c.scoreB };
      nc.winner =
        nc.scoreA != null && nc.scoreB != null && nc.scoreA !== nc.scoreB ? (nc.scoreA > nc.scoreB ? 'A' : 'B') : null;
      return nc;
    });
    save({ ...state, courts });
  };

  const round = state?.round ?? 1;
  const allDecided = state?.courts.every((c) => c.winner === 'A' || c.winner === 'B');
  const courtCount = state ? state.courts.length : Number(courtsInput);
  // Nel Round 2 il campo è "Vincenti" / "Perdenti" / "Spareggio" in base alla provenienza delle squadre.
  const courtTag = (c) => {
    if (round !== 2) return null;
    const m = [c.teamA.move, c.teamB.move];
    if (m.every((x) => x === 'won')) return 'Vincenti';
    if (m.every((x) => x === 'lost')) return 'Perdenti';
    return 'Spareggio';
  };

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
            <Stat n={MAX_SCORE} k="punti / set" />
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
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Round {round}/2</span>
            <span className="flex-1 h-px bg-line" />
          </div>
          <p className="text-xs text-muted mx-1 mb-1">
            {round === 1
              ? 'Round 1: tutti giocano. Inserisci il punteggio di ogni partita — il vincente passa al Round 2 (vincenti vs vincenti, perdenti vs perdenti).'
              : 'Round 2: vincenti contro vincenti, perdenti contro perdenti. Inserisci i punteggi finali.'}
          </p>

          {round === 2 && state.lastResults && (
            <section className="anim-rise bg-surface border border-line rounded-2xl p-4 mt-3 shadow-[var(--shadow-card)]">
              <h3 className="font-display text-base mb-2">Riepilogo Round 1</h3>
              <ul className="space-y-1.5 text-sm">
                {state.lastResults.map((r) => (
                  <li key={r.court} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-muted text-xs uppercase tracking-wide">Campo {r.court + 1}</span>
                    <span className="text-win font-semibold">{r.winner.join(', ')}</span>
                    <span className="font-display tabular-nums text-sm">
                      {r.scoreWinner}–{r.scoreLoser}
                    </span>
                    <span className="text-ink/70">{r.loser.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state.courts.map((c, i) => {
            const isWinnersCourt = round === 2 && i === 0;
            return (
              <section
                key={i}
                className={`anim-rise relative bg-surface rounded-2xl p-4 my-3 border shadow-[var(--shadow-card)] ${
                  isWinnersCourt ? 'border-sun/60 court-king' : 'border-line'
                }`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {isWinnersCourt && (
                  <div
                    className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
                    style={{ background: 'linear-gradient(90deg, #FFC233, #FF5A36)' }}
                  />
                )}
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-display text-lg flex items-center gap-1.5">
                    {isWinnersCourt && <span className="crown">👑</span>} Campo {i + 1}
                  </span>
                  {courtTag(c) && (
                    <span className="text-[0.68rem] font-bold uppercase tracking-wider text-muted">{courtTag(c)}</span>
                  )}
                </div>
                <TeamRow
                  team={c.teamA}
                  score={c.scoreA}
                  win={c.scoreA != null && c.scoreB != null && c.scoreA > c.scoreB}
                  admin={admin}
                  onScore={(v) => setScore(i, 'A', v)}
                />
                <div className="text-center font-extrabold text-[0.7rem] tracking-[0.1em] text-muted my-1.5 uppercase">
                  vs
                </div>
                <TeamRow
                  team={c.teamB}
                  score={c.scoreB}
                  win={c.scoreA != null && c.scoreB != null && c.scoreB > c.scoreA}
                  admin={admin}
                  onScore={(v) => setScore(i, 'B', v)}
                />
              </section>
            );
          })}

          {admin && (
            <div className="flex flex-wrap gap-2.5 mt-4">
              {round === 1 && (
                <button className={btnPrimary} disabled={!allDecided} onClick={goToRound2}>
                  Round 2 (vincenti vs vincenti) →
                </button>
              )}
              {round === 2 && (
                <span className="self-center text-sm font-semibold">Turno finito 🎉 — rimescola per il prossimo</span>
              )}
              <button
                className={btn}
                onClick={() => {
                  if (confirm('Iniziare un nuovo turno? Le squadre vengono rimescolate.')) newTurno();
                }}
              >
                Nuovo turno
              </button>
              <button
                className={btnGhost}
                onClick={() => {
                  if (confirm('Rigenerare le squadre del turno corrente?')) generate();
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
