import { normalizarNombre } from './docentes-model.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const rows = value => Array.isArray(value) ? value : [];
const id = value => String(value ?? '').trim();
const isEnsemble = row => Boolean(row?.esEnsamble || row?.tipo === 'Ensamble' || rows(row?.integrantes).length);
const rowName = row => text(row?.estudianteGrupo || row?.estudiante || row?.nombreLibre);

/** Suggest names without changing the docente already saved in the form. */
export function buildParticipantTeacherOptions({ selected = '', currentTeachers = [], allTeachers = [], history = [] } = {}) {
  const selectedValue = typeof selected === 'string' ? selected : '';
  const selectedName = normalizarNombre(selectedValue);
  const seen = new Set();
  const groups = [];
  const addGroup = (label, entries) => {
    const options = [];
    for (const entry of entries) {
      const candidate = typeof entry === 'string' ? entry : entry?.name || entry?.nombre;
      const name = text(candidate);
      const normalized = normalizarNombre(name);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      const option = { name: normalized === selectedName ? selectedValue : name };
      const detail = typeof entry === 'object' ? text(entry?.detail) : '';
      if (detail) option.detail = detail;
      options.push(option);
    }
    if (options.length) groups.push({ label, options });
  };
  addGroup('Historial de este estudiante', rows(history).map(entry => ({ name: entry?.docente, detail: entry?.eventoTitulo ? `Registro: ${entry.eventoTitulo}` : 'Registro de una muestra' })));
  addGroup('Docentes de esta muestra', rows(currentTeachers));
  addGroup('Otros docentes ya usados', rows(allTeachers));
  if (selectedName && !seen.has(selectedName)) groups.unshift({ label: 'Docente registrado', options: [{ name: selectedValue }] });
  return groups;
}

function individualIdentities(row) {
  if (isEnsemble(row)) return rows(row.integrantes).map(member => ({ studentId: id(member?.studentId), name: text(typeof member === 'string' ? member : member?.nombre || member?.name) }));
  return [{ studentId: id(row?.studentId), name: rowName(row) }];
}

function dateMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  const milliseconds = Date.parse(value || '');
  return Number.isNaN(milliseconds) ? 0 : milliseconds;
}

/** History records an assignment; it does not establish that a student attended. */
export function teacherHistoryForStudent({ studentId = '', name = '', isEnsamble = false, participations = [], events = [], currentEventId = '', currentParticipantId = '', knownStudents = [] } = {}) {
  const selectedId = id(studentId);
  const selectedName = normalizarNombre(name);
  if (!selectedId && !selectedName) return [];
  const selectedGroup = Boolean(isEnsamble);
  if (selectedGroup && !selectedName) return [];
  const allRows = rows(participations).filter(row => row && typeof row === 'object');

  // A name fallback is safe only if known identities do not prove a homonym.
  // Exact IDs remain usable even when multiple students share the same name.
  const matchingIds = new Set();
  if (selectedName && !selectedGroup) {
    for (const student of rows(knownStudents)) {
      if (normalizarNombre(student?.nombre || student?.name) !== selectedName) continue;
      const knownId = id(student?.studentId || student?.id);
      if (knownId) matchingIds.add(knownId);
    }
    for (const row of allRows) {
      for (const candidate of individualIdentities(row)) {
        if (candidate.studentId && normalizarNombre(candidate.name) === selectedName) matchingIds.add(candidate.studentId);
      }
    }
    if (!selectedId && matchingIds.size > 1) return [];
  }
  const safeNameFallback = Boolean(selectedName) && (selectedGroup || !selectedId || [...matchingIds].every(knownId => knownId === selectedId));
  const eventById = new Map(rows(events).map(event => [id(event?.id || event?.eventoId), event]));
  const entries = [];
  for (const row of allRows) {
    const eventoId = id(row.eventoId);
    const muestraId = id(row.muestraId || row.id);
    if (currentEventId && currentParticipantId && eventoId === id(currentEventId) && muestraId === id(currentParticipantId)) continue;
    const ensemble = isEnsemble(row);
    let matches;
    if (selectedGroup) matches = ensemble && normalizarNombre(rowName(row)) === selectedName;
    else {
      matches = individualIdentities(row).some(candidate => {
        if (selectedId && candidate.studentId) return candidate.studentId === selectedId;
        return safeNameFallback && normalizarNombre(candidate.name) === selectedName;
      });
    }
    const docente = text(row.docente);
    if (!matches || !docente) continue;
    const event = eventById.get(eventoId);
    entries.push({ docente, eventoId, muestraId, eventoTitulo: text(event?.titulo || row.eventoTitulo) || 'Registro de muestra', fecha: event?.fechaInicio || row.fecha || '', estado: text(row.estado), eventoEstado: text(event?.estado || row.eventoEstado), esEnsamble: ensemble, nombreEnsamble: ensemble ? rowName(row) : '' });
  }
  entries.sort((a, b) => dateMillis(b.fecha) - dateMillis(a.fecha) || a.eventoId.localeCompare(b.eventoId) || a.muestraId.localeCompare(b.muestraId));
  const seen = new Set();
  return entries.filter(entry => {
    const key = JSON.stringify([entry.eventoId, entry.muestraId, normalizarNombre(entry.docente)]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
