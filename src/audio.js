import { SAMPLE_RATE } from './analysis.js';

let context;
export function getAudioContext() {
  if (!context) context = new AudioContext({ latencyHint: 'interactive' });
  return context;
}

function workerJob(message, transfer = []) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('A análise demorou demais. Tente um áudio menor.')); }, 90000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = ({ data }) => { finish(); data.error ? reject(new Error(data.error)) : resolve(data); };
    worker.onerror = () => { finish(); reject(new Error('Não foi possível abrir o analisador. Execute com npm start ou Live Server.')); };
    worker.postMessage(message, transfer);
  });
}

// Bound decoded audio memory. Analysis is compact and reused between difficulties.
const bufferCache = new Map();
const analysisCache = new Map();
const pending = new Map();
export function forgetTrack(id) { bufferCache.delete(id); analysisCache.delete(id); }

export async function prepareTrack(track, onStatus = () => {}) {
  if (pending.has(track.id)) return pending.get(track.id);
  const job = (async () => {
    let buffer = bufferCache.get(track.id);
    if (!buffer) {
      onStatus(track.synth ? 'Preparando a base instrumental…' : 'Abrindo o áudio…');
      if (track.synth) {
        const result = await workerJob({ type: 'synth', style: track.synth });
        buffer = getAudioContext().createBuffer(1, result.samples.length, result.sampleRate);
        buffer.copyToChannel(result.samples, 0);
      } else {
        let bytes;
        if (track.file) bytes = await track.file.arrayBuffer();
        else {
          const response = await fetch(track.src);
          if (!response.ok) throw new Error('Arquivo de áudio não encontrado. Importe o arquivo novamente.');
          bytes = await response.arrayBuffer();
        }
        if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('Use arquivos de até 50 MB.');
        try { buffer = await getAudioContext().decodeAudioData(bytes); }
        catch { throw new Error('Não consegui ler este áudio. Tente um MP3 ou WAV válido.'); }
      }
      if (buffer.duration < 3 || buffer.duration > 600) throw new Error('Use uma música entre 3 segundos e 10 minutos.');
      bufferCache.set(track.id, buffer);
      while (bufferCache.size > 2) bufferCache.delete(bufferCache.keys().next().value);
    }
    let analysis = analysisCache.get(track.id);
    if (!analysis) {
      onStatus('Analisando graves, médios e agudos…');
      // OfflineAudioContext resamples with anti-aliasing, unlike dropping raw samples.
      const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * SAMPLE_RATE), SAMPLE_RATE);
      const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start();
      const mono = await offline.startRendering();
      const samples = mono.getChannelData(0).slice();
      ({ analysis } = await workerJob({ samples, sampleRate: SAMPLE_RATE }, [samples.buffer]));
      analysisCache.set(track.id, analysis);
    }
    return { buffer, analysis };
  })();
  pending.set(track.id, job);
  try { return await job; } finally { pending.delete(track.id); }
}

export class AudioTransport {
  constructor(buffer, duration) {
    this.context = getAudioContext(); this.buffer = buffer;
    this.duration = Math.min(duration, buffer.duration); this.position = -3;
    this.running = false; this.source = null; this.gain = this.context.createGain();
    this.gain.gain.value = .8; this.gain.connect(this.context.destination);
  }
  // Align note rendering and input judging with sound at the output device.
  outputTime() {
    const stamp = this.context.getOutputTimestamp?.();
    if (stamp?.contextTime > 0 && stamp.performanceTime > 0) {
      return Math.min(this.context.currentTime, stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000);
    }
    return this.context.currentTime - (this.context.outputLatency || this.context.baseLatency || 0);
  }
  time() { return this.running ? this.outputTime() - this.anchor : this.position; }
  async resume() {
    await this.context.resume();
    if (this.disposed) return;
    this.anchor = this.context.currentTime + .08 - this.position;
    const offset = Math.max(0, this.position);
    this.source = this.context.createBufferSource(); this.source.buffer = this.buffer;
    this.source.connect(this.gain);
    this.source.start(Math.max(this.context.currentTime + .08, this.anchor), offset, Math.max(.001, this.duration - offset));
    this.running = true;
  }
  pause() {
    if (!this.running) return;
    this.position = this.time(); this.running = false;
    this.source.stop(); this.source.disconnect(); this.source = null;
  }
  dispose() {
    if (this.disposed) return;
    this.pause(); this.disposed = true; this.gain.disconnect();
  }
}
