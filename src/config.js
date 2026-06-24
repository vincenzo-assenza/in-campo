export const WEEKDAYS = [2, 4, 6]; // 0=Dom..6=Sab → mar/gio/sab
export const DEFAULT_TIME = '19:30–21:30'; // orario abituale; l'admin può cambiarlo per data nella nota
export const DEFAULT_START = '19:30'; // orario di inizio (sblocca "Inizia Torneo")
export const DEFAULT_CAPACITY = 12;
export const DEFAULT_COURTS = 3;
export const MAX_SCORE = 21; // set a 21 punti
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;

// Sede di gioco (fissa).
export const VENUE = {
  name: 'Sporting Club Mestre — La Favorita',
  address: 'Via Terraglietto 21/M, Mestre',
  mapsUrl: 'https://maps.google.com/?q=Sporting+Club+Mestre+Via+Terraglietto+21%2FM+Mestre',
};

// Accesso organizzatore: PIN confrontato lato client, sessione in localStorage.
// ponytail: barriera "tra amici" (il PIN è nel bundle); sicurezza vera = Supabase Auth.
export function isAdmin() {
  return Boolean(ADMIN_TOKEN) && localStorage.getItem('bv_admin') === ADMIN_TOKEN;
}

export function loginAdmin(pin) {
  if (ADMIN_TOKEN && pin === ADMIN_TOKEN) {
    localStorage.setItem('bv_admin', pin);
    return true;
  }
  return false;
}

export function logoutAdmin() {
  localStorage.removeItem('bv_admin');
}
