/* ============================================================
   vault-files.js – File vault module
   ============================================================ */

const FileVault = (() => {

  function getFileExtension(name) {
    if (!name) return '';
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
  }

  function getFileEmoji(type) {
    if (!type) return '📎';
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf'))      return '📕';
    if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return '🗜️';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('sheet') || type.includes('excel'))   return '📊';
    if (type.includes('text'))   return '📄';
    if (type.includes('json'))   return '🔧';
    return '📎';
  }

  async function render(folderId, searchQuery) {
    const container = document.getElementById('files-list');
    if (!container) return;
    let items = await vaultDB.getAll('file', false);
    if (folderId) items = items.filter(i => i.folder === folderId);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.data?.fileName || '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    const countEl = document.getElementById('files-count');
    if (countEl) countEl.textContent = items.length;

    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <h3>No files yet</h3>
        <p>Tap the + button to upload your first file</p>
      </div>`;
      return;
    }

    items.forEach(item => {
      const ext   = getFileExtension(item.data?.fileName);
      const emoji = getFileEmoji(item.data?.fileType);
      const size  = formatFileSize(item.data?.fileSize);
      const card  = document.createElement('div');
      card.className = 'vault-card slide-up';
      card.innerHTML = `
        <div class="card-icon file" style="font-size:1.4rem">${emoji}</div>
        <div class="card-body">
          <div class="card-title">${escapeHtml(item.title)}</div>
          <div class="card-subtitle">
            <span class="file-badge">${ext}</span>
            <span class="file-size" style="margin-left:6px">${size}</span>
          </div>
          <div class="card-meta">${formatDate(item.updated_at)}</div>
        </div>
        <div class="card-actions">
          <button class="card-action-btn download-btn" data-id="${item.id}" title="Download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="card-action-btn fav-btn ${item.favorite ? 'active' : ''}" data-id="${item.id}" title="Favorite">
            <svg viewBox="0 0 24 24" fill="${item.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </button>
          <button class="card-action-btn delete-btn" data-id="${item.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      `;

      card.querySelector('.download-btn').addEventListener('click', e => {
        e.stopPropagation();
        downloadFile(item);
      });
      card.querySelector('.fav-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await FavoritesManager.toggle(item.id);
        render(folderId);
      });
      card.querySelector('.delete-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await deleteFile(item.id);
      });
      container.appendChild(card);
    });
  }

  function showAddModal() {
    openModal('file-modal');
    const input = document.getElementById('file-upload-input');
    const dropZone = document.getElementById('file-drop-zone');
    const preview = document.getElementById('file-preview');
    if (preview) preview.innerHTML = '';
    if (input) input.value = '';
    if (dropZone) {
      dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('drag-over'); };
      dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
      dropZone.ondrop = e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelected(file);
      };
      dropZone.onclick = () => input?.click();
    }
    if (input) {
      input.onchange = () => {
        if (input.files[0]) handleFileSelected(input.files[0]);
      };
    }
  }

  function handleFileSelected(file) {
    const preview = document.getElementById('file-preview');
    if (preview) {
      preview.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--clr-glass);border-radius:var(--radius-sm);margin-top:10px;">
          <span style="font-size:1.5rem">${getFileEmoji(file.type)}</span>
          <div>
            <div style="font-size:0.88rem;font-weight:600;">${escapeHtml(file.name)}</div>
            <div style="font-size:0.75rem;color:var(--clr-text-muted);">${formatFileSize(file.size)}</div>
          </div>
        </div>
      `;
    }
    const titleInput = document.getElementById('file-title');
    if (titleInput && !titleInput.value) {
      titleInput.value = file.name.replace(/\.[^.]+$/, '');
    }
  }

  async function uploadFile() {
    const input  = document.getElementById('file-upload-input');
    const title  = document.getElementById('file-title')?.value.trim();
    const folder = document.getElementById('file-folder-select')?.value || null;

    if (!input?.files[0]) { showToast('Please select a file', 'error'); return; }
    if (!title) { showToast('Title is required', 'error'); return; }

    const file = input.files[0];
    if (file.size > 50 * 1024 * 1024) { showToast('File too large (max 50MB)', 'error'); return; }

    try {
      const fileData = await readFileAsBase64(file);
      const data = {
        fileName:  file.name,
        fileType:  file.type,
        fileSize:  file.size,
        fileData:  fileData,
        storageUrl: null
      };
      await vaultDB.add({ type: 'file', title, data, folder });
      showToast('File saved!', 'success');
      closeModal('file-modal');
      render(folder);
      if (syncEngine) syncEngine.sync();
    } catch (err) {
      showToast('Failed to save file: ' + err.message, 'error');
    }
  }

  function readFileAsBase64(file) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = e => res(e.target.result);
      reader.onerror = () => rej(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async function downloadFile(item) {
    const data = item.data;
    if (!data) return;

    if (data.storageUrl) {
      const link = document.createElement('a');
      link.href = data.storageUrl;
      link.download = data.fileName || item.title;
      link.click();
      return;
    }

    if (data.fileData) {
      const link = document.createElement('a');
      link.href = data.fileData;
      link.download = data.fileName || item.title;
      link.click();
      return;
    }

    showToast('File data not available', 'error');
  }

  async function deleteFile(id) {
    const confirmed = await showConfirm('Delete File', 'This will permanently delete this file. Are you sure?');
    if (!confirmed) return;
    await vaultDB.delete(id);
    render(null);
    showToast('File deleted', 'warning');
    if (syncEngine) syncEngine.sync();
  }

  return { render, showAddModal, uploadFile, downloadFile, deleteFile };
})();
