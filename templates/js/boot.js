async function pingServer() {
    try {
        const res = await fetch('/ping', { signal: AbortSignal.timeout(2000) });
        serverAvailable = res.ok;
    } catch { serverAvailable = false; }
    setStatus(serverAvailable ? 'Server Connected' : 'Browser-Only Mode');
}

window.onload = function() {
    const boot = () => {
        if (typeof require !== 'undefined') {
            require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
            require(['vs/editor/editor.main'], () => {
                pingServer().then(() => {
                    loadState();
                    fetchProblemList();
                    updateLangSelector();
                    updateKeyIndicator();
                    updateMicStatus();
                    renderHelp();
                    // Show mode selector if no saved mode preference
                    const saved = localStorage.getItem('appMode');
                    if (saved) { appMode = saved; }
                    else { showModeSelector(); }
                });
            });
        } else { setTimeout(boot, 100); }
    };
    boot();
};
