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

// دعم بث المايكروفون الحقيقي بدون قيود حجم
app.use('/api/stream-mic', express.raw({ type: '*/*', limit: '50mb' }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}
app.use(express.static(audioDir)); 

let currentPassword = "123456";
let subscribers = []; 
let messages = [{ sender: "النظام", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور!" }];
let reactions = [];
let artistTracks = [];
let isMicLive = false;
let currentTrack = "jingle1.mp3"; // جعل الفاصل الافتراضي هو jingle1
let lastTriggeredMinute = "";

// مصفوفة جدولة الألبومات والأغاني
let radioSchedule = [];

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, audioDir); },
    filename: (req, file, cb) => { cb(null, 'audio_' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// التحقق من الأمان ودخول الاستوديو
app.post(['/api/verify-login', '/api/verify-password'], (req, res) => {
    const password = req.body.password;
    if (String(password) === String(currentPassword)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
    }
});

// استقبال دردشة المستمعين والمذيع
app.get('/api/messages', (req, res) => { res.json(messages); });
app.post('/api/messages', (req, res) => {
    const { sender, text } = req.body;
    if (text) {
        messages.push({ sender: sender || "مستمع", text: String(text).trim(), time: Date.now() });
        if (messages.length > 50) messages.shift();
    }
    res.json({ success: true });
});

// عداد المتصلين
app.get('/api/listeners-count', (req, res) => { 
    res.json({ count: subscribers.length }); 
});

// التفاعلات المتطايرة
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

// 📌 إصلاح رفع وجدولة الألبوم (يقرأ خياراتك المحددة باليد للوقت واليوم)
app.post('/api/upload-album', upload.single('audioFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "لم يتم استلام ملف الألبوم" });
    
    const filename = req.file.filename;
    const chosenDay = req.body.day !== undefined ? req.body.day : new Date().getDay();
    const chosenTime = req.body.time !== undefined ? req.body.time : "20:00";
    
    radioSchedule.push({
        day: Number(chosenDay),
        time: String(chosenTime),
        file: filename
    });
    
    console.log(`[جدولة] تم تثبيت ملف ${filename} لليوم ${chosenDay} عند الساعة ${chosenTime}`);
    res.json({ success: true, file: filename });
});

// بث صوت المايكروفون وتحويله فوراً للمستمعين
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
    res.json({ success: true, message: "تم إيقاف المايك" });
});

// 📌 تعديل المخرج الرئيسي للبث ليتوافق مع المايكروفون والملفات معاً دون توقف المشغل
// Correction de la route pour forcer le format standard MPEG compatible mobiles et Render
app.get('/radio.mp3', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg', // Changement : audio/mpeg est obligatoire pour éviter le blocage des navigateurs
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    subscribers.push(res);
    req.on('close', () => { 
        subscribers = subscribers.filter(sub => sub !== res); 
    });
});


// دالة تدوير البث الصوتي
function broadcastAudio() {
    if (isMicLive) { setTimeout(broadcastAudio, 500); return; }
    let trackPath = path.join(audioDir, currentTrack);
    if (!fs.existsSync(trackPath)) { trackPath = path.join(audioDir, 'jingle1.mp3'); }
    if (!fs.existsSync(trackPath)) {
        fs.writeFileSync(trackPath, Buffer.alloc(10000)); // ملف أمان احتياطي
    } 

    const chunkSize = 6000;
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

// دالة فحص الوقت الحقيقي لجدولة الألبومات (متوافقة مع التوقيت المحلي لمنع مشاكل فارق توقيت سيرفرات Render)
setInterval(() => {
    const now = new Date();
    // ضبط الوقت تلقائياً ليناسب توقيت منطقتك الإقليمية (شمال إفريقيا / تونس والجزائر)
    const localTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Africa/Tunis', hour12: false });
    const [hours, minutes] = localTimeStr.split(':');
    const currentTime = `${hours}:${minutes}`;
    const currentDay = now.getDay();
    
    if (currentTime === lastTriggeredMinute) return;
    
    for (let i = 0; i < radioSchedule.length; i++) {
        const event = radioSchedule[i];
        if (Number(event.day) === Number(currentDay) && String(event.time) === String(currentTime)) {
            lastTriggeredMinute = currentTime;
            currentTrack = event.file; // تشغيل الألبوم المجدول فوراً
            console.log(`[تنبيه جدولة] بدأ الآن تشغيل الألبوم المجدول بنجاح: ${currentTrack}`);
            break;
        }
    }
}, 1000);

broadcastAudio();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
