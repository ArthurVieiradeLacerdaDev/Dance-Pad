import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKET, PacketReader, buildConnect, buildSubscribe, buildPublish, buildPuback,
  buildPingreq, parseConnack, parsePublish, parseSuback, decodeText
} from '../src/input/mqtt-packets.js';
import { InputRouter } from '../src/input/input.js';
import { addLeaderboardEntry, loadLeaderboard, clearLeaderboard } from '../src/game/ranking.js';

test('MQTT Packet Codec: Connect, Connack, Publish, Subscribe', () => {
  const conn = buildConnect({ clientId: 'test-client', keepAlive: 60 });
  assert.ok(conn instanceof Uint8Array);
  assert.equal(conn[0] >> 4, PACKET.CONNECT);

  const reader = new PacketReader();
  // Simula CONNACK aceito
  const connackBytes = Uint8Array.of((PACKET.CONNACK << 4), 2, 0, 0);
  const packets = reader.push(connackBytes);
  assert.equal(packets.length, 1);
  const ack = parseConnack(packets[0].body);
  assert.equal(ack.returnCode, 0);

  // Simula PUBLISH de passo
  const pubBytes = buildPublish('str/ddr/passos', '{"seta":"UP","ts":12345}');
  const pubPackets = reader.push(pubBytes);
  assert.equal(pubPackets.length, 1);
  const parsedPub = parsePublish(pubPackets[0].flags, pubPackets[0].body);
  assert.equal(parsedPub.topic, 'str/ddr/passos');
  assert.equal(decodeText(parsedPub.payload), '{"seta":"UP","ts":12345}');
});

test('InputRouter: aceita formato com campo "seta"', () => {
  const fakeWindow = new EventTarget();
  const prevWindow = globalThis.window;
  const prevDoc = globalThis.document;
  globalThis.window = fakeWindow;
  globalThis.document = { querySelector: () => null };

  try {
    let pressed = null;
    const router = new InputRouter({ enabled: () => true, pause: () => {}, exit: () => {} });
    router.addEventListener('press', e => { pressed = e.detail.direction; });

    router.receive('{"seta":"DOWN"}');
    assert.equal(pressed, 'DOWN');

    router.receive({ seta: 'RIGHT', action: 'press' });
    assert.equal(pressed, 'RIGHT');
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDoc;
  }
});

test('Ranking: ordenação e persistência em memória/localStorage mock', () => {
  globalThis.localStorage = (() => {
    let store = {};
    return {
      getItem: k => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      clear: () => { store = {}; }
    };
  })();

  clearLeaderboard();
  addLeaderboardEntry({ name: 'Jogador B', score: 30000, accuracy: 85.0 });
  addLeaderboardEntry({ name: 'Jogador A', score: 50000, accuracy: 95.0, wonBombom: true });
  addLeaderboardEntry({ name: 'Jogador C', score: 10000, accuracy: 60.0 });

  const list = loadLeaderboard();
  assert.equal(list.length, 3);
  assert.equal(list[0].name, 'Jogador A');
  assert.equal(list[0].wonBombom, true);
  assert.equal(list[1].name, 'Jogador B');
});
