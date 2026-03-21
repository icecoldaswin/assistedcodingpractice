// --- Interview Mode ---
// Reuses existing tab infrastructure: sidebar, Monaco editor, chat panel, //generate

const COMPANIES = [
    { name: 'Google', format: '45 min, 1 coding problem, discuss approach first', style: 'Expects clean code, optimal complexity, good communication' },
    { name: 'Amazon', format: '45 min, 1-2 problems, leadership principles woven in', style: 'Focuses on scalability, trade-offs, and behavioral signals' },
    { name: 'Meta', format: '40 min, 1-2 problems, move fast', style: 'Values speed, clean bug-free code, optimal solutions' },
    { name: 'Apple', format: '45 min, 1 problem with deep follow-ups', style: 'Emphasis on system design thinking even in coding rounds' },
    { name: 'Microsoft', format: '45 min, 1-2 problems, whiteboard style', style: 'Tests fundamentals, edge cases, and code correctness' },
    { name: 'Netflix', format: '45 min, 1 problem, senior-level depth', style: 'Expects production-quality code and architectural awareness' },
    { name: 'Stripe', format: '60 min, practical coding, API design', style: 'Real-world problems, clean interfaces, error handling' },
    { name: 'Other', format: '45 min, standard coding interview', style: 'General technical interview format' }
];

function toggleInterviewMode() {
    if (interviewState) {
        if (confirm('End current interview?')) {
            const ivTabId = interviewState.tabId;
            endInterview().then(() => {
                refreshSidebar();
                const practiceTab = Object.values(tabs).find(t => !t.interview);
                if (practiceTab) {
                    openTabs.add(practiceTab.id);
                    selectTab(practiceTab.id);
                } else {
                    activeTabId = null;
                    document.getElementById('activeContent').classList.add('hidden');
                    const es = document.getElementById('emptyState');
                    es.innerHTML = '<p class="font-black text-xs uppercase tracking-[0.5em] shrink-0">No Active Workspace</p><div id="helpContent" class="mt-8 overflow-y-auto custom-scroll px-4 text-slate-800" style="max-width:520px;font-size:12px;font-weight:700;line-height:1.7"></div>';
                    es.classList.remove('hidden');
                    renderHelp();
                    renderTabs();
                }
            });
        }
        return;
    }
    showCompanyPicker();
}

function showModeSelector() {
    const overlay = document.getElementById('modeSelector');
    if (overlay) overlay.classList.remove('hidden');
}

function hideModeSelector() {
    const overlay = document.getElementById('modeSelector');
    if (overlay) overlay.classList.add('hidden');
}

function selectMode(mode) {
    appMode = mode;
    localStorage.setItem('appMode', mode);
    hideModeSelector();
    if (mode === 'interview') showCompanyPicker();
}

function showCompanyPicker() {
    const overlay = document.getElementById('companyPicker');
    if (!overlay) return;
    let html = '';
    COMPANIES.forEach((c, i) => {
        html += `<div onclick="startInterview(${i})" class="company-card group cursor-pointer border border-slate-800 rounded-xl p-5 hover:border-blue-500 transition">
            <div class="text-sm font-black text-white mb-1">${c.name}</div>
            <div class="text-[10px] text-slate-500 font-bold">${c.format}</div>
            <div class="text-[9px] text-slate-600 mt-1 italic">${c.style}</div>
        </div>`;
    });
    document.getElementById('companyGrid').innerHTML = html;
    overlay.classList.remove('hidden');
}

function hideCompanyPicker() {
    const overlay = document.getElementById('companyPicker');
    if (overlay) overlay.classList.add('hidden');
}

function updateModeButton() {
    const btn = document.getElementById('btn-mode');
    if (!btn) return;
    if (interviewState && !interviewState.ended) {
        btn.innerText = '\ud83d\udcda';
        btn.title = 'End Interview · Switch to Practice';
        btn.classList.add('text-red-400');
        btn.classList.remove('text-slate-500');
    } else {
        btn.innerText = '\ud83c\udfe2';
        btn.title = 'Switch to Interview Mode';
        btn.classList.remove('text-red-400');
        btn.classList.add('text-slate-500');
    }
}

async function startInterview(companyIdx) {
    hideCompanyPicker();
    const company = COMPANIES[companyIdx];
    if (!getGeminiKey()) { alert('Set your Gemini API key first.'); return; }

    // Check speech recognition support
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert('Interview mode requires speech recognition. Use Chrome or Edge.');
        showModeSelector();
        return;
    }

    // Show blank screen while waiting for mic permission
    showMicGate();
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
        hideMicGate();
        showModeSelector();
        return;
    }
    hideMicGate();

    // Enable voice
    if (!ttsEnabled) toggleTTS();
    if (!micActive) toggleMic();

    const defaultLang = serverAvailable ? 'python' : 'javascript';

    interviewState = {
        company: company.name,
        format: company.format,
        style: company.style,
        startTime: Date.now(),
        duration: (company.format.match(/(\d+)\s*min/) || [,45])[1] * 60 * 1000,
        ended: false,
        review: null
    };

    updateModeButton();
    refreshSidebar();

    // Show loading screen while AI prepares the problem
    document.getElementById('activeContent').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('emptyState').innerHTML = '<div class="text-slate-500 text-xs font-black uppercase tracking-widest animate-pulse">Interviewer preparing your problem...</div>';

    // Ask AI for a problem
    termSpinner('Interviewer preparing problem...');
    try {
        const prompt = `You are a coding interviewer at ${company.name}. Format: ${company.format}. Style: ${company.style}.

Generate a coding interview problem. Return a JSON object with exactly these fields:
- "title": short problem title (e.g. "Two Sum")
- "statement": the full problem description in HTML with examples and constraints
- "greeting": a 1-2 sentence conversational intro as the interviewer presenting this problem (this will be spoken aloud)

Return ONLY valid JSON, no markdown fences.`;

        const raw = await geminiCall(prompt);
        const cleaned = raw.replace(/```\w*/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleaned);

        // Create a regular tab with interview flag
        const id = 'interview-' + Date.now();
        tabs[id] = {
            id, title: '🎤 ' + data.title,
            statement: data.statement,
            lang: defaultLang,
            steps: { s1: '', s2: '', s3: '', s4: '', code: '', tests: '' },
            aiAnalysis: '',
            interview: true
        };
        interviewState.tabId = id;

        addSidebarItem(id, tabs[id].title);
        openTabs.add(id);
        selectTab(id);
        stateLoaded = true;
        triggerSave();

        // Open chat panel and post interviewer greeting
        showChatPanel();
        const hash = genHash();
        const threads = getTabThreads();
        threads[hash] = {
            hash, question: 'Interview started',
            selection: '', source: 'interviewer',
            messages: [{ question: 'Interview started', answer: data.greeting }],
            expanded: false
        };
        renderChatThreads();
        voiceSpeak(data.greeting);

        // Start timer
        startInterviewTimer();
        termDone('>>> Interview started. Talk through your approach first.');

    } catch (e) {
        document.getElementById('emptyState').innerHTML = '<p class="font-black text-xs uppercase tracking-[0.5em] shrink-0">No Active Workspace</p><div id="helpContent" class="mt-8 overflow-y-auto custom-scroll px-4 text-slate-800" style="max-width:520px;font-size:12px;font-weight:700;line-height:1.7"></div>';
        renderHelp();
        termDone('>>> Failed to start interview: ' + e.message, '#f87171');
        interviewState = null;
        updateModeButton();
        refreshSidebar();
    }
}

function startInterviewTimer() {
    const update = () => {
        if (!interviewState || interviewState.ended) return;
        const elapsed = Date.now() - interviewState.startTime;
        const remaining = Math.max(0, interviewState.duration - elapsed);
        // Subtle warning in last 5 min via status bar
        if (remaining <= 5 * 60 * 1000 && remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            setStatus(`⏱ ${mins}:${secs.toString().padStart(2, '0')} remaining`);
            if (remaining <= 5 * 60 * 1000 && remaining > 5 * 60 * 1000 - 1500) {
                aiInterviewerTurn('time_warning');
            }
        } else if (remaining <= 0) {
            endInterview();
            return;
        }
        setTimeout(update, 1000);
    };
    setTimeout(update, 1000);
}

function getInterviewConversation() {
    if (!interviewState?.tabId) return '';
    const threads = chatThreads[interviewState.tabId] || {};
    let conv = '';
    Object.values(threads).forEach(t => {
        t.messages.forEach(m => {
            conv += `Q: ${m.question}\nA: ${m.answer}\n`;
        });
    });
    return conv;
}

async function aiInterviewerTurn(phase) {
    if (!interviewState || interviewState.ended) return;
    const tabId = interviewState.tabId;
    const conv = getInterviewConversation();
    const code = editors[`${tabId}_code`]?.getValue() || '';
    const codeCtx = code.trim() ? `\nCandidate's current code:\n${code.slice(0, 1500)}` : '';
    const elapsed = Math.floor((Date.now() - interviewState.startTime) / 60000);

    let prompt;
    if (phase === 'time_warning') {
        prompt = `You are a coding interviewer at ${interviewState.company}. About 5 minutes remaining.

Conversation so far:\n${conv}\n${codeCtx}

Give a subtle time nudge. 1-2 sentences.`;
    } else {
        prompt = `You are a coding interviewer at ${interviewState.company}. ${elapsed} minutes elapsed.

Conversation so far:\n${conv}\n${codeCtx}

Respond naturally as an interviewer. If the candidate:
- Is explaining approach: ask clarifying questions, probe edge cases
- Has suboptimal approach: hint at better solutions
- Is stuck: give a small hint
- Asks a clarifying question: answer it

Keep to 1-3 sentences. Be conversational.`;
    }

    try {
        const text = await geminiCall(prompt);
        // Post as a chat thread
        const hash = genHash();
        const threads = getTabThreads();
        threads[hash] = {
            hash, question: phase === 'time_warning' ? '⏱ Time check' : 'Interviewer',
            selection: '', source: 'interviewer',
            messages: [{ question: phase === 'time_warning' ? '⏱ Time check' : 'Interviewer', answer: text }],
            expanded: false
        };
        renderChatThreads();
        voiceSpeak(text);
        triggerSave();
    } catch (e) {
        // silent fail
    }
}

async function endInterview() {
    if (!interviewState || interviewState.ended) return;
    interviewState.ended = true;
    updateModeButton();

    if (micActive) stopMic();
    speechSynthesis.cancel();

    const tabId = interviewState.tabId;
    const conv = getInterviewConversation();
    const code = editors[`${tabId}_code`]?.getValue() || '';

    termSpinner('Generating interview review...');
    try {
        const prompt = `You just conducted a ${interviewState.company} coding interview. Generate a detailed scorecard.

Conversation:\n${conv}

Candidate's final code:\n${code || '(no code written)'}

Score each category 1-5 and give specific feedback:
1. **Communication** — Did they explain their thinking? Ask good questions?
2. **Problem Solving** — Did they identify the right approach? Consider alternatives?
3. **Code Quality** — Is the code clean, correct, well-structured?
4. **Edge Cases** — Did they consider and handle edge cases?
5. **Efficiency** — Is the solution optimal in time/space complexity?

End with:
- Overall verdict: Strong Hire / Hire / Lean Hire / Lean No Hire / No Hire
- A single line: NEEDS_PRACTICE=true if the candidate had bugs, wrong solution, or suboptimal approach. NEEDS_PRACTICE=false if they nailed it.

Be honest and specific.`;

        const review = await geminiCall(prompt);
        interviewState.review = review;

        // Determine if practice is needed
        const needsPractice = /NEEDS_PRACTICE\s*=\s*true/i.test(review);
        const cleanReview = review.replace(/NEEDS_PRACTICE\s*=\s*(true|false)/gi, '').trim();

        // Post review as chat thread
        const hash = genHash();
        const threads = getTabThreads();
        threads[hash] = {
            hash, question: '📋 Interview Review',
            selection: '', source: 'interviewer',
            messages: [{ question: '📋 Interview Review', answer: cleanReview }],
            expanded: false
        };
        showChatPanel();
        openThread(hash);
        voiceSpeak(cleanReview);
        triggerSave();
        termDone('>>> Interview complete. Review posted to chat.');

        // Show practice button if needed
        if (needsPractice) {
            const practiceHash = genHash();
            threads[practiceHash] = {
                hash: practiceHash,
                question: '📝 Want to practice this problem?',
                selection: '', source: 'interviewer',
                messages: [{
                    question: '📝 Want to practice this problem?',
                    answer: `You had some areas to improve on. Click below to open this problem in practice mode with the full workbook workflow.\n\n<button onclick="convertToPractice('${tabId}')" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-black text-[10px] uppercase hover:bg-blue-500 transition mt-2">Open in Practice Mode</button>`
                }],
                expanded: false
            };
            renderChatThreads();
            openThread(practiceHash);
        }
    } catch (e) {
        termDone('>>> Review failed: ' + e.message, '#f87171');
    }
    interviewState = null;
}

function convertToPractice(interviewTabId) {
    const src = tabs[interviewTabId];
    if (!src) return;
    const id = 'tab-' + Date.now();
    const lang = src.lang || (serverAvailable ? 'python' : 'javascript');
    tabs[id] = {
        id, title: src.title.replace(/^🎤\s*/, ''),
        statement: src.statement, lang,
        steps: { s1: '', s2: '', s3: '', s4: '', code: src.steps?.code || '', tests: '' },
        aiAnalysis: ''
    };
    refreshSidebar();
    openTabs.add(id);
    selectTab(id);
    triggerSave();
}

// Override sendAdHocChat behavior during interviews — route to interviewer
const _origSendAdHocChat = typeof sendAdHocChat === 'function' ? sendAdHocChat : null;

function patchInterviewChat() {
    if (!_origSendAdHocChat) return;
    const origCallChat = callChat;
    // Monkey-patch callChat to use interviewer persona when in interview
    window._baseCallChat = origCallChat;
}

// Hook: when user sends ad-hoc chat during interview, treat as talking to interviewer
function isInterviewTab() {
    return interviewState && !interviewState.ended && activeTabId === interviewState.tabId;
}

function showMicGate() {
    let el = document.getElementById('micGate');
    if (!el) {
        el = document.createElement('div');
        el.id = 'micGate';
        el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#020617;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px';
        el.innerHTML = '<div class="text-slate-500 text-xs font-black uppercase tracking-widest animate-pulse">🎤 Allow microphone access to continue</div>';
        document.body.appendChild(el);
    }
    el.style.display = 'flex';
}

function hideMicGate() {
    const el = document.getElementById('micGate');
    if (el) el.style.display = 'none';
}
