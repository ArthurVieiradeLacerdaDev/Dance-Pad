import { tracks } from './catalog.js';
import { prepareTrack, forgetTrack, getAudioContext } from './audio.js';
import { generateChart, LEVELS } from './analysis.js';
import { InputRouter } from './input.js';
import { Game, formatTime } from './game.js';

const $ = id => document.getElementById(id);
let selected = tracks[0], filter = 'demo', difficulty = 'easy', game = null;
let prepared = null, chart = null, preview = null, previewGain = null, previewTimer = null, busy = false;
let selectionVersion = 0, importTarget = null;
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const hints = { easy: 'Uma seta por vez, com espaço para respirar.', normal: 'Mais passos, seguindo a pulsação principal.', hard: 'Ataques extras e setas mais próximas. Sem passos simultâneos.' };
const descriptions = {
  demo: 'Três instrumentais originais para testar agora. Sem precisar baixar nada.',
  local: 'Os três áudios da equipe, agora com fases geradas automaticamente.',
  recommended: 'Sugestões para o público da feira. Selecione e carregue o arquivo de áudio para jogar.',
  imported: 'Seus áudios ficam nesta sessão do navegador. Exporte a fase para guardar o mapa.'
};

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 5500);
}

function renderTracks() {
  const list = $('song-list'); list.replaceChildren();
  const visible = tracks.filter(track => track.category === filter);
  if (!visible.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = 'Seu próximo som pode estar aqui. Use “Importar áudio” para criar uma fase.'; list.append(empty);
  }
  visible.forEach(track => {
    const row = document.createElement('div'); row.className = 'song-row';
    const button = document.createElement('button'); button.className = `song-card${selected.id === track.id ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(selected.id === track.id));
    button.setAttribute('aria-label', `Selecionar ${track.title}, ${track.artist}`);
    const title = escapeHTML(track.title), artist = escapeHTML(track.artist);
    button.innerHTML = `<span class="song-art cover-${track.cover}" aria-hidden="true"><small>EVIL DANCE / BR</small><strong>${escapeHTML(track.short || track.title).replaceAll('\n', '<br>')}</strong></span><span class="song-info"><span class="tag">${escapeHTML(track.file ? 'Áudio carregado' : track.tag)}</span><h3>${title}</h3><p>${artist}</p><span class="song-meta"><span>${escapeHTML(track.genre)}</span><span>${track.bpm ? Math.round(track.bpm) + ' BPM' : 'BPM automático'}</span><span>${track.duration ? formatTime(track.duration) : track.category === 'recommended' && !track.file ? 'Carregar áudio' : 'Auto map'}</span></span></span><span class="song-state${selected.id === track.id ? ' check' : ''}" aria-hidden="true">${selected.id === track.id ? '✓' : '<svg><use href="#i-play"/></svg>'}</span>`;
    button.addEventListener('click', () => {
      selectTrack(track);
      if (matchMedia('(max-width: 650px)').matches) $('setup-title').parentElement.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }); row.append(button);
    if (track.reference) {
      const link = document.createElement('a'); link.className = 'recommendation-link';
      link.href = track.reference; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = `${track.referenceLabel} ↗`; row.append(link);
    }
    list.append(row);
  });
  $('filter-description').textContent = descriptions[filter];
  $('import-count').textContent = tracks.filter(track => track.category === 'imported').length;
}

function stopPreview() {
  clearTimeout(previewTimer);
  if (preview) { preview.onended = null; try { preview.stop(); } catch { /* Already ended. */ } preview.disconnect(); preview = null; }
  if (previewGain) { previewGain.disconnect(); previewGain = null; }
  $('preview-button').textContent = 'Ouvir prévia';
}

function selectTrack(track) {
  if (busy) return;
  stopPreview(); selected = track; prepared = null; chart = null; selectionVersion++;
  $('setup-title').textContent = track.title; $('selected-artist').textContent = track.artist;
  $('selected-cover').className = `selected-cover cover-${track.cover}`;
  const cover = $('selected-cover'); cover.replaceChildren();
  const number = document.createElement('span'); number.className = 'cover-number'; number.textContent = `${track.number || 'BR'} / BRASIL EM MOVIMENTO`;
  const circles = document.createElement('div'); circles.className = 'cover-orbits';
  const title = document.createElement('span'); title.className = 'cover-title'; title.textContent = track.title;
  title.style.maxWidth = '220px';
  const bottom = document.createElement('span'); bottom.className = 'cover-bottom'; bottom.textContent = `${track.synth ? 'BASE ORIGINAL' : 'SUA SELEÇÃO'} · ${track.genre.toUpperCase()}`;
  cover.append(number, circles, title, bottom);
  $('track-bpm').textContent = track.bpm ? Math.round(track.bpm) : '—';
  $('track-duration').textContent = track.duration ? formatTime(track.duration) : '—';
  $('track-notes').textContent = '—'; $('analysis-status').textContent = track.description;
  const missing = track.category === 'recommended' && !track.file && !track.src;
  $('start-button').querySelector('span').textContent = missing ? 'Carregar áudio e jogar' : 'Vamos jogar';
  drawWaveform(); renderTracks();
}

function drawWaveform(waveform = prepared?.analysis.waveform) {
  const canvas = $('waveform'), dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 280, height = 54;
  canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height);
  if (!waveform) {
    ctx.strokeStyle = '#344537'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke(); return;
  }
  const bars = Math.floor(width / 5);
  for (let i = 0; i < bars; i++) {
    const value = waveform[Math.floor(i * waveform.length / bars)] || 0;
    const h = Math.max(2, value * 48);
    ctx.fillStyle = i < bars * .5 ? '#bcf36b' : '#6b8a55';
    ctx.fillRect(i * 5 + 1, (height - h) / 2, 2, h);
  }
}

function updateChart() {
  if (!prepared) return;
  const manualBpm = $('manual-bpm').value ? Number($('manual-bpm').value) : undefined;
  const duration = $('session-length').value === 'full' ? prepared.buffer.duration : 60;
  chart = generateChart(prepared.analysis, { difficulty, duration, bpm: manualBpm });
  $('track-bpm').textContent = Math.round(chart.bpm); $('track-notes').textContent = chart.notes.length;
  $('track-duration').textContent = formatTime(prepared.buffer.duration);
  const confidence = prepared.analysis.confidence;
  $('analysis-status').textContent = `${chart.notes.length} passos prontos · ${Math.round(chart.bpm)} BPM ${manualBpm ? 'manual' : 'estimado'}${confidence < .3 ? ' · Revise o ritmo no ajuste fino.' : ' · Vamos nessa!'} `;
  drawWaveform();
}

async function ensurePrepared() {
  if (selected.category === 'recommended' && !selected.file && !selected.src) {
    importTarget = selected; $('audio-import').click(); return false;
  }
  const version = selectionVersion, track = selected;
  if (!prepared) {
    const result = await prepareTrack(track, status => { if (version === selectionVersion) $('analysis-status').textContent = status; });
    if (version !== selectionVersion) return false;
    prepared = result; track.bpm = result.analysis.bpm; track.duration = result.buffer.duration; renderTracks();
  }
  updateChart(); return true;
}

async function withBusy(action) {
  if (busy) return;
  busy = true;
  const controls = [$('start-button'), $('preview-button'), $('export-button'), $('import-button'), ...document.querySelectorAll('.filter,[data-difficulty]')];
  controls.forEach(control => control.disabled = true); $('setup-title').parentElement.setAttribute('aria-busy', 'true');
  try { await action(); }
  catch (error) { $('analysis-status').textContent = error.message; toast(error.message); }
  finally { busy = false; controls.forEach(control => control.disabled = false); $('setup-title').parentElement.setAttribute('aria-busy', 'false'); }
}

function showLibrary() {
  game?.destroy(); game = null; input.reset(); stopPreview();
  $('results-dialog').close(); $('library').hidden = false; $('game-screen').hidden = true;
  document.body.classList.remove('playing'); $('pause-button').querySelector('span').textContent = 'Pausar';
  $('start-button').focus();
}

async function startGame() {
  stopPreview();
  await withBusy(async () => {
    await getAudioContext().resume();
    if (!await ensurePrepared()) return;
    game?.destroy(); $('results-dialog').close(); input.reset();
    $('library').hidden = true; $('game-screen').hidden = false; document.body.classList.add('playing');
    window.scrollTo(0, 0);
    game = new Game({ buffer: prepared.buffer, analysis: prepared.analysis, chart, track: selected,
      offset: Number($('timing-offset').value) / 1000, onFinish: showResults,
      onPause: paused => { input.reset(); $('pause-button').querySelector('span').textContent = paused ? 'Continuar' : 'Pausar'; }
    });
    try { await game.start(); $('pause-button').focus(); }
    catch (error) { showLibrary(); throw error; }
  });
}

function showResults(result) {
  input.reset();
  const grade = result.accuracy >= 95 ? 'S' : result.accuracy >= 85 ? 'A' : result.accuracy >= 70 ? 'B' : result.accuracy >= 50 ? 'C' : 'D';
  $('result-grade').textContent = grade;
  $('result-title').textContent = result.accuracy >= 70 ? 'Você encontrou seu ritmo!' : 'Cada tentativa é um novo passo.';
  $('result-song').textContent = `${selected.title} · ${LEVELS[difficulty].label}`;
  $('result-score').textContent = result.points.toLocaleString('pt-BR');
  $('result-accuracy').textContent = `${result.accuracy.toFixed(1)}%`; $('result-combo').textContent = `${result.bestCombo}×`;
    const hits = result.perfect + result.good + result.ok;
    const advice = result.accuracy >= 95 ? 'Ritmo impecável! Que tal subir o nível?' : result.accuracy >= 85 ? 'Ótima partida! Continue emendando acertos.' : result.accuracy >= 70 ? 'Bom ritmo! Tente acertar mais perto do centro do alvo.' : result.accuracy >= 50 ? 'Você está pegando o ritmo. Mais uma tentativa?' : 'Continue praticando em Primeiros passos, uma seta de cada vez.';
    $('result-summary').textContent = `Você acertou ${hits} de ${result.total} passos. ${advice}`;
  $('result-hits').textContent = `${result.perfect} perfeitos · ${result.good} muito bons · ${result.ok} quase · ${result.miss} perdidos · ${result.wrong} fora do tempo`;
  $('results-dialog').showModal();
}

const input = new InputRouter({ enabled: () => !!game && ['playing', 'paused'].includes(game.state),
  pause: () => togglePause(), exit: () => showLibrary()
});
input.addEventListener('press', ({ detail }) => game?.press(detail.direction));
input.addEventListener('release', ({ detail }) => game?.release(detail.direction));
async function togglePause() {
  try { await game?.togglePause(); } catch (error) { toast(`Não consegui retomar o áudio: ${error.message}`); }
}
// Public adapter for an eventual MQTT client. It deliberately does not connect to a broker.
window.dancePad = Object.freeze({ receive: payload => input.receive(payload), get mode() { return 'keyboard'; } });
window.addEventListener('blur', () => game?.pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) { game?.pause(); stopPreview(); } });
const pointerDirections = new Map();
$('receptors').addEventListener('pointerdown', event => {
  const pad = event.target.closest('[data-direction]'); if (!pad) return;
  event.preventDefault(); pointerDirections.set(event.pointerId, pad.dataset.direction); pad.setPointerCapture(event.pointerId);
  input.press(pad.dataset.direction, `pointer-${event.pointerId}`);
});
window.addEventListener('pointerup', releasePointer); window.addEventListener('pointercancel', releasePointer);
function releasePointer(event) {
  const direction = pointerDirections.get(event.pointerId);
  if (direction) input.release(direction, `pointer-${event.pointerId}`);
  pointerDirections.delete(event.pointerId);
}
$('start-button').addEventListener('click', startGame);
$('leave-game').addEventListener('click', showLibrary);
$('pause-button').addEventListener('click', togglePause); $('resume-button').addEventListener('click', togglePause);
$('result-back').addEventListener('click', showLibrary); $('replay-button').addEventListener('click', startGame);
$('results-dialog').addEventListener('cancel', event => { event.preventDefault(); showLibrary(); });
$('preview-button').addEventListener('click', () => {
  if (preview) { stopPreview(); return; }
  withBusy(async () => {
    await getAudioContext().resume(); if (!await ensurePrepared()) return;
    preview = getAudioContext().createBufferSource(); preview.buffer = prepared.buffer;
    previewGain = getAudioContext().createGain(); previewGain.gain.value = .6; preview.connect(previewGain); previewGain.connect(getAudioContext().destination);
    preview.onended = stopPreview;
    preview.start(0, 0, Math.min(12, prepared.buffer.duration));
    $('preview-button').textContent = 'Parar prévia'; previewTimer = setTimeout(stopPreview, 12500);
  });
});
$('export-button').addEventListener('click', () => withBusy(async () => {
  if (!await ensurePrepared()) return;
  const { analysis } = prepared;
  const exportData = { ...chart, track: { title: selected.title, artist: selected.artist, src: selected.src || null, filename: selected.file?.name || null },
    timeMeaning: 'Seconds from audio start when the note reaches the target, before calibration offset.',
    analysis: { version: analysis.version, estimatedBpm: analysis.bpm, confidence: analysis.confidence,
      onsetCount: analysis.onsets.length, bands: { low: '43–200 Hz', mid: '200–2000 Hz', high: '2000–5512 Hz' },
      normalizedFluxShares: analysis.bands, onsets: analysis.onsets }, calibrationOffsetMs: Number($('timing-offset').value) };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `${selected.id}-${difficulty}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Fase exportada com os passos e os dados da análise.');
}));
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  renderTracks();
}));
document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
  difficulty = button.dataset.difficulty;
  document.querySelectorAll('[data-difficulty]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  $('difficulty-hint').textContent = hints[difficulty];
  try { updateChart(); } catch (error) { toast(error.message); }
}));
$('session-length').addEventListener('change', () => { try { updateChart(); } catch (error) { toast(error.message); } });
$('manual-bpm').addEventListener('change', () => { try { updateChart(); } catch (error) { toast(error.message); } });
let savedOffset = 0; try { savedOffset = Math.min(250, Math.max(-250, Number(localStorage.getItem('evil-dance-offset')) || 0)); } catch { /* Storage may be disabled. */ }
$('timing-offset').value = savedOffset; $('offset-value').textContent = `${savedOffset} ms`;
$('timing-offset').addEventListener('input', event => { $('offset-value').textContent = `${event.target.value} ms`; try { localStorage.setItem('evil-dance-offset', event.target.value); } catch { /* Optional preference. */ } });
$('import-button').addEventListener('click', () => { importTarget = null; $('audio-import').click(); });
$('audio-import').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('Escolha um áudio de até 50 MB.'); return; }
  if (busy) return;
  const target = importTarget; importTarget = null;
  const track = target || { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), artist: 'Seu áudio · nesta sessão', category: 'imported', genre: 'Importada', cover: 'local', tag: 'Seu som, seu mapa', description: 'Uma nova música para encontrar seu ritmo.' };
  track.file = file; forgetTrack(track.id); if (!target) tracks.push(track);
  filter = track.category;
  document.querySelectorAll('[data-filter]').forEach(item => { const active = item.dataset.filter === filter; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  selectTrack(track);
  await withBusy(async () => { if (await ensurePrepared()) toast('Áudio carregado. Sua fase está pronta para jogar.'); });
});
$('audio-import').addEventListener('cancel', () => { importTarget = null; });
$('nav-how').addEventListener('click', () => { if (game) showLibrary(); $('how-to').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); });
$('nav-library').addEventListener('click', () => { if (game) showLibrary(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
window.addEventListener('resize', () => drawWaveform());
renderTracks(); drawWaveform();
// A quiet visual Easter egg: the source recording only plays while hovered.
document.querySelectorAll('.dance-easter-egg').forEach(container => {
  const video = container.querySelector('video');
  container.addEventListener('pointerenter', async event => {
    if (event.pointerType === 'touch') return;
    try {
      video.currentTime = 0;
      await video.play();
      if (container.matches(':hover')) container.classList.add('show-original');
      else video.pause();
    } catch { container.classList.remove('show-original'); }
  });
  container.addEventListener('pointerleave', () => {
    container.classList.remove('show-original'); video.pause();
  });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) document.querySelectorAll('.dance-easter-egg').forEach(container => {
    container.classList.remove('show-original'); container.querySelector('video').pause();
  });
});
if (location.protocol === 'file:') toast('Abra com npm start ou Live Server para carregar o áudio e gerar as fases.');
