/* ============================================================
   vault-dev.js – Developer Keys vault module
   ============================================================ */

const DevVault = (() => {
  const KEY_TYPES = [
    { value: 'api_key',      label: 'API Key' },
    { value: 'jwt_token',    label: 'JWT Token' },
    { value: 'ssh_key',      label: 'SSH Key' },
    { value: 'env_vars',     label: 'Environment Variables' },
    { value: 'database_url', label: 'Database URL' },
    { value: 'webhook',      label: 'Webhook URL' },
    { value: 'oauth',        label: 'OAuth Credentials' },
    { value: 'certificate',  label: 'Certificate / PEM' },
    { value: 'other',        label: 'Other' }
  ];

  let _currentFolder = null;

  async function render(folderId, searchQuery) {
    _currentFolder = folderId || null;
    const container = document.getElementById('dev-list');
    if (!container) return;
    let items = await vaultDB.getAll('dev', false);
    if (folderId) items = items.filter(i => i.folder === folderId);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.data?.keyName || '').toLowerCase().includes(q) ||
        (i.data?.keyType || '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    const countEl = document.getElementById('dev-count');
    if (countEl) countEl.textContent = items.length;

    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
          </svg>
        </div>
        <h3>No developer keys</h3>
        <p>Tap the + button to store your first API key or token</p>
      </div>`;
      return;
    }

    items.forEach(item => {
      const keyTypeLabel = KEY_TYPES.find(t => t.value === item.data?.keyType)?.label || item.data?.keyType || 'Key';
      const card = document.createElement('div');
      card.className = 'vault-card slide-up';
      const preview = (item.data?.keyValue || '').substring(0, 60);
      card.innerHTML = `
        <div class="card-icon dev">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--clr-warning)">
            <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
          </svg>
        </div>
        <div class="card-body" style="min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <div class="card-title">${escapeHtml(item.title)}</div>
            <span class="tag dev-type">${escapeHtml(keyTypeLabel)}</span>
          </div>
          ${item.data?.keyName ? `<div class="card-subtitle">${escapeHtml(item.data.keyName)}</div>` : ''}
          ${preview ? `<div class="dev-card-code">${escapeHtml(preview)}${preview.length < (item.data?.keyValue||'').length ? '…' : ''}</div>` : ''}
        </div>
        <div class="card-actions" style="align-self:flex-start;margin-top:4px">
          <button class="card-action-btn copy-btn" data-id="${item.id}" title="Copy key">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="card-action-btn fav-btn ${item.favorite ? 'active' : ''}" data-id="${item.id}" title="Favorite">
            <svg viewBox="0 0 24 24" fill="${item.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </button>
          <button class="card-action-btn edit-btn" data-id="${item.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      `;

      card.querySelector('.copy-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await copyToClipboard(item.data?.keyValue || '');
        showToast('Key copied to clipboard!', 'success');
      });
      card.querySelector('.fav-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await FavoritesManager.toggle(item.id);
        render(_currentFolder);
      });
      card.querySelector('.edit-btn').addEventListener('click', e => {
        e.stopPropagation();
        showEditModal(item.id);
      });
      container.appendChild(card);
    });
  }

  function buildKeyTypeOptions(selected) {
    return KEY_TYPES.map(t =>
      `<option value="${t.value}" ${t.value === selected ? 'selected' : ''}>${t.label}</option>`
    ).join('');
  }

  async function showAddModal(folderId) {
    const modal = document.getElementById('dev-modal');
    if (!modal) return;
    document.getElementById('dev-modal-title').textContent = 'Add Developer Key';
    document.getElementById('dev-key-title').value = '';
    document.getElementById('dev-key-name').value = '';
    document.getElementById('dev-key-value').value = '';
    document.getElementById('dev-key-notes').value = '';
    document.getElementById('dev-key-type').innerHTML = buildKeyTypeOptions('api_key');
    const folders = await vaultDB.getAllFolders();
    populateFolderSelect('dev-folder-select', folders, folderId || _currentFolder);
    document.getElementById('dev-save-btn').dataset.mode = 'add';
    delete document.getElementById('dev-save-btn').dataset.id;
    document.getElementById('dev-delete-btn')?.classList.add('hidden');
    modal.classList.add('active');
  }

  async function showEditModal(id) {
    const item = await vaultDB.getById(id);
    if (!item) return;
    const modal = document.getElementById('dev-modal');
    if (!modal) return;
    document.getElementById('dev-modal-title').textContent = 'Edit Developer Key';
    document.getElementById('dev-key-title').value = item.title || '';
    document.getElementById('dev-key-name').value = item.data?.keyName || '';
    document.getElementById('dev-key-value').value = item.data?.keyValue || '';
    document.getElementById('dev-key-notes').value = item.data?.notes || '';
    document.getElementById('dev-key-type').innerHTML = buildKeyTypeOptions(item.data?.keyType || 'api_key');
    const folders = await vaultDB.getAllFolders();
    populateFolderSelect('dev-folder-select', folders, item.folder);
    document.getElementById('dev-save-btn').dataset.mode = 'edit';
    document.getElementById('dev-save-btn').dataset.id = id;
    const delBtn = document.getElementById('dev-delete-btn');
    if (delBtn) { delBtn.classList.remove('hidden'); delBtn.dataset.id = id; }
    modal.classList.add('active');
  }

  async function save(mode, id) {
    const title   = document.getElementById('dev-key-title').value.trim();
    const keyName = document.getElementById('dev-key-name').value.trim();
    const keyValue= document.getElementById('dev-key-value').value.trim();
    const keyType = document.getElementById('dev-key-type').value;
    const notes   = document.getElementById('dev-key-notes').value.trim();
    const folder  = document.getElementById('dev-folder-select').value || null;

    if (!title)    { showToast('Title is required', 'error'); return; }
    if (!keyValue) { showToast('Key/Value is required', 'error'); return; }

    const data = { keyName, keyValue, keyType, notes };
    if (mode === 'add') {
      await vaultDB.add({ type: 'dev', title, data, folder });
      showToast('Key saved!', 'success');
    } else {
      await vaultDB.update(id, { title, data, folder });
      showToast('Key updated!', 'success');
    }
    document.getElementById('dev-modal').classList.remove('active');
    render(_currentFolder);
    if (syncEngine) syncEngine.sync();
  }

  async function deleteItem(id) {
    const confirmed = await showConfirm('Delete Key', 'This will permanently delete this key. Are you sure?');
    if (!confirmed) return;
    await vaultDB.delete(id);
    document.getElementById('dev-modal')?.classList.remove('active');
    render(_currentFolder);
    showToast('Key deleted', 'warning');
    if (syncEngine) syncEngine.sync();
  }

  return { render, showAddModal, showEditModal, save, deleteItem };
})();
