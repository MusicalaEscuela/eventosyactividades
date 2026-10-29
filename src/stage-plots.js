import { generate, reconcile, toEditorProject, fromEditorProject, consolidatedPlots } from './stage-plots-model.js?v=20261029-editor-1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const works = row => Array.isArray(row.repertorios) && row.repertorios.length ? row.repertorios.join(' · ') : row.repertorio || '';
const editorURL = new URL('./stage-editor/index.html?v=20261029-editor-1', import.meta.url).href;

export function createStagePlots({context, save, toast}) {
  if (!document.querySelector('#stagePlotStyles')) {
    const link = document.createElement('link');
    link.id = 'stagePlotStyles'; link.rel = 'stylesheet';
    link.href = new URL('./stage-plots.css?v=20261029-editor-1', import.meta.url).href;
    document.head.append(link);
  }
  let host = null, scope = '', selected = '', mounted = 0, visibleDraft = null;
  const drafts = new Map();
  const keyFor = (eventId, id) => JSON.stringify([eventId, id]);
  function draftFor(row, ctx) {
    const key = keyFor(ctx.event.id, row.id), generated = generate(row, ctx.participants);
    const saved = ctx.event.stagePlots?.[row.id] || null;
    let draft = drafts.get(key);
    if (!draft) {
      draft = {data:reconcile(saved, generated), base:clone(saved), source:JSON.stringify(generated), dirty:false, busy:false, error:''};
      drafts.set(key, draft);
    } else if (!draft.dirty && !draft.busy) {
      draft.data = reconcile(saved, generated); draft.base = clone(saved); draft.source = JSON.stringify(generated);
    }
    return draft;
  }
  function renderTotals(ctx) {
    const target = host?.querySelector('[data-stage-totals]');
    if (target) target.innerHTML = consolidatedPlots(ctx.presentations.map(row => draftFor(row, ctx).data)).map(r => `<span><b>${Number(r.quantity)}</b> ${esc(r.name)}</span>`).join('') || '<p>Sin necesidades registradas.</p>';
  }
  function updateStatus(draft) {
    if (!host?.isConnected) return;
    const status = host.querySelector('#stageSaveState');
    if (status) {
      status.textContent = draft.busy ? 'Guardando montaje…' : draft.error || (draft.dirty ? 'Cambios sin guardar' : draft.base ? 'Montaje guardado' : 'Propuesta automática · aún sin guardar');
      status.dataset.state = draft.error ? 'error' : draft.dirty ? 'dirty' : 'saved';
    }
    const capacity = host.querySelector('[data-stage-capacity]');
    if (capacity) capacity.textContent = draft.data.pendingNodes?.length ? `${draft.data.pendingNodes.length} necesidad(es) adicional(es) siguen en el inventario y están pendientes de ubicar: el plano admite 250 elementos. Agrupa unidades con Cantidad o quita elementos, guarda y vuelve a abrir Rider para incorporarlas.` : '';
    const frame = host.querySelector('#stageEditorFrame');
    host.querySelectorAll('[data-stage-save],[data-stage-editor-save]').forEach(el => { el.disabled = draft.busy || frame?.dataset.loaded !== '1'; });
    host.querySelectorAll('[data-stage-reload],#stagePresentation,#stageNotes').forEach(el => { el.disabled = draft.busy; });
    host.querySelector('#stageEditorFrame')?.contentWindow?.stageEditor?.setBusy(draft.busy);
  }
  function render() {
    if (!host?.isConnected) return;
    const ctx = context();
    if (!ctx.event) { host.replaceChildren(); return; }
    if (scope !== ctx.event.id) { scope = ctx.event.id; selected = ''; }
    if (!ctx.presentations.some(row => row.id === selected)) selected = ctx.presentations[0]?.id || '';
    const row = ctx.presentations.find(item => item.id === selected), draft = row ? draftFor(row, ctx) : null;
    visibleDraft = draft;
    const session = ++mounted;
    host.innerHTML = `<section class="stage-panel">
      <div class="stage-heading"><div><span class="stage-eyebrow">PRODUCCIÓN · STAGE PLOT</span><h3>Diseña el montaje de cada presentación</h3><p>Ubica integrantes y equipos con dibujos. Define las conexiones y revisa lo que hay que llevar.</p></div><span class="stage-badge">🎛️ Editor completo</span></div>
      ${row ? `<div class="stage-presentation"><label for="stagePresentation">Presentación<select id="stagePresentation">${ctx.presentations.map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.estudianteGrupo || p.nombre || 'Presentación')}</option>`).join('')}</select></label><div class="stage-work">${esc(works(row))}</div></div>
      <div class="stage-toolbar"><button type="button" class="stage-primary" data-stage-save>💾 Guardar montaje</button><button type="button" data-stage-print>🖨 Imprimir plano y rider</button><button type="button" data-stage-reload>Cargar versión guardada</button><span role="status" aria-live="polite" id="stageSaveState"></span></div>
      <div class="stage-help"><span>① <b>Agrega</b> equipos desde la biblioteca</span><span>② <b>Arrastra</b> para ubicarlos</span><span>③ <b>Conecta</b> sus puertos y valida</span></div>
      <div class="stage-editor-shell"><div class="stage-editor-heading"><span>🎭 Plano y conexiones <small>Vista desde el público · plano orientativo, sin escala</small></span><div><button type="button" data-stage-editor-save>💾 Guardar</button><button type="button" data-stage-fullscreen>⛶ Ampliar editor</button></div></div><iframe id="stageEditorFrame" title="Editor Stage Plot de esta presentación" src="${esc(editorURL)}" allow="fullscreen; clipboard-write" allowfullscreen></iframe></div>
      <label class="stage-notes" for="stageNotes">Indicaciones para el montaje<textarea id="stageNotes" rows="3" maxlength="5000" placeholder="Accesos, cambios entre obras, ubicación de equipos…">${esc(draft.data.notes)}</textarea></label>
      <p class="stage-source-warning" role="status" data-stage-source></p>
      <p class="stage-source-warning" role="status" data-stage-capacity></p>
      <p class="field-hint">Guardar conserva plano, conexiones, opciones de equipos y checklist de esta presentación. JSON permite intercambiar montajes con Stage Plot.</p>` : '<div class="stage-empty">🎭 <p>Agrega participantes o ensambles para preparar sus montajes. Las presentaciones canceladas no se incluyen.</p></div>'}
      <details class="stage-shared" open><summary>📦 Equipos compartidos entre presentaciones</summary><p class="field-hint">Cantidad máxima requerida en una presentación, incluyendo tus ajustes sin guardar. Revisa aparte los montajes simultáneos.</p><div class="stage-totals" data-stage-totals></div></details>
      <h3>Rider general del evento</h3><p class="field-hint">Gestiona abajo disponibilidad, proveedores y necesidades generales del evento.</p>
    </section>`;
    renderTotals(ctx);
    if (!row) return;
    const frame = host.querySelector('#stageEditorFrame');
    const isCurrent = () => session === mounted && host?.isConnected && host.querySelector('#stageEditorFrame') === frame;
    host.querySelector('[data-stage-source]').textContent = draft.source !== JSON.stringify(generate(row, ctx.participants)) ? 'Los participantes o recursos cambiaron mientras editabas. Guarda el montaje y vuelve a abrir Rider para incorporar las novedades.' : draft.base?.generatedFrom && draft.base.generatedFrom !== draft.source ? 'Los participantes o recursos cambiaron desde el último guardado. Revisa los nombres, equipos y cantidades antes de guardar el montaje.' : '';
    const changed = project => {
      if (draft.busy) return;
      try {
        draft.data = fromEditorProject(project, draft.data);
        draft.dirty = true; draft.error = '';
        if (isCurrent()) {
          const notes = host.querySelector('#stageNotes');
          if (notes && notes.value !== draft.data.notes) notes.value = draft.data.notes;
          updateStatus(draft); renderTotals(ctx);
        }
      } catch (error) { toast('No se pudo leer el montaje: ' + error.message); }
    };
    const capture = () => {
      const api = frame.contentWindow?.stageEditor;
      if (api && frame.dataset.loaded === '1') draft.data = fromEditorProject(api.getProject(), draft.data);
    };
    const saveDraft = async () => {
      if (draft.busy || frame.dataset.loaded !== '1') return;
      try { capture(); } catch (error) { toast('Revisa el montaje: ' + error.message); return; }
      const data = clone(draft.data), base = clone(draft.base);
      data.generatedFrom = draft.source; draft.busy = true; draft.error = '';
      if (isCurrent()) updateStatus(draft);
      try {
        await save(ctx.event.id, row.id, data, base);
        draft.data = data; draft.base = clone(data); draft.dirty = false;
        toast('Montaje guardado con sus conexiones y checklist.');
      } catch (error) {
        draft.error = error.message === 'stage-size' ? 'El evento alcanzó el límite de tamaño para montajes. Exporta JSON para conservar una copia.' : error.message === 'stage-conflict' ? 'Otra persona cambió este montaje. Exporta tu JSON antes de cargar la versión guardada.' : 'No se pudo guardar el montaje. Tus cambios siguen disponibles; vuelve a intentarlo.';
        draft.dirty = true; toast(draft.error);
      } finally {
        draft.busy = false;
        // Firestore can replace the iframe with a new snapshot before the write
        // promise resolves. Unlock whichever frame now displays this same draft.
        if (visibleDraft === draft) updateStatus(draft);
      }
    };
    frame.onload = () => {
      if (!isCurrent()) return;
      const api = frame.contentWindow?.stageEditor;
      if (!api) { draft.error = 'No se pudo cargar el editor. Vuelve a abrir Rider.'; updateStatus(draft); return; }
      try {
        api.load(toEditorProject(draft.data, {name:`${ctx.event.titulo || 'Evento'} · ${row.estudianteGrupo || row.nombre || 'Presentación'}`}));
        frame.dataset.loaded = '1';
        api.onChange = changed; api.onSave = saveDraft; api.setBusy(draft.busy);
      } catch (error) { draft.error = 'No se pudo cargar el montaje: ' + error.message; }
      updateStatus(draft);
    };
    host.querySelector('#stagePresentation').onchange = event => { capture(); selected = event.target.value; render(); };
    host.querySelector('#stageNotes').oninput = event => {
      draft.data.notes = event.target.value;
      if (draft.data.patch) draft.data.patch.notes = event.target.value;
      frame.contentWindow?.stageEditor?.setNotes?.(event.target.value);
      draft.dirty = true; draft.error = ''; updateStatus(draft);
    };
    host.querySelector('[data-stage-save]').onclick = saveDraft;
    host.querySelector('[data-stage-editor-save]').onclick = saveDraft;
    host.querySelector('[data-stage-print]').onclick = () => {
      const api = frame.contentWindow?.stageEditor;
      if (!api) { toast('Espera a que termine de cargar el editor.'); return; }
      api.print();
    };
    host.querySelector('[data-stage-reload]').onclick = () => {
      if (draft.dirty && !confirm('¿Descartar los cambios sin guardar y cargar la última versión guardada? Puedes exportar primero un JSON desde el editor.')) return;
      drafts.delete(keyFor(ctx.event.id, row.id)); render();
    };
    host.querySelector('[data-stage-fullscreen]').onclick = async event => {
      const shell = host.querySelector('.stage-editor-shell');
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.classList.contains('stage-expanded')) shell.classList.remove('stage-expanded');
      else { try { await shell.requestFullscreen(); } catch { shell.classList.add('stage-expanded'); } }
      event.target.textContent = document.fullscreenElement || shell.classList.contains('stage-expanded') ? '⛶ Reducir editor' : '⛶ Ampliar editor';
    };
    updateStatus(draft);
  }
  window.addEventListener('beforeunload', event => {
    if (![...drafts.values()].some(draft => draft.dirty)) return;
    event.preventDefault(); event.returnValue = '';
  });
  return { mount(element) { host = element; render(); }, reset() { drafts.clear(); selected = ''; scope = ''; visibleDraft = null; mounted++; } };
}
