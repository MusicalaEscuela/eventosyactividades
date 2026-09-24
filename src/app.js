import { createAnnualSystem } from "./muestras-anual.js";
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
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch
} from "./firebase-config.js";

import { BANCO_REPERTORIO, GENEROS, normalizeGenre, findRepertorio } from "./repertorio.js";

import {
  ripSignIn,
  ripSignOut,
  ripRestoreSession,
  ripCurrentUser,
  ripFetchEstudiantes,
  ripNorm,
  RIP_ALLOWED_EMAILS
} from "./rip-config.js";

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
    bitacora: []
  },
  vista: "tabla",
  vistaPrincipal: "eventos",      // "eventos" | "estudiantes"
  ripEstado: "desconectado",      // desconectado | cargando | listo | error
  ripError: "",
  ripEstudiantes: [],
  participaciones: new Map(),     // clave de estudiante → presentaciones
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
  unsubChildren: [],
  actividadesComunesSincronizadas: false
};

const annualView = $("#annualView");
const annualSystem = createAnnualSystem({root: annualView, user: () => state.user, toast, onChange: () => renderDetail(), events: () => state.eventos});
const COLLECTION = "eventos";
const CHILD_COLLECTIONS = ["actividades", "muestras", "programacion", "equipo", "rider", "checklist", "documentos", "bitacora"];
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
  "Cancelado": "danger",
  "Bloqueado": "danger"
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
const RECURSOS_TECNICOS_INICIALES = [
  // Sonido general
  "Sonido", "Monitor", "Pista", "Consola / mezcla",
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
  return Array.isArray(lista) && lista.length ? lista : respaldo;
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
    const indice = new Map();
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data() || {};
      // El id del evento es el abuelo del documento: eventos/{id}/muestras/{id}
      const eventoId = docSnap.ref.parent.parent?.id || "";
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
          nombreLibre: String(nombre || data.estudianteGrupo || "").trim(),
          eventoTitulo: evento?.titulo || "Evento",
          fecha: evento?.fechaInicio || "",
          tipo: evento?.tipo || "",
          repertorio: data.repertorio || "",
          repertorios: obrasDe(data),
          esEnsamble: Boolean(data.esEnsamble),
          nombreEnsamble: data.esEnsamble ? (data.estudianteGrupo || "") : "",
          estado: data.estado || ""
        });
      });
    });
    state.participaciones = indice;
    if (state.vistaPrincipal === "estudiantes") renderEstudiantes();
  }, error => {
    console.error(error);
    toast(explicarError(error, "No pude leer el historial de participaciones"));
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
        ${filas.length ? table(["Estudiante", "Estado en RIP", "Última clase", "Veces", "Se presentó en"], filas.map(f => [
          escapeHtml(f.nombre),
          `<span class="badge ${NIVEL_BADGE[f.nivel]}">${escapeHtml(f.etiqueta)}</span>`,
          escapeHtml(f.ultimaClase || "—"),
          f.vecesPresentado || `<span class="badge off">0</span>`,
          f.presentaciones.length
            ? f.presentaciones.map(p => `<span class="badge neutral">${escapeHtml(p.eventoTitulo)}${p.repertorio ? ` · ${escapeHtml(p.repertorio)}` : ""}</span>`).join(" ")
            : `<span class="muted">Sin presentaciones registradas</span>`
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
function perfilArtistico(estudiante) { return ripNorm([estudiante.area, estudiante.instrumento, estudiante.programa].filter(Boolean).join(" · ")); }
function areaArtisticaEstudiante(estudiante) { const perfil=perfilArtistico(estudiante); if(perfil.includes("danza"))return "danza";if(perfil.includes("teatro"))return "teatro";if(perfil.includes("plast")||perfil.includes("visual"))return "artes-plasticas";if(perfil.includes("musica")||estudiante.instrumento||estudiante.programa)return "musica";return ""; }
function coincideConFiltroArtistico(estudiante,areaId,modalidadId) { if(areaArtisticaEstudiante(estudiante)!==areaId)return false;if(areaId!=="musica"||!modalidadId)return true;return (FILTROS_FAMILIA_MUSICAL[modalidadId]||[modalidadId]).some(termino=>perfilArtistico(estudiante).includes(ripNorm(termino))); }

function candidatosPicker() {
  const { texto, soloActivos, areaId, modalidadId } = state.picker;
  const busqueda = ripNorm(texto);
  const base = state.ripEstudiantes
    .filter(e => !soloActivos || e.nivel === "activo")
    .filter(e => !busqueda || ripNorm(e.nombre).includes(busqueda));
  const coincidencias = base.filter(e => coincideConFiltroArtistico(e, areaId, modalidadId));
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
  const repintar = () => { lista.innerHTML=renderPickerLista();const sinPerfil=estudiantesSinPerfilParaFiltro(),filtroInfo=$("#pickerFiltroInfo");if(filtroInfo)filtroInfo.textContent=sinPerfil?(pickerMuestraPerfilesPorConfirmar()?`RIP no tiene coincidencias clasificadas para este filtro. Se muestran ${sinPerfil} estudiante${sinPerfil===1?"":"s"} activo${sinPerfil===1?"":"s"} por confirmar para que no quede nadie por fuera.`:`${sinPerfil} estudiante${sinPerfil===1?"":"s"} activo${sinPerfil===1?"":"s"} sin área o instrumento registrado en RIP no coincide${sinPerfil===1?"":"n"} con este filtro.`):"El padrón está filtrado por el área e instrumento seleccionados.";actualizarPickerPie(); };

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

    const nombreEnsamble = $("#pickerNombre")?.value.trim() || "";
    if (modo === "ensamble" && !nombreEnsamble) {
      toast("Ponle un nombre al ensamble.");
      return;
    }

    const base = annualSystem.normalizeParticipant({
      areaArtisticaId: modalForm.querySelector('[name="areaArtisticaId"]').value,
      modalidadPresentacionId: modalForm.querySelector('[name="modalidadPresentacionId"]').value,
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

  const conteo = repertorioDelEvento();
  const repetidas = [...conteo.entries()].filter(([, usos]) => usos.length > 1);
  const sinObra = filas.filter(row => !obrasDe(row).length).length;
  const minutos = filas.reduce((total, row) => total + (Number(row.duracionMin) || 0), 0);
  const ensambles = filas.filter(row => row.esEnsamble).length;

  const chips = [
    `<span class="badge neutral">${filas.length} presentación${filas.length === 1 ? "" : "es"}</span>`,
    ensambles ? `<span class="badge info">${ensambles} ensamble${ensambles === 1 ? "" : "s"}</span>` : "",
    `<span class="badge neutral">${conteo.size} obra${conteo.size === 1 ? "" : "s"} distinta${conteo.size === 1 ? "" : "s"}</span>`,
    minutos ? `<span class="badge neutral">≈ ${minutos} min</span>` : "",
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

  return `<div class="resumen-repertorio">${chips}${detalle}</div>`;
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

function campoObra(valor = "") {
  return `<div class="obra-item" style="display:flex;gap:8px;margin-bottom:6px;">
    <input name="repertorioItem" list="bancoRepertorio" value="${escapeHtml(valor)}" placeholder="Escribe la obra o elígela del banco" style="flex:1;" />
    <button type="button" class="ghost obra-quitar" title="Quitar obra" aria-label="Quitar obra">✕</button>
  </div>`;
}

/** Cuenta cuántas veces se usa cada obra en el evento abierto. */
function repertorioDelEvento() {
  const conteo = new Map();
  state.childData.muestras.forEach(row => {
    new Set(obrasDe(row).map(o => ripNorm(o))).forEach(clave => {
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
function avisoRepertorio(obra, { excluirId = "", estudiante = "", studentId = "" } = {}) {
  const clave = ripNorm(obra);
  if (!clave) return "";

  const enEvento = (repertorioDelEvento().get(clave) || []).filter(row => row.id !== excluirId);
  if (enEvento.length) {
    const quienes = enEvento.map(r => r.estudianteGrupo || "otro participante").join(", ");
    return `⚠️ Repetida en este evento: ya la presenta ${quienes}.`;
  }

  const propias = state.participaciones.get(String(studentId).trim())
    || state.participaciones.get(ripNorm(estudiante))
    || [];
  const anterior = propias.find(p => (p.repertorios?.length ? p.repertorios : [p.repertorio || ""]).some(o => ripNorm(o) === clave));
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
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => String(a.fechaLimite || a.fecha || a.createdAt?.seconds || "").localeCompare(String(b.fechaLimite || b.fecha || b.createdAt?.seconds || "")));
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
        <span class="badge neutral">${normalizeDate(evento.fechaInicio)}</span>
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
  const items = [...state.childData.actividades, ...state.childData.muestras, ...state.childData.checklist, ...state.childData.documentos];
  if (!items.length) return { done: 0, total: 0, percent: 0 };
  const done = items.filter(item => ["Listo", "Confirmado", "Realizado"].includes(item.estado)).length;
  return { done, total: items.length, percent: Math.round((done / items.length) * 100) };
}

function renderDetail() {
  if (state.vistaPrincipal !== "eventos") return;
  if (!state.selectedEvent) {
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
    ["documentos", "Documentos"],
    ["bitacora", "Bitácora"]
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
            <span class="badge neutral">${normalizeDate(evento.fechaInicio)}${evento.fechaFin && evento.fechaFin !== evento.fechaInicio ? ` → ${normalizeDate(evento.fechaFin)}` : ""}</span>
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
          <div class="info-box"><span>Presupuesto</span><strong>${escapeHtml(evento.presupuesto || "Sin definir")}</strong></div>
          <div class="info-box wide"><span>Notas</span><strong>${escapeHtml(evento.notas || "Sin notas")}</strong></div>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar"><div style="width:${progress.percent}%"></div></div>
        <div class="progress-meta"><span>Avance operativo</span><strong>${progress.done}/${progress.total} ítems · ${progress.percent}%</strong></div>
      </div>
    </section>

    ${evento.tipo === "Muestra de proceso" ? annualSystem.panel(state.childData.muestras) : ""}
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
          <button class="btn btn-primary" data-action="add-child">+ Agregar</button>
        </div>
      </div>
      ${state.tab === "muestras" ? resumenRepertorio() : ""}
      <div class="table-panel" id="tabContent">${renderTabContent(state.tab)}</div>
    </section>
  `;

  $$("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
    state.tab = btn.dataset.tab;
    renderDetail();
  }));
  $$("[data-vista]").forEach(btn => btn.addEventListener("click", () => {
    state.vista = btn.dataset.vista;
    renderDetail();
  }));
  $$("[data-action]").forEach(btn => btn.addEventListener("click", () => handleAction(btn.dataset.action)));
  attachBoardDragAndDrop();
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
  const columnas = KANBAN_COLUMNS.map(col => ({
    ...col,
    items: rows.filter(row => col.estados.includes(row.estado || ""))
  }));
  // Cualquier estado raro cae en la primera columna para que nada se pierda.
  const conocidos = KANBAN_COLUMNS.flatMap(col => col.estados);
  const huerfanos = rows.filter(row => !conocidos.includes(row.estado || ""));
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
  const columna = KANBAN_COLUMNS.find(col => col.id === columnaId);
  const row = getChildById(tab, id);
  if (!columna || !row || columna.estados.includes(row.estado || "")) return;
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

function renderTabContent(tab) {
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
      badge(row.estado),
      escapeHtml(row.prioridad || "Media"),
      escapeHtml(row.notas || ""),
      rowActions(tab, row.id)
    ]));
  }

  if (tab === "muestras") {
    const conteoObras = repertorioDelEvento();
    return table(["Estudiante / grupo", "Área artística", "Modalidad", "Repertorio / actividad / obra", "Género", "Docente", "Bloque", "Duración", "Estado", "Recursos", ""], rows.map(row => [
      row.esEnsamble
        ? `<strong>${escapeHtml(row.estudianteGrupo || "Ensamble")}</strong>
           <div class="muted" style="font-size:.78rem;margin-top:3px;">🎻 ${(row.integrantes || []).map(i => escapeHtml(i.nombre)).join(", ")}</div>`
        : escapeHtml(row.estudianteGrupo || "Sin nombre"),
      escapeHtml(annualSystem.areaName(row.areaArtisticaId, row.area || "Música")),
      escapeHtml(annualSystem.modalityName(row.areaArtisticaId || "musica", row.modalidadPresentacionId || row.familiaInstrumentalId, row.modalidadPresentacionNombre || row.familiaInstrumentalNombre || "Sin asignar")),
      obrasDe(row).map(obra => (conteoObras.get(ripNorm(obra))?.length > 1)
        ? `${escapeHtml(obra)} <span class="badge danger">Repetida</span>`
        : escapeHtml(obra)).join("<br>"),
      row.genero && row.genero !== "Sin definir" ? `<span class="badge info">${escapeHtml(row.genero)}</span>` : "",
      escapeHtml(row.docente || ""),
      escapeHtml(row.bloque || ""),
      row.duracionMin ? `${escapeHtml(row.duracionMin)} min` : "",
      badge(row.estado),
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
    return table(["Hora", "Bloque", "Espacio", "Actividad / presentación", "Encargado", "Duración", "Montaje / transición", ""], rows.map(row => [
      escapeHtml(row.hora || ""), escapeHtml(row.bloque || ""), escapeHtml(row.espacio || ""),
      escapeHtml(row.item || ""), escapeHtml(row.encargado || ""), row.duracionMin ? `${escapeHtml(row.duracionMin)} min` : "",
      escapeHtml(row.montaje || ""), rowActions(tab, row.id)
    ]));
  }

  if (tab === "equipo") {
    return table(["Persona", "Rol", "Zona / bloque", "Horario", "Contacto", "Confirmación", ""], rows.map(row => [
      escapeHtml(row.nombre || ""), escapeHtml(row.rol || ""), escapeHtml(row.zona || ""),
      escapeHtml(row.horario || ""), escapeHtml(row.contacto || ""), badge(row.estado), rowActions(tab, row.id)
    ]));
  }

  if (tab === "rider") {
    return table(["Elemento", "Categoría", "Cantidad", "Quién lo aporta", "Ubicación", "Estado", "Notas", ""], rows.map(row => [
      escapeHtml(row.elemento || ""), escapeHtml(row.categoria || ""), escapeHtml(row.cantidad || ""),
      escapeHtml(row.proveedor || ""), escapeHtml(row.ubicacion || ""), badge(row.estado),
      escapeHtml(row.notas || ""), rowActions(tab, row.id)
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

function table(headers, rows) {
  return `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function rowActions(tab, id) {
  return `<div class="actions"><button class="small-btn" data-edit-child="${tab}:${id}">Editar</button><button class="small-btn danger" data-delete-child="${tab}:${id}">Eliminar</button></div>`;
}

function handleAction(action) {
  if (action === "edit-event") openEventDialog(state.selectedEvent);
  if (action === "export-event") exportSelectedEvent();
  if (action === "import-event") importFile.click();
  if (action === "mark-realized") cerrarEvento("realizado");
  if (action === "mark-not-realized") cerrarEvento("no-realizado");
  if (action === "archive-event") archiveEvent();
  if (action === "delete-event") deleteEvent();
  if (action === "add-child") openChildDialog(state.tab);
  if (action === "pick-students") openStudentPicker("individual");
  if (action === "new-ensemble") openStudentPicker("ensamble");
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
      <label>Fecha inicio<input type="date" name="fechaInicio" value="${escapeHtml(evento?.fechaInicio || "")}" /></label>
      <label>Fecha fin<input type="date" name="fechaFin" value="${escapeHtml(evento?.fechaFin || "")}" /></label>
      <label>Lugar<input name="lugar" list="lugaresDisponibles" value="${escapeHtml(evento?.lugar || "")}" /></label>
      <label>Público<input name="publico" value="${escapeHtml(evento?.publico || "")}" /></label>
      <label>Presupuesto<input name="presupuesto" value="${escapeHtml(evento?.presupuesto || "")}" placeholder="$" /></label>
      <label class="wide">Objetivo<textarea name="objetivo">${escapeHtml(evento?.objetivo || "")}</textarea></label>
      <label class="wide">Notas<textarea name="notas">${escapeHtml(evento?.notas || "")}</textarea></label>
    </div>
  `, isEdit ? "Guardar cambios" : "Crear evento");

  modalForm.onsubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    const data = Object.fromEntries(new FormData(modalForm).entries());
    data.updatedAt = serverTimestamp();
    data.updatedBy = state.user.email;
    try {
      if (isEdit) {
        await updateDoc(doc(db, COLLECTION, evento.id), data);
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

function openChildDialog(tab, row = null) {
  const isEdit = Boolean(row?.id);
  // row llega como null al agregar: el default de childForm solo cubre undefined.
  const content = childForm(tab, row || {});
  setModal(content, isEdit ? "Guardar cambios" : "Agregar");

  // El formulario de participantes parte del área artística y muestra solo los
  // campos de Música, Danza, Teatro o Artes Plásticas que correspondan.
  const areaArtisticaSelect = modalForm.querySelector('[name="areaArtisticaId"]');
  if (tab === "muestras" && areaArtisticaSelect) {
    areaArtisticaSelect.addEventListener("change", () => {
      const context = modalForm.querySelector("#areaContext");
      if (context) context.innerHTML = annualSystem.participantContext({}, areaArtisticaSelect.value);
    });
  }

  // Al escoger una obra del banco de repertorio, se propone su género.
  const obrasLista = modalForm.querySelector("#obrasLista");
  const generoSelect = modalForm.querySelector('[name="genero"]');
  if (obrasLista) {
    // Aviso de obra repetida: en este evento o ya presentada por el estudiante.
    const avisarObras = () => {
      const caja = modalForm.querySelector("#avisoRepertorio");
      if (!caja) return;
      const obras = [...obrasLista.querySelectorAll('[name="repertorioItem"]')].map(i => i.value.trim()).filter(Boolean);
      if (!obras.length) {
        caja.textContent = "Al elegir una obra del banco (Fest 2025) se completa el género automáticamente.";
        caja.className = "field-hint";
        return;
      }
      const opciones = {
        excluirId: row?.id || "",
        estudiante: modalForm.querySelector('[name="estudianteGrupo"]')?.value || "",
        studentId: modalForm.querySelector('[name="studentId"]')?.value || ""
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
    obrasLista.addEventListener("input", avisarObras);
    obrasLista.addEventListener("change", (e) => {
      // Al escoger una obra del banco de repertorio, se propone su género.
      const song = findRepertorio(e.target.value || "");
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
      else items[0].querySelector("input").value = "";
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
    const actualizarEstado = () => {
      const est = buscarEnPadron(estudianteInput.value);
      const oculto = modalForm.querySelector('[name="studentId"]');
      if (oculto) oculto.value = est?.studentId || "";
      const hint = modalForm.querySelector("#estadoEstudiante");
      if (hint) {
        hint.textContent = estadoEstudianteHint({ estudianteGrupo: estudianteInput.value });
        hint.classList.toggle("hint-alerta", Boolean(est) && est.nivel !== "activo");
        hint.classList.toggle("hint-ok", Boolean(est) && est.nivel === "activo");
      }
    };
    estudianteInput.addEventListener("input", actualizarEstado);
    estudianteInput.addEventListener("change", actualizarEstado);
  }

  // Al escoger a alguien de la base de personas, se traen su rol y contacto.
  const nombreInput = modalForm.querySelector('[name="nombre"]');
  if (tab === "equipo" && nombreInput) {
    nombreInput.addEventListener("change", () => {
      const persona = state.personas.find(p => (p.nombre || "").toLowerCase() === nombreInput.value.trim().toLowerCase());
      if (!persona) return;
      const rolInput = modalForm.querySelector('[name="rol"]');
      const contactoInput = modalForm.querySelector('[name="contacto"]');
      if (rolInput && !rolInput.value) rolInput.value = persona.rol || "";
      if (contactoInput && !contactoInput.value) contactoInput.value = persona.telefono || persona.email || "";
    });
  }

  modalForm.onsubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    const formData = new FormData(modalForm);
    const data = {};
    [...formData.entries()].forEach(([key, value]) => data[key] = typeof value === "string" ? value.trim() : value);
    if (tab === "muestras") {
      annualSystem.normalizeParticipant(data, row || {});
      if (formData.has("repertorioItem")) {
      const obras = formData.getAll("repertorioItem").map(value => String(value).trim()).filter(Boolean);
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
    }
    data.updatedAt = serverTimestamp();
    data.updatedBy = state.user.email;

    try {
      const path = collection(db, COLLECTION, state.selectedEventId, tab);
      if (isEdit) {
        await updateDoc(doc(db, COLLECTION, state.selectedEventId, tab, row.id), data);
        toast("Registro actualizado.");
      } else {
        data.createdAt = serverTimestamp();
        data.createdByEmail = state.user.email;
        data.createdByName = state.user.displayName || state.user.email;
        await addDoc(path, data);
        toast("Registro agregado.");
      }
      modal.close();
    } catch (error) {
      console.error(error);
      toast("No se pudo guardar el registro.");
    }
  };
}

/** Busca a alguien del padrón de RIP por nombre exacto (sin tildes ni mayúsculas). */
function buscarEnPadron(nombre) {
  const clave = ripNorm(nombre);
  if (!clave) return null;
  return state.ripEstudiantes.find(e => e.claveNombre === clave || ripNorm(e.nombre) === clave) || null;
}

/**
 * Aviso bajo el campo de estudiante: estado en RIP y si ya se presentó antes.
 * Los inactivos se avisan pero NO se bloquean: un exestudiante puede volver.
 */
function estadoEstudianteHint(row = {}) {
  const nombre = row.estudianteGrupo || "";
  if (!nombre) {
    return state.ripEstado === "listo"
      ? "Empieza a escribir para buscar en el padrón de RIP."
      : "Conecta el padrón desde “Estudiantes” para ver el estado de cada uno.";
  }
  const est = buscarEnPadron(nombre);
  if (!est) return "No está en el padrón de RIP. Se guarda igual (útil para grupos, ensambles o invitados).";

  const previas = (state.participaciones.get(est.studentId) || state.participaciones.get(est.claveNombre) || []).length;
  const historial = previas ? `Ya se presentó ${previas} ${previas === 1 ? "vez" : "veces"}.` : "Todavía no se ha presentado.";
  if (est.nivel === "activo") return `✅ Activo en RIP. ${historial}`;
  return `⚠️ ${est.etiqueta} en RIP — se puede inscribir igual. ${historial}`;
}

function childForm(tab, row = {}) {
  if (tab === "actividades") {
    return `
      <h3>${row.id ? "Editar actividad" : "Nueva actividad"}</h3>
      <div class="form-grid">
        <label class="wide">Actividad<input name="titulo" required value="${escapeHtml(row.titulo || "")}" /></label>
        <label>Área<select name="area">${selectOptions(FIELD_OPTIONS.areas, row.area || "General")}</select></label>
        <label>Fecha límite<input type="date" name="fechaLimite" value="${escapeHtml(row.fechaLimite || "")}" /></label>
        <label>Responsable<input name="responsable" list="personasDisponibles" value="${escapeHtml(row.responsable || "")}" /></label>
        <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
        <label>Prioridad<select name="prioridad">${selectOptions(FIELD_OPTIONS.prioridad, row.prioridad || "Media")}</select></label>
        <label class="wide">Notas<textarea name="notas">${escapeHtml(row.notas || "")}</textarea></label>
      </div>
    `;
  }

  if (tab === "muestras") {
    const opcionesRecursos = listaParticipantes("recursosTecnicos", RECURSOS_TECNICOS_INICIALES);
    const seleccionados = recursosSeleccionados(row);
    const generoActual = normalizeGenre(row.genero || "Sin definir");
    const opcionesGeneros = listaParticipantes("generos", GENEROS);
    return `
      <h3>${row.id ? "Editar muestra" : "Nueva muestra"}</h3>
      <div class="form-grid">
        <label class="wide">Estudiante o grupo
          <input name="estudianteGrupo" list="estudiantesDisponibles" required value="${escapeHtml(row.estudianteGrupo || "")}" placeholder="Busca en el padrón o escribe un grupo" />
          <input type="hidden" name="studentId" value="${escapeHtml(row.studentId || "")}" />
          <span class="field-hint" id="estadoEstudiante">${estadoEstudianteHint(row)}</span>
        </label>
        ${annualSystem.areaField(row)}
        <label>Docente<input name="docente" list="personasDisponibles" value="${escapeHtml(row.docente || "")}" /></label>
        <label class="wide">Repertorio / actividad (una o varias obras)
          <div id="obrasLista">${(obrasDe(row).length ? obrasDe(row) : [""]).map(o => campoObra(o)).join("")}</div>
          <button type="button" class="ghost" id="agregarObra" style="align-self:flex-start;">+ Agregar otra obra</button>
          <datalist id="bancoRepertorio">${BANCO_REPERTORIO.map(song => `<option value="${escapeHtml(song.titulo)}">${escapeHtml(song.artista)}</option>`).join("")}</datalist>
          <span class="field-hint" id="avisoRepertorio">Al elegir una obra del banco (Fest 2025) se completa el género automáticamente.</span>
        </label>
        <div class="wide" id="areaContext">${annualSystem.participantContext(row)}</div>
        <label>Género<select name="genero">${opcionesConSeleccion(opcionesGeneros, generoActual)}</select></label>
        <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
        <label>Prioridad<select name="prioridad">${selectOptions(FIELD_OPTIONS.prioridad, row.prioridad || "Media")}</select></label>
        <fieldset class="wide selector-recursos">
          <legend>Recursos técnicos</legend>
          <p class="field-hint">Marca todo lo que requiere este participante.</p>
          <div class="check-grid">${opcionesRecursos.map(recurso => `
            <label class="check-card"><input type="checkbox" name="recursosSeleccionados" value="${escapeHtml(recurso)}" ${seleccionados.includes(recurso) ? "checked" : ""} /><span>${escapeHtml(recurso)}</span></label>
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
    return `<h3>${row.id ? "Editar momento" : "Nuevo momento del evento"}</h3><div class="form-grid">
      <label>Hora<input type="time" name="hora" value="${escapeHtml(row.hora || "")}" /></label>
      <label>Duración min.<input type="number" min="0" name="duracionMin" value="${escapeHtml(row.duracionMin || "")}" /></label>
      <label>Bloque<input name="bloque" value="${escapeHtml(row.bloque || "")}" /></label>
      <label>Espacio / salón<input name="espacio" value="${escapeHtml(row.espacio || "")}" /></label>
      <label class="wide">Actividad o presentación<input required name="item" value="${escapeHtml(row.item || "")}" /></label>
      <label>Encargado<input name="encargado" list="personasDisponibles" value="${escapeHtml(row.encargado || "")}" /></label>
      <label class="wide">Montaje, transición y recursos<textarea name="montaje">${escapeHtml(row.montaje || "")}</textarea></label>
    </div>`;
  }

  if (tab === "equipo") {
    return `<h3>${row.id ? "Editar integrante" : "Agregar integrante del equipo"}</h3><div class="form-grid">
      <label>Nombre<input required name="nombre" list="personasDisponibles" value="${escapeHtml(row.nombre || "")}" /></label>
      <label>Rol / función<input required name="rol" value="${escapeHtml(row.rol || "")}" /></label>
      <label>Zona / bloque<input name="zona" value="${escapeHtml(row.zona || "")}" /></label>
      <label>Horario<input name="horario" value="${escapeHtml(row.horario || "")}" /></label>
      <label>Contacto<input name="contacto" value="${escapeHtml(row.contacto || "")}" /></label>
      <label>Confirmación<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
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

async function archiveEvent() {
  if (!state.selectedEventId) return;
  const confirmArchive = confirm("¿Archivar este evento? No se borra, solo queda fuera de lo activo.");
  if (!confirmArchive) return;
  await updateDoc(doc(db, COLLECTION, state.selectedEventId), {
    estado: "Archivado",
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email
  });
  toast("Evento archivado.");
}

async function cerrarEvento(resultado) { if(!state.selectedEventId||!state.selectedEvent)return;const realizado=resultado==="realizado",mensaje=realizado?"¿Marcar este evento como realizado? Se conservará en el historial y dejará de aparecer en la lista diaria.":"¿Marcar este evento como no realizado? Se conservará en el historial con sus participantes, cronograma y demás información.";if(!confirm(mensaje))return;try{await updateDoc(doc(db,COLLECTION,state.selectedEventId),{estado:realizado?"Realizado":"No realizado",cierre:{resultado,cerradoAt:serverTimestamp(),cerradoBy:state.user.email},updatedAt:serverTimestamp(),updatedBy:state.user.email});state.mostrarHistorialEventos=false;applyFilters();toast(realizado?"Evento marcado como realizado y enviado al historial.":"Evento marcado como no realizado y enviado al historial.");}catch(error){console.error(error);toast("No se pudo cerrar el evento.");}}

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
    for (const child of CHILD_COLLECTIONS) {
      const snapshot = await getDocs(collection(db, COLLECTION, eventId, child));
      const docs = snapshot.docs;
      for (let start = 0; start < docs.length; start += 450) {
        const batch = writeBatch(db);
        docs.slice(start, start + 450).forEach(childDoc => batch.delete(childDoc.ref));
        await batch.commit();
      }
    }
    await deleteDoc(doc(db, COLLECTION, eventId));
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
  Object.entries(subcolecciones).forEach(([child, items]) => {
    if (!CHILD_COLLECTIONS.includes(child) || !Array.isArray(items)) return;
    items.forEach(item => {
      const ref = doc(collection(db, COLLECTION, eventRef.id, child));
      batch.set(ref, { ...item, createdAt: serverTimestamp(), createdByEmail: state.user.email, createdByName: state.user.displayName || state.user.email });
    });
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
      lugar.contactoNombre || lugar.contacto ? `<span>Contacto: <b>${escapeHtml(lugar.contactoNombre || lugar.contacto)}${lugar.contactoTelefono ? ` · ${escapeHtml(lugar.contactoTelefono)}` : ""}</b></span>` : "",
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
        <label>Teléfono / WhatsApp
          <input type="tel" name="contactoTelefono" value="${escapeHtml(l.contactoTelefono || "")}" placeholder="+57 300 000 0000" />
        </label>
        <label class="wide">Correo
          <input type="email" name="contactoEmail" value="${escapeHtml(l.contactoEmail || "")}" placeholder="correo@lugar.com" />
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
    ["nombre", "estado", "costoModalidad", "costoIncluye", "contactoNombre", "contactoTelefono", "contactoEmail",
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

// Mantiene los <datalist> globales al día para que todos los formularios sugieran.
function syncDatalists() {
  const personas = $("#personasDisponibles");
  const lugares = $("#lugaresDisponibles");
  if (personas) {
    personas.innerHTML = state.personas
      .map(p => `<option value="${escapeHtml(p.nombre || "")}">${escapeHtml([p.rol, p.tipo].filter(Boolean).join(" · "))}</option>`)
      .join("");
  }
  if (lugares) {
    lugares.innerHTML = state.lugares.map(l => `<option value="${escapeHtml(l.nombre || "")}"></option>`).join("");
  }
  const estudiantes = $("#estudiantesDisponibles");
  if (estudiantes) {
    estudiantes.innerHTML = state.ripEstudiantes
      .filter(e => e.nivel === "activo")
      .map(e => `<option value="${escapeHtml(e.nombre)}">${escapeHtml(e.etiqueta)}</option>`)
      .join("");
  }
}

function renderPeopleCards() {
  if (!state.personas.length) {
    return `<div class="empty-state"><h3>Sin personas todavía</h3><p>Registra docentes, técnicos, proveedores y aliados una sola vez. Después aparecen como sugerencia en todos los formularios.</p></div>`;
  }
  return `<div class="place-grid">${state.personas.map(persona => {
    const facts = [
      persona.rol ? `<span>Rol: <b>${escapeHtml(persona.rol)}</b></span>` : "",
      persona.area && persona.area !== "General" ? `<span>Área: <b>${escapeHtml(persona.area)}</b></span>` : "",
      persona.telefono ? `<span>Tel: <b>${escapeHtml(persona.telefono)}</b></span>` : "",
      persona.email ? `<span>Correo: <b>${escapeHtml(persona.email)}</b></span>` : "",
      persona.disponibilidad ? `<span>Disponibilidad: <b>${escapeHtml(persona.disponibilidad)}</b></span>` : ""
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
        <label>Tipo<select name="tipo">${selectOptions(PERSONA_TIPOS, p.tipo || "Docente")}</select></label>
        <label>Área<select name="area">${selectOptions(FIELD_OPTIONS.areas, p.area || "General")}</select></label>
        <label class="wide">Rol / función<input name="rol" value="${escapeHtml(p.rol || "")}" placeholder="Ej: Docente de piano, Ingeniero de sonido" /></label>
      </div>
    </fieldset>
    <fieldset class="form-section">
      <legend>Contacto</legend>
      <div class="form-grid">
        <label>Teléfono / WhatsApp<input type="tel" name="telefono" value="${escapeHtml(p.telefono || "")}" placeholder="+57 300 000 0000" /></label>
        <label>Correo<input type="email" name="email" value="${escapeHtml(p.email || "")}" /></label>
        <label class="wide">Disponibilidad habitual<input name="disponibilidad" value="${escapeHtml(p.disponibilidad || "")}" placeholder="Ej: sábados en la mañana" /></label>
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
    ["nombre", "tipo", "area", "rol", "telefono", "email", "disponibilidad", "notas"]
      .forEach(key => data[key] = formValue(formData, key) || "");
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
    listenEventos();
    listenLugares();
    listenPersonas();
    listenParticipaciones();
    cargarRipSilencioso();
  } else {
    annualSystem.stop();
    annualView.classList.add("hidden");
    kpis.classList.remove("hidden");
    dashboard.classList.add("hidden");
    authScreen.classList.remove("hidden");
    if (state.unsubEventos) state.unsubEventos();
    if (state.unsubLugares) state.unsubLugares();
    if (state.unsubPersonas) state.unsubPersonas();
    if (state.unsubParticipaciones) state.unsubParticipaciones();
    clearChildListeners();
    state.eventos = [];
    state.lugares = [];
    state.personas = [];
    state.ripEstudiantes = [];
    state.ripEstado = "desconectado";
    state.participaciones = new Map();
    state.vistaPrincipal = "eventos";
    state.selectedEventId = null;
    state.selectedEvent = null;
    state.actividadesComunesSincronizadas = false;
  }
});

attachGlobalEvents();
renderKpis();
