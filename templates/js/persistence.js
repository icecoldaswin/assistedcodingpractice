function triggerSave() {
    if (!stateLoaded || Object.keys(tabs).length === 0) return;
    setStatus('Syncing...');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        if (Object.keys(tabs).length === 0) return;
        const payload = { tabs, activeTabId, chatThreads, openTabs: [...openTabs] };
        localStorage.setItem('workspace_state', JSON.stringify(payload));
        if (serverAvailable) {
            try { await fetch('/save_workspace', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }); } catch {}
        }
        setStatus('Saved');
    }, 1000);
}

async function loadState() {
    let data = null;
    const local = localStorage.getItem('workspace_state');
    if (local) { try { data = JSON.parse(local); } catch {} }
    if ((!data || !data.tabs || Object.keys(data.tabs).length === 0) && serverAvailable) {
        try {
            const res = await fetch('/load_workspace');
            data = await res.json();
        } catch {}
    }
    if (data && data.tabs && Object.keys(data.tabs).length > 0) {
        tabs = data.tabs;
        chatThreads = data.chatThreads || {};
        openTabs = new Set(data.openTabs || Object.keys(tabs));
        // On load, show only practice tabs (interview mode is entered explicitly)
        const practiceTabs = Object.values(tabs).filter(t => !t.interview);
        practiceTabs.forEach(t => addSidebarItem(t.id, t.title));
        const startTab = practiceTabs.find(t => t.id === data.activeTabId) || practiceTabs[0];
        if (startTab) selectTab(startTab.id);
    }
    stateLoaded = true;
}
