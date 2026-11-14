export const DIRECTIONS = ['LEFT', 'UP', 'DOWN', 'RIGHT'];
const keys = { ArrowLeft: 'LEFT', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowRight: 'RIGHT' };

// Keyboard, pointer and future MQTT share this boundary. No broker/network connection yet.
export class InputRouter extends EventTarget {
  constructor({ enabled, pause, exit }) {
    super(); this.enabled = enabled; this.held = new Set();
    window.addEventListener('keydown', event => {
      if (!enabled() || event.target?.closest?.('input,select,textarea') || document.querySelector('dialog[open]')) return;
      const dir = keys[event.key];
      if (dir || event.code === 'Space' || event.key === 'Escape') event.preventDefault();
      if (event.repeat) return;
      if (dir) this.press(dir, 'keyboard');
      else if (event.code === 'Space') pause();
      else if (event.key === 'Escape') exit();
    });
    window.addEventListener('keyup', event => { if (keys[event.key]) this.release(keys[event.key], 'keyboard'); });
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('dancepad:input', event => this.receive(event.detail));
  }
  press(direction, source = 'external') {
    if (!this.enabled() || !DIRECTIONS.includes(direction)) return false;
    const token = `${source}:${direction}`;
    if (this.held.has(token)) return false;
    this.held.add(token);
    this.dispatchEvent(new CustomEvent('press', { detail: { direction, source, at: performance.now() } }));
    return true;
  }
  release(direction, source = 'external') {
    this.held.delete(`${source}:${direction}`);
    this.dispatchEvent(new CustomEvent('release', { detail: { direction, source } }));
  }
  receive(payload) {
    let value = payload;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { value = { dir: value.trim().toUpperCase() }; }
    }
    if (typeof value === 'string') value = { dir: value.toUpperCase() };
    if (!value || typeof value !== 'object') return false;
    const direction = String(value.dir || value.direction || '').toUpperCase();
    if (!DIRECTIONS.includes(direction)) return false;
    // A retained broker message must never count as a new physical step.
    if (value.retained === true) return false;
    if (value.action === 'release' || value.pressed === false) { this.release(direction, 'mqtt'); return true; }
    const accepted = this.press(direction, 'mqtt');
    // Legacy direction-only messages represent a pulse, not a held switch.
    if (value.pressed !== true && value.action !== 'press') this.release(direction, 'mqtt');
    return accepted;
  }
  reset() {
    for (const token of Array.from(this.held)) {
      const [source, direction] = token.split(':'); this.release(direction, source);
    }
  }
}
