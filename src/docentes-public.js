import { teacherWorks } from './docentes-obras.js?v=20261017-integracion';
import { TEACHER_RESOURCES } from './docentes-recursos.js?v=20261028-recursos-4';

function resourceFields(value=''){
  const selected=String(value).split(',').map(v=>v.trim()).filter(Boolean);
  return `<div class="docentes-wide"><p>Equipos concretos necesarios</p><div class="docentes-grid">${[...TEACHER_RESOURCES,'Otro recurso (detallar)','No requiere recursos adicionales'].map(resource=>`<label><input type="checkbox" data-resource value="${esc(resource)}" ${selected.includes(resource)?'checked':''} />${esc(resource)}</label>`).join('')}</div></div>${field('Otros recursos o detalles', 'recursos', selected.filter(v=>!TEACHER_RESOURCES.includes(v)&&v!=='No requiere recursos adicionales'&&v!=='Otro recurso (detallar)').join(', '), {textarea:true,placeholder:'Solo necesidades que no estén en la lista'})}`;
}

function executionFields(data,index){
 const starts=['Empieza solo','Espera señal del docente','Empieza con la pista','Otro'];
 const start=starts.find(v=>String(data.inicio||'').startsWith(v))||'';
 const detail=start?String(data.inicio).slice(start.length).replace(/^:\s*/,''):data.inicio||'';
 const accompaniment=String(data.acompanamiento||'');
 const no=accompaniment==='No requiere acompañamiento';
 const match=/^Sí · Docente: (.*?) · Función: ([\s\S]*)$/.exec(accompaniment);
 return `<label>¿Cómo comienza?<select data-start-choice><option value="">Por definir</option>${starts.map(v=>option(v,v,start)).join('')}</select></label>${field('Detalle de inicio (necesario si eliges Otro)', 'inicio', detail,{textarea:true,placeholder:'Quién da la entrada, cuándo iniciar la pista…'})}<label>¿Necesita acompañamiento?<select data-support-choice>${['Por confirmar','Sí','No'].map(v=>option(v,v,no?'No':match?'Sí':'Por confirmar')).join('')}</select></label><label>Docente que acompañará<input data-support-teacher list="supportNames${index}" maxlength="160" value="${esc(match?.[1]||'')}" placeholder="Nombre del docente" /><datalist id="supportNames${index}">${[...new Set([...Object.values(state.convocatoria?.docentes||{}),state.ficha?.docenteNombre].filter(Boolean))].map(name=>`<option value="${esc(name)}"></option>`).join('')}</datalist></label><label>¿Cómo acompañará?<textarea data-support-role maxlength="1500" placeholder="Piano, segunda voz, entradas…">${esc(match?.[2]||(!no?accompaniment:''))}</textarea></label><input type="hidden" name="acompanamiento" value="${esc(accompaniment)}" />`;
}
import {
  listConvocatorias, getConvocatoria, loadFicha, saveFicha, fichaUrl,
  canEditFicha, validateFichaInput, PRESENTACION_LIMITES
} from './docentes-data.js?v=20261028-guiado';
import { normalizarNombre } from './docentes-model.js?v=20261028-guiado';

const app = document.getElementById('docentesApp');
const storageKey = 'musicala.eventos.fichas-docentes.v1';
const state = { convocatorias: [], convocatoria: null, ficha: null, token: null, revision: 0, busy: false, dirty: false, pendingRecovery: false, presentations: [], localLinks: readLocalLinks() };
const areas = [['musica', 'Música'], ['danza', 'Danza'], ['teatro', 'Teatro'], ['artes-plasticas', 'Artes plásticas']];
const blankPresentation = () => ({ participacionEstado:'Por confirmar', obrasJson:'', inscripcionId:'', tipo: 'Individual', estudianteGrupo: '', integrantesTexto: '', areaArtisticaId: 'musica', instrumento: '', repertorio: '', duracionMin: '', cantidadObras: 1, recursos: '', materialUrl: '', preparacion: '', entrada: '', inicio: '', acompanamiento: '', cierre: '', observaciones: '' });
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

function privateFichaPrepared(convocatoria, docenteId) {
  const prepared = convocatoria?.fichasPrivadasPreparadas;
  return Array.isArray(prepared) ? prepared.includes(docenteId) : prepared?.[docenteId] === true;
}

function updatePreparedGuidance(convocatoria, docenteId) {
  const notice = document.getElementById('privatePreparedNotice');
  const button = document.getElementById('startForm')?.querySelector('[type="submit"]');
  if (!notice || !button) return;
  const prepared = privateFichaPrepared(convocatoria, docenteId);
  const remembered = state.localLinks.some(link => link.eventoId === (convocatoria?.id || convocatoria?.eventoId) && link.docenteId === docenteId);
  notice.classList.toggle('hidden', !prepared);
  notice.textContent = prepared ? remembered ? 'Este navegador recuerda el enlace de tu ficha. Puedes abrirla con el botón.' : 'Coordinación ya preparó tu ficha con los estudiantes de esta muestra. Abre el enlace privado que te enviaron; si no lo tienes, solicítalo a coordinación.' : '';
  button.textContent = prepared && !remembered ? 'Ver indicaciones de acceso' : 'Abrir mi formato';
}

function renderStart(notice = '') {
  const openEvents = state.convocatorias.filter(windowOpen);
  state.ficha = null;
  state.token = null;
  state.convocatoria = null;
  state.dirty = false;
  state.pendingRecovery = false;
  app.innerHTML = `${brand}<section class="docentes-card docentes-start"><h2>Prepara tu participación en la muestra</h2><p class="docentes-lead">Abre el enlace privado que te envió coordinación para revisar tus estudiantes y completar su presentación. Si aún no hay una ficha preparada, elige una muestra abierta y tu nombre.</p><p class="docentes-note"><strong>Conserva tu enlace privado</strong> para volver a tu ficha desde cualquier dispositivo.</p>${notice ? `<p class="docentes-note" data-tone="warning">${esc(notice)}</p>` : ''}${openEvents.length ? `<form id="startForm"><div class="docentes-grid"><label>Muestra<select id="eventChoice" required><option value="">Selecciona una muestra</option>${openEvents.map(event => option(event.id || event.eventoId, event.titulo, '')).join('')}</select></label><label>Tu nombre<select id="teacherChoice" required disabled><option value="">Primero selecciona una muestra</option></select></label></div><p id="eventInfo" class="docentes-help" aria-live="polite"></p><p id="privatePreparedNotice" class="docentes-note hidden" aria-live="polite"></p><div class="docentes-actions"><button class="btn btn-primary" type="submit">Abrir mi formato</button></div></form>` : `<div class="docentes-note" data-tone="warning"><p>En este momento no hay muestras abiertas para nuevas inscripciones.</p><p>Si ya guardaste una ficha, puedes consultarla con tu enlace privado. Coordinación define cuándo se abre y se cierra cada muestra.</p></div>`}</section>${renderLocalLinks()}${footer}`;
  document.getElementById('eventChoice')?.addEventListener('change', event => {
    const convocatoria = state.convocatorias.find(item => (item.id || item.eventoId) === event.target.value);
    const teachers = teacherEntries(convocatoria);
    const select = document.getElementById('teacherChoice');
    select.disabled = !teachers.length;
    select.innerHTML = teachers.length ? `<option value="">Selecciona tu nombre</option>${teachers.map(([id, name]) => option(id, name, '')).join('')}` : `<option value="">${convocatoria ? 'Tu nombre aún no está habilitado' : 'Primero selecciona una muestra'}</option>`;
    const info = document.getElementById('eventInfo');
    info.textContent = convocatoria ? [dateOnly(convocatoria.fechaInicio), convocatoria.lugar, convocatoria.cierreAt ? `Puedes guardar hasta ${dateText(convocatoria.cierreAt)} (hora de Bogotá).` : 'Coordinación avisará el cierre de inscripciones.'].filter(Boolean).join(' · ') : '';
    updatePreparedGuidance(convocatoria, '');
  });
  document.getElementById('teacherChoice')?.addEventListener('change', event => {
    const eventId = document.getElementById('eventChoice').value;
    const convocatoria = state.convocatorias.find(item => (item.id || item.eventoId) === eventId);
    updatePreparedGuidance(convocatoria, event.target.value);
  });
  document.getElementById('startForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const eventId = document.getElementById('eventChoice').value;
    const docenteId = document.getElementById('teacherChoice').value;
    const convocatoria = state.convocatorias.find(item => (item.id || item.eventoId) === eventId);
    if (!convocatoria || !docenteId || !windowOpen(convocatoria)) return;
    const local = state.localLinks.find(item => item.eventoId === eventId && item.docenteId === docenteId);
    if (local) { navigateToToken(local.token); return; }
    if (privateFichaPrepared(convocatoria, docenteId)) {
      updatePreparedGuidance(convocatoria, docenteId);
      document.getElementById('privatePreparedNotice').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
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

function rosterRows() {
  return state.token && Array.isArray(state.ficha?.estudiantesPrecargados) ? state.ficha.estudiantesPrecargados : [];
}

function presentationKey(row, includeWork = true) {
  return JSON.stringify([normalizarNombre(row?.estudianteGrupo), row?.tipo || 'Individual', row?.areaArtisticaId || 'musica', ...(includeWork ? [normalizarNombre(row?.repertorio)] : [])]);
}

function presentationPayload(row) {
  const defaults = blankPresentation();
  return Object.fromEntries(Object.keys(defaults).map(key => [key, row[key] ?? defaults[key]]));
}

function assignRosterSources(presentations, previous = [], previousRoster = []) {
  const roster = rosterRows();
  const used = new Set();
  return presentations.map((row, index) => {
    let rosterIndex = -1;
    const old = previous[index];
    if (Number.isInteger(old?._rosterIndex) && presentationKey(row) === presentationKey(old)) {
      const source = previousRoster[old._rosterIndex];
      rosterIndex = roster.findIndex(candidate => source?.inscripcionId ? candidate?.inscripcionId === source.inscripcionId : source && presentationKey(candidate) === presentationKey(source));
    }
    if (rosterIndex < 0 || used.has(rosterIndex)) rosterIndex = roster.findIndex((source, sourceIndex) => !used.has(sourceIndex) && presentationKey(source) === presentationKey(row));
    if (rosterIndex < 0) {
      const key = presentationKey(row, false);
      const candidates = roster.map((source, sourceIndex) => ({ sourceIndex, key: presentationKey(source, false) })).filter(source => source.key === key);
      const matchingRows = presentations.filter(candidate => presentationKey(candidate, false) === key);
      if (candidates.length === 1 && matchingRows.length === 1 && !used.has(candidates[0].sourceIndex)) rosterIndex = candidates[0].sourceIndex;
    }
    if (rosterIndex >= 0) used.add(rosterIndex);
    const { _rosterIndex, ...fields } = row;
    return { ...fields, ...(rosterIndex >= 0 ? { _rosterIndex: rosterIndex } : {}) };
  });
}

function rosterHtml() {
  const roster = rosterRows();
  if (!roster.length) return '';
  return `<div class="docentes-roster docentes-no-print"><label>Estudiantes de esta muestra<select id="rosterStudentChoice"><option value="">Selecciona un estudiante o ensamble</option>${roster.map((row, index) => option(index, [row.estudianteGrupo || 'Participante', row.repertorio || 'Obra por completar', areas.find(([id]) => id === row.areaArtisticaId)?.[1]].filter(Boolean).join(' · '), '')).join('')}</select></label><button id="openRosterStudent" type="button" class="btn btn-light">Abrir estudiante</button><p id="rosterStatus" class="docentes-help" aria-live="polite">Esta lista fue preparada por coordinación para tu ficha. Si el estudiante ya está abajo, se abrirá su presentación.</p></div>`;
}

function presentationSummary(data) {
  const work = String(data.repertorio || '').trim().replace(/\s+/g, ' ');
  const duration = data.areaArtisticaId === 'artes-plasticas' ? `${Number(data.cantidadObras || 1)} obra(s)` : data.duracionMin !== '' && data.duracionMin != null ? `${Math.floor(Math.round(Number(data.duracionMin)*60)/60)}:${String(Math.round(Number(data.duracionMin)*60)%60).padStart(2,'0')} (min:seg)` : '';
  return [work || 'Obra por completar', duration].filter(Boolean).join(' · ');
}

function teacherWorkHtml(work={obra:'',minutos:null}) {
  const seconds=work.minutos==null?null:Math.round(Number(work.minutos)*60);
  const result=`<div data-teacher-work data-shared="${work.compartida?'1':''}" data-ensemble="${esc(work.ensambleId||'')}" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><label style="flex:1;min-width:180px">Obra / actividad<input name="obraTitulo" maxlength="180" value="${esc(work.obra)}" ${work.compartida?'readonly':''} /></label><label>Minutos<input name="obraMinutos" type="number" min="0" max="120" step="1" value="${seconds===null?'':Math.floor(seconds/60)}" ${work.compartida?'readonly':''} /></label><label>Segundos<input name="obraSegundos" type="number" min="0" max="59" step="1" value="${seconds===null?'':seconds%60}" ${work.compartida?'readonly':''} /></label><button type="button" data-remove-work ${work.compartida?'disabled':''}>Quitar</button>${work.compartida?'<small>Tiempo compartido: se completa en el ensamble.</small>':''}</div>`;
  return result;

}
function syncTeacherWorks(container){
  const values=[...container.querySelectorAll('[data-teacher-work]')].map(item=>({obra:item.querySelector('[name="obraTitulo"]').value.trim(),minutos:item.querySelector('[name="obraMinutos"]').value===''&&item.querySelector('[name="obraSegundos"]').value===''?null:(Number(item.querySelector('[name="obraMinutos"]').value)*60+Number(item.querySelector('[name="obraSegundos"]').value||0))/60,...(item.dataset.shared==='1'?{compartida:true,ensambleId:item.dataset.ensemble||''}:{})}));
  container.querySelector('[name="obrasJson"]').value=JSON.stringify(values);
  container.querySelector('[name="repertorio"]').value=values.filter(w=>w.obra).map(w=>w.obra).join(' / ');
  container.querySelector('[name="duracionMin"]').value=values.reduce((sum,w)=>sum+(w.minutos||0),0);
  const totalSeconds=Math.round(values.reduce((sum,w)=>sum+(w.minutos||0),0)*60);container.querySelector('[data-work-total]').textContent='Total de las obras: '+Math.floor(totalSeconds/60)+':'+String(totalSeconds%60).padStart(2,'0')+' (min:seg)';
}
function presentationHtml(data, index) {
  const absent = document.getElementById('teacherForm')?.elements.asistencia?.value === 'No' || (!document.getElementById('teacherForm') && state.ficha?.asistencia === 'No');
  const hasStudent = Boolean(String(data.estudianteGrupo || '').trim());
  const missingInstructions = absent && (!String(data.preparacion || '').trim() || !String(data.inicio || '').trim());
  const source = Number.isInteger(data._rosterIndex) ? rosterRows()[data._rosterIndex] : null;
  const members = Array.isArray(source?.integrantesDetalle) ? source.integrantesDetalle.filter(member => typeof member?.nombre === 'string' && member.nombre.trim()) : [];
  const memberInstruments = members.length ? `<div class="docentes-wide docentes-note"><strong>Instrumentos de los integrantes registrados</strong>${members.map(member => `<p>${esc(member.nombre)} — ${esc(typeof member.instrumento === 'string' && member.instrumento.trim() ? member.instrumento : 'Por definir')}</p>`).join('')}</div>` : '';
  return `<details class="docentes-presentation" data-presentation="${index}"${Number.isInteger(data._rosterIndex) ? ` data-roster-index="${data._rosterIndex}"` : ''}${hasStudent ? '' : ' open'}>
    <summary><span class="docentes-summary-name">${index + 1}. <span data-presentation-title>${esc(data.estudianteGrupo || 'Nueva presentación')}</span></span><span class="docentes-summary-work" data-presentation-summary>${esc(presentationSummary(data))}</span><span data-instruction-warning class="docentes-summary-warning${missingInstructions ? '' : ' hidden'}">Completa preparación e inicio</span></summary>
    <div class="docentes-presentation-body">
      <div class="docentes-grid">
        ${field('Estudiante o nombre del ensamble', 'estudianteGrupo', data.estudianteGrupo, { max: 180, wide: true, placeholder: 'Nombre completo o nombre del grupo' })}
        <label>Participación del estudiante<select name="participacionEstado">${['Por confirmar','Participará','No participará'].map(v=>option(v,v,data.participacionEstado||'Por confirmar')).join('')}</select></label>
        ${data.inscripcionId && Array.isArray(state.ficha?.estudiantesPrecargados) && !rosterRows().some(source=>source.inscripcionId===data.inscripcionId)?'<p class="docentes-note" data-tone="warning">Esta inscripción ya no figura en tu listado asignado. Puede haber cambiado de docente. Consulta a coordinación; no necesitas volver a completar su repertorio. Marca No participará en esta ficha si ya no te corresponde.</p>':''}
        <input type="hidden" name="inscripcionId" value="${esc(data.inscripcionId||source?.inscripcionId||'')}" /><input type="hidden" name="obrasJson" value="${esc(data.obrasJson||'')}" /><input type="hidden" name="repertorio" value="${esc(data.repertorio||'')}" /><input type="hidden" name="duracionMin" value="${esc(data.duracionMin||0)}" />
        <div class="docentes-wide"><h4>Obras y minutos</h4><div data-teacher-works>${teacherWorks(data).map(teacherWorkHtml).join('')}</div><button type="button" class="btn btn-light" data-add-work>+ Agregar obra</button><p data-work-total class="docentes-help">Total de las obras: ${Math.floor(Math.round(Number(data.duracionMin||0)*60)/60)}:${String(Math.round(Number(data.duracionMin||0)*60)%60).padStart(2,'0')} (min:seg)</p><p class="docentes-help">Confirma lo registrado o completa lo que falta. En Artes plásticas los minutos son opcionales.</p></div>
        <label class="${data.areaArtisticaId === 'artes-plasticas' ? '' : 'hidden'}" data-artwork-label>Cantidad de obras a exhibir<input name="cantidadObras" type="number" min="1" max="20" step="1" value="${esc(data.cantidadObras || 1)}" /><small>Entre 1 y 20 obras.</small></label>
      </div>
      <details class="docentes-disclosure"><summary>Tipo, área, instrumento e integrantes</summary><div class="docentes-grid">
        <label>Tipo de presentación<select name="tipo">${['Individual', 'Ensamble'].map(value => option(value, value, data.tipo)).join('')}</select></label>
        <label>Área artística<select name="areaArtisticaId">${areas.map(([id, label]) => option(id, label, data.areaArtisticaId)).join('')}</select></label>
        ${field('Instrumento o disciplina', 'instrumento', data.instrumento, { max: 120, placeholder: 'Piano, violín, ballet, teatro…' })}
        <label class="docentes-wide${data.tipo === 'Ensamble' ? '' : ' hidden'}" data-members-label>Integrantes del ensamble<textarea name="integrantesTexto" maxlength="3000" placeholder="Un nombre completo por línea">${esc(data.integrantesTexto)}</textarea><small>Incluye al menos dos integrantes, uno por línea.</small></label>
        ${memberInstruments}
      </div></details>
      <details class="docentes-disclosure"><summary>Recursos y material de apoyo</summary><div class="docentes-grid">
        ${resourceFields(data.recursos)}
        ${field('Enlace a pista, partitura o referencia', 'materialUrl', data.materialUrl, { type: 'url', max: 1000, placeholder: 'https://…', help: 'Revisa que coordinación pueda abrirlo.' })}
      </div></details>
      <details class="docentes-disclosure docentes-instructions" data-execution-instructions${absent ? ' open' : ''}><summary data-instructions-label>${absent ? 'Instrucciones si no estarás presente' : 'Indicaciones para realizar la presentación'}</summary>
        <p class="docentes-help" data-required-help${absent ? '' : ' hidden'}>Para enviar la ficha, completa la preparación y la señal de inicio para quien acompañe tu ausencia.</p>
        <div class="docentes-grid">
          ${field('Preparación antes de salir', 'preparacion', data.preparacion, { textarea: true, placeholder: 'Qué revisar, cómo afinar, material listo, prueba de sonido…' })}
          ${executionFields(data,index)}
        </div>
        <details class="docentes-disclosure"><summary>Entrada, acompañamiento, cierre y otras indicaciones</summary><div class="docentes-grid">
          ${field('Entrada y ubicación en escena', 'entrada', data.entrada, { textarea: true, placeholder: 'Por dónde entra, dónde se ubica y quién ayuda.' })}
          ${field('Cierre y salida', 'cierre', data.cierre, { textarea: true, placeholder: 'Cómo termina, saludo y retiro del material.' })}
          ${field('Otras cosas a tener en cuenta', 'observaciones', data.observaciones, { textarea: true, placeholder: 'Necesidades de apoyo o indicaciones adicionales.' })}
        </div></details>
      </details>
      <button type="button" class="btn btn-ghost docentes-remove docentes-no-print" data-remove-presentation="${index}">Quitar esta presentación</button>
    </div>
  </details>`;
}

function updatePresentationSummary(container) {
  const name = container.querySelector('[name="estudianteGrupo"]').value.trim();
  container.querySelector('[data-presentation-title]').textContent = name || 'Nueva presentación';
  const data = Object.fromEntries(['repertorio', 'duracionMin', 'cantidadObras', 'areaArtisticaId'].map(key => [key, container.querySelector(`[name="${key}"]`).value]));
  container.querySelector('[data-presentation-summary]').textContent = presentationSummary(data);
  const absent = document.getElementById('teacherForm').elements.asistencia.value === 'No';
  const missing = absent && (!container.querySelector('[name="preparacion"]').value.trim() || !container.querySelector('[data-start-choice]')?.value);
  container.querySelector('[data-instruction-warning]').classList.toggle('hidden', !missing);
}

function updateAttendanceDetails() {
  const absent = document.getElementById('teacherForm').elements.asistencia.value === 'No';
  const general = document.getElementById('generalTeacherDetails');
  if (absent) general.open = true;
  app.querySelectorAll('[data-presentation]').forEach(container => {
    const instructions = container.querySelector('[data-execution-instructions]');
    instructions.open = absent;
    instructions.classList.toggle('docentes-required', absent);
    container.querySelector('[data-instructions-label]').textContent = absent ? 'Instrucciones si no estarás presente' : 'Indicaciones para realizar la presentación';
    container.querySelector('[data-required-help]').classList.toggle('hidden', !absent);
    updatePresentationSummary(container);
  });
}

function emptyPresentation(row) {
  if (Number.isInteger(row._rosterIndex) || row.tipo !== 'Individual' || row.areaArtisticaId !== 'musica') return false;
  const textFields = Object.keys(blankPresentation()).filter(key => !['tipo', 'areaArtisticaId', 'duracionMin', 'cantidadObras'].includes(key));
  return Number(row.duracionMin || 0) === 0 && Number(row.cantidadObras || 1) === 1 && textFields.every(key => !String(row[key] || '').trim());
}

function openPresentationCard(index) {
  const container = app.querySelector(`[data-presentation="${index}"]`);
  if (!container) return;
  container.open = true;
  const absent = document.getElementById('teacherForm').elements.asistencia.value === 'No';
  const preparation = container.querySelector('[name="preparacion"]');
  const field = absent && !preparation.value.trim() ? preparation : container.querySelector('[name="repertorio"]');
  field.focus({ preventScroll: true });
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openRosterPresentation() {
  if (state.busy) return;
  const choice = document.getElementById('rosterStudentChoice');
  const status = document.getElementById('rosterStatus');
  if (choice.value === '') { status.textContent = 'Selecciona un estudiante o ensamble de la lista.'; return; }
  const sourceIndex = Number(choice.value);
  const roster = rosterRows();
  const source = roster[sourceIndex];
  if (!source || !Number.isInteger(sourceIndex)) return;
  const current = readPresentations();
  state.presentations = assignRosterSources(current, current, roster);
  app.querySelectorAll('[data-presentation]').forEach((container, index) => {
    const rosterIndex = state.presentations[index]?._rosterIndex;
    if (Number.isInteger(rosterIndex)) container.dataset.rosterIndex = rosterIndex;
    else delete container.dataset.rosterIndex;
  });
  let target = state.presentations.findIndex(row => row._rosterIndex === sourceIndex);
  if (target >= 0) {
    status.textContent = `Abrimos la presentación ${target + 1} de ${source.estudianteGrupo || 'este estudiante'}.`;
    status.dataset.tone = '';
    openPresentationCard(target);
    return;
  }
  if (state.pendingRecovery || !canEditFicha(state.ficha, state.convocatoria)) {
    status.textContent = 'Esta ficha está disponible para consulta. Solicita a coordinación que la reabra para agregar esta presentación.';
    status.dataset.tone = 'warning';
    return;
  }
  target = state.presentations.findIndex(emptyPresentation);
  const prefilling = { ...presentationPayload(source), _rosterIndex: sourceIndex };
  if (target >= 0) {
    state.presentations[target] = prefilling;
    app.querySelector(`[data-presentation="${target}"]`).outerHTML = presentationHtml(prefilling, target);
  } else {
    if (state.presentations.length >= 20) {
      status.textContent = 'La ficha ya tiene 20 presentaciones. Revisa las existentes antes de agregar otra.';
      status.dataset.tone = 'warning';
      return;
    }
    target = state.presentations.length;
    state.presentations.push(prefilling);
    document.getElementById('presentationsList').insertAdjacentHTML('beforeend', presentationHtml(prefilling, target));
  }
  document.getElementById('presentationCount').textContent = `${state.presentations.length} de 20 presentaciones`;
  setEditable(true);
  markDirty();
  status.textContent = 'Estudiante agregado. Guarda el borrador para conservar sus datos.';
  status.dataset.tone = '';
  openPresentationCard(target);
}

function revealValidationError(error) {
  app.querySelectorAll('[data-validation-notice]').forEach(element=>element.remove());
  const message = String(error?.message || '');
  const match = /Presentaci[oó]n\s+(\d+)/i.exec(message);
  const container = match ? app.querySelector(`[data-presentation="${Number(match[1]) - 1}"]`) : null;
  if (!container) {
    if (/agrega/i.test(message)) document.getElementById('addPresentationBtn')?.focus();
    return;
  }
  const notice=document.createElement('p');
  notice.dataset.validationNotice='true';
  notice.className='docentes-note';
  notice.dataset.tone='error';
  notice.setAttribute('role','alert');
  notice.textContent=message;
  container.append(notice);
  let name = 'estudianteGrupo';
  if (/cantidad de obras/i.test(message)) name = 'cantidadObras';
  else if (/enlace/i.test(message)) name = 'materialUrl';
  else if (/integrantes|mismo estudiante|mismo nombre/i.test(message)) name = 'integrantesTexto';
  else if (/preparaci[oó]n|señal de inicio/i.test(message)) name = container.querySelector('[name="preparacion"]').value.trim() ? 'inicio' : 'preparacion';
  else {
    const missing = ['estudianteGrupo', 'repertorio', 'duracionMin'].find(key => {
      const value = container.querySelector(`[name="${key}"]`).value.trim();
      return !value || (key === 'duracionMin' && !(Number(value) > 0));
    });
    name = missing || (/duraci[oó]n/i.test(message) ? 'duracionMin' : name);
  }
  const input = container.querySelector(`[name="${name}"]`)?.type==='hidden' ? container.querySelector(name==='duracionMin'?'[name="obraMinutos"]':'[name="obraTitulo"]') || container.querySelector('[name="estudianteGrupo"]') : container.querySelector(`[name="${name}"]`);
  for (let element = input.parentElement; element && element !== document.getElementById('teacherForm'); element = element.parentElement) {
    if (element.tagName === 'DETAILS') element.open = true;
  }
  input.focus({ preventScroll: true });
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function readonlyReason() {
  if (state.ficha?.revocada) return 'Este enlace dejó de estar habilitado. Contacta a coordinación.';
  if (state.ficha?.estado === 'Confirmado') return 'Coordinación confirmó esta ficha. Puedes consultarla e imprimirla. Para corregirla, solicita a coordinación que la reabra.';
  return 'Las inscripciones están cerradas para esta ficha. Puedes consultarla e imprimirla. Coordinación puede reabrirla si necesitas corregir algo.';
}

function renderForm(savedMessage = '', showPrivateLink = false) {
  const ficha = state.ficha;
  const convocatoria = state.convocatoria;
  const editable = canEditFicha(ficha, convocatoria);
  const reopenDate = timestampDate(ficha.reabiertaHasta);
  const activeReopen = reopenDate && reopenDate.getTime() > Date.now();
  const deadline = activeReopen ? ficha.reabiertaHasta : convocatoria.cierreAt;
  app.innerHTML = `${brand}<section class="docentes-card">
    <div class="docentes-event-summary"><div><h2>${esc(convocatoria.titulo)}</h2><p class="docentes-event-meta">${esc([dateOnly(convocatoria.fechaInicio), convocatoria.lugar].filter(Boolean).join(' · '))}</p><p><strong>Docente:</strong> ${esc(ficha.docenteNombre)}</p></div><span class="docentes-badge">${esc(ficha.estado || 'Borrador')}</span></div>
    <p class="docentes-help">${deadline ? `${editable ? activeReopen ? 'Ficha reabierta' : 'Inscripciones abiertas' : 'Plazo de inscripción'} hasta ${esc(dateText(deadline))} (hora de Bogotá).` : 'Coordinación define el cierre de inscripciones.'}</p>
    <div id="windowNotice"${editable ? ' class="hidden"' : ' class="docentes-note" data-tone="warning"'}>${editable ? '' : esc(readonlyReason())}</div>
    ${ficha.comentarioCoordinacion ? `<div class="docentes-note" data-tone="warning"><p><strong>Comentario de coordinación</strong></p><p>${esc(ficha.comentarioCoordinacion).replace(/\n/g, '<br>')}</p></div>` : ''}
    <div class="docentes-actions docentes-no-print"><button type="button" id="newFormBtn" class="btn btn-light">Ver otras muestras</button><button type="button" id="printFichaBtn" class="btn btn-light">Imprimir ficha / PDF</button></div>
    <p class="docentes-print-only"><strong>Estado:</strong> ${esc(ficha.estado)}${ficha.updatedAt ? ` · Guardada: ${esc(dateText(ficha.updatedAt))}` : ''}</p>
  </section>${state.token ? renderPrivateLink(showPrivateLink) : ''}
  <form id="teacherForm" novalidate><fieldset id="editableFields">
    <section class="docentes-card"><h2>1. Tu presencia</h2><div class="docentes-grid">
      <label>¿Estarás presente en la muestra?<select name="asistencia">${['Por confirmar', 'Sí', 'No'].map(value => option(value, value, ficha.asistencia)).join('')}</select></label>
    </div><details class="docentes-disclosure" id="generalTeacherDetails"${ficha.asistencia === 'No' ? ' open' : ''}><summary>Indicaciones generales y apoyo</summary><div class="docentes-grid">
      ${field('Apoyo que se necesita si no estás', 'apoyo', ficha.apoyo, { textarea: true, placeholder: 'Quién puede acompañar y qué ayuda necesita el grupo.' })}
      ${field('Indicaciones generales de tu grupo', 'indicacionesGenerales', ficha.indicacionesGenerales, { textarea: true, max: 4000, placeholder: 'Llegada, vestuario u organización común a las presentaciones.' })}
    </div></details></section>
    <section class="docentes-card"><div class="docentes-section-title"><h2>2. Estudiantes y presentaciones</h2><button type="button" id="addPresentationBtn" class="btn btn-light docentes-no-print">+ Agregar otro</button></div>
      <p class="docentes-help">Abre un estudiante para revisar su obra y duración. Puedes guardar por partes y completar sólo los detalles que necesite su presentación.</p>
      ${rosterHtml()}
      <div id="presentationsList">${state.presentations.map(presentationHtml).join('')}</div>
      <p id="presentationCount" class="docentes-help">${state.presentations.length} de 20 presentaciones</p>
    </section>
  </fieldset><section class="docentes-savebar docentes-no-print" aria-label="Guardar formato"><p id="saveStatus" class="docentes-save-status" role="status" aria-live="polite" data-tone="${savedMessage ? 'success' : ''}">${esc(savedMessage || (editable ? state.token ? 'Ficha cargada desde el servidor. Puedes continuar llenándola.' : 'Aún no guardaste esta ficha. El enlace privado se crea al guardar.' : readonlyReason()))}</p><div id="saveErrorAction" class="hidden docentes-error-action"></div><div class="docentes-actions"><button type="button" id="saveDraftBtn" class="btn btn-light"${editable ? '' : ' disabled'}>Guardar borrador</button><button type="submit" id="submitFichaBtn" class="btn btn-primary"${editable ? '' : ' disabled'}>Revisar y enviar a coordinación</button></div><p class="docentes-help">Guardar borrador permite continuar después. Envía a coordinación cuando la ficha esté lista para revisar.</p></section></form>${footer}`;
  setEditable(editable);
  bindForm();
  updateAttendanceDetails();
}

function renderPrivateLink(open = false) {
  return `<details class="docentes-card docentes-link-card docentes-no-print" id="privateLinkDetails"${open ? ' open' : ''}><summary>Tu enlace privado · Copiar o descargar</summary><div class="docentes-private-link-body"><p>Consérvalo para continuar desde otro dispositivo. <strong>Compártelo sólo con quien deba editar tu ficha.</strong></p><label>Enlace para volver a esta ficha<input id="privateLink" type="text" readonly value="${esc(fichaUrl(state.token))}" /></label><div class="docentes-actions"><button type="button" id="copyPrivateLink" class="btn btn-primary">Copiar enlace</button><button type="button" id="downloadPrivateLink" class="btn btn-light">Descargar enlace</button></div><p class="docentes-help" id="linkStatus" aria-live="polite">También lo recordamos en este navegador cuando el dispositivo lo permite.</p></div></details>`;
}

function setEditable(editable) {
  app.querySelectorAll('#editableFields input, #editableFields textarea').forEach(element => { element.readOnly = !editable || state.busy; });
  app.querySelectorAll('#editableFields select, #editableFields button, #saveDraftBtn, #submitFichaBtn').forEach(element => { element.disabled = !editable || state.busy; });
  for (const id of ['rosterStudentChoice', 'openRosterStudent']) {
    const control = document.getElementById(id);
    if (control) control.disabled = state.busy;
  }
  const addButton = document.getElementById('addPresentationBtn');
  if (addButton) addButton.disabled = !editable || state.busy || state.presentations.length >= 20;
}

function readPresentations() {
  const rows = [...app.querySelectorAll('[data-presentation]')].map(container => {
    syncTeacherWorks(container);
    const data = {};
    container.querySelectorAll('[name]').forEach(element => { if (!Object.hasOwn(blankPresentation(), element.name)) return; data[element.name] = ['duracionMin', 'cantidadObras'].includes(element.name) ? Number(element.value || (element.name === 'cantidadObras' ? 1 : 0)) : element.value.trim(); });
    const resources=[...container.querySelectorAll('[data-resource]:checked')].map(input=>input.value);
    data.recursos=[...resources,data.recursos].filter(Boolean).join(', ');
    const start=container.querySelector('[data-start-choice]')?.value||'';
    data.inicio=start+(data.inicio?': '+data.inicio:'');
    const support=container.querySelector('[data-support-choice]')?.value;
    data.acompanamiento=support==='No'?'No requiere acompañamiento':support==='Sí'?'Sí · Docente: '+container.querySelector('[data-support-teacher]').value.trim()+' · Función: '+container.querySelector('[data-support-role]').value.trim():container.querySelector('[data-support-role]').value.trim();
    const sourceIndex = container.dataset.rosterIndex;
    if (sourceIndex != null && /^\d+$/.test(sourceIndex) && rosterRows()[Number(sourceIndex)]) data._rosterIndex = Number(sourceIndex);
    if (data.tipo !== 'Ensamble') data.integrantesTexto = '';
    if (data.areaArtisticaId !== 'artes-plasticas') data.cantidadObras = 1;
    return data;
  });
  for(const row of rows){
    const values=teacherWorks(row).map(work=>{
      if(!work.compartida||!work.ensambleId)return work;
      const owner=rows.find(other=>other.inscripcionId===work.ensambleId);
      const original=owner?teacherWorks(owner).find(w=>normalizarNombre(w.obra)===normalizarNombre(work.obra)):null;
      return original?{...work,minutos:original.minutos}:work;
    });
    row.obrasJson=JSON.stringify(values);row.duracionMin=values.reduce((sum,w)=>sum+(w.minutos||0),0);
  }
  return rows;
}

function readForm(estado) {
  const form = document.getElementById('teacherForm');
  return { token: state.token || undefined, revision: state.revision, eventoId: state.ficha.eventoId, docenteId: state.ficha.docenteId, docenteNombre: state.ficha.docenteNombre, asistencia: form.elements.asistencia.value, disponibilidad: state.ficha.disponibilidad || '', apoyo: form.elements.apoyo.value.trim(), indicacionesGenerales: form.elements.indicacionesGenerales.value.trim(), estado, presentaciones: readPresentations().map(presentationPayload) };
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
  form.addEventListener('click',event=>{
    const add=event.target.closest('[data-add-work]'),remove=event.target.closest('[data-remove-work]');
    if(!add&&!remove || state.busy || !canEditFicha(state.ficha,state.convocatoria))return;
    const container=event.target.closest('[data-presentation]');
    if(add){if(container.querySelectorAll('[data-teacher-work]').length>=20)return;container.querySelector('[data-teacher-works]').insertAdjacentHTML('beforeend',teacherWorkHtml());}
    else {if(remove.closest('[data-teacher-work]').dataset.shared==='1')return;remove.closest('[data-teacher-work]').remove();}
    syncTeacherWorks(container);markDirty();updatePresentationSummary(container);
  });
  form.addEventListener('input', event => {
    if (!event.target.name && !event.target.matches('[data-resource],[data-start-choice],[data-support-choice],[data-support-teacher],[data-support-role]')) return;
    markDirty();
    const presentation = event.target.closest('[data-presentation]');
    if (presentation) { syncTeacherWorks(presentation); updatePresentationSummary(presentation); }
  });
  form.addEventListener('change', event => {
    if(event.target.matches('[data-resource]')&&event.target.checked){const box=event.target.closest('[data-presentation]');box.querySelectorAll('[data-resource]').forEach(input=>{if(input!==event.target&&(event.target.value==='No requiere recursos adicionales'||input.value==='No requiere recursos adicionales'))input.checked=false;});}
    if (!event.target.name) return;
    markDirty();
    if (event.target.name === 'asistencia') updateAttendanceDetails();
    if (event.target.name === 'tipo') event.target.closest('[data-presentation]').querySelector('[data-members-label]').classList.toggle('hidden', event.target.value !== 'Ensamble');
    if (event.target.name === 'areaArtisticaId') event.target.closest('[data-presentation]').querySelector('[data-artwork-label]').classList.toggle('hidden', event.target.value !== 'artes-plasticas');
    const presentation = event.target.closest('[data-presentation]');
    if (presentation) updatePresentationSummary(presentation);
  });
  document.getElementById('openRosterStudent')?.addEventListener('click', openRosterPresentation);
  document.getElementById('rosterStudentChoice')?.addEventListener('change', event => { if (event.target.value !== '') openRosterPresentation(); });
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

async function persist(estado,reviewed=false) {
  if (state.busy || state.pendingRecovery || !state.ficha) return;
  if (!canEditFicha(state.ficha, state.convocatoria)) { setStatus(readonlyReason(), 'warning'); setEditable(false); return; }
  app.querySelectorAll('[data-validation-notice]').forEach(element=>element.remove());
  const invalidTime=[...app.querySelectorAll('[name="obraMinutos"],[name="obraSegundos"]')].find(input=>!input.validity.valid);
  if(invalidTime){setStatus('Usa minutos enteros y segundos de 0 a 59. Por ejemplo: 3 minutos y 22 segundos.','error');invalidTime.closest('details').open=true;invalidTime.focus();return;}
  const previousPresentations = readPresentations();
  const previousRoster = rosterRows();
  const payload = readForm(estado);
  if(reviewed&&document.getElementById('preflightReview')?.dataset.signature!==JSON.stringify(payload))reviewed=false;
  if(estado==='Enviado'&&!reviewed){
    const issues=[];
    if(payload.asistencia==='Por confirmar')issues.push({message:'Confirma si asistirás a la muestra.'});
    payload.presentaciones.forEach((p,index)=>{
      const fail=message=>issues.push({index,message:`Presentación ${index+1} · ${p.estudianteGrupo||'Sin nombre'}: ${message}`});
      if(p.participacionEstado==='Por confirmar')fail('Indica si participará o no participará.');
      if(!p.estudianteGrupo)fail('Indica el nombre del estudiante o ensamble.');
      if(p.participacionEstado==='No participará')return;
      if(p.inscripcionId&&Array.isArray(state.ficha.estudiantesPrecargados)&&!rosterRows().some(source=>source.inscripcionId===p.inscripcionId))fail('La inscripción ya no está asignada en tu listado. Consulta a coordinación o marca No participará en esta ficha.');
      try{validateFichaInput({...payload,presentaciones:[p]});}catch(error){fail(error.message.replace(/^Presentación 1(?: · [^:]+)?:\s*/,''));}
      const card=app.querySelector('[data-presentation="'+index+'"]');
      const selectedResources=[...card.querySelectorAll('[data-resource]:checked')];
      if(!selectedResources.length)fail('Selecciona los equipos de la lista, Otro recurso o No requiere recursos adicionales.');
      if(selectedResources.some(input=>input.value==='Otro recurso (detallar)')&&!card.querySelector('[name="recursos"]').value.trim())fail('Describe el otro recurso que necesitas.');
      if(!/^(Empieza solo|Espera señal del docente|Empieza con la pista|Otro)/.test(p.inicio)||p.inicio==='Otro')fail('Selecciona cómo inicia y detalla la opción Otro.');
      if(!p.acompanamiento||(p.acompanamiento!=='No requiere acompañamiento'&&!/^Sí · Docente: \S[\s\S]* · Función: \S[\s\S]*$/.test(p.acompanamiento)))fail('Define si necesita acompañamiento. Si es Sí, indica docente y función.');
    });
    let box=document.getElementById('preflightReview');
    if(!box){box=document.createElement('section');box.id='preflightReview';box.className='docentes-card';document.querySelector('.docentes-savebar').before(box);}
    if(issues.length){
      box.innerHTML='<h2>Pendientes antes de enviar ('+issues.length+')</h2>'+issues.map((issue,i)=>'<p><button type="button" data-issue="'+i+'">'+esc(issue.message)+'</button></p>').join('');
      box.querySelectorAll('[data-issue]').forEach(button=>button.onclick=()=>{const issue=issues[Number(button.dataset.issue)];if(issue.index!=null)revealValidationError({message:issue.message});else document.querySelector('[name="asistencia"]').focus();});
      box.scrollIntoView({behavior:'smooth',block:'start'});setStatus('Faltan '+issues.length+' punto(s). Tus cambios siguen aquí; puedes guardarlos como borrador.','warning');return;
    }
    box.innerHTML='<h2>Revisa antes de enviar</h2><p>Asistencia docente: '+esc(payload.asistencia)+'</p>'+payload.presentaciones.map(p=>'<article><h3>'+esc(p.estudianteGrupo)+' · '+esc(p.participacionEstado)+'</h3>'+(p.participacionEstado==='No participará'?'<p>No se incorporará como nueva presentación.</p>':'<p>'+esc(p.repertorio)+'</p><p>Duración: '+Math.floor(Math.round(p.duracionMin*60)/60)+':'+String(Math.round(p.duracionMin*60)%60).padStart(2,'0')+' (min:seg)</p><p>Recursos: '+esc(p.recursos)+'</p><p>Inicio: '+esc(p.inicio)+'</p><p>Acompañamiento: '+esc(p.acompanamiento)+'</p>')+'</article>').join('')+'<button type="button" class="btn btn-primary" id="confirmTeacherSend">Confirmar y enviar a coordinación</button><button type="button" class="btn btn-light" id="cancelTeacherSend">Volver a corregir</button>';
    box.dataset.signature=JSON.stringify(payload);
    document.getElementById('confirmTeacherSend').onclick=()=>persist('Enviado',true);
    document.getElementById('cancelTeacherSend').onclick=()=>box.remove();box.scrollIntoView({behavior:'smooth',block:'start'});return;
  }
  try { validateFichaInput(payload); } catch (error) { setStatus(errorText(error), 'error'); revealValidationError(error); return; }
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
    state.presentations = assignRosterSources(saved.presentaciones, previousPresentations, previousRoster);
    state.dirty = false;
    state.pendingRecovery = false;
    state.busy = false;
    history.replaceState(null, '', `#ficha=${state.token}`);
    rememberLink();
    renderForm(`${estado === 'Enviado' ? 'Enviado a coordinación' : 'Borrador guardado'} y confirmado por el servidor · ${dateText(saved.ficha.updatedAt || new Date())}.`, !payload.token);
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
    document.getElementById('teacherForm').insertAdjacentHTML('beforebegin', renderPrivateLink(true));
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
      state.presentations = assignRosterSources(loaded.presentaciones);
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
    state.presentations = assignRosterSources(loaded.presentaciones);
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
