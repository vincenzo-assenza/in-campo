import { describe, it, expect } from 'vitest';
import { makeTeams, ladderNextRound } from './tournament.js';

const identity = (a) => [...a]; // shuffle deterministico per i test

describe('makeTeams', () => {
  it('crea 2*campi squadre con dimensioni bilanciate (diff <= 1)', () => {
    const players = Array.from({ length: 25 }, (_, i) => `p${i}`);
    const courts = makeTeams(players, 3, identity);
    expect(courts).toHaveLength(3);
    const sizes = courts.flatMap((c) => [c.teamA.players.length, c.teamB.players.length]);
    expect(sizes).toHaveLength(6);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(total).toBe(25);
    expect(courts.every((c) => c.winner === null)).toBe(true);
  });

  it('ogni giocatore compare una sola volta', () => {
    const players = Array.from({ length: 16 }, (_, i) => `p${i}`);
    const courts = makeTeams(players, 2, identity);
    const all = courts.flatMap((c) => [...c.teamA.players, ...c.teamB.players]);
    expect(new Set(all).size).toBe(16);
  });
});

describe('ladderNextRound', () => {
  const team = (id) => ({ id, players: [id] });

  it('vincente sale, perdente scende, bordi restano (3 campi)', () => {
    // court0: A vince; court1: A vince; court2: A vince
    const courts = [
      { teamA: team('W0'), teamB: team('L0'), winner: 'A' },
      { teamA: team('W1'), teamB: team('L1'), winner: 'A' },
      { teamA: team('W2'), teamB: team('L2'), winner: 'A' },
    ];
    const next = ladderNextRound(courts);
    const ids = (c) => [c.teamA.id, c.teamB.id];
    expect(ids(next[0])).toEqual(['W0', 'W1']); // top: vincente che resta + vincente che sale
    expect(ids(next[1])).toEqual(['L0', 'W2']);
    expect(ids(next[2])).toEqual(['L1', 'L2']); // bottom: perdente che scende + perdente che resta
    expect(next.every((c) => c.winner === null)).toBe(true);
  });

  it('campo singolo: le stesse due squadre rigiocano', () => {
    const courts = [{ teamA: team('A'), teamB: team('B'), winner: 'B' }];
    const next = ladderNextRound(courts);
    expect(new Set([next[0].teamA.id, next[0].teamB.id])).toEqual(new Set(['A', 'B']));
  });

  it('lancia errore se un campo non ha vincitore', () => {
    const courts = [{ teamA: team('A'), teamB: team('B'), winner: null }];
    expect(() => ladderNextRound(courts)).toThrow();
  });
});
