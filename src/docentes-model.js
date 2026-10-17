import { teacherWorks, normalizeTeacherWorks } from './docentes-obras.js?v=20261017-integracion';
import { workDurationReference } from './obras-duracion.js?v=20261016-tiempo-por-obra';
export const normalizarNombre = value => String(value || '').trim().toLocaleLowerCase('es-CO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

export function nombresPresentacion(row) {
  return row.tipo === 'Ensamble'
    ? String(row.integrantesTexto || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    : [String(row.estudianteGrupo || '').trim()].filter(Boolean);
}

function nombresInscripcion(row) {
  return Array.isArray(row.integrantes) && row.integrantes.length
    ? row.integrantes.map(i => i.nombre).filter(Boolean) : [row.estudianteGrupo].filter(Boolean);
}

export function coincidenciasPresentacion(propuesta, existentes) {
  const nombres = nombresPresentacion(propuesta).map(normalizarNombre).sort();
  return existentes.map(row => {
    const otros = nombresInscripcion(row).map(normalizarNombre).sort();
    const exacta = nombres.length === otros.length && nombres.join('|') === otros.join('|');
    return { row, exacta, coincide: nombres.some(n => otros.includes(n)) };
  }).filter(match => match.coincide);
}

export function validarFichaParaConfirmar(ficha, presentaciones) {
  const errors = [];
  if (ficha.revocada) errors.push('Esta ficha fue reemplazada y ya no se puede confirmar.');
  if (!['Enviado', 'Requiere ajustes'].includes(ficha.estado)) errors.push('El docente debe enviar la ficha antes de confirmarla.');
  if (!presentaciones.length || presentaciones.length !== ficha.cantidadPresentaciones || presentaciones.length > 20) errors.push('La ficha no tiene todas sus presentaciones guardadas.');
  const vistos = new Set();
  for (const row of presentaciones) {
    try{normalizeTeacherWorks(row,true);}catch(error){errors.push(error.message);}
    if (!['Individual', 'Ensamble'].includes(row.tipo) || !['musica', 'danza', 'teatro', 'artes-plasticas'].includes(row.areaArtisticaId)) errors.push('Revisa el tipo y el área de cada presentación.');
    const nombres = nombresPresentacion(row);
    const normalizados = nombres.map(normalizarNombre);
    if (row.revision !== ficha.revision) errors.push('Hay una presentación de una revisión anterior. Solicita que el docente guarde de nuevo.');
    if (!String(row.estudianteGrupo || '').trim() || !nombres.length || (row.tipo === 'Ensamble' && nombres.length < 2)) errors.push('Falta el estudiante o los integrantes de un ensamble.');
    if (new Set(normalizados).size !== normalizados.length) errors.push('Un estudiante aparece dos veces dentro del mismo ensamble.');
    if (!String(row.repertorio || '').trim() || (row.areaArtisticaId !== 'artes-plasticas' && !(Number(row.duracionMin) > 0 && Number(row.duracionMin) <= 120))) errors.push('Cada presentación necesita repertorio o actividad y duración de 1 a 120 minutos (excepto exposición).');
    if (row.areaArtisticaId === 'artes-plasticas' && (!Number.isInteger(row.cantidadObras) || row.cantidadObras < 1 || row.cantidadObras > 20)) errors.push('Indica de 1 a 20 obras para la exposición.');
    if (ficha.asistencia === 'No' && (!String(row.preparacion || '').trim() || !String(row.inicio || '').trim())) errors.push('Faltan instrucciones de preparación e inicio para la ausencia del docente.');
    if (row.materialUrl && !/^https?:\/\/\S+$/i.test(row.materialUrl)) errors.push('Los materiales deben tener un enlace http o https válido.');
    const clave = [...normalizados].sort().join('|') + '/' + normalizarNombre(row.repertorio);
    if (vistos.has(clave)) errors.push('Hay dos presentaciones iguales en esta ficha.');
    vistos.add(clave);
  }
  return [...new Set(errors)];
}

export function instruccionesDocentes(ficha, propuesta) {
  const fields = ['preparacion', 'entrada', 'inicio', 'acompanamiento', 'cierre', 'observaciones', 'materialUrl'];
  return { docente: ficha.docenteNombre, asistencia: ficha.asistencia, disponibilidad: ficha.disponibilidad || '', apoyo: ficha.apoyo || '', indicacionesGenerales: ficha.indicacionesGenerales || '', ...Object.fromEntries(fields.map(k => [k, propuesta[k] || ''])) };
}

export function muestraDesdeFicha(ficha, propuesta, estudiantes = []) {
  const buscarId = nombre => { const ids = [...new Set(estudiantes.filter(s => normalizarNombre(s.nombre) === normalizarNombre(nombre)).map(s => s.studentId).filter(Boolean))]; return ids.length === 1 ? ids[0] : ''; };
  const ensemble = propuesta.tipo === 'Ensamble';
  const row = { estudianteGrupo: propuesta.estudianteGrupo.trim(), studentId: ensemble ? '' : buscarId(propuesta.estudianteGrupo), esEnsamble: ensemble, areaArtisticaId: propuesta.areaArtisticaId, instrumento: propuesta.instrumento || '', docente: ficha.docenteNombre, repertorio: propuesta.repertorio.trim(), repertorios: [propuesta.repertorio.trim()], duracionMin: Number(propuesta.duracionMin), recursos: propuesta.recursos || '', estado: 'Pendiente', prioridad: 'Media', genero: 'Sin definir', fichaDocente: instruccionesDocentes(ficha, propuesta) };
  if(propuesta.obrasJson){
    const works=teacherWorks(propuesta).filter(w=>w.obra);
    row.repertorios=works.map(w=>w.obra);row.repertorio=row.repertorios.join(' / ');
    row.duracionPorObra=true;row.duracionesObras=works.map(w=>({obra:w.obra,minutos:w.minutos}));
    row.duracionMin=works.some(w=>w.minutos===null)?null:works.reduce((sum,w)=>sum+w.minutos,0);
    row.duracionObrasReferencia=workDurationReference(row);
  }
  row.recursosSeleccionados=String(propuesta.recursos||'').split(/[,\n]/).map(v=>v.trim()).filter(Boolean);
  if (ensemble) row.integrantes = nombresPresentacion(propuesta).map(nombre => ({ nombre, studentId: buscarId(nombre) }));
  if (['danza', 'teatro'].includes(row.areaArtisticaId)) row.nombrePresentacion = row.repertorio;
  if (row.areaArtisticaId === 'artes-plasticas') { row.tituloObra = row.repertorio; row.cantidadObras = propuesta.cantidadObras; row.expuesta = false; }
  return row;
}
