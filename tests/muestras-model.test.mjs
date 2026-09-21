import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,calendar,easter,iso,capacityRows,activeArtAreas,activeModalities,artAreaForRow,modalityForRow,artCapacityRows,normalizeConfig,plannedJornadas,jornadaEventId,validate,validateDates,eventId} from '../src/muestras-model.js';
test('Las cuatro fechas base de 2026 coinciden exactamente',()=>{
 assert.deepEqual(calendar(2026,defaults()).map(x=>[x.fechaInicio,x.fechaFin]),[['2026-03-16','2026-03-21'],['2026-05-25','2026-05-30'],['2026-09-14','2026-09-19'],['2026-11-30','2026-12-05']]);
});
test('Pascua gregoriana: fechas conocidas y cambio de siglo',()=>{
 for(const [y,d] of [[2000,'2000-04-23'],[2024,'2024-03-31'],[2025,'2025-04-20'],[2026,'2026-04-05'],[2027,'2027-03-28'],[2038,'2038-04-25'],[2100,'2100-03-28']])assert.equal(iso(easter(y)),d);
});
test('200 años: lunes a sábado, mayo completo, segundo lunes de septiembre y primer sábado diciembre',()=>{
 for(let y=2000;y<2200;y++){
  const rows=calendar(y,defaults());for(const r of rows){assert.equal(new Date(r.fechaInicio).getUTCDay(),1);assert.equal(new Date(r.fechaFin).getUTCDay(),6);assert.equal((Date.parse(r.fechaFin)-Date.parse(r.fechaInicio))/86400000,5);}
  assert.equal(new Date(rows[1].fechaInicio).getUTCMonth(),4);assert.equal(new Date(rows[1].fechaFin).getUTCMonth(),4);assert.ok(Number(rows[1].fechaFin.slice(-2))>=25);
  assert.ok(Number(rows[2].fechaInicio.slice(-2))>=8&&Number(rows[2].fechaInicio.slice(-2))<=14);
  assert.equal(new Date(rows[3].fechaFin).getUTCMonth(),11);assert.ok(Number(rows[3].fechaFin.slice(-2))<=7);
 }
});
test('Capacidad: ensamble cuenta una vez, antiguos no se pierden, límites y desbordamiento',()=>{
 const c=defaults(),rows=[{esEnsamble:true,integrantes:[1,2,3],familiaInstrumentalId:'ensambles'},{estudianteGrupo:'Antiguo'},...Array.from({length:37},()=>({familiaInstrumentalId:'piano'}))];
 const result=capacityRows(c,rows);assert.equal(result.unassigned,1);assert.equal(result.rows.find(x=>x.id==='ensambles').count,1);assert.equal(result.rows.find(x=>x.id==='piano').extra,1);
 for(const [n,status] of [[18,'Disponible'],[23,'Últimos cupos'],[24,'Completo'],[25,'Ampliar']])assert.equal(capacityRows(c,Array.from({length:n},()=>({familiaInstrumentalId:'canto'}))).rows.find(x=>x.id==='canto').status,status);
 c.distribucion.find(x=>x.id==='piano').activo=false;assert.equal(capacityRows(c,rows).unassigned,38);
});
test('Validación de bloques, reglas, políticas, fechas imposibles e IDs estables',()=>{
 const c=defaults();assert.doesNotThrow(()=>validate(c));c.bloques[1].hora='18:00';assert.throws(()=>validate(c));
 assert.throws(()=>validateDates([{fechaInicio:'2026-02-30',fechaFin:'2026-03-02'}]));assert.throws(()=>validateDates([{fechaInicio:'2026-05-30',fechaFin:'2026-05-25'}]));
 assert.equal(eventId(2027,'1'),eventId(2027,'1'));assert.notEqual(eventId(2026,'1'),eventId(2027,'1'));
});
test('Áreas artísticas: modalidades y métricas sin migrar registros antiguos',()=>{
 const c=normalizeConfig(defaults());
 assert.deepEqual(activeArtAreas(c).map(a=>a.id),['musica','teatro','danza','artes-plasticas']);
 assert.equal(activeModalities(c,'teatro').find(m=>m.id==='teatro-grupal').duracionSugerida,10);
 assert.equal(activeModalities(c,'danza').find(m=>m.id==='danza-coreografia').cupo,10);
 assert.equal(artAreaForRow(c,{area:'Piano'}),'musica');
 assert.equal(artAreaForRow(c,{area:'Artes Plásticas'}),'artes-plasticas');
 assert.equal(modalityForRow(c,{areaArtisticaId:'teatro',modalidadPresentacionId:'teatro-grupal'}).nombre,'Escena grupal');
 const rows=[
  {areaArtisticaId:'teatro',modalidadPresentacionId:'teatro-grupal',duracionMin:10,integrantes:Array(7)},
  {areaArtisticaId:'danza',modalidadPresentacionId:'danza-coreografia',duracionMin:6},
  {areaArtisticaId:'artes-plasticas',cantidadObras:2,seleccionadaExposicion:true},
  {area:'Piano',familiaInstrumentalId:'piano'}
 ];
 const metrics=artCapacityRows(c,rows);
 assert.deepEqual(metrics.find(a=>a.id==='teatro').cantidad,1);
 assert.equal(metrics.find(a=>a.id==='teatro').totalDuracion,10);
 assert.equal(metrics.find(a=>a.id==='danza').totalDuracion,6);
 assert.equal(metrics.find(a=>a.id==='artes-plasticas').cantidad,2);
 assert.equal(metrics.find(a=>a.id==='artes-plasticas').expuestas,1);
 assert.doesNotThrow(()=>validate(c));
});
test('Jornadas programadas crean eventos por día y área sin adivinar conflictos',()=>{
 const c=defaults(), cycle=calendar(2026,c)[2], jornadas=plannedJornadas(c,cycle);
 assert.equal(jornadas.filter(j=>j.areaArtisticaId==='musica').length,6);
 assert.equal(jornadas.find(j=>j.id==='s1-musica-piano').fechaInicio,'2026-09-18');
 assert.equal(jornadas.find(j=>j.id==='s2-teatro').fechaInicio,'2026-09-25');
 assert.equal(jornadas.find(j=>j.id==='s2-danza').fechaInicio,'2026-09-26');
 const gallery=jornadas.find(j=>j.id==='s2-artes-plasticas');
 assert.deepEqual([gallery.fechaInicio,gallery.fechaFin],['2026-09-21','2026-09-26']);
 assert.equal(jornadaEventId(2027,'3','s1-musica-piano'),'muestra-artistica-2027-3-s1-musica-piano');
 c.modalidadesArtisticas.filter(m=>m.areaArtisticaId==='teatro').forEach(m=>m.dia=5);
 assert.ok(plannedJornadas(c,cycle).find(j=>j.id==='s2-teatro').conflicto.length>0);
});
