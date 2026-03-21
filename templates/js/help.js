function renderHelp() {
    const md = `
**Get started** — click **+** in the sidebar to open a problem.\\
Search the LeetCode catalog or paste your own problem statement.

**Workflow** — four steps before code:\\
1 &nbsp;Restate the problem, inputs, outputs, edge cases\\
2 &nbsp;Identify patterns and data structures\\
3 &nbsp;Write pseudocode\\
4 &nbsp;Dry run through examples

Each step has **Validate with AI** to get feedback from Gemini.

**API key** — click {🗝} in the sidebar footer to set your Gemini key.\\
Stored in your browser only, never sent to any server for storage.

**Code** — write your solution, then **Run Logic** or **Run Tests**.\\
JavaScript runs in-browser. Python/Java need the Flask server.

**Debug** — 🐛 Debug instruments your code and shows a step-by-step trace table.\\
Arrow keys to step, Space to play/pause.

**Shortcuts**\\
Ctrl+S &nbsp;save · Ctrl+' &nbsp;run · Ctrl+" &nbsp;gen tests\\
Ctrl+Shift+D &nbsp;debug · Ctrl+Shift+M &nbsp;maximize editor\\
Ctrl+Shift+V &nbsp;toggle voice (mic + TTS)

**Chat** — select any text to ask a contextual question.\\
Threaded Q&A with @hash cross-references.

**Tabs** — open multiple problems. Closing a tab hides it;\\
click it in the sidebar to reopen. Delete with 🗑.
`;
    const el = document.getElementById('helpContent');
    if (el) el.innerHTML = marked.parse(md);
}
