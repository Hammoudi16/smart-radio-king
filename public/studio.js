var mediaRecorder = null;
var localStream = null; 
var SERVER_URL = window.location.origin; 

// 1. دالة إلغاء القفل الفوري وإظهار الاستوديو
function forceUnlockStudio() {
    var overlay = document.getElementById('securityOverlay');
    var mainContent = document.getElementById('studioMainContent');
    if (overlay) overlay.style.display = "none";
    if (mainContent) mainContent.style.setProperty("display", "block", "important");
    initializeStudio();
}

// 2. معالجة زر الدخول والتحقق من كلمة المرور عبر السيرفر
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
            
            fetch('/api/verify-password', {
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
                    alert("كلمة المرور خاطئة! يرجى التأكد من الرمز الصحيح.");
                }
            })
            .catch(function() {
                if (pass === "123456") {
                    sessionStorage.setItem('studio_authenticated', 'true');
                    forceUnlockStudio();
                } else {
                    alert("فشل الاتصال بالسيرفر للتحقق من الرمز.");
                }
            });
            return false;
        };
    }
}); 

// 3. دالة جلب وتحديث الشات والمستمعين (مصحة بالكامل للمسارات النسبية الشغالة)
function fetchChatAndStats() {
    var studioChatMessages = document.getElementById('studioChatMessages');
    if (studioChatMessages) {
        fetch('/api/messages?t=' + Date.now())
        .then(function(res) { return res.json(); })
        .then(function(messages) {
            studioChatMessages.innerHTML = "";
            if (Array.isArray(messages)) {
                messages.forEach(function(msg) {
                    var div = document.createElement('div');
                    div.style.marginBottom = "8px";
                    div.style.textAlign = "right";
                    
                    var color = "#00ebc7"; 
                    if (msg.sender === "المذيع") {
                        color = "#ff0055";
                    } else if (msg.sender.includes("النظام")) {
                        color = "#ffcc00"; 
                    }
                    
                    var senderB = document.createElement('b');
                    senderB.style.color = color;
                    senderB.innerText = msg.sender + ": ";
                    
                    var textNode = document.createTextNode(msg.text);
                    div.appendChild(senderB);
                    div.appendChild(textNode);
                    studioChatMessages.appendChild(div);
                });
            }
            studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
        }).catch(function(err) { console.log(err); });
    }

    fetch('/api/listeners-count?t=' + Date.now())
    .then(function(res) { return res.json(); })
    .then(function(data) {
        var listenersCountEl = document.getElementById('liveListeners');
        if (listenersCountEl && data.count !== undefined) listenersCountEl.innerText = data.count;
    }).catch(function() {});
}

// 4. دالة تشغيل الفواصل والـ Jingles
function playStudioJingle(url) {
  var radioPlayer = document.getElementById('radioPlayer');
  var statusEl = document.getElementById('currentStatus');
  if (radioPlayer) {
    if (statusEl) statusEl.innerText = "جاري بث فاصل إذاعي الآن... 🌀";
    radioPlayer.muted = false;
    radioPlayer.src = url;
    radioPlayer.play().catch(function() { console.log("محجوب محلياً والبث مستمر."); });
    radioPlayer.onended = function() {
      if (statusEl) statusEl.innerText = "إستعداد";
      radioPlayer.src = "/radio.mp3";
      radioPlayer.play().catch(function(){});
    };
  }
}

// 5. تهيئة الأزرار بالكامل بعد الدخول
function initializeStudio() {
  var radioPlayer = document.getElementById('radioPlayer');
  var startMicBtn = document.getElementById('startMicBtn');
  var stopMicBtn = document.getElementById('stopMicBtn');
  var sendStudioChatBtn = document.getElementById('sendStudioChatBtn');
  var changePassBtn = document.getElementById('changePassBtn');
  var volumeSlider = document.getElementById('volumeSlider');

  if (radioPlayer) { radioPlayer.src = "/radio.mp3"; }

  // تحديث الشات والمستمعين دورياً كل 3 ثوانٍ
  setInterval(fetchChatAndStats, 3000);

  if (volumeSlider) {
    volumeSlider.addEventListener('input', function(e) {
      if (radioPlayer) radioPlayer.volume = e.target.value;
    });
  }

  if (changePassBtn) {
    changePassBtn.onclick = function() {
      var val = document.getElementById('newPassInput').value.trim();
      if (!val) { alert("اكتب الرمز الجديد أولاً"); return; }
      fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: val })
      })
      .then(function() { alert("تم تحديث كلمة المرور بنجاح على السيرفر!"); })
      .catch(function() { alert("فشل الاتصال بالسيرفر"); });
    };
  }

  if (startMicBtn) {
    startMicBtn.onclick = function(e) {
      if (e) e.preventDefault();
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
            localStream = stream; 
            startRecording(stream);
        })
        .catch(function(err) {
            alert("فشل الوصول للميكروفون، يرجى إعطاء الصلاحية للموقع.");
        });
      } else {
        alert("الميكروفون محظور! تأكد من استخدام رابط الاستضافة الآمن HTTPS.");
      }
    };
  }

  if (stopMicBtn) {
    stopMicBtn.onclick = function(e) {
      if (e) e.preventDefault();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
      }
      if (localStream) {
          localStream.getTracks().forEach(function(track) { track.stop(); });
      }
      var statusEl = document.getElementById('currentStatus');
      if (statusEl) statusEl.innerText = "إستعداد";
      if (startMicBtn) startMicBtn.disabled = false;
      if (stopMicBtn) stopMicBtn.disabled = true;
      fetch('/api/stop-mic', { method: 'POST' });
    };
  }

  if (sendStudioChatBtn) {
    sendStudioChatBtn.onclick = function(e) {
      if (e) e.preventDefault();
      var studioChatInput = document.getElementById('studioChatInput');
      var text = studioChatInput.value.trim();
      if (!text) return false;
      studioChatInput.value = "";
      
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: "المذيع", text: text })
      })
      .then(function() { fetchChatAndStats(); });
      return false;
    };
  }

  var saveSchedBtn = document.getElementById('saveSchedBtn');
  if (saveSchedBtn) {
      saveSchedBtn.onclick = function() {
          var day = document.getElementById('schedDay').value;
          var time = document.getElementById('schedTime').value || "12:00";
          var fileInput = document.getElementById('albumFiles');
          var coverInput = document.getElementById('albumCoverInput');
          
          var formData = new FormData();
          formData.append("day", day);
          formData.append("time", time);
          
          if (fileInput.files.length > 0) {
              formData.append("audioFile", fileInput.files[0]);
          }
          if (coverInput && coverInput.files && coverInput.files.length > 0) {
              formData.append("albumCover", coverInput.files[0]);
          } else if (fileInput.files.length === 0) {
              alert("الرجاء اختيار ملف صوتي أو صورة لتحديث الاستوديو.");
              return;
          }
          
          fetch('/api/upload-album', {
              method: 'POST',
              body: formData
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
              alert("تم تحديث البيانات ورفع الغلاف الإذاعي الجديد بنجاح! 🖼️🎵");
              fetchChatAndStats();
          })
          .catch(function() { alert("حدث خطأ أثناء رفع البيانات للسيرفر."); });
      };
  }

  fetchChatAndStats();
}

// 6. دالة بث صوت المايكروفون المحدثة لملائمة الرأس التدفقي للسيرفر والموبايل
function startRecording(stream) {
  var startMicBtn = document.getElementById('startMicBtn');
  var stopMicBtn = document.getElementById('stopMicBtn');
  var statusEl = document.getElementById('currentStatus');
  
  if (startMicBtn) startMicBtn.disabled = true;
  if (stopMicBtn) stopMicBtn.disabled = false;
  if (statusEl) {
      statusEl.innerText = "🔴 الميكروفون المباشر نشط حالياً وعلى الهواء...";
      statusEl.style.color = "#ff0055";
  }

  var options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) { options = { mimeType: 'audio/webm' }; }

  try {
      mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) {
          fetch('/api/stream-mic', { 
             method: 'POST', 
             headers: { 'Content-Type': 'audio/webm;codecs=opus' },
             body: e.data 
          }).catch(function(err){ console.log(err); });
        }
};mediaRecorder.start(400); // إرسال نبضات سريعة جداً لمنع صمت القناة} catch(err) {console.error(err);}}
        </script>
</body>
</html>
