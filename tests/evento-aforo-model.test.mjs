import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEventAttendance } from '../src/evento-aforo-model.js';

const event = { publicoAdicionalCantidad: 0 };
const attendee = (id, extra={}) => ({ id, studentId:id, estudianteGrupo:id, invitacionEstado:'Aceptada', ...extra });

test('only attendance confirmations count; preparation states and pending guests stay projected', () => {
  const summary=calculateEventAttendance({event:{publicoAdicionalCantidad:3},participants:[
    attendee('ana',{tieneInvitados:true,invitadosCantidad:2}),
    attendee('bruno',{invitacionEstado:'Pendiente',estado:'Listo',tieneInvitados:true,invitadosCantidad:4}),
    attendee('cata',{invitacionEstado:'Enviada',estado:'Realizado'}),
    attendee('daniel',{invitacionEstado:'Pendiente',estado:'Confirmado'}),
    attendee('rechazo',{invitacionEstado:'Rechazada',estado:'Confirmado',tieneInvitados:true,invitadosCantidad:8}),
    attendee('cancelado',{estado:'Cancelado',tieneInvitados:true,invitadosCantidad:8})
  ],team:[{nombre:'Producción',estado:'Confirmado'},{nombre:'Recepción',estado:'Pendiente'},{nombre:'Ausente',estado:'No disponible'}]});
  assert.equal(summary.estudiantes,2);
  assert.equal(summary.equipo,1);
  assert.equal(summary.invitadosRegistrados,2);
  assert.equal(summary.publicoAdicional,3);
  assert.equal(summary.sillasSugeridas,8);
  assert.deepEqual(summary.pendientes,{estudiantes:2,equipo:1,invitados:4,personas:7,sillasProyectadas:15});
});

test('multiple registrations and ensemble membership do not multiply students or family guests', () => {
  const ana=attendee('ana',{estudianteGrupo:'Ana',tieneInvitados:true,invitadosCantidad:2});
  const bruno=attendee('bruno',{estudianteGrupo:'Bruno',tieneInvitados:true,invitadosCantidad:3});
  const group={id:'group',esEnsamble:true,estudianteGrupo:'Dúo',invitacionEstado:'Aceptada',integrantes:[{participanteId:'ana',studentId:'ana',nombre:'Ana'},{participanteId:'bruno',studentId:'bruno',nombre:'Bruno'}],tieneInvitados:true,invitadosCantidad:5};
  const summary=calculateEventAttendance({event,participants:[ana,{...ana,id:'ana-work-two'},bruno,group,{...group,id:'group-two'}]});
  assert.equal(summary.estudiantes,2);
  assert.equal(summary.invitadosRegistrados,5);
  assert.equal(summary.totalPersonas,7);
  assert.ok(summary.warnings.some(warning=>warning.includes('sin sumarlos otra vez')));
});

test('individual attendance is authoritative when a whole ensemble is accepted', () => {
  const summary=calculateEventAttendance({event,participants:[
    attendee('ana',{invitacionEstado:'Pendiente',tieneInvitados:true,invitadosCantidad:2}),
    {id:'group',esEnsamble:true,estudianteGrupo:'Dúo',invitacionEstado:'Aceptada',integrantes:[{participanteId:'ana',studentId:'ana',nombre:'Ana'},{studentId:'new',nombre:'Nueva'}],tieneInvitados:true,invitadosCantidad:4}
  ]});
  assert.equal(summary.estudiantes,1);
  assert.equal(summary.invitadosRegistrados,0);
  assert.equal(summary.pendientes.estudiantes,1);
  assert.equal(summary.pendientes.invitados,4);
  assert.ok(summary.warnings.some(warning=>warning.includes('asistencia individual pendiente')));
});

test('rejected group does not remove a confirmed solo student; rejected members do not add guests', () => {
  const ana=attendee('ana');
  const summary=calculateEventAttendance({event,participants:[ana,{id:'no',esEnsamble:true,invitacionEstado:'Rechazada',integrantes:[{studentId:'ana',nombre:'Ana'}]}]});
  assert.equal(summary.estudiantes,1);
  const declined=calculateEventAttendance({event,participants:[attendee('ana',{invitacionEstado:'Rechazada'}),{id:'duo',esEnsamble:true,invitacionEstado:'Aceptada',integrantes:[{studentId:'ana',nombre:'Ana'}],tieneInvitados:true,invitadosCantidad:4}]});
  assert.equal(declined.estudiantes,0);
  assert.equal(declined.invitadosRegistrados,0);
  assert.equal(declined.pendientes.invitados,0);
});

test('empty legacy groups are unknown rather than one invented student', () => {
  const summary=calculateEventAttendance({event,participants:[{id:'group',tipo:'Ensamble',estudianteGrupo:'Grupo anterior',invitacionEstado:'Aceptada'}]});
  assert.equal(summary.estudiantes,0);
  assert.equal(summary.complete,false);
  assert.ok(summary.warnings.some(warning=>warning.includes('Faltan los integrantes')));
});

test('known homonyms retain separate identities; exact unambiguous legacy names can merge', () => {
  const summary=calculateEventAttendance({event,participants:[attendee('one',{estudianteGrupo:'Ana Pérez'}),attendee('two',{estudianteGrupo:'Ana Pérez'}),{id:'legacy',estudianteGrupo:'Ana Pérez',invitacionEstado:'Aceptada'}]});
  assert.equal(summary.estudiantes,3);
  assert.equal(summary.complete,false);
  const same=calculateEventAttendance({event,participants:[attendee('one',{estudianteGrupo:'Ána Pérez'}),{id:'legacy',estudianteGrupo:'ana perez',invitacionEstado:'Aceptada'}]});
  assert.equal(same.estudiantes,1);
});

test('team roles and student-team overlap consume only one chair per confirmed person', () => {
  const summary=calculateEventAttendance({event,participants:[attendee('ana',{estudianteGrupo:'Ana'}),attendee('pending',{estudianteGrupo:'Bruno',invitacionEstado:'Pendiente'})],team:[
    {nombre:'Ana',estado:'Confirmado',rol:'Presentación'},
    {nombre:'Alek',estado:'Confirmado',rol:'Sonido'},
    {nombre:'Alek',estado:'Pendiente',rol:'Producción'},
    {nombre:'Bruno',estado:'Confirmado',rol:'Apoyo'},
    {nombre:'Ausente',estado:'No disponible'},
    {nombre:'Otro',estado:'Pendiente'}
  ]});
  assert.equal(summary.estudiantes,1);
  assert.equal(summary.equipo,2);
  assert.equal(summary.totalPersonas,3);
  assert.deepEqual(summary.pendientes,{estudiantes:0,equipo:1,invitados:0,personas:1,sillasProyectadas:4});
  assert.deepEqual(summary.personasConfirmadas.equipo.map(person=>person.nombre).sort(),['Alek','Bruno']);
});

test('public description is never parsed into people; explicit zero is a valid declaration', () => {
  const missing=calculateEventAttendance({event:{publico:'30 estudiantes y familias'},participants:[attendee('ana')]});
  assert.equal(missing.publicoAdicional,0);
  assert.equal(missing.totalPersonas,1);
  assert.equal(missing.complete,false);
  const explicit=calculateEventAttendance({event:{publico:'Familias',publicoAdicionalCantidad:0},participants:[attendee('ana')]});
  assert.equal(explicit.complete,true);
  assert.equal(explicit.publicoAdicionalDefinido,true);
});

test('manual legacy values including zero survive until automatic mode is explicitly chosen', () => {
  const participants=[attendee('ana'),attendee('bruno')];
  const legacy=calculateEventAttendance({event:{...event,sillasCantidad:25},participants});
  assert.equal(legacy.sillasModo,'manual');
  assert.equal(legacy.sillasTotal,25);
  const zero=calculateEventAttendance({event:{...event,sillasCantidad:0},participants});
  assert.equal(zero.sillasTotal,0);
  assert.equal(zero.sillasFaltantes,2);
  const automatic=calculateEventAttendance({event:{...event,sillasCantidad:25,sillasModo:'automatico'},participants});
  assert.equal(automatic.sillasTotal,2);
  assert.equal(automatic.sillasManual,25);
  const manualUnset=calculateEventAttendance({event:{...event,sillasModo:'manual',sillasCantidad:''},participants});
  assert.equal(manualUnset.sillasTotal,null);
});

test('live data changes recompute automatic values without modifying input data', () => {
  const input={event:{...event,sillasModo:'automatico'},participants:[attendee('ana')],team:[]};
  const original=structuredClone(input);
  assert.equal(calculateEventAttendance(input).sillasTotal,1);
  assert.deepEqual(input,original);
  input.participants.push(attendee('bruno',{tieneInvitados:true,invitadosCantidad:3}));
  input.team.push({nombre:'Alek',estado:'Confirmado'});
  assert.equal(calculateEventAttendance(input).sillasTotal,6);
});

test('location capacity comes from an unambiguous registered place and warns about overflow', () => {
  const places=[{id:'auditorio',nombre:'Auditorio Musicala',capacidad:3}];
  const summary=calculateEventAttendance({event:{...event,lugar:'Auditorio Musicala',publicoAdicionalCantidad:5},places});
  assert.equal(summary.capacidadLugar,3);
  assert.equal(summary.excesoCapacidad,2);
  const ambiguous=calculateEventAttendance({event:{...event,lugar:'Auditorio Musicala'},places:[...places,{id:'other',nombre:'Auditorio Musicala',capacidad:20}]});
  assert.equal(ambiguous.capacidadLugar,null);
});

test('invalid quantities are not silently coerced into chairs and malformed collections are safe', () => {
  const summary=calculateEventAttendance({event:{publicoAdicionalCantidad:-3,sillasModo:'manual',sillasCantidad:1.5},participants:[attendee('ana',{tieneInvitados:true,invitadosCantidad:2.7})],team:null,places:null});
  assert.equal(summary.invitadosRegistrados,0);
  assert.equal(summary.publicoAdicional,0);
  assert.equal(summary.sillasTotal,null);
  assert.equal(summary.complete,false);
  assert.equal(calculateEventAttendance({participants:null}).totalPersonas,0);
  assert.equal(calculateEventAttendance({event:{publicoAdicionalCantidad:true}}).publicoAdicionalDefinido,false);
  assert.equal(calculateEventAttendance({event:{publicoAdicionalCantidad:'  '}}).publicoAdicionalDefinido,false);
  assert.equal(calculateEventAttendance({event,participants:[attendee('ana',{estadoAsistencia:'No asistirá'})]}).estudiantes,0);
});
