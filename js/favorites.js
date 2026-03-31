/* ============================================================
   favorites.js – Favorites logic
   ============================================================ */

const FavoritesManager = (() => {
  async function toggle(id, db) {
    const _db = db || vaultDB;
    const item = await _db.getById(id);
    if (!item) return null;
    return _db.update(id, { favorite: !item.favorite });
  }

  async function getAll(db) {
    const _db = db || vaultDB;
    const items = await _db.getAll(null, false);
    return items.filter(i => i.favorite);
  }

  async function renderSection(containerId, db) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const favs = await getAll(db);
    container.innerHTML = '';
    if (!favs.length) {
      container.innerHTML = '<p style="color:var(--clr-text-muted);font-size:0.82rem;">No favorites yet. Star items to add them here.</p>';
      return;
    }
    favs.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vault-card';
      const iconMap = { password: '🔑', file: '📄', dev: '⚙️' };
      card.innerHTML = `
        <div class="card-icon ${item.type}">
          <span style="font-size:1.3rem">${iconMap[item.type] || '📦'}</span>
        </div>
        <div class="card-body">
          <div class="card-title">${escapeHtml(item.title)}</div>
          <div class="card-meta">${item.type.toUpperCase()}</div>
        </div>
        <div class="card-actions">
          <button class="card-action-btn fav-btn active" data-id="${item.id}" title="Remove from favorites">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </button>
        </div>
      `;
      card.querySelector('.fav-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await toggle(item.id, db);
        renderSection(containerId, db);
        window.dispatchEvent(new CustomEvent('vault:item_changed'));
      });
      container.appendChild(card);
    });
  }

  return { toggle, getAll, renderSection };
})();
