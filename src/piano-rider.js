// Event-wide equipment: shared by the students, rather than repeated per work.
export const PIANO_RIDER = [
  ['Escenario','Tarima','Por definir','Confirmar módulos y dimensiones.'],
  ['Escenario','Tapetes negros para cubrir la tarima','Por definir','Cubrir toda la superficie y fijar bordes.'],
  ['Escenario','Decoración','Por definir','Definir piezas y montaje.'],
  ['Instrumentos','Piano / teclado',1,'Confirmar salida de audio y fuente de alimentación.'],
  ['Instrumentos','Base de piano',1,'Comprobar estabilidad y compatibilidad.'],
  ['Instrumentos','Silla para pianista',1,'Silla de escenario; independiente de las sillas del público.'],
  ['Sonido','Conexión del piano: cable plug o sistema inalámbrico',1,'Elegir una alternativa y probarla; confirmar conectores, receptor y alimentación.'],
  ['Sonido','Parlante grande',1,'Incluir su cable de corriente.'],
  ['Sonido','Parlante pequeño',1,'Incluir su cable de corriente si es activo.'],
  ['Sonido','Cable XLR entre los dos parlantes',1,'Confirmar salida LINK/THRU y entrada compatibles; medir recorrido.'],
  ['Sonido','Micrófonos inalámbricos de diadema',2,'Para hablar al público: incluir transmisores, receptores y pilas/baterías.'],
  ['Sonido','Micrófono para pianista que canta',1,'Definir tipo, soporte, conexión y receptor si es inalámbrico.'],
  ['Sonido','Consola de sonido',1,'Verificar entradas disponibles para piano, micrófonos y pistas.'],
  ['Sonido','Cable de audio para pistas',1,'Confirmar dispositivo reproductor, adaptador y entradas de consola.'],
  ['Sonido','Cable de consola a parlante',1,'Confirmar conectores de salida/entrada y longitud. Revisar si el montaje requiere otra línea.'],
  ['Luces','Luces','Por definir','Confirmar número de luminarias y fijaciones.'],
  ['Luces','Estructuras para luces',2,'Revisar bases, fijaciones y estabilidad.'],
  ['Luces','Consola de luces',1,'Confirmar control y cables DMX si las luminarias los requieren.'],
  ['Luces','Máquina de humo',1,'Confirmar autorización del lugar y alimentación.'],
  ['Luces','Líquido para máquina de humo','Por definir','Verificar compatibilidad y cantidad disponible.'],
  ['Grabación','Trípode',1,'Verificar soporte para el dispositivo elegido.'],
  ['Grabación','Cámara o celular',1,'Elegir dispositivo; revisar memoria, batería y cargador.'],
  ['Energía','Extensiones y multitomas','Por definir','Medir recorridos y revisar tomas para piano, sonido, luces, humo y grabación.'],
  ['Revisión','Cables de receptores inalámbricos a consola','Por definir','Revisar cada receptor: el enlace inalámbrico no reemplaza esta conexión.'],
  ['Revisión','Cables de control de luces y adaptadores','Por definir','Comprobar el sistema real antes de cerrar la lista.']
];

export function renderPianoGuide() {
  return `<section class="form-section" style="margin:12px 0 22px"><h3>🎹 Montaje compartido · Concierto de piano</h3><p>Una lista para todo el concierto. Primero revisa qué hay que llevar; después ajusta el plano de cada presentación.</p><div class="actions"><button type="button" class="btn btn-primary" data-action="prepare-piano">Preparar lista de piano</button></div><details style="margin-top:14px"><summary>Ver equipos y conexiones que vamos a revisar</summary>${[...new Set(PIANO_RIDER.map(item=>item[0]))].map(category=>`<h4>${category}</h4><ul>${PIANO_RIDER.filter(item=>item[0]===category).map(item=>`<li><strong>${item[2]} · ${item[1]}</strong> — ${item[3]}</li>`).join('')}</ul>`).join('')}<p><strong>Prueba final:</strong> piano → consola → parlante grande → parlante pequeño; receptores de micrófonos → consola; reproductor de pistas → consola. Confirmar las salidas reales antes de conectar. Revisar corriente, luces y grabación, y probar voz y piano juntos.</p></details><p class="field-hint">Las cantidades sin especificar quedan por definir. Agregar la lista no marca equipos como disponibles ni dibuja conexiones supuestas. La lista se guarda abajo, en Rider general del evento.</p></section>`;
}
