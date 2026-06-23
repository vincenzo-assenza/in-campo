# Beach Volley Booking + Tournament — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App a link unico (no login) per gestire presenze settimanali al beach volley con tetto/lista d'attesa, più un torneo live king-of-the-court con formazioni generate.

**Architecture:** SPA React+Vite servita da Vercel. Tutta la persistenza è su Supabase (Postgres) e il client JS scrive direttamente dal browser — nessun backend custom. La logica con valore (split confermati/attesa, generazione squadre, scala) vive in funzioni pure testate con Vitest; i componenti React le consumano e sincronizzano lo stato via Supabase Realtime.

**Tech Stack:** React 19, Vite 6, @supabase/supabase-js 2, Vitest 3. Deploy Vercel.

## Global Constraints

- Nessun login. Identità utente = nome in `localStorage`. Dedup per `(session_date, player_name)`.
- Azioni organizzatore sbloccate da `?admin=<token>` confrontato con `VITE_ADMIN_TOKEN` (non è un vero segreto: sta nel bundle, è una barriera "tra amici").
- Stato torneo scritto SOLO dall'organizzatore (single-writer); gli altri leggono via Realtime.
- Niente: pagamenti, RLS stretta, punteggio palla-su-palla, rating, storico, notifiche.
- Funzioni di logica pura → file in `src/lib/`, deterministiche (la casualità è iniettata), con test Vitest.
- Tutte le date sono stringhe ISO `YYYY-MM-DD`. `created_at` è ISO timestamp ordinabile lessicograficamente.

---

### Task 1: Scaffold progetto + schema DB

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `.env.example`
- Create: `src/main.jsx`, `src/App.jsx`
- Create: `supabase/schema.sql`

**Interfaces:**
- Consumes: nulla.
- Produces: app Vite avviabile (`npm run dev`), test runner (`npm test`), schema SQL applicabile su Supabase.

- [ ] **Step 1: Crea `package.json`**

```json
{
  "name": "beach-volley",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Crea `vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node' },
});
```

- [ ] **Step 3: Crea `index.html`**

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beach Volley</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Crea `.gitignore` e `.env.example`**

`.gitignore`:
```
node_modules
dist
.env
.env.local
```

`.env.example`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ADMIN_TOKEN=cambiami
```

- [ ] **Step 5: Crea `src/main.jsx` e un `src/App.jsx` placeholder**

`src/main.jsx`:
```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.jsx` (placeholder, sostituito in Task 7):
```jsx
export default function App() {
  return <h1>Beach Volley</h1>;
}
```

- [ ] **Step 6: Crea `supabase/schema.sql`**

```sql
create table signups (
  id           bigint generated always as identity primary key,
  session_date date not null,
  player_name  text not null,
  created_at   timestamptz not null default now(),
  unique (session_date, player_name)
);

create table sessions (
  session_date date primary key,
  status       text not null default 'open',
  note         text,
  capacity     int
);

create table tournaments (
  session_date date primary key,
  state        jsonb not null,
  updated_at   timestamptz not null default now()
);

-- Realtime: aggiungi le tabelle alla publication
alter publication supabase_realtime add table signups, sessions, tournaments;
```

- [ ] **Step 7: Installa e verifica**

Run: `npm install && npm test`
Expected: install ok; Vitest stampa "No test files found" (exit 0) — accettabile, i test arrivano nei task successivi.

Run: `npm run build`
Expected: build ok, cartella `dist/` generata.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite+react app and supabase schema"
```

---

### Task 2: Logica sondaggio (giorni candidati + split confermati/attesa)

**Files:**
- Create: `src/lib/poll.js`
- Test: `src/lib/poll.test.js`

**Interfaces:**
- Consumes: nulla.
- Produces:
  - `weekCandidateDays(weekdays: number[], today: Date) => string[]` — date ISO `YYYY-MM-DD` dei `weekdays` (0=Dom..6=Sab) nella settimana Lun–Dom di `today`, solo quelle ≥ oggi.
  - `splitConfirmedWaitlist(signups: {player_name, created_at}[], capacity: number) => { confirmed: [], waitlist: [] }` — ordina per `created_at` asc, primi `capacity` confermati.

- [ ] **Step 1: Scrivi i test (falliscono)**

`src/lib/poll.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { weekCandidateDays, splitConfirmedWaitlist } from './poll.js';

describe('weekCandidateDays', () => {
  it('ritorna i weekday configurati della settimana corrente, >= oggi', () => {
    // 2026-06-23 è un martedì. weekdays = [2,4,6] = mar/gio/sab.
    const today = new Date('2026-06-23T10:00:00');
    expect(weekCandidateDays([2, 4, 6], today)).toEqual([
      '2026-06-23', '2026-06-25', '2026-06-27',
    ]);
  });

  it('esclude i giorni passati della settimana', () => {
    // venerdì 2026-06-26: martedì e giovedì sono già passati
    const today = new Date('2026-06-26T10:00:00');
    expect(weekCandidateDays([2, 4, 6], today)).toEqual(['2026-06-27']);
  });
});

describe('splitConfirmedWaitlist', () => {
  const s = (name, t) => ({ player_name: name, created_at: t });

  it('primi N confermati per ordine di iscrizione, resto in attesa', () => {
    const signups = [
      s('C', '2026-06-23T10:03:00Z'),
      s('A', '2026-06-23T10:01:00Z'),
      s('B', '2026-06-23T10:02:00Z'),
    ];
    const { confirmed, waitlist } = splitConfirmedWaitlist(signups, 2);
    expect(confirmed.map(x => x.player_name)).toEqual(['A', 'B']);
    expect(waitlist.map(x => x.player_name)).toEqual(['C']);
  });

  it('capienza 0 = tutti in attesa; lista vuota = vuoti', () => {
    expect(splitConfirmedWaitlist([s('A', 't')], 0).confirmed).toEqual([]);
    expect(splitConfirmedWaitlist([], 5)).toEqual({ confirmed: [], waitlist: [] });
  });
});
```

- [ ] **Step 2: Esegui i test → falliscono**

Run: `npm test -- poll`
Expected: FAIL (`weekCandidateDays is not a function`).

- [ ] **Step 3: Implementa `src/lib/poll.js`**

```js
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function weekCandidateDays(weekdays, today) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7; // 0=Lun
  const monday = new Date(start);
  monday.setDate(start.getDate() - mondayOffset);

  const out = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    if (weekdays.includes(day.getDay()) && day >= start) {
      out.push(iso(day));
    }
  }
  return out;
}

export function splitConfirmedWaitlist(signups, capacity) {
  const sorted = [...signups].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  return {
    confirmed: sorted.slice(0, capacity),
    waitlist: sorted.slice(capacity),
  };
}
```

- [ ] **Step 4: Esegui i test → passano**

Run: `npm test -- poll`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/poll.js src/lib/poll.test.js
git commit -m "feat: poll logic (candidate days + confirmed/waitlist split)"
```

---

### Task 3: Logica torneo (generazione squadre + scala king of the court)

**Files:**
- Create: `src/lib/tournament.js`
- Test: `src/lib/tournament.test.js`

**Interfaces:**
- Consumes: nulla.
- Produces:
  - `makeTeams(players: string[], courtCount: number, shuffle = defaultShuffle) => Court[]` dove `Court = { teamA: Team, teamB: Team, winner: null }` e `Team = { id: string, players: string[] }`. Crea `2*courtCount` squadre con dimensioni che differiscono di ≤1.
  - `ladderNextRound(courts: Court[]) => Court[]` — ogni `court.winner` deve essere `'A'` o `'B'`. Vincente sale di un campo, perdente scende, con clamp ai bordi (top/bottom). Ritorna nuovi court con `winner: null`.
  - `defaultShuffle(arr) => arr` (Fisher–Yates, usa `Math.random`).

- [ ] **Step 1: Scrivi i test (falliscono)**

`src/lib/tournament.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { makeTeams, ladderNextRound } from './tournament.js';

const identity = (a) => [...a]; // shuffle deterministico per i test

describe('makeTeams', () => {
  it('crea 2*campi squadre con dimensioni bilanciate (diff <= 1)', () => {
    const players = Array.from({ length: 25 }, (_, i) => `p${i}`);
    const courts = makeTeams(players, 3, identity);
    expect(courts).toHaveLength(3);
    const sizes = courts.flatMap((c) => [c.teamA.players.length, c.teamB.players.length]);
    expect(sizes).toHaveLength(6);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(total).toBe(25);
    expect(courts.every((c) => c.winner === null)).toBe(true);
  });

  it('ogni giocatore compare una sola volta', () => {
    const players = Array.from({ length: 16 }, (_, i) => `p${i}`);
    const courts = makeTeams(players, 2, identity);
    const all = courts.flatMap((c) => [...c.teamA.players, ...c.teamB.players]);
    expect(new Set(all).size).toBe(16);
  });
});

describe('ladderNextRound', () => {
  const team = (id) => ({ id, players: [id] });

  it('vincente sale, perdente scende, bordi restano (3 campi)', () => {
    // court0: A vince; court1: A vince; court2: A vince
    const courts = [
      { teamA: team('W0'), teamB: team('L0'), winner: 'A' },
      { teamA: team('W1'), teamB: team('L1'), winner: 'A' },
      { teamA: team('W2'), teamB: team('L2'), winner: 'A' },
    ];
    const next = ladderNextRound(courts);
    const ids = (c) => [c.teamA.id, c.teamB.id];
    expect(ids(next[0])).toEqual(['W0', 'W1']); // top: vincente che resta + vincente che sale
    expect(ids(next[1])).toEqual(['L0', 'W2']);
    expect(ids(next[2])).toEqual(['L1', 'L2']); // bottom: perdente che scende + perdente che resta
    expect(next.every((c) => c.winner === null)).toBe(true);
  });

  it('campo singolo: le stesse due squadre rigiocano', () => {
    const courts = [{ teamA: team('A'), teamB: team('B'), winner: 'B' }];
    const next = ladderNextRound(courts);
    expect(new Set([next[0].teamA.id, next[0].teamB.id])).toEqual(new Set(['A', 'B']));
  });

  it('lancia errore se un campo non ha vincitore', () => {
    const courts = [{ teamA: team('A'), teamB: team('B'), winner: null }];
    expect(() => ladderNextRound(courts)).toThrow();
  });
});
```

- [ ] **Step 2: Esegui i test → falliscono**

Run: `npm test -- tournament`
Expected: FAIL (`makeTeams is not a function`).

- [ ] **Step 3: Implementa `src/lib/tournament.js`**

```js
export function defaultShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeTeams(players, courtCount, shuffle = defaultShuffle) {
  const nTeams = courtCount * 2;
  const shuffled = shuffle(players);
  const buckets = Array.from({ length: nTeams }, () => []);
  shuffled.forEach((p, i) => buckets[i % nTeams].push(p)); // round-robin → diff <= 1
  const teams = buckets.map((players, i) => ({ id: `t${i}`, players }));

  const courts = [];
  for (let i = 0; i < courtCount; i++) {
    courts.push({ teamA: teams[2 * i], teamB: teams[2 * i + 1], winner: null });
  }
  return courts;
}

export function ladderNextRound(courts) {
  const K = courts.length;
  const arrivals = Array.from({ length: K }, () => []);

  courts.forEach((court, i) => {
    if (court.winner !== 'A' && court.winner !== 'B') {
      throw new Error(`Campo ${i} senza vincitore`);
    }
    const winner = court.winner === 'A' ? court.teamA : court.teamB;
    const loser = court.winner === 'A' ? court.teamB : court.teamA;
    arrivals[Math.max(i - 1, 0)].push(winner); // sale di un campo
    arrivals[Math.min(i + 1, K - 1)].push(loser); // scende di un campo
  });

  return arrivals.map((teams) => ({ teamA: teams[0], teamB: teams[1], winner: null }));
}
```

- [ ] **Step 4: Esegui i test → passano**

Run: `npm test -- tournament`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament.js src/lib/tournament.test.js
git commit -m "feat: tournament logic (team generation + king-of-the-court ladder)"
```

---

### Task 4: Client Supabase + config

**Files:**
- Create: `src/config.js`
- Create: `src/supabase.js`

**Interfaces:**
- Consumes: env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_TOKEN`.
- Produces:
  - `src/config.js`: `WEEKDAYS: number[]`, `DEFAULT_TIME: string`, `DEFAULT_CAPACITY: number`, `ADMIN_TOKEN: string`, `isAdmin(): boolean`.
  - `src/supabase.js`: `supabase` (client).

- [ ] **Step 1: Crea `src/config.js`**

```js
export const WEEKDAYS = [2, 4, 6]; // 0=Dom..6=Sab → mar/gio/sab
export const DEFAULT_TIME = '19:00';
export const DEFAULT_CAPACITY = 12;
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;

// ponytail: token in URL, barriera "tra amici", non un vero segreto
export function isAdmin() {
  const token = new URLSearchParams(window.location.search).get('admin');
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
}
```

- [ ] **Step 2: Crea `src/supabase.js`**

```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

- [ ] **Step 3: Verifica build**

Run: `npm run build`
Expected: build ok (le env mancanti in build danno `undefined` ma non rompono il bundle).

- [ ] **Step 4: Commit**

```bash
git add src/config.js src/supabase.js
git commit -m "feat: supabase client and app config"
```

---

### Task 5: Schermata Sondaggio

**Files:**
- Create: `src/useName.js`
- Create: `src/PollScreen.jsx`

**Interfaces:**
- Consumes: `weekCandidateDays`, `splitConfirmedWaitlist` (poll.js); `supabase`; `WEEKDAYS, DEFAULT_CAPACITY, DEFAULT_TIME, isAdmin` (config.js).
- Produces:
  - `useName() => [name, setName]` — nome persistito in `localStorage` chiave `bv_name`.
  - `PollScreen` (default export) — render del sondaggio settimanale.

- [ ] **Step 1: Crea `src/useName.js`**

```js
import { useState } from 'react';

export function useName() {
  const [name, setNameState] = useState(() => localStorage.getItem('bv_name') || '');
  const setName = (n) => {
    const trimmed = n.trim();
    localStorage.setItem('bv_name', trimmed);
    setNameState(trimmed);
  };
  return [name, setName];
}
```

- [ ] **Step 2: Crea `src/PollScreen.jsx`**

```jsx
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
      <form onSubmit={(e) => { e.preventDefault(); setName(nameInput); }}>
        <h1>Beach Volley 🏐</h1>
        <p>Come ti chiami?</p>
        <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} autoFocus />
        <button type="submit">Entra</button>
      </form>
    );
  }

  return (
    <div>
      <h1>Beach Volley 🏐</h1>
      <p>Ciao <b>{name}</b> · <button onClick={() => { localStorage.removeItem('bv_name'); location.reload(); }}>cambia nome</button></p>
      {days.length === 0 && <p>Nessun giorno candidato questa settimana.</p>}
      {days.map((date) => {
        const sess = sessions[date];
        const cap = sess?.capacity ?? DEFAULT_CAPACITY;
        const daySignups = signups.filter((s) => s.session_date === date);
        const { confirmed, waitlist } = splitConfirmedWaitlist(daySignups, cap);
        return (
          <section key={date} style={{ border: '1px solid #ccc', margin: '8px 0', padding: 12 }}>
            <h2>{fmt(date)} {sess?.status === 'booked' && <span>✅ prenotato</span>}</h2>
            {sess?.note && <p><i>{sess.note}</i></p>}
            <p>{confirmed.length}/{cap} confermati{waitlist.length > 0 && ` · ${waitlist.length} in attesa`}</p>
            <button onClick={() => toggle(date)}>{isIn(date) ? '✓ Ci sono (togli)' : 'Ci sono'}</button>
            <ol>{confirmed.map((s) => <li key={s.player_name}>{s.player_name}</li>)}</ol>
            {waitlist.length > 0 && (
              <details><summary>Lista d'attesa</summary>
                <ol>{waitlist.map((s) => <li key={s.player_name}>{s.player_name}</li>)}</ol>
              </details>
            )}
            {admin && <button onClick={() => markBooked(date)}>Marca prenotato + nota</button>}
            {sess?.status === 'booked' && (
              <a href={`?date=${date}&view=tournament${adminQS}`}> → Vai al torneo</a>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verifica build**

Run: `npm run build`
Expected: build ok.

- [ ] **Step 4: Commit**

```bash
git add src/useName.js src/PollScreen.jsx
git commit -m "feat: poll screen (signup toggle, confirmed/waitlist, admin booking)"
```

---

### Task 6: Schermata Torneo

**Files:**
- Create: `src/TournamentScreen.jsx`

**Interfaces:**
- Consumes: `makeTeams`, `ladderNextRound` (tournament.js); `splitConfirmedWaitlist` (poll.js); `supabase`; `DEFAULT_CAPACITY, isAdmin` (config.js).
- Produces: `TournamentScreen({ date })` (default export) — render del torneo live per una data.

- [ ] **Step 1: Crea `src/TournamentScreen.jsx`**

```jsx
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

  return (
    <div>
      <p><a href={`?${new URLSearchParams(location.search).get('admin') ? 'admin=' + new URLSearchParams(location.search).get('admin') : ''}`}>← Sondaggio</a></p>
      <h1>Torneo · {date}</h1>
      <p>{confirmed.length} giocatori presenti</p>

      {!state && admin && (
        <div>
          <label>Campi prenotati: <input type="number" min="1" max="5" value={courtsInput} onChange={(e) => setCourtsInput(e.target.value)} /></label>
          <button onClick={generate}>Genera formazioni</button>
        </div>
      )}
      {!state && !admin && <p>In attesa che l'organizzatore generi le formazioni…</p>}

      {state && (
        <div>
          <h2>Turno {state.turno}</h2>
          {state.courts.map((c, i) => (
            <section key={i} style={{ border: '1px solid #ccc', margin: '8px 0', padding: 12 }}>
              <h3>Campo {i + 1}{i === 0 ? ' 👑' : ''}</h3>
              <Team team={c.teamA} win={c.winner === 'A'} onWin={() => admin && setWinner(i, 'A')} admin={admin} />
              <p>vs</p>
              <Team team={c.teamB} win={c.winner === 'B'} onWin={() => admin && setWinner(i, 'B')} admin={admin} />
            </section>
          ))}
          {admin && (
            <div>
              <button disabled={!allDecided} onClick={nextRound}>Prossimo round (scala)</button>
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
    <div style={{ background: win ? '#d4edda' : 'transparent', padding: 6 }}>
      <b>{team.players.join(', ')}</b>{' '}
      {admin && <button onClick={onWin}>{win ? '✓ vincente' : 'ha vinto'}</button>}
    </div>
  );
}
```

- [ ] **Step 2: Verifica build**

Run: `npm run build`
Expected: build ok.

- [ ] **Step 3: Commit**

```bash
git add src/TournamentScreen.jsx
git commit -m "feat: tournament screen (generate teams, ladder, live state)"
```

---

### Task 7: App shell + routing + verifica end-to-end

**Files:**
- Modify: `src/App.jsx`
- Create: `README.md`

**Interfaces:**
- Consumes: `PollScreen`, `TournamentScreen`.
- Produces: routing per query param: `?date=YYYY-MM-DD&view=tournament` → torneo, altrimenti sondaggio.

- [ ] **Step 1: Sostituisci `src/App.jsx`**

```jsx
import PollScreen from './PollScreen.jsx';
import TournamentScreen from './TournamentScreen.jsx';

export default function App() {
  const qs = new URLSearchParams(window.location.search);
  const date = qs.get('date');
  if (qs.get('view') === 'tournament' && date) {
    return <TournamentScreen date={date} />;
  }
  return <PollScreen />;
}
```

- [ ] **Step 2: Crea `README.md`**

````markdown
# Beach Volley 🏐

Prenotazione presenze + torneo live king-of-the-court. React+Vite, Supabase, Vercel.

## Setup
1. Crea un progetto su [supabase.com](https://supabase.com).
2. SQL Editor → incolla ed esegui `supabase/schema.sql`.
3. Copia `.env.example` in `.env` e compila URL, anon key, e un `VITE_ADMIN_TOKEN` a piacere.
4. `npm install && npm run dev`.

## Deploy su Vercel
- Importa il repo. Le 3 variabili `VITE_*` vanno nelle Environment Variables del progetto Vercel.
- Build command `npm run build`, output `dist` (autodetect Vite).

## Uso
- Link normale → sondaggio: scrivi il nome, spunta i giorni, vedi confermati/attesa.
- Organizzatore: apri con `?admin=<VITE_ADMIN_TOKEN>` per marcare prenotato e gestire il torneo.
- Config giorni/orario/capienza: `src/config.js`.
````

- [ ] **Step 3: Build + verifica manuale**

Run: `npm run build`
Expected: build ok.

Verifica manuale (richiede progetto Supabase reale + `.env` compilato):
1. `npm run dev`, apri il sito → inserisci un nome → spunta un giorno → ricarica: la spunta persiste.
2. Apri in una seconda finestra/incognito con un altro nome → spunta lo stesso giorno → nella prima finestra il conteggio sale **senza ricaricare** (realtime ok).
3. Supera la capienza con più nomi → gli extra appaiono in "Lista d'attesa"; togli un confermato → il primo in attesa passa a confermato.
4. Con `?admin=<token>` marca il giorno prenotato → compare il link "Vai al torneo".
5. Nel torneo: imposta 3 campi → "Genera formazioni" → compaiono 6 squadre bilanciate. Tocca i vincitori dei 3 campi → "Prossimo round" → le squadre si spostano secondo la scala. "Nuovo turno" → squadre rimescolate.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx README.md
git commit -m "feat: app routing + readme; end-to-end wiring complete"
```

---

## Self-Review (svolto)

**Copertura spec:**
- Sondaggio presenze (giorni candidati, toggle, dedup) → Task 2, 5. ✓
- Tetto + lista d'attesa → `splitConfirmedWaitlist` Task 2, render Task 5. ✓
- Admin token + marca prenotato + nota + capienza override → Task 4 (`isAdmin`), Task 5. ✓
- Generazione squadre bilanciate variabili → `makeTeams` Task 3. ✓
- Scala king of the court → `ladderNextRound` Task 3, controlli Task 6. ✓
- Nuovo turno / rigenera → Task 6. ✓
- Realtime single-writer → Task 5 (poll), Task 6 (tournament). ✓
- Schema 3 tabelle + Realtime publication → Task 1. ✓
- Deploy Vercel + env → Task 7 README. ✓

**Out of scope confermati assenti:** pagamenti, RLS, punteggio palla-su-palla, rating, storico, notifiche. ✓

**Coerenza tipi:** `Court = {teamA, teamB, winner}`, `Team = {id, players}`, `state = {turno, courts}` usati identici in Task 3 e Task 6. `splitConfirmedWaitlist` ritorna `{confirmed, waitlist}` usato in Task 5 e 6. `isAdmin()` definito Task 4, usato Task 5/6. ✓

**Note edge accettate (ponytail):** match impari (es. 5vs4) con totale dispari; identità fidata per nome; token admin non segreto.
