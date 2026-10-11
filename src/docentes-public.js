import {
  listConvocatorias, getConvocatoria, loadFicha, saveFicha, fichaUrl,
  canEditFicha, validateFichaInput, PRESENTACION_LIMITES
} from './docentes-data.js';

const app = document.getElementById('docentesApp');
const storageKey = 'musicala.eventos.fichas-docentes.v1';
const state = { convocatorias: [], convocatoria: null, ficha: null, token: null, revision: 0, busy: false, dirty: false, pendingRecovery: false, presentations: [], localLinks: readLocalLinks() };
const areas = [['musica', 'Música'], ['danza', 'Danza'], ['teatro', 'Teatro'], ['artes-plasticas', 'Artes plásticas']];
const blankPresentation = () => ({ tipo: 'Individual', estudianteGrupo: '', integrantesTexto: '', areaArtisticaId: 'musica', instrumento: '', repertorio: '', duracionMin: '', cantidadObras: 1, recursos: '', materialUrl: '', preparacion: '', entrada: '', inicio: '', acompanamiento: '', cierre: '', observaciones: '' });
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const option = (value, label, selected) => `<option value="${esc(value)}"${String(selected) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
const timestampDate = value => value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-05:00`) : value ? new Date(value) : null;
const dateText = value => { const date = timestampDate(value); return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(date) : ''; };
const dateOnly = value => { const date = timestampDate(value); return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' }).format(date) : ''; };
const brand = `<header class="docentes-brand"><a href="./docentes.html" aria-label="Inicio del formato docente"><img src="./logo.png" alt="Musicala" /></a><div><p class="eyebrow">Eventos y muestras de proceso</p><h1>Formato docente</h1></div></header>`;
const footer = `<p class="docentes-footer">Musicala · Inscripciones e indicaciones para que cada presentación tenga lo que necesita.</p>`;

function readLocalLinks() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(data) ? data.filter(item => /^[a-f0-9]{64}$/.test(item?.token) && typeof item.eventoId === 'string' && typeof item.docenteId === 'string').slice(0, 15) : [];
  } catch { return []; }
}

function rememberLink() {
  if (!state.token || !state.ficha) return;
  const item = { token: state.token, eventoId: state.ficha.eventoId, docenteId: state.ficha.docenteId, docenteNombre: state.ficha.docenteNombre, titulo: state.convocatoria?.titulo || 'Muestra', savedAt: Date.now() };
  state.localLinks = [item, ...state.localLinks.filter(link => link.token !== item.token)].slice(0, 15);
  try { localStorage.setItem(storageKey, JSON.stringify(state.localLinks)); } catch { /* El enlace sigue disponible para copiar o descargar. */ }
}

function windowOpen(convocatoria) {
  return canEditFicha(null, convocatoria);
}

function errorText(error) {
  const messages = {
    'docente/duplicada': 'No se pudo crear la ficha: puede existir una anterior o la muestra puede estar cerrada. Usa tu enlace privado o consulta con coordinación.',
    'docente/conflicto': 'Esta ficha cambió desde que la abriste, posiblemente en otra pestaña o por coordinación. Tus cambios siguen aquí. Copia lo que necesites antes de cargar la versión guardada.',
    'docente/cerrada': 'El plazo para editar esta ficha terminó o coordinación cerró las inscripciones. Tus cambios siguen en el formulario, pero no se guardaron. Coordinación puede reabrirla.',
    'docente/confirmada': 'Coordinación ya confirmó esta ficha. Para corregirla, solicita que la reabran.',
    'docente/no-encontrada': 'No encontramos una ficha con este enlace. Revisa que hayas copiado el enlace completo o contacta a coordinación.',
    'docente/revocada': 'Este enlace dejó de estar habilitado. Solicita a coordinación el enlace vigente.',
    'docente/enlace-invalido': 'El enlace no está completo o no es válido. Abre el enlace privado que recibiste al guardar.',
    'permission-denied': 'No se pudo acceder a la ficha. El plazo o los permisos pueden haber cambiado. Contacta a coordinación si el problema continúa.',
    'unavailable': 'No hay conexión con el servidor. Tus cambios siguen aquí. Revisa tu conexión y vuelve a guardar.'
  };
  if (messages[error?.code]) return messages[error.code];
  if (error?.code === 'docente/validacion') return error.message || 'Revisa los datos del formulario antes de guardarlo.';
  return 'No se pudo completar la operación. Revisa tu conexión y vuelve a intentar. Si el problema continúa, contacta a coordinación.';
}

function setStatus(text, tone = '') {
  const element = document.getElementById('saveStatus');
  if (element) { element.textContent = text; element.dataset.tone = tone; }
}

function teacherEntries(convocatoria) {
  return Object.entries(convocatoria?.docentes || {}).filter(([, name]) => typeof name === 'string' && name.trim()).sort((a, b) => a[1].localeCompare(b[1], 'es'));
}

function renderStart(notice = '') {
  const openEvents = state.convocatorias.filter(windowOpen);
  state.ficha = null;
  state.token = null;
  state.convocatoria = null;
  state.dirty = false;
  state.pendingRecovery = false;
  app.innerHTML = `${brand}<section class="docentes-card docentes-start"><h2>Prepara tu participación en la muestra</h2><p class="docentes-lead">Elige tu nombre y una muestra abierta. Puedes guardar por partes, inscribir estudiantes y dejar las indicaciones para realizar sus presentaciones, incluso si no estarás presente.</p><p class="docentes-note">Al guardar recibirás un <strong>enlace privado para volver a tu ficha</strong>. Consérvalo: con él podrás continuar desde otro dispositivo.</p>${notice ? `<p class="docentes-note" data-tone="warning">${esc(notice)}</p>` : ''}${openEvents.length ? `<form id="startForm"><div class="docentes-grid"><label>Muestra<select id="eventChoice" required><option value="">Selecciona una muestra</option>${openEvents.map(event => option(event.id || event.eventoId, event.titulo, '')).join('')}</select></label><label>Tu nombre<select id="teacherChoice" required disabled><option value="">Primero selecciona una muestra</option></select></label></div><p id="eventInfo" class="docentes-help" aria-live="polite"></p><div class="docentes-actions"><button class="btn btn-primary" type="submit">Abrir mi formato</button></div></form>` : `<div class="docentes-note" data-tone="warning"><p>En este momento no hay muestras abiertas para nuevas inscripciones.</p><p>Si ya guardaste una ficha, puedes consultarla con tu enlace privado. Coordinación define cuándo se abre y se cierra cada muestra.</p></div>`}</section>${renderLocalLinks()}${footer}`;
  document.getElementById('eventChoice')?.addEventListener('change', event => {
    const convocatoria = state.convocatorias.find(item => (item.id || item.eventoId) === event.target.value);
    const teachers = teacherEntries(convocatoria);
    const select = document.getElementById('teacherChoice');
    select.disabled = !teachers.length;
    select.innerHTML = teachers.length ? `<option value="">Selecciona tu nombre</option>${teachers.map(([id, name]) => option(id, name, '')).join('')}` : `<option value="">${convocatoria ? 'Tu nombre aún no está habilitado' : 'Primero selecciona una muestra'}</option>`;
    const info = document.getElementById('eventInfo');
    info.textContent = convocatoria ? [dateOnly(convocatoria.fechaInicio), convocatoria.lugar, convocatoria.cierreAt ? `Puedes guardar hasta ${dateText(convocatoria.cierreAt)} (hora de Bogotá).` : 'Coordinación avisará el cierre de inscripciones.'].filter(Boolean).join(' · ') : '';
  });
  document.getElementById('startForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const eventId = document.getElementById('eventChoice').value;
    const docenteId = document.getElementById('teacherChoice').value;
    const convocatoria = state.convocatorias.find(item => (item.id || item.eventoId) === eventId);
    if (!convocatoria || !docenteId || !windowOpen(convocatoria)) return;
    const local = state.localLinks.find(item => item.eventoId === eventId && item.docenteId === docenteId);
    if (local) { navigateToToken(local.token); return; }
    state.convocatoria = convocatoria;
    state.ficha = { eventoId: eventId, docenteId, docenteNombre: convocatoria.docentes[docenteId], asistencia: 'Por confirmar', disponibilidad: '', apoyo: '', indicacionesGenerales: '', estado: 'Borrador', revision: 0 };
    state.presentations = [blankPresentation()];
    renderForm();
  });
  bindLocalLinks();
  const requestedEvent = new URLSearchParams(location.search).get('evento');
  const eventChoice = document.getElementById('eventChoice');
  if (eventChoice && openEvents.some(item => (item.id || item.eventoId) === requestedEvent)) {
    eventChoice.value = requestedEvent;
    eventChoice.dispatchEvent(new Event('change'));
  }
}

function renderLocalLinks() {
  if (!state.localLinks.length) return '';
  return `<section class="docentes-card docentes-no-print"><h2>Tus fichas en este navegador</h2><p class="docentes-help">Este dispositivo recuerda los enlaces que abriste o guardaste aquí. Para continuar en otro dispositivo, conserva tu enlace privado.</p><div class="docentes-local-list">${state.localLinks.map(item => `<div class="docentes-local-item"><div><strong>${esc(item.titulo)}</strong><span>${esc(item.docenteNombre)}</span></div><a class="btn btn-light" href="${esc(fichaUrl(item.token))}" data-local-token="${esc(item.token)}">Abrir ficha</a></div>`).join('')}</div><div class="docentes-actions"><button type="button" class="btn btn-ghost" id="forgetLinks">Olvidar enlaces de este navegador</button></div></section>`;
}

function bindLocalLinks() {
  app.querySelectorAll('[data-local-token]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); navigateToToken(link.dataset.localToken); }));
  document.getElementById('forgetLinks')?.addEventListener('click', () => {
    if (!confirm('Se quitarán los enlaces recordados en este navegador. Conserva una copia de tus enlaces privados antes de continuar. Las fichas guardadas seguirán existiendo.')) return;
    state.localLinks = [];
    try { localStorage.removeItem(storageKey); } catch { /* Sin almacenamiento local. */ }
    renderStart();
  });
}

function field(label, name, value, { textarea = false, type = 'text', placeholder = '', help = '', max = 2000, wide = false, attrs = '' } = {}) {
  max = Math.min(max, PRESENTACION_LIMITES[name] ?? max);
  return `<label${wide ? ' class="docentes-wide"' : ''}>${esc(label)}${textarea ? `<textarea name="${esc(name)}" maxlength="${max}" placeholder="${esc(placeholder)}" ${attrs}>${esc(value)}</textarea>` : `<input name="${esc(name)}" type="${type}" value="${esc(value)}" maxlength="${max}" placeholder="${esc(placeholder)}" ${attrs} />`}${help ? `<small>${esc(help)}</small>` : ''}</label>`;
}

function presentationHtml(data, index) {
  return `<details class="docentes-presentation" data-presentation="${index}" open><summary>${index + 1}. <span data-presentation-title>${esc(data.estudianteGrupo || 'Nueva presentación')}</span></summary><div class="docentes-presentation-body"><div class="docentes-grid"><label>Tipo de presentación<select name="tipo">${['Individual', 'Ensamble'].map(value => option(value, value, data.tipo)).join('')}</select></label>${field('Estudiante o nombre del ensamble', 'estudianteGrupo', data.estudianteGrupo, { max: 240, placeholder: 'Nombre completo o nombre del grupo' })}<label class="docentes-wide${data.tipo === 'Ensamble' ? '' : ' hidden'}" data-members-label>Integrantes del ensamble<textarea name="integrantesTexto" maxlength="3000" placeholder="Un nombre completo por línea">${esc(data.integrantesTexto)}</textarea><small>Incluye al menos dos integrantes. Escribe cada nombre en una línea distinta.</small></label><label>Área artística<select name="areaArtisticaId">${areas.map(([id, label]) => option(id, label, data.areaArtisticaId)).join('')}</select></label>${field('Instrumento o disciplina', 'instrumento', data.instrumento, { max: 240, placeholder: 'Piano, violín, ballet, teatro…' })}${field('Obra, repertorio o actividad', 'repertorio', data.repertorio, { textarea: true, max: 2000, placeholder: 'Incluye todas las obras, su orden y la versión que se presentará.' })}${field('Duración estimada en minutos', 'duracionMin', data.duracionMin, { type: 'number', attrs: 'min="0" max="120" step="0.5"', help: 'Máximo 120 minutos. En artes plásticas es opcional; en las otras áreas debe ser mayor que cero al enviar.' })}<label class="${data.areaArtisticaId === 'artes-plasticas' ? '' : 'hidden'}" data-artwork-label>Cantidad de obras a exhibir<input name="cantidadObras" type="number" min="1" max="20" step="1" value="${esc(data.cantidadObras || 1)}" /><small>Entre 1 y 20 obras de este estudiante o grupo.</small></label>${field('Recursos que necesita', 'recursos', data.recursos, { textarea: true, placeholder: 'Instrumentos, micrófonos, sillas, atriles, utilería, espacio…' })}${field('Enlace a pista, partitura o referencia', 'materialUrl', data.materialUrl, { type: 'url', max: 2000, placeholder: 'https://…', help: 'Asegúrate de que coordinación pueda abrirlo.' })}</div><h3>Cómo realizar esta presentación</h3><p class="docentes-help">Deja instrucciones que otra persona pueda seguir. Si no asistirás, la preparación y la señal de inicio son obligatorias al enviar.</p><div class="docentes-grid">${field('Preparación antes de salir', 'preparacion', data.preparacion, { textarea: true, placeholder: 'Qué revisar, cómo afinar, material listo, prueba de sonido…' })}${field('Entrada y ubicación en escena', 'entrada', data.entrada, { textarea: true, placeholder: 'Por dónde entra, dónde se ubica y quién ayuda.' })}${field('Señal de inicio', 'inicio', data.inicio, { textarea: true, placeholder: 'Ej.: iniciar la pista en el segundo 12 y dar cuatro tiempos.' })}${field('Acompañamiento durante la presentación', 'acompanamiento', data.acompanamiento, { textarea: true, placeholder: 'Quién acompaña y qué debe hacer si el estudiante se detiene.' })}${field('Cierre y salida', 'cierre', data.cierre, { textarea: true, placeholder: 'Cómo termina, saludo y retiro del material.' })}${field('Otras cosas a tener en cuenta', 'observaciones', data.observaciones, { textarea: true, placeholder: 'Necesidades de apoyo, detalles de montaje o indicaciones adicionales.' })}</div><button type="button" class="btn btn-ghost docentes-remove docentes-no-print" data-remove-presentation="${index}">Quitar esta presentación</button></div></details>`;
}

function readonlyReason() {
  if (state.ficha?.revocada) return 'Este enlace dejó de estar habilitado. Contacta a coordinación.';
  if (state.ficha?.estado === 'Confirmado') return 'Coordinación confirmó esta ficha. Puedes consultarla e imprimirla. Para corregirla, solicita a coordinación que la reabra.';
  return 'Las inscripciones están cerradas para esta ficha. Puedes consultarla e imprimirla. Coordinación puede reabrirla si necesitas corregir algo.';
}

function renderForm(savedMessage = '') {
  const ficha = state.ficha;
  const convocatoria = state.convocatoria;
  const editable = canEditFicha(ficha, convocatoria);
  const reopenDate = timestampDate(ficha.reabiertaHasta);
  const activeReopen = reopenDate && reopenDate.getTime() > Date.now();
  const deadline = activeReopen ? ficha.reabiertaHasta : convocatoria.cierreAt;
  app.innerHTML = `${brand}<section class="docentes-card"><div class="docentes-event-summary"><div><h2>${esc(convocatoria.titulo)}</h2><p class="docentes-event-meta">${esc([dateOnly(convocatoria.fechaInicio), convocatoria.lugar].filter(Boolean).join(' · '))}</p><p><strong>Docente:</strong> ${esc(ficha.docenteNombre)}</p></div><span class="docentes-badge">${esc(ficha.estado || 'Borrador')}</span></div><p class="docentes-help">${deadline ? `${editable ? activeReopen ? 'Ficha reabierta' : 'Inscripciones abiertas' : 'Plazo de inscripción'} hasta ${esc(dateText(deadline))} (hora de Bogotá).` : 'Coordinación define el cierre de inscripciones.'}</p><div id="windowNotice"${editable ? ' class="hidden"' : ' class="docentes-note" data-tone="warning"'}>${editable ? '' : esc(readonlyReason())}</div>${ficha.comentarioCoordinacion ? `<div class="docentes-note" data-tone="warning"><p><strong>Comentario de coordinación</strong></p><p>${esc(ficha.comentarioCoordinacion).replace(/\n/g, '<br>')}</p></div>` : ''}<div class="docentes-actions docentes-no-print"><button type="button" id="newFormBtn" class="btn btn-light">Ver otras muestras</button><button type="button" id="printFichaBtn" class="btn btn-light">Imprimir ficha / PDF</button></div><p class="docentes-print-only"><strong>Estado:</strong> ${esc(ficha.estado)}${ficha.updatedAt ? ` · Guardada: ${esc(dateText(ficha.updatedAt))}` : ''}</p></section>${state.token ? renderPrivateLink() : ''}<form id="teacherForm" novalidate><fieldset id="editableFields"><section class="docentes-card"><h2>1. Tu presencia y apoyo</h2><div class="docentes-grid"><label>¿Estarás presente en la muestra?<select name="asistencia">${['Por confirmar', 'Sí', 'No'].map(value => option(value, value, ficha.asistencia)).join('')}</select></label>${field('Disponibilidad y horario', 'disponibilidad', ficha.disponibilidad, { max: 1000, placeholder: 'Ej.: puedo acompañar de 3:00 a 5:00 p. m.' })}${field('Apoyo que se necesita si no estás', 'apoyo', ficha.apoyo, { textarea: true, placeholder: 'Quién puede acompañar y qué ayuda necesita el grupo.' })}${field('Indicaciones generales de tu grupo', 'indicacionesGenerales', ficha.indicacionesGenerales, { textarea: true, max: 4000, placeholder: 'Organización, llegada, vestuario o algo común a todas las presentaciones.' })}</div></section><section class="docentes-card"><div class="docentes-section-title"><h2>2. Estudiantes y presentaciones</h2><button type="button" id="addPresentationBtn" class="btn btn-light docentes-no-print">+ Agregar presentación</button></div><p class="docentes-help">Una presentación por estudiante o ensamble. Puedes proponer hasta 20. Coordinación revisará las inscripciones y los posibles duplicados antes de confirmarlas.</p><div id="presentationsList">${state.presentations.map(presentationHtml).join('')}</div><p id="presentationCount" class="docentes-help">${state.presentations.length} de 20 presentaciones</p></section></fieldset><section class="docentes-savebar docentes-no-print" aria-label="Guardar formato"><p id="saveStatus" class="docentes-save-status" role="status" aria-live="polite" data-tone="${savedMessage ? 'success' : ''}">${esc(savedMessage || (editable ? state.token ? 'Ficha cargada desde el servidor. Puedes continuar llenándola.' : 'Aún no guardaste esta ficha. El enlace privado se crea al guardar.' : readonlyReason()))}</p><div id="saveErrorAction" class="hidden docentes-error-action"></div><div class="docentes-actions"><button type="button" id="saveDraftBtn" class="btn btn-light"${editable ? '' : ' disabled'}>Guardar borrador</button><button type="submit" id="submitFichaBtn" class="btn btn-primary"${editable ? '' : ' disabled'}>Enviar a coordinación</button></div><p class="docentes-help">Guardar borrador permite continuar después. Enviar avisa que la ficha está lista para revisar; podrás corregirla mientras el plazo esté abierto y coordinación aún no la haya confirmado.</p></section></form>${footer}`;
  setEditable(editable);
  bindForm();
}

function renderPrivateLink() {
  return `<section class="docentes-card docentes-link-card docentes-no-print"><h2>Conserva tu enlace privado</h2><p>Este enlace permite consultar y editar tu ficha mientras esté habilitada. <strong>Guárdalo y compártelo sólo con quien deba editarla.</strong> Elegir tu nombre nuevamente no recupera el acceso.</p><label>Enlace para volver a esta ficha<input id="privateLink" type="text" readonly value="${esc(fichaUrl(state.token))}" /></label><div class="docentes-actions"><button type="button" id="copyPrivateLink" class="btn btn-primary">Copiar enlace</button><button type="button" id="downloadPrivateLink" class="btn btn-light">Descargar enlace</button></div><p class="docentes-help" id="linkStatus" aria-live="polite">También lo recordamos en este navegador cuando el dispositivo lo permite.</p></section>`;
}

function setEditable(editable) {
  app.querySelectorAll('#editableFields input, #editableFields textarea').forEach(element => { element.readOnly = !editable || state.busy; });
  app.querySelectorAll('#editableFields select, #editableFields button, #saveDraftBtn, #submitFichaBtn').forEach(element => { element.disabled = !editable || state.busy; });
  const addButton = document.getElementById('addPresentationBtn');
  if (addButton) addButton.disabled = !editable || state.busy || state.presentations.length >= 20;
}

function readPresentations() {
  return [...app.querySelectorAll('[data-presentation]')].map(container => {
    const data = {};
    container.querySelectorAll('[name]').forEach(element => { data[element.name] = ['duracionMin', 'cantidadObras'].includes(element.name) ? Number(element.value || (element.name === 'cantidadObras' ? 1 : 0)) : element.value.trim(); });
    if (data.tipo !== 'Ensamble') data.integrantesTexto = '';
    if (data.areaArtisticaId !== 'artes-plasticas') data.cantidadObras = 1;
    return data;
  });
}

function readForm(estado) {
  const form = document.getElementById('teacherForm');
  return { token: state.token || undefined, revision: state.revision, eventoId: state.ficha.eventoId, docenteId: state.ficha.docenteId, docenteNombre: state.ficha.docenteNombre, asistencia: form.elements.asistencia.value, disponibilidad: form.elements.disponibilidad.value.trim(), apoyo: form.elements.apoyo.value.trim(), indicacionesGenerales: form.elements.indicacionesGenerales.value.trim(), estado, presentaciones: readPresentations() };
}

function markDirty() {
  if (state.busy || state.pendingRecovery || !canEditFicha(state.ficha, state.convocatoria)) return;
  state.dirty = true;
  setStatus('Cambios sin guardar. Guarda el borrador para conservarlos.', 'warning');
  const errorAction = document.getElementById('saveErrorAction');
  if (errorAction) errorAction.classList.add('hidden');
}

function bindForm() {
  const form = document.getElementById('teacherForm');
  form.addEventListener('input', event => {
    markDirty();
    if (event.target.name === 'estudianteGrupo') event.target.closest('[data-presentation]').querySelector('[data-presentation-title]').textContent = event.target.value.trim() || 'Nueva presentación';
  });
  form.addEventListener('change', event => {
    markDirty();
    if (event.target.name === 'tipo') event.target.closest('[data-presentation]').querySelector('[data-members-label]').classList.toggle('hidden', event.target.value !== 'Ensamble');
    if (event.target.name === 'areaArtisticaId') event.target.closest('[data-presentation]').querySelector('[data-artwork-label]').classList.toggle('hidden', event.target.value !== 'artes-plasticas');
  });
  form.addEventListener('submit', event => { event.preventDefault(); persist('Enviado'); });
  document.getElementById('saveDraftBtn')?.addEventListener('click', () => persist('Borrador'));
  document.getElementById('addPresentationBtn')?.addEventListener('click', () => {
    if (state.busy || !canEditFicha(state.ficha, state.convocatoria)) return;
    state.presentations = readPresentations();
    if (state.presentations.length >= 20) return;
    state.presentations.push(blankPresentation());
    const list = document.getElementById('presentationsList');
    list.insertAdjacentHTML('beforeend', presentationHtml(state.presentations.at(-1), state.presentations.length - 1));
    document.getElementById('presentationCount').textContent = `${state.presentations.length} de 20 presentaciones`;
    setEditable(true);
    markDirty();
    list.lastElementChild.querySelector('[name="estudianteGrupo"]').focus();
  });
  document.getElementById('presentationsList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-presentation]');
    if (!button || state.busy || !canEditFicha(state.ficha, state.convocatoria)) return;
    if (!confirm('¿Quitar esta presentación del formulario? El cambio se aplicará cuando guardes.')) return;
    const current = readPresentations();
    current.splice(Number(button.dataset.removePresentation), 1);
    state.presentations = current;
    document.getElementById('presentationsList').innerHTML = current.map(presentationHtml).join('');
    document.getElementById('presentationCount').textContent = `${current.length} de 20 presentaciones`;
    setEditable(true);
    markDirty();
  });
  document.getElementById('newFormBtn')?.addEventListener('click', async () => {
    if (state.busy) return;
    if (state.dirty && !confirm('Hay cambios sin guardar. ¿Salir de esta ficha sin guardar esos cambios?')) return;
    state.busy = true;
    document.getElementById('newFormBtn').disabled = true;
    try {
      state.convocatorias = await listConvocatorias();
      state.dirty = false;
      state.busy = false;
      history.replaceState(null, '', location.pathname + location.search);
      renderStart();
    } catch (error) {
      state.busy = false;
      document.getElementById('newFormBtn').disabled = false;
      setStatus(errorText(error), 'error');
    }
  });
  document.getElementById('printFichaBtn')?.addEventListener('click', printFicha);
  document.getElementById('copyPrivateLink')?.addEventListener('click', copyLink);
  document.getElementById('downloadPrivateLink')?.addEventListener('click', downloadLink);
}

async function persist(estado) {
  if (state.busy || state.pendingRecovery || !state.ficha) return;
  if (!canEditFicha(state.ficha, state.convocatoria)) { setStatus(readonlyReason(), 'warning'); setEditable(false); return; }
  const payload = readForm(estado);
  try { validateFichaInput(payload); } catch (error) { setStatus(errorText(error), 'error'); return; }
  state.busy = true;
  setEditable(false);
  document.getElementById('newFormBtn').disabled = true;
  document.getElementById('saveErrorAction').classList.add('hidden');
  setStatus(estado === 'Enviado' ? 'Enviando a coordinación… Espera la confirmación del servidor.' : 'Guardando borrador… Espera la confirmación del servidor.');
  try {
    const saved = await saveFicha(payload);
    state.token = saved.token;
    state.ficha = saved.ficha;
    state.revision = saved.revision ?? saved.ficha.revision;
    state.presentations = saved.presentaciones;
    state.dirty = false;
    state.pendingRecovery = false;
    state.busy = false;
    history.replaceState(null, '', `#ficha=${state.token}`);
    rememberLink();
    renderForm(`${estado === 'Enviado' ? 'Enviado a coordinación' : 'Borrador guardado'} y confirmado por el servidor · ${dateText(saved.ficha.updatedAt || new Date())}.`);
    if (!payload.token) document.getElementById('privateLink')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    state.busy = false;
    state.dirty = true;
    if (/^[a-f0-9]{64}$/.test(error?.tokenCommitted || error?.tokenPossible || '')) {
      handleCommittedError(error);
      return;
    }
    const noEdit = ['docente/cerrada', 'docente/confirmada', 'docente/revocada'].includes(error?.code);
    setEditable(!noEdit && canEditFicha(state.ficha, state.convocatoria));
    document.getElementById('newFormBtn').disabled = false;
    setStatus(errorText(error), 'error');
    const action = document.getElementById('saveErrorAction');
    if (error?.code === 'docente/conflicto' && state.token) {
      action.classList.remove('hidden');
      action.innerHTML = '<button type="button" class="btn btn-light" id="reloadFichaBtn">Cargar versión guardada</button>';
      document.getElementById('reloadFichaBtn').addEventListener('click', () => {
        if (confirm('Se reemplazará lo que ves con la versión guardada. Copia antes los cambios que quieras conservar. ¿Continuar?')) { state.dirty = false; openToken(state.token); }
      });
    }
  }
}

function handleCommittedError(error) {
  const committed = Boolean(error.tokenCommitted);
  state.token = error.tokenCommitted || error.tokenPossible;
  state.pendingRecovery = true;
  history.replaceState(null, '', `#ficha=${state.token}`);
  rememberLink();
  if (!document.getElementById('privateLink')) {
    document.getElementById('teacherForm').insertAdjacentHTML('beforebegin', renderPrivateLink());
    document.getElementById('copyPrivateLink').addEventListener('click', copyLink);
    document.getElementById('downloadPrivateLink').addEventListener('click', downloadLink);
  }
  setEditable(false);
  document.getElementById('newFormBtn').disabled = false;
  setStatus(committed ? 'El servidor recibió el guardado, pero no pudimos confirmar la ficha completa al leerla. Conserva tu enlace privado y comprueba el guardado antes de continuar. Tus datos siguen aquí.' : 'La conexión se interrumpió y aún no sabemos si el servidor recibió el guardado. Conserva este enlace y comprueba el guardado antes de continuar. Tus datos siguen aquí.', 'warning');
  const action = document.getElementById('saveErrorAction');
  action.classList.remove('hidden');
  action.innerHTML = '<button type="button" class="btn btn-primary" id="verifyCommittedBtn">Comprobar guardado</button>';
  document.getElementById('verifyCommittedBtn').addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true;
    document.getElementById('verifyCommittedBtn').disabled = true;
    setStatus('Consultando la ficha guardada en el servidor…');
    try {
      const loaded = await loadFicha(state.token);
      state.ficha = loaded.ficha;
      state.revision = loaded.ficha.revision;
      state.presentations = loaded.presentaciones;
      state.dirty = false;
      state.pendingRecovery = false;
      state.busy = false;
      rememberLink();
      renderForm(`Ficha guardada y confirmada por el servidor · ${dateText(loaded.ficha.updatedAt)}.`);
    } catch (readError) {
      state.busy = false;
      document.getElementById('verifyCommittedBtn').disabled = false;
      setStatus(`Aún falta confirmar la lectura del guardado. ${errorText(readError)}`, 'warning');
    }
  });
}

async function copyLink() {
  const input = document.getElementById('privateLink');
  const status = document.getElementById('linkStatus');
  try { await navigator.clipboard.writeText(input.value); status.textContent = 'Enlace copiado. Guárdalo para volver a tu ficha.'; }
  catch { input.focus(); input.select(); status.textContent = 'Seleccionamos tu enlace. Cópialo con Ctrl + C o mantén presionado para copiar en el celular.'; }
}

function downloadLink() {
  const text = `Musicala · Enlace privado del formato docente\n\nMuestra: ${state.convocatoria.titulo}\nDocente: ${state.ficha.docenteNombre}\n\n${fichaUrl(state.token)}\n\nConserva este enlace para continuar tu ficha. Compártelo sólo con quien deba editarla.\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'Musicala-enlace-privado-ficha-docente.txt';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.getElementById('linkStatus').textContent = 'Enlace preparado para descargar. Conserva el archivo en un lugar donde puedas encontrarlo.';
}

function printFicha() {
  const changedDetails = [...app.querySelectorAll('details:not([open])')];
  changedDetails.forEach(detail => { detail.open = true; });
  const replacements = [];
  if (state.dirty || !state.token || state.pendingRecovery) {
    const unsaved = document.createElement('p');
    unsaved.className = 'docentes-print-only docentes-note';
    unsaved.textContent = 'Copia del formulario: incluye datos cuyo guardado aún no está confirmado por el servidor.';
    document.getElementById('teacherForm').before(unsaved);
    replacements.push([null, unsaved]);
  }
  app.querySelectorAll('#teacherForm input, #teacherForm select, #teacherForm textarea').forEach(element => {
    if (element.closest('.hidden')) return;
    const value = element.tagName === 'SELECT' ? element.options[element.selectedIndex]?.text || '' : element.value;
    const printed = document.createElement('span');
    printed.className = 'docentes-print-only docentes-print-value';
    printed.textContent = value || '—';
    element.classList.add('docentes-no-print');
    element.after(printed);
    replacements.push([element, printed]);
  });
  const cleanup = () => { replacements.forEach(([element, printed]) => { element?.classList.remove('docentes-no-print'); printed.remove(); }); changedDetails.forEach(detail => { detail.open = false; }); };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

function navigateToToken(token) {
  if (state.dirty && !confirm('Hay cambios sin guardar. ¿Abrir otra ficha sin guardar esos cambios?')) return;
  state.dirty = false;
  history.replaceState(null, '', `#ficha=${token}`);
  openToken(token);
}

async function openToken(token) {
  state.busy = true;
  app.innerHTML = `${brand}<section class="docentes-card" aria-live="polite"><p>Cargando tu ficha desde el servidor…</p></section>`;
  try {
    const loaded = await loadFicha(token);
    const convocatoria = await getConvocatoria(loaded.ficha.eventoId);
    if (!convocatoria) throw { code: 'docente/no-encontrada' };
    state.token = token;
    state.ficha = loaded.ficha;
    state.presentations = loaded.presentaciones;
    state.revision = loaded.ficha.revision;
    state.convocatoria = convocatoria;
    state.dirty = false;
    state.pendingRecovery = false;
    state.busy = false;
    rememberLink();
    renderForm();
  } catch (error) {
    state.busy = false;
    app.innerHTML = `${brand}<section class="docentes-card"><h2>No pudimos abrir esta ficha</h2><p class="docentes-note" data-tone="error">${esc(errorText(error))}</p><div class="docentes-actions"><button class="btn btn-primary" id="retryLoadFicha">Volver a intentar</button><a class="btn btn-light" href="./docentes.html">Ver muestras disponibles</a></div></section>${footer}`;
    document.getElementById('retryLoadFicha').addEventListener('click', () => openToken(token));
  }
}

async function initialize() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = hash.get('ficha');
  if (token) { await openToken(token); return; }
  try { state.convocatorias = await listConvocatorias(); renderStart(); }
  catch (error) {
    app.innerHTML = `${brand}<section class="docentes-card"><h2>No pudimos cargar las muestras</h2><p class="docentes-note" data-tone="error">${esc(errorText(error))}</p><div class="docentes-actions"><button id="retryCatalog" class="btn btn-primary">Volver a intentar</button></div></section>${renderLocalLinks()}${footer}`;
    document.getElementById('retryCatalog').addEventListener('click', initialize);
    bindLocalLinks();
  }
}

window.addEventListener('beforeunload', event => { if (state.dirty || state.busy) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('hashchange', () => { const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('ficha'); if (token && token !== state.token && !state.busy) navigateToToken(token); });
setInterval(() => {
  if (!state.ficha || state.busy || !document.getElementById('teacherForm')) return;
  if (!canEditFicha(state.ficha, state.convocatoria)) {
    setEditable(false);
    const notice = document.getElementById('windowNotice');
    notice.className = 'docentes-note';
    notice.dataset.tone = 'warning';
    notice.textContent = readonlyReason();
    if (!state.dirty) setStatus(readonlyReason(), 'warning');
  }
}, 30000);

initialize();
