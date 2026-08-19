const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// تفعيل حزمة CORS والسماح بقراءة بيانات الـ JSON القادمة من الـ Front-end
app.use(cors());
app.use(express.json());

// ⚠️ حل مشكلة الصور: تفعيل المجلد الساكن لرفع وقراءة الصور المحلية بأمان
app.use(express.static(path.join(__dirname, 'public')));

// قواعد بيانات مؤقتة داخل الذاكرة (Memory DB) لحفظ البيانات أثناء البث
let currentLiveTrack = {
    day: "الآن مباشر",
    time: "الهواء فوراً",
    manualUrl: "/images/default-cover.jpg" // صورة افتراضية داخل مجلد public/images
};

let chatMessages = [
    { sender: "النظام 🤖", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور!" }
];

/* ================= الروابط البرمجية (API Routes) ================= */

// 1. جلب رسائل الدردشة والأغنية الحالية
app.get('/api/messages', (req, res) => {
    res.json(chatMessages);
});

// 2. استقبال رسالة جديدة من الفنان أو المستمعين
app.post('/api/messages', (req, res) => {
    const { sender, text } = req.body;
    if (!sender || !text) {
        return res.status(400).json({ error: "جميع الحقول مطلوبة" });
    }
    
    chatMessages.push({ sender, text });
    
    // إبقاء آخر 50 رسالة فقط لتفادي بطء المتصفح
    if (chatMessages.length > 50) chatMessages.shift();
    
    res.status(201).json({ success: true });
});

// 3. تحديث غلاف الألبوم والأغنية الحية من لوحة الفنان
app.post('/api/upload-album', (req, res) => {
    const { day, time, manualUrl } = req.body;
    
    currentLiveTrack = { day, time, manualUrl };
    
    // بث رسالة تلقائية في الشات لإعلام المستمعين بالتغيير
    chatMessages.push({ 
        sender: "الاستوديو 🎵", 
        text: `يتم الآن بث مادة جديدة حصرياً على الهواء مباشرة!` 
    });

    res.json({ success: true, currentLiveTrack });
});

// 4. استقبال تفاعلات الإعجاب (Likes)
app.post('/api/like', (req, res) => {
    chatMessages.push({ sender: "النظام 👑", text: "تلقينا تفاعل إعجاب جديد بالبث المباشر! ❤️" });
    res.json({ success: true });
});

// 5. دالة وهمية لمحاكاة دفق الراديو الصوتي (إذا لم يكن لديك سيرفر بث خارجي مثل Icecast)
app.get('/radio.mp3', (req, res) => {
    // هنا يتم تحويل السيرفر لبث لملف صوتي مستمر أو ربطه بدفق الميكروفون
    res.status(200).json({ message: "هنا يتم ربط دفق صوت المذيع المباشر Live Stream Source" });
});

/* ================= تشغيل السيرفر ================= */
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بنجاح على الرابط: http://localhost:${PORT}`);
});
