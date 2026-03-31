/* ============================================================
   vault-secret.js – Secret Vault module
   ============================================================ */

const SecretVault = (() => {
  let _unlocked = false;
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

  function show() {
    const panel = document.getElementById('secret-panel');
    if (!panel) return;
    panel.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (!_unlocked) {
      SecretLock.show(() => {
        _unlocked = true;
        render();
        showToast('Secret Vault unlocked', 'info');
      });
    } else {
      render();
    }
  }

  function hide() {
    const panel = document.getElementById('secret-panel');
    if (!panel) return;
    panel.classList.remove('active');
    document.body.style.overflow = '';
    _unlocked = false;
    _currentFolder = null;
  }

  async function render(folderId, searchQuery) {
    _currentFolder = folderId || null;
    const container = document.getElementById('secret-items-list');
    if (!container) return;
    let items = await secretDB.getAll(null, false);
    if (folderId) items = items.filter(i => i.folder === folderId);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.data?.username || '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    const countEl = document.getElementById('secret-count');
    if (countEl) countEl.textContent = items.length;

    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = `<div class="empty-state" style="color:rgba(255,51,102,0.7)">
        <div class="empty-state-icon" style="border-color:rgba(255,51,102,0.2);background:rgba(255,51,102,0.05)">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,51,102,0.7)" stroke-width="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h3 style="color:rgba(255,255,255,0.7)">Vault is empty</h3>
        <p style="color:rgba(255,51,102,0.5)">Add your most sensitive secrets here</p>
      </div>`;
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'secret-card slide-up';
      const sub = item.data?.username || item.data?.url || item.data?.keyValue?.substring(0, 30) || '';
      card.innerHTML = `
        <div class="secret-card-icon">
          ${item.type === 'password' ? '🔐' : item.type === 'file' ? '📁' : '🗝️'}
        </div>
        <div class="card-body">
          <div class="card-title" style="color:#fff">${escapeHtml(item.title)}</div>
          ${sub ? `<div class="card-subtitle" style="color:rgba(255,51,102,0.6)">${escapeHtml(sub)}</div>` : ''}
          <div class="card-meta" style="color:rgba(255,255,255,0.3)">${formatDate(item.updated_at)}</div>
        </div>
        <div class="card-actions">
          <button class="card-action-btn" data-copy="${escapeHtml(item.data?.password || item.data?.keyValue || '')}" title="Copy" style="color:rgba(255,51,102,0.7)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="card-action-btn secret-edit-btn" data-id="${item.id}" style="color:rgba(255,51,102,0.7)" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      `;

      card.querySelector('[data-copy]').addEventListener('click', async e => {
        e.stopPropagation();
        const val = e.currentTarget.dataset.copy;
        if (val) { await copyToClipboard(val); showToast('Copied!', 'success'); }
      });
      card.querySelector('.secret-edit-btn').addEventListener('click', e => {
        e.stopPropagation();
        showEditModal(item.id);
      });
      container.appendChild(card);
    });
  }

  async function showAddModal() {
    const modal = document.getElementById('secret-add-modal');
    if (!modal) return;
    document.getElementById('secret-item-title').value = '';
    document.getElementById('secret-item-username').value = '';
    document.getElementById('secret-item-password').value = '';
    document.getElementById('secret-item-notes').value = '';
    document.getElementById('secret-modal-title').textContent = 'Add Secret';
    document.getElementById('secret-save-btn').dataset.mode = 'add';
    delete document.getElementById('secret-save-btn').dataset.id;
    document.getElementById('secret-delete-btn')?.classList.add('hidden');
    modal.classList.add('active');
  }

  async function showEditModal(id) {
    const item = await secretDB.getById(id);
    if (!item) return;
    const modal = document.getElementById('secret-add-modal');
    if (!modal) return;
    document.getElementById('secret-modal-title').textContent = 'Edit Secret';
    document.getElementById('secret-item-title').value = item.title || '';
    document.getElementById('secret-item-username').value = item.data?.username || '';
    document.getElementById('secret-item-password').value = item.data?.password || '';
    document.getElementById('secret-item-notes').value = item.data?.notes || '';
    document.getElementById('secret-save-btn').dataset.mode = 'edit';
    document.getElementById('secret-save-btn').dataset.id = id;
    const delBtn = document.getElementById('secret-delete-btn');
    if (delBtn) { delBtn.classList.remove('hidden'); delBtn.dataset.id = id; }
    modal.classList.add('active');
  }

  async function save(mode, id) {
    const title    = document.getElementById('secret-item-title').value.trim();
    const username = document.getElementById('secret-item-username').value.trim();
    const password = document.getElementById('secret-item-password').value;
    const notes    = document.getElementById('secret-item-notes').value.trim();

    if (!title)    { showToast('Title is required', 'error'); return; }
    if (!password) { showToast('Secret/Password is required', 'error'); return; }

    const data = { username, password, notes };
    if (mode === 'add') {
      await secretDB.add({ type: 'password', title, data, vault: 'secret' });
      showToast('Secret saved!', 'success');
    } else {
      await secretDB.update(id, { title, data });
      showToast('Secret updated!', 'success');
    }
    document.getElementById('secret-add-modal').classList.remove('active');
    render(_currentFolder);
    if (secretSyncEngine) secretSyncEngine.sync();
  }

  async function deleteItem(id) {
    const confirmed = await showConfirm('Delete Secret', 'This will permanently delete this secret. This cannot be undone.', true);
    if (!confirmed) return;
    await secretDB.delete(id);
    document.getElementById('secret-add-modal')?.classList.remove('active');
    render(_currentFolder);
    showToast('Secret deleted', 'warning');
    if (secretSyncEngine) secretSyncEngine.sync();
  }

  function init() {
    SecretLock.init();
    const backBtn = document.getElementById('secret-back-btn');
    if (backBtn) backBtn.addEventListener('click', hide);
    const fab = document.getElementById('secret-fab');
    if (fab) fab.addEventListener('click', showAddModal);
    const saveBtn = document.getElementById('secret-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      save(saveBtn.dataset.mode, saveBtn.dataset.id);
    });
    const delBtn = document.getElementById('secret-delete-btn');
    if (delBtn) delBtn.addEventListener('click', () => deleteItem(delBtn.dataset.id));
    const cancelBtns = document.querySelectorAll('#secret-add-modal .secret-modal-cancel');
    cancelBtns.forEach(btn => btn.addEventListener('click', () => {
      document.getElementById('secret-add-modal').classList.remove('active');
    }));
  }

  return { show, hide, render, showAddModal, showEditModal, save, deleteItem, init };
})();
