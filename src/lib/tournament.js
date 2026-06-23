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

export function ladderNextRound(courts) {
  const K = courts.length;
  const arrivals = Array.from({ length: K }, () => []);

  courts.forEach((court, i) => {
    if (court.winner !== 'A' && court.winner !== 'B') {
      throw new Error(`Campo ${i} senza vincitore`);
    }
    const winner = court.winner === 'A' ? court.teamA : court.teamB;
    const loser = court.winner === 'A' ? court.teamB : court.teamA;
    arrivals[Math.max(i - 1, 0)].push(winner); // sale di un campo
    arrivals[Math.min(i + 1, K - 1)].push(loser); // scende di un campo
  });

  return arrivals.map((teams) => ({ teamA: teams[0], teamB: teams[1], winner: null }));
}
