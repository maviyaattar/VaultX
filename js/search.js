/* ============================================================
   search.js – Global search
   ============================================================ */

const SearchEngine = (() => {
  let _active = false;

  async function search(query) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const all = await vaultDB.getAll(null, false);
    return all.filter(item =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.data?.username || '').toLowerCase().includes(q) ||
      (item.data?.url || '').toLowerCase().includes(q) ||
      (item.data?.notes || '').toLowerCase().includes(q) ||
      (item.data?.keyName || '').toLowerCase().includes(q) ||
      (item.data?.fileName || '').toLowerCase().includes(q)
    );
  }

  function highlight(text, query) {
    if (!text || !query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const re = new RegExp(`(${escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return escaped.replace(re, '<mark style="background:rgba(108,99,255,0.3);color:inherit;border-radius:2px;padding:0 2px;">$1</mark>');
  }

  function renderResults(results, query, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!results.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </div>
        <h3>No results</h3>
        <p>Nothing matches "${escapeHtml(query)}"</p>
      </div>`;
      return;
    }
    results.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vault-card slide-up';
      const iconMap = { password: '🔑', file: '📄', dev: '⚙️' };
      const icon = iconMap[item.type] || '📦';
      const sub = item.data?.username || item.data?.url || item.data?.fileName || item.data?.keyName || '';
      card.innerHTML = `
        <div class="card-icon ${item.type}">
          <span style="font-size:1.3rem">${icon}</span>
        </div>
        <div class="card-body">
          <div class="card-title">${highlight(item.title, query)}</div>
          ${sub ? `<div class="card-subtitle">${highlight(sub, query)}</div>` : ''}
          <div class="card-meta">${item.type.toUpperCase()} · ${formatDate(item.updated_at)}</div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function toggle() {
    _active = !_active;
    const bar = document.getElementById('search-bar');
    const input = document.getElementById('search-input');
    if (bar) bar.classList.toggle('active', _active);
    if (_active && input) { input.focus(); }
    else if (input) { input.value = ''; hideSearchResults(); }
  }

  function hideSearchResults() {
    const panel = document.getElementById('search-results-panel');
    if (panel) panel.style.display = 'none';
  }

  async function handleInput(query) {
    const panel = document.getElementById('search-results-panel');
    if (!panel) return;
    if (!query || query.length < 2) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    const results = await search(query);
    renderResults(results, query, 'search-results-list');
  }

  return { search, highlight, renderResults, toggle, handleInput };
})();

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
