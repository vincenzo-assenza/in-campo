import { describe, it, expect } from 'vitest';
import { weekCandidateDays, splitConfirmedWaitlist } from './poll.js';

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
