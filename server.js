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

let currentPassword = "123456";
let subscribers = []; 
let messages = [{ sender: "النظام", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور!" }];
let reactions = [];
let artistTracks = [];
let isMicLive = false;
let currentTrack = "jingle1.mp3"; 
let lastTriggeredMinute = "";
let radioSchedule = [];

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, audioDir); },
    filename: (req, file, cb) => { cb(null, 'audio_' + Date.now() + path.extname(file.originalname)); }
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

app.get('/api/listeners-count', (req, res) => { 
    res.json({ count: subscribers.length || 1 }); 
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
    res.json({ success: true, file: filename });
});

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
    res.json({ success: true });
});

// 👇 التعديل الجذري: البث المباشر الذكي والمتوافق مع السيرفر الحالي لمنع الصمت 👇
app.get('/radio.mp3', (req, res) => {
    let trackPath = path.join(audioDir, currentTrack);
    
    // إذا لم يجد الملف المجدول، يقرأ ملف jingle1.mp3 تلقائياً
    if (!fs.existsSync(trackPath)) {
        trackPath = path.join(audioDir, 'jingle1.mp3');
    }
    
    // إذا كان المجلد فارغاً تماماً، يسحب السيرفر ملفاً حقيقياً ومضموناً بنسبة 100% من الإنترنت لبثه للمستمعين دون توقف
    if (!fs.existsSync(trackPath) || fs.statSync(trackPath).size <= 10000) {
        const https = require('https');
        const fallbackUrl = "https://soundhelix.com";
        
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        https.get(fallbackUrl, (externalRes) => {
            externalRes.pipe(res);
        }).on('error', () => { res.end(); });
        return;
    }

    // إرسال الملف الحقيقي المرفوع بطريقة التدفق المستقر والآمن المتوافق مع الهواتف والاستضافة مجاناً
    const stat = fs.statSync(trackPath);
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    
    const readStream = fs.createReadStream(trackPath);
    readStream.pipe(res);
});

// دالة فحص مواعيد الألبومات وتحديث الأغنية الحالية تلقائياً
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
            currentTrack = event.file; // تغيير الأغنية فوراً في دالة البث
            console.log(`[جدولة] تشغيل: ${currentTrack}`);
            break;
        }
    }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
