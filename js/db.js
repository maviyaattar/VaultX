/* ============================================================
   db.js – IndexedDB wrapper for VaultX
   ============================================================ */

class VaultDB {
  constructor(dbName = 'vaultx_main', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      if (this.db) return resolve(this.db);
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('items')) {
          const store = db.createObjectStore('items', { keyPath: 'id' });
          store.createIndex('type',    'type',    { unique: false });
          store.createIndex('folder',  'folder',  { unique: false });
          store.createIndex('synced',  'synced',  { unique: false });
          store.createIndex('deleted', 'deleted', { unique: false });
          store.createIndex('favorite','favorite',{ unique: false });
        }
        if (!db.objectStoreNames.contains('folders')) {
          const fStore = db.createObjectStore('folders', { keyPath: 'id' });
          fStore.createIndex('synced',  'synced',  { unique: false });
          fStore.createIndex('deleted', 'deleted', { unique: false });
        }
      };
      req.onsuccess = e => { this.db = e.target.result; resolve(this.db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  _tx(storeName, mode = 'readonly') {
    return this.db.transaction(storeName, mode).objectStore(storeName);
  }

  _req(r) {
    return new Promise((res, rej) => { r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error); });
  }

  // ── Items ────────────────────────────────────────────────

  async getAll(type = null, includeDeleted = false) {
    await this.open();
    return new Promise((res, rej) => {
      const tx = this.db.transaction('items', 'readonly');
      const store = tx.objectStore('items');
      const req = store.getAll();
      req.onsuccess = e => {
        let items = e.target.result;
        if (!includeDeleted) items = items.filter(i => !i.deleted);
        if (type) items = items.filter(i => i.type === type);
        res(items);
      };
      req.onerror = e => rej(e.target.error);
    });
  }

  async getById(id) {
    await this.open();
    return this._req(this._tx('items').get(id));
  }

  async add(item) {
    await this.open();
    const now = new Date().toISOString();
    const newItem = {
      id: item.id || crypto.randomUUID(),
      type: item.type,
      title: item.title,
      data: item.data || {},
      folder: item.folder || null,
      created_at: now,
      updated_at: now,
      synced: false,
      deleted: false,
      favorite: item.favorite || false,
      vault: item.vault || 'main'
    };
    await this._req(this._tx('items', 'readwrite').add(newItem));
    return newItem;
  }

  async update(id, changes) {
    await this.open();
    const existing = await this.getById(id);
    if (!existing) throw new Error('Item not found: ' + id);
    const updated = { ...existing, ...changes, updated_at: new Date().toISOString(), synced: false };
    await this._req(this._tx('items', 'readwrite').put(updated));
    return updated;
  }

  async delete(id) {
    await this.open();
    return this.update(id, { deleted: true });
  }

  async hardDelete(id) {
    await this.open();
    return this._req(this._tx('items', 'readwrite').delete(id));
  }

  async getUnsynced() {
    await this.open();
    return new Promise((res, rej) => {
      const tx = this.db.transaction('items', 'readonly');
      const index = tx.objectStore('items').index('synced');
      const req = index.getAll(IDBKeyRange.only(false));
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async markSynced(id) {
    await this.open();
    const item = await this.getById(id);
    if (!item) return;
    const updated = { ...item, synced: true };
    return this._req(this._tx('items', 'readwrite').put(updated));
  }

  async upsertFromRemote(item) {
    await this.open();
    const existing = await this.getById(item.id);
    if (existing) {
      const localNewer = new Date(existing.updated_at) > new Date(item.updated_at);
      if (localNewer) return existing;
      const merged = { ...item, synced: true };
      await this._req(this._tx('items', 'readwrite').put(merged));
      return merged;
    } else {
      const newItem = { ...item, synced: true };
      await this._req(this._tx('items', 'readwrite').add(newItem));
      return newItem;
    }
  }

  // ── Folders ──────────────────────────────────────────────

  async getAllFolders(includeDeleted = false) {
    await this.open();
    return new Promise((res, rej) => {
      const req = this._tx('folders').getAll();
      req.onsuccess = e => {
        let folders = e.target.result;
        if (!includeDeleted) folders = folders.filter(f => !f.deleted);
        res(folders);
      };
      req.onerror = e => rej(e.target.error);
    });
  }

  async addFolder(folder) {
    await this.open();
    const now = new Date().toISOString();
    const newFolder = {
      id: folder.id || crypto.randomUUID(),
      name: folder.name,
      created_at: now,
      updated_at: now,
      synced: false,
      deleted: false
    };
    await this._req(this._tx('folders', 'readwrite').add(newFolder));
    return newFolder;
  }

  async updateFolder(id, changes) {
    await this.open();
    const existing = await this._req(this._tx('folders').get(id));
    if (!existing) throw new Error('Folder not found: ' + id);
    const updated = { ...existing, ...changes, updated_at: new Date().toISOString(), synced: false };
    await this._req(this._tx('folders', 'readwrite').put(updated));
    return updated;
  }

  async deleteFolder(id) {
    return this.updateFolder(id, { deleted: true });
  }

  async getUnsyncedFolders() {
    await this.open();
    return new Promise((res, rej) => {
      const index = this._tx('folders').index('synced');
      const req = index.getAll(IDBKeyRange.only(false));
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async markFolderSynced(id) {
    await this.open();
    const folder = await this._req(this._tx('folders').get(id));
    if (!folder) return;
    const updated = { ...folder, synced: true };
    return this._req(this._tx('folders', 'readwrite').put(updated));
  }

  async clearAll() {
    await this.open();
    await this._req(this._tx('items', 'readwrite').clear());
    await this._req(this._tx('folders', 'readwrite').clear());
  }

  async exportAll() {
    await this.open();
    const items   = await this.getAll(null, true);
    const folders = await this.getAllFolders(true);
    return { items, folders };
  }
}

// ── Secret Vault DB (separate database) ──────────────────────
class SecretVaultDB extends VaultDB {
  constructor() {
    super('vaultx_secret', 1);
  }
}

const vaultDB  = new VaultDB();
const secretDB = new SecretVaultDB();
