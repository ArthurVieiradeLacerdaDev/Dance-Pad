import test from 'node:test';
import assert from 'node:assert/strict';
import { InputRouter } from '../src/input.js';

test('Entrada comum valida MQTT, retenção, pressionamento e repetição', () => {
  const fakeWindow = new EventTarget();
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = fakeWindow;
  globalThis.document = { querySelector: () => null };
  let enabled = true, pauses = 0, presses = 0, releases = 0;
  try {
    const input = new InputRouter({ enabled: () => enabled, pause: () => pauses++, exit: () => {} });
    input.addEventListener('press', () => presses++);
    input.addEventListener('release', () => releases++);
    assert.equal(input.receive('UP'), true);
    assert.equal(input.receive('{"dir":"LEFT","pressed":true}'), true);
    assert.equal(input.receive('{"dir":"LEFT","pressed":true}'), false);
    input.receive({ dir: 'LEFT', pressed: false });
    assert.equal(input.receive({ dir: 'LEFT', pressed: true }), true);
    assert.equal(input.receive({ dir: 'RIGHT', retained: true }), false);
    assert.equal(input.receive('INVALID'), false);
    assert.equal(input.receive(null), false);
    assert.equal(input.receive(10), false);
    const key = new Event('keydown'); Object.assign(key, { key: 'ArrowDown', repeat: false });
    fakeWindow.dispatchEvent(key); // Event target need not be a DOM Element.
    const repeated = new Event('keydown'); Object.assign(repeated, { key: 'ArrowDown', repeat: true });
    fakeWindow.dispatchEvent(repeated);
    assert.equal(presses, 4);
    assert.ok(releases >= 2);
    input.reset(); assert.equal(input.held.size, 0);
    const space = new Event('keydown'); Object.assign(space, { code: 'Space' }); fakeWindow.dispatchEvent(space);
    assert.equal(pauses, 1);
    enabled = false; assert.equal(input.receive('DOWN'), false);
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});
