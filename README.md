# PATTERN_ — Deep Work Interview Prep IDE

A single-page interview prep tool designed for deliberate practice. Works standalone in the browser (no server required) — or with an optional Flask backend for Python/Java execution.

Users bring their own Gemini API key, which is stored in their browser storage.

![Browser-Only](https://img.shields.io/badge/mode-browser--only-blue) ![Optional Server](https://img.shields.io/badge/server-optional-gray)

---

## Core Workflow

The app enforces a structured problem-solving workflow across four steps before writing code:

1. **Absorption & Constraints** — restate the problem, identify inputs/outputs/edge cases
2. **Pattern Hunt & Data Structures** — identify applicable patterns and data structures
3. **Logical Flow (Pseudocode)** — write pseudocode for the approach
4. **Dry Run & Edge Cases** — trace through examples manually

Each step has a Monaco editor and an **AI Validate** button that sends your work to Gemini for feedback.

After the four steps, the **Implementation** section provides a full code editor with run/test capabilities.

---

## Features

### Problem Management
- **LeetCode Catalog Search** — search and load problems from a cached LeetCode problem list
- **Custom Problems** — paste any problem statement directly
- **LC Seed Paste (📋)** — paste raw LeetCode API JSON blob to populate the problem catalog into localStorage
- **Multi-Tab Workspace** — open multiple problems as tabs, each with independent state
- **Tab Close vs Delete** — closing a tab hides it; deleting (🗑 in sidebar) permanently removes with confirmation
- **Rename/Delete** — hover sidebar items to rename (✎) or delete (🗑)

### AI Integration (Gemini)
- **Collapsible API Key Input** — `{🗝}` trigger in sidebar footer, animated border pulse when no key is set, green when configured
- **Step Validation** — each workbook step can be validated against the problem statement
- **AI Strategy Analysis** — full pattern/approach analysis in the Reference view
- **Boilerplate Generation** — auto-generates language-appropriate starter code on problem init
- **Test Generation** — generates unit tests from your implementation code
- **Auto Test Gen Timer** — after a successful code run, a 9-second countdown triggers silent background test generation (if tests editor is empty). Cancelable with Escape or click.
- **Parallel Call Prevention (genMgr)** — prevents concurrent Gemini calls. All `[data-genaction]` buttons disable/dim during active calls. Dedup keys prevent re-running identical requests.
- **Contextual Chat** — select any text in editors, description, or AI analysis to open a contextual question popup
- **Chat Threads** — threaded Q&A with `@hash` cross-referencing between threads
- **Ad-Hoc Chat** — general questions with code context (800 chars) and last 3 thread Q&As included automatically
- **Gemini Proxy** — calls go through server when available, direct to Gemini API when in browser-only mode

### Code Execution
- **JavaScript** — sandboxed execution in a hidden iframe (no server needed, 10s timeout)
- **Python / Java** — server-side execution via Flask backend
- **Run Logic** — executes the code editor contents
- **Run Tests** — concatenates code + tests editors and executes together
- **Sanity Check** — client-side static analysis blocks dangerous patterns (`eval`, `subprocess`, `__import__`, etc.). Server-side AI check for Python/Java.
- **Safe Code Hash Cache** — previously approved code skips re-checking

### Voice (STT / TTS)
- **Speech-to-Text (🎤)** — continuous speech recognition via Web Speech API
- **Text-to-Speech (🔇/🔊)** — reads AI responses aloud, strips markdown, chunks to 200 chars
- **Unified Toggle** — `Ctrl+Shift+V` (or `⌘+Shift+V` on Mac) toggles both mic and TTS together
- **Smart Voice Input Targeting** — voice text goes to: last focused Monaco editor → focused input/textarea → fallback to ad-hoc chat (auto-opens panel)
- **Robust Restart** — Chrome kills recognition after ~60s silence; auto-restarts with 300ms backoff
- **Iframe Support** — requires `allow="microphone"` on the iframe tag

### Editor & Layout
- **Monaco Editors** — syntax-highlighted editors for all steps, code, and tests
- **Language Selector** — Python, Java, JavaScript (Python/Java disabled when server unavailable)
- **Maximize/Restore (⤢)** — any editor can go fullscreen with `Ctrl+Shift+M` or click
- **Docked Terminal** — when code editor is maximized, terminal docks at bottom with its own run/test buttons
- **Description Dock** — toggle description between top bar and left panel (`⬒ Dock Left` / `⬓ Dock Top`)
- **Description Auto-Hide** — collapse description, peek on hover
- **Collapsible Sidebar** — hamburger toggle, auto-expand on hover when collapsed
- **Terminal** — color-coded output with spinner animations during async operations

### Persistence
- **localStorage First** — all state always written to localStorage
- **Server Mirror** — when Flask server is available, state is mirrored to disk (`workspace_state.json`)
- **Conflict Resolution** — localStorage wins on load; falls back to server if localStorage is empty
- **Clobber Prevention** — `stateLoaded` flag prevents saving before load completes; empty-tabs guard prevents overwriting good data
- **API Key** — stored only in localStorage, never sent to server for storage
- **Terminal State** — per-tab terminal output and color persisted across tab switches

### Status Bar
- Thin 24px bar at bottom of viewport
- **Left**: voice state with breathing pulse (`🎤 Listening · 🔊 Speaking` or `🎤 Voice off · Ctrl+Shift+V`)
- **Right**: sync/server status (`Browser-Only Mode`, `Syncing...`, `Saved`, `Server Connected`)

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+'` | Run Logic |
| `Ctrl+"` | Generate Tests |
| `Ctrl+Shift+L` | Clear Terminal |
| `Ctrl+Shift+M` | Maximize/Restore focused editor |
| `Ctrl+Shift+V` | Toggle Voice (STT + TTS) |
| `Escape` | Cancel test gen timer / stop mic / stop TTS / restore maximized editor |

---

## Running

### Browser-Only (No Server)

Open `templates/index.html` directly or serve with any static file server. JavaScript execution works out of the box. Set your Gemini API key via the `{🗝}` button.

### With Flask Server

```bash
pip install flask
python server.py
```

Server runs on port **8500**. Enables:
- Python and Java code execution
- LeetCode problem fetching
- Server-side sanity checking
- Workspace state mirroring to disk

### Embedding as iframe

```html
<iframe src="https://your-domain/..." allow="microphone" style="width:100%;height:100vh;border:none;"></iframe>
```

The `allow="microphone"` attribute is required for voice features.

---

## Project Structure

```
├── templates/
│   └── index.html          # Single-page app (~1600 lines)
├── server.py               # Optional Flask backend (port 8500)
├── leetcode_cache.json     # Cached problem list (367KB)
└── workspace_state.json    # Server-side state mirror
```

---

## Tech Stack

- **Frontend**: Vanilla JS, Monaco Editor, Tailwind CSS (CDN), Marked.js
- **AI**: Google Gemini API (direct or proxied)
- **Voice**: Web Speech API (SpeechRecognition + SpeechSynthesis)
- **Backend** (optional): Flask, Python subprocess for code execution
