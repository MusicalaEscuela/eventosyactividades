import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPresentationCatalogue, getParticipantDuration, getEnsemblesForParticipantWork } from '../src/ensambles-model.js';
import { buildMomentPresentation, getProgrammeEnsembleWarnings } from '../src/programacion-model.js';
import { artCapacityRows, defaults } from '../src/muestras-model.js';

const works = ['Minuet in G - Bach', 'Viva la vida - Coldplay (arreglo)'];
function fixture() {
  const students = ['a', 'b', 'c'].map(id => ({ id, eventoId: 'event', studentId: id, estudianteGrupo: id, areaArtisticaId: 'musica', repertorios: [...works], duracionMin: 6 }));
  const group = { id: 'group', eventoId: 'event', esEnsamble: true, estudianteGrupo: 'Ensamble', areaArtisticaId: 'musica', repertorios: [...works], duracionMin: 6, integrantes: students.map(row => ({ participanteId: row.id, studentId: row.studentId, nombre: row.estudianteGrupo })) };
  return [...students, group];
}

test('Dos canciones compartidas entre tres alumnos suman seis minutos una vez', () => {
  const rows = fixture();
  const original = structuredClone(rows);
  const catalogue = buildPresentationCatalogue(rows);
  assert.equal(catalogue.length, 1);
  assert.equal(catalogue[0].duracionMin, 6);
  for (const row of rows.slice(0, 3)) assert.equal(getParticipantDuration(row, rows).minutes, 0);
  assert.deepEqual(rows, original);
});

test('El total del evento es 18, conservando dos solistas de seis minutos', () => {
  const rows = [...fixture(), ...['solo1', 'solo2'].map(id => ({ id, eventoId: 'event', repertorios: [id], duracionMin: 6 }))];
  assert.equal(buildPresentationCatalogue(rows).reduce((sum, row) => sum + row.duracionMin, 0), 18);
});

test('Una duración antigua mixta queda pendiente y no se copia al programa', () => {
  const rows = fixture();
  rows[0].repertorios.push('Sonata solista');
  const state = getParticipantDuration(rows[0], rows);
  assert.equal(state.mode, 'mixed-review');
  assert.equal(state.minutes, null);
  const solo = buildPresentationCatalogue(rows).find(row => row.id === 'a');
  assert.deepEqual(solo.repertorios, ['Sonata solista']);
  assert.equal(solo.duracionPendiente, true);
  assert.equal(buildMomentPresentation(solo, solo.repertorios).duracionMin, '');
  const music = artCapacityRows(defaults(), buildPresentationCatalogue(rows)).find(area => area.id === 'musica');
  assert.equal(music.totalDuracion, 6);
  assert.equal(music.duracionesPendientes, 1);
});

test('Los minutos solistas confirmados caducan al cambiar obras o duración original', () => {
  const rows = fixture();
  rows[0].repertorios.push('Sonata solista');
  rows[0].duracionSolistaReferencia = getParticipantDuration(rows[0], rows).confirmationKey;
  rows[0].duracionSolistaMin = 2.5;
  assert.equal(getParticipantDuration(rows[0], rows).minutes, 2.5);
  rows[0].duracionMin = 7;
  assert.equal(getParticipantDuration(rows[0], rows).needsReview, true);
  rows[0].duracionMin = 6;
  rows[3].repertorios.push('Otra obra compartida');
  assert.equal(getParticipantDuration(rows[0], rows).needsReview, true);
});

test('Una obra solista separada conserva su duración aunque herede obras del ensamble', () => {
  const rows = fixture();
  rows[0].repertorios = ['Sonata solista'];
  rows[0].duracionMin = 3;
  assert.equal(getParticipantDuration(rows[0], rows).minutes, 3);
  assert.equal(getParticipantDuration(rows[0], rows).needsReview, false);
});

test('Cancelar el ensamble o cambiar de evento no oculta los minutos individuales', () => {
  const rows = fixture();
  rows[3].estado = 'Cancelado';
  assert.equal(getParticipantDuration(rows[0], rows).minutes, 6);
  delete rows[3].estado;
  rows[3].eventoId = 'other-event';
  assert.equal(getParticipantDuration(rows[0], rows).minutes, 6);
});

test('Cero explícito se conserva y las obras de exposición no requieren duración', () => {
  const art = { id: 'art', areaArtisticaId: 'artes-plasticas', tituloObra: 'Cuadro' };
  assert.equal(getParticipantDuration(art, [art]).needsReview, false);
  const theatre = artCapacityRows(defaults(), [{ areaArtisticaId: 'teatro', duracionMin: 0 }]).find(area => area.id === 'teatro');
  assert.equal(theatre.totalDuracion, 0);
});

test('Programa avisa obras de ensamble repetidas y permite obras distintas separadas', () => {
  const rows = fixture();
  const moments = [
    { id: 'm1', eventoId: 'event', participanteId: 'a', repertorios: [works[0]], duracionMin: 6 },
    { id: 'm2', eventoId: 'event', participanteId: 'group', repertorios: [works[0]], duracionMin: 6 }
  ];
  const before = structuredClone(moments);
  const options = { getGroupsForWork: (source, work) => getEnsemblesForParticipantWork(source, work, rows) };
  const warnings = getProgrammeEnsembleWarnings(moments, rows, options);
  assert.ok(warnings.get('m1').length >= 2);
  assert.ok(warnings.get('m2').length);
  assert.deepEqual(moments, before);
  moments[0].participanteId = 'group';
  moments[0].repertorios = [works[1]];
  assert.equal(getProgrammeEnsembleWarnings(moments, rows, options).size, 0);
});
