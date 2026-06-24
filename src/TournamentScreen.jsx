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
import { initials, avatar } from './ui.js';

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

const CHIP_TONES = {
  plain: 'bg-ground text-ink', // su card bianca
  onGreen: 'bg-white text-winink', // su squadra vincente (sfondo verde)
  win: 'bg-winbg text-winink', // vincente su card bianca (archivio)
};

function PlayerChip({ name, tone = 'plain', organizer }) {
  const a = avatar(name);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-sm font-medium ${CHIP_TONES[tone]} ${
        organizer ? 'ring-1 ring-sun' : ''
      }`}
    >
      <span
        className="grid place-items-center w-5 h-5 rounded-full text-[0.6rem] font-extrabold"
        style={{ background: a.bg, color: a.fg }}
      >
        {initials(name)}
      </span>
      {organizer && <span title="Organizzatore">👑</span>}
      {name}
    </span>
  );
}

function TeamRow({ team, score, win, onScore, admin, organizerName }) {
  return (
    <div
      className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition ${
        win ? 'bg-winbg border-win/35' : 'border-line'
      }`}
    >
      <div className="min-w-0">
        {team.move && <MoveBadge move={team.move} from={team.fromCourt} />}
        <div className="flex flex-wrap gap-1.5">
          {team.players.map((p) => (
            <PlayerChip key={p} name={p} tone={win ? 'onGreen' : 'plain'} organizer={p === organizerName} />
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

// Transizione: alla variazione di swapKey la vista vecchia esce a sinistra
// mentre la nuova entra da destra (doppio buffer, nessuna libreria).
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
    prevNode.current = children; // stesso turno: aggiorna lo snapshot più recente
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

// Una partita dell'archivio: mini-tabellone con vincente in evidenza sopra.
function MatchResult({ r }) {
  const decided = !!r.winner;
  const top = decided ? r.winner : r.teamA;
  const bottom = decided ? r.loser : r.teamB;
  const sTop = decided ? r.scoreWinner : r.scoreA;
  const sBottom = decided ? r.scoreLoser : r.scoreB;
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <div className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted mb-1.5">
        Campo {r.court + 1}
        {!decided && ' · non conclusa'}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {top.map((p) => (
            <PlayerChip key={p} name={p} tone={decided ? 'win' : 'plain'} />
          ))}
        </div>
        <span className={`font-display tabular-nums text-lg shrink-0 ${decided ? 'text-win' : 'text-muted'}`}>
          {sTop ?? '–'}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3 mt-1.5">
        <div className="flex flex-wrap gap-1">
          {bottom.map((p) => (
            <PlayerChip key={p} name={p} tone="plain" />
          ))}
        </div>
        <span className="font-display tabular-nums text-lg text-muted shrink-0">{sBottom ?? '–'}</span>
      </div>
    </div>
  );
}

function RoundBlock({ label, results }) {
  if (!results?.length) return null;
  return (
    <div>
      <div className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-coral mb-2">{label}</div>
      <div className="space-y-2">
        {results.map((r) => (
          <MatchResult key={r.court} r={r} />
        ))}
      </div>
    </div>
  );
}

function ArchiveSection({ archive }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-5 mt-4 shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-display text-xl">Turni giocati</h2>
        <span className="text-xs text-muted">
          {archive.length} {archive.length === 1 ? 'turno' : 'turni'}
        </span>
      </div>
      <div className="divide-y divide-line">
        {[...archive].reverse().map((t) => (
          <details key={t.turno} className="py-1">
            <summary className="cursor-pointer py-2.5 font-display text-lg">Turno {t.turno}</summary>
            <div className="pb-3 space-y-4">
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
  const [state, setState] = useState(null); // { turno, courts }
  const [confirmed, setConfirmed] = useState([]);
  const [courtsInput, setCourtsInput] = useState(DEFAULT_COURTS);
  const [savedCourts, setSavedCourts] = useState(null); // campi decisi in prenotazione
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
    // Campi decisi dall'organizzatore in prenotazione (finché il torneo non è generato).
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
    await supabase
      .from('tournaments')
      .upsert({ session_date: date, state: next, updated_at: new Date().toISOString() });
  }

  // Vincoli per campo: min 4 (2vs2), max 12 (6vs6).
  const minCourts = Math.max(1, Math.ceil(confirmed.length / 12)); // così nessun campo supera 12
  const maxFeasibleCourts = Math.floor(confirmed.length / 4); // così ogni campo ha almeno 4
  // Limita i campi richiesti all'intervallo sostenibile (e al tetto fisico di 5).
  const clampCourts = (n) => {
    const hi = Math.min(5, maxFeasibleCourts);
    return Math.max(minCourts, Math.min(n, hi));
  };

  // Genera turno 1 da zero (nessun turno precedente, archivio vuoto).
  const generate = () => {
    if (maxFeasibleCourts < 1) {
      alert('Servono almeno 4 giocatori per un campo (2 vs 2).');
      return;
    }
    const courts = makeTeamsAvoidingRepeats(confirmed, clampCourts(Number(courtsInput)));
    save({ turno: 1, round: 1, lastResults: null, courts, history: recordPairs({}, courts), historyBefore: {}, archive: [] });
  };
  // Numero campi effettivo = scelta dell'organizzatore, limitata dai vincoli per campo.
  const effectiveCourts = () => clampCourts(savedCourts ?? state.courts.length);

  // Rigenera: ri-estrae le squadre del SOLO turno corrente. Mantiene archivio,
  // numero di turno e storico precedente (usa historyBefore come baseline).
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
  // Nuovo turno: archivia i risultati del turno appena finito, poi rimescola
  // (evitando i compagni dei turni precedenti) e riparte dal Round 1.
  const newTurno = () => {
    const before = state.history || {}; // baseline = tutte le coppie fin qui, incluso il turno concluso
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
          <a className="text-white/80 text-sm no-underline" href="?">
            ← Sondaggio
          </a>
          <h1 className="font-display text-4xl mt-2.5 leading-none">Torneo</h1>
          <div className="text-white/80 text-sm mt-1">{date}</div>
          <a
            href={VENUE.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-white/80 text-sm underline mt-1"
          >
            📍 {VENUE.name}
          </a>
          <div className="flex gap-7 mt-4">
            <Stat n={confirmed.length} k="giocatori" />
            <Stat n={courtCount} k="campi" />
            <Stat n={MAX_SCORE} k="punti / set" />
          </div>
        </div>
      </header>

      {!state && admin && (
        <section className="anim-rise bg-surface border border-line rounded-2xl p-5 mt-5 shadow-[var(--shadow-card)]">
          {savedCourts != null && !editCourts ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-muted">Campi prenotati</div>
                <div className="font-display text-3xl leading-none mt-0.5">{savedCourts}</div>
              </div>
              <button
                className="text-coral text-sm font-semibold"
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
                className="w-24 px-3 py-2.5 rounded-lg border border-line bg-surface outline-none focus:border-coral"
              />
            </>
          )}
          <p className="text-xs text-muted mt-3">
            Da 4 (2vs2) a 12 (6vs6) giocatori per campo. Con {confirmed.length}{' '}
            {confirmed.length === 1 ? 'presente' : 'presenti'}:{' '}
            {maxFeasibleCourts < 1
              ? 'servono almeno 4 giocatori.'
              : `da ${minCourts} a ${Math.min(5, maxFeasibleCourts)} ${
                  Math.min(5, maxFeasibleCourts) === 1 ? 'campo' : 'campi'
                }.`}
          </p>
          <div className="mt-3">
            <button className={btnPrimary} onClick={generate} disabled={maxFeasibleCourts < 1}>
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
          {savedCourts != null && effectiveCourts() !== state.courts.length && (
            <div className="mt-4 rounded-2xl border border-coral/40 bg-coral/5 p-4">
              <p className="text-sm font-semibold">Campi aggiornati a {effectiveCourts()}</p>
              <p className="text-sm text-muted mt-0.5">
                Le formazioni attuali sono su {state.courts.length} campi.
              </p>
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
                className={`relative bg-surface rounded-2xl p-4 my-3 border shadow-[var(--shadow-card)] ${
                  isWinnersCourt ? 'border-sun/60 court-king' : 'border-line'
                }`}
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
                  organizerName={organizerName}
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
                  organizerName={organizerName}
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
