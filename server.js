const express = require('express');
const http = require('http');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques (index.html, listener.html, artist.html, studio.js, etc.)
app.use(express.static(__dirname));

// Stockage mémoire temporaire pour la démo (À remplacer par une base de données en production)
let currentPassword = "123456";
let listenersCount = 1;
let messages = [];
let reactions = [];
let artistTracks = [];

// Configuration de Multer pour le téléversement des fichiers audio (Artistes)
const uploadDir = path.join(__dirname, 'audio');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- API ROUTES ---

// Authentification & Sécurité
app.post('/api/verify-password', (req, res) => {
    const { password } = req.body;
    if (password === currentPassword) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Mot de passe incorrect" });
    }
});

app.post('/api/change-password', (req, res) => {
    const { newPassword } = req.body;
    if (newPassword) {
        currentPassword = newPassword;
        res.json({ success: true, message: "Mot de passe mis à jour" });
    } else {
        res.status(400).json({ success: false, message: "Mot de passe invalide" });
    }
});

// Gestion du Chat
app.get('/api/messages', (req, res) => { res.json(messages); });
app.post('/api/messages', (req, res) => {
    const { sender, text } = req.body;
    if (text) {
        messages.push({ sender: sender || "Anonyme", text, time: Date.now() });
        if (messages.length > 100) messages.shift(); // Garder les 100 derniers messages
    }
    res.json({ success: true });
});

// Compteur d'auditeurs
app.get('/api/listeners-count', (req, res) => { res.json({ count: listenersCount }); });

// Réactions (Emojis)
app.get('/api/reactions', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const filtered = reactions.filter(r => r.time > since);
    res.json(filtered);
});
app.post('/api/reactions', (req, res) => {
    const { emoji } = req.body;
    if (emoji) {
        reactions.push({ emoji, time: Date.now() });
        if (reactions.length > 50) reactions.shift();
    }
    res.json({ success: true });
});

// Gestion des pistes artistes
app.get('/api/artist-tracks', (req, res) => { res.json(artistTracks); });
app.post('/api/upload-artist-track', upload.single('audioTrack'), (req, res) => {
    const { title } = req.body;
    if (req.file) {
        artistTracks.push({
            title: title || req.file.originalname,
            filename: req.file.filename,
            likes: 0,
            time: Date.now()
        });
        res.json({ success: true, message: "Fichier téléversé avec succès" });
    } else {
        res.status(400).json({ success: false, message: "Aucun fichier reçu" });
    }
});

// Flux du micro en direct (Réception du Stream WebM du studio)
app.post('/api/stream-mic', (req, res) => {
    // Ici, vous pouvez rediriger le flux audio reçu vers un serveur de streaming externe (Icecast/Shoutcast)
    // ou le stocker temporairement pour les auditeurs connectés.
    res.status(200).send("OK");
});

app.post('/api/stop-mic', (req, res) => {
    res.json({ success: true, message: "Micro arrêté" });
});

// Simulation du flux radio principal
app.get('/radio.mp3', (req, res) => {
    // Fournir un fichier par défaut ou un flux continu en production
    const defaultAudio = path.join(__dirname, 'audio', 'jingle1.mp3');
    if (fs.existsSync(defaultAudio)) {
        res.sendFile(defaultAudio);
    } else {
        res.status(404).send("Flux radio indisponible");
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur Smart Radio King démarré sur le port ${PORT}`);
});
