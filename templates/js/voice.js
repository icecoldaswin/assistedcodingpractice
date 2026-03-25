let micRestartCount = 0;
let micStream = null;
const MIC_MAX_RETRIES = 5;

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

function startRecognitionSession() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (recognition) { try { recognition.abort(); } catch {} }
    const rec = new SR();
    // single-shot mode — more reliable on macOS than continuous
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let gotResult = false;

    rec.onresult = (e) => {
        gotResult = true;
        micRestartCount = 0;
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript;
        }
        if (final) insertVoiceText(final);
    };
    rec.onerror = (e) => {
        console.warn('[mic] error:', e.error);
        if (e.error === 'not-allowed') { stopMic(); return; }
        if (e.error === 'network') { stopMic(); showSpeechBlockedPopover(); return; }
    };
    rec.onend = () => {
        if (!micActive) return;
        if (gotResult) {
            // successful cycle — restart immediately for next utterance
            micRestartCount = 0;
            startRecognitionSession();
        } else {
            // ended without result — count as a failed attempt
            micRestartCount++;
            if (micRestartCount > MIC_MAX_RETRIES) {
                console.warn('[mic] gave up after', MIC_MAX_RETRIES, 'retries');
                stopMic();
                setStatus('Mic: speech service unavailable — try again');
                return;
            }
            clearTimeout(micRestartTimer);
            micRestartTimer = setTimeout(() => {
                if (micActive) startRecognitionSession();
            }, 500);
        }
    };
    recognition = rec;
    try { rec.start(); } catch (err) { console.error('[mic] start failed:', err); stopMic(); }
}

async function toggleMic() {
    const btn = document.getElementById('btn-mic');
    if (micActive) { stopMic(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported. Use Chrome/Edge.'); return; }

    // Acquire mic stream first — warms up audio session on macOS
    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        alert('Microphone permission denied.\nIf in iframe, add allow="microphone" to the iframe tag.');
        return;
    }

    micActive = true;
    micRestartCount = 0;
    btn.classList.add('text-red-400');
    btn.classList.remove('text-slate-500');
    updateMicStatus();
    startRecognitionSession();
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

function showSpeechBlockedPopover() {
    let overlay = document.getElementById('speechBlockedOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'speechBlockedOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center';
        overlay.innerHTML = `<div style="background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:32px;max-width:420px;text-align:center">
            <div style="font-size:32px;margin-bottom:12px">🎤</div>
            <div style="font-weight:900;font-size:14px;color:#f8fafc;margin-bottom:8px">Speech Recognition Blocked</div>
            <div style="font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:16px">
                Your browser's speech service can't reach its servers.<br>
                This is typically caused by a firewall, VPN, DNS filter, or browser privacy settings.<br><br>
                Interview mode requires voice and is not available on this machine.
            </div>
            <div style="font-size:11px;color:#475569;margin-bottom:20px">
                Practice mode still offers a great way to prepare — full workbook, AI validation, debug trace, and code execution all work without voice.
            </div>
            <button onclick="document.getElementById('speechBlockedOverlay').remove()" style="background:#3b82f6;color:white;border:none;padding:8px 24px;border-radius:8px;font-weight:900;font-size:11px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em">Got it</button>
        </div>`;
        document.body.appendChild(overlay);
    }
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
