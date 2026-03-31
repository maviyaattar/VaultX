import { decryptPayload, encryptPayload } from "./security.js";

const DB_NAME = "vaultx";
const DB_VERSION = 1;
const ITEM_STORE = "items";
const SECRET_ITEM_STORE = "secretItems";
const META_STORE = "meta";

let db;

function withStore(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function initDB() {
  if (db) return db;
  db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ITEM_STORE)) {
        const s = database.createObjectStore(ITEM_STORE, { keyPath: "id" });
        s.createIndex("updated_at", "updated_at");
      }
      if (!database.objectStoreNames.contains(SECRET_ITEM_STORE)) {
        const s = database.createObjectStore(SECRET_ITEM_STORE, { keyPath: "id" });
        s.createIndex("updated_at", "updated_at");
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return db;
}

function storeName(secret) {
  return secret ? SECRET_ITEM_STORE : ITEM_STORE;
}

export async function saveItem(input, secret = false) {
  await initDB();
  const timestamp = new Date().toISOString();
  const shouldEncrypt = secret || input.type !== "file";
  const prepared = {
    id: input.id || crypto.randomUUID(),
    type: input.type,
    title: input.title,
    data: shouldEncrypt ? await encryptPayload(input.data, secret) : input.data,
    folder: input.folder || "General",
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
    synced: false,
    deleted: Boolean(input.deleted),
    favorite: Boolean(input.favorite),
    secret,
  };
  await withStore(storeName(secret), "readwrite", (store) => store.put(prepared));
  return prepared;
}

export async function markDeleted(id, secret = false) {
  await initDB();
  const existing = await withStore(storeName(secret), "readonly", (store) => store.get(id));
  if (!existing) return;
  existing.deleted = true;
  existing.updated_at = new Date().toISOString();
  existing.synced = false;
  await withStore(storeName(secret), "readwrite", (store) => store.put(existing));
}

export async function listItems({ secret = false, includeDeleted = false } = {}) {
  await initDB();
  const rows = await withStore(storeName(secret), "readonly", (store) => store.getAll());
  const hydrated = [];
  for (const row of rows) {
    if (!includeDeleted && row.deleted) continue;
    hydrated.push({ ...row, data: await decryptPayload(row.data, secret) });
  }
  return hydrated.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export async function listRawUnsynced() {
  await initDB();
  const [items, secretItems] = await Promise.all([
    withStore(ITEM_STORE, "readonly", (store) => store.getAll()),
    withStore(SECRET_ITEM_STORE, "readonly", (store) => store.getAll()),
  ]);
  return [...items, ...secretItems].filter((item) => !item.synced);
}

export async function upsertFromCloud(row) {
  await initDB();
  const bucket = storeName(Boolean(row.secret));
  const existing = await withStore(bucket, "readonly", (store) => store.get(row.id));
  if (!existing || existing.updated_at <= row.updated_at) {
    await withStore(bucket, "readwrite", (store) => store.put({ ...row, synced: true }));
  }
}

export async function markSynced(ids = []) {
  await initDB();
  for (const id of ids) {
    for (const secret of [false, true]) {
      const bucket = storeName(secret);
      const existing = await withStore(bucket, "readonly", (store) => store.get(id));
      if (existing) {
        existing.synced = true;
        await withStore(bucket, "readwrite", (store) => store.put(existing));
      }
    }
  }
}

export async function setMeta(key, value) {
  await initDB();
  return withStore(META_STORE, "readwrite", (store) => store.put({ key, value }));
}

export async function getMeta(key) {
  await initDB();
  const result = await withStore(META_STORE, "readonly", (store) => store.get(key));
  return result?.value;
}

export async function clearAllData() {
  await initDB();
  await Promise.all([
    withStore(ITEM_STORE, "readwrite", (store) => store.clear()),
    withStore(SECRET_ITEM_STORE, "readwrite", (store) => store.clear()),
    withStore(META_STORE, "readwrite", (store) => store.clear()),
  ]);
}

export async function exportData() {
  await initDB();
  return {
    items: await withStore(ITEM_STORE, "readonly", (store) => store.getAll()),
    secretItems: await withStore(SECRET_ITEM_STORE, "readonly", (store) => store.getAll()),
  };
}

export async function importData(payload) {
  await initDB();
  const rows = [...(payload.items || []), ...(payload.secretItems || [])];
  for (const row of rows) {
    await upsertFromCloud(row);
  }
}
