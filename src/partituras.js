import { app, db, doc, collection, getDocsFromServer, setDoc, deleteDoc, serverTimestamp } from './firebase-config.js?v=20261011-docentes';
import { getStorage, ref, uploadBytesResumable, getBlob, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

const storage=getStorage(app);
storage.setMaxUploadRetryTime(15000);
storage.setMaxOperationRetryTime(15000);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formats={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',musicxml:'application/xml',xml:'application/xml',mxl:'application/zip',mscz:'application/zip'};
const admins=['alekcaballeromusic@gmail.com','catalina.medina.leal@gmail.com','imusicala@gmail.com'];
function errorText(error){
  if(['storage/unauthorized','storage/unauthenticated'].includes(error.code))return 'Storage no autorizó la operación. Revisa la sesión y las reglas de Storage.';
  if(['storage/bucket-not-found','storage/project-not-found','storage/retry-limit-exceeded','storage/unknown'].includes(error.code))return 'No se pudo acceder a Firebase Storage. Verifica que esté activado el bucket muestras-de-proceso.firebasestorage.app y publica las reglas de storage.rules.';
  return 'No se pudo completar la operación. Revisa la conexión y vuelve a intentar.';
}
export function createScores({context,setModal,modalForm,modal,toast}){
  let uploading=false;
  function openUpload(){
    if(uploading){toast('Hay una carga en curso.');return;}
    const ctx=context(),eventId=ctx.event.id;
    setModal(`<h3>Subir partitura o documento</h3><p>PDF, imágenes, Word, MusicXML o MuseScore. Máximo 20 MB por archivo.</p><div class="form-grid"><label class="wide">Título<input name="titulo" required maxlength="200" placeholder="Nombre de la obra o partitura" /></label><label class="wide">Presentación<select name="participanteId"><option value="">General del evento</option>${ctx.presentations.map(p=>`<option value="${esc(p.id)}">${esc(p.estudianteGrupo)}</option>`).join('')}</select></label><label class="wide">Obra<input name="obra" maxlength="200" list="scoreWorks" placeholder="Elige una obra o escribe su nombre" /><datalist id="scoreWorks">${[...new Set(ctx.presentations.flatMap(p=>p.repertorios || [p.repertorio]).filter(Boolean))].map(w=>`<option value="${esc(w)}"></option>`).join('')}</datalist></label><label class="wide">Archivo<input type="file" name="archivo" required accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.musicxml,.xml,.mxl,.mscz" /></label><label class="wide">Notas<textarea name="notas" maxlength="3000"></textarea></label></div><p class="field-hint">Si Storage aún no está activo, podrás subir archivos después de habilitarlo y publicar sus reglas.</p><p id="scoreUploadStatus" role="status" aria-live="polite"></p>`, "Subir archivo");
    const cancel=modalForm.querySelector('[data-close]');cancel.onclick=()=>{if(!uploading)modal.close();};
    const closeWhileUploading=e=>{if(uploading)e.preventDefault();};modal.addEventListener('cancel',closeWhileUploading);
    modal.addEventListener('close',()=>modal.removeEventListener('cancel',closeWhileUploading),{once:true});
    modalForm.onsubmit=async e=>{
      e.preventDefault();if(uploading)return;
      const form=new FormData(modalForm),file=form.get('archivo'),ext=file?.name.split('.').pop().toLowerCase();
      if(!file?.size || file.size>20*1024*1024 || !formats[ext]){toast('Elige un archivo permitido de hasta 20 MB.');return;}
      const user=ctx.user,id=crypto.randomUUID(),path=`partituras/${eventId}/${user.uid}/${id}.${ext}`,object=ref(storage,path);
      const presentation=ctx.presentations.find(p=>p.id===form.get('participanteId'));
      const record={titulo:String(form.get('titulo')).trim(),obra:String(form.get('obra')).trim(),notas:String(form.get('notas')).trim(),participanteId:presentation?.id||'',presentacion:presentation?.estudianteGrupo||'',archivoNombre:file.name,storagePath:path,size:file.size,contentType:formats[ext],createdBy:user.email,createdAt:serverTimestamp()};
      uploading=true;modalForm.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
      const status=modalForm.querySelector('#scoreUploadStatus');let uploaded=false;
      try{
        await new Promise((resolve,reject)=>{const task=uploadBytesResumable(object,file,{contentType:formats[ext]});task.on('state_changed',s=>{status.textContent=`Subiendo: ${Math.round(s.bytesTransferred/s.totalBytes*100)} %`;},reject,resolve);});
        uploaded=true;status.textContent='Registrando archivo…';
        await setDoc(doc(db,'eventos',eventId,'partituras',id),record);
        uploading=false;modal.close();toast('Partitura guardada.');
      }catch(error){
        console.error(error);let cleanupFailed=false;
        if(uploaded)try{await deleteObject(object);}catch(cleanupError){cleanupFailed=true;console.error(cleanupError);}
        status.textContent=errorText(error)+(cleanupFailed?' El archivo se cargó, pero no se pudo registrar ni retirar. Revisa Storage antes de volver a subirlo.':'');
      }finally{uploading=false;modalForm.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);}
    };
  }
  function render(){const ctx=context();return `<h3>Partituras y archivos de las obras</h3><p class="field-hint">Archivos para el equipo autorizado del evento. Puedes asociarlos a una presentación y una obra. Máximo 20 MB por archivo.</p>${ctx.rows.length?`<div class="place-grid">${ctx.rows.map(row=>`<article class="info-box"><h4>${esc(row.titulo)}</h4><p>${esc([row.presentacion||'General del evento',row.obra].filter(Boolean).join(' · '))}</p><p>${esc(row.archivoNombre)} · ${(Number(row.size||0)/1048576).toFixed(1)} MB</p><p style="white-space:pre-wrap">${esc(row.notas)}</p><div class="actions"><button type="button" class="small-btn" data-score-download="${esc(row.id)}">Descargar</button>${admins.includes(ctx.user.email)?`<button type="button" class="small-btn danger" data-score-delete="${esc(row.id)}">Eliminar</button>`:''}</div></article>`).join('')}</div>`:'<p>No hay partituras cargadas. Usa + Subir archivo para agregar la primera.</p>'}`;}
  function mount(host){
    const ctx=context(),eventId=ctx.event.id;
    host.querySelectorAll('[data-score-download]').forEach(button=>button.onclick=async()=>{
      const row=ctx.rows.find(r=>r.id===button.dataset.scoreDownload);button.disabled=true;
      try{const blob=await getBlob(ref(storage,row.storagePath),20*1024*1024),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=row.archivoNombre||row.titulo;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){console.error(error);toast(errorText(error));}finally{button.disabled=false;}
    });
    host.querySelectorAll('[data-score-delete]').forEach(button=>button.onclick=async()=>{
      const row=ctx.rows.find(r=>r.id===button.dataset.scoreDelete);if(!confirm(`¿Eliminar el archivo «${row.titulo}»?`))return;button.disabled=true;
      try{try{await deleteObject(ref(storage,row.storagePath));}catch(error){if(error.code!=='storage/object-not-found')throw error;}await deleteDoc(doc(db,'eventos',eventId,'partituras',row.id));toast('Archivo eliminado.');}catch(error){console.error(error);toast(errorText(error));}finally{button.disabled=false;}
    });
  }
  async function removeEventFiles(eventId){
    if(!admins.includes(context().user.email))throw new Error('Solo los administradores pueden eliminar archivos del evento.');
    const snapshot=await getDocsFromServer(collection(db,'eventos',eventId,'partituras'));
    for(const record of snapshot.docs){
      const path=record.data().storagePath;
      if(!path?.startsWith(`partituras/${eventId}/`))continue;
      try{await deleteObject(ref(storage,path));}catch(error){if(error.code!=='storage/object-not-found')throw error;}
    }
  }
  return {openUpload,render,mount,removeEventFiles};
}
