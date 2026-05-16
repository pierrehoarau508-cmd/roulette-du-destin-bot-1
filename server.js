const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname)); // Sert votre index.html

io.on('connection', (socket) => {
    console.log('Un utilisateur s'est connecté');
    // C'est ici que votre bot Discord enverra les événements 'wheel-update' ou 'spin-start'
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Serveur en ligne sur le port ${PORT}`);
});