import {db,collection,doc,onSnapshot,runTransaction,getDocsFromServer,query,orderBy,serverTimestamp} from './firebase-config.js?v=20261011-docentes';

const STAGES=[['audio','Audio'],['video','Video'],['recital','Recital'],['grande','Presentación grande']];
const STATES=['Pendiente','En preparación','Completada'];
const AREAS=[['musica','Música'],['danza','Danza / Baile'],['teatro','Teatro'],['artes-plasticas','Artes plásticas']];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const today=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');};
const blank=()=>({estado:'Pendiente',fecha:'',docente:'',evidencia:'',notas:'',excepcion:'',eventoId:''});
const areaName=id=>AREAS.find(a=>a[0]===id)?.[1]||id;
const idsOf=row=>[...(Array.isArray(row?.rutasMuestraIds)?row.rutasMuestraIds:[]),...(row?.procesoMuestraId?[row.procesoMuestraId]:[])];

export function createSampleRoutes({user,students,participants,event,setModal,modalForm,modal,toast,onChange}){
  let routes=[],unsub=null,loadTimer=null,ready=false,readError='',selectedStudent='',selectedArea='musica',context=null,searchText='',showDeleted=false;
  function choices(){
    const map=new Map();
    const add=(id,name)=>{if(typeof id==='string'&&id.trim()&&typeof name==='string'&&name.trim())map.set(id.trim(),{studentId:id.trim(),nombre:name.trim()});};
    participants().forEach(row=>{if(Array.isArray(row.integrantes)&&row.integrantes.length)row.integrantes.forEach(m=>add(m.studentId,m.nombre));else add(row.studentId,row.estudianteGrupo);});
    routes.forEach(row=>add(row.studentId,row.studentName));
    students().forEach(s=>add(s.studentId,s.nombre));
    return [...map.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  }
  function resolveStudent(row){
    if(row?.studentId)return row.studentId;
    const matches=choices().filter(s=>norm(s.nombre)===norm(row?.nombre||row?.estudianteGrupo));
    return matches.length===1?matches[0].studentId:'';
  }
  function forStudent(id,area){return routes.filter(r=>r.studentId===id&&r.areaId===area&&!r.eliminado);}
  function accumulated(id,area){
    const records=forStudent(id,area),etapas={},sources={};
    for(const [key] of STAGES){const ranked=[...records].sort((a,b)=>STATES.indexOf(b.etapas?.[key]?.estado)-STATES.indexOf(a.etapas?.[key]?.estado)||String(b.etapas?.[key]?.fecha||'').localeCompare(String(a.etapas?.[key]?.fecha||''))||a.id.localeCompare(b.id));sources[key]=ranked[0];etapas[key]=ranked[0]?.etapas?.[key]||blank();}
    return {etapas,sources,records};
  }
  function routeSummary(route){
    const completed=STAGES.filter(([key])=>route.etapas?.[key]?.estado==='Completada');
    const next=STAGES.find(([key])=>route.etapas?.[key]?.estado!=='Completada');
    return '<div>'+STAGES.map(([key,label])=>(route.etapas?.[key]?.estado==='Completada'?'✅':route.etapas?.[key]?.estado==='En preparación'?'⏳':'○')+' '+label).join(' · ')+'</div><small>'+completed.length+'/4 experiencias realizadas · '+(next?'Siguiente: '+esc(next[1]):'Ya realizó las cuatro etapas')+'</small>';
  }
  function summary(student,area){
    if(!ready)return '<span class="field-hint">'+esc(readError||'Cargando trayectoria de muestras…')+'</span>';
    const id=resolveStudent(student);if(!id)return '<span class="field-hint">Identidad del estudiante por confirmar</span>';
    return '<div class="field-hint">'+routeSummary(accumulated(id,area))+'</div>';
  }
  function start(){stop();loadTimer=setTimeout(()=>{if(!ready){readError='La conexión está tardando. Puedes reintentar la carga sin cerrar el panel.';refresh();}},15000);unsub=onSnapshot(collection(db,'rutasMuestras'),snapshot=>{routes=snapshot.docs.map(d=>({id:d.id,...d.data()}));ready=true;readError='';onChange();refresh();},error=>{console.error(error);ready=false;readError='No se pudo leer la ruta. Revisa la conexión o vuelve a ingresar.';onChange();refresh();});}
  function stop(){clearTimeout(loadTimer);unsub?.();unsub=null;routes=[];ready=false;readError='';context=null;}
  function refresh(){if(modal.open&&modalForm.querySelector('[data-route-student]'))overview();}
  function open(row=null){
    searchText='';showDeleted=false;
    context=row?.id&&event()?.id?{eventId:event().id,rowId:row.id,row,stage:event().etapaRutaMuestra||'',title:event().titulo}:null;
    selectedStudent=resolveStudent(row)||selectedStudent||choices()[0]?.studentId||'';
    selectedArea=row?.areaArtisticaId||selectedArea;
    overview();
  }
  function overview(){
    const people=choices(), student=people.find(p=>p.studentId===selectedStudent);
    const selected=routes.filter(r=>Boolean(r.eliminado)===showDeleted&&r.studentId===selectedStudent&&r.areaId===selectedArea).sort((a,b)=>Number(a.cerrado)-Number(b.cerrado)||String(b.createdDate).localeCompare(String(a.createdDate)));
    const trajectory=accumulated(selectedStudent,selectedArea);
    const cards=showDeleted?selected:trajectory.records;
    setModal(`<h3>Trayectoria del estudiante</h3><p>Audio → Video → Recital → Presentación grande. Importa haber realizado cada etapa al menos una vez. Pueden ser obras diferentes y el avance no se reinicia al cambiar de canción.</p><div class="form-grid"><label>Buscar estudiante<input type="search" data-route-search value="${esc(searchText)}" placeholder="Escribe parte del nombre" /></label><label>Estudiante<select data-route-student><option value="">Selecciona un estudiante</option>${people.filter(p=>!searchText||norm(p.nombre).includes(norm(searchText))||p.studentId===selectedStudent).map(p=>'<option value="'+esc(p.studentId)+'" '+(p.studentId===selectedStudent?'selected':'')+'>'+esc(p.nombre)+'</option>').join('')}</select></label><label>Área artística<select data-route-area>${AREAS.map(([id,label])=>'<option value="'+id+'" '+(id===selectedArea?'selected':'')+'>'+label+'</option>').join('')}</select></label></div>${!ready?'<p role="alert">'+esc(readError||'Cargando trayectoria…')+'</p><button type="button" data-route-retry>Reintentar carga</button>':''}${!showDeleted?'<article class="info-box" style="padding:16px;margin:20px 0"><h4>Avance acumulado · '+esc(areaName(selectedArea))+'</h4>'+routeSummary(trajectory)+'<p>La obra puede ser distinta en cada etapa. Registra la fecha, el docente y, si la tienes, una evidencia.</p><div class="actions">'+STAGES.map(([key,label])=>'<button type="button" class="small-btn" data-trajectory-stage="'+key+'" '+(!ready||!student?'disabled':'')+'>'+label+'</button>').join('')+'</div>'+((context&&['recital','grande'].includes(context.stage))?'<button type="button" class="small-btn" data-trajectory-actual>Registrar participación efectiva en este evento</button>':'')+'</article>':''}${!showDeleted&&context&&['recital','grande'].includes(context.stage)?'<button type="button" class="small-btn" data-trajectory-actual>Registrar participación efectiva en este evento</button>':''}<button type="button" class="btn btn-light" data-route-trash>${showDeleted?'Volver a trayectoria':'Papelera'}</button><details style="margin-top:20px"><summary>${showDeleted?'Registros eliminados':'Registros e historial'} (${cards.length})</summary><p>Los registros anteriores se conservan. Sus etapas completadas se incluyen en el avance acumulado; los eliminados no cuentan.</p>${cards.map(route=>'<article class="info-box" style="padding:16px;margin:12px 0"><strong>'+esc(route.nombre)+'</strong>'+routeSummary(route)+'<div class="actions"><button type="button" class="small-btn" data-route-history="'+route.id+'">Ver cambios</button><button type="button" class="small-btn" data-route-delete="'+route.id+'">'+(route.eliminado?'Restaurar registro':'Eliminar registro')+'</button></div></article>').join('')||'<p>No hay registros.</p>'}</details>`,null);
    modalForm.querySelectorAll('[data-trajectory-stage]').forEach(button=>button.onclick=async()=>{const key=button.dataset.trajectoryStage;let route=trajectory.sources[key];if(!route){await saveAction(button,async()=>{route=await createTracking(student);editStage(route,key);});}else editStage(route,key);});
    const actualButton=modalForm.querySelector('[data-trajectory-actual]');if(actualButton)actualButton.onclick=()=>saveAction(actualButton,async()=>{const key=context.stage;const route=trajectory.sources[key]||await createTracking(student);editStage(route,key,true);});
    modalForm.querySelector('[data-route-search]').oninput=e=>{searchText=e.target.value;const q=norm(searchText);const select=modalForm.querySelector('[data-route-student]');select.innerHTML='<option value="">Selecciona un estudiante</option>'+people.filter(p=>norm(p.nombre).includes(q)||p.studentId===selectedStudent).map(p=>`<option value="${esc(p.studentId)}" ${p.studentId===selectedStudent?'selected':''}>${esc(p.nombre)}</option>`).join('');};
    modalForm.querySelector('[data-route-student]').onchange=e=>{selectedStudent=e.target.value;overview();};
    modalForm.querySelector('[data-route-area]').onchange=e=>{selectedArea=e.target.value;overview();};
    const retry=modalForm.querySelector('[data-route-retry]');if(retry)retry.onclick=()=>saveAction(retry,async()=>{const snapshot=await getDocsFromServer(collection(db,'rutasMuestras'));routes=snapshot.docs.map(d=>({id:d.id,...d.data()}));ready=true;readError='';onChange();refresh();});
    modalForm.querySelector('[data-route-trash]').onclick=()=>{showDeleted=!showDeleted;overview();};
    modalForm.querySelectorAll('[data-route-delete]').forEach(button=>button.onclick=()=>{const route=routes.find(r=>r.id===button.dataset.routeDelete);if(!route)return;if(!route.eliminado&&!confirm('¿Eliminar el proceso «'+route.nombre+'» de '+route.studentName+'? Se moverá a la papelera y podrás restaurarlo.'))return;saveAction(button,async()=>{await change(route,{eliminado:!route.eliminado},route.eliminado?'Restaurar proceso':'Eliminar proceso');toast(route.eliminado?'Proceso restaurado.':'Proceso enviado a la papelera.');overview();});});

    modalForm.querySelectorAll('[data-route-stage]').forEach(button=>button.onclick=()=>editStage(routes.find(r=>r.id===button.dataset.routeId),button.dataset.routeStage));
    modalForm.querySelectorAll('[data-route-close]').forEach(button=>button.onclick=()=>saveAction(button,async()=>{const route=routes.find(r=>r.id===button.dataset.routeClose);await change(route,{cerrado:!route.cerrado},route.cerrado?'Reabrir proceso':'Cerrar proceso');overview();}));
    modalForm.querySelectorAll('[data-route-link]').forEach(button=>button.onclick=()=>saveAction(button,async()=>{await link(routes.find(r=>r.id===button.dataset.routeLink));overview();}));
    modalForm.querySelectorAll('[data-route-actual]').forEach(button=>button.onclick=()=>editStage(routes.find(r=>r.id===button.dataset.routeActual),context.stage,true));
    modalForm.querySelectorAll('[data-route-history]').forEach(button=>button.onclick=()=>history(routes.find(r=>r.id===button.dataset.routeHistory)));
  }
  async function saveAction(button,action){button.disabled=true;try{await action();}catch(error){console.error(error);toast(error.message||'No se pudo guardar.');}finally{if(button.isConnected)button.disabled=false;}}
  async function createTracking(student){
    if(!student||!ready)throw Error('Espera a que termine la carga.');
    const ref=doc(collection(db,'rutasMuestras')),actor=user()?.email;
    const data={studentId:student.studentId,studentName:student.nombre,areaId:selectedArea,nombre:'Trayectoria de muestras',cerrado:false,createdDate:today(),etapas:Object.fromEntries(STAGES.map(([key])=>[key,blank()])),revision:1,createdBy:actor,updatedBy:actor,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
    await runTransaction(db,async tx=>{tx.set(ref,data);tx.set(doc(collection(ref,'historial')),{accion:'Iniciar trayectoria',etapa:'',anterior:'',nuevo:'Trayectoria del estudiante por área; obras independientes',motivo:'',revision:1,usuario:actor,at:serverTimestamp()});});
    const route={id:ref.id,...data};routes=[...routes.filter(r=>r.id!==ref.id),route];onChange();return route;
  }
  function editStage(route,key,actual=false){
    if(!route||route.eliminado)return;const value=route.etapas[key]||blank();
    const cumulative=accumulated(route.studentId,route.areaId).etapas;
    const previous=STAGES.slice(0,STAGES.findIndex(s=>s[0]===key)).filter(([k])=>cumulative[k]?.estado!=='Completada');
    setModal(`<h3>Trayectoria · ${STAGES.find(s=>s[0]===key)[1]}</h3><p>${esc(route.studentName)} · ${esc(areaName(route.areaId))}</p>${actual?`<p class="docentes-note">Registrar que el estudiante sí participó en ${esc(context.title)}. Una inscripción por sí sola no completa esta etapa.</p>`:''}<div class="form-grid"><label>Estado<select name="estado">${STATES.map(s=>`<option ${s===(actual?'Completada':value.estado)?'selected':''}>${s}</option>`).join('')}</select></label><label>Fecha<input type="date" name="fecha" max="${today()}" value="${esc(actual?today():value.fecha)}" /></label><label class="wide">Docente que registra o acompaña<input name="docente" maxlength="160" list="docentesDisponibles" value="${esc(value.docente||context?.row.docente||'')}" /></label><label class="wide">Evidencia (opcional)<input type="url" name="evidencia" maxlength="1000" value="${esc(value.evidencia)}" placeholder="https://…" /></label><label class="wide">Obra o actividad realizada y observaciones (opcional)<textarea name="notas" maxlength="1500">${esc(value.notas)}</textarea></label><label class="wide">Motivo de excepción, si se omiten etapas<textarea name="excepcion" maxlength="1000" placeholder="${esc(previous.length?'Faltan: '+previous.map(s=>s[1]).join(', '):'No hay etapas previas pendientes')}">${esc(value.excepcion)}</textarea></label></div><p id="routeResult" role="status"></p>`,'Guardar etapa');
    modalForm.onsubmit=async e=>{e.preventDefault();const button=modalForm.querySelector('[type="submit"]');button.disabled=true;try{
      const form=new FormData(modalForm),next=Object.fromEntries(['estado','fecha','docente','evidencia','notas','excepcion'].map(k=>[k,String(form.get(k)||'').trim()]));next.eventoId=actual?context.eventId:value.eventoId||'';
      if(next.estado==='Completada'&&(!next.fecha||!next.docente))throw Error('Para completar una etapa indica la fecha y el docente.');
      if(next.fecha&&next.fecha>today())throw Error('La fecha del avance no puede estar en el futuro.');
      if(next.evidencia&&!/^https?:\/\/[^\s]+$/i.test(next.evidencia))throw Error('La evidencia debe ser un enlace http o https.');
      if(next.estado==='Completada'&&previous.length&&!next.excepcion)throw Error('Completa las etapas previas o explica el motivo de excepción.');
      const outOfOrder=STAGES.slice(0,STAGES.findIndex(s=>s[0]===key)).some(([k])=>cumulative[k]?.estado==='Completada'&&cumulative[k].fecha>next.fecha);
      if(next.estado==='Completada'&&outOfOrder&&!next.excepcion)throw Error('La fecha es anterior a una etapa previa. Corrígela o explica el motivo de excepción.');
      await change(route,{etapas:{...route.etapas,[key]:next},cerrado:false},actual?'Registrar participación efectiva':'Actualizar etapa',key,value,next,next.excepcion,actual);toast('Etapa guardada en la trayectoria del estudiante.');overview();
    }catch(error){console.error(error);modalForm.querySelector('#routeResult').textContent=error.message||'No se pudo guardar.';}finally{if(button.isConnected)button.disabled=false;}};
  }
  function validateLink(row,route){
    if((row.areaArtisticaId||'musica')!==route.areaId)throw Error('El proceso y la inscripción deben pertenecer a la misma área.');
    const members=Array.isArray(row.integrantes)&&row.integrantes.length?row.integrantes:[{studentId:row.studentId,nombre:row.estudianteGrupo}];
    if(!members.some(member=>resolveStudent(member)===route.studentId))throw Error('El estudiante no coincide con esta inscripción. Revisa su identidad o el integrante del ensamble.');
  }
  async function change(route,changes,action,stage='',before='',after='',reason='',actual=false){
    const ref=doc(db,'rutasMuestras',route.id),actor=user()?.email,ctx=context?{...context}:null;
    await runTransaction(db,async tx=>{
      const current=await tx.get(ref);if(!current.exists()||current.data().revision!==route.revision)throw Error('El proceso cambió en otra ventana. Cierra y vuelve a abrir la ruta antes de guardar.');
      let rowRef,row;
      if(actual){rowRef=doc(db,'eventos',ctx.eventId,'muestras',ctx.rowId);const [snapshot,eventSnap]=await Promise.all([tx.get(rowRef),tx.get(doc(db,'eventos',ctx.eventId))]);if(!snapshot.exists()||!eventSnap.exists()||eventSnap.data().etapaRutaMuestra!==stage)throw Error('La inscripción o la etapa del evento cambió. Vuelve a abrir la ruta.');row=snapshot.data();validateLink(row,route);if(String(eventSnap.data().fechaInicio||'')>today())throw Error('El evento está programado para una fecha futura. Registra la participación efectiva después de realizarse.');if(['Cancelado','Cancelada'].includes(row.estado)||eventSnap.data().estado==='No realizado')throw Error('No se puede registrar una participación efectiva cancelada.');}
      const revision=route.revision+1;tx.update(ref,{...changes,revision,updatedBy:actor,updatedAt:serverTimestamp()});
      tx.set(doc(collection(ref,'historial')),{accion:action,etapa:stage,anterior:typeof before==='string'?before:JSON.stringify(before),nuevo:typeof after==='string'?after:JSON.stringify(after),motivo:reason,revision,usuario:actor,at:serverTimestamp()});
      if(actual)tx.update(rowRef,{rutasMuestraIds:[...new Set([...idsOf(row),route.id])],updatedBy:actor,updatedAt:serverTimestamp()});
    });
    if(actual&&context?.eventId===ctx.eventId&&context?.rowId===ctx.rowId)context.row={...context.row,rutasMuestraIds:[...new Set([...idsOf(context.row),route.id])]};
    routes=routes.map(r=>r.id===route.id?{...r,...changes,revision:r.revision+1}:r);onChange();
  }
  async function link(route){
    const ctx={...context},rowRef=doc(db,'eventos',ctx.eventId,'muestras',ctx.rowId);let next;
    await runTransaction(db,async tx=>{const [rowSnap,routeSnap]=await Promise.all([tx.get(rowRef),tx.get(doc(db,'rutasMuestras',route.id))]);if(!rowSnap.exists()||!routeSnap.exists()||(routeSnap.data().cerrado||routeSnap.data().eliminado))throw Error('La inscripción o el proceso cambió.');const row=rowSnap.data();validateLink(row,routeSnap.data());const current=idsOf(row);next=current.includes(route.id)?current.filter(id=>id!==route.id):[...new Set([...current,route.id])];tx.update(rowRef,{rutasMuestraIds:next,procesoMuestraId:'',updatedAt:serverTimestamp(),updatedBy:user().email});});
    context.row={...context.row,rutasMuestraIds:next,procesoMuestraId:''};toast('Vínculo del proceso actualizado. No se completó ninguna etapa.');
  }
  function auditDetails(value){
    if(!value)return '';
    let data;try{data=JSON.parse(value);}catch{return '<p>'+esc(value)+'</p>';}
    if(!data||typeof data!=='object')return '<p>'+esc(value)+'</p>';
    return [['estado','Estado'],['fecha','Fecha'],['docente','Docente'],['notas','Observación'],['excepcion','Motivo de excepción']].filter(([key])=>data[key]).map(([key,label])=>'<p><strong>'+label+':</strong> '+esc(data[key])+'</p>').join('')+(data.evidencia?'<p><strong>Evidencia:</strong> '+esc(data.evidencia)+'</p>':'');
  }
  async function history(route){
    setModal('<h3>Historial de cambios del proceso</h3><p>Cargando…</p>',null);
    try{const snapshots=await getDocsFromServer(query(collection(db,'rutasMuestras',route.id,'historial'),orderBy('at','desc')));setModal(`<h3>${esc(route.nombre)} · Historial de cambios</h3><p>${esc(route.studentName)} · ${esc(areaName(route.areaId))}</p>${snapshots.docs.map(snapshot=>{const item=snapshot.data();return `<article class="info-box"><strong>${esc(item.accion)}${item.etapa?' · '+esc(STAGES.find(s=>s[0]===item.etapa)?.[1]||item.etapa):''}</strong><p>${esc(item.usuario)}</p><p>${esc(item.at?.toDate?.().toLocaleString('es-CO',{timeZone:'America/Bogota'})||'')}</p>${item.nuevo?`<details><summary>Ver cambio registrado</summary>${item.anterior?`<h4>Antes</h4>${auditDetails(item.anterior)}`:""}<h4>Después</h4>${auditDetails(item.nuevo)}</details>`:''}</article>`;}).join('')||'<p>No hay cambios registrados.</p>'}<button type="button" class="btn btn-light" data-route-back>Volver al proceso</button>`,null);modalForm.querySelector('[data-route-back]').onclick=overview;}catch(error){console.error(error);toast('No se pudo leer el historial.');overview();}
  }
  return {start,stop,open,summary,refresh};
}
