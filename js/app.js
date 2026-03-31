/* ============================================================
   app.js – Main app orchestration for VaultX
   ============================================================ */

// ── State ─────────────────────────────────────────────────────
let currentTab    = 'passwords';
let supabaseClient = null;
let settingsLongPressTimer = null;

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Confirm dialog ────────────────────────────────────────────
function showConfirm(title, message, isDangerous = false) {
  return new Promise(resolve => {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog active';
    dialog.innerHTML = `
      <div class="confirm-box">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="confirm-cancel" id="confirm-cancel-btn">Cancel</button>
          <button class="${isDangerous ? 'confirm-ok' : 'confirm-ok'}" 
            style="background:${isDangerous ? 'linear-gradient(135deg,var(--clr-danger),#c0392b)' : 'linear-gradient(135deg,var(--clr-primary),var(--clr-primary-dark))'}"
            id="confirm-ok-btn">${isDangerous ? 'Delete' : 'Confirm'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('#confirm-cancel-btn').onclick = () => { dialog.remove(); resolve(false); };
    dialog.querySelector('#confirm-ok-btn').onclick = () => { dialog.remove(); resolve(true); };
    dialog.onclick = e => { if (e.target === dialog) { dialog.remove(); resolve(false); } };
  });
}

// ── Modal helpers ─────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// ── Tab navigation ────────────────────────────────────────────
function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById(`${tabName}-panel`);
  const navItem = document.querySelector(`[data-tab="${tabName}"]`);
  if (panel)   panel.classList.add('active');
  if (navItem) navItem.classList.add('active');
  loadTabContent(tabName);
}

async function loadTabContent(tab) {
  switch(tab) {
    case 'passwords':
      await renderFolderChips('passwords');
      await PasswordVault.render();
      break;
    case 'files':
      await renderFolderChips('files');
      await FileVault.render();
      break;
    case 'dev':
      await renderFolderChips('dev');
      await DevVault.render();
      break;
    case 'settings':
      await SettingsModule.render();
      break;
  }
}

async function renderFolderChips(tab) {
  const containerId = `${tab}-folder-chips`;
  await FolderManager.renderChips(containerId, null, (folderId) => {
    if (tab === 'passwords') PasswordVault.render(folderId);
    if (tab === 'files')     FileVault.render(folderId);
    if (tab === 'dev')       DevVault.render(folderId);
    // Update active chip
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.folder-chip').forEach((c, i) => {
      const isAll = i === 0;
      c.classList.toggle('active', !folderId ? isAll : c.textContent !== 'All');
    });
  });
}

// ── FAB ───────────────────────────────────────────────────────
function handleFab() {
  switch (currentTab) {
    case 'passwords': PasswordVault.showAddModal(); break;
    case 'files':     FileVault.showAddModal();     break;
    case 'dev':       DevVault.showAddModal();      break;
    case 'settings':  SettingsModule.createFolder(); break;
  }
}

// ── Service Worker ────────────────────────────────────────────
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SYNC_REQUESTED') {
          syncEngine?.sync();
        }
      });
      if ('sync' in reg) {
        reg.sync.register('vault-sync').catch(() => {});
      }
    } catch (err) {
      console.warn('SW registration failed:', err);
    }
  }
}

// ── Settings long-press ───────────────────────────────────────
function setupSettingsLongPress() {
  const settingsNav = document.querySelector('[data-tab="settings"]');
  if (!settingsNav) return;

  settingsNav.addEventListener('touchstart', e => {
    settingsLongPressTimer = setTimeout(() => {
      SecretVault.show();
    }, 3000);
  }, { passive: true });

  settingsNav.addEventListener('touchend', () => {
    clearTimeout(settingsLongPressTimer);
    settingsLongPressTimer = null;
  });

  settingsNav.addEventListener('touchcancel', () => {
    clearTimeout(settingsLongPressTimer);
    settingsLongPressTimer = null;
  });

  // Also support mouse for desktop testing
  settingsNav.addEventListener('mousedown', () => {
    settingsLongPressTimer = setTimeout(() => {
      SecretVault.show();
    }, 3000);
  });
  settingsNav.addEventListener('mouseup', () => {
    clearTimeout(settingsLongPressTimer);
    settingsLongPressTimer = null;
  });
  settingsNav.addEventListener('mouseleave', () => {
    clearTimeout(settingsLongPressTimer);
    settingsLongPressTimer = null;
  });
}

// ── Password modal wiring ─────────────────────────────────────
function setupPasswordModal() {
  // Save button
  document.getElementById('modal-save-btn')?.addEventListener('click', () => {
    const btn  = document.getElementById('modal-save-btn');
    const mode = btn.dataset.mode;
    const id   = btn.dataset.id;
    PasswordVault.save(mode, id);
  });

  // Delete button
  document.getElementById('modal-delete-btn')?.addEventListener('click', e => {
    PasswordVault.deleteItem(e.currentTarget.dataset.id);
  });

  // Close modal on backdrop click
  document.getElementById('item-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('item-modal');
  });

  // Password toggle
  document.getElementById('toggle-pw-visibility')?.addEventListener('click', () => {
    const input = document.getElementById('pw-password');
    const btn   = document.getElementById('toggle-pw-visibility');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    } else {
      input.type = 'password';
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
  });

  // Generate password
  document.getElementById('pw-generate')?.addEventListener('click', () => {
    const pw = PasswordVault.generatePassword();
    const input = document.getElementById('pw-password');
    if (input) { input.value = pw; input.type = 'text'; }
    showToast('Strong password generated!', 'success');
  });
}

// ── View password modal wiring ────────────────────────────────
function setupViewPasswordModal() {
  document.getElementById('view-pw-modal-backdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('view-password-modal');
  });
  document.getElementById('view-pw-toggle')?.addEventListener('click', () => {
    const el = document.getElementById('view-pw-password');
    if (!el) return;
    if (el.dataset.visible === 'false') {
      el.textContent = el.dataset.pw;
      el.dataset.visible = 'true';
    } else {
      el.textContent = '••••••••••';
      el.dataset.visible = 'false';
    }
  });
  document.getElementById('view-pw-copy')?.addEventListener('click', async () => {
    const pw = document.getElementById('view-pw-password')?.dataset.pw || '';
    await copyToClipboard(pw);
    showToast('Password copied!', 'success');
  });
  document.getElementById('view-pw-edit-btn')?.addEventListener('click', e => {
    const id = e.currentTarget.dataset.id;
    closeModal('view-password-modal');
    PasswordVault.showEditModal(id);
  });
}

// ── File modal wiring ─────────────────────────────────────────
function setupFileModal() {
  document.getElementById('file-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('file-modal');
  });
  document.getElementById('file-upload-btn')?.addEventListener('click', () => FileVault.uploadFile());
  document.getElementById('file-cancel-btn')?.addEventListener('click', () => closeModal('file-modal'));
}

// ── Dev modal wiring ──────────────────────────────────────────
function setupDevModal() {
  document.getElementById('dev-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('dev-modal').classList.remove('active');
  });
  document.getElementById('dev-save-btn')?.addEventListener('click', () => {
    const btn  = document.getElementById('dev-save-btn');
    DevVault.save(btn.dataset.mode, btn.dataset.id);
  });
  document.getElementById('dev-delete-btn')?.addEventListener('click', e => {
    DevVault.deleteItem(e.currentTarget.dataset.id);
  });
  document.getElementById('dev-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('dev-modal').classList.remove('active');
  });
}

// ── Manage folders modal wiring ───────────────────────────────
function setupFolderModals() {
  document.getElementById('manage-folders-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('manage-folders-modal').classList.remove('active');
  });
  document.getElementById('manage-folders-close')?.addEventListener('click', () => {
    document.getElementById('manage-folders-modal').classList.remove('active');
  });
  document.getElementById('manage-folders-add-btn')?.addEventListener('click', async () => {
    const name = await showPrompt('New Folder', 'Enter folder name:');
    if (!name?.trim()) return;
    await FolderManager.create(name.trim());
    showToast('Folder created!', 'success');
    SettingsModule.manageFolders();
  });
}

// ── Search wiring ─────────────────────────────────────────────
function setupSearch() {
  document.getElementById('header-search-btn')?.addEventListener('click', () => SearchEngine.toggle());
  document.getElementById('search-input')?.addEventListener('input', e => {
    SearchEngine.handleInput(e.target.value);
  });
  document.getElementById('search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') SearchEngine.toggle();
  });
}

// ── Supabase init ─────────────────────────────────────────────
function initSupabase() {
  try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      initSyncEngines(supabaseClient);
      const syncEl = document.getElementById('sync-indicator');
      syncEngine.setIndicator(syncEl);
      syncEngine.startAutoSync(60000);
      // Sync after unlock
      window.addEventListener('vault:unlocked', () => {
        syncEngine.sync();
        secretSyncEngine.sync();
      });
    }
  } catch (err) {
    console.warn('Supabase init failed:', err);
  }
}

// ── Events ────────────────────────────────────────────────────
function setupGlobalEvents() {
  window.addEventListener('vault:item_changed', () => {
    if (currentTab !== 'settings') loadTabContent(currentTab);
  });
  window.addEventListener('vault:folders_changed', () => {
    renderFolderChips(currentTab === 'settings' ? 'passwords' : currentTab);
  });
  window.addEventListener('vault:synced', () => {
    loadTabContent(currentTab);
  });
}

// ── Bootstrap ─────────────────────────────────────────────────
async function init() {
  // Open databases
  await vaultDB.open();
  await secretDB.open();

  // Setup lock screen
  LockScreen.init(() => {
    window.dispatchEvent(new CustomEvent('vault:unlocked'));
  });

  // Init Supabase & sync
  initSupabase();

  // Register SW
  registerServiceWorker();

  // Set up nav
  document.querySelectorAll('.nav-item').forEach(item => {
    const tab = item.dataset.tab;
    if (!tab) return;
    item.addEventListener('click', () => switchTab(tab));
  });

  // FAB
  document.getElementById('fab')?.addEventListener('click', handleFab);

  // Modal wiring
  setupPasswordModal();
  setupViewPasswordModal();
  setupFileModal();
  setupDevModal();
  setupFolderModals();
  setupSearch();

  // Secret vault
  SecretVault.init();
  setupSettingsLongPress();

  // Close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
      document.querySelectorAll('.confirm-dialog.active').forEach(d => d.remove());
    }
  });

  // File modal folders
  vaultDB.getAllFolders().then(folders => {
    populateFolderSelect('file-folder-select', folders, null);
  });

  // Global events
  setupGlobalEvents();

  // Load initial tab
  switchTab('passwords');

  // Network indicator initial state
  if (!navigator.onLine) {
    document.getElementById('net-indicator')?.classList.add('offline');
  }
}

// Start
document.addEventListener('DOMContentLoaded', init);
