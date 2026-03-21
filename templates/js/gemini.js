const genMgr = {
    _active: null, _done: new Set(),
    busy() { return !!this._active; },
    acquire(key) {
        if (this._active) return false;
        if (this._done.has(key)) return false;
        this._active = key;
        document.querySelectorAll('[data-genaction]').forEach(b => { b.disabled = true; b.style.opacity = '0.4'; b.style.pointerEvents = 'none'; });
        return true;
    },
    release() {
        if (this._active) this._done.add(this._active);
        this._active = null;
        document.querySelectorAll('[data-genaction]').forEach(b => { b.disabled = false; b.style.opacity = ''; b.style.pointerEvents = ''; });
    },
    clearSection(key) { this._done.delete(key); },
    clearAll() { this._done.clear(); }
};

function getGeminiKey() {
    return localStorage.getItem('gemini_api_key') || '';
}

async function geminiCall(prompt) {
    const key = getGeminiKey();
    if (!key) throw new Error('Set your Gemini API key in the sidebar.');
    if (serverAvailable) {
        const res = await fetch('/gemini_proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt, api_key: key}) });
        const d = await res.json();
        if (d.error) throw new Error(d.error);
        return d.text;
    }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return d.candidates[0].content.parts[0].text;
}

function saveGeminiKey() {
    const k = document.getElementById('apiKeyInput').value.trim();
    if (k) { localStorage.setItem('gemini_api_key', k); document.getElementById('apiKeyStatus').innerText = 'Key saved'; }
    else { localStorage.removeItem('gemini_api_key'); document.getElementById('apiKeyStatus').innerText = 'Key cleared'; }
    setTimeout(() => document.getElementById('apiKeyStatus').innerText = '', 2000);
    closeKeyInput();
    updateKeyIndicator();
}

function toggleKeyInput() {
    const row = document.getElementById('apiKeyRow');
    if (row.classList.contains('hidden')) {
        row.classList.remove('hidden');
        document.getElementById('apiKeyInput').focus();
    } else { closeKeyInput(); }
}

function closeKeyInput() {
    document.getElementById('apiKeyRow').classList.add('hidden');
}

function updateKeyIndicator() {
    const trigger = document.getElementById('apiKeyTrigger');
    if (getGeminiKey()) { trigger.classList.remove('key-needed', 'border-slate-700'); trigger.classList.add('border-green-600'); }
    else { trigger.classList.remove('border-green-600'); trigger.classList.add('key-needed'); }
}
