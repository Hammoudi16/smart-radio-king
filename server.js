var express = require('express');
var fs = require('fs');
var path = require('path');
var multer = require('multer');
var cors = require('cors'); 

var app = express();
var PORT = process.env.PORT || 3000; 

// كلمة المرور الافتراضية، ويمكن تغييرها ديناميكياً
var STUDIO_PASSWORD = "123456"; 

var subscribers = [];
var radioSchedule = [
{ day: 0, time: "20:00", file: "album1.mp3" },
{ day: 5, time: "22:00", file: "podcast_tunis.mp3" }
];
var currentTrack = "default_music.mp3";
var lastTriggeredMinute = "";
var isMicLive = false; 

var globalMessages = [{ sender: "النظام", text: "مرحباً بكم في استوديو راديو كينج الذكي المطور!" }];
var globalLikes = {};
var activeReactions = []; // لحفظ التفاعلات المتطايرة مؤقتاً 

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

// 🔐 مسار التحقق من كلمة المرور
app.post('/api/verify-login', function(req, res) {
var pass = req.body.password;
if (String(pass) === String(STUDIO_PASSWORD)) {
return res.status(200).json({ success: true });
}
res.status(401).json({ success: false, error: "كلمة المرور غير صحيحة!" });
}); 

// 🔄 الميزة 6: تغيير كلمة المرور من المتصفح
app.post('/api/change-password', function(req, res) {
var newPass = req.body.newPassword;
if (newPass && String(newPass).trim().length > 0) {
STUDIO_PASSWORD = String(newPass).trim();
return res.status(200).json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
}
res.status(400).json({ success: false, error: "رمز غير صالح" });
}); 

// 👥 الميزة 2: عداد المستمعين الحاليين المتصلين بدفق الراديو
app.get('/api/listeners-count', function(req, res) {
res.status(200).json({ count: subscribers.length });
}); 

// توجيه الموقع لعرض ملفات واجهة المستخدم من مجلد public
app.use(express.static(path.join(__dirname, 'public'))); 

// 💬 استقبال وحفظ رسائل الدردشة (الميزة 1: دعم اسم المستمع الفعلي)
app.post('/api/messages', function(req, res) {
var sender = req.body.sender || "مستمع";
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

// 👍 الإعجابات والتفاعلات بالقلوب
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

// 🎭 الميزة 3: استقبال وإرسال التفاعلات المتطايرة (Emojis)
app.post('/api/reactions', function(req, res) {
var emoji = req.body.emoji;
if (emoji) {
activeReactions.push({ emoji: emoji, id: Date.now() + Math.random() });
if (activeReactions.length > 20) activeReactions.shift();
return res.status(200).json({ status: "success" });
}
res.sendStatus(400);
}); 

app.get('/api/reactions', function(req, res) {
res.status(200).json(activeReactions);
activeReactions = []; // تفريغ التفاعلات بعد جلبها لكي لا تتكرر عند المستمعين
}); 

// 💾 رفع الألبومات وجدولتها
app.post('/api/upload-album', upload.single('audioFile'), function(req, res) {
if (!req.file) { return res.status(400).json({ error: "لم يتم استلام أي ملف صوتی" }); }
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
