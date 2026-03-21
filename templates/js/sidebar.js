function hamburgerHandler() {
    const sidebar = document.getElementById('sidebar-plus-title');
    isManuallyCollapsed = !sidebar.classList.contains('sidebar-collapsed');
    if (isManuallyCollapsed) sidebar.classList.add('sidebar-collapsed');
    else sidebar.classList.remove('sidebar-collapsed');
}

function sideBarHoverHandler(isHovering) {
    const sidebar = document.getElementById('sidebar-plus-title');
    if (isManuallyCollapsed) {
        if (isHovering) sidebar.classList.remove('sidebar-collapsed');
        else sidebar.classList.add('sidebar-collapsed');
    }
}

function addSidebarItem(id, title) {
    const item = document.createElement('div');
    item.id = 'sidebar-' + id;
    item.className = "group p-3 rounded-xl text-[11px] font-bold text-slate-400 cursor-pointer transition hover:bg-slate-800 hover:text-white flex items-center gap-2";
    item.innerHTML = `<div class="w-1 h-1 rounded-full bg-slate-700 shrink-0"></div><span class="truncate flex-1">${esc(title)}</span><span class="hidden group-hover:flex gap-1 shrink-0"><button onclick="event.stopPropagation();renameProblem('${id}')" class="text-[9px] text-slate-500 hover:text-blue-400" title="Rename">✎</button><button onclick="event.stopPropagation();deleteProblem('${id}')" class="text-[9px] text-slate-500 hover:text-red-400" title="Delete">🗑</button></span>`;
    item.onclick = () => { openTabs.add(id); selectTab(id); };
    document.getElementById('sidebarList').appendChild(item);
}

function renameProblem(id) {
    const newTitle = prompt('Rename problem:', tabs[id].title);
    if (!newTitle || !newTitle.trim()) return;
    tabs[id].title = newTitle.trim();
    refreshSidebar();
    if (activeTabId === id) { document.getElementById('tabTitle').innerText = tabs[id].title; document.getElementById('descTitle').innerText = tabs[id].title; renderTabs(); }
    triggerSave();
}

function deleteProblem(id) {
    if (!confirm('Delete "' + tabs[id].title + '"?')) return;
    delete tabs[id];
    delete chatThreads[id];
    openTabs.delete(id);
    refreshSidebar();
    triggerSave();
    if (activeTabId === id) {
        const remaining = Object.keys(tabs);
        if (remaining.length) selectTab(remaining[0]);
        else { activeTabId = null; document.getElementById('activeContent').classList.add('hidden'); document.getElementById('emptyState').classList.remove('hidden'); renderTabs(); }
    } else { renderTabs(); }
}

function refreshSidebar() {
    document.getElementById('sidebarList').innerHTML = '';
    Object.values(tabs).filter(t => isTabCurrentMode(t)).forEach(t => addSidebarItem(t.id, t.title));
}
