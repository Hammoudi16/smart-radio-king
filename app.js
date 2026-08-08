// ==========================================
// 🎙️ إعداد المتغيرات والرابط الرئيسي للسيرفر
// ==========================================
var scheduledEvents = [];
var mediaRecorder = null;
var audioContext = null;
var delayNode = null;
var feedbackNode = null;
var db = null;

// 🔗 الرابط النهائي الموثوق والمشفر (HTTPS) لـ Render
var SERVER_URL = "https://onrender.com"; 

var radioPlayer = document.getElementById('radioPlayer');
var clockEl = document.getElementById('clock');
var statusEl = document.getElementById('currentStatus');
var saveSchedBtn = document.getElementById('saveSchedBtn');
var startMicBtn = document.getElementById('startMicBtn');
var stopMicBtn = document.getElementById('stopMicBtn');
var volumeSlider = document.getElementById('volumeSlider');
var echoSlider = document.getElementById('echoSlider');
var studioChatMessages = document.getElementById('studioChatMessages');
var studioChatInput = document.getElementById('studioChatInput');
var sendStudioChatBtn = document.getElementById('sendStudioChatBtn');

// ==========================================
// ⏱️ تشغيل الساعة المستقلة (محمية وعازلة للأخطاء)
// ==========================================
var lastTriggeredMinute = "";
setInterval(function() {
    try {
        var now = new Date();
        if (clockEl) clockEl.innerText = now.toLocaleTimeString();

        var currentDay = now.getDay();
        var hours = now.getHours().toString().padStart(2, '0');
        var minutes = now.getMinutes().toString().padStart(2, '0');
        var currentTime = hours + ":" + minutes;

        if (currentTime === lastTriggeredMinute) return;

        for (var i = 0; i < scheduledEvents.length; i++) {
            var event = scheduledEvents[i];
            if (event && event.day == currentDay && event.time == currentTime) {
                lastTriggeredMinute = currentTime;
                triggerAlbumPlay(event.day, event.time);
                break;
            }
        }
    } catch (e) {
        console.error("خطأ معزول في عداد الساعة:", e);
    }
}, 1000);

// ==========================================
// 📅 1️⃣ نظام الجدولة وقاعدة البيانات IndexedDB
// ==========================================
try {
    var request = indexedDB.open("RadioKingDB", 1);
    request.onupgradeneeded = function(e) {
        var database = e.target.result;
        if (!database.objectStoreNames.contains("tracks")) {
            var store = database.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
            store.createIndex("schedKey", ["day", "time"], { unique: false });
        }
    };
    request.onsuccess = function(e) {
        db = e.target.result;
        loadSavedTracks();
    };
} catch(e) {
    console.error("خطأ في تهيئة قاعدة البيانات المحلية:", e);
}

if (saveSchedBtn) {
    saveSchedBtn.addEventListener('click', function() {
        if (!db) { alert("قاعدة البيانات المحلية غير جاهزة بعد، يرجى المحاولة مجدداً!"); return; }
        var files = document.getElementById('albumFiles').files;
        var day = document.getElementById('schedDay').value;
        var time = document.getElementById('schedTime').value;

        if (files.length === 0 || !time) {
            alert("يرجى تحديد ملفات صوتية واختيار الوقت أولاً!");
            return;
        }

        var transaction = db.transaction(["tracks"], "readwrite");
        var store = transaction.objectStore("tracks");
        for (var j = 0; j < files.length; j++) {
            store.add({ name: files[j].name, blob: files[j], day: day, time: time });
        }
        transaction.oncomplete = function() {
            alert("تم تفعيل وتثبيت الجدولة بنجاح!");
            loadSavedTracks();
        };
    });
}

function loadSavedTracks() {
    if (!db) return;
    var transaction = db.transaction(["tracks"], "readonly");
    var store = transaction.objectStore("tracks");
    scheduledEvents = [];
    var uniqueKeys = new Set();

    store.openCursor().onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
            var key = cursor.value.day + "_" + cursor.value.time;
            if (!uniqueKeys.has(key)) {
                uniqueKeys.add(key);
                scheduledEvents.push({ day: cursor.value.day, time: cursor.value.time });
            }
            cursor.continue();
        }
    };
}

function triggerAlbumPlay(day, time) {
    if (statusEl) statusEl.innerText = "جاري بث الألبوم المجدول أسبوعياً...";
    if (!db) return;
    var transaction = db.transaction(["tracks"], "readonly");
    var store = transaction.objectStore("tracks").index("schedKey").getAll([day, time]);

    store.onsuccess = function(e) {
        var tracks = e.target.result;
        if (tracks.length === 0) return;
        var trackIndex = 0;

        function playNext() {
            if (trackIndex < tracks.length && radioPlayer) {
                var fileURL = URL.createObjectURL(tracks[trackIndex].blob);
                radioPlayer.src = fileURL;
                localStorage.setItem('radio_track_title', tracks[trackIndex].name);
                
                radioPlayer.play().catch(function() { trackIndex++; playNext(); });
                radioPlayer.onended = function() { URL.revokeObjectURL(fileURL); trackIndex++; playNext(); };
            } else {
                if (statusEl) statusEl.innerText = "إستعداد";
            }
        }
        playNext();
    };
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', function(e) {
        if (radioPlayer) radioPlayer.volume = e.target.value;
    });
}

// ==========================================
// 🎤 2️⃣ الميكروفون المباشر وضغط دفقات الصوت (آمن للواي فاي)
// ==========================================
function startRecording(stream) {
    if (statusEl) statusEl.innerText = "🔴 الميكروفون المباشر نشط حالياً على الإنترنت...";
    if (startMicBtn) startMicBtn.disabled = true;
    if (stopMicBtn) {
        stopMicBtn.disabled = false;
        stopMicBtn.style.backgroundColor = "#ff0055";
    }

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        var source = audioContext.createMediaStreamSource(stream);
        
        delayNode = audioContext.createDelay();
        feedbackNode = audioContext.createGain();
        delayNode.delayTime.value = 0.3;
        feedbackNode.gain.value = echoSlider ? parseFloat(echoSlider.value) : 0;
        
        source.connect(delayNode);
        delayNode.connect(feedbackNode);
        feedbackNode.connect(delayNode);
        
        var options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/webm' }; 
        }
        
        mediaRecorder = new MediaRecorder(stream, options);
        
        mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) {
                var audioBlob = new Blob([e.data], { type: 'audio/mpeg' });
                fetch(SERVER_URL + '/api/stream-mic', {
                    method: 'POST',
                    headers: { 'Content-Type': 'audio/mpeg' },
                    body: audioBlob
                }).catch(function(err){ console.log("خطأ غير مؤثر في دفق الصوت:", err); });
            }
        };
        
        // إرسال حزم مجمعة كل 4 ثوانٍ لحماية الراوتر من السقوط
        mediaRecorder.start(4000); 
    } catch(err) {
        console.error("فشل إعداد الميكروفون المباشر الخارجي:", err);
    }
}

if (startMicBtn) {
    startMicBtn.addEventListener('click', function() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
            .then(startRecording)
            .catch(function(err) {
                alert("يرجى تفعيل صلاحية الميكروفون في متصفحك أولاً لاستخدام البث المباشر.");
            });
        } else {
            alert("المتصفح لا يدعم تسجيل الميكروفون عبر بروتوكولات GitHub Pages المفتوحة.");
        }
    });
}

if (stopMicBtn) {
    stopMicBtn.addEventListener('click', function() {
        try {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
            fetch(SERVER_URL + '/api/stop-mic', { method: 'POST' }).catch(function(e){});

            if (audioContext) audioContext.close();
            if (statusEl) statusEl.innerText = "إستعداد";
            
            if (startMicBtn) startMicBtn.disabled = false;
            if (stopMicBtn) {
                stopMicBtn.disabled = true;
                stopMicBtn.style.backgroundColor = "#4a475a";
            }
        } catch (e) { console.log(e); }
    });
}

if (echoSlider) {
    echoSlider.addEventListener('input', function(e) {
        if (feedbackNode) feedbackNode.gain.value = parseFloat(e.target.value);
    });
}

// ==========================================
// 💬 3️⃣ جلب ومزامنة البيانات اللحظية أونلاين (معزول بالكامل)
// ==========================================
if (sendStudioChatBtn) {
    sendStudioChatBtn.addEventListener('click', function() {
        var text = studioChatInput.value.trim();
        if (!text) return;
        
        var msgPayload = { sender: "أنت (المذيع)", text: text };
        
        fetch(SERVER_URL + '/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msgPayload)
        }).then(function() {
            studioChatInput.value = "";
            fetchChatAndLikes(); 
        }).catch(function(err) {
            console.error("فشل مؤقت في إرسال الشات:", err);
        });
    });
    
    if (studioChatInput) {
        studioChatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendStudioChatBtn.click();
        });
    }
}

function fetchChatAndLikes() {
    if (!SERVER_URL) return;

    // 🔲 جلب الشات أونلاين بشكل مستقل وآمن


fetch(SERVER_URL + '/api/messages')
.then(function(res) { return res.json(); })
.then(function(data) {
if (!studioChatMessages) return;
studioChatMessages.innerHTML = "";
data.forEach(function(msg) {
var div = document.createElement('div');
div.style.marginBottom = "5px";
div.innerHTML = <b>${msg.sender}:</b> + document.createTextNode(msg.text).textContent;
studioChatMessages.appendChild(div);
});
studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
}).catch(function(e){ console.log("السيرفر نائم، جاري المحاولة..."); });

// 🔲 جلب تفاعلات الإعجاب أونلاين بشكل مستقل وآمن
fetch(SERVER_URL + '/api/likes')
.then(function(res) { return res.json(); })
.then(function(likes) {
var tbody = document.getElementById('likesTableBody');
if (!tbody) return;
tbody.innerHTML = "";
var tracks = Object.keys(likes);
if (tracks.length === 0) {
tbody.innerHTML = <tr><td style="color: #a7a6ba;">لا توجد تفاعلات حتى الآن</td><td style="text-align: center; color: #a7a6ba;">0</td></tr>;
return;
}
tracks.forEach(function(track) {
var tr = document.createElement('tr');
tr.innerHTML = <td>${track}</td><td style="text-align:center; color:#ff0055; font-weight:bold;">${likes[track]} ❤️</td>;
tbody.appendChild(tr);
});
}).catch(function(e){});
}

// تشغيل الجلب اللحظي التلقائي كل ثانيتين دون إعاقة واجهة المستخدم
setInterval(fetchChatAndLikes, 2000);
fetchChatAndLikes();


