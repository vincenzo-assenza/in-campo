const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function weekCandidateDays(weekdays, today) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7; // 0=Lun
  const monday = new Date(start);
  monday.setDate(start.getDate() - mondayOffset);

  const out = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    if (weekdays.includes(day.getDay()) && day >= start) {
      out.push(iso(day));
    }
  }
  return out;
}

export function splitConfirmedWaitlist(signups, capacity) {
  const sorted = [...signups].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  return {
    confirmed: sorted.slice(0, capacity),
    waitlist: sorted.slice(capacity),
  };
}
