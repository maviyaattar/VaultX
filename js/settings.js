/* ============================================================
   settings.js – Settings module
   ============================================================ */

const SettingsModule = (() => {

  async function exportData() {
    try {
      const mainData   = await vaultDB.exportAll();
      const secretData = await secretDB.exportAll();
      const exportObj  = {
        version: APP_VERSION,
        exported_at: new Date().toISOString(),
        main: mainData,
        secret: secretData
      };
      const json = JSON.stringify(exportObj, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vaultx_backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Data exported successfully!', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  async function importData(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const obj  = JSON.parse(text);

      const confirmed = await showConfirm(
        'Import Data',
        'This will merge the imported data with your existing vault. Continue?',
        false
      );
      if (!confirmed) return;

      const importItems = async (items, db) => {
        for (const item of (items || [])) {
          const existing = await db.getById(item.id);
          if (!existing) {
            await db._req(db._tx('items', 'readwrite').add({ ...item, synced: false }));
          } else {
            if (new Date(item.updated_at) > new Date(existing.updated_at)) {
              await db._req(db._tx('items', 'readwrite').put({ ...item, synced: false }));
            }
          }
        }
      };

      const importFolders = async (folders, db) => {
        for (const f of (folders || [])) {
          const existing = await db._req(db._tx('folders').get(f.id)).catch(() => null);
          if (!existing) {
            await db._req(db._tx('folders', 'readwrite').add({ ...f, synced: false })).catch(() => {});
          }
        }
      };

      if (obj.main) {
        await vaultDB.open();
        await importItems(obj.main.items, vaultDB);
        await importFolders(obj.main.folders, vaultDB);
      }
      if (obj.secret) {
        await secretDB.open();
        await importItems(obj.secret.items, secretDB);
        await importFolders(obj.secret.folders, secretDB);
      }

      showToast('Data imported successfully!', 'success');
      window.dispatchEvent(new CustomEvent('vault:item_changed'));
      window.dispatchEvent(new CustomEvent('vault:folders_changed'));
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  }

  async function clearAllData() {
    const confirmed = await showConfirm(
      'Clear All Data',
      'This will permanently delete ALL local vault data including passwords, files, and keys. This cannot be undone!',
      true
    );
    if (!confirmed) return;
    const confirmed2 = await showConfirm(
      'Are you absolutely sure?',
      'Type "DELETE" to confirm you want to erase all local data.',
      true
    );
    if (!confirmed2) return;
    try {
      await vaultDB.clearAll();
      await secretDB.clearAll();
      localStorage.removeItem(LAST_SYNC_KEY);
      localStorage.removeItem(LAST_SECRET_SYNC_KEY);
      showToast('All data cleared', 'warning');
      window.dispatchEvent(new CustomEvent('vault:item_changed'));
      window.dispatchEvent(new CustomEvent('vault:folders_changed'));
    } catch (err) {
      showToast('Clear failed: ' + err.message, 'error');
    }
  }

  async function createFolder() {
    const name = await showPrompt('New Folder', 'Enter folder name:');
    if (!name || !name.trim()) return;
    await FolderManager.create(name.trim());
    showToast('Folder created!', 'success');
    render();
  }

  async function manageFolders() {
    const modal = document.getElementById('manage-folders-modal');
    if (!modal) return;
    await renderFolderManager();
    modal.classList.add('active');
  }

  async function renderFolderManager() {
    const container = document.getElementById('manage-folders-list');
    if (!container) return;
    const folders = await FolderManager.getAll();
    container.innerHTML = '';
    if (!folders.length) {
      container.innerHTML = '<p style="color:var(--clr-text-muted);font-size:0.85rem;text-align:center;padding:16px">No folders yet</p>';
      return;
    }
    folders.forEach(f => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--clr-border)';
      row.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;color:var(--clr-primary);flex-shrink:0"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        <span style="flex:1;font-size:0.9rem">${escapeHtml(f.name)}</span>
        <button class="card-action-btn" data-id="${f.id}" style="color:var(--clr-danger)" title="Delete folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        const ok = await showConfirm('Delete Folder', `Delete folder "${f.name}"? Items in this folder will not be deleted.`);
        if (!ok) return;
        await FolderManager.remove(f.id);
        showToast('Folder deleted', 'warning');
        renderFolderManager();
      });
      container.appendChild(row);
    });
  }

  async function changeSecretPin() {
    const currentPin = await showPrompt('Change Secret PIN', 'Enter current Secret Vault PIN:');
    if (currentPin === null) return;
    if (currentPin !== SecretLock.getStoredPin()) {
      showToast('Incorrect current PIN', 'error');
      return;
    }
    const newPin = await showPrompt('Change Secret PIN', 'Enter new 4-digit PIN:');
    if (!newPin || !/^\d{4}$/.test(newPin)) { showToast('Invalid PIN. Must be 4 digits.', 'error'); return; }
    const confirm = await showPrompt('Confirm PIN', 'Confirm new PIN:');
    if (newPin !== confirm) { showToast('PINs do not match', 'error'); return; }
    SecretLock.setStoredPin(newPin);
    showToast('Secret PIN changed!', 'success');
  }

  async function render() {
    const container = document.getElementById('settings-panel-content') || document.getElementById('settings-panel');
    if (!container) return;

    const pwCount  = (await vaultDB.getAll('password', false)).length;
    const fileCount= (await vaultDB.getAll('file', false)).length;
    const devCount = (await vaultDB.getAll('dev', false)).length;
    const folderCount = (await vaultDB.getAllFolders()).length;
    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    const lastSyncStr = lastSync ? formatDate(lastSync) : 'Never';

    container.innerHTML = `
      <div class="settings-profile">
        <div class="settings-avatar">🔐</div>
        <div class="settings-profile-info">
          <h3>VaultX</h3>
          <p>${pwCount} passwords · ${fileCount} files · ${devCount} keys</p>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Security</div>
        <div class="settings-row" id="change-pin-row">
          <div class="settings-row-icon" style="background:rgba(108,99,255,0.12)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary)" stroke-width="2" style="width:18px;height:18px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label">Change PIN</div>
            <div class="settings-row-desc">Update your 4-digit unlock PIN</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
        <div class="settings-row" id="change-secret-pin-row">
          <div class="settings-row-icon" style="background:rgba(255,51,102,0.1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="#FF3366" stroke-width="2" style="width:18px;height:18px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label">Change Secret PIN</div>
            <div class="settings-row-desc">Update the Secret Vault PIN</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
        <div class="settings-row" id="lock-now-row">
          <div class="settings-row-icon" style="background:rgba(245,158,11,0.12)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--clr-warning)" stroke-width="2" style="width:18px;height:18px"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label">Lock Now</div>
            <div class="settings-row-desc">Immediately lock the vault</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Organisation</div>
        <div class="settings-row" id="create-folder-row">
          <div class="settings-row-icon" style="background:rgba(34,197,94,0.1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--clr-success)" stroke-width="2" style="width:18px;height:18px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label">Create Folder</div>
            <div class="settings-row-desc">${folderCount} folders</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
        <div class="settings-row" id="manage-folders-row">
          <div class="settings-row-icon" style="background:rgba(108,99,255,0.12)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary)" stroke-width="2" style="width:18px;height:18px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label">Manage Folders</div>
            <div class="settings-row-desc">View and delete folders</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Sync & Backup</div>
        <div class="settings-row" id="sync-now-row">
          <div class="settings-row-icon" style="background:rgba(34,197,94,0.1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--clr-success)" stroke-width="2" style="width:18px;height:18px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label">Sync Now</div>
            <div class="settings-row-desc">Last: ${lastSyncStr}</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
        <div class="settings-row" id="export-row">
          <div class="settings-row-icon" style="background:rgba(108,99,255,0.12)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary)" stroke-width="2" style="width:18px;height:18px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label">Export Data</div>
            <div class="settings-row-desc">Download encrypted backup as JSON</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
        <div class="settings-row" id="import-row">
          <div class="settings-row-icon" style="background:rgba(34,197,94,0.1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--clr-success)" stroke-width="2" style="width:18px;height:18px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label">Import Data</div>
            <div class="settings-row-desc">Restore from JSON backup</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Danger Zone</div>
        <div class="settings-row" id="clear-data-row">
          <div class="settings-row-icon" style="background:rgba(239,68,68,0.1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--clr-danger)" stroke-width="2" style="width:18px;height:18px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </div>
          <div class="settings-row-body">
            <div class="settings-row-label" style="color:var(--clr-danger)">Clear All Data</div>
            <div class="settings-row-desc">Permanently delete all local data</div>
          </div>
          <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>

      <div class="settings-version">VaultX v${APP_VERSION} · Offline-first Secure Vault</div>
    `;

    bindEvents(container);
    bindImportInput();
  }

  function bindEvents(container) {
    container.querySelector('#change-pin-row')?.addEventListener('click', () => LockScreen.startPinChange());
    container.querySelector('#change-secret-pin-row')?.addEventListener('click', changeSecretPin);
    container.querySelector('#lock-now-row')?.addEventListener('click', () => LockScreen.lock());
    container.querySelector('#create-folder-row')?.addEventListener('click', createFolder);
    container.querySelector('#manage-folders-row')?.addEventListener('click', manageFolders);
    container.querySelector('#sync-now-row')?.addEventListener('click', async () => {
      if (!navigator.onLine) { showToast('You are offline', 'warning'); return; }
      await syncEngine?.sync();
      await secretSyncEngine?.sync();
      showToast('Sync complete!', 'success');
      render();
    });
    container.querySelector('#export-row')?.addEventListener('click', exportData);
    container.querySelector('#import-row')?.addEventListener('click', () => document.getElementById('import-file-input')?.click());
    container.querySelector('#clear-data-row')?.addEventListener('click', clearAllData);
  }

  function bindImportInput() {
    const existing = document.getElementById('import-file-input');
    if (existing) { existing.remove(); }
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'import-file-input';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      if (input.files[0]) importData(input.files[0]);
    });
    document.body.appendChild(input);
  }

  return { render, exportData, importData, clearAllData, manageFolders, createFolder };
})();

// ── Prompt helper ────────────────────────────────────────────
function showPrompt(title, message, defaultValue = '') {
  return new Promise(resolve => {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog active';
    dialog.innerHTML = `
      <div class="confirm-box">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <input type="text" class="form-input" id="prompt-input" value="${escapeHtml(defaultValue)}" style="margin-bottom:16px" />
        <div class="confirm-actions">
          <button class="confirm-cancel" id="prompt-cancel">Cancel</button>
          <button class="confirm-ok" style="background:linear-gradient(135deg,var(--clr-primary),var(--clr-primary-dark))" id="prompt-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    const input = dialog.querySelector('#prompt-input');
    input.focus();
    dialog.querySelector('#prompt-cancel').onclick = () => { dialog.remove(); resolve(null); };
    dialog.querySelector('#prompt-ok').onclick = () => { const val = input.value; dialog.remove(); resolve(val); };
    input.onkeydown = e => { if (e.key === 'Enter') { const val = input.value; dialog.remove(); resolve(val); } };
  });
}
