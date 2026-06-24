import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import {
  makeTeamsAvoidingRepeats,
  secondRound,
  roundOneResults,
  summarizeRound,
  recordPairs,
} from './lib/tournament.js';
import { splitConfirmedWaitlist } from './lib/poll.js';
import { DEFAULT_CAPACITY, DEFAULT_COURTS, MAX_SCORE, VENUE, isAdmin } from './config.js';
import { Ball } from './Ball.jsx';

const btnPrimary =
  'font-semibold text-sm px-4 py-2.5 rounded-xl bg-night text-white no-underline transition active:scale-[.99] disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'font-semibold text-sm px-4 py-2.5 rounded-xl border border-line2 bg-surface text-ink no-underline transition active:scale-[.99]';
const btnGhost = 'font-semibold text-sm px-4 py-2.5 rounded-xl text-accent transition active:scale-[.99]';

function Stat({ n, k }) {
  return (
    <div>
      <div className="font-display text-[1.5rem] font-bold leading-none tabular-nums">{n}</div>
      <div className="text-[0.72rem] text-muted mt-1">{k}</div>
    </div>
  );
}

function MoveBadge({ move, from }) {
  const map = {
    won: { t: `↑ vincente · Campo ${from + 1}`, c: 'text-accent bg-accentsoft' },
    lost: { t: `↓ perdente · Campo ${from + 1}`, c: 'text-muted bg-ground border border-line' },
  };
  const m = map[move];
  if (!m) return null;
  return (
    <span className={`inline-block text-[0.62rem] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 mb-1 ${m.c}`}>
      {m.t}
    </span>
  );
}

// Nomi squadra come testo (👑 sull'organizzatore), ✓ se vincente.
function teamNames(players, win, organizerName) {
  return players.map((p) => (p === organizerName ? `👑 ${p}` : p)).join(', ');
}

function TeamRow({ team, score, win, onScore, admin, organizerName }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl ${win ? 'bg-accentsoft' : ''}`}>
      <div className="flex-1 min-w-0">
        {team.move && <MoveBadge move={team.move} from={team.fromCourt} />}
        <div className={`text-[0.92rem] leading-snug ${win ? 'font-semibold text-accent' : 'font-medium'}`}>
          {win && <span className="mr-1">✓</span>}
          <span className={win ? 'text-ink' : ''}>{teamNames(team.players, win, organizerName)}</span>
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
          className={`shrink-0 w-14 text-center font-display text-xl font-bold tabular-nums px-1 py-2 rounded-lg border outline-none focus:border-accent ${
            win ? 'border-accent bg-accentsoft text-accent' : 'border-line2 bg-surface'
          }`}
        />
      ) : (
        <span className={`shrink-0 font-display text-2xl font-bold tabular-nums ${win ? 'text-accent' : 'text-faint'}`}>
          {score ?? '–'}
        </span>
      )}
    </div>
  );
}

// Doppio buffer: la vista vecchia esce a sinistra mentre la nuova entra da destra.
function SlideSwap({ swapKey, children }) {
  const prevKey = useRef(swapKey);
  const prevNode = useRef(children);
  const [exiting, setExiting] = useState(null);

  useEffect(() => {
    if (prevKey.current !== swapKey) {
      setExiting({ key: prevKey.current, node: prevNode.current });
      const t = setTimeout(() => setExiting(null), 420);
      prevKey.current = swapKey;
      prevNode.current = children;
      return () => clearTimeout(t);
    }
    prevNode.current = children;
  }, [swapKey, children]);

  return (
    <div className="relative">
      {exiting && (
        <div key={`exit-${exiting.key}`} className="slide-out absolute inset-x-0 top-0" aria-hidden="true">
          {exiting.node}
        </div>
      )}
      <div key={swapKey} className="slide-in">
        {children}
      </div>
    </div>
  );
}

// Una partita dell'archivio.
function MatchResult({ r }) {
  const decided = !!r.winner;
  const top = decided ? r.winner : r.teamA;
  const bottom = decided ? r.loser : r.teamB;
  const sTop = decided ? r.scoreWinner : r.scoreA;
  const sBottom = decided ? r.scoreLoser : r.scoreB;
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-faint mb-1.5">
        Campo {r.court + 1}
        {!decided && ' · non conclusa'}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium min-w-0">
          {decided && <span className="text-accent mr-1">✓</span>}
          {top.join(', ')}
        </div>
        <span className={`font-display text-base font-bold tabular-nums shrink-0 ${decided ? 'text-accent' : 'text-faint'}`}>
          {sTop ?? '–'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 mt-1.5">
        <div className="text-sm text-muted min-w-0">{bottom.join(', ')}</div>
        <span className="font-display text-base font-bold tabular-nums text-faint shrink-0">{sBottom ?? '–'}</span>
      </div>
    </div>
  );
}

function RoundBlock({ label, results }) {
  if (!results?.length) return null;
  return (
    <div>
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-faint mb-2">{label}</div>
      <div className="flex flex-col gap-2">
        {results.map((r) => (
          <MatchResult key={r.court} r={r} />
        ))}
      </div>
    </div>
  );
}

function ArchiveSection({ archive }) {
  return (
    <section className="bg-surface border border-line rounded-2xl px-5 py-4 mt-4 shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-display text-lg font-bold">Turni giocati</h2>
        <span className="text-xs text-muted">
          {archive.length} {archive.length === 1 ? 'turno' : 'turni'}
        </span>
      </div>
      <div className="divide-y divide-line">
        {[...archive].reverse().map((t) => (
          <details key={t.turno} className="py-1">
            <summary className="cursor-pointer py-2.5 font-display text-base font-bold">Turno {t.turno}</summary>
            <div className="pb-3 flex flex-col gap-4">
              <RoundBlock label="Round 1" results={t.round1} />
              <RoundBlock label="Round 2" results={t.round2} />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function TournamentScreen({ date }) {
  const [state, setState] = useState(null);
  const [confirmed, setConfirmed] = useState([]);
  const [courtsInput, setCourtsInput] = useState(DEFAULT_COURTS);
  const [savedCourts, setSavedCourts] = useState(null);
  const [editCourts, setEditCourts] = useState(false);
  const [organizerName, setOrganizerName] = useState(null);
  const admin = isAdmin();

  async function load() {
    const { data: su } = await supabase.from('signups').select('*').eq('session_date', date);
    const { data: se } = await supabase.from('sessions').select('capacity, courts').eq('session_date', date).maybeSingle();
    const cap = se?.capacity ?? DEFAULT_CAPACITY;
    setConfirmed(splitConfirmedWaitlist(su || [], cap).confirmed.map((s) => s.player_name));
    const { data: t } = await supabase.from('tournaments').select('state').eq('session_date', date).maybeSingle();
    setState(t?.state ?? null);
    setSavedCourts(se?.courts ?? null);
    if (!t?.state && se?.courts) setCourtsInput(se.courts);
    const { data: st } = await supabase.from('settings').select('organizer_name').eq('id', 1).maybeSingle();
    setOrganizerName(st?.organizer_name ?? null);
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
    await supabase.from('tournaments').upsert({ session_date: date, state: next, updated_at: new Date().toISOString() });
  }

  // Vincoli per campo: min 4 (2vs2), max 12 (6vs6).
  const minCourts = Math.max(1, Math.ceil(confirmed.length / 12));
  const maxFeasibleCourts = Math.floor(confirmed.length / 4);
  const clampCourts = (n) => {
    const hi = Math.min(5, maxFeasibleCourts);
    return Math.max(minCourts, Math.min(n, hi));
  };

  const generate = () => {
    if (maxFeasibleCourts < 1) {
      alert('Servono almeno 4 giocatori per un campo (2 vs 2).');
      return;
    }
    const courts = makeTeamsAvoidingRepeats(confirmed, clampCourts(Number(courtsInput)));
    save({ turno: 1, round: 1, lastResults: null, courts, history: recordPairs({}, courts), historyBefore: {}, archive: [] });
  };
  const effectiveCourts = () => clampCourts(savedCourts ?? state.courts.length);

  const regenerate = () => {
    const before = state.historyBefore || {};
    const courts = makeTeamsAvoidingRepeats(confirmed, effectiveCourts(), before);
    save({
      turno: state.turno,
      round: 1,
      lastResults: null,
      courts,
      history: recordPairs(before, courts),
      historyBefore: before,
      archive: state.archive || [],
    });
  };
  const newTurno = () => {
    const before = state.history || {};
    const entry = {
      turno: state.turno,
      round1: round === 2 ? state.lastResults || [] : summarizeRound(state.courts),
      round2: round === 2 ? summarizeRound(state.courts) : [],
    };
    const courts = makeTeamsAvoidingRepeats(confirmed, effectiveCourts(), before);
    save({
      turno: (state.turno || 1) + 1,
      round: 1,
      lastResults: null,
      courts,
      history: recordPairs(before, courts),
      historyBefore: before,
      archive: [...(state.archive || []), entry],
    });
  };
  const goToRound2 = () =>
    save({ ...state, round: 2, lastResults: roundOneResults(state.courts), courts: secondRound(state.courts) });

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
  const courtTag = (c) => {
    if (round !== 2) return null;
    const m = [c.teamA.move, c.teamB.move];
    if (m.every((x) => x === 'won')) return 'Vincenti';
    if (m.every((x) => x === 'lost')) return 'Perdenti';
    return 'Spareggio';
  };

  return (
    <main className="max-w-[460px] mx-auto px-5 pb-20">
      <header className="anim-rise pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Ball className="w-6 h-6 text-accent" />
            <h1 className="font-display text-[1.3rem] font-bold">Torneo</h1>
          </div>
          <a className={btnOutline} href="?">
            ← Sondaggio
          </a>
        </div>
        <a
          href={VENUE.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted no-underline"
        >
          📍 <b className="text-ink font-semibold">{VENUE.name}</b> · {date}
        </a>
        <div className="flex gap-8 mt-5">
          <Stat n={confirmed.length} k="giocatori" />
          <Stat n={courtCount} k="campi" />
          <Stat n={MAX_SCORE} k="punti/set" />
        </div>
      </header>

      {!state && admin && (
        <section className="anim-rise bg-surface border border-line rounded-2xl p-5 mt-6 shadow-[var(--shadow-card)]">
          {savedCourts != null && !editCourts ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-muted">Campi prenotati</div>
                <div className="font-display text-3xl font-bold leading-none mt-1">{savedCourts}</div>
              </div>
              <button
                className="text-accent text-sm font-semibold"
                onClick={() => {
                  setCourtsInput(savedCourts);
                  setEditCourts(true);
                }}
              >
                cambia
              </button>
            </div>
          ) : (
            <>
              <label className="block text-sm font-semibold mb-2">Campi prenotati</label>
              <input
                type="number"
                min="1"
                max="5"
                value={courtsInput}
                onChange={(e) => setCourtsInput(e.target.value)}
                className="w-24 px-3 py-2.5 rounded-lg border border-line bg-surface outline-none focus:border-accent"
              />
            </>
          )}
          <p className="text-xs text-muted mt-3">
            Da 4 (2vs2) a 12 (6vs6) per campo. Con {confirmed.length} {confirmed.length === 1 ? 'presente' : 'presenti'}:{' '}
            {maxFeasibleCourts < 1
              ? 'servono almeno 4 giocatori.'
              : `da ${minCourts} a ${Math.min(5, maxFeasibleCourts)} ${
                  Math.min(5, maxFeasibleCourts) === 1 ? 'campo' : 'campi'
                }.`}
          </p>
          <button className={`${btnPrimary} mt-4 w-full`} onClick={generate} disabled={maxFeasibleCourts < 1}>
            Genera formazioni
          </button>
        </section>
      )}
      {!state && !admin && <p className="text-muted mt-6 mx-0.5">In attesa che l'organizzatore generi le formazioni…</p>}

      {state && (
        <>
          {savedCourts != null && effectiveCourts() !== state.courts.length && (
            <div className="mt-5 rounded-2xl border border-accent/40 bg-accentsoft p-4">
              <p className="text-sm font-semibold">Campi aggiornati a {effectiveCourts()}</p>
              <p className="text-sm text-muted mt-0.5">Le formazioni attuali sono su {state.courts.length} campi.</p>
              {admin && (
                <button
                  className={`${btnPrimary} mt-3`}
                  onClick={() => {
                    if (confirm(`Rigenerare le formazioni su ${effectiveCourts()} campi? Il turno corrente verrà rifatto.`)) regenerate();
                  }}
                >
                  Rigenera su {effectiveCourts()} campi
                </button>
              )}
            </div>
          )}

          {state.archive?.length > 0 && <ArchiveSection archive={state.archive} />}

          <SlideSwap swapKey={`${state.turno}-${round}`}>
            <div className="flex items-center gap-3 mt-8 mx-0.5">
              <span className="font-display text-lg font-bold">Turno {state.turno}</span>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted border border-line rounded-full px-2 py-0.5">
                Round {round}/2
              </span>
              <span className="flex-1 h-px bg-line" />
            </div>
            <p className="text-xs text-muted mx-0.5 mt-2 mb-3">
              {round === 1
                ? 'Round 1: tutti giocano. Inserisci i punteggi — il vincente passa al Round 2 (vincenti vs vincenti, perdenti vs perdenti).'
                : 'Round 2: vincenti contro vincenti, perdenti contro perdenti. Inserisci i punteggi finali.'}
            </p>

            {round === 2 && state.lastResults && (
              <section className="bg-surface border border-line rounded-2xl p-4 mb-1 shadow-[var(--shadow-card)]">
                <h3 className="font-display text-base font-bold mb-2">Riepilogo Round 1</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {state.lastResults.map((r) => (
                    <li key={r.court} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-faint text-xs uppercase tracking-wide">Campo {r.court + 1}</span>
                      <span className="text-accent font-semibold">{r.winner.join(', ')}</span>
                      <span className="font-display tabular-nums font-bold text-sm">
                        {r.scoreWinner}–{r.scoreLoser}
                      </span>
                      <span className="text-muted">{r.loser.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex flex-col gap-3 mt-3">
              {state.courts.map((c, i) => {
                const isWinnersCourt = round === 2 && i === 0;
                return (
                  <section
                    key={i}
                    className={`bg-surface rounded-2xl p-4 border shadow-[var(--shadow-card)] ${
                      isWinnersCourt ? 'border-accent/40' : 'border-line'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display text-base font-bold flex items-center gap-1.5">
                        {isWinnersCourt && '👑'} Campo {i + 1}
                      </span>
                      {courtTag(c) && (
                        <span className="text-[0.66rem] font-semibold uppercase tracking-wider text-faint">
                          {courtTag(c)}
                        </span>
                      )}
                    </div>
                    <TeamRow
                      team={c.teamA}
                      score={c.scoreA}
                      win={c.scoreA != null && c.scoreB != null && c.scoreA > c.scoreB}
                      admin={admin}
                      organizerName={organizerName}
                      onScore={(v) => setScore(i, 'A', v)}
                    />
                    <div className="flex items-center gap-3 my-1 mx-1 text-faint text-[0.62rem] font-semibold uppercase tracking-[0.14em]">
                      <span className="flex-1 h-px bg-line" />
                      vs
                      <span className="flex-1 h-px bg-line" />
                    </div>
                    <TeamRow
                      team={c.teamB}
                      score={c.scoreB}
                      win={c.scoreA != null && c.scoreB != null && c.scoreB > c.scoreA}
                      admin={admin}
                      organizerName={organizerName}
                      onScore={(v) => setScore(i, 'B', v)}
                    />
                  </section>
                );
              })}
            </div>

            {admin && (
              <div className="flex flex-wrap items-center gap-2.5 mt-5">
                {round === 1 && (
                  <button className={btnPrimary} disabled={!allDecided} onClick={goToRound2}>
                    Round 2 →
                  </button>
                )}
                {round === 2 && <span className="text-sm font-semibold text-accent">Turno finito 🎉</span>}
                <button
                  className={btnOutline}
                  onClick={() => {
                    if (confirm('Iniziare un nuovo turno? Le squadre vengono rimescolate.')) newTurno();
                  }}
                >
                  Nuovo turno
                </button>
                <button
                  className={btnGhost}
                  onClick={() => {
                    if (confirm('Rigenerare le squadre del turno corrente? (i turni già giocati restano)')) regenerate();
                  }}
                >
                  Rigenera
                </button>
              </div>
            )}
          </SlideSwap>
        </>
      )}
    </main>
  );
}
