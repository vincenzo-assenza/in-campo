import { describe, it, expect } from 'vitest';
import { weekCandidateDays, splitConfirmedWaitlist, parseStartTime, hasStarted } from './poll.js';

describe('parseStartTime', () => {
  it('estrae il primo HH:MM dalla nota', () => {
    expect(parseStartTime('Campo 2 · 19:30–21:30', '20:00')).toBe('19:30');
  });
  it('usa il fallback se non ci sono orari', () => {
    expect(parseStartTime('Campo A', '19:30')).toBe('19:30');
    expect(parseStartTime('', '19:30')).toBe('19:30');
    expect(parseStartTime(null, '19:30')).toBe('19:30');
  });
});

describe('hasStarted', () => {
  it('false prima dell orario di inizio, true dopo/uguale', () => {
    expect(hasStarted('2026-06-23', '19:30', new Date('2026-06-23T18:00:00'))).toBe(false);
    expect(hasStarted('2026-06-23', '19:30', new Date('2026-06-23T20:00:00'))).toBe(true);
    expect(hasStarted('2026-06-23', '19:30', new Date('2026-06-23T19:30:00'))).toBe(true);
  });
});

describe('weekCandidateDays', () => {
  it('ritorna i weekday configurati della settimana corrente, >= oggi', () => {
    // 2026-06-23 è un martedì. weekdays = [2,4,6] = mar/gio/sab.
    const today = new Date('2026-06-23T10:00:00');
    expect(weekCandidateDays([2, 4, 6], today)).toEqual([
      '2026-06-23', '2026-06-25', '2026-06-27',
    ]);
  });

  it('esclude i giorni passati della settimana', () => {
    // venerdì 2026-06-26: martedì e giovedì sono già passati
    const today = new Date('2026-06-26T10:00:00');
    expect(weekCandidateDays([2, 4, 6], today)).toEqual(['2026-06-27']);
  });
});

describe('splitConfirmedWaitlist', () => {
  const s = (name, t) => ({ player_name: name, created_at: t });

  it('primi N confermati per ordine di iscrizione, resto in attesa', () => {
    const signups = [
      s('C', '2026-06-23T10:03:00Z'),
      s('A', '2026-06-23T10:01:00Z'),
      s('B', '2026-06-23T10:02:00Z'),
    ];
    const { confirmed, waitlist } = splitConfirmedWaitlist(signups, 2);
    expect(confirmed.map(x => x.player_name)).toEqual(['A', 'B']);
    expect(waitlist.map(x => x.player_name)).toEqual(['C']);
  });

  it('capienza 0 = tutti in attesa; lista vuota = vuoti', () => {
    expect(splitConfirmedWaitlist([s('A', 't')], 0).confirmed).toEqual([]);
    expect(splitConfirmedWaitlist([], 5)).toEqual({ confirmed: [], waitlist: [] });
  });
});
