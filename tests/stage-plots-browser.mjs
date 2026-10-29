// All Firebase/RIP traffic is intercepted. This suite never writes production.
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readFile, mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1600,height:1100}}), errors=[];
page.setDefaultTimeout(12000);
page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack);});
page.on('console',message=>{if(message.type()==='error')console.error('BROWSER:',message.text());});
page.on('requestfailed',request=>{if(request.failure()?.errorText!=='net::ERR_ABORTED')console.error('REQUEST FAILED:',request.url(),request.failure()?.errorText);});
page.on('dialog',dialog=>dialog.accept());
const fixture=await readFile(fileURLToPath(new URL('./firebase-mock.js',import.meta.url)),'utf8');
const transactionFaultFixture=fixture
  .replace('export async function runTransaction(db,fn){','export async function runTransaction(db,fn){if(window.stageTestFailure){window.stageTestFailure=false;throw new Error("simulated-save-failure");}')
  .replace('emit();return result;}', 'emit();if(window.stageSaveDelayMs)await new Promise(resolve=>setTimeout(resolve,window.stageSaveDelayMs));return result;}');
// Versioned imports must share one adapter instance, just as Firebase shares its app/database.
await page.route('**/src/firebase-config.js*',route=>route.fulfill({contentType:'text/javascript',body:new URL(route.request().url()).search ? "export * from './firebase-config.js';" : transactionFaultFixture}));
await page.route('**/src/rip-config.js*',route=>route.fulfill({contentType:'text/javascript',body:`export const ripSignIn=async()=>{};export const ripSignOut=async()=>{};export const ripRestoreSession=async()=>({email:'prueba@musicala.co'});export const ripCurrentUser=()=>({email:'prueba@musicala.co'});export const ripFetchEstudiantes=async()=>[];export const ripNorm=x=>String(x||'').toLowerCase();export const RIP_ALLOWED_EMAILS=[];`}));

async function editor(){
  await page.locator('#stageEditorFrame').waitFor();
  const frame=await page.locator('#stageEditorFrame').contentFrame();
  await frame.locator('#stage').waitFor();
  await frame.locator('body').evaluate(()=>Boolean(window.stageEditor));
  await page.waitForFunction(()=>document.querySelector('#stageEditorFrame')?.contentWindow?.stageEditor);
  return page.frames().find(frame=>frame.url().includes('/stage-editor/index.html'));
}
async function selectPresentation(id){
  await page.locator('#stagePresentation').selectOption(id);
  const frame=await editor();
  await frame.waitForFunction(()=>window.stageEditor.getProject().elements.length>0);
  return frame;
}
const storedPlot=id=>page.evaluate(id=>window.testStore.get('eventos/stage-test').stagePlots?.[id],id);

try{
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
  await page.waitForFunction(()=>window.testStore);
  await page.locator('#loginBtn').click();
  await page.evaluate(()=>{
    window.testStore.set('eventos/stage-test',{titulo:'Concierto de prueba Stage Plot',tipo:'Evento',estado:'Planeación',stagePlots:{a:{version:1,nodes:[{id:'person:a',kind:'person',name:'Ana Piano',detail:'Piano',x:22,y:31},{id:'resource:silla sin brazos',kind:'resource',name:'Silla sin brazos',quantity:3,detail:'',x:32,y:41}],notes:'Montaje anterior preservado'}}});
    window.testStore.set('eventos/stage-test/muestras/a',{estudianteGrupo:'Ana Piano',instrumento:'Piano',area:'Música',estado:'Pendiente',recursosSeleccionados:['Silla sin brazos'],repertorios:['Obra de piano']});
    window.testStore.set('eventos/stage-test/muestras/b',{estudianteGrupo:'Bruno Guitarra',instrumento:'Guitarra eléctrica',area:'Música',estado:'Pendiente',recursosSeleccionados:['Atril'],repertorios:['Obra de guitarra']});
  });
  await page.locator('[data-event-id="stage-test"]').click();
  await page.locator('[data-tab="rider"]').click();
  let frame=await selectPresentation('a');
  assert.equal((await storedPlot('a')).version,1,'Opening a legacy plot must not silently write a migration.');
  let project=await frame.evaluate(()=>window.stageEditor.getProject());
  assert.ok(project.elements.some(element=>element.name==='Ana Piano'));
  assert.ok(project.elements.some(element=>element.name==='Silla sin brazos' && element.quantity===3));
  assert.equal(await page.locator('#stageNotes').inputValue(),'Montaje anterior preservado');

  // A real editor mutation must reach the event draft, including cable and checklist data.
  const connectedIds=await frame.evaluate(()=>{
    const chair=state.elements.find(element=>element.name==='Silla sin brazos');
    chair.x=407;chair.y=283;chair.quantity=4;
    const microphone=addElement('mic_dynamic',180,470,{name:'Micrófono prueba persistente'});
    const mixer=addElement('mixer',650,470,{name:'Consola prueba persistente',channels:6});
    saveChecks({'Silla sin brazos::ida':true});
    saveQty({'Silla sin brazos':2});
    renderAll();autoSave();
    return {microphone:microphone.id,mixer:mixer.id};
  });
  await frame.locator('#btn-connect').click();
  await frame.locator(`[data-element-id="${connectedIds.microphone}"][data-port-id="out_xlr"]`).click();
  await frame.locator(`[data-element-id="${connectedIds.mixer}"][data-port-id="in_1"]`).click();
  assert.equal((await frame.evaluate(()=>window.stageEditor.getProject())).cables.length,1);
  await frame.locator('#btn-select').click();
  await frame.locator(`#ec-${connectedIds.mixer} .el-name`).dblclick();
  await frame.locator('#modal-channels').fill('6');
  await frame.locator('#modal-channels').dispatchEvent('input');
  await frame.locator('[data-ch="2"]').selectOption('trs');
  await frame.locator('#modal-device-options [data-key="phantom"]').uncheck();
  await frame.locator('#modal-save').click();
  await page.locator('#stageNotes').fill('Instrucciones técnicas guardadas con el evento.');
  assert.equal(await frame.locator('#project-notes').inputValue(),'Instrucciones técnicas guardadas con el evento.');
  await frame.locator('#project-notes-wrap').evaluate(element=>{element.open=true;});
  await frame.locator('#project-notes').fill('Notas sincronizadas desde el editor.');
  assert.equal(await page.locator('#stageNotes').inputValue(),'Notas sincronizadas desde el editor.');
  await page.locator('#stageNotes').fill('Instrucciones técnicas guardadas con el evento.');
  // A live snapshot may replace the iframe before Firestore confirms the write.
  await page.evaluate(()=>{window.stageSaveDelayMs=700;});
  await page.locator('[data-stage-save]').click();
  await page.waitForFunction(()=>window.testStore.get('eventos/stage-test').stagePlots.a.version===2);
  await page.waitForFunction(()=>document.querySelector('#stageEditorFrame')?.dataset.loaded==='1' && !document.querySelector('[data-stage-save]').disabled);
  assert.equal(await page.evaluate(()=>document.querySelector('#stageEditorFrame').contentWindow.stageEditor.busy),false,'A replacement iframe must unlock when its pending save resolves.');
  await page.evaluate(()=>{window.stageSaveDelayMs=0;});
  const savedA=await storedPlot('a');
  assert.equal(savedA.patch.cables.length,1);
  assert.equal(savedA.patch.checks['Silla sin brazos::ida'],true);
  assert.equal(savedA.patch.quantities['Silla sin brazos'],2);
  const savedMixer=savedA.patch.elements.find(element=>element.id===connectedIds.mixer);
  assert.equal(savedMixer.channels,6);
  assert.equal(savedMixer.channelTypes[1],'trs');
  assert.equal(savedMixer.opts.phantom,false);
  assert.equal(savedA.notes,'Instrucciones técnicas guardadas con el evento.');
  assert.ok(savedA.patch.elements.some(element=>element.name==='Silla sin brazos' && element.quantity===4 && element.x===407));

  // Scope and unsaved drafts remain independent across presentation changes.
  frame=await selectPresentation('b');
  project=await frame.evaluate(()=>window.stageEditor.getProject());
  assert.equal(project.cables.length,0);
  assert.deepEqual(project.checks,{});
  assert.ok(!project.elements.some(element=>element.name==='Micrófono prueba persistente'));
  await frame.evaluate(()=>addElement('music_stand',250,350,{name:'Atril sólo de Bruno'}));
  frame=await selectPresentation('a');
  assert.equal((await frame.evaluate(()=>window.stageEditor.getProject())).cables.length,1);
  frame=await selectPresentation('b');
  assert.ok((await frame.evaluate(()=>window.stageEditor.getProject())).elements.some(element=>element.name==='Atril sólo de Bruno'));
  await page.locator('[data-stage-save]').click();
  await page.waitForFunction(()=>window.testStore.get('eventos/stage-test').stagePlots.b?.patch.elements.some(element=>element.name==='Atril sólo de Bruno'));

  // Reload the entire app to exercise persisted v2 hydration rather than in-memory drafts.
  await page.reload();
  await page.locator('[data-event-id="stage-test"]').click();
  await page.locator('[data-tab="rider"]').click();
  frame=await selectPresentation('a');
  project=await frame.evaluate(()=>window.stageEditor.getProject());
  assert.equal(project.cables.length,1);
  assert.equal(project.checks['Silla sin brazos::ida'],true);
  assert.ok(project.elements.some(element=>element.x===407 && element.quantity===4));
  const cablesBeforeArrange=project.cables;
  await frame.locator('#btn-arrange').click();
  project=await frame.evaluate(()=>window.stageEditor.getProject());
  assert.deepEqual(project.cables,cablesBeforeArrange,'Ordering must retain all connections.');
  const orderedChair=project.elements.find(element=>element.name==='Silla sin brazos');
  assert.equal(orderedChair.quantity,4);
  assert.notEqual(orderedChair.x,407,'Manual coordinates change only after an explicit arrange action.');
  await frame.locator('#btn-save').click();
  await page.waitForFunction(()=>window.testStore.get('eventos/stage-test').stagePlots.a.patch.elements.find(element=>element.name==='Silla sin brazos').x!==407);

  // Failed saves keep the draft available for a successful retry.
  frame=await editor();
  await frame.evaluate(()=>addElement('monitor_floor',440,720,{name:'Monitor conservar tras fallo'}));
  await page.evaluate(()=>{window.stageTestFailure=true;});
  await page.locator('[data-stage-save]').click();
  await page.locator('#stageSaveState').getByText('No se pudo guardar el montaje.',{exact:false}).waitFor();
  frame=await editor();
  assert.ok((await frame.evaluate(()=>window.stageEditor.getProject())).elements.some(element=>element.name==='Monitor conservar tras fallo'));
  await page.locator('[data-stage-save]').click();
  await page.waitForFunction(()=>window.testStore.get('eventos/stage-test').stagePlots.a.patch.elements.some(element=>element.name==='Monitor conservar tras fallo'));

  // Concurrent updates must never be replaced by an older local base.
  frame=await editor();
  await frame.evaluate(()=>addElement('stand_mic_boom',260,720,{name:'Cambio local en conflicto'}));
  await page.evaluate(()=>{const event=window.testStore.get('eventos/stage-test');event.stagePlots.a.notes='Cambio remoto que debe conservarse';event.stagePlots.a.patch.notes=event.stagePlots.a.notes;window.testStore.set('eventos/stage-test',event);});
  await page.locator('[data-stage-save]').click();
  await page.locator('#stageSaveState').getByText('Otra persona cambió este montaje.',{exact:false}).waitFor();
  assert.equal((await storedPlot('a')).notes,'Cambio remoto que debe conservarse');
  frame=await editor();
  assert.ok((await frame.evaluate(()=>window.stageEditor.getProject())).elements.some(element=>element.name==='Cambio local en conflicto'));
  await page.locator('[data-stage-reload]').click();
  frame=await editor();
  assert.ok(!(await frame.evaluate(()=>window.stageEditor.getProject())).elements.some(element=>element.name==='Cambio local en conflicto'));
  assert.equal(await page.locator('#stageNotes').inputValue(),'Cambio remoto que debe conservarse');

  await frame.evaluate(()=>{window.print=()=>{window.stagePrintCalled=true;};});
  await page.locator('[data-stage-print]').click();
  assert.equal(await frame.evaluate(()=>Boolean(window.stagePrintCalled)),true);
  assert.match(await frame.locator('#print-inputlist').innerText(),/Micrófono prueba persistente/);
  assert.match(await frame.locator('#print-materials').innerText(),/Silla sin brazos/);
  assert.equal(await frame.locator('#print-notes').innerText(),'Cambio remoto que debe conservarse');

  // Complete source editor tools remain reachable, and JSON contains scoped checklist data.
  await frame.locator('#btn-validate').click();
  await frame.locator('[data-tab="inputlist"]').click();
  await frame.locator('[data-tab="materials"]').click();
  await frame.locator('[data-tab="checklist"]').click();
  const downloadEvent=page.waitForEvent('download');
  await frame.locator('#btn-export-json').click();
  const download=await downloadEvent;
  const downloadedProject=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(downloadedProject.cables.length,1);
  assert.equal(downloadedProject.checks['Silla sin brazos::ida'],true);

  const hostileName='<img src=x onerror="window.stageImportExecuted=true">';
  await frame.locator('#import-file').setInputFiles({name:'montaje-importado.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({name:'Proyecto importado de prueba',version:'2.0',elements:[{id:'import-chair',typeId:'chair',x:130,y:140,name:hostileName,notes:'Texto literal',quantity:2}],cables:[],checks:{'Importado::ida':true},quantities:{Importado:1}}))});
  await frame.waitForFunction(()=>window.stageEditor.getProject().name==='Proyecto importado de prueba');
  assert.equal(await frame.locator('.el-name').textContent(),hostileName,'Imported names must render as literal text.');
  assert.equal(await frame.evaluate(()=>Boolean(window.stageImportExecuted)),false);
  await frame.locator('#template-select').selectOption('rehearsal');
  project=await frame.evaluate(()=>window.stageEditor.getProject());
  assert.ok(project.elements.length>1);
  assert.deepEqual(project.checks,{},'A new template must start its own checklist.');
  assert.deepEqual(project.quantities,{});
  await page.locator('[data-stage-reload]').click();
  frame=await editor();

  await mkdir('tests/artifacts',{recursive:true});
  await page.locator('#stageEditorFrame').scrollIntoViewIfNeeded();
  await frame.locator('#btn-plan').click();
  await page.evaluate(()=>document.querySelectorAll('.toast').forEach(toast=>toast.remove()));
  await frame.evaluate(()=>document.querySelector('#app-toast')?.remove());
  await page.screenshot({path:'tests/artifacts/stage-plots-desktop.png',fullPage:true});
  await page.locator('#stageEditorFrame').screenshot({path:'tests/artifacts/stage-plots-editor-plan.png'});
  await frame.locator('#btn-connect').click();
  await page.locator('#stageEditorFrame').screenshot({path:'tests/artifacts/stage-plots-editor-connections.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Events page must not overflow on mobile.');
  frame=await editor();
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Embedded editor must not overflow on mobile.');
  await frame.locator('#btn-plan').click();
  await frame.locator('#btn-fit').click();
  await page.screenshot({path:'tests/artifacts/stage-plots-mobile.png',fullPage:true});
  await page.locator('#stageEditorFrame').screenshot({path:'tests/artifacts/stage-plots-editor-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: legacy migration, event persistence/reload, scoped cables/checklist/quantities, independent drafts, save failure retry, concurrency conflict, UI port connections/channel options, arranging, notes synchronization, print, JSON import/export, templates, literal imported HTML, desktop/mobile and zero JavaScript errors.');
}catch(error){
  await mkdir('tests/artifacts',{recursive:true});
  await page.screenshot({path:'tests/artifacts/stage-plots-failure.png',fullPage:true});
  console.error((await page.locator('body').innerText()).slice(0,4000));
  throw error;
}finally{
  await browser.close();
}
