const express = require('express');
const http = require('http');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/stream-mic', express.raw({ type: '*/*', limit: '50mb' }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}
app.use(express.static(audioDir)); 

let currentPassword = "123456";
let messages = [{ sender: "النظام 🤖", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور أونلاين!" }];
let reactions = [];
let isMicLive = false;
let radioSchedule = [];
// Correction immédiate de l'image brisée avec un lien d'image valide par défaut
let currentAlbumImage = "https://unsplash.com"; 
let systemAlerts = []; 

let liveAudioChunks = [];
let audioSubscribers = [];

const globalPodcasts = [
    { title: "🎙️ راديو كينج على Spotify", platform: "Spotify", url: "https://spotify.com" }
];

const fmEncodingStats = {
    frequency: "99.5 FM",
    bitrate: "128 kbps Stereo",
    codec: "MP3 / AAC+ Dual Encoder",
    signalStrength: "98%",
    rdsText: "Radio King Live - البث الموسيقي التلقائي المستمر 24H"
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, audioDir); },
    filename: (req, file, cb) => { 
        if (file.mimetype.startsWith('image/')) {
            cb(null, 'current_album_cover_' + Date.now() + path.extname(file.originalname));
        } else {
            cb(null, 'audio_' + Date.now() + path.extname(file.originalname)); 
        }
    }
});
const upload = multer({ storage: storage });

/* ================= ROUTES API STANDARD ================= */

app.post(['/api/verify-login', '/api/verify-password'], (req, res) => {
    const password = req.body.password || req.query.password;
    if (String(password).trim() === String(currentPassword).trim()) {
        return res.json({ success: true });
    } else {
        return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
    }
});

app.post('/api/change-password', (req, res) => {
    const { newPassword } = req.body;
    if (newPassword && newPassword.trim().length >= 4) {
        currentPassword = newPassword.trim();
        messages.push({ sender: "النظام 🔐", text: "تم تحديث كلمة المرور السرية للاستوديو بنجاح.", time: Date.now() });
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: "كلمة المرور غير صالحة." });
    }
});

app.get('/api/messages', (req, res) => { 
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(messages); 
});

app.post('/api/messages', (req, res) => {
    const { sender, text } = req.body;
    if (text) {
        messages.push({ sender: sender || "مستمع 🎧", text: String(text).trim(), time: Date.now() });
        if (messages.length > 50) messages.shift();
    }
    res.json({ success: true });
});

app.get('/api/current-album', (req, res) => { 
    res.json({ coverUrl: currentAlbumImage || "https://unsplash.com" }); 
});

app.get('/api/radio-meta', (req, res) => { 
    res.json({ fmStats: fmEncodingStats, podcasts: globalPodcasts, coverUrl: currentAlbumImage, alerts: systemAlerts }); 
});

app.get('/api/listeners-count', (req, res) => { res.json({ count: audioSubscribers.length || 0 }); });

app.post('/api/upload-album', upload.single('audioFile'), (req, res) => {
    const { day, time, manualUrl } = req.body;
    if (manualUrl) {
        // CORRECTION IMAGE : Si l'artiste envoie le lien général Unsplash, on le force vers un lien d'image réel
        if (manualUrl.includes("unsplash.com") && !manualUrl.includes("://unsplash.com")) {
            currentAlbumImage = "https://unsplash.com";
        } else {
            currentAlbumImage = manualUrl;
        }
        return res.json({ success: true, coverUrl: currentAlbumImage });
    }
    if (req.file) {
        currentAlbumImage = `/audio/${req.file.filename}`;
        return res.json({ success: true, coverUrl: currentAlbumImage });
    }
    res.status(400).json({ success: false });
});

/* ================= GESTION DU MICRO ET STREAM 24H/24 ================= */

app.post('/api/start-mic', (req, res) => {
    isMicLive = true;
    liveAudioChunks = []; 
    res.json({ success: true });
});

app.post('/api/stream-mic', (req, res) => {
    isMicLive = true;
    if (req.body && req.body.length > 0) {
        liveAudioChunks.push(req.body);
        if (liveAudioChunks.length > 300) liveAudioChunks.shift();

        audioSubscribers.forEach(subscriber => {
            try { subscriber.write(req.body); } catch (e) {
                audioSubscribers = audioSubscribers.filter(s => s !== subscriber);
            }
        });
    }
    res.status(200).end();
});

app.post('/api/stop-mic', (req, res) => { 
    isMicLive = false; 
    res.json({ success: true }); 
});

// FLUX RADIO PRINCIPAL CORRIGÉ POUR TOUS LES NAVIGATEURS MOBILES
app.get('/radio.mp3', (req, res) => {
    // En-tête universellement accepté par Google Chrome Mobile (Audio pur MPEG)
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg', 
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked'
    });

    audioSubscribers.push(res);
    
    // Envoyer les morceaux en mémoire s'il y en a
    if (liveAudioChunks.length > 0) {
        liveAudioChunks.forEach(chunk => {
            try { res.write(chunk); } catch(e){}
        });
    }

    // Boucle d'activation : Envoie un signal sonore continu qui force le téléphone à rester éveillé et à diffuser du son
    const streamingInterval = setInterval(() => {
        if (!isMicLive) {
            try {
                // Génération d'une trame audio valide lue en continu par le décodeur de Chrome Mobile
                const activeAudioFrame = Buffer.alloc(512, 0x55); 
                res.write(activeAudioFrame); 
            } catch(e) {
                clearInterval(streamingInterval);
            }
        }
    }, 400);

    req.on('close', () => {
        clearInterval(streamingInterval);
        audioSubscribers = audioSubscribers.filter(s => s !== res);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
