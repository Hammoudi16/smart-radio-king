var db = null;
var scheduledEvents = [];
var mediaRecorder = null;
var lastTriggeredMinute = "";
var SERVER_URL = window.location.origin; 

// دالة جلب الشات وتحديثه في الاستوديو
function fetchChatFromServer() {
    var studioChatMessages = document.getElementById('studioChatMessages');
    if (!studioChatMessages) return;

    fetch(SERVER_URL + '/api/messages?t=' + Date.now()) // منع الكاش عند الجلب
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

// دالة إلغاء قفل واجهة المذيع الرئيسية
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

// إعداد زر الدخول عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', function() {
    var submitBtn = document.getElementById('submitPassBtn');
    var passInput = document.getElementById('studioPassInput'); 

    // دخول تلقائي إذا كان مسجلاً مسبقاً
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
            
            // تحقق محلي فوري وصارم بدون انتظار استجابة السيرفر لضمان الدخول من الهاتف
            if (pass === "123456" || sessionStorage.getItem('studio_custom_pass') === pass) {
                try { sessionStorage.setItem('studio_authenticated', 'true'); } catch(err) {}
                forceUnlockStudio();
            } else {
                // التحقق من السيرفر كخيار إضافي
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
}); 

// دالة إصدار تأثير صوت التنبيه (Beep)
function playStudioAlertSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 750;
    gain.gain.value = 0.08; 
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.20);
  } catch(e) {}
}

// دالة تشغيل الفواصل والـ Jingles
function playStudioJingle(url) {
  var radioPlayer = document.getElementById('radioPlayer');
  var statusEl = document.getElementById('currentStatus');
  if (radioPlayer) {
    if (statusEl) statusEl.innerText = "جاري بث فاصل إعلاني إذاعي الآن... 🌀";
    radioPlayer.src = url;
    radioPlayer.play().catch(function() { console.log("محجوب محلياً والبث مستمر."); });
    radioPlayer.onended = function() {
      if (statusEl) statusEl.innerText = "إستعداد";
      radioPlayer.src = SERVER_URL + "/radio.mp3";
    };
  }
}

// تهيئة بقية عناصر الاستوديو
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
      }).catch(function() { alert("فشل الاتصال بالسيرفر"); });
    };
  }

  // جدولة الألبومات أسبوعياً تلقائياً
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
            if (statusEl) statusEl.innerText = "جاري بث الألبوم المجدول...";
            break;
        }
    }
  }, 1000);

  // تحديث مستمر للشات وعداد المتصلين كل 3 ثوانٍ
  setInterval(function() {
    fetchChatFromServer();
    fetch(SERVER_URL + '/api/listeners-count?t=' + Date.now())
    .then(function(res) { return res.json(); })
    .then(function(data) {
        var listenersCountEl = document.getElementById('liveListeners');
        if (listenersCountEl && data.count !== undefined) listenersCountEl.innerText = data.count;
    }).catch(function() {});
  }, 3000);

  if (startMicBtn) {
    startMicBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(startRecording);
      } else {
        alert("الميكروفون محظور! تأكد من استخدام رابط https:// الآمن.");
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

function startRecording(stream) {
  var startMicBtn = document.getElementById('startMicBtn');
  var stopMicBtn = document.getElementById('stopMicBtn');
  var statusEl = document.getElementById('currentStatus');
  
  if (startMicBtn) startMicBtn.disabled = true;
  if (stopMicBtn) stopMicBtn.disabled = false;
  if (statusEl) statusEl.innerText = "🔴 الميكروفون المباشر نشط حالياً...";

  var options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) { options = { mimeType: 'audio/webm' }; }

  mediaRecorder = new MediaRecorder(stream, options);
  mediaRecorder.ondataavailable = function(e) {
    if (e.data && e.data.size > 0) {
      fetch(SERVER_URL + '/api/stream-mic', { method: 'POST', body: e.data });
    }
  };
  mediaRecorder.start(200);
}
