const express = require('express');
const http = require('http');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// 1. إعداد خيارات CORS الشاملة لقبول الاتصالات المتقاطعة بدون حظر من المتصفحات
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// مسار المايكروفون الخام
app.use('/api/stream-mic', express.raw({ type: '*/*', limit: '50mb' }));

// 2. إدارة وتحديد المسارات والمجلدات الساكنة الموحدة
const publicDir = path.join(__dirname, 'public');
const audioDir = path.join(__dirname, 'audio');
const imageDir = path.join(publicDir, 'image');

// إنشاء المجلدات تلقائياً إذا اختفت على سيرفر ريندر
[audioDir, publicDir, imageDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// إتاحة المجلدات العامة للمتصفحات أونلاين
app.use(express.static(__dirname)); 
app.use(express.static(publicDir)); 
app.use('/audio', express.static(audioDir));

// 3. المتغيرات العامة لنظام البث
let currentPassword = "123456";
let messages = [{ sender: "النظام 🤖", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور أونلاين!", time: Date.now() }];
let reactions = [];
let isMicLive = false;
let radioSchedule = [];
let currentAlbumImage = "https://unsplash.com"; // غلاف حقيقي افتراضي لعدم كسر البث
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

// 4. محرك الرفع والتصنيف الذكي لمنع تداخل ملفات المذيع
const storage = multer.diskStorage({
    destination: (req, file, cb) => { 
        if (file.mimetype.startsWith('image/')) {
            cb(null, imageDir); 
        } else {
            cb(null, audioDir); 
        }
    },
    filename: (req, file, cb) => { 
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        if (file.mimetype.startsWith('image/')) {
            cb(null, 'cover_' + uniqueSuffix + ext);
        } else {
            cb(null, 'track_' + uniqueSuffix + ext); 
        }
    }
});
const upload = multer({ storage: storage });

/* ================= المسارات البرمجية (API Routes) ================= */

// مسارات الأمان والتحقق من الهوية
app.post(['/api/verify-login', '/api/verify-password'], (req, res) => {
    const password = req.body.password;
    if (String(password) === String(currentPassword)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
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

// مسارات المحادثات الحية والتعليقات الموحدة للجميع
app.get('/api/messages', (req, res) => { 
    res.setHeader('Cache-Control', 'no-cache');
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

app.get('/api/reactions', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const filtered = reactions.filter(r => r.time > since);
    res.json({ reactions: filtered });
});

app.post('/api/reactions', (req, res) => {
    const { emoji } = req.body;
    if (emoji) {
        reactions.push({ emoji, time: Date.now() });
        if (reactions.length > 50) reactions.shift();
    }
    res.json({ success: true });
});

app.post('/api/like', (req, res) => {
    messages.push({ sender: "النظام 🎯", text: "❤️ تفاعل إعجاب جديد وصل الآن للاستوديو!", time: Date.now() });
    if (messages.length > 50) messages.shift();
    systemAlerts.push({ type: "like", message: "❤️ شخص ما أبدى إعجابه بالبث المباشر الآن!", time: Date.now() });
    res.json({ success: true });
});

// جلب عدد المستمعين الحركي المتصلين حالياً بالخادم
app.get('/api/listeners-count', (req, res) => { 
    res.json({ count: audioSubscribers.length || 0 }); 
});

// جلب حالة البيانات الفنية والغلاف الحالي
app.get('/api/current-album', (req, res) => { 
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ coverUrl: currentAlbumImage }); 
});

app.get('/api/radio-meta', (req, res) => { 
    const since = parseInt(req.query.since) || 0;
    const freshAlerts = systemAlerts.filter(a => a.time > since);
    res.json({ 
        fmStats: fmEncodingStats, 
        podcasts: globalPodcasts, 
        coverUrl: currentAlbumImage,
        alerts: freshAlerts 
    }); 
});

// معالجة بث الألبوم والصور الحية من الفنان وإصلاح تشوه روابط Unsplash
app.post('/api/upload-album', upload.single('audioFile'), (req, res) => {
    const { day, time, manualUrl } = req.body;
    
    if (manualUrl) {
        if (manualUrl.includes("unsplash.com") && !manualUrl.includes("://unsplash.com")) {
            currentAlbumImage = "https://unsplash.com";
        } else {
            currentAlbumImage = manualUrl;
        }
        fmEncodingStats.rdsText = `بث الألبوم الحالي بواسطة الفنان مباشرة`;
        systemAlerts.push({ type: "album", message: "🎨 قام الفنان بتحديث غلاف الألبوم المشغل الآن!", time: Date.now() });
        return res.json({ success: true, filepath: currentAlbumImage, coverUrl: currentAlbumImage });
    }

    if (!req.file) { return res.status(400).json({ success: false, message: "لم يتم اختيار ملف !" }); }

    if (req.file.mimetype.startsWith('image/')) {
        currentAlbumImage = `/image/${req.file.filename}`;
    } else {
        currentAlbumImage = `/audio/${req.file.filename}`;
    }

    fmEncodingStats.rdsText = `ألبوم مجدول: ${day} - ${time}`;
    messages.push({ sender: "نظام الجدولة 📅", text: `تم رفع وتصنيف مادة إذاعية جديدة بنجاح [${day}] - [${time}]`, time: Date.now() });
    res.json({ success: true, filepath: currentAlbumImage, coverUrl: currentAlbumImage });
});

app.post('/api/save-schedule', upload.fields([{ name: 'audioFile', maxCount: 1 }, { name: 'coverFile', maxCount: 1 }]), (req, res) => {
    const { day, time } = req.body;
    const scheduleItem = {
        day: day || "0",
        time: time || "12:00",
        audio: req.files && req.files['audioFile'] ? req.files['audioFile'][0].filename : null,
        cover: req.files && req.files['coverFile'] ? req.files['coverFile'][0].filename : null
    };
    radioSchedule.push(scheduleItem);
    res.json({ success: true, schedule: radioSchedule });
});

/* ================= أنظمة بث وإرسال صوت المايكروفون ================= */

app.post('/api/start-mic', (req, res) => {
    isMicLive = true;
    liveAudioChunks = []; 
    systemAlerts.push({ type: "mic", message: "🎙️ المذيع بدأ البث المباشر الآن.. الهواء لكم!", time: Date.now() });
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
    systemAlerts.push({ type: "mic_stop", message: "🔒 تم إنهاء البث المباشر والتحويل للموسيقى التلقائية.", time: Date.now() });
    res.json({ success: true }); 
});

// البث الصوتي المباشر المتواصل عبر الرابط على السيرفر أونلاين
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
    
    if (liveAudioChunks.length > 0) {
        liveAudioChunks.forEach(chunk => {
            try { res.write(chunk); } catch(e){}
        });
    } else {
        const mockSilentMusicTrack = Buffer.alloc(1024);
        setInterval(() => {
            if (!isMicLive) {
                try { res.write(mockSilentMusicTrack); } catch(e){}
            }
        }, 200);
    }

    req.on('close', () => {
        audioSubscribers = audioSubscribers.filter(s => s !== res);
    });
});

// تشغيل الخادم على المنفذ المخصص للبيئة السحابية أونلاين لـ Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { 
    console.log(`Server running globally on port ${PORT}`); 
});
