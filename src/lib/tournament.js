export function defaultShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeTeams(players, courtCount, shuffle = defaultShuffle) {
  const nTeams = courtCount * 2;
  const shuffled = shuffle(players);
  const buckets = Array.from({ length: nTeams }, () => []);
  shuffled.forEach((p, i) => buckets[i % nTeams].push(p)); // round-robin → diff <= 1
  const teams = buckets.map((players, i) => ({ id: `t${i}`, players }));

  const courts = [];
  for (let i = 0; i < courtCount; i++) {
    courts.push({ teamA: teams[2 * i], teamB: teams[2 * i + 1], winner: null });
  }
  return courts;
}

// --- Anti-ripetizione compagni tra turni ---------------------------------
// La "history" è una mappa "a|b" -> quante volte a e b sono stati compagni.

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Tutte le coppie di compagni dentro i campi (chi sta nella stessa squadra).
function courtPairs(courts) {
  const pairs = [];
  for (const c of courts) {
    for (const team of [c.teamA, c.teamB]) {
      const p = team.players;
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) pairs.push(pairKey(p[i], p[j]));
      }
    }
  }
  return pairs;
}

// Penalità di una formazione: somma di quante volte le sue coppie sono già state insieme.
export function scoreRepeats(courts, history = {}) {
  return courtPairs(courts).reduce((sum, k) => sum + (history[k] || 0), 0);
}

// Aggiorna la history contando le coppie di una formazione.
export function recordPairs(history, courts) {
  const next = { ...history };
  for (const k of courtPairs(courts)) next[k] = (next[k] || 0) + 1;
  return next;
}

// Genera la formazione che minimizza i compagni ripetuti: prova N estrazioni
// casuali e tiene la migliore (Monte Carlo).
// ponytail: best-of-N, ottimizzazione esatta solo se mai servisse davvero.
export function makeTeamsAvoidingRepeats(players, courtCount, history = {}, attempts = 300, shuffle = defaultShuffle) {
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < attempts; i++) {
    const courts = makeTeams(players, courtCount, shuffle);
    const score = scoreRepeats(courts, history);
    if (score < bestScore) {
      best = courts;
      bestScore = score;
      if (score === 0) break; // nessuna coppia ripetuta: non si fa meglio
    }
  }
  return best;
}

// Helper: estrae vincente/perdente di un campo (lancia se il vincitore manca).
function winnerLoser(court, i) {
  if (court.winner !== 'A' && court.winner !== 'B') {
    throw new Error(`Campo ${i} senza vincitore`);
  }
  const a = court.winner === 'A';
  return {
    winner: a ? court.teamA : court.teamB,
    loser: a ? court.teamB : court.teamA,
    scoreWinner: a ? court.scoreA : court.scoreB,
    scoreLoser: a ? court.scoreB : court.scoreA,
  };
}

// Riepilogo del Round 1: per ogni campo chi ha vinto/perso e con che punteggio.
export function roundOneResults(courts) {
  return courts.map((c, i) => {
    const { winner, loser, scoreWinner, scoreLoser } = winnerLoser(c, i);
    return { court: i, winner: winner.players, loser: loser.players, scoreWinner, scoreLoser };
  });
}

// Riassume un round qualsiasi per l'archivio (tollera partite non concluse).
export function summarizeRound(courts) {
  return courts.map((c, i) => {
    if (c.winner === 'A' || c.winner === 'B') {
      const { winner, loser, scoreWinner, scoreLoser } = winnerLoser(c, i);
      return { court: i, winner: winner.players, loser: loser.players, scoreWinner, scoreLoser };
    }
    return {
      court: i,
      teamA: c.teamA.players,
      teamB: c.teamB.players,
      scoreA: c.scoreA ?? null,
      scoreB: c.scoreB ?? null,
    };
  });
}

// Round 2: i vincenti si sfidano tra loro, i perdenti tra loro.
// Classifica 1v2,3v4,5v6: vincenti (in ordine di campo) sopra, perdenti sotto,
// poi si accoppiano in fila. Con campi dispari il 3° vincente affronta il
// miglior perdente, ecc. Le squadre restano integre (cambiano solo gli avversari).
export function secondRound(courts) {
  const winners = [];
  const losers = [];
  courts.forEach((c, i) => {
    const { winner, loser } = winnerLoser(c, i);
    winners.push({ ...winner, move: 'won', fromCourt: i });
    losers.push({ ...loser, move: 'lost', fromCourt: i });
  });
  const seeds = [...winners, ...losers];
  const out = [];
  for (let i = 0; i < seeds.length; i += 2) {
    out.push({ teamA: seeds[i], teamB: seeds[i + 1], winner: null });
  }
  return out;
}
