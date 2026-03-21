document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); closeDebugTrace(); clearTerminal(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); triggerSave(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') { e.preventDefault(); const mc = e.target.closest('.monaco-container') || e.target.closest('#codeDebugRow'); if(mc) toggleMaximize(mc.id); }
    if ((e.ctrlKey || e.metaKey) && e.key === "'") { e.preventDefault(); runCode(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '"') { e.preventDefault(); runTests(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); toggleVoice(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '?') { e.preventDefault(); clickNearestValidate(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); debugCode(); }
    if (e.key === 'Escape' && micActive) { stopMic(); }
    if (e.key === 'Escape' && ttsEnabled) { speechSynthesis.cancel(); }
    if (e.key === 'Escape' && testGenTimer) { e.preventDefault(); cancelTestGen(); return; }
    if (e.key === 'Escape' && debugTraceActive) { e.preventDefault(); debugPause(); closeDebugTrace(); return; }
    if (debugTraceActive && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); debugPause(); stepDebugTrace(e.key === 'ArrowDown' ? 1 : -1); return; }
    if (debugTraceActive && e.key === ' ' && !e.target.closest('textarea,input,.monaco-editor')) { e.preventDefault(); debugPlayTimer ? debugPause() : debugPlay(); return; }
    if (e.key === 'Escape' && maximizedEditor) { toggleMaximize(maximizedEditor); }
});

document.addEventListener('mousedown', e => {
    if (!e.target.closest('#ctxPopup') && !e.target.closest('#atMentionPopup')) hideCtxPopup();
});

document.addEventListener('mouseup', e => {
    if (e.target.closest('#ctxPopup') || e.target.closest('#atMentionPopup')) return;
    clearTimeout(ctxDelayTimer);
    const sel = window.getSelection().toString().trim();
    if (sel.length < 2) return;
    const desc = document.getElementById('descriptionBox');
    const descBar = document.getElementById('descriptionBar');
    const descLeft = document.getElementById('descLeftPanel');
    const ai = document.getElementById('aiAnalysisBody');
    if ((desc && desc.contains(e.target)) || (descBar && descBar.contains(e.target)) || (descLeft && descLeft.contains(e.target))) scheduleCtxPopup(e.clientX, e.clientY, sel, 'statement');
    else if (ai && ai.contains(e.target)) scheduleCtxPopup(e.clientX, e.clientY, sel, 'ai-analysis');
    else if (e.target.closest('[id^="feedback-"]')) scheduleCtxPopup(e.clientX, e.clientY, sel, 'feedback');
});
