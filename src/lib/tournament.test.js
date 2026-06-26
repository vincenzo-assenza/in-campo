import { describe, it, expect } from 'vitest';
import {
  makeTeams,
  secondRound,
  roundOneResults,
  summarizeRound,
  pairKey,
  scoreRepeats,
  recordPairs,
  makeTeamsAvoidingRepeats,
  playerStandings,
} from './tournament.js';

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

describe('secondRound (vincenti vs vincenti, perdenti vs perdenti)', () => {
  const team = (id) => ({ id, players: [id] });
  const courts3 = () => [
    { teamA: team('W0'), teamB: team('L0'), winner: 'A', scoreA: 21, scoreB: 18 },
    { teamA: team('W1'), teamB: team('L1'), winner: 'A', scoreA: 21, scoreB: 19 },
    { teamA: team('W2'), teamB: team('L2'), winner: 'A', scoreA: 21, scoreB: 17 },
  ];

  it('classifica 1v2,3v4,5v6 con 3 campi: V-V / V-P / P-P', () => {
    const next = secondRound(courts3());
    const ids = (c) => [c.teamA.id, c.teamB.id];
    expect(ids(next[0])).toEqual(['W0', 'W1']); // due vincenti
    expect(ids(next[1])).toEqual(['W2', 'L0']); // 3° vincente vs miglior perdente
    expect(ids(next[2])).toEqual(['L1', 'L2']); // due perdenti
    expect(next.every((c) => c.winner === null)).toBe(true);
  });

  it('campi pari: vincenti tutti insieme, perdenti tutti insieme (2 campi)', () => {
    const courts = [
      { teamA: team('W0'), teamB: team('L0'), winner: 'A' },
      { teamA: team('W1'), teamB: team('L1'), winner: 'A' },
    ];
    const next = secondRound(courts);
    expect([next[0].teamA.id, next[0].teamB.id]).toEqual(['W0', 'W1']); // vincenti
    expect([next[1].teamA.id, next[1].teamB.id]).toEqual(['L0', 'L1']); // perdenti
  });

  it('etichetta ogni squadra come vincente/perdente + campo di provenienza', () => {
    const next = secondRound(courts3());
    expect(next[0].teamA.move).toBe('won');
    expect(next[0].teamA.fromCourt).toBe(0);
    expect(next[2].teamB.move).toBe('lost');
    expect(next[2].teamB.fromCourt).toBe(2);
  });

  it('lancia errore se un campo non ha vincitore', () => {
    const courts = [{ teamA: team('A'), teamB: team('B'), winner: null }];
    expect(() => secondRound(courts)).toThrow();
  });

  it('roundOneResults riassume vincente, perdente e punteggio di ogni campo', () => {
    const res = roundOneResults(courts3());
    expect(res[0]).toEqual({ court: 0, winner: ['W0'], loser: ['L0'], scoreWinner: 21, scoreLoser: 18 });
    expect(res).toHaveLength(3);
  });

  it('summarizeRound gestisce partite decise e non concluse', () => {
    const courts = [
      { teamA: team('W0'), teamB: team('L0'), winner: 'A', scoreA: 21, scoreB: 15 },
      { teamA: team('X'), teamB: team('Y'), winner: null, scoreA: 10, scoreB: null },
    ];
    const res = summarizeRound(courts);
    expect(res[0]).toEqual({ court: 0, winner: ['W0'], loser: ['L0'], scoreWinner: 21, scoreLoser: 15 });
    expect(res[1]).toEqual({ court: 1, teamA: ['X'], teamB: ['Y'], scoreA: 10, scoreB: null });
  });
});

describe('anti-ripetizione compagni', () => {
  const courtsOf = (...teams) => {
    const out = [];
    for (let i = 0; i < teams.length; i += 2) {
      out.push({ teamA: { id: `t${i}`, players: teams[i] }, teamB: { id: `t${i + 1}`, players: teams[i + 1] }, winner: null });
    }
    return out;
  };

  it('pairKey è indipendente dall ordine', () => {
    expect(pairKey('Anna', 'Bea')).toBe(pairKey('Bea', 'Anna'));
  });

  it('recordPairs conta le coppie di compagni (non tra avversari)', () => {
    const courts = courtsOf(['Anna', 'Bea'], ['Cleo', 'Dino']);
    const h = recordPairs({}, courts);
    expect(h[pairKey('Anna', 'Bea')]).toBe(1);
    expect(h[pairKey('Cleo', 'Dino')]).toBe(1);
    // Anna e Cleo sono avversarie, non compagne → non registrate
    expect(h[pairKey('Anna', 'Cleo')]).toBeUndefined();
  });

  it('scoreRepeats somma le penalità delle coppie già viste', () => {
    const history = { [pairKey('Anna', 'Bea')]: 2 };
    const courts = courtsOf(['Anna', 'Bea'], ['Cleo', 'Dino']);
    expect(scoreRepeats(courts, history)).toBe(2);
    expect(scoreRepeats(courtsOf(['Anna', 'Cleo'], ['Bea', 'Dino']), history)).toBe(0);
  });

  it('makeTeamsAvoidingRepeats evita i compagni già visti quando possibile', () => {
    const players = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    // Primo turno: registra le coppie create.
    const t1 = makeTeams(players, 2);
    const history = recordPairs({}, t1);
    // Secondo turno: con 8 giocatori e 2 campi una formazione senza ripetizioni esiste.
    const t2 = makeTeamsAvoidingRepeats(players, 2, history, 500);
    expect(scoreRepeats(t2, history)).toBe(0);
  });
});

describe('playerStandings', () => {
  const partite = [
    {
      round1: [{ court: 0, winner: ['A', 'B'], loser: ['C', 'D'], scoreWinner: 21, scoreLoser: 10 }],
      round2: [{ court: 0, winner: ['A', 'C'], loser: ['B', 'D'], scoreWinner: 21, scoreLoser: 18 }],
    },
  ];
  it('aggrega per giocatore e ordina per vittorie (punti = turni vinti)', () => {
    const s = playerStandings(partite);
    expect(s[0].player).toBe('A'); // vince entrambi
    expect(s[0].wins).toBe(2);
    expect(s[0].played).toBe(2);
    const d = Object.fromEntries(s.map((p) => [p.player, p]));
    expect(d.D.wins).toBe(0);
    expect(d.D.losses).toBe(2);
    expect('diff' in d.A).toBe(false); // niente differenza punti per il singolo
  });
});
