import {
  auth,
  provider,
  db,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
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
    bitacora: []
  },
  lugares: [],
  unsubEventos: null,
  unsubLugares: null,
  unsubChildren: []
};

const COLLECTION = "eventos";
const CHILD_COLLECTIONS = ["actividades", "muestras", "programacion", "equipo", "rider", "checklist", "bitacora"];

const STATUS_CLASS = {
  "Planeación": "neutral",
  "En curso": "warning",
  "En riesgo": "danger",
  "Listo": "success",
  "Realizado": "success",
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
  estadoEvento: ["Planeación", "En curso", "En riesgo", "Listo", "Realizado", "Archivado"],
  estadoItem: ["Pendiente", "En curso", "En riesgo", "Listo", "Confirmado", "Realizado", "Cancelado", "Bloqueado"],
  prioridad: ["Baja", "Media", "Alta", "Crítica"],
  areas: ["General", "Música", "Danza", "Teatro", "Artes plásticas", "Administrativo", "Comercial", "Producción", "Técnico", "Marketing", "Logística"]
};

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
  modalForm.innerHTML = `${content}<div class="modal-actions"><button type="button" class="btn btn-light" data-close>Cancelar</button><button type="submit" class="btn btn-primary">${submitLabel}</button></div>`;
  modalForm.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.showModal();
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
  await signOut(auth);
}

function listenEventos() {
  if (state.unsubEventos) state.unsubEventos();
  state.unsubEventos = onSnapshot(collection(db, COLLECTION), snapshot => {
    state.eventos = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => String(a.fechaInicio || "9999-12-31").localeCompare(String(b.fechaInicio || "9999-12-31")));
    applyFilters();
    renderKpis();
    if (state.selectedEventId) {
      state.selectedEvent = state.eventos.find(evento => evento.id === state.selectedEventId) || null;
      if (!state.selectedEvent) clearSelection();
    }
    renderDetail();
  }, error => {
    console.error(error);
    toast("No pude leer eventos. Revisa reglas de Firestore y permisos.");
  });
}

function listenLugares() {
  if (state.unsubLugares) state.unsubLugares();
  state.unsubLugares = onSnapshot(collection(db, "lugares"), snapshot => {
    state.lugares = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
  }, error => {
    console.error(error);
    toast("No pude leer la base de lugares.");
  });
}

function clearChildListeners() {
  state.unsubChildren.forEach(unsub => unsub && unsub());
  state.unsubChildren = [];
  state.childData = { actividades: [], muestras: [], programacion: [], equipo: [], rider: [], checklist: [], bitacora: [] };
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
      toast(`No pude leer ${child}. Revisa índices/reglas si Firestore se puso exquisito.`);
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
    return (!search || haystack.includes(search)) && (!type || evento.tipo === type) && (!status || evento.estado === status);
  });
  renderEventList();
}

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
  const active = eventos.filter(e => e.estado !== "Archivado").length;
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
  const items = [...state.childData.actividades, ...state.childData.muestras, ...state.childData.checklist];
  if (!items.length) return { done: 0, total: 0, percent: 0 };
  const done = items.filter(item => ["Listo", "Confirmado", "Realizado"].includes(item.estado)).length;
  return { done, total: items.length, percent: Math.round((done / items.length) * 100) };
}

function renderDetail() {
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
    ["bitacora", "Bitácora"]
  ];

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

    <section class="panel">
      <div class="row-between">
        <div class="tabs">
          ${tabs.map(([key, label]) => `<button class="tab-btn ${state.tab === key ? "active" : ""}" data-tab="${key}">${label} (${state.childData[key].length})</button>`).join("")}
        </div>
        <button class="btn btn-primary" data-action="add-child">+ Agregar</button>
      </div>
      <div class="table-panel" id="tabContent">${renderTabContent(state.tab)}</div>
    </section>
  `;

  $$("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
    state.tab = btn.dataset.tab;
    renderDetail();
  }));
  $$("[data-action]").forEach(btn => btn.addEventListener("click", () => handleAction(btn.dataset.action)));
}

function renderTabContent(tab) {
  const rows = state.childData[tab] || [];
  if (!rows.length) {
    return `<div class="empty-state"><h3>Sin registros</h3><p>Agrega el primer registro para que esto deje de ser una intención bonita flotando en el vacío.</p></div>`;
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
    return table(["Estudiante / grupo", "Área", "Repertorio / actividad", "Docente", "Bloque", "Duración", "Estado", "Recursos", ""], rows.map(row => [
      escapeHtml(row.estudianteGrupo || "Sin nombre"),
      escapeHtml(row.area || ""),
      escapeHtml(row.repertorio || ""),
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
  if (action === "archive-event") archiveEvent();
  if (action === "delete-event") deleteEvent();
  if (action === "add-child") openChildDialog(state.tab);
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
      <label>Responsable<input name="responsable" value="${escapeHtml(evento?.responsable || "")}" placeholder="Alek, Cata, equipo..." /></label>
      <label>Fecha inicio<input type="date" name="fechaInicio" value="${escapeHtml(evento?.fechaInicio || "")}" /></label>
      <label>Fecha fin<input type="date" name="fechaFin" value="${escapeHtml(evento?.fechaFin || "")}" /></label>
      <label>Lugar<input name="lugar" list="lugaresDisponibles" value="${escapeHtml(evento?.lugar || "")}" /><datalist id="lugaresDisponibles">${state.lugares.map(lugar => `<option value="${escapeHtml(lugar.nombre || "")}"></option>`).join("")}</datalist></label>
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
  const content = childForm(tab, row);
  setModal(content, isEdit ? "Guardar cambios" : "Agregar");

  modalForm.onsubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    const formData = new FormData(modalForm);
    const data = {};
    [...formData.entries()].forEach(([key, value]) => data[key] = typeof value === "string" ? value.trim() : value);
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

function childForm(tab, row = {}) {
  if (tab === "actividades") {
    return `
      <h3>${row.id ? "Editar actividad" : "Nueva actividad"}</h3>
      <div class="form-grid">
        <label class="wide">Actividad<input name="titulo" required value="${escapeHtml(row.titulo || "")}" /></label>
        <label>Área<select name="area">${selectOptions(FIELD_OPTIONS.areas, row.area || "General")}</select></label>
        <label>Fecha límite<input type="date" name="fechaLimite" value="${escapeHtml(row.fechaLimite || "")}" /></label>
        <label>Responsable<input name="responsable" value="${escapeHtml(row.responsable || "")}" /></label>
        <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
        <label>Prioridad<select name="prioridad">${selectOptions(FIELD_OPTIONS.prioridad, row.prioridad || "Media")}</select></label>
        <label class="wide">Notas<textarea name="notas">${escapeHtml(row.notas || "")}</textarea></label>
      </div>
    `;
  }

  if (tab === "muestras") {
    return `
      <h3>${row.id ? "Editar muestra" : "Nueva muestra"}</h3>
      <div class="form-grid">
        <label class="wide">Estudiante o grupo<input name="estudianteGrupo" required value="${escapeHtml(row.estudianteGrupo || "")}" /></label>
        <label>Área<select name="area">${selectOptions(FIELD_OPTIONS.areas, row.area || "Música")}</select></label>
        <label>Docente<input name="docente" value="${escapeHtml(row.docente || "")}" /></label>
        <label class="wide">Repertorio / actividad<input name="repertorio" value="${escapeHtml(row.repertorio || "")}" /></label>
        <label>Bloque<input name="bloque" value="${escapeHtml(row.bloque || "")}" placeholder="Bloque 1, Infantil, Adultos..." /></label>
        <label>Duración min.<input type="number" min="0" name="duracionMin" value="${escapeHtml(row.duracionMin || "")}" /></label>
        <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
        <label>Prioridad<select name="prioridad">${selectOptions(FIELD_OPTIONS.prioridad, row.prioridad || "Media")}</select></label>
        <label class="wide">Recursos técnicos<textarea name="recursos" placeholder="Micrófono, pista, piano, atril, monitor...">${escapeHtml(row.recursos || "")}</textarea></label>
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
        <label>Responsable<input name="responsable" value="${escapeHtml(row.responsable || "")}" /></label>
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
      <label>Encargado<input name="encargado" value="${escapeHtml(row.encargado || "")}" /></label>
      <label class="wide">Montaje, transición y recursos<textarea name="montaje">${escapeHtml(row.montaje || "")}</textarea></label>
    </div>`;
  }

  if (tab === "equipo") {
    return `<h3>${row.id ? "Editar integrante" : "Agregar integrante del equipo"}</h3><div class="form-grid">
      <label>Nombre<input required name="nombre" value="${escapeHtml(row.nombre || "")}" /></label>
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
      <label>Quién lo aporta<input name="proveedor" value="${escapeHtml(row.proveedor || "")}" /></label>
      <label>Ubicación<input name="ubicacion" value="${escapeHtml(row.ubicacion || "")}" /></label>
      <label>Estado<select name="estado">${selectOptions(FIELD_OPTIONS.estadoItem, row.estado || "Pendiente")}</select></label>
      <label class="wide">Notas / especificación<textarea name="notas">${escapeHtml(row.notas || "")}</textarea></label>
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

function openPlacesDialog() {
  const rows = state.lugares.length
    ? table(["Lugar", "Capacidad", "Costo", "Contacto", "Estado", "Requisitos / observaciones"], state.lugares.map(lugar => [
        escapeHtml(lugar.nombre || ""), escapeHtml(lugar.capacidad || ""), escapeHtml(lugar.costo || ""),
        escapeHtml(lugar.contacto || ""), badge(lugar.estado), escapeHtml(lugar.observaciones || "")
      ]))
    : `<div class="empty-state"><p>Aún no hay lugares registrados. Empieza con los que realmente están evaluando.</p></div>`;
  setModal(`
    <h3>Base de lugares posibles</h3>
    <p class="muted">Esta base es independiente de los eventos: permite comparar auditorios y conservar contactos, costos y restricciones.</p>
    <div class="table-panel">${rows}</div>
    <hr />
    <h4>Agregar lugar</h4>
    <div class="form-grid">
      <label class="wide">Nombre<input required name="nombre" /></label>
      <label>Capacidad<input type="number" min="0" name="capacidad" /></label>
      <label>Costo / condiciones<input name="costo" /></label>
      <label>Contacto<input name="contacto" /></label>
      <label>Estado<select name="estado">${selectOptions(["Por contactar", "Contactado", "En evaluación", "Disponible", "Descartado"], "Por contactar")}</select></label>
      <label>Sonido y luces<input name="tecnica" /></label>
      <label>Camerinos / bodega<input name="apoyo" /></label>
      <label class="wide">Dirección, parqueadero, documentos, horarios y observaciones<textarea name="observaciones"></textarea></label>
    </div>
  `, "Guardar lugar");
  modalForm.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(modalForm).entries());
    data.createdAt = serverTimestamp();
    data.updatedAt = serverTimestamp();
    data.createdBy = state.user.email;
    await addDoc(collection(db, "lugares"), data);
    modal.close();
    toast("Lugar guardado en la base.");
  };
}

function attachGlobalEvents() {
  $("#loginBtn").addEventListener("click", login);
  $("#logoutBtn").addEventListener("click", logout);
  $("#newEventBtn").addEventListener("click", () => openEventDialog());
  $("#placesBtn").addEventListener("click", openPlacesDialog);
  $("#exportAllBtn").addEventListener("click", exportAllEvents);
  ["#searchInput", "#typeFilter", "#statusFilter"].forEach(selector => $(selector).addEventListener("input", applyFilters));
  eventDetail.addEventListener("click", event => {
    const editTarget = event.target.closest("[data-edit-child]");
    const deleteTarget = event.target.closest("[data-delete-child]");
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
    listenEventos();
    listenLugares();
  } else {
    dashboard.classList.add("hidden");
    authScreen.classList.remove("hidden");
    if (state.unsubEventos) state.unsubEventos();
    if (state.unsubLugares) state.unsubLugares();
    clearChildListeners();
    state.eventos = [];
    state.selectedEventId = null;
    state.selectedEvent = null;
  }
});

attachGlobalEvents();
renderKpis();
