-- Dati demo per lo sviluppo locale. Eseguito da `supabase db reset` / `supabase start`.
-- NON viene mai eseguito su Supabase cloud.

insert into signups (session_date, player_name) values
  ('2026-06-23', 'Vince'), ('2026-06-23', 'Marco'), ('2026-06-23', 'Giulia'),
  ('2026-06-23', 'Anna'), ('2026-06-23', 'Luca'), ('2026-06-23', 'Sara'),
  ('2026-06-23', 'Dav'), ('2026-06-23', 'Fede'), ('2026-06-23', 'Chiara'),
  ('2026-06-23', 'Teo'), ('2026-06-23', 'Elisa'), ('2026-06-23', 'Paolo'),
  ('2026-06-23', 'Marta'), ('2026-06-23', 'Gabri'),
  ('2026-06-25', 'Marco'), ('2026-06-25', 'Anna'), ('2026-06-25', 'Luca'),
  ('2026-06-25', 'Sara'), ('2026-06-25', 'Fede'), ('2026-06-25', 'Teo'),
  ('2026-06-25', 'Elisa'), ('2026-06-25', 'Paolo'),
  ('2026-06-27', 'Vince'), ('2026-06-27', 'Giulia'), ('2026-06-27', 'Chiara'),
  ('2026-06-27', 'Nico');

insert into sessions (session_date, status, note) values
  ('2026-06-23', 'booked', 'Campo 2 · 19:30–21:30');
