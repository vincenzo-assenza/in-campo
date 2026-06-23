# Beach Volley — Prenotazione + Torneo Live

**Data:** 2026-06-23
**Stack:** React + Vite (SPA) · Supabase (Postgres + Realtime) · deploy Vercel
**Scopo:** sostituire il sondaggio WhatsApp + chase manuale con un'app a link unico, senza login, per ~25 amici che giocano a beach volley settimanalmente.

## Principi (ponytail)

- Nessun backend custom: il client JS Supabase scrive direttamente dal browser.
- Nessun login: identità = nome in `localStorage`, dedup per nome. Fidata "tra amici".
- Nessun pagamento (gestito a mano fuori app). Aggiungibile dopo (colonna `paid` + link).
- Tabelle leggibili/scrivibili da chiunque abbia il link. Si stringe con RLS Supabase se mai servirà.
- Solo ciò che serve ora. Niente storico, statistiche, rating, notifiche.

## Due schermate

1. **Sondaggio** — presenze settimanali, posti, lista d'attesa.
2. **Partita** — formazioni + scala (king of the court) live.

L'organizzatore sblocca le azioni privilegiate con un token segreto in URL: `?admin=<TOKEN>`. Il token è una costante in env (`VITE_ADMIN_TOKEN`); chi ce l'ha è organizzatore. `// ponytail: token in URL, basta per amici`

---

## Schermata 1 — Sondaggio presenze

### Config (env / costante, decisa una volta)
- Giorni ricorrenti della settimana (es. `[mar, gio, sab]`).
- Orario di default.
- Capienza default per giorno (es. 12, override per data).

L'app calcola da sola i **giorni candidati della settimana corrente** dai weekday configurati → niente sondaggio da ricreare ogni settimana.

### Flusso amico
1. Apre il link → se non ha nome salvato, lo inserisce una volta (`localStorage`).
2. Vede i giorni candidati con conteggio confermati / capienza.
3. Spunta/togli i giorni in cui può.

### Posti & lista d'attesa
- Per ogni giorno, i primi `capacità` per `created_at` = **confermati**, gli altri = **lista d'attesa**.
- Toggle off → la propria riga viene cancellata → il primo in attesa diventa confermato (è solo riordino, ricalcolato dal vivo via realtime).

### Azioni organizzatore (`?admin`)
- Marca un giorno come **"prenotato"** + nota (campo/ora reali).
- Override capienza per data.

---

## Schermata 2 — Torneo live

Disponibile per un giorno marcato "prenotato". L'organizzatore avvia la partita.

### Setup
- L'organizzatore inserisce **n. campi prenotati** (1–5, vincolo reale).
- L'app prende i **confermati presenti** e crea `2 × campi` squadre bilanciate per dimensione (differenza max 1 giocatore). Assegnazione casuale.
- Pulsante **"Rigenera"** = nuova estrazione casuale.
- Esempio: 25 presenti, 3 campi → 6 squadre `[5,4,4,4,4,4]`. Con totale dispari un match sarà 5vs4 (accettato).

### Turno (king of the court, round sincronizzati)
- Campi in classifica: campo 1 = top, campo K = basso.
- Ogni campo gioca un set a 25. L'organizzatore tocca **chi ha vinto** (solo esito, non i punti).
- Premuto **"Prossimo round"**:
  - Vincente sale di un campo, perdente scende di un campo.
  - Vincente del campo top **resta** top; perdente del campo basso **resta** basso.
  - Le squadre restano **unità fisse** per tutto il turno.

### Nuovo turno
- Pulsante **"Nuovo turno (rimescola)"** → rigenera squadre nuove dai presenti, riparte la scala.

### Realtime
- Stato in `tournaments(session_date, state jsonb)`. Scrive **solo l'organizzatore**; tutti gli altri leggono via realtime e vedono dal vivo squadra / campo / avversario sul telefono. `// ponytail: single-writer, blob JSON, niente race`

---

## Modello dati (Supabase)

```sql
-- una riga per spunta
signups (
  id          bigint generated always as identity primary key,
  session_date date not null,
  player_name  text not null,
  created_at   timestamptz not null default now(),
  unique (session_date, player_name)
);

-- metadati per data (override capienza + flag prenotato)
sessions (
  session_date date primary key,
  status       text not null default 'open',   -- 'open' | 'booked'
  note         text,
  capacity     int                              -- null = usa default config
);

-- stato torneo live, scritto solo dall'organizzatore
tournaments (
  session_date date primary key,
  state        jsonb not null,                  -- { turno, courts, teams:[{id,players[],court}], lastWinners }
  updated_at   timestamptz not null default now()
);
```

Realtime abilitato su tutte e tre. Confermato vs attesa = calcolato client-side da `signups` ordinati per `created_at`.

---

## Logica non banale (da testare)

- **`makeTeams(players, courts)`** — distribuzione bilanciata: ritorna `2×courts` squadre con dimensioni che differiscono di ≤1, giocatori mescolati. Check: somma dimensioni = `players.length`; `max(size) - min(size) ≤ 1`.
- **`ladderNextRound(courts, winners)`** — scala king of the court: vincente +1 campo, perdente −1, con i bordi (top winner / bottom loser restano). Check: nessuna squadra persa o duplicata; movimenti coerenti ai bordi.
- **`splitConfirmedWaitlist(signups, capacity)`** — primi `capacity` per `created_at` confermati, resto attesa. Check edge: capienza 0, vuoto, pareggio di timestamp.

## Out of scope (aggiungibile dopo)

- Pagamenti (colonna `paid` + link Satispay/PayPal.me).
- Login / RLS stretta.
- Punteggio palla-su-palla, rating giocatori, storico/statistiche, notifiche push.
