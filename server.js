const express = require('express');
const http = require('http');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// إعداد خيارات CORS لضمان قبول الاتصال من جميع الهواتف والحسابات دون حظر
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// مسار المايكروفون الخام
app.use('/api/stream-mic', express.raw({ type: '*/*', limit: '50mb' }));

// الاحتفاظ بمسار المجلدات كما هي في ملفاتك القديمة لعدم كسر الصور والموسيقى
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}
app.use(express.static(audioDir)); 

// المتغيرات العامة للنظام والمزامنة الموحدة للدردشة
let currentPassword = "123456";
let messages = [{ sender: "النظام 🤖", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور أونلاين!" }];
let reactions = [];
let isMicLive = false;
let radioSchedule = [];
let currentAlbumImage = "https://unsplash.com"; // غلاف حقيقي افتراضي لعدم تجميد الواجهة
let systemAlerts = []; 

let liveAudioChunks = [];
let audioSubscribers = [];

// المزامنة الحية مع حساب Spotify الخاص بك
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

// إعداد محرك رفع الملفات وصور الغلاف
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

/* ================= مسارات الأمان والتحقق المصلحة ================= */

// تصحيح واجهة الدخول: استقبال وفحص كلمة المرور بدقة وبجميع الصيغ النصية لمنع تجميد اللوحة
app.post(['/api/verify-login', '/api/verify-password'], (req, res) => {
    const password = req.body.password || req.query.password;
    if (!password) {
        return res.status(400).json({ success: false, message: "لم يتم إرسال كلمة المرور!" });
    }
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

/* ================= مسارات المحادثات الموحدة للواجهات القديمة ================= */
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

app.get('/api/reactions', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    res.json({ reactions: reactions.filter(r => r.time > since) });
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

// مسارات الميتا والبيانات الفنية المتوافقة
app.get('/api/current-album', (req, res) => { res.json({ coverUrl: currentAlbumImage || "" }); });

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

app.get('/api/listeners-count', (req, res) => { res.json({ count: audioSubscribers.length || 0 }); });

// معالجة بث الألبومات والتواريخ لتعمل بالتوافق مع صفحة الفنان القديمة
app.post('/api/upload-album', upload.single('audioFile'), (req, res) => {
    const { day, time, manualUrl } = req.body;
    const currentDate = new Date().toLocaleDateString('ar-DZ');
    
    if (manualUrl) {
        // إصلاح روابط unsplash الخارجية المكسورة تلقائياً لجعلها تظهر في صفحاتك القديمة
        if (manualUrl.includes("unsplash.com") && !manualUrl.includes("://unsplash.com")) {
            currentAlbumImage = "https://unsplash.com";
        } else {
            currentAlbumImage = manualUrl;
        }
        fmEncodingStats.rdsText = `بث الألبوم الحالي بواسطة الفنان مباشرة`;
        systemAlerts.push({ type: "album", message: "🎨 قام الفنان بتحديث غلاف الألبوم المشغل الآن!", time: Date.now() });
        return res.json({ success: true, filepath: currentAlbumImage, coverUrl: currentAlbumImage });
    }
    
    if (!req.file) { return res.status(400).json({ success: false, message: "لم يتم اختيار ملف صوتي !" }); }

    currentAlbumImage = `/audio/${req.file.filename}`;
    fmEncodingStats.rdsText = `ألبوم مجدول: ${day} - ${time}`;
    messages.push({ sender: "نظام الجدولة 📅", text: `تم رفع وتصنيف مادة إذاعية جديدة بنجاح [${day}] - [${time}] بتاريخ [${currentDate}]`, time: Date.now() });
    res.json({ success: true, filepath: currentAlbumImage, coverUrl: currentAlbumImage });
});

app.post('/api/save-schedule', upload.fields([{ name: 'audioFile', maxCount: 1 }, { name: 'coverFile', maxCount: 1 }]), (req, res) => {
    const { day, time } = req.body;
    const scheduleItem = {
        day: day || "0",
        time: time || "12:00",
        audio: req.files && req.files['audioFile'] ? req.files['audioFile'].filename : null,
        cover: req.files && req.files['coverFile'] ? req.files['coverFile'].filename : null
    };
    radioSchedule.push(scheduleItem);
    res.json({ success: true, schedule: radioSchedule });
});

/* ================= أنظمة بث تيار المايكروفون والبث المتواصل 24H للهواتف ================= */

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

// بث صوتي 24 ساعة لا ينقطع ومتوافق تماماً مع متصفحات الهاتف (Chrome / السيارات / التلفزيون)
app.get('/radio.mp3', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg', 
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
    }

    // إرسال نبضات بث مستمرة (Keep-Alive Frames) تمنع متصفح جوجل كروم على الهواتف من قطع الصوت عند نوم شاشة الهاتف
    const satellitePulse = setInterval(() => {
        if (!isMicLive) {
            try {
                const syncFrame = Buffer.alloc(512, 0xAA); 
                res.write(syncFrame); 
            } catch(e) {
                clearInterval(satellitePulse);
            }
        }
    }, 800);

    req.on('close', () => {
        clearInterval(satellitePulse);
        audioSubscribers = audioSubscribers.filter(s => s !== res);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
