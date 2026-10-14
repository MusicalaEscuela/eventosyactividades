import { normalizarNombre } from './docentes-model.js';
import { getParticipantWorks } from './programacion-model.js?v=20261013-presentaciones-inscritas';

const rows = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const instrument = value => Array.isArray(value) ? value.map(text).filter(Boolean).join(', ') : text(value);
const ensemble = row => Boolean(row?.esEnsamble || row?.tipo === 'Ensamble' || rows(row?.integrantes).length);
const identity = member => member.studentId ? `s:${member.studentId}` : member.participanteId ? `e:${member.participanteId}` : member.nombre ? `n:${normalizarNombre(member.nombre)}` : '';

function cleanMember(member) {
  const source = typeof member === 'string' ? { nombre: member } : member && typeof member === 'object' && !Array.isArray(member) ? member : null;
  return source ? { ...source, nombre: text(source.nombre || source.name), instrumento: instrument(source.instrumento), studentId: text(source.studentId), participanteId: text(source.participanteId) } : null;
}

/** Candidates use recorded identities; name similarities never link sources. */
export function buildEnsembleCandidates({ participants = [], students = [] } = {}) {
  const candidates = new Map();
  const add = (candidate, source) => {
    if (!candidate.nombre) return;
    const detail = [source, candidate.instrumento ? `Instrumento: ${candidate.instrumento}` : '', candidate.docente ? `Docente: ${candidate.docente}` : ''].filter(Boolean);
    if (!candidates.has(candidate.key)) candidates.set(candidate.key, { candidate: { ...candidate }, details: new Set(detail) });
    else {
      const existing = candidates.get(candidate.key);
      for (const field of ['nombre', 'instrumento', 'docente', 'studentId', 'participanteId']) if (!existing.candidate[field] && candidate[field]) existing.candidate[field] = candidate[field];
      for (const entry of detail) existing.details.add(entry);
    }
  };
  const eventRows = rows(participants).filter(row => row && typeof row === 'object');
  // Individual event instruments take priority over ensemble and RIP profiles.
  eventRows.forEach((row, index) => {
    if (ensemble(row)) return;
    const nombre = text(row.estudianteGrupo || row.nombre || row.name);
    const studentId = text(row.studentId);
    const participanteId = text(row.id || row.participanteId);
    const key = studentId ? `s:${studentId}` : participanteId ? `e:${participanteId}` : `legacy:evento:${index}:${normalizarNombre(nombre)}`;
    add({ key, nombre, studentId, participanteId, instrumento: instrument(row.instrumento), docente: text(row.docente) }, 'Participante de esta muestra');
  });
  eventRows.forEach((row, rowIndex) => {
    if (!ensemble(row)) return;
    rows(row.integrantes).forEach((raw, memberIndex) => {
      const member = cleanMember(raw);
      if (!member) return;
      const key = member.studentId ? `s:${member.studentId}` : member.participanteId ? `e:${member.participanteId}` : `legacy:ensamble:${text(row.id) || rowIndex}:${memberIndex}:${normalizarNombre(member.nombre)}`;
      const groupName = text(row.estudianteGrupo || row.nombrePresentacion);
      add({ key, nombre: member.nombre, studentId: member.studentId, participanteId: member.participanteId, instrumento: member.instrumento, docente: text(member.docente || row.docente) }, groupName ? `Integrante del ensamble: ${groupName}` : 'Integrante de ensamble');
    });
  });
  rows(students).forEach((student, index) => {
    if (!student || typeof student !== 'object') return;
    const nombre = text(student.nombre || student.name || student.estudiante);
    const studentId = text(student.studentId);
    const key = studentId ? `s:${studentId}` : `legacy:rip:${index}:${normalizarNombre(nombre)}`;
    add({ key, nombre, studentId, participanteId: '', instrumento: instrument(student.instrumento), docente: text(student.docente) }, 'Padrón RIP');
  });
  return [...candidates.values()].map(({ candidate, details }) => ({ ...candidate, detail: [...details].join(' · ') }));
}

/** Keep existing snapshot metadata while removing duplicate recorded identities. */
export function normalizeEnsembleMembers(members = []) {
  const normalized = new Map();
  rows(members).forEach((raw, index) => {
    const member = cleanMember(raw);
    if (!member) return;
    const key = identity(member) || `empty:${index}`;
    if (!normalized.has(key)) normalized.set(key, member);
    else {
      const first = normalized.get(key);
      const merged = { ...member, ...first };
      for (const field of ['nombre', 'instrumento', 'studentId', 'participanteId']) if (!first[field] && member[field]) merged[field] = member[field];
      normalized.set(key, merged);
    }
  });
  return [...normalized.values()];
}

/** Homonyms are valid when both members have distinct recorded identifiers. */
export function validateEnsembleMembers(members = []) {
  const errors = [];
  const seen = new Set();
  const names = new Map();
  const valid = new Set();
  for (const raw of rows(members)) {
    const member = cleanMember(raw);
    if (!member || !member.nombre) { errors.push('Escribe el nombre de cada integrante del ensamble.'); continue; }
    const key = identity(member);
    if (seen.has(key)) errors.push('Un integrante aparece más de una vez. Revisa sus identificadores y su nombre.');
    seen.add(key);
    valid.add(key);
    const name = normalizarNombre(member.nombre);
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(member);
  }
  if (valid.size < 2) errors.push('El ensamble necesita al menos dos integrantes distintos.');
  for (const membersWithName of names.values()) {
    if (membersWithName.length > 1 && membersWithName.some(member => !member.studentId)) errors.push('Hay registros con el mismo nombre sin identidades de estudiante distintas. Elige sus perfiles del padrón o usa un solo registro de esa persona.');
  }
  return [...new Set(errors)];
}

/** Find existing groups by an exact registered work, including legacy titles. */
export function findEnsemblesForWork(participants = [], work = '') {
  const requested = normalizarNombre(text(work));
  return requested ? rows(participants).filter(row => ensemble(row) && getParticipantWorks(row).some(title => normalizarNombre(title) === requested)) : [];
}
