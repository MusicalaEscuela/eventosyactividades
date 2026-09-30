/**
 * Conexión de solo lectura al proyecto RIP (rip-musicala), donde vive el
 * padrón de estudiantes de Musicala.
 *
 * Son dos proyectos Firebase distintos, así que hace falta una segunda
 * instancia de la app y su propio inicio de sesión: el token de
 * `muestras-de-proceso` no sirve para `rip-musicala`.
 *
 * De RIP se lee el padrón y su resumen; además se consulta únicamente el
 * historial de clases (nunca pagos) para complementar servicios recientes
 * que aún no hayan quedado materializados en el resumen:
 *   - `students`         → padrón (nombre e identificador canónico)
 *   - `studentComputed`  → clasificación calculada (Activo / Inactivo / Exestudiante)
 *   - `registro` (Clase) → servicio artístico de los últimos 30 días
 *
 * Eventos no consulta movimientos de pago ni escribe datos en RIP.
 *
 * Acceso: las reglas de RIP solo admiten los correos de su lista blanca.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const RIP_CONFIG = {
  apiKey: "AIzaSyCaCizVkfWdx97LROV7PYQbFXLPMpxynBg",
  authDomain: "rip-musicala.firebaseapp.com",
  projectId: "rip-musicala",
  storageBucket: "rip-musicala.firebasestorage.app",
  messagingSenderId: "401885071105",
  appId: "1:401885071105:web:6bb9b6867d7d81fdec3d00"
};

// Correos autorizados por las reglas de RIP. Solo sirve para dar un mensaje
// claro antes de intentar leer; la seguridad real la aplica Firestore.
export const RIP_ALLOWED_EMAILS = [
  "catalina.medina.leal@gmail.com",
  "alekcaballeromusic@gmail.com",
  "adminmusicala@gmail.com",
  "musicalaasesor@gmail.com"
];

let ripApp = null;
let ripAuth = null;
let ripDb = null;

/** Inicializa la segunda app solo cuando se necesita de verdad. */
function ensureRipApp() {
  if (!ripApp) {
    ripApp = initializeApp(RIP_CONFIG, "rip");
    ripAuth = getAuth(ripApp);
    ripDb = getFirestore(ripApp);
  }
  return { ripApp, ripAuth, ripDb };
}

/** ¿Ya hay sesión abierta contra el proyecto RIP? */
export function ripCurrentUser() {
  if (!ripApp) return null;
  return ripAuth.currentUser;
}

/**
 * Abre sesión en RIP. Si el usuario ya está en Google con esa cuenta el
 * popup suele resolverse solo. Se sugiere la misma cuenta de la app principal.
 */
export async function ripSignIn(emailSugerido = "") {
  const { ripAuth: authRip } = ensureRipApp();
  if (authRip.currentUser) return authRip.currentUser;

  await new Promise(resolve => {
    const unsub = onAuthStateChanged(authRip, () => { unsub(); resolve(); });
  });
  if (authRip.currentUser) return authRip.currentUser;

  const provider = new GoogleAuthProvider();
  if (emailSugerido) provider.setCustomParameters({ login_hint: emailSugerido });
  const credential = await signInWithPopup(authRip, provider);
  return credential.user;
}

/**
 * Devuelve la sesión de RIP ya persistida, SIN abrir ningún popup.
 * Sirve para cargar el padrón solo al abrir la app cuando el usuario ya
 * había entrado antes; si no hay sesión previa devuelve null y no molesta.
 */
export async function ripRestoreSession() {
  const { ripAuth: authRip } = ensureRipApp();
  if (authRip.currentUser) return authRip.currentUser;
  await new Promise(resolve => {
    const unsub = onAuthStateChanged(authRip, () => { unsub(); resolve(); });
  });
  return authRip.currentUser || null;
}

/**
 * Cierra la sesión contra RIP. Solo afecta a esta pestaña/origen: la app de RIP
 * corre en otro dominio y conserva su propia sesión intacta.
 */
export async function ripSignOut() {
  if (!ripApp || !ripAuth.currentUser) return;
  try {
    await signOut(ripAuth);
  } catch (error) {
    console.error("No se pudo cerrar la sesión de RIP:", error);
  }
}

/** Normaliza texto igual que RIP: sin tildes, minúsculas, espacios colapsados. */
export function ripNorm(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reduce la clasificación larga de RIP a un semáforo simple.
 * RIP usa etiquetas como "Activo En pausa (15–30 días)" o "Exestudiante (+24 meses)".
 */
export function clasificarEstado(clasificacion = "") {
  const c = ripNorm(clasificacion);
  if (!c) return { nivel: "desconocido", etiqueta: "Sin información" };
  if (c === "activo") return { nivel: "activo", etiqueta: "Activo" };
  if (c.startsWith("activo")) return { nivel: "revisar", etiqueta: clasificacion };
  return { nivel: "inactivo", etiqueta: clasificacion };
}

function textoPerfil(...valores) { return valores.flatMap(valor=>Array.isArray(valor)?valor:[valor]).map(valor=>String(valor||"").trim()).filter(Boolean).filter((valor,indice,lista)=>lista.indexOf(valor)===indice).join(", "); }

function fechaRegistroMs(data = {}) {
  if (typeof data.fechaTs?.toMillis === "function") return data.fechaTs.toMillis();
  if (typeof data.fechaTs?.seconds === "number") return data.fechaTs.seconds * 1000;
  const raw = String(data.fecha || data.fechaRaw || "").trim();
  if (!raw) return 0;
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function servicioActivo(data, hoy = new Date()) {
  if (data.duplicateReview) return "";
  const servicio = String(data.servicio || "").trim();
  const fecha = fechaRegistroMs(data);
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const inicioClase = fecha ? new Date(new Date(fecha).getFullYear(), new Date(fecha).getMonth(), new Date(fecha).getDate()).getTime() : 0;
  const dias = inicioClase ? Math.floor((inicioHoy - inicioClase) / 86400000) : Number.POSITIVE_INFINITY;
  return servicio && dias >= 0 && dias <= 30 ? servicio : "";
}

/**
 * Trae el padrón de estudiantes cruzando `students` con `studentComputed`.
 * Descarta los documentos alias (homónimos ya fusionados) para no duplicar.
 */
export async function ripFetchEstudiantes() {
  const { ripDb: db } = ensureRipApp();

  const [studentsSnap, computedSnap] = await Promise.all([
    getDocs(collection(db, "students")),
    getDocs(collection(db, "studentComputed"))
  ]);

  // El resumen puede ir retrasado frente a las clases más recientes. Esta
  // consulta trae solo documentos de tipo Clase, sin pagos, y solo conserva
  // servicios de los últimos 30 días para reflejar lo que RIP muestra activo.
  let clasesSnap = null;
  try {
    clasesSnap = await getDocs(query(collection(db, "registro"), where("tipo", "in", ["Clase", "clase"])));
  } catch (error) {
    console.warn("No se pudieron leer servicios recientes de RIP; se usa el resumen calculado.", error);
  }

  // Clasificación por id de documento y también por nombre normalizado,
  // porque durante la migración conviven ambas llaves.
  const computedPorId = new Map();
  const computedPorNombre = new Map();
  computedSnap.docs.forEach(d => {
    const data = d.data() || {};
    if (data.legacyAliasOf) return;
    computedPorId.set(d.id, data);
    const clave = ripNorm(data.estudianteKey || data.estudiante || "");
    if (clave) computedPorNombre.set(clave, data);
  });

  const serviciosPorId = new Map();
  const serviciosPorNombre = new Map();
  const agregarServicio = (mapa, llave, servicio) => {
    if (!llave || !servicio) return;
    const actuales = mapa.get(llave) || [];
    if (!actuales.some(item => ripNorm(item) === ripNorm(servicio))) actuales.push(servicio);
    mapa.set(llave, actuales);
  };
  clasesSnap?.docs.forEach(d => {
    const data = d.data() || {};
    const servicio = servicioActivo(data);
    if (!servicio) return;
    agregarServicio(serviciosPorId, String(data.studentId || data.canonicalStudentId || data.groupKey || "").trim(), servicio);
    agregarServicio(serviciosPorNombre, ripNorm(data.estudianteKey || data.estudiante || ""), servicio);
  });

  const estudiantes = [];
  const vistos = new Set();

  studentsSnap.docs.forEach(d => {
    const data = d.data() || {};
    if (data.legacyAliasOf) return; // alias de un homónimo ya resuelto

    const studentId = String(data.studentId || data.officialStudentId || d.id).trim();
    const nombre = String(data.name || data.estudiante || "").trim();
    if (!nombre) return;

    const claveNombre = ripNorm(data.nameKey || data.estudianteKey || nombre);
    const dedupe = studentId || claveNombre;
    if (vistos.has(dedupe)) return;
    vistos.add(dedupe);

    const computed = computedPorId.get(d.id) || computedPorId.get(studentId) || computedPorNombre.get(claveNombre) || {};
    const clasificacion = String(computed.clasificacionFinal || computed.finalClasif || computed.paramClasif || "").trim();
    const servicios = [...(serviciosPorId.get(studentId) || []), ...(serviciosPorNombre.get(claveNombre) || [])]
      .filter((servicio, indice, lista) => lista.findIndex(item => ripNorm(item) === ripNorm(servicio)) === indice);

    estudiantes.push({
      studentId: studentId || claveNombre,
      nombre,
      claveNombre,
      area: textoPerfil(data.area, data.arte, data.disciplina, computed.cursoDisplay, computed.cursos),
      instrumento: textoPerfil(data.instrumento, data.instrument, computed.instrumentoDisplay, computed.instrumentos, servicios),
      programa: textoPerfil(data.programa, data.program, data.course, computed.areaInteres),
      servicios,
      clasificacion,
      ...clasificarEstado(clasificacion),
      ultimaClase: String(computed.ultimaClase || "").trim()
    });
  });

  return estudiantes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
