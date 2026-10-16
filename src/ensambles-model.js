import { normalizarNombre } from './docentes-model.js';
import { getWorkMinutes, workDurationSummary } from './obras-duracion.js?v=20261016-tiempo-por-obra';
import { getParticipantWorks } from './programacion-model.js?v=20261016-tiempo-por-obra';

const rows = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const instrument = value => Array.isArray(value) ? value.map(text).filter(Boolean).join(', ') : text(value);
const ensemble = row => Boolean(row?.esEnsamble || row?.tipo === 'Ensamble' || rows(row?.integrantes).length);
const cancelled = row => normalizarNombre(row?.estado) === 'cancelado';
const identity = member => member.studentId ? `s:${member.studentId}` : member.participanteId ? `e:${member.participanteId}` : member.nombre ? `n:${normalizarNombre(member.nombre)}` : '';

function cleanMember(member) {
  const source = typeof member === 'string' ? { nombre: member } : member && typeof member === 'object' && !Array.isArray(member) ? member : null;
  return source ? { ...source, nombre: text(source.nombre || source.name), instrumento: instrument(source.instrumento), studentId: text(source.studentId), participanteId: text(source.participanteId) } : null;
}

/** Only existing individual registrations can be added to a new ensemble. */
export function buildEnsembleCandidates({ participants = [] } = {}) {
  const individuals = rows(participants).filter(row => row && typeof row === 'object' && !ensemble(row));
  const idCounts = new Map();
  for (const row of individuals) {
    const id = text(row.id || row.participanteId);
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  return individuals.flatMap(row => {
    const nombre = text(row.estudianteGrupo || row.nombre || row.name);
    const participanteId = text(row.id || row.participanteId);
    if (!nombre || !participanteId || idCounts.get(participanteId) !== 1) return [];
    const instrumento = instrument(row.instrumento);
    const docente = text(row.docente);
    return [{ key: `e:${participanteId}`, nombre, studentId: text(row.studentId), participanteId, instrumento, docente,
      detail: ['Inscrito en esta muestra', instrumento ? `Instrumento: ${instrumento}` : '', docente ? `Docente: ${docente}` : ''].filter(Boolean).join(' · ') }];
  });
}

const participantId = row => text(row?.id || row?.participanteId);
const eventId = row => text(row?.eventoId || row?.eventId);
const scopedId = (event, id) => JSON.stringify([event, id]);

function addIndex(index, key, value) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(value);
}

/** Resolve member links once; names and ambiguous identities never establish a link. */
export function buildEnsembleParticipationIndex(participants = []) {
  const participantsRows = rows(participants).filter(row => row && typeof row === 'object');
  const individuals = participantsRows.filter(row => !ensemble(row));
  const ensembles = participantsRows.filter(ensemble);
  const byId = new Map();
  const byStudentId = new Map();
  const groupsByParticipant = new Map(individuals.map(row => [row, []]));
  const activeGroupsByParticipant = new Map(individuals.map(row => [row, []]));
  const membersByEnsemble = new Map();
  const worksByParticipant = new Map();
  const groupWorksByParticipant = new Map(individuals.map(row => [row, new Map()]));
  for (const row of participantsRows) {
    const id = participantId(row);
    if (id) addIndex(byId, scopedId(eventId(row), id), row);
    worksByParticipant.set(row, getParticipantWorks(row));
  }
  for (const row of individuals) {
    const sid = text(row.studentId);
    if (sid) addIndex(byStudentId, scopedId(eventId(row), sid), row);
  }
  for (const group of ensembles) {
    const linked = new Set();
    const memberLinks = [];
    for (const raw of rows(group.integrantes)) {
      const member = cleanMember(raw);
      if (!member) continue;
      let target = null;
      const explicit = member.participanteId ? byId.get(scopedId(eventId(group), member.participanteId)) : null;
      if (explicit?.length) {
        // An explicit pointer that conflicts with another student must not fall back.
        if (explicit.length !== 1 || ensemble(explicit[0])) continue;
        const candidate = explicit[0];
        const candidateSid = text(candidate.studentId);
        if (member.studentId && candidateSid && member.studentId !== candidateSid) continue;
        target = candidate;
      } else if (member.studentId) {
        const matches = byStudentId.get(scopedId(eventId(group), member.studentId));
        if (matches?.length === 1) target = matches[0];
      }
      if (!target || linked.has(target)) continue;
      linked.add(target);
      memberLinks.push({ member, participant: target });
      groupsByParticipant.get(target).push(group);
      if (!cancelled(group)) {
        activeGroupsByParticipant.get(target).push(group);
        const groupWorks = groupWorksByParticipant.get(target);
        for (const work of worksByParticipant.get(group)) addIndex(groupWorks, normalizarNombre(work), group);
      }
    }
    membersByEnsemble.set(group, memberLinks);
  }
  return { participants: participantsRows, individuals, ensembles, byId, groupsByParticipant, activeGroupsByParticipant, membersByEnsemble, worksByParticipant, groupWorksByParticipant };
}

function participationIndex(value) {
  return value?.groupsByParticipant instanceof Map ? value : buildEnsembleParticipationIndex(value);
}

function indexedParticipant(participant, index) {
  if (index.worksByParticipant.has(participant)) return participant;
  const id = participantId(participant);
  if (!id) return participant;
  const matches = index.byId.get(scopedId(eventId(participant), id));
  if (matches?.length !== 1) return participant;
  const match = matches[0];
  const sid = text(participant.studentId);
  return sid && text(match.studentId) && sid !== text(match.studentId) ? participant : match;
}

/** Return the actual ensemble registrations involving this individual registration. */
export function getParticipantEnsembles(participant, participantsOrIndex = []) {
  const index = participationIndex(participantsOrIndex);
  return index.groupsByParticipant.get(indexedParticipant(participant, index)) || [];
}

/** Work titles remain verbatim, while shared works are listed once per individual. */
export function getEffectiveParticipantWorks(participant, participantsOrIndex = []) {
  const index = participationIndex(participantsOrIndex);
  const source = indexedParticipant(participant, index);
  const works = [...(index.worksByParticipant.get(source) || getParticipantWorks(participant))];
  for (const group of index.activeGroupsByParticipant.get(source) || []) works.push(...index.worksByParticipant.get(group));
  const seen = new Set();
  return works.filter(work => {
    const key = normalizarNombre(work);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Only linked, active ensembles replace a work's individual presentation. */
export function getEnsemblesForParticipantWork(participant, work, participantsOrIndex = []) {
  const index = participationIndex(participantsOrIndex);
  return index.groupWorksByParticipant.get(indexedParticipant(participant, index))?.get(normalizarNombre(text(work))) || [];
}

/** Keep ensemble works out of solo presentations without changing stored registrations. */
export function getIndividualSoloWorks(participant, participantsOrIndex = []) {
  const index = participationIndex(participantsOrIndex);
  const source = indexedParticipant(participant, index);
  const shared = index.groupWorksByParticipant.get(source);
  return (index.worksByParticipant.get(source) || getParticipantWorks(participant)).filter(work => !shared?.has(normalizarNombre(work)));
}

function recordedMinutes(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const minutes = typeof value === 'number' ? value : Number(value.trim().replace(',', '.'));
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

const normalizedWorkKeys = works => [...new Set(works.map(normalizarNombre))].sort();

/**
 * Shared works do not imply a known division of a registration's old total.
 * Explicit solo minutes are valid only for the exact current repertoire and
 * recorded total, so edits through another workflow invalidate the review.
 */
export function getParticipantDuration(participant = {}, participantsOrIndex = []) {
  const index = participationIndex(participantsOrIndex);
  const source = indexedParticipant(participant, index) || {};
  const ownWorks = index.worksByParticipant.get(source) || getParticipantWorks(participant);
  const soloWorks = getIndividualSoloWorks(source, index);
  const sharedByKey = new Map();
  const groups = index.activeGroupsByParticipant.get(source) || [];
  for (const group of groups) {
    for (const work of index.worksByParticipant.get(group) || []) {
      const key = normalizarNombre(work);
      if (!sharedByKey.has(key)) sharedByKey.set(key, work);
    }
  }
  const sharedWorks = [...sharedByKey.values()];
  // Exhibition pieces do not require stage minutes.
  const exhibition = ['artes-plasticas', 'artes plasticas'].includes(normalizarNombre(source.areaArtisticaId || source.areaArtisticaNombre || source.area));
  const rawMinutes = recordedMinutes(source.duracionMin) ?? (exhibition ? 0 : null);
  const confirmationKey = JSON.stringify([
    'solo-duration-v1', normalizedWorkKeys(ownWorks),
    normalizedWorkKeys(sharedWorks), normalizedWorkKeys(soloWorks),
    rawMinutes === null ? ['unrecorded', text(source.duracionMin)] : rawMinutes
  ]);
  const result = { minutes: rawMinutes, needsReview: rawMinutes === null, mode: 'solo', confirmationKey, soloWorks, sharedWorks };
  if (source.duracionPorObra === true && !exhibition) {
    const duration = workDurationSummary(source, ensemble(source) ? ownWorks : soloWorks);
    const mode = ensemble(source) ? 'ensemble' : groups.length && !soloWorks.length ? 'ensemble-only' : sharedWorks.length ? 'mixed-confirmed' : 'solo';
    return { ...result, ...duration, needsReview: duration.pending.length > 0, mode };
  }
  if (ensemble(source)) return { ...result, mode: 'ensemble' };
  if (groups.length && !soloWorks.length) return { ...result, minutes: 0, needsReview: false, mode: 'ensemble-only' };
  const sharesOriginalWork = ownWorks.some(work => sharedByKey.has(normalizarNombre(work)));
  if (!sharesOriginalWork || !soloWorks.length) return result;
  const soloMinutes = recordedMinutes(source.duracionSolistaMin);
  const confirmed = source.duracionSolistaReferencia === confirmationKey && soloMinutes !== null;
  return { ...result, minutes: confirmed ? soloMinutes : null, needsReview: !confirmed, mode: confirmed ? 'mixed-confirmed' : 'mixed-review' };
}

/** One group is one presentation; a mixed registration retains its remaining solo works. */
export function buildPresentationCatalogue(participantsOrIndex = []) {
  const index = participationIndex(participantsOrIndex);
  if (index.catalogue) return index.catalogue;
  index.catalogue = index.participants.flatMap(row => {
    const duration = getParticipantDuration(row, index);
    const effectiveDuration = { duracionMin: duration.minutes, duracionConocidaMin: duration.knownMinutes ?? duration.minutes ?? 0, duracionPendiente: duration.needsReview };
    const workDurations = works => row.duracionPorObra ? { duracionObrasReferencia: '', duracionesObras: works.map(obra => ({ obra, minutos: getWorkMinutes(row, obra) })) } : {};
    if (ensemble(row)) return [{ ...row, ...effectiveDuration, ...workDurations(getParticipantWorks(row)) }];
    const soloWorks = duration.soloWorks;
    const hasGroups = Boolean(index.activeGroupsByParticipant.get(row)?.length);
    if (hasGroups && !soloWorks.length) return [];
    return [{ ...row, ...effectiveDuration, ...workDurations(soloWorks), repertorios: soloWorks, repertorio: soloWorks.join(' / ') }];
  });
  return index.catalogue;
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
    if (membersWithName.length > 1 && membersWithName.some(member => !member.studentId)) errors.push('Hay registros con el mismo nombre sin identidades de estudiante distintas. Revisa sus inscripciones en Participantes o usa un solo registro de esa persona.');
  }
  return [...new Set(errors)];
}

/** Find existing groups by an exact registered work, including legacy titles. */
export function findEnsemblesForWork(participants = [], work = '') {
  const requested = normalizarNombre(text(work));
  return requested ? rows(participants).filter(row => ensemble(row) && getParticipantWorks(row).some(title => normalizarNombre(title) === requested)) : [];
}
