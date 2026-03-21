function doSearch(q) {
    const resDiv = document.getElementById('lcResults');
    if (q.length < 2) return resDiv.classList.add('hidden');
    const matches = allProblems.filter(p => p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
    resDiv.innerHTML = matches.map(p => `
        <div onclick="selectProblem('${p.title.replace(/'/g, "\\'")}', '${p.titleSlug}')" class="p-4 border-b border-slate-700 cursor-pointer text-sm font-bold flex justify-between hover:bg-blue-600 hover:text-white transition">
            <span>${p.title}</span>
            <span class="opacity-30 text-[10px] font-mono">${p.titleSlug}</span>
        </div>`).join('');
    resDiv.classList.remove('hidden');
}

function selectProblem(t, s) {
    document.getElementById('lcSearch').value = t;
    lcMap[t] = s;
    document.getElementById('lcResults').classList.add('hidden');
}

async function initSession() {
    const btn = document.getElementById('modalBtn');
    const searchVal = document.getElementById('lcSearch').value.trim();
    const customVal = document.getElementById('customStatement').value.trim();

    let title = "Manual Session";
    let statement = "Manual problem description...";

    if (customVal) {
        title = searchVal ? searchVal : "Custom Problem";
        statement = customVal;
    } else if (searchVal && lcMap[searchVal]) {
        title = searchVal;
        const slug = lcMap[title];
        btn.innerText = "FETCHING...";
        if (serverAvailable) {
            try {
                const res = await fetch('/get_problem_details', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({slug}) });
                const d = await res.json();
                statement = d.content;
            } catch {}
        }
        if (statement === 'Manual problem description...' && getGeminiKey()) {
            try {
                const raw = await geminiCall(`Give the full problem statement for LeetCode problem "${title}" (slug: ${slug}). Include examples and constraints. Use HTML formatting.`);
                statement = raw;
            } catch {}
        }
    } else if (searchVal) {
        title = searchVal;
    }

    const id = 'tab-' + Date.now();
    const defaultLang = serverAvailable ? 'python' : 'javascript';
    const defaultCode = defaultLang === 'javascript' ? 'function solve(input) {\n    return null;\n}' : 'def solve(input_data):\n    return None';
    tabs[id] = {
        id, title, statement, lang: defaultLang,
        steps: { s1:'', s2:'', s3:'', s4:'', code: defaultCode, tests: '' },
        aiAnalysis: ''
    };

    addSidebarItem(id, title);
    openTabs.add(id);
    selectTab(id);
    toggleModal(false);
    stateLoaded = true;
    triggerSave();
    if (getGeminiKey() && statement !== 'Manual problem description...') generateBoilerplate(defaultLang).then(() => generateTests(true));

    document.getElementById('lcSearch').value = '';
    document.getElementById('customStatement').value = '';
    btn.innerText = "INITIALIZE";
}

function updateLangSelector() {
    const sel = document.getElementById('langSelect');
    if (!sel) return;
    Array.from(sel.options).forEach(o => {
        if (o.value === 'python' || o.value === 'java') {
            o.disabled = !serverAvailable;
            o.title = serverAvailable ? '' : 'Requires server';
        }
    });
    if (!serverAvailable) sel.value = 'javascript';
}

function seedLCFromPaste() {
    const raw = document.getElementById('lcSeedInput').value.trim();
    const status = document.getElementById('apiKeyStatus');
    try {
        let arr = JSON.parse(raw);
        if (arr.stat_status_pairs) arr = arr.stat_status_pairs;
        if (arr[0]?.stat) arr = arr.map(x => ({title: x.stat.question__title, titleSlug: x.stat.question__title_slug}));
        if (!arr[0]?.title) throw 'bad format';
        localStorage.setItem('leetcode_problems', JSON.stringify(arr));
        allProblems = arr;
        status.innerText = arr.length + ' problems loaded';
        document.getElementById('lcSeedInput').value = '';
        document.getElementById('lcSeedWrap').classList.add('hidden');
    } catch { status.innerText = 'Invalid JSON'; }
    setTimeout(() => status.innerText = '', 3000);
}

async function fetchProblemList() {
    const cached = localStorage.getItem('leetcode_problems');
    if (cached) { try {
        let arr = JSON.parse(cached);
        if (arr[0]?.stat) arr = arr.map(x => ({title: x.stat.question__title, titleSlug: x.stat.question__title_slug}));
        if (arr[0]?.title) { allProblems = arr; localStorage.setItem('leetcode_problems', JSON.stringify(arr)); }
    } catch {} }
    if (serverAvailable) {
        try {
            const res = await fetch('/get_leetcode_problems');
            const data = await res.json();
            if (data.length) { allProblems = data; localStorage.setItem('leetcode_problems', JSON.stringify(data)); }
        } catch {}
    }
}
