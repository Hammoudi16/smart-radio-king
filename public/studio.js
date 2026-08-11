var db = null;
var scheduledEvents = [];
var mediaRecorder = null;
var audioContext = null;
var delayNode = null;
var feedbackNode = null;
var lastTriggeredMinute = "";
var totalMessagesCachedCount = 0;
var totalLikesCachedSum = 0; 

var SERVER_URL = window.location.origin; 

window.addEventListener('DOMContentLoaded', function() {
var overlay = document.getElementById('securityOverlay');
var mainContent = document.getElementById('studioMainContent');
var submitBtn = document.getElementById('submitPassBtn');
var passInput = document.getElementById('studioPassInput'); 

function forceUnlockStudio() {
if (overlay) overlay.style.setProperty("display", "none", "important");
if (mainContent) {
mainContent.style.setProperty("display", "block", "important");
mainContent.setAttribute("style", "display: block !important;");
}
initializeStudio();
}

if (sessionStorage.getItem('studio_authenticated') === 'true') {
forceUnlockStudio();
return;
}

if (submitBtn) {
submitBtn.onclick = function() {
var pass = passInput.value.trim();
if (!pass) {
alert("الرجاء كتابة كلمة المرور أولاً!");
return;
}
    if (pass === "123456" || sessionStorage.getItem('studio_custom_pass') === pass) {
        sessionStorage.setItem('studio_authenticated', 'true');
        forceUnlockStudio();
    } else {
        // محاولة التحقق من السيرفر كخيار شبكي
        fetch(SERVER_URL + '/api/verify-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.success) {
                sessionStorage.setItem('studio_authenticated', 'true');
                forceUnlockStudio();
            } else {
                alert("كلمة المرور خاطئة!");
            }
        })
        .catch(function() {
            alert("خطأ في التحقق، يرجى المحاولة مجدداً.");
        });
    }
};

}

if (passInput) {
passInput.addEventListener('keypress', function(e) {
if (e.key === 'Enter') submitBtn.click();
});
}

}); 

// الميزة 4: دالة إصدار صوت التنبيه الخفيف للمذيع (Beep Audio Effect)
function playStudioAlertSound() {
try {
var ctx = new (window.AudioContext || window.webkitAudioContext)();
var osc = ctx.createOscillator();
var gain = ctx.createGain();
osc.type = "sine";
osc.frequency.value = 600; // تردد التنبيه
gain.gain.value = 0.08; // مستوى صوت خفيف جداً لا يزعج المذيع
osc.connect(gain);
gain.connect(ctx.destination);
osc.start();
osc.stop(ctx.currentTime + 0.12); // مدة التنبيه جزء من الثانية
} catch(e) {}
} 

// الميزة 5: دالة تحكم لتشغيل الفواصل والـ Jingles وبثها من الاستوديو للمستمعين
function playStudioJingle(url) {
var radioPlayer = document.getElementById('radioPlayer');
var statusEl = document.getElementById('currentStatus');
if (radioPlayer) {
if (statusEl) statusEl.innerText = "جاري بث فاصل إعلاني إذاعي الآن... 🌀";
radioPlayer.src = url;
radioPlayer.play().catch(function() { alert("فشل تشغيل الفاصل"); });
radioPlayer.onended = function() {
if (statusEl) statusEl.innerText = "إستعداد";
radioPlayer.src = SERVER_URL + "/radio.mp3";
};
}
} 

function initializeStudio() {
var radioPlayer = document.getElementById('radioPlayer');
var clockEl = document.getElementById('clock');
var saveSchedBtn = document.getElementById('saveSchedBtn');
var startMicBtn = document.getElementById('startMicBtn');
var stopMicBtn = document.getElementById('stopMicBtn');
var volumeSlider = document.getElementById('volumeSlider');
var echoSlider = document.getElementById('echoSlider');
var sendStudioChatBtn = document.getElementById('sendStudioChatBtn');
var changePassBtn = document.getElementById('changePassBtn'); 

if (radioPlayer) {
radioPlayer.src = SERVER_URL + "/radio.mp3";
}

// الميزة 6: معالجة ضغط زر حفظ كلمة السر الجديدة أونلاين
if (changePassBtn) {
changePassBtn.onclick = function() {
var val = document.getElementById('newPassInput').value.trim();
if (!val) { alert("اكتب الرمز الجديد أولاً"); return; }
fetch(SERVER_URL + '/api/change-password', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ newPassword: val })
})
.then(function() {
sessionStorage.setItem('studio_custom_pass', val);
alert("تم تحديث كلمة المرور السرية بنجاح وتفعيلها في السيرفر!");
document.getElementById('newPassInput').value = "";
}).catch(function() { alert("فشل الاتصال بالسيرفر"); });
};
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

// جلب التحديثات الدورية وعداد المتصلين بالاستوديو
setInterval(function() {
fetchChatFromServer();
fetchLikesFromServer();
fetch(SERVER_URL + '/api/listeners-count')
.then(function(res) { return res.json(); })
.then(function(data) {
    var listenersCountEl = document.getElementById('liveListeners');
    if (listenersCountEl && data.count !== undefined) listenersCountEl.innerText = data.count;
}).catch(function() {});

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
    formData.append("audioFile", files); 

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
var stopMicBtn = document.getElementById('stopMicBtn');
var echoSlider = document.getElementById('echoSlider');

if (statusEl) statusEl.innerText = "🔴 الميكروفون المباشر نشط حالياً...";
if (startMicBtn) startMicBtn.disabled = true;
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

var mimeType = 'audio/webm;codecs=opus';
if (!MediaRecorder.isTypeSupported(mimeType)) {
mimeType = 'audio/ogg;codecs=opus';
}

mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
mediaRecorder.ondataavailable = function(e) {
if (e.data.size > 0) {
fetch(SERVER_URL + '/api/stream-mic', {
method: 'POST',
headers: { 'Content-Type': mimeType },
body: e.data
}).catch(function(err) { console.log(err); });
}
};
mediaRecorder.start(500);
}

function fetchChatFromServer() {
var studioChatMessages = document.getElementById('studioChatMessages');
fetch(SERVER_URL + '/api/messages')
.then(function(res) { return res.json(); })
.then(function(messages) {
if (!studioChatMessages) return;

// الميزة 4: مقارنة العدد لإصدار إشعار صوتي للمذيع عند وصول رسالة جديدة
if (Array.isArray(messages) && messages.length > totalMessagesCachedCount) {
if (totalMessagesCachedCount > 0) { playStudioAlertSound(); }
totalMessagesCachedCount = messages.length;
}

studioChatMessages.innerHTML = "";
if (Array.isArray(messages)) {
messages.forEach(function(msg) {
var div = document.createElement('div');
div.style.marginBottom = "5px";
var textContent = msg.text ? msg.text : (typeof msg === 'string' ? msg : "");
var senderContent = msg.sender ? msg.sender : "المذيع";
div.innerHTML = "" + senderContent + ": " + document.createTextNode(textContent).textContent;
studioChatMessages.appendChild(div);
});
}
studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
}).catch(function(err) { console.log("خطأ جلب الشات:", err); });
}

function fetchLikesFromServer() {
var tbody = document.getElementById('likesTableBody');
fetch(SERVER_URL + '/api/likes')
.then(function(res) { return res.json(); })
.then(function(likes) {
if (!tbody) return;

// الميزة 4: إصدار إشعار تنبيهي خفيف للمذيع عند زيادة عدد الإعجابات
var currentLikesSum = 0;
var tracks = Object.keys(likes);
tracks.forEach(function(t) { currentLikesSum += (likes[t] || 0); });
if (currentLikesSum > totalLikesCachedSum) {
if (totalLikesCachedSum > 0) { playStudioAlertSound(); }
totalLikesCachedSum = currentLikesSum;
}

tbody.innerHTML = "";
if (tracks.length === 0) {
tbody.innerHTML = 'لا توجد تفاعلات حتى الآن0';
return;
}
tracks.forEach(function(track) {
var tr = document.createElement('tr');
tr.innerHTML = "" + track + "" + likes[track] + " ❤️";
tbody.appendChild(tr);
});
}).catch(function(err) { console.log("خطأ تفاعلات:", err); });
}


        
