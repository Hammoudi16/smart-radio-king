var express = require('express')
var fs = require('fs')
var path = require('path')
var https = require('https')
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

var recDir = path.join(__dirname, 'recordings')
if (!fs.existsSync(recDir)) { fs.mkdirSync(recDir) }

// سماح بالاتصال من أي موقع خارجي (CORS) لحل مشكلة عدم إرسال الشات والقلب
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === 'OPTIONS') { return res.status(200).end(); }
    next();
});

app.use(express.json()) // لدعم قراءة نصوص الشات المرسلة كـ JSON
app.use(express.raw({ type: 'audio/mpeg', limit: '50mb' }))

app.get('/', function(req, res) { res.status(200).send("Radio King Active 24/7!"); })

// واجهة استقبال رسائل الشات الحية عبر الإنترنت
app.post('/api/messages', function(req, res) {
    var msg = req.body;
    if(msg && msg.text) {
        globalMessages.push(msg);
        if(globalMessages.length > 50) globalMessages.shift(); // حفظ آخر 50 رسالة فقط
    }
    res.status(200).json({ status: "success" });
})

app.get('/api/messages', function(req, res) { res.status(200).json(globalMessages); })

// واجهة استقبال إعجابات المستمعين (زر القلب) عبر الإنترنت
app.post('/api/likes', function(req, res) {
    var data = req.body;
    if(data && data.track) {
        if (!globalLikes[data.track]) globalLikes[data.track] = 0;
        globalLikes[data.track]++;
    }
    res.status(200).json({ status: "success" });
})

app.get('/api/likes', function(req, res) { res.status(200).json(globalLikes); })

app.post('/api/stream-mic', function(req, res) {
    isMicLive = true; var audioBuffer = req.body;
    for (var j = 0; j < subscribers.length; j++) { subscribers[j].write(audioBuffer); }
    res.status(200).end();
})
app.post('/api/stop-mic', function(req, res) { isMicLive = false; res.status(200).send({ status: "success" }); })
app.post('/api/archive', function(req, res) {
    var audioBuffer = req.body; var filename = 'show_' + Date.now() + '.mp3';
    fs.writeFile(path.join(recDir, filename), audioBuffer, function(err) {
        if (err) return res.status(500).send({ error: "فشل" });
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
    else { res.status(404).send("ناقص"); }
})
app.get('/radio.mp3', function(req, res) {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Connection': 'keep-alive', 'Transfer-Encoding': 'chunked' })
    subscribers.push(res)
    req.on('close', function() { subscribers = subscribers.filter(function(sub) { return sub !== res }) })
})

function broadcastAudio() {
    if (isMicLive) { setTimeout(broadcastAudio, 500); return; }
    var trackPath = path.join(__dirname, 'audio', currentTrack)
    if (!fs.existsSync(trackPath)) { trackPath = path.join(__dirname, 'audio', 'default_music.mp3') }
    var chunkSize = 4000; var intervalTime = 250; var buffer = Buffer.alloc(chunkSize)
    fs.open(trackPath, 'r', function(err, fd) {
        if (err) { setTimeout(broadcastAudio, 1000); return; }
        var offset = 0;
        function sendChunk() {
            if (isMicLive) { fs.close(fd, function() { broadcastAudio() }); return; }
            fs.read(fd, buffer, 0, chunkSize, offset, function(readErr, bytesRead) {
                if (readErr || bytesRead === 0) { fs.close(fd, function() { broadcastAudio() }); return; }
                offset += bytesRead
                var activeChunk = bytesRead < chunkSize ? buffer.subarray(0, bytesRead) : buffer
                for (var j = 0; j < subscribers.length; j++) { subscribers[j].write(activeChunk) }
                setTimeout(sendChunk, intervalTime)
            })
        }
        sendChunk()
    })
}
setInterval(function() {
    var now = new Date(); var currentDay = now.getDay();
    var hours = now.getHours().toString().padStart(2, '0'), minutes = now.getMinutes().toString().padStart(2, '0');
    var currentTime = hours + ":" + minutes; if (currentTime === lastTriggeredMinute) return;
    for (var i = 0; i < radioSchedule.length; i++) {
        var event = radioSchedule[i];
        if (event.day === currentDay && event.time === currentTime) { lastTriggeredMinute = currentTime; currentTrack = event.file; break; }
    }
}, 1000)
broadcastAudio()
app.listen(PORT, function() { console.log("Server running on port " + PORT) })
