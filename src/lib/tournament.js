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
