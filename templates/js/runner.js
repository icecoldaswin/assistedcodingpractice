function staticCodeCheck(code) {
    const patterns = [/\bimport\s+os\b/, /\bsubprocess\b/, /\beval\s*\(/, /\bexec\s*\(/, /\b__import__\b/, /\bwhile\s*\(\s*true\s*\)/i, /\bProcess\b/, /\brequire\s*\(['"]child_process/];
    for (const p of patterns) { if (p.test(code)) return { safe: false, reason: `Blocked pattern: ${p}` }; }
    return { safe: true };
}

async function sanityCheck(code, lang) {
    const hash = await md5(code);
    if (safeCodeHashes[hash]) return { safe: true };
    const sc = staticCodeCheck(code);
    if (!sc.safe) return sc;
    if (serverAvailable && lang !== 'javascript') {
        try {
            const res = await fetch('/sanity_check', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code}) });
            const d = await res.json();
            if (!d.safe) return d;
        } catch {}
    }
    safeCodeHashes[hash] = true;
    return { safe: true };
}

function runJsInSandbox(code) {
    return new Promise(resolve => {
        const iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-scripts';
        iframe.style.display = 'none';
        const logs = [];
        let tableData = null;
        const handler = e => {
            if (e.source !== iframe.contentWindow) return;
            if (e.data === '__DONE__') { cleanup(); resolve({ output: logs.join('\n'), success: true, tableData }); }
            else if (e.data && e.data.__type === 'table') { tableData = e.data.data; }
            else logs.push(e.data);
        };
        window.addEventListener('message', handler);
        const wrapped = `<script>
            const _log = console.log.bind(console), _err = console.error.bind(console), _warn = console.warn.bind(console), _info = console.info.bind(console), _table = console.table.bind(console);
            const _send = (...a) => parent.postMessage(a.map(v => typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)).join(' '), '*');
            console.log = (...a) => { _log(...a); _send(...a); };
            console.error = (...a) => { _err(...a); _send(...a); };
            console.warn = (...a) => { _warn(...a); _send(...a); };
            console.info = (...a) => { _info(...a); _send(...a); };
            console.table = (data, cols) => { _table(data, cols); parent.postMessage({__type:'table', data: JSON.parse(JSON.stringify(data))}, '*'); };
            try { ${code}\n } catch(e) { console.log('ERROR: ' + e.message); }
            parent.postMessage('__DONE__', '*');
        <\/script>`;
        iframe.srcdoc = wrapped;
        document.body.appendChild(iframe);
        const cleanup = () => { clearTimeout(timeout); window.removeEventListener('message', handler); iframe.remove(); };
        const timeout = setTimeout(() => { cleanup(); resolve({ output: logs.join('\n') + '\n[TIMEOUT]', success: false, tableData }); }, 10000);
    });
}

async function runCode() {
    const tabId = activeTabId;
    const selectedLang = document.getElementById('langSelect').value;
    const fullScript = editors[`${tabId}_code`].getValue();

    if (selectedLang !== 'javascript') {
        termSpinner('Sanity check...', tabId);
        const check = await sanityCheck(fullScript, selectedLang);
        if (!check.safe) { termDone(`[BLOCKED] ${check.reason}`, '#f87171', tabId); return; }
    }

    termSpinner('Running...', tabId);
    let runSuccess = false;
    if (selectedLang === 'javascript') {
        const r = await runJsInSandbox(fullScript);
        runSuccess = r.success;
        termDone(r.output || '(no output)', r.success ? '#10b981' : '#f87171', tabId);
        renderTermTable(r.tableData, tabId);
    } else if (serverAvailable) {
        try {
            const langMap = { python:'Python', java:'Java' };
            const res = await fetch('/run_code', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:fullScript, language:langMap[selectedLang]}) });
            const d = await res.json();
            runSuccess = d.success;
            termDone(d.output, d.success ? '#10b981' : '#f87171', tabId);
        } catch(e) { termDone('ERROR: ' + e.message, '#f87171', tabId); }
    } else { termDone(`[ERROR] ${selectedLang} requires server.`, '#f87171', tabId); }
    if (runSuccess && activeTabId === tabId) setStatus('Run complete');
}

async function runTests() {
    const tabId = activeTabId;
    const selectedLang = document.getElementById('langSelect').value;
    const codeVal = editors[`${tabId}_code`]?.getValue() || '';
    const testVal = editors[`${tabId}_tests`]?.getValue() || '';
    if (!testVal.trim()) { termDone('No tests to run. Generate tests first.', '#facc15', tabId); return; }
    const fullScript = codeVal + '\n\n' + testVal;

    if (selectedLang !== 'javascript') {
        termSpinner('Sanity check...', tabId);
        const check = await sanityCheck(fullScript, selectedLang);
        if (!check.safe) { termDone(`[BLOCKED] ${check.reason}`, '#f87171', tabId); return; }
    }

    termSpinner('Running code + tests...', tabId);
    hideTermTable();
    if (selectedLang === 'javascript') {
        const r = await runJsInSandbox(fullScript);
        termDone(r.output || '(no output)', r.success ? '#10b981' : '#f87171', tabId);
        renderTermTable(r.tableData, tabId);
    } else if (serverAvailable) {
        try {
            const langMap = { python:'Python', java:'Java' };
            const res = await fetch('/run_code', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:fullScript, language:langMap[selectedLang]}) });
            const d = await res.json();
            termDone(d.output, d.success ? '#10b981' : '#f87171', tabId);
        } catch(e) { termDone('ERROR: ' + e.message, '#f87171', tabId); }
    } else { termDone(`[ERROR] ${selectedLang} requires server.`, '#f87171', tabId); }
}
