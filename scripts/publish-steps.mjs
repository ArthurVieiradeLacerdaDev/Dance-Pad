#!/usr/bin/env node
import net from 'node:net';
import { buildConnect, buildPublish } from '../src/input/mqtt-packets.js';

const direction = (process.argv[2] || 'UP').toUpperCase();
const count = Number(process.argv[3]) || 1;
const intervalMs = Number(process.argv[4]) || 500;

console.log(`📡 Conectando ao HiveMQ para publicar ${count}x "${direction}" no tópico "str/ddr/passos"...`);

const socket = net.createConnection(1883, 'broker.hivemq.com', () => {
  socket.write(buildConnect({ clientId: `evil-dance-cli-${Date.now()}` }));
  
  let sent = 0;
  const timer = setInterval(() => {
    const payload = JSON.stringify({ seta: direction });
    socket.write(buildPublish('str/ddr/passos', payload));
    sent++;
    console.log(`[${sent}/${count}] 📤 Publicado: ${payload}`);
    if (sent >= count) {
      clearInterval(timer);
      setTimeout(() => {
        socket.end();
        console.log('✅ Concluído com sucesso.');
        process.exit(0);
      }, 300);
    }
  }, intervalMs);
});

socket.on('error', err => {
  console.error('❌ Erro na conexão:', err.message);
  process.exit(1);
});
