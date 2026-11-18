// Minimal MQTT 3.1.1 packet codec (QoS 0/1) for the browser.
// Pure functions: no DOM, no network. Covered by tests/mqtt.test.mjs.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PACKET = Object.freeze({
  CONNECT: 1, CONNACK: 2, PUBLISH: 3, PUBACK: 4, SUBSCRIBE: 8, SUBACK: 9,
  PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14
});

export const CONNACK_ERRORS = Object.freeze({
  1: 'versão de protocolo recusada', 2: 'client id recusado', 3: 'broker indisponível',
  4: 'usuário ou senha inválidos', 5: 'não autorizado'
});

export function encodeString(text) {
  const bytes = encoder.encode(String(text));
  if (bytes.length > 0xffff) throw new Error('Texto MQTT longo demais.');
  return Uint8Array.of(bytes.length >> 8, bytes.length & 0xff, ...bytes);
}

export function encodeRemainingLength(length) {
  if (!Number.isInteger(length) || length < 0 || length > 268435455) throw new Error('Tamanho MQTT inválido.');
  const out = [];
  do {
    let byte = length % 128; length = Math.floor(length / 128);
    if (length > 0) byte |= 0x80;
    out.push(byte);
  } while (length > 0);
  return out;
}

function packet(firstByte, ...parts) {
  const body = parts.map(part => part instanceof Uint8Array ? part : Uint8Array.from(part));
  const size = body.reduce((sum, part) => sum + part.length, 0);
  const header = [firstByte, ...encodeRemainingLength(size)];
  const out = new Uint8Array(header.length + size);
  out.set(header, 0);
  let offset = header.length;
  for (const part of body) { out.set(part, offset); offset += part.length; }
  return out;
}

export function buildConnect({ clientId, keepAlive = 30, username, password, clean = true }) {
  let flags = clean ? 0x02 : 0;
  const payload = [encodeString(clientId)];
  if (username) { flags |= 0x80; payload.push(encodeString(username)); }
  if (password) { flags |= 0x40; payload.push(encodeString(password)); }
  return packet(PACKET.CONNECT << 4, encodeString('MQTT'), [4, flags, keepAlive >> 8, keepAlive & 0xff], ...payload);
}

export function buildSubscribe(packetId, topics, qos = 0) {
  const list = (Array.isArray(topics) ? topics : [topics]).flatMap(topic => [encodeString(topic), [qos]]);
  return packet((PACKET.SUBSCRIBE << 4) | 0x02, [packetId >> 8, packetId & 0xff], ...list);
}

export function buildPublish(topic, payload, { retain = false } = {}) {
  const bytes = payload instanceof Uint8Array ? payload : encoder.encode(String(payload));
  return packet((PACKET.PUBLISH << 4) | (retain ? 1 : 0), encodeString(topic), bytes);
}

export const buildPuback = packetId => packet(PACKET.PUBACK << 4, [packetId >> 8, packetId & 0xff]);
export const buildPingreq = () => Uint8Array.of(PACKET.PINGREQ << 4, 0);
export const buildDisconnect = () => Uint8Array.of(PACKET.DISCONNECT << 4, 0);

// WebSocket frames may contain several MQTT packets, or only part of one.
export class PacketReader {
  constructor() { this.buffer = new Uint8Array(0); }
  push(chunk) {
    const data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const merged = new Uint8Array(this.buffer.length + data.length);
    merged.set(this.buffer); merged.set(data, this.buffer.length);
    this.buffer = merged;
    const packets = [];
    for (;;) {
      if (this.buffer.length < 2) break;
      let multiplier = 1, length = 0, index = 1, byte;
      do {
        if (index >= this.buffer.length) return packets;
        if (index > 4) throw new Error('Pacote MQTT malformado.');
        byte = this.buffer[index++];
        length += (byte & 0x7f) * multiplier; multiplier *= 128;
      } while (byte & 0x80);
      if (this.buffer.length < index + length) break;
      packets.push({ type: this.buffer[0] >> 4, flags: this.buffer[0] & 0x0f, body: this.buffer.slice(index, index + length) });
      this.buffer = this.buffer.slice(index + length);
    }
    return packets;
  }
}

export function parseConnack(body) {
  return { sessionPresent: !!(body[0] & 1), returnCode: body[1] ?? 255 };
}

export function parsePublish(flags, body) {
  const qos = (flags >> 1) & 0x03;
  const topicLength = (body[0] << 8) | body[1];
  const topic = decoder.decode(body.subarray(2, 2 + topicLength));
  let offset = 2 + topicLength, packetId = null;
  if (qos > 0) { packetId = (body[offset] << 8) | body[offset + 1]; offset += 2; }
  return { topic, qos, packetId, retain: !!(flags & 1), dup: !!(flags & 8), payload: body.slice(offset) };
}

export function parseSuback(body) {
  return { packetId: (body[0] << 8) | body[1], codes: Array.from(body.subarray(2)) };
}

export const decodeText = bytes => decoder.decode(bytes);
