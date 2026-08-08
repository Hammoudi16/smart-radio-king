var express = require('express')
var fs = require('fs')
var path = require('path')
var https = require('https') // استدعاء مكتبة طلبات الشبكة الآمنة
var app = express()
var PORT = process.env.PORT || 3000

var subscribers = []
var radioSchedule = [
    { day: 5, time: "22:00", file: "album1.mp3" },
    { day: 6, time: "10:00", file: "podcast_tunis.mp3" }
]
var currentTrack = "default_music.mp3"
var lastTriggeredMinute = ""

// آلية منع النوم التلقائي للسيرفر (Self-Ping Engine)
setInterval(function() {
    var selfUrl = "https://smart-radio-king.onrender.com/radio.mp3";
    console.log("إرسال إشارة تنشيط دورية للسيرفر لمنع الخمول...");
    
    // طلب يغلق نفسه فوراً بمجرد بدء الاستجابة لمنع استهلاك الموارد
    var req = https.get(selfUrl, function(res) {
        res.destroy(); 
    });
    req.on('error', function(err) {
        console.log("تنبيه التنشيط الذاتي:", err.message);
    });
}, 600000); // إرسال طلب كل 10 دقائق لضمان بقاء النطاق نشطاً

// فحص الجدولة الزمنية للمواد الإذاعية
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
            console.log("Changement de piste planifié : " + currentTrack)
            break
        }
    }
}, 1000)

// استقبال اتصال المستمعين بالبث الإذاعي
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
        subscribers = subscribers.filter(function(sub) {
            return sub !== res
        })
    })
})

// محرك ضخ الصوت المستمر بمعدل بث منظم
function broadcastAudio() {
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
            fs.read(fd, buffer, 0, chunkSize, offset, function(readErr, bytesRead) {
                if (readErr || bytesRead === 0) {
                    fs.close(fd, function() {
                        broadcastAudio()
                    })
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

broadcastAudio()

app.listen(PORT, function() {
    console.log("Radio Server running on port " + PORT)
})
