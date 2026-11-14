import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePCM, generateChart, SAMPLE_RATE, LEVELS } from '../src/analysis.js';
import { synthesize } from '../src/synth.js';
import { judgeTiming, createScore, recordJudgment, accuracy } from '../src/scoring.js';

for (const style of ['forro', 'samba', 'funk']) {
  test(`DSP e fases completas: ${style}`, () => {
    const synth = synthesize(style);
    const samples = Float32Array.from({ length: synth.samples.length / 2 }, (_, i) => (synth.samples[i * 2] + synth.samples[i * 2 + 1]) / 2);
    const analysis = analyzePCM(samples, SAMPLE_RATE);
    assert.ok(Math.abs(analysis.bpm - synth.bpm) < 2, `BPM estimado: ${analysis.bpm}, esperado: ${synth.bpm}`);
    assert.ok(analysis.confidence > .5);
    assert.ok(analysis.onsets.length > 60);
    assert.equal(analysis.waveform.length, 160);
    let previousCount = 0;
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const chart = generateChart(analysis, { difficulty, duration: 60 });
      assert.ok(chart.notes.length > previousCount);
      assert.ok(chart.notes.at(-1).time > 55, 'A fase precisa cobrir a música, não só a introdução.');
      assert.ok(chart.notes.every(note => note.time >= .6 && note.time < 60 && ['LEFT', 'UP', 'DOWN', 'RIGHT'].includes(note.dir)));
      for (let i = 1; i < chart.notes.length; i++) {
        assert.ok(chart.notes[i].time - chart.notes[i - 1].time >= LEVELS[difficulty].minGap - .0011, 'Sem passos simultâneos ou densidade excessiva.');
        assert.notEqual(chart.notes[i].dir, chart.notes[i - 1].dir);
      }
      assert.deepEqual(chart, generateChart(analysis, { difficulty, duration: 60 }), 'Mesmo áudio e opções devem gerar o mesmo mapa.');
      previousCount = chart.notes.length;
    }
    const full = generateChart(analysis, { duration: 90 });
    assert.equal(full.duration, synth.duration);
    assert.equal(generateChart(analysis, { bpm: 90 }).bpm, 90);
    assert.throws(() => generateChart(analysis, { bpm: -1 }), /BPM/);
    assert.throws(() => generateChart(analysis, { duration: Infinity }), /Duração/);
    assert.throws(() => generateChart(analysis, { difficulty: 'impossible' }), /Nível/);
  });
}

test('Silêncio e arquivos curtos não produzem fases falsas', () => {
  assert.throws(() => analyzePCM(new Float32Array(SAMPLE_RATE * 5)), /silêncio/);
  assert.throws(() => analyzePCM(new Float32Array(200)), /3 segundos/);
});

test('Pausas de silêncio no meio da música não recebem notas', () => {
  const synth = synthesize('funk');
  const pcm = Float32Array.from({ length: synth.samples.length / 2 }, (_, i) => synth.samples[i * 2]);
  pcm.fill(0, SAMPLE_RATE * 20, SAMPLE_RATE * 30);
  const analysis = analyzePCM(pcm);
  const chart = generateChart(analysis, { difficulty: 'hard' });
  assert.ok(!chart.notes.some(note => note.time > 20.15 && note.time < 29.85));
});

test('Janelas de julgamento são simétricas e independem dos FPS', () => {
  for (const sign of [-1, 1]) {
    assert.equal(judgeTiming(.065 * sign), 'perfect');
    assert.equal(judgeTiming(.066 * sign), 'good');
    assert.equal(judgeTiming(.12 * sign), 'good');
    assert.equal(judgeTiming(.121 * sign), 'ok');
    assert.equal(judgeTiming(.18 * sign), 'ok');
    assert.equal(judgeTiming(.181 * sign), null);
  }
});

test('Combo, erros e precisão penalizam spam e perdas', () => {
  const score = createScore();
  assert.equal(accuracy(score), null);
  recordJudgment(score, 'perfect'); recordJudgment(score, 'perfect');
  assert.equal(score.points, 2000); assert.equal(score.bestCombo, 2);
  assert.equal(accuracy(score), 100);
  recordJudgment(score, 'wrong'); assert.equal(score.combo, 0);
  recordJudgment(score, 'good'); recordJudgment(score, 'miss');
  assert.equal(score.bestCombo, 2); assert.equal(score.combo, 0);
  assert.ok(Math.abs(accuracy(score) - 54) < .00001);
});
