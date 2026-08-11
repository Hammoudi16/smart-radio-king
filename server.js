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

var globalMessages = []
var globalLikes = {}

var recDir = path.join(__dirname, 'recordings')
var audioDir = path.join(__dirname, 'audio')

if (!fs.existsSync(recDir)) { fs.mkdirSync(recDir) }
if (!fs.existsSync(audioDir)) { fs.mkdirSync(audioDir) }

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === 'OPTIONS') { return res.status(200).end(); }
    next();
});

app.use(express.json()) 
app.use('/api/stream-mic', express.raw({ type: 'audio/mpeg', limit: '50mb' }))
app.use('/api/archive', express.raw({ type: 'audio/mpeg', limit: '50mb' }))

// 📂 مسار مخصص لاستقبال ورفع ملفات الألبومات المجدولة من الهاتف مباشرة
app.use('/api/upload-album', express.raw({ type: 'multipart/form-data', limit: '50mb' }))

app.get('/', function(req, res) { res.status(200).send("Radio King Active 24/7!"); })

app.post('/api/messages', function(req, res) {
    var msg = req.body;
    if(msg && msg.text) {
        var cleanMsg = {
            sender: msg.sender ? String(msg.sender).trim() : "مستمع عبر الإنترنت",
            text: String(msg.text).trim()
        };
        globalMessages.push(cleanMsg);
        if(globalMessages.length > 50) globalMessages.shift();
    }
    res.status(200).json({ status: "success" });
})

app.get('/api/messages', function(req, res) { res.status(200).json(globalMessages); })

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

// 📅 استقبال وحفظ ملف الألبوم المرفوع داخل مجلد audio بالسيرفر ليعمل للمستمعين
app.post('/api/upload-album', function(req, res) {
    var audioBuffer = req.body;
    var filename = 'album_' + Date.now() + '.mp3';
    
    // حفظ الملف المرفوع مباشرة لتجده دالة البث عند مطابقة الوقت
    fs.writeFile(path.join(audioDir, filename), audioBuffer, function(err) {
        if (err) return res.status(500).json({ error: "فشل حفظ الألبوم سحابياً" });
        
        // إضافة الألبوم المرفوع مساره ديناميكياً للجدولة الحالية بالسيرفر
        var now = new Date();
        radioSchedule.push({ day: now.getDay(), time: lastTriggeredMinute, file: filename });
        
        res.status(200).json({ status: "success", file: filename });
    });
});

app.post('/api/stream-mic', function(req, res) {
    isMicLive = true; 
    var audioBuffer = req.body;
    for (var j = 0; j < subscribers.length; j++) { 
        try { subscribers[j].write(audioBuffer); } catch(e) {}
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
    if (!fs.existsSync(trackPath)) { trackPath = path.join(audioDir, 'default_music.mp3') }
    if (!fs.existsSync(trackPath)) { setTimeout(broadcastAudio, 1000); return; }

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
                    try { subscribers[j].write(activeChunk) } catch(e) {}
                }
                setTimeout(sendChunk, intervalTime)
            })
        }
        sendChunk()
    })
}

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

broadcastAudio()
app.listen(PORT, function() { console.log("Server running on port " + PORT) })
