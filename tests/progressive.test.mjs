import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePCM, generateChart, SAMPLE_RATE } from '../src/audio/analysis.js';
import { synthesize } from '../src/audio/synth.js';

test('Modo Competição: Gera mapa progressivo em 3 fases', () => {
  const synth = synthesize('forro');
  const samples = Float32Array.from({ length: synth.samples.length / 2 }, (_, i) => (synth.samples[i * 2] + synth.samples[i * 2 + 1]) / 2);
  const analysis = analyzePCM(samples, SAMPLE_RATE);

  const chart = generateChart(analysis, { difficulty: 'progressive', duration: 60 });
  assert.equal(chart.isProgressive, true);
  assert.ok(chart.notes.length > 30);

  const stages = new Set(chart.notes.map(n => n.stage));
  assert.ok(stages.has(1), 'Deve conter Fase 1');
  assert.ok(stages.has(2), 'Deve conter Fase 2 (Mediana / Bombom)');
  assert.ok(stages.has(3), 'Deve conter Fase 3 (Drop Insano)');
});
