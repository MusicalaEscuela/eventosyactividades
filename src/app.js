import { createSampleRoutes } from './ruta-muestras.js?v=20261027-recursos-1';
import { buildArtisticHistory } from './historial-areas.js?v=20261017-historial';
import { createScores } from './partituras.js?v=20261016-login-fix';
import { createStagePlots } from './stage-plots.js?v=20261016-stage';
import { getWorkMinutes, workMinutes, formatWorkTime, workDurationReference, workDurationSummary } from './obras-duracion.js?v=20261027-recursos-1';
import { createAnnualSystem } from "./muestras-anual.js?v=20261027-recursos-1";
import { createTeacherAdmin } from "./docentes-admin.js?v=20261017-integracion";
import { collectReusableContext, uniqueSuggestions } from "./eventos-context.js?v=20261017-personas";
import { normalizarNombre } from "./docentes-model.js";
import { ACTIVITY_STATES, ACTIVITY_STATE_HELP, ACTIVITY_COLUMNS, ACTIVITY_RESPONSIBLE_GROUPS, normalizeActivityState } from "./actividades-model.js";
import { buildParticipantTeacherOptions, teacherHistoryForStudent } from "./participantes-model.js";
import { buildEnsembleCandidates, normalizeEnsembleMembers, validateEnsembleMembers, findEnsemblesForWork, buildEnsembleParticipationIndex, getParticipantEnsembles, getEffectiveParticipantWorks, getEnsemblesForParticipantWork, getIndividualSoloWorks, getParticipantDuration, buildPresentationCatalogue } from "./ensambles-model.js?v=20261027-recursos-1";
import { MOMENT_PRESETS, getMomentPreset, resolveMomentType, nextMomentTitle, getMomentEnd, getNextMoment, getParticipantWorks, buildMomentPresentation, getProgrammeEnsembleWarnings } from "./programacion-model.js?v=20261027-recursos-1";
import {
  auth,
  provider,
  db,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  collectionGroup,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  runTransaction
} from "./firebase-config.js?v=20261011-docentes";

import { BANCO_REPERTORIO, GENEROS, normalizeGenre, findRepertorio } from "./repertorio.js";

import {
  ripSignIn,
  ripSignOut,
  ripRestoreSession,
  ripCurrentUser,
  ripFetchEstudiantes,
  ripNorm,
  RIP_ALLOWED_EMAILS
} from "./rip-config.js?v=20261017-multiarea-3";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const authScreen = $("#authScreen");
const dashboard = $("#dashboard");
const eventList = $("#eventList");
const eventDetail = $("#eventDetail");
const emptyState = $("#emptyState");
const pageTitle = $("#pageTitle");
const kpis = $("#kpis");
const modal = $("#modal");
const modalForm = $("#modalForm");
const importFile = $("#importFile");

const state = {
  user: null,
  eventos: [],
  filteredEventos: [],
  selectedEventId: null,
  selectedEvent: null,
  tab: "actividades",
  childData: {
    actividades: [],
    muestras: [],
    programacion: [],
    equipo: [],
    rider: [],
    checklist: [],
    documentos: [],
    bitacora: [],
    partituras: []
  },
  vista: "tabla",
  vistaPrincipal: "eventos",      // "eventos" | "estudiantes"
  ripEstado: "desconectado",      // desconectado | cargando | listo | error
  ripError: "",
  ripEstudiantes: [],
  participaciones: new Map(),     // clave de estudiante → presentaciones
  participantesRegistrados: [],
  participacionesCargadas: false,
  participacionesError: '',
  convocatoriasDocentes: [],
  filtroEstudiantes: { texto: "", nivel: "", presentado: "" },
  mostrarHistorialEventos: false,
  unsubParticipaciones: null,
  lugares: [],
  personas: [],
  placesDialogOpen: false,
  peopleDialogOpen: false,
  unsubEventos: null,
  unsubLugares: null,
  unsubPersonas: null,
  unsubConvocatoriasDocentes: null,
  unsubChildren: [],
  actividadesComunesSincronizadas: false
};

// Snapshot listeners replace these source arrays. Cache derived lists until
// their sources change, so focusing or typing never rebuilds the whole roster.
let ensembleCandidateCache;
let ensembleParticipationCache;
let reusableContextCache;
let teacherCandidatesCache;
let ripIndexCache;
const sameReferences = (previous, current) => previous?.length === current.length && current.every((value, index) => previous[index] === value);

function ripStudentIndex() {
  if (ripIndexCache?.source === state.ripEstudiantes) return ripIndexCache;
  const byId = new Map();
  const byName = new Map();
  for (const student of state.ripEstudiantes) {
    if (student.studentId && !byId.has(student.studentId)) byId.set(student.studentId, student);
    for (const key of new Set([student.claveNombre, ripNorm(student.nombre)].filter(Boolean))) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(student);
    }
  }
  ripIndexCache = { source: state.ripEstudiantes, byId, byName };
  return ripIndexCache;
}

function reusableContextSources() {
  return [state.personas, state.convocatoriasDocentes, state.lugares, state.eventos, state.participantesRegistrados, ...Object.values(state.childData)];
}

function reusableEventContext() {
  const sources = reusableContextSources();
  if (!sameReferences(reusableContextCache?.sources, sources)) {
    reusableContextCache = { sources, context: collectReusableContext({ people: docentesYaUsados(), places: state.lugares, events: state.eventos, children: state.childData, participations: state.participantesRegistrados }) };
  }
  return reusableContextCache.context;
}

const annualView = $("#annualView");
const annualSystem = createAnnualSystem({root: annualView, user: () => state.user, toast, onChange: () => renderDetail(), events: () => state.eventos});
const teacherAdmin = createTeacherAdmin({ user: () => state.user, people: () => state.personas, teacherCandidates: docentesYaUsados, students: () => state.ripEstudiantes, annual: annualSystem, setModal, modalForm, modal, toast });

const sampleRoutes = createSampleRoutes({user:()=>state.user,students:()=>state.ripEstudiantes,participants:()=>[...state.participantesRegistrados,...state.childData.muestras],event:()=>state.selectedEvent,setModal,modalForm,modal,toast,onChange:()=>{
  if(state.vistaPrincipal==='estudiantes')renderEstudiantes();else if(state.selectedEvent)renderDetail();
  if(modal.open&&$('#pickerLista')&&state.picker){$('#pickerLista').innerHTML=renderPickerLista();actualizarPickerPie();}
}});
const scores = createScores({context:()=>({event:state.selectedEvent, presentations:eventPresentations(), rows:state.childData.partituras, user:state.user}),setModal,modalForm,modal,toast});
const stagePlots = createStagePlots({
  context: () => ({event:state.selectedEvent, presentations:eventPresentations(), participants:state.childData.muestras}),
  toast,
  save: async (eventId, presentationId, data, base) => {
    const ref = doc(db, COLLECTION, eventId);
    const stable = value => JSON.stringify(value, function(key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])) : item; });
    await runTransaction(db, async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) throw new Error('stage-conflict');
      const current = snapshot.data().stagePlots || {};
      if (stable(current[presentationId] || null) !== stable(base)) throw new Error('stage-conflict');
      const plots = {...current,[presentationId]:data};
      if (new TextEncoder().encode(JSON.stringify(plots)).length > 600000) throw new Error('stage-size');
      tx.update(ref, { stagePlots:plots, updatedAt:serverTimestamp(), updatedBy:state.user.email });
    });
    if (state.selectedEventId === eventId) state.selectedEvent.stagePlots = {...state.selectedEvent.stagePlots,[presentationId]:data};
  }
});
const COLLECTION = "eventos";
const CHILD_COLLECTIONS = ["actividades", "muestras", "programacion", "equipo", "rider", "checklist", "documentos", "bitacora", "partituras"];
const ACTIVIDADES_COMUNES_VERSION = 1;
const ACTIVIDADES_COMUNES = [
  { id: "actividad-comun-confirmar-docentes", titulo: "Confirmar con docentes el alcance, avance y si los estudiantes están listos para tocar", area: "Coordinación académica", responsable: "Coordinación académica", prioridad: "Alta" },
  { id: "actividad-comun-confirmar-estudiantes", titulo: "Confirmar participación de estudiantes", area: "Estudiantes", responsable: "Docentes", prioridad: "Alta" },
  { id: "actividad-comun-confirmar-invitados", titulo: "Confirmar invitados", area: "Comunicación", responsable: "Coordinación", prioridad: "Media" },
  { id: "actividad-comun-enviar-invitaciones", titulo: "Enviar invitaciones", area: "Comunicación", responsable: "Administración", prioridad: "Alta" }
];

function emptyChildData() {
  return Object.fromEntries(CHILD_COLLECTIONS.map(child => [child, []]));
}

const STATUS_CLASS = {
  "Planeación": "neutral",
  "En curso": "warning",
  "En riesgo": "danger",
  "Listo": "success",
  "Realizado": "success",
  "No realizado": "danger",
  "Archivado": "neutral",
  "Pendiente": "neutral",
  "Confirmado": "success",
  "No disponible": "danger",
  "Cancelado": "danger",
  "Bloqueado": "danger",
  "Bloqueada": "danger",
  "Terminada": "success",
  "Cancelada": "neutral"
};

const CHECKLIST_TEMPLATES = {
  "Musicala Fest": [
    ["Producción", "Definir fecha, lugar y franjas horarias", "Alek / Cata", "Alta"],
    ["Producción", "Cerrar cantidad máxima de presentaciones por bloque", "Coordinación", "Alta"],
    ["Lugar", "Confirmar auditorio, capacidad, acceso y horarios de montaje", "Producción", "Alta"],
    ["Lugar", "Solicitar requisitos técnicos y restricciones del espacio", "Producción", "Alta"],
    ["Sonido", "Enviar rider técnico actualizado", "Producción", "Alta"],
    ["Sonido", "Confirmar técnico, consola, micrófonos, monitores y backline", "Sonido", "Alta"],
    ["Rider", "Marcar instrumentos y accesorios que Musicala debe llevar", "Equipo", "Media"],
    ["Repertorio", "Cerrar repertorios y duraciones reales", "Coordinación académica", "Alta"],
    ["Ensayos", "Programar ensayo general con orden de bloques", "Coordinación académica", "Alta"],
    ["Publicidad", "Crear campaña de expectativa, inscripción y cuenta regresiva", "Marketing", "Media"],
    ["Publicidad", "Preparar afiche, stories, reels, mensajes y señalización", "Marketing", "Media"],
    ["Familias", "Enviar circular con hora, vestuario, llegada y recomendaciones", "Administración", "Alta"],
    ["Diplomas", "Preparar base de diplomas/certificados", "Administración", "Media"],
    ["Foto/video", "Definir responsables de registro audiovisual", "Producción", "Media"],
    ["Logística", "Definir alimentación, hidratación y zona de espera", "Administración", "Media"],
    ["Día del evento", "Imprimir minuto a minuto y checklist de montaje", "Producción", "Alta"],
    ["Cierre", "Publicar galería, agradecimiento y encuesta", "Marketing", "Media"]
  ],
  "Muestra de proceso": [
    ["Planeación", "Definir objetivo pedagógico de la muestra", "Coordinación académica", "Alta"],
    ["Estudiantes", "Confirmar estudiantes/grupos participantes", "Docentes", "Alta"],
    ["Repertorio", "Registrar obra, duración y necesidades técnicas", "Docentes", "Alta"],
    ["Familias", "Enviar información de horario, llegada y vestuario", "Administración", "Media"],
    ["Espacio", "Confirmar salón/auditorio y montaje básico", "Producción", "Media"],
    ["Evidencias", "Tomar fotos o videos del proceso", "Equipo", "Media"],
    ["Cierre", "Registrar observaciones pedagógicas posteriores", "Docentes", "Media"]
  ],
  "Open Day": [
    ["Programación", "Definir clases abiertas, horarios y cupos", "Coordinación", "Alta"],
    ["Comercial", "Crear formulario o lista de interesados", "Comercial", "Alta"],
    ["Equipo", "Confirmar docentes y actividades demostrativas", "Coordinación", "Alta"],
    ["Publicidad", "Publicar invitación y recordatorios", "Marketing", "Media"],
    ["Recepción", "Preparar bienvenida y toma de datos", "Administración", "Media"],
    ["Seguimiento", "Contactar asistentes después del evento", "Comercial", "Alta"]
  ],
  "Evento": [
    ["Planeación", "Definir objetivo, fecha, lugar y público", "Coordinación", "Alta"],
    ["Logística", "Crear cronograma y responsables", "Producción", "Alta"],
    ["Técnico", "Listar recursos, equipos y requerimientos", "Producción", "Alta"],
    ["Comunicación", "Preparar invitación y mensajes", "Marketing", "Media"],
    ["Cierre", "Registrar aprendizajes y evidencias", "Equipo", "Media"]
  ]
};

const SEED_EVENT = {
  titulo: "Musicala Fest 2026 - Planeación base",
  tipo: "Musicala Fest",
  estado: "Planeación",
  prioridad: "Alta",
  responsable: "Alek y Cata",
  lugar: "Por definir",
  fechaInicio: "2026-11-01",
  fechaFin: "2026-11-01",
  publico: "Familias, estudiantes, docentes, aliados y comunidad Musicala",
  presupuesto: "",
  objetivo: "Organizar una jornada artística con muestras de proceso, presentaciones, experiencias abiertas y actividades de comunidad, cuidando duración, logística, sonido y evidencias.",
  notas: "Plantilla inicial basada en el archivo de planeación de Muestras de proceso y Musicala Fest 2026."
};

const FIELD_OPTIONS = {
  tipo: ["Evento", "Muestra de proceso", "Musicala Fest", "Open Day", "Ensayo", "Actividad interna"],
  estadoEvento: ["Planeación", "En curso", "En riesgo", "Listo", "Realizado", "No realizado", "Archivado"],
  estadoItem: ["Pendiente", "En curso", "En riesgo", "Listo", "Confirmado", "Realizado", "Cancelado", "Bloqueado"],
  prioridad: ["Baja", "Media", "Alta", "Crítica"],
  areas: ["General", "Música", "Danza", "Teatro", "Artes plásticas", "Administrativo", "Comercial", "Producción", "Técnico", "Marketing", "Logística"]
};

// Cada evento puede ajustar estas opciones desde Participantes sin afectar los demás.
const RECURSOS_EQUIPO_EVENTO = ['Soporte de parlante Empire Sound', 'Parlante Empire Sound con cable de energía', 'Estructura para telón', 'Telones cafés (juego de 2)', 'Trípode para cámara y/o celular'];
const RECURSOS_TECNICOS_INICIALES = [
  ...RECURSOS_EQUIPO_EVENTO,
  // Sonido general
  "Monitor", "Pista", "Consola / mezcla",
  // Micrófonos
  "Micrófono", "Micrófono de voz inalámbrico", "Micrófono de voz con base", "Micrófono para violín / viola",
  "Micrófono para chelo", "Micrófono para vientos", "Micrófono para guitarra acústica", "Micrófonos de batería",
  // Instrumentos y amplificación
  "Guitarra acústica", "Guitarra eléctrica", "Amplificador de guitarra", "Bajo eléctrico", "Amplificador de bajo",
  "Piano / teclado", "Base para teclado", "Batería", "Percusión menor", "Cajón",
  // Conexiones y accesorios
  "Cable plug (instrumento)", "Caja directa (DI)", "Atril", "Base de micrófono", "Silla sin brazos", "Afinador",
  // Escena
  "Banda", "Tarima", "Luces"
];

function listaParticipantes(campo, respaldo) {
  const lista = state.selectedEvent?.listasParticipantes?.[campo];
  const options=Array.isArray(lista) && lista.length ? lista : respaldo;
  return campo==='recursosTecnicos' ? [...new Set([...RECURSOS_EQUIPO_EVENTO,...options.filter(item=>normalizarNombre(item)!=='sonido')])] : options;
}

function opcionesConSeleccion(options, selected = "") {
  const todas = [...options];
  if (selected && !todas.includes(selected)) todas.push(selected);
  return selectOptions(todas, selected);
}

function recursosSeleccionados(row = {}) {
  if (Array.isArray(row.recursosSeleccionados)) return row.recursosSeleccionados;
  return String(row.recursos || "").split(",").map(item => item.trim()).filter(Boolean);
}

/* ===================== Tablero Kanban ===================== */

// Las columnas agrupan estados afines. `estado` es el valor que se guarda al soltar.
const KANBAN_COLUMNS = [
  { id: "pendiente", nombre: "Pendiente", estado: "Pendiente", estados: ["Pendiente", ""] },
  { id: "curso", nombre: "En curso", estado: "En curso", estados: ["En curso"] },
  { id: "riesgo", nombre: "En riesgo / bloqueado", estado: "En riesgo", estados: ["En riesgo", "Bloqueado"] },
  { id: "listo", nombre: "Listo / confirmado", estado: "Listo", estados: ["Listo", "Confirmado"] },
  { id: "cerrado", nombre: "Cerrado", estado: "Realizado", estados: ["Realizado", "Cancelado"] }
];

// Pestañas que tienen estado y por tanto se pueden ver como tablero.
const KANBAN_TABS = ["actividades", "muestras", "equipo", "rider", "checklist", "documentos"];
const TEAM_STATES = ["Pendiente", "Confirmado", "No disponible"];
function normalizeTeamState(value) {
  if (["Listo", "Realizado", "Confirmado"].includes(value)) return "Confirmado";
  if (["Cancelado", "Cancelada", "No disponible"].includes(value)) return "No disponible";
  return "Pendiente";
}
const TEAM_COLUMNS = TEAM_STATES.map(estado => ({ id: estado, nombre: estado === "Pendiente" ? "Pendiente de confirmar" : estado, estado, estados: [estado] }));
const boardColumns = tab => tab === "actividades" ? ACTIVITY_COLUMNS : tab === "equipo" ? TEAM_COLUMNS : KANBAN_COLUMNS;
const boardState = (tab, value) => tab === "actividades" ? normalizeActivityState(value) : tab === "equipo" ? normalizeTeamState(value) : value || "";

// Campo que hace de título en cada tipo de registro.
const TITULO_CAMPO = {
  actividades: "titulo",
  muestras: "estudianteGrupo",
  programacion: "item",
  equipo: "nombre",
  rider: "elemento",
  checklist: "item",
  documentos: "titulo",
  bitacora: "comentario"
};

/* ===================== Base de personas ===================== */

const PERSONA_TIPOS = ["Docente", "Estudiante", "Administrativo", "Producción", "Técnico", "Proveedor", "Aliado", "Familia / acudiente", "Externo"];

/* ===================== Documentos del evento ===================== */

const DOCUMENTO_TIPOS = [
  "Rider técnico",
  "Permiso / autorización de uso del espacio",
  "Autorización de imagen",
  "Carta de solicitud",
  "Repertorio / setlist",
  "Circular a familias",
  "Programa de mano",
  "Contrato",
  "Póliza / seguro",
  "Factura / cuenta de cobro",
  "Listado de asistencia",
  "Diplomas / certificados",
  "Registro fotográfico o video",
  "Otro"
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function badge(label) {
  const cls = STATUS_CLASS[label] || "neutral";
  return `<span class="badge ${cls}">${escapeHtml(label || "Sin estado")}</span>`;
}

/**
 * Traduce errores de Firestore a algo accionable. El caso más común al
 * estrenar una versión es que falten reglas por desplegar.
 */
function explicarError(error, queFallo) {
  const codigo = error?.code || "";
  if (codigo === "permission-denied") {
    return `${queFallo}: permisos insuficientes. Falta desplegar las reglas: firebase deploy --only firestore:rules`;
  }
  if (codigo === "failed-precondition") {
    return `${queFallo}: falta un índice en Firestore. Abre la consola del navegador (F12) y sigue el enlace “create index”.`;
  }
  if (codigo === "unavailable") {
    return `${queFallo}: sin conexión con Firestore. Revisa tu internet.`;
  }
  return `${queFallo}: ${error?.message || "error desconocido"}`;
}

function toast(message) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  stack.appendChild(node);
  setTimeout(() => node.remove(), 3600);
}

function formValue(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : value;
}

function selectOptions(options, selected = "") {
  return options.map(option => `<option ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
}

function setModal(content, submitLabel = "Guardar") {
  const submit = submitLabel ? `<button type="submit" class="btn btn-primary">${submitLabel}</button>` : "";
  const closeLabel = submitLabel ? "Cancelar" : "Cerrar";
  modalForm.onsubmit = null;
  modalForm.onclick = null;
  modalForm.onchange = null;
  modalForm.innerHTML = `${content}<div class="modal-actions"><button type="button" class="btn btn-light" data-close>${closeLabel}</button>${submit}</div>`;
  modalForm.querySelector("[data-close]").addEventListener("click", () => modal.close());
  if (!modal.open) modal.showModal();
  modalForm.scrollTop = 0;
}

async function login() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    toast("No se pudo iniciar sesión. Revisa que Google Auth esté activo en Firebase.");
  }
}

async function logout() {
  // Se cierran ambas sesiones: la de esta app y la del proyecto RIP.
  await ripSignOut();
  await signOut(auth);
}

function listenEventos() {
  if (state.unsubEventos) state.unsubEventos();
  state.unsubEventos = onSnapshot(collection(db, COLLECTION), snapshot => {
    state.eventos = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => String(a.fechaInicio || "9999-12-31").localeCompare(String(b.fechaInicio || "9999-12-31")));
    syncDatalists();
    if (!state.actividadesComunesSincronizadas && state.eventos.some(evento => evento.actividadesComunesVersion !== ACTIVIDADES_COMUNES_VERSION)) {
      state.actividadesComunesSincronizadas = true;
      applyCommonActivitiesToExistingEvents().catch(error => {
        console.error(error);
        state.actividadesComunesSincronizadas = false;
        toast("No se pudieron agregar las actividades comunes.");
      });
    }
    applyFilters();
    renderKpis();
    if (state.selectedEventId) {
      state.selectedEvent = state.eventos.find(evento => evento.id === state.selectedEventId) || null;
      if (!state.selectedEvent) clearSelection();
    }
    renderDetail();
  }, error => {
    console.error(error);
    toast(explicarError(error, "No pude leer los eventos"));
  });
}

function listenLugares() {
  if (state.unsubLugares) state.unsubLugares();
  state.unsubLugares = onSnapshot(collection(db, "lugares"), snapshot => {
    state.lugares = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
    refreshPlacesList();
  }, error => {
    console.error(error);
    toast(explicarError(error, "No pude leer la base de lugares"));
  });
}

/* ============ Seguimiento de estudiantes (padrón RIP) ============ */

/** Clave con la que se cruza un participante contra el padrón de RIP. */
function claveEstudiante(row) {
  return String(row.studentId || "").trim() || ripNorm(row.estudianteGrupo || row.estudiante || "");
}

/**
 * Escucha TODAS las muestras de TODOS los eventos (collectionGroup) para saber
 * quién ya se presentó y en qué. Es la respuesta a "¿este ya se presentó?".
 */
function listenParticipaciones() {
  if (state.unsubParticipaciones) state.unsubParticipaciones();
  state.unsubParticipaciones = onSnapshot(collectionGroup(db, "muestras"), snapshot => {
    state.participantesRegistrados = snapshot.docs.map(d => ({ ...d.data(), eventoId: d.ref.parent.parent?.id || '', muestraId: d.id }));
    state.participacionesCargadas = true;
    state.participacionesError = '';
    const indice = new Map();
    const effective = buildPresentationCatalogue(state.participantesRegistrados.map(row => ({ ...row, id: row.muestraId })));
    effective.forEach(data => {
      const eventoId = data.eventoId || "";
      const evento = state.eventos.find(e => e.id === eventoId);

      // Un ensamble cuenta como presentación para cada uno de sus integrantes.
      const participantes = Array.isArray(data.integrantes) && data.integrantes.length
        ? data.integrantes.map(i => ({
            clave: String(i.studentId || "").trim() || ripNorm(i.nombre || ""),
            nombre: i.nombre || ""
          }))
        : [{ clave: claveEstudiante(data), nombre: data.estudianteGrupo || "" }];

      participantes.forEach(({ clave, nombre }) => {
        if (!clave) return;
        if (!indice.has(clave)) indice.set(clave, []);
        indice.get(clave).push({
          eventoId,
          muestraId: data.muestraId || data.id,
          docente: data.docente || '',
          nombreLibre: String(nombre || data.estudianteGrupo || "").trim(),
          eventoTitulo: evento?.titulo || "Evento",
          fecha: evento?.fechaInicio || "",
          tipo: evento?.tipo || "",
          repertorio: data.repertorio || "",
          repertorios: obrasDe(data),
          esEnsamble: participantIsEnsemble(data),
          nombreEnsamble: participantIsEnsemble(data) ? (data.estudianteGrupo || "") : "",
          estado: data.estado || ""
        });
      });
    });
    state.participaciones = indice;
    syncDatalists();
    if (state.vistaPrincipal === "estudiantes") renderEstudiantes();
    if (modal.open && $("#pickerLista") && state.picker) { $("#pickerLista").innerHTML=renderPickerLista(); actualizarPickerPie(); }
  }, error => {
    console.error(error);
    toast(explicarError(error, "No pude leer el historial de participaciones"));
    state.participacionesError = 'No pude consultar los docentes anteriores. Vuelve a cargar la página para intentarlo de nuevo.';
    refreshParticipantTeacherContext();
  });
}

/** Conecta con RIP y trae el padrón. Requiere estar en su lista blanca. */
async function conectarRip() {
  if (state.ripEstado === "cargando") return;
  state.ripEstado = "cargando";
  state.ripError = "";
  renderEstudiantes();
  try {
    await ripSignIn(state.user?.email || "");
    state.ripEstudiantes = await ripFetchEstudiantes();
    state.ripEstado = "listo";
    syncDatalists();
    toast(`${state.ripEstudiantes.length} estudiantes cargados desde RIP.`);
  } catch (error) {
    console.error(error);
    state.ripEstado = "error";
    const codigo = error?.code || "";
    if (codigo === "permission-denied") {
      // La cuenta con la que se entró a RIP puede no ser la misma de esta app.
      const cuentaRip = ripCurrentUser()?.email || "";
      const cuenta = cuentaRip || state.user?.email || "";
      const distinta = cuentaRip && state.user?.email
        && cuentaRip.toLowerCase() !== state.user.email.toLowerCase();
      state.ripError = `La cuenta ${cuenta} no está autorizada en RIP.`
        + (distinta ? ` Ojo: entraste a esta app con ${state.user.email}, pero a RIP con ${cuentaRip}.` : "")
        + ` Los correos con acceso a RIP son: ${RIP_ALLOWED_EMAILS.join(", ")}.`;
    } else if (codigo === "auth/unauthorized-domain") {
      state.ripError = `El dominio ${location.hostname} no está autorizado en el proyecto RIP. `
        + "Agrégalo en la consola de Firebase de rip-musicala, en Authentication → Settings → Authorized domains.";
    } else if (codigo === "auth/popup-blocked") {
      state.ripError = "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes de este sitio e inténtalo otra vez.";
    } else if (codigo === "auth/popup-closed-by-user" || codigo === "auth/cancelled-popup-request") {
      state.ripError = "Se cerró la ventana de Google antes de terminar de entrar.";
    } else {
      state.ripError = error?.message || "No se pudo conectar con RIP.";
    }
  }
  renderEstudiantes();
}

/**
 * Carga el padrón al abrir la app SIN abrir popup, aprovechando la sesión de
 * RIP que ya quedó guardada. Si no hay sesión previa no hace nada: el usuario
 * la abrirá con el botón "Conectar con RIP".
 */
async function cargarRipSilencioso() {
  if (state.ripEstado === "listo" || state.ripEstado === "cargando") return;
  try {
    const usuario = await ripRestoreSession();
    if (!usuario) return;
    state.ripEstado = "cargando";
    renderEstudiantes();
    state.ripEstudiantes = await ripFetchEstudiantes();
    state.ripEstado = "listo";
    syncDatalists();
    renderEstudiantes();
  } catch (error) {
    console.error(error);
    state.ripEstado = "desconectado";   // se reintenta con el botón, sin ruido
  }
}

/** Une el padrón de RIP con el historial de participaciones de esta app. */
function estudiantesConSeguimiento() {
  const filas = state.ripEstudiantes.map(est => {
    const presentaciones = state.participaciones.get(est.studentId)
      || state.participaciones.get(est.claveNombre)
      || [];
    return { ...est, presentaciones, vecesPresentado: presentaciones.length };
  });

  // Participantes registrados a mano que no existen en el padrón de RIP.
  const conocidos = new Set(filas.flatMap(f => [f.studentId, f.claveNombre]));
  state.participaciones.forEach((presentaciones, clave) => {
    if (conocidos.has(clave)) return;
    filas.push({
      studentId: "",
      nombre: presentaciones[0]?.nombreLibre || clave,
      claveNombre: clave,
      clasificacion: "",
      nivel: "externo",
      etiqueta: "Fuera del padrón",
      ultimaClase: "",
      presentaciones,
      vecesPresentado: presentaciones.length
    });
  });

  const { texto, nivel, presentado } = state.filtroEstudiantes;
  const busqueda = ripNorm(texto);
  return filas
    .filter(f => !busqueda || ripNorm(f.nombre).includes(busqueda))
    .filter(f => !nivel || f.nivel === nivel)
    .filter(f => !presentado
      || (presentado === "si" && f.vecesPresentado > 0)
      || (presentado === "no" && f.vecesPresentado === 0))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

const NIVEL_BADGE = { activo: "success", revisar: "warning", inactivo: "danger", externo: "neutral", desconocido: "neutral" };

function renderEstudiantes() {
  if (state.vistaPrincipal !== "estudiantes") return;

  emptyState.classList.add("hidden");
  eventDetail.classList.remove("hidden");
  pageTitle.textContent = "Seguimiento de estudiantes";

  if (state.ripEstado !== "listo") {
    const mensajes = {
      desconectado: `<h3>Conecta el padrón de estudiantes</h3>
        <p>Los estudiantes y su estado (activo / inactivo) viven en el proyecto <strong>RIP</strong>. Como es otro proyecto de Firebase, hace falta entrar con tu cuenta de Google una vez por sesión.</p>
        <p class="muted">Esta app solo lee nombres y clasificación. No accede a clases, pagos ni saldos.</p>
        <button class="btn btn-primary" data-rip="conectar">Conectar con RIP</button>`,
      cargando: `<h3>Cargando padrón…</h3><p>Trayendo estudiantes y su clasificación desde RIP.</p>`,
      error: `<h3>No se pudo conectar con RIP</h3>
        <p>${escapeHtml(state.ripError)}</p>
        <button class="btn btn-primary" data-rip="conectar">Reintentar</button>`
    };
    eventDetail.innerHTML = `<section class="panel empty-state">${mensajes[state.ripEstado]}</section>`;
    $$("[data-rip]").forEach(btn => btn.addEventListener("click", conectarRip));
    kpis.innerHTML = "";
    return;
  }

  const filas = estudiantesConSeguimiento();
  const todos = state.ripEstudiantes.length;
  const activos = state.ripEstudiantes.filter(e => e.nivel === "activo").length;
  const presentados = state.ripEstudiantes.filter(e =>
    (state.participaciones.get(e.studentId) || state.participaciones.get(e.claveNombre) || []).length > 0).length;
  const activosSinPresentar = state.ripEstudiantes.filter(e => e.nivel === "activo"
    && !(state.participaciones.get(e.studentId) || state.participaciones.get(e.claveNombre) || []).length).length;

  kpis.innerHTML = [
    ["Estudiantes en RIP", todos],
    ["Activos", activos],
    ["Ya se presentaron", presentados],
    ["Activos sin presentarse", activosSinPresentar]
  ].map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`).join("");

  eventDetail.innerHTML = `
    <section class="panel">
      <div class="row-between">
        <div>
          <p class="eyebrow">Padrón RIP · ${todos} estudiantes</p>
          <h3 style="margin:4px 0 0;font-size:1.2rem;">Quién se ha presentado</h3>
        </div>
        <button class="btn btn-light" data-rip="conectar">Actualizar padrón</button>
      </div>
      <div class="form-grid" style="margin-top:16px;">
        <label>Buscar estudiante
          <input type="search" id="estBuscar" value="${escapeHtml(state.filtroEstudiantes.texto)}" placeholder="Nombre..." />
        </label>
        <label>Estado en RIP
          <select id="estNivel">
            <option value="">Todos</option>
            <option value="activo" ${state.filtroEstudiantes.nivel === "activo" ? "selected" : ""}>Activo</option>
            <option value="revisar" ${state.filtroEstudiantes.nivel === "revisar" ? "selected" : ""}>Activo por revisar</option>
            <option value="inactivo" ${state.filtroEstudiantes.nivel === "inactivo" ? "selected" : ""}>Inactivo / exestudiante</option>
            <option value="externo" ${state.filtroEstudiantes.nivel === "externo" ? "selected" : ""}>Fuera del padrón</option>
          </select>
        </label>
        <label>¿Se presentó?
          <select id="estPresentado">
            <option value="">Todos</option>
            <option value="si" ${state.filtroEstudiantes.presentado === "si" ? "selected" : ""}>Ya se presentó</option>
            <option value="no" ${state.filtroEstudiantes.presentado === "no" ? "selected" : ""}>Todavía no</option>
          </select>
        </label>
      </div>
      <div class="table-panel">
        ${filas.length ? table(["Estudiante", "Estado en RIP", "Última clase", "Veces", "Se presentó en", "Ruta de muestras"], filas.map(f => [
          escapeHtml(f.nombre),
          `<span class="badge ${NIVEL_BADGE[f.nivel]}">${escapeHtml(f.etiqueta)}</span>`,
          escapeHtml(f.ultimaClase || "—"),
          f.vecesPresentado || `<span class="badge off">0</span>`,
          f.presentaciones.length
            ? f.presentaciones.map(p => `<span class="badge neutral">${escapeHtml(p.eventoTitulo)}${p.repertorio ? ` · ${escapeHtml(p.repertorio)}` : ""}</span>`).join(" ")
            : `<span class="muted">Sin presentaciones registradas</span>`,
          `<button type="button" class="small-btn" data-route-student-open="${escapeHtml(f.studentId || "")}">Ver procesos y etapas</button>`
        ])) : `<div class="empty-state"><h3>Sin resultados</h3><p>Ningún estudiante coincide con esos filtros.</p></div>`}
      </div>
    </section>`;

  $$("[data-rip]").forEach(btn => btn.addEventListener("click", conectarRip));
  $("#estBuscar").addEventListener("input", event => {
    state.filtroEstudiantes.texto = event.target.value;
    renderEstudiantes();
    $("#estBuscar").focus();
  });
  $("#estNivel").addEventListener("change", event => {
    state.filtroEstudiantes.nivel = event.target.value;
    renderEstudiantes();
  });
  $("#estPresentado").addEventListener("change", event => {
    state.filtroEstudiantes.presentado = event.target.value;
    renderEstudiantes();
  });
}

/* ========= Asignar estudiantes a un evento (selector múltiple) ========= */

/** Claves de quienes ya están inscritos en el evento abierto. */
function clavesInscritas() {
  const claves = new Set();
  state.childData.muestras.forEach(row => {
    if (Array.isArray(row.integrantes)) {
      row.integrantes.forEach(i => claves.add(String(i.studentId || "").trim() || ripNorm(i.nombre || "")));
    }
    const propia = claveEstudiante(row);
    if (propia) claves.add(propia);
  });
  return claves;
}

const FILTROS_FAMILIA_MUSICAL = { bateria:["bateria","percusion","drums"], violin:["violin","viola","cello","violoncello","contrabajo","cuerdas frotadas"], canto:["canto","voz","vocal","cantar"], guitarra:["guitarra","bajo","ukelele","cuerdas pulsadas"], piano:["piano","teclado","teclas"], ensambles:["ensamble","banda","grupo musical","orquesta"] };
function perfilArtistico(estudiante) { return ripNorm([estudiante.area, estudiante.instrumento, estudiante.programa, ...(estudiante.servicios || [])].filter(Boolean).join(" · ")); }
let artisticHistoryCache = null;
function artisticHistoryFor(student) {
  const sources=[state.ripEstudiantes,state.participantesRegistrados,state.childData.muestras,state.eventos,state.selectedEventId];
  if(!sameReferences(artisticHistoryCache?.sources,sources)){
    const participants=[...state.participantesRegistrados,...state.childData.muestras.map(row=>({...row,eventoId:state.selectedEventId}))];
    artisticHistoryCache={sources,index:buildArtisticHistory({students:state.ripEstudiantes,participants,events:state.eventos})};
  }
  return artisticHistoryCache.index.get(String(student.studentId||'').trim()||ripNorm(student.nombre))||[];
}
function ripArtisticAreas(estudiante) {
  const perfil = perfilArtistico(estudiante), areas = [];
  if (/\b(danza\w*|ballet|baile\w*|dance|bailar\w*)\b/.test(perfil)) areas.push('danza');
  if (/\b(teatro|actuacion|actuacion teatral|dramaturgia|expresion dramatica)\b/.test(perfil)) areas.push('teatro');
  if (/\b(plastica\w*|artes visuales|artes plasticas|dibujo|pintura|escultura|ceramica|manualidades)\b/.test(perfil)) areas.push('artes-plasticas');
  const musical = ['musica', 'musical', 'iniciacion', 'exploracion', 'violin', 'viola', 'cello', 'violoncello', 'contrabajo', 'piano', 'teclado', 'guitarra', 'bajo', 'ukelele', 'canto', 'voz', 'vocal', 'coro', 'bateria', 'percusion', 'flauta', 'saxofon', 'clarinete', 'trompeta', 'trombon', 'ensamble', 'orquesta', 'cuerdas', 'vientos', 'acordeon', 'arpa', 'bandola', 'tiple', 'fagot', 'oboe', 'tuba', 'eufonio', 'drums', 'cantar', 'teclas'];
  if (musical.some(term => new RegExp('\\b'+term+'\\b').test(perfil))) areas.push('musica');
  return areas;
}
function areasArtisticasEstudiante(estudiante) { return [...new Set([...ripArtisticAreas(estudiante),...artisticHistoryFor(estudiante).map(record=>record.area)])]; }
function areaArtisticaEstudiante(estudiante) { return areasArtisticasEstudiante(estudiante)[0] || ''; }
function coincideConFiltroArtistico(estudiante,areaId,modalidadId) { if(!areasArtisticasEstudiante(estudiante).includes(areaId))return false;if(areaId!=="musica"||!modalidadId)return true;return artisticHistoryFor(estudiante).some(record=>record.area===areaId && record.modality===modalidadId) || (FILTROS_FAMILIA_MUSICAL[modalidadId]||[modalidadId]).some(termino=>perfilArtistico(estudiante).includes(ripNorm(termino))); }

function candidatosPicker() {
  const { texto, soloActivos, areaId, modalidadId } = state.picker;
  const busqueda = ripNorm(texto);
  const base = state.ripEstudiantes
    .filter(e => !soloActivos || e.nivel === "activo")
    .filter(e => !busqueda || ripNorm(e.nombre).includes(busqueda));
  const coincidencias = base.filter(e => coincideConFiltroArtistico(e, areaId, modalidadId));
  // Buscar por nombre permite revisar perfiles incompletos o de otras áreas.
  if (busqueda) return base;
  return coincidencias.length ? coincidencias : base.filter(e => !areaArtisticaEstudiante(e));
}

function estudiantesSinPerfilParaFiltro() { const {soloActivos,areaId}=state.picker;if(!areaId)return 0;return state.ripEstudiantes.filter(e=>(!soloActivos||e.nivel==="activo")&&!areaArtisticaEstudiante(e)).length; }

function pickerMuestraPerfilesPorConfirmar() { const {texto,soloActivos,areaId,modalidadId}=state.picker,busqueda=ripNorm(texto),base=state.ripEstudiantes.filter(e=>!soloActivos||e.nivel==="activo").filter(e=>!busqueda||ripNorm(e.nombre).includes(busqueda));return !base.some(e=>coincideConFiltroArtistico(e,areaId,modalidadId))&&base.some(e=>!areaArtisticaEstudiante(e)); }

function resumenPicker() {
  const inscritas = clavesInscritas();
  const candidatas = candidatosPicker();
  const yaInscritas = candidatas.filter(est => {
    const clave = est.studentId || est.claveNombre;
    return inscritas.has(clave) || inscritas.has(est.claveNombre);
  });
  const seleccionadas = candidatas.filter(est => state.picker.seleccion.has(est.studentId || est.claveNombre));
  return { total: candidatas.length, yaInscritas: yaInscritas.length, seleccionadas: seleccionadas.length,
    pendientes: candidatas.filter(est => { const clave = est.studentId || est.claveNombre; return !inscritas.has(clave) && !inscritas.has(est.claveNombre) && !state.picker.seleccion.has(clave); }) };
}

function renderPickerLista() {
  const inscritas = clavesInscritas();
  const candidatos = candidatosPicker();

  if (!candidatos.length) {
    return `<div class="empty-state" style="padding:26px;"><p>Ningún estudiante coincide con la búsqueda.</p></div>`;
  }

  return `
    ${candidatos.map(est => {
      const clave = est.studentId || est.claveNombre;
      const yaEsta = inscritas.has(clave) || inscritas.has(est.claveNombre);
      const previas = (state.participaciones.get(est.studentId) || state.participaciones.get(est.claveNombre) || []).length;
      const marcado = state.picker.seleccion.has(clave);
      return `
        <label class="picker-row ${yaEsta ? "ya-inscrito" : ""}">
          <input type="checkbox" data-pick="${escapeHtml(clave)}" ${marcado ? "checked" : ""} ${yaEsta ? "disabled" : ""} />
          <span class="picker-nombre">${escapeHtml(est.nombre)}</span>
          <span class="badge ${NIVEL_BADGE[est.nivel]}">${escapeHtml(est.etiqueta)}</span>
          ${perfilArtistico(est)?`<span class="badge info">${escapeHtml([est.area,est.instrumento,est.programa].filter(Boolean).join(" · "))}</span>`:`<span class="badge warning">Por confirmar en RIP</span>`}
          <span style="grid-column:1/-1">${sampleRoutes.summary(est,state.picker.areaId)}</span>
          ${artisticHistoryFor(est).length?`<span class="badge info">Historial de muestras: ${escapeHtml([...new Set(artisticHistoryFor(est).map(record=>annualSystem.areaName(record.area,record.area)))].join(" · "))}</span>`:""}
          ${!coincideConFiltroArtistico(est,state.picker.areaId,state.picker.modalidadId)?`<span class="badge warning">Área o modalidad por confirmar para esta muestra</span>`:""}
          ${yaEsta
            ? `<span class="badge info">Ya está en el evento</span>`
            : `<span class="badge ${previas ? "neutral" : "off"}">${previas ? `${previas} presentación${previas === 1 ? "" : "es"}` : "Nunca se ha presentado"}</span>`}
        </label>`;
    }).join("")}`;
}

function actualizarPickerPie() {
  const n = state.picker.seleccion.size;
  const pie = $("#pickerPie");
  const boton = $("#pickerGuardar");
  if (pie) {
    pie.textContent = n
      ? `${n} estudiante${n === 1 ? "" : "s"} seleccionado${n === 1 ? "" : "s"}`
      : "Ninguno seleccionado todavía";
  }
  if (boton) {
    boton.disabled = n === 0 || (state.picker.modo === "ensamble" && n < 2);
    boton.textContent = state.picker.modo === "ensamble"
      ? `Crear ensamble de ${n}`
      : `Agregar ${n || ""} participante${n === 1 ? "" : "s"}`.replace("  ", " ");
  }
  const cobertura = $("#pickerCobertura");
  const marcar = $("#pickerMarcarPendientes");
  if (cobertura && marcar) {
    const resumen = resumenPicker();
    cobertura.textContent = `${resumen.yaInscritas} ya están en el evento · ${resumen.seleccionadas} marcados para agregar · ${resumen.pendientes.length} pendientes`;
    marcar.disabled = resumen.pendientes.length === 0;
    marcar.textContent = resumen.pendientes.length ? `Marcar ${resumen.pendientes.length} pendiente${resumen.pendientes.length === 1 ? "" : "s"}` : "Todos revisados";
  }
}

function openStudentPicker(modo = "individual") {
  if (state.ripEstado !== "listo") {
    toast("Primero conecta el padrón desde “Seguimiento de estudiantes”.");
    mostrarVista("estudiantes");
    return;
  }
  state.picker = { modo, seleccion: new Set(), texto: "", soloActivos: true, areaId: "musica", modalidadId: "" };
  const assignedTeachers = uniqueSuggestions(state.childData.muestras.map(row => row.docente));

  setModal(`
    <h3>${modo === "ensamble" ? "Crear ensamble" : "Agregar participantes"}</h3>
    <p class="muted">${modo === "ensamble"
      ? "Elige a los integrantes del ensamble. Se crea <strong>una sola presentación</strong> y cuenta para todos ellos."
      : "La lista empieza con todos los <strong>estudiantes activos</strong>. Revisa los pendientes antes de guardar; se crea <strong>una presentación por cada uno</strong>."}</p>

    ${modo === "ensamble" ? `
      <label>Nombre del ensamble
        <input id="pickerNombre" name="nombreEnsamble" required placeholder="Ej: Ensamble de cuerdas infantil" />
      </label>` : ""}

    <div class="form-grid">
      <label>Buscar estudiante
        <input type="search" id="pickerBuscar" placeholder="Nombre..." autocomplete="off" />
      </label>
      <label class="check-card" style="align-self:end;margin-bottom:2px;">
        <input type="checkbox" id="pickerActivos" checked /> Solo estudiantes activos
      </label>
    </div>

    <div class="form-grid">
      ${annualSystem.areaField({ areaArtisticaId: "musica" })}
      <div id="pickerModalidad">${annualSystem.modalityField({}, "musica")}</div>
      <label class="wide">Docente para los estudiantes seleccionados<select name="docente">${participantTeacherOptions(assignedTeachers.length === 1 ? assignedTeachers[0].name : '')}</select><span class="field-hint">Se asigna una sola vez a todo este grupo. Puedes dejarlo pendiente.</span></label>
    </div>
    <p class="field-hint" id="pickerFiltroInfo"></p>
    <div class="picker-lista" id="pickerLista">${renderPickerLista()}</div>
    <div class="picker-cobertura"><strong>Revisión del evento</strong><span class="field-hint" id="pickerCobertura"></span><button type="button" class="btn btn-light" id="pickerMarcarPendientes">Marcar pendientes</button></div>
    <p class="field-hint" id="pickerPie">Ninguno seleccionado todavía</p>
  `, null);

  // Pie de acciones propio (el genérico no sirve: el botón cambia de texto).
  modalForm.querySelector(".modal-actions").insertAdjacentHTML("beforeend",
    `<button type="submit" class="btn btn-primary" id="pickerGuardar" disabled>Agregar</button>`);
  state.picker.modalidadId = modalForm.querySelector('[name="modalidadPresentacionId"]').value;
  actualizarPickerPie();

  const lista = $("#pickerLista");
  const repintar = () => { lista.innerHTML=renderPickerLista();const sinPerfil=estudiantesSinPerfilParaFiltro(),filtroInfo=$("#pickerFiltroInfo");if(filtroInfo)filtroInfo.textContent=sinPerfil?(pickerMuestraPerfilesPorConfirmar()?`No hay coincidencias clasificadas en RIP ni en el historial para este filtro. Se muestran ${sinPerfil} estudiante${sinPerfil===1?"":"s"} activo${sinPerfil===1?"":"s"} por confirmar para que no quede nadie por fuera.`:`${sinPerfil} estudiante${sinPerfil===1?"":"s"} activo${sinPerfil===1?"":"s"} sin área registrada en RIP ni en muestras no coincide${sinPerfil===1?"":"n"} con este filtro.`):"El padrón combina las áreas de RIP con el historial de muestras.";actualizarPickerPie(); };

  $("#pickerBuscar").addEventListener("input", event => {
    state.picker.texto = event.target.value;
    repintar();
  });
  $("#pickerActivos").addEventListener("change", event => {
    state.picker.soloActivos = event.target.checked;
    repintar();
  });
  $("#pickerMarcarPendientes").addEventListener("click", () => { resumenPicker().pendientes.forEach(est => state.picker.seleccion.add(est.studentId || est.claveNombre)); repintar(); });
  modalForm.querySelector('[name="areaArtisticaId"]').addEventListener("change", event => {
    state.picker.areaId = event.target.value;
    modalForm.querySelector("#pickerModalidad").innerHTML = annualSystem.modalityField({}, event.target.value);
    state.picker.modalidadId = modalForm.querySelector('[name="modalidadPresentacionId"]').value;
    repintar();
  });
  modalForm.onchange = event => { if(event.target.matches('[name="modalidadPresentacionId"]')) { state.picker.modalidadId=event.target.value;repintar(); } };
  lista.addEventListener("change", event => {
    const check = event.target.closest("[data-pick]");
    if (!check) return;
    if (check.checked) state.picker.seleccion.add(check.dataset.pick);
    else state.picker.seleccion.delete(check.dataset.pick);
    repintar();
  });
  repintar();

  modalForm.onsubmit = async event => {
    event.preventDefault();
    const elegidos = state.ripEstudiantes.filter(e => state.picker.seleccion.has(e.studentId || e.claveNombre));
    if (!elegidos.length) return;
    const porConfirmar = elegidos.filter(est=>!coincideConFiltroArtistico(est,state.picker.areaId,state.picker.modalidadId));
    if (porConfirmar.length && !confirm('El perfil de RIP no confirma el área o modalidad elegida para: '+porConfirmar.map(est=>est.nombre).join(', ')+'. ¿Confirmas que participan en esta muestra? No se cambiarán sus datos de RIP.')) return;

    const nombreEnsamble = $("#pickerNombre")?.value.trim() || "";
    if (modo === "ensamble" && !nombreEnsamble) {
      toast("Ponle un nombre al ensamble.");
      return;
    }

    const base = annualSystem.normalizeParticipant({
      areaArtisticaId: modalForm.querySelector('[name="areaArtisticaId"]').value,
      modalidadPresentacionId: modalForm.querySelector('[name="modalidadPresentacionId"]').value,
      docente: modalForm.querySelector('[name="docente"]').value.trim(),
      area: "Música",
      estado: "Pendiente",
      prioridad: "Media",
      repertorio: "",
      genero: "Sin definir",
      createdAt: serverTimestamp(),
      createdByEmail: state.user.email,
      createdByName: state.user.displayName || state.user.email
    });

    try {
      const batch = writeBatch(db);
      const destino = collection(db, COLLECTION, state.selectedEventId, "muestras");

      if (modo === "ensamble") {
        batch.set(doc(destino), {
          ...base,
          estudianteGrupo: nombreEnsamble,
          studentId: "",
          esEnsamble: true,
          integrantes: elegidos.map(e => ({ studentId: e.studentId || "", nombre: e.nombre }))
        });
      } else {
        elegidos.forEach(est => {
          batch.set(doc(destino), {
            ...base,
            estudianteGrupo: est.nombre,
            studentId: est.studentId || "",
            esEnsamble: false
          });
        });
      }

      await batch.commit();
      modal.close();
      toast(modo === "ensamble"
        ? `Ensamble "${nombreEnsamble}" creado con ${elegidos.length} integrantes.`
        : `${elegidos.length} participante${elegidos.length === 1 ? "" : "s"} agregado${elegidos.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error(error);
      toast("No se pudieron agregar los participantes.");
    }
  };
}

/** Franja resumen sobre la tabla de participantes: duración, obras y repetidas. */
function resumenRepertorio() {
  const filas = state.childData.muestras;
  if (!filas.length) return "";
  const presentaciones = eventPresentations();
  const conteo = repertorioDelEvento();
  const repetidas = [...conteo.entries()].filter(([, usos]) => usos.length > 1);
  const sinObra = presentaciones.filter(row => !getParticipantWorks(row).length).length;
  const minutos = presentaciones.reduce((total, row) => total + (Number(row.duracionConocidaMin ?? row.duracionMin) || 0), 0);
  const tiemposPendientes = presentaciones.filter(row => row.duracionPendiente).length;
  const tiemposAnteriores = presentaciones.filter(row => !row.duracionPorObra && getParticipantWorks(row).length > 1).length;
  const ensambles = presentaciones.filter(participantIsEnsemble).length;
  const invitacionesEnviadas = filas.filter(row => ["Enviada", "Aceptada", "Rechazada"].includes(row.invitacionEstado)).length;
  const invitacionesAceptadas = filas.filter(row => row.invitacionEstado === "Aceptada").length;
  const totalInvitados = filas.reduce((total, row) => total + (row.tieneInvitados ? Number(row.invitadosCantidad) || 0 : 0), 0);

  const chips = [
    `<span class="badge neutral">${filas.length} inscripción${filas.length === 1 ? "" : "es"}</span>`,
    `<span class="badge neutral">${presentaciones.length} presentación${presentaciones.length === 1 ? "" : "es"} activa${presentaciones.length === 1 ? "" : "s"}</span>`,
    ensambles ? `<span class="badge info">${ensambles} ensamble${ensambles === 1 ? "" : "s"}</span>` : "",
    `<span class="badge neutral">${conteo.size} obra${conteo.size === 1 ? "" : "s"} distinta${conteo.size === 1 ? "" : "s"}</span>`,
    `<span class="badge info">${invitacionesEnviadas} invitación${invitacionesEnviadas === 1 ? "" : "es"} enviada${invitacionesEnviadas === 1 ? "" : "s"}</span>`,
    `<span class="badge success">${invitacionesAceptadas} aceptada${invitacionesAceptadas === 1 ? "" : "s"}</span>`,
    `<span class="badge neutral">${totalInvitados} invitado${totalInvitados === 1 ? "" : "s"}</span>`,
    tiemposPendientes ? `<span class="badge warning">Subtotal conocido: ${formatWorkTime(minutos)} · ${tiemposPendientes} duración${tiemposPendientes === 1 ? '' : 'es'} por revisar</span>` : minutos ? `<span class="badge neutral">≈ ${formatWorkTime(minutos)}</span>` : "",
    tiemposAnteriores ? `<span class="badge warning">${tiemposAnteriores} tiempo(s) anterior(es) por repartir entre obras</span>` : '',
    sinObra ? `<span class="badge warning">${sinObra} sin obra asignada</span>` : "",
    repetidas.length
      ? `<span class="badge danger">${repetidas.length} obra${repetidas.length === 1 ? "" : "s"} repetida${repetidas.length === 1 ? "" : "s"}</span>`
      : `<span class="badge success">Sin repeticiones</span>`
  ].filter(Boolean).join("");

  const detalle = repetidas.length
    ? `<p class="place-note" style="margin-top:8px;">${repetidas
        .map(([clave, usos]) => `<strong>${escapeHtml(obrasDe(usos[0]).find(o => ripNorm(o) === clave) || clave)}</strong>: ${usos.map(u => escapeHtml(u.estudianteGrupo || "?")).join(", ")}`)
        .join(" · ")}</p>`
    : "";

  return `<div class="resumen-repertorio">${chips}${detalle}${tiemposPendientes ? '<p class="field-hint">Revisa las duraciones pendientes en Participantes. Si una ficha mezcla obras solistas y compartidas, confirma sólo los minutos por obra; el tiempo del ensamble se cuenta una vez.</p>' : ''}</div>`;
}

function ensembleIndex() {
  const sources = [state.childData.muestras, state.selectedEventId];
  if (!sameReferences(ensembleParticipationCache?.sources, sources)) {
    // The document path identifies this event, including imported legacy records.
    ensembleParticipationCache = { sources, index: buildEnsembleParticipationIndex(state.childData.muestras.map(eventParticipant)) };
  }
  return ensembleParticipationCache.index;
}

function eventParticipant(row = {}) { return { ...row, eventoId: state.selectedEventId, eventId: state.selectedEventId }; }
function participantEnsembles(row) { return getParticipantEnsembles(eventParticipant(row), ensembleIndex()); }
function participantWorks(row) { return getEffectiveParticipantWorks(eventParticipant(row), ensembleIndex()); }
function participantSoloWorks(row) { return getIndividualSoloWorks(eventParticipant(row), ensembleIndex()); }
function participantWorkEnsembles(row, work) { return getEnsemblesForParticipantWork(eventParticipant(row), work, ensembleIndex()); }
function participantDuration(row) { return getParticipantDuration(eventParticipant(row), ensembleIndex()); }
function isCancelledParticipant(row) { return normalizarNombre(row?.estado) === 'cancelado'; }
function eventPresentations() { return buildPresentationCatalogue(ensembleIndex()).filter(row => !isCancelledParticipant(row)); }

function participantDurationCell(row) {
  const duration = participantDuration(row);
  if (duration.mode === 'ensemble-only') return '<span class="field-hint">Tiempo incluido en el ensamble</span>';
  if (duration.needsReview) return '<span class="badge warning">Tiempo por completar</span>';
  if (!row.duracionPorObra && obrasDe(row).length > 1) return `<span class="field-hint">${escapeHtml(formatWorkTime(duration.minutes))} anteriores · repartir por obra</span>`;
  return `${escapeHtml(formatWorkTime(duration.minutes))} (min:seg)${duration.mode === 'mixed-confirmed' ? ' solistas' : ''}`;
}

function ensembleMembersText(group) {
  return normalizeEnsembleMembers(group.integrantes).map(member => `${member.nombre}${member.instrumento ? ` (${member.instrumento})` : ''}`).join(' · ');
}

function participantEnsembleContext(row) {
  if (participantIsEnsemble(row)) return '';
  const groups = participantEnsembles(row);
  const active = groups.some(group => !isCancelledParticipant(group));
  const help = active ? participantSoloWorks(row).length ? 'También conserva obras solistas. Completa los minutos junto a cada obra solista; el tiempo compartido se registra en el ensamble.' : 'Esta inscripción conserva su invitación e invitados. Su presentación y duración se cuentan en el ensamble.' : '';
  return groups.map(group => `<article class="ensemble-assignment"><strong>${escapeHtml(group.estudianteGrupo || 'Ensamble')}${isCancelledParticipant(group) ? ' · cancelado' : ''}</strong><div>${getParticipantWorks(group).map(escapeHtml).join('<br>')}</div><p class="field-hint">${escapeHtml(ensembleMembersText(group))}</p></article>`).join('') + (help ? `<p class="field-hint">${help}</p>` : '');
}

function participantWorkCell(row, work, counts) {
  const groups = participantIsEnsemble(row) ? [row] : participantWorkEnsembles(row, work);
  const repeated = counts.get(ripNorm(work))?.length > 1 ? '<span class="badge danger">Repetida</span>' : '';
  const shared = groups.map(group => `<div><span class="badge info">Ensamble</span><div class="field-hint">${escapeHtml(group.estudianteGrupo || 'Presentación compartida')}<br>${escapeHtml(ensembleMembersText(group))}</div><button type="button" class="small-btn" data-edit-ensemble="${escapeHtml(group.id)}">${participantIsEnsemble(row) ? 'Editar integrantes' : 'Ver ensamble'}</button></div>`).join('');
  const ownIndex = obrasDe(row).findIndex(title => normalizarNombre(title) === normalizarNombre(work));
  const action = groups.length || ownIndex < 0 ? '' : `<button type="button" class="small-btn" data-assemble-source="${escapeHtml(row.id)}" data-assemble-index="${ownIndex}">Armar ensamble</button>`;
  const source = groups.length === 1 ? groups[0] : groups.length ? null : row;
  const minutes = source ? getWorkMinutes(source, work) : null;
  const time = row.areaArtisticaId === 'artes-plasticas' ? '' : `<span class="badge ${minutes === null ? 'warning' : 'neutral'}">${minutes === null ? 'Duración por definir' : `${escapeHtml(formatWorkTime(minutes))}`}</span>`;
  return `<div class="ensemble-work">${escapeHtml(work)} ${time}${repeated}${shared}${action}</div>`;
}

/* ============ Control de repertorio (que no se repitan obras) ============ */

/** Lista de obras de una presentación (admite registros antiguos con una sola obra). */
function obrasDe(row = {}) {
  if (Array.isArray(row.repertorios) && row.repertorios.length) {
    return row.repertorios.map(o => String(o || "").trim()).filter(Boolean);
  }
  const texto = String(row.repertorio || "").trim();
  return texto ? [texto] : [];
}

function workGenre(row, work) {
 const entries=Array.isArray(row.generosObras)?row.generosObras:[];
 return entries.find(item=>normalizarNombre(item.obra)===normalizarNombre(work))?.genero || row.genero || 'Sin definir';
}

function campoObra(valor = "", minutos = null, genero = "Sin definir") {
  return `<div class="obra-item">
    <label>Obra / actividad<input name="repertorioItem" list="bancoRepertorio" value="${escapeHtml(valor)}" placeholder="Escribe la obra o elígela del banco" /></label>
    <label>Duración (min:seg)<input type="text" name="duracionObra" pattern="[0-9]+:[0-5][0-9]" value="${escapeHtml(formatWorkTime(minutos))}" placeholder="4:05" title="Minutos y segundos, por ejemplo 4:05" /></label><label>Género<select name="generoObra">${opcionesConSeleccion(listaParticipantes("generos", GENEROS), genero)}</select></label>
    <button type="button" class="ghost obra-quitar" title="Quitar obra" aria-label="Quitar obra">✕</button>
    <small class="obra-tiempo-hint field-hint"></small>
  </div>`;
}

/** Cuenta cuántas veces se usa cada obra en el evento abierto. */
function repertorioDelEvento() {
  const conteo = new Map();
  eventPresentations().forEach(row => {
    new Set(getParticipantWorks(row).map(o => ripNorm(o))).forEach(clave => {
      if (!clave) return;
      if (!conteo.has(clave)) conteo.set(clave, []);
      conteo.get(clave).push(row);
    });
  });
  return conteo;
}

/**
 * Avisos de repertorio: si la obra ya la toca alguien más en este evento,
 * o si el propio estudiante ya la presentó en un evento anterior.
 */
function avisoRepertorio(obra, { excluirId = "", estudiante = "", studentId = "", esEnsamble = false, presentationPreview = null, draftId = '' } = {}) {
  const clave = ripNorm(obra);
  if (!clave) return "";

  const shared = !esEnsamble ? participantWorkEnsembles({ id: excluirId, studentId }, obra) : [];
  const count = presentationPreview ? presentationPreview.filter(row => !isCancelledParticipant(row) && row.id !== draftId && getParticipantWorks(row).some(title => ripNorm(title) === clave)) : repertorioDelEvento().get(clave) || [];
  const enEvento = count.filter(row => row.id !== excluirId && !shared.some(group => group.id === row.id));
  if (enEvento.length) {
    const quienes = enEvento.map(r => r.estudianteGrupo || "otro participante").join(", ");
    return `⚠️ Repetida en este evento: ya la presenta ${quienes}.`;
  }
  if (shared.length) return `Ensamble: ${shared.map(group => group.estudianteGrupo || 'Presentación compartida').join(', ')}. Se cuenta una sola presentación.`;

  const propias = state.participaciones.get(String(studentId).trim())
    || state.participaciones.get(ripNorm(estudiante))
    || [];
  const anterior = propias.find(p => p.eventoId !== state.selectedEventId && (p.repertorios?.length ? p.repertorios : [p.repertorio || ""]).some(o => ripNorm(o) === clave));
  if (anterior) return `ℹ️ Este estudiante ya la presentó en "${anterior.eventoTitulo}".`;

  return "✅ Obra libre en este evento.";
}

function mostrarVista(vista) {
  state.vistaPrincipal = vista;
  annualView.classList.toggle("hidden", vista !== "anual");
  $("#annualBtn").classList.toggle("active-view", vista === "anual");
  kpis.classList.toggle("hidden", vista === "anual");
  if (vista === "anual") {
    $("#studentsBtn").classList.remove("active-view");
    eventDetail.classList.add("hidden");
    emptyState.classList.add("hidden");
    pageTitle.textContent = "Sistema anual de Muestras Artísticas";
    annualSystem.render();
    return;
  }
  $("#studentsBtn").classList.toggle("active-view", vista === "estudiantes");
  if (vista === "estudiantes") {
    renderEstudiantes();
    if (state.ripEstado === "desconectado") conectarRip();
  } else {
    renderKpis();
    renderDetail();
  }
}

function listenPersonas() {
  if (state.unsubPersonas) state.unsubPersonas();
  state.unsubPersonas = onSnapshot(collection(db, "personas"), snapshot => {
    state.personas = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
    refreshPeopleList();
  }, error => {
    console.error(error);
    toast(explicarError(error, "No pude leer la base de personas"));
  });
}

function listenTeacherCalls() {
  if (state.unsubConvocatoriasDocentes) state.unsubConvocatoriasDocentes();
  state.unsubConvocatoriasDocentes = onSnapshot(collection(db, "convocatoriasDocentes"), snapshot => {
    state.convocatoriasDocentes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    syncDatalists();
  }, error => {
    console.error(error);
    toast(explicarError(error, "No pude leer los nombres ya habilitados en las muestras"));
  });
}

function clearChildListeners() {
  state.unsubChildren.forEach(unsub => unsub && unsub());
  state.unsubChildren = [];
  state.childData = emptyChildData();
}

function listenChildren(eventId) {
  clearChildListeners();
  CHILD_COLLECTIONS.forEach(child => {
    const unsub = onSnapshot(collection(db, COLLECTION, eventId, child), snapshot => {
      state.childData[child] = snapshot.docs
        .map(docSnap => ({ ...docSnap.data(), id: docSnap.id }))
        .sort((a, b) => {
          if (child === 'programacion') return Number(!a.hora) - Number(!b.hora)
            || momentDay(a) - momentDay(b)
            || String(a.hora || '99:99').localeCompare(String(b.hora || '99:99'))
            || Number(a.createdAt?.seconds || 0) - Number(b.createdAt?.seconds || 0)
            || String(a.id).localeCompare(String(b.id));
          return String(a.fechaLimite || a.fecha || a.createdAt?.seconds || "").localeCompare(String(b.fechaLimite || b.fecha || b.createdAt?.seconds || ""));
        });
      syncDatalists();
      renderDetail();
    }, error => {
      console.error(error);
      toast(explicarError(error, `No pude leer ${child}`));
    });
    state.unsubChildren.push(unsub);
  });
}

function applyFilters() {
  const search = $("#searchInput").value.toLowerCase().trim();
  const type = $("#typeFilter").value;
  const status = $("#statusFilter").value;
  state.filteredEventos = state.eventos.filter(evento => {
    const haystack = `${evento.titulo || ""} ${evento.lugar || ""} ${evento.responsable || ""} ${evento.objetivo || ""}`.toLowerCase();
    const cerrado = ["Realizado", "No realizado", "Archivado"].includes(evento.estado);
    const verCerrados = state.mostrarHistorialEventos || Boolean(status);
    return (!search || haystack.includes(search)) && (!type || evento.tipo === type) && (!status || evento.estado === status) && (verCerrados || !cerrado);
  });
  actualizarBotonHistorial();
  renderEventList();
}

function actualizarBotonHistorial() { const boton=$("#historyBtn");if(!boton)return;boton.classList.toggle("active-view",state.mostrarHistorialEventos);boton.textContent=state.mostrarHistorialEventos?"🗂️ Ocultar historial de eventos":"🗂️ Ver historial de eventos"; }

function renderEventList() {
  if (!state.filteredEventos.length) {
    eventList.innerHTML = `<div class="empty-state" style="padding: 22px;"><strong>No hay eventos</strong><p>La nada organizada. Curiosamente tranquila.</p></div>`;
    return;
  }
  eventList.innerHTML = state.filteredEventos.map(evento => `
    <button class="event-card ${evento.id === state.selectedEventId ? "active" : ""}" data-event-id="${evento.id}">
      <strong>${escapeHtml(evento.titulo || "Evento sin título")}</strong>
      <div class="event-card-meta">
        ${badge(evento.estado)}
        <span class="badge neutral">${escapeHtml(evento.tipo || "Evento")}</span>
        <span class="badge neutral">${normalizeDate(evento.fechaInicio)}${evento.horaInicio ? ` · ${escapeHtml(evento.horaInicio)}` : ""}</span>
      </div>
      <span class="muted">${escapeHtml(evento.responsable || "Sin responsable")}</span>
    </button>
  `).join("");
  $$("[data-event-id]").forEach(btn => {
    btn.addEventListener("click", () => selectEvent(btn.dataset.eventId));
  });
}

function renderKpis() {
  const eventos = state.eventos;
  const active = eventos.filter(e => !["Archivado", "Realizado", "No realizado"].includes(e.estado)).length;
  const risk = eventos.filter(e => e.estado === "En riesgo").length;
  const ready = eventos.filter(e => ["Listo", "Realizado"].includes(e.estado)).length;
  const muestras = eventos.filter(e => e.tipo === "Muestra de proceso").length;
  kpis.innerHTML = [
    ["Eventos activos", active],
    ["Muestras", muestras],
    ["Listos / realizados", ready],
    ["En riesgo", risk]
  ].map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`).join("");
}

function selectEvent(eventId) {
  if (state.vistaPrincipal !== "eventos") mostrarVista("eventos");
  state.selectedEventId = eventId;
  state.selectedEvent = state.eventos.find(evento => evento.id === eventId) || null;
  state.tab = "actividades";
  listenChildren(eventId);
  renderEventList();
  renderDetail();
}

function clearSelection() {
  state.selectedEventId = null;
  state.selectedEvent = null;
  clearChildListeners();
  renderDetail();
}

function calculateProgress() {
  const activities = state.childData.actividades.filter(item => normalizeActivityState(item.estado) !== "Cancelada");
  const cancelledActivities = state.childData.actividades.length - activities.length;
  const others = [...state.childData.muestras, ...state.childData.checklist];
  const total = activities.length + others.length;
  const done = activities.filter(item => normalizeActivityState(item.estado) === "Terminada").length
    + others.filter(item => ["Listo", "Confirmado", "Realizado"].includes(item.estado)).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, cancelledActivities };
}

function renderDetail() {
  if (state.vistaPrincipal !== "eventos") return;
  if (!state.selectedEvent) {
    teacherAdmin.stop();
    emptyState.classList.remove("hidden");
    eventDetail.classList.add("hidden");
    pageTitle.textContent = "Seguimiento de eventos";
    return;
  }

  emptyState.classList.add("hidden");
  eventDetail.classList.remove("hidden");
  pageTitle.textContent = state.selectedEvent.titulo || "Evento sin título";

  const evento = state.selectedEvent;
  const progress = calculateProgress();
  const tabs = [
    ["actividades", "Actividades"],
    ["muestras", "Participantes"],
    ["programacion", "Minuto a minuto"],
    ["equipo", "Equipo"],
    ["rider", "Rider técnico"],
    ["checklist", "Pendientes"],
    ["partituras", "Partituras"]
  ];
  const permiteTablero = KANBAN_TABS.includes(state.tab);

  eventDetail.innerHTML = `
    <section class="panel hero-event">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">${escapeHtml(evento.tipo || "Evento")}</p>
          <h3>${escapeHtml(evento.titulo || "Evento sin título")}</h3>
          <div class="event-card-meta">
            ${badge(evento.estado)}
            <span class="badge neutral">Prioridad: ${escapeHtml(evento.prioridad || "Media")}</span>
            <span class="badge neutral">${normalizeDate(evento.fechaInicio)}${evento.horaInicio ? ` · ${escapeHtml(evento.horaInicio)}` : ""}</span>
          </div>
          <p class="muted">${escapeHtml(evento.objetivo || "Sin objetivo todavía.")}</p>
          <div class="actions">
            ${!["Realizado", "No realizado", "Archivado"].includes(evento.estado) ? `<button class="btn btn-light" data-action="mark-realized">✓ Marcar realizado</button><button class="btn btn-light" data-action="mark-not-realized">⊘ No se realizó</button>` : `<span class="field-hint">Este evento está en el historial. Puedes cambiar su estado desde Editar evento si fue necesario corregirlo.</span>`}
            <button class="btn btn-light" data-action="edit-event">Editar evento</button>
            <button class="btn btn-light" data-action="export-event">Exportar evento</button>
            <button class="btn btn-light" data-action="import-event">Importar JSON</button>
            <button class="btn btn-danger" data-action="archive-event">Archivar</button>
            <button class="btn btn-danger" data-action="delete-event">Eliminar definitivamente</button>
          </div>
        </div>
        <div class="info-grid">
          <div class="info-box"><span>Responsable</span><strong>${escapeHtml(evento.responsable || "Sin definir")}</strong></div>
          <div class="info-box"><span>Lugar</span><strong>${escapeHtml(evento.lugar || "Sin definir")}</strong></div>
          <div class="info-box"><span>Público</span><strong>${escapeHtml(evento.publico || "Sin definir")}</strong></div>
          <div class="info-box"><span>Sillas del evento</span><strong>${escapeHtml(evento.sillasCantidad === '' || evento.sillasCantidad == null ? 'Por definir' : evento.sillasCantidad)}</strong></div><div class="info-box"><span>Ventiladores</span><strong>${escapeHtml(evento.ventiladoresCantidad === '' || evento.ventiladoresCantidad == null ? 'Por definir' : evento.ventiladoresCantidad)}</strong></div>
          <div class="info-box"><span>Presupuesto</span><strong>${escapeHtml(evento.presupuesto || "Sin definir")}</strong></div>
          <div class="info-box wide"><span>Notas</span><strong>${escapeHtml(evento.notas || "Sin notas")}</strong></div>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar"><div style="width:${progress.percent}%"></div></div>
        <div class="progress-meta"><span>Avance operativo</span><strong>${progress.done}/${progress.total} ítems · ${progress.percent}%</strong></div>
        ${progress.cancelledActivities ? `<p class="field-hint">${progress.cancelledActivities} actividad${progress.cancelledActivities === 1 ? '' : 'es'} cancelada${progress.cancelledActivities === 1 ? '' : 's'} · fuera del cálculo de avance</p>` : ''}
      </div>
    </section>

    ${evento.tipo === "Muestra de proceso" ? annualSystem.panel(eventPresentations()) : ""}
    <section class="panel teacher-admin-panel" id="teacherAdminPanel"></section>
    <section class="panel">
      <div class="row-between">
        <div class="tabs">
          ${tabs.map(([key, label]) => `<button class="tab-btn ${state.tab === key ? "active" : ""}" data-tab="${key}">${label} (${state.childData[key].length})</button>`).join("")}
        </div>
        <div class="top-actions">
          ${permiteTablero ? `
            <div class="view-toggle">
              <button class="view-btn ${state.vista === "tabla" ? "active" : ""}" data-vista="tabla" title="Ver como tabla">Tabla</button>
              <button class="view-btn ${state.vista === "tablero" ? "active" : ""}" data-vista="tablero" title="Ver como tablero">Tablero</button>
            </div>` : ""}
          ${state.tab === "muestras" ? `
            <button class="btn btn-ghost" data-action="pick-students">👥 Del padrón</button>
            <button class="btn btn-ghost" data-action="new-ensemble">🎻 Ensamble</button>
            <button class="btn btn-ghost" data-action="config-participant-lists">⚙️ Configurar listas</button>` : ""}
          <button class="btn btn-primary" data-action="add-child">${state.tab === "partituras" ? "+ Subir archivo" : "+ Agregar"}</button>
        </div>
      </div>
      ${state.tab === "muestras" ? resumenRepertorio()+participantControls() : ""}
      <div class="table-panel ${state.tab === "muestras" ? "participants-table-panel" : ""}" id="tabContent">${renderTabContent(state.tab)}</div>
    </section>
  `;

  eventDetail.querySelectorAll('[data-participant-filter]').forEach(input=>input.addEventListener('change',()=>{participantView()[input.dataset.participantFilter]=input.value;renderDetail();}));
  eventDetail.querySelectorAll('[data-participant-status]').forEach(button=>button.addEventListener('click',()=>{participantView().estado=button.dataset.participantStatus;renderDetail();}));
  eventDetail.querySelector('[data-participant-reset]')?.addEventListener('click',()=>{Object.assign(participantView(),{estado:'Todos',invitacion:'Todas'});renderDetail();});
  $$("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
    state.tab = btn.dataset.tab;
    renderDetail();
  }));
  $$("[data-vista]").forEach(btn => btn.addEventListener("click", () => {
    state.vista = btn.dataset.vista;
    renderDetail();
  }));
  $$("[data-action]").forEach(btn => btn.addEventListener("click", () => handleAction(btn.dataset.action)));
  eventDetail.querySelectorAll('[data-assemble-source]').forEach(button => button.addEventListener('click', () => openEnsembleForWork(button.dataset.assembleSource, Number(button.dataset.assembleIndex))));
  eventDetail.querySelectorAll('[data-edit-ensemble]').forEach(button => button.addEventListener('click', () => {
    const group = state.childData.muestras.find(row => row.id === button.dataset.editEnsemble);
    if (group) openChildDialog('muestras', group);
  }));
  attachBoardDragAndDrop();
  teacherAdmin.mount($("#teacherAdminPanel"), evento);
  if (state.tab === "rider") stagePlots.mount($("#stagePlotsPanel"));
  if (state.tab === "partituras") scores.mount(eventDetail);
}

/** Arrastrar tarjetas entre columnas para cambiar el estado. */
function attachBoardDragAndDrop() {
  let arrastrando = null;

  $$(".board-item").forEach(card => {
    card.addEventListener("dragstart", event => {
      arrastrando = card.dataset.card;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", arrastrando);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      arrastrando = null;
      $$(".board-drop").forEach(zone => zone.classList.remove("over"));
    });
  });

  $$(".board-drop").forEach(zone => {
    zone.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      zone.classList.add("over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", event => {
      event.preventDefault();
      zone.classList.remove("over");
      const payload = event.dataTransfer.getData("text/plain") || arrastrando;
      if (!payload) return;
      const [tab, id] = payload.split(":");
      moveCard(tab, id, zone.dataset.drop);
    });
  });
}

/** Resumen corto de un registro para la tarjeta del tablero. */
function kanbanMeta(tab, row) {
  const chips = [];
  const persona = row.responsable || row.docente || row.encargado || row.proveedor || row.rol;
  if (persona) chips.push(`👤 ${persona}`);
  const fecha = row.fechaLimite || row.fecha;
  if (fecha) chips.push(`📅 ${normalizeDate(fecha)}`);
  if (row.hora) chips.push(`⏱️ ${row.hora}`);
  if (row.area && row.area !== "General") chips.push(`🎨 ${row.area}`);
  if (row.categoria) chips.push(`🏷️ ${row.categoria}`);
  if (row.bloque) chips.push(`🎬 ${row.bloque}`);
  if (row.tipo && tab === "documentos") chips.push(`📄 ${row.tipo}`);
  if (row.cantidad) chips.push(`× ${row.cantidad}`);
  return chips.map(chip => `<span>${escapeHtml(chip)}</span>`).join("");
}

function prioridadClase(prioridad) {
  return { "Crítica": "danger", "Alta": "warning", "Media": "neutral", "Baja": "neutral" }[prioridad] || "neutral";
}

function renderKanban(tab) {
  const rows = state.childData[tab] || [];
  const columns = boardColumns(tab);
  const columnas = columns.map(col => ({
    ...col,
    items: rows.filter(row => col.estados.includes(boardState(tab, row.estado)))
  }));
  // Cualquier estado raro cae en la primera columna para que nada se pierda.
  const conocidos = columns.flatMap(col => col.estados);
  const huerfanos = rows.filter(row => !conocidos.includes(boardState(tab, row.estado)));
  columnas[0].items = [...columnas[0].items, ...huerfanos];

  return `<div class="board">${columnas.map(col => `
    <section class="board-col" data-col="${col.id}">
      <header class="board-col-head">
        <span>${escapeHtml(col.nombre)}</span>
        <span class="board-count">${col.items.length}</span>
      </header>
      <div class="board-drop" data-drop="${col.id}">
        ${col.items.map(row => {
          const titulo = row[TITULO_CAMPO[tab]] || "Sin título";
          const meta = kanbanMeta(tab, row);
          return `
            <article class="board-item" draggable="true" data-card="${tab}:${row.id}">
              <div class="board-item-top">
                <strong>${escapeHtml(titulo)}</strong>
                ${row.prioridad ? `<span class="badge ${prioridadClase(row.prioridad)}">${escapeHtml(row.prioridad)}</span>` : ""}
              </div>
              ${meta ? `<div class="board-item-meta">${meta}</div>` : ""}
              ${row.notas ? `<p class="board-item-note">${escapeHtml(row.notas)}</p>` : ""}
            </article>`;
        }).join("") || `<p class="board-empty">Nada aquí</p>`}
      </div>
    </section>`).join("")}</div>`;
}

/** Mueve un registro al soltarlo en otra columna del tablero. */
async function moveCard(tab, id, columnaId) {
  const columna = boardColumns(tab).find(col => col.id === columnaId);
  const row = getChildById(tab, id);
  if (!columna || !row || columna.estados.includes(boardState(tab, row.estado))) return;
  try {
    await updateDoc(doc(db, COLLECTION, state.selectedEventId, tab, id), {
      estado: columna.estado,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email
    });
    toast(`Movido a "${columna.nombre}".`);
  } catch (error) {
    console.error(error);
    toast("No se pudo mover el registro.");
  }
}

const participantViews = new Map();
function participantView(){const key=state.selectedEventId;if(!participantViews.has(key))participantViews.set(key,{estado:'Todos',invitacion:'Todas',orden:'estado'});return participantViews.get(key);}
function participantControls(){
 const rows=state.childData.muestras||[],view=participantView();
 const statuses=[...new Set(['Confirmado','Pendiente','Cancelado',...rows.map(row=>row.estado||'Pendiente')])];
 return '<div class="participant-controls" style="margin:16px 0"><div class="form-grid"><label>Estado de participación<select data-participant-filter="estado">'+opcionesConSeleccion(['Todos',...statuses],view.estado)+'</select></label><label>Invitación<select data-participant-filter="invitacion">'+opcionesConSeleccion(['Todas','Pendiente','Enviada','Aceptada','Rechazada'],view.invitacion)+'</select></label><label>Ordenar por<select data-participant-filter="orden">'+[['estado','Estado y nombre'],['nombre','Nombre'],['registro','Orden de registro']].map(([value,label])=>'<option value="'+value+'" '+(view.orden===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">'+statuses.filter(status=>rows.some(row=>(row.estado||'Pendiente')===status)).map(status=>'<button type="button" class="small-btn" data-participant-status="'+escapeHtml(status)+'" aria-pressed="'+(view.estado===status)+'">'+escapeHtml(status)+' ('+rows.filter(row=>(row.estado||'Pendiente')===status).length+')</button>').join('')+'<button type="button" class="small-btn" data-participant-reset>Ver todos ('+rows.length+')</button></div><p class="field-hint">Los contadores corresponden a inscripciones, incluidos ensambles. Estado de participación e invitación se consultan por separado. Los filtros no cambian los totales del evento.</p></div>';
}
function participantVisibleRows(rows){
 const view=participantView(),order=['Confirmado','Pendiente','En curso','Listo','Realizado','En riesgo','Bloqueado','Cancelado'];
 const selected=rows.filter(row=>(view.estado==='Todos'||(row.estado||'Pendiente')===view.estado)&&(view.invitacion==='Todas'||(row.invitacionEstado||'Pendiente')===view.invitacion));
 if(view.orden==='registro')return selected;
 return [...selected].sort((a,b)=>{const rank=status=>{const i=order.indexOf(status||'Pendiente');return i<0?order.length:i;};return (view.orden==='estado'?rank(a.estado)-rank(b.estado):0)||String(a.estudianteGrupo||'').localeCompare(String(b.estudianteGrupo||''),'es');});
}

function renderTabContent(tab) {
  if (tab === "partituras") return scores.render();
  if (tab === "rider") return `<div id="stagePlotsPanel"></div>${renderRiderRecords()}`;
  const rows = state.childData[tab] || [];
  if (!rows.length) {
    return `<div class="empty-state"><h3>Sin registros</h3><p>Agrega el primer registro para que esto deje de ser una intención bonita flotando en el vacío.</p></div>`;
  }

  if (state.vista === "tablero" && KANBAN_TABS.includes(tab)) return renderKanban(tab);

  if (tab === "documentos") {
    return table(["Documento", "Tipo", "Responsable", "Fecha límite", "Estado", "Enlace", "Notas", ""], rows.map(row => [
      escapeHtml(row.titulo || "Sin título"),
      escapeHtml(row.tipo || ""),
      escapeHtml(row.responsable || ""),
      normalizeDate(row.fechaLimite),
      badge(row.estado),
      row.url ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : "",
      escapeHtml(row.notas || ""),
      rowActions(tab, row.id)
    ]));
  }

  if (tab === "actividades") {
    return table(["Actividad", "Área", "Fecha", "Responsable", "Estado", "Prioridad", "Notas", ""], rows.map(row => [
      escapeHtml(row.titulo || "Sin título"),
      escapeHtml(row.area || "General"),
      normalizeDate(row.fechaLimite || row.fecha),
      escapeHtml(row.responsable || ""),
      badge(normalizeActivityState(row.estado)),
      escapeHtml(row.prioridad || "Media"),
      escapeHtml(row.notas || ""),
      rowActions(tab, row.id)
    ]));
  }

  if (tab === "muestras") {
    const conteoObras = repertorioDelEvento();
    const visible=participantVisibleRows(rows);
    const notice='<p class="field-hint" role="status">Mostrando '+visible.length+' de '+rows.length+' inscripciones.</p>';
    if(!visible.length)return notice+'<p>No hay participantes que coincidan con estos filtros. Pulsa Ver todos para recuperar el listado.</p>';
    return notice+table(["Estudiante / grupo", "Área artística", "Trayectoria del estudiante", "Modalidad", "Repertorio / actividad / obra", "Género", "Docente", "Bloque", "Tiempo contabilizado", "Estado", "Invitación", "Invitados", "Recursos", ""], visible.map(row => [
      participantIsEnsemble(row)
        ? `<strong>${escapeHtml(row.estudianteGrupo || "Ensamble")}</strong>
           <span class="badge info">Ensamble</span><div class="field-hint">${normalizeEnsembleMembers(row.integrantes).map(member => `${escapeHtml(member.nombre)} · ${escapeHtml(member.instrumento || 'Instrumento por definir')}`).join('<br>')}</div>`
        : `${escapeHtml(row.estudianteGrupo || "Sin nombre")}${participantEnsembles(row).length ? '<div><span class="badge info">Participa en ensamble</span></div>' : ''}`,
      escapeHtml(annualSystem.areaName(row.areaArtisticaId, row.area || "Música")),
      participantIsEnsemble(row)?`<details><summary>Ruta de cada integrante</summary>${normalizeEnsembleMembers(row.integrantes).map(member=>`<div><strong>${escapeHtml(member.nombre)}</strong>${sampleRoutes.summary(member,row.areaArtisticaId||'musica',row)}</div>`).join('')}</details>`:sampleRoutes.summary(row,row.areaArtisticaId||'musica',row),
      escapeHtml(annualSystem.modalityName(row.areaArtisticaId || "musica", row.modalidadPresentacionId || row.familiaInstrumentalId, row.modalidadPresentacionNombre || row.familiaInstrumentalNombre || "Sin asignar")),
      participantWorks(row).map(obra => participantWorkCell(row, obra, conteoObras)).join(''),
      getParticipantWorks(row).map(work=>({work,genre:workGenre(row,work)})).filter(item=>item.genre!=="Sin definir").map(item=>`<div><small>${escapeHtml(item.work)}</small><br><span class="badge info">${escapeHtml(item.genre)}</span></div>`).join(""),
      escapeHtml(row.docente || ""),
      escapeHtml(row.bloque || ""),
      participantDurationCell(row),
      badge(row.estado),
      `<span class="badge ${row.invitacionEstado === "Aceptada" ? "success" : row.invitacionEstado === "Enviada" ? "info" : row.invitacionEstado === "Rechazada" ? "danger" : "neutral"}">${escapeHtml(row.invitacionEstado || "Pendiente")}</span>${row.invitacionFechaEnvio ? `<div class="muted" style="font-size:.78rem">${normalizeDate(row.invitacionFechaEnvio)}</div>` : ""}`,
      row.tieneInvitados ? `${escapeHtml(row.invitadosCantidad || 0)} invitado${Number(row.invitadosCantidad) === 1 ? "" : "s"}` : "Sin invitados",
      escapeHtml(row.recursos || ""),
      rowActions(tab, row.id)
    ]));
  }

  if (tab === "checklist") {
    return table(["Ítem", "Categoría", "Responsable", "Fecha límite", "Estado", "Prioridad", "Notas", ""], rows.map(row => [
      escapeHtml(row.item || "Sin ítem"),
      escapeHtml(row.categoria || "General"),
      escapeHtml(row.responsable || ""),
      normalizeDate(row.fechaLimite),
      badge(row.estado),
      escapeHtml(row.prioridad || "Media"),
      escapeHtml(row.notas || ""),
      rowActions(tab, row.id)
    ]));
  }

  if (tab === "programacion") {
    const next = getNextMoment(rows);
    const warnings = getProgrammeEnsembleWarnings(rows.map(eventParticipant), state.childData.muestras.map(eventParticipant), { getGroupsForWork: participantWorkEnsembles, isEnsemble: participantIsEnsemble });
    const nextHint = next.hora
      ? `<strong>Siguiente hora: ${escapeHtml(momentTimeLabel(next))}</strong><span>Se completa al agregar un momento.</span>`
      : `<span>${escapeHtml(next.reason)}</span>`;
    return `<div class="progress-meta" role="status">${nextHint}</div>` + table(["Hora", "Momento / actividad", "Encargado", "Duración", "Montaje / transición", ""], rows.map(row => [
      momentTimeCell(row),
      momentTitle(row) + (warnings.get(row.id) || []).map(message => `<p class="field-hint hint-alerta">${escapeHtml(message)}</p>`).join(''), escapeHtml(row.encargado || ""), row.duracionMin != null && row.duracionMin !== '' ? `${escapeHtml(formatWorkTime(row.duracionMin))} (min:seg)` : "",
      escapeHtml(row.montaje || ""), rowActions(tab, row.id)
    ]));
  }

  if (tab === "equipo") {
    return table(["Persona", "Rol", "Zona / bloque", "Horario", "Confirmación", ""], rows.map(row => [
      escapeHtml(row.nombre || ""), escapeHtml(row.rol || ""), escapeHtml(row.zona || ""),
      escapeHtml(row.horario || ""), badge(normalizeTeamState(row.estado)), rowActions(tab, row.id)
    ]));
  }



  return table(["Fecha", "Tipo", "Comentario", "Creado por", ""], rows.map(row => [
    row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString("es-CO") : "",
    escapeHtml(row.tipo || "Nota"),
    escapeHtml(row.comentario || ""),
    escapeHtml(row.createdByName || row.createdByEmail || ""),
    rowActions(tab, row.id)
  ]));
}

function momentDay(row) {
  const day = Number(row?.diaPrograma || 0);
  return Number.isSafeInteger(day) && day >= 0 ? day : 0;
}

function momentTimeLabel(row) {
  const day = momentDay(row);
  return `${row.hora || ''}${day > 0 ? ` (día ${day + 1})` : ''}`;
}

function momentTimeCell(row) {
  const end = getMomentEnd(row);
  return escapeHtml(momentTimeLabel(row)) + (end ? `<div class="field-hint">Hasta ${escapeHtml(momentTimeLabel(end))}</div>` : '');
}

function momentTitle(row) {
  const preset = getMomentPreset(resolveMomentType(row));
  const category = preset && normalizarNombre(preset.label) !== normalizarNombre(row.item)
    ? `<div class="field-hint">${escapeHtml(preset.label)}</div>` : '';
  const presentation = resolveMomentType(row) === 'presentacion' && (row.participanteId || row.estudianteGrupo || getParticipantWorks(row).length)
    ? `<div class="field-hint"><strong>Estudiante / grupo: ${escapeHtml(row.estudianteGrupo || 'Participante')}</strong></div>${getParticipantWorks(row).map(work => `<div>${escapeHtml(work)}</div>`).join('')}` : '';
  return escapeHtml(row.item || '') + category + presentation;
}

function momentParticipantOptions(row = {}) {
  const participants = [...eventPresentations()].sort((a, b) => String(a.estudianteGrupo || '').localeCompare(String(b.estudianteGrupo || ''), 'es'));
  const names = new Map();
  for (const participant of participants) {
    const key = normalizarNombre(participant.estudianteGrupo || participant.nombrePresentacion);
    names.set(key, (names.get(key) || 0) + 1);
  }
  const selectedId = row.participanteId || '';
  const options = participants.map((participant, index) => {
    const name = participant.estudianteGrupo || participant.nombrePresentacion || 'Participante';
    const repeated = names.get(normalizarNombre(name)) > 1;
    const detail = repeated ? ` · inscripción ${index + 1}${getParticipantWorks(participant)[0] ? ` · ${getParticipantWorks(participant)[0].slice(0, 60)}` : ''}` : participantIsEnsemble(participant) ? ' · ensamble' : '';
    return `<option value="${escapeHtml(participant.id)}" ${participant.id === selectedId ? 'selected' : ''}>${escapeHtml(name + detail)}</option>`;
  });
  if (selectedId && !participants.some(participant => participant.id === selectedId)) options.push(`<option value="${escapeHtml(selectedId)}" selected>${escapeHtml(row.estudianteGrupo || 'Participante guardado')} · presentación guardada</option>`);
  return `<option value="" ${selectedId ? '' : 'selected'}>Elige un estudiante o grupo</option>` + options.join('');
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function rowActions(tab, id) {
  return `<div class="actions">${tab==="muestras"?`<button type="button" class="small-btn" data-sample-route="${escapeHtml(id)}">Ruta de muestras</button>`:""}<button class="small-btn" data-edit-child="${tab}:${id}">Editar</button><button class="small-btn danger" data-delete-child="${tab}:${id}">Eliminar</button></div>`;
}

function handleAction(action) {
  if (action === "edit-event") openEventDialog(state.selectedEvent);
  if (action === "export-event") exportSelectedEvent();
  if (action === "import-event") importFile.click();
  if (action === "mark-realized") cerrarEvento("realizado");
  if (action === "mark-not-realized") cerrarEvento("no-realizado");
  if (action === "archive-event") archiveEvent();
  if (action === "delete-event") deleteEvent();
  if (action === "add-child") { if (state.tab === "partituras") scores.openUpload(); else openChildDialog(state.tab); }
  if (action === "pick-students") openStudentPicker("individual");
  if (action === "new-ensemble") openChildDialog('muestras', { esEnsamble: true, integrantes: [], areaArtisticaId: 'musica', modalidadPresentacionId: 'ensambles' });
  if (action === "config-participant-lists") openParticipantListsDialog();
}

function normalizarLista(value) {
  const vistos = new Set();
  return String(value || "").split(/\r?\n/)
    .map(item => item.trim())
    .filter(item => item && !vistos.has(item.toLocaleLowerCase("es-CO")) && vistos.add(item.toLocaleLowerCase("es-CO")));
}

function openParticipantListsDialog() {
  const recursos = listaParticipantes("recursosTecnicos", RECURSOS_TECNICOS_INICIALES);
  const generos = listaParticipantes("generos", GENEROS);
  setModal(`
    <h3>Listas de participantes</h3>
    <p class="muted">Estas opciones solo se aplican a <strong>${escapeHtml(state.selectedEvent?.titulo || "este evento")}</strong>. Escribe una opción por línea; puedes cambiar el orden, agregar o quitar las que necesites.</p>
    <div class="form-grid">
      <label class="wide">Recursos técnicos disponibles
        <textarea name="recursosTecnicos" rows="10" placeholder="Micrófono&#10;Batería&#10;Sonido">${escapeHtml(recursos.join("\n"))}</textarea>
      </label>
      <label class="wide">Géneros disponibles
        <textarea name="generos" rows="10" placeholder="Pop&#10;Gospel&#10;Rock">${escapeHtml(generos.join("\n"))}</textarea>
      </label>
    </div>
  `, "Guardar listas");

  modalForm.onsubmit = async event => {
    event.preventDefault();
    const formData = new FormData(modalForm);
    const listasParticipantes = {
      recursosTecnicos: normalizarLista(formData.get("recursosTecnicos")),
      generos: normalizarLista(formData.get("generos"))
    };
    if (!listasParticipantes.recursosTecnicos.length || !listasParticipantes.generos.length) {
      toast("Cada lista debe tener al menos una opción.");
      return;
    }
    try {
      await updateDoc(doc(db, COLLECTION, state.selectedEventId), {
        listasParticipantes,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.email
      });
      toast("Listas de participantes actualizadas.");
      modal.close();
    } catch (error) {
      console.error(error);
      toast("No se pudieron guardar las listas.");
    }
  };
}

function openEventDialog(evento = null) {
  const isEdit = Boolean(evento?.id);
  setModal(`
    <h3>${isEdit ? "Editar evento" : "Nuevo evento"}</h3>
    <div class="form-grid">
      <label class="wide">Título<input name="titulo" required value="${escapeHtml(evento?.titulo || "")}" placeholder="Ej: Muestra de proceso - Piano y canto" /></label>
      <label>Tipo<select name="tipo">${selectOptions(FIELD_OPTIONS.tipo, evento?.tipo || "Evento")}</select></label>
      <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoEvento, evento?.estado || "Planeación")}</select></label>
      <label>Prioridad<select name="prioridad">${selectOptions(FIELD_OPTIONS.prioridad, evento?.prioridad || "Media")}</select></label>
      <label>Responsable<input name="responsable" list="personasDisponibles" value="${escapeHtml(evento?.responsable || "")}" placeholder="Alek, Cata, equipo..." /></label>
      <label>Fecha<input type="date" name="fechaInicio" value="${escapeHtml(evento?.fechaInicio || "")}" /></label>
      <label>Hora<input type="time" name="horaInicio" value="${escapeHtml(evento?.horaInicio || "")}" /></label>
      <label class="wide">Etapa pública de la ruta<select name="etapaRutaMuestra"><option value="">Sin definir / no aplica</option><option value="recital" ${evento?.etapaRutaMuestra==='recital'?'selected':''}>Recital</option><option value="grande" ${evento?.etapaRutaMuestra==='grande'?'selected':''}>Presentación grande</option></select><span class="field-hint">Permite registrar la participación efectiva desde la ruta de cada estudiante. Inscribirlo no completa la etapa.</span></label>
      <label>Lugar<input name="lugar" list="lugaresDisponibles" value="${escapeHtml(evento?.lugar || "")}" /></label>
      <label>Público<input name="publico" value="${escapeHtml(evento?.publico || "")}" /></label>
      <label>Sillas para el evento (cantidad)<input type="number" min="0" step="1" name="sillasCantidad" value="${escapeHtml(evento?.sillasCantidad ?? '')}" placeholder="Por definir" /><span class="field-hint">Total general para público y organización.</span></label>
      <label>Ventiladores (cantidad)<input type="number" min="0" step="1" name="ventiladoresCantidad" value="${escapeHtml(evento?.ventiladoresCantidad ?? '')}" placeholder="Por definir" /></label>
      <label>Presupuesto<input name="presupuesto" value="${escapeHtml(evento?.presupuesto || "")}" placeholder="$" /></label>
      <label class="wide">Objetivo<textarea name="objetivo">${escapeHtml(evento?.objetivo || "")}</textarea></label>
      <label class="wide">Notas<textarea name="notas">${escapeHtml(evento?.notas || "")}</textarea></label>
    </div>
  `, isEdit ? "Guardar cambios" : "Crear evento");

  modalForm.onsubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    const data = Object.fromEntries(new FormData(modalForm).entries());
    for(const key of ['sillasCantidad','ventiladoresCantidad']){if(data[key]!==''){const value=Number(data[key]);if(!Number.isSafeInteger(value)||value<0){toast('Indica cantidades enteras de cero o más.');return;}data[key]=value;}}
    data.updatedAt = serverTimestamp();
    data.updatedBy = state.user.email;
    try {
      if (isEdit) {
        await updateEventAndTeacherCall(evento.id, data);
        toast("Evento actualizado.");
      } else {
        data.createdAt = serverTimestamp();
        data.createdBy = state.user.email;
        const ref = await addDoc(collection(db, COLLECTION), data);
        await createCommonActivities(ref.id);
        selectEvent(ref.id);
        toast("Evento creado.");
      }
      modal.close();
    } catch (error) {
      console.error(error);
      toast("No se pudo guardar el evento.");
    }
  };
}

function ensembleCandidates() {
  const sources = [state.childData.muestras];
  if (sameReferences(ensembleCandidateCache?.sources, sources)) return ensembleCandidateCache.rows;
  const candidates = buildEnsembleCandidates({ participants: sources[0] }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const nameCounts = new Map();
  for (const candidate of candidates) {
    const name = normalizarNombre(candidate.nombre);
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  const rows = candidates.map((candidate, index) => ({
    ...candidate,
    searchText: normalizarNombre([candidate.nombre, candidate.instrumento, candidate.docente].join(' ')),
    label: candidate.nombre + (nameCounts.get(normalizarNombre(candidate.nombre)) > 1 ? ` · registro ${index + 1}` : '') + (candidate.detail ? ` · ${candidate.detail}` : '')
  }));
  ensembleCandidateCache = { sources, rows };
  return rows;
}

function ensembleCandidateOptions(candidates) {
  return '<option value="">Elige un estudiante inscrito</option>' + candidates.map(candidate => `<option value="${escapeHtml(candidate.key)}">${escapeHtml(candidate.label)}</option>`).join('');
}

function ensembleMemberFromCandidate(candidate) {
  return { nombre: candidate.nombre, studentId: candidate.studentId || '', participanteId: candidate.participanteId || '', instrumento: candidate.instrumento || '' };
}

function openEnsembleForWork(sourceId, workIndex) {
  const source = state.childData.muestras.find(participant => participant.id === sourceId);
  const work = source && obrasDe(source)[workIndex];
  if (!source || !work) { toast('La inscripción cambió. Vuelve a elegir la obra.'); return; }
  if (participantIsEnsemble(source)) { openChildDialog('muestras', source); return; }
  const groups = findEnsemblesForWork(state.childData.muestras, work);
  const create = () => openChildDialog('muestras', {
    esEnsamble: true, estudianteGrupo: `Ensamble · ${work}`, repertorios: [work], repertorio: work,
    areaArtisticaId: source.areaArtisticaId || 'musica', modalidadPresentacionId: 'ensambles',
    docente: source.docente || '', genero: source.genero || '',
    integrantes: [{ nombre: source.estudianteGrupo || '', studentId: source.studentId || '', participanteId: source.id, instrumento: source.instrumento || '' }]
  });
  if (!groups.length) { create(); return; }
  setModal(`<h3>Ensamble de esta obra</h3><p>${escapeHtml(work)}</p><label>Esta obra ya tiene un ensamble<select name="ensambleExistente" required><option value="">Elige la presentación</option>${groups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.estudianteGrupo || 'Ensamble')}</option>`).join('')}<option value="nuevo">Crear otro ensamble con esta obra</option></select></label><p class="field-hint">Abre el ensamble para asignar sus integrantes. Crea otro sólo si corresponde a una presentación diferente.</p>`, 'Continuar');
  modalForm.onsubmit = event => {
    event.preventDefault();
    const id = new FormData(modalForm).get('ensambleExistente');
    if (id === 'nuevo') { create(); return; }
    const selected = state.childData.muestras.find(participant => participant.id === id);
    if (selected) openChildDialog('muestras', selected);
    else toast('Ese ensamble ya no está disponible. Vuelve a elegir la obra.');
  };
}

function ensembleSignature(row) {
  const members = normalizeEnsembleMembers(row.integrantes).map(member => member.studentId ? `s:${member.studentId}` : member.participanteId ? `e:${member.participanteId}` : `n:${normalizarNombre(member.nombre)}`).sort();
  return JSON.stringify([row.areaArtisticaId || 'musica', [...new Set(obrasDe(row).map(normalizarNombre))].sort(), members]);
}

function openChildDialog(tab, row = null) {
  const isEdit = Boolean(row?.id);
  // row llega como null al agregar: el default de childForm solo cubre undefined.
  const content = childForm(tab, row || {});
  setModal(content, isEdit ? "Guardar cambios" : "Agregar");
  let momentPresentation = null;
  let momentSelectionChanged = false;
  let ensembleMembers = normalizeEnsembleMembers(row?.integrantes || []);
  const originalMemberKeys = new Set((isEdit && participantIsEnsemble(row) ? ensembleMembers : []).map(member => JSON.stringify([member.participanteId || '', member.studentId || '', normalizarNombre(member.nombre)])));
  let childSaving = false;
  const sharedDurationChanges = new Map();
  let refreshWorkHints = () => {};
  let refreshDurationContext = () => {};

  const draftDuration = (data = {}) => {
    const draft = eventParticipant({ ...row, ...data, duracionObrasReferencia: '', id: row?.id || '__new_participant__' });
    const participants = [...state.childData.muestras.filter(source => source.id !== draft.id).map(eventParticipant), draft];
    return getParticipantDuration(draft, participants);
  };

  if (tab === 'muestras') {
    const holder = modalForm.querySelector('#participantDurationContext');
    refreshDurationContext = () => {
      const exhibition = modalForm.querySelector('[name="areaArtisticaId"]')?.value === 'artes-plasticas';
      const group = modalForm.querySelector('[name="tipoParticipacion"]')?.value === 'Ensamble';
      const entries = [];
      modalForm.querySelectorAll('.obra-item').forEach(item => {
        const work = item.querySelector('[name="repertorioItem"]').value.trim();
        const input = item.querySelector('[name="duracionObra"]');
        const hint = item.querySelector('.obra-tiempo-hint');
        input.closest('label').classList.toggle('hidden', exhibition);
        const groups = !group && row?.id ? participantWorkEnsembles(row, work) : [];
        const shared = groups.length > 0;
        if (shared) {
          const key = JSON.stringify([groups.map(source => source.id).sort(), normalizarNombre(work)]);
          if (input.dataset.sharedKey !== key) {
            if (!input.dataset.sharedKey) input.dataset.ownMinutes = input.value;
            const minutes = groups.length === 1 ? getWorkMinutes(groups[0], work) : null;
            input.value = formatWorkTime(minutes);
            input.dataset.sharedInitial = input.value;
            input.dataset.sharedKey = key;
          }
          input.dataset.sharedGroup = groups.length === 1 ? groups[0].id : '';
          input.disabled = groups.length !== 1;
          hint.textContent = groups.length === 1 ? `Tiempo compartido de ${groups[0].estudianteGrupo || 'este ensamble'}. Al guardar, se actualiza para todos sus integrantes y se cuenta una sola vez.` : 'Esta obra está vinculada a varios ensambles. Edita el tiempo desde la inscripción del ensamble correspondiente.';
        } else {
          if (input.dataset.sharedKey) input.value = input.dataset.ownMinutes || '';
          delete input.dataset.sharedKey;
          delete input.dataset.sharedGroup;
          input.disabled = false;
          hint.textContent = '';
          if (work) entries.push({ obra: work, minutos: workMinutes(input.value) });
        }
      });
      const raw = modalForm.querySelector('#areaContext [name="duracionMin"]');
      if (raw) { raw.closest('label').classList.add('hidden'); raw.disabled = true; }
      const known = entries.reduce((sum, entry) => sum + (entry.minutos ?? 0), 0);
      const pending = entries.filter(entry => entry.minutos === null).length;
      const old = row?.duracionAnteriorMin ?? (!row?.duracionPorObra ? row?.duracionMin : null);
      const onlyShared = !entries.length && Boolean(modalForm.querySelector('[data-shared-key]'));
      holder.innerHTML = exhibition ? '' : `<p class="field-hint" role="status">${onlyShared ? 'El tiempo de estas obras se cuenta una sola vez en el ensamble.' : pending ? `Subtotal conocido: ${formatWorkTime(known)} · ${pending} obra(s) por completar.` : `Total calculado: ${known} min.`} ${onlyShared ? '' : group ? 'Este tiempo se cuenta una sola vez para todo el ensamble.' : 'Las obras de ensamble se cuentan en su presentación compartida.'}</p>${old != null && String(old) !== '' && pending ? `<p class="field-hint">Duración anterior: ${escapeHtml(formatWorkTime(old))}. Reparte los minutos entre las obras; no se distribuyen automáticamente.</p>` : ''}`;
    };
  }

  if (tab === 'muestras') {
    const type = modalForm.querySelector('[name="tipoParticipacion"]');
    const fields = modalForm.querySelector('#ensembleMembers');
    const list = modalForm.querySelector('#ensembleMembersList');
    const choice = modalForm.querySelector('#ensembleStudentChoice');
    const search = modalForm.querySelector('#ensembleStudentSearch');
    const results = modalForm.querySelector('#ensembleSearchResults');
    const title = modalForm.querySelector('#participantNameLabel');
    let candidates = null;
    let previousSearch = null;
    let previousMembers = null;
    const refreshCandidates = () => {
      const updated = ensembleCandidates();
      const query = normalizarNombre(search.value);
      const memberKeys = ensembleMembers.map(member => JSON.stringify([member.participanteId, member.studentId])).join('|');
      if (candidates === updated && previousSearch === query && previousMembers === memberKeys) return;
      candidates = updated;
      previousSearch = query;
      previousMembers = memberKeys;
      const available = candidates.filter(candidate => !ensembleMembers.some(member => member.participanteId && member.participanteId === candidate.participanteId || member.studentId && member.studentId === candidate.studentId));
      const terms = query.split(' ').filter(Boolean);
      const matches = terms.length ? available.filter(candidate => terms.every(term => candidate.searchText.includes(term))) : available;
      // Keep the native chooser small; search still covers every recorded student.
      const visible = matches.slice(0, 60);
      const selected = available.find(candidate => candidate.key === choice.value);
      if (selected && !visible.includes(selected)) visible.push(selected);
      choice.innerHTML = ensembleCandidateOptions(visible);
      choice.value = selected?.key || '';
      results.textContent = !candidates.length ? 'Primero agrega los estudiantes en Participantes. Aquí aparecerán sus inscripciones de esta muestra.' : !available.length ? 'Todos los estudiantes inscritos ya están en este ensamble.' : !matches.length ? 'No hay coincidencias entre los inscritos disponibles.' : matches.length > 60 ? `${matches.length} inscritos disponibles. Mostrando los primeros 60; escribe para buscar.` : `${matches.length} inscrito${matches.length === 1 ? '' : 's'} disponible${matches.length === 1 ? '' : 's'} en esta muestra.`;
    };
    const readMembers = () => {
      list.querySelectorAll('[data-member-instrument]').forEach(input => { ensembleMembers[Number(input.dataset.memberInstrument)].instrumento = input.value.trim(); });
    };
    const renderMembers = () => {
      list.innerHTML = ensembleMembers.map((member, index) => `<div class="ensemble-member"><div><strong>${escapeHtml(member.nombre || 'Integrante')}</strong><label>Instrumento / función<input data-member-instrument="${index}" value="${escapeHtml(member.instrumento || '')}" placeholder="Ej.: violín, piano, cello" /></label></div><button type="button" class="small-btn danger" data-remove-member="${index}">Quitar</button></div>`).join('') || '<p class="field-hint">Agrega al menos dos integrantes.</p>';
    };
    const updateType = () => {
      readMembers();
      const group = type.value === 'Ensamble';
      fields.classList.toggle('hidden', !group);
      if (group) refreshCandidates();
      title.textContent = group ? 'Nombre del ensamble' : 'Estudiante o grupo';
      const name = modalForm.querySelector('[name="estudianteGrupo"]');
      if (group) name.removeAttribute('list');
      else name.setAttribute('list', 'estudiantesDisponibles');
      const holder = modalForm.querySelector('#participantTeacherHistory');
      holder.dataset.ensemble = String(group);
      const studentId = modalForm.querySelector('[name="studentId"]');
      const preservedId = !participantIsEnsemble(row) && normalizarNombre(name.value) === normalizarNombre(row?.estudianteGrupo) ? row?.studentId || '' : '';
      studentId.value = group ? '' : preservedId || buscarEnPadron(name.value)?.studentId || '';
      refreshParticipantTeacherContext();
      refreshWorkHints();
    };
    search.addEventListener('input', refreshCandidates);
    choice.addEventListener('focus', refreshCandidates);
    modalForm.querySelector('#addEnsembleStudent').addEventListener('click', () => {
      readMembers();
      refreshCandidates();
      const candidate = candidates?.find(option => option.key === choice.value);
      if (!candidate) { toast('Elige un estudiante de la lista.'); return; }
      const next = normalizeEnsembleMembers([...ensembleMembers, ensembleMemberFromCandidate(candidate)]);
      if (next.length === ensembleMembers.length) { toast('Este estudiante ya está en el ensamble.'); return; }
      const errors = validateEnsembleMembers(next).filter(message => !message.includes('al menos dos'));
      if (errors.length) { toast(errors.join(' ')); return; }
      ensembleMembers = next; renderMembers(); choice.value = ''; refreshCandidates(); refreshWorkHints();
    });
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-member]');
      if (!button) return;
      readMembers(); ensembleMembers.splice(Number(button.dataset.removeMember), 1); renderMembers(); refreshCandidates(); refreshWorkHints();
    });
    list.addEventListener('input', readMembers);
    type.addEventListener('change', updateType);
    renderMembers(); updateType();
  }

  if (tab === "actividades") {
    const activityState = modalForm.querySelector('[name="estado"]');
    const stateHelp = modalForm.querySelector('#activityStateHelp');
    activityState.addEventListener('change', () => { stateHelp.textContent = ACTIVITY_STATE_HELP[activityState.value] || 'Elige cómo va esta actividad.'; });
    const responsible = modalForm.querySelector('[name="responsable"]');
    responsible.addEventListener('focus', () => { responsible.innerHTML = activityResponsibleOptions(responsible.value); });
  }

  if (tab === 'programacion') {
    const type = modalForm.querySelector('[name="tipoMomento"]');
    const item = modalForm.querySelector('[name="item"]');
    const help = modalForm.querySelector('#momentTypeHelp');
    const presentationFields = modalForm.querySelector('#momentPresentationFields');
    const participant = modalForm.querySelector('[name="participanteId"]');
    const worksBox = modalForm.querySelector('#momentWorks');
    const presentationHint = modalForm.querySelector('#momentPresentationHint');
    const detachedSnapshot = isEdit && !row.participanteId && Boolean(row.estudianteGrupo || getParticipantWorks(row).length);
    const autoValues = new Map();
    let previousType = type.value;
    type.addEventListener('change', () => {
      const previousTitle = autoValues.get(item) === item.value ? getMomentPreset(previousType)?.label || item.value : item.value;
      item.value = nextMomentTitle(previousType, type.value, previousTitle);
      previousType = type.value;
      help.textContent = getMomentPreset(type.value)?.help || 'Escribe el nombre del momento y sus indicaciones.';
      presentationFields.classList.toggle('hidden', type.value !== 'presentacion');
      presentationFields.disabled = type.value !== 'presentacion';
      if (type.value === 'presentacion') applyPresentationDefaults();
    });
    const owner = modalForm.querySelector('[name="encargado"]');
    owner.addEventListener('focus', () => { owner.innerHTML = activityResponsibleOptions(owner.value); });
    const hour = modalForm.querySelector('[name="hora"]');
    const duration = modalForm.querySelector('[name="duracionMin"]');
    const day = modalForm.querySelector('[name="diaEvento"]');
    const endHint = modalForm.querySelector('#momentEndHint');
    const updateEnd = () => {
      const end = getMomentEnd({ hora: hour.value, duracionMin: duration.value, diaPrograma: Number(day.value) - 1 });
      endHint.textContent = end ? `Finaliza a las ${momentTimeLabel(end)}.` : 'Indica la hora y la duración para ver cuándo finaliza.';
    };
    [hour, duration, day].forEach(input => input.addEventListener('input', updateEnd));
    updateEnd();

    const selectedWorks = () => [...worksBox.querySelectorAll('[name="obraPresentacion"]:checked')].map(input => input.value);
    const updatePresentationHint = () => {
      if (!momentPresentation) {
        presentationHint.textContent = detachedSnapshot && !momentSelectionChanged ? 'Se conservan el estudiante y las obras guardados. Puedes elegir una inscripción actual para vincularlos.' : (state.childData.muestras || []).length ? 'Elige un participante para cargar sus obras registradas.' : 'Primero registra los estudiantes o grupos en Participantes.';
        return;
      }
      const total = getParticipantWorks(momentPresentation).length;
      const count = selectedWorks().length;
      const unavailable = !eventPresentations().some(source => source.id === participant.value);
      const countText = total ? `${count} de ${total} obra${total === 1 ? '' : 's'} seleccionada${count === 1 ? '' : 's'}.` : 'Este participante aún no tiene obras registradas; puedes completarlas en Participantes.';
      const durationText = momentPresentation.duracionPorObra ? ' Los minutos se calculan con las obras seleccionadas. Puedes ajustar el tiempo de escenario.' : momentPresentation.duracionPendiente ? ' La duración de la ficha está pendiente de revisión. Revisa los minutos de este momento antes de guardarlo.' : total && count < total ? ' La duración registrada corresponde a la presentación completa. Ajusta los minutos si presentarás sólo parte del repertorio.' : ' Puedes ajustar la duración y el encargado.';
      presentationHint.textContent = countText + durationText + (unavailable ? ' Se conserva este momento guardado. Si ahora corresponde a un ensamble, elige su presentación compartida para actualizarlo.' : '');
    };
    const fillFromParticipant = (input, value, generic = '') => {
      if (!input.value.trim() || autoValues.get(input) === input.value || generic && input.value === generic) {
        const text = String(value ?? '');
        if (input === owner) owner.innerHTML = activityResponsibleOptions(text);
        input.value = text;
        autoValues.set(input, input.value);
      }
    };
    function applyPresentationDefaults() {
      if (!momentPresentation) return;
      const defaults = buildMomentPresentation(momentPresentation, selectedWorks());
      fillFromParticipant(item, defaults.item, getMomentPreset('presentacion').label);
      fillFromParticipant(owner, defaults.encargado);
      fillFromParticipant(duration, defaults.duracionMin);
      if (momentPresentation.duracionPendiente && !momentPresentation.duracionPorObra) { duration.value = ''; autoValues.set(duration, ''); }
      updateEnd();
    }
    const loadPresentation = (initial = false) => {
      const id = participant.value;
      const source = eventPresentations().find(candidate => candidate.id === id);
      const savedLink = Boolean(isEdit && id && row.participanteId === id);
      const keepSaved = savedLink && (initial || !source);
      const storedWorks = keepSaved ? getParticipantWorks(row) : [];
      const works = getParticipantWorks({ repertorios: [...storedWorks, ...getParticipantWorks(source)] });
      momentPresentation = id && (source || savedLink) ? {
        ...(source || {}), id,
        estudianteGrupo: keepSaved ? row.estudianteGrupo || source?.estudianteGrupo || 'Participante' : source.estudianteGrupo || source.nombrePresentacion || 'Participante',
        repertorios: works, repertorio: '',
        docente: source?.docente || (keepSaved ? row.encargado || '' : ''), duracionMin: source ? source.duracionMin ?? '' : keepSaved ? row.duracionMin ?? '' : '', duracionPendiente: Boolean(source?.duracionPendiente)
      } : null;
      const chosen = new Set((keepSaved ? storedWorks : works).map(normalizarNombre));
      worksBox.innerHTML = works.length ? `<p class="field-hint">Obras / actividades que presentará</p><div class="check-grid">${works.map(work => `<label class="check-card"><input type="checkbox" name="obraPresentacion" value="${escapeHtml(work)}" ${chosen.has(normalizarNombre(work)) ? 'checked' : ''} /><span>${escapeHtml(work)}</span></label>`).join('')}</div>` : detachedSnapshot && !momentSelectionChanged ? `<p class="field-hint">${escapeHtml(row.estudianteGrupo || 'Participante guardado')}</p>${getParticipantWorks(row).map(work => `<div>${escapeHtml(work)}</div>`).join('')}` : '';
      if (!initial && type.value === 'presentacion') applyPresentationDefaults();
      if (initial && !isEdit && type.value === 'presentacion' && momentPresentation?.duracionPendiente) { duration.value = ''; updateEnd(); }
      updatePresentationHint();
    };
    participant.addEventListener('change', () => { momentSelectionChanged = true; loadPresentation(); });
    participant.addEventListener('focus', () => {
      participant.innerHTML = momentParticipantOptions({ participanteId: participant.value, estudianteGrupo: momentPresentation?.estudianteGrupo || row?.estudianteGrupo || '' });
    });
    worksBox.addEventListener('change', () => {
      if (momentPresentation?.duracionPorObra) {
        const defaults = buildMomentPresentation(momentPresentation, selectedWorks());
        duration.value = defaults.duracionMin; autoValues.set(duration, duration.value); updateEnd();
      }
      updatePresentationHint();
    });
    loadPresentation(true);
  }

  // El formulario de participantes parte del área artística y muestra solo los
  // campos de Música, Danza, Teatro o Artes Plásticas que correspondan.
  const areaArtisticaSelect = modalForm.querySelector('[name="areaArtisticaId"]');
  if (tab === "muestras" && areaArtisticaSelect) {
    areaArtisticaSelect.addEventListener("change", () => {
      const context = modalForm.querySelector("#areaContext");
      if (context) context.innerHTML = annualSystem.participantContext({}, areaArtisticaSelect.value);
      refreshDurationContext();
    });
  }

  // Al escoger una obra del banco de repertorio, se propone su género.
  const obrasLista = modalForm.querySelector("#obrasLista");

  if (obrasLista) {
    // Aviso de obra repetida: en este evento o ya presentada por el estudiante.
    const avisarObras = () => {
      refreshDurationContext();
      const caja = modalForm.querySelector("#avisoRepertorio");
      if (!caja) return;
      const obras = [...obrasLista.querySelectorAll('[name="repertorioItem"]')].map(i => i.value.trim()).filter(Boolean);
      if (!obras.length) {
        caja.textContent = "Al elegir una obra del banco (Fest 2025) se completa el género automáticamente.";
        caja.className = "field-hint";
        return;
      }
      const group = modalForm.querySelector('[name="tipoParticipacion"]')?.value === 'Ensamble';
      const createsGroup = group && isEdit && !participantIsEnsemble(row);
      const draftId = group && !createsGroup && row?.id || '';
      const previewRows = group ? [...state.childData.muestras.filter(source => source.id !== draftId).map(eventParticipant), eventParticipant({ id: draftId, esEnsamble: true, repertorios: obras, integrantes: ensembleMembers, estado: modalForm.querySelector('[name="estado"]')?.value || '' })] : null;
      const opciones = {
        excluirId: row?.id || "",
        estudiante: modalForm.querySelector('[name="estudianteGrupo"]')?.value || "",
        studentId: modalForm.querySelector('[name="studentId"]')?.value || "",
        esEnsamble: group,
        draftId,
        presentationPreview: previewRows ? buildPresentationCatalogue(previewRows) : null
      };
      const vistos = new Set();
      const textos = obras.map(obra => {
        const clave = ripNorm(obra);
        const t = vistos.has(clave) ? "⚠️ Repetida dentro de esta misma presentación." : avisoRepertorio(obra, opciones);
        vistos.add(clave);
        return obras.length > 1 ? `${obra}: ${t}` : t;
      });
      caja.textContent = textos.join(" · ");
      const alerta = textos.some(t => t.includes("⚠️"));
      caja.className = "field-hint " + (alerta ? "hint-alerta" : textos.every(t => t.includes("✅")) ? "hint-ok" : "");
    };
    refreshWorkHints = avisarObras;
    obrasLista.addEventListener("input", avisarObras);
    obrasLista.addEventListener("change", (e) => {
      // Al escoger una obra del banco de repertorio, se propone su género.
      const song = e.target.name === "repertorioItem" ? findRepertorio(e.target.value || "") : null;
      const generoSelect = e.target.closest(".obra-item")?.querySelector('[name="generoObra"]');
      if (song && generoSelect && generoSelect.value === "Sin definir") {
        if (![...generoSelect.options].some(option => option.value === song.genero)) {
          generoSelect.add(new Option(song.genero, song.genero));
        }
        generoSelect.value = song.genero;
      }
      avisarObras();
    });
    obrasLista.addEventListener("click", (e) => {
      const quitar = e.target.closest(".obra-quitar");
      if (!quitar) return;
      const items = obrasLista.querySelectorAll(".obra-item");
      if (items.length > 1) quitar.closest(".obra-item").remove();
      else { items[0].querySelectorAll('input').forEach(input => { input.value = ''; }); items[0].querySelector('[name="generoObra"]').value='Sin definir'; }
      avisarObras();
    });
    modalForm.querySelector("#agregarObra")?.addEventListener("click", () => {
      obrasLista.insertAdjacentHTML("beforeend", campoObra());
      obrasLista.lastElementChild.querySelector("input").focus();
    });
    avisarObras();
  }

  // Participantes: al escribir el nombre se resuelve contra el padrón de RIP,
  // se guarda su studentId y se avisa el estado (sin bloquear a los inactivos).
  const estudianteInput = modalForm.querySelector('[name="estudianteGrupo"]');
  if (estudianteInput) {
    let historyTimer;
    const actualizarEstado = () => {
      const oculto = modalForm.querySelector('[name="studentId"]');
      const ensemble = modalForm.querySelector('[name="tipoParticipacion"]')?.value === 'Ensamble';
      const unchangedName = normalizarNombre(estudianteInput.value) === normalizarNombre(row?.estudianteGrupo);
      const preservedId = unchangedName ? row?.studentId || '' : '';
      const est = ensemble ? null : buscarEnPadron(estudianteInput.value, preservedId);
      if (oculto) oculto.value = ensemble ? '' : preservedId || est?.studentId || '';
      const hint = modalForm.querySelector("#estadoEstudiante");
      if (hint) {
        hint.textContent = estadoEstudianteHint({ ...row, esEnsamble: ensemble, tipo: ensemble ? 'Ensamble' : 'Individual', integrantes: ensemble ? ensembleMembers : [], estudianteGrupo: estudianteInput.value, studentId: oculto?.value || '' });
        hint.classList.toggle("hint-alerta", Boolean(est) && est.nivel !== "activo");
        hint.classList.toggle("hint-ok", Boolean(est) && est.nivel === "activo");
      }
    };
    estudianteInput.addEventListener("input", () => {
      actualizarEstado();
      clearTimeout(historyTimer);
      historyTimer = setTimeout(() => {
        if (estudianteInput.isConnected) {
          refreshParticipantTeacherContext();
          if (modalForm.querySelector('[name="tipoParticipacion"]')?.value !== 'Ensamble') refreshWorkHints();
        }
      }, 250);
    });
    estudianteInput.addEventListener("change", () => {
      actualizarEstado();
      clearTimeout(historyTimer);
      refreshParticipantTeacherContext();
      if (modalForm.querySelector('[name="tipoParticipacion"]')?.value !== 'Ensamble') refreshWorkHints();
    });
  }

  if (tab === 'muestras') {
    const teacher = modalForm.querySelector('#participantTeacherSelect');
    teacher.addEventListener('focus', () => refreshParticipantTeacherContext());
    const history = modalForm.querySelector('#participantTeacherHistory');
    history.onclick = event => {
      const button = event.target.closest('[data-use-participant-teacher]');
      if (!button) return;
      const name = button.dataset.useParticipantTeacher;
      teacher.innerHTML = participantTeacherOptions(name, participantTeacherHistoryFromForm());
      teacher.value = name;
      teacher.dispatchEvent(new Event('change', { bubbles: true }));
    };
    refreshParticipantTeacherContext();
  }

  // Al escoger a alguien de la base de personas, se trae su función.
  const nombreInput = modalForm.querySelector('[name="nombre"]');
  if (tab === "equipo" && nombreInput) {
    nombreInput.addEventListener("change", () => {
      const matches = state.personas.filter(p => normalizarNombre(p.nombre) === normalizarNombre(nombreInput.value));
      const persona = matches.length === 1 ? matches[0] : null;
      if (!persona) return;
      const rolInput = modalForm.querySelector('[name="rol"]');
      if (rolInput && !rolInput.value) rolInput.value = persona.rol || "";
    });
  }

  modalForm.onsubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    if (childSaving) return;
    const formData = new FormData(modalForm);
    const data = {};
    [...formData.entries()].forEach(([key, value]) => data[key] = typeof value === "string" ? value.trim() : value);
    if (tab === "actividades") data.estado = normalizeActivityState(data.estado);
    if (tab === "equipo") {
      data.estado = normalizeTeamState(data.estado);
      if (Boolean(data.horarioDesde) !== Boolean(data.horarioHasta)) { toast('Elige la hora de inicio y la hora de fin del horario de apoyo.'); return; }
      if (data.horarioDesde && data.horarioDesde === data.horarioHasta) { toast('La hora de salida debe ser diferente de la hora de llegada.'); return; }
      data.horario = data.horarioDesde ? `De ${data.horarioDesde} a ${data.horarioHasta}${data.horarioHasta < data.horarioDesde ? ' (día siguiente)' : ''}` : (row?.horarioDesde ? '' : row?.horario || '');
    }
    if (tab === 'programacion') {
      if (!getMomentPreset(data.tipoMomento) && data.tipoMomento !== 'personalizado') { toast('Elige el tipo de momento.'); return; }
      data.item = data.item || getMomentPreset(data.tipoMomento)?.label || '';
      if (!data.item) { toast('Escribe el nombre del momento.'); return; }
      const programDay = Number(data.diaEvento);
      if (!Number.isSafeInteger(programDay) || programDay < 1) { toast('Indica un día válido para el programa.'); return; }
      data.diaPrograma = programDay - 1;
      delete data.diaEvento;
      delete data.obraPresentacion;
      data.participanteId = '';
      data.estudianteGrupo = '';
      data.repertorios = [];
      const participantId = String(formData.get('participanteId') || '');
      if (data.tipoMomento === 'presentacion' && participantId) {
        const previousLink = isEdit && row.participanteId === participantId;
        if (!momentPresentation || momentPresentation.id !== participantId || !previousLink && !eventPresentations().some(participant => participant.id === participantId)) { toast('Esta presentación cambió. Elige el estudiante o ensamble que corresponde ahora.'); return; }
        const works = formData.getAll('obraPresentacion');
        if (momentPresentation.duracionPendiente && (data.duracionMin === '' || !Number.isFinite(Number(data.duracionMin)) || Number(data.duracionMin) < 0)) { toast('Indica la duración de este momento; los minutos solistas aún están por revisar.'); return; }
        if (getParticipantWorks(momentPresentation).length && !works.length && !(previousLink && !getParticipantWorks(row).length)) { toast('Elige al menos una obra que presentará.'); return; }
        const presentation = buildMomentPresentation(momentPresentation, works);
        data.participanteId = presentation.participanteId;
        data.estudianteGrupo = presentation.estudianteGrupo;
        data.repertorios = presentation.repertorios;
      } else if (data.tipoMomento === 'presentacion' && isEdit && !row.participanteId && !momentSelectionChanged) {
        data.estudianteGrupo = row.estudianteGrupo || '';
        data.repertorios = getParticipantWorks(row);
      }
    }
    if (tab === "muestras") {
      data.esEnsamble = data.tipoParticipacion === 'Ensamble';
      data.tipo = data.esEnsamble ? 'Ensamble' : 'Individual';
      delete data.tipoParticipacion;
      data.integrantes = data.esEnsamble ? normalizeEnsembleMembers(ensembleMembers) : [];
      data.integrantesTexto = data.esEnsamble ? data.integrantes.map(member => member.nombre).join('\n') : '';
      if (data.esEnsamble) {
        const errors = validateEnsembleMembers(data.integrantes);
        if (errors.length) { toast(errors.join(' ')); return; }
        const candidates = ensembleCandidates();
        const missing = data.integrantes.filter(member => !originalMemberKeys.has(JSON.stringify([member.participanteId || '', member.studentId || '', normalizarNombre(member.nombre)])) && !candidates.some(candidate => candidate.participanteId === member.participanteId && (!member.studentId || !candidate.studentId || member.studentId === candidate.studentId)));
        if (missing.length) { toast('La inscripción de un integrante cambió. Vuelve a elegirlo entre los participantes de esta muestra.'); return; }
        data.studentId = '';
      }
      annualSystem.normalizeParticipant(data, row || {});
      const cantidadInvitados = Math.max(0, Number.parseInt(formData.get("invitadosCantidad"), 10) || 0);
      data.tieneInvitados = formData.has("tieneInvitados") || cantidadInvitados > 0;
      data.invitadosCantidad = data.tieneInvitados ? cantidadInvitados : 0;
      if (formData.has("repertorioItem")) {
      const obras = formData.getAll("repertorioItem").map(value => String(value).trim()).filter(Boolean);
      if (new Set(obras.map(normalizarNombre)).size !== obras.length) { toast('Cada obra debe aparecer una sola vez en esta inscripción.'); return; }
      data.repertorios = obras;
      // Texto unido para tablas, exportaciones y registros anteriores.
      data.repertorio = obras.join(" / ");
      delete data.repertorioItem;
      }
      const seleccionados = formData.getAll("recursosSeleccionados").map(value => value.trim()).filter(Boolean);
      const otroRecurso = String(formData.get("recursoOtro") || "").trim();
      if (otroRecurso && !seleccionados.includes(otroRecurso)) seleccionados.push(otroRecurso);
      data.recursosSeleccionados = seleccionados;
      // Se conserva el texto para que las tablas, exportaciones y registros anteriores sigan compatibles.
      data.recursos = seleccionados.join(", ");
      delete data.recursoOtro;
      if (data.esEnsamble) {
        const duplicate = state.childData.muestras.find(participant => participant.id !== row?.id && participantIsEnsemble(participant) && ensembleSignature(participant) === ensembleSignature(data));
        if (duplicate) { toast('Ya existe un ensamble con esas obras e integrantes. Abre su inscripción para editarla.'); return; }
      }
      data.generosObras = [...modalForm.querySelectorAll('.obra-item')].map(item=>({obra:item.querySelector('[name="repertorioItem"]').value.trim(),genero:item.querySelector('[name="generoObra"]').value})).filter(item=>item.obra);
      const genres=[...new Set(data.generosObras.map(item=>item.genero))];data.genero=genres.length===1?genres[0]:'Sin definir';delete data.generoObra;
      data.duracionPorObra = true;
      data.duracionesObras = [...modalForm.querySelectorAll('.obra-item')].map(item => ({
        obra: item.querySelector('[name="repertorioItem"]').value.trim(),
        minutos: item.querySelector('[name="duracionObra"]').dataset.sharedKey ? null : workMinutes(item.querySelector('[name="duracionObra"]').value)
      })).filter(entry => entry.obra);
      sharedDurationChanges.clear();
      modalForm.querySelectorAll('.obra-item').forEach(item => {
        const input = item.querySelector('[name="duracionObra"]');
        if (!input.dataset.sharedGroup || input.value === input.dataset.sharedInitial) return;
        const groupId = input.dataset.sharedGroup;
        if (!sharedDurationChanges.has(groupId)) sharedDurationChanges.set(groupId, []);
        sharedDurationChanges.get(groupId).push({ obra: item.querySelector('[name="repertorioItem"]').value.trim(), minutos: workMinutes(input.value), anterior: workMinutes(input.dataset.sharedInitial) });
      });
      const duration = draftDuration(data);
      if (row && !row.duracionPorObra && row.duracionMin != null) data.duracionAnteriorMin = row.duracionMin;
      // Keep the old aggregate for legacy teacher forms; accounting uses the work map.
      data.duracionMin = duration.mode === 'ensemble-only' ? row?.duracionMin ?? 0 : duration.minutes;
      data.duracionObrasReferencia = workDurationReference(data);
      data.duracionSolistaMin = null;
      data.duracionSolistaReferencia = '';
      delete data.duracionObra;

    }
    data.updatedAt = serverTimestamp();
    data.updatedBy = state.user.email;

    childSaving = true;
    const submitButton = modalForm.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const path = collection(db, COLLECTION, state.selectedEventId, tab);
      const createsGroup = tab === 'muestras' && isEdit && !participantIsEnsemble(row) && data.esEnsamble;
      if (isEdit && !createsGroup) {
        const participantRef = doc(db, COLLECTION, state.selectedEventId, tab, row.id);
        if (sharedDurationChanges.size) {
          await runTransaction(db, async transaction => {
            const participantSnapshot = await transaction.get(participantRef);
            const groupSnapshots = [];
            for (const [id, changes] of sharedDurationChanges) {
              const ref = doc(db, COLLECTION, state.selectedEventId, 'muestras', id);
              groupSnapshots.push({ id, ref, changes, snapshot: await transaction.get(ref) });
            }
            const conflict = () => Object.assign(new Error('El ensamble cambió mientras editabas. Cierra y abre la ficha para revisar los tiempos actuales.'), { durationConflict: true });
            if (!participantSnapshot.exists()) throw conflict();
            const participant = eventParticipant({ ...participantSnapshot.data(), id: row.id });
            const groups = groupSnapshots.filter(item => item.snapshot.exists()).map(item => eventParticipant({ ...item.snapshot.data(), id: item.id }));
            const currentIndex = buildEnsembleParticipationIndex([participant, ...groups]);
            for (const item of groupSnapshots) {
              const group = groups.find(source => source.id === item.id);
              if (!group || !participantIsEnsemble(group)) throw conflict();
              for (const change of item.changes) {
                if (!getEnsemblesForParticipantWork(participant, change.obra, currentIndex).some(source => source.id === group.id) || getWorkMinutes(group, change.obra) !== change.anterior) throw conflict();
              }
              const duracionesObras = getParticipantWorks(group).map(obra => {
                const change = item.changes.find(entry => normalizarNombre(entry.obra) === normalizarNombre(obra));
                return { obra, minutos: change ? change.minutos : getWorkMinutes(group, obra) };
              });
              const draft = { ...group, duracionPorObra: true, duracionObrasReferencia: '', duracionesObras };
              const duracionMin = workDurationSummary(draft, getParticipantWorks(group)).minutes;
              transaction.update(item.ref, { duracionPorObra: true, duracionesObras, duracionMin, duracionObrasReferencia: workDurationReference({ ...draft, duracionMin }), ...(!group.duracionPorObra && group.duracionMin != null ? { duracionAnteriorMin: group.duracionMin } : {}), updatedAt: serverTimestamp(), updatedBy: state.user.email });
            }
            transaction.update(participantRef, data);
          });
        } else await updateDoc(participantRef, data);
        toast("Registro actualizado.");
      } else {
        data.createdAt = serverTimestamp();
        data.createdByEmail = state.user.email;
        data.createdByName = state.user.displayName || state.user.email;
        await addDoc(path, data);
        toast(createsGroup ? 'Ensamble agregado. Se conserva la inscripción individual.' : "Registro agregado.");
      }
      modal.close();
    } catch (error) {
      console.error(error);
      toast(error.durationConflict ? error.message : "No se pudo guardar el registro.");
    } finally {
      childSaving = false;
      if (submitButton?.isConnected) submitButton.disabled = false;
    }
  };
}

/** Busca a alguien del padrón de RIP por nombre exacto (sin tildes ni mayúsculas). */
function buscarEnPadron(nombre, preferredId = '') {
  const index = ripStudentIndex();
  if (preferredId) return index.byId.get(preferredId) || null;
  const clave = ripNorm(nombre);
  if (!clave) return null;
  const matches = index.byName.get(clave) || [];
  const identities = new Set(matches.map(e => e.studentId || e.claveNombre));
  return (identities.size === 1 ? matches[0] : null) || null;
}

/**
 * Aviso bajo el campo de estudiante: estado en RIP y si ya se presentó antes.
 * Los inactivos se avisan pero NO se bloquean: un exestudiante puede volver.
 */
function estadoEstudianteHint(row = {}) {
  const nombre = row.estudianteGrupo || "";
  if (participantIsEnsemble(row)) return 'Ensamble: cada integrante conserva su seguimiento.';
  if (!nombre) {
    return state.ripEstado === "listo"
      ? "Empieza a escribir para buscar en el padrón de RIP."
      : "Conecta el padrón desde “Estudiantes” para ver el estado de cada uno.";
  }
  const est = buscarEnPadron(nombre, row.studentId || '');
  if (!est && (ripStudentIndex().byName.get(ripNorm(nombre)) || []).length > 1) return 'Hay estudiantes con el mismo nombre. Usa Del padrón para elegir la ficha que corresponde.';
  if (!est) return "No está en el padrón de RIP. Se guarda igual (útil para grupos, ensambles o invitados).";

  const records = (state.participaciones.get(est.studentId) || state.participaciones.get(est.claveNombre) || [])
    .filter(record => record.eventoId !== (row.eventoId || state.selectedEventId));
  const previousEvents = new Set(records.map(record => record.eventoId).filter(Boolean)).size;
  const historial = state.participacionesError ? 'El historial no está disponible ahora.' : !state.participacionesCargadas ? 'Consultando registros de muestras…' : previousEvents ? `Tiene registros en ${previousEvents} otra${previousEvents === 1 ? '' : 's'} muestra${previousEvents === 1 ? '' : 's'}.` : 'No tiene otros registros en muestras.';
  if (est.nivel === "activo") return `✅ Activo en RIP. ${historial}`;
  return `⚠️ ${est.etiqueta} en RIP — se puede inscribir igual. ${historial}`;
}

const participantIsEnsemble = row => Boolean(row?.esEnsamble || row?.tipo === 'Ensamble' || row?.integrantes?.length);

function participantTeacherOptions(selected = '', history = []) {
  const allTeachers = reusableEventContext().teachers;
  const groups = buildParticipantTeacherOptions({ selected, currentTeachers: state.childData.muestras.map(row => row.docente), allTeachers, history });
  return `<option value="" ${selected ? '' : 'selected'}>Sin asignar</option>${groups.map(group => `<optgroup label="${escapeHtml(group.label)}">${group.options.map(option => `<option value="${escapeHtml(option.name)}" ${option.name === selected ? 'selected' : ''}>${escapeHtml(option.name)}</option>`).join('')}</optgroup>`).join('')}`;
}

function participantTeacherHistoryFor(row = {}) {
  if (!state.participacionesCargadas || state.participacionesError) return [];
  return teacherHistoryForStudent({ studentId: row.studentId || '', name: row.estudianteGrupo || '', isEnsamble: participantIsEnsemble(row), participations: state.participantesRegistrados, events: state.eventos, currentEventId: row.eventoId || state.selectedEventId, currentParticipantId: row.id || '', knownStudents: state.ripEstudiantes });
}

function participantTeacherHistoryFromForm() {
  const holder = modalForm.querySelector('#participantTeacherHistory');
  if (!holder) return [];
  return participantTeacherHistoryFor({ estudianteGrupo: modalForm.querySelector('[name="estudianteGrupo"]')?.value || '', studentId: modalForm.querySelector('[name="studentId"]')?.value || '', esEnsamble: holder.dataset.ensemble === 'true', id: holder.dataset.participantId, eventoId: holder.dataset.eventId });
}

function refreshParticipantTeacherContext() {
  if (!modal.open || !state.user) return;
  const teacher = modalForm.querySelector('#participantTeacherSelect');
  const holder = modalForm.querySelector('#participantTeacherHistory');
  if (!teacher || !holder) return;
  const name = modalForm.querySelector('[name="estudianteGrupo"]')?.value.trim() || '';
  const sources = [name, modalForm.querySelector('[name="studentId"]')?.value || '', holder.dataset.ensemble, holder.dataset.participantId, holder.dataset.eventId, teacher.value, state.ripEstado, state.ripEstudiantes, state.participantesRegistrados, state.participaciones, state.participacionesCargadas, state.participacionesError, state.selectedEventId, ...reusableContextSources()];
  if (sameReferences(holder._contextSources, sources)) return;
  const ensembleContext = modalForm.querySelector('#participantEnsembleContext');
  if (ensembleContext) {
    const group = holder.dataset.ensemble === 'true';
    ensembleContext.classList.toggle('hidden', group);
    const contextMarkup = group ? '' : participantEnsembleContext({ id: holder.dataset.participantId, studentId: sources[1] });
    if (ensembleContext._markup !== contextMarkup) { ensembleContext.innerHTML = contextMarkup; ensembleContext._markup = contextMarkup; }
  }
  const hint = modalForm.querySelector('#estadoEstudiante');
  if (hint) hint.textContent = estadoEstudianteHint({ estudianteGrupo: name, studentId: modalForm.querySelector('[name="studentId"]')?.value || '', esEnsamble: holder.dataset.ensemble === 'true', id: holder.dataset.participantId, eventoId: holder.dataset.eventId });
  const history = participantTeacherHistoryFromForm();
  const markup = participantTeacherOptions(teacher.value, history);
  if (teacher._optionsMarkup !== markup) { teacher.innerHTML = markup; teacher._optionsMarkup = markup; }
  const wasOpen = holder.querySelector('details')?.open;
  if (state.participacionesError) holder.innerHTML = `<p class="field-hint" role="status">${escapeHtml(state.participacionesError)}</p>`;
  else if (!name) holder.innerHTML = '<p class="field-hint">Elige un estudiante o grupo para consultar sus docentes en otras muestras.</p>';
  else if (!state.participacionesCargadas) holder.innerHTML = '<p class="field-hint" role="status">Cargando docentes usados anteriormente…</p>';
  else if (!history.length) holder.innerHTML = '<p class="field-hint">No hay otras asignaciones docentes que podamos vincular a este estudiante o grupo.</p>';
  else holder.innerHTML = `<details ${wasOpen ? 'open' : ''}><summary>Ver historial de docentes (${history.length})</summary><p class="field-hint">Estas son asignaciones guardadas en muestras; puedes reutilizar un docente antes de guardar.</p><div class="participant-teacher-records">${history.map(record => `<article><div><strong>${escapeHtml(record.docente)}</strong><p>${escapeHtml(record.eventoTitulo)} · ${escapeHtml(normalizeDate(record.fecha))}${record.eventoEstado ? ` · ${escapeHtml(record.eventoEstado)}` : ''}${record.nombreEnsamble ? `<br>Ensamble: ${escapeHtml(record.nombreEnsamble)}` : ''}</p></div><button type="button" class="small-btn" data-use-participant-teacher="${escapeHtml(record.docente)}">Usar</button></article>`).join('')}</div></details>`;
  // Rendering options may canonicalize the selected spelling.
  sources[5] = teacher.value;
  holder._contextSources = sources;
}

function activityResponsibleOptions(selected = "") {
  const context = reusableEventContext();
  const groups = uniqueSuggestions(ACTIVITY_RESPONSIBLE_GROUPS);
  const groupNames = new Set(groups.map(row => normalizarNombre(row.name)));
  const people = context.people.filter(row => !groupNames.has(normalizarNombre(row.name)));
  const current = String(selected || "");
  if (current && ![...groups, ...people].some(row => normalizarNombre(row.name) === normalizarNombre(current))) people.push({ name: current });
  const options = rows => rows.map(row => {
    const isSelected = Boolean(current) && normalizarNombre(row.name) === normalizarNombre(current);
    const value = isSelected ? current : row.name;
    return `<option value="${escapeHtml(value)}" ${isSelected ? 'selected' : ''}>${escapeHtml(row.name)}</option>`;
  }).join('');
  return `<option value="" ${current ? '' : 'selected'}>Sin asignar</option><optgroup label="Áreas y equipos">${options(groups)}</optgroup>${people.length ? `<optgroup label="Personas y responsables ya registrados">${options(people.sort((a,b) => a.name.localeCompare(b.name, 'es')))}</optgroup>` : ''}`;
}

function childForm(tab, row = {}) {
  if (tab === "actividades") {
    return `
      <h3>${row.id ? "Editar actividad" : "Nueva actividad"}</h3>
      <div class="form-grid">
        <label class="wide">Actividad<input name="titulo" required value="${escapeHtml(row.titulo || "")}" /></label>
        <label>Área<select name="area">${selectOptions(FIELD_OPTIONS.areas, row.area || "General")}</select></label>
        <label>Fecha límite<input type="date" name="fechaLimite" value="${escapeHtml(row.fechaLimite || "")}" /></label>
        <label>Responsable<select name="responsable">${activityResponsibleOptions(row.responsable)}</select><span class="field-hint">Elige un área, equipo o persona ya registrada. Puedes añadir personas desde Base de personas.</span></label>
        <label>Estado<select name="estado">${opcionesConSeleccion(ACTIVITY_STATES, normalizeActivityState(row.estado))}</select><span class="field-hint" id="activityStateHelp">${escapeHtml(ACTIVITY_STATE_HELP[normalizeActivityState(row.estado)] || 'Elige cómo va esta actividad.')}</span></label>
        <label>Prioridad<select name="prioridad">${selectOptions(FIELD_OPTIONS.prioridad, row.prioridad || "Media")}</select></label>
        <label class="wide">Notas<textarea name="notas">${escapeHtml(row.notas || "")}</textarea></label>
      </div>
    `;
  }

  if (tab === "muestras") {
    const opcionesRecursos = [...new Set([...listaParticipantes("recursosTecnicos", RECURSOS_TECNICOS_INICIALES), ...recursosSeleccionados(row)])];
    const editorWorks = participantWorks(row);
    const seleccionados = recursosSeleccionados(row);
    const generoActual = normalizeGenre(row.genero || "Sin definir");
    const opcionesGeneros = listaParticipantes("generos", GENEROS);
    return `
      <h3>${row.id ? "Editar muestra" : "Nueva muestra"}</h3>
      <div class="form-grid">
        ${row.id ? `<label class="wide">Inscripción<input readonly value="${participantIsEnsemble(row) ? 'Ensamble · varios estudiantes' : 'Individual · puede participar en ensambles'}" /><input type="hidden" name="tipoParticipacion" value="${participantIsEnsemble(row) ? 'Ensamble' : 'Individual'}" />${participantIsEnsemble(row) ? '' : '<span class="field-hint">Para tocar en grupo, usa “Armar ensamble” junto a su obra en la lista de participantes. Su ficha individual se conserva.</span>'}</label>` : `<label class="wide">Tipo de participación<select name="tipoParticipacion"><option value="Individual" ${participantIsEnsemble(row) ? '' : 'selected'}>Individual</option><option value="Ensamble" ${participantIsEnsemble(row) ? 'selected' : ''}>Ensamble · varios estudiantes</option></select></label>`}
        <label class="wide"><span id="participantNameLabel">${participantIsEnsemble(row) ? 'Nombre del ensamble' : 'Estudiante o grupo'}</span>
          <input name="estudianteGrupo" list="estudiantesDisponibles" required value="${escapeHtml(row.estudianteGrupo || "")}" placeholder="Busca en el padrón o escribe un grupo" />
          <input type="hidden" name="studentId" value="${escapeHtml(row.studentId || "")}" />
          <span class="field-hint" id="estadoEstudiante">${estadoEstudianteHint(row)}</span>
        </label>
        <fieldset class="wide form-section ${participantIsEnsemble(row) ? '' : 'hidden'}" id="ensembleMembers"><legend>Integrantes de esta presentación</legend><label>Buscar entre los inscritos en esta muestra<input type="search" id="ensembleStudentSearch" placeholder="Nombre, instrumento o docente" autocomplete="off" /></label><p class="field-hint" id="ensembleSearchResults" role="status"></p><div class="ensemble-picker"><label>Estudiante inscrito<select id="ensembleStudentChoice"><option value="">Elige un estudiante inscrito</option></select></label><button type="button" class="small-btn" id="addEnsembleStudent">Agregar integrante</button></div><div id="ensembleMembersList"></div><p class="field-hint">Cada estudiante conserva su inscripción, invitación e invitados. Las obras compartidas se vinculan automáticamente al ensamble y se cuentan una sola vez. Para sumar alguien nuevo, inscríbelo primero en Participantes.</p></fieldset>
        <div class="wide ${participantIsEnsemble(row) ? 'hidden' : ''}" id="participantEnsembleContext">${participantEnsembleContext(row)}</div>
        ${annualSystem.areaField(row)}
        <label>Docente<select name="docente" id="participantTeacherSelect">${participantTeacherOptions(row.docente || '', participantTeacherHistoryFor(row))}</select><span class="field-hint">Elige un docente ya registrado. Para añadir uno nuevo, usa Base de personas.</span></label>
        <div class="wide participant-teacher-history" id="participantTeacherHistory" data-event-id="${escapeHtml(state.selectedEventId)}" data-participant-id="${escapeHtml(row.id || '')}" data-ensemble="${participantIsEnsemble(row)}"></div>
        <div class="wide"><p>Repertorio / actividad (una o varias obras)</p>
          <div id="obrasLista">${(editorWorks.length ? editorWorks : [""]).map(o => campoObra(o, getWorkMinutes(row, o), workGenre(row, o))).join("")}</div>
          <button type="button" class="ghost" id="agregarObra" style="align-self:flex-start;">+ Agregar otra obra</button>
          <datalist id="bancoRepertorio">${BANCO_REPERTORIO.map(song => `<option value="${escapeHtml(song.titulo)}">${escapeHtml(song.artista)}</option>`).join("")}</datalist>
          <span class="field-hint" id="avisoRepertorio">Al elegir una obra del banco (Fest 2025) se completa el género automáticamente.</span>
        </div>
        <div class="wide" id="areaContext">${annualSystem.participantContext(row)}</div>
        <div class="wide" id="participantDurationContext"></div>

        <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
        <label>Prioridad<select name="prioridad">${selectOptions(FIELD_OPTIONS.prioridad, row.prioridad || "Media")}</select></label>
        <fieldset class="wide selector-recursos">
          <legend>Invitación y acompañantes</legend>
          <div class="form-grid">
            <label>Estado de la invitación<select name="invitacionEstado">${selectOptions(["Pendiente", "Enviada", "Aceptada", "Rechazada"], row.invitacionEstado || "Pendiente")}</select></label>
            <label>Fecha de envío<input type="date" name="invitacionFechaEnvio" value="${escapeHtml(row.invitacionFechaEnvio || "")}" /></label>
            <label class="check-card"><input type="checkbox" name="tieneInvitados" value="true" ${row.tieneInvitados ? "checked" : ""} /><span>Asistirá con invitados</span></label>
            <label>Cantidad de invitados<input type="number" min="0" step="1" name="invitadosCantidad" value="${escapeHtml(row.invitadosCantidad ?? 0)}" /></label>
          </div>
          <p class="field-hint">Este seguimiento queda guardado con la participación de este estudiante.</p>
        </fieldset>
        <fieldset class="wide selector-recursos">
          <legend>Recursos técnicos</legend>
          <p class="field-hint">Marca los equipos concretos para esta presentación. Las sillas del público y los ventiladores van en Editar evento. «Silla sin brazos» es para el músico en escena. El parlante incluye cable de energía; los telones forman un juego de 2.</p>
          <div class="check-grid">${opcionesRecursos.map(recurso => `
            <label class="check-card"><input type="checkbox" name="recursosSeleccionados" value="${escapeHtml(recurso)}" ${seleccionados.includes(recurso) ? "checked" : ""} /><span>${escapeHtml(recurso)}${normalizarNombre(recurso)==='sonido'?' · registro anterior: precisa los equipos':''}</span></label>
          `).join("")}</div>
          <label class="otro-recurso">Otro recurso<input name="recursoOtro" placeholder="Ej: Proyector" /></label>
        </fieldset>
        <label class="wide">Notas<textarea name="notas">${escapeHtml(row.notas || "")}</textarea></label>
      </div>
    `;
  }

  if (tab === "checklist") {
    return `
      <h3>${row.id ? "Editar checklist" : "Nuevo ítem de checklist"}</h3>
      <div class="form-grid">
        <label class="wide">Ítem<input name="item" required value="${escapeHtml(row.item || "")}" /></label>
        <label>Categoría<input name="categoria" value="${escapeHtml(row.categoria || "General")}" /></label>
        <label>Responsable<input name="responsable" list="personasDisponibles" value="${escapeHtml(row.responsable || "")}" /></label>
        <label>Fecha límite<input type="date" name="fechaLimite" value="${escapeHtml(row.fechaLimite || "")}" /></label>
        <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
        <label>Prioridad<select name="prioridad">${selectOptions(FIELD_OPTIONS.prioridad, row.prioridad || "Media")}</select></label>
        <label class="wide">Notas<textarea name="notas">${escapeHtml(row.notas || "")}</textarea></label>
      </div>
    `;
  }

  if (tab === "programacion") {
    const type = resolveMomentType(row);
    const next = row.id ? null : getNextMoment(state.childData.programacion);
    const hour = row.id ? row.hora || '' : row.hora || next.hora;
    const day = row.id ? momentDay(row) : next.diaPrograma;
    const showDay = day > 0 || (state.childData.programacion || []).some(moment => momentDay(moment) > 0);
    const hourHint = next ? `<span class="field-hint">${escapeHtml(next.hora ? 'Hora sugerida según el final del programa. Puedes cambiarla.' : next.reason)}</span>` : '';
    return `<h3>${row.id ? "Editar momento" : "Nuevo momento del evento"}</h3><div class="form-grid">
      <label>Hora<input type="time" step="1" name="hora" value="${escapeHtml(hour)}" />${hourHint}</label>
      <label>Duración min.<input type="number" min="0" step="0.5" name="duracionMin" value="${escapeHtml(row.duracionMin ?? "")}" /></label>
      ${showDay ? `<label class="wide">Día del programa<input type="number" name="diaEvento" min="1" step="1" required value="${day + 1}" /><span class="field-hint">Día 1 es el inicio del programa; día 2 es después de medianoche.</span></label>` : '<input type="hidden" name="diaEvento" value="1" />'}
      <div class="field-hint wide" id="momentEndHint" role="status" aria-live="polite"></div>
      <label class="wide">Tipo de momento<select name="tipoMomento" required><option value="" ${type ? '' : 'selected'}>Elige un momento</option>${MOMENT_PRESETS.map(preset => `<option value="${preset.id}" ${preset.id === type ? 'selected' : ''}>${escapeHtml(preset.label)}</option>`).join('')}<option value="personalizado" ${type === 'personalizado' ? 'selected' : ''}>Otro momento</option></select><span class="field-hint" id="momentTypeHelp">${escapeHtml(getMomentPreset(type)?.help || 'Elige una opción o crea otro momento.')}</span></label>
      <fieldset class="wide form-section ${type === 'presentacion' ? '' : 'hidden'}" id="momentPresentationFields" ${type === 'presentacion' ? '' : 'disabled'}><legend>Participante y obras</legend><div class="form-grid"><label class="wide">Estudiante o grupo inscrito<select name="participanteId">${momentParticipantOptions(row)}</select></label><div class="wide" id="momentWorks"></div><p class="field-hint wide" id="momentPresentationHint" role="status" aria-live="polite"></p></div></fieldset>
      <label class="wide">Nombre o detalle del momento<input required name="item" value="${escapeHtml(row.item || "")}" placeholder="Puedes personalizar el nombre elegido" /></label>
      <label class="wide">Encargado<select name="encargado">${activityResponsibleOptions(row.encargado || '')}</select></label>
      <label class="wide">Montaje, transición y recursos<textarea name="montaje">${escapeHtml(row.montaje || "")}</textarea></label>
    </div>`;
  }

  if (tab === "equipo") {
    return `<h3>${row.id ? "Editar integrante" : "Agregar integrante del equipo"}</h3><div class="form-grid">
      <label>Nombre<input required name="nombre" list="personasDisponibles" value="${escapeHtml(row.nombre || "")}" /></label>
      <label>Rol / función<input required name="rol" list="rolesEquipo" value="${escapeHtml(row.rol || "")}" placeholder="Elige o escribe una función" /><span class="field-hint">Puedes elegir una sugerencia o escribir otra función.</span></label>
      <datalist id="rolesEquipo">${[...new Map(["Coordinación", "Producción", "Presentación / maestro de ceremonias", "Sonido", "Iluminación", "Apoyo en escenario", "Montaje y desmontaje", "Recepción", "Registro y asistencia", "Acompañamiento de estudiantes", "Apoyo docente", "Fotografía y video", "Logística", ...state.personas.map(person => person.rol), ...state.childData.equipo.map(person => person.rol)].filter(Boolean).map(role => [normalizarNombre(role), role])).values()].map(role => `<option value="${escapeHtml(role)}"></option>`).join("")}</datalist>
      <label>Zona / bloque<input name="zona" value="${escapeHtml(row.zona || "")}" /></label>
      <fieldset class="wide form-section"><legend>Horario de apoyo</legend><div class="form-grid"><label>Desde<input type="time" name="horarioDesde" value="${escapeHtml(row.horarioDesde || "")}" /></label><label>Hasta<input type="time" name="horarioHasta" value="${escapeHtml(row.horarioHasta || "")}" /></label></div><p class="field-hint">Elige la hora de llegada y la hora de salida. Por ejemplo: de 17:30 a 20:00. Si termina antes de la hora de inicio, se considera el día siguiente.</p>${!row.horarioDesde && row.horario ? `<p class="field-hint">Horario anterior: ${escapeHtml(row.horario)}. Se conserva hasta que elijas una franja.</p>` : ""}</fieldset>
      <label>Confirmación<select name="estado">${selectOptions(TEAM_STATES, normalizeTeamState(row.estado))}</select><span class="field-hint">Pendiente: falta confirmar su apoyo. Confirmado: cuenta con su participación. No disponible: no podrá apoyar.</span></label>
    </div>`;
  }

  if (tab === "rider") {
    return `<h3>${row.id ? "Editar elemento" : "Agregar elemento al rider"}</h3><div class="form-grid">
      <label class="wide">Elemento<input required name="elemento" value="${escapeHtml(row.elemento || "")}" /></label>
      <label>Categoría<input name="categoria" value="${escapeHtml(row.categoria || "")}" /></label>
      <label>Cantidad<input type="number" min="0" name="cantidad" value="${escapeHtml(row.cantidad || "")}" /></label>
      <label>Quién lo aporta<input name="proveedor" list="personasDisponibles" value="${escapeHtml(row.proveedor || "")}" /></label>
      <label>Ubicación<input name="ubicacion" value="${escapeHtml(row.ubicacion || "")}" /></label>
      <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
      <label class="wide">Notas / especificación<textarea name="notas">${escapeHtml(row.notas || "")}</textarea></label>
    </div>`;
  }

  if (tab === "documentos") {
    return `<h3>${row.id ? "Editar documento" : "Agregar documento"}</h3><div class="form-grid">
      <label class="wide">Documento<input required name="titulo" value="${escapeHtml(row.titulo || "")}" placeholder="Ej: Autorización de imagen - grupo infantil" /></label>
      <label>Tipo<select name="tipo">${selectOptions(DOCUMENTO_TIPOS, row.tipo || "Rider técnico")}</select></label>
      <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
      <label>Responsable<input name="responsable" list="personasDisponibles" value="${escapeHtml(row.responsable || "")}" /></label>
      <label>Fecha límite<input type="date" name="fechaLimite" value="${escapeHtml(row.fechaLimite || "")}" /></label>
      <label class="wide">Enlace (Drive, Notion, carpeta...)
        <input type="url" name="url" value="${escapeHtml(row.url || "")}" placeholder="https://drive.google.com/..." />
        <span class="field-hint">Pega el enlace del archivo. La app no guarda archivos, guarda dónde están.</span>
      </label>
      <label class="wide">Notas<textarea name="notas">${escapeHtml(row.notas || "")}</textarea></label>
    </div>`;
  }

  return `
    <h3>${row.id ? "Editar nota" : "Nueva nota de bitácora"}</h3>
    <div class="form-grid">
      <label>Tipo<select name="tipo">${selectOptions(["Nota", "Riesgo", "Decisión", "Cambio", "Aprendizaje"], row.tipo || "Nota")}</select></label>
      <label class="wide">Comentario<textarea name="comentario" required>${escapeHtml(row.comentario || "")}</textarea></label>
    </div>
  `;
}

async function createChecklistTemplate() {
  if (!state.selectedEvent) return;
  const base = CHECKLIST_TEMPLATES[state.selectedEvent.tipo] || CHECKLIST_TEMPLATES.Evento;
  const batch = writeBatch(db);
  base.forEach(([categoria, item, responsable, prioridad]) => {
    const ref = doc(collection(db, COLLECTION, state.selectedEventId, "checklist"));
    batch.set(ref, {
      categoria,
      item,
      responsable,
      prioridad,
      estado: "Pendiente",
      fechaLimite: state.selectedEvent.fechaInicio || "",
      notas: "",
      createdAt: serverTimestamp(),
      createdByEmail: state.user.email,
      createdByName: state.user.displayName || state.user.email
    });
  });
  await batch.commit();
  state.tab = "checklist";
  toast("Checklist base cargado.");
}

async function updateEventAndTeacherCall(eventId, data) {
  const catalogRef = doc(db, "convocatoriasDocentes", eventId);
  const catalog = await getDocFromServer(catalogRef);
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, eventId), data);
  if (catalog.exists()) {
    const publicChanges = Object.fromEntries(["titulo", "fechaInicio", "lugar"].filter(k => k in data).map(k => [k, data[k]]));
    if (["Realizado", "No realizado", "Archivado"].includes(data.estado)) publicChanges.abierta = false;
    batch.update(catalogRef, { ...publicChanges, updatedAt: serverTimestamp(), updatedBy: state.user.email });
  }
  await batch.commit();
}

async function archiveEvent() {
  if (!state.selectedEventId) return;
  const confirmArchive = confirm("¿Archivar este evento? No se borra, solo queda fuera de lo activo.");
  if (!confirmArchive) return;
  await updateEventAndTeacherCall(state.selectedEventId, {
    estado: "Archivado",
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email
  });
  toast("Evento archivado.");
}

async function cerrarEvento(resultado) { if(!state.selectedEventId||!state.selectedEvent)return;const realizado=resultado==="realizado",mensaje=realizado?"¿Marcar este evento como realizado? Se conservará en el historial y dejará de aparecer en la lista diaria.":"¿Marcar este evento como no realizado? Se conservará en el historial con sus participantes, cronograma y demás información.";if(!confirm(mensaje))return;try{await updateEventAndTeacherCall(state.selectedEventId,{estado:realizado?"Realizado":"No realizado",cierre:{resultado,cerradoAt:serverTimestamp(),cerradoBy:state.user.email},updatedAt:serverTimestamp(),updatedBy:state.user.email});state.mostrarHistorialEventos=false;applyFilters();toast(realizado?"Evento marcado como realizado y enviado al historial.":"Evento marcado como no realizado y enviado al historial.");}catch(error){console.error(error);toast("No se pudo cerrar el evento.");}}

async function deleteEvent() {
  if (!state.selectedEventId || !state.selectedEvent) return;
  const eventId = state.selectedEventId;
  const title = state.selectedEvent.titulo || "este evento";
  const confirmation = prompt(
    `Esta acción eliminará definitivamente "${title}" y todos sus registros.\n\nEscribe ELIMINAR para confirmar.`
  );
  if (confirmation !== "ELIMINAR") {
    if (confirmation !== null) toast("No se eliminó el evento: la confirmación no coincidió.");
    return;
  }

  try {
    await scores.removeEventFiles(eventId);
    for (const child of CHILD_COLLECTIONS) {
      const snapshot = await getDocs(collection(db, COLLECTION, eventId, child));
      const docs = snapshot.docs;
      for (let start = 0; start < docs.length; start += 450) {
        const batch = writeBatch(db);
        docs.slice(start, start + 450).forEach(childDoc => batch.delete(childDoc.ref));
        await batch.commit();
      }
    }
    const catalogRef = doc(db, "convocatoriasDocentes", eventId);
    const catalog = await getDocFromServer(catalogRef);
    const finalBatch = writeBatch(db);
    finalBatch.delete(doc(db, COLLECTION, eventId));
    if (catalog.exists()) finalBatch.update(catalogRef, { abierta: false, updatedAt: serverTimestamp(), updatedBy: state.user.email });
    await finalBatch.commit();
    clearSelection();
    toast("Evento y registros relacionados eliminados definitivamente.");
  } catch (error) {
    console.error(error);
    toast("No se pudo eliminar. Solo los administradores pueden borrar eventos.");
  }
}

async function deleteChild(tab, id) {
  const ok = confirm("¿Eliminar este registro? Aquí no hay botón mágico de arrepentimiento.");
  if (!ok) return;
  await deleteDoc(doc(db, COLLECTION, state.selectedEventId, tab, id));
  toast("Registro eliminado.");
}

function getChildById(tab, id) {
  return state.childData[tab].find(row => row.id === id);
}

async function createSeed() {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...SEED_EVENT,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: state.user.email,
    updatedBy: state.user.email
  });
  state.selectedEventId = ref.id;
  state.selectedEvent = { id: ref.id, ...SEED_EVENT };
  await createChecklistTemplateForEvent(ref.id, SEED_EVENT.tipo, SEED_EVENT.fechaInicio);
  await createSeedActivities(ref.id);
  await createCommonActivities(ref.id);
  selectEvent(ref.id);
  toast("Plantilla base creada.");
}

async function createChecklistTemplateForEvent(eventId, tipo, fechaLimite = "") {
  const base = CHECKLIST_TEMPLATES[tipo] || CHECKLIST_TEMPLATES.Evento;
  const batch = writeBatch(db);
  base.forEach(([categoria, item, responsable, prioridad]) => {
    const ref = doc(collection(db, COLLECTION, eventId, "checklist"));
    batch.set(ref, {
      categoria,
      item,
      responsable,
      prioridad,
      estado: "Pendiente",
      fechaLimite,
      notas: "",
      createdAt: serverTimestamp(),
      createdByEmail: state.user.email,
      createdByName: state.user.displayName || state.user.email
    });
  });
  await batch.commit();
}

async function createSeedActivities(eventId) {
  const samples = [
    { titulo: "Definir estructura por bloques", area: "Producción", responsable: "Alek / Cata", estado: "Pendiente", prioridad: "Alta", fechaLimite: "2026-08-01", notas: "Separar infantil, jóvenes, adultos, ensambles y actividades abiertas." },
    { titulo: "Crear banco de repertorio confirmado", area: "Música", responsable: "Docentes", estado: "Pendiente", prioridad: "Alta", fechaLimite: "2026-08-15", notas: "No mezclar banco histórico con repertorio confirmado del evento." },
    { titulo: "Actualizar lista de lugares y proveedores", area: "Logística", responsable: "Producción", estado: "Pendiente", prioridad: "Media", fechaLimite: "2026-07-20", notas: "Auditorios, sonido, foto/video, alimentación y decoración." }
  ];
  const batch = writeBatch(db);
  samples.forEach(item => {
    const ref = doc(collection(db, COLLECTION, eventId, "actividades"));
    batch.set(ref, { ...item, createdAt: serverTimestamp(), createdByEmail: state.user.email, createdByName: state.user.displayName || state.user.email });
  });
  await batch.commit();
}

function actividadComunPayload(activity) {
  return {
    titulo: activity.titulo,
    area: activity.area,
    responsable: activity.responsable,
    estado: "Pendiente",
    prioridad: activity.prioridad,
    fechaLimite: "",
    notas: "Actividad común para todos los eventos. Puedes editarla o eliminarla si no aplica.",
    createdAt: serverTimestamp(),
    createdByEmail: state.user.email,
    createdByName: state.user.displayName || state.user.email
  };
}

async function createCommonActivities(eventId) {
  const batch = writeBatch(db);
  ACTIVIDADES_COMUNES.forEach(activity => {
    batch.set(doc(db, COLLECTION, eventId, "actividades", activity.id), actividadComunPayload(activity));
  });
  batch.set(doc(db, COLLECTION, eventId), {
    actividadesComunesVersion: ACTIVIDADES_COMUNES_VERSION,
    actividadesComunesAplicadasAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email
  }, { merge: true });
  await batch.commit();
}

async function applyCommonActivitiesToExistingEvents() {
  const pendientes = state.eventos.filter(evento => evento.actividadesComunesVersion !== ACTIVIDADES_COMUNES_VERSION);
  if (!pendientes.length) {
    toast("Todos los eventos ya tienen sus actividades comunes aplicadas.");
    return;
  }
  let actualizados = 0;
  for (const evento of pendientes) {
    const snap = await getDocs(collection(db, COLLECTION, evento.id, "actividades"));
    const titulos = new Set(snap.docs.map(row => String(row.data().titulo || "").trim().toLocaleLowerCase("es-CO")));
    const batch = writeBatch(db);
    ACTIVIDADES_COMUNES
      .filter(activity => !titulos.has(activity.titulo.toLocaleLowerCase("es-CO")))
      .forEach(activity => batch.set(doc(db, COLLECTION, evento.id, "actividades", activity.id), actividadComunPayload(activity)));
    batch.set(doc(db, COLLECTION, evento.id), {
      actividadesComunesVersion: ACTIVIDADES_COMUNES_VERSION,
      actividadesComunesAplicadasAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email
    }, { merge: true });
    await batch.commit();
    actualizados++;
  }
  toast(`Actividades comunes aplicadas en ${actualizados} evento(s).`);
}

function openCommonActivitiesDialog() {
  const pendientes = state.eventos.filter(evento => evento.actividadesComunesVersion !== ACTIVIDADES_COMUNES_VERSION).length;
  setModal(`
    <h3>Actividades comunes</h3>
    <p class="muted">Estas cuatro actividades se agregan por defecto a cada evento nuevo. Puedes editarlas o eliminarlas dentro de cada evento cuando no apliquen.</p>
    <ol class="common-activities-list">${ACTIVIDADES_COMUNES.map(activity => `<li>${escapeHtml(activity.titulo)}</li>`).join("")}</ol>
    <p class="field-hint">${pendientes ? `Se aplicarán también a ${pendientes} evento(s) existente(s), sin duplicar actividades con el mismo título.` : "Todos los eventos existentes ya fueron revisados."}</p>
  `, pendientes ? "Aplicar a eventos existentes" : "");
  if (!pendientes) return;
  modalForm.onsubmit = async event => {
    event.preventDefault();
    try {
      await applyCommonActivitiesToExistingEvents();
      modal.close();
    } catch (error) {
      console.error(error);
      toast("No se pudieron agregar las actividades comunes.");
    }
  };
}

async function collectEventPayload(eventId) {
  const evento = state.eventos.find(e => e.id === eventId) || state.selectedEvent;
  const payload = { evento: { ...evento }, subcolecciones: {} };
  delete payload.evento.id;
  for (const child of CHILD_COLLECTIONS) {
    const snap = await getDocs(collection(db, COLLECTION, eventId, child));
    payload.subcolecciones[child] = snap.docs.map(docSnap => {
      const data = docSnap.data();
      delete data.createdAt;
      delete data.updatedAt;
      if (child === "muestras") data._exportId = docSnap.id;
      return data;
    });
  }
  return payload;
}

async function exportSelectedEvent() {
  const payload = await collectEventPayload(state.selectedEventId);
  downloadJson(payload, `${slugify(state.selectedEvent.titulo || "evento")}.json`);
}

async function exportAllEvents() {
  const all = [];
  for (const evento of state.eventos) {
    all.push(await collectEventPayload(evento.id));
  }
  downloadJson({ exportedAt: new Date().toISOString(), eventos: all }, "musicala-eventos-export.json");
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slugify(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "evento";
}

async function importEventFromFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  const evento = payload.evento || payload;
  const subcolecciones = payload.subcolecciones || {};
  delete evento.id;
  delete evento.sistemaAnual;
  evento.titulo = `${evento.titulo || "Evento importado"} (importado)`;
  evento.createdAt = serverTimestamp();
  evento.updatedAt = serverTimestamp();
  evento.createdBy = state.user.email;
  evento.updatedBy = state.user.email;
  const eventRef = await addDoc(collection(db, COLLECTION), evento);
  const batch = writeBatch(db);
  const planned = [];
  Object.entries(subcolecciones).forEach(([child, items]) => {
    if (!CHILD_COLLECTIONS.includes(child) || child === "partituras" || !Array.isArray(items)) return;
    items.forEach(item => {
      const ref = doc(collection(db, COLLECTION, eventRef.id, child));
      planned.push({ child, item, ref });
    });
  });
  const participantIds = new Map();
  planned.filter(({ child }) => child === "muestras").forEach(({ item, ref }) => {
    const oldId = typeof item?._exportId === "string" ? item._exportId : "";
    if (oldId) participantIds.set(oldId, participantIds.has(oldId) ? "" : ref.id);
  });
  planned.forEach(({ child, item, ref }) => {
    const data = { ...item };
    delete data._exportId;
    // Los IDs cambian al importar; sin una referencia única se conserva sólo la copia guardada.
    if (child === "programacion" && "participanteId" in data) data.participanteId = participantIds.get(data.participanteId) || "";
    if (child === 'muestras' && Array.isArray(data.integrantes)) data.integrantes = data.integrantes.map(member => member && typeof member === 'object' && 'participanteId' in member ? { ...member, participanteId: participantIds.get(member.participanteId) || '' } : member);
    batch.set(ref, { ...data, createdAt: serverTimestamp(), createdByEmail: state.user.email, createdByName: state.user.displayName || state.user.email });
  });
  await batch.commit();
  selectEvent(eventRef.id);
  toast("Evento importado.");
}

const LUGAR_ESTADOS = ["Por contactar", "Contactado", "En evaluación", "Disponible", "Descartado"];

const LUGAR_COSTO_MODALIDADES = ["Por definir", "Gratis / préstamo", "Por hora", "Por jornada", "Por evento", "Porcentaje de taquilla", "Intercambio / convenio"];

// Cada dotación es un check simple: o el lugar lo tiene, o no.
const LUGAR_DOTACION = [
  ["sonido", "Sonido / audio"],
  ["luces", "Luces"],
  ["tarima", "Tarima o escenario"],
  ["camerinos", "Camerinos"],
  ["bodega", "Bodega / almacenamiento"],
  ["parqueadero", "Parqueadero"],
  ["sillas", "Sillas para público"],
  ["proyector", "Proyector / pantalla"],
  ["wifi", "WiFi"],
  ["accesible", "Acceso movilidad reducida"]
];

const currencyCO = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function formatMoney(value) {
  const number = Number(value);
  if (!value && value !== 0) return "";
  if (Number.isNaN(number)) return String(value);
  return currencyCO.format(number);
}

function costoResumen(lugar) {
  if (lugar.costo && !lugar.costoModalidad) return String(lugar.costo); // registros antiguos
  const modalidad = lugar.costoModalidad || "Por definir";
  const monto = formatMoney(lugar.costoValor);
  if (modalidad === "Gratis / préstamo") return "Gratis / préstamo";
  if (!monto) return modalidad;
  const sufijo = { "Por hora": " / hora", "Por jornada": " / jornada", "Por evento": " / evento" }[modalidad] || ` · ${modalidad}`;
  return `${monto}${sufijo}`;
}

function checkCard(name, label, checked) {
  return `<label class="check-card"><input type="checkbox" name="${name}" value="si" ${checked ? "checked" : ""} />${escapeHtml(label)}</label>`;
}

function renderPlaceCards() {
  if (!state.lugares.length) {
    return `<div class="empty-state"><h3>Sin lugares todavía</h3><p>Registra los espacios que realmente están evaluando: capacidad, costo, dotación y contacto.</p></div>`;
  }
  return `<div class="place-grid">${state.lugares.map(lugar => {
    const dotacion = LUGAR_DOTACION.filter(([key]) => lugar[key]);
    const chips = dotacion.length
      ? dotacion.map(([, label]) => `<span class="badge info">${escapeHtml(label)}</span>`).join("")
      : `<span class="badge off">Sin dotación registrada</span>`;
    const facts = [
      lugar.capacidad ? `<span>Capacidad: <b>${escapeHtml(lugar.capacidad)} personas</b></span>` : "",
      `<span>Costo: <b>${escapeHtml(costoResumen(lugar) || "Por definir")}</b></span>`,
      lugar.contactoNombre || lugar.contacto ? `<span>Contacto: <b>${escapeHtml(lugar.contactoNombre || lugar.contacto)}</b></span>` : "",
      lugar.direccion ? `<span>Dirección: <b>${escapeHtml(lugar.direccion)}</b></span>` : "",
      lugar.horarioDesde || lugar.horarioHasta ? `<span>Horario: <b>${escapeHtml(lugar.horarioDesde || "?")} – ${escapeHtml(lugar.horarioHasta || "?")}</b></span>` : ""
    ].filter(Boolean).join("");
    const notas = [
      lugar.documentos ? `Documentos: ${lugar.documentos}` : "",
      lugar.observaciones || ""
    ].filter(Boolean).join("\n");
    return `
      <article class="place-card">
        <div class="place-card-head">
          <strong>${escapeHtml(lugar.nombre || "Lugar sin nombre")}</strong>
          <div class="actions">
            ${badge(lugar.estado)}
            <button type="button" class="small-btn" data-edit-place="${lugar.id}">Editar</button>
            <button type="button" class="small-btn danger" data-delete-place="${lugar.id}">Eliminar</button>
          </div>
        </div>
        <div class="place-facts">${facts}</div>
        <div class="place-chips">${chips}</div>
        ${notas ? `<p class="place-note">${escapeHtml(notas)}</p>` : ""}
      </article>`;
  }).join("")}</div>`;
}

function openPlacesDialog() {
  setModal(`
    <h3>Base de lugares posibles</h3>
    <p class="muted">Esta base es independiente de los eventos: sirve para comparar espacios y conservar contactos, costos, dotación y restricciones.</p>
    <div id="placesList">${renderPlaceCards()}</div>
    <div class="modal-actions" style="position:static;background:none;">
      <button type="button" class="btn btn-primary" data-new-place>+ Agregar lugar</button>
    </div>
  `, null);

  state.placesDialogOpen = true;
  modalForm.onclick = event => {
    const nuevo = event.target.closest("[data-new-place]");
    const editar = event.target.closest("[data-edit-place]");
    const borrar = event.target.closest("[data-delete-place]");
    if (nuevo) openPlaceForm();
    if (editar) openPlaceForm(state.lugares.find(l => l.id === editar.dataset.editPlace));
    if (borrar) deletePlace(state.lugares.find(l => l.id === borrar.dataset.deletePlace));
  };
}

// Mantiene la lista de lugares al día mientras el modal está abierto.
function refreshPlacesList() {
  syncDatalists();
  if (!state.placesDialogOpen) return;
  const box = $("#placesList");
  if (box) box.innerHTML = renderPlaceCards();
}

function openPlaceForm(lugar = null) {
  const isEdit = Boolean(lugar?.id);
  const l = lugar || {};
  setModal(`
    <h3>${isEdit ? "Editar lugar" : "Agregar lugar"}</h3>

    <fieldset class="form-section">
      <legend>Identificación</legend>
      <div class="form-grid">
        <label class="wide">Nombre del lugar
          <input required name="nombre" value="${escapeHtml(l.nombre || "")}" placeholder="Ej: Auditorio Colegio San Carlos" />
        </label>
        <label>Capacidad (número de personas)
          <input type="number" inputmode="numeric" min="0" step="1" name="capacidad" value="${escapeHtml(l.capacidad || "")}" placeholder="Ej: 250" />
          <span class="field-hint">Solo el número de asistentes que caben sentados.</span>
        </label>
        <label>Estado de la gestión
          <select name="estado">${selectOptions(LUGAR_ESTADOS, l.estado || "Por contactar")}</select>
        </label>
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Costo del alquiler</legend>
      <div class="form-grid">
        <label>¿Cómo se cobra?
          <select name="costoModalidad">${selectOptions(LUGAR_COSTO_MODALIDADES, l.costoModalidad || "Por definir")}</select>
        </label>
        <label>Valor en pesos (COP)
          <span class="input-prefix"><span>$</span><input type="number" inputmode="numeric" min="0" step="1000" name="costoValor" value="${escapeHtml(l.costoValor || "")}" placeholder="350000" /></span>
          <span class="field-hint">Solo el número, sin puntos ni signos. Déjalo vacío si es gratis o no lo sabes.</span>
        </label>
        <label class="wide">¿Qué incluye o qué condiciones pone?
          <input name="costoIncluye" value="${escapeHtml(l.costoIncluye || l.costo || "")}" placeholder="Ej: incluye sonido básico y 2 horas de montaje; se paga 50% por anticipado" />
        </label>
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Contacto</legend>
      <div class="form-grid">
        <label>Persona encargada
          <input name="contactoNombre" value="${escapeHtml(l.contactoNombre || l.contacto || "")}" placeholder="Nombre y cargo" />
        </label>
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>¿Qué tiene el lugar?</legend>
      <p class="field-hint" style="margin:0 0 12px;">Marca solo lo que el lugar ya presta. Lo que no marques, lo tiene que llevar Musicala.</p>
      <div class="check-grid">
        ${LUGAR_DOTACION.map(([key, label]) => checkCard(key, label, l[key])).join("")}
      </div>
      <label style="margin-top:14px;">Detalle técnico (opcional)
        <input name="notasTecnicas" value="${escapeHtml(l.notasTecnicas || l.tecnica || "")}" placeholder="Ej: consola de 12 canales, 4 micrófonos, sin monitores" />
      </label>
    </fieldset>

    <fieldset class="form-section">
      <legend>Ubicación y horarios</legend>
      <div class="form-grid">
        <label class="wide">Dirección
          <input name="direccion" value="${escapeHtml(l.direccion || "")}" placeholder="Calle 93 # 17-09" />
        </label>
        <label>Ciudad / localidad
          <input name="ciudad" value="${escapeHtml(l.ciudad || "")}" placeholder="Bogotá, Chapinero" />
        </label>
        <label>Días disponibles
          <input name="diasDisponibles" value="${escapeHtml(l.diasDisponibles || "")}" placeholder="Ej: sábados y domingos" />
        </label>
        <label>Disponible desde
          <input type="time" name="horarioDesde" value="${escapeHtml(l.horarioDesde || "")}" />
        </label>
        <label>Disponible hasta
          <input type="time" name="horarioHasta" value="${escapeHtml(l.horarioHasta || "")}" />
        </label>
        <label class="wide">Documentos o requisitos para reservar
          <input name="documentos" value="${escapeHtml(l.documentos || "")}" placeholder="Ej: carta de solicitud, RUT, póliza, listado de asistentes" />
        </label>
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Observaciones</legend>
      <label>Notas libres
        <textarea name="observaciones" placeholder="Restricciones de ruido, acceso de carga, experiencias previas...">${escapeHtml(l.observaciones || l.apoyo || "")}</textarea>
      </label>
    </fieldset>
  `, isEdit ? "Guardar cambios" : "Guardar lugar");

  modalForm.onsubmit = async event => {
    event.preventDefault();
    const formData = new FormData(modalForm);
    const data = {};
    ["nombre", "estado", "costoModalidad", "costoIncluye", "contactoNombre",
     "notasTecnicas", "direccion", "ciudad", "diasDisponibles", "horarioDesde", "horarioHasta", "documentos", "observaciones"]
      .forEach(key => data[key] = formValue(formData, key) || "");

    const capacidad = formValue(formData, "capacidad");
    const costoValor = formValue(formData, "costoValor");
    data.capacidad = capacidad === "" ? null : Number(capacidad);
    data.costoValor = costoValor === "" ? null : Number(costoValor);

    LUGAR_DOTACION.forEach(([key]) => data[key] = formData.get(key) === "si");

    data.updatedAt = serverTimestamp();
    data.updatedBy = state.user.email;

    try {
      if (isEdit) {
        await updateDoc(doc(db, "lugares", lugar.id), data);
        toast("Lugar actualizado.");
      } else {
        data.createdAt = serverTimestamp();
        data.createdBy = state.user.email;
        await addDoc(collection(db, "lugares"), data);
        toast("Lugar guardado en la base.");
      }
      openPlacesDialog();
    } catch (error) {
      console.error(error);
      toast("No se pudo guardar el lugar.");
    }
  };
}

async function deletePlace(lugar) {
  if (!lugar) return;
  if (!confirm(`¿Eliminar "${lugar.nombre || "este lugar"}" de la base?`)) return;
  try {
    await deleteDoc(doc(db, "lugares", lugar.id));
    toast("Lugar eliminado.");
  } catch (error) {
    console.error(error);
    toast("No se pudo eliminar el lugar.");
  }
}

/* ==================== Base maestra de personas ==================== */

function docentesYaUsados() {
  const sources = [state.personas, state.convocatoriasDocentes, state.participantesRegistrados, ...Object.values(state.childData)];
  if (sameReferences(teacherCandidatesCache?.sources, sources)) return teacherCandidatesCache.rows;
  const recorded = collectReusableContext({ children: state.childData, participations: state.participantesRegistrados }).teachers;
  const rows = [...state.personas,
    ...recorded.map(row => ({ nombre: row.name, tipo: 'Docente', source: 'Participaciones registradas' })),
    ...state.convocatoriasDocentes.flatMap(call => Object.values(call.docentes || {}).map(nombre => ({ nombre, tipo: 'Docente', source: 'Nombre habilitado en otra muestra' })))
  ];
  teacherCandidatesCache = { sources, rows };
  return rows;
}

// Se reutilizan los nombres ya guardados sin crear registros nuevos en las bases.
function syncDatalists() {
  sampleRoutes.refresh();
  const context = reusableEventContext();
  const fill = (id, entries) => {
    const list = $(`#${id}`);
    if (!list) return;
    const markup = uniqueSuggestions(entries).sort((a,b) => a.name.localeCompare(b.name, 'es'))
      .map(row => `<option value="${escapeHtml(row.name)}">${escapeHtml(row.detail || '')}</option>`).join('');
    if (list._suggestionsMarkup !== markup) {
      list.innerHTML = markup;
      list._suggestionsMarkup = markup;
    }
  };
  fill('personasDisponibles', context.people);
  fill('docentesDisponibles', context.teachers);
  fill('lugaresDisponibles', context.places);
  fill('estudiantesDisponibles', [
    ...state.ripEstudiantes.filter(e => e.nivel === 'activo').map(e => ({ name: e.nombre, detail: e.etiqueta })),
    ...context.students
  ]);
  refreshParticipantTeacherContext();
}

function personAreas(person = {}) {
  const values = Array.isArray(person.areas) ? person.areas : [person.area];
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim() && value !== 'General').map(value=>value.trim()))];
}

function renderPeopleCards() {
  if (!state.personas.length) {
    return `<div class="empty-state"><h3>Sin personas todavía</h3><p>Registra docentes, técnicos, proveedores y aliados una sola vez. Después aparecen como sugerencia en todos los formularios.</p></div>`;
  }
  return `<div class="place-grid">${state.personas.map(persona => {
    const facts = [
      persona.rol && normalizarNombre(persona.rol) !== normalizarNombre(persona.tipo) ? `<span>Función: <b>${escapeHtml(persona.rol)}</b></span>` : "",
      personAreas(persona).length ? `<span>Áreas: <b>${escapeHtml(personAreas(persona).join(" · "))}</b></span>` : ""
    ].filter(Boolean).join("");
    return `
      <article class="place-card">
        <div class="place-card-head">
          <strong>${escapeHtml(persona.nombre || "Sin nombre")}</strong>
          <div class="actions">
            <span class="badge info">${escapeHtml(persona.tipo || "Sin tipo")}</span>
            <button type="button" class="small-btn" data-edit-person="${persona.id}">Editar</button>
            <button type="button" class="small-btn danger" data-delete-person="${persona.id}">Eliminar</button>
          </div>
        </div>
        <div class="place-facts">${facts}</div>
        ${persona.notas ? `<p class="place-note">${escapeHtml(persona.notas)}</p>` : ""}
      </article>`;
  }).join("")}</div>`;
}

function openPeopleDialog() {
  setModal(`
    <h3>Base de personas</h3>
    <p class="muted">Docentes, técnicos, proveedores y aliados que se repiten evento tras evento. Se registran una vez y quedan como sugerencia en los campos de responsable, docente, encargado y equipo.</p>
    <div id="peopleList">${renderPeopleCards()}</div>
    <div class="modal-actions" style="position:static;background:none;">
      <button type="button" class="btn btn-primary" data-new-person>+ Agregar persona</button>
    </div>
  `, null);

  state.peopleDialogOpen = true;
  modalForm.onclick = event => {
    const nueva = event.target.closest("[data-new-person]");
    const editar = event.target.closest("[data-edit-person]");
    const borrar = event.target.closest("[data-delete-person]");
    if (nueva) openPersonForm();
    if (editar) openPersonForm(state.personas.find(p => p.id === editar.dataset.editPerson));
    if (borrar) deletePerson(state.personas.find(p => p.id === borrar.dataset.deletePerson));
  };
}

function refreshPeopleList() {
  syncDatalists();
  if (!state.peopleDialogOpen) return;
  const box = $("#peopleList");
  if (box) box.innerHTML = renderPeopleCards();
}

function openPersonForm(persona = null) {
  const isEdit = Boolean(persona?.id);
  const p = persona || {};
  setModal(`
    <h3>${isEdit ? "Editar persona" : "Agregar persona"}</h3>
    <fieldset class="form-section">
      <legend>Datos</legend>
      <div class="form-grid">
        <label class="wide">Nombre completo<input required name="nombre" value="${escapeHtml(p.nombre || "")}" /></label>
        <label class="wide">Vínculo / tipo de persona<select name="tipo">${selectOptions(PERSONA_TIPOS, p.tipo || "Docente")}</select><span class="field-hint">Cómo participa en Musicala: docente, administrativo, técnico o proveedor.</span></label>
        <fieldset class="wide form-section"><legend>Áreas (puedes elegir varias)</legend><div class="form-grid">${[...new Set([...FIELD_OPTIONS.areas.filter(area=>area!=="General"),...personAreas(p)])].map(area=>`<label class="check-card"><input type="checkbox" name="areas" value="${escapeHtml(area)}" ${personAreas(p).includes(area)?"checked":""} /><span>${escapeHtml(area)}</span></label>`).join("")}</div><p class="field-hint">Por ejemplo: Música y Artes plásticas. Si no eliges ninguna, queda como General.</p></fieldset>
        <label class="wide">Función específica (opcional)<input name="rol" value="${escapeHtml(normalizarNombre(p.rol) === normalizarNombre(p.tipo) ? "" : p.rol || "")}" placeholder="Ej.: Piano, apoyo en escenario o recepción" /><span class="field-hint">Úsala para precisar su función. Si elegiste Docente, no necesitas repetirlo aquí.</span></label>
      </div>
    </fieldset>
    <fieldset class="form-section">
      <legend>Observaciones</legend>
      <label>Notas<textarea name="notas" placeholder="Instrumentos que cubre, tarifas, acuerdos previos...">${escapeHtml(p.notas || "")}</textarea></label>
    </fieldset>
  `, isEdit ? "Guardar cambios" : "Guardar persona");

  modalForm.onsubmit = async event => {
    event.preventDefault();
    const formData = new FormData(modalForm);
    const data = {};
    ["nombre", "tipo", "rol", "notas"]
      .forEach(key => data[key] = formValue(formData, key) || "");
    data.areas = [...new Set(formData.getAll("areas").map(String))];
    data.area = data.areas[0] || "General";
    data.updatedAt = serverTimestamp();
    data.updatedBy = state.user.email;

    try {
      if (isEdit) {
        await updateDoc(doc(db, "personas", persona.id), data);
        toast("Persona actualizada.");
      } else {
        data.createdAt = serverTimestamp();
        data.createdBy = state.user.email;
        await addDoc(collection(db, "personas"), data);
        toast("Persona guardada en la base.");
      }
      openPeopleDialog();
    } catch (error) {
      console.error(error);
      toast("No se pudo guardar la persona.");
    }
  };
}

async function deletePerson(persona) {
  if (!persona) return;
  if (!confirm(`¿Eliminar a "${persona.nombre || "esta persona"}" de la base?`)) return;
  try {
    await deleteDoc(doc(db, "personas", persona.id));
    toast("Persona eliminada.");
  } catch (error) {
    console.error(error);
    toast("No se pudo eliminar la persona.");
  }
}

function attachGlobalEvents() {
  $("#annualBtn").addEventListener("click", () => mostrarVista("anual"));
  annualView.addEventListener("annual-back", () => mostrarVista("eventos"));
  $("#loginBtn").addEventListener("click", login);
  $("#logoutBtn").addEventListener("click", logout);
  $("#newEventBtn").addEventListener("click", () => openEventDialog());
  $("#commonActivitiesBtn").addEventListener("click", openCommonActivitiesDialog);
  $("#placesBtn").addEventListener("click", openPlacesDialog);
  $("#peopleBtn").addEventListener("click", openPeopleDialog);
  $("#sampleRoutesBtn").addEventListener("click",()=>sampleRoutes.open());
  $("#historyBtn").addEventListener("click", () => { state.mostrarHistorialEventos=!state.mostrarHistorialEventos;applyFilters(); });
  $("#studentsBtn").addEventListener("click", () => {
    mostrarVista(state.vistaPrincipal === "estudiantes" ? "eventos" : "estudiantes");
  });
  modal.addEventListener("close", () => {
    state.placesDialogOpen = false;
    state.peopleDialogOpen = false;
  });
  $("#exportAllBtn").addEventListener("click", exportAllEvents);
  $("#printBtn").addEventListener("click", () => window.print());
  ["#searchInput", "#typeFilter", "#statusFilter"].forEach(selector => $(selector).addEventListener("input", applyFilters));
  eventDetail.addEventListener("click", event => {
    const routeTarget=event.target.closest("[data-sample-route]");
    if(routeTarget){sampleRoutes.open(state.childData.muestras.find(row=>row.id===routeTarget.dataset.sampleRoute));return;}
    const routeStudent=event.target.closest("[data-route-student-open]");
    if(routeStudent){sampleRoutes.open(state.ripEstudiantes.find(row=>row.studentId===routeStudent.dataset.routeStudentOpen));return;}
    const editTarget = event.target.closest("[data-edit-child]");
    const deleteTarget = event.target.closest("[data-delete-child]");
    const cardTarget = event.target.closest("[data-card]");
    if (cardTarget) {
      const [tab, id] = cardTarget.dataset.card.split(":");
      openChildDialog(tab, getChildById(tab, id));
    }
    if (editTarget) {
      const [tab, id] = editTarget.dataset.editChild.split(":");
      openChildDialog(tab, getChildById(tab, id));
    }
    if (deleteTarget) {
      const [tab, id] = deleteTarget.dataset.deleteChild.split(":");
      deleteChild(tab, id);
    }
  });
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      await importEventFromFile(file);
    } catch (error) {
      console.error(error);
      toast("No pude importar ese JSON. Revisa que sea una exportación de esta app.");
    } finally {
      importFile.value = "";
    }
  });
}

onAuthStateChanged(auth, user => {
  state.user = user;
  if (user) {
    authScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
    $("#userPill").innerHTML = `<strong>${escapeHtml(user.displayName || "Usuario")}</strong><br><span>${escapeHtml(user.email || "")}</span>`;
    annualSystem.start();
    sampleRoutes.start();
    listenEventos();
    listenLugares();
    listenPersonas();
    listenTeacherCalls();
    listenParticipaciones();
    cargarRipSilencioso();
  } else {
    sampleRoutes.stop();
    teacherAdmin.stop();
    annualSystem.stop();
    annualView.classList.add("hidden");
    kpis.classList.remove("hidden");
    dashboard.classList.add("hidden");
    authScreen.classList.remove("hidden");
    if (state.unsubEventos) state.unsubEventos();
    if (state.unsubLugares) state.unsubLugares();
    if (state.unsubPersonas) state.unsubPersonas();
    if (state.unsubConvocatoriasDocentes) state.unsubConvocatoriasDocentes();
    if (state.unsubParticipaciones) state.unsubParticipaciones();
    clearChildListeners();
    state.eventos = [];
    state.lugares = [];
    state.personas = [];
    state.convocatoriasDocentes = [];
    state.participantesRegistrados = [];
    state.participacionesCargadas = false;
    state.participacionesError = '';
    state.ripEstudiantes = [];
    state.ripEstado = "desconectado";
    state.participaciones = new Map();
    state.vistaPrincipal = "eventos";
    state.selectedEventId = null;
    state.selectedEvent = null;
    state.actividadesComunesSincronizadas = false;
    syncDatalists();
  }
});

attachGlobalEvents();
renderKpis();

function renderRiderRecords() {
  const tab="rider", rows=state.childData.rider || [];
  if (!rows.length) return `<p class="muted">Aún no hay necesidades generales. Usa + Agregar para registrar proveedores, disponibilidad y otros recursos.</p>`;
  if (state.vista === "tablero") return renderKanban(tab);
    return table(["Elemento", "Categoría", "Cantidad", "Quién lo aporta", "Ubicación", "Estado", "Notas", ""], rows.map(row => [
      escapeHtml(row.elemento || ""), escapeHtml(row.categoria || ""), escapeHtml(row.cantidad || ""),
      escapeHtml(row.proveedor || ""), escapeHtml(row.ubicacion || ""), badge(row.estado),
      escapeHtml(row.notas || ""), rowActions(tab, row.id)
    ]));
}
