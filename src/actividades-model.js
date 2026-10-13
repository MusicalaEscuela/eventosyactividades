import { normalizarNombre } from './docentes-model.js';

export const ACTIVITY_STATES = ['Pendiente', 'En curso', 'Bloqueada', 'Terminada', 'Cancelada'];

export const ACTIVITY_STATE_HELP = {
  'Pendiente': 'Todavía no se ha empezado esta actividad.',
  'En curso': 'La actividad ya se está realizando.',
  'Bloqueada': 'La actividad necesita resolver un impedimento para poder avanzar.',
  'Terminada': 'Todo el trabajo de esta actividad quedó completo.',
  'Cancelada': 'Se decidió no realizar esta actividad.'
};

export const ACTIVITY_COLUMNS = [
  { id: 'pendiente', nombre: 'Pendiente', estado: 'Pendiente', estados: ['Pendiente', ''] },
  { id: 'curso', nombre: 'En curso', estado: 'En curso', estados: ['En curso'] },
  { id: 'bloqueada', nombre: 'Bloqueada', estado: 'Bloqueada', estados: ['Bloqueada', 'En riesgo', 'Bloqueado'] },
  { id: 'terminada', nombre: 'Terminada', estado: 'Terminada', estados: ['Terminada', 'Listo', 'Confirmado', 'Realizado', 'Completado', 'Completada', 'Terminado'] },
  { id: 'cancelada', nombre: 'Cancelada', estado: 'Cancelada', estados: ['Cancelada', 'Cancelado'] }
];

const normalizedStates = new Map(ACTIVITY_COLUMNS.flatMap(column =>
  column.estados.map(alias => [normalizarNombre(alias), column.estado])));

/** Unknown states remain visible so legacy records do not lose their meaning. */
export function normalizeActivityState(value) {
  const state = String(value ?? '').trim();
  return normalizedStates.get(normalizarNombre(state)) || state || 'Pendiente';
}

export const ACTIVITY_RESPONSIBLE_GROUPS = [
  'Coordinación', 'Coordinación académica', 'Administración', 'Docentes',
  'Producción', 'Marketing', 'Comercial', 'Sonido', 'Equipo'
];
