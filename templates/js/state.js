// Global application state
let tabs = {}, activeTabId = null, openTabs = new Set(), editors = {}, allProblems = [], lcMap = {}, saveTimeout = null, stateLoaded = false;
let chatThreads = {}, activeThreadView = null, replyingToThread = null, ctxSelection = '', ctxSource = '', ctxSourceEditorKey = null;
let safeCodeHashes = {};
let serverAvailable = false;
let maximizedEditor = null;
let debugTraceActive = false, debugDecorations = [], debugTraceIdx = 0;
let debugPlayTimer = null, debugNarrationVisible = false;
let isManuallyCollapsed = false;
let lastFocusedEditorKey = null;
let micActive = false, recognition = null, micRestartTimer = null;
let ttsEnabled = false;
let spinnerInterval = null, spinnerTabId = null;
let testGenTimer = null;
let ctxDelayTimer = null;
let descDocked = localStorage.getItem('descDocked') || 'top';
let descHidden = localStorage.getItem('descHidden') === 'true';
let appMode = null; // 'practice' or 'interview'
let interviewState = null; // interview session state

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const micShortcut = isMac ? '⌘+Shift+V' : 'Ctrl+Shift+V';
