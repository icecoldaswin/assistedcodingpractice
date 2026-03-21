async function askGemini() {
    const tabId = activeTabId;
    const key = `analysis_${tabId}`;
    if (!genMgr.acquire(key)) return;
    const body = document.getElementById('aiAnalysisBody');
    body.innerHTML = "<p class='animate-pulse text-blue-400 font-bold'>ANALYZING PATTERNS...</p>";
    termSpinner('Analyzing patterns...', tabId);
    try {
        const text = await geminiCall(`Explain optimal approach:\n${tabs[tabId].statement}`);
        tabs[tabId].aiAnalysis = text;
        if (activeTabId === tabId) body.innerHTML = marked.parse(text);
        voiceSpeak(text);
        triggerSave();
        termDone('>>> Analysis complete.', '#10b981', tabId);
    } catch(e) { if (activeTabId === tabId) body.innerHTML = `<span class="text-red-400">${e.message}</span>`; termDone('>>> Analysis failed: ' + e.message, '#f87171', tabId); }
    finally { genMgr.release(); }
}

async function validateStep(stepKey, btn) {
    const tabId = activeTabId;
    const content = editors[`${tabId}_${stepKey}`]?.getValue() || '';
    const key = `validate_${tabId}_${stepKey}_${content.length}`;
    if (!genMgr.acquire(key)) return;
    const originalText = btn.innerText;
    btn.innerText = "VALIDATING...";
    btn.classList.add('animate-pulse');
    const feedbackDiv = document.getElementById(`feedback-${stepKey}`);
    if (feedbackDiv) feedbackDiv.classList.add('hidden');
    termSpinner(`Validating step ${stepKey}...`, tabId);
    try {
        const text = await geminiCall(`Problem: ${tabs[tabId].statement}\nStep: ${stepKey}\nInput: ${content}\n\nGive short feedback (<60 words)`);
        if (activeTabId === tabId) { feedbackDiv.innerHTML = marked.parse(text); feedbackDiv.classList.remove('hidden'); }
        voiceSpeak(text);
        termDone(`>>> Step ${stepKey} validated.`, '#10b981', tabId);
    } catch (e) {
        if (activeTabId === tabId && feedbackDiv) { feedbackDiv.innerHTML = `<span class="text-red-400">${e.message}</span>`; feedbackDiv.classList.remove('hidden'); }
        termDone('>>> Validation failed: ' + e.message, '#f87171', tabId);
        genMgr.clearSection(key);
    } finally {
        btn.innerText = originalText;
        btn.classList.remove('animate-pulse');
        genMgr.release();
    }
}

function changeLang(lang) {
    if (!activeTabId) return;
    tabs[activeTabId].lang = lang;
    const ed = editors[`${activeTabId}_code`];
    if (ed) monaco.editor.setModelLanguage(ed.getModel(), lang);
    const edT = editors[`${activeTabId}_tests`];
    if (edT) monaco.editor.setModelLanguage(edT.getModel(), lang);
    triggerSave();
    generateBoilerplate(lang).then(() => generateTests(true));
}

async function generateBoilerplate(lang) {
    const tabId = activeTabId;
    const key = `boilerplate_${tabId}_${lang}`;
    if (!genMgr.acquire(key)) return;
    termSpinner(`Generating ${lang} boilerplate...`, tabId);
    try {
        const javaHint = lang === 'java' ? ' For Java: use public class Main with public static void main.' : '';
        const prompt = `Generate ONLY ${lang} boilerplate (no solution) for:\n${tabs[tabId].statement}\n\nUse function name: solve. Include main/entry point.${javaHint} ONLY code, NO markdown fences.`;
        const raw = await geminiCall(prompt);
        const code = raw.replace(/```\w*/g, '').replace(/```/g, '').trim();
        const ed = editors[`${tabId}_code`];
        if (ed) { monaco.editor.setModelLanguage(ed.getModel(), lang); ed.setValue(code); }
        termDone('>>> Boilerplate generated.', '#10b981', tabId);
    } catch (e) {
        termDone('>>> ERROR: ' + e.message, '#f87171', tabId);
        genMgr.clearSection(key);
    } finally { genMgr.release(); }
}

function getGenTestBtns() { return document.querySelectorAll('[data-gentests]'); }

function cancelTestGen() {
    clearInterval(testGenTimer); testGenTimer = null;
    getGenTestBtns().forEach(b => { b.innerHTML = 'Gen Tests'; });
}

async function generateTests(silent) {
    cancelTestGen();
    const tabId = activeTabId;
    const code = editors[`${tabId}_code`]?.getValue() || '';
    const key = `tests_${tabId}`;
    if (!genMgr.acquire(key)) return;
    const btns = getGenTestBtns();
    btns.forEach(b => { b.innerHTML = 'Generating...'; b.classList.add('animate-pulse'); });
    if (!silent) termSpinner('Generating tests...', tabId);
    else setStatus('Generating tests...');
    try {
        const lang = tabs[tabId].lang || 'python';
        const prompt = `Generate unit tests for this ${lang} code. Problem: ${tabs[tabId].statement}\nCode:\n${code}\n\nUse console.table to print a table of pass/fail results. Return ONLY code, NO markdown fences.`;
        const raw = await geminiCall(prompt);
        const script = raw.replace(/```\w*/g, '').replace(/```/g, '').trim();
        const ed = editors[`${tabId}_tests`];
        if (ed) ed.setValue(script);
        tabs[tabId].steps.tests = script;
        triggerSave();
        if (!silent) termDone('>>> Tests generated.', '#10b981', tabId);
        else setStatus('Tests generated');
    } catch(e) { if (!silent) termDone('>>> ERROR: ' + e.message, '#f87171', tabId); genMgr.clearSection(key); }
    finally { btns.forEach(b => { b.innerHTML = 'Gen Tests'; b.classList.remove('animate-pulse'); }); genMgr.release(); }
}
