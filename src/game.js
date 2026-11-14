import { AudioTransport } from './audio.js';
import { DIRECTIONS } from './input.js';
import { createScore, judgeTiming, recordJudgment, accuracy, HIT_WINDOWS } from './scoring.js';

const $ = id => document.getElementById(id);
export const formatTime = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
export function arrowMarkup() { return '<svg aria-hidden="true" viewBox="0 0 48 48"><use href="#i-arrow"/></svg>'; }

export class Game {
  constructor({ buffer, analysis, chart, track, offset = 0, onFinish, onPause }) {
    this.chart = chart; this.analysis = analysis; this.offset = offset;
    this.notes = chart.notes.map(note => ({ ...note, judged: false, el: null }));
    this.transport = new AudioTransport(buffer, chart.duration);
    this.score = createScore(); this.state = 'ready'; this.spawnIndex = 0; this.active = new Set();
    this.onFinish = onFinish; this.onPause = onPause;
    this.board = $('game-board'); this.layer = $('notes-layer');
    this.grid = $('beat-grid'); this.grid.replaceChildren();
    this.beatLines = Array.from({ length: 32 }, () => {
      const line = document.createElement('div'); line.className = 'beat-line'; this.grid.append(line); return line;
    });
    this.layer.replaceChildren(); $('receptors').replaceChildren();
    this.pads = {};
    DIRECTIONS.forEach(direction => {
      const pad = document.createElement('button');
      pad.className = `pad dir-${direction}`; pad.dataset.key = { LEFT: '←', UP: '↑', DOWN: '↓', RIGHT: '→' }[direction];
      pad.setAttribute('aria-label', { LEFT: 'Esquerda', UP: 'Cima', DOWN: 'Baixo', RIGHT: 'Direita' }[direction]);
      pad.dataset.direction = direction; pad.innerHTML = arrowMarkup();
      this.pads[direction] = pad; $('receptors').append(pad);
    });
    $('playing-title').textContent = track.title;
    $('game-length').textContent = formatTime(chart.duration);
    this.resize = () => {
      this.width = this.board.clientWidth; this.height = this.board.clientHeight;
      // Custom properties can contain clamp()/vw/dvh, not a numeric px value.
      // Measure the resolved elements so responsive/fullscreen sizes stay finite.
      const probe = document.createElement('div');
      probe.className = 'note'; probe.style.visibility = 'hidden';
      probe.setAttribute('aria-hidden', 'true'); this.layer.append(probe);
      this.size = parseFloat(getComputedStyle(probe).width); probe.remove();
      this.padSize = parseFloat(getComputedStyle(this.pads.UP).width);
      const bottom = parseFloat(getComputedStyle($('receptors')).bottom);
      this.target = this.height - bottom - this.padSize / 2;
      this.renderNotes(this.transport.time() - this.offset);
    };
    this.observer = new ResizeObserver(this.resize); this.observer.observe(this.board);
    this.resize(); this.updateHUD();
  }
  async start() {
    await this.transport.resume();
    if (this.state === 'ended') return;
    this.state = 'playing'; this.tick();
  }
  async resume() {
    if (this.state !== 'paused' || this.resuming) return;
    this.resuming = true;
    try {
      await this.transport.resume();
      if (this.state === 'ended') return;
      this.state = 'playing'; this.onPause(false); this.tick();
    }
    finally { this.resuming = false; }
  }
  pause() {
    if (this.state !== 'playing') return;
    this.transport.pause(); this.state = 'paused'; cancelAnimationFrame(this.frame);
    $('game-overlay').hidden = false; $('countdown-label').textContent = 'RESPIRE. A PISTA ESPERA.';
    $('countdown').textContent = 'Pausa'; $('countdown').style.fontSize = '55px';
    $('resume-button').hidden = false; this.onPause(true);
  }
  togglePause() { return this.state === 'paused' ? this.resume() : this.pause(); }
  tick = () => {
    if (this.state !== 'playing') return;
    const time = this.transport.time(), mapTime = time - this.offset;
    const counting = time < 0;
    $('game-overlay').hidden = !counting;
    $('resume-button').hidden = true;
    if (counting) {
      $('countdown-label').textContent = 'PREPARE-SE';
      $('countdown').textContent = Math.min(3, Math.ceil(-time)); $('countdown').style.fontSize = '';
    }
    while (this.spawnIndex < this.notes.length && this.notes[this.spawnIndex].time - this.chart.travel <= mapTime) {
      const note = this.notes[this.spawnIndex++];
      const el = document.createElement('div'); el.className = `note dir-${note.dir}`; el.innerHTML = arrowMarkup();
      el.setAttribute('aria-hidden', 'true'); this.layer.append(el); note.el = el; this.active.add(note);
    }
    for (const note of this.active) {
      if (mapTime - note.time > HIT_WINDOWS.ok) {
        this.consume(note); recordJudgment(this.score, 'miss'); this.feedback('miss'); this.updateHUD();
      }
    }
    this.renderNotes(mapTime);
    $('game-progress-fill').style.width = `${Math.min(100, Math.max(0, time) / this.chart.duration * 100)}%`;
    $('elapsed').textContent = formatTime(time);
    if (time >= this.chart.duration + .25) { this.finish(); return; }
    this.frame = requestAnimationFrame(this.tick);
  };
  renderNotes(mapTime) {
    const speed = (this.target + this.size / 2) / this.chart.travel;
    const period = 60 / this.chart.bpm;
    const phase = this.chart.phase ?? this.analysis.phase;
    const firstBeat = Math.floor((mapTime - phase) / period) - 1;
    this.beatLines.forEach((line, index) => {
      const beat = firstBeat + index;
      const y = this.target + (mapTime - (phase + beat * period)) * speed;
      line.hidden = beat < 0 || y < 0 || y > this.height;
      line.classList.toggle('measure-line', beat % 4 === 0);
      line.style.transform = `translate3d(0,${y}px,0)`;
    });
    for (const note of this.active) {
      const x = (DIRECTIONS.indexOf(note.dir) + .5) * this.width / 4 - this.size / 2;
      const y = this.target + (mapTime - note.time) * speed - this.size / 2;
      note.el.style.transform = `translate3d(${x}px,${y}px,0)`;
    }
  }
  press(direction) {
    const pad = this.pads[direction];
    if (!pad || this.state !== 'playing') return;
    pad.classList.add('active');
    const time = this.transport.time(); if (time < 0) return;
    const mapTime = time - this.offset;
    let closest = null, distance = Infinity;
    for (const note of this.active) {
      const delta = Math.abs(mapTime - note.time);
      if (note.dir === direction && delta < distance) { closest = note; distance = delta; }
    }
    const judgment = closest && judgeTiming(distance);
    if (judgment) {
      this.consume(closest); recordJudgment(this.score, judgment); this.feedback(judgment, (mapTime - closest.time) * 1000);
      pad.classList.remove('hit'); void pad.offsetWidth; pad.classList.add('hit');
      this.particles(direction);
    } else { recordJudgment(this.score, 'wrong'); this.feedback('wrong'); }
    this.updateHUD();
  }
  release(direction) { this.pads[direction]?.classList.remove('active'); }
  consume(note) { note.judged = true; note.el?.remove(); note.el = null; this.active.delete(note); }
  feedback(type, error = 0) {
    const labels = { perfect: 'Perfeito!', good: 'Muito bem!', ok: 'Quase!', miss: 'Continue!', wrong: 'No ritmo!' };
    const colors = { perfect: 'var(--lime)', good: 'var(--cyan)', ok: 'var(--yellow)', miss: '#e6a4ad', wrong: 'var(--muted)' };
    const details = { miss: 'UMA NOVA SETA, UMA NOVA CHANCE', wrong: 'ESPERE A SETA ENCONTRAR O ALVO' };
    const el = $('judgment');
    el.replaceChildren(document.createTextNode(labels[type]));
    const detail = document.createElement('small');
    detail.textContent = details[type] || `${error < 0 ? 'ADIANTOU' : 'ATRASOU'} ${Math.abs(Math.round(error))} ms`;
    el.append(detail); el.style.color = colors[type]; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.feedbackTimer); this.feedbackTimer = setTimeout(() => el.classList.remove('show'), 750);
  }
  particles(direction) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const x = (DIRECTIONS.indexOf(direction) + .5) * this.width / 4, y = this.target;
    for (let i = 0; i < 8; i++) {
      const particle = document.createElement('i'); particle.className = `hit-particle dir-${direction}`;
      const angle = Math.PI * 2 * i / 8;
      particle.style.left = `${x}px`; particle.style.top = `${y}px`;
      particle.style.setProperty('--dx', `${Math.cos(angle) * 65}px`);
      particle.style.setProperty('--dy', `${Math.sin(angle) * 65}px`);
      this.board.append(particle); particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
  }
  updateHUD() {
    $('score').textContent = String(this.score.points).padStart(6, '0');
    $('combo').textContent = this.score.combo; $('best-combo').textContent = this.score.bestCombo;
    const value = accuracy(this.score); $('accuracy').textContent = value === null ? '—' : `${value.toFixed(1)}%`;
  }
  finish() {
    for (const note of this.notes) if (!note.judged) { note.judged = true; recordJudgment(this.score, 'miss'); }
    const result = { ...this.score, accuracy: accuracy(this.score) || 0, total: this.notes.length };
    this.destroy(); this.onFinish(result);
  }
  destroy() {
    this.state = 'ended'; this.transport.dispose(); cancelAnimationFrame(this.frame); clearTimeout(this.feedbackTimer);
    this.observer.disconnect(); this.layer.replaceChildren(); this.active.clear();
    this.grid.replaceChildren();
    $('judgment').classList.remove('show');
    this.board.querySelectorAll('.hit-particle').forEach(el => el.remove());
    Object.values(this.pads).forEach(pad => pad.classList.remove('active', 'hit'));
  }
}
