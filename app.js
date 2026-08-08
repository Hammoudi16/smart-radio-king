var db = null;
var scheduledEvents = [];
var playlistFiles = [];
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

// رابط سيرفر البث الخاص بك على Render لتحديث الحالة عالمياً
var RENDER_SERVER_URL = "https://onrender.com";

// إعداد قاعدة البيانات وتوليدها تلقائياً بالهاتف
var request = indexedDB.open("RadioKingDB", 1);

request.onupgradeneeded = function(e) {
    var database = e.target.result;
    if (!database.objectStoreNames.contains("tracks")) {
        database.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
    }
};

request.onsuccess = function(e) {
    db = e.target.result;
    loadSavedTracks();
};

// العداد الذكي لمراقبة الوقت وجدولة تشغيل الألبومات تلقائياً
setInterval(function() {
    var now = new Date();
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString('ar-EG');
    }

    var currentDay = now.getDay();
    var hours = now.getHours().toString();
    var minutes = now.getMinutes().toString();
    
    if (hours.length < 2) hours = "0" + hours;
    if (minutes.length < 2) minutes = "0" + minutes;
    var currentTime = hours + ":" + minutes;

    for (var i = 0; i < scheduledEvents.length; i++) {
        var event = scheduledEvents[i];
        if (event.day == currentDay && event.time == currentTime && !event.isPlaying) {
            triggerAlbumPlay(event);
        }
    }
}, 1000);

// حفظ الألبومات والملفات الصوتية في ذاكرة الهاتف الكبيرة IndexedDB
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
            alert("تم حفظ ملفات الألبوم وجدولة البث بنجاح!");
            loadSavedTracks();
        };
    });
}

// تحميل المسارات المجدولة من الذاكرة الداخلية
function loadSavedTracks() {
    if (!db) return;
    var transaction = db.transaction(["tracks"], "readonly");
    var store = transaction.objectStore("tracks");
    var cursorRequest = store.openCursor();

    playlistFiles = [];
    scheduledEvents = [];

    cursorRequest.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
            playlistFiles.push(cursor.value.blob);
            scheduledEvents.push({ day: cursor.value.day, time: cursor.value.time, isPlaying: false });
            cursor.continue();
        }
    };
}

// تشغيل الألبوم المجدول ونقل حالته إلى المستمعين عبر الـ LocalStorage
function triggerAlbumPlay(event) {
    event.isPlaying = true;
    if (statusEl) {
        statusEl.innerText = "بث الألبوم المجدول...";
    }
    var index = 0;

    function playNext() {
        if (index < playlistFiles.length) {
            var fileURL = URL.createObjectURL(playlistFiles[index]);
            if (radioPlayer) {
                radioPlayer.src = fileURL;
                radioPlayer.play().catch(function(e){ console.log(e); });
            }
            
            localStorage.setItem('radio_current_src', fileURL);
            localStorage.setItem('radio_track_title', playlistFiles[index].name);
            localStorage.setItem('radio_status', 'Playing');
            
            if (radioPlayer) {
                radioPlayer.onended = function() {
                    index++;
                    playNext();
                };
            }
        } else {
            if (statusEl) {
                statusEl.innerText = "إستعداد";
            }
            localStorage.setItem('radio_status', 'Ready');
            event.isPlaying = false;
        }
    }
    playNext();
}

// التحكم في مستوى الصوت العام للمذيع
if (volumeSlider) {
    volumeSlider.addEventListener('input', function(e) {
        if (radioPlayer) {
            radioPlayer.volume = e.target.value;
        }
    });
}

// هندسة الصوت الحي للميكروفون مع تأثير الصدى والـ Delay
function startRecording(stream) {
    if (statusEl) {
        statusEl.innerText = "بث مباشر عبر المايك...";
    }
    if (startMicBtn) startMicBtn.disabled = true;
    if (stopMicBtn) stopMicBtn.disabled = false;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    var source = audioContext.createMediaStreamSource(stream);
    
    delayNode = audioContext.createDelay();
    feedbackNode = audioContext.createGain();
    
    delayNode.delayTime.value = 0.3; 
    if (echoSlider) {
        feedbackNode.gain.value = parseFloat(echoSlider.value);
    } else {
        feedbackNode.gain.value = 0;
    }
    
    source.connect(delayNode);
    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);
    delayNode.connect(audioContext.destination);
    source.connect(audioContext.destination);

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) {
            audioChunks.push(e.data);
            // يمكنك هنا مستقبلاً عمل Fetch لإرسال التدفّق الحي مباشرة لـ Render
        }
    };
    mediaRecorder.start(1000);
}

if (startMicBtn) {
    startMicBtn.addEventListener('click', function() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(startRecording)
            .catch(function(err) {
                alert("يرجى إعطاء صلاحية الوصول للميكروفون للبث!");
            });
    });
}

if (stopMicBtn) {
    stopMicBtn.addEventListener('click', function() {
        if (mediaRecorder) mediaRecorder.stop();
        if (audioContext) audioContext.close();
        if (statusEl) statusEl.innerText = "إستعداد";
        if (startMicBtn) startMicBtn.disabled = false;
        if (stopMicBtn) stopMicBtn.disabled = true;
        localStorage.setItem('radio_status', 'Ready');
    });
}

if (echoSlider) {
    echoSlider.addEventListener('input', function(e) {
        if (feedbackNode) {
            feedbackNode.gain.value = parseFloat(e.target.value);
        }
    });
}

// التزامن التلقائي لاستلام رسائل الشات من المستمعين وتنبيه المذيع باللوحة
window.addEventListener('storage', function(e) {
    if (e.key === 'chat_listener_msg' && e.newValue) {
        var msgData = e.newValue.split('||')[0];
        console.log("رسالة جديدة من المستمع: " + msgData);
    }
});
