import { teacherWorks } from './docentes-obras.js?v=20261017-integracion';
import { getWorkMinutes, workDurationReference } from './obras-duracion.js?v=20261016-tiempo-por-obra';
import { buildEnsembleParticipationIndex, getEnsemblesForParticipantWork } from './ensambles-model.js?v=20261016-tiempo-por-obra';
import { db, collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, where, updateDoc, serverTimestamp, Timestamp, runTransaction } from './firebase-config.js?v=20261011-docentes';
import { loadFicha, fichaUrl, timestampMillis } from './docentes-data.js?v=20261017-integracion';
import { coincidenciasPresentacion, validarFichaParaConfirmar, muestraDesdeFicha, instruccionesDocentes, normalizarNombre, nombresPresentacion } from './docentes-model.js?v=20261017-integracion';
import { buildTeacherOptions } from './eventos-context.js?v=20261017-personas';
import { buildTeacherPreload, preloadMatchesPresentation, samePreload, planMissingPresentations } from './docentes-preload.js?v=20261017-integracion';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const camposInstruccion = { preparacion:'Preparación', entrada:'Entrada a escena', inicio:'Señal de inicio', acompanamiento:'Acompañamiento', cierre:'Cierre', observaciones:'Observaciones' };
const dateLocal = value => new Date(timestampMillis(value) - 5 * 3600000).toISOString().slice(0,16);
const dateValue = input => Timestamp.fromDate(new Date(input + ':00-05:00'));
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
const nuevasInscripcionesId = (token, revision, id) => `docente-${token}-${id}-r${revision}`;
const propuestasRepetidas = (propuesta, anteriores) => {
  const nombres = nombresPresentacion(propuesta).map(normalizarNombre);
  return anteriores.filter(p => nombresPresentacion(p).some(n => nombres.includes(normalizarNombre(n))));
};
const inscripcionesAnteriores = (ficha, propuestas, existentes) => [...new Set(Object.values(ficha.confirmaciones || {}))]
  .map(id => existentes.find(row => row.id === id)).filter(row => row && !propuestas.some(p => coincidenciasPresentacion(p, [row]).some(m => m.exacta)));


function teacherWorkChanges(target,proposed,overwrite,rows,eventId){
  if(!proposed.duracionPorObra)return {};
  const existing=Array.isArray(target.repertorios)&&target.repertorios.length?target.repertorios:target.repertorio?[target.repertorio]:[];
  const titles=overwrite||!existing.length?proposed.repertorios:existing;
  const index=buildEnsembleParticipationIndex(rows.map(row=>({...row,eventoId:eventId})));
  const group=target.esEnsamble||target.tipo==='Ensamble'||target.integrantes?.length;
  const durations=titles.map(obra=>{
    const shared=!group&&getEnsemblesForParticipantWork({...target,eventoId:eventId},obra,index).length>0;
    const current=getWorkMinutes(target,obra), incoming=proposed.duracionesObras.find(w=>normalizarNombre(w.obra)===normalizarNombre(obra))?.minutos??null;
    return {obra,minutos:shared?null:overwrite||current===null?incoming:current,shared};
  });
  const own=durations.filter(w=>!w.shared);
  const result={repertorios:titles,repertorio:titles.join(' / '),duracionPorObra:true,duracionesObras:durations.map(({shared,...work})=>work),duracionMin:own.some(w=>w.minutos===null)?null:own.reduce((sum,w)=>sum+w.minutos,0),duracionSolistaMin:null,duracionSolistaReferencia:''};
  result.duracionObrasReferencia=workDurationReference(result);
  if(!target.duracionPorObra&&target.duracionMin!=null)result.duracionAnteriorMin=target.duracionMin;
  return result;
}

export function createTeacherAdmin({ user, people, teacherCandidates = people, students, annual, setModal, modalForm, modal, toast }) {
  let root, event, config = null, fichas = [], unsubs = [], opened = false, error = '', ready = false, generation = 0, preparing = false, prepareMessage = '';
  function stop() { generation++; unsubs.forEach(fn => fn()); unsubs = []; event = null; root = null; fichas = []; config = null; ready = false; preparing = false; prepareMessage = ''; }
  function mount(element, selectedEvent) {
    opened = root?.querySelector('details')?.open || false;
    root = element;
    if (!root) return;
    if (event?.id !== selectedEvent.id) {
      generation++; unsubs.forEach(fn => fn()); unsubs = []; event = selectedEvent; ready = false; error = ''; config = null; fichas = []; preparing = false; prepareMessage = '';
      unsubs.push(onSnapshot(doc(db, 'convocatoriasDocentes', event.id), s => { config = s.exists() ? s.data() : null; ready = true; render(); }, e => { error = e.message; render(); }));
      unsubs.push(onSnapshot(query(collection(db, 'fichasDocentes'), where('eventoId', '==', event.id)), s => { fichas = s.docs.map(d => ({ token: d.id, ...d.data() })).filter(f => !f.revocada).sort((a,b) => a.docenteNombre.localeCompare(b.docenteNombre)); render(); }, e => { error = e.message; render(); }));
    } else event = selectedEvent;
    render();
  }
  async function copy(value, active = () => true) { try { await navigator.clipboard.writeText(value); if (active()) toast('Enlace copiado.'); } catch { if (active()) setModal(`<h3>Copiar enlace</h3><label>Enlace<input readonly value="${esc(value)}" /></label>`, null); } }
  const publicUrl = () => { const u = new URL('docentes.html', location.href); u.searchParams.set('evento', event.id); return u.href; };
  const currentContext = () => { const id = event?.id, version = generation, email = user()?.email; return { id, email, active: () => generation === version && event?.id === id && user()?.email === email && Boolean(email) }; };
  function preparationSummary(results, failures = []) {
    const counts = results.map(result => `${result.name}: ${result.total} inscripción(es), ${result.created ? result.seeded : `${result.added.length} presentación(es) nueva(s); respuestas anteriores conservadas${result.pending ? '; '+result.pending+' pendiente(s) en el selector' : ''}`}${result.created ? ' presentación(es) precargada(s)' : ''}${result.excess ? `; el listado completo está disponible, la ficha admite hasta 20 presentaciones` : ''}`);
    return `${results.length} ficha(s) preparadas y verificadas.${counts.length ? ' ' + counts.join(' · ') : ''}${failures.length ? ' Pendientes: ' + failures.join(' · ') : ''}`;
  }
  async function prepareTeacher(docenteId, context, expectedToken = '') {
    if (!context.active()) throw Error('La muestra o la sesión cambió. Vuelve a abrir el panel.');
    const catalogRef = doc(db, 'convocatoriasDocentes', context.id);
    const reserveRef = doc(catalogRef, 'reservas', docenteId);
    const [catalog, participants, previousFichas] = await Promise.all([
      getDocFromServer(catalogRef), getDocsFromServer(collection(db, 'eventos', context.id, 'muestras')),
      getDocsFromServer(query(collection(db, 'fichasDocentes'), where('eventoId', '==', context.id)))
    ]);
    const name = catalog.data()?.docentes?.[docenteId];
    if (!catalog.exists() || !name) throw Error('Este docente ya no está habilitado. Revisa la configuración.');
    const candidates = previousFichas.docs.filter(snapshot => snapshot.data().docenteId === docenteId && !snapshot.data().revocada);
    const previousChildren = new Map(await Promise.all(candidates.map(async snapshot => [snapshot.id, await getDocsFromServer(collection(snapshot.ref, "presentaciones"))])));
    const newToken = randomToken();
    const prepared = await runTransaction(db, async tx => {
      const [currentCatalog, canonical, reservation, ...currentRows] = await Promise.all([
        tx.get(catalogRef), tx.get(doc(db, 'eventos', context.id)), tx.get(reserveRef), ...participants.docs.map(snapshot => tx.get(snapshot.ref))
      ]);
      if (!context.active()) throw Error('La muestra o la sesión cambió. Vuelve a abrir el panel.');
      if (!canonical.exists() || ['Realizado','No realizado','Archivado'].includes(canonical.data().estado)) throw Error('Este evento está cerrado. Sus enlaces existentes se conservan para consulta.');
      if (!currentCatalog.exists() || currentCatalog.data().docentes?.[docenteId] !== name) throw Error('Los docentes habilitados cambiaron. Vuelve a preparar la ficha.');
      if (!reservation.exists() && candidates.length > 1) throw Error('Hay varias fichas de este docente. Revisa y recupera el enlace vigente antes de prepararlo.');
      const token = reservation.exists() ? reservation.data().fichaToken : candidates[0]?.id || newToken;
      if (!/^[a-f0-9]{64}$/.test(token || '') || expectedToken && token !== expectedToken) throw Error('El enlace privado cambió. Actualiza el panel y usa el vigente.');
      const fichaRef = doc(db, 'fichasDocentes', token);
      const currentFicha = await tx.get(fichaRef);
      const created = !currentFicha.exists();
      const original = currentFicha.data();
      let added=[], pending=0;
      let currentChildren=[];
      if(!created){
        const previous=candidates.find(snapshot=>snapshot.id===token);
        const children=previousChildren.get(token);
        if(!previous || !children || previous.data().revision!==original.revision) throw Error('La docente actualizó su ficha. Vuelve a preparar para incorporar los cambios.');
        currentChildren=await Promise.all(children.docs.map(snapshot=>tx.get(snapshot.ref)));
        if(currentChildren.some(snapshot=>!snapshot.exists()) || currentChildren.length!==original.cantidadPresentaciones) throw Error('Las presentaciones cambiaron. Vuelve a preparar la ficha.');
      }
      if (created && (reservation.exists() || candidates.length)) throw Error('La reserva apunta a una ficha que no está disponible. Recupera su enlace desde la revisión.');
      if (!created && (original.revocada !== false || original.eventoId !== context.id || original.docenteId !== docenteId)) throw Error('La reserva no corresponde a una ficha vigente de este docente. Revisa su enlace.');
      if (!created && original.docenteNombre !== name) throw Error('El nombre habilitado difiere del nombre original de la ficha. Reutiliza el registro y la grafía de la ficha existente en la configuración antes de compartir su enlace.');
      const preload = buildTeacherPreload({ eventoId: context.id, docenteId, docenteNombre: name, participants: currentRows.filter(snapshot => snapshot.exists()).map(snapshot => ({ ...snapshot.data(), id: snapshot.id })), initialize: created });
      if (created && preload.normalized.docenteNombre !== name) throw Error('El nombre habilitado tiene espacios adicionales. Corrígelo en la configuración antes de preparar la ficha.');
      if (!context.active()) throw Error('La muestra o la sesión cambió. Vuelve a abrir el panel.');
      if (created) {
        const { presentaciones, ...fields } = preload.normalized;
        tx.set(fichaRef, { ...fields, revision: 1, cantidadPresentaciones: presentaciones.length, estudiantesPrecargados: preload.estudiantesPrecargados, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), revocada: false, reabiertaHasta: null, comentarioCoordinacion: '' });
        presentaciones.forEach(({ id, ...presentation }) => tx.set(doc(fichaRef, 'presentaciones', id), { ...presentation, revision: 1, updatedAt: serverTimestamp() }));
      } else {
        const plan=planMissingPresentations(preload.estudiantesPrecargados,currentChildren.map(snapshot=>({id:snapshot.id,...snapshot.data()})),original.estudiantesPrecargados || []);
        added=original.estado==='Confirmado'?[]:plan.additions;
        pending=plan.pending+(original.estado==='Confirmado'?plan.additions.length:0);
        const updates=original.estado==='Confirmado'?[]:plan.updates;
        const changed=added.length||updates.length;
        const revision=original.revision+(changed?1:0);
        if(changed)for(const snapshot of currentChildren){const changes=updates.find(item=>item.id===snapshot.id)?.changes||{};tx.update(snapshot.ref,{...changes,revision,updatedAt:serverTimestamp()});}
        for(const {id,...presentation} of added) tx.set(doc(fichaRef,'presentaciones',id),{...presentation,revision,updatedAt:serverTimestamp()});
        tx.update(fichaRef, { estudiantesPrecargados: preload.estudiantesPrecargados, ...(changed?{revision,cantidadPresentaciones:currentChildren.length+added.length,...(original.estado==='Enviado'?{estado:'Requiere ajustes'}:{})}:{}), updatedAt: serverTimestamp() });
      }
      if (!reservation.exists()) tx.set(reserveRef, { fichaToken: token, createdAt: serverTimestamp() });
      const marked = Array.isArray(currentCatalog.data().fichasPrivadasPreparadas) ? currentCatalog.data().fichasPrivadasPreparadas.filter(id => currentCatalog.data().docentes?.[id]) : [];
      tx.update(catalogRef, { fichasPrivadasPreparadas: [...new Set([...marked, docenteId])], updatedAt: serverTimestamp(), updatedBy: context.email });
      return { token, name, created, added, pending, ...preload };
    });
    const fichaRef = doc(db, 'fichasDocentes', prepared.token);
    const [savedFicha, savedReservation, savedCatalog, savedChildren] = await Promise.all([
      getDocFromServer(fichaRef), getDocFromServer(reserveRef), getDocFromServer(catalogRef),
      getDocsFromServer(collection(fichaRef, 'presentaciones'))
    ]);
    const stored = savedFicha.data();
    if (!savedFicha.exists() || stored.revocada || stored.eventoId !== context.id || stored.docenteId !== docenteId || stored.docenteNombre !== prepared.name || savedReservation.data()?.fichaToken !== prepared.token || !samePreload(stored.estudiantesPrecargados, prepared.estudiantesPrecargados) || savedCatalog.data()?.docentes?.[docenteId] !== prepared.name || !savedCatalog.data()?.fichasPrivadasPreparadas?.includes(docenteId)) throw Error('La ficha se guardó, pero no pude verificar su enlace y listado completo. Vuelve a preparar el enlace antes de compartirlo.');
    if (!prepared.created && prepared.added.some(({id,...presentation})=>{const child=savedChildren.docs.find(snapshot=>snapshot.id===id);if(!child)return true;const {revision,updatedAt,...data}=child.data();return !samePreload(data,presentation);})) throw Error('No pude verificar las presentaciones nuevas. Vuelve a preparar la ficha.');
    if (prepared.created && (stored.revision !== 1 || stored.cantidadPresentaciones !== prepared.seeded || savedChildren.docs.length !== prepared.seeded || prepared.normalized.presentaciones.some(({ id, ...presentation }) => {
      const child = savedChildren.docs.find(snapshot => snapshot.id === id)?.data();
      return !child || child.revision !== 1 || Object.entries(presentation).some(([key, value]) => child[key] !== value);
    }))) throw Error('No pude verificar todas las presentaciones precargadas. Abre la ficha antes de compartirla.');
    if (!context.active()) throw Error('La muestra o la sesión cambió. El panel actual no se modificó.');
    return prepared;
  }
  async function prepareMany(ids, context, progress = () => {}) {
    const results = [], failures = [];
    for (const id of ids) {
      if (!context.active()) throw Error('La muestra o la sesión cambió. Las fichas ya preparadas se conservan.');
      progress(results.length + failures.length + 1, ids.length);
      try { results.push(await prepareTeacher(id, context)); } catch (error) {
        if (!context.active()) throw error;
        failures.push(`${config?.docentes?.[id] || id}: ${error.message}`);
      }
    }
    return { results, failures };
  }
  async function preparePrivateLink(docenteId, token = '') {
    if (preparing) return;
    const context = currentContext();
    preparing = true; prepareMessage = 'Preparando el enlace y verificando los estudiantes inscritos…'; render();
    try {
      const prepared = await prepareTeacher(docenteId, context, token);
      prepareMessage = preparationSummary([prepared]); render();
      const modalBody = modalForm.firstElementChild, wasOpen = modal.open;
      if (context.active()) await copy(fichaUrl(prepared.token), () => context.active() && modal.open === wasOpen && modalForm.firstElementChild === modalBody);
    } catch (error) { if (context.active()) { prepareMessage = error.message; toast(error.message); } }
    finally { if (context.active()) { preparing = false; render(); } }
  }
  async function prepareAll() {
    if (preparing) return;
    const context = currentContext();
    preparing = true; prepareMessage = 'Buscando docentes habilitados…'; render();
    try {
      const catalog = await getDocFromServer(doc(db, 'convocatoriasDocentes', context.id));
      const ids = Object.keys(catalog.data()?.docentes || {});
      if (!ids.length) throw Error('Habilita al menos un docente en la configuración.');
      const prepared = await prepareMany(ids, context, (index, total) => { prepareMessage = `Preparando ficha ${index} de ${total}…`; render(); });
      prepareMessage = preparationSummary(prepared.results, prepared.failures); toast(prepareMessage);
    } catch (error) { if (context.active()) { prepareMessage = error.message; toast(error.message); } }
    finally { if (context.active()) { preparing = false; render(); } }
  }
  function render() {
    if (!root?.isConnected) return;
    const open = config?.abierta && timestampMillis(config.cierreAt) > Date.now() && !['Realizado','No realizado','Archivado'].includes(event.estado);
    const closedEvent = ['Realizado','No realizado','Archivado'].includes(event.estado);
    const enabled = Object.entries(config?.docentes || {});
    const listed = new Set();
    const card = (docenteId, name, ficha, enabledTeacher) => {
      if (ficha) listed.add(ficha.token);
      const details = ficha ? `${esc(ficha.estado)} · Asistirá: ${esc(ficha.asistencia)} · ${ficha.cantidadPresentaciones} presentación(es)${Array.isArray(ficha.estudiantesPrecargados) ? ` · ${ficha.estudiantesPrecargados.length} inscripción(es) en el listado` : ''}` : 'Enlace pendiente. Se cargarán los estudiantes y grupos ya asignados a este docente.';
      const prepare = enabledTeacher && !closedEvent ? `<button type="button" class="small-btn" data-prepare-teacher="${esc(docenteId)}" data-expected-token="${esc(ficha?.token || '')}" ${preparing ? 'disabled' : ''}>Preparar y copiar enlace privado</button>` : ficha ? `<button type="button" class="small-btn" data-ficha-link="${esc(ficha.token)}" ${preparing ? 'disabled' : ''}>Copiar enlace privado</button>` : '';
      return `<article class="teacher-admin-card"><div><strong>${esc(name)}</strong><p>${details}</p>${!enabledTeacher ? '<p class="field-hint">Docente no habilitado actualmente; se conserva su ficha.</p>' : ''}</div><div class="actions">${ficha ? `<button type="button" class="small-btn" data-review-ficha="${esc(ficha.token)}" ${preparing ? 'disabled' : ''}>Revisar ficha</button>` : ''}${prepare}</div></article>`;
    };
    const cards = enabled.map(([id, name]) => card(id, name, fichas.find(ficha => ficha.docenteId === id), true));
    fichas.filter(ficha => !listed.has(ficha.token)).forEach(ficha => cards.push(card(ficha.docenteId, ficha.docenteNombre, ficha, Boolean(config?.docentes?.[ficha.docenteId]))));
    root.innerHTML = `<details ${opened ? 'open' : ''}><summary>Formato docentes · ${fichas.length} ficha${fichas.length === 1 ? '' : 's'} · ${open ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}</summary>
      <p class="muted">Comparte con cada docente su enlace privado con los estudiantes y grupos ya inscritos. Completan las indicaciones sin iniciar sesión; sus propuestas se revisan aquí.</p>
      <div class="actions"><button type="button" class="btn btn-primary" data-teacher-config ${preparing ? 'disabled' : ''}>Configurar inscripciones</button><button type="button" class="btn btn-light" data-prepare-all ${preparing || !enabled.length || closedEvent ? 'disabled' : ''}>Preparar fichas con estudiantes</button><button type="button" class="btn btn-light" data-teacher-link ${preparing ? 'disabled' : ''}>Copiar enlace del formulario</button>${open ? `<button type="button" class="btn btn-light" data-teacher-close ${preparing ? 'disabled' : ''}>Cerrar inscripciones</button>` : ''}</div>
      ${error ? `<p role="alert">${esc(error)}</p>` : !ready ? '<p>Cargando…</p>' : ''}
      <p class="field-hint">${config ? `${Object.keys(config.docentes || {}).length} docentes habilitados · Cierre: ${new Date(timestampMillis(config.cierreAt)).toLocaleString('es-CO', {timeZone:'America/Bogota'})} (Bogotá)` : 'Configura los docentes y la fecha límite para abrir el formulario de esta muestra.'}</p>
      <p class="field-hint" role="status" aria-live="polite">${esc(prepareMessage)}</p>
      <div class="teacher-admin-list">${cards.join('') || '<p class="muted">Configura los docentes habilitados para preparar sus enlaces privados.</p>'}</div></details>`;
    root.querySelector('details').addEventListener('toggle', e => { opened = e.target.open; });
    root.querySelector('[data-teacher-config]').onclick = configure;
    root.querySelector('[data-teacher-link]').onclick = () => copy(publicUrl());
    root.querySelector('[data-prepare-all]').onclick = prepareAll;
    root.querySelectorAll('[data-prepare-teacher]').forEach(button => button.onclick = () => preparePrivateLink(button.dataset.prepareTeacher, button.dataset.expectedToken));
    const close = root.querySelector('[data-teacher-close]');
    if (close) close.onclick = async () => { try { await updateDoc(doc(db, 'convocatoriasDocentes', event.id), { abierta:false, updatedAt:serverTimestamp(), updatedBy:user().email }); await getDocFromServer(doc(db,'convocatoriasDocentes',event.id)); toast('Inscripciones cerradas. Las fichas guardadas se conservan.'); } catch(e) { toast(e.message); } };
    root.querySelectorAll('[data-review-ficha]').forEach(b => b.onclick = () => review(b.dataset.reviewFicha));
    root.querySelectorAll('[data-ficha-link]').forEach(b => b.onclick = () => copy(fichaUrl(b.dataset.fichaLink)));
  }
  async function configure() {
    const context = currentContext();
    const selectedEvent = { ...event };
    const eventId = selectedEvent.id;
    setModal('<h3>Inscripciones docentes</h3><p>Buscando los docentes ya registrados en esta muestra…</p>', null);
    const loadingBody = modalForm.firstElementChild;
    let options, previous;
    try {
      const [rows, catalog, savedFichas] = await Promise.all([
        getDocsFromServer(collection(db, 'eventos', eventId, 'muestras')),
        getDocFromServer(doc(db, 'convocatoriasDocentes', eventId)),
        getDocsFromServer(query(collection(db, 'fichasDocentes'), where('eventoId', '==', eventId)))
      ]);
      previous = catalog.exists() ? catalog.data() : null;
      options = await buildTeacherOptions({ people: teacherCandidates(), participants: rows.docs.map(d => d.data()), configured: previous?.docentes || {}, fichas: savedFichas.docs.map(d => d.data()).filter(f => !f.revocada) });
    } catch (error) {
      if (context.active() && modal.open && modalForm.firstElementChild === loadingBody) setModal(`<h3>No pude leer los docentes</h3><p role="alert">${esc(error.message)}</p>`, null);
      return;
    }
    if (!context.active() || !modal.open || modalForm.firstElementChild !== loadingBody) return;
    const available = new Map(options.map(p => [p.id, p.name]));
    const closedEvent = ['Realizado','No realizado','Archivado'].includes(selectedEvent.estado);
    const deadline = previous?.cierreAt ? dateLocal(previous.cierreAt) : `${selectedEvent.fechaInicio || new Date().toISOString().slice(0,10)}T23:59`;
    const assigned = options.filter(p => p.assigned).length;
    setModal(`<h3>Inscripciones docentes · ${esc(selectedEvent.titulo)}</h3>
      <p class="field-hint">Sólo se publican el nombre de la muestra, su fecha, lugar y los nombres de docentes habilitados.</p>
      <div class="form-grid"><label class="check-card wide"><input type="checkbox" name="abierta" ${previous?.abierta && !closedEvent ? 'checked' : ''} ${closedEvent ? 'disabled' : ''} />Abrir inscripciones</label><label class="wide">Fecha y hora de cierre (Bogotá)<input type="datetime-local" name="cierreAt" required value="${esc(deadline)}" /></label></div>
      ${closedEvent ? '<p>Este evento está cerrado. Cambia su estado antes de abrir inscripciones.</p>' : ''}
      <fieldset class="form-section"><legend>Docentes habilitados</legend>
        <p class="field-hint">Reutilizamos los docentes de los participantes, las fichas guardadas y los nombres ya usados. ${previous ? 'Se conserva tu selección anterior.' : 'Los docentes ya asignados a esta muestra aparecen seleccionados.'}</p>
        ${assigned ? `<button type="button" class="btn btn-light" data-select-assigned>Seleccionar docentes de esta muestra (${assigned})</button>` : ''}
        <div class="check-grid">${options.map(p => `<label class="check-card"><input type="checkbox" name="docente" value="${esc(p.id)}" data-assigned="${p.assigned}" ${p.enabled || !previous && p.assigned ? 'checked' : ''} /><span>${esc(p.name)}<small class="teacher-option-source">${esc(p.sources.join(' · '))}${p.conflict ? ' · Registro existente: revisa cuál corresponde' : ''}</small></span></label>`).join('') || '<p>Todavía no hay docentes registrados en esta muestra.</p>'}</div>
        <label>Agregar un nombre que aún no aparece (uno por línea)<textarea name="otros" placeholder="Sólo nombres nuevos"></textarea></label>
        <p class="field-hint">Los nombres existentes se reutilizan, aunque los escribas con distintas mayúsculas o tildes.</p>
      </fieldset><p id="teacherConfigResult" role="status"></p>`, 'Guardar configuración');
    modalForm.querySelector('[data-select-assigned]')?.addEventListener('click', () => {
      const groups = new Map();
      options.filter(p => p.assigned).forEach(p => {
        const key = p.groupKey || normalizarNombre(p.name);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      });
      groups.forEach(group => {
        const inputs = group.map(p => ({ option: p, input: [...modalForm.querySelectorAll('[name="docente"]')].find(input => input.value === p.id) }));
        if (inputs.some(row => row.input?.checked)) return;
        const chosen = inputs.find(row => row.option.hasFicha) || inputs.find(row => row.option.enabled) || inputs[0];
        if (chosen?.input) chosen.input.checked = true;
      });
    });
    modalForm.onsubmit = async e => {
      e.preventDefault(); const result = modalForm.querySelector('#teacherConfigResult'); const button = modalForm.querySelector('[type="submit"]');
      const active = () => context.active() && modal.open && modalForm.contains(result);
      const fd = new FormData(modalForm); const docentes = Object.fromEntries(fd.getAll('docente').map(id => [id, available.get(id)]));
      try {
        button.disabled = true; result.textContent = 'Guardando configuración…';
        for (const name of String(fd.get('otros') || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)) {
          if (name.length > 160) throw Error('Cada nombre admite hasta 160 caracteres.');
          if (Object.values(docentes).some(n => normalizarNombre(n) === normalizarNombre(name))) continue;
          const known = options.filter(p => p.aliases?.includes(normalizarNombre(name)) || normalizarNombre(p.name) === normalizarNombre(name));
          if (known.length > 1) throw Error(`Selecciona el registro existente de ${name} en la lista.`);
          if (known.length === 1) { docentes[known[0].id] = known[0].name; continue; }
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizarNombre(name)));
          docentes['nombre-' + [...new Uint8Array(hash)].slice(0,16).map(v=>v.toString(16).padStart(2,'0')).join('')] = name;
        }
        if (Object.values(docentes).some(name => !name || name.length > 160)) throw Error('Revisa los nombres: cada docente admite hasta 160 caracteres.');
        const selectedByName = new Map();
        Object.entries(docentes).forEach(([id,name]) => {
          const key = options.find(p => p.id === id)?.groupKey || normalizarNombre(name);
          if (!selectedByName.has(key)) selectedByName.set(key, []);
          selectedByName.get(key).push(id);
        });
        for (const [name, ids] of selectedByName) {
          const matches = options.filter(p => (p.groupKey || normalizarNombre(p.name)) === name);
          if (ids.length > 1 && !ids.every(id => previous?.docentes?.[id] && options.find(p => p.id === id)?.hasFicha)) throw Error('Hay registros equivalentes del mismo docente. Habilita sólo el registro que corresponde a su ficha existente.');
          if (ids.some(id => !options.find(p => p.id === id)?.hasFicha && matches.some(p => p.id !== id && p.hasFicha))) throw Error('Ese docente ya tiene una ficha con otro registro. Selecciona el nombre marcado como Ficha docente para conservar su enlace.');
        }
        const fecha = dateValue(fd.get('cierreAt')); const abierta = fd.has('abierta') && !closedEvent;
        if (abierta && (!Object.keys(docentes).length || fecha.toMillis() <= Date.now())) throw Error('Selecciona al menos un docente y una fecha de cierre futura.');
        const ref = doc(db,'convocatoriasDocentes',eventId);
        await runTransaction(db, async tx => {
          const [current, canonical] = await Promise.all([tx.get(ref), tx.get(doc(db, 'eventos', eventId))]);
          if (!active()) throw Error('La configuración o la muestra cambió. Vuelve a abrir el formulario.');
          if (current.exists() !== Boolean(previous) || timestampMillis(current.data()?.updatedAt) !== timestampMillis(previous?.updatedAt)) throw Error('La configuración cambió en otra ventana. Vuelve a abrirla para guardar.');
          if (!canonical.exists() || abierta && ['Realizado','No realizado','Archivado'].includes(canonical.data().estado)) throw Error('Este evento ya está cerrado o no está disponible.');
          const latestEvent = canonical.data();
          const marked = Array.isArray(current.data()?.fichasPrivadasPreparadas) ? current.data().fichasPrivadasPreparadas.filter(id => docentes[id]) : [];
          tx.set(ref,{...current.data(),eventoId:eventId,titulo:latestEvent.titulo || 'Muestra',fechaInicio:latestEvent.fechaInicio || '',lugar:latestEvent.lugar || '',abierta,cierreAt:fecha,docentes,fichasPrivadasPreparadas:marked,updatedAt:serverTimestamp(),updatedBy:user().email});
        });
        const saved = await getDocFromServer(ref);
        const stored = saved.data();
        if (!saved.exists() || stored.abierta !== abierta || timestampMillis(stored.cierreAt) !== fecha.toMillis() || Object.keys(stored.docentes || {}).length !== Object.keys(docentes).length || Object.entries(docentes).some(([id,name]) => stored.docentes?.[id] !== name)) throw Error('No pude confirmar todos los docentes guardados. Vuelve a abrir la configuración.');
        if (!active()) return;
        if (closedEvent || !Object.keys(docentes).length) { result.textContent = 'Configuración guardada y verificada.'; toast(result.textContent); modal.close(); return; }
        preparing = true; render();
        const prepared = await prepareMany(Object.keys(docentes), { ...context, active }, (index, total) => { if (active()) result.textContent = `Configuración guardada. Preparando ficha ${index} de ${total}…`; });
        if (!active()) return;
        prepareMessage = preparationSummary(prepared.results, prepared.failures);
        result.textContent = 'Configuración guardada y verificada. ' + prepareMessage; toast(result.textContent);
        if (!prepared.failures.length) modal.close();
      } catch(error) { if (active()) result.textContent = error.message; } finally { if (context.active()) { preparing = false; render(); } if (button.isConnected) button.disabled = false; }
    };
  }
  async function reopen(token) {
    const deadline = dateLocal(Date.now()+48*3600000);
    setModal(`<h3>Reabrir ficha / solicitar ajustes</h3><label>Permitir correcciones hasta (Bogotá)<input type="datetime-local" name="hasta" value="${deadline}" required /></label><label>Indicaciones para el docente<textarea name="comentario" required maxlength="5000"></textarea></label><p id="reopenResult" role="status"></p>`, 'Reabrir ficha');
    modalForm.onsubmit = async e => { e.preventDefault(); const out=modalForm.querySelector('#reopenResult'); const button=modalForm.querySelector('[type="submit"]'); button.disabled=true;
      try { const fd=new FormData(modalForm); const until=dateValue(fd.get('hasta')); if(until.toMillis()<=Date.now())throw Error('Elige una fecha futura.'); const ref=doc(db,'fichasDocentes',token); await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists()||snap.data().revocada)throw Error('Esta ficha ya no está disponible.');tx.update(ref,{estado:'Requiere ajustes',reabiertaHasta:until,comentarioCoordinacion:String(fd.get('comentario')).trim(),revision:snap.data().revision+1,updatedAt:serverTimestamp()});}); await getDocFromServer(ref);toast('Ficha reabierta y correcciones guardadas.');await review(token); } catch(error){out.textContent=error.message;}finally{button.disabled=false;}
    };
  }
  async function recover(token) {
    if (!confirm('¿Generar un enlace privado nuevo? El anterior dejará de permitir consultar o editar esta ficha.')) return;
    try {
      const old=await loadFicha(token); const newToken=randomToken(); const oldRef=doc(db,'fichasDocentes',token);const newRef=doc(db,'fichasDocentes',newToken);const reserve=doc(db,'convocatoriasDocentes',old.ficha.eventoId,'reservas',old.ficha.docenteId);
      await runTransaction(db,async tx=>{ const [current,booking,...items]=await Promise.all([tx.get(oldRef),tx.get(reserve),...old.presentaciones.map(p=>tx.get(doc(oldRef,'presentaciones',p.id)))]);if(!current.exists()||current.data().revocada||current.data().revision!==old.ficha.revision||booking.data()?.fichaToken!==token)throw Error('La ficha cambió. Recarga antes de recuperar el enlace.');tx.set(newRef,{...current.data(),revocada:false,updatedAt:serverTimestamp()});items.forEach((snap,i)=>{if(!snap.exists())throw Error('Una presentación cambió. Recarga la ficha.');tx.set(doc(newRef,'presentaciones',old.presentaciones[i].id),snap.data());});tx.update(oldRef,{revocada:true,updatedAt:serverTimestamp()});tx.update(reserve,{fichaToken:newToken});});
      await loadFicha(newToken); await copy(fichaUrl(newToken)); toast('Nuevo enlace generado. El anterior quedó revocado.');await review(newToken);
    } catch(e){toast(e.message);}
  }
  async function review(token) {
    const eventId=event.id;
    setModal('<h3>Ficha docente</h3><p>Cargando respuestas guardadas…</p>',null);
    try {
      const loaded=await loadFicha(token); if(event?.id!==eventId||loaded.ficha.eventoId!==eventId)return;const f=loaded.ficha;
      const existing=(await getDocsFromServer(collection(db,'eventos',eventId,'muestras'))).docs.map(d=>({id:d.id,...d.data()}));
      const anteriores=inscripcionesAnteriores(f,loaded.presentaciones,existing);
      const cambioListado=anteriores.length ? `<aside class="teacher-duplicate-warning"><p>Estas inscripciones confirmadas ya no coinciden con la ficha: ${anteriores.map(r=>esc(r.estudianteGrupo)).join(', ')}. Puedes ajustarlas o eliminarlas desde Participantes antes de confirmar.</p><label class="check-card"><input type="checkbox" data-keep-previous />Conservar estas inscripciones anteriores en el evento</label></aside>` : '';
      const details=loaded.presentaciones.map((p,index)=>{
        const matches=coincidenciasPresentacion(p,existing);
        const previousLink=f.confirmaciones?.[p.id];
        const preloadedIds=[...new Set((Array.isArray(f.estudiantesPrecargados) ? f.estudiantesPrecargados : []).filter(source=>p.inscripcionId?source.inscripcionId===p.inscripcionId:preloadMatchesPresentation(source,p)).map(source=>source.inscripcionId).filter(id=>matches.some(match=>match.exacta&&match.row.id===id&&normalizarNombre(match.row.docente)===normalizarNombre(f.docenteNombre))))];
        const linked=matches.some(match=>match.exacta&&match.row.id===previousLink) ? previousLink : preloadedIds.length===1 ? preloadedIds[0] : '';
        const repetitions=propuestasRepetidas(p,loaded.presentaciones.slice(0,index));
        const linkedRow=matches.find(m=>m.row.id===linked)?.row || matches.find(m=>m.exacta)?.row;
        const eventArea=event.sistemaAnual?.areaArtisticaId || event.areaArtisticaId;
        const eventModality=event.sistemaAnual?.modalidadIds?.length===1 ? event.sistemaAnual.modalidadIds[0] : event.modalidadPresentacionId || event.familiaInstrumentalId || '';
        const defaultModality=linkedRow?.modalidadPresentacionId || linkedRow?.familiaInstrumentalId || (eventArea===p.areaArtisticaId ? eventModality : '');
        const modality=annual.modalityField({areaArtisticaId:p.areaArtisticaId,modalidadPresentacionId:defaultModality},p.areaArtisticaId).replace('name="modalidadPresentacionId"', `data-modality="${p.id}"`);
        return `<article class="teacher-review-card"><h4>${esc(p.estudianteGrupo || 'Sin nombre')} · ${esc(p.tipo)}</h4>${p.integrantesTexto ? `<p>${esc(p.integrantesTexto).replace(/\n/g,'<br>')}</p>` : ''}<p><strong>Actividad / repertorio:</strong> ${esc(p.repertorio)}</p><p>${esc(p.areaArtisticaId)} · ${p.areaArtisticaId === 'artes-plasticas' ? `${p.cantidadObras} obra(s)` : `${p.duracionMin} min`} · ${esc(p.instrumento)}</p><p><strong>Recursos:</strong> ${esc(p.recursos || 'Sin especificar')}</p>${p.obrasJson?`<p><strong>Minutos por obra:</strong> ${teacherWorks(p).filter(w=>w.obra).map(w=>`${esc(w.obra)}: ${w.minutos??"por definir"} min${w.compartida?" (ensamble)":""}`).join(" · ")}</p>`:""}${linkedRow?`<details><summary>Comparar con la inscripción actual</summary><p>Actual: ${esc(linkedRow.repertorio||"Sin repertorio")} · ${esc(linkedRow.duracionMin??"Por definir")} min</p><p>Propuesta: ${esc(p.repertorio)} · ${esc(p.duracionMin)} min</p><p>Recursos actuales: ${esc(linkedRow.recursos||"Sin recursos")}</p><p>Los datos vacíos se completan. Para reemplazar información existente, marca la opción de actualización.</p></details>`:""}${p.materialUrl && /^https?:\/\//i.test(p.materialUrl) ? `<p><a href="${esc(p.materialUrl)}" target="_blank" rel="noopener noreferrer">Abrir material</a></p>` : ''}${Object.entries(camposInstruccion).filter(([k])=>p[k]).map(([k,label])=>`<p><strong>${label}:</strong> ${esc(p[k]).replace(/\n/g,'<br>')}</p>`).join('')}${f.estado !== 'Confirmado' ? `${modality}<label>Incorporar al evento<select data-target="${p.id}"><option value="">${matches.length ? 'Crear una presentación adicional (revisar coincidencias)' : 'Crear inscripción de esta presentación'}</option>${matches.filter(m=>m.exacta).map(m=>`<option value="${esc(m.row.id)}" ${linked===m.row.id?'selected':''}>Vincular a ${esc(m.row.estudianteGrupo)} · ${esc(m.row.repertorio || 'Sin repertorio')}</option>`).join('')}</select></label><label class="check-card"><input type="checkbox" data-update-presentation="${p.id}" />Actualizar repertorio, duración y recursos de la inscripción vinculada con esta propuesta</label>${matches.length || repetitions.length ? `<p class="teacher-duplicate-warning">Hay estudiantes presentes en otras inscripciones o propuestas: ${[...matches.map(m=>esc(m.row.estudianteGrupo)),...repetitions.map(r=>esc(r.estudianteGrupo))].join(', ')}. Vincula la ficha a una inscripción existente o confirma expresamente otra presentación.</p><label class="check-card"><input type="checkbox" data-additional="${p.id}" />Confirmo que corresponde a una presentación adicional</label>` : ''}` : ''}</article>`;
      }).join('');
      setModal(`<h3>Ficha de ${esc(f.docenteNombre)}</h3><p>${esc(f.estado)} · Asistirá: ${esc(f.asistencia)}</p><p><strong>Apoyo:</strong> ${esc(f.apoyo)}</p><p><strong>Indicaciones generales:</strong> ${esc(f.indicacionesGenerales).replace(/\n/g,'<br>')}</p>${f.comentarioCoordinacion ? `<p><strong>Correcciones solicitadas:</strong> ${esc(f.comentarioCoordinacion)}</p>` : ''}<div class="actions"><a class="btn btn-light" href="${esc(fichaUrl(token))}" target="_blank" rel="noopener noreferrer">Ver / imprimir ficha</a><button type="button" class="btn btn-light" data-reopen>Reabrir / pedir ajustes</button><button type="button" class="btn btn-light" data-recover>Recuperar enlace privado</button></div>${f.estado !== 'Confirmado' ? cambioListado : ''}${details || '<p>Esta ficha todavía no tiene presentaciones.</p>'}<p id="reviewResult" role="status"></p>`,f.estado==='Confirmado' ? null : 'Confirmar e incorporar al evento');
      modalForm.querySelector('[data-reopen]').onclick=()=>reopen(token);modalForm.querySelector('[data-recover]').onclick=()=>recover(token);
      modalForm.onsubmit=async e=>{e.preventDefault();const out=modalForm.querySelector('#reviewResult');const button=modalForm.querySelector('[type="submit"]');button.disabled=true;out.textContent='Revisando coincidencias y guardando…';try{await confirmFicha(loaded,existing);out.textContent='Ficha confirmada e inscripciones verificadas.';toast(out.textContent);await review(token);}catch(error){out.textContent=error.message;}finally{button.disabled=false;}};
    } catch(e){setModal(`<h3>No pude cargar la ficha</h3><p role="alert">${esc(e.message)}</p>`,null);}
  }
  async function confirmFicha(loaded, existing) {
    const {token,ficha,presentaciones}=loaded;const errors=validarFichaParaConfirmar(ficha,presentaciones);if(errors.length)throw Error(errors.join(' '));
    const choices=presentaciones.map(p=>({p,target:modalForm.querySelector(`[data-target="${p.id}"]`)?.value || '',additional:Boolean(modalForm.querySelector(`[data-additional="${p.id}"]`)?.checked),updatePresentation:Boolean(modalForm.querySelector(`[data-update-presentation="${p.id}"]`)?.checked),modality:modalForm.querySelector(`[data-modality="${p.id}"]`)?.value || ''}));
    const targets=choices.filter(c=>c.target).map(c=>c.target);if(new Set(targets).size!==targets.length)throw Error('Dos propuestas no pueden vincularse a la misma inscripción. Revisa la selección.');
    const keepPrevious=Boolean(modalForm.querySelector('[data-keep-previous]')?.checked);
    if(inscripcionesAnteriores(ficha,presentaciones,existing).length&&!keepPrevious)throw Error('Revisa las inscripciones anteriores y confirma si deben conservarse.');
    for(const [index,c] of choices.entries()){if(!c.target&&(coincidenciasPresentacion(c.p,existing).length||propuestasRepetidas(c.p,presentaciones.slice(0,index)).length)&&!c.additional)throw Error(`Revisa la coincidencia de ${c.p.estudianteGrupo} y elige vincular o confirmar una presentación adicional.`);}
    const fichaRef=doc(db,'fichasDocentes',token);const collectionRef=collection(db,'eventos',ficha.eventoId,'muestras');
    const claimKeys=[...new Set(presentaciones.flatMap(nombresPresentacion).map(normalizarNombre))];
    const claimRefs=await Promise.all(claimKeys.map(async key=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));const id=[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');return doc(db,'eventos',ficha.eventoId,'inscripcionesDocentes',id);}));
    const confirmed=await runTransaction(db,async tx=>{
      const [current,ev,reservation,...docs]=await Promise.all([tx.get(fichaRef),tx.get(doc(db,'eventos',ficha.eventoId)),tx.get(doc(db,'convocatoriasDocentes',ficha.eventoId,'reservas',ficha.docenteId)),...presentaciones.map(p=>tx.get(doc(fichaRef,'presentaciones',p.id))),...existing.map(r=>tx.get(doc(collectionRef,r.id))),...choices.filter(c=>!c.target).map(c=>tx.get(doc(collectionRef,nuevasInscripcionesId(token,ficha.revision,c.p.id)))),...claimRefs.map(ref=>tx.get(ref))]);
      if(!current.exists()||current.data().revocada||current.data().revision!==ficha.revision||reservation.data()?.fichaToken!==token)throw Error('La ficha cambió. Vuelve a abrirla antes de confirmar.');
      if(!ev.exists()||['Realizado','No realizado','Archivado'].includes(ev.data().estado))throw Error('Este evento está cerrado.');
      if(inscripcionesAnteriores(current.data(),presentaciones,existing).length&&!keepPrevious)throw Error('Revisa las inscripciones anteriores.');
      const currentRows=docs.slice(presentaciones.length,presentaciones.length+existing.length).filter(d=>d.exists()).map(d=>({id:d.id,...d.data()}));
      const newCount=choices.filter(c=>!c.target).length;
      const newRows=docs.slice(presentaciones.length+existing.length,presentaciones.length+existing.length+newCount);
      const claimDocs=docs.slice(presentaciones.length+existing.length+newCount);
      const referencedIds=[...new Set(claimDocs.flatMap(s=>s.data()?.muestraIds || []))];
      const referencedRows=await Promise.all(referencedIds.map(id=>tx.get(doc(collectionRef,id))));
      const activeClaimIds=new Set(referencedRows.filter(s=>s.exists()).map(s=>s.id));
      const claims=claimDocs.map(s=>new Set((s.data()?.muestraIds || []).filter(id=>activeClaimIds.has(id))));
      let newIndex=0;const mapping={};
      choices.forEach((c,i)=>{
        if(!docs[i].exists()||docs[i].data().revision!==ficha.revision)throw Error('Las presentaciones cambiaron. Reabre la ficha.');
        const id=c.target || nuevasInscripcionesId(token,ficha.revision,c.p.id);const ref=doc(collectionRef,id);
        const keys=nombresPresentacion(c.p).map(normalizarNombre);
        if(c.target){const target=currentRows.find(r=>r.id===c.target);if(!target||!coincidenciasPresentacion(c.p,[target]).some(m=>m.exacta))throw Error('La inscripción a vincular cambió. Revisa de nuevo.');const instructions=instruccionesDocentes(ficha,c.p);const proposed=muestraDesdeFicha(ficha,c.p,students());proposed.modalidadPresentacionId=c.modality;annual.normalizeParticipant(proposed);const presentationChanges={};for(const field of ['areaArtisticaId','areaArtisticaNombre','area','modalidadPresentacionId','modalidadPresentacionNombre','instrumento','docente','repertorio','repertorios','duracionMin','recursos','recursosSeleccionados','nombrePresentacion','tituloObra','cantidadObras','familiaInstrumentalId','familiaInstrumentalNombre']){if(proposed[field]===undefined)continue;const empty=target[field]==null||target[field]===''||(Array.isArray(target[field])&&!target[field].length)||(field==='duracionMin'&&Number(target[field])===0);if(c.updatePresentation||empty)presentationChanges[field]=proposed[field];}tx.update(ref,{...presentationChanges,...teacherWorkChanges(target,proposed,c.updatePresentation,currentRows,ficha.eventoId),...(!target.fichaDocente||normalizarNombre(target.fichaDocente.docente)===normalizarNombre(ficha.docenteNombre)?{fichaDocente:instructions}:{}),[`fichasDocentes.${ficha.docenteId}`]:instructions,updatedAt:serverTimestamp(),updatedBy:user().email});}
        else{const duplicate=coincidenciasPresentacion(c.p,currentRows);const competing=keys.some(k=>claims[claimKeys.indexOf(k)].size);if((duplicate.length||competing)&&!c.additional)throw Error('Apareció otra inscripción coincidente. Recarga y revisa antes de confirmar.');const previous=newRows[newIndex++];if(previous.exists())throw Error('Esta propuesta ya tiene una inscripción. Vincula el registro existente.');const payload=muestraDesdeFicha(ficha,c.p,students());payload.modalidadPresentacionId=c.modality;annual.normalizeParticipant(payload);tx.set(ref,{...payload,fichasDocentes:{[ficha.docenteId]:payload.fichaDocente},createdAt:serverTimestamp(),createdByEmail:user().email,createdByName:user().displayName || user().email,updatedAt:serverTimestamp(),updatedBy:user().email});}
        keys.forEach(k=>claims[claimKeys.indexOf(k)].add(id));
        mapping[c.p.id]=id;
      });
      claimRefs.forEach((ref,i)=>tx.set(ref,{muestraIds:[...claims[i]],updatedAt:serverTimestamp()}));
      tx.update(fichaRef,{estado:'Confirmado',confirmaciones:mapping,confirmadaAt:serverTimestamp(),confirmadaBy:user().email,reabiertaHasta:null,revision:ficha.revision+1,updatedAt:serverTimestamp()});
      return mapping;
    });
    const saved=await getDocFromServer(fichaRef);if(saved.data()?.estado!=='Confirmado')throw Error('No pude verificar la confirmación.');
    const writes=await Promise.all(Object.values(confirmed).map(id=>getDocFromServer(doc(collectionRef,id))));if(writes.some(s=>!s.exists()))throw Error('No pude verificar todas las inscripciones.');
  }
  return { mount, stop };
}
