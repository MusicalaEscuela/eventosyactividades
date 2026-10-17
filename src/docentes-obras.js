const key=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
export function teacherWorks(row){
  if(!row.obrasJson)return [{obra:String(row.repertorio||''),minutos:Number(row.duracionMin)>0?Number(row.duracionMin):null}];
  let values;try{values=JSON.parse(row.obrasJson);}catch{throw Error('Revisa las obras y sus minutos.');}
  if(!Array.isArray(values)||values.length>20)throw Error('Cada presentación admite hasta 20 obras.');
  const seen=new Set();
  return values.map(value=>{
    if(!value||typeof value!=='object')throw Error('Revisa los datos de cada obra.');
    const obra=String(value.obra||'').trim(),minutos=value.minutos==null||value.minutos===''?null:Number(value.minutos);
    if(obra.length>180||minutos!==null&&(!Number.isFinite(minutos)||minutos<0||minutos>120))throw Error('Cada obra admite un título de hasta 180 caracteres y de 0 a 120 minutos.');
    if(obra&&seen.has(key(obra)))throw Error('Una obra aparece repetida en la misma presentación.');
    if(obra)seen.add(key(obra));
    return {obra,minutos,...(value.compartida===true?{compartida:true,ensambleId:String(value.ensambleId||'').slice(0,100)}: {})};
  });
}
export function normalizeTeacherWorks(row,submitted=false){
  if(!row.obrasJson)return row;
  const values=teacherWorks(row).filter(w=>w.obra);
  const total=values.reduce((sum,w)=>sum+(w.minutos||0),0);
  if(total>120)throw Error('La suma de las obras no puede superar 120 minutos.');
  if(submitted&&row.areaArtisticaId!=='artes-plasticas'&&(!values.length||values.some(w=>!(w.minutos>0))))throw Error('Completa los minutos de cada obra antes de enviar.');
  return {...row,obrasJson:JSON.stringify(values),repertorio:values.map(w=>w.obra).join(' / '),duracionMin:total};
}
