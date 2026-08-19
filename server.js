const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');

const app = express();
const server = http.createServer(app);

// إعدادات الـ Middlewares الأساسية
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // تشغيل وخدمة ملفات الـ HTML والصور محلياً

// إعداد Multer في الذاكرة لالتقاط حزم الصوت والصور بسرعة وخفة
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// قاعدة البيانات المؤقتة (En mémoire) لإدارة حالة الراديو الحية
let messages = [{ sender: "النظام 🤖", text: "أهلاً بكم في البث الحي المتطور لراديو كينج الذكي! 👑" }];
let reactions = [];
let audioSubscribers = [];
let currentCoverUrl = "/images/poster.jpg"; // الغلاف الافتراضي للاستوديو
let currentTrackTitle = "بث مباشر حيوي";

let fmStats = {
    frequency: "99.5 MHz",
    bitrate: "128 kbps",
    codec: "MP3 / AAC+",
    signalStrength: "99% HD 🚀",
    rdsText: "الملك كينج - بث مباشر حيوى"
};

// ==========================================
// 1. نظام بث وتوزيع الصوت الحي (Audio Stream)
// ==========================================

// رابط المستمعين: دفق صوتي متواصل بنظام التقطيع لمنع الحظر والبطء
app.get('/radio.mp3', (req, res) => {
    res.setHeader('Content-Type', 'audio/webm;codecs=opus');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // إضافة المستمع إلى قائمة المشتركين النشطين لحسابه في الرسم البياني
    audioSubscribers.push(res);

    req.on('close', () => {
        audioSubscribers = audioSubscribers.filter(s => s !== res);
    });
});

// رابط المذيع: استقبال نبضات المايكروفون السريعة وإعادة بثها فوراً
app.post('/api/stream-mic', upload.single('audioChunk'), (req, res) => {
    let chunk = req.file ? req.file.buffer : req.body;
    
    if (Buffer.isBuffer(chunk) && chunk.length > 0) {
        audioSubscribers.forEach(subscriber => {
            try {
                subscriber.write(chunk);
            } catch (err) {
                // تجاوز المشتركين الذين أغلقوا الصفحة فجأة لمنع كراش السيرفر
            }
        });
    }
    res.status(200).json({ success: true });
});

app.post('/api/stop-mic', (req, res) => {
    fmStats.rdsText = "الملك كينج - بث مباشر حيوى";
    res.json({ success: true });
});

// ==========================================
// 2. نظام الشات المطور وإحصائيات المستمعين
// ==========================================

// جلب رسائل الشات الحية
app.get('/api/messages', (req, res) => {
    res.json(messages);
});

// إرسال رسالة جديدة (تحديث فوري وحماية الذاكرة)
app.post('/api/messages', (req, res) => {
    const { sender, text } = req.body;
    if (sender && text) {
        messages.push({ sender, text, timestamp: Date.now() });
        
        // حماية السيرفر: الاحتفاظ بآخر 50 رسالة فقط لمنع بطء التصفح
        if (messages.length > 50) messages.shift();
        res.status(201).json({ success: true });
    } else {
        res.status(400).json({ error: "البيانات المرسلة غير مكتملة" });
    }
});

// جلب عدد المستمعين أونلاين بالثانية (لتغذية الرسم البياني الذكي في الاستوديو)
app.get('/api/listeners-count', (req, res) => {
    res.json({ count: audioSubscribers.length });
});

// ==========================================
// 3. التفاعلات اللحظية والـ RDS للراديو
// ==========================================

app.post('/api/reactions', (req, res) => {
    const { emoji } = req.body;
    if (emoji) {
        reactions.push({ emoji, timestamp: Date.now() });
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "الإيموجي مفقود" });
    }
});

app.get('/api/reactions', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const newReactions = reactions.filter(r => r.timestamp > since);
    res.json({ reactions: newReactions });
});

// جلب الغلاف الحالي والـ RDS ونظام التشفير للمستمعين
app.get('/api/radio-meta', (req, res) => {
    res.json({
        fmStats: {
            frequency: fmStats.frequency,
            bitrate: fmStats.bitrate,
            codec: fmStats.codec,
            signalStrength: fmStats.signalStrength,
            rdsText: currentTrackTitle ? `الملك كينج - ${currentTrackTitle}` : fmStats.rdsText
        },
        coverUrl: currentCoverUrl,
        title: currentTrackTitle,
        podcasts: [
            { title: "برنامج جيل كينج الحصري", url: "https://spotify.com" }
        ]
    });
});

// تحديث الألبوم والغلاف فوراً من لوحة المذيع أو الفنان
app.post('/api/upload-album', (req, res) => {
    if (req.body.manualUrl) {
        currentCoverUrl = req.body.manualUrl;
    }
    if (req.body.title) {
        currentTrackTitle = req.body.title;
        fmStats.rdsText = `الملك كينج - ${req.body.title}`;
    }
    res.json({ success: true, message: "تم تحديث غلاف الهواء والـ RDS بنجاح!" });
});

// ==========================================
// 4. تشغيل خادم الراديو
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { 
    console.log(`[RADIO KING] السيرفر يعمل بنجاح تام على المنفذ رقم ${PORT}`); 
});
