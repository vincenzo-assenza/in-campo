// Avatar helpers: iniziali + colore deterministico dal nome.
const PALETTE = [
  { bg: '#FF5A36', fg: '#ffffff' },
  { bg: '#115E58', fg: '#ffffff' },
  { bg: '#FFC233', fg: '#0C3A38' },
  { bg: '#0C3A38', fg: '#ffffff' },
  { bg: '#FF7A2E', fg: '#ffffff' },
];

export const initials = (name) => name.trim().slice(0, 2).toUpperCase();

export function avatar(name) {
  let h = 0;
  for (const ch of name) h = (h + ch.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
}
