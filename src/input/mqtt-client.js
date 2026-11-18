import {
  PACKET, CONNACK_ERRORS, PacketReader, buildConnect, buildSubscribe, buildPublish, buildPuback,
  buildPingreq, buildDisconnect, parseConnack, parsePublish, parseSuback, decodeText
} from './mqtt-packets.js';

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000];

// MQTT over WebSocket, without external libraries, so the stand works offline.
// Browsers cannot open raw TCP (1883): Mosquitto must expose a websockets listener (9001).
// Events: 'status' { state, detail }   state = disconnected | connecting | connected | error
//         'message' { topic, payload, retained }
export class MqttClient extends EventTarget {
  constructor({ WebSocketImpl = globalThis.WebSocket, keepAlive = 30, timers = globalThis } = {}) {
    super();
    this.WebSocketImpl = WebSocketImpl; this.keepAlive = keepAlive; this.timers = timers;
    this.state = 'disconnected'; this.socket = null; this.packetId = 0; this.attempt = 0;
    this.options = null; this.wanted = false;
  }

  get connected() { return this.state === 'connected'; }

  connect({ url, subscriptions = [], clientId, username, password }) {
    if (!this.WebSocketImpl) throw new Error('Este navegador não suporta WebSocket.');
    if (!/^wss?:\/\//i.test(url || '')) throw new Error('Use um endereço ws:// ou wss:// (ex.: ws://localhost:9001).');
    this.close(false);
    this.options = { url, subscriptions, username, password,
      clientId: clientId || `evil-dance-${Math.random().toString(16).slice(2, 10)}` };
    this.wanted = true; this.attempt = 0;
    this.open();
  }

  open() {
    this.setState('connecting', this.options.url);
    const reader = new PacketReader();
    let socket;
    try { socket = new this.WebSocketImpl(this.options.url, ['mqtt']); }
    catch (error) { this.fail(error.message); return; }
    this.socket = socket; socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      this.send(buildConnect({ clientId: this.options.clientId, keepAlive: this.keepAlive,
        username: this.options.username, password: this.options.password }));
      this.connackTimer = this.timers.setTimeout(() => this.fail('O broker não respondeu ao CONNECT.'), 5000);
    };
    socket.onmessage = event => {
      if (socket !== this.socket) return;
      try { for (const item of reader.push(event.data)) this.handle(item); }
      catch (error) { this.fail(error.message); }
    };
    socket.onerror = () => { if (socket === this.socket) this.setState('error', 'Não foi possível falar com o broker.'); };
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.cleanup();
      if (this.wanted) this.scheduleReconnect();
      else if (this.state !== 'error') this.setState('disconnected');
    };
  }

  handle({ type, flags, body }) {
    if (type === PACKET.CONNACK) {
      this.timers.clearTimeout(this.connackTimer);
      const { returnCode } = parseConnack(body);
      if (returnCode !== 0) { this.wanted = false; this.fail(`Broker recusou: ${CONNACK_ERRORS[returnCode] || returnCode}.`); return; }
      this.attempt = 0;
      if (this.options.subscriptions.length) this.send(buildSubscribe(this.nextId(), this.options.subscriptions, 0));
      this.pingTimer = this.timers.setInterval(() => this.send(buildPingreq()), this.keepAlive * 750);
      this.setState('connected', this.options.url);
    } else if (type === PACKET.PUBLISH) {
      const message = parsePublish(flags, body);
      if (message.qos === 1) this.send(buildPuback(message.packetId));
      const payloadText = decodeText(message.payload);
      console.log(`%c[MQTT RECEBIDO] 📥 Tópico: "${message.topic}"`, 'color: #67d8ee; font-weight: bold;', payloadText);
      this.dispatchEvent(new CustomEvent('message', { detail: {
        topic: message.topic, payload: payloadText, retained: message.retain } }));
    } else if (type === PACKET.SUBACK) {
      if (parseSuback(body).codes.includes(0x80)) this.setState('error', 'O broker recusou a inscrição no tópico.');
    }
  }

  publish(topic, payload, { retain = false } = {}) {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    console.log(`%c[MQTT PUBLICADO] 📤 Tópico: "${topic}"`, 'color: #bcf36b; font-weight: bold;', payloadStr);
    if (!this.connected) {
      console.warn(`[MQTT] Não foi possível publicar em "${topic}": cliente desconectado.`);
      return false;
    }
    this.send(buildPublish(topic, payloadStr, { retain }));
    return true;
  }

  disconnect() { this.close(true); }

  close(notify = true) {
    this.wanted = false; this.timers.clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    if (socket) {
      try { if (socket.readyState === 1) socket.send(buildDisconnect()); } catch { /* Already closing. */ }
      this.socket = null; this.cleanup();
      try { socket.close(); } catch { /* Ignore. */ }
    }
    if (notify) this.setState('disconnected');
  }

  scheduleReconnect() {
    const delay = RECONNECT_DELAYS[Math.min(this.attempt++, RECONNECT_DELAYS.length - 1)];
    this.setState('connecting', `Reconectando em ${Math.round(delay / 1000)} s…`);
    this.reconnectTimer = this.timers.setTimeout(() => { if (this.wanted) this.open(); }, delay);
  }

  fail(detail) {
    this.setState('error', detail);
    const socket = this.socket;
    if (socket) { try { socket.close(); } catch { /* Ignore. */ } }
  }

  cleanup() { this.timers.clearInterval(this.pingTimer); this.timers.clearTimeout(this.connackTimer); }
  send(bytes) { if (this.socket?.readyState === 1) this.socket.send(bytes); }
  nextId() { this.packetId = this.packetId % 0xffff + 1; return this.packetId; }
  setState(state, detail = '') {
    this.state = state;
    this.dispatchEvent(new CustomEvent('status', { detail: { state, detail } }));
  }
}
