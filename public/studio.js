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
        .catch(function() { alert("خطأ في التحقق."); });
      }
    };
  }

  if (passInput) {
    passInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') submitBtn.click();
    });
  }
}); 

function playStudioJingle(url) {
  var radioPlayer = document.getElementById('radioPlayer');
  var statusEl = document.getElementById('currentStatus');
  if (radioPlayer) {
    if (statusEl) statusEl.innerText = "جاري بث فاصل إعلاني إذاعي الآن... 🌀";
    radioPlayer.src = url;
    radioPlayer.play().catch(function() {
        console.log("تم كتم التشغيل التلقائي محلياً لكن البث مستمر للمستمعين.");
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
  var echoSlider = document.getElementById('echoSlider');
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

      fetch(SERVER_URL + '/api/upload-album', { method: 'POST', body: formData })
      .then(function() {
          alert("تم حفظ وتثبيت الجدولة بنجاح محلياً!");
          loadSavedTracks();
      }).catch(function() {
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

  if (sendStudioChatBtn) {
    sendStudioChatBtn.onclick = function(e) {
      if (e) { e.preventDefault(); }
      var studioChatInput = document.getElementById('studioChatInput');
      var text = studioChatInput.value.trim();
      if (!text) return false;
      studioChatInput.value = "";
      fetch(SERVER_URL + '/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: "المذيع", text: text })
      });
      return false;
    };
  }
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
  var startMicBtn = document.getElementById('startMicBtn');
  var stopMicBtn = document.getElementById('stopMicBtn');
  if (startMicBtn) startMicBtn.disabled = true;
  if (stopMicBtn) stopMicBtn.disabled = false;

  var mimeType = 'audio/webm;codecs=opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) { mimeType = 'audio/ogg;codecs=opus'; }

  mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
