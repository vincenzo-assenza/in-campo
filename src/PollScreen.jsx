import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { weekCandidateDays, splitConfirmedWaitlist } from './lib/poll.js';
import { WEEKDAYS, DEFAULT_CAPACITY, DEFAULT_TIME, isAdmin } from './config.js';
import { useName } from './useName.js';

const fmt = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

export default function PollScreen() {
  const [name, setName] = useName();
  const [nameInput, setNameInput] = useState('');
  const [signups, setSignups] = useState([]); // tutte le righe dei giorni candidati
  const [sessions, setSessions] = useState({}); // session_date -> row
  const days = weekCandidateDays(WEEKDAYS, new Date());
  const admin = isAdmin();
  const adminQS = admin ? `&admin=${new URLSearchParams(location.search).get('admin')}` : '';

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

  if (!name) {
    return (
      <form className="card" onSubmit={(e) => { e.preventDefault(); setName(nameInput); }}>
        <h1>Beach Volley 🏐</h1>
        <p className="muted">Come ti chiami?</p>
        <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} autoFocus />
        <div className="btn-row"><button className="primary" type="submit">Entra</button></div>
      </form>
    );
  }

  return (
    <div>
      <h1>Beach Volley 🏐</h1>
      <p className="muted">
        Ciao <b>{name}</b> ·{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); localStorage.removeItem('bv_name'); location.reload(); }}>cambia nome</a>
      </p>
      {days.length === 0 && <p className="muted">Nessun giorno candidato questa settimana.</p>}
      {days.map((date) => {
        const sess = sessions[date];
        const cap = sess?.capacity ?? DEFAULT_CAPACITY;
        const daySignups = signups.filter((s) => s.session_date === date);
        const { confirmed, waitlist } = splitConfirmedWaitlist(daySignups, cap);
        return (
          <section className="card" key={date}>
            <h2>{fmt(date)} {sess?.status === 'booked' && <span className="badge">✅ prenotato</span>}</h2>
            {sess?.note && <p className="muted"><i>{sess.note}</i></p>}
            <p className="muted">{confirmed.length}/{cap} confermati{waitlist.length > 0 && ` · ${waitlist.length} in attesa`}</p>
            <ol>{confirmed.map((s) => <li key={s.player_name}>{s.player_name}</li>)}</ol>
            {waitlist.length > 0 && (
              <details><summary>Lista d'attesa</summary>
                <ol>{waitlist.map((s) => <li key={s.player_name}>{s.player_name}</li>)}</ol>
              </details>
            )}
            <div className="btn-row">
              <button className={isIn(date) ? '' : 'primary'} onClick={() => toggle(date)}>
                {isIn(date) ? '✓ Ci sono (togli)' : 'Ci sono'}
              </button>
              {admin && <button onClick={() => markBooked(date)}>Marca prenotato + nota</button>}
              {sess?.status === 'booked' && (
                <a href={`?date=${date}&view=tournament${adminQS}`}>→ Vai al torneo</a>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
