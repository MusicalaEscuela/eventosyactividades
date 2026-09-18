import {db,doc,collection,onSnapshot,query,orderBy,limit,runTransaction,serverTimestamp} from './firebase-config.js';
import {defaults,DAYS,calendar,activeFamilies,capacity,capacityRows,validate,validateDates,minutes,time,eventId} from './muestras-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
const labels={descripcion:'Principio general',agrupacion:'Agrupación técnica',ciclos:'Calendario',distribucion:'Distribución semanal',bloques:'Bloques horarios',pausa:'Pausa técnica',politica:'Política de presentación',capacidad:'Capacidad y ampliación',decisiones:'Decisiones y criterios'};
const rules={pascua:'Semana anterior a Semana Santa (Domingo de Ramos)',ultima:'Última semana completa del mes',numero:'Semana completa número… del mes',sabado:'Semana que termina en el primer sábado del mes'};
const stamp=user=>({updatedAt:serverTimestamp(),updatedBy:user.email});
const revision=s=>s.data()?.revision||0;
const summary=(key,v)=>{
  if(key==='distribucion') return v.map(x=>`${x.nombre}: ${DAYS[x.dia]}, orden ${x.orden}, ${x.activo?'activo':'inactivo'}; ${x.instrumentos}; ${x.descripcion}`).join(' | ');
  if(key==='bloques') return v.map(x=>`${x.nombre}: ${x.hora}, ${x.duracion} min, ${x.cupo} cupos`).join(' | ');
  return typeof v==='string'?v:JSON.stringify(v);
};
export function createAnnualSystem({root,user,toast,onChange,events}) {
  let config=defaults(),ready=false,error='',year=2026,yearData=null,yearReady=false,yearError='',history=[],edit=null,dateDraft=null,busy=false,unsubs=[],unsubYear=null,yearToken=0,yearBaseRevision=0,operationError='';
  const ref=doc(db,'configuracion','muestrasProceso');
  const yearRef=y=>doc(db,'configuracion','muestrasProceso','anios',String(y));
  const logRef=()=>doc(collection(db,'configuracion','muestrasProceso','historial'));
  const log=(tx,section,before,after)=>tx.set(logRef(),{fecha:serverTimestamp(),usuario:user().email,seccion:section,anterior:before,nuevo:after});
  function effective() {const computed=calendar(year,config);return computed.map(r=>({...r,...(yearData?.fechasCalculadas||[]).find(x=>x.id===r.id),...(yearData?.fechasModificadas||[]).find(x=>x.id===r.id)}));}
  function listenYear() {
    unsubYear?.(); const token=++yearToken; yearData=null;yearReady=false;yearError='';dateDraft=null;
    unsubYear=onSnapshot(yearRef(year),s=>{if(token!==yearToken)return;yearData=s.exists()?s.data():null;yearReady=true;render();},e=>{if(token!==yearToken)return;yearError=e.message;render();});
  }
  function start() {
    stop();
    unsubs.push(onSnapshot(ref,s=>{config=s.exists()?{...defaults(),...s.data()}:defaults();ready=true;error='';onChange();render();},e=>{error=`No se pudo leer la configuración: ${e.message}`;ready=false;render();onChange();}));
    unsubs.push(onSnapshot(query(collection(db,'configuracion','muestrasProceso','historial'),orderBy('fecha','desc'),limit(30)),s=>{history=s.docs.map(d=>d.data());render();},e=>{history=[{seccion:'No se pudo cargar el historial',nuevo:e.message}];render();}));
    listenYear();
  }
  function stop(){unsubs.forEach(f=>f());unsubs=[];unsubYear?.();unsubYear=null;yearToken++;ready=false;yearReady=false;config=defaults();yearData=null;history=[];edit=null;dateDraft=null;root.innerHTML='';}
  function familyField(row={}) {
    const selected=row.familiaInstrumentalId||'';
    const options=activeFamilies(config);
    if(selected&&!options.some(f=>f.id===selected)) options.push({id:selected,nombre:(row.familiaInstrumentalNombre||selected)+' (anterior / inactiva)'});
    return `<label>Familia instrumental / tipo de presentación<select name="familiaInstrumentalId"><option value="">Sin asignar</option>${options.map(f=>`<option value="${esc(f.id)}" ${selected===f.id?'selected':''}>${esc(f.nombre)}</option>`).join('')}</select><span class="field-hint">${ready?'Opciones del Sistema anual de muestras.':'Configuración pendiente de lectura; verifica la familia antes de guardar.'}</span></label>`;
  }
  function familyName(id,fallback=''){return config.distribucion.find(f=>f.id===id)?.nombre||fallback;}
  function panel(rows) {
    if(!ready)return `<section class="panel"><h3>Capacidad por jornada</h3><p>${esc(error||'Cargando configuración anual…')}</p></section>`;
    const result=capacityRows(config,rows),overflow=result.rows.filter(r=>r.extra>0).length;
    return `<section class="panel annual-capacity"><h3>Capacidad por jornada</h3><p class="muted">Cada registro es una presentación; un ensamble ocupa un cupo. El seguimiento individual de sus integrantes se conserva.</p>
    <div class="table-panel"><table><thead><tr><th>Día</th><th>Familia</th><th>Inscritos</th><th>Capacidad</th><th>Estado</th></tr></thead><tbody>${result.rows.map(r=>`<tr><td>${DAYS[r.dia]}</td><td>${esc(r.emoji)} ${esc(r.nombre)}</td><td>${r.count}</td><td>${r.cap}</td><td><span class="badge ${r.extra?'danger':r.status==='Disponible'?'success':'warning'}">${r.extra?'🔴':r.status==='Disponible'?'🟢':'🟡'} ${r.status}</span> ${r.extra?`${r.extra} jornada(s) adicional(es), preferiblemente ${DAYS[r.dia]}`:`${r.remaining} cupos disponibles`}</td></tr>`).join('')}</tbody></table></div>
    ${result.unassigned?`<p class="annual-notice">${result.unassigned} presentación(es) sin familia activa asignada. Asígnalas desde Participantes para completar este conteo.</p>`:''}
    ${overflow>=config.capacidad.umbral?'<p class="annual-notice">Se recomienda activar una segunda semana completa de Muestras de Proceso.</p>':''}<p class="field-hint">${esc(config.capacidad.descripcion)}</p></section>`;
  }
  const button=(act,text,disabled=false)=>`<button type="button" class="btn btn-light" data-annual="${act}" ${disabled?'disabled':''}>${text}</button>`;
  function render() {
    if(root.classList.contains('hidden'))return;
    const c=config,p=c.politica,cap=capacity(c),dates=dateDraft||effective();
    root.innerHTML=`<div class="annual-guide" ${busy?'aria-busy="true"':''}>
      <section class="panel annual-intro"><p class="eyebrow">Guía operativa institucional · ${c.ciclos.length} ciclos</p><h3>Muestras de Proceso Musicala</h3><p>${esc(c.descripcion)}</p><div class="actions">${button('edit','✏️ Editar configuración',!ready||busy||!!dateDraft)}${button('back','Volver a eventos',busy)}</div>${error?`<p role="alert">${esc(error)}</p>`:!ready?'<p>Cargando configuración…</p>':''}${ready&&!c.revision?'<p class="field-hint">Valores iniciales de consulta. Guarda la configuración para institucionalizarlos en Firestore.</p>':''}</section>
      ${operationError?`<p class="annual-notice" role="alert">${esc(operationError)}</p>`:''}${edit?editor():''}
      <section class="panel"><div class="row-between"><h3>Próxima estructura anual</h3><label>Año<input id="annualYear" list="annualYears" type="number" min="1583" max="4099" value="${year}" ${busy||edit||dateDraft?'disabled':''}><datalist id="annualYears">${Array.from({length:15},(_,i)=>`<option value="${2026+i}"></option>`).join('')}</datalist></label></div>
      <div class="actions">${button('calculate','Calcular calendario del año',!ready||!yearReady||busy||!!edit)}${button('dates','Editar fechas',!ready||!yearReady||busy||!!edit)}${button('saveDates','Guardar',!dateDraft||busy)}${button('restoreDates','Restaurar fechas calculadas',!yearReady||!ready||busy||!!edit)}${dateDraft?button('cancelDates','Cancelar edición de fechas',busy):''}</div>
      <p class="field-hint">Semanas de lunes a sábado. Semana Santa comienza el Domingo de Ramos. Las reglas calculadas y los ajustes manuales se guardan por año.</p>
      ${yearError?`<p role="alert">No se pudo leer este año: ${esc(yearError)}</p>`:!yearReady?'<p>Cargando calendario guardado…</p>':''}
      <div class="annual-cycles">${c.ciclos.map((cycle,i)=>{const d=dates.find(r=>r.id===cycle.id);return `<article class="annual-card"><span class="eyebrow">Muestra ${i+1} · ${year}</span><h4>${esc(cycle.nombre)}</h4><p>${esc(ruleText(cycle))}</p>${dateDraft?`<label>Inicio<input type="date" data-date="${esc(cycle.id)}" data-key="fechaInicio" value="${d.fechaInicio}"></label><label>Fin<input type="date" data-date="${esc(cycle.id)}" data-key="fechaFin" value="${d.fechaFin}"></label>`:`<strong>${formatDate(d.fechaInicio)} → ${formatDate(d.fechaFin)}</strong><p class="field-hint">${(yearData?.fechasModificadas||[]).some(r=>r.id===cycle.id)?'Ajuste manual guardado':'Fecha calculada'}</p>`}</article>`;}).join('')}</div>
      ${dateDraft?`<label>Notas del año<textarea id="annualNotes">${esc(dateDraft.notes||'')}</textarea></label><label>Estado del calendario<select id="annualStatus">${['Borrador','Validado'].map(x=>`<option ${dateDraft.status===x?'selected':''}>${x}</option>`).join('')}</select></label>`:`<p>${esc(yearData?.estado||'Borrador')} · ${esc(yearData?.notas||'Sin notas del año')}</p>`}
      <div class="actions">${button('generate','Crear Muestras de Proceso del año',!ready||!yearReady||!!dateDraft||!!edit||busy)}</div><p class="field-hint">Se muestra un resumen antes de crear. Los eventos ya generados conservan sus fechas y cambios operativos.</p></section>
      <section class="panel"><div class="row-between"><h3>Semana tipo</h3>${button('distribution','Editar distribución semanal',!ready||busy||!!dateDraft)}</div><div class="annual-week">${activeFamilies(c).map(f=>`<article class="annual-card"><span class="annual-icon">${esc(f.emoji)}</span><span class="eyebrow">${DAYS[f.dia]}</span><h4>${esc(f.nombre)}</h4><p>${esc(f.instrumentos)}</p><p class="field-hint">${esc(f.descripcion)}</p></article>`).join('')}</div><h4>¿Por qué agrupamos por instrumento?</h4><p>${esc(c.agrupacion)}</p></section>
      <section class="panel"><h3>Cómo funciona una jornada</h3><div class="annual-timeline">${[...c.bloques].sort((a,b)=>minutes(a.hora)-minutes(b.hora)).map((b,i,list)=>`<article class="annual-card"><strong>${esc(b.hora)} – ${time(minutes(b.hora)+b.duracion)}</strong><h4>${esc(b.nombre)}</h4><p>${b.duracion} minutos · ${b.cupo} presentaciones</p>${b.cupo*p.slot>b.duracion?'<p class="annual-notice">El cupo al tiempo máximo supera la duración del bloque.</p>':''}</article>${i<list.length-1?`<div class="annual-break">Pausa / intervalo<br><strong>${minutes(list[i+1].hora)-minutes(b.hora)-b.duracion} min</strong></div>`:''}`).join('')}</div><p>Pausa técnica mínima: ${c.pausa} min · ${c.bloques.length} bloques · <strong>${cap} presentaciones por jornada</strong></p></section>
      <section class="panel"><h3>Política de presentaciones</h3><div class="annual-metrics">${[[`${p.slot} min`,'⏱ por presentación'],[`${p.obras} obra(s)`,'🎵 recomendadas'],[`${p.maxObras} obras`,'🎼 máximo'],[`${p.repertorio} min`,'Tiempo musical máximo'],[c.bloques.map(b=>b.cupo).join(' / '),'👥 cupos por bloque'],[`${cap}`,'🎭 por jornada']].map(([v,l])=>`<article class="annual-card"><strong>${v}</strong><p>${l}</p></article>`).join('')}</div><p>Las obras deben caber dentro del tiempo de escenario. Margen: ${p.slot-p.repertorio} min. ${esc(p.margen)}</p><p>${esc(p.descripcion)}</p></section>
      <section class="panel"><h3>¿Qué pasa si se llena?</h3><div class="annual-metrics"><article class="annual-card"><h4>1 a ${cap} presentaciones</h4><p>Jornada normal del instrumento.</p></article><article class="annual-card"><h4>Más de ${cap}</h4><p>Jornada adicional del mismo instrumento → mismo día, semana siguiente.</p></article><article class="annual-card"><h4>${c.capacidad.umbral} o más áreas desbordadas</h4><p>Se recomienda activar una segunda semana completa de Muestras de Proceso.</p></article></div><p>${esc(c.capacidad.descripcion)}</p></section>
      <section class="panel"><h3>Decisiones y criterios</h3><ol>${c.decisiones.split('\n').filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section>
      <section class="panel"><h3>Historial de cambios</h3><p class="field-hint">Últimos 30 registros. El historial completo permanece en Firestore.</p>${history.length?history.map(h=>`<details><summary>${h.fecha?.toDate?esc(h.fecha.toDate().toLocaleString('es-CO')):'Pendiente de fecha'} · ${esc(h.usuario||'')} · ${esc(h.seccion)}</summary><p><strong>Antes:</strong> ${esc(h.anterior||'Sin configuración guardada')}</p><p><strong>Después:</strong> ${esc(h.nuevo)}</p></details>`).join(''):'<p>Aún no hay cambios registrados.</p>'}</section></div>`;
    root.querySelector('#annualYear').onchange=e=>{const n=Number(e.target.value);if(!Number.isInteger(n)||n<1583||n>4099){toast('Año válido: 1583 a 4099.');e.target.value=year;return;}if(n===year)return;year=n;e.target.onchange=null;listenYear();render();};
    root.querySelectorAll('[data-date]').forEach(el=>el.oninput=()=>{dateDraft.find(d=>d.id===el.dataset.date)[el.dataset.key]=el.value;});
    root.querySelector('#annualNotes')?.addEventListener('input',e=>dateDraft.notes=e.target.value);
    root.querySelector('#annualStatus')?.addEventListener('change',e=>dateDraft.status=e.target.value);
    root.querySelectorAll('[data-annual]').forEach(el=>el.onclick=()=>action(el.dataset.annual));
    bindEditor();
    if(busy)root.querySelectorAll("input,select,textarea,button").forEach(el=>el.disabled=true);
  }
  function ruleText(c){return c.regla==='pascua'?`Semana completa ${c.semana} anterior a Semana Santa`:c.regla==='numero'?`Semana completa ${c.semana} del mes ${c.mes}`:c.regla==='ultima'?`Última semana completa del mes ${c.mes}`:`Semana que termina en el primer sábado del mes ${c.mes}`;}
  function formatDate(s){return new Date(s+'T12:00:00Z').toLocaleDateString('es-CO',{day:'numeric',month:'long',timeZone:'UTC'});}
  function field(path,label,value,type='text') {return `<label>${label}${type==='textarea'?`<textarea data-path="${path}">${esc(value)}</textarea>`:`<input data-path="${path}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any"':''}>`}</label>`;}
  function select(path,label,value,opts){return `<label>${label}<select data-path="${path}">${Object.entries(opts).map(([k,v])=>`<option value="${esc(k)}" ${String(value)===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
  function editor() {
    const c=edit.data;
    return `<section class="panel annual-editor"><h3>Editar configuración</h3><p>Los cambios se aplican al guardar. Desactiva familias en lugar de eliminarlas para conservar sus referencias históricas.</p>
    <details open><summary>Principio general y criterios</summary>${field('descripcion','Descripción institucional',c.descripcion,'textarea')}${field('agrupacion','Por qué agrupamos',c.agrupacion,'textarea')}${field('decisiones','Decisiones y criterios (una por línea)',c.decisiones,'textarea')}</details>
    <details id="distributionEditor"><summary>Distribución semanal</summary>${c.distribucion.map((f,i)=>`<fieldset class="form-grid"><legend>${esc(f.nombre)}</legend>${field(`distribucion.${i}.nombre`,'Nombre del área',f.nombre)}${field(`distribucion.${i}.emoji`,'Emoji / icono',f.emoji)}${select(`distribucion.${i}.dia`,'Día',f.dia,Object.fromEntries(DAYS.map((d,i)=>[i,d])))}${field(`distribucion.${i}.orden`,'Orden',f.orden,'number')}${field(`distribucion.${i}.instrumentos`,'Instrumentos incluidos',f.instrumentos)}${field(`distribucion.${i}.descripcion`,'Descripción',f.descripcion,'textarea')}<label><input type="checkbox" data-path="distribucion.${i}.activo" ${f.activo?'checked':''}> Activo</label></fieldset>`).join('')}${button('addFamily','+ Agregar familia')}</details>
    <details><summary>Ciclos y reglas del calendario (${c.ciclos.length})</summary><p>Semana completa = lunes a sábado. Para Semana Santa, el número 2 corresponde a la segunda semana anterior al Domingo de Ramos.</p>${c.ciclos.map((v,i)=>`<fieldset class="form-grid"><legend>Ciclo ${i+1}</legend>${field(`ciclos.${i}.nombre`,'Nombre',v.nombre)}${select(`ciclos.${i}.regla`,'Regla',v.regla,rules)}${field(`ciclos.${i}.mes`,'Mes (1–12; no aplica a Semana Santa)',v.mes,'number')}${field(`ciclos.${i}.semana`,'Número de semana (reglas numeradas)',v.semana,'number')}${button(`removeCycle:${i}`,'Quitar ciclo')}</fieldset>`).join('')}${button('addCycle','+ Agregar ciclo')}</details>
    <details><summary>Bloques y pausa técnica</summary>${field('pausa','Pausa técnica mínima (min)',c.pausa,'number')}${c.bloques.map((b,i)=>`<fieldset class="form-grid"><legend>${esc(b.nombre)}</legend>${field(`bloques.${i}.nombre`,'Nombre',b.nombre)}${field(`bloques.${i}.hora`,'Hora de inicio',b.hora,'time')}${field(`bloques.${i}.duracion`,'Duración (min)',b.duracion,'number')}${field(`bloques.${i}.cupo`,'Cupo recomendado',b.cupo,'number')}${button(`removeBlock:${i}`,'Eliminar bloque')}</fieldset>`).join('')}${button('addBlock','+ Agregar bloque')}<p id="draftCapacity">Capacidad total: ${capacity(c)} presentaciones</p></details>
    <details><summary>Política de presentación y ampliación</summary><div class="form-grid">${[['slot','Minutos por slot'],['obras','Obras recomendadas'],['maxObras','Obras máximas'],['repertorio','Minutos máximos de repertorio']].map(([k,l])=>field('politica.'+k,l,c.politica[k],'number')).join('')}${field('politica.margen','Uso del margen',c.politica.margen,'textarea')}${field('politica.descripcion','Descripción pedagógica',c.politica.descripcion,'textarea')}${field('capacidad.umbral','Áreas desbordadas para recomendar segunda semana',c.capacidad.umbral,'number')}${field('capacidad.alerta','Avisar últimos cupos cuando queden',c.capacidad.alerta,'number')}${field('capacidad.descripcion','Regla de ampliación',c.capacidad.descripcion,'textarea')}</div></details>
    <div class="actions">${button('saveConfig','Guardar cambios',busy)}${button('cancelConfig','Cancelar',busy)}${button('defaults','Restaurar valores predeterminados',busy)}</div><p class="annual-notice" id="annualEditError" role="alert"></p></section>`;
  }
  function bindEditor(){root.querySelectorAll('[data-path]').forEach(el=>el.oninput=()=>{const parts=el.dataset.path.split('.');let obj=edit.data;for(const k of parts.slice(0,-1))obj=obj[k];const k=parts.at(-1);obj[k]=el.type==='checkbox'?el.checked:el.type==='number'||k==='dia'?Number(el.value):el.value;const cap=root.querySelector('#draftCapacity');if(cap)cap.textContent=`Capacidad total: ${capacity(edit.data)} presentaciones`;});}
  async function saveConfig(){
    validate(edit.data);const data=clone(edit.data),base=edit.revision;
    await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(revision(snap)!==base)throw Error('Otra persona cambió la configuración. Cancela y vuelve a editar la versión actual.');const old=snap.exists()?snap.data():{};for(const key of Object.keys(labels))if(JSON.stringify(old[key])!==JSON.stringify(data[key]))log(tx,labels[key],old[key]===undefined?'Sin configuración guardada':summary(key,old[key]),summary(key,data[key]));tx.set(ref,{...data,revision:base+1,...stamp(user())});});
    edit=null;toast('Configuración e historial guardados.');
  }
  function beginDates(computed=false){yearBaseRevision=yearData?.revision||0;dateDraft=clone(computed?calendar(year,config):effective());dateDraft.notes=yearData?.notas||'';dateDraft.status=yearData?.estado||'Borrador';}
  async function saveDates(){
    const y=year,rows=clone([...dateDraft]);validateDates(rows);const calculated=calendar(y,config),modified=rows.filter(r=>JSON.stringify(r)!==JSON.stringify(calculated.find(c=>c.id===r.id))),base=yearBaseRevision,configRevision=config.revision||0,notes=dateDraft.notes,status=dateDraft.status;
    await runTransaction(db,async tx=>{const [snap,master]=await Promise.all([tx.get(yearRef(y)),tx.get(ref)]);if(revision(snap)!==base||revision(master)!==configRevision)throw Error('El calendario o sus reglas cambiaron. Cancela y vuelve a editar.');tx.set(yearRef(y),{fechasCalculadas:calculated,fechasModificadas:modified,notas:notes,estado:status,revision:base+1,...stamp(user())},{merge:true});log(tx,`Calendario ${y}`,JSON.stringify({fechas:snap.data()?.fechasModificadas||snap.data()?.fechasCalculadas||[],notas:snap.data()?.notas||''}),JSON.stringify({fechas:rows,notas:notes,estado:status}));});dateDraft=null;toast(`Calendario ${y} guardado.`);
  }
  async function generate(){
    const y=year,rows=effective();validateDates(rows);
    const known=events();const plan=config.ciclos.map((c,i)=>({cycle:c,index:i,date:rows.find(r=>r.id===c.id),id:eventId(y,c.id)}));
    const existing=p=>known.find(e=>e.id===p.id||(e.sistemaAnual?.anio===y&&e.sistemaAnual?.cicloId===p.cycle.id));
    const pending=plan.filter(p=>!existing(p));
    if(!pending.length){toast('Todos los ciclos ya tienen un evento generado.');return;}
    if(!confirm(`Crear ${pending.length} evento(s) de ${y}:\n\n${pending.map(p=>`Muestra ${p.index+1} · ${p.cycle.nombre}\n${p.date.fechaInicio} → ${p.date.fechaFin}`).join('\n\n')}\n\n${plan.length-pending.length} ciclo(s) ya existentes se omiten. ¿Crear ahora?`))return;
    const baseConfig=config.revision||0,baseYear=yearData?.revision||0;
    const result=await runTransaction(db,async tx=>{
      const [master,annual,...snaps]=await Promise.all([tx.get(ref),tx.get(yearRef(y)),...plan.map(p=>tx.get(doc(db,'eventos',p.id)))]);
      if(revision(master)!==baseConfig||revision(annual)!==baseYear)throw Error('Las reglas o fechas cambiaron. Revisa el calendario y vuelve a generar.');
      const generated={...(annual.data()?.eventosGenerados||{})};let count=0;
      plan.forEach((p,i)=>{
        if(snaps[i].exists()||existing(p)||generated[p.cycle.id]){generated[p.cycle.id]=generated[p.cycle.id]||existing(p)?.id||p.id;return;}
        const month=new Date(p.date.fechaFin+'T12:00:00Z').toLocaleDateString('es-CO',{month:'long',timeZone:'UTC'});
        tx.set(doc(db,'eventos',p.id),{titulo:`Muestra de Proceso ${p.index+1} · ${month.charAt(0).toUpperCase()+month.slice(1)} ${y}`,tipo:'Muestra de proceso',estado:'Planeación',prioridad:'Media',fechaInicio:p.date.fechaInicio,fechaFin:p.date.fechaFin,objetivo:'Observar el avance artístico y ofrecer experiencias periódicas de escenario a estudiantes y familias.',notas:'Generado desde el Sistema anual de Muestras de Proceso.',sistemaAnual:{anio:y,cicloId:p.cycle.id},createdAt:serverTimestamp(),createdBy:user().email,...stamp(user())});generated[p.cycle.id]=p.id;count++;
      });
      tx.set(yearRef(y),{eventosGenerados:generated,fechasCalculadas:calendar(y,config),revision:baseYear+1,...stamp(user())},{merge:true});
      if(!master.exists())tx.set(ref,{...config,revision:1,...stamp(user())});
      if(count)log(tx,`Eventos generados ${y}`,'',`${count} eventos: ${Object.values(generated).join(', ')}`);
      return count;
    });toast(`${result} evento(s) creado(s). Los existentes se conservaron.`);
  }
  async function action(name){
    if(busy)return;
    operationError="";
    if(name==='back'){root.dispatchEvent(new CustomEvent('annual-back'));return;}
    if(name==='edit'||name==='distribution'){edit??={data:clone(config),revision:config.revision||0};render();if(name==='distribution'){root.querySelector('#distributionEditor').open=true;root.querySelector('#distributionEditor').scrollIntoView({block:'start'});}return;}
    if(name==='cancelConfig')edit=null;
    else if(name==='defaults'){if(confirm('¿Restaurar los valores predeterminados en el borrador? Al guardar reemplazarás la configuración actual y se registrará el cambio.'))edit.data=defaults();}
    else if(name==='addFamily')edit.data.distribucion.push({id:crypto.randomUUID(),nombre:'Nueva familia',emoji:'🎵',instrumentos:'',descripcion:'',dia:0,orden:edit.data.distribucion.length+1,activo:true});
    else if(name==='addCycle')edit.data.ciclos.push({id:crypto.randomUUID(),nombre:'Nuevo ciclo',regla:'numero',mes:6,semana:1});
    else if(name==='addBlock'){const last=edit.data.bloques.at(-1);edit.data.bloques.push({id:crypto.randomUUID(),nombre:`Bloque ${edit.data.bloques.length+1}`,hora:last?time(Math.min(1380,minutes(last.hora)+last.duracion+edit.data.pausa)):'17:00',duracion:60,cupo:10});}
    else if(name.startsWith('removeBlock:'))edit.data.bloques.splice(Number(name.split(':')[1]),1);
    else if(name.startsWith('removeCycle:')){if(confirm('¿Quitar este ciclo de la configuración? Sus eventos y calendarios anteriores se conservarán.'))edit.data.ciclos.splice(Number(name.split(':')[1]),1);}
    else if(name==='dates')beginDates();
    else if(name==='calculate'||name==='restoreDates'){if(!dateDraft&&!yearData?.fechasModificadas?.length||confirm('¿Reemplazar los ajustes de fechas en el borrador por el cálculo actual? Guarda para confirmar.'))beginDates(true);}
    else if(name==='cancelDates')dateDraft=null;
    else if(['saveConfig','saveDates','generate'].includes(name)){
      busy=true;render();try{if(name==='saveConfig')await saveConfig();else if(name==='saveDates')await saveDates();else await generate();}catch(e){operationError=e.message;toast(e.message);const box=root.querySelector('#annualEditError');if(box)box.textContent=e.message;}finally{busy=false;}
    }
    const opened=[...root.querySelectorAll('details[open]')].map((d)=>[...root.querySelectorAll('details')].indexOf(d));render();opened.forEach(i=>{const d=root.querySelectorAll('details')[i];if(d)d.open=true;});
  }
  return {start,stop,render,panel,familyField,familyName};
}
