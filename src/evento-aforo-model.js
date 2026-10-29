// Attendance is derived from registrations, never written back by this module.
const rows = value => Array.isArray(value) ? value.filter(row => row && typeof row === 'object') : [];
const text = value => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CO').replace(/\s+/g, ' ');
const integer = value => ['number','string'].includes(typeof value) && text(value) !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const memberRows = value => Array.isArray(value) ? value.map(member => typeof member === 'string' ? { nombre: member } : member).filter(member => member && typeof member === 'object') : [];
const isGroup = row => Boolean(row.esEnsamble || row.esGrupo || memberRows(row.integrantes).length || ['ensamble', 'grupo', 'grupal'].includes(norm(row.tipo || row.tipoParticipacion)) || norm(row.modalidadPresentacionId) === 'ensambles');
const nameOf = row => text(row.estudianteGrupo || row.nombre || row.name || row.estudiante || row.nombreLibre);
const excludedStates = new Set(['cancelado', 'cancelada', 'no disponible', 'no asistira', 'no asiste', 'rechazado', 'rechazada']);
const confirmedState = value => norm(value) === 'confirmado' || norm(value) === 'confirmada';

/** Preparation states (Listo/Realizado) do not confirm a student's attendance. */
function participantStatus(row) {
  if (excludedStates.has(norm(row.estado)) || excludedStates.has(norm(row.estadoAsistencia)) || norm(row.invitacionEstado) === 'rechazada') return 'excluded';
  return norm(row.invitacionEstado) === 'aceptada' || confirmedState(row.estadoAsistencia || row.estado) ? 'confirmed' : 'pending';
}

function teamStatus(row) {
  const state = norm(row.estadoAsistencia || row.estado);
  if (excludedStates.has(state)) return 'excluded';
  // These legacy states are normalized to Confirmado by the existing team editor.
  return ['confirmado', 'confirmada', 'listo', 'realizado'].includes(state) ? 'confirmed' : 'pending';
}

const strongestStatus = statuses => statuses.includes('confirmed') ? 'confirmed' : statuses.includes('pending') ? 'pending' : 'excluded';
const addIndex = (map, key, value) => { if (key) { if (!map.has(key)) map.set(key, []); map.get(key).push(value); } };

export function calculateEventAttendance({ event = {}, participants = [], team = [], places = [] } = {}) {
  event = event || {};
  const warnings = new Set();
  let complete = true;
  const warn = (message, incomplete = false) => { warnings.add(message); if (incomplete) complete = false; };
  const registrations = rows(participants), individuals = registrations.filter(row => !isGroup(row));
  const groups = registrations.filter(isGroup), byRegistration = new Map(), byStudent = new Map(), namesToIds = new Map();
  for (const row of individuals) {
    addIndex(byRegistration, text(row.id || row.participanteId), row);
    addIndex(byStudent, text(row.studentId), row);
  }
  for (const row of [...individuals, ...groups.flatMap(group => memberRows(group.integrantes))]) {
    const sid = text(row.studentId), name = norm(nameOf(row));
    if (sid && name) { if (!namesToIds.has(name)) namesToIds.set(name, new Set()); namesToIds.get(name).add(sid); }
  }
  function studentKey(row, fallback) {
    if (text(row.studentId)) return 'student:' + text(row.studentId);
    const name = norm(nameOf(row)), known = namesToIds.get(name);
    if (known?.size === 1) return 'student:' + [...known][0];
    if (known?.size > 1) {
      warn(`Hay homónimos de ${nameOf(row)} sin una identidad inequívoca. Revisa sus inscripciones.`, true);
      return 'registration:' + (text(row.id || row.participanteId) || fallback);
    }
    if (name) return 'name:' + name;
    warn('Hay una inscripción o un integrante sin nombre ni identidad para el aforo.', true);
    return 'registration:' + (text(row.id || row.participanteId) || fallback);
  }
  function guestCount(row) {
    if (row.tieneInvitados === false) return 0;
    const quantity = integer(row.invitadosCantidad);
    if (row.invitadosCantidad !== '' && row.invitadosCantidad != null && quantity === null) warn(`Revisa la cantidad de invitados de ${nameOf(row) || 'una inscripción'}.`, true);
    if (row.tieneInvitados === true && quantity === null) warn(`Falta la cantidad de invitados de ${nameOf(row) || 'una inscripción'}.`, true);
    return quantity ?? 0;
  }
  const students = new Map();
  function contribute(key, name, status, guests = 0) {
    if (status === 'excluded') return;
    let person = students.get(key);
    if (!person) { person = { id:key, nombre:name || 'Estudiante sin nombre', status, guestsConfirmed:0, guestsProjected:0 }; students.set(key, person); }
    if (status === 'confirmed') { person.status = 'confirmed'; person.guestsConfirmed = Math.max(person.guestsConfirmed, guests); }
    person.guestsProjected = Math.max(person.guestsProjected, guests);
  }
  individuals.forEach((row, index) => {
    const status = participantStatus(row);
    if (status !== 'excluded') contribute(studentKey(row, `individual:${index}`), nameOf(row), status, guestCount(row));
  });

  // Guest totals entered on an ensemble are an envelope for its members' guests,
  // rather than another copy of every individual's invitation.
  const guestGroups = [];
  groups.forEach((group, groupIndex) => {
    const groupStatus = participantStatus(group);
    if (groupStatus === 'excluded') return;
    const members = memberRows(group.integrantes), keys = [], statuses = [];
    let linkedMembers = false;
    if (!members.length) warn(`Faltan los integrantes de ${nameOf(group) || 'un grupo'}: no se supone que el grupo sea una sola persona.`, true);
    members.forEach((member, memberIndex) => {
      let targets = [];
      const pointer = text(member.participanteId), sid = text(member.studentId);
      if (pointer && byRegistration.get(pointer)?.length === 1) {
        const target = byRegistration.get(pointer)[0];
        if (sid && text(target.studentId) && sid !== text(target.studentId)) warn(`Un integrante de ${nameOf(group) || 'un ensamble'} tiene identificadores de estudiante contradictorios.`, true);
        else targets = [target];
      }
      if (!targets.length && sid) targets = byStudent.get(sid) || [];
      if (!targets.length && !pointer) {
        const ids = namesToIds.get(norm(nameOf(member)));
        if (ids?.size === 1) targets = byStudent.get([...ids][0]) || [];
      }
      const source = targets[0] || member;
      const status = targets.length ? strongestStatus(targets.map(participantStatus)) : (member.invitacionEstado || member.estadoAsistencia || member.estado ? participantStatus(member) : groupStatus);
      const key = studentKey({ ...source, studentId:sid || source.studentId, nombre:nameOf(member) || nameOf(source) }, `group:${groupIndex}:${memberIndex}`);
      if (targets.length) linkedMembers = true;
      else if (groupStatus === 'confirmed') warn(`La confirmación de ${nameOf(group) || 'un ensamble'} se aplica a sus integrantes sin inscripción individual.`, false);
      if (status !== 'excluded') { keys.push(key); statuses.push(status); contribute(key, nameOf(member) || nameOf(source), status); }
    });
    const guests = guestCount(group);
    const effectiveStatus = members.length && !statuses.length ? 'excluded' : groupStatus === 'confirmed' && statuses.some(status => status !== 'confirmed') ? 'pending' : groupStatus;
    if (groupStatus === 'confirmed' && statuses.includes('pending')) warn(`La invitación de ${nameOf(group) || 'un ensamble'} está aceptada, pero hay integrantes con asistencia individual pendiente.`, true);
    if (groupStatus === 'confirmed' && members.length && statuses.length < members.length) warn(`Revisa los integrantes de ${nameOf(group) || 'un ensamble'}: hay una asistencia individual descartada aunque el grupo figura aceptado.`, true);
    if (guests > 0 && linkedMembers) warn(`Los invitados de ${nameOf(group) || 'un ensamble'} se toman como total del grupo, sin sumarlos otra vez a los invitados de sus integrantes. Revisa si son personas distintas.`, true);
    guestGroups.push({ keys:[...new Set(keys)], guests:effectiveStatus==='excluded'?0:guests, status:effectiveStatus, id:`group:${groupIndex}` });
  });

  // Connected ensembles can share students and therefore share the same guest pool.
  const parent = new Map([...students.keys()].map(key => [key,key]));
  const find = key => { if (!parent.has(key)) parent.set(key,key); let current=key; while (parent.get(current)!==current) current=parent.get(current); return current; };
  const union = (left,right) => { const a=find(left), b=find(right); if(a!==b) parent.set(b,a); };
  guestGroups.forEach(group => group.keys.slice(1).forEach(key => union(group.keys[0],key)));
  const pools = new Map();
  function poolFor(key) { const root=find(key); if(!pools.has(root)) pools.set(root,{individualConfirmed:0,individualProjected:0,groupConfirmed:0,groupProjected:0}); return pools.get(root); }
  for (const person of students.values()) { const pool=poolFor(person.id); pool.individualConfirmed+=person.guestsConfirmed; pool.individualProjected+=person.guestsProjected; }
  for (const group of guestGroups) {
    const pool=poolFor(group.keys[0] || group.id);
    if(group.status==='confirmed') pool.groupConfirmed=Math.max(pool.groupConfirmed,group.guests);
    pool.groupProjected=Math.max(pool.groupProjected,group.guests);
  }
  let invitadosRegistrados=0, projectedGuests=0;
  for(const pool of pools.values()) { invitadosRegistrados+=Math.max(pool.individualConfirmed,pool.groupConfirmed); projectedGuests+=Math.max(pool.individualProjected,pool.groupProjected); }

  const activeTeam = rows(team).filter(row => teamStatus(row)!=='excluded');
  const teamNames = new Map();
  for(const row of activeTeam) { const name=norm(nameOf(row)); const id=text(row.studentId || row.personaId || row.personId || row.email); if(name&&id) { if(!teamNames.has(name))teamNames.set(name,new Set());teamNames.get(name).add(id); } }
  const studentsByName = new Map();
  for(const student of students.values()) addIndex(studentsByName,norm(student.nombre),student);
  const staff = new Map();
  activeTeam.forEach((row,index)=>{
    const name=nameOf(row), normalized=norm(name), sid=text(row.studentId);
    const matches=studentsByName.get(normalized) || [];
    let key=sid?'student:'+sid:'';
    if(!key && matches.length===1 && (teamNames.get(normalized)?.size || 0)<2) key=matches[0].id;
    if(!key) key=text(row.personaId || row.personId)?'person:'+text(row.personaId || row.personId):text(row.email)?'email:'+norm(row.email):normalized?'name:'+normalized:'team:'+index;
    if(matches.length>1 && !sid) warn(`Revisa si ${name || 'una persona del equipo'} corresponde a alguno de los estudiantes con el mismo nombre.`,true);
    const old=staff.get(key), status=teamStatus(row);
    if(!old || status==='confirmed') staff.set(key,{id:key,nombre:name || 'Integrante sin nombre',status});
  });
  const confirmedStudents=[...students.values()].filter(person=>person.status==='confirmed');
  const confirmedStudentIds=new Set(confirmedStudents.map(person=>person.id));
  const confirmedStaff=[...staff.values()].filter(person=>person.status==='confirmed'&&!confirmedStudentIds.has(person.id));
  const confirmedIds=new Set([...confirmedStudentIds,...confirmedStaff.map(person=>person.id)]);
  const pendingStudents=[...students.values()].filter(person=>person.status==='pending'&&!confirmedIds.has(person.id));
  const pendingStudentIds=new Set(pendingStudents.map(person=>person.id));
  const pendingStaff=[...staff.values()].filter(person=>person.status==='pending'&&!confirmedIds.has(person.id)&&!pendingStudentIds.has(person.id));

  const publicoAdicionalValue=integer(event.publicoAdicionalCantidad), publicoAdicional=publicoAdicionalValue??0;
  if(publicoAdicionalValue===null) warn('Falta indicar el público adicional confirmado; la descripción de público no permite calcular una cantidad.',true);
  const estudiantes=confirmedStudents.length, equipo=confirmedStaff.length;
  const totalPersonas=estudiantes+equipo+invitadosRegistrados+publicoAdicional;
  const sillasManual=integer(event.sillasCantidad);
  const sillasModo=event.sillasModo==='automatico'?'automatico':event.sillasModo==='manual'||sillasManual!==null?'manual':'automatico';
  const sillasTotal=sillasModo==='automatico'?totalPersonas:sillasManual;
  const sillasFaltantes=sillasTotal===null?null:Math.max(0,totalPersonas-sillasTotal);
  if(sillasModo==='manual'&&sillasTotal===null)warn('Falta indicar la cantidad manual de sillas.',true);
  if(sillasFaltantes)warn(`La cantidad manual deja ${sillasFaltantes} persona(s) confirmada(s) sin silla.`);
  const pendingGuests=Math.max(0,projectedGuests-invitadosRegistrados);
  const pendingPeople=pendingStudents.length+pendingStaff.length+pendingGuests;
  const matches=rows(places).filter(place=>text(event.lugarId)?text(place.id)===text(event.lugarId):norm(event.lugar)&&norm(place.nombre)===norm(event.lugar));
  const capacidadLugar=matches.length===1?integer(matches[0].capacidad):null;
  if(matches.length>1)warn('Hay varios lugares con el mismo nombre; revisa cuál corresponde antes de usar su capacidad.',true);
  const excesoCapacidad=capacidadLugar===null?0:Math.max(0,Math.max(totalPersonas,sillasTotal??0)-capacidadLugar);
  if(excesoCapacidad)warn(`El montaje supera la capacidad sentada del lugar en ${excesoCapacidad} persona(s) o silla(s).`);
  return { estudiantes,equipo,invitadosRegistrados,publicoAdicional,totalPersonas,sillasSugeridas:totalPersonas,sillasTotal,sillasModo,sillasManual,sillasFaltantes,
    pendientes:{estudiantes:pendingStudents.length,equipo:pendingStaff.length,invitados:pendingGuests,personas:pendingPeople,sillasProyectadas:totalPersonas+pendingPeople},
    personasConfirmadas:{estudiantes:confirmedStudents.map(({id,nombre})=>({id,nombre})),equipo:confirmedStaff.map(({id,nombre})=>({id,nombre}))},
    presentacionesConfirmadas:registrations.filter(row=>participantStatus(row)==='confirmed').length,
    warnings:[...warnings],complete,capacidadLugar,excesoCapacidad,publicoAdicionalDefinido:publicoAdicionalValue!==null };
}
