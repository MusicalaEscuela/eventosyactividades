import { normalizarNombre } from './docentes-model.js';
import { workDurationSummary } from './obras-duracion.js?v=20261016-tiempo-por-obra';

export const MOMENT_PRESETS = [
  { id: 'bienvenida', label: 'Bienvenida', help: 'Recibir al público y abrir el evento.' },
  { id: 'presentacion', label: 'Presentación artística', help: 'Registrar la obra o actividad que se presenta.' },
  { id: 'cambio-presentacion', label: 'Cambio de presentación', help: 'Indicar la salida de una presentación y la entrada de la siguiente.' },
  { id: 'transicion', label: 'Transición', help: 'Organizar el paso entre momentos del programa.' },
  { id: 'luces', label: 'Cambio de luces', help: 'Indicar qué cambio de iluminación debe realizarse.' },
  { id: 'sonido', label: 'Cambio de sonido', help: 'Indicar el cambio de pista, micrófonos o ajustes de sonido.' },
  { id: 'montaje', label: 'Montaje de escenario', help: 'Preparar o mover lo necesario en el escenario.' },
  { id: 'pausa', label: 'Pausa', help: 'Registrar una pausa prevista en el programa.' },
  { id: 'avisos', label: 'Avisos al público', help: 'Anotar la información que debe comunicarse al público.' },
  { id: 'cierre', label: 'Cierre / despedida', help: 'Organizar la despedida y el cierre del evento.' }
];

export function getMomentPreset(id) {
  return MOMENT_PRESETS.find(preset => preset.id === id) || null;
}

/** Only explicit types or exact labels identify an existing preset. */
export function resolveMomentType(row = {}) {
  const preset = getMomentPreset(row?.tipoMomento);
  if (preset) return preset.id;
  if (row?.tipoMomento === 'personalizado') return 'personalizado';
  const item = normalizarNombre(row?.item);
  const matchingLabel = item && MOMENT_PRESETS.find(candidate => normalizarNombre(candidate.label) === item);
  return matchingLabel ? matchingLabel.id : item ? 'personalizado' : '';
}

/** Change the preset title only when it is empty or still the previous label. */
export function nextMomentTitle(previousType, nextType, title) {
  const original = String(title ?? '');
  const next = getMomentPreset(nextType);
  if (!next && nextType !== 'personalizado') return original;
  const previous = getMomentPreset(previousType);
  const normalized = normalizarNombre(original);
  if (!normalized || (previous && normalized === normalizarNombre(previous.label))) return next?.label || '';
  return original;
}

function startSeconds(value) {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim());
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) : null;
}

function durationSeconds(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const minutes = typeof value === 'number' ? value : Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const seconds = Math.round(minutes * 60);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

/** End times include an absolute program day, so midnight never wraps silently. */
export function getMomentEnd(row = {}) {
  const start = startSeconds(row?.hora);
  const duration = durationSeconds(row?.duracionMin);
  const rawDay = row?.diaPrograma;
  const emptyDay = rawDay == null || (typeof rawDay === 'string' && !rawDay.trim());
  const day = emptyDay ? 0 : ['number', 'string'].includes(typeof rawDay) ? Number(rawDay) : NaN;
  if (start == null || duration == null || !Number.isSafeInteger(day) || day < 0) return null;
  const totalSeconds = day * 86400 + start + duration;
  if (!Number.isSafeInteger(totalSeconds)) return null;
  const clock = totalSeconds % 86400;
  const hours = String(Math.floor(clock / 3600)).padStart(2, '0');
  const minutes = String(Math.floor(clock / 60) % 60).padStart(2, '0');
  const seconds = clock % 60;
  return { hora: `${hours}:${minutes}${seconds ? ':' + String(seconds).padStart(2, '0') : ''}`, diaPrograma: Math.floor(totalSeconds / 86400), totalSeconds };
}

/** Suggest the latest complete end; incomplete timed records require review. */
export function getNextMoment(rows = []) {
  let latest = null;
  let sourceItem = '';
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.hora == null || (typeof row.hora === 'string' && !row.hora.trim())) continue;
    const end = getMomentEnd(row);
    if (!end) return { hora: '', diaPrograma: 0, reason: 'Completa la hora y la duración de los momentos con horario; revisa también el día del programa.' };
    if (!latest || end.totalSeconds > latest.totalSeconds) {
      latest = end;
      sourceItem = typeof row.item === 'string' ? row.item : '';
    }
  }
  return latest ? { hora: latest.hora, diaPrograma: latest.diaPrograma, sourceItem } : { hora: '', diaPrograma: 0, reason: 'Indica la hora del primer momento.' };
}

const originalText = value => typeof value === 'string' && value.trim() ? value : '';

/** Use registered work titles verbatim; a slash remains part of a title. */
export function getParticipantWorks(row = {}) {
  const participant = row && typeof row === 'object' && !Array.isArray(row) ? row : {};
  let works = Array.isArray(participant.repertorios) ? participant.repertorios.filter(originalText) : [];
  if (!works.length && originalText(participant.repertorio)) works = [participant.repertorio];
  if (!works.length) {
    const area = normalizarNombre(participant.areaArtisticaId || participant.areaArtisticaNombre || participant.area);
    if (['danza', 'teatro', 'artes-plasticas', 'artes plasticas'].includes(area)) {
      const title = originalText(participant.tituloObra) || originalText(participant.nombrePresentacion);
      if (title) works = [title];
    }
  }
  const seen = new Set();
  return works.filter(work => {
    const normalized = normalizarNombre(work);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/** Snapshot only explicitly selected registered works and participant data. */
export function buildMomentPresentation(participant = {}, selectedWorks = []) {
  const row = participant && typeof participant === 'object' && !Array.isArray(participant) ? participant : {};
  const selected = new Set((Array.isArray(selectedWorks) ? selectedWorks : []).filter(originalText).map(normalizarNombre));
  const nombre = originalText(row.estudianteGrupo) || originalText(row.nombrePresentacion) || 'Participante';
  const rawDuration = row.duracionMin;
  const duration = typeof rawDuration === 'number' ? rawDuration : originalText(rawDuration) ? Number(rawDuration.trim().replace(',', '.')) : NaN;
  const works = getParticipantWorks(row).filter(work => selected.has(normalizarNombre(work)));
  const perWork = row.duracionPorObra === true ? workDurationSummary(row, works) : null;
  return {
    participanteId: originalText(row.id),
    estudianteGrupo: nombre,
    repertorios: works,
    item: `Presentación artística · ${nombre}`,
    encargado: typeof row.docente === 'string' ? row.docente : '',
    duracionMin: perWork ? perWork.minutes ?? '' : Number.isFinite(duration) && duration >= 0 ? duration : ''
  };
}

/**
 * Review saved programme snapshots without changing their hours or minutes.
 * The caller supplies active ensemble links to avoid a circular model import.
 * Participant links use identifiers only; matching names never establish one.
 */
export function getProgrammeEnsembleWarnings(moments = [], participants = [], { getGroupsForWork = () => [], isEnsemble = row => Boolean(row?.esEnsamble || row?.tipo === 'Ensamble' || Array.isArray(row?.integrantes) && row.integrantes.length) } = {}) {
  const list = value => Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
  const id = value => typeof value === 'string' ? value.trim() : '';
  const eventId = row => id(row?.eventoId || row?.eventId);
  const sourceId = row => id(row?.id || row?.participanteId);
  const active = row => normalizarNombre(row?.estado) !== 'cancelado';
  const warnings = new Map();
  const byId = new Map();
  const byEventAndId = new Map();
  const occurrences = new Map();
  const addTo = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  const warn = (moment, message) => {
    const key = id(moment.id);
    if (!key) return;
    if (!warnings.has(key)) warnings.set(key, []);
    if (!warnings.get(key).includes(message)) warnings.get(key).push(message);
  };
  for (const participant of list(participants)) {
    const key = sourceId(participant);
    if (!key) continue;
    addTo(byId, key, participant);
    addTo(byEventAndId, JSON.stringify([eventId(participant), key]), participant);
  }
  for (const moment of list(moments)) {
    const key = id(moment.participanteId);
    if (!id(moment.id) || !key) continue;
    const scope = eventId(moment);
    const sources = scope ? byEventAndId.get(JSON.stringify([scope, key])) : byId.get(key);
    if (sources?.length !== 1) continue;
    const source = sources[0];
    const savedWorks = getParticipantWorks(moment);
    const works = savedWorks.length ? savedWorks : getParticipantWorks(source);
    for (const work of works) {
      const groups = isEnsemble(source) ? active(source) ? [source] : [] : list(getGroupsForWork(source, work)).filter(active);
      if (!isEnsemble(source) && groups.length) {
        const names = [...new Set(groups.map(group => originalText(group.estudianteGrupo) || originalText(group.nombrePresentacion) || 'un ensamble'))];
        warn(moment, `«${work}» se interpreta en ${names.join(' / ')}. Revisa este momento individual para no sumar dos veces su tiempo.`);
      }
      for (const group of groups) {
        const groupId = sourceId(group);
        if (!groupId) continue;
        const occurrenceKey = JSON.stringify([eventId(group) || eventId(source), groupId, normalizarNombre(work)]);
        if (!occurrences.has(occurrenceKey)) occurrences.set(occurrenceKey, { work, group, moments: new Map() });
        occurrences.get(occurrenceKey).moments.set(id(moment.id), moment);
      }
    }
  }
  for (const { work, group, moments: repeated } of occurrences.values()) {
    if (repeated.size < 2) continue;
    const name = originalText(group.estudianteGrupo) || originalText(group.nombrePresentacion) || 'el ensamble';
    const message = `«${work}» de ${name} aparece en ${repeated.size} momentos del programa. Revisa los minutos para contar esta interpretación una sola vez.`;
    for (const moment of repeated.values()) warn(moment, message);
  }
  return warnings;
}
