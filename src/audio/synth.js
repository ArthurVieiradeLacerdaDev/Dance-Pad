// Three original loop-based instrumentals, composed for this project.
// No third-party recordings, melodies or samples. Fixed seed = repeatable audio and charts.
export function synthesize(style) {
  const sampleRate = 22050, duration = 64;
  const output = new Float32Array(duration * sampleRate);
  const bpm = { forro: 100, samba: 108, funk: 112 }[style];
  if (!bpm) throw new Error('Base desconhecida.');
  const beat = 60 / bpm;
  let seed = 904721;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  function add(time, length, fn, volume = 1) {
    const offset = Math.round(time * sampleRate), size = Math.round(length * sampleRate);
    for (let i = 0; i < size && offset + i < output.length; i++) {
      if (offset + i >= 0) output[offset + i] += fn(i / sampleRate, i / size) * volume;
    }
  }
  function kick(time, strength = 1) {
    add(time, .29, t => Math.sin(2 * Math.PI * (49 * t + 52 * .03 * (1 - Math.exp(-t / .03)))) * Math.exp(-t * 18), .63 * strength);
  }
  function drum(time, strength = 1, low = false) {
    add(time, low ? .16 : .105, t => (random() * .65 + Math.sin(t * 2 * Math.PI * (low ? 180 : 430)) * .35) * Math.exp(-t * (low ? 25 : 39)), .22 * strength);
  }
  function hat(time, strength = 1) {
    let last = 0;
    add(time, .065, t => { const noise = random(), high = noise - last; last = noise; return high * Math.exp(-t * 65); }, .075 * strength);
  }
  function tone(time, note, length, volume = .1, kind = 'soft') {
    const freq = 440 * 2 ** ((note - 69) / 12);
    add(time, length, (t, progress) => {
      const env = Math.min(1, t * 100) * Math.min(1, (length - t) * 35) * Math.exp(-progress * 2.1);
      const phase = t * freq * Math.PI * 2;
      return (Math.sin(phase) + Math.sin(phase * 2) * (kind === 'reed' ? .38 : .13) + Math.sin(phase * 3) * .12) * env;
    }, volume);
  }
  const chordRoots = [45, 41, 48, 43];
  const melodies = {
    forro: [69, 72, 76, 72, 74, 72, 69, 67, 65, 69, 72, 69, 67, 64, 67, 69],
    samba: [72, 76, 79, 76, 74, 72, 67, 69, 72, 74, 76, 72, 69, 67, 64, 67],
    funk: [69, 69, 72, 76, 74, 72, 69, 67, 69, 72, 74, 76, 72, 69, 67, 64]
  };
  for (let b = 0; b * beat < duration - 1.5; b++) {
    const time = b * beat, bar = Math.floor(b / 4), root = chordRoots[Math.floor(bar / 2) % 4];
    if (style === 'forro') {
      kick(time, b % 2 ? .65 : 1);
      drum(time + beat * .5, .8, b % 2 === 0);
      hat(time); hat(time + beat * .5, .7);
      tone(time, root - 12, beat * .65, .18);
      if (b % 2 === 1) tone(time + beat * .5, root - 5, beat * .4, .11);
    } else if (style === 'samba') {
      kick(time, b % 2 ? 1 : .7);
      drum(time + beat * .25, .6, true); drum(time + beat * .75, .5);
      hat(time, .65); hat(time + beat * .5);
      tone(time, root - 12, beat * .6, .18);
      tone(time + beat * .75, root - 5, beat * .22, .11);
    } else {
      kick(time); if (b % 4 === 3) kick(time + beat * .75, .7);
      if (b % 2) { drum(time, 1.2); drum(time + .016, .6); }
      hat(time); hat(time + beat * .5, .65);
      tone(time, root - 12, beat * .7, .2);
    }
    // Add layers after the first four beats, then drop out for a brief bridge.
    const bridge = bar % 12 === 7;
    if (b >= 4 && !bridge) {
      const minor = root === 45 ? 3 : 4;
      if (b % 2 === 0) for (const note of [root + 12, root + 12 + minor, root + 19]) tone(time + beat * .5, note, beat * .5, .035, 'reed');
      const melody = melodies[style];
      tone(time + (style === 'samba' ? beat * .25 : 0), melody[b % melody.length], beat * .65, .075, style === 'forro' ? 'reed' : 'soft');
    }
  }
  // Headroom and a gentle fade out, never hard clip.
  let peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  for (let i = 0; i < output.length; i++) {
    const t = i / sampleRate;
    output[i] *= .84 / (peak || 1) * Math.min(1, (duration - t) / 1.5);
  }
  return { samples: output, sampleRate, duration, bpm };
}
