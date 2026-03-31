import { AUTO_LOCK_MS } from "./config.js";
import { clearAllData, exportData, importData, listItems, markDeleted, saveItem } from "./db.js";
import { clearSessionPins, setPin, setSessionPin, verifyPin } from "./security.js";
import { setupSyncListeners, syncNow } from "./sync.js";

const app = document.getElementById("app");
const content = document.getElementById("content");
const fab = document.getElementById("fab");
const pageTitle = document.getElementById("page-title");
const netIndicator = document.getElementById("network-indicator");
const syncIndicator = document.getElementById("sync-indicator");
const itemModal = document.getElementById("item-modal");
const itemForm = document.getElementById("item-form");

let activeTab = "password";
let secretUnlocked = false;
let globalQuery = "";
let timer;

function setNetworkState() {
  netIndicator.textContent = navigator.onLine ? "Online" : "Offline";
  netIndicator.classList.toggle("online", navigator.onLine);
  netIndicator.classList.toggle("offline", !navigator.onLine);
}

function setSyncLabel(label) {
  syncIndicator.textContent = label;
}

function resetAutoLock() {
  clearTimeout(timer);
  timer = setTimeout(lockApp, AUTO_LOCK_MS);
}

function lockApp() {
  clearSessionPins();
  secretUnlocked = false;
  app.classList.add("hidden");
  document.getElementById("lock-screen").classList.remove("hidden");
}

function formatItemData(item) {
  if (!item.data) return "Encrypted / unavailable";
  if (item.type === "password") return `${item.data.site || ""} • ${item.data.username || ""}`;
  if (item.type === "file") return item.data.fileName || "File item";
  return JSON.stringify(item.data).slice(0, 120);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isBase64(value) {
  if (typeof value !== "string" || !value.length) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value) && value.length % 4 === 0;
}

function extractBase64(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.includes(",")) {
    return normalized.split(",").pop().trim();
  }
  return normalized;
}

async function requestMaskedPin(label) {
  const dialog = document.createElement("dialog");
  dialog.className = "modal";
  dialog.innerHTML = `
    <form class="modal-body glass" method="dialog">
      <h3>${escapeHtml(label)}</h3>
      <input name="pin" type="password" inputmode="numeric" pattern="\\d{4}" minlength="4" maxlength="4" placeholder="••••" required />
      <menu class="inline">
        <button value="cancel" class="ghost">Cancel</button>
        <button value="default">Save</button>
      </menu>
    </form>
  `;
  document.body.appendChild(dialog);
  dialog.showModal();
  const form = dialog.querySelector("form");

  return await new Promise((resolve) => {
    form.onsubmit = (event) => {
      const pin = form.pin.value.trim();
      if (!/^\d{4}$/.test(pin)) {
        event.preventDefault();
        form.pin.reportValidity();
        return;
      }
      resolve(pin);
    };
    dialog.addEventListener("close", () => {
      if (!dialog.returnValue || dialog.returnValue === "cancel") resolve(null);
      dialog.remove();
    });
  });
}

async function renderTab() {
  const current = activeTab;
  pageTitle.textContent = current === "dev" ? "Developer Vault" : `${current[0].toUpperCase()}${current.slice(1)} Vault`;

  if (current === "settings") {
    content.innerHTML = `
      <section class="card glass">
        <h3>Security</h3>
        <div class="card-actions">
          <button data-action="change-pin">Change PIN</button>
          <button data-action="change-secret-pin">Change Secret PIN</button>
          <button data-action="export">Export JSON</button>
          <button data-action="import">Import JSON</button>
          <button class="warn" data-action="clear">Clear All Data</button>
        </div>
      </section>
    `;
    content.append(document.getElementById("about-template").content.cloneNode(true));
    attachSettingsHandlers();
    return;
  }

  const all = await listItems({ secret: false });
  const searched = all.filter((item) => {
    const matchesCurrent = globalQuery ? true : item.type === current;
    const matchesQuery =
      item.title.toLowerCase().includes(globalQuery) || JSON.stringify(item.data || {}).toLowerCase().includes(globalQuery);
    return matchesCurrent && matchesQuery;
  });

  content.innerHTML = `<input class="search-bar" id="global-search" placeholder="Search all vault data" value="${escapeHtml(globalQuery)}" />`;

  const folders = [...new Set(searched.map((item) => item.folder || "General"))];
  if (folders.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = `Folders: ${folders.join(", ")}`;
    content.appendChild(p);
  }

  for (const item of searched) {
    const card = document.createElement("section");
    card.className = "card glass";
    card.innerHTML = `
      <h3>${item.favorite ? "⭐ " : ""}${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(formatItemData(item))}</p>
      <p class="meta">Folder: ${escapeHtml(item.folder || "General")}</p>
      <div class="card-actions">
        <button data-act="fav">${item.favorite ? "Unfavorite" : "Favorite"}</button>
        <button data-act="edit">Edit</button>
        ${item.type === "password" ? `<button data-act="copy">Copy password</button>` : ""}
        ${item.type === "file" && (item.data?.public_url || item.data?.fileBlob || item.data?.cloud_path) ? `<button data-act="download">Open</button>` : ""}
        <button class="warn" data-act="delete">Delete</button>
      </div>
    `;

    card.querySelector('[data-act="fav"]').onclick = async () => {
      await saveItem({ ...item, favorite: !item.favorite, data: item.data }, false);
      renderTab();
    };
    card.querySelector('[data-act="edit"]').onclick = () => openItemModal(item);
    if (item.type === "password") {
      card.querySelector('[data-act="copy"]').onclick = () => navigator.clipboard.writeText(item.data?.password || "");
    }
    if (item.type === "file" && card.querySelector('[data-act="download"]')) {
      card.querySelector('[data-act="download"]').onclick = () => {
        if (item.data?.public_url) {
          window.open(item.data.public_url, "_blank");
          return;
        }
        if (item.data?.fileBlob) {
          const blobBase64 = extractBase64(item.data.fileBlob);
          if (!isBase64(blobBase64)) {
            alert("File data is invalid.");
            return;
          }
          const a = document.createElement("a");
          a.href = `data:application/octet-stream;base64,${blobBase64}`;
          a.download = item.data?.fileName || `${item.title}.bin`;
          a.click();
          return;
        }
        if (item.data?.cloud_path) {
          alert("File is synced. Public URL unavailable in offline mode.");
        }
      };
    }
    card.querySelector('[data-act="delete"]').onclick = async () => {
      await markDeleted(item.id);
      await syncNow(setSyncLabel);
      renderTab();
    };
    content.appendChild(card);
  }

  if (searched.length === 0) {
    const empty = document.createElement("section");
    empty.className = "card glass";
    empty.innerHTML = `<h3>No ${current} items yet</h3><p class="meta">Tap + to add your first item.</p>`;
    content.appendChild(empty);
  }

  document.getElementById("global-search").oninput = (event) => {
    globalQuery = event.target.value.trim().toLowerCase();
    renderTab();
  };
}

function itemFormFor(type, item = null) {
  const data = item?.data || {};
  const title = item?.title || "";
  const folder = item?.folder || "General";

  if (type === "password") {
    return `
      <h3>${item ? "Edit" : "Add"} Password</h3>
      <input name="title" required placeholder="Title" value="${escapeHtml(title)}" />
      <input name="site" required placeholder="Site" value="${escapeHtml(data.site || "")}" />
      <input name="username" placeholder="Username" value="${escapeHtml(data.username || "")}" />
      <input name="password" required placeholder="Password" value="${escapeHtml(data.password || "")}" />
      <input name="folder" placeholder="Folder" value="${escapeHtml(folder)}" />
      <menu class="inline"><button value="cancel" class="ghost">Cancel</button><button value="default">Save</button></menu>
    `;
  }

  if (type === "file") {
    return `
      <h3>${item ? "Edit" : "Add"} File</h3>
      <input name="title" required placeholder="Title" value="${escapeHtml(title)}" />
      <input name="file" type="file" ${item ? "" : "required"} />
      <input name="folder" placeholder="Folder" value="${escapeHtml(folder)}" />
      <menu class="inline"><button value="cancel" class="ghost">Cancel</button><button value="default">Save</button></menu>
    `;
  }

  return `
    <h3>${item ? "Edit" : "Add"} Developer Secret</h3>
    <input name="title" required placeholder="Title" value="${escapeHtml(title)}" />
    <textarea name="value" rows="6" placeholder="API key / token / JSON">${escapeHtml(data.value || "")}</textarea>
    <input name="folder" placeholder="Folder" value="${escapeHtml(folder)}" />
    <menu class="inline"><button value="cancel" class="ghost">Cancel</button><button value="default">Save</button></menu>
  `;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!reader.result) {
        reject(new Error("Failed to read file contents"));
        return;
      }
      const parts = String(reader.result).split(",");
      if (parts.length < 2 || !parts[1]) {
        reject(new Error("Failed to parse file: expected data URL payload"));
        return;
      }
      resolve(parts[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openItemModal(item = null) {
  itemForm.innerHTML = itemFormFor(activeTab, item);
  itemModal.showModal();
  itemForm.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(itemForm);
    let data;

    if (activeTab === "password") {
      data = {
        site: formData.get("site"),
        username: formData.get("username"),
        password: formData.get("password"),
      };
    } else if (activeTab === "file") {
      const selected = formData.get("file");
      data = item?.data || {};
      if (selected && selected.name) {
        data.fileName = selected.name;
        data.fileBlob = await fileToBase64(selected);
      }
    } else {
      data = { value: formData.get("value") };
    }

    await saveItem(
      {
        id: item?.id,
        created_at: item?.created_at,
        type: activeTab,
        title: formData.get("title"),
        folder: formData.get("folder"),
        favorite: item?.favorite,
        data,
      },
      false,
    );
    itemModal.close();
    await syncNow(setSyncLabel);
    renderTab();
  };
}

function attachSettingsHandlers() {
  content.querySelector('[data-action="change-pin"]').onclick = async () => {
    const next = await requestMaskedPin("Enter new 4-digit PIN");
    if (next) await setPin(next, false);
  };

  content.querySelector('[data-action="change-secret-pin"]').onclick = async () => {
    const next = await requestMaskedPin("Enter new 4-digit secret PIN");
    if (next) await setPin(next, true);
  };

  content.querySelector('[data-action="clear"]').onclick = async () => {
    if (confirm("Clear all local data?")) {
      await clearAllData();
      renderTab();
    }
  };

  content.querySelector('[data-action="export"]').onclick = async () => {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vaultx-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  content.querySelector('[data-action="import"]').onclick = () => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = "application/json";
    i.onchange = async () => {
      const file = i.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await importData(JSON.parse(text));
        renderTab();
      } catch {
        alert("Import failed. Please choose a valid JSON export.");
      }
    };
    i.click();
  };
}

function initPinPad({ containerId, dotsId, labelId, onSuccess, secret = false }) {
  const pinPad = document.getElementById(containerId);
  const dots = [...document.getElementById(dotsId).children];
  const label = document.getElementById(labelId);
  let pin = "";

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"];
  for (const key of keys) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = key;
    b.disabled = key === "";
    pinPad.appendChild(b);
    b.onclick = async () => {
      resetAutoLock();
      if (key === "⌫") pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += key;

      dots.forEach((dot, index) => dot.classList.toggle("filled", index < pin.length));
      if (pin.length === 4) {
        if (await verifyPin(pin, secret)) {
          label.textContent = "Unlocked";
          setSessionPin(pin, secret);
          pin = "";
          dots.forEach((dot) => dot.classList.remove("filled"));
          onSuccess();
        } else {
          pinPad.parentElement.classList.add("shake");
          setTimeout(() => pinPad.parentElement.classList.remove("shake"), 320);
          pin = "";
          label.textContent = "Wrong PIN";
          dots.forEach((dot) => dot.classList.remove("filled"));
        }
      }
    };
  }
}

function renderSecretVault() {
  if (!secretUnlocked) return;
  itemModal.close();
  activeTab = "settings";
  content.innerHTML = `<section class="card glass"><h3>Secret Vault</h3><p class="meta">Hidden encrypted entries</p></section>`;

  listItems({ secret: true }).then((items) => {
    for (const item of items) {
      const card = document.createElement("section");
      card.className = "card glass";
      card.innerHTML = `<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(JSON.stringify(item.data || {}))}</p><div class="card-actions"><button data-edit>Edit</button><button class="warn" data-del>Delete</button></div>`;
      card.querySelector("[data-edit]").onclick = () => openSecretItem(item);
      card.querySelector("[data-del]").onclick = async () => {
        await markDeleted(item.id, true);
        await syncNow(setSyncLabel);
        renderSecretVault();
      };
      content.appendChild(card);
    }

    const add = document.createElement("button");
    add.textContent = "Add secret";
    add.onclick = () => openSecretItem();
    content.appendChild(add);
  });
}

function openSecretItem(item = null) {
  itemForm.innerHTML = `
    <h3>${item ? "Edit" : "Add"} Secret</h3>
    <input name="title" required placeholder="Title" value="${escapeHtml(item?.title || "")}" />
    <textarea name="value" rows="6" placeholder="Secret text or JSON">${escapeHtml(item?.data?.value || "")}</textarea>
    <input name="folder" placeholder="Folder" value="${escapeHtml(item?.folder || "Secret")}" />
    <menu class="inline"><button value="cancel" class="ghost">Cancel</button><button value="default">Save</button></menu>
  `;
  itemModal.showModal();
  itemForm.onsubmit = async (event) => {
    event.preventDefault();
    const fd = new FormData(itemForm);
    await saveItem(
      {
        id: item?.id,
        created_at: item?.created_at,
        type: "secret",
        title: fd.get("title"),
        folder: fd.get("folder"),
        data: { value: fd.get("value") },
      },
      true,
    );
    itemModal.close();
    await syncNow(setSyncLabel);
    renderSecretVault();
  };
}

function bindAppEvents() {
  document.querySelectorAll(".bottom-nav button").forEach((button) => {
    button.onclick = () => {
      resetAutoLock();
      document.querySelectorAll(".bottom-nav button").forEach((n) => n.classList.remove("active"));
      button.classList.add("active");
      activeTab = button.dataset.tab;
      fab.classList.toggle("hidden", activeTab === "settings");
      renderTab();
    };
  });

  const settingsButton = document.querySelector('.bottom-nav button[data-tab="settings"]');
  let longPressTimer;
  settingsButton.onpointerdown = () => {
    longPressTimer = setTimeout(() => {
      document.getElementById("secret-lock-screen").classList.remove("hidden");
    }, 3000);
  };
  settingsButton.onpointerup = () => clearTimeout(longPressTimer);
  settingsButton.onpointerleave = () => clearTimeout(longPressTimer);

  fab.onclick = () => openItemModal();

  ["click", "keydown", "touchstart"].forEach((evt) => {
    window.addEventListener(evt, resetAutoLock, { passive: true });
  });

  window.addEventListener("online", setNetworkState);
  window.addEventListener("offline", setNetworkState);
}

async function init() {
  setNetworkState();

  initPinPad({
    containerId: "pin-pad",
    dotsId: "pin-dots",
    labelId: "lock-label",
    onSuccess: async () => {
      document.getElementById("lock-screen").classList.add("hidden");
      app.classList.remove("hidden");
      resetAutoLock();
      await syncNow(setSyncLabel);
      renderTab();
    },
  });

  initPinPad({
    containerId: "secret-pin-pad",
    dotsId: "secret-pin-dots",
    labelId: "secret-lock-label",
    secret: true,
    onSuccess: () => {
      secretUnlocked = true;
      document.getElementById("secret-lock-screen").classList.add("hidden");
      renderSecretVault();
    },
  });

  setupSyncListeners(() => syncNow(setSyncLabel));
  bindAppEvents();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
  }
}

init();
