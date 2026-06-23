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
