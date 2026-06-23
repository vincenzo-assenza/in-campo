import { describe, it, expect } from 'vitest';
import {
  makeTeams,
  ladderNextRound,
  pairKey,
  scoreRepeats,
  recordPairs,
  makeTeamsAvoidingRepeats,
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

  it('etichetta il movimento di ogni squadra (sale/scende/resta + campo di provenienza)', () => {
    const courts = [
      { teamA: team('W0'), teamB: team('L0'), winner: 'A' },
      { teamA: team('W1'), teamB: team('L1'), winner: 'A' },
      { teamA: team('W2'), teamB: team('L2'), winner: 'A' },
    ];
    const next = ladderNextRound(courts);
    // Campo 0: vincente del campo 0 resta in vetta, vincente del campo 1 sale
    expect(next[0].teamA.move).toBe('stay');
    expect(next[0].teamB.move).toBe('up');
    expect(next[0].teamB.fromCourt).toBe(1);
    // Campo 2 (fondo): perdente del campo 2 resta in fondo
    expect(next[2].teamB.move).toBe('stay');
    // Perdente del campo 0 scende dal campo 0
    expect(next[1].teamA.move).toBe('down');
    expect(next[1].teamA.fromCourt).toBe(0);
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
