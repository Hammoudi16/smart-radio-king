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

// إنشاء مجلد الحلقات المؤرشفة إذا لم يكن موجوداً
var recDir = path.join(__dirname, 'recordings')
if (!fs.existsSync(recDir)) {
    fs.mkdirSync(recDir)
}

app.use(express.raw({ type: 'audio/mpeg', limit: '50mb' }))

app.get('/', function(req, res) {
    res.status(200).send("Smart Radio King Live Server is Active 24/7!");
})

// استقبال البث الحي وتوزيعه
app.post('/api/stream-mic', function(req, res) {
    isMicLive = true;
    var audioBuffer = req.body;
    for (var j = 0; j < subscribers.length; j++) {
        subscribers[j].write(audioBuffer);
    }
    res.status(200).end();
})

app.post('/api/stop-mic', function(req, res) {
    isMicLive = false;
    res.status(200).send({ status: "success" });
})

// 📁 ميزة الأرشيف: استقبال الحلقة المسجلة وحفظها بصيغة MP3
app.post('/api/archive', function(req, res) {
    var audioBuffer = req.body;
    var filename = 'show_' + Date.now() + '.mp3';
    var filePath = path.join(recDir, filename);

    fs.writeFile(filePath, audioBuffer, function(err) {
        if (err) {
            console.error("خطأ أثناء حفظ الحلقة المؤرشفة:", err);
            return res.status(500).send({ error: "فشل الحفظ" });
        }
        console.log("تمت أرشفة حلقة جديدة بنجاح باسم: " + filename);
        res.status(200).send({ status: "archived", file: filename });
    });
})

// جلب قائمة الحلقات المؤرشفة للمستمعين
app.get('/api/recordings', function(req, res) {
    fs.readdir(recDir, function(err, files) {
        if (err) return res.status(500).send([]);
        var mp3Files = files.filter(function(f) { return f.endsWith('.mp3') });
        res.status(200).json(mp3Files);
    });
})

// بث ملف حلقة مؤرشفة محددة عند طلبها من المستمع
app.get('/recordings/:file', function(req, res) {
    var file = req.params.file;
    var filePath = path.join(recDir, file);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'audio/mpeg');
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.status(404).send("الحلقة غير موجودة");
    }
})

// الرابط المباشر للاستماع للراديو
app.get('/radio.mp3', function(req, res) {
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    })
    subscribers.push(res)
    req.on('close', function() {
        subscribers = subscribers.filter(function(sub) { return sub !== res })
    })
})

function broadcastAudio() {
    if (isMicLive) {
        setTimeout(broadcastAudio, 500);
        return;
    }
    var trackPath = path.join(__dirname, 'audio', currentTrack)
    if (!fs.existsSync(trackPath)) {
        trackPath = path.join(__dirname, 'audio', 'default_music.mp3')
    }
    var chunkSize = 4000 
    var intervalTime = 250 
    var buffer = Buffer.alloc(chunkSize)
    
    fs.open(trackPath, 'r', function(err, fd) {
        if (err) {
            setTimeout(broadcastAudio, 1000)
            return
        }
        var offset = 0
        function sendChunk() {
            if (isMicLive) {
                fs.close(fd, function() { broadcastAudio() });
                return;
            }
            fs.read(fd, buffer, 0, chunkSize, offset, function(readErr, bytesRead) {
                if (readErr || bytesRead === 0) {
                    fs.close(fd, function() { broadcastAudio() })
                    return
                }
                offset += bytesRead
                var activeChunk = bytesRead < chunkSize ? buffer.subarray(0, bytesRead) : buffer
                for (var j = 0; j < subscribers.length; j++) {
                    subscribers[j].write(activeChunk)
                }
                setTimeout(sendChunk, intervalTime)
            })
        }
        sendChunk()
    })
}

setInterval(function() {
    var now = new Date()
    var currentDay = now.getDay()
    var hours = now.getHours().toString().padStart(2, '0')
    var minutes = now.getMinutes().toString().padStart(2, '0')
    var currentTime = hours + ":" + minutes

    if (currentTime === lastTriggeredMinute) return
    
    for (var i = 0; i < radioSchedule.length; i++) {
        var event = radioSchedule[i]
        if (event.day === currentDay && event.time === currentTime) {
            lastTriggeredMinute = currentTime
            currentTrack = event.file
            break
        }
    }
}, 1000)

broadcastAudio()
app.listen(PORT, function() { console.log("Server running on port " + PORT) })
