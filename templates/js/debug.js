async function debugCode() {
    const tabId = activeTabId;
    if (!tabId) return;
    const code = editors[`${tabId}_code`]?.getValue() || '';
    if (!code.trim()) { termDone('No code to debug.', '#facc15', tabId); return; }
    const lang = tabs[tabId].lang || 'javascript';
    if (lang !== 'javascript') { termDone('[DEBUG] Only JavaScript supported for trace debugging.', '#facc15', tabId); return; }
    const hash = await md5(code);
    if (hash === tabs[tabId].debugHash && tabs[tabId].debugTrace?.length) {
        showDebugTrace(tabs[tabId].debugTrace, tabId);
        termDone(`>>> Debug trace (cached): ${tabs[tabId].debugTrace.length} steps.`, '#10b981', tabId);
        return;
    }
    const codeLines = code.split('\n');
    const lineMap = codeLines.map((l, i) => `${i + 1}: ${l}`).join('\n');
    termSpinner('AI analyzing code for trace instrumentation...', tabId);
    try {
        const prompt = `You are a code debugger. Instrument this JavaScript code by inserting __trace() calls.

__trace takes ONE object: { step, srcLine, narration, bug, vars }
- step: integer starting at 1, incrementing
- srcLine: the ORIGINAL line number (1-based) from the numbered source below
- narration: a SHORT human-readable sentence describing what is happening, e.g. "Initialize result array as empty", "Loop iteration i=2, checking if nums[2]=5 > target=3", "Return the final answer [1,2]". Be SPECIFIC with actual values, not generic descriptions.
- bug: null normally. If you detect a likely bug at this step (off-by-one, wrong comparison, missing edge case, etc.), set bug to a short string explaining the issue, e.g. "Off-by-one: should be i < n, not i <= n"
- vars: an object with ALL variables currently in scope and their CURRENT values. Use JSON.parse(JSON.stringify(v)) for objects/arrays to capture snapshots. NEVER leave vars empty — at minimum include function parameters.

CRITICAL RULES:
- vars must ALWAYS contain every variable in scope with its current value. This is the most important field.
- For arrays/objects in vars, pass them through JSON.parse(JSON.stringify(x)) to snapshot.
- Place __trace AFTER assignments so vars reflect the new value.
- Place __trace at condition checks with the condition result in narration.
- Place __trace inside loops showing iteration values.
- Place __trace before return statements showing the return value.
- Do NOT define __trace — it is pre-defined.
- Return ONLY the instrumented code. NO markdown fences. NO explanation.
- Keep the original logic completely intact.

Numbered source:
${lineMap}

Code:
${code}`;
        const raw = await geminiCall(prompt);
        const instrumented = raw.replace(/```\w*/g, '').replace(/```/g, '').trim();
        termSpinner('Running instrumented code...', tabId);
        const result = await runDebugSandbox(instrumented);
        if (result.traceData && result.traceData.length) {
            tabs[tabId].debugHash = hash;
            tabs[tabId].debugTrace = result.traceData;
            triggerSave();
            showDebugTrace(result.traceData, tabId);
            termDone(result.output || `>>> Debug trace: ${result.traceData.length} steps captured.`, '#10b981', tabId);
        } else {
            termDone(result.output || '(no trace data captured)', '#facc15', tabId);
        }
    } catch (e) { termDone('>>> Debug failed: ' + e.message, '#f87171', tabId); }
}

function runDebugSandbox(code) {
    return new Promise(resolve => {
        const iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-scripts';
        iframe.style.display = 'none';
        const logs = [];
        let traceData = [];
        const handler = e => {
            if (e.source !== iframe.contentWindow) return;
            if (e.data === '__DONE__') { cleanup(); resolve({ output: logs.join('\n'), success: true, traceData }); }
            else if (e.data && e.data.__type === 'trace') { traceData = e.data.data; }
            else if (e.data && e.data.__type === 'table') { /* ignore */ }
            else logs.push(e.data);
        };
        window.addEventListener('message', handler);
        const wrapped = `<script>
            const __traces = [];
            function __trace(obj) {
                const row = {Step: obj.step || __traces.length + 1};
                if (obj.srcLine) row._srcLine = obj.srcLine;
                if (obj.narration) row._narration = obj.narration;
                if (obj.bug) row._bug = obj.bug;
                row.Line = obj.narration ? obj.narration.slice(0,40) : (obj.line || '');
                if (obj.vars) { for (const [k,v] of Object.entries(obj.vars)) row[k] = typeof v === 'object' ? JSON.stringify(v) : String(v); }
                __traces.push(row);
            }
            const _send = (...a) => parent.postMessage(a.map(v => typeof v === 'object' ? JSON.stringify(v,null,2) : String(v)).join(' '), '*');
            console.log = (...a) => _send(...a);
            console.error = (...a) => _send(...a);
            try { ${code}\n } catch(e) { _send('ERROR: ' + e.message); }
            parent.postMessage({__type:'trace', data: __traces}, '*');
            parent.postMessage('__DONE__', '*');
        <\/script>`;
        iframe.srcdoc = wrapped;
        document.body.appendChild(iframe);
        const cleanup = () => { clearTimeout(timeout); window.removeEventListener('message', handler); iframe.remove(); };
        const timeout = setTimeout(() => { cleanup(); resolve({ output: logs.join('\n') + '\n[TIMEOUT]', success: false, traceData }); }, 10000);
    });
}

function showDebugTrace(data, tabId) {
    const panel = document.getElementById('debugTracePanel');
    if (!panel || !data || !data.length) return;
    debugTraceActive = true;
    debugTraceIdx = 0;
    debugPause();
    panel.style.display = 'block';
    panel.style.flex = '1';
    const hiddenKeys = new Set(['_srcLine', '_narration', '_bug']);
    const displayKeys = Object.keys(data[0]).filter(k => !hiddenKeys.has(k));
    const hasNarration = data.some(r => r._narration);
    let html = '<div class="trace-hdr">';
    html += '<span>🐛 Debug Trace</span>';
    html += '<div style="display:flex;gap:4px;align-items:center">';
    html += `<button class="trace-play-btn" onclick="debugPlayTimer?debugPause():debugPlay()" title="Play/Pause (Space)">▶</button>`;
    if (hasNarration) html += `<button class="trace-narr-btn" onclick="toggleNarrationCol()" title="Toggle narration column">📝</button>`;
    html += '<button onclick="closeDebugTrace()" title="Close (Esc)">✕</button>';
    html += '</div></div>';
    html += `<table class="term-tbl" id="debugTbl"><thead><tr>`;
    displayKeys.forEach(k => { html += `<th>${esc(String(k))}</th>`; });
    if (hasNarration) html += '<th class="col-narration">Narration</th>';
    html += '</tr></thead><tbody>';
    data.forEach((r, i) => {
        const srcLine = r._srcLine || '';
        const bug = r._bug || '';
        html += `<tr data-srcline="${srcLine}" data-idx="${i}"${bug ? ' class="trace-bug"' : ''} onclick="debugPause();highlightTraceLine(${srcLine}, this)">`;
        displayKeys.forEach(k => {
            const v = r[k]; const s = String(v ?? '');
            const cls = /^(true)$/i.test(s) ? 'pass' : /^(false)$/i.test(s) ? 'fail' : '';
            html += `<td class="${cls}">${esc(s)}</td>`;
        });
        if (hasNarration) {
            const narr = (bug ? '🐛 BUG: ' + bug + ' — ' : '') + (r._narration || '');
            html += `<td class="col-narration" style="${bug ? 'color:#f87171;font-weight:700' : 'color:#94a3b8'}">${esc(narr)}</td>`;
        }
        html += '</tr>';
    });
    html += '</tbody></table>';
    panel.innerHTML = html;
    const firstRow = panel.querySelector('tr[data-idx="0"]');
    if (firstRow) highlightTraceLine(parseInt(firstRow.dataset.srcline) || 0, firstRow);
    setTimeout(() => { const ed = editors[`${tabId}_code`]; if (ed && ed.layout) ed.layout(); }, 50);
}

function toggleNarrationCol() {
    const tbl = document.getElementById('debugTbl');
    if (!tbl) return;
    debugNarrationVisible = !debugNarrationVisible;
    tbl.classList.toggle('show-narration', debugNarrationVisible);
    const btn = document.querySelector('.trace-narr-btn');
    if (btn) btn.classList.toggle('active', debugNarrationVisible);
}

function stepDebugTrace(dir) {
    const panel = document.getElementById('debugTracePanel');
    if (!panel) return;
    const rows = panel.querySelectorAll('tr[data-idx]');
    if (!rows.length) return;
    debugTraceIdx = Math.max(0, Math.min(rows.length - 1, debugTraceIdx + dir));
    const row = rows[debugTraceIdx];
    highlightTraceLine(parseInt(row.dataset.srcline) || 0, row);
    row.scrollIntoView({ block: 'nearest' });
    speakTraceStep(debugTraceIdx);
}

function speakTraceStep(idx, onDone) {
    if (!ttsEnabled || !activeTabId) { if (onDone) onDone(); return; }
    const trace = tabs[activeTabId]?.debugTrace;
    if (!trace || !trace[idx]) { if (onDone) onDone(); return; }
    const r = trace[idx];
    let text = '';
    if (r._bug) text += 'Bug detected: ' + r._bug + '. ';
    if (r._narration) text += r._narration;
    else if (r.Line) text += r.Line;
    if (text) {
        speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 1.4;
        if (onDone) utt.onend = onDone;
        speechSynthesis.speak(utt);
    } else { if (onDone) onDone(); }
}

function debugPlay() {
    if (!debugTraceActive || !activeTabId) return;
    const trace = tabs[activeTabId]?.debugTrace;
    if (!trace) return;
    const btn = document.querySelector('.trace-play-btn');
    if (btn) btn.innerText = '⏸';
    const advance = () => {
        if (debugTraceIdx >= trace.length - 1) { debugPause(); return; }
        stepDebugTrace(1);
        scheduleNext();
    };
    const scheduleNext = () => {
        if (ttsEnabled) {
            speakTraceStep(debugTraceIdx, () => { debugPlayTimer = setTimeout(advance, 300); });
        } else {
            const r = trace[debugTraceIdx];
            const delay = r?._bug ? 2000 : 800;
            debugPlayTimer = setTimeout(advance, delay);
        }
    };
    scheduleNext();
}

function debugPause() {
    clearTimeout(debugPlayTimer);
    debugPlayTimer = null;
    const btn = document.querySelector('.trace-play-btn');
    if (btn) btn.innerText = '▶';
}

function highlightTraceLine(srcLine, rowEl) {
    const ed = editors[`${activeTabId}_code`];
    if (!ed) return;
    const panel = document.getElementById('debugTracePanel');
    panel.querySelectorAll('tr.trace-active').forEach(r => r.classList.remove('trace-active'));
    if (rowEl) {
        rowEl.classList.add('trace-active');
        debugTraceIdx = parseInt(rowEl.dataset.idx) || 0;
    }
    if (srcLine > 0) {
        const isBug = rowEl?.classList.contains('trace-bug');
        debugDecorations = ed.deltaDecorations(debugDecorations, [
            { range: new monaco.Range(srcLine, 1, srcLine, 1), options: {
                isWholeLine: true,
                className: isBug ? 'debug-bug-highlight' : 'debug-line-highlight',
                glyphMarginClassName: isBug ? 'debug-bug-glyph' : 'debug-line-highlight-glyph'
            }}
        ]);
        ed.revealLineInCenter(srcLine);
    }
}

function closeDebugTrace() {
    debugPause();
    speechSynthesis.cancel();
    const panel = document.getElementById('debugTracePanel');
    if (panel) { panel.style.display = 'none'; panel.style.flex = ''; panel.innerHTML = ''; }
    debugTraceActive = false;
    debugNarrationVisible = false;
    const ed = editors[`${activeTabId}_code`];
    if (ed) debugDecorations = ed.deltaDecorations(debugDecorations, []);
    setTimeout(() => { if (ed && ed.layout) ed.layout(); }, 50);
}
