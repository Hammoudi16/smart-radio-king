var express = require('express')
var fs = require('fs')
var path = require('path')
var app = express()
var PORT = process.env.PORT || 3000

var subscribers = []
var radioSchedule = [
    { day: 0, time: "20:00", file: "album1.mp3" }, 
    { day: 5, time: "22:00", file: "podcast_tunis.mp3" } 
]
var currentTrack = "default_music.mp3"
var lastTriggeredMinute = ""
var isMicLive = false 

// 💬 مخزن مؤقت لحفظ الرسائل والإعجابات على السيرفر لتشغيل الشات والقلب عبر الإنترنت
var globalMessages = []
var globalLikes = {}

// 📁 التاكد من إنشاء مجلد التسجيلات ومجلد الصوتيات تلقائياً لمنع انهيار السيرفر
var recDir = path.join(__dirname, 'recordings')
var audioDir = path.join(__dirname, 'audio')

if (!fs.existsSync(recDir)) { fs.mkdirSync(recDir) }
if (!fs.existsSync(audioDir)) { fs.mkdirSync(audioDir) }

// سماح بالاتصال من أي موقع خارجي (CORS) لحل مشكلة عدم إرسال الشات والقلب من متصفحات مختلفة
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === 'OPTIONS') { return res.status(200).end(); }
    next();
});

// تفعيل قراءة الـ JSON لواجهات الدردشة والإعجابات
app.use(express.json()) 

// 🛠️ تحديد محدد لقراءة البث الخام الصوتي الخاص بالميكروفون والارشيف فقط لتفادي تداخل المسارات
app.use('/api/stream-mic', express.raw({ type: 'audio/mpeg', limit: '50mb' }))
app.use('/api/archive', express.raw({ type: 'audio/mpeg', limit: '50mb' }))

app.get('/', function(req, res) { res.status(200).send("Radio King Active 24/7!"); })

// واجهة استقبال رسائل الشات الحية عبر الإنترنت
app.post('/api/messages', function(req, res) {
    var msg = req.body;
    if(msg && msg.text) {
        // حماية بسيطة ضد الحقن البرمجي وتحديد هوية المرسل الافتراضية
        var cleanMsg = {
            sender: msg.sender ? String(msg.sender).trim() : "مستمع عبر الإنترنت",
            text: String(msg.text).trim()
        };
        globalMessages.push(cleanMsg);
        if(globalMessages.length > 50) globalMessages.shift(); // حفظ آخر 50 رسالة فقط
    }
    res.status(200).json({ status: "success" });
})

app.get('/api/messages', function(req, res) { res.status(200).json(globalMessages); })

// واجهة استقبال إعجابات المستمعين (زر القلب) عبر الإنترنت
app.post('/api/likes', function(req, res) {
    var data = req.body;
    if(data && data.track) {
        var trackName = String(data.track).trim();
        if (!globalLikes[trackName]) globalLikes[trackName] = 0;
        globalLikes[trackName]++;
    }
    res.status(200).json({ status: "success" });
})

app.get('/api/likes', function(req, res) { res.status(200).json(globalLikes); })

// واجهة دفق الميكروفون المباشر وتوزيعه على المتصلين فوراً
app.post('/api/stream-mic', function(req, res) {
    isMicLive = true; 
    var audioBuffer = req.body;
    
    for (var j = 0; j < subscribers.length; j++) { 
        try {
            subscribers[j].write(audioBuffer); 
        } catch(e) {
            // تجاهل الاخطاء الناتجة عن انقطاع اتصال المتصفحات المفاجئ
        }
    }
    res.status(200).end();
})

app.post('/api/stop-mic', function(req, res) { isMicLive = false; res.status(200).send({ status: "success" }); })

app.post('/api/archive', function(req, res) {
    var audioBuffer = req.body; 
    var filename = 'show_' + Date.now() + '.mp3';
    fs.writeFile(path.join(recDir, filename), audioBuffer, function(err) {
        if (err) return res.status(500).send({ error: "فشل الأرشفة" });
        res.status(200).send({ status: "archived", file: filename });
    });
})

app.get('/api/recordings', function(req, res) {
    fs.readdir(recDir, function(err, files) {
        if (err) return res.status(500).send([]);
        res.status(200).json(files.filter(function(f) { return f.endsWith('.mp3') }));
    });
})

app.get('/recordings/:file', function(req, res) {
    var filePath = path.join(recDir, req.params.file);
    if (fs.existsSync(filePath)) { res.setHeader('Content-Type', 'audio/mpeg'); fs.createReadStream(filePath).pipe(res); }
    else { res.status(404).send("الملف غير موجود"); }
})

// نقطة الاتصال الرئيسية لراديو المستمعين (Icecast Style Streaming)
app.get('/radio.mp3', function(req, res) {
    res.writeHead(200, { 
        'Content-Type': 'audio/mpeg', 
        'Connection': 'keep-alive', 
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    })
    subscribers.push(res)
    req.on('close', function() { subscribers = subscribers.filter(function(sub) { return sub !== res }) })
})

function broadcastAudio() {
    if (isMicLive) { setTimeout(broadcastAudio, 500); return; }
    
    var trackPath = path.join(audioDir, currentTrack)
    // إذا لم يتوفر الملف المجدول، يتم استخدام الموسيقى الافتراضية لحماية البث من الانقطاع
    if (!fs.existsSync(trackPath)) { trackPath = path.join(audioDir, 'default_music.mp3') }
    
    // إذا لم يتوفر حتى الملف الافتراضي، ننتظر ثانية لمنع الاستهلاك المفرط للمعالج المعلق
    if (!fs.existsSync(trackPath)) { 
        setTimeout(broadcastAudio, 1000); 
        return; 
    }

    var chunkSize = 4000; 
    var intervalTime = 250; 
    var buffer = Buffer.alloc(chunkSize)
    
    fs.open(trackPath, 'r', function(err, fd) {
        if (err) { setTimeout(broadcastAudio, 1000); return; }
        var offset = 0;
        
        function sendChunk() {
            if (isMicLive) { fs.close(fd, function() { broadcastAudio() }); return; }
            fs.read(fd, buffer, 0, chunkSize, offset, function(readErr, bytesRead) {
                if (readErr || bytesRead === 0) { fs.close(fd, function() { broadcastAudio() }); return; }
                offset += bytesRead
                var activeChunk = bytesRead < chunkSize ? buffer.subarray(0, bytesRead) : buffer
                
                for (var j = 0; j < subscribers.length; j++) { 
                    try {
                        subscribers[j].write(activeChunk) 
                    } catch(e) {
                        // حماية السيرفر من الانهيار إذا كان المقبس مغلقاً بشكل مفاجئ
                    }
                }
                setTimeout(sendChunk, intervalTime)
            })
        }
        sendChunk()
    })
}

// فحص الجدولة الزمنية كل ثانية لتحديث مسار الملف المشتغل تلقائياً
setInterval(function() {
    var now = new Date(); 
    var currentDay = now.getDay();
    var hours = now.getHours().toString().padStart(2, '0'), minutes = now.getMinutes().toString().padStart(2, '0');
    var currentTime = hours + ":" + minutes; 
    
    if (currentTime === lastTriggeredMinute) return;
    
    for (var i = 0; i < radioSchedule.length; i++) {
        var event = radioSchedule[i];
        if (event.day === currentDay && event.time === currentTime) { 
            lastTriggeredMinute = currentTime; 
            currentTrack = event.file; 
            break; 
        }
    }
}, 1000)

// إقلاع تدفق الصوت الخلفي فور تشغيل السيرفر
broadcastAudio()

app.listen(PORT, function() { console.log("Server running on port " + PORT) })
