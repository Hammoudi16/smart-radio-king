var express = require('express')
var fs = require('fs')
var path = require('path')
var app = express()
var PORT = process.env.PORT || 3000

var subscribers = []
var radioSchedule = [
    { day: 5, time: "22:00", file: "album1.mp3" },
    { day: 6, time: "10:00", file: "podcast_tunis.mp3" }
]
var currentTrack = "default_music.mp3"

setInterval(function() {
    var now = new Date()
    var currentDay = now.getDay()
    var hours = now.getHours().toString()
    var minutes = now.getMinutes().toString()
    
    if (hours.length < 2) hours = "0" + hours
    if (minutes.length < 2) minutes = "0" + minutes
    var currentTime = hours + ":" + minutes

    for (var i = 0; i < radioSchedule.length; i++) {
        var event = radioSchedule[i]
        if (event.day === currentDay && event.time === currentTime) {
            currentTrack = event.file
        }
    }
}, 60000)

app.get('/radio.mp3', function(req, res) {
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive'
    })
    subscribers.push(res)
    req.on('close', function() {
        subscribers = subscribers.filter(function(sub) {
            return sub !== res
        })
    })
})

function broadcastAudio() {
    var trackPath = path.join(__dirname, 'audio', currentTrack)
    if (!fs.existsSync(trackPath)) {
        trackPath = path.join(__dirname, 'audio', 'default_music.mp3')
    }
    
    var stream = fs.createReadStream(trackPath)
    stream.on('data', function(chunk) {
        for (var j = 0; j < subscribers.length; j++) {
            subscribers[j].write(chunk)
        }
    })
    stream.on('end', function() {
        setTimeout(broadcastAudio, 100)
    })
    stream.on('error', function(err) {
        setTimeout(broadcastAudio, 1000)
    })
}

broadcastAudio()

app.listen(PORT, function() {
    console.log("Server running on port " + PORT)
})

