# Beach Volley 🏐

Prenotazione presenze settimanali + torneo live king-of-the-court, per un gruppo di amici. Un solo link, niente login.

**Stack:** React + Vite · Tailwind CSS v4 · Supabase (Postgres + Realtime) · font Anton + Inter · deploy Vercel.

## Setup

1. Crea un progetto su [supabase.com](https://supabase.com).
2. SQL Editor → incolla ed esegui `supabase/schema.sql` (crea le 3 tabelle e abilita il Realtime).
3. Copia `.env.example` in `.env` e compila:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (da Supabase → Project Settings → API)
   - `VITE_ADMIN_TOKEN` = una stringa a piacere (sblocca le azioni da organizzatore)
4. `npm install && npm run dev`

## Deploy su Vercel

- Importa il repo (build autodetect Vite: build `npm run build`, output `dist`).
- Aggiungi le 3 variabili `VITE_*` nelle Environment Variables del progetto Vercel.

## Uso

- **Link normale** → sondaggio: scrivi il nome (salvato nel browser), spunta i giorni, vedi confermati e lista d'attesa in tempo reale.
- **Organizzatore**: apri con `?admin=<VITE_ADMIN_TOKEN>` per marcare un giorno come prenotato e gestire il torneo (genera formazioni, segna i vincitori, avanza la scala, rimescola).
- **Torneo**: dalla card di un giorno prenotato → "Vai al torneo". I giocatori vedono squadra/campo dal vivo; l'organizzatore fa girare la scala king-of-the-court.

## Configurazione

Giorni ricorrenti, orario e capienza di default sono in `src/config.js` (`WEEKDAYS`, `DEFAULT_TIME`, `DEFAULT_CAPACITY`).

## Test

`npm test` — copre la logica pura (giorni candidati, confermati/attesa, generazione squadre, scala).
