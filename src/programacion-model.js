import { normalizarNombre } from './docentes-model.js';

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
