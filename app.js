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

setInterval(function() {
    var now = new Date();
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString();
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

if (saveSchedBtn) {
    saveSchedBtn.addEventListener('click', function() {
        var files = document.getElementById('albumFiles').files;
        var day = document.getElementById('schedDay').value;
        var time = document.getElementById('schedTime').value;

        if (files.length === 0 || !time) {
            alert("Sélectionnez des fichiers et une heure !");
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
            alert("Planification et fichiers sauvegardés !");
            loadSavedTracks();
        };
    });
}

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

function triggerAlbumPlay(event) {
    event.isPlaying = true;
    if (statusEl) {
        statusEl.innerText = "Lecture de l'album...";
    }
    var index = 0;

    function playNext() {
        if (index < playlistFiles.length) {
            var fileURL = URL.createObjectURL(playlistFiles[index]);
            radioPlayer.src = fileURL;
            
            localStorage.setItem('radio_current_src', fileURL);
            localStorage.setItem('radio_track_title', playlistFiles[index].name);
            localStorage.setItem('radio_status', 'Playing');
            
            radioPlayer.play();
            radioPlayer.onended = function() {
                index++;
                playNext();
            };
        } else {
            if (statusEl) {
                statusEl.innerText = "Prêt";
            }
            localStorage.setItem('radio_status', 'Ready');
            event.isPlaying = false;
        }
    }
    playNext();
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', function(e) {
        if (radioPlayer) {
            radioPlayer.volume = e.target.value;
        }
    });
}

function startRecording(stream) {
    if (statusEl) {
        statusEl.innerText = "En direct...";
    }
    startMicBtn.disabled = true;
    if (stopMicBtn) {
        stopMicBtn.disabled = false;
    }

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    var source = audioContext.createMediaStreamSource(stream);
    
    delayNode = audioContext.createDelay();
    feedbackNode = audioContext.createGain();
    
    delayNode.delayTime.value = 0.3;
    feedbackNode.gain.value = parseFloat(echoSlider.value);
    
    source.connect(delayNode);
    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);
    delayNode.connect(audioContext.destination);
    source.connect(audioContext.destination);

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) {
            audioChunks.push(e.data);
        }
    };
    mediaRecorder.start(1000);
}

if (startMicBtn) {
    startMicBtn.addEventListener('click', function() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(startRecording);
    });
}

if (stopMicBtn) {
    stopMicBtn.addEventListener('click', function() {
        if (mediaRecorder) {
            mediaRecorder.stop();
        }
        if (audioContext) {
            audioContext.close();
        }
        if (statusEl) {
            statusEl.innerText = "Prêt";
        }
        if (startMicBtn) {
            startMicBtn.disabled = false;
        }
        stopMicBtn.disabled = true;
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

// التزامن التلقائي لاستلام الشات من المستمع وتنبيه المذيع في كونسول الهاتف
window.addEventListener('storage', function(e) {
    if (e.key === 'chat_listener_msg' && e.newValue) {
        var msgData = e.newValue.split('||')[0];
        console.log("رسالة جديدة من المستمع: " + msgData);
        // يمكنك مستقبلاً إضافة واجهة شات داخل لوحة المذيع لعرضها بشكل مرئي
    }
});

