// In-memory adapter used only by the browser test through request interception.
const records=new Map(JSON.parse(sessionStorage.getItem('annual-test-store')||'[]'));
const listeners=new Set();
const readFaults=[];
export const db={};export const auth={};export const provider={};export const app={};
export const firebaseConfig={projectId:'demo-muestras-anual'};
export const initializeApp=(config,name)=>({name,config});
export const getFirestore=()=>db;
export const doc=(...args)=>{if(args.length===1&&args[0]?.kind==='collection')args.push(crypto.randomUUID());return ({path:args.filter(x=>typeof x==='string'||x?.path).map(x=>x.path||x).join('/')||crypto.randomUUID()});};
export const collection=(...args)=>({...doc(...args),kind:'collection'});
export const collectionGroup=name=>({path:name,kind:'group'});
export const query=(ref,...ops)=>({...ref,ops});export const orderBy=(...x)=>x;export const limit=n=>n;
export const where=(field,op,value)=>({kind:'where',field,op,value});
export class Timestamp {
  constructor(seconds,nanoseconds=0){this.seconds=seconds;this.nanoseconds=nanoseconds;}
  static fromDate(date){const ms=date.getTime();return new Timestamp(Math.floor(ms/1000),(ms%1000)*1000000);}
  toMillis(){return this.seconds*1000+this.nanoseconds/1000000;}
  toDate(){return new Date(this.toMillis());}
}
const snap=(path)=>({id:path.split('/').at(-1),ref:{path,parent:{parent:{id:path.split('/')[1]}}},exists:()=>records.has(path),data:()=>structuredClone(records.get(path))});
function value(ref){
  if(!ref.kind)return snap(ref.path);
  let paths=[...records.keys()].filter(p=>ref.kind==='group'?p.split('/').at(-2)===ref.path:p.startsWith(ref.path+'/')&&p.split('/').length===ref.path.split('/').length+1);
  for(const op of ref.ops||[]){
    if(op.kind==='where'&&op.op==='==')paths=paths.filter(p=>records.get(p)?.[op.field]===op.value);
    if(typeof op==='number')paths=paths.slice(0,op);
  }
  return {docs:paths.map(snap)};
}
function emit(){sessionStorage.setItem('annual-test-store',JSON.stringify([...records]));listeners.forEach(l=>l.fn(value(l.ref)));}
export function onSnapshot(ref,fn){const l={ref,fn};listeners.add(l);queueMicrotask(()=>{if(listeners.has(l))fn(value(ref));});return()=>listeners.delete(l);}
export const serverTimestamp=()=>({seconds:Math.floor(Date.now()/1000)});
export const getDocs=async ref=>value(ref);
export const getDoc=async ref=>snap(ref.path);
export const getDocFromServer=async ref=>{const i=readFaults.findIndex(f=>ref.path.startsWith(f.prefix));if(i>=0){const fault=readFaults.splice(i,1)[0];throw Object.assign(new Error('Simulated server read failure'),{code:fault.code});}return getDoc(ref);};
export const getDocsFromServer=getDocs;
export const setDoc=async(ref,data,options)=>{records.set(ref.path,options?.merge?{...records.get(ref.path),...data}:data);emit();};
function updateFields(current,data){const result=structuredClone(current||{});for(const[key,value]of Object.entries(data)){const keys=key.split('.');let target=result;for(const part of keys.slice(0,-1))target=target[part]||(target[part]={});target[keys.at(-1)]=value;}return result;}
export const updateDoc=async(ref,data)=>{records.set(ref.path,updateFields(records.get(ref.path),data));emit();};
export const deleteDoc=async ref=>{records.delete(ref.path);emit();};
export const addDoc=async(ref,data)=>{const r=doc(ref,crypto.randomUUID());await setDoc(r,data);return {id:r.path.split('/').at(-1)};};
export const writeBatch=()=>{const pending=[];return {set:(r,d,o)=>pending.push([r,d,o]),delete:r=>pending.push([r,null]),commit:async()=>{for(const[r,d,o]of pending)d?records.set(r.path,o?.merge?{...records.get(r.path),...d}:d):records.delete(r.path);emit();}};};
export async function runTransaction(db,fn){const pending=[];const result=await fn({get:async r=>snap(r.path),set:(r,d,o)=>pending.push([r,d,o]),update:(r,d)=>pending.push([r,d,{update:true}]),delete:r=>pending.push([r,null])});for(const[r,d,o]of pending)d?records.set(r.path,o?.update?updateFields(records.get(r.path),d):o?.merge?{...records.get(r.path),...d}:d):records.delete(r.path);emit();return result;}
let authCallback;const user={email:'alekcaballeromusic@gmail.com',displayName:'Prueba local'};
export const onAuthStateChanged=(auth,cb)=>{authCallback=cb;queueMicrotask(()=>cb(sessionStorage.getItem('test-login')?user:null));};
export const signInWithPopup=async()=>{sessionStorage.setItem('test-login','1');authCallback(user);};
export const signOut=async()=>{sessionStorage.removeItem('test-login');authCallback(null);};
window.testStore={get:p=>structuredClone(records.get(p)),set:(p,d)=>{records.set(p,d);emit();},all:()=>[...records],failNextServerRead:(prefix,code='unavailable')=>readFaults.push({prefix,code})};
