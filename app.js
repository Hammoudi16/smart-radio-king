var db = null;
var scheduledEvents = [];
var mediaRecorder = null;
var archiveRecorder = null; 
var archiveChunks = [];
var audioContext = null;
var delayNode = null;
var feedbackNode = null;

var radioPlayer = document.getElementById('radioPlayer');
var clockEl = document.getElementById('clock');
var statusEl = document.getElementById('currentStatus');
var saveSchedBtn = document.getElementById('saveSchedBtn');
var startMicBtn = document.getElementById('startMicBtn');
var stopMicBtn = document.getElementById('stopMicBtn');
var volumeSlider = document.getElementById('volumeSlider');
var echoSlider = document.getElementById('echoSlider');

// التأكد من جلب عناصر الشات والرد بالأسماء الصحيحة المتطابقة مع الـ HTML
var studioChatMessages = document.getElementById('studioChatMessages');
var studioChatInput = document.getElementById('studioChatInput');
var sendStudioChatBtn = document.getElementById('sendStudioChatBtn');

var serverUrl = "https://onrender.com";

// إعداد قاعدة البيانات المحلية IndexedDB
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

// ميقاتي الساعة وفحص الجدولة الأسبوعية
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
                localStorage.setItem('radio_current_src', fileURL);
                localStorage.setItem('radio_track_title', tracks[trackIndex].name);
                localStorage.setItem('radio_status', 'Playing');
                
                radioPlayer.play().catch(function() { trackIndex++; playNext(); });
                radioPlayer.onended = function() { URL.revokeObjectURL(fileURL); trackIndex++; playNext(); };
            } else {
                if (statusEl) statusEl.innerText = "إستعداد";
                localStorage.setItem('radio_status', 'Ready');
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

// تشغيل الميكروفون المباشر وتفعيل الحفظ للأرشيف
function startRecording(stream) {
    if (statusEl) statusEl.innerText = "🔴 البث المباشر للميكروفون نشط حالياً...";
    startMicBtn.disabled = true;
    stopMicBtn.disabled = false;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    var source = audioContext.createMediaStreamSource(stream);
    delayNode = audioContext.createDelay();
    feedbackNode = audioContext.createGain();
    
    delayNode.delayTime.value = 0.3;
    feedbackNode.gain.value = echoSlider ? parseFloat(echoSlider.value) : 0;
    
    source.connect(delayNode);
    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);
    delayNode.connect(audioContext.destination);
    source.connect(audioContext.destination);

    // المسجل الأول: للبث الحي الفوري
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) {
            fetch(serverUrl + '/api/stream-mic', {
                method: 'POST',
                headers: { 'Content-Type': 'audio/mpeg' },
                body: e.data
            }).catch(function(err) { console.log(err); });
        }
    };
    mediaRecorder.start(250);

    // المسجل الثاني: لتجميع الحلقة وتصديرها للأرشيف عند الإيقاف
    archiveChunks = [];
    archiveRecorder = new MediaRecorder(stream);
    archiveRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) archiveChunks.push(e.data);
    };
    archiveRecorder.start();
}

if (startMicBtn) {
    startMicBtn.addEventListener('click', function() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(startRecording);
        }
    });
}

// إصلاح زر الإيقاف الآمن ومحرك إنتاج الأرشيف تلقائياً
if (stopMicBtn) {
    stopMicBtn.addEventListener('click', function() {
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
        
        if (archiveRecorder && archiveRecorder.state !== "inactive") {
            archiveRecorder.onstop = function() {
                var completeBlob = new Blob(archiveChunks, { type: 'audio/mpeg' });
                if (statusEl) statusEl.innerText = "⏳ جاري نقل الحلقة للأرشيف...";
                
                fetch(serverUrl + '/api/archive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'audio/mpeg' },
                    body: completeBlob
                }).then(function() {
                    if (statusEl) statusEl.innerText = "إستعداد (تمت الأرشفة بنجاح)";
                }).catch(function() {
                    if (statusEl) statusEl.innerText = "إستعداد (فشلت الأرشفة)";
                });
            };
            archiveRecorder.stop();
        }
        
        if (audioContext) audioContext.close();
        startMicBtn.disabled = false;
        stopMicBtn.disabled = true;
        fetch(serverUrl + '/api/stop-mic', { method: 'POST' });
    });
}

if (echoSlider) {
    echoSlider.addEventListener('input', function(e) {
        if (feedbackNode) feedbackNode.gain.value = parseFloat(e.target.value);
    });
}

// التزامن الحي وجلب رسائل الشات والقلوب من السيرفر وعرضها للمذيع
setInterval(function() {
    fetch(serverUrl + '/api/messages')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (studioChatMessages) {
                studioChatMessages.innerHTML = "";
                data.forEach(function(msg) {
                    var div = document.createElement('div');
                    div.style.marginBottom = "5px";
                    div.innerHTML = `<b>${msg.sender}:</b> ` + document.createTextNode(msg.text).textContent;
                    studioChatMessages.appendChild(div);
                });
                studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
            }
        }).catch(function(e){});

    fetch(serverUrl + '/api/likes')
        .then(function(res) { return res.json(); })
        .then(function(likes) {
            var tbody = document.getElementById('likesTableBody');
            if (tbody) {
                tbody.innerHTML = "";
                var tracks = Object.keys(likes);
                if (tracks.length === 0) {
                    tbody.innerHTML = `<tr><td style="color: #a7a6ba;">لا توجد تفاعلات حتى الآن</td><td style="text-align: center; color: #a7a6ba;">0</td></tr>`;
                    return;
                }
                tracks.forEach(function(track) {
                    var tr = document.createElement('tr');
                    tr.innerHTML = `<td>${track}</td><td style="text-align:center; color:#ff0055; font-weight:bold;">${likes[track]} ❤️</td>`;
                    tbody.appendChild(tr);
                });
            }
        }).catch(function(e){});
}, 3000);



// إصلاح وتفعيل زر الإرسال للمذيع وتنظيف الصندوق فوراً
if (sendStudioChatBtn) {
sendStudioChatBtn.onclick = function() {
var text = studioChatInput.value.trim();
if (!text) return;

fetch(serverUrl + '/api/messages', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ sender: "أنت (المذيع)", text: text })
})
.then(function(res) {
if (res.ok) { studioChatInput.value = ""; }
}).catch(function(e){});
};
}



