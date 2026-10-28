import { getWorkMinutes } from './obras-duracion.js?v=20261016-tiempo-por-obra';
import { buildEnsembleParticipationIndex, getEffectiveParticipantWorks, getEnsemblesForParticipantWork } from './ensambles-model.js?v=20261016-tiempo-por-obra';
import { MAX_PRESENTACIONES, validateFichaInput } from './docentes-data.js?v=20261028-guiado';
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

function presentationFromInscription(row, docenteId, docenteNombre, index) {
  const instructions = instruccionesRegistradas(row, docenteId, docenteNombre);
  const area = row.areaArtisticaId || row.areaArtisticaNombre || row.area || 'musica';
  const areaArtisticaId = areas.get(normalizarNombre(area));
  if (!areaArtisticaId) throw Error(`Revisa el área artística de ${row.estudianteGrupo || 'una inscripción'} antes de preparar su ficha.`);
  const repertorios = Array.isArray(row.repertorios) ? row.repertorios.filter(value => typeof value === 'string' && value.trim()) : [];
  const recursos = Array.isArray(row.recursosSeleccionados) ? row.recursosSeleccionados.filter(value => typeof value === 'string' && value.trim()) : [];
  const ensemble = Boolean(row.esEnsamble || row.tipo === 'Ensamble' || row.integrantes?.length);
  const integrantesTexto = (Array.isArray(row.integrantes) ? row.integrantes.map(member => typeof member === 'string' ? member : texto(member?.nombre)).filter(Boolean).join('\n') : '') || texto(row.integrantesTexto);
  const duration = typeof row.duracionMin === 'string' ? row.duracionMin.replace(',', '.') : row.duracionMin;
  const title = areaArtisticaId === 'artes-plasticas' ? texto(row.tituloObra) : ['danza', 'teatro'].includes(areaArtisticaId) ? texto(row.nombrePresentacion) : '';
  const effectiveWorks=getEffectiveParticipantWorks(row,index);
  const obrasJson=JSON.stringify(effectiveWorks.map(obra=>{
    const groups=ensemble?[]:getEnsemblesForParticipantWork(row,obra,index);
    return {obra,minutos:groups.length===1?getWorkMinutes(groups[0],obra):getWorkMinutes(row,obra),...(groups.length?{compartida:true,ensambleId:groups.length===1?groups[0].id:''}:{})};
  }));
  return {
    obrasJson, inscripcionId: texto(row.id).length<=100?texto(row.id):'',
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
  const index=buildEnsembleParticipationIndex(participants);
  const rows = participants.filter(row => normalizarNombre(row.docente) === normalizarNombre(docenteNombre));
  const estudiantesPrecargados = rows.map((row, index) => {
    let normalized;
    try {
      normalized = validateFichaInput({ eventoId, docenteId, docenteNombre, estado: 'Borrador', presentaciones: [presentationFromInscription(row, docenteId, docenteNombre, index)] }).presentaciones[0];
    } catch (error) { throw Error(`${row.estudianteGrupo || `Inscripción ${index + 1}`}: ${error.message}`); }
    const { id, ...presentation } = normalized;
    const integrantesDetalle = Array.isArray(row.integrantes) ? row.integrantes.map(member => ({
      nombre: texto(typeof member === 'string' ? member : member?.nombre).trim(),
      instrumento: texto(typeof member === 'object' && member ? member.instrumento : '').trim()
    })).filter(member => member.nombre) : [];
    const sourceId = texto(row.id);
    const validId = sourceId && !sourceId.includes('/') && !['.', '..'].includes(sourceId) && new TextEncoder().encode(sourceId).length <= 1500;
    return { ...presentation, integrantesDetalle, ...(validId ? { inscripcionId: sourceId } : {}) };
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

/** Append only missing entries; ambiguous matches remain available in the roster. */
export function planMissingPresentations(roster, existing, previousRoster = []) {
  const identity = row => ['tipo','areaArtisticaId','estudianteGrupo'].map(key=>normalizarNombre(row[key])).join('|');
  const used = new Set(), additions = [], updates=[];
  let pending = 0;
  const ids = new Set(existing.map(row=>row.id));
  for (const source of roster) {
    const old = source.inscripcionId ? previousRoster.find(row=>row.inscripcionId===source.inscripcionId) : null;
    let match = existing.find(row=>!used.has(row.id) && (row.inscripcionId && row.inscripcionId===source.inscripcionId || preloadMatchesPresentation(source,row) || old && preloadMatchesPresentation(old,row)));
    if (!match) {
      const sameIdentity = existing.filter(row=>!used.has(row.id) && identity(row)===identity(source));
      if (sameIdentity.length===1 && roster.filter(row=>identity(row)===identity(source)).length===1) match=sameIdentity[0];
      else if (sameIdentity.length) { pending++; continue; }
    }
    if (match) {
      used.add(match.id);
      const changes={};
      for(const field of ['instrumento','repertorio','duracionMin','cantidadObras','recursos','integrantesTexto','obrasJson',...camposPresentacion]){
        const empty=match[field]==null||match[field]===''||field==='duracionMin'&&Number(match[field])===0;
        const unchanged=old&&samePreload(match[field],old[field]);
        if(source[field]!==undefined&&(empty||unchanged)&&!samePreload(match[field],source[field]))changes[field]=source[field];
      }
      // Upgrade legacy work lists only if their text has not been edited by the teacher.
      if(!match.obrasJson && source.obrasJson && (!match.repertorio || match.repertorio===source.repertorio || old&&match.repertorio===old.repertorio))changes.obrasJson=source.obrasJson;
      if(!match.inscripcionId&&source.inscripcionId)changes.inscripcionId=source.inscripcionId;
      if(Object.keys(changes).length)updates.push({id:match.id,changes});
      continue;
    }
    if (existing.length+additions.length>=MAX_PRESENTACIONES) { pending++; continue; }
    let number=1;while(ids.has(`p${String(number).padStart(2,'0')}`))number++;
    const id=`p${String(number).padStart(2,'0')}`;ids.add(id);
    const {integrantesDetalle,...presentation}=source;
    additions.push({id,...presentation});
  }
  return {additions,pending,updates};
}
