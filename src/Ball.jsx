// Pallina da beach volley stilizzata (line-art, eredita il colore via currentColor).
export function Ball({ className = 'w-5 h-5 text-accent' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c-3.6 3.8-3.6 14.2 0 18" />
      <path d="M3.6 8.6c5.2 2.6 11.6 2.6 16.8 0" />
      <path d="M4.8 16.6c4.6-2 9.8-2 14.4 0" />
    </svg>
  );
}
