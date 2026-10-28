import { normalizeTeacherWorks } from './docentes-obras.js?v=20261017-integracion';
import {
  firebaseConfig, initializeApp, getFirestore,
  collection, doc, getDocFromServer, getDocsFromServer,
  writeBatch, runTransaction, serverTimestamp
} from './firebase-config.js?v=20261011-docentes';

// A separate app has its own auth storage key. Teacher writes remain public
// capability writes even when coordination is signed in in another tab.
const db = getFirestore(initializeApp(firebaseConfig, 'docentes-public'));

export const MAX_PRESENTACIONES = 20;
export const FICHA_ESTADOS = ['Borrador', 'Enviado', 'Requiere ajustes', 'Confirmado'];
export const PRESENTACION_LIMITES = {
  estudianteGrupo: 180, integrantesTexto: 3000, instrumento: 120,
  repertorio: 3000, recursos: 2000, materialUrl: 1000,
  preparacion: 3000, entrada: 2000, inicio: 2000, acompanamiento: 3000,
  cierre: 2000, observaciones: 3000
};
const TOKEN_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const AREAS = ['musica', 'danza', 'teatro', 'artes-plasticas'];

function error(code, message) {
  const e = new Error(message);
  e.code = `docente/${code}`;
  return e;
}

function textField(value, limit, label) {
  const text = String(value ?? '').trim();
  if (text.length > limit) throw error('validacion', `${label}: máximo ${limit} caracteres.`);
  return text;
}

export function timestampMillis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return Date.parse(value || '') || 0;
}

export function canEditFicha(ficha, convocatoria, now = Date.now()) {
  if (ficha?.revocada || ficha?.estado === 'Confirmado') return false;
  return timestampMillis(ficha?.reabiertaHasta) > now ||
    (convocatoria?.abierta === true && timestampMillis(convocatoria?.cierreAt) > now);
}

export function validateFichaInput(input) {
  if (!ID_RE.test(input.eventoId || '') || !ID_RE.test(input.docenteId || '')) {
    throw error('validacion', 'Selecciona una muestra y un docente de la lista.');
  }
  const estado = input.estado || 'Borrador';
  if (!['Borrador', 'Enviado'].includes(estado)) throw error('validacion', 'Elige guardar borrador o enviar a coordinación.');
  const asistencia = input.asistencia || 'Por confirmar';
  if (!['Sí', 'No', 'Por confirmar'].includes(asistencia)) throw error('validacion', 'Indica si asistirás a la muestra.');
  if (!Array.isArray(input.presentaciones) || input.presentaciones.length > MAX_PRESENTACIONES) {
    throw error('validacion', `La ficha admite hasta ${MAX_PRESENTACIONES} presentaciones.`);
  }
  const presentaciones = input.presentaciones.map((inputPresentation, i) => {
    const participacionEstado=inputPresentation.participacionEstado||'Participará';
    if(!['Participará','No participará','Por confirmar'].includes(participacionEstado))throw error('validacion',`Presentación ${i+1}: revisa el estado de participación.`);
    if(estado==='Enviado'&&participacionEstado==='Por confirmar')throw error('validacion',`Presentación ${i+1}: confirma si participará.`);
    let p;
    try {
      p=normalizeTeacherWorks(inputPresentation,estado==='Enviado'&&participacionEstado!=='No participará');
    } catch (cause) {
      const name=String(inputPresentation.estudianteGrupo||'').trim();
      throw error('validacion', `Presentación ${i + 1}${name ? ' · '+name : ''}: ${cause.message || 'Revisa las obras y sus duraciones.'}`);
    }
    const tipo = p.tipo || 'Individual';
    const areaArtisticaId = p.areaArtisticaId || 'musica';
    if (!['Individual', 'Ensamble'].includes(tipo) || !AREAS.includes(areaArtisticaId)) {
      throw error('validacion', `Presentación ${i + 1}: revisa el tipo y el área artística.`);
    }
    const duracionMin = Number(p.duracionMin || 0);
    if (!Number.isFinite(duracionMin) || duracionMin < 0 || duracionMin > 120) {
      throw error('validacion', `Presentación ${i + 1}: la duración debe estar entre 0 y 120 minutos.`);
    }
    const cantidadObras = Number(p.cantidadObras || 1);
    if (!Number.isInteger(cantidadObras) || cantidadObras < 1 || cantidadObras > 20) {
      throw error('validacion', `Presentación ${i + 1}: la cantidad de obras debe estar entre 1 y 20.`);
    }
    const extra = {obrasJson:textField(p.obrasJson,6000,'Obras'),inscripcionId:textField(p.inscripcionId,100,'Inscripción')};
    if(extra.inscripcionId && !ID_RE.test(extra.inscripcionId))throw error('validacion','La inscripción de origen no es válida.');
    const normalized = { ...extra, participacionEstado, id: `p${String(i + 1).padStart(2, '0')}`, tipo, areaArtisticaId, duracionMin, cantidadObras };
    for (const [key, limit] of Object.entries(PRESENTACION_LIMITES)) {
      normalized[key] = textField(p[key], limit, `Presentación ${i + 1}`);
    }
    if(estado==='Enviado'&&!normalized.estudianteGrupo)throw error('validacion',`Presentación ${i+1}: indica el estudiante o ensamble, incluso si no participará.`);
    if (normalized.materialUrl && !/^https?:\/\/[^\s]+$/i.test(normalized.materialUrl)) {
      throw error('validacion', `Presentación ${i + 1}: el enlace debe comenzar con https:// o http://.`);
    }
    if (estado === 'Enviado' && participacionEstado!=='No participará') {
      if (!normalized.estudianteGrupo || !normalized.repertorio || (areaArtisticaId !== 'artes-plasticas' && duracionMin <= 0)) {
        throw error('validacion', `Presentación ${i + 1}: completa estudiante o ensamble, repertorio y duración antes de enviar.`);
      }
      if (tipo === 'Ensamble' && !normalized.integrantesTexto) {
        throw error('validacion', `Presentación ${i + 1}: escribe los integrantes del ensamble.`);
      }
      if (tipo === 'Ensamble') {
        const integrantes = normalized.integrantesTexto.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
        if (new Set(integrantes.map(n => n.toLocaleLowerCase('es'))).size < 2) {
          throw error('validacion', `Presentación ${i + 1}: escribe al menos dos integrantes distintos, uno por línea.`);
        }
      }
      if (asistencia === 'No' && (!normalized.preparacion || !normalized.inicio)) {
        throw error('validacion', `Presentación ${i + 1}: deja la preparación y la señal de inicio para quien acompañe tu ausencia.`);
      }
    }
    return normalized;
  });
  const fingerprints = presentaciones.map(p => [p.tipo, p.areaArtisticaId, p.estudianteGrupo, p.repertorio]
    .map(v => v.toLocaleLowerCase('es').normalize('NFKC').replace(/\s+/g, ' ').trim()).join('|'));
  const completed = fingerprints.filter((_, i) => presentaciones[i].participacionEstado!=='No participará' && presentaciones[i].estudianteGrupo && presentaciones[i].repertorio);
  if (new Set(completed).size !== completed.length) {
    throw error('validacion', 'Hay una presentación repetida con el mismo estudiante o ensamble, área y repertorio. Revisa la lista.');
  }
  if (estado === 'Enviado' && presentaciones.length === 0) throw error('validacion', 'Agrega al menos una presentación antes de enviar.');
  return {
    eventoId: input.eventoId, docenteId: input.docenteId,
    docenteNombre: textField(input.docenteNombre, 160, 'Nombre del docente'),
    asistencia, estado,
    disponibilidad: textField(input.disponibilidad, 2000, 'Disponibilidad'),
    apoyo: textField(input.apoyo, 3000, 'Apoyo necesario'),
    indicacionesGenerales: textField(input.indicacionesGenerales, 5000, 'Indicaciones generales'),
    presentaciones
  };
}

export async function listConvocatorias() {
  const snapshot = await getDocsFromServer(collection(db, 'convocatoriasDocentes'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getConvocatoria(eventoId) {
  if (!ID_RE.test(eventoId || '')) throw error('validacion', 'La muestra no es válida.');
  const snapshot = await getDocFromServer(doc(db, 'convocatoriasDocentes', eventoId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function loadFicha(token) {
  if (!TOKEN_RE.test(token || '')) throw error('enlace-invalido', 'El enlace privado de esta ficha no es válido.');
  try {
    const ref = doc(db, 'fichasDocentes', token);
    const snapshot = await getDocFromServer(ref);
    if (!snapshot.exists()) throw error('no-encontrada', 'No se encontró esta ficha. Solicita un enlace nuevo a coordinación.');
    const ficha = snapshot.data();
    if (ficha.revocada) throw error('revocada', 'Este enlace fue reemplazado. Solicita el enlace nuevo a coordinación.');
    const children = await getDocsFromServer(collection(ref, 'presentaciones'));
    return { token, ficha, presentaciones: children.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)) };
  } catch (e) {
    if (e.code === 'permission-denied') throw error('revocada', 'Este enlace no está disponible. Solicita el enlace vigente a coordinación.');
    throw e;
  }
}

function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function fichaUrl(token) {
  if (!TOKEN_RE.test(token || '')) throw error('enlace-invalido', 'El enlace privado no es válido.');
  const url = new URL('docentes.html', window.location.href);
  url.search = '';
  url.hash = `ficha=${token}`;
  return url.href;
}

function parentFields(normalized, revision) {
  const { presentaciones, ...fields } = normalized;
  return { ...fields, revision, cantidadPresentaciones: presentaciones.length, updatedAt: serverTimestamp() };
}

function writePresentaciones(writer, ref, presentaciones, revision) {
  for (const p of presentaciones) {
    const { id, ...fields } = p;
    writer.set(doc(ref, 'presentaciones', id), { ...fields, revision, updatedAt: serverTimestamp() });
  }
}

export async function saveFicha(input) {
  const normalized = validateFichaInput(input);
  const editing = Boolean(input.token);
  if (editing && !TOKEN_RE.test(input.token)) throw error('enlace-invalido', 'El enlace privado no es válido.');
  const convocatoria = await getConvocatoria(normalized.eventoId);
  if (!convocatoria || convocatoria.docentes?.[normalized.docenteId] !== normalized.docenteNombre) {
    throw error('validacion', 'Selecciona un docente habilitado para esta muestra.');
  }
  const token = input.token || newToken();
  const ref = doc(db, 'fichasDocentes', token);
  let revision = 1;
  try {
    if (!editing) {
      if (!canEditFicha(null, convocatoria)) throw error('cerrada', 'Las inscripciones de esta muestra están cerradas.');
      const batch = writeBatch(db);
      batch.set(doc(db, 'convocatoriasDocentes', normalized.eventoId, 'reservas', normalized.docenteId), {
        fichaToken: token, createdAt: serverTimestamp()
      });
      batch.set(ref, {
        ...parentFields(normalized, revision), createdAt: serverTimestamp(),
        revocada: false, reabiertaHasta: null, comentarioCoordinacion: ''
      });
      writePresentaciones(batch, ref, normalized.presentaciones, revision);
      await batch.commit();
    } else {
      if (!Number.isInteger(input.revision) || input.revision < 1) throw error('conflicto', 'Abre el enlace privado de nuevo antes de guardar.');
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw error('no-encontrada', 'No se encontró la ficha.');
        const current = snapshot.data();
        if (current.revocada) throw error('revocada', 'Este enlace fue reemplazado por coordinación.');
        if (current.estado === 'Confirmado') throw error('confirmada', 'Coordinación confirmó esta ficha. Pide que la reabran si necesitas corregirla.');
        if (!canEditFicha(current, convocatoria)) throw error('cerrada', 'El plazo de edición terminó. Solicita a coordinación que reabra la ficha.');
        if (current.revision !== input.revision) throw error('conflicto', 'Esta ficha cambió en otra ventana. Abre el enlace privado de nuevo para revisar la última versión.');
        if (current.eventoId !== normalized.eventoId || current.docenteId !== normalized.docenteId || current.docenteNombre !== normalized.docenteNombre) {
          throw error('validacion', 'La ficha pertenece al docente y la muestra originales.');
        }
        // All possible child IDs are read before writes so deletes participate in
        // the same transaction and concurrent saves cannot resurrect old rows.
        const oldChildren = await Promise.all(Array.from({ length: MAX_PRESENTACIONES }, (_, i) =>
          transaction.get(doc(ref, 'presentaciones', `p${String(i + 1).padStart(2, '0')}`))));
        revision = current.revision + 1;
        transaction.update(ref, parentFields(normalized, revision));
        writePresentaciones(transaction, ref, normalized.presentaciones, revision);
        for (const old of oldChildren) if (old.exists() && !normalized.presentaciones.some(p => p.id === old.id)) transaction.delete(old.ref);
      });
    }
  } catch (e) {
    if (e.code === 'permission-denied') {
      const latest = await getConvocatoria(normalized.eventoId).catch(() => null);
      if (!editing && canEditFicha(null, latest)) throw error('duplicada', 'No se pudo crear la ficha: puede existir una anterior o la muestra puede estar cerrada. Usa tu enlace privado o consulta con coordinación.');
      throw error('cerrada', 'No se pudo guardar: revisa el plazo de inscripción o solicita a coordinación que reabra tu ficha.');
    }
    if (['unavailable', 'deadline-exceeded', 'unknown', 'cancelled'].includes(e.code)) {
      e.tokenPossible = token;
      e.revisionPossible = revision;
    }
    throw e;
  }
  try {
    const saved = await loadFicha(token);
    if (saved.ficha.revision !== revision) throw error('conflicto', 'La ficha cambió justo después de guardar. Abre de nuevo su enlace para ver la versión actual.');
    return { ...saved, revision };
  } catch (e) {
    // Commit succeeded. Preserve the only capability even if the subsequent
    // server read fails so a new attempt does not create another reservation.
    e.tokenCommitted = token;
    e.revisionCommitted = revision;
    throw e;
  }
}
