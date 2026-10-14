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
