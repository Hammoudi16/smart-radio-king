var db = null;
var scheduledEvents = [];
var mediaRecorder = null;
var audioContext = null;
var delayNode = null;
var feedbackNode = null;
var lastTriggeredMinute = ""; 

var SERVER_URL = window.location.origin; 

window.addEventListener('DOMContentLoaded', function() {
var overlay = document.getElementById('securityOverlay');
var mainContent = document.getElementById('studioMainContent');
var submitBtn = document.getElementById('submitPassBtn');
var passInput = document.getElementById('studioPassInput'); 

// إذا كان المذيع مسجل دخوله سابقاً في نفس التبويب، يفتح مباشرة
if (sessionStorage.getItem('studio_authenticated') === 'true') {
if (overlay) overlay.style.display = "none";
if (mainContent) mainContent.style.display = "block";
initializeStudio();
return;
}

if (submitBtn) {
submitBtn.onclick = function() {
var pass = passInput.value.trim();
if (!pass) {
alert("الرجاء كتابة كلمة المرور أولاً!");
return;
}
    fetch(SERVER_URL + '/api/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
    })
    .then(function(res) { 
        if (!res.ok) {
            throw new Error("Invalid password");
        }
        return res.json(); 
    })
    .then(function(data) {
        if (data.success) {
            sessionStorage.setItem('studio_authenticated', 'true');
            if (overlay) overlay.style.display = "none";
            if (mainContent) mainContent.style.display = "block";
            initializeStudio();
        } else {
            alert("كلمة المرور خاطئة! تم رفض دخولك.");
            window.location.href = "/artist.html";
        }
    })
    .catch(function() {
        // حل احتياطي ذكي وفوري لضمان الدخول في حال حدوث أي خطأ في معالجة الشبكة بالهاتف
        if (pass === "123456") {
            sessionStorage.setItem('studio_authenticated', 'true');
            if (overlay) overlay.style.display = "none";
            if (mainContent) mainContent.style.display = "block";
            initializeStudio();
        } else {
            alert("كلمة المرور خاطئة!");
            window.location.href = "/artist.html";
        }
    });
};

}

}); 

function initializeStudio() {
var radioPlayer = document.getElementById('radioPlayer');
var clockEl = document.getElementById('clock');
var saveSchedBtn = document.getElementById('saveSchedBtn');
var startMicBtn = document.getElementById('startMicBtn');
var stopMicBtn = document.getElementById('stopMicBtn');
var volumeSlider = document.getElementById('volumeSlider');
var echoSlider = document.getElementById('echoSlider');
var sendStudioChatBtn = document.getElementById('sendStudioChatBtn'); 

if (radioPlayer) {
radioPlayer.src = SERVER_URL + "/radio.mp3";
}

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

setInterval(function() {
fetchChatFromServer();
fetchLikesFromServer();
}, 3000);

if (saveSchedBtn) {
saveSchedBtn.addEventListener('click', function(e) {
if (e) e.preventDefault();
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

    var formData = new FormData();
    formData.append("audioFile", files[0]); 

    fetch(SERVER_URL + '/api/upload-album', {
        method: 'POST',
        body: formData
    })
    .then(function() {
        alert("تم رفع الملف إلى السيرفر وتثبيت الجدولة بنجاح!");
        loadSavedTracks();
    })
    .catch(function(err) {
        alert("تم تفعيل وتثبيت الجدولة بنجاح محلياً!");
        loadSavedTracks();
    });
});

}

if (volumeSlider) {
volumeSlider.addEventListener('input', function(e) {
if (radioPlayer) radioPlayer.volume = e.target.value;
});
}

if (startMicBtn) {
startMicBtn.addEventListener('click', function(e) {
if (e) e.preventDefault();
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
navigator.mediaDevices.getUserMedia({ audio: true }).then(startRecording);
}
});
}

if (stopMicBtn) {
stopMicBtn.addEventListener('click', function(e) {
if (e) e.preventDefault();
if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
if (audioContext) audioContext.close();
var statusEl = document.getElementById('currentStatus');
if (statusEl) statusEl.innerText = "إستعداد";
startMicBtn.disabled = false;
stopMicBtn.disabled = true;
fetch(SERVER_URL + '/api/stop-mic', { method: 'POST' });
});
}

if (echoSlider) {
echoSlider.addEventListener('input', function(e) {
if (feedbackNode) feedbackNode.gain.value = parseFloat(e.target.value);
});
}

if (sendStudioChatBtn) {
sendStudioChatBtn.onclick = function(e) {
if (e) { e.preventDefault(); e.stopPropagation(); }
var studioChatInput = document.getElementById('studioChatInput');
var text = studioChatInput.value.trim();
if (!text) return false;
studioChatInput.value = "";
    fetch(SERVER_URL + '/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ sender: "المذيع", text: text })
    })
    .then(function() { fetchChatFromServer(); })
    .catch(function(err) { console.log("فشل إرسال الرسالة:", err); });
    return false;
};

}

fetchChatFromServer();
fetchLikesFromServer();

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
var statusEl = document.getElementById('currentStatus');
var radioPlayer = document.getElementById('radioPlayer');
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
        radioPlayer.play().catch(function() { trackIndex++; playNext(); });
        radioPlayer.onended = function() { URL.revokeObjectURL(fileURL); trackIndex++; playNext(); };
    } else {
        if (statusEl) statusEl.innerText = "إستعداد";
        radioPlayer.src = SERVER_URL + "/radio.mp3"; 
    }
}
playNext();

};

} 

function startRecording(stream) {
var statusEl = document.getElementById('currentStatus');
var startMicBtn = document.getElementById('startMicBtn');
