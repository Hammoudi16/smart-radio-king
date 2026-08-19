const express = require('express');
const http = require('http');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// إعداد خيارات CORS الشاملة لضمان قبول الطلبات من أي جهاز وموقع دون حظر
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// مسار المايكروفون الخام
app.use('/api/stream-mic', express.raw({ type: '*/*', limit: '50mb' }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}
app.use(express.static(audioDir)); 

// المتغيرات العامة للنظام
let currentPassword = "123456";
let messages = [{ sender: "النظام", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور!" }];
let reactions = [];
let isMicLive = false;
let currentTrack = "jingle1.mp3"; 
let lastTriggeredMinute = "";
let radioSchedule = [];
let currentAlbumImage = ""; 

let liveAudioChunks = [];
let audioSubscribers = [];

const globalPodcasts = [
    { title: "بودكاست راديو كينج - Spotify", platform: "Spotify", url: "https://spotify.com" },
    { title: "إذاعة كينج الثقافية - Apple Podcasts", platform: "Apple", url: "https://apple.com" },
    { title: "برنامج عواطف تونسية - Google Podcasts", platform: "Google", url: "https://google.com" }
];

const fmEncodingStats = {
    frequency: "99.5 FM",
    bitrate: "128 kbps Stereo",
    codec: "MP3 / AAC+ Dual Encoder",
    signalStrength: "98%",
    rdsText: "Radio King Live - Premium Audio Quality"
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, audioDir); },
    filename: (req, file, cb) => { 
        if (file.mimetype.startsWith('image/')) {
            cb(null, 'current_album_cover' + path.extname(file.originalname));
        } else {
            cb(null, 'audio_' + Date.now() + path.extname(file.originalname)); 
        }
    }
});
const upload = multer({ storage: storage });

app.post(['/api/verify-login', '/api/verify-password'], (req, res) => {
    const password = req.body.password;
    if (String(password) === String(currentPassword)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
    }
});

// مسارات المحادثات الحية
app.get('/api/messages', (req, res) => { 
    res.setHeader('Cache-Control', 'no-cache');
    res.json(messages); 
});

app.post('/api/messages', (req, res) => {
    const { sender, text } = req.body;
    if (text) {
        messages.push({ sender: sender || "مستمع", text: String(text).trim(), time: Date.now() });
        if (messages.length > 50) messages.shift();
    }
    res.json({ success: true });
});

app.get('/api/reactions', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const filtered = reactions.filter(r => r.time > since);
    res.json(filtered);
});

app.post('/api/reactions', (req, res) => {
    const { emoji } = req.body;
    if (emoji) {
        reactions.push({ emoji, time: Date.now() });
        if (reactions.length > 30) reactions.shift();
    }
    res.json({ success: true });
});

app.post('/api/like', (req, res) => {
    messages.push({ sender: "النظام 🎯", text: "❤️ تفاعل إعجاب جديد وصل الآن للاستوديو!", time: Date.now() });
    if (messages.length > 50) messages.shift();
    res.json({ success: true });
});

app.get('/api/current-album', (req, res) => { res.json({ coverUrl: currentAlbumImage || "" }); });
app.get('/api/radio-meta', (req, res) => { res.json({ fmStats: fmEncodingStats, podcasts: globalPodcasts }); });

app.get('/api/listeners-count', (req, res) => { res.json({ count: audioSubscribers.length || 1 }); });

// استقبال بث المايكروفون وتجميعه
app.post('/api/stream-mic', (req, res) => {
    isMicLive = true;
    if (req.body && req.body.length > 0) {
        liveAudioChunks.push(req.body);
        if (liveAudioChunks.length > 200) liveAudioChunks.shift();

        audioSubscribers.forEach(subscriber => {
            try { subscriber.write(req.body); } catch (e) {
                audioSubscribers = audioSubscribers.filter(s => s !== subscriber);
            }
        });
    }
    res.status(200).end();
});

app.post('/api/stop-mic', (req, res) => { isMicLive = false; res.json({ success: true }); });

// بث الراديو التدفقي المتواصل 24 ساعة بدون انقطاع
app.get('/radio.mp3', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'audio/webm;codecs=opus', 
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked'
    });

    audioSubscribers.push(res);
    
    // في حال عدم وجود بث مباشر من المايكروفون، نقوم بحقن تيار مستقر لمنع صمت المشغل
    if (liveAudioChunks.length > 0) {
        liveAudioChunks.forEach(chunk => {
            try { res.write(chunk); } catch(e){}
        });
    } else {
        res.write(Buffer.alloc(4096)); 
    }

    req.on('close', () => {
        audioSubscribers = audioSubscribers.filter(s => s !== res);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
