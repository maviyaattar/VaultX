/* ============================================================
   sync.js – Supabase sync engine for VaultX
   ============================================================ */

const LAST_SYNC_KEY = 'vaultx_last_sync';
const LAST_SECRET_SYNC_KEY = 'vaultx_last_secret_sync';

class SyncEngine {
  constructor(supabaseClient, db, options = {}) {
    this.client           = supabaseClient;
    this.db               = db;
    this.vault            = options.vault || 'main';
    this.lastSyncKey      = options.lastSyncKey || LAST_SYNC_KEY;
    this.syncing          = false;
    this.syncTimer        = null;
    this._indicator       = null;
    this.online           = navigator.onLine;
    this._autoSyncStarted = false;
  }

  setIndicator(el) { this._indicator = el; }

  _setStatus(status) {
    if (!this._indicator) return;
    this._indicator.className = 'sync-indicator ' + status;
    if (status === 'syncing') {
      this._indicator.textContent = '↻';
    } else if (status === 'ok') {
      this._indicator.textContent = '✓';
    } else if (status === 'error') {
      this._indicator.textContent = '✕';
    } else {
      this._indicator.textContent = '↻';
    }
  }

  getLastSync() {
    return localStorage.getItem(this.lastSyncKey) || '1970-01-01T00:00:00.000Z';
  }

  setLastSync(ts) {
    localStorage.setItem(this.lastSyncKey, ts);
  }

  resolveConflict(local, remote) {
    return new Date(local.updated_at) >= new Date(remote.updated_at) ? local : remote;
  }

  async pushLocalChanges() {
    const unsynced = await this.db.getUnsynced();
    if (!unsynced.length) return 0;

    const rows = unsynced.map(item => ({
      id:         item.id,
      type:       item.type,
      title:      item.title,
      data:       item.data,
      folder:     item.folder,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted:    item.deleted,
      favorite:   item.favorite,
      vault:      this.vault
    }));

    const { error } = await this.client.from(TABLE_NAME).upsert(rows, { onConflict: 'id' });
    if (error) throw error;

    for (const item of unsynced) {
      await this.db.markSynced(item.id);
    }
    return unsynced.length;
  }

  async pullRemoteChanges() {
    const lastSync = this.getLastSync();
    const { data, error } = await this.client
      .from(TABLE_NAME)
      .select('*')
      .eq('vault', this.vault)
      .gt('updated_at', lastSync);

    if (error) throw error;
    if (!data || !data.length) return 0;

    for (const remote of data) {
      await this.db.upsertFromRemote(remote);
    }
    return data.length;
  }

  async pushFolderChanges() {
    const unsynced = await this.db.getUnsyncedFolders();
    if (!unsynced.length) return 0;

    const rows = unsynced.map(f => ({
      id:         'folder_' + f.id,
      type:       'folder',
      title:      f.name,
      data:       { folder_id: f.id, name: f.name },
      folder:     null,
      created_at: f.created_at,
      updated_at: f.updated_at,
      deleted:    f.deleted,
      favorite:   false,
      vault:      this.vault
    }));

    const { error } = await this.client.from(TABLE_NAME).upsert(rows, { onConflict: 'id' });
    if (error) throw error;

    for (const f of unsynced) {
      await this.db.markFolderSynced(f.id);
    }
    return unsynced.length;
  }

  async syncFiles() {
    const items = await this.db.getAll('file', false);
    for (const item of items) {
      if (item.data && item.data.fileData && !item.data.storageUrl) {
        try {
          const base64 = item.data.fileData;
          const byteString = atob(base64.split(',')[1] || base64);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const blob = new Blob([ab], { type: item.data.fileType || 'application/octet-stream' });
          const path = `${this.vault}/${item.id}_${item.data.fileName}`;
          const { error } = await this.client.storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: true });
          if (!error) {
            const { data: urlData } = this.client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
            const updatedData = { ...item.data, storageUrl: urlData.publicUrl, fileData: null };
            await this.db.update(item.id, { data: updatedData });
            // Push updated metadata row (with storageUrl) to Supabase and mark synced
            const { error: upsertErr } = await this.client.from(TABLE_NAME).upsert({
              id:         item.id,
              type:       item.type,
              title:      item.title,
              data:       updatedData,
              folder:     item.folder,
              created_at: item.created_at,
              updated_at: item.updated_at,
              deleted:    item.deleted,
              favorite:   item.favorite,
              vault:      this.vault
            }, { onConflict: 'id' });
            if (!upsertErr) {
              await this.db.markSynced(item.id);
            }
          }
        } catch (e) {
          console.warn('File sync failed for', item.id, e);
        }
      }
    }
  }

  // 🔄 SYNC FUNCTION (FULL WORKING + ALERT DEBUG)

function sync() {

  alert("🔄 Sync started");

  // 🌐 Check internet
  if (!navigator.onLine) {
    alert("❌ Offline - sync skipped");
    return;
  }

  if (!db) {
    alert("❌ DB not ready");
    return;
  }

  try {
    let tx = db.transaction("items", "readonly");
    let store = tx.objectStore("items");
    let req = store.getAll();

    req.onsuccess = function () {

      let allItems = req.result || [];
      alert("📦 Total items: " + allItems.length);

      let unsynced = allItems.filter(i => !i.synced);
      alert("🚀 Unsynced items: " + unsynced.length);

      if (unsynced.length === 0) {
        alert("✅ Nothing to sync");
        return;
      }

      // 🔁 Loop items
      unsynced.forEach(async (i) => {

        try {

          // ✅ CLEAN OBJECT (IMPORTANT)
          let cleanItem = {
            id: i.id,
            type: i.type,
            title: i.title,
            data: i.data,
            folder: i.folder,
            created_at: i.created_at
          };

          alert("📤 Sending: " + JSON.stringify(cleanItem));

          const { error } = await supabaseClient
            .from("vault_data")
            .upsert([cleanItem], { onConflict: "id" });

          if (error) {
            alert("❌ SYNC ERROR: " + error.message);
            console.log(error);
            return;
          }

          alert("✅ Synced: " + i.id);

          // 🔄 mark synced
          let tx2 = db.transaction("items", "readwrite");
          let store2 = tx2.objectStore("items");

          i.synced = true;
          store2.put(i);

        } catch (err) {
          alert("🔥 LOOP ERROR: " + err.message);
          console.log(err);
        }

      });

      alert("🎉 Sync process done");

    };

    req.onerror = function () {
      alert("❌ DB READ ERROR");
    };

  } catch (err) {
    alert("🔥 SYNC CRASH: " + err.message);
    console.log(err);
  }
}
  startAutoSync(intervalMs = 60000) {
    if (!this._autoSyncStarted) {
      this._autoSyncStarted = true;
      window.addEventListener('online', () => {
        this.online = true;
        const netEl = document.getElementById('net-indicator');
        if (netEl) { netEl.className = 'net-indicator'; }
        this.sync();
      });
      window.addEventListener('offline', () => {
        this.online = false;
        const netEl = document.getElementById('net-indicator');
        if (netEl) { netEl.className = 'net-indicator offline'; }
      });
    }
    if (intervalMs > 0) {
      if (this.syncTimer) clearInterval(this.syncTimer);
      this.syncTimer = setInterval(() => this.sync(), intervalMs);
    }
    if (!navigator.onLine) {
      const netEl = document.getElementById('net-indicator');
      if (netEl) { netEl.className = 'net-indicator offline'; }
    }
  }

  stopAutoSync() {
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }
  }
}

let syncEngine       = null;
let secretSyncEngine = null;

function initSyncEngines(supabaseClient) {
  syncEngine = new SyncEngine(supabaseClient, vaultDB, {
    vault: 'main',
    lastSyncKey: LAST_SYNC_KEY
  });
  secretSyncEngine = new SyncEngine(supabaseClient, secretDB, {
    vault: 'secret',
    lastSyncKey: LAST_SECRET_SYNC_KEY
  });
}

function trySyncAll() {
  if (syncEngine)       syncEngine.sync();
  if (secretSyncEngine) secretSyncEngine.sync();
}
