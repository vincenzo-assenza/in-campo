// Iniziali + colore avatar deterministico dal nome (palette sportiva, testo bianco).
const PALETTE = ['#F97316', '#2563EB', '#EA580C', '#1D4ED8', '#D97706', '#0EA5E9', '#C2410C', '#4F46E5'];

// "Mario Rossi" → "MR"; nome singolo → prime 2 lettere.
export const initials = (name) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || '').slice(0, 2).toUpperCase();
};

export function avatarColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
