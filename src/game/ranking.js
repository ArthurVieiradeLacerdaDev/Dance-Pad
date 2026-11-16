export const STORAGE_KEY = 'evil-dance-leaderboard';
export const PLAYER_KEY = 'evil-dance-player-name';
export const COMPETITION_TRACK_ID = 'ai-se-eu'; // Faixa oficial do desafio do bombom

export const BOMBOM_TARGET_STAGE = 2; // Quem passar da Fase 2 (Mediana) ganha bombom
export const BOMBOM_MIN_SCORE = 25000; // Pontuação mínima de segurança na fase mediana

export function getSavedPlayerName() {
  try {
    return localStorage.getItem(PLAYER_KEY) || '';
  } catch {
    return '';
  }
}

export function savePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_KEY, (name || '').trim().slice(0, 24));
  } catch {}
}

export function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveLeaderboard(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function addLeaderboardEntry({ name, score, accuracy, bestCombo, stageReached, wonBombom, mode, trackTitle }) {
  const cleanName = (name || '').trim().slice(0, 20) || 'Dançarino Anônimo';
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: cleanName,
    score: Math.round(score || 0),
    accuracy: Number((accuracy || 0).toFixed(1)),
    bestCombo: Number(bestCombo || 0),
    stageReached: stageReached || 1,
    wonBombom: !!wonBombom,
    mode: mode || 'competition',
    trackTitle: trackTitle || 'Desafio Oficial',
    date: new Date().toISOString()
  };

  const current = loadLeaderboard();
  current.push(entry);
  // Ordena por pontuação descrescente, desempate por precisão
  current.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);
  saveLeaderboard(current); // Sem limite de quantidade
  return { entry, rank: current.findIndex(e => e.id === entry.id) + 1, list: current };
}

export function clearLeaderboard() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
