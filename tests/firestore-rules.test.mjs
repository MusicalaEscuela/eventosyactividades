import assert from 'node:assert/strict';
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8187',project='demo-muestras-anual';
const base=`http://${host}/v1/projects/${project}/databases/(default)/documents`;
const jwt=email=>{const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return `${enc({alg:'none',typ:'JWT'})}.${enc({aud:project,iss:`https://securetoken.google.com/${project}`,sub:'test-'+email,user_id:'test-'+email,email,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'google.com'}})}.`;};
const request=async(path,method,email,data)=>{const headers={'Content-Type':'application/json'};if(email)headers.Authorization=`Bearer ${jwt(email)}`;return fetch(base+'/'+path,{method,headers,body:data?JSON.stringify(data):undefined});};
const editor='adminmusicala@gmail.com',admin='alekcaballeromusic@gmail.com';
const body={fields:{descripcion:{stringValue:'Prueba'}}};
for(const p of ['configuracion/muestrasProceso','configuracion/muestrasProceso/anios/2026']){
 let r=await request(p,'PATCH',editor,body);assert.equal(r.status,200,await r.text());
 assert.equal((await request(p,'GET',editor)).status,200);
 assert.equal((await request(p,'GET',null)).status,403);
 assert.equal((await request(p,'GET','externo@example.com')).status,403);
 assert.equal((await request(p,'DELETE',editor)).status,403);
 assert.equal((await request(p,'DELETE',admin)).status,200);
}
let r=await request('configuracion/muestrasProceso/historial/h1','PATCH',editor,{fields:{usuario:{stringValue:editor}}});assert.equal(r.status,200,await r.text());
assert.equal((await request('configuracion/muestrasProceso/historial/h1','PATCH',editor,{fields:{usuario:{stringValue:editor}}})).status,403);
assert.equal((await request('configuracion/muestrasProceso/historial/falso','PATCH',editor,{fields:{usuario:{stringValue:admin}}})).status,403);
assert.equal((await request('configuracion/otra','PATCH',editor,body)).status,403);
assert.equal((await request('eventos/compatibilidad','PATCH',editor,body)).status,200);
assert.equal((await request('eventos/compatibilidad/muestras/antiguo','PATCH',editor,body)).status,200);
console.log('PASS: reglas Firestore; equipo autorizado, sin acceso público, borrado admin, historial propio sin sobrescritura, eventos y participantes compatibles.');
