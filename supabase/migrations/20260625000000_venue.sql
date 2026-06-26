-- Sede di gioco gestibile dall'organizzatore (prima era fissa in config.js).
alter table settings add column if not exists venue_name     text;
alter table settings add column if not exists venue_address  text;
alter table settings add column if not exists venue_maps_url text;
