export const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export function defaults() {
  return {
    schemaVersion: 2,
    tituloSistema: 'Sistema Anual de Muestras Artísticas Musicala',
    descripcion: 'Musicala realiza 4 ciclos oficiales de Muestras Artísticas al año. El objetivo es que los estudiantes y las familias puedan observar periódicamente el avance artístico, mantener objetivos de corto plazo y generar experiencias de escenario sin convertir cada muestra en un gran recital. La estructura se repite todos los años para facilitar la organización académica, técnica y administrativa.',
    filosofia: 'Las Muestras de Proceso son oportunidades periódicas para compartir el crecimiento artístico de los estudiantes. No tienen que funcionar siempre como recitales formales o productos finales. Cada disciplina puede mostrar su proceso de una manera diferente: Música con interpretaciones, Danza con coreografías, Teatro con escenas y Artes Plásticas con exposiciones y obras.',
    agrupacion: 'Las presentaciones musicales se agrupan por familias instrumentales para reducir cambios de escenario, instrumentos, amplificación, micrófonos, conexiones y necesidades técnicas. Las áreas musicales con mayor demanda se ubican hacia el final de la semana para facilitar la asistencia de estudiantes y familias. El sábado se prioriza para ensambles y experiencias grupales por su disponibilidad, atractivo para el público y características técnicas.',
    ciclos: [
      {id:'1', nombre:'Antes de Semana Santa', etiqueta:'Muestra de proceso', regla:'pascua', mes:3, semana:2},
      {id:'2', nombre:'Cierre primer semestre', etiqueta:'Muestra de proceso / cierre de semestre', regla:'ultima', mes:5, semana:1},
      {id:'3', nombre:'Segundo semestre', etiqueta:'Muestra de proceso', regla:'numero', mes:9, semana:2},
      {id:'4', nombre:'Cierre del año', etiqueta:'Muestra de cierre', regla:'sabado', mes:12, semana:1}
    ],
    distribucion: [
      ['bateria','🥁','Batería y percusión','Batería, percusión','Normalmente hay menos presentaciones individuales y varios estudiantes pueden participar posteriormente en ensambles.'],
      ['violin','🎻','Violín y cuerdas frotadas','Violín, cello, otras cuerdas frotadas',''],
      ['canto','🎤','Canto','Voz',''],
      ['guitarra','🎸','Guitarra y cuerdas pulsadas','Guitarra acústica, guitarra eléctrica, bajo, ukelele',''],
      ['piano','🎹','Piano y teclas','Piano, teclado',''],
      ['ensambles','🎶','Ensambles y presentaciones grupales','Bandas, ensambles, dúos, tríos, grupos, proyectos especiales, presentaciones colectivas','Cada registro cuenta como una presentación, independientemente del número de integrantes.']
    ].map(([id,emoji,nombre,instrumentos,descripcion],i)=>({id,emoji,nombre,instrumentos,descripcion,dia:i,orden:i+1,activo:true})),
    areasArtisticas: [
      {id:'musica',nombre:'Música',emoji:'🎵',descripcion:'Interpretaciones, ensambles y experiencias musicales.',tipoMedicion:'slots',activo:true,semana:1,dias:'Lunes a sábado'},
      {id:'teatro',nombre:'Teatro',emoji:'🎭',descripcion:'Escenas, monólogos y montajes; se mide por presentaciones y duración.',tipoMedicion:'presentacionesDuracion',activo:true,semana:2,dias:'Viernes'},
      {id:'danza',nombre:'Danza',emoji:'💃',descripcion:'Números, coreografías y montajes; se mide por presentaciones y duración.',tipoMedicion:'presentacionesDuracion',activo:true,semana:2,dias:'Sábado'},
      {id:'artes-plasticas',nombre:'Artes Plásticas',emoji:'🎨',descripcion:'Galería de procesos y obras expuestas.',tipoMedicion:'obrasExpuestas',activo:true,semana:2,dias:'Varios días'}
    ],
    modalidadesArtisticas: [
      {id:'teatro-individual',areaArtisticaId:'teatro',nombre:'Monólogo / escena individual',emoji:'🎭',duracionSugerida:5,cupo:12,observaciones:'Presentación individual o escena corta.',activo:true,dia:4},
      {id:'teatro-grupal',areaArtisticaId:'teatro',nombre:'Escena grupal',emoji:'🎭',duracionSugerida:10,cupo:8,observaciones:'Cuenta como una presentación aunque participen varios estudiantes.',activo:true,dia:4},
      {id:'teatro-montaje',areaArtisticaId:'teatro',nombre:'Montaje u obra especial',emoji:'🎭',duracionSugerida:20,cupo:1,observaciones:'Configurar como bloque independiente cuando sea necesario.',activo:true,dia:4},
      {id:'danza-solo-duo',areaArtisticaId:'danza',nombre:'Solo / dúo',emoji:'💃',duracionSugerida:4,cupo:12,observaciones:'Número de danza individual o en pareja.',activo:true,dia:5},
      {id:'danza-coreografia',areaArtisticaId:'danza',nombre:'Coreografía grupal',emoji:'💃',duracionSugerida:6,cupo:10,observaciones:'Cuenta como un número, sin importar sus integrantes.',activo:true,dia:5},
      {id:'danza-montaje',areaArtisticaId:'danza',nombre:'Montaje especial',emoji:'💃',duracionSugerida:10,cupo:6,observaciones:'Bloque especial editable.',activo:true,dia:5},
      {id:'plasticas-exposicion',areaArtisticaId:'artes-plasticas',nombre:'Obra para exposición',emoji:'🎨',duracionSugerida:0,cupo:2,observaciones:'Una obra principal por estudiante; máximo sugerido de dos.',activo:true,dia:5}
    ],
    bloques:[{id:'b1',nombre:'Bloque 1',hora:'17:00',duracion:75,cupo:12},{id:'b2',nombre:'Bloque 2',hora:'18:30',duracion:75,cupo:12}],
    pausa:15,
    politica:{slot:6,obras:1,maxObras:2,repertorio:5,margen:'Entrada, presentación, acomodación, pequeños ajustes y salida/transición.',descripcion:'Una Muestra de Proceso no exige necesariamente una canción completa. Según el nivel del estudiante puede presentarse una obra, fragmento, ejercicio musical, interpretación acompañada u otra evidencia artística pertinente.'},
    capacidad:{umbral:3,alerta:2,descripcion:'Si un área supera su capacidad, se activa una segunda jornada del mismo instrumento, preferiblemente el mismo día de la semana siguiente. La coordinación decide finalmente cómo distribuir las presentaciones; las inscripciones no se bloquean.'},
    decisiones:[
      'Musicala realiza cuatro ciclos de muestras durante el año.',
      'Las muestras mantienen al estudiante motivado mediante objetivos periódicos y permiten a las familias observar su proceso.',
      'No todas las disciplinas necesitan mostrar su proceso de la misma manera.',
      'Música se organiza por familias instrumentales para facilitar montaje y amplificación.',
      'Los instrumentos con mayor cantidad de estudiantes se ubican hacia el final de la semana.',
      'El sábado musical se prioriza para ensambles y experiencias grupales.',
      'Teatro y Danza se organizan por número de presentaciones y duración.',
      'Artes Plásticas funciona principalmente mediante exposiciones.',
      'Una muestra de proceso no significa necesariamente una presentación final completamente terminada.',
      'Mayo y diciembre pueden funcionar como momentos de presentación más desarrollados.',
      'Si un área musical supera su capacidad, se abre una jornada adicional conservando preferiblemente el mismo día.',
      'La segunda semana funciona también como espacio de expansión.'
    ].join('\n')
  };
}
export function normalizeConfig(config={}) {
  const base=defaults(), merged={...base,...config};
  merged.areasArtisticas=Array.isArray(config.areasArtisticas)&&config.areasArtisticas.length?config.areasArtisticas:base.areasArtisticas;
  merged.modalidadesArtisticas=Array.isArray(config.modalidadesArtisticas)&&config.modalidadesArtisticas.length?config.modalidadesArtisticas:base.modalidadesArtisticas;
  merged.ciclos=(config.ciclos||base.ciclos).map((c,i)=>({...base.ciclos[i],...c,etiqueta:c.etiqueta||base.ciclos[i]?.etiqueta||'Muestra de proceso'}));
  return merged;
}
export const activeArtAreas=c=>normalizeConfig(c).areasArtisticas.filter(a=>a.activo);
export const artAreaForRow=(c,row={})=>{
  const all=normalizeConfig(c).areasArtisticas;
  if(row.areaArtisticaId&&all.some(a=>a.id===row.areaArtisticaId)) return row.areaArtisticaId;
  const legacy=String(row.area||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(legacy.includes('danza')) return 'danza'; if(legacy.includes('teatro')) return 'teatro'; if(legacy.includes('plast')) return 'artes-plasticas';
  return 'musica';
};
export const activeModalities=(c,areaId)=>{
  const config=normalizeConfig(c);
  if(areaId==='musica') return activeFamilies(config).map(x=>({...x,areaArtisticaId:'musica',duracionSugerida:config.politica.slot,cupo:capacity(config),tipoMedicion:'slots'}));
  return config.modalidadesArtisticas.filter(x=>x.areaArtisticaId===areaId&&x.activo).sort((a,b)=>(a.dia??9)-(b.dia??9)||a.nombre.localeCompare(b.nombre,'es'));
};
export const modalityForRow=(c,row={})=>{
  const areaId=artAreaForRow(c,row),id=row.modalidadPresentacionId||(areaId==='musica'?row.familiaInstrumentalId:'');
  return activeModalities(c,areaId).find(m=>m.id===id)||null;
};
export function artCapacityRows(c,rows) {
  const config=normalizeConfig(c), cap=capacity(config);
  return activeArtAreas(config).map(area=>{
    const areaRows=rows.filter(row=>artAreaForRow(config,row)===area.id);
    const totalDuracion=areaRows.reduce((sum,row)=>sum+Number(row.duracionMin||modalityForRow(config,row)?.duracionSugerida||0),0);
    const expuestas=areaRows.filter(row=>row.seleccionadaExposicion===true||row.expuesta===true).length;
    const cantidad=area.tipoMedicion==='obrasExpuestas'?areaRows.reduce((n,row)=>n+Math.max(1,Number(row.cantidadObras||1)),0):areaRows.length;
    return {...area,rows:areaRows,cantidad,totalDuracion,expuestas,capacidad:area.id==='musica'?cap:null};
  });
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
  c=normalizeConfig(c);
  if(!c.ciclos.length||c.ciclos.length>24||!c.bloques.length||!activeFamilies(c).length||!activeArtAreas(c).length) throw Error('Define al menos un ciclo, un bloque, una familia musical y un área artística activa (máximo 24 ciclos).');
  for(const list of [c.ciclos,c.bloques,c.distribucion]) if(new Set(list.map(x=>x.id)).size!==list.length||list.some(x=>!x.id||!x.nombre.trim())) throw Error('Los nombres e identificadores deben ser válidos y únicos.');
  for(const x of c.ciclos) if(!['pascua','ultima','numero','sabado'].includes(x.regla)||!Number.isInteger(x.mes)||x.mes<1||x.mes>12||!Number.isInteger(x.semana)||x.semana<1||x.semana>4) throw Error('Revisa las reglas del calendario.');
  for(const x of c.distribucion) if(!Number.isInteger(x.dia)||x.dia<0||x.dia>6||!Number.isFinite(x.orden)) throw Error('Revisa días y orden de las familias.');
  for(const area of c.areasArtisticas) if(!area.id||!String(area.nombre||'').trim()||!['slots','presentacionesDuracion','obrasExpuestas'].includes(area.tipoMedicion)) throw Error('Revisa los nombres, identificadores y tipos de medición de las áreas artísticas.');
  if(new Set(c.areasArtisticas.map(a=>a.id)).size!==c.areasArtisticas.length) throw Error('Cada área artística necesita un identificador único.');
  for(const mode of c.modalidadesArtisticas) if(!mode.id||!String(mode.nombre||'').trim()||!c.areasArtisticas.some(a=>a.id===mode.areaArtisticaId)||!Number.isFinite(Number(mode.duracionSugerida||0))||Number(mode.duracionSugerida||0)<0||!Number.isInteger(Number(mode.cupo||0))||Number(mode.cupo||0)<1) throw Error('Revisa las modalidades artísticas y sus capacidades.');
  if(new Set(c.modalidadesArtisticas.map(a=>a.id)).size!==c.modalidadesArtisticas.length) throw Error('Cada modalidad necesita un identificador único.');
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
