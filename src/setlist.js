import {db,doc,runTransaction,serverTimestamp} from './firebase-config.js?v=20261011-docentes';
import {getWorkMinutes,formatWorkTime} from './obras-duracion.js?v=20261024-obras-1';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const states={pendiente:'Por llamar',llamado:'Llamado',escena:'En escena',terminado:'Terminado',omitido:'Omitido'};
const order=(values,saved=[])=>[...values].sort((a,b)=>{const x=saved.indexOf(a),y=saved.indexOf(b);return (x<0?saved.length:x)-(y<0?saved.length:y);});

export function createSetlist({context,toast,onChange}){
  const options=new Map();let busy=false;
  const config=()=>{const id=context().event?.id;if(!options.has(id))options.set(id,{pending:false});return options.get(id);};
  const all=()=>context().presentations.filter(row=>row.areaArtisticaId!=='artes-plasticas').sort((a,b)=>Number(!['Confirmado','Realizado'].includes(a.estado))-Number(!['Confirmado','Realizado'].includes(b.estado))||String(a.estudianteGrupo||'').localeCompare(String(b.estudianteGrupo||''),'es'));
  const visible=()=>all().filter(row=>config().pending||['Confirmado','Realizado'].includes(row.estado));
  const works=row=>Array.isArray(row.repertorios)&&row.repertorios.length?row.repertorios:row.repertorio?[row.repertorio]:[];
  const status=(data,id)=>data.estados?.[id]||'pendiente';
  const sequence=(data,rows)=>order(rows.map(row=>row.id),data.orden).map(id=>rows.find(row=>row.id===id));
  const songs=(data,row)=>order([...new Set(works(row))],data.obras?.[row.id]);
  const songKey=(id,work)=>id+'|'+norm(work);
  function detail(data,row,print=false){
    const members=row.integrantes?.length?'<p><strong>Integrantes:</strong> '+row.integrantes.map(m=>esc(m.nombre)+(m.instrumento?' · '+esc(m.instrumento):'')).join('; ')+'</p>':'';
    return members+'<p><strong>Docente:</strong> '+esc(row.docente||'Por definir')+' · <strong>Estado:</strong> '+esc(row.estado||'Pendiente')+'</p><ol>'+songs(data,row).map((work,index)=>{
      const support=(row.apoyosObras||[]).find(item=>norm(item.obra)===norm(work));
      const time=getWorkMinutes(row,work);
      return '<li style="margin:12px 0"><strong>'+esc(work)+'</strong> · '+(time==null?'Duración por definir':esc(formatWorkTime(time))+' min:seg')+(support?'<p>Apoyo: '+esc(support.estado||'Por definir')+(support.docente?' · '+esc(support.docente):'')+(support.como?' · '+esc(support.como):'')+'</p>':'')+(print?'':`<div class="setlist-actions"><button type="button" data-song-move="${esc(row.id)}" data-song="${index}" data-delta="-1" ${index===0?'disabled':''}>↑ Subir canción</button><button type="button" data-song-move="${esc(row.id)}" data-song="${index}" data-delta="1" ${index===songs(data,row).length-1?'disabled':''}>↓ Bajar canción</button><label><input type="checkbox" data-song-done="${esc(row.id)}" data-song="${index}" ${data.cancionesHechas?.[songKey(row.id,work)]?'checked':''} /> Canción realizada</label></div>` )+'</li>';
    }).join('')+'</ol>'+(!works(row).length?'<p>⚠ Falta registrar las obras en Participantes.</p>':'')+(row.recursos?'<p><strong>Recursos:</strong> '+esc(row.recursos)+'</p>':'')+(row.notas?'<p><strong>Notas:</strong> '+esc(row.notas)+'</p>':'');
  }
  function render(){
    const ctx=context(),data=ctx.event?.setlist||{},rows=sequence(data,visible());
    const current=rows.find(row=>status(data,row.id)==='escena');
    const next=rows.find(row=>!['terminado','omitido','escena'].includes(status(data,row.id)));
    return `<style>.setlist-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}.setlist-card{border:1px solid #dcd5ee;border-radius:14px;padding:16px;margin:14px 0}.setlist-card summary{font-size:1.2rem;font-weight:700;cursor:pointer}.setlist-card[data-live="escena"]{border:3px solid #6314d8;background:#f3efff}.setlist-card[data-live="terminado"]{background:#f2faf6}.setlist-position{width:85px}.setlist-now{padding:18px;background:#eeebff;border-radius:14px;margin:16px 0}</style><h3>Setlist · Orden de presentación</h3><p>Ordena las presentaciones y sus canciones. Los ensambles aparecen una sola vez; las obras compartidas no se repiten como solistas.</p><div class="setlist-actions"><label><input type="checkbox" data-setlist-pending ${config().pending?'checked':''} /> Incluir inscripciones pendientes de confirmar</label><button type="button" class="btn btn-light" data-setlist-print>Imprimir / guardar PDF del setlist</button></div><p>${rows.length} presentaciones visibles · ${all().length-visible().length} sin confirmar fuera de esta vista. Los cancelados y las exposiciones no se incluyen.</p><div class="setlist-now"><p><strong>EN ESCENA:</strong> ${esc(current?.estudianteGrupo||'Ninguna presentación marcada')}</p><p><strong>SIGUE:</strong> ${esc(next?.estudianteGrupo||'No hay presentaciones pendientes en esta vista')}</p></div><p class="field-hint">La posición se guarda al cambiarla. Los números conservan el orden general aunque ocultes las inscripciones pendientes. En este panel se ordenan turnos; las horas y transiciones se preparan en Minuto a minuto. Las marcas de escenario no completan la trayectoria del estudiante.</p>${rows.map((row,index)=>`<details class="setlist-card" data-live="${esc(status(data,row.id))}" ${row.id===current?.id||row.id===next?.id?'open':''}><summary>${sequence(data,all()).findIndex(item=>item.id===row.id)+1}. ${esc(row.estudianteGrupo||'Sin nombre')} · ${esc(states[status(data,row.id)]||'Por llamar')}</summary><div class="setlist-actions"><label>Orden de presentación<input type="number" class="setlist-position" min="1" max="${all().length}" step="1" data-setlist-position="${esc(row.id)}" value="${sequence(data,all()).findIndex(r=>r.id===row.id)+1}" /></label><button type="button" data-setlist-move="${esc(row.id)}" data-delta="-1" ${index===0?'disabled':''}>↑ Subir</button><button type="button" data-setlist-move="${esc(row.id)}" data-delta="1" ${index===rows.length-1?'disabled':''}>↓ Bajar</button></div>${detail(data,row)}<div class="setlist-actions">${Object.entries(states).map(([value,label])=>`<button type="button" data-setlist-state="${esc(row.id)}" data-value="${value}" ${status(data,row.id)===value?'disabled':''}>${label}</button>`).join('')}</div></details>`).join('')||'<p>No hay presentaciones confirmadas. Puedes incluir pendientes o revisar los estados en Participantes.</p>'}`;
  }
  async function save(change){
    if(busy)return;busy=true;
    const ctx=context(),ref=doc(db,'eventos',ctx.event.id),baseline=JSON.stringify(ctx.event.setlist||{});
    try{
      let saved;
      await runTransaction(db,async tx=>{const snapshot=await tx.get(ref);if(!snapshot.exists())throw Error('No se encontró el evento.');if(JSON.stringify(snapshot.data().setlist||{})!==baseline)throw Error('El setlist cambió en otra ventana. Reabre la pestaña Setlist y vuelve a realizar el cambio.');const data=structuredClone(snapshot.data().setlist||{});change(data);if(new TextEncoder().encode(JSON.stringify(data)).length>180000)throw Error('El setlist supera el tamaño permitido.');tx.update(ref,{setlist:data,updatedAt:serverTimestamp(),updatedBy:ctx.user.email});saved=data;});
      if(context().event?.id===ctx.event.id){context().event.setlist=saved;onChange();}toast('Setlist guardado.');
    }catch(error){toast(error.message||'No se pudo guardar el setlist.');onChange();}finally{busy=false;}
  }
  function move(data,id,position){const ids=sequence(data,all()).map(row=>row.id);if(!ids.includes(id))throw Error('La inscripción cambió. Reabre el setlist.');ids.splice(ids.indexOf(id),1);ids.splice(Math.max(0,Math.min(ids.length,position)),0,id);data.orden=ids;}
  function print(){
    const ctx=context(),data=ctx.event.setlist||{},rows=sequence(data,visible());
    const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:0;height:0;border:0';
    frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};
    frame.srcdoc='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Setlist</title><style>body{font:12pt Arial;color:#111;padding:16px}article{break-inside:avoid;border-bottom:1px solid #aaa;padding:12px 0}h2{font-size:16pt}p{margin:6px 0}@page{margin:15mm}</style></head><body><h1>Setlist · '+esc(ctx.event.titulo)+'</h1><p>'+esc(ctx.event.fechaInicio||'Fecha por definir')+' · '+esc(ctx.event.lugar||'Lugar por definir')+'</p><p>'+rows.length+' presentaciones · '+(config().pending?'Incluye pendientes de confirmar':'Confirmadas / realizadas')+'</p>'+rows.map((row,i)=>'<article><h2>☐ '+(sequence(data,all()).findIndex(item=>item.id===row.id)+1)+'. '+esc(row.estudianteGrupo)+'</h2><p>'+esc(states[status(data,row.id)])+'</p>'+detail(data,row,true)+'</article>').join('')+'</body></html>';
    document.querySelectorAll('iframe[data-setlist-print-frame]').forEach(element=>element.remove());frame.dataset.setlistPrintFrame='true';document.body.append(frame);
  }
  function mount(root){
    root.querySelector('[data-setlist-pending]')?.addEventListener('change',e=>{config().pending=e.target.checked;onChange();});
    root.querySelector('[data-setlist-print]')?.addEventListener('click',print);
    root.querySelectorAll('[data-setlist-position]').forEach(input=>input.addEventListener('change',()=>{const position=Number(input.value);if(!Number.isInteger(position)||position<1||position>all().length){toast('Indica una posición válida.');onChange();return;}save(data=>move(data,input.dataset.setlistPosition,position-1));}));
    root.querySelectorAll('[data-setlist-move]').forEach(button=>button.onclick=()=>save(data=>{const rows=sequence(data,visible()),index=rows.findIndex(row=>row.id===button.dataset.setlistMove),target=rows[index+Number(button.dataset.delta)];if(!target)return;const ids=sequence(data,all()).map(row=>row.id),a=ids.indexOf(button.dataset.setlistMove),b=ids.indexOf(target.id);[ids[a],ids[b]]=[ids[b],ids[a]];data.orden=ids;}));
    root.querySelectorAll('[data-song-move]').forEach(button=>button.onclick=()=>save(data=>{const row=all().find(r=>r.id===button.dataset.songMove);if(!row)return;const list=songs(data,row),index=Number(button.dataset.song),target=index+Number(button.dataset.delta);if(target<0||target>=list.length)return;[list[index],list[target]]=[list[target],list[index]];data.obras={...data.obras,[row.id]:list};}));
    root.querySelectorAll('[data-setlist-state]').forEach(button=>button.onclick=()=>save(data=>{if(button.dataset.value==='escena'&&Object.entries(data.estados||{}).some(([id,value])=>id!==button.dataset.setlistState&&value==='escena'&&all().some(row=>row.id===id)))throw Error('Marca como terminada o por llamar la presentación que sigue en escena.');data.estados={...data.estados,[button.dataset.setlistState]:button.dataset.value};}));
    root.querySelectorAll('[data-song-done]').forEach(input=>input.onchange=()=>{const row=all().find(r=>r.id===input.dataset.songDone),data=context().event.setlist||{},work=row&&songs(data,row)[Number(input.dataset.song)];if(work)save(latest=>{latest.cancionesHechas={...latest.cancionesHechas,[songKey(row.id,work)]:input.checked};});});
  }
  return {render,mount,print,orderedWorks:(row,values)=>order(values,context().event?.setlist?.obras?.[row.id]),position:id=>sequence(context().event?.setlist||{},all()).findIndex(row=>row.id===id)+1};
}
