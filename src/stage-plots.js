import { DEVICE_TYPES } from './stage-patch-data.js?v=20261016-stage';

const STYLES = `.stage-panel{padding:12px 0 24px}.stage-panel>label{display:block;margin:14px 0}.stage-panel select,.stage-panel textarea{width:100%}.stage-toolbar,.stage-add{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:16px 0}.stage-add>label:first-child{flex:1;min-width:220px}.stage-add>label:nth-child(2){width:100px}.stage-scroll{overflow-x:auto}.stage-board{min-width:650px;height:530px;position:relative;overflow:hidden;border:2px solid #9389bd;border-radius:16px;background:repeating-linear-gradient(0deg,transparent,transparent 39px,#e9e6f3 40px),repeating-linear-gradient(90deg,#faf9ff,#faf9ff 39px,#e9e6f3 40px);margin:18px 0;color:#241356}.stage-back,.stage-front{position:absolute;left:0;right:0;text-align:center;font-size:12px;letter-spacing:2px;pointer-events:none}.stage-back{top:10px}.stage-front{bottom:10px}.stage-node{position:absolute;transform:translateX(-50%);width:130px;padding:8px;border:1px solid #bdb3da;border-radius:9px;background:#fff;box-shadow:0 2px 5px #24135618;font-size:12px;cursor:grab;touch-action:none;user-select:none}.stage-node.person{background:#eaf3ff;border-color:#89b5ea}.stage-node small{display:block;margin-top:4px}.stage-node-list{display:grid;gap:12px;margin-top:15px}.stage-edit-row{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px;border:1px solid #ddd7eb;border-radius:12px}.stage-edit-row>strong{min-width:150px;flex:1}.stage-edit-row label{width:110px}.stage-edit-row input{width:100%}.stage-totals{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px}.stage-totals>span{background:#f1edff;border-radius:12px;padding:10px}.stage-panel button{border:1px solid #bcb0e5;background:#f6f3ff;color:#32116b;border-radius:10px;padding:10px;cursor:pointer}.stage-panel button:disabled{opacity:.5;cursor:wait}@media(max-width:600px){.stage-board{height:600px}.stage-node{width:95px;font-size:10px;padding:5px}.stage-toolbar{align-items:start}}`;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clone = value => JSON.parse(JSON.stringify(value));
const items = value => Array.isArray(value) ? value : [];
const resourceKey = name => {
  const n = norm(name);
  if (/^(piano|teclado)( electrico| digital)?$|^piano teclado$/.test(n)) return 'piano teclado';
  if (/^silla( sin brazos)?$/.test(n)) return 'silla sin brazos';
  return n;
};
const resources = row => items(row.recursosSeleccionados).length ? row.recursosSeleccionados : String(row.recursos || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
const works = row => items(row.repertorios).length ? row.repertorios.join(' · ') : row.repertorio || '';

// Generated identities remain stable when names or instruments change.
function generate(row, participants) {
  const members = items(row.integrantes).length ? row.integrantes : [{ nombre: row.estudianteGrupo, instrumento: row.instrumento, participanteId: row.id }];
  const nodes = members.map((m, i) => {
    const original = participants.find(p => p.id === m.participanteId);
    return { id: `person:${m.studentId || m.participanteId || i}`, kind:'person', name:m.nombre || original?.estudianteGrupo || 'Integrante', detail:m.instrumento || original?.instrumento || '', x:15 + (i % 4) * 23, y:Math.min(60,25 + Math.floor(i / 4) * 20) };
  });
  const counts = new Map();
  const add = (name, quantity, minimum = false) => {
    if (!String(name || '').trim()) return;
    const key = resourceKey(name), prior = counts.get(key);
    counts.set(key, { name:prior?.name || name, quantity: minimum ? Math.max(prior?.quantity || 0, quantity) : (prior?.quantity || 0) + quantity });
  };
  nodes.forEach(node => add(node.detail, 1));
  // Checkboxes specify a need, not a quantity; start at one and let coordination adjust.
  resources(row).forEach(name => add(name, 1, true));
  const memberCounts = new Map();
  members.forEach(m => {
    const original = participants.find(p => p.id === m.participanteId);
    resources(original || {}).forEach(name => { const key = resourceKey(name), prior = memberCounts.get(key); memberCounts.set(key, {name, quantity:(prior?.quantity || 0) + 1}); });
  });
  memberCounts.forEach(r => add(r.name, r.quantity, true));
  const equipment = [...counts].map(([key,r],i) => ({id:`resource:${key}`, kind:'resource', name:r.name, quantity:r.quantity, detail:'', x:12 + (i % 5)*18, y:Math.min(85,75 + Math.floor(i/5)*9)}));
  return { version:1, nodes:[...nodes, ...equipment], notes:'' };
}

function reconcile(saved, generated) {
  if (!saved) return generated;
  const hidden = items(saved.hidden);
  const existing = new Map(items(saved.nodes).map(n => [n.id,n]));
  const result = generated.nodes.filter(n => !hidden.includes(n.id)).map(n => {
    const old = existing.get(n.id);
    if (!old) return n;
    return { ...n, x:old.x, y:old.y, ...(n.kind === 'resource' ? {quantity:old.quantity, detail:old.detail || ''} : {}) };
  });
  result.push(...items(saved.nodes).filter(n => n.id.startsWith('custom:')));
  return {...generated, nodes:result, hidden, notes:saved.notes || '', generatedFrom:saved.generatedFrom || ''};
}

export function createStagePlots({context, save, toast}) {
  if(!document.querySelector('#stagePlotStyles')){const style=document.createElement('style');style.id='stagePlotStyles';style.textContent=STYLES;document.head.append(style);}
  let selected = '', scope = '', host = null;
  const drafts = new Map();
  const keyFor = id => `${scope}:${id}`;
  function draftFor(row, ctx) {
    const key = keyFor(row.id);
    if (!drafts.has(key)) {
      const saved = ctx.event.stagePlots?.[row.id] || null;
      const generated = generate(row, ctx.participants);
      drafts.set(key, {data:reconcile(saved,generated), base:clone(saved), dirty:false, source:JSON.stringify(generated), busy:false});
    }
    const draft = drafts.get(key), generated = generate(row,ctx.participants);
    if (!draft.dirty && !draft.busy) {
      const saved = ctx.event.stagePlots?.[row.id] || null;
      draft.data = reconcile(saved,generated); draft.base=clone(saved); draft.source=JSON.stringify(generated);
    }
    return draft;
  }
  function consolidated(ctx) {
    const totals = new Map();
    ctx.presentations.forEach(row => {
      const d = draftFor(row,ctx), local = new Map();
      d.data.nodes.filter(n=>n.kind==='resource').forEach(n=>{const k=resourceKey(n.name); const prev=local.get(k);local.set(k,{name:n.name,quantity:(prev?.quantity||0)+Number(n.quantity||0)});});
      local.forEach((r,k)=>{const prior=totals.get(k);totals.set(k,{name:prior?.name||r.name,quantity:Math.max(prior?.quantity||0,r.quantity)});});
    });
    return [...totals.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
  }
  function render() {
    if (!host?.isConnected) return;
    const ctx=context();
    if(scope!==ctx.event.id){scope=ctx.event.id;selected='';}
    if(!ctx.presentations.some(r=>r.id===selected))selected=ctx.presentations[0]?.id || '';
    const row=ctx.presentations.find(r=>r.id===selected), d=row?draftFor(row,ctx):null;
    host.innerHTML=`<section class="stage-panel"><h3>Plano de escenario por presentación</h3><p>Se prepara con los integrantes, instrumentos y recursos registrados. Ajusta las cantidades y posiciones antes de confirmar el montaje.</p>${row?`
      <label>Presentación<select id="stagePresentation">${ctx.presentations.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.estudianteGrupo || p.nombre || 'Presentación')}</option>`).join('')}</select></label>
      <p class="field-hint">${esc(works(row))}</p>
      <div class="stage-toolbar"><button type="button" data-stage-save ${d.busy?'disabled':''}>${d.busy?'Guardando…':'Guardar montaje'}</button><button type="button" data-stage-print>Imprimir plano y rider</button><button type="button" data-stage-reload>Cargar versión guardada</button><span role="status" id="stageSaveState">${d.dirty?'Cambios sin guardar':d.base?'Montaje guardado':'Propuesta automática · aún sin guardar'}</span></div>
      <p class="field-hint">Arrastra las tarjetas o ajusta sus coordenadas en la lista. Izquierda y derecha vistas desde el público. El plano es orientativo, sin escala.</p>
      <div class="stage-scroll"><div class="stage-board" aria-label="Plano orientativo del escenario"><span class="stage-back">FONDO DEL ESCENARIO</span>${d.data.nodes.map(n=>`<div class="stage-node ${n.kind}" data-node="${esc(n.id)}" style="left:${Number(n.x)||0}%;top:${Number(n.y)||0}%">${n.kind==='person'?'👤':'📦'} <strong>${esc(n.name)}</strong><small>${n.kind==='resource'?`${Number(n.quantity)||0} unidad(es)`:esc(n.detail || 'Instrumento por definir')}</small></div>`).join('')}<span class="stage-front">PÚBLICO</span></div></div>
      <details><summary>Integrantes, posiciones y cantidades (${d.data.nodes.length})</summary><div class="stage-node-list">${d.data.nodes.map(n=>`<div class="stage-edit-row" data-edit-node="${esc(n.id)}"><strong>${esc(n.name)}</strong><span>${esc(n.kind==='person'?n.detail:'Recurso')}</span><label>Izquierda %<input type="number" min="10" max="88" step="1" data-prop="x" value="${Number(n.x)||0}" /></label><label>Desde fondo %<input type="number" min="10" max="85" step="1" data-prop="y" value="${Number(n.y)||0}" /></label>${n.kind==='resource'?`<label>Cantidad<input type="number" min="1" max="999" step="1" data-prop="quantity" value="${Number(n.quantity)||1}" /></label><button type="button" data-stage-remove="${esc(n.id)}">Quitar recurso</button>`:''}</div>`).join('')}</div></details>
      <div class="stage-add"><label>Agregar equipo o necesidad<input id="stageResourceName" list="stageEquipment" placeholder="Elige del catálogo o escribe otro recurso" maxlength="160" /></label><datalist id="stageEquipment">${Object.values(DEVICE_TYPES).map(t=>`<option value="${esc(t.label)}"></option>`).join('')}</datalist><label>Cantidad<input id="stageResourceQty" type="number" value="1" min="1" max="999" step="1" /></label><button type="button" data-stage-add>Agregar recurso</button></div>
      <label>Indicaciones para el montaje<textarea id="stageNotes" maxlength="5000">${esc(d.data.notes)}</textarea></label>
      <p class="field-hint">Micrófonos, canales, cableado y alimentación eléctrica deben ser definidos por el equipo técnico. Los recursos sin cantidad registrada comienzan en una unidad para revisión.</p>
      ${d.source!==JSON.stringify(generate(row,ctx.participants))?'<p class="hint-alerta">Los participantes o recursos cambiaron mientras editabas. Guarda tus ajustes y vuelve a abrir Rider para incorporar las novedades.</p>':d.base?.generatedFrom && d.base.generatedFrom!==d.source?'<p class="hint-alerta">Los participantes o recursos cambiaron desde el último guardado. Se incorporaron las novedades y se conservaron tus posiciones y cantidades; revisa el montaje y guárdalo.</p>':''}
      `:'<p>Agrega participantes o ensambles para generar sus planos. Las presentaciones canceladas no se incluyen.</p>'}
      <h3>Equipos compartidos entre presentaciones</h3><p class="field-hint">Cantidad máxima requerida en una presentación; los equipos se reutilizan entre momentos. Incluye ajustes sin guardar. Verifica aparte el rider general y cualquier montaje simultáneo.</p><div class="stage-totals">${consolidated(ctx).map(r=>`<span><b>${r.quantity}</b> ${esc(r.name)}</span>`).join('')||'Sin necesidades registradas.'}</div>
      <h3>Rider general del evento</h3><p class="field-hint">Abajo puedes gestionar disponibilidad, proveedores y necesidades generales. Esta lista se conserva independiente del cálculo por presentación.</p>
    </section>`;
    if(!row)return;
    if(d.busy){host.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);return;}
    const dirty=()=>{d.dirty=true;host.querySelector('#stageSaveState').textContent='Cambios sin guardar';};
    host.querySelector('[data-stage-reload]').onclick=()=>{if(d.dirty && !confirm('¿Descartar tus cambios sin guardar y cargar el montaje guardado?'))return;drafts.delete(keyFor(row.id));render();};
    host.querySelector('#stagePresentation').onchange=e=>{selected=e.target.value;render();};
    host.querySelector('#stageNotes').oninput=e=>{d.data.notes=e.target.value;dirty();};
    host.querySelectorAll('[data-edit-node] input').forEach(input=>input.onchange=()=>{
      if(!input.reportValidity() || input.value==='')return;
      const node=d.data.nodes.find(n=>n.id===input.closest('[data-edit-node]').dataset.editNode);
      node[input.dataset.prop]=Number(input.value);dirty();render();
    });
    host.querySelectorAll('[data-stage-remove]').forEach(button=>button.onclick=()=>{const id=button.dataset.stageRemove;d.data.nodes=d.data.nodes.filter(n=>n.id!==id);d.data.hidden=[...new Set([...items(d.data.hidden),id])];dirty();render();});
    host.querySelector('[data-stage-add]').onclick=()=>{
      const input=host.querySelector('#stageResourceName'), qty=host.querySelector('#stageResourceQty'), name=input.value.trim();
      if(!name){input.focus();return;}if(!qty.reportValidity()||!qty.value)return;
      d.data.nodes.push({id:`custom:${crypto.randomUUID()}`,kind:'resource',name,quantity:Number(qty.value),detail:'',x:45,y:65});dirty();render();
    };
    host.querySelectorAll('[data-node]').forEach(card=>card.onpointerdown=e=>{
      if(e.button!==0)return;e.preventDefault();card.setPointerCapture(e.pointerId);
      const board=card.parentElement, bounds=board.getBoundingClientRect(), node=d.data.nodes.find(n=>n.id===card.dataset.node);
      const offsetX=e.clientX-card.getBoundingClientRect().left,offsetY=e.clientY-card.getBoundingClientRect().top;
      card.onpointermove=ev=>{node.x=Math.round(Math.max(10,Math.min(88,(ev.clientX-bounds.left-offsetX+card.offsetWidth/2)/bounds.width*100)));node.y=Math.round(Math.max(10,Math.min(85,(ev.clientY-bounds.top-offsetY)/bounds.height*100)));card.style.left=node.x+'%';card.style.top=node.y+'%';dirty();};
      const finish=()=>{card.onpointermove=null;card.onpointerup=null;card.onpointercancel=null;render();};card.onpointerup=finish;card.onpointercancel=finish;
    });
    host.querySelector('[data-stage-save]').onclick=async()=>{
      if(d.busy)return;
      if(d.data.nodes.length>250){toast('El montaje admite hasta 250 elementos.');return;}
      const eventId=ctx.event.id, presentationId=row.id, data=clone(d.data), base=clone(d.base);
      data.generatedFrom=d.source;
      d.busy=true;render();
      try{await save(eventId,presentationId,data,base);d.base=clone(data);d.dirty=false;toast('Montaje guardado.');}
      catch(error){console.error(error);toast(error.message==='stage-size'?'El evento alcanzó el límite de tamaño para montajes. Tus ajustes siguen en pantalla.':error.message==='stage-conflict'?'Otra persona cambió este montaje. Tus ajustes siguen en pantalla; vuelve a abrir el evento para cargar la versión guardada.':'No se pudo guardar el montaje. Tus ajustes siguen en pantalla.');}
      finally{d.busy=false;render();}
    };
    host.querySelector('[data-stage-print]').onclick=()=>{
      const win=window.open('','_blank');if(!win){toast('Permite abrir la ventana de impresión.');return;}
      const style=document.querySelector('#stagePlotStyles')?.textContent || '';
      win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Montaje · ${esc(row.estudianteGrupo)}</title><style>${style}body{font:14px Arial;padding:20px}.stage-board{height:420px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd;text-align:left}</style></head><body><h1>${esc(ctx.event.titulo)}</h1><h2>${esc(row.estudianteGrupo)}</h2><p>${esc(works(row))}</p>${host.querySelector('.stage-board').outerHTML}<h3>Recursos de esta presentación</h3><table><tr><th>Recurso</th><th>Cantidad</th></tr>${d.data.nodes.filter(n=>n.kind==='resource').map(n=>`<tr><td>${esc(n.name)}</td><td>${n.quantity}</td></tr>`).join('')}</table><p style="white-space:pre-wrap">${esc(d.data.notes)}</p><h3>Máximo compartido del evento</h3><p>${consolidated(ctx).map(r=>`${r.quantity} × ${esc(r.name)}`).join(' · ')}</p><p>Plano orientativo. Cableado y canales pendientes de revisión técnica.</p></body></html>`);win.document.close();win.focus();win.print();
    };
  }
  return {mount(element){host=element;render();}};
}
