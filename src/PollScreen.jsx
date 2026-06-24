import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { weekCandidateDays, splitConfirmedWaitlist, parseStartTime, hasStarted } from './lib/poll.js';
import { WEEKDAYS, DEFAULT_CAPACITY, DEFAULT_COURTS, DEFAULT_TIME, DEFAULT_START, VENUE, isAdmin } from './config.js';
import { useName } from './useName.js';
import { initials, avatar } from './ui.js';

const btnBase =
  'font-semibold text-sm px-4 py-3 rounded-xl border transition active:scale-95 hover:-translate-y-px disabled:opacity-50 disabled:pointer-events-none';
const btn = `${btnBase} border-line bg-surface text-ink hover:shadow-[var(--shadow-card)]`;
const btnPrimary = `${btnBase} border-coral bg-coral text-white shadow-[0_8px_18px_-8px_rgba(255,90,54,0.7)]`;
const btnGo = `${btnBase} ml-auto border-ink bg-ink text-white no-underline`;

const fmtDow = (iso) => {
  const s = new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const weekRange = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const day = (x) => x.toLocaleDateString('it-IT', { day: 'numeric' });
  return `${day(mon)}–${sun.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`;
};

function Chip({ name, onRemove }) {
  const a = avatar(name);
  return (
    <span
      className={`inline-flex items-center gap-1.5 bg-[#F1F7F5] border border-line rounded-full pl-1 py-1 text-sm font-semibold ${
        onRemove ? 'pr-1' : 'pr-2.5'
      }`}
    >
      <span
        className="grid place-items-center w-5 h-5 rounded-full text-[0.66rem] font-extrabold"
        style={{ background: a.bg, color: a.fg }}
      >
        {initials(name)}
      </span>
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Rimuovi ${name}`}
          className="grid place-items-center w-5 h-5 rounded-full text-muted hover:text-coral hover:bg-coral/10"
        >
          ×
        </button>
      )}
    </span>
  );
}

// Pannello organizzatore: capienza (→ lista d'attesa) e numero campi (→ torneo).
function AdminBooking({ sess, onSave, onCancel }) {
  const [cap, setCap] = useState(String(sess?.capacity ?? DEFAULT_CAPACITY));
  const [courts, setCourts] = useState(String(sess?.courts ?? DEFAULT_COURTS));
  const [note, setNote] = useState(sess?.note ?? DEFAULT_TIME);
  const booked = sess?.status === 'booked';

  // Allinea i campi quando i dati della sessione arrivano/cambiano (al primo render
  // sess è ancora null → altrimenti il valore salvato resterebbe sovrascritto dal default).
  useEffect(() => {
    if (sess?.capacity != null) setCap(String(sess.capacity));
    if (sess?.courts != null) setCourts(String(sess.courts));
    if (sess?.note != null) setNote(sess.note);
  }, [sess?.capacity, sess?.courts, sess?.note]);
  const field = 'mt-1 w-full px-3 py-2 rounded-lg border border-line bg-surface outline-none focus:border-coral text-base text-ink';

  const save = () =>
    onSave({
      capacity: Math.max(1, Math.floor(Number(cap)) || DEFAULT_CAPACITY),
      courts: Math.min(5, Math.max(1, Math.floor(Number(courts)) || DEFAULT_COURTS)),
      note: note.trim() || DEFAULT_TIME,
    });

  return (
    <details className="mt-3 border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-semibold text-muted">⚙️ Gestione organizzatore</summary>
      <p className="text-sm mt-3">
        Stato:{' '}
        <b className={booked ? 'text-coral' : 'text-muted'}>{booked ? 'Prenotato ✅' : 'Non prenotato'}</b>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-muted">
          Capienza (posti)
          <input type="number" inputMode="numeric" min="1" value={cap} onChange={(e) => setCap(e.target.value)} className={field} />
        </label>
        <label className="text-xs font-semibold text-muted">
          Campi (1–5)
          <input type="number" inputMode="numeric" min="1" max="5" value={courts} onChange={(e) => setCourts(e.target.value)} className={field} />
        </label>
        <label className="col-span-2 text-xs font-semibold text-muted">
          Orario / campo
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className={btnPrimary} onClick={save}>
          {booked ? 'Salva modifiche' : 'Prenota e salva'}
        </button>
        {booked && (
          <button
            className="font-semibold text-sm px-4 py-3 rounded-xl border border-line bg-surface text-coral transition active:scale-95 hover:-translate-y-px"
            onClick={onCancel}
          >
            Annulla prenotazione
          </button>
        )}
      </div>
    </details>
  );
}

export default function PollScreen() {
  const [name, setName] = useName();
  const [nameInput, setNameInput] = useState('');
  const [conflictName, setConflictName] = useState(null); // nome già esistente da confermare
  const [checking, setChecking] = useState(false);
  const [signups, setSignups] = useState([]); // tutte le righe dei giorni candidati
  const [sessions, setSessions] = useState({}); // session_date -> row
  const days = weekCandidateDays(WEEKDAYS, new Date());
  const admin = isAdmin();
  const adminQS = admin ? `&admin=${new URLSearchParams(window.location.search).get('admin')}` : '';

  async function load() {
    const { data: su } = await supabase.from('signups').select('*').in('session_date', days);
    setSignups(su || []);
    const { data: se } = await supabase.from('sessions').select('*').in('session_date', days);
    setSessions(Object.fromEntries((se || []).map((r) => [r.session_date, r])));
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel('poll')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isIn = (date) => signups.some((s) => s.session_date === date && s.player_name === name);

  async function toggle(date) {
    if (!name) return;
    if (isIn(date)) {
      await supabase.from('signups').delete().match({ session_date: date, player_name: name });
    } else {
      await supabase.from('signups').insert({ session_date: date, player_name: name });
    }
    load();
  }

  async function saveBooking(date, { capacity, courts, note }) {
    await supabase.from('sessions').upsert({ session_date: date, status: 'booked', capacity, courts, note });
    load();
  }

  // Annulla la prenotazione (torna "non prenotato") mantenendo capienza/campi/nota.
  async function cancelBooking(date) {
    if (!confirm('Annullare la prenotazione di questo giorno?')) return;
    await supabase.from('sessions').update({ status: 'open' }).eq('session_date', date);
    load();
  }

  // Admin: rimuove un iscritto qualsiasi (ritiro last-minute). Toglie un confermato → sale il primo in attesa.
  async function removePlayer(date, playerName) {
    if (!confirm(`Rimuovere ${playerName}?`)) return;
    await supabase.from('signups').delete().match({ session_date: date, player_name: playerName });
    load();
  }

  function changeName() {
    localStorage.removeItem('bv_name');
    window.location.reload();
  }

  // Primo accesso: se il nome esiste già tra gli iscritti, chiedi se è lui o un nuovo giocatore.
  async function submitName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setChecking(true);
    const { data } = await supabase.from('signups').select('player_name').eq('player_name', trimmed).limit(1);
    setChecking(false);
    if (data && data.length > 0) setConflictName(trimmed);
    else setName(trimmed);
  }

  if (!name) {
    return (
      <main className="max-w-[600px] mx-auto px-4 pb-16">
        <div className="anim-rise bg-surface border border-line rounded-3xl p-6 mt-8 shadow-[var(--shadow-card)]">
          <h1 className="font-display text-4xl">Beach Volley 🏐</h1>

          {conflictName ? (
            <>
              <p className="mt-3">
                Esiste già un giocatore di nome <b>{conflictName}</b>. Sei tu?
              </p>
              <div className="flex flex-wrap gap-2.5 mt-4">
                <button className={btnPrimary} onClick={() => setName(conflictName)}>
                  Sì, sono io
                </button>
                <button className={btn} onClick={() => setConflictName(null)}>
                  No, sono un altro
                </button>
              </div>
              <p className="text-muted text-sm mt-3">
                Se sei un altro giocatore, aggiungi il cognome o un'iniziale per distinguerti.
              </p>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitName();
              }}
            >
              <p className="text-muted mt-1">Come ti chiami?</p>
              <input
                className="mt-3 w-full max-w-[260px] px-3 py-2.5 rounded-lg border border-line bg-surface outline-none focus:border-coral"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Il tuo nome"
                autoFocus
              />
              <div className="mt-4">
                <button className={btnPrimary} type="submit" disabled={checking || !nameInput.trim()}>
                  {checking ? 'Controllo…' : 'Entra'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-[600px] mx-auto px-4 pb-16">
      <header className="hero-sunset anim-rise relative overflow-hidden rounded-3xl px-6 pt-7 pb-8 mt-4 text-white shadow-[var(--shadow-lift)]">
        <div
          className="absolute -right-10 -top-12 w-44 h-44 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent 65%)' }}
        />
        <div className="relative">
          <div className="text-xs font-bold tracking-[0.16em] uppercase opacity-90">
            {weekRange()} · la tua settimana
          </div>
          <h1 className="font-display text-5xl mt-2 leading-[0.95]">
            Beach
            <br />
            Volley 🏐
          </h1>
          <p className="mt-2 text-[0.95rem] max-w-[32ch] opacity-95">
            Segna quando puoi. Quando il campo si riempie, prenotiamo.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-sm font-semibold">
            <span className="grid place-items-center w-6 h-6 rounded-full bg-ink text-white text-[0.7rem] font-extrabold">
              {initials(name)}
            </span>
            Ciao, {name} ·{' '}
            <button className="underline opacity-90 text-xs font-medium" onClick={changeName}>
              cambia
            </button>
          </div>
        </div>
      </header>

      <div className="flex items-baseline justify-between mt-7 mx-1">
        <span className="text-xs font-bold tracking-[0.14em] uppercase text-muted">Giorni candidati</span>
        <span className="text-sm text-muted">{days.length} disponibili</span>
      </div>

      {days.length === 0 && <p className="text-muted mt-3 mx-1">Nessun giorno candidato questa settimana.</p>}

      {days.map((date, idx) => {
        const sess = sessions[date];
        const booked = sess?.status === 'booked';
        const cap = sess?.capacity ?? DEFAULT_CAPACITY;
        const daySignups = signups.filter((s) => s.session_date === date);
        const { confirmed, waitlist } = splitConfirmedWaitlist(daySignups, cap);
        const fillPct = cap > 0 ? Math.min(100, Math.round((confirmed.length / cap) * 100)) : 0;
        const free = Math.max(0, cap - confirmed.length);
        const chips = confirmed.slice(0, 5);
        const extra = confirmed.length - chips.length;
        const sub = booked && sess?.note ? sess.note : `${DEFAULT_TIME} · da prenotare`;
        const startTime = parseStartTime(sess?.note, DEFAULT_START);
        // L'organizzatore può entrare prima (per preparare le formazioni); i giocatori dall'orario di inizio.
        const canStart = booked && (admin || hasStarted(date, startTime, new Date()));
        // Stato del giocatore corrente su questo giorno.
        const userConfirmed = confirmed.some((s) => s.player_name === name);
        const waitPos = waitlist.findIndex((s) => s.player_name === name); // -1 se non in attesa
        const full = confirmed.length >= cap;

        return (
          <section
            key={date}
            className={`anim-rise bg-surface rounded-2xl p-[18px] my-3.5 shadow-[var(--shadow-card)] border ${
              booked ? 'border-coral/35' : 'border-line'
            }`}
            style={{ animationDelay: `${idx * 0.06}s` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-2xl">{fmtDow(date)}</div>
                <div className="text-sm text-muted mt-0.5">{sub}</div>
              </div>
              {booked && (
                <span className="shrink-0 text-[0.68rem] font-extrabold tracking-wider uppercase text-white bg-coral px-2.5 py-1.5 rounded-full shadow-[0_4px_10px_-4px_rgba(255,90,54,0.6)]">
                  Prenotato
                </span>
              )}
            </div>

            <a
              href={VENUE.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-coral mt-2"
            >
              📍 {VENUE.name} · {VENUE.address}
            </a>

            <div className="mt-3.5">
              <div className="flex justify-between text-sm mb-1.5">
                <span>
                  <b className="font-extrabold">{confirmed.length}</b>/{cap} confermati
                </span>
                {waitlist.length > 0 ? (
                  <span className="text-coral font-bold">+{waitlist.length} in attesa</span>
                ) : (
                  <span className="text-muted">{free} posti liberi</span>
                )}
              </div>
              <div className="h-2.5 rounded-full bg-line overflow-hidden">
                <div className="h-full rounded-full fill-bar" style={{ width: `${fillPct}%` }} />
              </div>
            </div>

            {confirmed.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(admin ? confirmed : chips).map((s) => (
                  <Chip
                    key={s.player_name}
                    name={s.player_name}
                    onRemove={admin ? () => removePlayer(date, s.player_name) : undefined}
                  />
                ))}
                {!admin && extra > 0 && (
                  <span className="inline-flex items-center border border-dashed border-line text-muted rounded-full px-2.5 py-1 text-sm font-semibold">
                    +{extra}
                  </span>
                )}
              </div>
            )}

            {waitlist.length > 0 && (
              <details className="text-sm text-muted mt-2">
                <summary className="cursor-pointer">Lista d'attesa ({waitlist.length})</summary>
                {admin ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {waitlist.map((s) => (
                      <Chip key={s.player_name} name={s.player_name} onRemove={() => removePlayer(date, s.player_name)} />
                    ))}
                  </div>
                ) : (
                  <div className="mt-1">{waitlist.map((s) => s.player_name).join(', ')}</div>
                )}
              </details>
            )}

            <div className="flex flex-wrap gap-2.5 items-center mt-4">
              {isIn(date) ? (
                <>
                  {userConfirmed ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-sm px-4 py-3 rounded-xl bg-winbg text-win border border-win/30">
                      ✓ Confermato
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-sm px-4 py-3 rounded-xl bg-sun/20 text-ink border border-sun/50">
                      🕓 In lista d'attesa · pos. {waitPos + 1}
                    </span>
                  )}
                  <button className={`${btnBase} border-line bg-surface text-coral`} onClick={() => toggle(date)}>
                    Annulla
                  </button>
                </>
              ) : full ? (
                <button className={`${btnBase} border-sun/50 bg-sun/15 text-ink`} onClick={() => toggle(date)}>
                  Mettiti in lista d'attesa
                </button>
              ) : (
                <button className={btnPrimary} onClick={() => toggle(date)}>
                  Ci sono
                </button>
              )}
              {booked &&
                (canStart ? (
                  <a className={btnGo} href={`?date=${date}&view=tournament${adminQS}`}>
                    Inizia Torneo →
                  </a>
                ) : (
                  <span className={`${btnGo} opacity-50 pointer-events-none`} aria-disabled="true">
                    Inizia alle {startTime}
                  </span>
                ))}
            </div>

            {admin && (
              <AdminBooking sess={sess} onSave={(v) => saveBooking(date, v)} onCancel={() => cancelBooking(date)} />
            )}
          </section>
        );
      })}
    </main>
  );
}
