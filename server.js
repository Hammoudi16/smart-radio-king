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
let radioSchedule = [];
let currentAlbumImage = ""; 

// ميزة الإشعارات المنبثقة: مخزن لتمرير الإشعارات للمستمعين
let systemAlerts = []; 

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

// مسارات المحادثات الحية والتعليقات
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
    // إرسال تنبيه منبثق للمستمعين بوجود إعجاب جديد
    systemAlerts.push({ type: "like", message: "❤️ شخص ما أبدى إعجابه بالبث المباشر الآن!", time: Date.now() });
    res.json({ success: true });
});

// مسارات الميتا والبيانات الفنية ومسار الرفع المزدوج للألبومات والأغلفة
app.get('/api/current-album', (req, res) => { res.json({ coverUrl: currentAlbumImage || "" }); });

// تعديل دالة جلب البيانات لتمرير التنبيهات المنبثقة (Toast Alerts) أيضاً للمستمعين
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

app.get('/api/listeners-count', (req, res) => { res.json({ count: audioSubscribers.length || 1 }); });

// تحديث مسار تحديث الألبوم ليدعم الملفات الصوتية والروابط اليدوية من لوحة الفنان معاً
app.post('/api/upload-album', upload.single('audioFile'), (req, res) => {
    const { day, time, manualUrl } = req.body;
    
    // إذا أرسل الفنان رابطاً يدوياً للصورة بدلاً من ملف صوتي مرفوع
    if (manualUrl) {
        currentAlbumImage = manualUrl;
        fmEncodingStats.rdsText = `بث الألبوم الحالي بواسطة الفنان مباشرة`;
        
        // إطلاق تنبيه منبثق فوري للمستمعين
        systemAlerts.push({ type: "album", message: "🎨 قام الفنان بتحديث غلاف الألبوم المشغل الآن!", time: Date.now() });
        if (systemAlerts.length > 20) systemAlerts.shift();

        return res.json({ success: true, filepath: currentAlbumImage, coverUrl: currentAlbumImage });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: "لم يتم اختيار ملف صوتي !" });
    }

    currentAlbumImage = `/audio/${req.file.filename}`;
    fmEncodingStats.rdsText = `ألبوم مجدول: ${day} - ${time}`;

    messages.push({ 
        sender: "نظام الجدولة 📅", 
        text: `تم رفع وجدولة مادة إذاعية جديدة بنجاح ليوم [${day}] الساعة [${time}]`,
        time: Date.now() 
    });
    if (messages.length > 50) messages.shift();

    systemAlerts.push({ type: "schedule", message: `📅 تم جدولة ألبوم جديد للبث!`, time: Date.now() });

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

// استقبال بث المايكروفون وتجميعه وتوزيعه لحظياً
app.post('/api/start-mic', (req, res) => {
    isMicLive = true;
    liveAudioChunks = []; // إعادة تهيئة تيار البث عند فتح المايك
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
    systemAlerts.push({ type: "mic_stop", message: "🔒 تم إنهاء البث المباشر وحفظ الحلقة في الأرشيف.", time: Date.now() });
    res.json({ success: true }); 
});

// بث الراديو التدفقي المتواصل والمباشر لجميع واجهات المستمعين والفنانين
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
    
    // حقن كتل الصوت المخزنة فورياً لمنع انقطاع الصوت عند الاتصال الأولي
    if (liveAudioChunks.length > 0) {
        liveAudioChunks.forEach(chunk => {
            try { res.write(chunk); } catch(e){}
        });
    } else {
        res.write(Buffer.alloc(1024)); // صيانة الإرسال بمكافئ صامت مستقر
    }

    req.on('close', () => {
        audioSubscribers = audioSubscribers.filter(s => s !== res);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });

