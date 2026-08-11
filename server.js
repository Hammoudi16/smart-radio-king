var express = require('express');
var fs = require('fs');
var path = require('path');
var multer = require('multer');
var cors = require('cors'); 

var app = express();
var PORT = process.env.PORT || 3000; 

// كلمة المرور السرية المعتمدة لدخول الاستوديو
const STUDIO_PASSWORD = "123456"; 

var subscribers = [];
var radioSchedule = [
{ day: 0, time: "20:00", file: "album1.mp3" },
{ day: 5, time: "22:00", file: "podcast_tunis.mp3" }
];
var currentTrack = "default_music.mp3";
var lastTriggeredMinute = "";
var isMicLive = false; 

var globalMessages = [{ sender: "النظام", text: "مرحباً بكم في استوديو راديو كينج الذكي!" }];
var globalLikes = {}; 

var recDir = path.join(__dirname, 'recordings');
var audioDir = path.join(__dirname, 'audio'); 

if (!fs.existsSync(recDir)) { fs.mkdirSync(recDir); }
if (!fs.existsSync(audioDir)) { fs.mkdirSync(audioDir); } 

var storage = multer.diskStorage({
destination: function (req, file, cb) { cb(null, audioDir); },
filename: function (req, file, cb) { cb(null, 'album_' + Date.now() + path.extname(file.originalname)); }
});
var upload = multer({ storage: storage }); 

app.use(cors());
app.use(express.json()); 

app.use('/api/stream-mic', express.raw({ type: '*/*', limit: '50mb' }));
app.use('/api/archive', express.raw({ type: 'audio/mpeg', limit: '50mb' })); 

// 🔐 مسار مصلح ومضمون للتحقق من كلمة المرور وإرسال حالة نجاح صريحة للمتصفح
app.post('/api/verify-login', function(req, res) {
var pass = req.body.password;
if (String(pass) === String(STUDIO_PASSWORD)) {
return res.status(200).json({ success: true });
}
res.status(401).json({ success: false, error: "كلمة المرور غير صحيحة!" });
}); 

// توجيه الموقع لعرض ملفات واجهة المستخدم من مجلد public
app.use(express.static(path.join(__dirname, 'public'))); 

// 💬 استقبال وحفظ رسائل الدردشة
app.post('/api/messages', function(req, res) {
var sender = req.body.sender || "المذيع";
var text = req.body.text; 

if (text) {
globalMessages.push({
sender: String(sender),
text: String(text).trim()
});
if (globalMessages.length > 50) globalMessages.shift();
res.setHeader('Content-Type', 'application/json');
return res.status(200).send(JSON.stringify({ status: "success" }));
}
res.status(400).json({ error: "لا يوجد نص" });
}); 

app.get('/api/messages', function(req, res) { res.status(200).json(globalMessages); }); 

// 👍 الإعجابات والتفاعلات
app.post('/api/likes', function(req, res) {
var data = req.body;
if(data && data.track) {
var trackName = String(data.track).trim();
if (!globalLikes[trackName]) globalLikes[trackName] = 0;
globalLikes[trackName]++;
}
res.status(200).json({ status: "success" });
}); 

app.get('/api/likes', function(req, res) { res.status(200).json(globalLikes); }); 

// 💾 رفع الألبومات وجدولتها
app.post('/api/upload-album', upload.single('audioFile'), function(req, res) {
if (!req.file) { return res.status(400).json({ error: "لم يتم استلام أي ملف صوتي" }); }
var filename = req.file.filename;
var now = new Date();
radioSchedule.push({
day: now.getDay(),
time: (now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0')),
file: filename
});
res.status(200).json({ status: "success", file: filename });
}); 

// 🎤 بث الميكروفون المباشر
app.post('/api/stream-mic', function(req, res) {
isMicLive = true;
var audioBuffer = req.body;
for (var j = 0; j < subscribers.length; j++) {
try { subscribers[j].write(audioBuffer); } catch(e) {}
}
res.status(200).end();
}); 

app.post('/api/stop-mic', function(req, res) { isMicLive = false; res.status(200).send({ status: "success" }); }); 

app.post('/api/archive', function(req, res) {
var audioBuffer = req.body;
var filename = 'show_' + Date.now() + '.mp3';
fs.writeFile(path.join(recDir, filename), audioBuffer, function(err) {
if (err) return res.status(500).send({ error: "فشل الأرشفة" });
res.status(200).send({ status: "archived", file: filename });
});
}); 

// 📻 منفذ بث الراديو الحي المستمر للمستمعين
app.get('/radio.mp3', function(req, res) {
res.writeHead(200, {
'Content-Type': 'audio/mpeg',
'Connection': 'keep-alive',
'Transfer-Encoding': 'chunked',
'Cache-Control': 'no-cache, no-store, must-revalidate'
});
subscribers.push(res);
req.on('close', function() { subscribers = subscribers.filter(function(sub) { return sub !== res; }); });
}); 

function broadcastAudio() {
if (isMicLive) { setTimeout(broadcastAudio, 500); return; }
var trackPath = path.join(audioDir, currentTrack);
if (!fs.existsSync(trackPath)) { trackPath = path.join(audioDir, 'default_music.mp3'); }
if (!fs.existsSync(trackPath)) { setTimeout(broadcastAudio, 1000); return; } 

var chunkSize = 4000;
var intervalTime = 250;
var buffer = Buffer.alloc(chunkSize);

fs.open(trackPath, 'r', function(err, fd) {
if (err) { setTimeout(broadcastAudio, 1000); return; }
var offset = 0;
function sendChunk() {
    if (isMicLive) { fs.close(fd, function() { broadcastAudio(); }); return; }
    fs.read(fd, buffer, 0, chunkSize, offset, function(readErr, bytesRead) {
        if (readErr || bytesRead === 0) { fs.close(fd, function() { broadcastAudio(); }); return; }
        offset += bytesRead;
        var activeChunk = bytesRead < chunkSize ? buffer.subarray(0, bytesRead) : buffer;
        for (var j = 0; j < subscribers.length; j++) { 
            try { subscribers[j].write(activeChunk); } catch(e) {}
        }
        setTimeout(sendChunk, intervalTime);
    });
}
sendChunk();

});

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
}, 1000); 

broadcastAudio();
app.listen(PORT, function() { console.log("Server running on port " + PORT); });
