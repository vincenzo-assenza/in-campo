// Pallone da beach volley line-art: cuciture a spicchi che convergono verso un
// polo (niente croce dritta → non sembra un basket). Eredita il colore via currentColor.
export function Ball({ className = 'w-5 h-5 text-accent' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M16.5 6C12 10 8 14 7 19.4" />
      <path d="M16.5 6C11 6.5 6 7.8 3.4 10" />
      <path d="M16.5 6C19 9 19.6 14 18.4 18" />
    </svg>
  );
}
