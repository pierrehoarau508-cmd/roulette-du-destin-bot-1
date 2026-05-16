const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

let io;

function startServer(wheelState) {
  const app        = express();
  const httpServer = http.createServer(app);
  io = new Server(httpServer, { cors: { origin: '*' } });

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/state', (req, res) => res.json(wheelState));

  io.on('connection', (socket) => {
    console.log(`🌐 Client connecté : ${socket.id}`);

    // Envoie l'état actuel au nouveau visiteur
    socket.emit('wheel-update', { segments: wheelState.segments });
    if (wheelState.lastResult) {
      socket.emit('spin-result', { result: wheelState.lastResult });
    }

    // ── SPIN DEPUIS LE BOUTON DU SITE WEB ──────────────────────────
    socket.on('request-spin', () => {
      if (wheelState.spinning || wheelState.segments.length < 2) return;

      wheelState.spinning = true;

      // 1. Choisir le gagnant
      const n        = wheelState.segments.length;
      const winIndex = Math.floor(Math.random() * n);
      const result   = wheelState.segments[winIndex];

      // 2. Calculer l'angle final (identique à index.js)
      const arcSize         = (Math.PI * 2) / n;
      const targetSegCenter = winIndex * arcSize + arcSize / 2;
      const angleToTarget   = Math.PI * 2 - targetSegCenter;
      const extraTurns      = (5 + Math.floor(Math.random() * 4)) * Math.PI * 2;

      wheelState.currentAngle += extraTurns + angleToTarget;
      wheelState.spinCount++;
      wheelState.lastResult = result;

      // 3. Lancer l'animation sur tous les clients
      io.emit('spin-start', {
        segments  : wheelState.segments,
        finalAngle: wheelState.currentAngle,
        winIndex  : winIndex,
      });

      // 4. Envoyer le résultat après l'animation (6200ms)
      setTimeout(() => {
        wheelState.spinning = false;
        io.emit('spin-result', { result });
      }, 6200);

      // 5. Notifier Discord après l'animation
      setTimeout(async () => {
        try {
          const { sendResultToDiscord } = require('./index.js');
          await sendResultToDiscord(result, null, wheelState.spinCount, 'web');
        } catch (err) {
          console.error('❌ Erreur envoi Discord :', err.message);
        }
      }, 6200);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Client déconnecté : ${socket.id}`);
    });
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`🌐 Serveur web sur http://localhost:${PORT}`);
  });
}

function getIO() { return io; }

module.exports = { startServer, getIO };
