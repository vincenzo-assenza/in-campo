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

// ponytail: token in URL, barriera "tra amici", non un vero segreto
export function isAdmin() {
  const token = new URLSearchParams(window.location.search).get('admin');
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
}
