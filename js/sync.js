/* ============================================================
   sync.js – Supabase sync engine for VaultX (FINAL)
   ============================================================ */

const LAST_SYNC_KEY = 'vaultx_last_sync';
const LAST_SECRET_SYNC_KEY = 'vaultx_last_secret_sync';

const TABLE_NAME = "vault_data";
const STORAGE_BUCKET = "vault-files";

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
    this._indicator.textContent = status === 'ok' ? '✓' :
                                  status === 'error' ? '✕' : '↻';
  }

  getLastSync() {
    return localStorage.getItem(this.lastSyncKey) || '1970-01-01T00:00:00.000Z';
  }

  setLastSync(ts) {
    localStorage.setItem(this.lastSyncKey, ts);
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
      updated_at: item.updated_at || item.created_at,
      deleted:    item.deleted || false,
      favorite:   item.favorite || false,
      vault:      this.vault
    }));

    const { error } = await this.client
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: 'id' });

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
    if (!data?.length) return 0;

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
      updated_at: f.updated_at || f.created_at,
      deleted:    f.deleted || false,
      favorite:   false,
      vault:      this.vault
    }));

    const { error } = await this.client
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;

    for (const f of unsynced) {
      await this.db.markFolderSynced(f.id);
    }

    return unsynced.length;
  }

  async syncFiles() {
    const items = await this.db.getAll('file', false);

    for (const item of items) {
      if (item.data?.fileData && !item.data?.storageUrl) {
        try {
          const base64 = item.data.fileData;
          const byteString = atob(base64.split(',')[1] || base64);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);

          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }

          const blob = new Blob([ab], { type: item.data.fileType || 'application/octet-stream' });
          const path = `${this.vault}/${item.id}_${item.data.fileName}`;

          const { error } = await this.client
            .storage.from(STORAGE_BUCKET)
            .upload(path, blob, { upsert: true });

          if (!error) {
            const { data: urlData } = this.client
              .storage.from(STORAGE_BUCKET)
              .getPublicUrl(path);

            const updatedData = {
              ...item.data,
              storageUrl: urlData.publicUrl,
              fileData: null
            };

            await this.db.update(item.id, { data: updatedData });

            await this.client.from(TABLE_NAME).upsert({
              id: item.id,
              type: item.type,
              title: item.title,
              data: updatedData,
              folder: item.folder,
              created_at: item.created_at,
              updated_at: item.updated_at,
              deleted: item.deleted,
              favorite: item.favorite,
              vault: this.vault
            }, { onConflict: 'id' });

            await this.db.markSynced(item.id);
          }

        } catch (e) {
          console.warn("File sync failed:", e);
        }
      }
    }
  }

  async sync() {
    if (this.syncing) return;
    this.syncing = true;

    this._setStatus('syncing');

    try {
      if (!navigator.onLine) return;

      console.log("🔄 Sync started");

      const pushed  = await this.pushLocalChanges();
      await this.syncFiles();
      const folders = await this.pushFolderChanges();
      const pulled  = await this.pullRemoteChanges();

      this.setLastSync(new Date().toISOString());

      console.log("✅ Sync done:", { pushed, pulled, folders });

      this._setStatus('ok');
      window.dispatchEvent(new Event('vault:synced'));

    } catch (err) {
      console.error("❌ Sync error:", err);
      this._setStatus('error');
    } finally {
      this.syncing = false;
    }
  }

  startAutoSync(intervalMs = 60000) {
    if (!this._autoSyncStarted) {
      this._autoSyncStarted = true;

      window.addEventListener('online', () => {
        this.online = true;
        this.sync();
      });

      window.addEventListener('offline', () => {
        this.online = false;
      });
    }

    if (intervalMs > 0) {
      if (this.syncTimer) clearInterval(this.syncTimer);
      this.syncTimer = setInterval(() => this.sync(), intervalMs);
    }
  }
}

/* INIT */

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
