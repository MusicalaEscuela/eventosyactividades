// Firebase and RIP are replaced with an in-memory adapter. No production writes.
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readFile, mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1500,height:1050}}), errors=[];
page.setDefaultTimeout(12000);
page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack);});
page.on('dialog',dialog=>dialog.accept());
// The existing adapter predates batch.update, used by the event editor for flat fields.
const fixture=(await readFile(fileURLToPath(new URL('./firebase-mock.js',import.meta.url)),'utf8'))
  .replace('export const writeBatch=()=>{const pending=[];return {','export const writeBatch=()=>{const pending=[];return {update:(ref,data)=>pending.push([ref,data,{merge:true}]),')
  .replace("export function onSnapshot(ref,fn){const l={ref,fn};listeners.add(l);queueMicrotask(()=>{if(listeners.has(l))fn(value(ref));});return()=>listeners.delete(l);}",`export function onSnapshot(ref,fn,onError){
    if(window.aforoDeniedPaths?.includes(ref.path)){
      queueMicrotask(()=>onError?.(Object.assign(new Error('Simulated denied attendance read'),{code:'permission-denied'})));
      return()=>{};
    }
    const listener={ref,fn:null};
    listener.fn=snapshot=>{
      if(window.aforoDelayedPaths?.includes(ref.path)){
        (window.aforoDeferredSnapshots ||= new Map()).set(listener,()=>{if(listeners.has(listener))fn(value(ref));});
        return;
      }
      fn(snapshot);
    };
    listeners.add(listener);
    queueMicrotask(()=>{if(listeners.has(listener))listener.fn(value(ref));});
    return()=>{listeners.delete(listener);window.aforoDeferredSnapshots?.delete(listener);};
  }`);
// App modules import both versioned and unversioned URLs; keep one database instance.
await page.route('**/src/firebase-config.js*',route=>route.fulfill({contentType:'text/javascript',body:new URL(route.request().url()).search ? "export * from './firebase-config.js';" : fixture}));
await page.route('**/src/rip-config.js*',route=>route.fulfill({contentType:'text/javascript',body:`export const ripSignIn=async()=>{};export const ripSignOut=async()=>{};export const ripRestoreSession=async()=>({email:'prueba@musicala.co'});export const ripCurrentUser=()=>({email:'prueba@musicala.co'});export const ripFetchEstudiantes=async()=>[];export const ripNorm=x=>String(x||'').toLowerCase();export const RIP_ALLOWED_EMAILS=[];`}));
await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
// Attendance does not use Storage; avoid a remote SDK request in this isolated suite.
await page.route('https://www.gstatic.com/firebasejs/*/firebase-storage.js',route=>route.fulfill({contentType:'text/javascript',body:`export const getStorage=()=>({});export const ref=(...args)=>({args});export const uploadBytesResumable=()=>{throw new Error('Storage write outside attendance test');};export const getBlob=async()=>{throw new Error('Storage read outside attendance test');};export const deleteObject=async()=>{throw new Error('Storage delete outside attendance test');};`}));

const record=path=>page.evaluate(path=>window.testStore.get(path),path);
const sheet=()=>page.locator('[data-event-ficha]');
async function assertTotal(expected,scope=sheet()) {
  await page.waitForFunction(({expected,selector})=>{
    const node=document.querySelector(selector);
    return node && Number(node.textContent.trim())===expected;
  },{expected,selector:await scope.evaluate(element=>element.hasAttribute('data-event-ficha') ? '[data-event-ficha] [data-chair-total]' : '[data-attendance-summary] [data-chair-total]')});
  assert.equal(Number(await scope.locator('[data-chair-total]').first().innerText()),expected);
}
async function openEvent(id='aforo-test') {
  await page.locator(`[data-event-id="${id}"]`).click();
  await sheet().waitFor();
}
async function editEvent() {
  await page.locator('[data-action="edit-event"]').first().click();
  await page.locator('#modalForm [name="sillasModo"]').waitFor();
}

try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.testStore);
  await page.locator('#loginBtn').click();
  await page.evaluate(()=>{
    const put=(path,data)=>window.testStore.set(path,data);
    put('eventos/aforo-test',{titulo:'Muestra confirmada de piano',tipo:'Evento',estado:'Planeación',actividadesComunesVersion:1,lugar:'Sala de prueba',fechaInicio:'2026-11-03',horaInicio:'17:00',publico:'Familias y estudiantes',publicoAdicionalCantidad:4,ventiladoresCantidad:2,responsable:'Coordinación'});
    put('lugares/sala-prueba',{nombre:'Sala de prueba',capacidad:11});
    const person=(id,data)=>put('eventos/aforo-test/muestras/'+id,{estudianteGrupo:id,area:'Música',estado:'Pendiente',invitacionEstado:'Aceptada',repertorios:['Obra '+id],...data});
    person('ana-1',{studentId:'ana',estudianteGrupo:'Ana Piano',tieneInvitados:true,invitadosCantidad:2});
    person('ana-2',{studentId:'ana',estudianteGrupo:'Ana Piano',tieneInvitados:true,invitadosCantidad:2});
    person('carol',{studentId:'carol',estudianteGrupo:'Carol Canto',tieneInvitados:true,invitadosCantidad:1});
    person('bruno',{studentId:'bruno',estudianteGrupo:'Bruno por confirmar',invitacionEstado:'Enviada',estado:'Listo'});
    person('rechazada',{studentId:'rechazada',estudianteGrupo:'Persona que no asistirá',invitacionEstado:'Rechazada',estado:'Confirmado',tieneInvitados:true,invitadosCantidad:9});
    person('cancelada',{studentId:'cancelada',estudianteGrupo:'Participación cancelada',estado:'Cancelado',tieneInvitados:true,invitadosCantidad:8});
    person('ensamble',{esEnsamble:true,estudianteGrupo:'Ensamble de Ana y Carol',integrantes:[{studentId:'ana',participanteId:'ana-1',nombre:'Ana Piano'},{studentId:'carol',participanteId:'carol',nombre:'Carol Canto'}]});
    put('eventos/aforo-test/equipo/carlos-sonido',{nombre:'Carlos Técnico',rol:'Sonido',estado:'Confirmado'});
    put('eventos/aforo-test/equipo/carlos-montaje',{nombre:'Carlos Técnico',rol:'Montaje',estado:'Confirmado'});
    put('eventos/aforo-test/equipo/dana',{nombre:'Dana pendiente',rol:'Recepción',estado:'Pendiente'});
    put('eventos/aforo-test/equipo/elena',{nombre:'Elena no disponible',rol:'Apoyo',estado:'No disponible'});
    put('eventos/legacy-zero',{titulo:'Evento anterior con cero manual',tipo:'Evento',estado:'Planeación',actividadesComunesVersion:1,sillasCantidad:0,publico:'Sin público adicional'});
    put('eventos/loading-test',{titulo:'Evento con equipo por cargar',tipo:'Evento',estado:'Planeación',actividadesComunesVersion:1,publicoAdicionalCantidad:0});
    put('eventos/loading-test/muestras/unique',{studentId:'loading-student',estudianteGrupo:'Estudiante de otro evento',invitacionEstado:'Aceptada'});
    put('eventos/loading-test/equipo/unique',{nombre:'Apoyo de otro evento',estado:'Confirmado'});
    put('eventos/read-error-test',{titulo:'Evento con lectura incompleta',tipo:'Evento',estado:'Planeación',actividadesComunesVersion:1,publicoAdicionalCantidad:2});
    put('eventos/read-error-test/muestras/unique',{studentId:'error-student',estudianteGrupo:'Estudiante con lectura incompleta',invitacionEstado:'Aceptada'});
    put('eventos/read-error-test/equipo/unique',{nombre:'Apoyo con lectura incompleta',estado:'Confirmado'});
  });
  const beforeOpen=await record('eventos/aforo-test');
  await openEvent();
  assert.equal(await page.locator('[data-tab="ficha"]').getAttribute('class').then(value=>value.includes('active')),true,'Selecting an event opens its information sheet.');
  await assertTotal(10);
  assert.equal(Number(await sheet().locator('[data-attendance-part="estudiantes"]').innerText()),2);
  assert.equal(Number(await sheet().locator('[data-attendance-part="equipo"]').innerText()),1);
  assert.equal(Number(await sheet().locator('[data-attendance-part="invitados"]').innerText()),3);
  assert.equal(Number(await sheet().locator('[data-attendance-part="publico"]').innerText()),4);
  assert.deepEqual(await record('eventos/aforo-test'),beforeOpen,'Opening and calculating must not write derived totals to the event.');

  // A delayed collection must show an unknown total, never zero or the prior event's 10.
  const beforeLoading=await record('eventos/loading-test');
  await page.evaluate(()=>{window.aforoDelayedPaths=['eventos/loading-test/equipo'];});
  await openEvent('loading-test');
  assert.equal(await sheet().locator('[data-chair-total]').innerText(),'…');
  assert.equal(await page.locator('[data-event-seats]').innerText(),'Calculando…');
  assert.equal(await sheet().locator('[data-attendance-part="estudiantes"]').innerText(),'…','A partial read must not present a completed breakdown.');
  await editEvent();
  assert.equal(await page.locator('[name="sillasCantidad"]').inputValue(),'');
  assert.equal(await page.locator('[name="sillasCantidad"]').evaluate(input=>input.readOnly),true);
  await page.evaluate(()=>{
    window.aforoDelayedPaths=[];
    for(const deliver of window.aforoDeferredSnapshots.values())deliver();
    window.aforoDeferredSnapshots.clear();
  });
  await page.waitForFunction(()=>document.querySelector('#modalForm [name="sillasCantidad"]')?.value==='2');
  await page.locator('#modalForm [data-close]').click();
  await assertTotal(2);
  assert.deepEqual(await record('eventos/loading-test'),beforeLoading);

  // Permission failure is also an unknown calculation; resubscribing recovers cleanly.
  const beforeReadError=await record('eventos/read-error-test');
  await page.evaluate(()=>{window.aforoDeniedPaths=['eventos/read-error-test/equipo'];});
  await openEvent('read-error-test');
  await page.waitForFunction(()=>document.querySelector('[data-event-seats]')?.textContent==='No disponible');
  assert.equal(await sheet().locator('[data-chair-total]').innerText(),'…');
  assert.match(await sheet().innerText(),/Cálculo no disponible/);
  await editEvent();
  assert.equal(await page.locator('[name="sillasCantidad"]').inputValue(),'');
  await page.locator('#modalForm [data-close]').click();
  assert.deepEqual(await record('eventos/read-error-test'),beforeReadError);
  await page.evaluate(()=>{window.aforoDeniedPaths=[];});
  await openEvent('read-error-test');
  await assertTotal(4);
  await openEvent();
  await assertTotal(10);

  // The same live total is visible wherever production and attendance are managed.
  for (const tab of ['muestras','equipo','rider','checklist','programacion']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    const summary=page.locator('[data-attendance-summary]').first();
    await summary.waitFor();
    await assertTotal(10,summary);
  }
  await page.locator('[data-tab="ficha"]').click();
  await editEvent();
  assert.equal(await page.locator('[name="sillasModo"]').inputValue(),'automatico');
  assert.equal(await page.locator('[name="sillasCantidad"]').inputValue(),'10');
  assert.equal(await page.locator('[name="sillasCantidad"]').evaluate(input=>input.readOnly),true);
  await page.locator('[name="publicoAdicionalCantidad"]').fill('6');
  await page.locator('[name="sillasCantidad"]').evaluate(input=>{if(input.value!=='12')throw new Error('Expected live chair preview 12, got '+input.value);});
  await page.evaluate(()=>{const path='eventos/aforo-test/equipo/dana';window.testStore.set(path,{...window.testStore.get(path),estado:'Confirmado'});});
  await page.waitForFunction(()=>document.querySelector('#modalForm [name="sillasCantidad"]')?.value==='13');
  assert.equal(await page.locator('[name="publicoAdicionalCantidad"]').inputValue(),'6','A live confirmation must not discard the open event draft.');
  await page.evaluate(()=>{const path='eventos/aforo-test/equipo/dana';window.testStore.set(path,{...window.testStore.get(path),estado:'Pendiente'});});
  await page.waitForFunction(()=>document.querySelector('#modalForm [name="sillasCantidad"]')?.value==='12');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.waitForFunction(()=>window.testStore.get('eventos/aforo-test').publicoAdicionalCantidad===6);
  await assertTotal(12);
  await mkdir('tests/artifacts',{recursive:true});
  await page.evaluate(()=>document.querySelectorAll('.toast').forEach(toast=>toast.remove()));
  await page.screenshot({path:'tests/artifacts/evento-aforo-automatico.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'tests/artifacts/evento-aforo-automatico-mobile.png',fullPage:true});
  await page.setViewportSize({width:1500,height:1050});

  // Reload proves settings persist while totals continue to derive from confirmed people.
  await page.reload();
  await openEvent();
  await assertTotal(12);
  assert.equal((await record('eventos/aforo-test')).sillasModo,'automatico');
  const beforeConfirmation=await record('eventos/aforo-test');
  await page.evaluate(()=>{const path='eventos/aforo-test/muestras/bruno';window.testStore.set(path,{...window.testStore.get(path),invitacionEstado:'Aceptada'});});
  await assertTotal(13);
  assert.deepEqual(await record('eventos/aforo-test'),beforeConfirmation,'A participant confirmation updates the display without rewriting the parent event.');

  // Explicit manual numbers remain authoritative while showing the automatic suggestion.
  await editEvent();
  await page.locator('[name="sillasModo"]').selectOption('manual');
  await page.locator('[name="sillasCantidad"]').fill('20');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.waitForFunction(()=>window.testStore.get('eventos/aforo-test').sillasCantidad===20);
  await assertTotal(20);
  await page.evaluate(()=>{const path='eventos/aforo-test/equipo/dana';window.testStore.set(path,{...window.testStore.get(path),estado:'Confirmado'});});
  await assertTotal(20);
  assert.equal((await record('eventos/aforo-test')).sillasModo,'manual');

  await openEvent('legacy-zero');
  await assertTotal(0);
  await editEvent();
  assert.equal(await page.locator('[name="sillasModo"]').inputValue(),'manual');
  assert.equal(await page.locator('[name="sillasCantidad"]').inputValue(),'0');
  await page.locator('#modalForm [data-close]').click();
  assert.equal((await record('eventos/legacy-zero')).sillasCantidad,0,'A legacy zero is a valid manual value.');
  await openEvent();
  await assertTotal(20);

  // Exercise the real printable DOM while replacing the browser's print dialog.
  await page.evaluate(()=>{
    const nativeOpen=window.open.bind(window);
    window.open=(...args)=>{const opened=nativeOpen(...args);if(opened)opened.print=()=>{opened.__aforoPrintCalled=true;};return opened;};
  });
  const printPopup=page.waitForEvent('popup');
  await page.locator('[data-action="print-ficha"]').click();
  const popup=await printPopup;
  await popup.waitForLoadState('domcontentloaded');
  assert.match(await popup.locator('body').innerText(),/Muestra confirmada de piano/);
  assert.match(await popup.locator('body').innerText(),/20/);
  await popup.close();

  await mkdir('tests/artifacts',{recursive:true});
  await page.evaluate(()=>document.querySelectorAll('.toast').forEach(toast=>toast.remove()));
  await page.screenshot({path:'tests/artifacts/evento-aforo-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'The information sheet must fit the mobile viewport.');
  await page.screenshot({path:'tests/artifacts/evento-aforo-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: confirmed-only deduplication, default event sheet, shared totals, delayed/denied reads without false totals, live calculation/settings/reload, manual legacy zero, event isolation, printable sheet and mobile without JavaScript errors.');
} catch(error) {
  await mkdir('tests/artifacts',{recursive:true});
  await page.screenshot({path:'tests/artifacts/evento-aforo-failure.png',fullPage:true});
  console.error((await page.locator('body').innerText()).slice(0,4500));
  throw error;
} finally { await browser.close(); }
