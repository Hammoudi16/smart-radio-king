var db = null;
var scheduledEvents = [];
var mediaRecorder = null;
var audioChunks = [];
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

var lastTriggeredMinute = "";

setInterval(function() {
    var now = new Date();
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString();
    }

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
            var fileData = {
                name: files[j].name,
                blob: files[j],
                day: day,
                time: time
            };
            store.add(fileData);
        }

        transaction.oncomplete = function() {
            alert("تم حفظ الجدولة والملفات بنجاح!");
            loadSavedTracks();
        };
    });
}

function loadSavedTracks() {
    if (!db) return;
    var transaction = db.transaction(["tracks"], "readonly");
    var store = transaction.objectStore("tracks");
    var cursorRequest = store.openCursor();

    scheduledEvents = [];
    var uniqueKeys = new Set();

    cursorRequest.onsuccess = function(e) {
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
    if (statusEl) statusEl.innerText = "تشغيل الألبوم المجدول...";
    var transaction = db.transaction(["tracks"], "readonly");
    var store = transaction.objectStore("tracks");
    var index = store.index("schedKey");
    var requestTracks = index.getAll([day, time]);

    requestTracks.onsuccess = function(e) {
        var tracks = e.target.result;
        if (tracks.length === 0) return;
        var trackIndex = 0;

        function playNext() {
            if (trackIndex < tracks.length) {
                var currentTrack = tracks[trackIndex];
                var fileURL = URL.createObjectURL(currentTrack.blob);
                radioPlayer.src = fileURL;
                
                localStorage.setItem('radio_current_src', fileURL);
                localStorage.setItem('radio_track_title', currentTrack.name);
                localStorage.setItem('radio_status', 'Playing');
                
                radioPlayer.play().catch(function() {
                    trackIndex++;
                    playNext();
                });

                radioPlayer.onended = function() {
                    URL.revokeObjectURL(fileURL);
                    trackIndex++;
                    playNext();
                };
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

function startRecording(stream) {
    if (statusEl) statusEl.innerText = "بث مباشر (الميكروفون نشط)...";
    startMicBtn.disabled = true;
    if (stopMicBtn) stopMicBtn.disabled = false;

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
    audioChunks = [];
    mediaRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.start(1000);
}

if (startMicBtn) {
    startMicBtn.addEventListener('click', function() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(startRecording)
                .catch(function() {
                    alert("يرجى إعطاء صلاحية الوصول للميكروفون للبث!");
                });
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
        localStorage.setItem('radio_status', 'Ready');
    });
}

if (echoSlider) {
    echoSlider.addEventListener('input', function(e) {
        if (feedbackNode) feedbackNode.gain.value = parseFloat(e.target.value);
    });
}

// معالجة وإرسال رد المذيع للمستمعين
if (sendStudioChatBtn) {
    sendStudioChatBtn.addEventListener('click', function() {
        var text = studioChatInput.value.trim();
        if (!text) return;
        appendStudioMessage("أنت (المذيع)", text);
        localStorage.setItem('chat_sync_msg', text + "||" + Date.now());
        studioChatInput.value = "";
    });
}

// استقبال رسائل المستمعين ومزامنتها في لوحة الاستوديو
window.addEventListener('storage', function(e) {
    if (e.key === 'chat_listener_msg' && e.newValue) {
        var msgData = e.newValue.split('||')[0];
        appendStudioMessage("مستمع", msgData);
    }
});

function appendStudioMessage(sender, msg) {
    if (!studioChatMessages) return;
    var div = document.createElement('div');
    var b = document.createElement('b');
    b.textContent = sender + ": ";
    div.appendChild(b);
    div.appendChild(document.createTextNode(msg));
    div.style.marginBottom = "5px";
    studioChatMessages.appendChild(div);
    studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
}
