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
app.use(express.static(path.join(__dirname, 'public')));

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
let currentTrack = "jingle1.mp3";
let lastTriggeredMinute = "";

// نظام جدولة الألبومات الأسبوعي
let radioSchedule = [];

// إعداد مكتبة Multer لرفع ملفات الألبومات والتراكات
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, audioDir); },
    filename: (req, file, cb) => { cb(null, 'audio_' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// التحقق من كلمة المرور
app.post(['/api/verify-login', '/api/verify-password'], (req, res) => {
    const password = req.body.password;
    if (String(password) === String(currentPassword)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
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
    res.json({ count: subscribers.length }); 
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

// رفع وجدولة الألبومات
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

// مخرج الصوت الرئيسي المحدث والمتوافق 100% مع الهواتف الذكية وسيرفر Render
app.get('/radio.mp3', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg', 
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

// دالة بث ملفات الصوت والفواصل الحية بشكل تدفقي مستمر (MPEG Stream)
function broadcastAudio() {
    if (isMicLive) { setTimeout(broadcastAudio, 500); return; }
    
    let trackPath = path.join(audioDir, currentTrack);
    
    // 👇 تحديث ذكي: إذا كان الملف غير موجود أو تالف، يسحب بثاً موسيقياً حقيقياً فوراً من الإنترنت ليعمل الصوت أوتوماتيكياً 👇
    if (!fs.existsSync(trackPath) || fs.statSync(trackPath).size <= 20000) { 
        console.log("🔄 جاري البث التلقائي من الموسيقى الاحتياطية المؤمنة...");
        
        // رابط لملف موسيقي حقيقي ومستقر يعمل 24 ساعة لضمان انطلاق الصوت فوراً وتخطي الكاش
        const fallbackUrl = "https://soundhelix.com";
        
        const httpsLink = require('https');
        httpsLink.get(fallbackUrl, (externalRes) => {
            externalRes.on('data', (chunk) => {
                if (isMicLive) return;
                for (let j = 0; j < subscribers.length; j++) {
                    try { subscribers[j].write(chunk); } catch(e) {}
                }
            });
            externalRes.on('end', () => { setTimeout(broadcastAudio, 1000); });
        }).on('error', () => { setTimeout(broadcastAudio, 2000); });
        return;
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

// دالة فحص مواعيد الألبومات
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
