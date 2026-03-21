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

function toggleMic() {
    const btn = document.getElementById('btn-mic');
    if (micActive) { stopMic(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported. Use Chrome/Edge.'); return; }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (e) => {
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript;
        }
        if (final) insertVoiceText(final);
    };
    recognition.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        stopMic();
    };
    recognition.onend = () => {
        if (!micActive) return;
        clearTimeout(micRestartTimer);
        micRestartTimer = setTimeout(() => {
            if (micActive && recognition) try { recognition.start(); } catch { stopMic(); }
        }, 300);
    };
    try {
        recognition.start();
        micActive = true;
        btn.classList.add('text-red-400');
        btn.classList.remove('text-slate-500');
        updateMicStatus();
    } catch(err) { alert('Mic error: ' + err.message + '\nIf in iframe, add allow="microphone" to the iframe tag.'); }
}

function stopMic() {
    micActive = false;
    clearTimeout(micRestartTimer);
    if (recognition) { try { recognition.stop(); } catch {} recognition = null; }
    const btn = document.getElementById('btn-mic');
    btn.classList.remove('text-red-400');
    btn.classList.add('text-slate-500');
    updateMicStatus();
}

function insertVoiceText(text) {
    // If code editor is focused, redirect voice to chat panel instead
    if (lastFocusedEditorKey && editors[lastFocusedEditorKey]) {
        const ed = editors[lastFocusedEditorKey];
        if (ed.hasTextFocus()) {
            const isCodeEditor = lastFocusedEditorKey.endsWith('_code');
            if (!isCodeEditor) {
                const pos = ed.getPosition();
                ed.executeEdits('voice', [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text }]);
                return;
            }
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
