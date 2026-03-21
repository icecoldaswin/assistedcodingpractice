function applyModeLayout(isInterview) {
    document.getElementById('stepsGrid').style.display = isInterview ? 'none' : '';
    document.getElementById('codeDebugRow').style.height = isInterview ? 'calc(100vh - 280px)' : '450px';
    document.getElementById('codeActionBtns').style.display = isInterview ? 'none' : '';
    document.getElementById('codeToolbar').style.display = isInterview ? 'none' : '';
    document.getElementById('btn-workbook').style.display = isInterview ? 'none' : '';
    document.getElementById('btn-reference').style.display = isInterview ? 'none' : '';
}

function selectTab(id) {
    cancelTestGen();
    closeDebugTrace();
    activeTabId = id;
    genMgr.clearAll();

    // Hide everything until fully rendered
    const content = document.getElementById('activeContent');
    content.style.visibility = 'hidden';
    document.getElementById('emptyState').classList.add('hidden');
    content.classList.remove('hidden');
    document.getElementById('tabTitle').innerText = tabs[id].title;
    document.getElementById('descTitle').innerText = tabs[id].title;
    document.getElementById('descriptionBox').innerHTML = tabs[id].statement;

    if (!tabs[id].steps) tabs[id].steps = {};

    Object.values(editors).forEach(ed => {
        if (ed) { const model = ed.getModel(); ed.dispose(); if (model) model.dispose(); }
    });
    editors = {};

    const setupEd = (domId, key, lang) => {
        const dom = document.getElementById(domId);
        dom.innerHTML = '';
        const ed = monaco.editor.create(dom, {
            value: tabs[id].steps[key] || '',
            language: lang, theme: 'vs-dark',
            automaticLayout: true, minimap: {enabled: false}, fontSize: 13,
            glyphMargin: key === 'code',
            wordWrap: 'on', wrappingStrategy: 'advanced', wrappingIndent: 'indent',
            scrollbar: { alwaysConsumeMouseWheel: false }
        });
        ed.onDidChangeModelContent(() => { tabs[id].steps[key] = ed.getValue(); triggerSave(); });
        ed.onDidFocusEditorText(() => { lastFocusedEditorKey = `${id}_${key}`; });
        editors[`${id}_${key}`] = ed;
    };

    setupEd('editor-s1', 's1', 'markdown'); setupEd('editor-s2', 's2', 'markdown');
    setupEd('editor-s3', 's3', 'markdown'); setupEd('editor-s4', 's4', 'markdown');
    const lang = tabs[id].lang || 'python';
    setupEd('editor-code', 'code', lang); setupEd('editor-tests', 'tests', lang);

    const sel = document.getElementById('langSelect');
    if (sel) sel.value = lang;

    if (tabs[id].aiAnalysis) document.getElementById('aiAnalysisBody').innerHTML = marked.parse(tabs[id].aiAnalysis);
    else document.getElementById('aiAnalysisBody').innerHTML = "Click 'Refresh' to analyze.";

    const term = document.getElementById('terminal');
    term.innerText = tabs[id].terminalOutput || '';
    term.style.color = tabs[id].terminalColor || '#10b981';
    renderTermTable(tabs[id].terminalTable);

    if (tabs[id].debugTrace && tabs[id].debugTrace.length) showDebugTrace(tabs[id].debugTrace, id);

    renderTabs();
    setView('workbook');
    applyDescDock();
    applyModeLayout(!!tabs[id].interview);

    Object.keys(editors).forEach(k => hookEditorSelection(k));

    activeThreadView = null;
    replyingToThread = null;
    document.getElementById('chatInputBar').classList.add('hidden');
    if (chatThreads[id] && Object.keys(chatThreads[id]).length > 0) { showChatPanel(); renderChatThreads(); }
    else renderChatThreads();

    // Reveal after layout is applied
    requestAnimationFrame(() => { content.style.visibility = ''; });
}

function setView(mode) {
    document.getElementById('workbookView').classList.toggle('hidden', mode !== 'workbook');
    document.getElementById('referenceView').classList.toggle('hidden', mode !== 'reference');
    document.getElementById('btn-workbook').classList.toggle('view-mode-active', mode === 'workbook');
    document.getElementById('btn-reference').classList.toggle('view-mode-active', mode === 'reference');
}

function isTabCurrentMode(t) {
    const iv = !!t.interview;
    return interviewState && !interviewState.ended ? iv : !iv;
}

function renderTabs() {
    const h = document.getElementById('tabsHeader'); h.innerHTML = '';
    Object.values(tabs).filter(t => openTabs.has(t.id) && isTabCurrentMode(t)).forEach(t => {
        const d = document.createElement('div');
        d.className = `px-6 flex items-center h-full text-[10px] font-black uppercase tracking-tighter cursor-pointer file-tab ${activeTabId === t.id ? 'active-file-tab' : 'text-slate-500 hover:bg-slate-800'}`;
        d.innerHTML = `<span>${t.title}</span> <span onclick="event.stopPropagation(); closeTab('${t.id}')" class="ml-4 opacity-30 hover:opacity-100" title="Hide tab">×</span>`;
        d.onclick = () => selectTab(t.id);
        h.appendChild(d);
    });
}

function closeTab(id) {
    openTabs.delete(id);
    if (activeTabId === id) {
        const remaining = [...openTabs].filter(oid => tabs[oid] && isTabCurrentMode(tabs[oid]));
        if (remaining.length) {
            selectTab(remaining[0]);
        } else if (interviewState && !interviewState.ended) {
            // All interview tabs closed — prompt to exit interview mode
            exitInterviewMode();
        } else {
            activeTabId = null;
            document.getElementById('activeContent').classList.add('hidden');
            document.getElementById('emptyState').classList.remove('hidden');
        }
    }
    renderTabs();
    triggerSave();
}

function toggleModal(s) { document.getElementById('initModal').classList.toggle('hidden', !s); }
