// ============================================================
// app.js — Musicala Stage Patch
// Motor principal de la aplicación
// ============================================================

// ── CONSTANTES ───────────────────────────────────────────────
const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const EL_W = 140;   // ancho fijo de las tarjetas

// ── ESTADO GLOBAL ────────────────────────────────────────────
let state = {
  elements:          [],      // { id, typeId, x, y, name, notes, channels? }
  cables:            [],      // { id, fromEl, fromPort, toEl, toPort, cableType }
  selectedElementId: null,
  selectedCableId:   null,
  mode:              'select',  // 'select' | 'connect'
  pendingConn:       null,      // { elementId, portId, connector }
  contextElementId:  null,
  editingElementId:  null,
  project:           { name: 'Nuevo montaje', version: '1.0' },
  activePanel:       'diagnosis',
  checks: {}, quantities: {}, notes: '', stageWidth: 2400, stageHeight: 1600,
  view: 'plan',
  zoom:              1
};

// ── UTILIDADES ────────────────────────────────────────────────
function uid() {
  return '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
function elById(id)  { return state.elements.find(e => e.id === id); }
function cabById(id) { return state.cables.find(c => c.id === id); }
function dtype(typeId) { return DEVICE_TYPES[typeId] || null; }

// Genera los puertos de una caja directa según su número de canales
function diPorts(channels) {
  const n = Math.max(1, Math.min(8, channels || 1));
  const ports = [];
  for (let i = 1; i <= n; i++) {
    const s = n > 1 ? ' ' + i : '';
    ports.push({ id: 'in_ts_'   + i, label: 'Entrada TS' + s, direction: 'in',  connector: 'ts',  signal: 'instrument' });
    ports.push({ id: 'thru_'    + i, label: 'Thru TS'    + s, direction: 'out', connector: 'ts',  signal: 'instrument' });
    ports.push({ id: 'out_xlr_' + i, label: 'Salida XLR' + s, direction: 'out', connector: 'xlr', signal: 'mic' });
  }
  return ports;
}

// Tipo de conector por defecto de un canal del mixer (mitad XLR, mitad línea)
function defaultMixerType(i, n) {
  return i <= Math.ceil(n / 2) ? 'xlr' : 'trs';
}

// Genera los puertos de un mixer según su nº de canales y el tipo de cada uno
function mixerPorts(el) {
  const type = dtype(el.typeId);
  const n = Math.max(1, Math.min(32, el.channels || type.defaultChannels || 8));
  const types = el.channelTypes || [];
  const ports = [];
  for (let i = 1; i <= n; i++) {
    const conn = types[i - 1] === 'trs' ? 'trs' : (types[i - 1] === 'xlr' ? 'xlr' : defaultMixerType(i, n));
    ports.push({
      id: 'in_' + i,
      label: 'Canal ' + i + ' ' + (conn === 'xlr' ? 'XLR' : 'Línea'),
      direction: 'in', connector: conn, signal: conn === 'xlr' ? 'mic' : 'line'
    });
  }
  ports.push({ id: 'out_main_l', label: 'Main Out L',      direction: 'out', connector: 'xlr',   signal: 'line'  });
  ports.push({ id: 'out_main_r', label: 'Main Out R',      direction: 'out', connector: 'xlr',   signal: 'line'  });
  ports.push({ id: 'aux_1',      label: 'Aux 1 / Monitor', direction: 'out', connector: 'xlr',   signal: 'line'  });
  ports.push({ id: 'aux_2',      label: 'Aux 2 / Monitor', direction: 'out', connector: 'xlr',   signal: 'line'  });
  ports.push({ id: 'pwr',        label: 'Corriente',       direction: 'in',  connector: 'power', signal: 'power' });
  return ports;
}

// Valor de una opción de equipo (el.opts) con su valor por defecto
function devOpt(el, key) {
  const type = dtype(el.typeId);
  if (!type) return undefined;
  if (el.opts && el.opts[key] !== undefined) return el.opts[key];
  const def = (type.deviceOptions || []).find(f => f.key === key);
  return def ? def.default : undefined;
}

// ¿El equipo necesita phantom power +48V?
function needsPhantom(el) {
  const t = dtype(el.typeId);
  if (!t) return false;
  if (t.isMic && t.isPhantomPowered) return true;          // micrófono condensador
  if (t.id === 'di_active') return devOpt(el, 'powerMode') !== 'battery';
  return false;
}

// ¿El equipo funciona con pilas / baterías?
function usesBatteries(el) {
  const t = dtype(el.typeId);
  if (!t) return false;
  if (t.usesBattery) return true;                          // inalámbricos
  if (devOpt(el, 'battery') === true) return true;         // guitarra/bajo activos, pedales
  if (t.id === 'di_active') return devOpt(el, 'powerMode') === 'battery';
  return false;
}

// Tipo de conector por defecto de un canal según el equipo
function defaultChannelType(type, i, n) {
  if (type.id === 'mixer') return defaultMixerType(i, n);
  return (type.channelOptions && type.channelOptions[0] && type.channelOptions[0].value) || 'xlr';
}

// Genera los puertos de una interfaz de audio (entradas combo XLR/TS configurables)
function ifacePorts(el) {
  const type = dtype(el.typeId);
  const n = Math.max(1, Math.min(32, el.channels || type.defaultChannels || 2));
  const types = el.channelTypes || [];
  const ports = [];
  for (let i = 1; i <= n; i++) {
    const conn = types[i - 1] === 'ts' ? 'ts' : (types[i - 1] === 'xlr' ? 'xlr' : defaultChannelType(type, i, n));
    ports.push({
      id: 'in_' + i,
      label: 'Input ' + i + ' ' + (conn === 'xlr' ? 'XLR' : 'TS'),
      direction: 'in', connector: conn, signal: conn === 'xlr' ? 'mic' : 'instrument'
    });
  }
  ports.push({ id: 'out_l',  label: 'Output L',          direction: 'out', connector: 'trs', signal: 'line'    });
  ports.push({ id: 'out_r',  label: 'Output R',          direction: 'out', connector: 'trs', signal: 'line'    });
  ports.push({ id: 'out_hp', label: 'Salida audífonos',  direction: 'out', connector: 'trs', signal: 'line'    });
  ports.push({ id: 'usb',    label: 'USB a computador',  direction: 'out', connector: 'usb', signal: 'digital' });
  return ports;
}

// Genera los puertos de una multitoma / extensión según su nº de salidas
function powerPorts(el) {
  const type = dtype(el.typeId);
  const n = Math.max(1, Math.min(12, el.channels || type.defaultChannels || 2));
  const ports = [];
  if (type.requiresPower) {
    ports.push({ id: 'in_pwr', label: 'Entrada corriente', direction: 'in', connector: 'power', signal: 'power' });
  }
  for (let i = 1; i <= n; i++) {
    ports.push({ id: 'out_' + i, label: 'Salida ' + i, direction: 'out', connector: 'power', signal: 'power' });
  }
  return ports;
}

// Genera los puertos de un amplificador según su tipo de salida elegido
function ampPorts(el) {
  const ports = [{ id: 'in_ts', label: 'Entrada instrumento', direction: 'in', connector: 'ts', signal: 'instrument' }];
  const out = devOpt(el, 'output');
  if (out === 'ts_line') {
    ports.push({ id: 'out_line', label: 'Salida de línea TS', direction: 'out', connector: 'ts', signal: 'line' });
  } else if (out === 'xlr_di') {
    ports.push({ id: 'out_di', label: 'DI Out / XLR', direction: 'out', connector: 'xlr', signal: 'mic' });
  } else {
    ports.push({ id: 'out_mic', label: 'Salida (microfoniado XLR)', direction: 'out', connector: 'xlr', signal: 'mic' });
  }
  ports.push({ id: 'pwr', label: 'Corriente', direction: 'in', connector: 'power', signal: 'power' });
  return ports;
}

// Puertos efectivos de un elemento (algunos equipos los generan según sus canales)
function getPorts(el) {
  if (!el) return [];
  const type = dtype(el.typeId);
  if (!type) return [];
  if (type.dynamicPorts === 'di')        return diPorts(el.channels || type.defaultChannels || 1);
  if (type.dynamicPorts === 'mixer')     return mixerPorts(el);
  if (type.dynamicPorts === 'interface') return ifacePorts(el);
  if (type.dynamicPorts === 'power')     return powerPorts(el);
  if (type.dynamicPorts === 'amp')       return ampPorts(el);
  return type.ports || [];
}

// Altura dinámica de una tarjeta según número de puertos
function cardHeight(ports) {
  if (!ports || !ports.length) return 164;
  const inp = ports.filter(p => p.direction === 'in' && p.connector !== 'power').length;
  const out = ports.filter(p => p.direction === 'out').length;
  return Math.max(164, Math.max(inp, out) * 22 + 32);
}

// Posición absoluta de un puerto en el canvas
function portPos(elementId, portId) {
  const el = elById(elementId);
  if (!el) return null;
  const ports = getPorts(el);
  if (!ports.length) return null;
  const port = ports.find(p => p.id === portId);
  if (!port) return null;
  const h = cardHeight(ports);
  const ins  = ports.filter(p => p.direction === 'in'  && p.connector !== 'power');
  const outs = ports.filter(p => p.direction === 'out');
  if (port.connector === 'power') {
    return { x: el.x + EL_W / 2, y: el.y + h };
  } else if (port.direction === 'in') {
    const idx = ins.indexOf(port);
    const sp  = h / (ins.length + 1);
    return { x: el.x, y: el.y + sp * (idx + 1) };
  } else {
    const idx = outs.indexOf(port);
    const sp  = h / (outs.length + 1);
    return { x: el.x + EL_W, y: el.y + sp * (idx + 1) };
  }
}

// ── INICIALIZACIÓN ────────────────────────────────────────────
function init() {
  buildLegend();
  buildSidebar();
  bindEvents();
  setView('plan');
  renderAll();
  renderDiagnosisEmpty();
  window.stageEditor.ready = true;
  window.dispatchEvent(new Event('stage-editor-ready'));
}

// ── LEYENDA DE CABLES ─────────────────────────────────────────
function buildLegend() {
  const leg = document.getElementById('cable-legend');
  Object.entries(CONNECTION_TYPES).forEach(([key, ct]) => {
    if (key === 'other') return;
    leg.innerHTML += `
      <div class="legend-item">
        <span class="legend-line" style="background:${ct.color}"></span>
        <span>${ct.label}</span>
      </div>`;
  });
}

// ── SIDEBAR ───────────────────────────────────────────────────
function buildSidebar() {
  const cont = document.getElementById('sidebar-content');
  cont.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const items = Object.values(DEVICE_TYPES).filter(d => d.category === cat.id);
    const wrap = document.createElement('div');
    wrap.className = 'sidebar-cat';
    wrap.dataset.cat = cat.id;
    wrap.innerHTML = `<div class="sidebar-cat-label">${cat.icon} ${cat.label}</div>`;
    items.forEach(dev => {
      const item = document.createElement('div');
      item.className = 'sidebar-item';
      item.draggable = true;
      item.dataset.typeId = dev.id;
      item.title = `Arrastrar al escenario o doble clic para agregar`;
      item.innerHTML = `<span class="si-icon">${dev.icon}</span><span class="si-label">${dev.label}</span>`;
      item.addEventListener('dragstart', e => e.dataTransfer.setData('typeId', dev.id));
      const addFromLibrary = () => {
        const sc = document.getElementById('stage-scroll');
        addElement(dev.id, sc.scrollLeft / state.zoom + 60 + Math.random() * 180, sc.scrollTop / state.zoom + 80 + Math.random() * 120);
      };
      item.addEventListener('dblclick', addFromLibrary);
      item.addEventListener('click', e => { if (e.detail === 1 && window.matchMedia('(pointer: coarse)').matches) addFromLibrary(); });
      item.tabIndex = 0; item.setAttribute('role', 'button');
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addFromLibrary(); } });
      wrap.appendChild(item);
    });
    cont.appendChild(wrap);
  });
}

function filterSidebar(q) {
  document.querySelectorAll('.sidebar-item').forEach(item => {
    const match = item.querySelector('.si-label').textContent.toLowerCase().includes(q);
    item.style.display = match ? '' : 'none';
  });
  document.querySelectorAll('.sidebar-cat').forEach(cat => {
    const vis = [...cat.querySelectorAll('.sidebar-item')].some(i => i.style.display !== 'none');
    cat.style.display = vis ? '' : 'none';
  });
}

// ── EVENT LISTENERS ───────────────────────────────────────────
function bindEvents() {
  document.getElementById('btn-plan').onclick = () => setView('plan');
  document.getElementById('btn-fit').onclick = fitStage;
  document.getElementById('btn-arrange').onclick = arrangeStage;
  document.getElementById('btn-edit').onclick = () => { if(state.selectedElementId) openModal(state.selectedElementId); else toast('Selecciona un equipo para editarlo'); };
  document.getElementById('btn-duplicate').onclick = () => { if(state.selectedElementId) duplicateEl(state.selectedElementId); };
  document.getElementById('btn-delete').onclick = () => { if(state.selectedElementId) deleteEl(state.selectedElementId); else if(state.selectedCableId) deleteCab(state.selectedCableId); };
  document.getElementById('btn-library').onclick = () => document.body.classList.toggle('show-library');
  document.getElementById('btn-panel').onclick = () => document.body.classList.toggle('show-panel');
  document.getElementById('project-notes').oninput = e => { state.notes=e.target.value; autoSave(); };
  // Modos
  document.getElementById('btn-select').addEventListener('click',  () => setMode('select'));
  document.getElementById('btn-connect').addEventListener('click', () => setMode('connect'));

  // Validar
  document.getElementById('btn-validate').addEventListener('click', () => {
    const r = runValidation();
    renderDiagnosis(r);
    setPanel('diagnosis');
  });

  // Plantillas
  document.getElementById('template-select').addEventListener('change', e => {
    if (!e.target.value) return;
    if (confirm('¿Cargar plantilla? Se reemplazará el montaje actual.')) loadTemplate(e.target.value);
    e.target.value = '';
  });

  // Nombre del proyecto
  document.getElementById('project-name').addEventListener('input', e => {
    state.project.name = e.target.value; autoSave();
  });

  // Proyecto
  document.getElementById('btn-new').addEventListener('click', () => {
    if (confirm('¿Crear nuevo montaje?')) newProject();
  });
  document.getElementById('btn-save').addEventListener('click', () => { window.stageEditor.onSave?.(window.stageEditor.getProject()); });
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('import-file').addEventListener('change', importJSON);
  document.getElementById('btn-print').addEventListener('click', preparePrint);

  // Zoom
  document.getElementById('btn-zoom-in').addEventListener('click',    () => applyZoom(state.zoom + 0.15));
  document.getElementById('btn-zoom-out').addEventListener('click',   () => applyZoom(state.zoom - 0.15));
  document.getElementById('btn-zoom-reset').addEventListener('click', () => applyZoom(1));

  // Búsqueda
  document.getElementById('search-input').addEventListener('input', e => filterSidebar(e.target.value.toLowerCase()));

  // Panel tabs
  document.querySelectorAll('.panel-tab').forEach(t => {
    t.addEventListener('click', () => setPanel(t.dataset.tab));
  });

  // Modal
  document.getElementById('modal-close').addEventListener('click',  closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click',   saveModal);
  document.getElementById('modal-channels').addEventListener('input', () => {
    const el = elById(state.editingElementId);
    const t  = el ? dtype(el.typeId) : null;
    if (t && t.channelOptions) buildChannelTypeEditor(el, t);
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Context menu
  document.getElementById('ctx-edit').addEventListener('click',      () => { openModal(state.contextElementId); closeCtxMenu(); });
  document.getElementById('ctx-duplicate').addEventListener('click', () => { duplicateEl(state.contextElementId); closeCtxMenu(); });
  document.getElementById('ctx-delete').addEventListener('click',    () => { deleteEl(state.contextElementId); closeCtxMenu(); });

  // Cerrar menús al clic general
  document.addEventListener('click', e => {
    if (!e.target.closest('#context-menu')) closeCtxMenu();
    if (!e.target.closest('#cable-tooltip') && !e.target.classList.contains('cable-hit')) closeCableTip();
  });

  // Stage: clic en fondo → deseleccionar
  document.getElementById('stage').addEventListener('click', e => {
    if (e.target === document.getElementById('stage') || e.target === document.getElementById('cables-svg')) {
      selectEl(null);
      selectCab(null);
      if (state.pendingConn) cancelConn();
    }
  });

  // Mouse move para cable temporal
  document.getElementById('stage').addEventListener('mousemove', e => {
    if (state.mode === 'connect' && state.pendingConn) updateTempCable(e);
  });

  // Teclado
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state.pendingConn) cancelConn();
      else if (state.mode === 'connect') setMode('select');
      closeModal(); closeCtxMenu();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !modalIsOpen() && !e.target.closest('input, textarea, select, [contenteditable]')) {
      if (state.selectedElementId) deleteEl(state.selectedElementId);
      else if (state.selectedCableId) deleteCab(state.selectedCableId);
    }
  });
}

// ── MODO ─────────────────────────────────────────────────────
function setView(view) {
  state.view = view; document.body.classList.toggle('plan-view', view === 'plan');
  document.getElementById('btn-plan').classList.toggle('active', view === 'plan');
  if(view === 'plan') setMode('select');
}

function setMode(mode) {
  if(mode === 'connect') {state.view='connections';document.body.classList.remove('plan-view');document.getElementById('btn-plan').classList.remove('active');}
  state.mode = mode;
  cancelConn();

  const stage     = document.getElementById('stage');
  const hint      = document.getElementById('connect-hint');
  const modeLabel = document.getElementById('mode-label');

  document.getElementById('btn-select').classList.toggle('active',  mode === 'select');
  document.getElementById('btn-connect').classList.toggle('active', mode === 'connect');

  if (mode === 'connect') {
    stage.classList.add('connect-mode');
    hint.classList.add('visible');
    modeLabel.textContent = 'Modo: Conectar cables — clic en ● puerto salida → ● puerto entrada';
  } else {
    stage.classList.remove('connect-mode');
    hint.classList.remove('visible');
    modeLabel.textContent = state.view === 'plan' ? 'Plano visual · arrastra los dibujos' : 'Modo: Seleccionar';
  }
  removeTempCable();
}

// ── ZOOM ──────────────────────────────────────────────────────
function applyZoom(z) {
  state.zoom = Math.max(0.25, Math.min(2.5, z));
  const s = document.getElementById('stage');
  s.style.transform = `scale(${state.zoom})`;
  s.style.transformOrigin = '0 0';
  document.getElementById('zoom-label').textContent = Math.round(state.zoom * 100) + '%';
}

// ── AGREGAR ELEMENTO ──────────────────────────────────────────
function arrangeStage() {
  if(window.stageEditor.busy || !state.elements.length) return;
  if(!confirm('¿Ordenar los integrantes y equipos en filas? Cambiarán sus posiciones; se conservarán equipos, cantidades, notas y conexiones.')) return;
  const groups=[state.elements.filter(el=>dtype(el.typeId)?.isPerson),state.elements.filter(el=>!dtype(el.typeId)?.isPerson)];
  const columns=6,step=210;let y=80;
  groups.forEach(group=>{
    for(let index=0;index<group.length;index+=columns) {
      const row=group.slice(index,index+columns);
      row.forEach((el,column)=>{el.x=60+column*step;el.y=y;});
      y+=Math.max(150,...row.map(el=>cardHeight(getPorts(el))))+70;
    }
  });
  state.stageWidth=1440;state.stageHeight=Math.max(960,y+40);
  ensureStageSize();renderAll();fitStage();autoSave();
  toast('Plano ordenado. Puedes seguir moviendo los dibujos.');
}

function ensureStageSize() {
  let width=state.stageWidth, height=state.stageHeight;
  state.elements.forEach(el=>{width=Math.max(width,el.x+EL_W+80);height=Math.max(height,el.y+Math.max(130,cardHeight(getPorts(el)))+80);});
  state.stageWidth=Math.min(12000,width);state.stageHeight=Math.min(100000,height);
  const stage=document.getElementById('stage');stage.style.width=state.stageWidth+'px';stage.style.height=state.stageHeight+'px';
}
function fitStage() {
  const sc=document.getElementById('stage-scroll');
  if(!state.elements.length) {applyZoom(1);sc.scrollTo(0,0);return;}
  let width=0,height=0;
  state.elements.forEach(el=>{width=Math.max(width,el.x+EL_W+35);height=Math.max(height,el.y+(state.view==='plan'?140:cardHeight(getPorts(el)))+35);});
  applyZoom(Math.min(1,(sc.clientWidth-16)/Math.max(width,1),(sc.clientHeight-16)/Math.max(height,1)));
  sc.scrollTo(0,0);
}
function setBusy(busy) {
  busy=!!busy;window.stageEditor.busy=busy;
  let overlay=document.getElementById('editor-busy');
  if(!overlay) {overlay=document.createElement('div');overlay.id='editor-busy';overlay.textContent='Guardando montaje…';overlay.setAttribute('role','status');document.body.append(overlay);}
  [...document.body.children].forEach(child=>{if(child!==overlay) child.inert=busy;});
  overlay.hidden=!busy;
  const btn=document.getElementById('btn-save');btn.disabled=busy;btn.textContent=busy?'Guardando…':'💾 Guardar';
}

function addElement(typeId, x, y, overrides = {}) {
  const type = dtype(typeId);
  if (!type || window.stageEditor.busy) return null;
  if(state.elements.length >= 250) {toast('Este montaje admite hasta 250 elementos. Agrupa unidades usando Cantidad.', 'warn');return null;}
  const el = {
    id: uid(),
    typeId,
    x: Math.round(Math.max(0, x)),
    y: Math.round(Math.max(0, y)),
    name: type.label,
    notes: '', quantity: 1,
    ...overrides
  };
  state.elements.push(el);
  ensureStageSize();
  renderCard(el);
  redrawCables();
  refreshActivePanel();
  autoSave();
  return el;
}

// ── RENDER COMPLETO ───────────────────────────────────────────
function renderAll() {
  document.querySelectorAll('.element-card').forEach(e => e.remove());
  state.elements.forEach(el => renderCard(el));
  redrawCables();
}

// ── TARJETA DE ELEMENTO ───────────────────────────────────────
function renderCard(el) {
  const old = document.getElementById('ec-' + el.id);
  if (old) old.remove();

  const type = dtype(el.typeId);
  if (!type) return;
  const elPorts = getPorts(el);
  const h = cardHeight(elPorts);

  const card = document.createElement('div');
  card.className = 'element-card';
  card.id = 'ec-' + el.id;
  card.style.left   = el.x + 'px';
  card.style.top    = el.y + 'px';
  card.style.height = h + 'px';

  // Cabecera
  const header = document.createElement('div');
  header.className = 'el-header';
  const catLabel = (CATEGORIES.find(c => c.id === type.category) || {}).label || '';
  header.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${catLabel}</span>
    <span class="el-status-dot"></span>`;

  // Cuerpo
  const body = document.createElement('div');
  body.className = 'el-body';
  card.title = [el.name,el.notes].filter(Boolean).join(' · ');
  body.innerHTML = `<span class="el-icon">${type.icon}</span><span class="el-name">${esc(el.name)}</span><span class="el-note">${esc(el.notes || '')}</span><span class="el-qty">${Number(el.quantity || 1) > 1 ? '×'+Number(el.quantity) : ''}</span>`;

  card.appendChild(header);
  card.appendChild(body);

  // Puertos
  if (elPorts.length) {
    const ins   = elPorts.filter(p => p.direction === 'in'  && p.connector !== 'power');
    const outs  = elPorts.filter(p => p.direction === 'out');
    const pwrs  = elPorts.filter(p => p.connector === 'power');

    ins.forEach((port, i)  => card.appendChild(makeDot(port, el.id, i, ins.length,  'left',   h)));
    outs.forEach((port, i) => card.appendChild(makeDot(port, el.id, i, outs.length, 'right',  h)));
    pwrs.forEach((port, i) => card.appendChild(makeDot(port, el.id, i, pwrs.length, 'bottom', h)));
  }

  // Eventos ratón
  card.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('port-dot')) return;
    if (state.mode === 'connect') return;
    if(e.button !== 0) return;
    e.preventDefault();
    moveEl(el.id, e);
    selectEl(el.id);
    closeCtxMenu();
  });
  card.addEventListener('click', e => {
    if (e.target.classList.contains('port-dot')) return;
    selectEl(el.id); closeCtxMenu();
  });
  card.addEventListener('dblclick', e => {
    if (e.target.classList.contains('port-dot')) return;
    openModal(el.id);
  });
  card.addEventListener('contextmenu', e => {
    e.preventDefault();
    selectEl(el.id);
    openCtxMenu(el.id, e.clientX, e.clientY);
  });

  document.getElementById('stage').appendChild(card);
  refreshCardStatus(el.id);
}

// ── PUNTO DE PUERTO ───────────────────────────────────────────
function makeDot(port, elementId, idx, total, side, h) {
  const dot = document.createElement('div');
  dot.className   = 'port-dot';
  dot.dataset.elementId = elementId;
  dot.dataset.portId    = port.id;
  dot.dataset.connector = port.connector;
  dot.dataset.direction = port.direction;
  dot.title = `${port.label} (${port.connector.toUpperCase()})`;

  const DOT = 11;
  const sp  = h / (total + 1);
  const off = sp * (idx + 1);

  if (side === 'left') {
    dot.style.left = (-DOT / 2) + 'px';
    dot.style.top  = (off - DOT / 2) + 'px';
  } else if (side === 'right') {
    dot.style.right = (-DOT / 2) + 'px';
    dot.style.top   = (off - DOT / 2) + 'px';
  } else {
    const hSp = EL_W / (total + 1);
    dot.style.left   = (hSp * (idx + 1) - DOT / 2) + 'px';
    dot.style.bottom = (-DOT / 2) + 'px';
  }

  dot.addEventListener('click', e => {
    e.stopPropagation();
    if (state.mode !== 'connect') return;
    handlePortClick(elementId, port.id, port.connector, port.direction);
  });

  return dot;
}

// ── SELECCIÓN ─────────────────────────────────────────────────
function selectEl(id) {
  document.querySelectorAll('.element-card.selected').forEach(c => c.classList.remove('selected'));
  state.selectedElementId = id;
  state.selectedCableId   = null;
  if (id) {
    const c = document.getElementById('ec-' + id);
    if (c) c.classList.add('selected');
    closeCableTip();
  }
}

function selectCab(id) {
  state.selectedCableId   = id;
  state.selectedElementId = null;
  document.querySelectorAll('.element-card.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.cable-vis').forEach(p => p.classList.remove('selected'));
  if (id) {
    const p = document.getElementById('cv-' + id);
    if (p) p.classList.add('selected');
  }
}

// ── MOVER ELEMENTO ────────────────────────────────────────────
function moveEl(elementId, e0) {
  const el = elById(elementId);
  if (!el) return;
  const sx = e0.clientX, sy = e0.clientY;
  const ox = el.x, oy = el.y;

  function onMove(e) {
    el.x = Math.max(0, Math.round(ox + (e.clientX - sx) / state.zoom));
    el.y = Math.max(0, Math.round(oy + (e.clientY - sy) / state.zoom));
    const card = document.getElementById('ec-' + elementId);
    if (card) { card.style.left = el.x + 'px'; card.style.top = el.y + 'px'; }
    ensureStageSize();
    redrawCables();
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    autoSave();
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ── ELIMINAR / DUPLICAR ELEMENTOS ────────────────────────────
function deleteEl(id) {
  state.cables   = state.cables.filter(c => c.fromEl !== id && c.toEl !== id);
  state.elements = state.elements.filter(e => e.id !== id);
  const card = document.getElementById('ec-' + id);
  if (card) card.remove();
  if (state.selectedElementId === id) state.selectedElementId = null;
  redrawCables();
  refreshActivePanel();
  autoSave();
}

function duplicateEl(id) {
  const el = elById(id);
  if (!el) return;
  const copy = JSON.parse(JSON.stringify(el)); delete copy.id; delete copy.sourceId; delete copy.sourceNodeId;
  addElement(el.typeId, el.x + 30, el.y + 30, {...copy, x:el.x+30,y:el.y+30, name:el.name+' (copia)'});
}

// ── ESTADO VISUAL DE LA TARJETA ───────────────────────────────
function refreshCardStatus(id) {
  const el   = elById(id);
  const card = document.getElementById('ec-' + id);
  if (!el || !card) return;
  const type = dtype(el.typeId);
  if (!type) return;

  card.classList.remove('status-ok', 'status-warning', 'status-error', 'status-disconnected');

  const elCables = state.cables.filter(c => c.fromEl === id || c.toEl === id);
  const audioCables = elCables.filter(c => c.cableType !== 'power');

  if (getPorts(el).length === 0) return;

  if (elCables.length === 0) {
    card.classList.add('status-disconnected');
  } else if (audioCables.length > 0 || type.isPowerSource) {
    card.classList.add('status-ok');
  } else {
    card.classList.add('status-warning');
  }
}

function refreshAllStatuses() {
  state.elements.forEach(el => refreshCardStatus(el.id));
}

// ── CONEXIONES / CABLES ───────────────────────────────────────
function handlePortClick(elementId, portId, connector, direction) {
  if (!state.pendingConn) {
    // Iniciar conexión — solo desde salida
    if (direction !== 'out') {
      toast('Primero haz clic en un puerto de SALIDA ●', 'warn');
      return;
    }
    state.pendingConn = { elementId, portId, connector };
    // Marcar dot
    document.querySelectorAll('.port-dot.pending').forEach(d => d.classList.remove('pending'));
    const dot = document.querySelector(`[data-element-id="${elementId}"][data-port-id="${portId}"]`);
    if (dot) dot.classList.add('pending');
    toast('Puerto seleccionado — ahora haz clic en un puerto de ENTRADA ●');
  } else {
    // Completar conexión — solo hacia entrada
    if (direction !== 'in') {
      toast('Selecciona un puerto de ENTRADA para terminar', 'warn');
      return;
    }
    if (state.pendingConn.elementId === elementId) {
      toast('No puedes conectar un elemento consigo mismo', 'warn');
      cancelConn();
      return;
    }

    // Verificar compatibilidad
    const compat = CONNECTOR_COMPAT[state.pendingConn.connector] || [];
    if (!compat.includes(connector)) {
      toast(`Conectores incompatibles: ${state.pendingConn.connector.toUpperCase()} → ${connector.toUpperCase()}`, 'error');
      cancelConn();
      return;
    }

    // Verificar duplicado
    const dup = state.cables.find(c =>
      c.fromEl === state.pendingConn.elementId && c.fromPort === state.pendingConn.portId &&
      c.toEl === elementId && c.toPort === portId
    );
    if (dup) { toast('Esa conexión ya existe', 'warn'); cancelConn(); return; }

    createCable(
      state.pendingConn.elementId, state.pendingConn.portId, state.pendingConn.connector,
      elementId, portId, connector
    );
    cancelConn();
  }
}

// Longitud por defecto sugerida según el tipo de cable (m), editable luego
const DEFAULT_CABLE_LENGTH = { xlr: 5, ts: 3, trs: 3, usb: 2, rca: 2, midi: 2, speaker: 8, power: 5, other: 3 };

function createCable(fromEl, fromPort, fromConnector, toEl, toPort, toConnector) {
  if(window.stageEditor.busy) return null;
  if(state.cables.length >= 1000) {toast('Este montaje admite hasta 1000 cables.', 'warn');return null;}
  const cType = fromConnector || toConnector;
  const cable = {
    id: uid(),
    fromEl, fromPort,
    toEl,   toPort,
    cableType: cType,
    length: DEFAULT_CABLE_LENGTH[cType] || 3
  };
  state.cables.push(cable);
  redrawCables();
  refreshAllStatuses();
  refreshActivePanel();
  autoSave();
  const ct = CONNECTION_TYPES[cable.cableType];
  toast(`Cable ${ct ? ct.label : cable.cableType} conectado ✓`, 'ok');
  return cable;
}

function cancelConn() {
  state.pendingConn = null;
  document.querySelectorAll('.port-dot.pending').forEach(d => d.classList.remove('pending'));
  removeTempCable();
}

function deleteCab(id) {
  state.cables = state.cables.filter(c => c.id !== id);
  redrawCables();
  refreshAllStatuses();
  refreshActivePanel();
  autoSave();
  closeCableTip();
  if (state.selectedCableId === id) state.selectedCableId = null;
}

// ── DIBUJAR CABLES ────────────────────────────────────────────
function redrawCables() {
  const svg = document.getElementById('cables-svg');
  svg.innerHTML = '';

  // Cable temporal (durante conexión activa)
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tmp.id = 'temp-cable';
  tmp.setAttribute('fill', 'none');
  tmp.setAttribute('stroke', '#7C3AED');
  tmp.setAttribute('stroke-width', '2');
  tmp.setAttribute('stroke-dasharray', '7 4');
  tmp.setAttribute('pointer-events', 'none');
  svg.appendChild(tmp);

  state.cables.forEach(cable => {
    const from = portPos(cable.fromEl, cable.fromPort);
    const to   = portPos(cable.toEl,   cable.toPort);
    if (!from || !to) return;

    const ct    = CONNECTION_TYPES[cable.cableType] || CONNECTION_TYPES.other;
    const color = ct.color;
    const dx    = Math.max(60, Math.abs(to.x - from.x) * 0.5);
    const d     = `M${from.x},${from.y} C${from.x + dx},${from.y} ${to.x - dx},${to.y} ${to.x},${to.y}`;

    // Hit area invisible (más gruesa para fácil clic)
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '14');
    hit.setAttribute('pointer-events', 'stroke');
    hit.style.cursor = 'pointer';
    hit.classList.add('cable-hit');
    hit.addEventListener('click', e => {
      e.stopPropagation();
      selectCab(cable.id);
      showCableTip(cable, e.clientX, e.clientY);
    });

    // Línea visible
    const vis = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    vis.id = 'cv-' + cable.id;
    vis.setAttribute('d', d);
    vis.setAttribute('fill', 'none');
    vis.setAttribute('stroke', color);
    vis.setAttribute('stroke-width', '2.5');
    vis.setAttribute('stroke-linecap', 'round');
    vis.setAttribute('pointer-events', 'none');
    vis.classList.add('cable-vis');
    if (state.selectedCableId === cable.id) vis.classList.add('selected');

    // Etiqueta centrada
    const mx = (from.x + to.x) / 2;
    const my = Math.min(from.y, to.y) - 7;
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', mx); lbl.setAttribute('y', my);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', '9');
    lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('fill', color);
    lbl.setAttribute('pointer-events', 'none');
    lbl.classList.add('cable-label-txt');
    lbl.textContent = ct.label;

    svg.appendChild(hit);
    svg.appendChild(vis);
    svg.appendChild(lbl);
  });
}

// Cable temporal mientras el usuario busca destino
function updateTempCable(e) {
  const from = portPos(state.pendingConn.elementId, state.pendingConn.portId);
  if (!from) return;
  const stage = document.getElementById('stage');
  const rect  = stage.getBoundingClientRect();
  const tx = (e.clientX - rect.left) / state.zoom;
  const ty = (e.clientY - rect.top)  / state.zoom;
  const dx = Math.max(40, Math.abs(tx - from.x) * 0.5);
  const d  = `M${from.x},${from.y} C${from.x + dx},${from.y} ${tx - dx},${ty} ${tx},${ty}`;
  const tmp = document.getElementById('temp-cable');
  if (tmp) tmp.setAttribute('d', d);
}

function removeTempCable() {
  const tmp = document.getElementById('temp-cable');
  if (tmp) tmp.setAttribute('d', '');
}

// ── TOOLTIP DE CABLE ──────────────────────────────────────────
function showCableTip(cable, cx, cy) {
  const tip  = document.getElementById('cable-tooltip');
  const info = document.getElementById('cable-info');
  const fromEl = elById(cable.fromEl);
  const toEl   = elById(cable.toEl);
  const ct   = CONNECTION_TYPES[cable.cableType] || { label: cable.cableType };
  info.textContent = `${ct.label}: ${fromEl ? fromEl.name : '?'} → ${toEl ? toEl.name : '?'}`;
  tip.style.left = (cx + 10) + 'px';
  tip.style.top  = (cy - 20) + 'px';
  tip.classList.remove('hidden');
  const lenInput = document.getElementById('cable-length');
  lenInput.value = cable.length || 0;
  lenInput.oninput = () => { cable.length = parseFloat(lenInput.value) || 0; autoSave(); };
  document.getElementById('cable-delete-btn').onclick = () => deleteCab(cable.id);
}

function closeCableTip() {
  document.getElementById('cable-tooltip').classList.add('hidden');
}

// ── DROP DEL SIDEBAR AL STAGE ─────────────────────────────────
function handleStageDrop(e) {
  e.preventDefault();
  const typeId = e.dataTransfer.getData('typeId');
  if (!typeId) return;
  const rect = document.getElementById('stage').getBoundingClientRect();
  const x = (e.clientX - rect.left) / state.zoom - EL_W / 2;
  const y = (e.clientY - rect.top)  / state.zoom - 40;
  addElement(typeId, x, y);
}

// ── MENÚ CONTEXTUAL ───────────────────────────────────────────
function openCtxMenu(id, cx, cy) {
  state.contextElementId = id;
  const m = document.getElementById('context-menu');
  m.style.left = cx + 'px';
  m.style.top  = cy + 'px';
  m.classList.remove('hidden');
}
function closeCtxMenu() {
  document.getElementById('context-menu').classList.add('hidden');
  state.contextElementId = null;
}

// ── MODAL EDICIÓN ─────────────────────────────────────────────
function openModal(id) {
  const el = elById(id);
  if (!el) return;
  state.editingElementId = id;
  const type = dtype(el.typeId);
  document.getElementById('modal-name').value  = el.name;
  document.getElementById('modal-notes').value = el.notes || '';
  document.getElementById('modal-quantity').value = el.quantity || 1;

  const chWrap = document.getElementById('modal-channels-wrap');
  const ctWrap = document.getElementById('modal-channel-types');
  if (type && (type.isMixer || type.channelsConfigurable)) {
    chWrap.style.display = 'flex';
    const chInput = document.getElementById('modal-channels');
    chInput.min = type.isMixer ? 2 : 1;
    chInput.value = el.channels || type.defaultChannels || (type.isMixer ? 8 : 1);
    document.getElementById('modal-channels-label').textContent =
      type.dynamicPorts === 'power' ? 'Número de salidas' : 'Número de canales';
  } else {
    chWrap.style.display = 'none';
  }
  // Editor de tipo por canal (equipos con channelOptions: mixer, interfaz…)
  if (type && type.channelOptions) {
    buildChannelTypeEditor(el, type);
    ctWrap.style.display = 'block';
  } else {
    ctWrap.style.display = 'none';
    ctWrap.innerHTML = '';
  }
  // Opciones específicas del equipo (phantom, alimentación…)
  const optWrap = document.getElementById('modal-device-options');
  if (type && type.deviceOptions) {
    buildDeviceOptions(el, type);
    optWrap.style.display = 'block';
  } else {
    optWrap.style.display = 'none';
    optWrap.innerHTML = '';
  }
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-name').focus();
}

// Construye el selector de tipo de conector para cada canal de entrada
function buildChannelTypeEditor(el, type) {
  const ctWrap = document.getElementById('modal-channel-types');
  const opts = type.channelOptions || [];
  const n = Math.max(1, Math.min(32,
    parseInt(document.getElementById('modal-channels').value) || el.channels || type.defaultChannels || 8));
  const cur = el.channelTypes || [];
  let html = '<div class="ch-type-title">Tipo de cada canal de entrada</div><div class="ch-type-grid">';
  for (let i = 1; i <= n; i++) {
    const v = cur[i - 1] || defaultChannelType(type, i, n);
    const optsHtml = opts.map(o =>
      `<option value="${o.value}" ${v === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
    html += `<label class="ch-type-row">Canal ${i}
      <select data-ch="${i}">${optsHtml}</select></label>`;
  }
  html += '</div>';
  ctWrap.innerHTML = html;
}

// Construye los campos de opciones específicas del equipo (phantom, alimentación…)
function buildDeviceOptions(el, type) {
  const wrap = document.getElementById('modal-device-options');
  const opts = el.opts || {};
  let html = '';
  (type.deviceOptions || []).forEach(f => {
    const cur = opts[f.key] !== undefined ? opts[f.key] : f.default;
    if (f.type === 'checkbox') {
      html += `<label class="dev-opt-check"><input type="checkbox" data-key="${f.key}" ${cur ? 'checked' : ''}> ${f.label}</label>`;
    } else if (f.type === 'select') {
      const o = (f.choices || []).map(c =>
        `<option value="${c.value}" ${cur === c.value ? 'selected' : ''}>${c.label}</option>`).join('');
      html += `<label class="dev-opt">${f.label}<select data-key="${f.key}">${o}</select></label>`;
    }
  });
  wrap.innerHTML = html;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.editingElementId = null;
}

function saveModal() {
  const id = state.editingElementId;
  const el = elById(id);
  if (!el) return;
  const type = dtype(el.typeId);
  el.name  = document.getElementById('modal-name').value.trim() || el.name;
  el.notes = document.getElementById('modal-notes').value;
  el.quantity = Math.min(999,Math.max(1,parseInt(document.getElementById('modal-quantity').value)||1));
  // Opciones específicas del equipo
  if (type && type.deviceOptions) {
    el.opts = el.opts || {};
    document.querySelectorAll('#modal-device-options [data-key]').forEach(inp => {
      el.opts[inp.dataset.key] = inp.type === 'checkbox' ? inp.checked : inp.value;
    });
    // Equipos cuyos puertos dependen de una opción (p.ej. salida del ampli): regenerar
    if (type.dynamicPorts === 'amp') {
      const valid = new Set(getPorts(el).map(p => p.id));
      state.cables = state.cables.filter(c =>
        !((c.fromEl === id && !valid.has(c.fromPort)) || (c.toEl === id && !valid.has(c.toPort)))
      );
      renderCard(el);
      redrawCables();
    }
  }
  if (type && (type.isMixer || type.channelsConfigurable)) {
    const newCh = parseInt(document.getElementById('modal-channels').value) || type.defaultChannels;
    const changed = el.channels !== newCh;
    el.channels = newCh;
    // Tipo de cada canal de entrada (mixer, interfaz…)
    if (type.channelOptions) {
      const selects = document.querySelectorAll('#modal-channel-types select');
      if (selects.length) el.channelTypes = Array.from(selects).map(s => s.value);
    }
    // Si los puertos se generan dinámicamente, eliminar cables hacia puertos que ya no existen y re-dibujar
    if ((changed || type.channelOptions) && type.dynamicPorts) {
      const valid = new Set(getPorts(el).map(p => p.id));
      state.cables = state.cables.filter(c =>
        !((c.fromEl === id && !valid.has(c.fromPort)) || (c.toEl === id && !valid.has(c.toPort)))
      );
      renderCard(el);
      redrawCables();
    }
  }
  // Actualizar nombre en el DOM
  const nameEl = document.querySelector('#ec-' + id + ' .el-name');
  if (nameEl) nameEl.textContent = el.name;
  closeModal();
  renderCard(el); redrawCables();
  refreshActivePanel();
  autoSave();
}

function modalIsOpen() {
  return !document.getElementById('modal-overlay').classList.contains('hidden');
}

// Re-renderiza el panel activo (p.ej. tras conectar/desconectar)
function refreshActivePanel() {
  setPanel(state.activePanel || 'diagnosis');
}

// ── PANEL TABS ────────────────────────────────────────────────
function setPanel(tab) {
  state.activePanel = tab;
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  switch (tab) {
    case 'diagnosis': renderDiagnosis(runValidation()); break;
    case 'inputlist': renderInputList(); break;
    case 'materials': renderMaterials(); break;
    case 'checklist': renderChecklist(); break;
  }
}

// ══════════════════════════════════════════════════════════════
// MOTOR DE VALIDACIÓN
// ══════════════════════════════════════════════════════════════
function runValidation() {
  if (state.elements.length === 0) return { status: 'empty', errors: [], warnings: [], suggestions: [], stats: {} };

  const errors = [], warnings = [], suggestions = [];

  // Helpers
  const elCables   = id => state.cables.filter(c => c.fromEl === id || c.toEl === id);
  const outCables  = id => state.cables.filter(c => c.fromEl === id && c.cableType !== 'power');
  const inCables   = id => state.cables.filter(c => c.toEl   === id && c.cableType !== 'power');
  const hasPower   = id => state.cables.some(c => c.toEl === id && c.cableType === 'power');
  const destType   = id => { const e = elById(id); return e ? dtype(e.typeId) : null; };

  // ¿La señal de este equipo llega hasta una consola/interfaz (PA),
  // aunque pase por DI, ampli, pedal, stagebox…? (USB es bidireccional)
  const reachesConsole = startId => {
    const seen = new Set([startId]);
    const queue = [startId];
    while (queue.length) {
      const cur = queue.shift();
      state.cables.forEach(c => {
        if (c.cableType === 'power') return;
        let next = null;
        if (c.fromEl === cur) next = c.toEl;
        else if (c.toEl === cur && c.cableType === 'usb') next = c.fromEl; // USB va en ambos sentidos
        if (next == null || seen.has(next)) return;
        seen.add(next);
        queue.push(next);
      });
    }
    for (const id of seen) {
      const dt = destType(id);
      if (dt && (dt.isMixer || dt.isInterface)) return true;
    }
    return false;
  };

  // Estadísticas
  const stats = {
    soundSources: 0, mics: 0, speakers: 0, monitors: 0, dis: 0,
    mixers: 0, mixerChUsed: 0, mixerChAvail: 0, phantom: 0, batteries: 0,
    cableCount: {}
  };
  state.cables.forEach(c => { stats.cableCount[c.cableType] = (stats.cableCount[c.cableType] || 0) + 1; });

  state.elements.forEach(el => {
    const t = dtype(el.typeId);
    if (!t) return;

    if (t.isSoundSource) stats.soundSources++;
    if (t.isMic)         stats.mics++;
    if (t.isSpeaker)     stats.speakers++;
    if (t.isMonitor)     stats.monitors++;
    if (t.isDI)          stats.dis++;
    if (needsPhantom(el))   stats.phantom++;
    if (usesBatteries(el))  stats.batteries++;
    if (t.isMixer) {
      stats.mixers++;
      stats.mixerChAvail += (el.channels || t.defaultChannels || 8);
      stats.mixerChUsed  += inCables(el.id).length;
    }

    // ── A. Corriente ─────────────────────────────────────────
    if (t.requiresPower && !t.isPhantomPowered && !t.isPowerSource) {
      if (!hasPower(el.id)) {
        errors.push(`⚡ "${el.name}" necesita corriente y no está conectado a ninguna fuente.`);
      }
    }

    // ── B. Fuentes de sonido ──────────────────────────────────
    if (t.isSoundSource) {
      const outs = outCables(el.id);
      // USB es bidireccional (p.ej. computador ↔ interfaz): cuenta como conexión válida
      const usbLink = state.cables.some(c => (c.fromEl === el.id || c.toEl === el.id) && c.cableType === 'usb');
      if (outs.length === 0 && !usbLink) {
        if (t.isAcoustic) {
          suggestions.push(`🥁 "${el.name}" sin micrófono: sonará acústico, sin refuerzo por el PA.`);
        } else {
          errors.push(`🔇 "${el.name}" no está amplificado: debe conectarse a un mixer, interfaz, DI o ampli.`);
        }
      } else if (!t.isAcoustic && !usbLink && !reachesConsole(el.id)) {
        // Está conectado, pero la señal no llega hasta la consola/interfaz
        errors.push(`🔌 "${el.name}" está conectado, pero su señal no llega a ninguna consola/interfaz (revisa que el ampli/DI/pedal tenga su salida conectada).`);
      }

      // DI recomendada (no aplica si va a interfaz, ampli, DI o por USB/digital)
      if (t.needsDI) {
        const throughDI   = outs.some(c => { const dt = destType(c.toEl); return dt && dt.isDI; });
        const toMixDirect = outs.some(c => { const dt = destType(c.toEl); return dt && dt.isMixer; });
        const throughAmp  = outs.some(c => { const dt = destType(c.toEl); return dt && dt.isAmplifier; });
        const toInterface = outs.some(c => { const dt = destType(c.toEl); return dt && dt.isInterface; });

        if (toMixDirect && !throughDI) {
          warnings.push(`🔌 "${el.name}" va directo al mixer. Se recomienda una caja directa (DI) para nivel de línea correcto.`);
        } else if (!throughDI && !throughAmp && !toInterface && !usbLink) {
          suggestions.push(`💡 "${el.name}": considera pasar por una DI antes del mixer.`);
        }
      }

      // Teclado estéreo: verificar ambas salidas
      if (t.isStereo) {
        const hasL = state.cables.some(c => c.fromEl === el.id && c.fromPort === 'out_l');
        const hasR = state.cables.some(c => c.fromEl === el.id && c.fromPort === 'out_r');
        if (!hasL || !hasR) {
          warnings.push(`🎹 "${el.name}" es estéreo pero solo tiene ${!hasL ? 'R' : 'L'} conectado. Conecta ambas salidas L y R.`);
        }
      }
    }

    // ── C. Salidas (parlantes / monitores) ────────────────────
    if (t.isOutput) {
      if (inCables(el.id).length === 0) {
        warnings.push(`🔊 "${el.name}" no tiene señal de audio entrante.`);
      }
    }

    // ── D. Mixer: verificar salida principal ──────────────────
    if (t.isMixer) {
      const hasMainOut = state.cables.some(c =>
        c.fromEl === el.id && (c.fromPort === 'out_main_l' || c.fromPort === 'out_main_r')
      );
      if (!hasMainOut) {
        errors.push(`🔊 Mixer "${el.name}" no tiene salida principal conectada a ningún parlante.`);
      }
    }

    // ── E. DI: verificar entrada y salida ─────────────────────
    if (t.isDI) {
      if (inCables(el.id).length === 0) {
        warnings.push(`📦 DI "${el.name}" sin señal de entrada.`);
      }
      const hasXLROut = state.cables.some(c => c.fromEl === el.id && c.cableType === 'xlr');
      if (!hasXLROut) {
        warnings.push(`📦 DI "${el.name}" sin salida XLR conectada al mixer.`);
      }
      if (t.id === 'di_active') {
        const pm = devOpt(el, 'powerMode');
        if (pm === 'battery') {
          suggestions.push(`🔋 DI activa "${el.name}": funciona con pila/batería — lleva repuestos.`);
        } else if (pm === 'phantom_iface') {
          suggestions.push(`📦 DI activa "${el.name}": requiere phantom +48V desde la interfaz.`);
        } else {
          suggestions.push(`📦 DI activa "${el.name}": requiere phantom +48V desde el mixer.`);
        }
      }
    }

    // ── F. Micrófonos condensadores ───────────────────────────
    if (t.isPhantomPowered && t.isMic) {
      suggestions.push(`🎙️ "${el.name}" (condensador): activa phantom power (+48V) en el mixer/interfaz.`);
    }

    // ── F.2 Inalámbricos ──────────────────────────────────────
    if (t.isWireless) {
      suggestions.push(`📻 "${el.name}" (inalámbrico): verifica frecuencias libres y lleva pilas de repuesto.`);
    }

    // ── G. Amplificadores ─────────────────────────────────────
    if (t.isAmplifier) {
      if (inCables(el.id).length === 0) {
        warnings.push(`🔌 Amplificador "${el.name}" sin instrumento conectado.`);
      }
      const ampOut = outCables(el.id);
      if (ampOut.length === 0) {
        suggestions.push(`🎙️ Ampli "${el.name}": considera microfoniarlo o conectar su salida directa al mixer.`);
      }
    }
  });

  // ── Global: phantom disponible donde se necesita ──────────
  state.elements.forEach(el => {
    if (!needsPhantom(el)) return;
    const outs = state.cables.filter(c => c.fromEl === el.id && c.cableType !== 'power');
    const reaches = outs.map(c => elById(c.toEl)).filter(Boolean)
      .filter(d => { const dt = dtype(d.typeId); return dt && (dt.isMixer || dt.isInterface); });
    if (reaches.length === 0) return; // aún sin conectar a destino; se avisa por otra vía
    const hasPhantomDest = reaches.some(d => devOpt(d, 'phantom') !== false);
    if (!hasPhantomDest) {
      errors.push(`🔋 "${el.name}" necesita phantom +48V, pero el mixer/interfaz al que llega no lo tiene activado.`);
    }
  });

  // ── Global: fuentes sin mixer ─────────────────────────────
  if (stats.soundSources > 0 && stats.mixers === 0) {
    const hasIface = state.elements.some(el => { const t = dtype(el.typeId); return t && t.isInterface; });
    if (!hasIface) errors.push('🎛️ Hay fuentes de sonido pero no hay mixer ni interfaz en el montaje.');
  }

  // ── Global: mixer sin parlantes ───────────────────────────
  if (stats.mixers > 0 && stats.speakers === 0) {
    warnings.push('🔊 No hay parlantes activos en el montaje. ¿Se usará sistema PA externo?');
  }

  // ── Global: canales insuficientes ─────────────────────────
  if (stats.mixerChAvail > 0 && stats.mixerChUsed > stats.mixerChAvail) {
    errors.push(`🎛️ Se usan ${stats.mixerChUsed} canales pero el mixer tiene solo ${stats.mixerChAvail} disponibles.`);
  }

  const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
  return { status, errors, warnings, suggestions, stats };
}

// ── PANEL DIAGNÓSTICO ─────────────────────────────────────────
function renderDiagnosis(r) {
  const body = document.getElementById('panel-body');

  if (!r || r.status === 'empty') {
    body.innerHTML = `<div class="empty-state">
      <h3>Sin elementos</h3>
      <p>Arrastra equipos al escenario y haz clic en <strong>Validar montaje</strong>.</p>
    </div>`;
    return;
  }

  const labels = { ok: '✓ Listo para sonar', warning: '⚠ Casi listo — revisa advertencias', error: '✗ Faltan conexiones importantes' };
  const { errors, warnings, suggestions, stats } = r;

  const section = (title, items, cls) => items.length ? `
    <div class="diag-section">
      <div class="diag-section-title">${title} (${items.length})</div>
      ${items.map(m => `<div class="diag-item ${cls}"><span class="diag-icon">${cls === 'error' ? '❌' : cls === 'warning' ? '⚠️' : '💡'}</span><span>${esc(m)}</span></div>`).join('')}
    </div>` : '';

  const cableRows = Object.entries(stats.cableCount || {}).map(([t, n]) => {
    const ct = CONNECTION_TYPES[t] || { label: t, color: '#999' };
    return `<div class="diag-item info"><span style="color:${ct.color}">●</span><span>${esc(ct.label)}: <strong>${n}</strong></span></div>`;
  }).join('');

  body.innerHTML = `
    <div class="status-badge ${r.status}">${labels[r.status]}</div>
    ${section('Errores', errors, 'error')}
    ${section('Advertencias', warnings, 'warning')}
    ${section('Sugerencias', suggestions, 'info')}
    ${errors.length === 0 && warnings.length === 0 ? `<div class="diag-item ok"><span>✅</span><span>Todo parece estar bien conectado.</span></div>` : ''}
    <div class="diag-section">
      <div class="diag-section-title">Conteo de equipos</div>
      <div class="diag-stats">
        <div class="stat-item"><span class="stat-label">Fuentes de audio</span><span class="stat-value">${stats.soundSources || 0}</span></div>
        <div class="stat-item"><span class="stat-label">Micrófonos</span><span class="stat-value">${stats.mics || 0}</span></div>
        <div class="stat-item"><span class="stat-label">Canales usados</span><span class="stat-value">${stats.mixerChUsed || 0}</span></div>
        <div class="stat-item"><span class="stat-label">Canales disp.</span><span class="stat-value">${stats.mixerChAvail || '—'}</span></div>
        <div class="stat-item"><span class="stat-label">Cajas directas</span><span class="stat-value">${stats.dis || 0}</span></div>
        <div class="stat-item"><span class="stat-label">Phantom +48V</span><span class="stat-value">${stats.phantom || 0}</span></div>
        <div class="stat-item"><span class="stat-label">Con pilas</span><span class="stat-value">${stats.batteries || 0}</span></div>
        <div class="stat-item"><span class="stat-label">Monitores</span><span class="stat-value">${stats.monitors || 0}</span></div>
        <div class="stat-item"><span class="stat-label">Parlantes activos</span><span class="stat-value">${stats.speakers || 0}</span></div>
        <div class="stat-item"><span class="stat-label">Cables totales</span><span class="stat-value">${state.cables.length}</span></div>
      </div>
    </div>
    ${cableRows ? `<div class="diag-section"><div class="diag-section-title">Cables por tipo</div>${cableRows}</div>` : ''}
  `;
}

function renderDiagnosisEmpty() {
  renderDiagnosis(null);
}

// ── INPUT LIST ────────────────────────────────────────────────
function generateInputList() {
  const rows = [];
  let ch = 1;
  const destinations = state.elements.filter(el => {
    const t = dtype(el.typeId);
    return t && (t.isMixer || t.isInterface);
  });
  destinations.forEach(dest => {
    state.cables.filter(c => c.toEl === dest.id && c.cableType !== 'power').forEach(cable => {
      const srcEl  = elById(cable.fromEl);
      const srcType = srcEl ? dtype(srcEl.typeId) : null;
      const toPort  = getPorts(dest).find(p => p.id === cable.toPort) || null;
      rows.push({
        num:  ch++,
        source: srcEl ? srcEl.name : '?',
        type:   srcType ? srcType.label : '?',
        cable:  (CONNECTION_TYPES[cable.cableType] || { label: cable.cableType }).label,
        port:   toPort ? toPort.label : cable.toPort,
        dest:   dest.name,
        notes:  ''
      });
    });
  });
  return rows;
}

function renderInputList() {
  const body = document.getElementById('panel-body');
  const rows = generateInputList();

  if (rows.length === 0) {
    body.innerHTML = `<div class="empty-state">
      <h3>Sin canales asignados</h3>
      <p>Conecta las fuentes al mixer o interfaz para ver la input list.</p>
    </div>`;
    return;
  }

  body.innerHTML = `
    <div style="overflow-x:auto">
      <table class="input-list-table">
        <thead><tr>
          <th>Ch</th><th>Fuente</th><th>Tipo cable</th><th>Puerto en consola</th><th>Destino</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td><strong>${r.num}</strong></td>
            <td>${esc(r.source)}</td>
            <td>${esc(r.cable)}</td>
            <td style="font-size:10px;color:#9CA3AF">${esc(r.port)}</td>
            <td style="font-size:10px">${esc(r.dest)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;display:flex;gap:6px">
      <button class="icon-btn" onclick="copyInputList()">📋 Copiar texto</button>
    </div>`;
}

window.copyInputList = function() {
  const rows = generateInputList();
  const txt = rows.map(r => `Ch ${r.num}: ${r.source} — ${r.cable} → ${r.dest} (${r.port})`).join('\n');
  navigator.clipboard.writeText(txt).then(() => toast('Input list copiada ✓'));
};

// ── LISTA DE MATERIALES ───────────────────────────────────────
function generateMaterials() {
  const audio = Object.create(null), power = Object.create(null), stage = Object.create(null), backline = Object.create(null), tech = Object.create(null);
  const cableMeters = {};   // metros acumulados por etiqueta de cable

  const cableLabel = c => c.cableType === 'power'
    ? 'Cables de corriente'
    : `Cable ${(CONNECTION_TYPES[c.cableType] || { label: c.cableType }).label}`;

  // Cables de audio (no corriente)
  state.cables.filter(c => c.cableType !== 'power').forEach(c => {
    const lbl = cableLabel(c);
    audio[lbl] = (audio[lbl] || 0) + 1;
  });
  // Cables de corriente
  const pwrCables = state.cables.filter(c => c.cableType === 'power').length;
  if (pwrCables) power['Cables de corriente'] = pwrCables;

  // Metros por tipo de cable + total
  let totalMeters = 0;
  state.cables.forEach(c => {
    const m = Number(c.length) || 0;
    cableMeters[cableLabel(c)] = (cableMeters[cableLabel(c)] || 0) + m;
    totalMeters += m;
  });

  // Equipos
  state.elements.forEach(el => {
    const t = dtype(el.typeId);
    if (!t || t.isPerson) return;
    const q = Math.min(999,Math.max(1,Number(el.quantity)||1));
    if (t.isMic)           audio['Micrófonos']               = (audio['Micrófonos'] || 0) + q;
    if (t.isDI)            audio['Cajas directas']            = (audio['Cajas directas'] || 0) + q;
    if (t.isMixer)         audio['Mixer / Consola']           = (audio['Mixer / Consola'] || 0) + q;
    if (t.isInterface)     audio['Interfaz de audio']         = (audio['Interfaz de audio'] || 0) + q;
    if (t.isSpeaker)       stage['Parlantes activos']         = (stage['Parlantes activos'] || 0) + q;
    if (t.isMonitor)       stage['Monitores de piso activos'] = (stage['Monitores de piso activos'] || 0) + q;
    // Accesorios y soportes: se cuentan por su nombre
    if (t.isAccessory)     stage[t.id === 'generic_resource' ? el.name : t.label]                     = (stage[t.id === 'generic_resource' ? el.name : t.label] || 0) + q;
    // Bases de micrófono solicitadas junto al mic
    if (devOpt(el, 'withStand') === true)
                           stage['Bases de micrófono']        = (stage['Bases de micrófono'] || 0) + q;
    // Instrumentos / backline: todo lo de la categoría instrumentos + amplificadores
    // (se cuentan aunque no estén conectados — hay que llevarlos igual)
    if (t.category === 'instrument' || t.isAmplifier) {
      backline[t.label] = (backline[t.label] || 0) + q;
    }
    if (t.id === 'power_strip') power['Multitomas / Regletas']= (power['Multitomas / Regletas'] || 0) + q;
    if (t.id === 'extension')   power['Extensiones']          = (power['Extensiones'] || 0) + q;
  });

  // Tomas requeridas
  const pwrNeeded = state.elements.filter(el => {
    const t = dtype(el.typeId);
    return t && t.requiresPower && !t.isPhantomPowered && !t.isPowerSource;
  }).reduce((sum,el)=>sum+(Number(el.quantity)||1),0);
  if (pwrNeeded) power['Tomas de corriente necesarias'] = pwrNeeded;

  // Requerimientos técnicos
  const phantom = state.elements.filter(el => needsPhantom(el)).reduce((sum,el)=>sum+(Number(el.quantity)||1),0);
  if (phantom) tech['Canales con Phantom +48V (mic condensador / DI activa)'] = phantom;
  const batteries = state.elements.filter(el => usesBatteries(el)).reduce((sum,el)=>sum+(Number(el.quantity)||1),0);
  if (batteries) tech['Equipos con pila / batería (lleva repuestos)'] = batteries;
  const wireless = state.elements.filter(el => { const t = dtype(el.typeId); return t && t.isWireless; }).reduce((sum,el)=>sum+(Number(el.quantity)||1),0);
  if (wireless) tech['Sistemas inalámbricos (revisar frecuencias)'] = wireless;

  return { audio, power, stage, backline, tech, cableMeters, totalMeters };
}

function renderMaterials() {
  const body = document.getElementById('panel-body');
  const mats = generateMaterials();

  const secHtml = (icon, title, items, meters) => {
    const entries = Object.entries(items);
    if (!entries.length) return '';
    return `<div class="mat-section">
      <div class="mat-section-title">${icon} ${title}</div>
      ${entries.map(([lbl, n]) => {
        const m = meters && meters[lbl] ? ` <span class="mat-extra">· ≈${meters[lbl]} m</span>` : '';
        return `<div class="mat-item">
        <span class="mat-count">×${n}</span>
        <span class="mat-label">${esc(lbl)}${m}</span>
      </div>`;
      }).join('')}
    </div>`;
  };

  const html = secHtml('🎸', 'Instrumentos / Backline', mats.backline) +
               secHtml('🎵', 'Audio', mats.audio, mats.cableMeters) +
               secHtml('🎭', 'Escenario', mats.stage) +
               secHtml('⚡', 'Energía', mats.power, mats.cableMeters) +
               secHtml('🎛️', 'Requerimientos técnicos', mats.tech) +
               (mats.totalMeters ? `<div class="mat-section"><div class="mat-section-title">📏 Cable total</div>
                 <div class="mat-item"><span class="mat-count">≈${mats.totalMeters} m</span><span class="mat-label">Longitud total de cable</span></div></div>` : '');

  if (!html) {
    body.innerHTML = `<div class="empty-state"><h3>Sin materiales</h3><p>Agrega y conecta equipos para ver la lista.</p></div>`;
    return;
  }

  body.innerHTML = html + `<div style="margin-top:10px">
    <button class="icon-btn" onclick="copyMaterials()">📋 Copiar lista</button>
  </div>`;
}

window.copyMaterials = function() {
  const mats = generateMaterials();
  let txt = '=== LISTA DE MATERIALES ===\n';
  [['INSTRUMENTOS / BACKLINE', mats.backline], ['AUDIO', mats.audio], ['ESCENARIO', mats.stage], ['ENERGÍA', mats.power], ['REQUERIMIENTOS TÉCNICOS', mats.tech]].forEach(([sec, obj]) => {
    const ents = Object.entries(obj);
    if (!ents.length) return;
    txt += `\n${sec}:\n` + ents.map(([l, n]) => {
      const m = mats.cableMeters && mats.cableMeters[l] ? `  (≈${mats.cableMeters[l]} m)` : '';
      return `  ×${n}  ${l}${m}`;
    }).join('\n') + '\n';
  });
  if (mats.totalMeters) txt += `\nCABLE TOTAL: ≈${mats.totalMeters} m\n`;
  navigator.clipboard.writeText(txt).then(() => toast('Lista copiada ✓'));
};

// ── CHECKLIST DE MALETA (móvil) ───────────────────────────────
function checklistGroups() {
  const mats = generateMaterials();
  return [
    ['🎸 Instrumentos / Backline', mats.backline],
    ['🎵 Audio', mats.audio],
    ['🎭 Escenario', mats.stage],
    ['⚡ Energía', mats.power]
  ].map(([title, obj]) => ({ title, items: Object.entries(obj) })).filter(g => g.items.length);
}
function loadChecks() { return state.checks; }
function saveChecks(c) { state.checks=c; autoSave(); }
function loadQty() { return state.quantities; }
function saveQty(q) { state.quantities=q; autoSave(); }

function renderChecklist() {
  const body = document.getElementById('panel-body');
  const groups = checklistGroups();
  const checks = loadChecks();
  const qtyMap = loadQty();

  if (!groups.length) {
    body.innerHTML = `<div class="empty-state"><h3>Sin elementos</h3>
      <p>Agrega equipos para generar el checklist de maleta.</p></div>`;
    return;
  }

  // Progreso: total de ítems y marcados por dirección
  let total = 0, doneI = 0, doneR = 0;
  groups.forEach(g => g.items.forEach(([lbl]) => {
    total++;
    if (checks[lbl + '::ida']) doneI++;
    if (checks[lbl + '::reg']) doneR++;
  }));
  const pct = d => total ? Math.round(d / total * 100) : 0;
  const bar = (label, done, cls) => {
    const ok = done === total && total > 0;
    return `<div class="chk-prog ${ok ? 'done' : ''}">
      <div class="chk-prog-top">
        <span>${label}</span>
        <span>${ok ? '✅ Completo' : `Faltan ${total - done}`}</span>
      </div>
      <div class="chk-prog-bar"><div class="chk-prog-fill ${cls}" style="width:${pct(done)}%"></div></div>
      <div class="chk-prog-num">${done} / ${total}</div>
    </div>`;
  };

  let html = `<p class="chk-intro">Marca cada ítem al empacar y guarda el montaje. <strong>I</strong> = ida · <strong>R</strong> = regreso.</p>
    <div class="chk-progress">${bar('🚐 Ida', doneI, 'i')}${bar('🏠 Regreso', doneR, 'r')}</div>
    <div class="chk-head"><span>I</span><span>R</span><span class="chk-head-lbl">Equipo</span></div>`;
  groups.forEach(g => {
    html += `<div class="chk-group-title">${g.title}</div>`;
    g.items.forEach(([lbl, n]) => {
      const ki = lbl + '::ida', kr = lbl + '::reg';
      const bring = qtyMap[lbl] !== undefined ? qtyMap[lbl] : n;
      const short = bring < n, none = bring === 0;
      html += `<div class="chk-row">
        <button class="chk-box ${checks[ki] ? 'on' : ''}" data-k="${esc(ki)}">${checks[ki] ? '✓' : ''}</button>
        <button class="chk-box ${checks[kr] ? 'on' : ''}" data-k="${esc(kr)}">${checks[kr] ? '✓' : ''}</button>
        <span class="chk-label">
          <span class="chk-name">${esc(lbl)}</span>
          <span class="chk-bring ${none ? 'none' : short ? 'short' : ''}">Requiere <strong>×${n}</strong> · Llevamos
            <input type="number" min="0" inputmode="numeric" data-q="${esc(lbl)}" value="${bring}">
            ${none ? '<em>· lo pone el lugar</em>' : ''}
          </span>
        </span>
      </div>`;
    });
  });
  html += `<div class="chk-actions">
    <button class="icon-btn" data-reset="ida">Limpiar ida</button>
    <button class="icon-btn" data-reset="reg">Limpiar regreso</button>
  </div>`;
  body.innerHTML = html;

  body.querySelectorAll('.chk-box').forEach(b => b.onclick = () => {
    const c = loadChecks(); c[b.dataset.k] = !c[b.dataset.k]; saveChecks(c); renderChecklist();
  });
  body.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => {
    const which = b.dataset.reset, c = loadChecks();
    Object.keys(c).forEach(k => { if (k.endsWith('::' + which)) delete c[k]; });
    saveChecks(c); renderChecklist();
  });
  body.querySelectorAll('[data-q]').forEach(inp => inp.onchange = () => {
    const q = loadQty();
    q[inp.dataset.q] = Math.max(0, parseInt(inp.value) || 0);
    saveQty(q); renderChecklist();
  });
}

// ── GUARDAR / CARGAR ──────────────────────────────────────────
function projectData() {
  return {
    ...state.project,
    name:       document.getElementById('project-name').value,
    elements:   state.elements,
    cables:     state.cables,
    checks: state.checks, quantities: state.quantities, notes: state.notes,
    stageWidth:state.stageWidth, stageHeight:state.stageHeight
  };
}

function saveProject() {
  window.stageEditor.onChange?.(window.stageEditor.getProject());
}

function autoSave() { saveProject(); }

// Elimina cables que apunten a elementos o puertos que ya no existen
function sanitizeCables() {
  state.cables = state.cables.filter(c => {
    const fe = elById(c.fromEl), te = elById(c.toEl);
    if (!fe || !te) return false;
    const fOk = getPorts(fe).some(p => p.id === c.fromPort);
    const tOk = getPorts(te).some(p => p.id === c.toPort);
    return fOk && tOk;
  });
}

function loadProject(data) {
  state.elements = JSON.parse(JSON.stringify(data.elements || []));
  state.cables = JSON.parse(JSON.stringify(data.cables || []));
  state.checks = {...(data.checks || {})}; state.quantities={...(data.quantities || {})};
  state.notes=data.notes || ''; state.stageWidth=data.stageWidth || 2400;state.stageHeight=data.stageHeight || 1600;
  state.project={name:data.name || 'Montaje',version:data.version || '1.0'};
  state.selectedElementId=null;state.selectedCableId=null;cancelConn();closeModal();closeCtxMenu();closeCableTip();
  document.getElementById('project-name').value=state.project.name;
  document.getElementById('project-notes').value=state.notes;
  const stage=document.getElementById('stage');stage.style.width=state.stageWidth+'px';stage.style.height=state.stageHeight+'px';
  sanitizeCables();ensureStageSize(); renderAll();setPanel(state.activePanel);fitStage();
}

function newProject() {
  cancelConn();closeCableTip();closeModal();closeCtxMenu();
  state.elements = []; state.cables = []; state.checks={};state.quantities={};state.notes='';document.getElementById('project-notes').value='';
  state.selectedElementId = null; state.selectedCableId = null;
  state.project.name = 'Nuevo montaje';
  document.getElementById('project-name').value = 'Nuevo montaje';
  renderAll();
  renderDiagnosisEmpty();
  saveProject();
}

// ── EXPORT / IMPORT JSON ──────────────────────────────────────
function exportJSON() {
  const data = projectData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = (data.name || 'montaje').replace(/\s+/g, '_') + '_stage_patch.json';
  a.click(); URL.revokeObjectURL(url);
  toast('Proyecto exportado ✓');
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  if(file.size>600000) {toast('El archivo supera 600 KB', 'error');e.target.value='';return;}
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const raw = JSON.parse(ev.target.result);
      if(!raw || !Array.isArray(raw.elements) || (raw.cables !== undefined && !Array.isArray(raw.cables))) throw new Error('Formato inválido: se necesita un proyecto Stage Plot con elementos');
      if(raw.elements.length > 250 || (raw.cables || []).length > 1000) throw new Error('El archivo supera el límite de 250 elementos o 1000 cables');
      const {normalizeProject} = await import('../stage-plots-model.js?v=20261029-stage');
      const data = normalizeProject(raw);
      if(data.elements.length !== raw.elements.length) throw new Error('El archivo contiene equipos incompatibles o identidades repetidas');
      if (!Array.isArray(data.elements)) throw new Error('Formato inválido');
      if(window.stageEditor.busy) throw new Error('Espera a que termine el guardado antes de importar');
      if (!confirm(`¿Cargar proyecto "${data.name}"?`)) return;
      loadProject(data); saveProject();
      toast('Proyecto importado ✓');
    } catch(err) { toast('Error al importar: ' + err.message, 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── PLANTILLAS ────────────────────────────────────────────────
function loadTemplate(name) {
  const tpl = TEMPLATES[name];
  if (!tpl) return;
  cancelConn();closeCableTip();closeModal();closeCtxMenu();state.selectedElementId=null;state.selectedCableId=null;
  state.elements = [];
  state.cables   = [];state.checks={};state.quantities={};state.notes='';document.getElementById('project-notes').value='';
  tpl.elements.forEach(ed => {
    state.elements.push({
      id:    uid(),
      typeId: ed.typeId,
      x:     ed.x, y: ed.y,
      name:  ed.name || dtype(ed.typeId)?.label || ed.typeId,
      notes: ''
    });
  });
  state.project.name = tpl.label;
  document.getElementById('project-name').value = tpl.label;
  ensureStageSize();renderAll(); renderDiagnosisEmpty();fitStage(); saveProject();
  toast(`Plantilla "${tpl.label}" cargada ✓`);
}

// ── IMPRIMIR ──────────────────────────────────────────────────
function preparePrint() {
  document.getElementById('print-project-name').textContent = state.project.name;
  document.getElementById('print-notes').textContent = state.notes;

  // Escalar el mapa para que quepa en la hoja (vertical, ~680px de ancho útil)
  let maxX = 0, maxY = 0;
  state.elements.forEach(el => {
    const h = cardHeight(getPorts(el));
    maxX = Math.max(maxX, el.x + EL_W);
    maxY = Math.max(maxY, el.y + h);
  });
  const pad = 30;
  const contentW = Math.max(maxX + pad, 1);
  const contentH = Math.max(maxY + pad, 1);
  const fitW = 680;                                  // ancho útil A4 vertical aprox.
  const scale = Math.min(1, fitW / contentW);
  let st = document.getElementById('print-map-style');
  if (!st) { st = document.createElement('style'); st.id = 'print-map-style'; document.head.appendChild(st); }
  st.textContent = state.elements.length ? `@media print {
    #stage { transform: scale(${scale.toFixed(4)}) !important;
             width: ${contentW}px !important; height: ${contentH}px !important; }
    #stage-wrapper { height: ${Math.ceil(contentH * scale) + 6}px !important; }
  }` : `@media print { #stage-wrapper { display: none !important; } }`;

  // Input list
  const rows = generateInputList();
  const ilEl = document.getElementById('print-inputlist');
  if (rows.length) {
    ilEl.innerHTML = `<table>
      <thead><tr><th>Ch</th><th>Fuente</th><th>Cable</th><th>Puerto consola</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.num}</td><td>${esc(r.source)}</td><td>${esc(r.cable)}</td><td>${esc(r.port)}</td></tr>`).join('')}</tbody>
    </table>`;
  } else {
    ilEl.innerHTML = '<p>Sin canales asignados.</p>';
  }

  // Materiales
  const mats = generateMaterials();
  const matEl = document.getElementById('print-materials');
  let matHtml = '';
  [['🎸 Instrumentos / Backline', mats.backline], ['🎵 Audio', mats.audio], ['🎭 Escenario', mats.stage], ['⚡ Energía', mats.power], ['🎛️ Requerimientos técnicos', mats.tech]].forEach(([sec, obj]) => {
    const ents = Object.entries(obj);
    if (!ents.length) return;
    matHtml += `<div class="print-mat-group"><h4>${sec}</h4><table>
      ${ents.map(([l, n]) => {
        const m = mats.cableMeters && mats.cableMeters[l] ? ` <em>(≈${mats.cableMeters[l]} m)</em>` : '';
        return `<tr><td class="print-qty">×${n}</td><td>${esc(l)}${m}</td></tr>`;
      }).join('')}
    </table></div>`;
  });
  if (mats.totalMeters) matHtml += `<p class="print-total">📏 Longitud total de cable: ≈${mats.totalMeters} m</p>`;
  matEl.innerHTML = matHtml || '<p>Sin materiales.</p>';

  window.print();
}

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const old = document.getElementById('app-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'app-toast';
  const bg = { ok: '#10B981', warn: '#F59E0B', error: '#EF4444', info: '#1F2937' }[type] || '#1F2937';
  t.style.cssText = `position:fixed;bottom:22px;left:50%;transform:translateX(-50%);
    background:${bg};color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;
    font-weight:500;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,0.18);
    pointer-events:none;transition:opacity .3s;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ── EXPOSICIÓN GLOBAL PARA HANDLERS INLINE ────────────────────
window.handleStageDrop = handleStageDrop;

// ── ARRANQUE ──────────────────────────────────────────────────
window.stageEditor = {
  ready:false,busy:false,onChange:null,onSave:null,
  load:loadProject,
  getProject:()=>JSON.parse(JSON.stringify(projectData())),
  print:preparePrint,
  setNotes:(notes)=>{state.notes=String(notes || '');document.getElementById('project-notes').value=state.notes;},
  fit:fitStage,
  setBusy:setBusy
};
window.addEventListener('DOMContentLoaded', init);