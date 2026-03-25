function getTabThreads() {
    if (!activeTabId) return {};
    if (!chatThreads[activeTabId]) chatThreads[activeTabId] = {};
    return chatThreads[activeTabId];
}

function showCtxPopup(x, y, selectedText, source, editorKey) {
    ctxSelection = selectedText;
    ctxSource = source;
    ctxSourceEditorKey = editorKey || null;
    const popup = document.getElementById('ctxPopup');
    const inp = document.getElementById('ctxInput');
    popup.style.left = Math.min(x, window.innerWidth - 340) + 'px';
    popup.style.top = Math.min(y + 10, window.innerHeight - 50) + 'px';
    popup.style.display = 'block';
    inp.value = '';
    setTimeout(() => inp.focus(), 50);
}

function clickNearestValidate() {
    if (!activeTabId) return;
    const codeKey = `${activeTabId}_code`;
    if (lastFocusedEditorKey === codeKey || editors[codeKey]?.hasTextFocus()) { handleCodeEditorAction(); return; }
    const stepKey = lastFocusedEditorKey?.split('_').pop();
    if (stepKey && /^s[1-4]$/.test(stepKey)) {
        const editorDom = document.getElementById('editor-' + stepKey);
        if (editorDom) { const btn = editorDom.parentElement.querySelector('[data-genaction]'); if (btn) { btn.click(); return; } }
    }
}

function handleCodeEditorAction() {
    const tabId = activeTabId;
    const ed = editors[`${tabId}_code`];
    if (!ed) return;
    const code = ed.getValue();
    const genMatch = code.match(/^([ \t]*)\/\/\s*generate\s+(.+)$/m);
    if (genMatch) generateHelperFunction(tabId, ed, code, genMatch);
    else sendCodeForReview(tabId, code);
}

async function generateHelperFunction(tabId, ed, code, genMatch) {
    const fullMatch = genMatch[0], indent = genMatch[1], instruction = genMatch[2].trim();
    const lines = code.split('\n');
    let commentIdx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].includes(fullMatch.trim())) { commentIdx = i; break; } }
    if (commentIdx === -1) return;
    let stubEnd = commentIdx + 1;
    const lang = tabs[tabId].lang || 'javascript';
    for (let i = commentIdx + 1; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === '') break;
        stubEnd = i;
        if (trimmed === '}' || (lang === 'python' && i > commentIdx + 1 && !lines[i].startsWith(' ') && !lines[i].startsWith('\t'))) break;
    }
    const stubLines = lines.slice(commentIdx, stubEnd + 1).join('\n');
    termSpinner(`Generating ${instruction}...`, tabId);
    try {
        const prompt = `Implement this ${lang} helper function. Context: solving "${(tabs[tabId]?.statement || '').slice(0, 300)}"\n\nStub:\n${stubLines}\n\nReturn ONLY the complete function implementation. NO markdown fences. NO explanation. Match the indent style: "${indent || 'none'}".`;
        const raw = await geminiCall(prompt);
        const impl = raw.replace(/```\w*/g, '').replace(/```/g, '').trim();
        const before = lines.slice(0, commentIdx), after = lines.slice(stubEnd + 1);
        const newCode = [...before, `${indent}// generated: ${instruction}`, impl, ...after].join('\n');
        if (activeTabId === tabId && editors[`${tabId}_code`]) ed.setValue(newCode);
        termDone(`>>> Generated: ${instruction}`, '#10b981', tabId);
    } catch (e) { termDone(`>>> Generation failed: ${e.message}`, '#f87171', tabId); }
}

function sendCodeForReview(tabId, code) {
    const question = 'Review my code progress — any issues or suggestions?';
    const hash = genHash();
    const threads = getTabThreads();
    threads[hash] = { hash, question, selection: code.slice(0, 500), source: 'code', messages: [], expanded: false };
    showChatPanel();
    activeThreadView = null; replyingToThread = null;
    renderChatThreads();
    callChat(question, code.slice(0, 1200), 'code', '', tabId).then(answer => {
        threads[hash].messages.push({ question, answer });
        if (activeTabId === tabId) renderChatThreads();
        triggerSave();
    });
}

function hideCtxPopup() {
    document.getElementById('ctxPopup').style.display = 'none';
    document.getElementById('atMentionPopup').style.display = 'none';
    if (ctxSourceEditorKey && editors[ctxSourceEditorKey]) editors[ctxSourceEditorKey].focus();
    ctxSourceEditorKey = null;
}

function scheduleCtxPopup(x, y, text, source, editorKey) {
    clearTimeout(ctxDelayTimer);
    ctxDelayTimer = setTimeout(() => {
        if (editorKey && editors[editorKey]) {
            const ed = editors[editorKey];
            const cur = ed.getModel().getValueInRange(ed.getSelection()).trim();
            if (cur.length > 2) showCtxPopup(x, y, cur, source, editorKey);
        } else {
            const cur = window.getSelection().toString().trim();
            if (cur.length > 2) showCtxPopup(x, y, cur, source);
        }
    }, 1500);
}

function hookEditorSelection(editorKey) {
    const ed = editors[editorKey];
    if (!ed) return;
    ed.onDidChangeCursorSelection(e => {
        clearTimeout(ctxDelayTimer);
        const sel = ed.getModel().getValueInRange(e.selection).trim();
        if (sel.length > 2) {
            const pos = ed.getScrolledVisiblePosition(e.selection.getStartPosition());
            const domNode = ed.getDomNode();
            if (pos && domNode) {
                const rect = domNode.getBoundingClientRect();
                scheduleCtxPopup(rect.left + pos.left, rect.top + pos.top + pos.height, sel, editorKey.split('_').pop(), editorKey);
            }
        }
    });
}

function resolveRefHashes(text) {
    const refs = [];
    const pattern = /@([a-z0-9]{5})/g;
    let m;
    while ((m = pattern.exec(text)) !== null) { refs.push(m[1]); text = text.replace(m[0], '').trim(); }
    return { cleanText: text, refs };
}

function buildRefContext(refs) {
    const threads = getTabThreads();
    let ctx = '';
    refs.forEach(h => {
        const t = threads[h];
        if (t) {
            ctx += `\n[Referenced thread ${h}]\nQ: ${t.question}\nA: ${t.messages[0]?.answer || ''}\n`;
            t.messages.slice(1).forEach(r => { ctx += `Follow-up Q: ${r.question}\nA: ${r.answer}\n`; });
        }
    });
    return ctx;
}

async function submitCtxQuestion() {
    const tabId = activeTabId;
    const inp = document.getElementById('ctxInput');
    const raw = inp.value.trim();
    if (!raw) return;
    hideCtxPopup();
    const { cleanText, refs } = resolveRefHashes(raw);
    const hash = genHash();
    const threads = getTabThreads();
    threads[hash] = { hash, question: cleanText, selection: ctxSelection, source: ctxSource, messages: [], expanded: false };
    showChatPanel(); activeThreadView = null; replyingToThread = null; renderChatThreads();
    const refCtx = buildRefContext(refs);
    const answer = await callChat(cleanText, ctxSelection, ctxSource, refCtx, tabId);
    threads[hash].messages.push({ question: cleanText, answer });
    if (activeTabId === tabId) renderChatThreads();
    triggerSave();
}

async function sendThreadReply() {
    if (!replyingToThread) return;
    const tabId = activeTabId;
    const inp = document.getElementById('threadReplyInput');
    const raw = inp.value.trim();
    if (!raw) return;
    inp.value = '';
    const { cleanText, refs } = resolveRefHashes(raw);
    const threads = getTabThreads();
    const t = threads[replyingToThread];
    if (!t) return;
    const refCtx = buildRefContext(refs);
    let threadCtx = `Original selection: ${t.selection}\n`;
    t.messages.forEach(m => { threadCtx += `Q: ${m.question}\nA: ${m.answer}\n`; });
    const answer = await callChat(cleanText, threadCtx, t.source, refCtx, tabId);
    t.messages.push({ question: cleanText, answer });
    if (activeTabId === tabId) renderChatThreads();
    triggerSave();
}

async function callChat(question, selection, source, refContext, tabId) {
    try {
        const tid = tabId || activeTabId;
        let prompt;
        if (isInterviewTab && isInterviewTab()) {
            const conv = getInterviewConversation ? getInterviewConversation() : '';
            const code = editors[`${tid}_code`]?.getValue() || '';
            prompt = `You are a coding interviewer at ${interviewState.company}. Respond naturally as an interviewer would.

Conversation so far:\n${conv}\n${code ? 'Candidate code:\n' + code.slice(0, 1000) : ''}
${selection ? 'Context: ' + selection.slice(0, 300) : ''}
Candidate says: ${question}

Keep to 1-3 sentences. Be conversational.`;
        } else {
            prompt = `You are a concise coding tutor. Answer in <100 words.\n\nProblem: ${(tabs[tid]?.statement || '').slice(0,500)}\nSelected text from [${source}]: ${(selection||'').slice(0,500)}\n${refContext ? 'Referenced threads:\n' + refContext : ''}\nQuestion: ${question}`;
        }
        const answer = await geminiCall(prompt);
        voiceSpeak(answer);
        return answer;
    } catch (e) { return 'Error: ' + e.message; }
}

function showChatPanel() { document.getElementById('chatPanel').style.display = 'flex'; }

function toggleChatPanel() {
    const cp = document.getElementById('chatPanel');
    cp.style.display = cp.style.display === 'flex' ? 'none' : 'flex';
    setTimeout(() => Object.values(editors).forEach(ed => { if (ed && ed.layout) ed.layout(); }), 50);
}

async function sendAdHocChat() {
    const tabId = activeTabId;
    const inp = document.getElementById('adHocChatInput');
    const raw = inp.value.trim();
    if (!raw) return;
    inp.value = '';
    const { cleanText, refs } = resolveRefHashes(raw);
    const hash = genHash();
    const threads = getTabThreads();
    threads[hash] = { hash, question: cleanText, selection: '', source: 'general', messages: [], expanded: false };
    activeThreadView = null; replyingToThread = null; renderChatThreads();
    let ctx = '';
    const codeEd = editors[`${tabId}_code`];
    if (codeEd) ctx += `My code:\n${codeEd.getValue().slice(0, 800)}\n`;
    const thr = chatThreads[tabId] || {};
    const thrKeys = Object.keys(thr).slice(-3);
    if (thrKeys.length) { ctx += 'Recent discussion:\n'; thrKeys.forEach(k => { const t = thr[k]; ctx += `Q: ${t.question}\nA: ${(t.messages[0]?.answer || '').slice(0, 200)}\n`; }); }
    const refCtx = buildRefContext(refs);
    const answer = await callChat(cleanText, ctx, 'general', refCtx, tabId);
    threads[hash].messages.push({ question: cleanText, answer });
    if (activeTabId === tabId) renderChatThreads();
    triggerSave();
}

function showAllThreads() {
    activeThreadView = null; replyingToThread = null;
    document.getElementById('chatInputBar').classList.add('hidden');
    document.getElementById('adHocChatBar').classList.remove('hidden');
    renderChatThreads();
}

function openThread(hash) {
    activeThreadView = hash; replyingToThread = hash;
    document.getElementById('chatInputBar').classList.remove('hidden');
    document.getElementById('adHocChatBar').classList.add('hidden');
    renderChatThreads();
    document.getElementById('threadReplyInput').focus();
}

function copyHash(hash) {
    navigator.clipboard.writeText('@' + hash);
    const el = document.getElementById('hash-' + hash);
    if (el) { el.innerText = 'copied!'; setTimeout(() => { el.innerText = hash; }, 1000); }
}

function renderChatThreads() {
    const container = document.getElementById('chatThreads');
    const threads = getTabThreads();
    const keys = Object.keys(threads).reverse();

    if (activeThreadView && threads[activeThreadView]) {
        const t = threads[activeThreadView];
        let html = `<div class="thread-bubble" style="border-color:#334155">`;
        html += `<div class="flex justify-between items-center mb-2"><span class="thread-hash" id="hash-${t.hash}" onclick="copyHash('${t.hash}')">${t.hash}</span><span class="text-[9px] text-slate-600 uppercase">${t.source}</span></div>`;
        if (t.selection) html += `<div class="ctx-citation">${esc(t.selection.length > 120 ? t.selection.slice(0,120) + '...' : t.selection)}</div>`;
        t.messages.forEach((m, i) => {
            if (i === 0) {
                html += `<div class="thread-q">${esc(m.question)}</div>`;
                html += `<div class="thread-a prose prose-invert prose-sm max-w-none">${marked.parse(m.answer)}</div>`;
            } else {
                html += `<div class="thread-reply"><div class="text-blue-400 font-bold text-[10px] mb-1">${esc(m.question)}</div><div class="text-slate-300 prose prose-invert prose-sm max-w-none">${marked.parse(m.answer)}</div></div>`;
            }
        });
        html += `</div>`;
        container.innerHTML = html;
        return;
    }

    if (keys.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-slate-600 text-center mt-8 uppercase tracking-widest">Select text to start a thread</p>';
        return;
    }

    let html = '';
    keys.forEach(hash => {
        const t = threads[hash];
        const firstMsg = t.messages[0];
        const qClip = t.question.length > 50 ? t.question.slice(0, 50) + '...' : t.question;
        html += `<div class="thread-bubble">`;
        html += `<div class="flex justify-between items-center mb-1"><span class="thread-hash" id="hash-${hash}" onclick="event.stopPropagation();copyHash('${hash}')">${hash}</span><span class="text-[9px] text-slate-600 uppercase">${t.source}</span></div>`;
        if (t.selection) html += `<div class="ctx-citation">${esc(t.selection.length > 80 ? t.selection.slice(0,80) + '...' : t.selection)}</div>`;
        html += `<div class="thread-q">${esc(qClip)}</div>`;
        if (firstMsg) html += `<div class="thread-a prose prose-invert prose-sm max-w-none" style="max-height:80px;overflow:hidden">${marked.parse(firstMsg.answer)}</div>`;
        else html += `<div class="text-blue-400 text-[10px] animate-pulse mt-1">Thinking...</div>`;
        if (t.messages.length > 1) html += `<div class="thread-replies-cta" onclick="openThread('${hash}')">${t.messages.length - 1} ${t.messages.length - 1 === 1 ? 'reply' : 'replies'}</div>`;
        else if (firstMsg) html += `<div class="thread-replies-cta" onclick="openThread('${hash}')">Reply</div>`;
        html += `</div>`;
    });
    container.innerHTML = html;
}

// --- @ Mention Popup ---
function showAtMentionPopup(inputEl) {
    const threads = getTabThreads();
    const keys = Object.keys(threads);
    if (keys.length === 0) return;
    const popup = document.getElementById('atMentionPopup');
    const rect = inputEl.getBoundingClientRect();
    popup.style.left = rect.left + 'px';
    popup.style.top = (rect.top - Math.min(keys.length * 36, 180) - 4) + 'px';
    popup.innerHTML = keys.map(h => {
        const t = threads[h];
        const clip = t.question.length > 35 ? t.question.slice(0, 35) + '...' : t.question;
        return `<div class="at-mention-item" onclick="insertMention('${inputEl.id}','${h}')">
            <span class="font-mono text-blue-400">${h}</span>
            <span class="truncate ml-2">${esc(clip)}</span>
        </div>`;
    }).join('');
    popup.style.display = 'block';
}

function insertMention(inputId, hash) {
    const inp = document.getElementById(inputId);
    const v = inp.value;
    const atIdx = v.lastIndexOf('@');
    inp.value = v.slice(0, atIdx) + '@' + hash + ' ';
    document.getElementById('atMentionPopup').style.display = 'none';
    inp.focus();
}

function handleCtxAtMention(el) {
    if (el.value.endsWith('@')) showAtMentionPopup(el);
    else document.getElementById('atMentionPopup').style.display = 'none';
}
function handleReplyAtMention(el) {
    if (el.value.endsWith('@')) showAtMentionPopup(el);
    else document.getElementById('atMentionPopup').style.display = 'none';
}
