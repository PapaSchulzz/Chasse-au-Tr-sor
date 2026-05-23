const DATA_BASE = 'data';
const ITEM_IMG_BASE = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.8';

function itemImageUrl(materialName) {
  const name = materialName.toLowerCase();
  // On essaie d'abord items/, le onerror inline bascule vers blocks/ si absent.
  return `${ITEM_IMG_BASE}/items/${name}.png`;
}

function itemImageFallback(materialName) {
  return `${ITEM_IMG_BASE}/blocks/${materialName.toLowerCase()}.png`;
}

function skinUrl(uuid) {
  // Crafatar : avatar (tête) du joueur
  return `https://crafatar.com/avatars/${uuid}?size=64&overlay`;
}

function prettyItem(name) {
  return name.toLowerCase().split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short'
  });
}

async function loadIndex() {
  const res = await fetch(`${DATA_BASE}/index.json?t=${Date.now()}`);
  if (!res.ok) throw new Error('Impossible de charger index.json');
  return res.json();
}

async function loadGame(id) {
  const res = await fetch(`${DATA_BASE}/games/${id}.json?t=${Date.now()}`);
  if (!res.ok) throw new Error('Impossible de charger ' + id);
  return res.json();
}

function renderStats(games) {
  const bar = document.getElementById('stats-bar');
  if (!games || games.length === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const totalGames = games.length;
  const winners = {};
  let totalDuration = 0;
  let fastest = Infinity;
  for (const g of games) {
    winners[g.winner] = (winners[g.winner] || 0) + 1;
    totalDuration += g.durationMs;
    if (g.durationMs < fastest) fastest = g.durationMs;
  }
  const topWinner = Object.entries(winners).sort((a, b) => b[1] - a[1])[0];
  const avgDuration = totalDuration / totalGames;
  bar.innerHTML = `
    <div class="stat-card"><div class="value">${totalGames}</div><div class="label">Parties</div></div>
    <div class="stat-card"><div class="value">${escapeHtml(topWinner[0])}</div><div class="label">${topWinner[1]} victoire${topWinner[1] > 1 ? 's' : ''}</div></div>
    <div class="stat-card"><div class="value">${formatDuration(fastest)}</div><div class="label">Meilleur temps</div></div>
    <div class="stat-card"><div class="value">${formatDuration(avgDuration)}</div><div class="label">Temps moyen</div></div>
  `;
  document.getElementById('games-count').textContent = totalGames;
}

function renderList(games) {
  const list = document.getElementById('games-list');
  if (!games || games.length === 0) {
    list.innerHTML = '<div class="empty">Aucune chasse enregistrée pour le moment. Lance une partie sur le serveur !</div>';
    return;
  }
  list.innerHTML = '';
  for (const g of games) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="card-winner">
        <img src="${skinUrl(g.winnerUuid || '00000000-0000-0000-0000-000000000000')}" alt="" onerror="this.src='https://crafatar.com/avatars/00000000-0000-0000-0000-000000000000?size=64&overlay'" />
        <div>
          <div class="winner-label">🏆 Gagnant</div>
          <div class="winner-name">${escapeHtml(g.winner)}</div>
        </div>
      </div>
      <div class="card-mid">
        <div class="date">${formatDate(g.start)}</div>
        <div class="meta">${g.itemCount} item${g.itemCount > 1 ? 's' : ''} · ${g.playerCount} joueur${g.playerCount > 1 ? 's' : ''}</div>
        ${g.items ? `<div class="card-items">${g.items.slice(0, 12).map(i => `<img src="${itemImageUrl(i)}" alt="${escapeHtml(i)}" title="${escapeHtml(prettyItem(i))}" data-fallback="${itemImageFallback(i)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';}" />`).join('')}${g.items.length > 12 ? `<span class="meta">+${g.items.length - 12}</span>` : ''}</div>` : ''}
      </div>
      <div class="card-right">
        <div class="duration">⏱ ${formatDuration(g.durationMs)}</div>
        <div class="meta">Voir détails →</div>
      </div>
    `;
    card.addEventListener('click', () => showDetail(g.id));
    list.appendChild(card);
  }
}

async function showDetail(id) {
  document.getElementById('list-view').hidden = true;
  const detail = document.getElementById('detail-view');
  detail.hidden = false;
  const container = document.getElementById('game-detail');
  container.innerHTML = '<p class="empty">Chargement…</p>';
  try {
    const g = await loadGame(id);
    container.innerHTML = renderDetail(g);
  } catch (e) {
    container.innerHTML = `<p class="empty">Erreur : ${escapeHtml(e.message)}</p>`;
  }
}

function renderDetail(g) {
  const itemsHtml = g.items.map(i => `
    <div class="item-card">
      <img src="${itemImageUrl(i)}" alt="${escapeHtml(i)}" data-fallback="${itemImageFallback(i)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';}" />
      <div class="name">${escapeHtml(prettyItem(i))}</div>
    </div>
  `).join('');

  const sortedPlayers = [...g.players].sort((a, b) => {
    if (a.winner !== b.winner) return a.winner ? -1 : 1;
    return b.found.length - a.found.length;
  });

  const playersHtml = sortedPlayers.map(p => {
    const foundSet = new Set(p.found);
    const itemsCellHtml = g.items.map(i => {
      const got = foundSet.has(i);
      return `<img src="${itemImageUrl(i)}" alt="${escapeHtml(i)}" title="${escapeHtml(prettyItem(i))}${got ? '' : ' (manquant)'}" class="${got ? '' : 'missing'}" data-fallback="${itemImageFallback(i)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.opacity=0;}" />`;
    }).join('');
    return `
      <tr class="${p.winner ? 'winner-row' : ''}">
        <td>
          <div class="player-cell">
            <img src="${skinUrl(p.uuid)}" alt="" onerror="this.style.visibility='hidden'" />
            <span>${p.winner ? '🏆 ' : ''}${escapeHtml(p.name)}</span>
          </div>
        </td>
        <td>${p.found.length} / ${g.items.length}</td>
        <td><div class="found-list">${itemsCellHtml}</div></td>
      </tr>
    `;
  }).join('');

  return `
    <div class="detail-header">
      <h2>Chasse du ${escapeHtml(formatDate(g.start))}</h2>
      <div class="meta">Durée : ⏱ ${formatDuration(g.durationMs)} · ${g.items.length} items · ${g.players.length} joueur(s)</div>
      <div class="winner-banner">🏆 Gagnant : <span class="name">${escapeHtml(g.winner)}</span></div>
    </div>

    <h3>Items à trouver</h3>
    <div class="items-grid">${itemsHtml}</div>

    <h3>Classement</h3>
    <table class="players-table">
      <thead>
        <tr><th>Joueur</th><th>Score</th><th>Items collectés</th></tr>
      </thead>
      <tbody>${playersHtml}</tbody>
    </table>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

document.getElementById('back-btn').addEventListener('click', () => {
  document.getElementById('detail-view').hidden = true;
  document.getElementById('list-view').hidden = false;
});

loadIndex()
  .then(games => { renderStats(games); renderList(games); })
  .catch(e => {
    document.getElementById('games-list').innerHTML =
      `<div class="empty">Erreur de chargement : ${escapeHtml(e.message)}</div>`;
  });
