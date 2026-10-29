import { PIANO_RIDER } from './piano-rider.js?v=20261029-piano-1';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function riderTemplates(events = []) {
  const result = [{id:'piano',name:'Concierto de piano',items:PIANO_RIDER,builtin:true}];
  for(const event of events) for(const [key,t] of Object.entries(event.riderTemplates || {})) {
    if(t && typeof t.name==='string' && Array.isArray(t.items)) result.push({...t,id:event.id+':'+key,eventId:event.id,key});
  }
  return result;
}
export const templateText = items => items.map(item=>item.map(v=>String(v??'').replace(/[|\r\n]/g,' ')).join(' | ')).join('\n');
export function parseTemplateItems(value) {
  const lines=String(value).split(/\r?\n/).filter(line=>line.trim());
  if(!lines.length || lines.length>100) throw new Error('La plantilla debe tener entre 1 y 100 recursos.');
  const seen=new Set();
  return lines.map((line,i)=>{
    const parts=line.split('|').map(v=>v.trim());
    if(parts.length<3 || parts.length>4 || !parts[0] || !parts[1]) throw new Error(`Revisa la línea ${i+1}: categoría | recurso | cantidad | indicaciones.`);
    const key=parts[1].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
    if(seen.has(key))throw new Error(`El recurso de la línea ${i+1} está repetido.`);seen.add(key);
    const qty=parts[2].toLowerCase()==='por definir'?'Por definir':Number(parts[2]);
    if(parts[2]==='' || qty!=='Por definir' && (!Number.isSafeInteger(qty)||qty<1))throw new Error(`Revisa la cantidad de la línea ${i+1}. Usa un entero positivo o Por definir.`);
    if(parts.some(p=>p.length>2000))throw new Error('Una línea contiene demasiado texto.');
    return [parts[0],parts[1],qty,parts[3]||''];
  });
}
export function renderRiderSetup(rows = [], templates = [], editor = false) {
  const groups=[...new Set(rows.map(r=>r.categoria||'General'))];
  return `<section class="form-section" data-shared-rider style="margin:18px 0;padding:16px;min-width:0"><h3>🧰 Montaje compartido del evento</h3><p>Equipos, cables y consumibles para todo el concierto. Se revisan una vez y se consultan desde las demás secciones.</p>${editor?`<div class="actions"><label>Plantilla de rider<select id="riderTemplateChoice">${templates.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label><button type="button" class="btn btn-primary" data-action="rider-template-apply">Aplicar plantilla</button><button type="button" class="btn btn-light" data-action="rider-template-create">+ Crear plantilla</button><button type="button" class="btn btn-light" data-action="rider-template-edit">Editar / copiar plantilla</button></div>`:''}${rows.length?`<p><strong>${rows.length} recursos</strong> · ${rows.filter(r=>!['Listo','Confirmado','Realizado'].includes(r.estado)).length} por revisar · ${rows.filter(r=>!r.cantidad || r.cantidad==='Por definir').length} cantidades por definir</p><details><summary>Ver lista de montaje por categoría</summary>${groups.map(group=>`<h4>${esc(group)}</h4><ul>${rows.filter(r=>(r.categoria||'General')===group).map(r=>`<li><strong>${esc(r.cantidad || 'Por definir')} · ${esc(r.elemento)}</strong> — ${esc(r.estado || 'Pendiente')}${r.proveedor?` · Aporta: ${esc(r.proveedor)}`:''}${r.notas?`<p>${esc(r.notas)}</p>`:''}</li>`).join('')}</ul>`).join('')}</details>`:'<p>Todavía no se ha preparado el montaje. En Rider técnico puedes aplicar la plantilla de piano o crear una propia.</p>'}${editor?'<p class="field-hint">Aplicar añade los recursos que faltan, conserva tus ajustes y no confirma disponibilidad. Las plantillas guardadas están disponibles en los demás eventos. Modifica los equipos concretos abajo, en Rider general.</p>':'<p class="field-hint">Actualiza disponibilidad, cantidades y proveedores en Rider técnico → Rider general. Esta lista consulta los mismos datos; no genera copias.</p>'}</section>`;
}
