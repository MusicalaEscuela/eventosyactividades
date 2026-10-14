import { MAX_PRESENTACIONES, validateFichaInput } from './docentes-data.js';
import { normalizarNombre } from './docentes-model.js';

const texto = value => typeof value === 'string' ? value : '';
const areas = new Map([['musica', 'musica'], ['danza', 'danza'], ['teatro', 'teatro'], ['artes-plasticas', 'artes-plasticas'], ['artes plasticas', 'artes-plasticas']]);
const camposGenerales = ['disponibilidad', 'apoyo', 'indicacionesGenerales'];
const camposPresentacion = ['materialUrl', 'preparacion', 'entrada', 'inicio', 'acompanamiento', 'cierre', 'observaciones'];

function instruccionesRegistradas(row, docenteId, docenteNombre) {
  const keyed = row.fichasDocentes?.[docenteId];
  if (keyed && typeof keyed === 'object' && (!keyed.docente || normalizarNombre(keyed.docente) === normalizarNombre(docenteNombre))) return keyed;
  const primary = row.fichaDocente;
  return primary && typeof primary === 'object' && normalizarNombre(primary.docente) === normalizarNombre(docenteNombre) ? primary : {};
}

function presentationFromInscription(row, docenteId, docenteNombre) {
  const instructions = instruccionesRegistradas(row, docenteId, docenteNombre);
  const area = row.areaArtisticaId || row.areaArtisticaNombre || row.area || 'musica';
  const areaArtisticaId = areas.get(normalizarNombre(area));
  if (!areaArtisticaId) throw Error(`Revisa el área artística de ${row.estudianteGrupo || 'una inscripción'} antes de preparar su ficha.`);
  const repertorios = Array.isArray(row.repertorios) ? row.repertorios.filter(value => typeof value === 'string' && value.trim()) : [];
  const recursos = Array.isArray(row.recursosSeleccionados) ? row.recursosSeleccionados.filter(value => typeof value === 'string' && value.trim()) : [];
  const ensemble = Boolean(row.esEnsamble || row.tipo === 'Ensamble' || row.integrantes?.length);
  const integrantesTexto = texto(row.integrantesTexto) || (Array.isArray(row.integrantes) ? row.integrantes.map(member => typeof member === 'string' ? member : texto(member?.nombre)).filter(Boolean).join('\n') : '');
  const duration = typeof row.duracionMin === 'string' ? row.duracionMin.replace(',', '.') : row.duracionMin;
  const title = areaArtisticaId === 'artes-plasticas' ? texto(row.tituloObra) : ['danza', 'teatro'].includes(areaArtisticaId) ? texto(row.nombrePresentacion) : '';
  return {
    tipo: ensemble ? 'Ensamble' : 'Individual', areaArtisticaId,
    estudianteGrupo: texto(row.estudianteGrupo), integrantesTexto,
    instrumento: texto(row.instrumento),
    repertorio: title || (repertorios.length ? repertorios.join(' / ') : texto(row.repertorio) || texto(row.tituloObra) || texto(row.nombrePresentacion)),
    duracionMin: duration ?? 0, cantidadObras: row.cantidadObras ?? 1,
    recursos: recursos.length ? recursos.join(', ') : texto(row.recursos),
    ...Object.fromEntries(camposPresentacion.map(key => [key, instructions[key] ?? row[key] ?? '']))
  };
}

/** Only names assigned in this event determine the roster; no student directory is queried. */
export function buildTeacherPreload({ eventoId, docenteId, docenteNombre, participants = [], initialize = true }) {
  const rows = participants.filter(row => normalizarNombre(row.docente) === normalizarNombre(docenteNombre));
  const estudiantesPrecargados = rows.map((row, index) => {
    let normalized;
    try {
      normalized = validateFichaInput({ eventoId, docenteId, docenteNombre, estado: 'Borrador', presentaciones: [presentationFromInscription(row, docenteId, docenteNombre)] }).presentaciones[0];
    } catch (error) { throw Error(`${row.estudianteGrupo || `Inscripción ${index + 1}`}: ${error.message}`); }
    const { id, ...presentation } = normalized;
    const sourceId = texto(row.id);
    const validId = sourceId && !sourceId.includes('/') && !['.', '..'].includes(sourceId) && new TextEncoder().encode(sourceId).length <= 1500;
    return { ...presentation, ...(validId ? { inscripcionId: sourceId } : {}) };
  });
  if (new TextEncoder().encode(JSON.stringify(estudiantesPrecargados)).length > 850000) throw Error('El listado completo supera el tamaño de una ficha. Revisa las inscripciones y sus textos antes de prepararla; no se recortaron datos.');
  if (!initialize) return { estudiantesPrecargados, normalized: null, total: rows.length, seeded: 0, excess: Math.max(0, rows.length - MAX_PRESENTACIONES) };
  const instructionRows = rows.map(row => ({ row, instructions: instruccionesRegistradas(row, docenteId, docenteNombre) }));
  const generales = Object.fromEntries(camposGenerales.map(key => {
    const texts = [...new Set(instructionRows.map(({ instructions }) => texto(instructions[key]).trim()).filter(Boolean))];
    return [key, texts.length <= 1 ? texts[0] || '' : instructionRows.filter(({ instructions }) => texto(instructions[key]).trim()).map(({ row, instructions }) => `${row.estudianteGrupo || 'Presentación'}: ${texto(instructions[key]).trim()}`).join('\n\n')];
  }));
  const attendance = [...new Set(instructionRows.map(({ instructions }) => instructions.asistencia).filter(value => ['Sí', 'No', 'Por confirmar'].includes(value)))];
  const normalized = validateFichaInput({ eventoId, docenteId, docenteNombre, ...generales, asistencia: attendance.length === 1 ? attendance[0] : 'Por confirmar', estado: 'Borrador', presentaciones: estudiantesPrecargados.slice(0, MAX_PRESENTACIONES) });
  return { estudiantesPrecargados, normalized, total: rows.length, seeded: normalized.presentaciones.length, excess: Math.max(0, rows.length - MAX_PRESENTACIONES) };
}

export function preloadMatchesPresentation(source, presentation) {
  return ['tipo', 'areaArtisticaId', 'estudianteGrupo', 'repertorio'].every(key => normalizarNombre(source[key]) === normalizarNombre(presentation[key]));
}

export function samePreload(left, right) {
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}
