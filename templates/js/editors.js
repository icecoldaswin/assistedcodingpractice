function toggleMaximize(domId) {
    const el = document.getElementById(domId);
    const docked = document.getElementById('terminalDocked');
    if (maximizedEditor === domId) {
        el.classList.remove('editor-maximized', 'has-terminal');
        el.style.height = '';
        maximizedEditor = null;
        if (docked) docked.style.display = 'none';
    } else {
        if (maximizedEditor) {
            const prev = document.getElementById(maximizedEditor);
            prev.classList.remove('editor-maximized', 'has-terminal');
            prev.style.height = '';
        }
        el.classList.add('editor-maximized');
        maximizedEditor = domId;
        if (domId === 'codeDebugRow' && docked) {
            el.classList.add('has-terminal');
            docked.style.display = 'flex';
            docked.classList.remove('minimized');
            syncDockedTerminal();
        } else if (docked) { docked.style.display = 'none'; }
    }
    setTimeout(() => Object.values(editors).forEach(ed => { if (ed && ed.layout) ed.layout(); }), 50);
}

function toggleDockedTerminal() {
    const docked = document.getElementById('terminalDocked');
    const el = document.getElementById('codeDebugRow');
    docked.classList.toggle('minimized');
    el.classList.toggle('has-terminal', !docked.classList.contains('minimized'));
    setTimeout(() => Object.values(editors).forEach(ed => { if (ed && ed.layout) ed.layout(); }), 50);
}

function applyDescDock() {
    const bar = document.getElementById('descriptionBar');
    const leftPanel = document.getElementById('descLeftPanel');
    const btn = document.getElementById('btn-dock');
    const toggleBtn = document.getElementById('btn-desc-toggle');
    if (descDocked === 'left') {
        bar.style.display = 'none';
        bar.classList.remove('desc-hidden');
        leftPanel.classList.remove('hidden');
        leftPanel.innerHTML = '';
        const hdr = document.createElement('div');
        hdr.className = 'flex items-center justify-between px-4 py-1 border-b border-slate-800 shrink-0';
        hdr.innerHTML = `<span class="text-sm font-black text-slate-400">Description</span>`;
        leftPanel.appendChild(hdr);
        const desc = document.createElement('div');
        desc.className = 'p-4 text-sm text-slate-400 prose prose-invert prose-sm max-w-none italic';
        desc.innerHTML = tabs[activeTabId]?.statement || '';
        leftPanel.appendChild(desc);
        if (btn) btn.innerText = '⬓ Dock Top';
        leftPanel.classList.toggle('desc-hidden', descHidden);
    } else {
        bar.style.display = '';
        leftPanel.classList.add('hidden');
        leftPanel.classList.remove('desc-hidden');
        leftPanel.innerHTML = '';
        if (btn) btn.innerText = '⬒ Dock Left';
        bar.classList.toggle('desc-hidden', descHidden);
    }
    if (toggleBtn) toggleBtn.innerText = descHidden ? '▶' : '▼';
}

function toggleDescDock() {
    descDocked = descDocked === 'top' ? 'left' : 'top';
    localStorage.setItem('descDocked', descDocked);
    applyDescDock();
    setTimeout(() => Object.values(editors).forEach(ed => { if (ed && ed.layout) ed.layout(); }), 50);
}

function toggleDescHide() {
    descHidden = !descHidden;
    localStorage.setItem('descHidden', descHidden);
    applyDescDock();
    setTimeout(() => Object.values(editors).forEach(ed => { if (ed && ed.layout) ed.layout(); }), 50);
}

function descPeekIn() {
    if (!descHidden) return;
    const target = descDocked === 'left' ? document.getElementById('descLeftPanel') : document.getElementById('descriptionBar');
    target.classList.add('desc-peek');
    setTimeout(() => Object.values(editors).forEach(ed => { if (ed && ed.layout) ed.layout(); }), 350);
}

function descPeekOut() {
    if (!descHidden) return;
    const target = descDocked === 'left' ? document.getElementById('descLeftPanel') : document.getElementById('descriptionBar');
    target.classList.remove('desc-peek');
    setTimeout(() => Object.values(editors).forEach(ed => { if (ed && ed.layout) ed.layout(); }), 350);
}
