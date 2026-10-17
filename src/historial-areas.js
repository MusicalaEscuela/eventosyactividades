// Artistic history supplements RIP; it never changes the source roster or status.
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const text=value=>typeof value==='string'?value.trim():'';
const cancelled=row=>['cancelado','cancelada','no realizado','no realizada'].includes(norm(row?.estado));
const areaOf=row=>{
  if(['musica','danza','teatro','artes-plasticas'].includes(row.areaArtisticaId))return row.areaArtisticaId;
  const area=norm(row.area);
  if(/danza|baile|ballet/.test(area))return 'danza';
  if(/teatro/.test(area))return 'teatro';
  if(/plastica|artes manuales|artes visuales/.test(area))return 'artes-plasticas';
  if(area==='musica')return 'musica';
  return '';
};

export function buildArtisticHistory({students=[],participants=[],events=[]}={}){
  const byId=new Map(), byName=new Map(), eventById=new Map(events.map(e=>[e.id,e])), records=new Map();
  for(const student of students){
    const id=text(student.studentId), name=norm(student.nombre);
    if(id)byId.set(id,student);
    if(name){const matches=byName.get(name)||[];matches.push(student);byName.set(name,matches);}
  }
  for(const row of participants){const event=text(row.eventoId||row.eventId), id=text(row.muestraId||row.id);if(event&&id)records.set(JSON.stringify([event,id]),row);}
  const resolve=person=>{
    const id=text(person.studentId);
    // An explicit different ID never falls back to a matching name.
    if(id)return byId.get(id)||null;
    const matches=byName.get(norm(person.nombre||person.estudianteGrupo||person.estudiante))||[];
    return matches.length===1?matches[0]:null;
  };
  const history=new Map();
  const uniqueRows=[...records.values(),...participants.filter(row=>!text(row.muestraId||row.id))];
  for(const row of uniqueRows){
    const eventId=text(row.eventoId||row.eventId), event=eventById.get(eventId);
    if(cancelled(row)||cancelled(event))continue;
    const area=areaOf(row);if(!area)continue;
    const members=Array.isArray(row.integrantes)&&row.integrantes.length?row.integrantes:[row];
    for(const member of members){
      const linked=member.participanteId?records.get(JSON.stringify([eventId,text(member.participanteId)])):null;
      const student=member.studentId?resolve(member):linked?resolve(linked):resolve(member);
      if(!student)continue;
      const key=text(student.studentId)||norm(student.nombre);
      if(!history.has(key))history.set(key,[]);
      const modality=text(row.modalidadPresentacionId||row.familiaInstrumentalId);
      const entries=history.get(key);
      if(!entries.some(e=>e.area===area&&e.modality===modality))entries.push({area,modality});
    }
  }
  return history;
}
