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

// دعم بث المايكروفون الخام والفواصل
app.use('/api/stream-mic', express.raw({ type: '*/*', limit: '50mb' }));

// إتاحة الفولدر الرئيسي وفولدر الصوت للمتصفح مباشرة
app.use(express.static(__dirname));
const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}
app.use(express.static(audioDir)); 

// المتغيرات والمصفوفات البرمجية المشتركة
let currentPassword = "123456";
let subscribers = []; // المستمعين المتصلين حالياً بالبث الحي
let messages = [{ sender: "النظام", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور!" }];
let reactions = [];
let artistTracks = [];
let isMicLive = false;
let currentTrack = "default_music.mp3";
let lastTriggeredMinute = "";

// نظام جدولة الألبومات الأسبوعي
let radioSchedule = [
  { day: 0, time: "20:00", file: "jingle1.mp3" }
];

// إعداد مكتبة Multer لرفع ملفات الألبومات والتراكات
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, audioDir); },
    filename: (req, file, cb) => { cb(null, 'audio_' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// --- مسارات الـ API والتحكم ---

// 1. تعديل أمني هام: دمج المسارين لمنع خطأ تسجيل الدخول
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
    if (newPassword && String(newPassword).trim().length > 0) {
        currentPassword = String(newPassword).trim();
        res.json({ success: true, message: "تم تحديث رمز الدخول بنجاح" });
    } else {
        res.status(400).json({ success: false, message: "الرمز الجديد غير صالح" });
    }
});

// صندوق المحادثة والدردشة
app.get('/api/messages', (req, res) => { res.json(messages); });
app.post('/api/messages', (req, res) => {
    const { sender, text } = req.body;
    if (text) {
        messages.push({ sender: sender || "مستمع", text: String(text).trim(), time: Date.now() });
        if (messages.length > 50) messages.shift();
    }
    res.json({ success: true });
});

// عداد المستمعين المتصلين بالبث
app.get('/api/listeners-count', (req, res) => { 
    res.json({ count: subscribers.length || 1 }); 
});

// التفاعلات المتطايرة (Emojis)
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

// رفع ألبومات المذيع وجدولتها تلقائياً
app.post('/api/upload-album', upload.single('audioFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "لم يتم استلام ملف الألبوم" });
    const filename = req.file.filename;
    const now = new Date();
    
    // إضافة الملف المرفوع لجدول البث التلقائي
    radioSchedule.push({
        day: now.getDay(),
        time: (now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0')),
        file: filename
    });
    res.json({ success: true, file: filename });
});

// رفع تراكات الفنانين وإحصائيات الإعجاب
app.get('/api/artist-tracks', (req, res) => { res.json(artistTracks); });
app.post('/api/upload-artist-track', upload.single('audioTrack'), (req, res) => {
    const { title } = req.body;
    if (req.file) {
        const newTrack = {
            id: Date.now(),
            title: title || "تراك غير مسمى",
            filename: req.file.filename,
            likes: 0
        };
        artistTracks.push(newTrack);
        res.json({ success: true, track: newTrack });
    } else {
        res.status(400).json({ success: false, message: "فشل استلام التراك الصوتي" });
    }
});

// بث المايكروفون المباشر وتمريره الفوري لكل المستمعين المتصلين
app.post('/api/stream-mic', (req, res) => {
    isMicLive = true;
    const audioBuffer = req.body;
    for (let j = 0; j < subscribers.length; j++) {
        try { subscribers[j].write(audioBuffer); } catch(e) {}
    }
    res.status(200).end();
});

app.post('/api/stop-mic', (req, res) => {
    isMicLive = false;
    res.json({ success: true, message: "تم إيقاف المايكروفون وعودة الفواصل التلقائية" });
});

// المخرج الرئيسي الصوتي للمستمعين والمذيع (Audio Stream Endpoint)
app.get('/radio.mp3', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg', 
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    subscribers.push(res);
    req.on('close', () => { 
        subscribers = subscribers.filter(sub => sub !== res); 
    });
});

// دالة بث ملفات الصوت والفواصل الحية بشكل تدفقي مستمر (Chuncked Radio)
function broadcastAudio() {
    if (isMicLive) { setTimeout(broadcastAudio, 500); return; }
    let trackPath = path.join(audioDir, currentTrack);
    if (!fs.existsSync(trackPath)) { trackPath = path.join(audioDir, 'jingle1.mp3'); }
    if (!fs.existsSync(trackPath)) {
        // إنشاء ملف احتياطي افتراضي لضمان استمرار عمل الدورة الصوتية دون انهيار السيرفر
        fs.writeFileSync(trackPath, Buffer.alloc(10000));
    } 

    const chunkSize = 4000;
    const intervalTime = 250;
    const buffer = Buffer.alloc(chunkSize);

    fs.open(trackPath, 'r', (err, fd) => {
        if (err) { setTimeout(broadcastAudio, 1000); return; }
        let offset = 0;
        function sendChunk() {
            if (isMicLive) { fs.close(fd, () => { broadcastAudio(); }); return; }
            fs.read(fd, buffer, 0, chunkSize, offset, (readErr, bytesRead) => {
                if (readErr || bytesRead === 0) { fs.close(fd, () => { broadcastAudio(); }); return; }
                offset += bytesRead;
                const activeChunk = bytesRead < chunkSize ? buffer.subarray(0, bytesRead) : buffer;
                for (let j = 0; j < subscribers.length; j++) { 
                    try { subscribers[j].write(activeChunk); } catch(e) {}
                }
                setTimeout(sendChunk, intervalTime);
            });
        }
        sendChunk();
    });
}

// دالة التحقق الذكي من جدول المواعيد والألبومات المجدولة كل ثانية
// Détecter l'heure selon votre fuseau horaire local pour la planification
setInterval(() => {
    const now = new Date();
    
    // Forcer le fuseau horaire d'Afrique du Nord / Europe Centrale (Ex: "Africa/Tunis" ou "Africa/Algiers")
    const localTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Africa/Tunis', hour12: false });
    const [hours, minutes] = localTimeStr.split(':');
    const currentTime = `${hours}:${minutes}`;
    
    const currentDay = now.getDay(); // Note: attention au décalage de jour potentiel en UTC, le mieux est de synchroniser totalement.
    
    if (currentTime === lastTriggeredMinute) return;
    
    for (let i = 0; i < radioSchedule.length; i++) {
        const event = radioSchedule[i];
        if (Number(event.day) === Number(currentDay) && String(event.time) === String(currentTime)) {
            lastTriggeredMinute = currentTime;
            currentTrack = event.file;
            console.log(`[جدولة آلية]: تم تشغيل الألبوم المجدول بنجاح: ${currentTrack}`);
            break;
        }
    }
}, 1000);


// بدء عمل الراديو والسيرفر
broadcastAudio();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
