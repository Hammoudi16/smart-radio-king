var db = null;
var scheduledEvents = [];
var mediaRecorder = null;
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
var studioChatMessages = document.getElementById('studioChatMessages');
var studioChatInput = document.getElementById('studioChatInput');
var sendStudioChatBtn = document.getElementById('sendStudioChatBtn');

// إعداد قاعدة البيانات المحلية IndexedDB للجدولة
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

// تحديث الساعة وفحص الجدولة التلقائية
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

// تشغيل الميكروفون المباشر للاستوديو
function startRecording(stream) {
    if (statusEl) statusEl.innerText = "🔴 الميكروفون المباشر نشط حالياً...";
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

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start(1000);
}

if (startMicBtn) {
    startMicBtn.addEventListener('click', function() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(startRecording);
        }
    });
}

if (stopMicBtn) {
    stopMicBtn.addEventListener('click', function() {
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
        if (audioContext) audioContext.close();
        if (statusEl) statusEl.innerText = "إستعداد";
        startMicBtn.disabled = false;
        stopMicBtn.disabled = true;
    });
}

if (echoSlider) {
    echoSlider.addEventListener('input', function(e) {
        if (feedbackNode) feedbackNode.gain.value = parseFloat(e.target.value);
    });
}

// 💬 نظام مزامنة الرسائل محلياً والمجرب بالمحاكاة وبدون سيرفر
if (sendStudioChatBtn) {
    sendStudioChatBtn.addEventListener('click', function() {
        var text = studioChatInput.value.trim();
        if (!text) return;
        
        var currentChat = JSON.parse(localStorage.getItem('radio_global_chat') || "[]");
        currentChat.push({ sender: "أنت (المذيع)", text: text });
        localStorage.setItem('radio_global_chat', JSON.stringify(currentChat));
        
        // إشارة تحديث فورية للمتصفح الآخر
        localStorage.setItem('chat_update_trigger', Date.now()); 
        
        studioChatInput.value = "";
        renderChat();
    });
}

window.addEventListener('storage', function(e) {
    if (e.key === 'chat_update_trigger') {
        renderChat();
    }
    if (e.key === 'like_update_trigger') {
        renderLikes();
    }
});

function renderChat() {
    if (!studioChatMessages) return;
    studioChatMessages.innerHTML = "";
    var currentChat = JSON.parse(localStorage.getItem('radio_global_chat') || "[]");
    currentChat.forEach(function(msg) {
        var div = document.createElement('div');
        div.style.marginBottom = "5px";
        div.innerHTML = `<b>${msg.sender}:</b> ` + document.createTextNode(msg.text).textContent;
        studioChatMessages.appendChild(div);
    });
    studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
}

function renderLikes() {
    var tbody = document.getElementById('likesTableBody');
    if (!tbody) return;
    tbody.innerHTML = "";
    var likes = JSON.parse(localStorage.getItem('radio_global_likes') || "{}");
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

// رندرة أولية عند تشغيل الواجهة لقراءة البيانات المخزنة
renderChat();
renderLikes();

