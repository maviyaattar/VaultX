/* ============================================================
   folders.js – Folder management
   ============================================================ */

const FolderManager = (() => {
  let _currentDb = null;

  function setDB(db) { _currentDb = db; }

  async function getAll() {
    const db = _currentDb || vaultDB;
    return db.getAllFolders();
  }

  async function create(name) {
    const db = _currentDb || vaultDB;
    const folder = await db.addFolder({ name: name.trim() });
    window.dispatchEvent(new CustomEvent('vault:folders_changed'));
    return folder;
  }

  async function remove(id) {
    const db = _currentDb || vaultDB;
    await db.deleteFolder(id);
    window.dispatchEvent(new CustomEvent('vault:folders_changed'));
  }

  async function renderList(containerId, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const folders = await getAll();
    container.innerHTML = '';
    if (!folders.length) {
      container.innerHTML = '<p style="color:var(--clr-text-muted);font-size:0.85rem;padding:12px 0;">No folders yet. Create one first.</p>';
      return;
    }
    folders.forEach(f => {
      const item = document.createElement('div');
      item.className = 'folder-list-item';
      item.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        <span>${escapeHtml(f.name)}</span>
      `;
      item.addEventListener('click', () => onSelect(f));
      container.appendChild(item);
    });
  }

  function showPicker(onSelect, containerId = 'folder-picker-modal') {
    const modal = document.getElementById(containerId);
    if (!modal) return;
    renderList('folder-picker-list', folder => {
      if (typeof onSelect === 'function') onSelect(folder);
      modal.querySelector('.modal-backdrop')?.classList.remove('active');
    });
    modal.classList.add('active');
  }

  async function renderChips(containerId, currentFolderId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const folders = await getAll();
    container.innerHTML = '';

    const allChip = document.createElement('div');
    allChip.className = 'folder-chip' + (!currentFolderId ? ' active' : '');
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => onChange(null));
    container.appendChild(allChip);

    folders.forEach(f => {
      const chip = document.createElement('div');
      chip.className = 'folder-chip' + (currentFolderId === f.id ? ' active' : '');
      chip.textContent = f.name;
      chip.addEventListener('click', () => onChange(f.id));
      container.appendChild(chip);
    });
  }

  return { setDB, getAll, create, remove, renderList, renderChips, showPicker };
})();

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
