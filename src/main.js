import './style.css';

// Initialize variables and state
const canvas = document.querySelector('#board');
const wrap = document.querySelector('#stageWrap');
const ctx = canvas.getContext('2d');
const channel = new BroadcastChannel('asteria-board-v2');
const clientId = crypto.randomUUID();

// Web Audio API Context (Initialized on first interaction)
let audioCtx = null;

const state = {
  boards: [],
  activeBoardId: null,
  tool: 'select',
  color: '#8b5cf6',
  width: 4,
  scale: 1,
  pan: { x: 0, y: 0 },
  drawing: null,
  selectedId: null,
  isDragging: false,
  isResizing: false,
  dragOffset: { x: 0, y: 0 },
  initialSize: { w: 0, h: 0 },
  peers: new Map(), // map of peerId -> { x, y, name, color, lastSeen, chatText, chatTime, trail }
  laserLines: [], // Array of { points: [{x, y, time}], color, width }
  soundEnabled: true,
  commandPaletteActive: false,
  activeTab: 'activity',
  theme: 'nebula',
  particles: [],
  sparks: []
};

const palette = ['#fff3a6', '#fecdd3', '#bfdbfe', '#bbf7d0', '#e9d5ff'];
const peerColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#eab308', '#d946ef'];
const myColor = peerColors[Math.floor(Math.random() * peerColors.length)];
const myName = localStorage.getItem('asteria-username') || seedUsername();

function seedUsername() {
  const names = ['Aries', 'Orion', 'Lyra', 'Cassiopeia', 'Andromeda', 'Pegasus', 'Cygnus', 'Perseus', 'Draco'];
  const name = names[Math.floor(Math.random() * names.length)] + ' ' + Math.floor(Math.random() * 100);
  localStorage.setItem('asteria-username', name);
  return name;
}

// -------------------------------------------------------------
// SOUND SYNTHESIS ENGINE (NATIVE WEB AUDIO API)
// -------------------------------------------------------------
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
}

function playSfx(type) {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    // Theme-based sound pitch shift multipliers
    let m = 1.0;
    if (state.theme === 'synthwave') m = 0.76; // retro analog warmer feel
    if (state.theme === 'matrix') m = 1.25;    // futuristic higher-pitch beep
    if (state.theme === 'blueprint') m = 0.95; // clicky blueprint draft drafting
    
    const now = audioCtx.currentTime;
    
    if (type === 'scribble') {
      // White noise synthesis for pencil drawing sounds
      const bufferSize = audioCtx.sampleRate * 0.05;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(600 * m, now);
      filter.Q.setValueAtTime(4, now);
      filter.frequency.exponentialRampToValueAtTime(1400 * m, now + 0.05);
      
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(now);
    } 
    else if (type === 'note') {
      // Harmonic synth chime when placing sticky notes
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(261.63 * m, now); // C4
      osc.frequency.exponentialRampToValueAtTime(523.25 * m, now + 0.12); // C5
      
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } 
    else if (type === 'shape') {
      // Warm sine bubble pop sound
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150 * m, now);
      osc.frequency.exponentialRampToValueAtTime(90 * m, now + 0.15);
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } 
    else if (type === 'connect') {
      // Celestial double bell resonance chime for connector link creation
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      osc1.frequency.setValueAtTime(587.33 * m, now); // D5
      osc2.frequency.setValueAtTime(880.00 * m, now + 0.05); // A5
      
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.3);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.3);
    } 
    else if (type === 'clear') {
      // Space noise whoosh sweep when clearing canvas
      const bufferSize = audioCtx.sampleRate * 0.45;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800 * m, now);
      filter.frequency.exponentialRampToValueAtTime(80 * m, now + 0.45);
      
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(now);
    } 
    else if (type === 'click') {
      // Short click sound for selections
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000 * m, now);
      
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.02);
    }
  } catch (err) {
    console.error("Sound synthesizer failed: ", err);
  }
}

// -------------------------------------------------------------
// CORE BOARD MANAGEMENT
// -------------------------------------------------------------
function uid() {
  return crypto.randomUUID();
}

function loadBoards() {
  try {
    const rawBoards = localStorage.getItem('asteria-boards-v2');
    const activeId = localStorage.getItem('asteria-active-board-v2');
    
    if (rawBoards) {
      state.boards = JSON.parse(rawBoards);
    } else {
      state.boards = seedBoards();
    }
    
    if (activeId && state.boards.some(b => b.id === activeId)) {
      state.activeBoardId = activeId;
    } else if (state.boards.length > 0) {
      state.activeBoardId = state.boards[0].id;
    }
  } catch (e) {
    state.boards = seedBoards();
    state.activeBoardId = state.boards[0].id;
  }
  
  saveBoards();
  renderBoardsUI();
  renderLayersUI();
}

function saveBoards() {
  localStorage.setItem('asteria-boards-v2', JSON.stringify(state.boards));
  if (state.activeBoardId) {
    localStorage.setItem('asteria-active-board-v2', state.activeBoardId);
  }
}

function seedBoards() {
  return [
    {
      id: uid(),
      name: 'Constellation Board',
      items: [
        { id: uid(), type: 'note', x: 200, y: 150, w: 200, h: 140, text: 'Asteria Collaborative Canvas\nCosmos Edition 🌌', color: '#e9d5ff', author: 'Eswar' },
        { id: uid(), type: 'note', x: 550, y: 180, w: 200, h: 140, text: '💡 Connect notes!\nSelect the Connector (➔)\ntool and link items.', color: '#fff3a6', author: 'Maya' },
        { id: uid(), type: 'shape', x: 450, y: 380, w: 120, h: 70, color: '#06b6d4', shapeType: 'rectangle' },
        { id: uid(), type: 'line', points: [{x:410,y:220},{x:480,y:250}], color: '#8b5cf6', width: 4 }
      ]
    },
    {
      id: uid(),
      name: 'Galactic Mindmap',
      items: [
        { id: uid(), type: 'note', x: 300, y: 200, w: 220, h: 130, text: 'Cosmic Roadmap ☄\n- Dark mode styling\n- Interactive connections\n- Dynamic sound synthesis', color: '#bfdbfe', author: 'Antigravity' }
      ]
    }
  ];
}

function getActiveBoard() {
  return state.boards.find(b => b.id === state.activeBoardId);
}

function renderBoardsUI() {
  const container = document.querySelector('#boardList');
  container.innerHTML = '';
  
  state.boards.forEach(board => {
    const btn = document.createElement('button');
    btn.className = `board ${board.id === state.activeBoardId ? 'active' : ''}`;
    
    // Choose icon color based on index
    const iconColors = ['purple', 'orange', 'teal'];
    const idx = state.boards.indexOf(board) % 3;
    const colorClass = iconColors[idx];
    
    btn.innerHTML = `
      <span class="board-icon ${colorClass}">✦</span>
      <span class="board-name-span">${escapeHtml(board.name)}</span>
      <button class="board-actions-btn" data-id="${board.id}" title="Rename or delete">•••</button>
    `;
    
    btn.onclick = (e) => {
      if (e.target.classList.contains('board-actions-btn')) {
        e.stopPropagation();
        manageBoardActions(board.id);
        return;
      }
      playSfx('click');
      state.activeBoardId = board.id;
      state.selectedId = null;
      saveBoards();
      renderBoardsUI();
      renderLayersUI();
      broadcast({ type: 'board-list-sync', boards: state.boards, activeBoardId: state.activeBoardId });
      
      const activeBoard = getActiveBoard();
      document.querySelector('#boardTitle').value = activeBoard ? activeBoard.name : '';
    };
    
    container.appendChild(btn);
  });
}

function manageBoardActions(boardId) {
  const board = state.boards.find(b => b.id === boardId);
  if (!board) return;
  
  const action = prompt(`Manage Board "${board.name}":\nType "rename" to change its title.\nType "delete" to destroy it.`, 'rename');
  
  if (action === 'rename') {
    const newName = prompt('Enter a name for the board constellation:', board.name);
    if (newName && newName.trim()) {
      board.name = newName.trim();
      saveBoards();
      renderBoardsUI();
      const activeBoard = getActiveBoard();
      document.querySelector('#boardTitle').value = activeBoard ? activeBoard.name : '';
      broadcast({ type: 'board-list-sync', boards: state.boards, activeBoardId: state.activeBoardId });
    }
  } else if (action === 'delete') {
    if (state.boards.length <= 1) {
      toast('Cannot delete the last remaining constellation!');
      return;
    }
    if (confirm(`Are you sure you want to delete board "${board.name}"?`)) {
      playSfx('clear');
      state.boards = state.boards.filter(b => b.id !== boardId);
      if (state.activeBoardId === boardId) {
        state.activeBoardId = state.boards[0].id;
      }
      state.selectedId = null;
      saveBoards();
      renderBoardsUI();
      renderLayersUI();
      
      const activeBoard = getActiveBoard();
      document.querySelector('#boardTitle').value = activeBoard ? activeBoard.name : '';
      
      broadcast({ type: 'board-list-sync', boards: state.boards, activeBoardId: state.activeBoardId });
      toast('Constellation deleted.');
    }
  }
}

// -------------------------------------------------------------
// LAYERS INSPECTOR
// -------------------------------------------------------------
function renderLayersUI() {
  const container = document.querySelector('#sectionLayers');
  container.innerHTML = '';
  
  const activeBoard = getActiveBoard();
  if (!activeBoard || !activeBoard.items || activeBoard.items.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0;">No stellar elements on canvas.</div>';
    return;
  }
  
  // Render list of items in reverse order (top layer first)
  const items = [...activeBoard.items].reverse();
  
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = `layer-item ${item.id === state.selectedId ? 'selected' : ''}`;
    
    let typeChar = '✎';
    let label = 'Sketch';
    if (item.type === 'note') {
      typeChar = '▤';
      label = `Note: "${item.text.substring(0, 12)}${item.text.length > 12 ? '...' : ''}"`;
    } else if (item.type === 'shape') {
      typeChar = '▭';
      label = 'Rectangle';
    } else if (item.type === 'connector') {
      typeChar = '➔';
      label = 'Connector Line';
    } else if (item.type === 'image') {
      typeChar = '🖼';
      label = 'Image Element';
    }
    
    div.innerHTML = `
      <span class="layer-type-icon" style="color: ${item.color || '#fff'}">${typeChar}</span>
      <span class="layer-name" title="Click to select">${escapeHtml(label)}</span>
      <div class="layer-actions">
        <button class="layer-action-btn toggle-lock" title="${item.locked ? 'Unlock element' : 'Lock element'}">${item.locked ? '🔒' : '🔓'}</button>
        <button class="layer-action-btn delete-layer" title="Delete element">🗑</button>
      </div>
    `;
    
    // Select element
    div.querySelector('.layer-name').onclick = () => {
      state.selectedId = item.id;
      playSfx('click');
      renderLayersUI();
    };
    
    // Lock / Unlock
    div.querySelector('.toggle-lock').onclick = (e) => {
      e.stopPropagation();
      item.locked = !item.locked;
      saveBoards();
      renderLayersUI();
      broadcast({ type: 'items-update', items: activeBoard.items });
      toast(item.locked ? 'Element locked' : 'Element unlocked');
    };
    
    // Delete layer
    div.querySelector('.delete-layer').onclick = (e) => {
      e.stopPropagation();
      playSfx('clear');
      activeBoard.items = activeBoard.items.filter(i => i.id !== item.id);
      
      // Also delete any connectors linked to this item
      activeBoard.items = activeBoard.items.filter(i => {
        if (i.type === 'connector') {
          return i.fromId !== item.id && i.toId !== item.id;
        }
        return true;
      });
      
      if (state.selectedId === item.id) {
        state.selectedId = null;
      }
      saveBoards();
      renderLayersUI();
      broadcast({ type: 'items-update', items: activeBoard.items });
      toast('Stellar element deleted');
    };
    
    container.appendChild(div);
  });
}

function updateTabs(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  
  const sectionActivity = document.querySelector('#sectionActivity');
  const sectionLayers = document.querySelector('#sectionLayers');
  const sectionAI = document.querySelector('#sectionAI');
  
  if (tabName === 'activity') {
    sectionActivity.style.display = 'block';
    sectionLayers.style.display = 'none';
    sectionAI.style.display = 'none';
  } else if (tabName === 'layers') {
    sectionActivity.style.display = 'none';
    sectionLayers.style.display = 'flex';
    sectionAI.style.display = 'none';
  } else if (tabName === 'ai') {
    sectionActivity.style.display = 'none';
    sectionLayers.style.display = 'none';
    sectionAI.style.display = 'flex';
  }
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => updateTabs(btn.dataset.tab);
});

// -------------------------------------------------------------
// MATH & VECTOR COMPUTATION
// -------------------------------------------------------------
// Translates client pointer coordinates to infinite canvas space coordinates
function toCanvasSpace(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.pan.x) / state.scale,
    y: (clientY - rect.top - state.pan.y) / state.scale
  };
}

// Check distance of mouse click to line segment
function getDistanceToSegment(mx, my, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(mx - ax, my - ay);
  
  let t = ((mx - ax) * dx + (my - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  
  return Math.hypot(mx - projX, my - projY);
}

// Find item under canvas pointer (Hit-testing)
function hitTestItem(worldX, worldY) {
  const activeBoard = getActiveBoard();
  if (!activeBoard) return null;
  
  // Iterate items backward to select the topmost layer first
  const items = activeBoard.items;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === 'note' || item.type === 'shape') {
      if (
        worldX >= item.x &&
        worldX <= item.x + item.w &&
        worldY >= item.y &&
        worldY <= item.y + item.h
      ) {
        return item;
      }
    } else if (item.type === 'line') {
      const pts = item.points;
      for (let j = 0; j < pts.length - 1; j++) {
        const d = getDistanceToSegment(worldX, worldY, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y);
        if (d < (item.width + 6)) {
          return item;
        }
      }
    }
  }
  return null;
}

// Get center point of elements (notes/shapes) for connectors
function getElementCenter(item) {
  return {
    x: item.x + item.w / 2,
    y: item.y + item.h / 2
  };
}

// Calculate the precise intersection of a line segment with a rectangle boundary
function getRectIntersection(rect, fromX, fromY, toX, toY) {
  const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  
  const dx = toX - fromX;
  const dy = toY - fromY;
  
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
    return { x: cx, y: cy };
  }
  
  let tMin = Infinity;
  let ix = cx, iy = cy;
  
  // Left intersection
  if (dx !== 0) {
    let t = (rx - fromX) / dx;
    let y = fromY + t * dy;
    if (t >= 0 && t <= 1 && y >= ry && y <= ry + rh) {
      if (t < tMin) { tMin = t; ix = rx; iy = y; }
    }
    // Right intersection
    t = (rx + rw - fromX) / dx;
    y = fromY + t * dy;
    if (t >= 0 && t <= 1 && y >= ry && y <= ry + rh) {
      if (t < tMin) { tMin = t; ix = rx + rw; iy = y; }
    }
  }
  
  // Top intersection
  if (dy !== 0) {
    let t = (ry - fromY) / dy;
    let x = fromX + t * dx;
    if (t >= 0 && t <= 1 && x >= rx && x <= rx + rw) {
      if (t < tMin) { tMin = t; ix = x; iy = ry; }
    }
    // Bottom intersection
    t = (ry + rh - fromY) / dy;
    x = fromX + t * dx;
    if (t >= 0 && t <= 1 && x >= rx && x <= rx + rw) {
      if (t < tMin) { tMin = t; ix = x; iy = ry + rh; }
    }
  }
  
  return tMin !== Infinity ? { x: ix, y: iy } : { x: cx, y: cy };
}

// -------------------------------------------------------------
// RENDERING SYSTEM (BUTTER-SMOOTH ANIMATION LOOP)
// -------------------------------------------------------------
function drawGrid() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  
  ctx.save();
  // Space background color
  ctx.fillStyle = state.theme === 'matrix' ? '#010803' : 
                  state.theme === 'synthwave' ? '#16021c' : 
                  state.theme === 'blueprint' ? '#061930' : 
                  '#07050f';
  ctx.fillRect(0, 0, w, h);
  
  // Initialize parallax stars if empty
  if (!state.parallaxStars || state.parallaxStars.length === 0) {
    state.parallaxStars = [];
    for (let layer = 0; layer < 3; layer++) {
      const stars = [];
      const count = layer === 0 ? 60 : layer === 1 ? 40 : 20;
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * 2000,
          y: Math.random() * 2000,
          size: layer * 0.5 + 0.5 + Math.random() * 0.3
        });
      }
      state.parallaxStars.push(stars);
    }
  }
  
  // Render Parallax Stars
  const multipliers = [0.12, 0.35, 0.7]; // Parallax coefficient layers
  state.parallaxStars.forEach((stars, layerIdx) => {
    const m = multipliers[layerIdx];
    // Offset based on viewport pan coordinates
    const ox = (state.pan.x * m) % w;
    const oy = (state.pan.y * m) % h;
    
    ctx.fillStyle = layerIdx === 0 ? 'rgba(255, 255, 255, 0.15)' :
                    layerIdx === 1 ? 'rgba(6, 182, 212, 0.3)' :
                    'rgba(139, 92, 246, 0.45)';
                    
    stars.forEach(star => {
      let sx = (star.x + ox) % w;
      let sy = (star.y + oy) % h;
      if (sx < 0) sx += w;
      if (sy < 0) sy += h;
      
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  
  // Render Theme Grid lines/dots
  ctx.strokeStyle = state.theme === 'matrix' ? 'rgba(34, 197, 94, 0.05)' :
                    state.theme === 'synthwave' ? 'rgba(236, 72, 153, 0.05)' :
                    state.theme === 'blueprint' ? 'rgba(255, 255, 255, 0.08)' :
                    'rgba(139, 92, 246, 0.08)';
  
  const gridSize = 40;
  // Apply viewport scale & pan offset
  const startX = state.pan.x % (gridSize * state.scale);
  const startY = state.pan.y % (gridSize * state.scale);
  
  if (state.theme === 'blueprint') {
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = startX; x < w; x += gridSize * state.scale) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = startY; y < h; y += gridSize * state.scale) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let x = startX; x < w; x += gridSize * state.scale) {
      for (let y = startY; y < h; y += gridSize * state.scale) {
        ctx.fillStyle = state.theme === 'matrix' ? 'rgba(34, 197, 94, 0.2)' :
                        state.theme === 'synthwave' ? 'rgba(236, 72, 153, 0.25)' :
                        'rgba(6, 182, 212, 0.2)';
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }
  
  ctx.restore();
}

function drawLine(item) {
  const p = item.points;
  if (!p || p.length < 2) return;
  
  ctx.save();
  ctx.strokeStyle = item.color || '#fff';
  ctx.lineWidth = item.width || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Draw stroke shadow/glow if needed
  ctx.shadowColor = item.color;
  ctx.shadowBlur = 6;
  
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) {
    ctx.lineTo(p[i].x, p[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawNote(n) {
  ctx.save();
  // Glass sticky note shadow & background
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  
  ctx.fillStyle = n.color || '#fff3a6';
  
  // Render sticky card with slightly transparent fill
  ctx.globalAlpha = 0.94;
  ctx.beginPath();
  ctx.roundRect(n.x, n.y, n.w, n.h, 10);
  ctx.fill();
  ctx.globalAlpha = 1.0;
  ctx.shadowColor = 'transparent';
  
  // Border border highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Render Text
  ctx.fillStyle = '#161327';
  ctx.font = '600 15px "DM Sans"';
  
  const textLines = (n.text || '').split('\n');
  textLines.forEach((line, i) => {
    ctx.fillText(line, n.x + 16, n.y + 32 + i * 20, n.w - 32);
  });
  
  // Render Author Tag at Bottom
  ctx.fillStyle = 'rgba(30, 27, 54, 0.6)';
  ctx.font = '10px "DM Mono"';
  ctx.fillText(`✦ ${n.author || 'Stellar'}`, n.x + 16, n.y + n.h - 14);
  
  ctx.restore();
}

function drawShape(s) {
  ctx.save();
  ctx.strokeStyle = s.color || '#8b5cf6';
  ctx.lineWidth = 3;
  
  // Neon glow effect
  ctx.shadowColor = s.color || '#8b5cf6';
  ctx.shadowBlur = 10;
  
  ctx.fillStyle = 'rgba(139, 92, 246, 0.05)';
  
  ctx.beginPath();
  ctx.roundRect(s.x, s.y, s.w, s.h, 8);
  ctx.fill();
  ctx.stroke();
  
  ctx.restore();
}

function drawImageItem(item) {
  if (!item.imgObj) {
    item.imgObj = new Image();
    item.imgObj.src = item.src;
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  
  try {
    if (item.imgObj.complete && item.imgObj.naturalWidth !== 0) {
      ctx.drawImage(item.imgObj, item.x, item.y, item.w, item.h);
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(item.x, item.y, item.w, item.h, 8);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px "DM Mono"';
      ctx.fillText('Loading Space Image...', item.x + 20, item.y + 30);
    }
  } catch (e) {
    console.error("Failed to draw image item", e);
  }
  ctx.restore();
}

function drawConnector(c, allItems) {
  const fromNode = allItems.find(i => i.id === c.fromId);
  const toNode = allItems.find(i => i.id === c.toId);
  if (!fromNode || !toNode) return;
  
  const c1 = getElementCenter(fromNode);
  const c2 = getElementCenter(toNode);
  
  // Calculate boundary intersections to draw line between outer shapes edges
  const ptStart = getRectIntersection(fromNode, c1.x, c1.y, c2.x, c2.y);
  const ptEnd = getRectIntersection(toNode, c1.x, c1.y, c2.x, c2.y);
  
  ctx.save();
  ctx.strokeStyle = c.color || '#06b6d4';
  ctx.lineWidth = 3;
  ctx.shadowColor = c.color || '#06b6d4';
  ctx.shadowBlur = 8;
  
  // Draw direct line
  ctx.beginPath();
  ctx.moveTo(ptStart.x, ptStart.y);
  ctx.lineTo(ptEnd.x, ptEnd.y);
  ctx.stroke();
  
  // Draw Arrowhead at ptEnd
  const angle = Math.atan2(ptEnd.y - ptStart.y, ptEnd.x - ptStart.x);
  const arrowSize = 12;
  
  ctx.fillStyle = c.color || '#06b6d4';
  ctx.beginPath();
  ctx.moveTo(ptEnd.x, ptEnd.y);
  ctx.lineTo(
    ptEnd.x - arrowSize * Math.cos(angle - Math.PI / 6),
    ptEnd.y - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    ptEnd.x - arrowSize * Math.cos(angle + Math.PI / 6),
    ptEnd.y - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
}

function renderLaserPointer() {
  const now = Date.now();
  
  // Clean expired laser lines (lifespan of 1.5 seconds)
  state.laserLines = state.laserLines.filter(line => {
    line.points = line.points.filter(p => now - p.time < 1500);
    return line.points.length > 1;
  });
  
  state.laserLines.forEach(line => {
    const pts = line.points;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw trail fading based on timestamp
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i-1];
      const p2 = pts[i];
      const age = now - p2.time;
      const alpha = Math.max(0, 1 - age / 1500);
      
      ctx.strokeStyle = `rgba(244, 63, 94, ${alpha * 0.95})`; // Neon red/rose
      ctx.lineWidth = (line.width || 4) * alpha;
      ctx.shadowColor = 'rgb(244, 63, 94)';
      ctx.shadowBlur = 10 * alpha;
      
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    
    ctx.restore();
  });
}

function renderActiveSelection(activeBoard) {
  if (!state.selectedId) return;
  const item = activeBoard.items.find(i => i.id === state.selectedId);
  if (!item || item.locked) return;
  
  ctx.save();
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = 4;
  
  if (item.type === 'note' || item.type === 'shape') {
    // Draw bounding selection outline
    ctx.beginPath();
    ctx.roundRect(item.x - 3, item.y - 3, item.w + 6, item.h + 6, 8);
    ctx.stroke();
    
    // Draw bottom-right resize anchor handle
    ctx.setLineDash([]);
    ctx.fillStyle = '#06b6d4';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    ctx.arc(item.x + item.w + 3, item.y + item.h + 3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (item.type === 'line') {
    // For freehand drawing, compute bounding box
    const xCoords = item.points.map(p => p.x);
    const yCoords = item.points.map(p => p.y);
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);
    
    ctx.beginPath();
    ctx.rect(minX - 4, minY - 4, (maxX - minX) + 8, (maxY - minY) + 8);
    ctx.stroke();
  }
  
  ctx.restore();
}

function spawnSparks(x, y, color) {
  const sparkColor = color || state.color;
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 2.5 + 1.2;
    state.sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      color: sparkColor,
      size: Math.random() * 2.5 + 1.5,
      decay: Math.random() * 0.04 + 0.02
    });
  }
}

function renderParticlesAndSparks() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  
  // Setup constellation particles if empty
  if (state.particles.length === 0) {
    for (let i = 0; i < 60; i++) {
      state.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() * 2 - 1) * 0.22,
        vy: (Math.random() * 2 - 1) * 0.22,
        size: Math.random() * 1.5 + 0.6
      });
    }
  }
  
  // 1. Draw Background constellation particles
  ctx.save();
  state.particles.forEach((p, idx) => {
    p.x += p.vx;
    p.y += p.vy;
    
    // Wrap boundaries
    if (p.x < 0) p.x = w;
    if (p.x > w) p.x = 0;
    if (p.y < 0) p.y = h;
    if (p.y > h) p.y = 0;
    
    // Repulsion from layout mouse coordinate pointer
    if (lastMouseScreenPos) {
      const dx = p.x - lastMouseScreenPos.x;
      const dy = p.y - lastMouseScreenPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 100) {
        const force = (100 - dist) * 0.04;
        p.x += (dx / dist) * force;
        p.y += (dy / dist) * force;
      }
    }
    
    // Draw particle star dot
    ctx.fillStyle = state.theme === 'matrix' ? 'rgba(34, 197, 94, 0.45)' : 
                    state.theme === 'synthwave' ? 'rgba(236, 72, 153, 0.45)' : 
                    state.theme === 'blueprint' ? 'rgba(56, 189, 248, 0.35)' :
                    'rgba(6, 182, 212, 0.45)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw fine constellation linkage threads
    for (let j = idx + 1; j < state.particles.length; j++) {
      const p2 = state.particles[j];
      const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
      if (dist < 85) {
        const alpha = (1 - dist / 85) * 0.12;
        ctx.strokeStyle = state.theme === 'matrix' ? `rgba(34, 197, 94, ${alpha})` :
                          state.theme === 'synthwave' ? `rgba(236, 72, 153, ${alpha})` :
                          state.theme === 'blueprint' ? `rgba(255, 255, 255, ${alpha * 0.5})` :
                          `rgba(139, 92, 246, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  });
  ctx.restore();
  
  // 2. Draw Fading Explosive Sparks
  if (state.sparks.length > 0) {
    ctx.save();
    state.sparks = state.sparks.filter(s => {
      s.x += s.vx;
      s.y += s.vy;
      s.alpha -= s.decay;
      
      if (s.alpha <= 0) return false;
      
      ctx.fillStyle = s.color || 'var(--color-cyan)';
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * s.alpha, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.restore();
  }
}

function renderPeerTrails() {
  const now = Date.now();
  
  state.peers.forEach(peer => {
    if (!peer.trail || peer.trail.length < 2) return;
    
    // Draw simple glowing comet trail behind peer cursors
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    peer.trail = peer.trail.filter(pt => now - pt.time < 800);
    
    for (let i = 1; i < peer.trail.length; i++) {
      const p1 = peer.trail[i - 1];
      const p2 = peer.trail[i];
      const alpha = Math.max(0, 1 - (now - p2.time) / 800);
      
      ctx.strokeStyle = hexToRgba(peer.color || '#00f5ff', alpha * 0.4);
      ctx.lineWidth = 5 * alpha;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    
    ctx.restore();
  });
}

function hexToRgba(hex, alpha) {
  // Simple hex conversion
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Main Frame render loop
function renderLoop() {
  const activeBoard = getActiveBoard();
  
  // Auto-resize canvas to match layout envelope
  const dpr = window.devicePixelRatio || 1;
  const rect = wrap.getBoundingClientRect();
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);
  
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  
  // Clear and setup grid
  drawGrid();
  
  // Render Background Constellation Particles & Fading Sparks
  renderParticlesAndSparks();
  
  // Apply translation (Scale & Pan offset)
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(state.pan.x, state.pan.y);
  ctx.scale(state.scale, state.scale);
  
  // Render Board items
  if (activeBoard && activeBoard.items) {
    // Render connector lines first (bottom layer)
    activeBoard.items.forEach(item => {
      if (item.type === 'connector' && !item.hidden) {
        drawConnector(item, activeBoard.items);
      }
    });
    
    // Render static shapes and notes
    activeBoard.items.forEach(item => {
      if (item.hidden) return;
      if (item.type === 'line') drawLine(item);
      if (item.type === 'note') drawNote(item);
      if (item.type === 'shape') drawShape(item);
      if (item.type === 'image') drawImageItem(item);
    });
  }
  
  // Render currently drawing active item
  if (state.drawing) {
    if (state.tool === 'pen') {
      drawLine(state.drawing);
    } else if (state.tool === 'shape') {
      drawShape(state.drawing);
    } else if (state.tool === 'connector' && state.drawing.fromCenter && state.drawing.currentPos) {
      // Draw temporary connector arrow line
      ctx.save();
      ctx.strokeStyle = state.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(state.drawing.fromCenter.x, state.drawing.fromCenter.y);
      ctx.lineTo(state.drawing.currentPos.x, state.drawing.currentPos.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  
  // Render fading laser pointer paths
  renderLaserPointer();
  
  // Render peer trailing cursors glow
  renderPeerTrails();
  
  // Render active selection borders
  if (activeBoard) {
    renderActiveSelection(activeBoard);
  }
  
  ctx.restore();
  
  // Live Telemetry diagnostics computation
  if (!state.lastFpsUpdate) {
    state.lastFpsUpdate = performance.now();
    state.frameCount = 0;
  }
  state.frameCount++;
  const now = performance.now();
  if (now - state.lastFpsUpdate >= 500) {
    const fps = Math.round((state.frameCount * 1000) / (now - state.lastFpsUpdate));
    state.frameCount = 0;
    state.lastFpsUpdate = now;
    
    const fpsEl = document.querySelector('#telemetryFPS');
    const countEl = document.querySelector('#telemetryCount');
    const sizeEl = document.querySelector('#telemetrySize');
    
    if (fpsEl) fpsEl.textContent = fps;
    if (countEl && activeBoard && activeBoard.items) countEl.textContent = activeBoard.items.length;
    if (sizeEl && activeBoard && activeBoard.items) {
      const payloadStr = JSON.stringify(activeBoard.items);
      const kb = (payloadStr.length / 1024).toFixed(1);
      sizeEl.textContent = `${kb} KB`;
    }
  }
  
  // Render mini-map navigation window
  updateMiniMap();
  
  // Peer HTML pointers positioning update
  renderPeerPointersUI();
  
  requestAnimationFrame(renderLoop);
}

// -------------------------------------------------------------
// USER MOUSE & EVENT HANDLERS
// -------------------------------------------------------------
let isPanning = false;
let startPan = { x: 0, y: 0 };
let startMouse = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', e => {
  canvas.focus();
  initAudio();
  
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  
  if (e.button === 0) {
    spawnSparks(screenX, screenY);
  }
  
  const wCoords = toCanvasSpace(e.clientX, e.clientY);
  canvas.setPointerCapture(e.pointerId);
  
  // A. Panning activation (Spacebar, middle mouse, or wheel press)
  if (e.button === 1 || e.shiftKey || state.tool === 'select' && (e.button === 0 && e.altKey)) {
    isPanning = true;
    startPan = { ...state.pan };
    startMouse = { x: e.clientX, y: e.clientY };
    return;
  }
  
  // Skip if not left click
  if (e.button !== 0) return;
  
  const activeBoard = getActiveBoard();
  if (!activeBoard) return;
  
  // B. Handle Select tool operations
  if (state.tool === 'select') {
    // 1. Check if clicking on bottom-right resize handle of selected item
    if (state.selectedId) {
      const item = activeBoard.items.find(i => i.id === state.selectedId);
      if (item && !item.locked && (item.type === 'note' || item.type === 'shape')) {
        const handleX = item.x + item.w + 3;
        const handleY = item.y + item.h + 3;
        const dist = Math.hypot(wCoords.x - handleX, wCoords.y - handleY);
        
        if (dist < 8) {
          state.isResizing = true;
          state.initialSize = { w: item.w, h: item.h };
          state.dragOffset = { x: wCoords.x, y: wCoords.y };
          return;
        }
      }
    }
    
    // 2. Otherwise do hit testing for select/drag
    const hit = hitTestItem(wCoords.x, wCoords.y);
    if (hit) {
      playSfx('click');
      state.selectedId = hit.id;
      if (!hit.locked) {
        state.isDragging = true;
        state.dragOffset = {
          x: wCoords.x - hit.x,
          y: wCoords.y - hit.y
        };
      }
      renderLayersUI();
    } else {
      state.selectedId = null;
      renderLayersUI();
    }
  } 
  
  // C. Pen Tool
  else if (state.tool === 'pen') {
    playSfx('scribble');
    state.drawing = {
      id: uid(),
      type: 'line',
      points: [wCoords],
      color: state.color,
      width: state.width
    };
  } 
  
  // D. Laser Tool
  else if (state.tool === 'laser') {
    state.drawing = {
      points: [{ ...wCoords, time: Date.now() }],
      color: '#f43f5e',
      width: 5
    };
  } 
  
  // E. Sticky note
  else if (state.tool === 'note') {
    playSfx('note');
    const newNote = {
      id: uid(),
      type: 'note',
      x: wCoords.x - 90,
      y: wCoords.y - 60,
      w: 190,
      h: 130,
      text: 'New Idea',
      color: palette[Math.floor(Math.random() * palette.length)],
      author: myName
    };
    commitItem(newNote);
    state.tool = 'select';
    state.selectedId = newNote.id;
    updateToolbarSelection();
    // Trigger double-click inline editor immediately
    showInlineNoteTextEditor(newNote);
  } 
  
  // F. Shape
  else if (state.tool === 'shape') {
    playSfx('shape');
    state.drawing = {
      id: uid(),
      type: 'shape',
      x: wCoords.x,
      y: wCoords.y,
      w: 0,
      h: 0,
      color: state.color,
      shapeType: 'rectangle'
    };
  } 
  
  // G. Connector Arrow Draw
  else if (state.tool === 'connector') {
    const hit = hitTestItem(wCoords.x, wCoords.y);
    if (hit && (hit.type === 'note' || hit.type === 'shape')) {
      const center = getElementCenter(hit);
      state.drawing = {
        type: 'connector-draft',
        fromId: hit.id,
        fromCenter: center,
        currentPos: wCoords
      };
    }
  }
});

let lastMouseScreenPos = null;

canvas.addEventListener('pointermove', e => {
  const rect = canvas.getBoundingClientRect();
  lastMouseScreenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  
  const wCoords = toCanvasSpace(e.clientX, e.clientY);
  
  // Broadcast live cursor coordinate coordinates
  broadcast({
    type: 'pointer-move',
    x: wCoords.x,
    y: wCoords.y,
    color: myColor,
    name: myName
  });
  
  // A. Drag Pan
  if (isPanning) {
    state.pan.x = startPan.x + (e.clientX - startMouse.x);
    state.pan.y = startPan.y + (e.clientY - startMouse.y);
    return;
  }
  
  // B. Drag Elements
  if (state.isDragging && state.selectedId) {
    const activeBoard = getActiveBoard();
    const item = activeBoard.items.find(i => i.id === state.selectedId);
    if (item && !item.locked) {
      item.x = wCoords.x - state.dragOffset.x;
      item.y = wCoords.y - state.dragOffset.y;
    }
  } 
  
  // C. Resize Elements
  else if (state.isResizing && state.selectedId) {
    const activeBoard = getActiveBoard();
    const item = activeBoard.items.find(i => i.id === state.selectedId);
    if (item && !item.locked) {
      const dx = wCoords.x - state.dragOffset.x;
      const dy = wCoords.y - state.dragOffset.y;
      item.w = Math.max(50, state.initialSize.w + dx);
      item.h = Math.max(50, state.initialSize.h + dy);
    }
  }
  
  // D. Freehand Pen Stroke
  else if (state.drawing) {
    if (state.drawing.type === 'line') {
      // play soft sound periodically
      if (Math.random() < 0.2) playSfx('scribble');
      state.drawing.points.push(wCoords);
    } else if (state.drawing.type === 'shape') {
      state.drawing.w = wCoords.x - state.drawing.x;
      state.drawing.h = wCoords.y - state.drawing.y;
    } else if (state.drawing.type === 'connector-draft') {
      state.drawing.currentPos = wCoords;
    } else if (state.tool === 'laser') {
      state.drawing.points.push({ ...wCoords, time: Date.now() });
    }
  }
});

canvas.addEventListener('pointerup', () => {
  isPanning = false;
  state.isDragging = false;
  state.isResizing = false;
  
  if (!state.drawing) {
    // If just finished dragging or resizing element, commit changes
    if (state.selectedId) {
      saveBoards();
      const activeBoard = getActiveBoard();
      if (activeBoard) {
        broadcast({ type: 'items-update', items: activeBoard.items });
      }
    }
    return;
  }
  
  const draft = state.drawing;
  state.drawing = null;
  
  const activeBoard = getActiveBoard();
  if (!activeBoard) return;
  
  if (draft.type === 'line' && draft.points.length > 1) {
    commitItem(draft);
  } else if (draft.type === 'shape' && Math.abs(draft.w) > 4 && Math.abs(draft.h) > 4) {
    // Normalize dimensions if drawn backwards
    if (draft.w < 0) {
      draft.x += draft.w;
      draft.w = Math.abs(draft.w);
    }
    if (draft.h < 0) {
      draft.y += draft.h;
      draft.h = Math.abs(draft.h);
    }
    commitItem(draft);
  } else if (draft.type === 'connector-draft' && draft.currentPos) {
    const hit = hitTestItem(draft.currentPos.x, draft.currentPos.y);
    if (hit && (hit.type === 'note' || hit.type === 'shape') && hit.id !== draft.fromId) {
      playSfx('connect');
      const newConnector = {
        id: uid(),
        type: 'connector',
        fromId: draft.fromId,
        toId: hit.id,
        color: state.color
      };
      commitItem(newConnector);
    }
  } else if (state.tool === 'laser' && draft.points.length > 1) {
    state.laserLines.push(draft);
  }
});

// Double click to edit sticky note text
canvas.addEventListener('dblclick', e => {
  const wCoords = toCanvasSpace(e.clientX, e.clientY);
  const hit = hitTestItem(wCoords.x, wCoords.y);
  
  if (hit && hit.type === 'note' && !hit.locked) {
    showInlineNoteTextEditor(hit);
  }
});

// Double-click inline notes editor textarea overlay
function showInlineNoteTextEditor(note) {
  // Remove existing overlays first
  removeInlineEditor();
  
  const overlay = document.createElement('div');
  overlay.className = 'canvas-input-overlay';
  overlay.id = 'noteEditorOverlay';
  
  // Calculate overlay pixel bounds based on screen zoom and scale pan translation
  const rect = canvas.getBoundingClientRect();
  const screenX = note.x * state.scale + state.pan.x + rect.left;
  const screenY = note.y * state.scale + state.pan.y + rect.top;
  const screenW = note.w * state.scale;
  const screenH = note.h * state.scale;
  
  overlay.style.left = `${screenX}px`;
  overlay.style.top = `${screenY}px`;
  overlay.style.width = `${screenW}px`;
  overlay.style.height = `${screenH}px`;
  
  const textarea = document.createElement('textarea');
  textarea.value = note.text;
  
  // Align textarea sizes
  textarea.style.fontSize = `${15 * state.scale}px`;
  textarea.style.padding = `${12 * state.scale}px`;
  
  overlay.appendChild(textarea);
  document.body.appendChild(overlay);
  
  textarea.focus();
  
  // Auto select text
  textarea.select();
  
  function saveText() {
    note.text = textarea.value.trim() || 'Constellation Idea';
    saveBoards();
    removeInlineEditor();
    renderLayersUI();
    
    const activeBoard = getActiveBoard();
    if (activeBoard) {
      broadcast({ type: 'items-update', items: activeBoard.items });
      updateActivityLog(`edited a sticky note`, 'You');
    }
  }
  
  // Blur and ESC events
  textarea.onblur = saveText;
  textarea.onkeydown = e => {
    if (e.key === 'Escape') {
      removeInlineEditor();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      saveText();
    }
  };
}

function removeInlineEditor() {
  const el = document.querySelector('#noteEditorOverlay');
  if (el) el.remove();
}

// -------------------------------------------------------------
// ZOOM SYSTEM
// -------------------------------------------------------------
function zoomAroundCursor(factor, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;
  
  // Find point coordinates relative to canvas center
  const worldX = (mouseX - state.pan.x) / state.scale;
  const worldY = (mouseY - state.pan.y) / state.scale;
  
  const targetScale = Math.max(0.4, Math.min(3.0, +(state.scale * factor).toFixed(2)));
  
  state.scale = targetScale;
  state.pan.x = mouseX - worldX * state.scale;
  state.pan.y = mouseY - worldY * state.scale;
  
  document.querySelector('#zoomValue').textContent = Math.round(state.scale * 100) + '%';
  
  // Re-adjust active sticky editor if shown
  const activeOverlay = document.querySelector('#noteEditorOverlay');
  if (activeOverlay) removeInlineEditor();
}

// Wheel zoom
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
  zoomAroundCursor(zoomFactor, e.clientX, e.clientY);
}, { passive: false });

// Zoom button controls
document.querySelector('#zoomIn').onclick = () => {
  const rect = canvas.getBoundingClientRect();
  zoomAroundCursor(1.15, rect.width / 2 + rect.left, rect.height / 2 + rect.top);
};
document.querySelector('#zoomOut').onclick = () => {
  const rect = canvas.getBoundingClientRect();
  zoomAroundCursor(0.85, rect.width / 2 + rect.left, rect.height / 2 + rect.top);
};
document.querySelector('#zoomReset').onclick = () => {
  state.scale = 1.0;
  state.pan = { x: 0, y: 0 };
  document.querySelector('#zoomValue').textContent = '100%';
  removeInlineEditor();
};

// -------------------------------------------------------------
// TOOLBAR CONTROLS
// -------------------------------------------------------------
function setTool(tool) {
  state.tool = tool;
  state.selectedId = null;
  updateToolbarSelection();
  removeInlineEditor();
}

function updateToolbarSelection() {
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.tool === state.tool);
  });
  
  if (state.tool === 'select') {
    canvas.style.cursor = 'default';
  } else if (state.tool === 'pen' || state.tool === 'laser') {
    canvas.style.cursor = 'crosshair';
  } else {
    canvas.style.cursor = 'cell';
  }
}

document.querySelectorAll('[data-tool]').forEach(btn => {
  btn.onclick = () => {
    playSfx('click');
    setTool(btn.dataset.tool);
  };
});

// Color picker updates
const colorPickerInput = document.querySelector('#color');
const colorIndicator = document.querySelector('#colorIndicator');

colorPickerInput.oninput = e => {
  state.color = e.target.value;
  colorIndicator.style.backgroundColor = state.color;
};

// Stroke width range slider
document.querySelector('#width').oninput = e => {
  state.width = +e.target.value;
};

// Sound toggle controller button
const soundToggle = document.querySelector('#soundToggle');
soundToggle.onclick = () => {
  state.soundEnabled = !state.soundEnabled;
  soundToggle.textContent = state.soundEnabled ? '🔊' : '🔇';
  soundToggle.title = state.soundEnabled ? 'Mute synthesized sound feedback' : 'Enable synthesized sound feedback';
  playSfx('click');
  toast(state.soundEnabled ? 'Synthesizer Audio Enabled' : 'Audio Muted');
};

// Undo & Redo History management
function getHistoryStack() {
  const activeBoard = getActiveBoard();
  if (!activeBoard) return null;
  if (!activeBoard.undoStack) activeBoard.undoStack = [];
  if (!activeBoard.redoStack) activeBoard.redoStack = [];
  return activeBoard;
}

function commitItem(item) {
  const activeBoard = getActiveBoard();
  if (!activeBoard) return;
  
  activeBoard.items.push(item);
  
  const hist = getHistoryStack();
  if (hist) {
    hist.undoStack.push({ type: 'add', item });
    hist.redoStack = [];
  }
  
  saveBoards();
  renderLayersUI();
  
  let label = 'sketch';
  if (item.type === 'note') label = 'sticky note';
  if (item.type === 'shape') label = 'shape';
  if (item.type === 'connector') label = 'connector line';
  
  updateActivityLog(`added a new ${label}`, 'You');
  broadcast({ type: 'items-update', items: activeBoard.items });
}

function undo() {
  const hist = getHistoryStack();
  if (!hist || hist.undoStack.length === 0) return;
  
  playSfx('click');
  const op = hist.undoStack.pop();
  hist.redoStack.push(op);
  
  if (op.type === 'add') {
    hist.items = hist.items.filter(i => i.id !== op.item.id);
  }
  
  saveBoards();
  renderLayersUI();
  updateActivityLog('undid changes');
  broadcast({ type: 'items-update', items: hist.items });
}

function redo() {
  const hist = getHistoryStack();
  if (!hist || hist.redoStack.length === 0) return;
  
  playSfx('click');
  const op = hist.redoStack.pop();
  hist.undoStack.push(op);
  
  if (op.type === 'add') {
    hist.items.push(op.item);
  }
  
  saveBoards();
  renderLayersUI();
  updateActivityLog('restored undid changes');
  broadcast({ type: 'items-update', items: hist.items });
}

document.querySelector('#undo').onclick = undo;
document.querySelector('#redo').onclick = redo;

// Clear whole board canvas
document.querySelector('#clearBoard').onclick = () => {
  const activeBoard = getActiveBoard();
  if (!activeBoard || activeBoard.items.length === 0) return;
  
  if (confirm('Are you sure you want to clear this board constellation?')) {
    playSfx('clear');
    activeBoard.items = [];
    
    const hist = getHistoryStack();
    if (hist) {
      hist.undoStack = [];
      hist.redoStack = [];
    }
    
    saveBoards();
    renderLayersUI();
    updateActivityLog('cleared the board');
    broadcast({ type: 'items-update', items: [] });
    toast('Board cleared');
  }
};

// Board Title field editing
document.querySelector('#boardTitle').onchange = e => {
  const activeBoard = getActiveBoard();
  if (activeBoard) {
    const val = e.target.value.trim();
    if (val) {
      activeBoard.name = val;
      saveBoards();
      renderBoardsUI();
      broadcast({ type: 'board-list-sync', boards: state.boards, activeBoardId: state.activeBoardId });
    }
  }
};

// Create new board
document.querySelector('#newBoard').onclick = () => {
  playSfx('note');
  const newName = prompt('Enter a name for the new constellation board:', `Constellation ${state.boards.length + 1}`);
  if (newName && newName.trim()) {
    const newB = {
      id: uid(),
      name: newName.trim(),
      items: []
    };
    state.boards.push(newB);
    state.activeBoardId = newB.id;
    saveBoards();
    renderBoardsUI();
    renderLayersUI();
    
    document.querySelector('#boardTitle').value = newB.name;
    broadcast({ type: 'board-list-sync', boards: state.boards, activeBoardId: state.activeBoardId });
    toast('New board created');
  }
};

// -------------------------------------------------------------
// fig-style CURSOR CHAT (Press / key)
// -------------------------------------------------------------
let isChatting = false;

function showCursorChatInput() {
  if (isChatting) return;
  
  const existing = document.querySelector('#cursorChatInputContainer');
  if (existing) existing.remove();
  
  isChatting = true;
  
  const container = document.createElement('div');
  container.className = 'cursor-chat-input-container';
  container.id = 'cursorChatInputContainer';
  
  const bubble = document.createElement('div');
  bubble.className = 'cursor-chat-bubble';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 50;
  input.placeholder = 'Say something...';
  
  bubble.appendChild(input);
  container.appendChild(bubble);
  document.body.appendChild(container);
  
  // Position it immediately next to client cursor (approximate coordinates)
  let lastX = window.innerWidth / 2;
  let lastY = window.innerHeight / 2;
  
  const updatePos = e => {
    lastX = e.clientX;
    lastY = e.clientY;
    container.style.left = `${lastX + 10}px`;
    container.style.top = `${lastY + 12}px`;
  };
  
  // Read mouse coordinates
  window.addEventListener('mousemove', updatePos);
  
  input.focus();
  
  input.oninput = () => {
    broadcast({ type: 'cursor-chat-type', text: input.value });
  };
  
  function closeChat() {
    window.removeEventListener('mousemove', updatePos);
    container.remove();
    isChatting = false;
    broadcast({ type: 'cursor-chat-type', text: '' });
    // Refocus canvas
    canvas.focus();
  }
  
  input.onblur = closeChat;
  input.onkeydown = e => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      closeChat();
    }
  };
}

// Listen to keyboard shortcut '/'
window.addEventListener('keydown', e => {
  if (state.commandPaletteActive) return;
  
  // Ignore keys typed in edit fields
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    return;
  }
  
  if (e.key === '/') {
    e.preventDefault();
    showCursorChatInput();
  }
});

// -------------------------------------------------------------
// BROADCASTCHANNEL SYNC ENGINE
// -------------------------------------------------------------
function broadcast(payload) {
  channel.postMessage({
    ...payload,
    from: clientId,
    senderName: myName,
    at: Date.now()
  });
}

channel.onmessage = e => {
  const m = e.data;
  if (m.from === clientId) return;
  
  // A. Peer Cursor and Pointer sync
  if (m.type === 'pointer-move') {
    let peer = state.peers.get(m.from);
    const now = Date.now();
    
    if (!peer) {
      peer = {
        name: m.senderName,
        color: m.color,
        x: m.x,
        y: m.y,
        lastSeen: now,
        trail: [],
        chatText: '',
        chatTime: 0
      };
      state.peers.set(m.from, peer);
      renderCollaboratorsList();
    }
    
    peer.x = m.x;
    peer.y = m.y;
    peer.lastSeen = now;
    
    // Add path coordinate history for neon particle trail
    peer.trail.push({ x: m.x, y: m.y, time: now });
    if (peer.trail.length > 25) {
      peer.trail.shift();
    }
    
    updatePeerCursorEl(m.from, peer);
  } 
  
  // B. Items commitment updates
  else if (m.type === 'items-update') {
    const activeBoard = getActiveBoard();
    if (activeBoard) {
      activeBoard.items = m.items;
      saveBoards();
      renderLayersUI();
    }
  } 
  
  // C. Sync board configurations list
  else if (m.type === 'board-list-sync') {
    state.boards = m.boards;
    state.activeBoardId = m.activeBoardId;
    saveBoards();
    renderBoardsUI();
    renderLayersUI();
    
    const activeBoard = getActiveBoard();
    document.querySelector('#boardTitle').value = activeBoard ? activeBoard.name : '';
  } 
  
  // D. Peer Cursor typing chat sync
  else if (m.type === 'cursor-chat-type') {
    const peer = state.peers.get(m.from);
    if (peer) {
      peer.chatText = m.text;
      peer.chatTime = m.text ? Date.now() : 0;
      updatePeerCursorEl(m.from, peer);
    }
  } 
  
  // E. Ping sync handshakes
  else if (m.type === 'handshake-ping') {
    broadcast({ type: 'handshake-pong', boards: state.boards, activeBoardId: state.activeBoardId });
    addPeerPresence(m.from, m.senderName, m.color);
  } 
  else if (m.type === 'handshake-pong') {
    addPeerPresence(m.from, m.senderName, m.color);
  }
  else if (m.type === 'theme-change') {
    applyTheme(m.theme, false);
  }
};

function addPeerPresence(id, name, color) {
  if (!state.peers.has(id)) {
    state.peers.set(id, {
      name,
      color,
      x: 0, y: 0,
      lastSeen: Date.now(),
      trail: [],
      chatText: '',
      chatTime: 0
    });
    renderCollaboratorsList();
    updateActivityLog(`joined the space`, name);
  }
}

function updatePeerCursorEl(id, peer) {
  let el = document.querySelector(`#peer-cursor-${id}`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'remote-cursor';
    el.id = `peer-cursor-${id}`;
    
    el.innerHTML = `
      <span class="cursor-arrow">✦</span>
      <small class="cursor-label"></small>
      <div class="peer-cursor-chat" style="display:none;"></div>
    `;
    
    wrap.appendChild(el);
  }
  
  // Convert peer world coordinates to layout pixel coordinates for display
  const screenX = peer.x * state.scale + state.pan.x;
  const screenY = peer.y * state.scale + state.pan.y;
  
  el.style.transform = `translate(${screenX}px, ${screenY}px)`;
  el.querySelector('.cursor-arrow').style.color = peer.color;
  
  const label = el.querySelector('.cursor-label');
  label.textContent = peer.name;
  label.style.backgroundColor = peer.color;
  
  // Show / Hide chat bubble overlay
  const chatBubble = el.querySelector('.peer-cursor-chat');
  if (peer.chatText) {
    chatBubble.style.display = 'block';
    chatBubble.textContent = peer.chatText;
    chatBubble.style.borderColor = peer.color;
  } else {
    chatBubble.style.display = 'none';
  }
  
  el.classList.add('visible');
}

function renderPeerPointersUI() {
  state.peers.forEach((peer, id) => {
    updatePeerCursorEl(id, peer);
  });
}

// Renders list of collaborators at top header bar and updates inspector presence card
function renderCollaboratorsList() {
  const avatarsWrap = document.querySelector('#collaboratorsAvatars');
  avatarsWrap.innerHTML = '';
  
  // Render Me
  const meSpan = document.createElement('span');
  meSpan.className = 'avatar violet';
  meSpan.style.backgroundColor = myColor;
  meSpan.textContent = myName.charAt(0).toUpperCase();
  meSpan.title = `${myName} (You)`;
  avatarsWrap.appendChild(meSpan);
  
  let peerCount = 0;
  state.peers.forEach(peer => {
    peerCount++;
    if (peerCount <= 3) {
      const pSpan = document.createElement('span');
      pSpan.className = 'avatar';
      pSpan.style.backgroundColor = peer.color;
      pSpan.textContent = peer.name.charAt(0).toUpperCase();
      pSpan.title = peer.name;
      avatarsWrap.appendChild(pSpan);
    }
  });
  
  if (peerCount > 3) {
    const extra = document.createElement('span');
    extra.className = 'avatar-count';
    extra.textContent = `+${peerCount - 3}`;
    avatarsWrap.appendChild(extra);
  }
  
  // Presence details card inside inspector panel
  const presenceCount = document.querySelector('#presenceCount');
  const presenceText = document.querySelector('#presenceText');
  const syncDetail = document.querySelector('#syncDetail');
  
  if (peerCount > 0) {
    presenceCount.textContent = `You + ${peerCount} collaborator${peerCount > 1 ? 's' : ''} online`;
    presenceText.textContent = 'Changes and pointers are appearing in real-time.';
    syncDetail.textContent = `${peerCount} peer${peerCount > 1 ? 's' : ''} connected`;
  } else {
    presenceCount.textContent = 'You are creating solo';
    presenceText.textContent = 'Open this board in another browser tab to collaborate.';
    syncDetail.textContent = 'Waiting for peers';
  }
}

// Periodic cleanup of stale peer cursors (idle timeout of 8 seconds)
setInterval(() => {
  const now = Date.now();
  let changed = false;
  
  state.peers.forEach((peer, id) => {
    if (now - peer.lastSeen > 8000) {
      // Remove HTML element
      const el = document.querySelector(`#peer-cursor-${id}`);
      if (el) el.remove();
      
      state.peers.delete(id);
      updateActivityLog(`left the space`, peer.name);
      changed = true;
    } else if (peer.chatText && now - peer.chatTime > 5000) {
      // Clear peer chat balloon after 5 seconds of inactivity
      peer.chatText = '';
      peer.chatTime = 0;
      const el = document.querySelector(`#peer-cursor-${id}`);
      if (el) {
        el.querySelector('.peer-cursor-chat').style.display = 'none';
      }
    }
  });
  
  if (changed) {
    renderCollaboratorsList();
  }
}, 3000);

// -------------------------------------------------------------
// ACTIVITY LOG FEED
// -------------------------------------------------------------
function updateActivityLog(action, who = 'Teammate') {
  const list = document.querySelector('#activityList');
  if (!list) return;
  
  const li = document.createElement('li');
  const avatarCol = who === 'You' ? 'violet' : 'mint';
  const char = who.charAt(0).toUpperCase();
  
  li.innerHTML = `
    <span class="activity-avatar avatar ${avatarCol}" style="background-color: ${who === 'You' ? myColor : '#10b981'}">${char}</span>
    <p><strong>${escapeHtml(who)}</strong> ${escapeHtml(action)}<small>just now</small></p>
  `;
  
  list.prepend(li);
  
  // Truncate stack list length to 10 entries
  while (list.children.length > 10) {
    list.lastElementChild.remove();
  }
}

// -------------------------------------------------------------
// JSON DATA EXPORT / IMPORT BACKUPS
// -------------------------------------------------------------
document.querySelector('#exportBtn').onclick = () => {
  // Export High-DPI PNG image snapshot
  const activeBoard = getActiveBoard();
  const title = activeBoard ? activeBoard.name.toLowerCase().replace(/\s+/g, '-') : 'asteria-board';
  
  const link = document.createElement('a');
  link.download = `${title}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  
  playSfx('click');
  toast('PNG Board Snapshot Exported');
};

document.querySelector('#exportJsonBtn').onclick = () => {
  // Export board data as downloadable JSON
  const activeBoard = getActiveBoard();
  if (!activeBoard) return;
  
  const payload = {
    version: 'asteria-v2',
    name: activeBoard.name,
    items: activeBoard.items
  };
  
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const link = document.createElement('a');
  link.download = `${activeBoard.name.toLowerCase().replace(/\s+/g, '-')}-backup.json`;
  link.href = dataStr;
  link.click();
  
  playSfx('click');
  toast('JSON constellation data backup exported');
};

const fileInput = document.querySelector('#importJsonFile');
document.querySelector('#importJsonBtn').onclick = () => {
  fileInput.click();
};

fileInput.onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.version === 'asteria-v2' || data.items) {
        // Create new imported board
        const newBoard = {
          id: uid(),
          name: data.name ? `${data.name} (Imported)` : 'Imported Constellation',
          items: data.items.map(item => ({ ...item, id: item.id || uid() })) // ensure clean IDs
        };
        state.boards.push(newBoard);
        state.activeBoardId = newBoard.id;
        
        saveBoards();
        renderBoardsUI();
        renderLayersUI();
        
        document.querySelector('#boardTitle').value = newBoard.name;
        broadcast({ type: 'board-list-sync', boards: state.boards, activeBoardId: state.activeBoardId });
        
        playSfx('note');
        toast('Board imported successfully!');
      } else {
        toast('Invalid canvas JSON schema version');
      }
    } catch (err) {
      toast('Failed to parse selected JSON data file.');
    }
  };
  reader.readAsText(file);
  // Clear input
  fileInput.value = '';
};

// -------------------------------------------------------------
// GLASS COMMAND PALETTE (CTRL+K INTERFACE)
// -------------------------------------------------------------
const cmdPalette = document.querySelector('#commandPalette');
const cmdInput = document.querySelector('#commandInput');
const cmdResults = document.querySelector('#commandResults');

const commands = [
  { name: 'Switch to Selection tool', shortcut: 'V', action: () => setTool('select') },
  { name: 'Switch to Pen drawing tool', shortcut: 'P', action: () => setTool('pen') },
  { name: 'Switch to Fading Laser Pointer', shortcut: 'L', action: () => setTool('laser') },
  { name: 'Place Sticky Note on canvas', shortcut: 'N', action: () => setTool('note') },
  { name: 'Draw Constellation Shape', shortcut: 'R', action: () => setTool('shape') },
  { name: 'Draw Link Connector Arrow', shortcut: 'C', action: () => setTool('connector') },
  { name: 'Create New Board Constellation', shortcut: 'Ctrl+N', action: () => document.querySelector('#newBoard').click() },
  { name: 'Export PNG Snapshot image', shortcut: 'Ctrl+E', action: () => document.querySelector('#exportBtn').click() },
  { name: 'Backup Board state to JSON', shortcut: '', action: () => document.querySelector('#exportJsonBtn').click() },
  { name: 'Toggle Audio Synthesizer sound', shortcut: '', action: () => document.querySelector('#soundToggle').click() },
  { name: 'Clear current Canvas items', shortcut: '', action: () => document.querySelector('#clearBoard').click() }
];

let selectedResultIndex = 0;

function toggleCommandPalette() {
  state.commandPaletteActive = !state.commandPaletteActive;
  cmdPalette.classList.toggle('active', state.commandPaletteActive);
  
  if (state.commandPaletteActive) {
    cmdInput.value = '';
    selectedResultIndex = 0;
    renderCommandResults();
    setTimeout(() => cmdInput.focus(), 80);
  } else {
    canvas.focus();
  }
}

function renderCommandResults() {
  cmdResults.innerHTML = '';
  const filterText = cmdInput.value.toLowerCase().trim();
  
  // Filter static actions + active board elements
  let matched = commands.filter(c => c.name.toLowerCase().includes(filterText));
  
  // Also search layer elements on current board
  const activeBoard = getActiveBoard();
  if (activeBoard && activeBoard.items) {
    activeBoard.items.forEach(item => {
      let desc = '';
      if (item.type === 'note') desc = `Layer Note: "${item.text.substring(0, 15)}..."`;
      if (item.type === 'shape') desc = 'Layer Rectangle';
      if (item.type === 'line') desc = 'Layer Freehand Sketch';
      
      if (desc && desc.toLowerCase().includes(filterText)) {
        matched.push({
          name: `Focus Layer: ${desc}`,
          shortcut: 'Layer',
          action: () => {
            state.selectedId = item.id;
            state.tool = 'select';
            updateToolbarSelection();
            
            // Pan to center item on canvas viewport
            const rect = canvas.getBoundingClientRect();
            const center = item.type === 'line' ? item.points[0] : { x: item.x + item.w/2, y: item.y + item.h/2 };
            
            state.pan.x = rect.width / 2 - center.x * state.scale;
            state.pan.y = rect.height / 2 - center.y * state.scale;
            
            renderLayersUI();
            playSfx('click');
            toast('Focused on selected element');
          }
        });
      }
    });
  }
  
  if (matched.length === 0) {
    cmdResults.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px;text-align:center;">No commands found.</div>';
    return;
  }
  
  // Cap at 7 results for compact layout
  matched = matched.slice(0, 7);
  
  if (selectedResultIndex >= matched.length) selectedResultIndex = 0;
  
  matched.forEach((cmd, idx) => {
    const div = document.createElement('div');
    div.className = `command-item ${idx === selectedResultIndex ? 'selected' : ''}`;
    
    div.innerHTML = `
      <span class="command-icon">⚡</span>
      <span class="command-name">${escapeHtml(cmd.name)}</span>
      ${cmd.shortcut ? `<span class="command-shortcut">${cmd.shortcut}</span>` : ''}
    `;
    
    div.onclick = () => {
      toggleCommandPalette();
      cmd.action();
    };
    
    cmdResults.appendChild(div);
  });
  
  // Store matching actions list on input element for easy keyboard execution
  cmdInput.matchedCommands = matched;
}

cmdInput.oninput = () => {
  selectedResultIndex = 0;
  renderCommandResults();
};

cmdInput.onkeydown = e => {
  const matched = cmdInput.matchedCommands || [];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedResultIndex = (selectedResultIndex + 1) % matched.length;
    renderCommandResults();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedResultIndex = (selectedResultIndex - 1 + matched.length) % matched.length;
    renderCommandResults();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (matched[selectedResultIndex]) {
      const action = matched[selectedResultIndex].action;
      toggleCommandPalette();
      action();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    toggleCommandPalette();
  }
};

// Close command overlay on backdrop clicking
cmdPalette.onclick = e => {
  if (e.target === cmdPalette) {
    toggleCommandPalette();
  }
};

// Keyboard Hotkey triggers
window.addEventListener('keydown', e => {
  // Ctrl+K to toggle command palette
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    toggleCommandPalette();
    return;
  }
  
  // Check if currently editing forms
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    return;
  }
  
  // Tools shortcuts
  const key = e.key.toLowerCase();
  if (key === 'v') setTool('select');
  else if (key === 'p') setTool('pen');
  else if (key === 'l') setTool('laser');
  else if (key === 'n') setTool('note');
  else if (key === 'r') setTool('shape');
  else if (key === 'c') setTool('connector');
  
  // Undo / Redo
  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
  }
});

// Helper utilities
function toast(message) {
  const el = document.querySelector('#toast');
  el.innerHTML = `<span>✦</span> ${message}`;
  el.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// -------------------------------------------------------------
// APP INITIALIZATION
// -------------------------------------------------------------
loadBoards();
updateTabs('activity');
updateToolbarSelection();

// Initialize canvas drawing size and scale transform matrix
const dpr = window.devicePixelRatio || 1;
const bRect = wrap.getBoundingClientRect();
canvas.width = bRect.width * dpr;
canvas.height = bRect.height * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// Start Animation Render Loop
requestAnimationFrame(renderLoop);

// Sync online hello check-ins with peer tabs
broadcast({ type: 'handshake-ping' });

// Listen to invite button
document.querySelector('#inviteBtn').onclick = () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    playSfx('click');
    toast('Collaboration invite link copied to clipboard!');
  });
};

document.querySelector('#shareBtn').onclick = () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    playSfx('click');
    toast('Share board link copied to clipboard!');
  });
};

// -------------------------------------------------------------
// IMAGE LOADER & COMPRESSION
// -------------------------------------------------------------
const uploadImageBtn = document.querySelector('#uploadImageBtn');
const imageInput = document.querySelector('#imageInput');

if (uploadImageBtn && imageInput) {
  uploadImageBtn.onclick = () => {
    playSfx('click');
    imageInput.click();
  };
  
  imageInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // Compress image to max 450x450 to keep sync instantaneous
        const maxW = 450;
        const maxH = 450;
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          if (w > h) {
            h = Math.round(h * (maxW / w));
            w = maxW;
          } else {
            w = Math.round(w * (maxH / h));
            h = maxH;
          }
        }
        
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(img, 0, 0, w, h);
        
        // Convert to highly compressed JPEG data URL
        const compressedSrc = offCanvas.toDataURL('image/jpeg', 0.82);
        
        const newImageItem = {
          id: uid(),
          type: 'image',
          x: Math.max(100, -state.pan.x / state.scale + 150),
          y: Math.max(100, -state.pan.y / state.scale + 150),
          w: w,
          h: h,
          src: compressedSrc,
          author: myName
        };
        newImageItem.imgObj = img;
        
        commitItem(newImageItem);
        state.tool = 'select';
        state.selectedId = newImageItem.id;
        updateToolbarSelection();
        toast('Stellar Image elements placed on canvas');
      };
    };
    reader.readAsDataURL(file);
    imageInput.value = ''; // Reset input
  };
}

// -------------------------------------------------------------
// NATIVE AI CANVAS ASSISTANT ENGINE
// -------------------------------------------------------------
function appendAiChatMsg(text, isUser = false) {
  const container = document.querySelector('#aiChatHistory');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = `ai-msg ${isUser ? 'user' : 'bot'}`;
  div.innerHTML = text;
  container.appendChild(div);
  
  // Auto scroll chat box
  container.scrollTop = container.scrollHeight;
}

// 1. AI Summarize Notes
document.querySelector('#aiSummarizeBtn').onclick = () => {
  const activeBoard = getActiveBoard();
  if (!activeBoard) return;
  
  const notes = activeBoard.items.filter(i => i.type === 'note');
  if (notes.length === 0) {
    playSfx('click');
    appendAiChatMsg("Summarize request: There are no sticky notes currently placed on this canvas constellation board to summarize! Add some sticky notes first.");
    return;
  }
  
  playSfx('note');
  appendAiChatMsg("Parsing note elements...", true);
  
  setTimeout(() => {
    const textCorpus = notes.map(n => n.text).join(' ');
    // Extract hypothetical key terms
    const words = textCorpus.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const counts = {};
    words.forEach(w => counts[w] = (counts[w] || 0) + 1);
    const keyTerms = Object.keys(counts).sort((a,b) => counts[b] - counts[a]).slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1));
    
    const summaryText = `Stellar AI Synthesis Report ✦\n\nNotes parsed: ${notes.length}\nCore themes: ${keyTerms.join(', ') || 'Synergy, Orbit'}\nSummary: Group brainstorming focuses on aligning team orbit concepts with canvas-native real-time synchronizations.`;
    
    const summaryCard = {
      id: uid(),
      type: 'note',
      x: Math.max(100, -state.pan.x / state.scale + 200),
      y: Math.max(100, -state.pan.y / state.scale + 200),
      w: 240,
      h: 180,
      text: summaryText,
      color: '#bbf7d0', // Emerald green
      author: 'Stellar AI'
    };
    
    commitItem(summaryCard);
    appendAiChatMsg("Workspace analysis complete. Generated glowing AI Summary card on board.");
  }, 750);
};

// 2. AI Brainstorm Note cluster generator
document.querySelector('#aiBrainstormBtn').onclick = () => {
  const topic = prompt("Enter a topic constellation to generate ideas:", "Future of Collaboration");
  if (!topic || !topic.trim()) return;
  
  appendAiChatMsg(`Brainstorm ideas for: "${topic.trim()}"`, true);
  playSfx('connect');
  
  setTimeout(() => {
    const cleanTopic = topic.trim();
    const clusters = [
      [`${cleanTopic} Orbit` + '\nEstablish cross-device visual focus anchor points.', '#bfdbfe'],
      ['Auditory Resonance' + '\nMicro-feedback pops and chime hums inside user hubs.', '#e9d5ff'],
      ['Organic Snap Alignments' + '\nSelf-healing canvas systems that tidy orbits.', '#fecdd3']
    ];
    
    // Position notes in a circle orbit
    const centerX = Math.max(150, -state.pan.x / state.scale + 280);
    const centerY = Math.max(150, -state.pan.y / state.scale + 240);
    const radius = 150;
    
    clusters.forEach((node, idx) => {
      const angle = (idx * 2 * Math.PI) / clusters.length;
      const nx = centerX + radius * Math.cos(angle) - 90;
      const ny = centerY + radius * Math.sin(angle) - 60;
      
      const brainstormNote = {
        id: uid(),
        type: 'note',
        x: nx,
        y: ny,
        w: 190,
        h: 120,
        text: node[0],
        color: node[1],
        author: 'Stellar AI'
      };
      commitItem(brainstormNote);
    });
    
    appendAiChatMsg(`Created circular brainstorm constellation cluster for "${cleanTopic}".`);
  }, 600);
};

// 3. AI Tidy Align items
document.querySelector('#aiTidyBtn').onclick = () => {
  const activeBoard = getActiveBoard();
  if (!activeBoard) return;
  
  const alignable = activeBoard.items.filter(i => i.type === 'note' || i.type === 'shape' || i.type === 'image');
  if (alignable.length === 0) {
    appendAiChatMsg("Auto-Tidy request: No alignable notes or shapes found on board canvas.");
    return;
  }
  
  playSfx('clear');
  appendAiChatMsg("Aligning celestial elements...", true);
  
  setTimeout(() => {
    let currentX = Math.max(100, -state.pan.x / state.scale + 120);
    let currentY = Math.max(100, -state.pan.y / state.scale + 120);
    
    const colWidth = 240;
    const rowHeight = 200;
    const itemsPerCol = 3;
    
    alignable.forEach((item, idx) => {
      item.x = currentX + Math.floor(idx / itemsPerCol) * colWidth;
      item.y = currentY + (idx % itemsPerCol) * rowHeight;
    });
    
    saveBoards();
    renderLayersUI();
    broadcast({ type: 'items-update', items: activeBoard.items });
    appendAiChatMsg("Constellations aligned successfully into clean tidy grids.");
    toast("Auto-tidy grid applied");
  }, 400);
};

// 4. Web Speech Voice Assistant command listening
const voiceBtn = document.querySelector('#voiceCommandBtn');
const voiceIndicator = document.querySelector('#aiVoiceIndicator');
const speechText = document.querySelector('#voiceSpeechText');
let recognition = null;
let isVoiceListening = false;

if (voiceBtn) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      isVoiceListening = true;
      voiceBtn.classList.add('listening');
      voiceIndicator.style.display = 'flex';
      speechText.textContent = 'Listening for space commands...';
    };
    
    recognition.onerror = e => {
      console.warn("Speech recognition error: ", e);
      stopVoiceListening();
    };
    
    recognition.onend = () => {
      stopVoiceListening();
    };
    
    recognition.onresult = event => {
      const text = event.results[0][0].transcript.trim().toLowerCase();
      appendAiChatMsg(`User Voice: "${text}"`, true);
      processVoiceCommand(text);
    };
    
    voiceBtn.onclick = () => {
      if (isVoiceListening) {
        recognition.stop();
      } else {
        initAudio();
        try {
          recognition.start();
        } catch (err) {
          console.warn("Speech start error: ", err);
        }
      }
    };
  } else {
    voiceBtn.style.display = 'none';
    console.info("Speech Recognition API is not supported in this browser.");
  }
}

function stopVoiceListening() {
  isVoiceListening = false;
  if (voiceBtn) voiceBtn.classList.remove('listening');
  if (voiceIndicator) voiceIndicator.style.display = 'none';
}

function processVoiceCommand(cmd) {
  playSfx('click');
  
  // A. Tool commands mapping
  if (cmd.includes('select') || cmd.includes('pointer')) {
    setTool('select');
    appendAiChatMsg("Tool swapped to Selection pointer (↖).");
  } else if (cmd.includes('pen') || cmd.includes('pencil') || cmd.includes('draw')) {
    setTool('pen');
    appendAiChatMsg("Tool swapped to freehand Pen brush (✎).");
  } else if (cmd.includes('laser') || cmd.includes('glow')) {
    setTool('laser');
    appendAiChatMsg("Tool swapped to fading Laser pointer (☄).");
  } else if (cmd.includes('note') || cmd.includes('sticky')) {
    setTool('note');
    appendAiChatMsg("Tool swapped to Sticky note tool (▤).");
  } else if (cmd.includes('rectangle') || cmd.includes('shape') || cmd.includes('square')) {
    setTool('shape');
    appendAiChatMsg("Tool swapped to Constellation Shape drawing tool (▭).");
  } else if (cmd.includes('connect') || cmd.includes('arrow') || cmd.includes('link')) {
    setTool('connector');
    appendAiChatMsg("Tool swapped to Smart Connector arrow tool (➔).");
  }
  
  // B. Actions mapping
  else if (cmd.includes('clear') || cmd.includes('wipe')) {
    document.querySelector('#clearBoard').click();
  } else if (cmd.includes('summarize') || cmd.includes('summary')) {
    document.querySelector('#aiSummarizeBtn').click();
  } else if (cmd.includes('tidy') || cmd.includes('align') || cmd.includes('grid')) {
    document.querySelector('#aiTidyBtn').click();
  } else if (cmd.includes('new board') || cmd.includes('create board')) {
    document.querySelector('#newBoard').click();
  }
  
  // C. Complex action parser (e.g. "write note [space ideas]")
  else if (cmd.startsWith('write note ') || cmd.startsWith('create note ')) {
    const textStartIdx = cmd.startsWith('write note ') ? 11 : 12;
    const noteText = cmd.substring(textStartIdx).trim();
    
    if (noteText) {
      playSfx('note');
      const voiceNote = {
        id: uid(),
        type: 'note',
        x: Math.max(100, -state.pan.x / state.scale + 160),
        y: Math.max(100, -state.pan.y / state.scale + 160),
        w: 190,
        h: 120,
        text: noteText.charAt(0).toUpperCase() + noteText.slice(1),
        color: palette[Math.floor(Math.random() * palette.length)],
        author: 'Voice AI'
      };
      commitItem(voiceNote);
      appendAiChatMsg(`Created Voice Sticky Note containing: "${voiceNote.text}"`);
    }
  }
  
  // D. Theme shifting voice commands
  else if (cmd.includes('synthwave theme') || cmd.includes('synthwave')) {
    applyTheme('synthwave');
    appendAiChatMsg("Swapped theme to Sunset Synthwave 🌆");
  } else if (cmd.includes('matrix theme') || cmd.includes('matrix')) {
    applyTheme('matrix');
    appendAiChatMsg("Swapped theme to Cyber Matrix 💻");
  } else if (cmd.includes('blueprint theme') || cmd.includes('blueprint') || cmd.includes('chalkboard')) {
    applyTheme('blueprint');
    appendAiChatMsg("Swapped theme to Astro Blueprint 📐");
  } else if (cmd.includes('nebula theme') || cmd.includes('space theme') || cmd.includes('nebula')) {
    applyTheme('nebula');
    appendAiChatMsg("Swapped theme to Cosmic Nebula 🌌");
  } else if (cmd.includes('suggest theme') || cmd.includes('recommend theme') || cmd.includes('suggest a theme')) {
    const suggestions = ['synthwave', 'matrix', 'blueprint', 'nebula'];
    const chosen = suggestions[Math.floor(Math.random() * suggestions.length)];
    applyTheme(chosen);
    appendAiChatMsg(`How about the stellar <strong>${chosen.toUpperCase()}</strong> style? Applied it to your workspace constellation.`);
  }
  
  else {
    appendAiChatMsg("Command not recognized. Try speaking 'apply synthwave theme', 'draw rectangle', 'tidy board', or 'suggest a theme'.");
  }
}

// -------------------------------------------------------------
// DYNAMIC THEME ENGINE & COORDINATES STYLING
// -------------------------------------------------------------
function applyTheme(themeName, shouldBroadcast = true) {
  state.theme = themeName;
  
  // Set theme class on body
  document.body.className = `theme-${themeName}`;
  
  // Match selector dropdown selection
  const selector = document.querySelector('#themeSelector');
  if (selector) selector.value = themeName;
  
  // Change drawing base stroke color to match theme colors
  if (themeName === 'matrix') {
    state.color = '#22c55e';
  } else if (themeName === 'synthwave') {
    state.color = '#ec4899';
  } else if (themeName === 'blueprint') {
    state.color = '#38bdf8';
  } else {
    state.color = '#8b5cf6';
  }
  
  const pickerInput = document.querySelector('#color');
  const pickerIndicator = document.querySelector('#colorIndicator');
  if (pickerInput && pickerIndicator) {
    pickerInput.value = state.color;
    pickerIndicator.style.backgroundColor = state.color;
  }
  
  // Sync online collaborator tabs
  if (shouldBroadcast) {
    broadcast({ type: 'theme-change', theme: themeName });
  }
  
  toast(`Theme shifted to ${themeName.toUpperCase()}`);
  playSfx('click');
}

// Bind dropdown select
const themeSel = document.querySelector('#themeSelector');
if (themeSel) {
  themeSel.onchange = e => applyTheme(e.target.value);
}

// Support clicks on theme links inside bot chat box
document.addEventListener('click', e => {
  if (e.target.classList.contains('ai-theme-link')) {
    e.preventDefault();
    const t = e.target.dataset.theme;
    applyTheme(t);
  }
});

// -------------------------------------------------------------
// INTERACTIVE VIEWPORT MINI-MAP LOGIC
// -------------------------------------------------------------
let isMiniMapDragging = false;

function updateMiniMap() {
  const miniCanvas = document.querySelector('#miniMapCanvas');
  if (!miniCanvas) return;
  
  const activeBoard = getActiveBoard();
  if (!activeBoard) return;
  
  const size = 120;
  const dpr = window.devicePixelRatio || 1;
  if (miniCanvas.width !== size * dpr) {
    miniCanvas.width = size * dpr;
    miniCanvas.height = size * dpr;
    miniCanvas.style.width = `${size}px`;
    miniCanvas.style.height = `${size}px`;
  }
  
  const mCtx = miniCanvas.getContext('2d');
  mCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
  
  mCtx.save();
  mCtx.scale(dpr, dpr);
  
  const items = activeBoard.items || [];
  
  // Calculate viewport boundaries in canvas coordinate space
  const dprMain = window.devicePixelRatio || 1;
  const wMain = canvas.width / dprMain;
  const hMain = canvas.height / dprMain;
  const vLeft = -state.pan.x / state.scale;
  const vTop = -state.pan.y / state.scale;
  const vWidth = wMain / state.scale;
  const vHeight = hMain / state.scale;
  
  let minX = vLeft;
  let maxX = vLeft + vWidth;
  let minY = vTop;
  let maxY = vTop + vHeight;
  
  // Fit bounding envelope to elements
  items.forEach(item => {
    if (item.hidden || item.type === 'connector') return;
    if (item.type === 'line' && item.points) {
      item.points.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
    } else {
      minX = Math.min(minX, item.x);
      maxX = Math.max(maxX, item.x + (item.w || 0));
      minY = Math.min(minY, item.y);
      maxY = Math.max(maxY, item.y + (item.h || 0));
    }
  });
  
  const padding = 150;
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;
  
  const boundsW = maxX - minX;
  const boundsH = maxY - minY;
  const maxDim = Math.max(boundsW, boundsH, 400); // minimum scale size
  
  const centerX = minX + boundsW / 2;
  const centerY = minY + boundsH / 2;
  
  const sX = centerX - maxDim / 2;
  const sY = centerY - maxDim / 2;
  
  const mapScale = size / maxDim;
  
  const mapCoords = (wx, wy) => {
    return {
      x: (wx - sX) * mapScale,
      y: (wy - sY) * mapScale
    };
  };
  
  miniCanvas.dataset.scale = mapScale;
  miniCanvas.dataset.sX = sX;
  miniCanvas.dataset.sY = sY;
  
  // Render miniature notes and shape boundaries
  items.forEach(item => {
    if (item.hidden || item.type === 'connector') return;
    
    if (item.type === 'line' && item.points && item.points.length > 1) {
      mCtx.strokeStyle = item.color || '#fff';
      mCtx.lineWidth = Math.max(0.6, (item.width || 3) * mapScale);
      mCtx.beginPath();
      const p0 = mapCoords(item.points[0].x, item.points[0].y);
      mCtx.moveTo(p0.x, p0.y);
      for (let i = 1; i < item.points.length; i++) {
        const pi = mapCoords(item.points[i].x, item.points[i].y);
        mCtx.lineTo(pi.x, pi.y);
      }
      mCtx.stroke();
    } else {
      const p = mapCoords(item.x, item.y);
      const iw = (item.w || 0) * mapScale;
      const ih = (item.h || 0) * mapScale;
      
      if (item.type === 'note') {
        mCtx.fillStyle = item.color || '#fff3a6';
        mCtx.fillRect(p.x, p.y, iw, ih);
      } else if (item.type === 'shape') {
        mCtx.strokeStyle = item.color || '#8b5cf6';
        mCtx.lineWidth = 1;
        mCtx.strokeRect(p.x, p.y, iw, ih);
      } else if (item.type === 'image') {
        mCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        mCtx.fillRect(p.x, p.y, iw, ih);
        mCtx.strokeStyle = '#fff';
        mCtx.lineWidth = 0.5;
        mCtx.strokeRect(p.x, p.y, iw, ih);
      }
    }
  });
  
  // Render Peer cursor positions as dots
  state.peers.forEach(peer => {
    if (Date.now() - peer.lastSeen < 12000) {
      const pt = mapCoords(peer.x, peer.y);
      mCtx.fillStyle = peer.color || '#06b6d4';
      mCtx.beginPath();
      mCtx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      mCtx.fill();
    }
  });
  
  // Render Viewport bounds frame
  const vp = mapCoords(vLeft, vTop);
  const vpW = vWidth * mapScale;
  const vpH = vHeight * mapScale;
  
  mCtx.strokeStyle = 'var(--color-cyan)';
  mCtx.lineWidth = 1.5;
  mCtx.shadowColor = 'var(--color-cyan)';
  mCtx.shadowBlur = 6;
  mCtx.strokeRect(vp.x, vp.y, vpW, vpH);
  
  mCtx.fillStyle = 'rgba(6, 182, 212, 0.04)';
  mCtx.fillRect(vp.x, vp.y, vpW, vpH);
  
  mCtx.restore();
}

function handleMiniMapNav(clientX, clientY) {
  const miniCanvas = document.querySelector('#miniMapCanvas');
  if (!miniCanvas) return;
  
  const mapScale = parseFloat(miniCanvas.dataset.scale);
  const sX = parseFloat(miniCanvas.dataset.sX);
  const sY = parseFloat(miniCanvas.dataset.sY);
  if (isNaN(mapScale)) return;
  
  const rect = miniCanvas.getBoundingClientRect();
  const clickX = clientX - rect.left;
  const clickY = clientY - rect.top;
  
  const worldX = sX + (clickX / mapScale);
  const worldY = sY + (clickY / mapScale);
  
  const dpr = window.devicePixelRatio || 1;
  const wMain = canvas.width / dpr;
  const hMain = canvas.height / dpr;
  
  // Centering main pan coordinates
  state.pan.x = wMain / 2 - worldX * state.scale;
  state.pan.y = hMain / 2 - worldY * state.scale;
}

const miniCanvasElement = document.querySelector('#miniMapCanvas');
if (miniCanvasElement) {
  miniCanvasElement.addEventListener('pointerdown', e => {
    isMiniMapDragging = true;
    miniCanvasElement.setPointerCapture(e.pointerId);
    handleMiniMapNav(e.clientX, e.clientY);
  });
  
  miniCanvasElement.addEventListener('pointermove', e => {
    if (isMiniMapDragging) {
      handleMiniMapNav(e.clientX, e.clientY);
    }
  });
  
  miniCanvasElement.addEventListener('pointerup', e => {
    isMiniMapDragging = false;
    miniCanvasElement.releasePointerCapture(e.pointerId);
  });
}
