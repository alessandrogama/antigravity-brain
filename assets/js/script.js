const COLORS = {
  project:  '#8b5cf6',
  tech:     '#3b82f6',
  concept:  '#f59e0b',
  person:   '#f43f5e',
  resource: '#06b6d4',
  file:     '#94a3b8',
};

const I18N = {
  en: {
    nodes: "nodes", edges: "edges", filter: "FILTER BY TYPE", all: "ALL NODES",
    reset: "Reset", freeze: "Freeze", resume: "Resume", selectNode: "Select a node to explore neural connections",
    connected: "CONNECTED TO", noDesc: "No description available.",
    errTitle: "CONNECTION LOST", errSub: "Could not load brain.json. Make sure the server is running."
  },
  pt: {
    nodes: "nós", edges: "conexões", filter: "FILTRAR POR TIPO", all: "TODOS",
    reset: "Resetar", freeze: "Pausar", resume: "Retomar", selectNode: "Selecione um nó para explorar as conexões",
    connected: "CONECTADO A", noDesc: "Sem descrição disponível.",
    errTitle: "CONEXÃO PERDIDA", errSub: "Não foi possível carregar brain.json. Verifique se o servidor está rodando."
  },
  es: {
    nodes: "nodos", edges: "conexiones", filter: "FILTRAR POR TIPO", all: "TODOS",
    reset: "Reiniciar", freeze: "Pausar", resume: "Reanudar", selectNode: "Selecciona um nodo para explorar conexiones",
    connected: "CONECTADO A", noDesc: "Sin descripción disponible.",
    errTitle: "CONEXIÓN PERDIDA", errSub: "No se pudo cargar brain.json. Asegúrate de que el servidor esté funcionando."
  }
};

let currentLang = 'en';
function t(key) { return I18N[currentLang][key]; }

window.changeLang = function(lang) {
  currentLang = lang;
  const el = (id) => document.getElementById(id);
  if(el('lbl-nodes')) el('lbl-nodes').textContent = t('nodes');
  if(el('lbl-edges')) el('lbl-edges').textContent = t('edges');
  if(el('lbl-legend')) el('lbl-legend').textContent = t('filter');
  if(el('btn-reset')) el('btn-reset').textContent = t('reset');
  if(el('physics-label')) el('physics-label').textContent = physicsOn ? t('freeze') : t('resume');
  if(el('txt-empty')) el('txt-empty').textContent = t('selectNode');
  if(el('msg-error')) el('msg-error').textContent = t('errSub');
  
  buildLegend();
  renderDetail(selected ? nodeMap[selected] : null);
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
    const r = Math.min(w, h) * 0.25;
    n.x = cx + Math.cos(angle) * r * (0.8 + Math.random() * 0.4);
    n.y = cy + Math.sin(angle) * r * (0.8 + Math.random() * 0.4);
    vx[n.id] = 0; vy[n.id] = 0;
  });
  camX = 0; camY = 0; camZoom = 1;
}

// ─── Physics ─────────────────────────────────────────────────────────────
function simulate() {
  if (!physicsOn) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const REP = 4000, SPRING = 0.03, DAMP = 0.7, TARGET = 70, MAX_SPEED = 20;

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

    // Center Gravity
    fx += (w/2 - a.x) * 0.005;
    fy += (h/2 - a.y) * 0.005;

    vx[a.id] = (vx[a.id] + fx) * DAMP;
    vy[a.id] = (vy[a.id] + fy) * DAMP;

    const speed = Math.hypot(vx[a.id], vy[a.id]);
    if (speed > MAX_SPEED) {
      vx[a.id] = (vx[a.id] / speed) * MAX_SPEED;
      vy[a.id] = (vy[a.id] / speed) * MAX_SPEED;
    }
    
    a.x += vx[a.id];
    a.y += vy[a.id];
  });
}

// ─── Draw ─────────────────────────────────────────────────────────────────
function nodeRadius(n) {
  const deg = edges.filter(([a,b]) => a===n.id||b===n.id).length;
  return 5 + Math.sqrt(deg) * 2.5;
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

  // Edges
  ctx.lineCap = 'round';
  edges.forEach(([a, b]) => {
    const na = nodeMap[a];
    const nb = nodeMap[b];
    if (!na || !nb) return;

    const visible = !filterType || na.type === filterType || nb.type === filterType;
    const active = selected && (a === selected || b === selected);
    const dimmed = (filterType && !visible) || (selected && !active);

    if (dimmed) return; // Completely hide dimmed edges for cleaner look

    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    
    if (active) {
      ctx.strokeStyle = getColor(na.type);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Nodes
  nodes.forEach(n => {
    const r = nodeRadius(n);
    const color = getColor(n.type);
    const isSelected = n.id === selected;
    const isNeighbor = neighbors.has(n.id);
    const typeMatch = !filterType || n.type === filterType;
    const dimmed = (filterType && !typeMatch) || (selected && !isSelected && !isNeighbor);

    if (dimmed) ctx.globalAlpha = 0.1;
    else ctx.globalAlpha = 1;

    // Glow Effect
    if (isSelected || (hoverId === n.id)) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Border for neighbor/selected
    if (isSelected || isNeighbor) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();
    }

    ctx.shadowBlur = 0; // Reset shadow

    // Labels
    if (!dimmed && (camZoom > 0.6 || isSelected || isNeighbor)) {
      const fontSize = 12;
      ctx.font = `${isSelected ? '600' : '400'} ${fontSize}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.8)';
      ctx.fillText(n.label, n.x, n.y + r + 6);
    }
  });

  ctx.restore();
}

function loop() {
  simulate();
  draw();
  animFrame = requestAnimationFrame(loop);
}

// ─── Input ───────────────────────────────────────────────────────────────
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.max(0.1, Math.min(5, camZoom * delta));
  camX = mx - (mx - camX) * (newZoom / camZoom);
  camY = my - (my - camY) * (newZoom / camZoom);
  camZoom = newZoom;
  document.getElementById('zoom-indicator').textContent = Math.round(camZoom * 100) + '%';
}, { passive: false });

canvas.addEventListener('mousedown', e => {
  const { nx, ny } = screenToWorld(e.clientX, e.clientY);
  for (const n of nodes) {
    if (Math.hypot(n.x - nx, n.y - ny) < nodeRadius(n) + 5) {
      isDraggingNode = n.id;
      dragOffX = nx - n.x;
      dragOffY = ny - n.y;
      return;
    }
  }
  isPanning = true;
  panStartX = e.clientX; panStartY = e.clientY;
  camStartX = camX; camStartY = camY;
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

  hoverId = null;
  for (const n of nodes) {
    if (Math.hypot(n.x - nx, n.y - ny) < nodeRadius(n) + 5) {
      hoverId = n.id; break;
    }
  }

  const tt = document.getElementById('tooltip');
  if (hoverId) {
    const n = nodeMap[hoverId];
    tt.style.display = 'block';
    tt.innerHTML = `<strong>${escapeHTML(n.label)}</strong><br><span style="color:${getColor(n.type)}">${escapeHTML(n.type)}</span>`;
    tt.style.left = (e.clientX + 15) + 'px';
    tt.style.top  = (e.clientY + 15) + 'px';
    canvas.style.cursor = 'pointer';
  } else {
    tt.style.display = 'none';
    canvas.style.cursor = isPanning ? 'grabbing' : 'grab';
  }
});

canvas.addEventListener('mouseup', e => {
  if (isDraggingNode !== null) {
    const { nx, ny } = screenToWorld(e.clientX, e.clientY);
    const n = nodeMap[isDraggingNode];
    if (n && Math.hypot((n.x + dragOffX) - nx, (n.y + dragOffY) - ny) < 5) {
      focusNode(n.id);
    }
    isDraggingNode = null;
  }
  isPanning = false;
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]));
}

function screenToWorld(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  return { nx: (sx - rect.left - camX) / camZoom, ny: (sy - rect.top  - camY) / camZoom };
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

window.resetView = function() {
  camX = 0; camY = 0; camZoom = 1;
  document.getElementById('zoom-indicator').textContent = '100%';
}

window.togglePhysics = function() {
  physicsOn = !physicsOn;
  document.getElementById('physics-label').textContent = physicsOn ? t('freeze') : t('resume');
}

window.onSearch = function(q) {
  const box = document.getElementById('search-results');
  if (!q) { box.style.display = 'none'; return; }
  const matches = nodes.filter(n => n.label.toLowerCase().includes(q.toLowerCase()));
  if (!matches.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = matches.slice(0,10).map(n => `
    <div class="sr-item" onclick="focusNode(${n.id})">
      <span class="leg-dot" style="background:${getColor(n.type)}"></span>
      <span>${escapeHTML(n.label)}</span>
    </div>
  `).join('');
}

window.focusNode = function(id) {
  selected = selected === id ? null : id;
  const n = nodeMap[id];
  renderDetail(n || null);
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('search').value = '';
  if (n && id === selected) {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    camX = w/2 - n.x * camZoom;
    camY = h/2 - n.y * camZoom;
  }
}

function buildLegend() {
  const types = [...new Set(nodes.map(n => n.type))];
  const legend = document.getElementById('legend');
  legend.innerHTML = types.map(ty => `
    <div class="leg-item ${filterType===ty?'active':''}" onclick="setFilter('${ty}')">
      <span class="leg-dot" style="background:${getColor(ty)};color:${getColor(ty)}"></span>
      <span>${ty.toUpperCase()}</span>
    </div>
  `).join('') + `
    <div class="leg-item ${!filterType?'active':''}" onclick="setFilter(null)" style="border-top:1px solid var(--border);padding-top:10px;margin-top:5px">
      <span>${t('all')}</span>
    </div>
  `;
}

window.setFilter = function(type) {
  filterType = filterType === type ? null : type;
  buildLegend();
}

function renderDetail(n) {
  const container = document.getElementById('hud-detail-panel');
  const panel = document.getElementById('node-detail');
  
  if (!n) {
    container.classList.remove('visible');
    setTimeout(() => { panel.innerHTML = `<div class="detail-empty" id="txt-empty">${t('selectNode')}</div>`; }, 400);
    return;
  }

  container.classList.add('visible');
  const neighborIds = getNeighbors(n.id);
  const neighborNodes = nodes.filter(nn => neighborIds.has(nn.id));

  panel.innerHTML = `
    <div class="detail-name">${escapeHTML(n.label)}</div>
    <div class="detail-type">
      <span class="type-dot" style="background:${getColor(n.type)}"></span>
      ${n.type.toUpperCase()} · ${neighborNodes.length} ${t('edges')}
    </div>
    <div class="detail-desc">${escapeHTML(n.desc) || t('noDesc')}</div>
    
    <div class="detail-connections">${t('connected')}</div>
    <div class="conn-list">
      ${neighborNodes.map(nn => `
        <div class="conn-item" onclick="focusNode(${nn.id})">
          <span class="leg-dot" style="background:${getColor(nn.type)}"></span>
          <span>${escapeHTML(nn.label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

window.fetchBrainJson = function() {
  fetch('brain.json')
    .then(r => r.json())
    .then(data => initBrain(data))
    .catch(e => {
      console.error(e);
      document.getElementById('error-overlay').classList.remove('hidden');
    });
}

window.addEventListener('DOMContentLoaded', fetchBrainJson);
window.addEventListener('resize', () => { canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight; });
