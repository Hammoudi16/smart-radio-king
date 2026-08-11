window.onerror = function(msg, url, line) {
    alert("خطأ برمي في الاستوديو: " + msg + "\nالسطر: " + line);
    return false;
};

var db = null;
var scheduledEvents = [];
var mediaRecorder = null;
var audioContext = null;
var lastTriggeredMinute = "";
var SERVER_URL = window.location.origin; 

function fetchChatFromServer() {
    var studioChatMessages = document.getElementById('studioChatMessages');
    if (!studioChatMessages) return;

    fetch(SERVER_URL + '/api/messages')
    .then(function(res) { return res.json(); })
    .then(function(messages) {
        studioChatMessages.innerHTML = "";
        if (Array.isArray(messages)) {
            messages.forEach(function(msg) {
                var div = document.createElement('div');
                div.style.marginBottom = "8px";
                div.style.textAlign = "right";
                var color = msg.sender === "المذيع" ? "#ff0055" : "#00ebc7";
                div.innerHTML = `<b style="color: ${color}">${msg.sender}:</b> ` + document.createTextNode(msg.text).textContent;
                studioChatMessages.appendChild(div);
            });
        }
        studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
    }).catch(function(err) { console.log(err); });
}

function forceUnlockStudio() {
    var overlay = document.getElementById('securityOverlay');
    var mainContent = document.getElementById('studioMainContent');
    if (overlay) overlay.style.setProperty("display", "none", "important");
    if (mainContent) {
        mainContent.style.setProperty("display", "block", "important");
        mainContent.setAttribute("style", "display: block !important;");
    }
    initializeStudio();
}

window.addEventListener('DOMContentLoaded', function() {
    var submitBtn = document.getElementById('submitPassBtn');
    var passInput = document.getElementById('studioPassInput'); 

    if (sessionStorage.getItem('studio_authenticated') === 'true') {
        forceUnlockStudio();
        return;
    }

    if (submitBtn) {
        submitBtn.onclick = function(e) {
            if (e) e.preventDefault(); 
            var pass = passInput ? passInput.value.trim() : "";
            if (!pass) {
                alert("الرجاء كتابة كلمة المرور أولاً!");
                return false;
            }
            if (pass === "123456" || sessionStorage.getItem('studio_custom_pass') === pass) {
                try { sessionStorage.setItem('studio_authenticated', 'true'); } catch(err) {}
                forceUnlockStudio();
            } else {
                fetch(SERVER_URL + '/api/verify-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pass })
                })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) {
                        try { sessionStorage.setItem('studio_authenticated', 'true'); } catch(err) {}
                        forceUnlockStudio();
                    } else {
                        alert("كلمة المرور خاطئة!");
                    }
                })
                .catch(function() {
                    alert("فشل الاتصال! جرب الرمز الافتراضي: 123456");
                });
            }
            return false;
        };
    }

    if (passInput) {
        passInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && submitBtn) submitBtn.click();
        });
    }
}); 

// الميزة 4: دالة إصدار تأثير صوت التنبيه الخفيف المباشر وإرساله داخل دفق البث للمستمعين
function playStudioAlertSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 750; // تردد رنة الراديو
    gain.gain.value = 0.08; 
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.20); // مدة التنبيه
  } catch(e) {}
}

function playStudioJingle(url) {
  var radioPlayer = document.getElementById('radioPlayer');
  var statusEl = document.getElementById('currentStatus');
  if (radioPlayer) {
    if (statusEl) statusEl.innerText = "جاري بث فاصل إعلاني إذاعي الآن... 🌀";
    radioPlayer.src = url;
    radioPlayer.play().catch(function() {
        console.log("التشغيل التلقائي محجوب محلياً لكن الدفق مستمر.");
    });
    radioPlayer.onended = function() {
      if (statusEl) statusEl.innerText = "إستعداد";
      radioPlayer.src = SERVER_URL + "/radio.mp3";
      radioPlayer.play().catch(function(){});
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
  var sendStudioChatBtn = document.getElementById('sendStudioChatBtn');
  var changePassBtn = document.getElementById('changePassBtn');

  if (radioPlayer) { radioPlayer.src = SERVER_URL + "/radio.mp3"; }

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
        alert("تم تحديث كلمة المرور بنجاح على السيرفر!");
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
    var currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

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
      loadSavedTracks();
      alert("تم جدولة الألبوم محلياً بنجاح!");
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
      } else {
        alert("الميكروفون غير مدعوم أو الرابط غير آمن (تأكد من وجود https://)");
      }
    });
  }

  if (stopMicBtn) {
    stopMicBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
      var statusEl = document.getElementById('currentStatus');
      if (statusEl) statusEl.innerText = "إستعداد";
      if (startMicBtn) startMicBtn.disabled = false;
      if (stopMicBtn) stopMicBtn.disabled = true;
      fetch(SERVER_URL + '/api/stop-mic', { method: 'POST' });
    });
  }

  if (sendStudioChatBtn) {
    sendStudioChatBtn.onclick = function(e) {
      if (e) e.preventDefault();
      var studioChatInput = document.getElementById('studioChatInput');
      var text = studioChatInput.value.trim();
      if (!text) return false;
      studioChatInput.value = "";
      
      fetch(SERVER_URL + '/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: "المذيع", text: text })
      })
      .then(function() { fetchChatFromServer(); });
      return false;
    };
  }

  fetchChatFromServer();
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

دالة TriggerAlbumPlay(day, time) { 
varstatusEl = document.getElementById('currentStatus'); 
var radioPlayer = document.getElementById('radioPlayer'); 
if (statusEl)statusEl.innerText = "جاري بث الألبوم المجدول أسبوعياً..."; 
معاملة var = db.transaction(["tracks"], "readonly"); 
var store = treatment.objectStore("tracks").index("schedKey").getAll([day, time]);

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
if (statusEl) statusEl.innerText = "انتهى"; 
radioPlayer.src = SERVER_URL + "/radio.mp3"; 
} 
} 
playNext(); 
}; 
}

وظيفة startRecording(stream) { 
var startMicBtn = document.getElementById('startMicBtn'); 
var stopMicBtn = document.getElementById('stopMicBtn'); 
var StatusEl = document.getElementById('currentStatus');

إذا (startMicBtn) startMicBtn.disabled = true؛ 
إذا (stopMicBtn) stopMicBtn.disabled = false؛ 
if (statusEl)statusEl.innerText = "🔴 الميكروفون المباشر النشط حاليًا...";

var options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 }; 
if (!MediaRecorder.isTypeSupported(options.mimeType)) { options = { mimeType: 'audio/ogg;codecs=opus' }; } 
if (!MediaRecorder.isTypeSupported(options.mimeType)) { options = { mimeType: 'audio/webm' }; }

mediaRecorder = new MediaRecorder(stream, options); 
mediaRecorder.ondataavailable = function(e) { 
if (e.data && e.data.size > 0) { 
fetch(SERVER_URL + '/api/stream-mic', { 
الطريقة: 'POST', 
headers: { 'Content-Type': options.mimeType }, 
body: e.data 
}).catch(function(err){ console.log(err); }); 
} 
}; 
mediaRecorder.start(200); // تحديث الصوت كل 200 مللي ثانية لمنع الفجوات الصوتية في الأندرويد 
}

