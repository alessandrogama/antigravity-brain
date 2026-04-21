const COLORS = {
  project:  '#3b82f6',
  tech:     '#8b5cf6',
  concept:  '#f59e0b',
  person:   '#f43f5e',
  resource: '#06b6d4',
  file:     '#94a3b8',
};

const I18N = {
  en: {
    projects: "PROJECTS", tags: "TAGS", nodes: "Nodes", sync: "ENCRYPTED",
    connected: "CONNECTIONS", noDesc: "No data available.",
    errTitle: "CONNECTION LOST", errSub: "Verify local Cerebrum instance status.",
    assistant: ["Analyzing thought patterns...", "Scanning neural pathways...", "Index complete.", "New connection detected."]
  },
  pt: {
    projects: "PROJETOS", tags: "TAGS", nodes: "Nós", sync: "CRIPTOGRAFADO",
    connected: "CONEXÕES", noDesc: "Sem dados disponíveis.",
    errTitle: "CONEXÃO PERDIDA", errSub: "Verifique o status da instância local.",
    assistant: ["Analisando padrões de pensamento...", "Escaneando caminhos neurais...", "Índice completo.", "Nova conexão detectada."]
  },
  es: {
    projects: "PROYECTOS", tags: "TAGS", nodes: "Nodos", sync: "ENCRIPTADO",
    connected: "CONEXIONES", noDesc: "Sin datos disponibles.",
    errTitle: "CONEXIÓN PERDIDA", errSub: "Verifique o estado da instância local.",
    assistant: ["Analizando patrones de pensamiento...", "Escaneando rutas neurales...", "Índice completo.", "Nueva conexão detectada."]
  }
};

let currentLang = 'en';
function t(key) { return I18N[currentLang][key]; }

window.changeLang = function(lang) {
  currentLang = lang;
  const el = (id) => document.getElementById(id);
  if(el('lbl-vault')) el('lbl-vault').textContent = t('projects');
  if(el('lbl-tags')) el('lbl-tags').textContent = t('tags');
  if(el('msg-error')) el('msg-error').textContent = t('errSub');
  const assistantMsg = t('assistant')[Math.floor(Math.random() * t('assistant').length)];
  if(el('assistant-text')) el('assistant-text').textContent = assistantMsg;
  buildLegend();
  renderDetail(selected ? nodeMap[selected] : null);
}

window.toggleSection = function(id) {
  const el = document.getElementById(id);
  if(!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'block' : 'none';
  el.previousElementSibling.classList.toggle('collapsed', !isHidden);
}

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
const ctx = canvas ? canvas.getContext('2d') : null;
const wrap = document.getElementById('canvas-wrap');

const mCanvas = document.getElementById('minimap-canvas');
const mCtx = mCanvas ? mCanvas.getContext('2d') : null;

function initBrain(data) {
  nodes = (data.nodes || []).map(n => ({...n, x: 0, y: 0}));
  edges = data.edges || [];
  nodeMap = {};
  nodes.forEach(n => { vx[n.id] = 0; vy[n.id] = 0; nodeMap[n.id] = n; });
  selected = null;
  
  handleResize();
  scatter();
  buildLegend();
  updateStats();
  updateSidebar();
  renderDetail(null);
  
  const errOverlay = document.getElementById('error-overlay');
  if (errOverlay) errOverlay.classList.add('hidden');
  
  cancelAnimationFrame(animFrame);
  loop();
  
  // Forçar centralização após 200ms (quando o layout CSS estiver 100% pronto)
  setTimeout(() => {
    handleResize();
    scatter();
  }, 200);
}

function handleResize() {
  if(!canvas || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function scatter() {
  const w = canvas.width || 800;
  const h = canvas.height || 600;
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    const r = Math.min(w, h) * 0.3;
    n.x = w/2 + Math.cos(angle) * r;
    n.y = h/2 + Math.sin(angle) * r;
  });
  camX = 0; camY = 0; camZoom = 1;
}

function simulate() {
  if (!physicsOn) return;
  const w = canvas.width || 800;
  const h = canvas.height || 600;
  const REP = 8000, SPRING = 0.04, DAMP = 0.6, TARGET = 100;

  nodes.forEach(a => {
    if (isDraggingNode === a.id) return;
    let fx = 0, fy = 0;
    nodes.forEach(b => {
      if (a.id === b.id) return;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const force = Math.min(REP / (d * d), 50);
      fx += force * dx / d; fy += force * dy / d;
    });
    edges.forEach(([ea, eb]) => {
      const other = (ea === a.id) ? nodeMap[eb] : (eb === a.id) ? nodeMap[ea] : null;
      if (!other) return;
      const dx = other.x - a.x, dy = other.y - a.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const force = SPRING * (d - TARGET);
      fx += force * dx / d; fy += force * dy / d;
    });
    
    // Centro dinâmico
    fx += (w/2 - a.x) * 0.01;
    fy += (h/2 - a.y) * 0.01;
    
    vx[a.id] = (vx[a.id] + fx) * DAMP;
    vy[a.id] = (vy[a.id] + fy) * DAMP;
    a.x += vx[a.id]; a.y += vy[a.id];
  });
}

function nodeSize(n) {
  const deg = edges.filter(([a,b]) => a===n.id||b===n.id).length;
  return 8 + Math.sqrt(deg) * 4;
}

function draw() {
  if(!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(camZoom, camZoom);

  const neighbors = selected ? getNeighbors(selected) : new Set();

  edges.forEach(([a, b]) => {
    const na = nodeMap[a], nb = nodeMap[b];
    if (!na || !nb) return;
    const active = selected && (a === selected || b === selected);
    const dimmed = selected && !active;
    if (dimmed) return;
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.strokeStyle = active ? COLORS[na.type || 'concept'] : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
  });

  nodes.forEach(n => {
    const s = nodeSize(n);
    const type = n.type || 'concept';
    const color = COLORS[type] || '#888';
    const isSelected = n.id === selected;
    const isNeighbor = neighbors.has(n.id);
    const typeMatch = !filterType || n.type === filterType;
    const dimmed = (filterType && !typeMatch) || (selected && !isSelected && !isNeighbor);
    ctx.globalAlpha = dimmed ? 0.1 : 1;
    
    if (isSelected || hoverId === n.id) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
    }
    
    ctx.fillStyle = color;
    ctx.fillRect(n.x - s/2, n.y - s/2, s, s);
    
    if (isSelected || isNeighbor) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(n.x - s/2 - 2, n.y - s/2 - 2, s + 4, s + 4);
    }
    
    ctx.shadowBlur = 0;

    if (!dimmed && (camZoom > 0.5 || isSelected || isNeighbor)) {
      ctx.font = `${isSelected?'700':'500'} 10px 'JetBrains Mono'`;
      ctx.textAlign = 'left';
      ctx.fillStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.fillText(n.label, n.x + s/2 + 8, n.y + 3);
    }
  });
  ctx.restore();
  drawMinimap();
}

function drawMinimap() {
  if(!mCtx || !mCanvas) return;
  const w = mCanvas.width = 160;
  const h = mCanvas.height = 80;
  mCtx.clearRect(0, 0, w, h);
  const padding = 50;
  const nodesX = nodes.map(n => n.x);
  const nodesY = nodes.map(n => n.y);
  const minX = Math.min(...nodesX) - padding;
  const maxX = Math.max(...nodesX) + padding;
  const minY = Math.min(...nodesY) - padding;
  const maxY = Math.max(...nodesY) + padding;
  
  const worldW = maxX - minX;
  const worldH = maxY - minY;
  const scale = Math.min(w / worldW, h / worldH) || 0.05;
  const offX = (w - worldW * scale) / 2;
  const offY = (h - worldH * scale) / 2;
  
  nodes.forEach(n => {
    mCtx.fillStyle = COLORS[n.type || 'concept'] || '#888';
    mCtx.fillRect(offX + (n.x - minX) * scale, offY + (n.y - minY) * scale, 1.5, 1.5);
  });
  
  const v = document.getElementById('minimap-viewport');
  if(v) {
    const vw = (canvas.width / camZoom) * scale;
    const vh = (canvas.height / camZoom) * scale;
    const vx = offX + ((-camX / camZoom) - minX) * scale;
    const vy = offY + ((-camY / camZoom) - minY) * scale;
    v.style.width = Math.max(2, Math.min(vw, w)) + 'px';
    v.style.height = Math.max(2, Math.min(vh, h)) + 'px';
    v.style.left = Math.min(Math.max(0, vx), w) + 'px';
    v.style.top = Math.min(Math.max(0, vy), h) + 'px';
  }
}

function loop() { simulate(); draw(); animFrame = requestAnimationFrame(loop); }

if(canvas) {
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(5, camZoom * delta));
    camX = mx - (mx - camX) * (newZoom / camZoom);
    camY = my - (my - camY) * (newZoom / camZoom);
    camZoom = newZoom;
    const zi = document.getElementById('zoom-indicator');
    if(zi) zi.textContent = Math.round(camZoom * 100) + '%';
  }, { passive: false });

  canvas.addEventListener('mousedown', e => {
    const { nx, ny } = screenToWorld(e.clientX, e.clientY);
    for (const n of nodes) {
      const s = nodeSize(n);
      if (Math.abs(n.x - nx) < s/2 + 5 && Math.abs(n.y - ny) < s/2 + 5) {
        isDraggingNode = n.id; dragOffX = nx - n.x; dragOffY = ny - n.y; return;
      }
    }
    isPanning = true; panStartX = e.clientX; panStartY = e.clientY;
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
      const s = nodeSize(n);
      if (Math.abs(n.x - nx) < s/2 + 5 && Math.abs(n.y - ny) < s/2 + 5) { hoverId = n.id; break; }
    }
    const tt = document.getElementById('tooltip');
    if (hoverId) {
      const n = nodeMap[hoverId];
      tt.style.display = 'block';
      tt.innerHTML = `<strong>${n.label}</strong><br><span style="color:${COLORS[n.type || 'concept']}">${(n.type||'concept').toUpperCase()}</span>`;
      tt.style.left = (e.clientX + 15) + 'px'; tt.style.top = (e.clientY + 15) + 'px';
    } else { if(tt) tt.style.display = 'none'; }
  });

  canvas.addEventListener('mouseup', e => {
    if (isDraggingNode !== null) {
      const { nx, ny } = screenToWorld(e.clientX, e.clientY);
      const n = nodeMap[isDraggingNode];
      if (n && Math.hypot((n.x + dragOffX) - nx, (n.y + dragOffY) - ny) < 5) focusNode(n.id);
      isDraggingNode = null;
    }
    isPanning = false;
  });
}

function screenToWorld(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  return { nx: (sx - rect.left - camX) / camZoom, ny: (sy - rect.top - camY) / camZoom };
}

function getNeighbors(id) {
  const s = new Set();
  edges.forEach(([a,b]) => { if(a===id) s.add(b); if(b===id) s.add(a); });
  return s;
}

function updateStats() {
  const el = document.getElementById('stat-nodes');
  if(el) el.textContent = nodes.length;
}

function updateSidebar() {
  const projectList = document.getElementById('sub-projects');
  if(projectList) {
    // Filter specifically for projects (labels containing '_de_' or known names)
    const projectNodes = nodes.filter(n => 
      n.type === 'project' || 
      n.label.includes('_') || 
      ['caminho_de_liberdade', 'vida_mestre', 'antigravity-brain'].some(name => n.label.toLowerCase().includes(name))
    ).slice(0, 20);
    
    projectList.innerHTML = projectNodes.map(p => `
      <div class="item" onclick="focusNode(${p.id})"><span class="icon">📁</span> ${p.label}</div>
    `).join('') || '<div class="item dim">No projects found</div>';
  }
  const tagContainer = document.getElementById('tag-container');
  if(tagContainer) {
    const types = [...new Set(nodes.map(n => n.type || 'concept'))];
    tagContainer.innerHTML = types.map(t => `
      <div class="tag-item" onclick="setFilter('${t}')">#${t}</div>
    `).join('');
  }
}

window.onSearch = function(q) {
  const box = document.getElementById('search-results');
  if (!q) { box.style.display = 'none'; return; }
  const matches = nodes.filter(n => n.label.toLowerCase().includes(q.toLowerCase()));
  box.style.display = matches.length ? 'block' : 'none';
  box.innerHTML = matches.slice(0,10).map(n => `
    <div class="sr-item" onclick="focusNode(${n.id})" style="padding:8px; cursor:pointer; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="color:${COLORS[n.type || 'concept']}">${n.label}</span>
    </div>
  `).join('');
}

window.focusNode = function(id) {
  selected = selected === id ? null : id;
  const n = nodeMap[id];
  renderDetail(n || null);
  const sr = document.getElementById('search-results');
  if(sr) sr.style.display = 'none';
  const s = document.getElementById('search');
  if(s) s.value = '';
  if (n && id === selected) {
    const targetCamX = canvas.width/2 - n.x * camZoom;
    const targetCamY = canvas.height/2 - n.y * camZoom;
    if(!isNaN(targetCamX) && !isNaN(targetCamY)) {
        camX = targetCamX; camY = targetCamY;
    }
  }
}

function buildLegend() {
  const types = [...new Set(nodes.map(n => n.type || 'concept'))];
  const legend = document.getElementById('legend');
  if(!legend) return;
  legend.innerHTML = types.map(ty => {
    const typeStr = String(ty || 'concept');
    return `
      <div class="leg-item ${filterType===typeStr?'active':''}" onclick="setFilter('${typeStr}')">
        <div class="leg-dot" style="background:${COLORS[typeStr] || '#888'}"></div>
        ${typeStr.toUpperCase()}
      </div>
    `;
  }).join('');
}

window.setFilter = function(type) { filterType = filterType === type ? null : type; buildLegend(); }

function renderDetail(n) {
  const container = document.getElementById('hud-detail-panel');
  const panel = document.getElementById('node-detail');
  if (!n) { if(container) container.classList.remove('visible'); return; }
  if(container) container.classList.add('visible');
  const neighborIds = getNeighbors(n.id);
  const neighborNodes = nodes.filter(nn => neighborIds.has(nn.id));
  if(panel) {
    panel.innerHTML = `
      <div style="font-size:18px;font-weight:800;margin-bottom:8px">${n.label}</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-bottom:12px">TYPE.${(n.type || 'concept').toUpperCase()}</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:20px">${n.desc || t('noDesc')}</div>
      <div style="font-family:var(--font-mono);font-size:10px;font-weight:800;border-bottom:1px solid var(--border);padding-bottom:4px;margin-bottom:10px">${t('connected')}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${neighborNodes.map(nn => `
          <div class="item" onclick="focusNode(${nn.id})" style="padding:6px;background:rgba(255,255,255,0.03);border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px">
            <div class="leg-dot" style="background:${COLORS[nn.type || 'concept'] || '#888'}"></div>
            ${nn.label}
          </div>
        `).join('')}
      </div>
    `;
  }
}

window.fetchBrainJson = function() {
  const url = "brain.json?t=" + new Date().getTime();
  fetch(url).then(r => r.json()).then(data => initBrain(data)).catch(err => {
      const errOverlay = document.getElementById('error-overlay');
      if (errOverlay) errOverlay.classList.remove('hidden');
  });
}

window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    const s = document.getElementById('search');
    if(s) s.focus();
  }
});

window.addEventListener('DOMContentLoaded', fetchBrainJson);
window.addEventListener('resize', handleResize);
