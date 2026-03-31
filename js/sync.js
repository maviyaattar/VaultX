import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { getMeta, listRawUnsynced, markSynced, setMeta, upsertFromCloud } from "./db.js";

let supabaseClient = null;

async function getClient() {
  if (supabaseClient) return supabaseClient;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch {
    supabaseClient = null;
  }
  return supabaseClient;
}

async function syncFiles(client, pending) {
  for (const row of pending.filter((entry) => entry.type === "file" && !entry.deleted)) {
    if (row.data?.v) continue;
    if (row.data?.fileBlob && !row.data?.cloud_path) {
      const cleanBase64 = row.data.fileBlob.split(",").pop();
      const binary = Uint8Array.from(atob(cleanBase64), (char) => char.charCodeAt(0));
      const path = `${row.id}-${Date.now()}-${row.title}`;
      const { error } = await client.storage.from("vault-files").upload(path, binary, { upsert: true });
      if (!error) {
        row.data.cloud_path = path;
        const { data: pub } = client.storage.from("vault-files").getPublicUrl(path);
        row.data.public_url = pub?.publicUrl;
        delete row.data.fileBlob;
      }
    }
  }
}

export async function syncNow(setSyncLabel = () => {}) {
  if (!navigator.onLine) return;
  const client = await getClient();
  if (!client) {
    setSyncLabel("Sync unavailable");
    return;
  }

  setSyncLabel("Syncing...");
  const pending = await listRawUnsynced();
  await syncFiles(client, pending);

  if (pending.length) {
    const { error } = await client.from("vault_data").upsert(pending, { onConflict: "id" });
    if (!error) {
      await markSynced(pending.map((entry) => entry.id));
    }
  }

  const lastSync = (await getMeta("last_sync")) || "1970-01-01T00:00:00.000Z";
  const { data } = await client
    .from("vault_data")
    .select("id,type,title,data,folder,created_at,updated_at,synced,deleted,favorite,secret")
    .gte("updated_at", lastSync)
    .order("updated_at", { ascending: true });

  for (const row of data || []) {
    await upsertFromCloud({ ...row, synced: true });
  }

  await setMeta("last_sync", new Date().toISOString());
  setSyncLabel("Synced");
  setTimeout(() => setSyncLabel("Idle"), 1200);
}

export function setupSyncListeners(onSync) {
  window.addEventListener("online", onSync);
  const tick = setInterval(onSync, 18_000);
  return () => clearInterval(tick);
}
