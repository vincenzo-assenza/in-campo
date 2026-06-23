import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { weekCandidateDays, splitConfirmedWaitlist } from './lib/poll.js';
import { WEEKDAYS, DEFAULT_CAPACITY, DEFAULT_TIME, isAdmin } from './config.js';
import { useName } from './useName.js';
import { initials, avatar } from './ui.js';

const btnBase =
  'font-semibold text-sm px-4 py-3 rounded-xl border transition active:scale-95 hover:-translate-y-px disabled:opacity-50 disabled:pointer-events-none';
const btn = `${btnBase} border-line bg-surface text-ink hover:shadow-[var(--shadow-card)]`;
const btnPrimary = `${btnBase} border-coral bg-coral text-white shadow-[0_8px_18px_-8px_rgba(255,90,54,0.7)]`;
const btnIn = `${btnBase} border-win/30 bg-winbg text-win`;
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

function Chip({ name }) {
  const a = avatar(name);
  return (
    <span className="inline-flex items-center gap-1.5 bg-[#F1F7F5] border border-line rounded-full pl-1 pr-2.5 py-1 text-sm font-semibold">
      <span
        className="grid place-items-center w-5 h-5 rounded-full text-[0.66rem] font-extrabold"
        style={{ background: a.bg, color: a.fg }}
      >
        {initials(name)}
      </span>
      {name}
    </span>
  );
}

export default function PollScreen() {
  const [name, setName] = useName();
  const [nameInput, setNameInput] = useState('');
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

  async function markBooked(date) {
    const note = prompt('Nota (campo / ora):', sessions[date]?.note || DEFAULT_TIME);
    if (note === null) return;
    await supabase.from('sessions').upsert({ session_date: date, status: 'booked', note });
    load();
  }

  function changeName() {
    localStorage.removeItem('bv_name');
    window.location.reload();
  }

  if (!name) {
    return (
      <main className="max-w-[600px] mx-auto px-4 pb-16">
        <form
          className="anim-rise bg-surface border border-line rounded-3xl p-6 mt-8 shadow-[var(--shadow-card)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameInput.trim()) setName(nameInput);
          }}
        >
          <h1 className="font-display text-4xl">Beach Volley 🏐</h1>
          <p className="text-muted mt-1">Come ti chiami?</p>
          <input
            className="mt-3 w-full max-w-[260px] px-3 py-2.5 rounded-lg border border-line bg-surface outline-none focus:border-coral"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Il tuo nome"
            autoFocus
          />
          <div className="mt-4">
            <button className={btnPrimary} type="submit">
              Entra
            </button>
          </div>
        </form>
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

            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {chips.map((s) => (
                  <Chip key={s.player_name} name={s.player_name} />
                ))}
                {extra > 0 && (
                  <span className="inline-flex items-center border border-dashed border-line text-muted rounded-full px-2.5 py-1 text-sm font-semibold">
                    +{extra}
                  </span>
                )}
              </div>
            )}

            {waitlist.length > 0 && (
              <details className="text-sm text-muted mt-2">
                <summary className="cursor-pointer">Lista d'attesa ({waitlist.length})</summary>
                <div className="mt-1">{waitlist.map((s) => s.player_name).join(', ')}</div>
              </details>
            )}

            <div className="flex flex-wrap gap-2.5 items-center mt-4">
              <button className={isIn(date) ? btnIn : btnPrimary} onClick={() => toggle(date)}>
                {isIn(date) ? '✓ Ci sei' : 'Ci sono'}
              </button>
              {admin && (
                <button className={btn} onClick={() => markBooked(date)}>
                  {booked ? 'Modifica nota' : 'Prenota'}
                </button>
              )}
              {booked && (
                <a className={btnGo} href={`?date=${date}&view=tournament${adminQS}`}>
                  Vai al torneo →
                </a>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}
