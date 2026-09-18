export const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export function defaults() {
  return {
    descripcion: 'Musicala realiza 4 ciclos oficiales de Muestras de Proceso al año. El objetivo es que los estudiantes y las familias puedan observar periódicamente el avance artístico, mantener objetivos de corto plazo y generar experiencias de escenario sin convertir cada muestra en un gran recital. La estructura se repite todos los años para facilitar la organización académica, técnica y administrativa.',
    agrupacion: 'Las jornadas se agrupan por familias instrumentales para reducir cambios de escenario, amplificación, micrófonos, instrumentos, backline y necesidades técnicas. El escenario puede prepararse para un tipo de presentación y mantenerse durante toda la jornada.',
    ciclos: [
      {id:'1', nombre:'Antes de Semana Santa', regla:'pascua', mes:3, semana:2},
      {id:'2', nombre:'Cierre primer semestre', regla:'ultima', mes:5, semana:1},
      {id:'3', nombre:'Segundo semestre', regla:'numero', mes:9, semana:2},
      {id:'4', nombre:'Cierre del año', regla:'sabado', mes:12, semana:1}
    ],
    distribucion: [
      ['bateria','🥁','Batería y percusión','Batería, percusión','Normalmente hay menos presentaciones individuales y varios estudiantes pueden participar posteriormente en ensambles.'],
      ['violin','🎻','Violín y cuerdas frotadas','Violín, cello, otras cuerdas frotadas',''],
      ['canto','🎤','Canto','Voz',''],
      ['guitarra','🎸','Guitarra y cuerdas pulsadas','Guitarra acústica, guitarra eléctrica, bajo, ukelele',''],
      ['piano','🎹','Piano y teclas','Piano, teclado',''],
      ['ensambles','🎶','Ensambles y presentaciones grupales','Bandas, ensambles, dúos, tríos, grupos, proyectos especiales, presentaciones colectivas','Cada registro cuenta como una presentación, independientemente del número de integrantes.']
    ].map(([id,emoji,nombre,instrumentos,descripcion],i)=>({id,emoji,nombre,instrumentos,descripcion,dia:i,orden:i+1,activo:true})),
    bloques:[{id:'b1',nombre:'Bloque 1',hora:'17:00',duracion:75,cupo:12},{id:'b2',nombre:'Bloque 2',hora:'18:30',duracion:75,cupo:12}],
    pausa:15,
    politica:{slot:6,obras:1,maxObras:2,repertorio:5,margen:'Entrada, presentación, acomodación, pequeños ajustes y salida/transición.',descripcion:'Una Muestra de Proceso no exige necesariamente una canción completa. Según el nivel del estudiante puede presentarse una obra, fragmento, ejercicio musical, interpretación acompañada u otra evidencia artística pertinente.'},
    capacidad:{umbral:3,alerta:2,descripcion:'Si un área supera su capacidad, se activa una segunda jornada del mismo instrumento, preferiblemente el mismo día de la semana siguiente. La coordinación decide finalmente cómo distribuir las presentaciones; las inscripciones no se bloquean.'},
    decisiones:[
      'Se realizan cuatro ciclos oficiales al año para ofrecer objetivos periódicos al estudiante sin saturar el calendario con demasiados recitales.',
      'Los instrumentos se agrupan por jornada para simplificar montaje, amplificación y cambios técnicos.',
      'Los instrumentos con mayor demanda se ubican hacia jueves y viernes.',
      'El sábado se prioriza para ensambles y presentaciones grupales por su atractivo para familias y mayor disponibilidad.',
      'La participación en la Muestra de Proceso funciona como oportunidad periódica de escenario, no necesariamente como recital formal ni como examen.',
      'Se recomienda una obra por estudiante y se permiten máximo dos siempre que respeten el tiempo de escenario.',
      'Si un área supera su capacidad, se amplía preferiblemente conservando el mismo día de la semana en una segunda semana.'
    ].join('\n')
  };
}
export const iso = d => d.toISOString().slice(0,10);
const date = (y,m,d) => new Date(Date.UTC(y,m-1,d));
const shift = (d,n) => new Date(d.getTime()+n*86400000);
export function easter(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
  return date(y,Math.floor(n/31),n%31+1);
}
export function calendar(year, config) {
  if (!Number.isInteger(year)||year<1583||year>4099) throw Error('Año válido: 1583 a 4099.');
  return config.ciclos.map(c=>{
    let start;
    const first=date(year,c.mes,1);
    if(c.regla==='pascua') start=shift(easter(year),-7-6-7*(c.semana-1));
    else if(c.regla==='ultima') { const last=date(year,c.mes+1,0); const sat=shift(last,-((last.getUTCDay()+1)%7)); start=shift(sat,-5); }
    else if(c.regla==='sabado') start=shift(first,((6-first.getUTCDay()+7)%7)-5);
    else start=shift(first,(1-first.getUTCDay()+7)%7+7*(c.semana-1));
    return {id:c.id,fechaInicio:iso(start),fechaFin:iso(shift(start,5))};
  });
}
export const activeFamilies=c=>c.distribucion.filter(d=>d.activo).sort((a,b)=>a.orden-b.orden);
export const capacity=c=>c.bloques.reduce((n,b)=>n+Number(b.cupo),0);
export function capacityRows(c, rows) {
  const cap=capacity(c),families=activeFamilies(c);
  return {rows:families.map(f=>{const count=rows.filter(r=>r.familiaInstrumentalId===f.id).length;return {...f,count,cap,remaining:Math.max(0,cap-count),extra:Math.max(0,Math.ceil(count/cap)-1),status:count>cap?'Ampliar':count===cap?'Completo':cap-count<=c.capacidad.alerta?'Últimos cupos':'Disponible'};}),unassigned:rows.filter(r=>!families.some(f=>f.id===r.familiaInstrumentalId)).length};
}
export const minutes=h=>Number(h.split(':')[0])*60+Number(h.split(':')[1]);
export const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function validate(c) {
  if(!c.ciclos.length||c.ciclos.length>24||!c.bloques.length||!activeFamilies(c).length) throw Error('Define al menos un ciclo, un bloque y una familia activa (máximo 24 ciclos).');
  for(const list of [c.ciclos,c.bloques,c.distribucion]) if(new Set(list.map(x=>x.id)).size!==list.length||list.some(x=>!x.id||!x.nombre.trim())) throw Error('Los nombres e identificadores deben ser válidos y únicos.');
  for(const x of c.ciclos) if(!['pascua','ultima','numero','sabado'].includes(x.regla)||!Number.isInteger(x.mes)||x.mes<1||x.mes>12||!Number.isInteger(x.semana)||x.semana<1||x.semana>4) throw Error('Revisa las reglas del calendario.');
  for(const x of c.distribucion) if(!Number.isInteger(x.dia)||x.dia<0||x.dia>6||!Number.isFinite(x.orden)) throw Error('Revisa días y orden de las familias.');
  const positive=[c.politica.slot,c.politica.obras,c.politica.maxObras,c.politica.repertorio,c.capacidad.umbral];
  if(positive.some(n=>!Number.isFinite(n)||n<=0)||!Number.isInteger(c.capacidad.umbral)||c.politica.obras>c.politica.maxObras||c.politica.repertorio>c.politica.slot||!Number.isFinite(c.pausa)||c.pausa<0||!Number.isFinite(c.capacidad.alerta)||c.capacidad.alerta<0) throw Error('Revisa tiempos, obras, pausa y umbrales.');
  let end=-1;
  for(const b of [...c.bloques].sort((a,b)=>minutes(a.hora)-minutes(b.hora))) {
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.hora)||!Number.isFinite(b.duracion)||b.duracion<=0||!Number.isInteger(b.cupo)||b.cupo<1||minutes(b.hora)<end||minutes(b.hora)+b.duracion>1440) throw Error('Los bloques deben tener cupos positivos, horarios válidos y respetar la pausa técnica.');
    end=minutes(b.hora)+b.duracion+c.pausa;
  }
}
export function validateDates(rows) {
  for(const r of rows) if(!/^\d{4}-\d{2}-\d{2}$/.test(r.fechaInicio)||!/^\d{4}-\d{2}-\d{2}$/.test(r.fechaFin)||!Number.isFinite(Date.parse(r.fechaInicio))||!Number.isFinite(Date.parse(r.fechaFin))||iso(new Date(r.fechaInicio))!==r.fechaInicio||iso(new Date(r.fechaFin))!==r.fechaFin||r.fechaInicio>r.fechaFin) throw Error('Cada ciclo necesita fechas válidas y fin posterior o igual al inicio.');
}
export const eventId=(year,id)=>`muestra-proceso-${year}-${id}`;
