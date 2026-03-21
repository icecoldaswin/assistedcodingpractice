function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function md5(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function genHash() {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let h = ''; for (let i = 0; i < 5; i++) h += c[Math.floor(Math.random() * c.length)];
    return h;
}

function autoGrowInput(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function autoGrowPopup(el) {
    const popup = document.getElementById('ctxPopup');
    const words = el.value.trim().split(/\s+/).filter(Boolean).length;
    const w = Math.min(240 + words * 24, 480);
    popup.style.width = w + 'px';
}

function setStatus(msg) {
    const el = document.getElementById('statusMsg');
    if (el) el.innerText = msg;
}
