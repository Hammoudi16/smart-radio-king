// ==========================================
// 🎙️ المتغيرات وإعدادات الرابط الرئيسي للسيرفر
// ==========================================
var scheduledEvents = [];
var mediaRecorder = null;
var audioContext = null;
var delayNode = null;
var feedbackNode = null;
var db = null;

// الرابط المشفر والآمن الخاص بسيرفرك المرفوع على Render
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
// 📅 1️⃣ إعداد قاعدة البيانات المحلية IndexedDB للجدولة
// ==========================================
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

// تحديث الساعة وفحص الجدولة التلقائية كل ثانية
var lastTriggeredMinute = "";
setInterval(function() {
    var now = new Date();
    if (clockEl) clockEl.innerText = now.toLocaleTimeString();

    var currentDay = now.getDay();
    var hours = now.getHours().toString().padStart(2, '0');
    var minutes = now.getMinutes().toString().padStart(2, '0');
    var currentTime = hours + ":" + minutes;

    if (currentTime === lastTriggeredMinute) return;

    for (var i = 0; i < scheduledEvents.length; i++) {
        var event = scheduledEvents[i];
        if (event.day == currentDay && event.time == currentTime) {
            lastTriggeredMinute = currentTime;
            triggerAlbumPlay(event.day, event.time);
            break;
        }
    }
}, 1000);

if (saveSchedBtn) {
    saveSchedBtn.addEventListener('click', function() {
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
    var transaction = db.transaction(["tracks"], "readonly");
    var store = transaction.objectStore("tracks").index("schedKey").getAll([day, time]);

    store.onsuccess = function(e) {
        var tracks = e.target.result;
        if (tracks.length === 0) return;
        var trackIndex = 0;

        function playNext() {
            if (trackIndex < tracks.length) {
                var fileURL = URL.createObjectURL(tracks[trackIndex].blob);
                radioPlayer.src = fileURL;
                
                // حفظ اسم المقطع الحالي محلياً
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
// 🎤 2️⃣ التحكم في الميكروفون المباشر والبث الآمن
// ==========================================
function startRecording(stream) {
    if (statusEl) statusEl.innerText = "🔴 الميكروفون المباشر نشط حالياً على الإنترنت...";
    if (startMicBtn) startMicBtn.disabled = true;
    if (stopMicBtn) {
        stopMicBtn.disabled = false;
        stopMicBtn.style.backgroundColor = "#ff0055"; // إضاءة الزر باللون الأحمر لبيان النشاط
    }

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    var source = audioContext.createMediaStreamSource(stream);
    
    // إنشاء تأثير الصدى (Echo) للمذيع
    delayNode = audioContext.createDelay();
    feedbackNode = audioContext.createGain();
    delayNode.delayTime.value = 0.3;
    feedbackNode.gain.value = echoSlider ? parseFloat(echoSlider.value) : 0;
    
    source.connect(delayNode);
    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);
    
    // استخدام ترميز صوتي خفيف ومضغوط عالمياً (Opus) لمنع تجميد شبكة الواي فاي المنزلية
    var options = { mimeType: 'audio/webm;codecs=opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'audio/webm' }; 
    }
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    mediaRecorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) {
            var audioBlob = new Blob([e.data], { type: 'audio/mpeg' });
            
            // إرسال قطعة الصوت عبر بروتوكول HTTPS الآمن لمنع حظر المتصفح
            fetch(SERVER_URL + '/api/stream-mic', {
                method: 'POST',
                headers: { 'Content-Type': 'audio/mpeg' },
                body: audioBlob
            }).catch(function(err){ 
                console.log("خطأ في نقل الصوت للسيرفر:", err); 
            });
        }
    };
    
    // تجميع البيانات وإرسال دفعة كل 4 ثوانٍ (4000ms) لحماية الراوتر من طوفان الطلبات
    mediaRecorder.start(4000); 
}

if (startMicBtn) {
    startMicBtn.addEventListener('click', function() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
            .then(startRecording)
            .catch(function(err) {
                alert("فشل الوصول للميكروفون، تأكد من إعطاء الصلاحية للموقع برابط HTTPS آمن.");
                console.log(err);
            });
        } else {
            alert("المتصفح لا يدعم تسجيل الميكروفون أو يحظره بسبب روابط غير آمنة.");
        }
    });
}

if (stopMicBtn) {
    stopMicBtn.addEventListener('click', function() {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        
        // إبلاغ السيرفر بإيقاف البث ليعود للموسيقى الخلفية ويقوم بالأرشفة
        fetch(SERVER_URL + '/api/stop-mic', { method: 'POST' }).catch(function(e){});

        if (audioContext) audioContext.close();
        if (statusEl) statusEl.innerText = "إستعداد";
        
        if (startMicBtn) startMicBtn.disabled = false;
        if (stopMicBtn) {
            stopMicBtn.disabled = true;
            stopMicBtn.style.backgroundColor = "#4a475a";
        }
    });
}

if (echoSlider) {
    echoSlider.addEventListener('input', function(e) {
        if (feedbackNode) feedbackNode.gain.value = parseFloat(e.target.value);
    });
}

// ==========================================
// 💬 3️⃣ نظام مزامنة الرسائل والإعجابات عبر الإنترنت
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
            fetchChatAndLikes(); // تحديث الواجهة فوراً بعد الإرسال
        }).catch(function(err) {
            console.log("خطأ أثناء إرسال الرسالة:", err);
        });
    });
    
    // تشغيل الإرسال عبر النقر على زر Enter
    if (studioChatInput) {
        studioChatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendStudioChatBtn.click();
        });
    }
}

function fetchChatAndLikes() {
    // جلب الشات الحي من السيرفر أونلاين
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
}).catch(function(e){});

// جدول جذب الإعجابات الحي من السيرفر أونلاين 
fetch(SERVER_URL + '/api/likes') 
.then(function(res) { return res.json(); }) 
.then(function(likes) { 
var tbody = document.getElementById('likesTableBody'); 
if (!tbody) return; 
tbody.innerHTML = ""; 
var المسارات = Object.keys(likes); 
if (tracks.length === 0) { 
tbody.innerHTML = <tr><td style="color: #a7a6ba;">لا توجد تفاعلات حتى الآن</td><td style="text-align: center; color: #a7a6ba;">0</td></tr>; 
return; 
} 
المسارات.forEach(function(track) { 
var tr = document.createElement('tr'); 
tr.innerHTML = <td>${track}</td><td style="text-align:center; color:#ff0055; font-weight:bold;">${likes[track]} ❤️</td>; 
tbody.appendChild(tr); 
} 
).catch(function(e){}); 
}

// تشغيل البيانات جلب دوراً كل ثانيتين لقراءة تفاعلات ورسائل المستمعين فوراً 
setInterval(fetchChatAndLikes, 2000); 
fetchChatAndLikes();

