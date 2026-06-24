import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { weekCandidateDays, splitConfirmedWaitlist, parseStartTime, hasStarted } from './lib/poll.js';
import {
  WEEKDAYS,
  DEFAULT_CAPACITY,
  DEFAULT_COURTS,
  DEFAULT_TIME,
  DEFAULT_START,
  VENUE,
  isAdmin,
  loginAdmin,
  logoutAdmin,
} from './config.js';
import { useName } from './useName.js';
import { initials, avatarColor } from './ui.js';
import { Ball } from './Ball.jsx';

const btnPrimary =
  'block w-full text-center font-semibold text-[0.95rem] px-4 py-3 rounded-xl bg-night text-white no-underline transition active:scale-[.99] disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'block w-full text-center font-semibold text-[0.95rem] px-4 py-3 rounded-xl border border-line2 bg-surface text-ink no-underline transition hover:border-ink active:scale-[.99] disabled:opacity-50 disabled:pointer-events-none';
const statusBox = 'block w-full text-center font-semibold text-[0.95rem] px-4 py-3 rounded-xl';
const undoLink = 'block mx-auto text-xs text-faint underline';
const btnSm = 'font-semibold text-sm px-4 py-2.5 rounded-lg bg-night text-white transition active:scale-[.99] disabled:opacity-50';
const btnSmOutline = 'font-semibold text-sm px-4 py-2.5 rounded-lg border border-line2 bg-surface text-ink transition';
const field = 'mt-1 w-full px-3 py-2 rounded-lg border border-line bg-surface outline-none focus:border-accent text-base text-ink';

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

function Avatar({ name, size = 'sm', stack }) {
  const sz = { lg: 'w-10 h-10 text-[0.85rem]', sm: 'w-7 h-7 text-[0.68rem]', xs: 'w-5 h-5 text-[0.6rem]' }[size];
  return (
    <span
      className={`grid place-items-center rounded-full text-white font-bold flex-none ${sz}${
        stack ? ' ring-[2.5px] ring-surface -ml-2 first:ml-0' : ''
      }`}
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}

function AvatarStack({ players, max = 4 }) {
  const shown = players.slice(0, max);
  const extra = players.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p) => (
        <Avatar key={p} name={p} stack />
      ))}
      {extra > 0 && (
        <span className="-ml-2 grid place-items-center w-7 h-7 rounded-full text-[0.66rem] font-semibold text-muted bg-surface border border-dashed border-line2 ring-[2.5px] ring-surface">
          +{extra}
        </span>
      )}
    </div>
  );
}

function Chip({ name, organizer, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-ground border border-line rounded-full pl-1 pr-1 py-1 text-sm font-medium">
      <Avatar name={name} size="xs" />
      {organizer && <span title="Organizzatore">👑</span>}
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Rimuovi ${name}`}
          className="grid place-items-center w-5 h-5 rounded-full text-faint hover:text-ink hover:bg-line"
        >
          ×
        </button>
      )}
    </span>
  );
}

// Accesso organizzatore via PIN (sessione in localStorage, URL pulito).
function AdminLogin({ topClass = 'mt-12' }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (loginAdmin(pin)) window.location.reload();
    else setErr(true);
  };
  if (!open) {
    return (
      <button className={`block mx-auto ${topClass} text-xs text-faint underline`} onClick={() => setOpen(true)}>
        Sei l'organizzatore? Accedi
      </button>
    );
  }
  return (
    <form onSubmit={submit} className={`${topClass} flex flex-wrap items-center justify-center gap-2`}>
      <input
        type="password"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value);
          setErr(false);
        }}
        placeholder="PIN organizzatore"
        autoFocus
        className="px-3 py-2 rounded-lg border border-line bg-surface outline-none focus:border-accent text-sm"
      />
      <button className={btnSm} type="submit">
        Accedi
      </button>
      {err && <span className="w-full text-center text-accent text-xs">PIN errato</span>}
    </form>
  );
}

// Giorni della settimana in ordine Lun..Dom con il relativo numero JS (0=Dom).
const WD_LABELS = [
  ['Lun', 1], ['Mar', 2], ['Mer', 3], ['Gio', 4], ['Ven', 5], ['Sab', 6], ['Dom', 0],
];

function DaysSettings({ weekdays, onSave, notify }) {
  const [sel, setSel] = useState(weekdays);
  const ref = useRef(null);
  useEffect(() => setSel(weekdays), [weekdays.join(',')]);
  const toggle = (d) => setSel((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));
  const save = async () => {
    await onSave([...sel].sort((a, b) => a - b));
    notify('Giorni salvati');
    if (ref.current) ref.current.open = false;
  };
  return (
    <details ref={ref} className="bg-surface border border-line rounded-2xl px-4 py-3 mt-4 shadow-[var(--shadow-card)]">
      <summary className="cursor-pointer text-sm font-semibold text-muted">Giorni ricorrenti</summary>
      <p className="text-xs text-muted mt-2">In quali giorni della settimana si propone di giocare.</p>
      <div className="flex flex-wrap gap-2 mt-3">
        {WD_LABELS.map(([label, d]) => (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className={`px-3 py-2 rounded-full border text-sm font-semibold transition ${
              sel.includes(d) ? 'bg-night text-white border-night' : 'bg-surface text-ink border-line2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button className={`${btnSm} mt-3`} disabled={sel.length === 0} onClick={save}>
        Salva giorni
      </button>
    </details>
  );
}

function AdminBooking({ sess, onSave, onCancel, notify }) {
  const [cap, setCap] = useState(String(sess?.capacity ?? DEFAULT_CAPACITY));
  const [courts, setCourts] = useState(String(sess?.courts ?? DEFAULT_COURTS));
  const [note, setNote] = useState(sess?.note ?? DEFAULT_TIME);
  const booked = sess?.status === 'booked';
  const ref = useRef(null);

  useEffect(() => {
    if (sess?.capacity != null) setCap(String(sess.capacity));
    if (sess?.courts != null) setCourts(String(sess.courts));
    if (sess?.note != null) setNote(sess.note);
  }, [sess?.capacity, sess?.courts, sess?.note]);

  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  const save = async () => {
    await onSave({
      capacity: Math.max(1, Math.floor(Number(cap)) || DEFAULT_CAPACITY),
      courts: Math.min(5, Math.max(1, Math.floor(Number(courts)) || DEFAULT_COURTS)),
      note: note.trim() || DEFAULT_TIME,
    });
    notify(booked ? 'Modifiche salvate' : 'Giorno prenotato');
    close();
  };
  const cancel = async () => {
    if (await onCancel()) {
      notify('Prenotazione annullata');
      close();
    }
  };

  return (
    <details ref={ref} className="border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-semibold text-muted">Gestione organizzatore</summary>
      <p className="text-sm mt-3">
        Stato: <b className={booked ? 'text-accent' : 'text-muted'}>{booked ? 'Prenotato' : 'Non prenotato'}</b>
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
        <button className={btnSm} onClick={save}>
          {booked ? 'Salva modifiche' : 'Prenota e salva'}
        </button>
        {booked && (
          <button className={`${btnSmOutline} text-accent`} onClick={cancel}>
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
  const [conflictName, setConflictName] = useState(null);
  const [checking, setChecking] = useState(false);
  const [signups, setSignups] = useState([]);
  const [sessions, setSessions] = useState({});
  const [weekdays, setWeekdays] = useState(WEEKDAYS);
  const [organizerName, setOrganizerName] = useState(null);
  const [toast, setToast] = useState(null);
  const days = weekCandidateDays(weekdays, new Date());
  const admin = isAdmin();
  const notify = (msg) => setToast(msg);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    const { data: st } = await supabase.from('settings').select('weekdays, organizer_name').eq('id', 1).maybeSingle();
    const wd = st?.weekdays ?? WEEKDAYS;
    setWeekdays(wd);
    setOrganizerName(st?.organizer_name ?? null);
    const ds = weekCandidateDays(wd, new Date());
    const { data: su } = await supabase.from('signups').select('*').in('session_date', ds);
    setSignups(su || []);
    const { data: se } = await supabase.from('sessions').select('*').in('session_date', ds);
    setSessions(Object.fromEntries((se || []).map((r) => [r.session_date, r])));
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel('poll')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveWeekdays(wd) {
    await supabase.from('settings').update({ weekdays: wd }).eq('id', 1);
    load();
  }

  async function claimOrganizer() {
    await supabase.from('settings').update({ organizer_name: name }).eq('id', 1);
    load();
  }

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

  async function cancelBooking(date) {
    if (!confirm('Annullare la prenotazione di questo giorno?')) return false;
    await supabase.from('sessions').update({ status: 'open' }).eq('session_date', date);
    load();
    return true;
  }

  async function removePlayer(date, playerName) {
    if (!confirm(`Rimuovere ${playerName}?`)) return;
    await supabase.from('signups').delete().match({ session_date: date, player_name: playerName });
    load();
  }

  function changeName() {
    localStorage.removeItem('bv_name');
    window.location.reload();
  }

  async function submitName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setChecking(true);
    const { data } = await supabase.from('signups').select('player_name').eq('player_name', trimmed).limit(1);
    setChecking(false);
    if (data && data.length > 0) setConflictName(trimmed);
    else setName(trimmed);
  }

  // ---- Schermata nome (primo accesso) ----
  if (!name) {
    return (
      <main className="min-h-screen max-w-[460px] mx-auto px-5 flex flex-col">
        <header className="flex items-center gap-2 pt-5">
          <Ball className="w-6 h-6 text-accent" />
          <span className="font-display text-[1.15rem] font-bold">Beach Volley</span>
        </header>

        <section className="flex-1 flex flex-col justify-center py-10">
          <h1 className="font-display text-[2.2rem] font-bold leading-[1.08] text-balance">
            Gestione partite e tornei
          </h1>
          <p className="text-muted mt-3 text-[1.02rem]">
            Segnala la disponibilità per le serate e segui i tornei del gruppo.
          </p>

          <div className="anim-rise bg-surface border border-line rounded-2xl p-5 mt-7 shadow-[var(--shadow-card)]">
            {conflictName ? (
              <>
                <p>
                  Esiste già un giocatore di nome <b>{conflictName}</b>. Sei tu?
                </p>
                <div className="flex flex-col gap-2 mt-4">
                  <button className={btnPrimary} onClick={() => setName(conflictName)}>
                    Sì, sono io
                  </button>
                  <button className={btnOutline} onClick={() => setConflictName(null)}>
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
                <label className="text-sm font-semibold">Come ti chiami?</label>
                <input
                  className="mt-2 w-full px-3 py-3 rounded-xl border border-line bg-surface outline-none focus:border-accent"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Il tuo nome"
                  autoFocus
                />
                <button className={`${btnPrimary} mt-3`} type="submit" disabled={checking || !nameInput.trim()}>
                  {checking ? 'Controllo…' : 'Entra'}
                </button>
              </form>
            )}
          </div>

          <ul className="mt-7 flex flex-col gap-3 text-sm text-muted">
            {[
              'Presenze settimanali con lista d\'attesa',
              'Campi e formazioni generati in automatico',
              'Tornei live con punteggi e turni',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent flex-none" />
                {f}
              </li>
            ))}
          </ul>
        </section>

        <footer className="py-6 flex flex-col items-center gap-3 text-center">
          <a
            href={VENUE.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-faint no-underline"
          >
            📍 {VENUE.name} · {VENUE.address}
          </a>
          <AdminLogin topClass="" />
        </footer>
      </main>
    );
  }

  // ---- Sondaggio ----
  return (
    <main className="max-w-[460px] mx-auto px-5 pb-20">
      <header className="anim-rise flex items-center justify-between gap-3 pt-4">
        <div className="flex items-center gap-2">
          <Ball className="w-6 h-6 text-accent" />
          <h1 className="font-display text-[1.3rem] font-bold">Beach Volley</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="text-right leading-tight">
            <div className="text-[0.72rem] text-muted">ciao</div>
            <div className="text-sm font-semibold">{name}</div>
          </div>
          <Avatar name={name} size="lg" />
        </div>
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <button className="underline" onClick={changeName}>
          cambia nome
        </button>
        {admin &&
          (organizerName === name ? (
            <span className="text-accent font-semibold">👑 Organizzatore</span>
          ) : (
            <button className="underline" onClick={claimOrganizer}>
              Sono io l'organizzatore
            </button>
          ))}
        {admin && (
          <button
            className="underline"
            onClick={() => {
              logoutAdmin();
              window.location.reload();
            }}
          >
            esci
          </button>
        )}
      </div>

      <a
        href={VENUE.mapsUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex items-center gap-2 text-sm text-muted bg-surface border border-line rounded-xl px-4 py-3 no-underline"
      >
        <span>📍</span>
        <span>
          <b className="text-ink font-semibold">{VENUE.name}</b> · {VENUE.address}
        </span>
        <span className="ml-auto text-faint">›</span>
      </a>

      {admin && <DaysSettings weekdays={weekdays} onSave={saveWeekdays} notify={notify} />}

      <div className="flex items-baseline justify-between mt-8 mb-3 mx-0.5">
        <span className="text-[0.72rem] font-semibold tracking-[0.09em] uppercase text-faint">
          Settimana {weekRange()}
        </span>
        <span className="text-sm text-muted">{days.length} giorni</span>
      </div>

      {days.length === 0 && <p className="text-muted mx-0.5">Nessun giorno candidato questa settimana.</p>}

      <div className="flex flex-col gap-4">
        {days.map((date) => {
          const sess = sessions[date];
          const booked = sess?.status === 'booked';
          const cap = sess?.capacity ?? DEFAULT_CAPACITY;
          const daySignups = signups.filter((s) => s.session_date === date);
          const { confirmed, waitlist } = splitConfirmedWaitlist(daySignups, cap);
          const free = Math.max(0, cap - confirmed.length);
          const timeLabel = booked && sess?.note ? sess.note : DEFAULT_TIME;
          const startTime = parseStartTime(sess?.note, DEFAULT_START);
          const canStart = booked && (admin || hasStarted(date, startTime, new Date()));
          const userConfirmed = confirmed.some((s) => s.player_name === name);
          const waitPos = waitlist.findIndex((s) => s.player_name === name);
          const full = confirmed.length >= cap;
          const countText = waitlist.length > 0 ? `${waitlist.length} in lista` : free > 0 ? `${free} liberi` : 'pieno';

          return (
            <section
              key={date}
              className="anim-rise bg-surface border border-line rounded-[18px] p-[22px] shadow-[var(--shadow-card)] flex flex-col gap-[18px]"
            >
              {/* Giorno = punto focale */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-[1.5rem] font-bold leading-tight">{fmtDow(date)}</div>
                  <div className="text-sm text-muted mt-1">{timeLabel}</div>
                </div>
                {booked && (
                  <span className="flex-none text-[0.72rem] font-semibold text-accent bg-accentsoft rounded-full px-2.5 py-1">
                    Prenotato
                  </span>
                )}
              </div>

              {/* Presenze */}
              {admin ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted">
                    <b className="text-ink font-bold tabular-nums">{confirmed.length}</b>/{cap} confermati
                    {waitlist.length > 0 && ` · ${waitlist.length} in lista`}
                  </span>
                  {confirmed.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {confirmed.map((s) => (
                        <Chip
                          key={s.player_name}
                          name={s.player_name}
                          organizer={s.player_name === organizerName}
                          onRemove={() => removePlayer(date, s.player_name)}
                        />
                      ))}
                    </div>
                  )}
                  {waitlist.length > 0 && (
                    <details className="text-sm text-muted">
                      <summary className="cursor-pointer">Lista d'attesa ({waitlist.length})</summary>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {waitlist.map((s) => (
                          <Chip
                            key={s.player_name}
                            name={s.player_name}
                            organizer={s.player_name === organizerName}
                            onRemove={() => removePlayer(date, s.player_name)}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {confirmed.length > 0 ? (
                    <AvatarStack players={confirmed.map((s) => s.player_name)} />
                  ) : (
                    <span className="text-sm text-faint">Ancora nessun confermato</span>
                  )}
                  <span className="ml-auto text-sm text-muted">
                    <b className="text-ink font-bold tabular-nums">{confirmed.length}</b>/{cap} · {countText}
                  </span>
                </div>
              )}

              {/* Azione */}
              <div className="flex flex-col gap-2">
                {!isIn(date) ? (
                  full ? (
                    <button className={btnOutline} onClick={() => toggle(date)}>
                      Mettiti in lista d'attesa
                    </button>
                  ) : (
                    <button className={btnPrimary} onClick={() => toggle(date)}>
                      Confermo
                    </button>
                  )
                ) : (
                  <>
                    {booked && userConfirmed ? (
                      canStart ? (
                        <a className={btnPrimary} href={`?date=${date}&view=tournament`}>
                          Vai al torneo →
                        </a>
                      ) : (
                        <span className={`${btnOutline} opacity-60 pointer-events-none`}>Inizia alle {startTime}</span>
                      )
                    ) : (
                      <span
                        className={`${statusBox} ${
                          userConfirmed ? 'bg-accentsoft text-accent' : 'bg-ground text-muted border border-line'
                        }`}
                      >
                        {userConfirmed ? '✓ Confermato' : `🕓 In lista d'attesa · pos. ${waitPos + 1}`}
                      </span>
                    )}
                    <button className={undoLink} onClick={() => toggle(date)}>
                      annulla la presenza
                    </button>
                  </>
                )}
              </div>

              {admin && (
                <AdminBooking
                sess={sess}
                onSave={(v) => saveBooking(date, v)}
                onCancel={() => cancelBooking(date)}
                notify={notify}
              />
              )}
            </section>
          );
        })}
      </div>

      {!admin && <AdminLogin />}

      {toast && (
        <div
          role="status"
          className="anim-rise fixed left-1/2 -translate-x-1/2 bottom-6 z-50 bg-accent text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-[0_8px_30px_-8px_rgba(15,118,110,0.6)]"
        >
          {toast}
        </div>
      )}
    </main>
  );
}
