// ==========================================
// 1. تعريف مسارات المجلدات بدقة على السيرفر
// ==========================================
const audioDir = path.join(__dirname, 'audio');
const publicDir = path.join(__dirname, 'public');
const imageDir = path.join(publicDir, 'image');

// إنشاء المجلدات تلقائياً إذا لم تكن موجودة لتفادي أخطاء النظام
[audioDir, publicDir, imageDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ==========================================
// 2. إتاحة المجلدات للمتصفح (Static Files)
// ==========================================
app.use(express.static(publicDir)); // يجعل محتويات public (بما فيها مجلد image) متاحة مباشرة
app.use('/audio', express.static(audioDir)); // يتيح الوصول للملفات الصوتية عبر رابط /audio/filename.mp3

// ==========================================
// 3. محرك الرفع الذكي: توجيه كل ملف حسب نوعه
// ==========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => { 
        // إذا كان الملف صورة، يتم توجيهه لمجلد الصور داخل public
        if (file.mimetype.startsWith('image/')) {
            cb(null, imageDir); 
        } else {
            // إذا كان ملفاً صوتياً، يتم توجيهه لمجلد الصوت الخارجي
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

// ==========================================
// 4. تحديث رابط الرفع (Upload Route) ليعيد الرابط الصحيح
// ==========================================
app.post('/api/upload-album', upload.single('audioFile'), (req, res) => {
    const { day, time, manualUrl } = req.body;
    
    // في حال إرسال رابط خارجي من لوحة الفنان
    if (manualUrl) {
        currentAlbumImage = manualUrl;
        fmEncodingStats.rdsText = `بث الألبوم الحالي بواسطة الفنان مباشرة`;
        return res.json({ success: true, filepath: currentAlbumImage, coverUrl: currentAlbumImage });
    }
    
    if (!req.file) { return res.status(400).json({ success: false, message: "لم يتم اختيار ملف !" }); }

    // التحقق أين تم حفظ الملف لإنشاء الرابط الصحيح للمتصفح
    if (req.file.mimetype.startsWith('image/')) {
        // بما أن مجلد image داخل public المتاح كملف ساكن، الرابط يبدأ بـ /image/
        currentAlbumImage = `/image/${req.file.filename}`;
    } else {
        // الملفات الصوتية تبدأ بـ /audio/
        currentAlbumImage = `/audio/${req.file.filename}`;
    }

    fmEncodingStats.rdsText = `ألبوم مجدول: ${day} - ${time}`;
    messages.push({ sender: "نظام الجدولة 📅", text: `تم رفع وتصنيف مادة إذاعية جديدة بنجاح [${day}] - [${time}]`, time: Date.now() });
    
    res.json({ success: true, filepath: currentAlbumImage, coverUrl: currentAlbumImage });
});
