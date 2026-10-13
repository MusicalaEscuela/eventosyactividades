import { normalizarNombre } from './docentes-model.js';

const cleanName = value => typeof value === 'string' ? value.trim() : '';
const isTeacher = row => row && (normalizarNombre(row.tipo) === 'docente' || row.tipoDocente === true || /^docentes?\b/.test(normalizarNombre(row.rol)));
const joinDetail = values => values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' · ');
const arrayRows = value => Array.isArray(value) ? value : value instanceof Map ? [...value.values()].flat() : [];

/** Suggestions preserve the first spelling without repeating case/accent variants. */
export function uniqueSuggestions(entries = []) {
  const names = new Map();
  for (const entry of arrayRows(entries)) {
    const name = cleanName(typeof entry === 'string' ? entry : entry?.name);
    const normalized = normalizarNombre(name);
    if (!normalized) continue;
    const detail = typeof entry === 'object' ? cleanName(entry?.detail) : '';
    if (!names.has(normalized)) names.set(normalized, { name, detail });
    else if (!names.get(normalized).detail && detail) names.get(normalized).detail = detail;
  }
  return [...names.values()];
}

async function stableTeacherId(normalizedName) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedName));
  return 'nombre-' + [...new Uint8Array(digest)].slice(0, 16).map(value => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Existing ficha/catalog identities always win over suggested person IDs.
 * Name grouping only builds the chooser; it never changes a stored identity.
 */
export async function buildTeacherOptions({ people = [], participants = [], configured = {}, fichas = [] } = {}) {
  const records = [];
  const catalog = configured?.docentes && typeof configured.docentes === 'object' ? configured.docentes : configured || {};
  const push = (name, properties) => {
    const trimmed = cleanName(name);
    if (trimmed) records.push({ name: properties.reserved ? name : trimmed, normalized: normalizarNombre(trimmed), ...properties });
  };
  // Ficha spelling is kept verbatim, before catalog/person aliases.
  for (const ficha of arrayRows(fichas)) {
    if (ficha?.docenteId && cleanName(ficha.docenteNombre)) push(ficha.docenteNombre, { id: String(ficha.docenteId), reserved: true, hasFicha: true, source: 'Ficha docente' });
  }
  for (const [id, name] of Object.entries(catalog)) {
    if (id && cleanName(name)) push(name, { id, reserved: true, enabled: true, source: 'Configuración de esta muestra' });
  }
  for (const person of arrayRows(people)) {
    if (isTeacher(person)) push(person.nombre || person.name, { id: person.id ? String(person.id) : '', source: cleanName(person.source) || 'Base de personas' });
  }
  for (const participant of arrayRows(participants)) push(participant?.docente, { assigned: true, source: 'Participantes de esta muestra' });

  // The same reserved ID may have an old spelling in its ficha and an alias in
  // the catalog. Associate those spellings without merging distinct IDs.
  const parent = new Map();
  const find = name => {
    if (!parent.has(name)) parent.set(name, name);
    let key = name;
    while (parent.get(key) !== key) key = parent.get(key);
    return key;
  };
  const union = (left, right) => {
    const a = find(left), b = find(right);
    if (a !== b) parent.set(b, a);
  };
  const reservedNames = new Map();
  for (const record of records) {
    find(record.normalized);
    if (!record.reserved) continue;
    if (reservedNames.has(record.id)) union(reservedNames.get(record.id), record.normalized);
    else reservedNames.set(record.id, record.normalized);
  }
  const groups = new Map();
  for (const record of records) {
    const name = find(record.normalized);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record);
  }

  const options = [];
  for (const [normalizedName, group] of groups) {
    const reserved = new Map();
    for (const record of group) {
      if (!record.reserved) continue;
      if (!reserved.has(record.id)) reserved.set(record.id, { id: record.id, name: record.name, sources: [], enabled: false, hasFicha: false });
      const identity = reserved.get(record.id);
      identity.enabled ||= Boolean(record.enabled);
      identity.hasFicha ||= Boolean(record.hasFicha);
      if (!identity.sources.includes(record.source)) identity.sources.push(record.source);
    }
    const suggestedSources = [...new Set(group.filter(record => !record.reserved).map(record => record.source))];
    const assigned = group.some(record => record.assigned);
    const aliases = [...new Set(group.map(record => record.normalized))];
    if (reserved.size) {
      // Keep every reserved ID visible when duplicate names already have fichas
      // or configuration entries. Coordination can review the conflict safely.
      for (const identity of reserved.values()) options.push({ ...identity, sources: [...new Set([...identity.sources, ...suggestedSources])], groupKey: normalizedName, aliases, assigned, conflict: reserved.size > 1 });
    } else {
      const identifiedPerson = group.filter(record => record.id).sort((a, b) => a.id.localeCompare(b.id))[0];
      options.push({ id: identifiedPerson?.id || await stableTeacherId(normalizedName), name: identifiedPerson?.name || group[0].name, sources: suggestedSources, groupKey: normalizedName, aliases, assigned, enabled: false, hasFicha: false, conflict: false });
    }
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
}

/** Existing event data provides suggestions; no contact data or RIP inference. */
export function collectReusableContext({ people = [], places = [], events = [], children = {}, participations = [] } = {}) {
  const context = { people: [], teachers: [], places: [], students: [] };
  const add = (kind, name, detail = '') => {
    const clean = cleanName(name);
    if (clean) context[kind].push({ name: clean, detail: cleanName(detail) });
  };
  const addTeacher = (name, detail) => { add('teachers', name, detail); add('people', name, detail); };
  for (const person of arrayRows(people)) {
    const name = person?.nombre || person?.name;
    const detail = joinDetail([person?.rol, person?.tipo, person?.area, person?.source]);
    add('people', name, detail);
    if (isTeacher(person)) add('teachers', name, detail || 'Docente de la base de personas');
  }
  for (const place of arrayRows(places)) add('places', place?.nombre || place?.name, joinDetail([place?.ciudad, place?.direccion]));
  for (const event of arrayRows(events)) {
    const detail = cleanName(event?.titulo) ? `Evento: ${event.titulo.trim()}` : 'Evento registrado';
    add('people', event?.responsable, detail);
    add('places', event?.lugar, detail);
    add('places', event?.plaza, detail);
  }

  const collectParticipant = (row, detail) => {
    if (!row || typeof row !== 'object') return;
    addTeacher(row.docente || row.docenteNombre, detail);
    addTeacher(row.fichaDocente?.docente, 'Ficha docente incorporada');
    for (const ficha of Object.values(row.fichasDocentes || {})) addTeacher(ficha?.docente, 'Ficha docente incorporada');
    add('students', row.estudianteGrupo || row.estudiante, row.esEnsamble || row.tipo === 'Ensamble' ? 'Ensamble registrado' : detail);
    add('students', row.nombreLibre, detail);
    for (const member of arrayRows(row.integrantes)) add('students', typeof member === 'string' ? member : member?.nombre || member?.name, 'Integrante de ensamble');
    if (typeof row.integrantesTexto === 'string') for (const name of row.integrantesTexto.split(/\r?\n/)) add('students', name, 'Integrante de ensamble');
  };
  for (const [kind, rows] of Object.entries(children || {})) {
    for (const row of arrayRows(rows)) {
      if (!row || typeof row !== 'object') continue;
      const detail = kind === 'muestras' ? 'Participante de esta muestra' : 'Registro de este evento';
      for (const field of ['responsable', 'encargado', 'proveedor']) add('people', row[field], detail);
      add('people', kind === 'equipo' ? row.nombre : '', row.rol || detail);
      if (isTeacher(row)) addTeacher(row.nombre || row.name, row.rol || 'Docente del equipo');
      // An explicit docente field is useful even in a non-participant child.
      if (kind === 'muestras' || row.estudianteGrupo || row.estudiante || row.integrantes) collectParticipant(row, detail);
      else addTeacher(row.docente || row.docenteNombre, detail);
    }
  }
  for (const row of arrayRows(participations)) collectParticipant(row, 'Participación registrada');
  return Object.fromEntries(Object.entries(context).map(([key, entries]) => [key, uniqueSuggestions(entries)]));
}
