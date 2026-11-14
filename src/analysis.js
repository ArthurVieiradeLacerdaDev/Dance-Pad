// Pure DSP: also runs in a Worker and in the deterministic Node tests.
export const ANALYSIS_VERSION = 1;
export const SAMPLE_RATE = 11025;
const FFT_SIZE = 1024;
const HOP = 256;
const FRAME_TIME = HOP / SAMPLE_RATE;
const clamp = (x, min, max) => Math.min(max, Math.max(min, x));

function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = -2 * Math.PI / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < size / 2; j++) {
        const c = Math.cos(angle * j), s = Math.sin(angle * j);
        const a = start + j, b = a + size / 2;
        const tr = c * real[b] - s * imag[b], ti = s * real[b] + c * imag[b];
        real[b] = real[a] - tr; imag[b] = imag[a] - ti;
        real[a] += tr; imag[a] += ti;
      }
    }
  }
}

function percentile(values, proportion) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * proportion)] || 0;
}

function estimateTempo(envelope) {
  const n = envelope.length;
  const mean = envelope.reduce((sum, x) => sum + x, 0) / n;
  const centered = envelope.map(x => Math.max(0, x - mean));
  const correlations = new Map();
  function correlation(lag) {
    const key = Math.round(lag);
    if (correlations.has(key)) return correlations.get(key);
    let value = 0, a = 0, b = 0;
    for (let i = key; i < n; i++) {
      value += centered[i] * centered[i - key];
      a += centered[i] ** 2; b += centered[i - key] ** 2;
    }
    const result = value / (Math.sqrt(a * b) || 1);
    correlations.set(key, result);
    return result;
  }
  let best = { bpm: 100, score: 0 };
  for (let bpm = 75; bpm <= 160; bpm += .25) {
    const period = 60 / bpm / FRAME_TIME;
    // Consider two successive beats; a small central prior resolves half/double ambiguity.
    const score = (correlation(period) + .5 * correlation(period * 2)) * (1 - Math.abs(bpm - 112) * .0009);
    if (score > best.score) best = { bpm, score };
  }
  return { bpm: Math.round(best.bpm * 10) / 10, confidence: clamp(best.score / 1.5, 0, 1) };
}

export function findPhase(envelope, bpm) {
  const period = 60 / bpm;
  let phase = 0, best = -Infinity;
  for (let candidate = 0; candidate < period; candidate += FRAME_TIME / 2) {
    let score = 0, count = 0;
    for (let time = candidate; time < envelope.length * FRAME_TIME; time += period) {
      const index = Math.round(time / FRAME_TIME);
      score += Math.max(envelope[index - 1] || 0, envelope[index] || 0, envelope[index + 1] || 0);
      count++;
    }
    if (score / count > best) { best = score / count; phase = candidate; }
  }
  return phase;
}

export function analyzePCM(samples, sampleRate = SAMPLE_RATE) {
  if (sampleRate !== SAMPLE_RATE) throw new Error(`A análise requer PCM de ${SAMPLE_RATE} Hz.`);
  if (samples.length < sampleRate * 3) throw new Error('Escolha um áudio com pelo menos 3 segundos.');
  const frameCount = Math.ceil(samples.length / HOP);
  const fluxBands = Array.from({ length: 3 }, () => new Float32Array(frameCount));
  const energies = new Float32Array(frameCount);
  const previous = new Float32Array(FFT_SIZE / 2);
  const real = new Float64Array(FFT_SIZE), imag = new Float64Array(FFT_SIZE);
  const window = Float64Array.from({ length: FFT_SIZE }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0;
    for (let j = 0; j < FFT_SIZE; j++) {
      const value = samples[frame * HOP + j - FFT_SIZE / 2] || 0;
      real[j] = value * window[j]; imag[j] = 0; sum += value * value;
    }
    energies[frame] = Math.sqrt(sum / FFT_SIZE);
    fft(real, imag);
    for (let k = 4; k < FFT_SIZE / 2; k++) {
      const frequency = k * sampleRate / FFT_SIZE;
      const magnitude = Math.log1p(Math.hypot(real[k], imag[k]));
      const band = frequency < 200 ? 0 : frequency < 2000 ? 1 : 2;
      fluxBands[band][frame] += Math.max(0, magnitude - previous[k]);
      previous[k] = magnitude;
    }
  }
  const scales = fluxBands.map(values => percentile(values, .95) || 1);
  const envelope = Float32Array.from({ length: frameCount }, (_, i) =>
    fluxBands[0][i] / scales[0] * .55 + fluxBands[1][i] / scales[1] * .3 + fluxBands[2][i] / scales[2] * .15);
  const maxEnergy = Math.max(...energies.subarray(0, Math.min(energies.length, 10000)), percentile(energies, .99));
  if (maxEnergy < .0001) throw new Error('Este áudio parece estar em silêncio. Escolha outra faixa.');
  const onsets = [];
  const globalThreshold = percentile(envelope, .65) * .45;
  for (let i = 2; i < frameCount - 2; i++) {
    if (envelope[i] <= envelope[i - 1] || envelope[i] < envelope[i + 1]) continue;
    const start = Math.max(0, i - 16), end = Math.min(frameCount, i + 17);
    let mean = 0, variance = 0;
    for (let j = start; j < end; j++) mean += envelope[j];
    mean /= end - start;
    for (let j = start; j < end; j++) variance += (envelope[j] - mean) ** 2;
    const threshold = Math.max(globalThreshold, mean * 1.12 + Math.sqrt(variance / (end - start)) * .22);
    if (envelope[i] < threshold || energies[i] < maxEnergy * .025) continue;
    const onset = { time: i * FRAME_TIME, strength: envelope[i], bands: fluxBands.map((band, b) => band[i] / scales[b]) };
    const previousOnset = onsets.at(-1);
    if (previousOnset && onset.time - previousOnset.time < .12) {
      if (onset.strength > previousOnset.strength) onsets[onsets.length - 1] = onset;
    } else onsets.push(onset);
  }
  if (onsets.length < 4) throw new Error('Poucos ataques detectados. Tente uma música com percussão mais marcada.');
  const tempo = estimateTempo(envelope);
  const waveform = Array.from({ length: 160 }, (_, i) => {
    const start = Math.floor(i * energies.length / 160), end = Math.max(start + 1, Math.floor((i + 1) * energies.length / 160));
    let sum = 0;
    for (let j = start; j < end; j++) sum += energies[j] || 0;
    return sum / (end - start) / maxEnergy;
  });
  const bandTotals = fluxBands.map((band, b) => band.reduce((sum, x) => sum + x / scales[b], 0));
  const total = bandTotals.reduce((sum, x) => sum + x, 0) || 1;
  return {
    version: ANALYSIS_VERSION, duration: samples.length / sampleRate,
    ...tempo, phase: findPhase(envelope, tempo.bpm), onsets, waveform,
    bands: bandTotals.map(value => value / total),
    // Keep compact frame features for silence gating and manual-tempo phase alignment.
    frameTime: FRAME_TIME, envelope: Array.from(envelope), energies: Array.from(energies), maxEnergy
  };
}

export const LEVELS = {
  easy: { label: 'Primeiros passos', stride: 2, minGap: .65, travel: 2.65 },
  normal: { label: 'No ritmo', stride: 1, minGap: .36, travel: 2.25 },
  hard: { label: 'Desafio', stride: .5, minGap: .25, travel: 1.9 }
};

export function generateChart(analysis, { difficulty = 'easy', duration = 60, bpm: manualBpm } = {}) {
  const level = LEVELS[difficulty];
  if (!level) throw new Error('Nível inválido.');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Duração inválida.');
  const bpm = manualBpm || analysis.bpm;
  if (!Number.isFinite(bpm) || bpm < 60 || bpm > 180) throw new Error('O BPM deve estar entre 60 e 180.');
  const phase = manualBpm ? findPhase(analysis.envelope, bpm) : analysis.phase;
  const period = 60 / bpm, limit = Math.min(duration, analysis.duration);
  const notes = [];
  let onsetIndex = 0;
  for (let beat = 0, gridTime = phase; gridTime < limit - .35; beat++, gridTime = phase + beat * period * level.stride) {
    if (gridTime < .75) continue;
    const frame = Math.round(gridTime / analysis.frameTime);
    if ((analysis.energies[frame] || 0) < analysis.maxEnergy * .035) continue;
    while (onsetIndex < analysis.onsets.length - 1 && analysis.onsets[onsetIndex + 1].time < gridTime - .12) onsetIndex++;
    let nearest = null;
    for (let j = Math.max(0, onsetIndex - 1); j < Math.min(analysis.onsets.length, onsetIndex + 4); j++) {
      const candidate = analysis.onsets[j];
      if (Math.abs(candidate.time - gridTime) <= .1 && (!nearest || Math.abs(candidate.time - gridTime) < Math.abs(nearest.time - gridTime))) nearest = candidate;
    }
    // Eighth-note decorations only appear when an actual nearby attack exists.
    if (difficulty === 'hard' && beat % 2 && (!nearest || nearest.strength < .25)) continue;
    const time = nearest ? nearest.time : gridTime;
    if (time < .6 || time > limit - .3 || (notes.length && time - notes.at(-1).time < level.minGap)) continue;
    const bands = nearest?.bands || [1, .5, .25];
    const dominant = bands.indexOf(Math.max(...bands));
    const pools = [['UP', 'DOWN'], ['LEFT', 'RIGHT'], ['RIGHT', 'UP']];
    let direction = pools[dominant][notes.length % 2];
    if (notes.at(-1)?.dir === direction) direction = ['LEFT', 'UP', 'DOWN', 'RIGHT'][(notes.length + dominant) % 4];
    if (notes.at(-1)?.dir === direction) direction = direction === 'LEFT' ? 'RIGHT' : 'LEFT';
    notes.push({ time: Math.round(time * 1000) / 1000, dir: direction, band: ['low', 'mid', 'high'][dominant] });
  }
  if (!notes.length) throw new Error('Não foi possível gerar passos neste trecho. Tente música completa ou outra faixa.');
  return { version: 1, difficulty, bpm, phase, duration: limit, travel: level.travel, notes };
}
