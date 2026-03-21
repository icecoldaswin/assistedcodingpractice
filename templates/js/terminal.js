function termSpinner(msg, tabId) {
    clearInterval(spinnerInterval);
    const tid = tabId || activeTabId;
    spinnerTabId = tid;
    setStatus(msg);
    if (tid !== activeTabId) return;
    const term = document.getElementById('terminal');
    const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    let i = 0;
    term.style.color = '#facc15';
    term.innerText = `${frames[0]} ${msg}`;
    spinnerInterval = setInterval(() => {
        if (activeTabId !== tid) { clearInterval(spinnerInterval); return; }
        i = (i + 1) % frames.length; term.innerText = `${frames[i]} ${msg}`; syncDockedTerminal();
    }, 80);
}

function termDone(text, color, tabId) {
    const tid = tabId || activeTabId;
    if (spinnerTabId === tid) { clearInterval(spinnerInterval); spinnerTabId = null; }
    if (tabs[tid]) { tabs[tid].terminalOutput = text; tabs[tid].terminalColor = color || '#10b981'; }
    const short = text.replace(/^>>>\s*/, '').slice(0, 60);
    setStatus(short);
    if (tid === activeTabId) {
        const term = document.getElementById('terminal');
        term.innerText = text; term.style.color = color || '#10b981';
        syncDockedTerminal();
    }
}

function clearTerminal() {
    document.getElementById('terminal').innerText = '';
    hideTermTable();
    if (activeTabId && tabs[activeTabId]) { tabs[activeTabId].terminalOutput = ''; tabs[activeTabId].terminalColor = ''; tabs[activeTabId].terminalTable = null; }
    syncDockedTerminal();
}

function renderTermTable(data, tabId) {
    const tid = tabId || activeTabId;
    if (tabs[tid]) tabs[tid].terminalTable = data || null;
    if (tid !== activeTabId) return;
    if (!data) { hideTermTable(); return; }
    const rows = Array.isArray(data) ? data : Object.values(data);
    if (!rows.length) { hideTermTable(); return; }
    const keys = Object.keys(rows[0]);
    let html = '<table class="term-tbl"><thead><tr>' + keys.map(k => `<th>${esc(String(k))}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(r => {
        html += '<tr>' + keys.map(k => {
            const v = r[k]; const s = String(v ?? '');
            const cls = /^(pass|✓|true|yes)$/i.test(s) ? 'pass' : /^(fail|✗|false|no)$/i.test(s) ? 'fail' : '';
            return `<td class="${cls}">${esc(s)}</td>`;
        }).join('') + '</tr>';
    });
    html += '</tbody></table>';
    ['termTable', 'dockedTermTable'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.innerHTML = html; el.classList.remove('hidden'); }
    });
}

function hideTermTable() {
    ['termTable', 'dockedTermTable'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.innerHTML = ''; el.classList.add('hidden'); }
    });
}

function syncDockedTerminal() {
    const src = document.getElementById('terminal');
    const dst = document.getElementById('dockedTermContent');
    if (src && dst) { dst.innerText = src.innerText; dst.style.color = src.style.color; }
}
