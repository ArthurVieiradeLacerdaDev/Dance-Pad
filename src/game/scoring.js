export const HIT_WINDOWS = { perfect: .065, good: .12, ok: .18 };
export function judgeTiming(delta) {
  const distance = Math.abs(delta);
  return distance <= HIT_WINDOWS.perfect + 1e-9 ? 'perfect' : distance <= HIT_WINDOWS.good + 1e-9 ? 'good' : distance <= HIT_WINDOWS.ok + 1e-9 ? 'ok' : null;
}
export function createScore() { return { points: 0, combo: 0, bestCombo: 0, perfect: 0, good: 0, ok: 0, miss: 0, wrong: 0 }; }
export function recordJudgment(score, judgment) {
  if (judgment === 'wrong') { score.wrong++; score.combo = 0; return; }
  score[judgment]++;
  if (judgment === 'miss') { score.combo = 0; return; }
  score.combo++; score.bestCombo = Math.max(score.combo, score.bestCombo);
  const base = { perfect: 1000, good: 700, ok: 400 }[judgment];
  score.points += Math.round(base * (1 + Math.min(1, Math.floor((score.combo - 1) / 10) * .1)));
}
export function accuracy(score) {
  const total = score.perfect + score.good + score.ok + score.miss + score.wrong;
  return total ? (score.perfect + score.good * .7 + score.ok * .4) / total * 100 : null;
}
