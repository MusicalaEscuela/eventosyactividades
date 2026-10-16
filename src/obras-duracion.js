import { normalizarNombre } from './docentes-model.js';

export function workMinutes(value) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function getWorkMinutes(row = {}, work = '') {
  if (row.duracionObrasReferencia && row.duracionObrasReferencia !== workDurationReference(row)) return null;
  const key = normalizarNombre(work);
  const stored = (Array.isArray(row.duracionesObras) ? row.duracionesObras : []).filter(item => normalizarNombre(item?.obra) === key);
  if (stored.length === 1) return workMinutes(stored[0].minutos);
  // A historical total can only be assigned safely when there is one work.
  const own = Array.isArray(row.repertorios) && row.repertorios.length ? row.repertorios : row.repertorio ? [row.repertorio] : [];
  const keys = new Set(own.map(normalizarNombre));
  return !row.duracionPorObra && keys.size === 1 && keys.has(key) ? workMinutes(row.duracionMin) : null;
}

export function workDurationReference(row) {
  const works = Array.isArray(row.repertorios) && row.repertorios.length ? row.repertorios : row.repertorio ? [row.repertorio] : [];
  return JSON.stringify([[...new Set(works.map(normalizarNombre))].sort(), workMinutes(row.duracionMin)]);
}

export function workDurationSummary(row, works) {
  const unique = [...new Map(works.map(work => [normalizarNombre(work), work])).values()];
  const pending = unique.filter(work => getWorkMinutes(row, work) === null);
  const knownMinutes = unique.reduce((sum, work) => sum + (getWorkMinutes(row, work) ?? 0), 0);
  return { minutes: pending.length ? null : knownMinutes, knownMinutes, pending };
}
