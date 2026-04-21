const COLORS = {
  projeto:  '#9d7cd8',
  tech:     '#7aa2f7',
  conceito: '#e0af68',
  pessoa:   '#f7768e',
  recurso:  '#7dcfff',
  arquivo:  '#a9b1d6',
};

// ─── i18n ──────────────────────────────────────────────────────────────────
const I18N = {
  en: {
    title: "Second Brain", search: "Search node...", nodes: "nodes", edges: "edges", selected: "selected",
    legend: "Legend", all: "all", controls: "Controls", resetCam: "↺ Reset camera", reloadGraph: "⤓ Reload Graph",
    fitAll: "⊞ Fit all", pausePhys: "⏸ Pause physics", resumePhys: "▶ Resume physics",
    clickNode: "← Click a node<br>to view details", connections: "CONNECTED TO", noDesc: "No description.",
    errTitle: "Second Brain", errSub1: "Could not load <strong>brain.json</strong> automatically.",
    errSub2: "This usually happens due to browser security restrictions (CORS) when opening local files directly (<code>file:///</code>).",
    errSub3: "To fix this, run the following command in your terminal at the project root and go to <strong>http://localhost:8000/brain_viewer.html</strong>:"
  },
  pt: {
    title: "Segundo Cérebro", search: "Buscar nó...", nodes: "nós", edges: "conexões", selected: "selecionado",
    legend: "Legenda", all: "todos", controls: "Controles", resetCam: "↺ Resetar câmera", reloadGraph: "⤓ Recarregar Grafo",
    fitAll: "⊞ Encaixar tudo", pausePhys: "⏸ Pausar física", resumePhys: "▶ Retomar física",
    clickNode: "← Clique em um nó<br>para ver detalhes", connections: "CONECTADO A", noDesc: "Sem descrição.",
    errTitle: "Segundo Cérebro", errSub1: "Não foi possível carregar o arquivo <strong>brain.json</strong> automaticamente.",
    errSub2: "Isso geralmente ocorre devido a restrições de segurança do navegador (CORS) ao abrir arquivos locais diretamente (<code>file:///</code>).",
    errSub3: "Para resolver, execute o comando abaixo no seu terminal na raiz do projeto e acesse <strong>http://localhost:8000/brain_viewer.html</strong>:"
  },
  es: {
    title: "Segundo Cerebro", search: "Buscar nodo...", nodes: "nodos", edges: "conexiones", selected: "seleccionado",
    legend: "Leyenda", all: "todos", controls: "Controles", resetCam: "↺ Resetear cámara", reloadGraph: "⤓ Recargar Grafo",
    fitAll: "⊞ Ajustar todo", pausePhys: "⏸ Pausar física", resumePhys: "▶ Reanudar física",
    clickNode: "← Haz clic en un nodo<br>para ver detalles", connections: "CONECTADO A", noDesc: "Sin descripción.",
    errTitle: "Segundo Cerebro", errSub1: "No se pudo cargar el archivo <strong>brain.json</strong> automáticamente.",
    errSub2: "Esto suele ocurrir debido a las restricciones de seguridad del navegador (CORS) al abrir archivos locales directamente (<code>file:///</code>).",
    errSub3: "Para solucionarlo, ejecuta el siguiente comando en tu terminal en la raíz del proyecto y entra a <strong>http://localhost:8000/brain_viewer.html</strong>:"
  }
};
let currentLang = 'en';
function t(key) { return I18N[currentLang][key]; }

window.changeLang = function(lang) {
  currentLang = lang;
  const el = (id) => document.getElementById(id);
  if(el('txt-title')) el('txt-title').textContent = t('title');
  if(el('search')) el('search').placeholder = t('search');
  if(el('lbl-nodes')) el('lbl-nodes').textContent = t('nodes');
  if(el('lbl-edges')) el('lbl-edges').textContent = t('edges');
  if(el('lbl-selected')) el('lbl-selected').textContent = t('selected');
  if(el('lbl-legend')) el('lbl-legend').textContent = t('legend');
  if(el('lbl-controls')) el('lbl-controls').textContent = t('controls');
  if(el('btn-reset')) el('btn-reset').innerHTML = t('resetCam');
  if(el('btn-reload')) el('btn-reload').innerHTML = t('reloadGraph');
  if(el('btn-fit')) el('btn-fit').innerHTML = t('fitAll');
  if(el('physics-label')) el('physics-label').textContent = physicsOn ? t('pausePhys') : t('resumePhys');
  if(el('txt-empty')) el('txt-empty').innerHTML = t('clickNode');
  if(el('err-title')) el('err-title').textContent = t('errTitle');
  if(el('err-sub1')) el('err-sub1').innerHTML = t('errSub1');
  if(el('err-sub2')) el('err-sub2').innerHTML = t('errSub2');
  if(el('err-sub3')) el('err-sub3').innerHTML = t('errSub3');
  buildLegend();
  renderDetail(selected ? nodes.find(n => n.id === selected) : null);
}

// ─── State ───────────────────────────────────────────────────────────────
let nodes = [], edges = [], selected = null;
let nodeMap = {};
let camX = 0, camY = 0, camZoom = 1;
let vx = {}, vy = {}, physicsOn = true;
let isPanning = false, panStartX = 0, panStartY = 0, camStartX = 0, camStartY = 0;
let isDraggingNode = null, dragOffX = 0, dragOffY = 0;
let hoverId = null;
let filterType = null;
let animFrame;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvas-wrap');

function initBrain(data) {
  nodes = (data.nodes || []).map(n => ({...n, x: 0, y: 0}));
  edges = data.edges || [];
  
  nodeMap = {};
  nodes.forEach(n => { 
    vx[n.id] = 0; vy[n.id] = 0; 
    nodeMap[n.id] = n;
  });
  selected = null;

  scatter();
  buildLegend();
  updateStats();
  renderDetail(null);
  
  const errOverlay = document.getElementById('error-overlay');
  if (errOverlay) errOverlay.classList.add('hidden');

  cancelAnimationFrame(animFrame);
  loop();
}

function scatter() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const cx = w/2, cy = h/2;
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    const r = Math.min(w, h) * 0.3;
    n.x = cx + Math.cos(angle) * r * (0.6 + Math.random() * 0.5);
    n.y = cy + Math.sin(angle) * r * (0.6 + Math.random() * 0.5);
    vx[n.id] = 0; vy[n.id] = 0;
  });
  camX = 0; camY = 0; camZoom = 1;
}

// ─── Physics ─────────────────────────────────────────────────────────────
function simulate() {
  if (!physicsOn) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const REP = 3000, SPRING = 0.02, DAMP = 0.6, TARGET = 60, MAX_SPEED = 15;

  nodes.forEach(a => {
    if (isDraggingNode === a.id) return;
    let fx = 0, fy = 0;

    nodes.forEach(b => {
      if (a.id === b.id) return;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const force = REP / (d * d);
      fx += force * dx / d;
      fy += force * dy / d;
    });

    edges.forEach(([ea, eb]) => {
      const other = (ea === a.id) ? nodeMap[eb] : (eb === a.id) ? nodeMap[ea] : null;
      if (!other) return;
      const dx = other.x - a.x, dy = other.y - a.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const force = SPRING * (d - TARGET);
      fx += force * dx / d;
      fy += force * dy / d;
    });

    // Brain shape gravity (Two hemispheres)
    const hemisphere = (a.id % 2 === 0) ? -1 : 1; 
    const lobeDist = Math.min(w, h) * 0.15;
    const targetX = (w/2) + hemisphere * lobeDist;
    const targetY = (h/2);

    fx += (targetX - a.x) * 0.005;
    fy += (targetY - a.y) * 0.008; // slightly stronger Y pull to create oval shape

    // Brain cleft (push away from center axis)
    const distFromCenterX = a.x - (w/2);
    if (Math.abs(distFromCenterX) < 40) {
      fx += (distFromCenterX > 0 ? 1 : -1) * 0.2;
    }

    vx[a.id] = (vx[a.id] + fx) * DAMP;
    vy[a.id] = (vy[a.id] + fy) * DAMP;

    const speed = Math.hypot(vx[a.id], vy[a.id]);
    if (speed > MAX_SPEED) {
      vx[a.id] = (vx[a.id] / speed) * MAX_SPEED;
      vy[a.id] = (vy[a.id] / speed) * MAX_SPEED;
    }

    if (speed < 0.2) {
      vx[a.id] = 0;
      vy[a.id] = 0;
    }

    a.x = Math.max(40, Math.min(w - 40, a.x + vx[a.id]));
    a.y = Math.max(40, Math.min(h - 40, a.y + vy[a.id]));
  });
}

// ─── Draw ─────────────────────────────────────────────────────────────────
function nodeRadius(n) {
  const deg = edges.filter(([a,b]) => a===n.id||b===n.id).length;
  return 4 + Math.sqrt(deg) * 2;
}

function getColor(type) {
  return COLORS[type] || '#888';
}

function draw() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(camZoom, camZoom);

  const neighbors = selected ? getNeighbors(selected) : new Set();

  // edges
  edges.forEach(([a, b]) => {
    const na = nodeMap[a];
    const nb = nodeMap[b];
    if (!na || !nb) return;

    const visible = !filterType || na.type === filterType || nb.type === filterType;
    const active = selected && (a === selected || b === selected);
    const dimmed = (filterType && !visible) || (selected && !active);

    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.strokeStyle = dimmed
      ? 'rgba(255,255,255,0.02)'
      : active
        ? 'rgba(255,255,255,0.4)'
        : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
  });

  // nodes
  nodes.forEach(n => {
    const r = nodeRadius(n);
    const color = getColor(n.type);
    const isSelected = n.id === selected;
    const isNeighbor = neighbors.has(n.id);
    const typeMatch = !filterType || n.type === filterType;
    const dimmed = (filterType && !typeMatch) || (selected && !isSelected && !isNeighbor);
    const alpha = dimmed ? 0.15 : 1;

    ctx.globalAlpha = alpha;

    // glow for selected
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
      ctx.fillStyle = color + '30';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color + (isSelected ? 'ff' : isNeighbor ? 'cc' : 'aa');
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // label
    if (!dimmed && (camZoom > 0.8 || isSelected || isNeighbor || r > 6)) {
      const fontSize = Math.max(10, Math.min(14, r * 1.5));
      ctx.font = `${isSelected ? '500 ' : '400 '}${fontSize}px 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)';
      ctx.fillText(n.label, n.x, n.y + r + 4);
    }

    ctx.globalAlpha = 1;
  });

  ctx.restore();
}

function loop() {
  simulate();
  draw();
  animFrame = requestAnimationFrame(loop);
}

// ─── Camera ───────────────────────────────────────────────────────────────
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.max(0.2, Math.min(3, camZoom * delta));
  camX = mx - (mx - camX) * (newZoom / camZoom);
  camY = my - (my - camY) * (newZoom / camZoom);
  camZoom = newZoom;
  document.getElementById('zoom-indicator').textContent = Math.round(camZoom * 100) + '%';
}, { passive: false });

canvas.addEventListener('mousedown', e => {
  const { nx, ny } = screenToWorld(e.clientX, e.clientY);
  for (const n of nodes) {
    if (Math.hypot(n.x - nx, n.y - ny) < nodeRadius(n) + 4) {
      isDraggingNode = n.id;
      dragOffX = nx - n.x;
      dragOffY = ny - n.y;
      vx[n.id] = 0; vy[n.id] = 0;
      canvas.classList.add('dragging');
      return;
    }
  }
  isPanning = true;
  panStartX = e.clientX; panStartY = e.clientY;
  camStartX = camX; camStartY = camY;
  canvas.classList.add('dragging');
});

canvas.addEventListener('mousemove', e => {
  const { nx, ny } = screenToWorld(e.clientX, e.clientY);

  if (isDraggingNode !== null) {
    const n = nodeMap[isDraggingNode];
    if (n) { n.x = nx - dragOffX; n.y = ny - dragOffY; vx[n.id]=0; vy[n.id]=0; }
    return;
  }

  if (isPanning) {
    camX = camStartX + (e.clientX - panStartX);
    camY = camStartY + (e.clientY - panStartY);
    return;
  }

  // hover detection
  hoverId = null;
  for (const n of nodes) {
    if (Math.hypot(n.x - nx, n.y - ny) < nodeRadius(n) + 4) {
      hoverId = n.id; break;
    }
  }

  canvas.classList.toggle('node-hover', hoverId !== null);

  const tt = document.getElementById('tooltip');
  if (hoverId) {
    const n = nodeMap[hoverId];
    tt.style.display = 'block';
    tt.innerHTML = `<strong>${escapeHTML(n.label)}</strong><br><span style="color:#6b6880">${escapeHTML(n.type)}</span><br>${escapeHTML(n.desc)}`;
    tt.style.left = (e.clientX - wrap.getBoundingClientRect().left + 12) + 'px';
    tt.style.top  = (e.clientY - wrap.getBoundingClientRect().top  - 10) + 'px';
  } else {
    tt.style.display = 'none';
  }
});

canvas.addEventListener('mouseup', e => {
  if (isDraggingNode !== null) {
    const { nx, ny } = screenToWorld(e.clientX, e.clientY);
    const n = nodeMap[isDraggingNode];
    // click = barely moved
    if (n && Math.hypot((n.x + dragOffX) - nx, (n.y + dragOffY) - ny) < 5) {
      selected = selected === n.id ? null : n.id;
      renderDetail(selected ? n : null);
      document.getElementById('stat-selected').textContent = selected ? n.label : '—';
    }
    isDraggingNode = null;
  }
  isPanning = false;
  canvas.classList.remove('dragging');
});

canvas.addEventListener('mouseleave', () => {
  document.getElementById('tooltip').style.display = 'none';
  isPanning = false;
  if (isDraggingNode !== null) isDraggingNode = null;
  canvas.classList.remove('dragging');
});

// touch
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  const { nx, ny } = screenToWorld(t.clientX, t.clientY);
  for (const n of nodes) {
    if (Math.hypot(n.x - nx, n.y - ny) < nodeRadius(n) + 10) {
      isDraggingNode = n.id; dragOffX = nx - n.x; dragOffY = ny - n.y;
      vx[n.id]=0; vy[n.id]=0; return;
    }
  }
}, {passive:true});

canvas.addEventListener('touchmove', e => {
  if (isDraggingNode === null) return;
  const t = e.touches[0];
  const { nx, ny } = screenToWorld(t.clientX, t.clientY);
  const n = nodeMap[isDraggingNode];
  if (n) { n.x = nx - dragOffX; n.y = ny - dragOffY; }
  e.preventDefault();
}, {passive:false});

canvas.addEventListener('touchend', e => {
  if (isDraggingNode !== null) {
    const n = nodeMap[isDraggingNode];
    if (n) {
      selected = selected === n.id ? null : n.id;
      renderDetail(selected ? n : null);
      document.getElementById('stat-selected').textContent = selected ? n.label : '—';
    }
    isDraggingNode = null;
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

function screenToWorld(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  return {
    nx: (sx - rect.left - camX) / camZoom,
    ny: (sy - rect.top  - camY) / camZoom,
  };
}

function getNeighbors(id) {
  const s = new Set();
  edges.forEach(([a,b]) => { if(a===id) s.add(b); if(b===id) s.add(a); });
  return s;
}

function updateStats() {
  document.getElementById('stat-nodes').textContent = nodes.length;
  document.getElementById('stat-edges').textContent = edges.length;
}

function resetView() { camX = 0; camY = 0; camZoom = 1; document.getElementById('zoom-indicator').textContent = '100%'; }

function fitAll() {
  if (!nodes.length) return;
  const xs = nodes.map(n=>n.x), ys = nodes.map(n=>n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const scaleX = w / (maxX - minX + 120);
  const scaleY = h / (maxY - minY + 120);
  camZoom = Math.min(scaleX, scaleY, 1.5);
  camX = w/2 - ((minX + maxX)/2) * camZoom;
  camY = h/2 - ((minY + maxY)/2) * camZoom;
  document.getElementById('zoom-indicator').textContent = Math.round(camZoom*100)+'%';
}

function togglePhysics() {
  physicsOn = !physicsOn;
  document.getElementById('physics-label').textContent = physicsOn ? t('pausePhys') : t('resumePhys');
}

// ─── Search ───────────────────────────────────────────────────────────────
window.onSearch = function(q) {
  const box = document.getElementById('search-results');
  if (!q) { box.style.display = 'none'; return; }
  const matches = nodes.filter(n => n.label.toLowerCase().includes(q.toLowerCase()));
  if (!matches.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = matches.slice(0,8).map(n =>
    `<div class="sr-item" onclick="focusNode(${n.id})">
      <span class="leg-dot" style="background:${getColor(n.type)}"></span>
      ${escapeHTML(n.label)}
    </div>`
  ).join('');
}

window.focusNode = function(id) {
  selected = id;
  const n = nodeMap[id];
  renderDetail(n || null);
  document.getElementById('stat-selected').textContent = n ? n.label : '—';
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('search').value = '';
  // pan to node
  if (n) {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    camX = w/2 - n.x * camZoom;
    camY = h/2 - n.y * camZoom;
  }
}

// ─── Legend ───────────────────────────────────────────────────────────────
function buildLegend() {
  const types = [...new Set(nodes.map(n => n.type))];
  const legend = document.getElementById('legend');
  legend.innerHTML = types.map(ty => `
    <div class="leg-item ${filterType===ty?'active':''}" onclick="setFilter('${ty}')">
      <span class="leg-dot" style="background:${getColor(ty)}"></span>
      ${ty} <span style="margin-left:auto;font-size:10px;color:#4a4860">${nodes.filter(n=>n.type===ty).length}</span>
    </div>
  `).join('') + `<div class="leg-item ${!filterType?'active':''}" onclick="setFilter(null)" style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.05);padding-top:6px">${t('all')}</div>`;
}

window.setFilter = function(type) {
  filterType = filterType === type ? null : type;
  buildLegend();
}

// ─── Detail Panel ─────────────────────────────────────────────────────────
function renderDetail(n) {
  const panel = document.getElementById('node-detail');
  if (!n) {
    panel.innerHTML = `<div class="detail-empty" id="txt-empty">${t('clickNode')}</div>`;
    return;
  }
  const neighbors = getNeighbors(n.id);
  const neighborNodes = nodes.filter(nn => neighbors.has(nn.id));
  const deg = neighborNodes.length;

  panel.innerHTML = `
    <div class="detail-name">${escapeHTML(n.label)}</div>
    <div class="detail-type">
      <span class="type-dot" style="background:${getColor(n.type)}"></span>
      ${escapeHTML(n.type)} · ${deg} ${deg !== 1 ? t('nodes') : t('nodes').replace(/s$/, '')}
    </div>
    <div class="detail-desc">${escapeHTML(n.desc) || t('noDesc')}</div>
    ${deg > 0 ? `
      <div class="detail-connections">${t('connections')}</div>
      <div class="conn-list">
        ${neighborNodes.map(nn => `
          <div class="conn-item" onclick="focusNode(${nn.id})">
            <span class="leg-dot" style="background:${getColor(nn.type)}"></span>
            ${escapeHTML(nn.label)}
            <span style="margin-left:auto;font-size:10px;color:#4a4860">${escapeHTML(nn.type)}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

// ─── Auto-load ────────────────────────────────────────────────────────────
window.fetchBrainJson = function() {
  fetch('brain.json')
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      initBrain(data);
    })
    .catch(err => {
      console.warn('Falha ao carregar brain.json:', err);
      const errOverlay = document.getElementById('error-overlay');
      if (errOverlay) errOverlay.classList.remove('hidden');
    });
}

window.addEventListener('DOMContentLoaded', () => {
  fetchBrainJson();
});

// ─── Resize ───────────────────────────────────────────────────────────────
window.addEventListener('resize', () => { canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight; });

// Make functions available to HTML buttons
window.resetView = resetView;
window.fitAll = fitAll;
window.togglePhysics = togglePhysics;
