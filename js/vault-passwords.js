/* ============================================================
   vault-passwords.js – Password vault module
   ============================================================ */

const PasswordVault = (() => {
  let _currentFolder = null;

  function passwordStrength(pw) {
    if (!pw) return { label: '', cls: '' };
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: 'Weak',   cls: 'weak' };
    if (score <= 2) return { label: 'Fair',   cls: 'fair' };
    if (score <= 3) return { label: 'Good',   cls: 'good' };
    return { label: 'Strong', cls: 'strong' };
  }

  function generatePassword(length = 16) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, v => chars[v % chars.length]).join('');
  }

  async function render(folderId, searchQuery, favoritesOnly) {
    _currentFolder = folderId || null;
    const container = document.getElementById('passwords-list');
    if (!container) return;
    let items = await vaultDB.getAll('password', false);
    if (folderId)       items = items.filter(i => i.folder === folderId);
    if (favoritesOnly)  items = items.filter(i => i.favorite);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.data?.username || '').toLowerCase().includes(q) ||
        (i.data?.url || '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    const countEl = document.getElementById('pw-count');
    if (countEl) countEl.textContent = items.length;

    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h3>No passwords yet</h3>
        <p>Tap the + button to add your first password</p>
      </div>`;
      return;
    }

    items.forEach(item => {
      const strength = passwordStrength(item.data?.password || '');
      const card = document.createElement('div');
      card.className = 'vault-card slide-up';
      card.innerHTML = `
        <div class="card-icon pw">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--clr-primary)">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div class="card-body" style="cursor:pointer">
          <div class="card-title">${escapeHtml(item.title)}</div>
          <div class="card-subtitle">${escapeHtml(item.data?.username || item.data?.url || '')}</div>
          ${strength.cls ? `<div class="strength-bar"><div class="strength-bar-fill ${strength.cls}"></div></div>` : ''}
        </div>
        <div class="card-actions">
          <button class="card-action-btn copy-btn" data-pw="${escapeHtml(item.data?.password || '')}" title="Copy password">
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

      card.querySelector('.card-body').addEventListener('click', () => showViewModal(item));
      card.querySelector('.copy-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await copyToClipboard(item.data?.password || '');
        showToast('Password copied!', 'success');
      });
      card.querySelector('.fav-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await FavoritesManager.toggle(item.id);
        render(_currentFolder);
        window.dispatchEvent(new CustomEvent('vault:item_changed'));
      });
      card.querySelector('.edit-btn').addEventListener('click', e => {
        e.stopPropagation();
        showEditModal(item.id);
      });
      container.appendChild(card);
    });
  }

  function showViewModal(item) {
    const modal = document.getElementById('view-password-modal');
    if (!modal) { showEditModal(item.id); return; }
    const strength = passwordStrength(item.data?.password || '');
    document.getElementById('view-pw-title').textContent = item.title;
    document.getElementById('view-pw-username').textContent = item.data?.username || '–';
    document.getElementById('view-pw-url').textContent = item.data?.url || '–';
    document.getElementById('view-pw-password').textContent = '••••••••••';
    document.getElementById('view-pw-password').dataset.pw = item.data?.password || '';
    document.getElementById('view-pw-password').dataset.visible = 'false';
    document.getElementById('view-pw-notes').textContent = item.data?.notes || '–';
    document.getElementById('view-pw-strength').className = 'strength-bar-fill ' + strength.cls;
    document.getElementById('view-pw-edit-btn').dataset.id = item.id;
    modal.classList.add('active');
  }

  async function showAddModal(folderId) {
    resetModal();
    document.getElementById('modal-title').textContent = 'Add Password';
    document.getElementById('modal-save-btn').dataset.mode = 'add';
    delete document.getElementById('modal-save-btn').dataset.id;
    document.getElementById('pw-folder-id').value = folderId || _currentFolder || '';
    const folders = await vaultDB.getAllFolders();
    populateFolderSelect('pw-folder-select', folders, folderId || _currentFolder);
    openModal('item-modal');
  }

  async function showEditModal(id) {
    const item = await vaultDB.getById(id);
    if (!item) return;
    resetModal();
    document.getElementById('modal-title').textContent = 'Edit Password';
    document.getElementById('pw-title').value = item.title || '';
    document.getElementById('pw-username').value = item.data?.username || '';
    document.getElementById('pw-password').value = item.data?.password || '';
    document.getElementById('pw-url').value = item.data?.url || '';
    document.getElementById('pw-notes').value = item.data?.notes || '';
    document.getElementById('pw-folder-id').value = item.folder || '';
    const folders = await vaultDB.getAllFolders();
    populateFolderSelect('pw-folder-select', folders, item.folder);
    document.getElementById('modal-save-btn').dataset.mode = 'edit';
    document.getElementById('modal-save-btn').dataset.id = id;
    document.getElementById('modal-delete-btn').classList.remove('hidden');
    document.getElementById('modal-delete-btn').dataset.id = id;
    openModal('item-modal');
  }

  async function save(mode, id) {
    const title    = document.getElementById('pw-title').value.trim();
    const username = document.getElementById('pw-username').value.trim();
    const password = document.getElementById('pw-password').value;
    const url      = document.getElementById('pw-url').value.trim();
    const notes    = document.getElementById('pw-notes').value.trim();
    const folder   = document.getElementById('pw-folder-select').value || null;

    if (!title) { showToast('Title is required', 'error'); return; }
    if (!password) { showToast('Password is required', 'error'); return; }

    const data = { username, password, url, notes };
    if (mode === 'add') {
      await vaultDB.add({ type: 'password', title, data, folder });
      showToast('Password saved!', 'success');
    } else {
      await vaultDB.update(id, { title, data, folder });
      showToast('Password updated!', 'success');
    }
    closeModal('item-modal');
    render(_currentFolder);
    if (syncEngine) syncEngine.sync();
  }

  async function deleteItem(id) {
    const confirmed = await showConfirm('Delete Password', 'This will permanently delete this password entry. Are you sure?');
    if (!confirmed) return;
    await vaultDB.delete(id);
    closeModal('item-modal');
    closeModal('view-password-modal');
    render(_currentFolder);
    showToast('Password deleted', 'warning');
    if (syncEngine) syncEngine.sync();
  }

  function resetModal() {
    ['pw-title','pw-username','pw-password','pw-url','pw-notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('modal-delete-btn')?.classList.add('hidden');
  }

  return { render, showAddModal, showEditModal, save, deleteItem, generatePassword };
})();

function populateFolderSelect(selectId, folders, selectedId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">No folder</option>';
  (folders || []).forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    if (f.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}
