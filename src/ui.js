// Iniziali + colore avatar deterministico dal nome (palette rifinita, testo bianco).
const PALETTE = ['#0F766E', '#475569', '#9A6B3F', '#6B5B95', '#3F7D5B', '#A6534F', '#3E6E8E', '#7A6A3A'];

export const initials = (name) => name.trim().slice(0, 2).toUpperCase();

export function avatarColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
