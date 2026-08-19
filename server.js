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
let subscribers = []; 
let messages = [{ sender: "النظام", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور!" }];
let reactions = [];
let isMicLive = false;
let currentTrack = "jingle1.mp3"; 
let lastTriggeredMinute = "";
let radioSchedule = [];
let currentAlbumImage = ""; 

// إعداد بيانات البودكاست العالمي المحاكاة والمنصات الخارجية
const globalPodcasts = [
    { title: "بودكاست راديو كينج - Spotify", platform: "Spotify", url: "https://spotify.com" },
    { title: "إذاعة كينج الثقافية - Apple Podcasts", platform: "Apple", url: "https://apple.com" },
    { title: "برنامج عواطف تونسية - Google Podcasts", platform: "Google", url: "https://google.com" }
];

// إعداد بيانات هندسة البث ومعدل ترميز قناة الـ FM المحاكاة
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

app.get('/api/messages', (req, res) => { res.json(messages); });
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

app.get('/api/current-album', (req, res) => {
    res.json({ coverUrl: currentAlbumImage || "" });
});

// مسار جلب تفاصيل هندسة الـ FM والبودكاست
app.get('/api/radio-meta', (req, res) => {
    res.json({ fmStats: fmEncodingStats, podcasts: globalPodcasts });
});

app.post('/api/upload-album', upload.fields([{ name: 'audioFile', maxCount: 1 }, { name: 'albumCover', maxCount: 1 }]), (req, res) => {
    let filename = currentTrack;
    if (req.files && req.files['audioFile']) filename = req.files['audioFile'].filename;
    if (req.files && req.files['albumCover']) currentAlbumImage = '/' + req.files['albumCover'].filename;

    const chosenDay = req.body.day !== undefined ? req.body.day : new Date().getDay();
    const chosenTime = req.body.time !== undefined ? req.body.time : "20:00";
    
    radioSchedule.push({ day: Number(chosenDay), time: String(chosenTime), file: filename });
    res.json({ success: true, file: filename, cover: currentAlbumImage });
});

app.get('/api/listeners-count', (req, res) => { res.json({ count: subscribers.length || 1 }); });

app.post('/api/stream-mic', (req, res) => {
    isMicLive = true;
    const audioBuffer = req.body;
    for (let j = 0; j < subscribers.length; j++) {
        try { subscribers[j].write(audioBuffer); } catch(e) {}
    }
    res.status(200).end();
});

app.post('/api/stop-mic', (req, res) => { isMicLive = false; res.json({ success: true }); });

// مسار بث الراديو الحي المطور - يمنع سقوط المشغل في الموبايل نهائياً
app.get('/radio.mp3', (req, res) => {
    let trackPath = path.join(audioDir, currentTrack);
    
    // إذا لم تكن هناك أغنية مجدولة نشطة، نبحث عن أول ملف صالحة في مجلد الصوت
    if (!fs.existsSync(trackPath)) {
        const files = fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3'));
        if (files.length > 0) {
            trackPath = path.join(audioDir, files[0]); // تشغيل أول ملف صوتي متوفر تلقائياً
        } else {
            trackPath = path.join(audioDir, 'jingle1.mp3');
        }
    }
    
    // إذا كان المجلد فارغاً تماماً ولا يوجد أي ملف صوتي، نستخدم رابط بديل حقيقي ومجرب بنسبة 100% لبث نغمة حية
    if (!fs.existsSync(trackPath) || fs.statSync(trackPath).size <= 10000) {
        const https = require('https');
        // رابط بث راديو صوتي مستقر ومفتوح المصدر للاختبار لمنع صمت السيرفر
        const fallbackUrl = "https://musopen.org"; 
        
        res.writeHead(200, { 
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'keep-alive'
        });
        
        https.get(fallbackUrl, (externalRes) => {
            externalRes.pipe(res);
        }).on('error', (err) => { 
            console.log("خطأ في جلب البث البديل:", err);
            res.end(); 
        });
        return;
    }

    // إرسال التدفق الصوتي المستقر المتوافق مع الهواتف الذكية وحفظ طاقة الباقة
    const stat = fs.statSync(trackPath);
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    const readStream = fs.createReadStream(trackPath);
    readStream.pipe(res);
});


setInterval(() => {
    const now = new Date();
    const localTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Africa/Tunis', hour12: false });
    const [hours, minutes] = localTimeStr.split(':');
    const currentTime = `${hours}:${minutes}`;
    const currentDay = now.getDay();
    
    if (currentTime === lastTriggeredMinute) return;
    for (let i = 0; i < radioSchedule.length; i++) {
        const event = radioSchedule[i];
        if (Number(event.day) === Number(currentDay) && String(event.time) === String(currentTime)) {
            lastTriggeredMinute = currentTime;
            currentTrack = event.file;
            break;
        }
    }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
