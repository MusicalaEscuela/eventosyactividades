import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarNombre, nombresPresentacion, coincidenciasPresentacion,
  validarFichaParaConfirmar, instruccionesDocentes, muestraDesdeFicha
} from '../src/docentes-model.js';

const ficha = (extra = {}) => ({
  estado: 'Enviado', revision: 3, cantidadPresentaciones: 1,
  docenteNombre: 'Docente de prueba', asistencia: 'Sí', revocada: false,
  disponibilidad: 'Desde las 5', apoyo: 'Acompañar al piano',
  indicacionesGenerales: 'Esperar la señal del equipo', ...extra
});
const presentacion = (extra = {}) => ({
  id: 'p01', revision: 3, tipo: 'Individual', areaArtisticaId: 'musica',
  estudianteGrupo: 'Ana María', repertorio: 'Minueto', duracionMin: 4,
  instrumento: 'Violín', recursos: 'Atril', materialUrl: 'https://example.com/pista',
  preparacion: 'Afinar antes de entrar', entrada: 'Entrar por la izquierda',
  inicio: 'Dar cuatro tiempos', acompanamiento: 'Piano', cierre: 'Saludar',
  observaciones: 'Usar el atril pequeño', ...extra
});

test('Nombres: acentos, mayúsculas y espacios cruzan los registros antiguos', () => {
  assert.equal(normalizarNombre('  ANA   María \t '), 'ana maria');
  assert.deepEqual(nombresPresentacion(presentacion()), ['Ana María']);
  assert.deepEqual(nombresPresentacion(presentacion({ tipo: 'Ensamble', integrantesTexto: ' Ana María\r\n\nBruno\n  ' })), ['Ana María', 'Bruno']);
});

test('Duplicados: distingue coincidencia exacta e integrante que ya participa', () => {
  const propuesta = presentacion({ tipo: 'Ensamble', estudianteGrupo: 'Dúo', integrantesTexto: 'Ana María\nBruno' });
  const matches = coincidenciasPresentacion(propuesta, [
    { id: 'duo', esEnsamble: true, integrantes: [{ nombre: ' bruno ' }, { nombre: 'ANA MARIA' }] },
    { id: 'solo', estudianteGrupo: 'Ana María' },
    { id: 'otro', estudianteGrupo: 'Camila' },
    { id: 'antiguo', estudianteGrupo: 'Bruno' }
  ]);
  assert.deepEqual(matches.map(m => [m.row.id, m.exacta]), [['duo', true], ['solo', false], ['antiguo', false]]);
});

test('Confirmación: sólo fichas enviadas con cantidad y revisión completas', () => {
  assert.deepEqual(validarFichaParaConfirmar(ficha(), [presentacion()]), []);
  assert.deepEqual(validarFichaParaConfirmar(ficha({ estado: 'Requiere ajustes' }), [presentacion()]), []);
  assert.ok(validarFichaParaConfirmar(ficha({ estado: 'Borrador' }), [presentacion()]).length);
  assert.ok(validarFichaParaConfirmar(ficha({ cantidadPresentaciones: 2 }), [presentacion()]).length);
  assert.ok(validarFichaParaConfirmar(ficha(), [presentacion({ revision: 2 })]).length);
  assert.ok(validarFichaParaConfirmar(ficha(), []).length);
  assert.ok(validarFichaParaConfirmar(ficha({ revocada: true }), [presentacion()]).length);
});

test('Confirmación: instrucciones necesarias para ausencia y enlaces seguros', () => {
  assert.deepEqual(validarFichaParaConfirmar(ficha({ asistencia: 'No' }), [presentacion()]), []);
  assert.ok(validarFichaParaConfirmar(ficha({ asistencia: 'No' }), [presentacion({ preparacion: '' })]).length);
  assert.ok(validarFichaParaConfirmar(ficha({ asistencia: 'No' }), [presentacion({ inicio: '' })]).length);
  assert.ok(validarFichaParaConfirmar(ficha(), [presentacion({ materialUrl: 'javascript:alert(1)' })]).length);
  assert.ok(validarFichaParaConfirmar(ficha(), [presentacion({ duracionMin: 121 })]).length);
  assert.ok(validarFichaParaConfirmar(ficha(), [presentacion({ duracionMin: 0 })]).length);
});

test('Confirmación: ensamble incompleto, integrante repetido y copia del mismo repertorio', () => {
  const duo = presentacion({ tipo: 'Ensamble', estudianteGrupo: 'Dúo', integrantesTexto: 'Ana María\nBruno' });
  assert.deepEqual(validarFichaParaConfirmar(ficha(), [duo]), []);
  assert.ok(validarFichaParaConfirmar(ficha(), [presentacion({ tipo: 'Ensamble', integrantesTexto: 'Ana María' })]).length);
  assert.ok(validarFichaParaConfirmar(ficha(), [presentacion({ tipo: 'Ensamble', integrantesTexto: 'Ana María\nANA MARIA' })]).length);
  assert.ok(validarFichaParaConfirmar(ficha({ cantidadPresentaciones: 2 }), [presentacion(), presentacion({ id: 'p02', estudianteGrupo: ' ana maria ' })]).length);
  assert.deepEqual(validarFichaParaConfirmar(ficha({ cantidadPresentaciones: 2 }), [presentacion(), presentacion({ id: 'p02', repertorio: 'Sonata' })]), []);
});

test('Ficha de ejecución: conserva indicaciones generales y cada señal concreta', () => {
  const result = instruccionesDocentes(ficha(), presentacion());
  assert.deepEqual(result, {
    docente: 'Docente de prueba', asistencia: 'Sí', disponibilidad: 'Desde las 5',
    apoyo: 'Acompañar al piano', indicacionesGenerales: 'Esperar la señal del equipo',
    preparacion: 'Afinar antes de entrar', entrada: 'Entrar por la izquierda',
    inicio: 'Dar cuatro tiempos', acompanamiento: 'Piano', cierre: 'Saludar',
    observaciones: 'Usar el atril pequeño', materialUrl: 'https://example.com/pista'
  });
});

test('Inscripción: crea un cupo para ensamble y conserva a sus integrantes para seguimiento', () => {
  const students = [{ nombre: 'Ana Maria', studentId: 'ana' }, { nombre: 'Bruno', studentId: 'bruno' }];
  const solo = muestraDesdeFicha(ficha(), presentacion(), students);
  assert.equal(solo.studentId, 'ana');
  assert.equal(solo.esEnsamble, false);
  assert.equal(solo.estado, 'Pendiente');
  assert.deepEqual(solo.repertorios, ['Minueto']);
  assert.equal(solo.fichaDocente.inicio, 'Dar cuatro tiempos');
  const duo = muestraDesdeFicha(ficha(), presentacion({ tipo: 'Ensamble', estudianteGrupo: ' Dúo ', integrantesTexto: 'Ana María\nBruno' }), students);
  assert.equal(duo.estudianteGrupo, 'Dúo');
  assert.equal(duo.studentId, '');
  assert.equal(duo.esEnsamble, true);
  assert.deepEqual(duo.integrantes, [{ nombre: 'Ana María', studentId: 'ana' }, { nombre: 'Bruno', studentId: 'bruno' }]);
});

test('Inscripción: homónimos no reciben un studentId arbitrario', () => {
  const students = [{ nombre: 'Ana María', studentId: 'ana-1' }, { nombre: 'Ana Maria', studentId: 'ana-2' }];
  assert.equal(muestraDesdeFicha(ficha(), presentacion(), students).studentId, '');
  assert.equal(muestraDesdeFicha(ficha(), presentacion(), []).studentId, '');
  assert.equal(muestraDesdeFicha(ficha(), presentacion(), [students[0], students[0]]).studentId, 'ana-1');
});

test('Inscripción por área: escena/coreografía y exposición conservan su medición', () => {
  for (const areaArtisticaId of ['danza', 'teatro']) {
    const row = muestraDesdeFicha(ficha(), presentacion({ areaArtisticaId, repertorio: 'Escena de prueba' }));
    assert.equal(row.nombrePresentacion, 'Escena de prueba');
  }
  const p = presentacion({ areaArtisticaId: 'artes-plasticas', repertorio: 'Acuarelas', duracionMin: 0, cantidadObras: 2 });
  assert.deepEqual(validarFichaParaConfirmar(ficha(), [p]), []);
  const row = muestraDesdeFicha(ficha(), p);
  assert.equal(row.tituloObra, 'Acuarelas');
  assert.equal(row.cantidadObras, 2);
  assert.equal(row.expuesta, false);
  for (const cantidadObras of [0, 1.5, 21]) assert.ok(validarFichaParaConfirmar(ficha(), [{ ...p, cantidadObras }]).length);
  assert.ok(validarFichaParaConfirmar(ficha(), [presentacion({ areaArtisticaId: 'desconocida' })]).length);
  assert.ok(validarFichaParaConfirmar(ficha(), [presentacion({ tipo: 'desconocido' })]).length);
});
