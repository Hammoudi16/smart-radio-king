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

// --- المتغيرات العامة للنظام (محدثة بالكامل ومصححة) ---
let currentPassword = "123456";
let subscribers = []; 
let messages = [{ sender: "النظام", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور!" }];
let reactions = [];
let isMicLive = false;
let currentTrack = "jingle1.mp3"; 
let lastTriggeredMinute = "";
let radioSchedule = [];

// متغير الصورة المحدث لحفظ غلاف الألبوم أونلاين أينما تشاء 🖼️
let currentAlbumImage = ""; 

// مصفوفة المشتركين المحدثة لضمان عمل الصوت على أندرويد وإنستغرام 📱
let audioSubscribers = [];

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

// إعدادات التخزين باستخدام Multer ليدعم رفع الصور والأصوات
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

// --- مسارات الـ APIs والتحكم ---

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

app.get('/api/listeners-count', (req, res) => { 
    res.json({ count: audioSubscribers.length || 1 }); 
});


// ذاكرة تخزين حزم المايكروفون الحية لحفظ آخر قطع صوتية متصلة
let liveAudioBuffer = Buffer.alloc(0);

app.post('/api/stream-mic', (req, res) => {
    isMicLive = true;
    if (req.body && req.body.length > 0) {
        // دمج دفقات الميكروفون المباشرة في الـ Buffer لمنع التقطع
        liveAudioBuffer = Buffer.concat([liveAudioBuffer, req.body]);
        
        // حماية الذاكرة العشوائية للسيرفر بمسح الأجزاء القديمة جداً وتدوير البث
        if (liveAudioBuffer.length > 15 * 1024 * 1024) {
            liveAudioBuffer = liveAudioBuffer.subarray(5 * 1024 * 1024);
        }

        // توزيع الحزمة الفورية للمستمعين المتصلين حالياً
        audioSubscribers.forEach(subscriber => {
            try { subscriber.write(req.body); } catch (e) {
                audioSubscribers = audioSubscribers.filter(s => s !== subscriber);
            }
        });
    }
    res.status(200).end();
});

app.get('/radio.mp3', (req, res) => {
    // إرسال هيدر بث إذاعي تدفقي قياسي معترف به من قبل جوجل كروم وأندرويد
    res.writeHead(200, {
        'Content-Type': 'audio/webm;codecs=opus', 
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive',
        'Accept-Ranges': 'none'
    });

    // إضافة المستمع للقائمة وضخ المخزون المبدئي فوراً لمنع الصمت عند الاتصال أول مرة
    audioSubscribers.push(res);
    if (liveAudioBuffer.length > 0) {
        res.write(liveAudioBuffer);
    } else {
        res.write(Buffer.alloc(2048)); // عينة تنشيطية
    }

    req.on('close', () => {
        audioSubscribers = audioSubscribers.filter(s => s !== res);
    });
});


// نظام فحص الجدولة الأسبوعية
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
