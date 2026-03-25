let micRestartCount = 0;
let micStream = null; // keep the audio stream alive to prevent macOS from killing the session

function updateMicStatus() {
    const el = document.getElementById('statusMic');
    if (!el) return;
    if (micActive || ttsEnabled) {
        const parts = [];
        if (micActive) parts.push('🎤 Listening');
        if (ttsEnabled) parts.push('🔊 Speaking');
        el.innerText = parts.join(' · ');
        el.style.color = '#f87171';
    } else {
        el.innerText = `🎤 Voice off · ${micShortcut}`;
        el.style.color = '';
    }
}

function toggleVoice() {
    const turning = !micActive;
    if (turning) {
        if (!ttsEnabled) toggleTTS();
        if (!micActive) toggleMic();
    } else {
        if (micActive) stopMic();
        if (ttsEnabled) toggleTTS();
    }
    updateMicStatus();
}

function createRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let startedAt = 0;
    rec.onaudiostart = () => { console.log('[mic] audiostart'); };
    rec.onsoundstart = () => { console.log('[mic] soundstart'); };
    rec.onspeechstart = () => { console.log('[mic] speechstart'); };
    rec.onstart = () => { startedAt = Date.now(); console.log('[mic] started'); };
    rec.onresult = (e) => {
        micRestartCount = 0;
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript;
        }
        if (final) insertVoiceText(final);
    };
    rec.onerror = (e) => {
        console.warn('[mic] error:', e.error, e.message);
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'not-allowed') { stopMic(); return; }
    };
    rec.onend = () => {
        const lived = Date.now() - startedAt;
        console.log('[mic] ended after', lived, 'ms, micActive=', micActive, 'restartCount=', micRestartCount);
        if (!micActive) return;
        micRestartCount++;
        const delay = Math.min(300 * Math.pow(1.5, micRestartCount - 1), 5000);
        clearTimeout(micRestartTimer);
        micRestartTimer = setTimeout(() => {
            if (!micActive) return;
            try {
                recognition = createRecognition();
                if (recognition) recognition.start();
                else stopMic();
            } catch (err) { console.error('[mic] restart failed:', err); stopMic(); }
        }, delay);
    };
    return rec;
}

async function toggleMic() {
    const btn = document.getElementById('btn-mic');
    if (micActive) { stopMic(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported. Use Chrome/Edge.'); return; }

    // Acquire mic stream first — this warms up the audio session on macOS
    // and ensures permission is granted before SpeechRecognition.start()
    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        alert('Microphone permission denied.\nIf in iframe, add allow="microphone" to the iframe tag.');
        return;
    }

    micRestartCount = 0;
    recognition = createRecognition();
    try {
        recognition.start();
        micActive = true;
        btn.classList.add('text-red-400');
        btn.classList.remove('text-slate-500');
        updateMicStatus();
    } catch(err) {
        releaseMicStream();
        alert('Mic error: ' + err.message);
    }
}

function releaseMicStream() {
    if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
    }
}

function stopMic() {
    micActive = false;
    micRestartCount = 0;
    clearTimeout(micRestartTimer);
    if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
    releaseMicStream();
    const btn = document.getElementById('btn-mic');
    btn.classList.remove('text-red-400');
    btn.classList.add('text-slate-500');
    updateMicStatus();
}

function insertVoiceText(text) {
    if (lastFocusedEditorKey && editors[lastFocusedEditorKey]) {
        const ed = editors[lastFocusedEditorKey];
        if (ed.hasTextFocus()) {
            const pos = ed.getPosition();
            ed.executeEdits('voice', [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text }]);
            return;
        }
    }
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.id !== 'adHocChatInput') {
        const start = el.selectionStart || 0;
        el.value = el.value.slice(0, start) + text + el.value.slice(start);
        el.selectionStart = el.selectionEnd = start + text.length;
        el.dispatchEvent(new Event('input'));
        return;
    }
    showChatPanel();
    const adHoc = document.getElementById('adHocChatInput');
    adHoc.value += (adHoc.value ? ' ' : '') + text;
    adHoc.focus();
}

function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    const btn = document.getElementById('btn-tts');
    btn.innerText = ttsEnabled ? '🔊' : '🔇';
    if (ttsEnabled) { btn.classList.add('text-green-400'); btn.classList.remove('text-slate-500'); }
    else { btn.classList.remove('text-green-400'); btn.classList.add('text-slate-500'); speechSynthesis.cancel(); }
    updateMicStatus();
}

function voiceSpeak(text) {
    if (!ttsEnabled || !text) return;
    speechSynthesis.cancel();
    const clean = text.replace(/```[\s\S]*?```/g, ' code block ').replace(/[#*_`~>|\-\[\]()]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const chunks = clean.match(/.{1,200}(\s|$)/g) || [clean];
    chunks.forEach(chunk => {
        const utt = new SpeechSynthesisUtterance(chunk.trim());
        utt.rate = 1.1;
        speechSynthesis.speak(utt);
    });
}
