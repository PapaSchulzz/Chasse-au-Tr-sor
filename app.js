const DATA_BASE = 'data';
const ITEM_IMG_BASE = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.8';

// Items dont la texture est animée dans minecraft-assets (frames _00.._NN).
// On choisit une frame représentative pour l'inventaire.
const ANIMATED_ITEM_FRAMES = {
  compass: 16,
  recovery_compass: 16,
  clock: 28,
};

function itemImageUrl(materialName) {
  const name = materialName.toLowerCase();
  if (name in ANIMATED_ITEM_FRAMES) {
    const frame = String(ANIMATED_ITEM_FRAMES[name]).padStart(2, '0');
    return `${ITEM_IMG_BASE}/items/${name}_${frame}.png`;
  }
  // On essaie d'abord items/, le onerror inline bascule vers blocks/ si absent.
  return `${ITEM_IMG_BASE}/items/${name}.png`;
}

function itemImageFallback(materialName) {
  return `${ITEM_IMG_BASE}/blocks/${materialName.toLowerCase()}.png`;
}

function skinUrl(playerNameOrObj) {
  // Préférer l'UUID si dispo : mc-heads.net cache parfois une vieille version par pseudo
  // (skin changé, pseudo recyclé…). L'UUID renvoie toujours le skin actuel.
  if (playerNameOrObj && typeof playerNameOrObj === 'object') {
    if (playerNameOrObj.uuid) {
      return `https://mc-heads.net/avatar/${encodeURIComponent(playerNameOrObj.uuid)}/64`;
    }
    return `https://mc-heads.net/avatar/${encodeURIComponent(playerNameOrObj.name || 'MHF_Steve')}/64`;
  }
  return `https://mc-heads.net/avatar/${encodeURIComponent(playerNameOrObj || 'MHF_Steve')}/64`;
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

async function loadLive() {
  try {
    const res = await fetch(`${DATA_BASE}/live.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

let liveTickHandle = null;

function renderLiveBanner(live, games) {
  const banner = document.getElementById('live-banner');
  const hide = () => {
    banner.hidden = true;
    banner.innerHTML = '';
    banner.classList.remove('pending-state');
    if (liveTickHandle) { clearInterval(liveTickHandle); liveTickHandle = null; }
  };
  if (!live || (!live.start && !live.startAt)) {
    hide();
    return;
  }
  // Garde-fou : si live.json n'a pas été nettoyé côté plugin mais que la partie
  // figure déjà dans l'historique (même timestamp de début), considérer la partie terminée.
  if (live.start && Array.isArray(games) && games.some(g => g.start === live.start)) {
    hide();
    return;
  }
  banner.hidden = false;
  const isPending = live.status === 'pending' || (!live.start && live.startAt);
  banner.classList.toggle('pending-state', isPending);
  const items = Array.isArray(live.items) ? live.items : [];
  const itemsHtml = items.map(i =>
    `<img src="${itemImageUrl(i)}" alt="${escapeHtml(i)}" title="${escapeHtml(prettyItem(i))}" data-fallback="${itemImageFallback(i)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';}" />`
  ).join('');
  const playerCount = live.playerCount != null ? live.playerCount : '?';

  const render = () => {
    if (isPending) {
      const startAtMs = new Date(live.startAt).getTime();
      const remaining = Math.max(0, startAtMs - Date.now());
      banner.innerHTML = `
        <div class="live-pulse pending" aria-hidden="true"></div>
        <div class="live-main">
          <div class="live-label">DÉMARRAGE IMMINENT</div>
          <div class="live-meta">${items.length} item${items.length > 1 ? 's' : ''} · ${playerCount} joueur${playerCount > 1 ? 's' : ''} · démarre dans ${formatDuration(remaining)}</div>
        </div>
        <div class="live-items">${itemsHtml}</div>
      `;
    } else {
      const startMs = new Date(live.start).getTime();
      const elapsed = Math.max(0, Date.now() - startMs);
      banner.innerHTML = `
        <div class="live-pulse" aria-hidden="true"></div>
        <div class="live-main">
          <div class="live-label">PARTIE EN COURS</div>
          <div class="live-meta">${items.length} item${items.length > 1 ? 's' : ''} · ${playerCount} joueur${playerCount > 1 ? 's' : ''} · ${formatDuration(elapsed)}</div>
        </div>
        <div class="live-items">${itemsHtml}</div>
      `;
    }
  };
  render();
  if (liveTickHandle) clearInterval(liveTickHandle);
  liveTickHandle = setInterval(render, 1000);
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
        <img src="${skinUrl({ uuid: g.winnerUuid, name: g.winner })}" alt="" onerror="this.src='https://mc-heads.net/avatar/MHF_Steve/64'" />
        <div>
          <div class="winner-label"><img src="trophy.gif" class="trophy-icon" alt="" /> Gagnant</div>
          <div class="winner-name">${escapeHtml(g.winner)}</div>
        </div>
      </div>
      <div class="card-mid">
        <div class="date">${formatDate(g.start)}</div>
        <div class="meta">${g.itemCount} item${g.itemCount > 1 ? 's' : ''} · ${g.playerCount} joueur${g.playerCount > 1 ? 's' : ''}</div>
        ${g.items ? `<div class="card-items">${g.items.slice(0, 12).map(i => `<img src="${itemImageUrl(i)}" alt="${escapeHtml(i)}" title="${escapeHtml(prettyItem(i))}" data-fallback="${itemImageFallback(i)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none';}" />`).join('')}${g.items.length > 12 ? `<span class="meta">+${g.items.length - 12}</span>` : ''}</div>` : ''}
      </div>
      <div class="card-right">
        <div class="duration"><img src="clock.gif" class="clock-icon" alt="" /> ${formatDuration(g.durationMs)}</div>
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

  // Podium : top 3 (positions 1-2-3). On garde tout le monde dans le tableau pour ne rien cacher.
  const podiumPlayers = sortedPlayers.slice(0, 3);
  // Ordre visuel : 2e, 1er, 3e (le 1er au centre, le plus haut)
  const podiumOrder = [
    { p: podiumPlayers[1], rank: 2, cls: 'silver' },
    { p: podiumPlayers[0], rank: 1, cls: 'gold' },
    { p: podiumPlayers[2], rank: 3, cls: 'bronze' },
  ].filter(x => x.p);
  const medalEmoji = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const podiumHtml = podiumOrder.map(({ p, rank, cls }) => `
    <div class="podium-slot ${cls} rank-${rank}">
      <div class="podium-medal">${medalEmoji[rank]}</div>
      <img class="podium-skin" src="${skinUrl(p)}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="podium-name">${escapeHtml(p.name)}</div>
      <div class="podium-score">${p.found.length} / ${g.items.length}</div>
      <div class="podium-step"><span>${rank}</span></div>
    </div>
  `).join('');

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
            <img src="${skinUrl(p)}" alt="" onerror="this.style.visibility='hidden'" />
            <span>${p.winner ? '<img src="trophy.gif" class="trophy-icon" alt="" /> ' : ''}${escapeHtml(p.name)}</span>
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
      <div class="meta">Durée : <img src="clock.gif" class="clock-icon" alt="" /> ${formatDuration(g.durationMs)} · ${g.items.length} items · ${g.players.length} joueur(s)</div>
      <div class="winner-banner"><img src="trophy.gif" class="trophy-icon" alt="" /> Gagnant : <span class="name">${escapeHtml(g.winner)}</span></div>
    </div>

    <h3>Items à trouver</h3>
    <div class="items-grid">${itemsHtml}</div>

    ${podiumHtml ? `<h3>Podium</h3><div class="podium">${podiumHtml}</div>` : ''}

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

document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1200);
  });
});

let lastIndexSig = '';

async function refreshAll() {
  try {
    const [games, live] = await Promise.all([loadIndex(), loadLive()]);
    const sig = JSON.stringify(games.map(g => g.id));
    if (sig !== lastIndexSig) {
      lastIndexSig = sig;
      renderStats(games);
      renderList(games);
    }
    renderLiveBanner(live, games);
  } catch (e) {
    if (!lastIndexSig) {
      document.getElementById('games-list').innerHTML =
        `<div class="empty">Erreur de chargement : ${escapeHtml(e.message)}</div>`;
    }
  }
}

refreshAll();
// Polling toutes les 30s : capte les nouvelles parties et le statut "en cours" sans recharger la page.
setInterval(refreshAll, 30000);
