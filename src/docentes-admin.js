import { db, collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, where, setDoc, updateDoc, serverTimestamp, Timestamp, runTransaction } from './firebase-config.js?v=20261011-docentes';
import { loadFicha, fichaUrl, timestampMillis } from './docentes-data.js';
import { coincidenciasPresentacion, validarFichaParaConfirmar, muestraDesdeFicha, instruccionesDocentes, normalizarNombre, nombresPresentacion } from './docentes-model.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const camposInstruccion = { preparacion:'Preparación', entrada:'Entrada a escena', inicio:'Señal de inicio', acompanamiento:'Acompañamiento', cierre:'Cierre', observaciones:'Observaciones' };
const dateLocal = value => new Date(timestampMillis(value) - 5 * 3600000).toISOString().slice(0,16);
const dateValue = input => Timestamp.fromDate(new Date(input + ':00-05:00'));
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
const nuevasInscripcionesId = (token, revision, id) => `docente-${token}-${id}-r${revision}`;
const propuestasRepetidas = (propuesta, anteriores) => {
  const nombres = nombresPresentacion(propuesta).map(normalizarNombre);
  return anteriores.filter(p => nombresPresentacion(p).some(n => nombres.includes(normalizarNombre(n))));
};
const inscripcionesAnteriores = (ficha, propuestas, existentes) => [...new Set(Object.values(ficha.confirmaciones || {}))]
  .map(id => existentes.find(row => row.id === id)).filter(row => row && !propuestas.some(p => coincidenciasPresentacion(p, [row]).some(m => m.exacta)));

export function createTeacherAdmin({ user, people, students, annual, setModal, modalForm, modal, toast }) {
  let root, event, config = null, fichas = [], unsubs = [], opened = false, error = '', ready = false;
  function stop() { unsubs.forEach(fn => fn()); unsubs = []; event = null; root = null; fichas = []; config = null; ready = false; }
  function mount(element, selectedEvent) {
    opened = root?.querySelector('details')?.open || false;
    root = element;
    if (!root) return;
    if (event?.id !== selectedEvent.id) {
      unsubs.forEach(fn => fn()); unsubs = []; event = selectedEvent; ready = false; error = ''; config = null; fichas = [];
      unsubs.push(onSnapshot(doc(db, 'convocatoriasDocentes', event.id), s => { config = s.exists() ? s.data() : null; ready = true; render(); }, e => { error = e.message; render(); }));
      unsubs.push(onSnapshot(query(collection(db, 'fichasDocentes'), where('eventoId', '==', event.id)), s => { fichas = s.docs.map(d => ({ token: d.id, ...d.data() })).filter(f => !f.revocada).sort((a,b) => a.docenteNombre.localeCompare(b.docenteNombre)); render(); }, e => { error = e.message; render(); }));
    } else event = selectedEvent;
    render();
  }
  async function copy(value) { try { await navigator.clipboard.writeText(value); toast('Enlace copiado.'); } catch { setModal(`<h3>Copiar enlace</h3><label>Enlace<input readonly value="${esc(value)}" /></label>`, null); } }
  const publicUrl = () => { const u = new URL('docentes.html', location.href); u.searchParams.set('evento', event.id); return u.href; };
  function render() {
    if (!root?.isConnected) return;
    const open = config?.abierta && timestampMillis(config.cierreAt) > Date.now() && !['Realizado','No realizado','Archivado'].includes(event.estado);
    root.innerHTML = `<details ${opened ? 'open' : ''}><summary>Formato docentes · ${fichas.length} ficha${fichas.length === 1 ? '' : 's'} · ${open ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}</summary>
      <p class="muted">Los docentes guardan sus propuestas sin iniciar sesión. Las presentaciones se incorporan al evento después de revisarlas aquí.</p>
      <div class="actions"><button type="button" class="btn btn-primary" data-teacher-config>Configurar inscripciones</button><button type="button" class="btn btn-light" data-teacher-link>Copiar enlace del formulario</button>${open ? '<button type="button" class="btn btn-light" data-teacher-close>Cerrar inscripciones</button>' : ''}</div>
      ${error ? `<p role="alert">${esc(error)}</p>` : !ready ? '<p>Cargando…</p>' : ''}
      <p class="field-hint">${config ? `${Object.keys(config.docentes || {}).length} docentes habilitados · Cierre: ${new Date(timestampMillis(config.cierreAt)).toLocaleString('es-CO', {timeZone:'America/Bogota'})} (Bogotá)` : 'Configura los docentes y la fecha límite para abrir el formulario de esta muestra.'}</p>
      <div class="teacher-admin-list">${fichas.map(f => `<article class="teacher-admin-card"><div><strong>${esc(f.docenteNombre)}</strong><p>${esc(f.estado)} · Asistirá: ${esc(f.asistencia)} · ${f.cantidadPresentaciones} presentación(es)</p></div><div class="actions"><button type="button" class="small-btn" data-review-ficha="${f.token}">Revisar ficha</button><button type="button" class="small-btn" data-ficha-link="${f.token}">Copiar enlace privado</button></div></article>`).join('') || '<p class="muted">Todavía no hay fichas docentes para este evento.</p>'}</div></details>`;
    root.querySelector('details').addEventListener('toggle', e => { opened = e.target.open; });
    root.querySelector('[data-teacher-config]').onclick = configure;
    root.querySelector('[data-teacher-link]').onclick = () => copy(publicUrl());
    const close = root.querySelector('[data-teacher-close]');
    if (close) close.onclick = async () => { try { await updateDoc(doc(db, 'convocatoriasDocentes', event.id), { abierta:false, updatedAt:serverTimestamp(), updatedBy:user().email }); await getDocFromServer(doc(db,'convocatoriasDocentes',event.id)); toast('Inscripciones cerradas. Las fichas guardadas se conservan.'); } catch(e) { toast(e.message); } };
    root.querySelectorAll('[data-review-ficha]').forEach(b => b.onclick = () => review(b.dataset.reviewFicha));
    root.querySelectorAll('[data-ficha-link]').forEach(b => b.onclick = () => copy(fichaUrl(b.dataset.fichaLink)));
  }
  async function configure() {
    const selectedEvent = { ...event };
    const eventId = selectedEvent.id;
    const teachers = people().filter(p => p.tipo === 'Docente' && p.nombre?.trim());
    const available = new Map(teachers.map(p => [p.id, p.nombre]));
    Object.entries(config?.docentes || {}).forEach(([id,name]) => available.set(id,name));
    const closedEvent = ['Realizado','No realizado','Archivado'].includes(selectedEvent.estado);
    const deadline = config?.cierreAt ? dateLocal(config.cierreAt) : `${event.fechaInicio || new Date().toISOString().slice(0,10)}T23:59`;
    setModal(`<h3>Inscripciones docentes · ${esc(event.titulo)}</h3><p class="field-hint">Sólo se publican el nombre de la muestra, su fecha, lugar y los nombres de docentes habilitados.</p><div class="form-grid"><label class="check-card wide"><input type="checkbox" name="abierta" ${config?.abierta && !closedEvent ? 'checked' : ''} ${closedEvent ? 'disabled' : ''} />Abrir inscripciones</label><label class="wide">Fecha y hora de cierre (Bogotá)<input type="datetime-local" name="cierreAt" required value="${esc(deadline)}" /></label></div>${closedEvent ? '<p>Este evento está cerrado. Cambia su estado antes de abrir inscripciones.</p>' : ''}<fieldset class="form-section"><legend>Docentes habilitados</legend><div class="check-grid">${[...available].map(([id,name]) => `<label class="check-card"><input type="checkbox" name="docente" value="${esc(id)}" ${config?.docentes?.[id] ? 'checked' : ''} /><span>${esc(name)}</span></label>`).join('')}</div><label>Agregar otros nombres (uno por línea)<textarea name="otros" placeholder="Nombre completo del docente"></textarea></label><p class="field-hint">Puedes registrar docentes en la Base de personas o agregarlos aquí. No necesitan correo ni cuenta.</p></fieldset><p id="teacherConfigResult" role="status"></p>`, 'Guardar configuración');
    modalForm.onsubmit = async e => {
      e.preventDefault(); const result = modalForm.querySelector('#teacherConfigResult'); const button = modalForm.querySelector('[type="submit"]');
      const fd = new FormData(modalForm); const docentes = Object.fromEntries(fd.getAll('docente').map(id => [id, available.get(id)]));
      try {
        button.disabled = true; result.textContent = 'Guardando configuración…';
        for (const name of String(fd.get('otros') || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)) {
          if (name.length > 160) throw Error('Cada nombre admite hasta 160 caracteres.');
          if (Object.values(docentes).some(n => normalizarNombre(n) === normalizarNombre(name))) continue;
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizarNombre(name)));
          docentes['nombre-' + [...new Uint8Array(hash)].slice(0,16).map(v=>v.toString(16).padStart(2,'0')).join('')] = name;
        }
        const names=Object.values(docentes).map(normalizarNombre);
        if(new Set(names).size!==names.length)throw Error('Hay docentes con el mismo nombre. Habilita sólo un registro por docente.');
        const fecha = dateValue(fd.get('cierreAt')); const abierta = fd.has('abierta') && !closedEvent;
        if (abierta && (!Object.keys(docentes).length || fecha.toMillis() <= Date.now())) throw Error('Selecciona al menos un docente y una fecha de cierre futura.');
        const ref = doc(db,'convocatoriasDocentes',eventId);
        await setDoc(ref,{eventoId:eventId,titulo:selectedEvent.titulo || 'Muestra',fechaInicio:selectedEvent.fechaInicio || '',lugar:selectedEvent.lugar || '',abierta,cierreAt:fecha,docentes,updatedAt:serverTimestamp(),updatedBy:user().email});
        const saved = await getDocFromServer(ref);
        if (!saved.exists() || saved.data().abierta !== abierta) throw Error('No pude confirmar la configuración guardada.');
        result.textContent = 'Configuración guardada y verificada.'; toast(result.textContent); modal.close();
      } catch(error) { result.textContent = error.message; } finally { button.disabled = false; }
    };
  }
  async function reopen(token) {
    const deadline = dateLocal(Date.now()+48*3600000);
    setModal(`<h3>Reabrir ficha / solicitar ajustes</h3><label>Permitir correcciones hasta (Bogotá)<input type="datetime-local" name="hasta" value="${deadline}" required /></label><label>Indicaciones para el docente<textarea name="comentario" required maxlength="5000"></textarea></label><p id="reopenResult" role="status"></p>`, 'Reabrir ficha');
    modalForm.onsubmit = async e => { e.preventDefault(); const out=modalForm.querySelector('#reopenResult'); const button=modalForm.querySelector('[type="submit"]'); button.disabled=true;
      try { const fd=new FormData(modalForm); const until=dateValue(fd.get('hasta')); if(until.toMillis()<=Date.now())throw Error('Elige una fecha futura.'); const ref=doc(db,'fichasDocentes',token); await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists()||snap.data().revocada)throw Error('Esta ficha ya no está disponible.');tx.update(ref,{estado:'Requiere ajustes',reabiertaHasta:until,comentarioCoordinacion:String(fd.get('comentario')).trim(),revision:snap.data().revision+1,updatedAt:serverTimestamp()});}); await getDocFromServer(ref);toast('Ficha reabierta y correcciones guardadas.');await review(token); } catch(error){out.textContent=error.message;}finally{button.disabled=false;}
    };
  }
  async function recover(token) {
    if (!confirm('¿Generar un enlace privado nuevo? El anterior dejará de permitir consultar o editar esta ficha.')) return;
    try {
      const old=await loadFicha(token); const newToken=randomToken(); const oldRef=doc(db,'fichasDocentes',token);const newRef=doc(db,'fichasDocentes',newToken);const reserve=doc(db,'convocatoriasDocentes',old.ficha.eventoId,'reservas',old.ficha.docenteId);
      await runTransaction(db,async tx=>{ const [current,booking,...items]=await Promise.all([tx.get(oldRef),tx.get(reserve),...old.presentaciones.map(p=>tx.get(doc(oldRef,'presentaciones',p.id)))]);if(!current.exists()||current.data().revocada||current.data().revision!==old.ficha.revision||booking.data()?.fichaToken!==token)throw Error('La ficha cambió. Recarga antes de recuperar el enlace.');tx.set(newRef,{...current.data(),revocada:false,updatedAt:serverTimestamp()});items.forEach((snap,i)=>{if(!snap.exists())throw Error('Una presentación cambió. Recarga la ficha.');tx.set(doc(newRef,'presentaciones',old.presentaciones[i].id),snap.data());});tx.update(oldRef,{revocada:true,updatedAt:serverTimestamp()});tx.update(reserve,{fichaToken:newToken});});
      await loadFicha(newToken); await copy(fichaUrl(newToken)); toast('Nuevo enlace generado. El anterior quedó revocado.');await review(newToken);
    } catch(e){toast(e.message);}
  }
  async function review(token) {
    const eventId=event.id;
    setModal('<h3>Ficha docente</h3><p>Cargando respuestas guardadas…</p>',null);
    try {
      const loaded=await loadFicha(token); if(event?.id!==eventId||loaded.ficha.eventoId!==eventId)return;const f=loaded.ficha;
      const existing=(await getDocsFromServer(collection(db,'eventos',eventId,'muestras'))).docs.map(d=>({id:d.id,...d.data()}));
      const anteriores=inscripcionesAnteriores(f,loaded.presentaciones,existing);
      const cambioListado=anteriores.length ? `<aside class="teacher-duplicate-warning"><p>Estas inscripciones confirmadas ya no coinciden con la ficha: ${anteriores.map(r=>esc(r.estudianteGrupo)).join(', ')}. Puedes ajustarlas o eliminarlas desde Participantes antes de confirmar.</p><label class="check-card"><input type="checkbox" data-keep-previous />Conservar estas inscripciones anteriores en el evento</label></aside>` : '';
      const details=loaded.presentaciones.map((p,index)=>{
        const matches=coincidenciasPresentacion(p,existing); const linked=f.confirmaciones?.[p.id];
        const repetitions=propuestasRepetidas(p,loaded.presentaciones.slice(0,index));
        const linkedRow=matches.find(m=>m.row.id===linked)?.row || matches.find(m=>m.exacta)?.row;
        const eventArea=event.sistemaAnual?.areaArtisticaId || event.areaArtisticaId;
        const eventModality=event.sistemaAnual?.modalidadIds?.length===1 ? event.sistemaAnual.modalidadIds[0] : event.modalidadPresentacionId || event.familiaInstrumentalId || '';
        const defaultModality=linkedRow?.modalidadPresentacionId || linkedRow?.familiaInstrumentalId || (eventArea===p.areaArtisticaId ? eventModality : '');
        const modality=annual.modalityField({areaArtisticaId:p.areaArtisticaId,modalidadPresentacionId:defaultModality},p.areaArtisticaId).replace('name="modalidadPresentacionId"', `data-modality="${p.id}"`);
        return `<article class="teacher-review-card"><h4>${esc(p.estudianteGrupo || 'Sin nombre')} · ${esc(p.tipo)}</h4>${p.integrantesTexto ? `<p>${esc(p.integrantesTexto).replace(/\n/g,'<br>')}</p>` : ''}<p><strong>Actividad / repertorio:</strong> ${esc(p.repertorio)}</p><p>${esc(p.areaArtisticaId)} · ${p.areaArtisticaId === 'artes-plasticas' ? `${p.cantidadObras} obra(s)` : `${p.duracionMin} min`} · ${esc(p.instrumento)}</p><p><strong>Recursos:</strong> ${esc(p.recursos || 'Sin especificar')}</p>${p.materialUrl && /^https?:\/\//i.test(p.materialUrl) ? `<p><a href="${esc(p.materialUrl)}" target="_blank" rel="noopener noreferrer">Abrir material</a></p>` : ''}${Object.entries(camposInstruccion).filter(([k])=>p[k]).map(([k,label])=>`<p><strong>${label}:</strong> ${esc(p[k]).replace(/\n/g,'<br>')}</p>`).join('')}${f.estado !== 'Confirmado' ? `${modality}<label>Incorporar al evento<select data-target="${p.id}"><option value="">${matches.length ? 'Crear una presentación adicional (revisar coincidencias)' : 'Crear inscripción de esta presentación'}</option>${matches.filter(m=>m.exacta).map(m=>`<option value="${esc(m.row.id)}" ${linked===m.row.id?'selected':''}>Vincular a ${esc(m.row.estudianteGrupo)} · ${esc(m.row.repertorio || 'Sin repertorio')}</option>`).join('')}</select></label><label class="check-card"><input type="checkbox" data-update-presentation="${p.id}" />Actualizar repertorio, duración y recursos de la inscripción vinculada con esta propuesta</label>${matches.length || repetitions.length ? `<p class="teacher-duplicate-warning">Hay estudiantes presentes en otras inscripciones o propuestas: ${[...matches.map(m=>esc(m.row.estudianteGrupo)),...repetitions.map(r=>esc(r.estudianteGrupo))].join(', ')}. Vincula la ficha a una inscripción existente o confirma expresamente otra presentación.</p><label class="check-card"><input type="checkbox" data-additional="${p.id}" />Confirmo que corresponde a una presentación adicional</label>` : ''}` : ''}</article>`;
      }).join('');
      setModal(`<h3>Ficha de ${esc(f.docenteNombre)}</h3><p>${esc(f.estado)} · Asistirá: ${esc(f.asistencia)}</p><p><strong>Disponibilidad:</strong> ${esc(f.disponibilidad)}</p><p><strong>Apoyo:</strong> ${esc(f.apoyo)}</p><p><strong>Indicaciones generales:</strong> ${esc(f.indicacionesGenerales).replace(/\n/g,'<br>')}</p>${f.comentarioCoordinacion ? `<p><strong>Correcciones solicitadas:</strong> ${esc(f.comentarioCoordinacion)}</p>` : ''}<div class="actions"><a class="btn btn-light" href="${esc(fichaUrl(token))}" target="_blank" rel="noopener noreferrer">Ver / imprimir ficha</a><button type="button" class="btn btn-light" data-reopen>Reabrir / pedir ajustes</button><button type="button" class="btn btn-light" data-recover>Recuperar enlace privado</button></div>${f.estado !== 'Confirmado' ? cambioListado : ''}${details || '<p>Esta ficha todavía no tiene presentaciones.</p>'}<p id="reviewResult" role="status"></p>`,f.estado==='Confirmado' ? null : 'Confirmar e incorporar al evento');
      modalForm.querySelector('[data-reopen]').onclick=()=>reopen(token);modalForm.querySelector('[data-recover]').onclick=()=>recover(token);
      modalForm.onsubmit=async e=>{e.preventDefault();const out=modalForm.querySelector('#reviewResult');const button=modalForm.querySelector('[type="submit"]');button.disabled=true;out.textContent='Revisando coincidencias y guardando…';try{await confirmFicha(loaded,existing);out.textContent='Ficha confirmada e inscripciones verificadas.';toast(out.textContent);await review(token);}catch(error){out.textContent=error.message;}finally{button.disabled=false;}};
    } catch(e){setModal(`<h3>No pude cargar la ficha</h3><p role="alert">${esc(e.message)}</p>`,null);}
  }
  async function confirmFicha(loaded, existing) {
    const {token,ficha,presentaciones}=loaded;const errors=validarFichaParaConfirmar(ficha,presentaciones);if(errors.length)throw Error(errors.join(' '));
    const choices=presentaciones.map(p=>({p,target:modalForm.querySelector(`[data-target="${p.id}"]`)?.value || '',additional:Boolean(modalForm.querySelector(`[data-additional="${p.id}"]`)?.checked),updatePresentation:Boolean(modalForm.querySelector(`[data-update-presentation="${p.id}"]`)?.checked),modality:modalForm.querySelector(`[data-modality="${p.id}"]`)?.value || ''}));
    const targets=choices.filter(c=>c.target).map(c=>c.target);if(new Set(targets).size!==targets.length)throw Error('Dos propuestas no pueden vincularse a la misma inscripción. Revisa la selección.');
    const keepPrevious=Boolean(modalForm.querySelector('[data-keep-previous]')?.checked);
    if(inscripcionesAnteriores(ficha,presentaciones,existing).length&&!keepPrevious)throw Error('Revisa las inscripciones anteriores y confirma si deben conservarse.');
    for(const [index,c] of choices.entries()){if(!c.target&&(coincidenciasPresentacion(c.p,existing).length||propuestasRepetidas(c.p,presentaciones.slice(0,index)).length)&&!c.additional)throw Error(`Revisa la coincidencia de ${c.p.estudianteGrupo} y elige vincular o confirmar una presentación adicional.`);}
    const fichaRef=doc(db,'fichasDocentes',token);const collectionRef=collection(db,'eventos',ficha.eventoId,'muestras');
    const claimKeys=[...new Set(presentaciones.flatMap(nombresPresentacion).map(normalizarNombre))];
    const claimRefs=await Promise.all(claimKeys.map(async key=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));const id=[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');return doc(db,'eventos',ficha.eventoId,'inscripcionesDocentes',id);}));
    const confirmed=await runTransaction(db,async tx=>{
      const [current,ev,reservation,...docs]=await Promise.all([tx.get(fichaRef),tx.get(doc(db,'eventos',ficha.eventoId)),tx.get(doc(db,'convocatoriasDocentes',ficha.eventoId,'reservas',ficha.docenteId)),...presentaciones.map(p=>tx.get(doc(fichaRef,'presentaciones',p.id))),...existing.map(r=>tx.get(doc(collectionRef,r.id))),...choices.filter(c=>!c.target).map(c=>tx.get(doc(collectionRef,nuevasInscripcionesId(token,ficha.revision,c.p.id)))),...claimRefs.map(ref=>tx.get(ref))]);
      if(!current.exists()||current.data().revocada||current.data().revision!==ficha.revision||reservation.data()?.fichaToken!==token)throw Error('La ficha cambió. Vuelve a abrirla antes de confirmar.');
      if(!ev.exists()||['Realizado','No realizado','Archivado'].includes(ev.data().estado))throw Error('Este evento está cerrado.');
      if(inscripcionesAnteriores(current.data(),presentaciones,existing).length&&!keepPrevious)throw Error('Revisa las inscripciones anteriores.');
      const currentRows=docs.slice(presentaciones.length,presentaciones.length+existing.length).filter(d=>d.exists()).map(d=>({id:d.id,...d.data()}));
      const newCount=choices.filter(c=>!c.target).length;
      const newRows=docs.slice(presentaciones.length+existing.length,presentaciones.length+existing.length+newCount);
      const claimDocs=docs.slice(presentaciones.length+existing.length+newCount);
      const referencedIds=[...new Set(claimDocs.flatMap(s=>s.data()?.muestraIds || []))];
      const referencedRows=await Promise.all(referencedIds.map(id=>tx.get(doc(collectionRef,id))));
      const activeClaimIds=new Set(referencedRows.filter(s=>s.exists()).map(s=>s.id));
      const claims=claimDocs.map(s=>new Set((s.data()?.muestraIds || []).filter(id=>activeClaimIds.has(id))));
      let newIndex=0;const mapping={};
      choices.forEach((c,i)=>{
        if(!docs[i].exists()||docs[i].data().revision!==ficha.revision)throw Error('Las presentaciones cambiaron. Reabre la ficha.');
        const id=c.target || nuevasInscripcionesId(token,ficha.revision,c.p.id);const ref=doc(collectionRef,id);
        const keys=nombresPresentacion(c.p).map(normalizarNombre);
        if(c.target){const target=currentRows.find(r=>r.id===c.target);if(!target||!coincidenciasPresentacion(c.p,[target]).some(m=>m.exacta))throw Error('La inscripción a vincular cambió. Revisa de nuevo.');const instructions=instruccionesDocentes(ficha,c.p);const proposed=muestraDesdeFicha(ficha,c.p,students());proposed.modalidadPresentacionId=c.modality;annual.normalizeParticipant(proposed);const presentationChanges={};for(const field of ['areaArtisticaId','areaArtisticaNombre','area','modalidadPresentacionId','modalidadPresentacionNombre','instrumento','docente','repertorio','repertorios','duracionMin','recursos','nombrePresentacion','tituloObra','cantidadObras','familiaInstrumentalId','familiaInstrumentalNombre']){if(proposed[field]===undefined)continue;const empty=target[field]==null||target[field]===''||(Array.isArray(target[field])&&!target[field].length)||(field==='duracionMin'&&Number(target[field])===0);if(c.updatePresentation||empty)presentationChanges[field]=proposed[field];}tx.update(ref,{...presentationChanges,...(!target.fichaDocente||normalizarNombre(target.fichaDocente.docente)===normalizarNombre(ficha.docenteNombre)?{fichaDocente:instructions}:{}),[`fichasDocentes.${ficha.docenteId}`]:instructions,updatedAt:serverTimestamp(),updatedBy:user().email});}
        else{const duplicate=coincidenciasPresentacion(c.p,currentRows);const competing=keys.some(k=>claims[claimKeys.indexOf(k)].size);if((duplicate.length||competing)&&!c.additional)throw Error('Apareció otra inscripción coincidente. Recarga y revisa antes de confirmar.');const previous=newRows[newIndex++];if(previous.exists())throw Error('Esta propuesta ya tiene una inscripción. Vincula el registro existente.');const payload=muestraDesdeFicha(ficha,c.p,students());payload.modalidadPresentacionId=c.modality;annual.normalizeParticipant(payload);tx.set(ref,{...payload,fichasDocentes:{[ficha.docenteId]:payload.fichaDocente},createdAt:serverTimestamp(),createdByEmail:user().email,createdByName:user().displayName || user().email,updatedAt:serverTimestamp(),updatedBy:user().email});}
        keys.forEach(k=>claims[claimKeys.indexOf(k)].add(id));
        mapping[c.p.id]=id;
      });
      claimRefs.forEach((ref,i)=>tx.set(ref,{muestraIds:[...claims[i]],updatedAt:serverTimestamp()}));
      tx.update(fichaRef,{estado:'Confirmado',confirmaciones:mapping,confirmadaAt:serverTimestamp(),confirmadaBy:user().email,reabiertaHasta:null,revision:ficha.revision+1,updatedAt:serverTimestamp()});
      return mapping;
    });
    const saved=await getDocFromServer(fichaRef);if(saved.data()?.estado!=='Confirmado')throw Error('No pude verificar la confirmación.');
    const writes=await Promise.all(Object.values(confirmed).map(id=>getDocFromServer(doc(collectionRef,id))));if(writes.some(s=>!s.exists()))throw Error('No pude verificar todas las inscripciones.');
  }
  return { mount, stop };
}
