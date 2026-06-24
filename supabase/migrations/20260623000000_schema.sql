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
  capacity     int,
  courts       int
);

create table tournaments (
  session_date date primary key,
  state        jsonb not null,
  updated_at   timestamptz not null default now()
);

-- Impostazioni globali (riga unica): giorni ricorrenti scelti dall'organizzatore.
create table settings (
  id       smallint primary key default 1,
  weekdays int[] not null default '{2,4,6}', -- 0=Dom..6=Sab → mar/gio/sab
  constraint settings_singleton check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- Realtime: aggiungi le tabelle alla publication
alter publication supabase_realtime add table signups, sessions, tournaments, settings;

-- Accesso "tra amici": niente RLS, accesso pieno per chi ha il link (ruolo anon).
-- Questo è il punto da stringere (RLS + policy) se l'app verrà venduta a estranei.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
