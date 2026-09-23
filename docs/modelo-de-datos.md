# Modelo de datos sugerido

La app usa una colección principal `eventos` y subcolecciones por cada evento.

## Conexión con RIP (padrón de estudiantes)

El padrón de estudiantes **no vive en este proyecto**: está en `rip-musicala`, que
es otro proyecto de Firebase. Esta app abre una segunda conexión de solo lectura
(`src/rip-config.js`) y necesita su propio inicio de sesión de Google, porque el
token de `muestras-de-proceso` no sirve en `rip-musicala`.

De RIP solo se leen dos colecciones:

| Colección | Para qué |
|---|---|
| `students` | Nombre e identificador canónico (`studentId`) |
| `studentComputed` | `clasificacionFinal` (Activo / Inactivo… / Exestudiante) y `ultimaClase` |

`registro` (clases y pagos) **nunca** se consulta: esta app no tiene por qué ver
información financiera.

### Permisos: no se modifican las reglas de RIP

Las reglas de `rip-musicala` terminan con un comodín recursivo:

```
match /{document=**} { allow read, write: if isAllowed(); }
```

Ese comodín **ya cubre** `students` y `studentComputed` para los 4 correos del
allowlist, así que esta integración **no requiere ningún cambio en las reglas de
RIP**. No se toca nada de lo que usan el conciliador (`registro`) ni los perfiles
de docentes (`users/`).

Además, al leer `students` el único `match` que aplica es el comodín, por lo que
solo se evalúa `isAllowed()` (comparación de lista). Las funciones caras
—`hasProfile()`, que hace un `exists()` sobre `users/`— no se ejecutan: esta
integración no añade lecturas facturables por evaluación de reglas.

El módulo `src/rip-config.js` importa de Firestore **únicamente `getDocs`**.
Escribir en RIP no es una convención: es imposible, porque ninguna función de
escritura está en su ámbito.

Detalles importantes:

- El estado activo **no es un campo guardado**: RIP lo calcula a partir de los días
  desde la última clase. Por eso hay que leer `studentComputed` y no solo `students`.
- Los documentos con `legacyAliasOf` se descartan: son homónimos ya fusionados y
  duplicarían la lista.
- El cruce se intenta primero por `studentId` y luego por nombre normalizado, porque
  durante la migración de RIP conviven ambas llaves.
- El acceso lo controlan las reglas de RIP (4 correos). Si la cuenta no está
  autorizada, la pestaña de estudiantes muestra el error y **el resto de la app
  sigue funcionando**.

### Selección para eventos

Al usar **Agregar estudiantes** o crear un ensamble, la lista parte de todos los estudiantes cuyo estado calculado en RIP es `Activo`, ordenados alfabéticamente. La franja **Revisión del evento** muestra cuántos ya están inscritos, cuántos se van a agregar y cuántos siguen pendientes; **Marcar pendientes** selecciona todos los que falten en la lista visible. La búsqueda no descarta los que ya fueron marcados. Se puede desactivar el filtro para consultar el padrón completo, pero los estudiantes en pausa, inactivos y exestudiantes no se sugieren en el formulario individual del evento.

El filtro de área usa los campos de solo lectura de RIP `area`, `instrumento` (`instrument` en registros antiguos) y `programa`, además de los intereses calculados en `studentComputed.cursos` e `studentComputed.instrumentos`. Al elegir Música y una familia instrumental, el padrón se limita a las coincidencias del instrumento; Danza, Teatro y Artes Plásticas se filtran por su área. La interfaz avisa cuando un activo realmente no tiene ese dato en RIP.

### ¿Quién ya se presentó?

Se responde dentro de este proyecto con una consulta `collectionGroup("muestras")`
que recorre los participantes de **todos** los eventos y los agrupa por `studentId`
(o por nombre normalizado si el registro es viejo y no lo tiene).

## eventos/{eventoId}

Campos principales:

- `titulo`: nombre del evento o muestra.
- `tipo`: Evento, Muestra de proceso, Musicala Fest, Open Day, Ensayo, Actividad interna.
- `estado`: Planeación, En curso, En riesgo, Listo, Realizado, No realizado, Archivado.
- `cierre`: opcional al cerrar desde la interfaz: `{resultado: realizado | no-realizado, cerradoAt, cerradoBy}`. Los eventos cerrados salen de la lista diaria y quedan disponibles con **Ver historial de eventos**; no se borran ni se alteran sus subcolecciones.
- `prioridad`: Baja, Media, Alta, Crítica.
- `responsable`: persona o equipo encargado.
- `fechaInicio`, `fechaFin`: formato YYYY-MM-DD.
- `lugar`, `publico`, `presupuesto`, `objetivo`, `notas`.
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

## eventos/{eventoId}/actividades/{actividadId}

- `titulo`
- `area`
- `fechaLimite`
- `responsable`
- `estado`
- `prioridad`
- `notas`

## eventos/{eventoId}/muestras/{muestraId}

- `estudianteGrupo`: nombre tal como se muestra (o el nombre del ensamble).
- `studentId`: identificador canónico de RIP. Queda vacío para grupos, ensambles
  o invitados que no están en el padrón; el cruce cae entonces al nombre.
- `esEnsamble`: `true` cuando la presentación la hacen varios estudiantes.
- `integrantes`: `[{ studentId, nombre }]`. Solo en ensambles. **Cada integrante
  cuenta como presentación propia** en el seguimiento de estudiantes.
- `area`
- `docente`
- `repertorio`
- `genero`: género musical normalizado (incluye Gospel; ver `src/repertorio.js`).
- `bloque`
- `duracionMin`
- `estado`
- `prioridad`
- `recursos`: texto de compatibilidad con recursos seleccionados.
- `recursosSeleccionados`: arreglo de recursos técnicos marcados en el formulario.
- `notas`

## eventos/{eventoId}/checklist/{itemId}

- `item`
- `categoria`
- `responsable`
- `fechaLimite`
- `estado`
- `prioridad`
- `notas`

## eventos/{eventoId}/documentos/{documentoId}

Riders, permisos, autorizaciones y demás papeleo. La app **no almacena archivos**:
guarda el enlace a donde ya viven (Drive, Notion, etc.).

- `titulo`
- `tipo`: Rider técnico, Permiso / autorización de uso del espacio, Autorización de
  imagen, Carta de solicitud, Repertorio / setlist, Circular a familias, Programa de
  mano, Contrato, Póliza / seguro, Factura / cuenta de cobro, Listado de asistencia,
  Diplomas / certificados, Registro fotográfico o video, Otro.
- `url`: enlace al archivo.
- `responsable`, `fechaLimite`, `estado`, `notas`.

## eventos/{eventoId}/bitacora/{notaId}

- `tipo`: Nota, Riesgo, Decisión, Cambio, Aprendizaje.
- `comentario`
- `createdAt`
- `createdByName`
- `createdByEmail`

## lugares/{lugarId}

Base maestra independiente de los eventos.

Identificación y gestión:

- `nombre`: nombre del espacio.
- `capacidad`: **número** de personas (no texto).
- `estado`: Por contactar, Contactado, En evaluación, Disponible, Descartado.

Costo:

- `costoModalidad`: Por definir, Gratis / préstamo, Por hora, Por jornada, Por evento,
  Porcentaje de taquilla, Intercambio / convenio.
- `costoValor`: **número** en pesos colombianos (o `null`).
- `costoIncluye`: qué incluye el precio y condiciones de pago.

Contacto: `contactoNombre`, `contactoTelefono`, `contactoEmail`.

Dotación (todos **booleanos**): `sonido`, `luces`, `tarima`, `camerinos`, `bodega`,
`parqueadero`, `sillas`, `proyector`, `wifi`, `accesible`. Complemento libre en
`notasTecnicas`.

Ubicación y horarios: `direccion`, `ciudad`, `diasDisponibles`, `horarioDesde`,
`horarioHasta` (HH:MM), `documentos`.

Notas libres: `observaciones`.

> Compatibilidad: los registros antiguos con `costo`, `contacto`, `tecnica` y `apoyo`
> se siguen mostrando y se migran al editarlos.

## personas/{personaId}

Base maestra de docentes, técnicos, proveedores y aliados. Se registran una vez y
alimentan las sugerencias de responsable, docente, encargado, equipo y proveedor.

- `nombre`
- `tipo`: Docente, Estudiante, Administrativo, Producción, Técnico, Proveedor,
  Aliado, Familia / acudiente, Externo.
- `area`, `rol`
- `telefono`, `email`, `disponibilidad`
- `notas`

## Vista de tablero (Kanban)

Las pestañas con estado (actividades, muestras, equipo, rider, checklist y documentos)
se pueden ver como tablero. Las columnas agrupan estados afines y al arrastrar una
tarjeta se escribe el `estado` de la columna destino:

| Columna | Estados que agrupa | Estado que guarda |
|---|---|---|
| Pendiente | Pendiente, vacío, cualquier valor desconocido | `Pendiente` |
| En curso | En curso | `En curso` |
| En riesgo / bloqueado | En riesgo, Bloqueado | `En riesgo` |
| Listo / confirmado | Listo, Confirmado | `Listo` |
| Cerrado | Realizado, Cancelado | `Realizado` |

## eventos/{eventoId}/programacion/{momentoId}

`hora`, `duracionMin`, `bloque`, `espacio`, `item`, `encargado` y `montaje`.

## eventos/{eventoId}/equipo/{personaId}

`nombre`, `rol`, `zona`, `horario`, `contacto`, `estado` y `notas`.

## eventos/{eventoId}/rider/{elementoId}

`elemento`, `categoria`, `cantidad`, `proveedor`, `ubicacion`, `estado` y `notas`.

## Sistema anual de Muestras de Proceso

### Evolución: Sistema Anual de Muestras Artísticas

El documento existente `configuracion/muestrasProceso` se mantiene como ubicación
canónica por compatibilidad y agrega `schemaVersion: 2`. No se crea una colección
paralela ni se migran masivamente participantes.

- `tituloSistema`, `descripcion`, `filosofia`, `agrupacion`, `decisiones`:
  contenido institucional editable.
- `areasArtisticas`: `[{id, nombre, emoji, descripcion, tipoMedicion, activo,
  semana, dias}]`. Tipos actuales: `slots`, `presentacionesDuracion`,
  `obrasExpuestas`.
- `modalidadesArtisticas`: modalidades no musicales con `id`,
  `areaArtisticaId`, `nombre`, `emoji`, `duracionSugerida`, `cupo`,
  `observaciones`, `dia`, `activo`. Música reutiliza `distribucion` como sus
  modalidades para conservar IDs de familias instrumentales ya guardados.
- Cada ciclo puede incluir `etiqueta`, por ejemplo Muestra de proceso, Muestra
  intermedia, Muestra especial o Muestra de cierre.

### Participantes de muestras: campos progresivos

Los registros nuevos pueden incluir `areaArtisticaId`, `areaArtisticaNombre`,
`modalidadPresentacionId` y `modalidadPresentacionNombre`. Para Música se mantiene
la duplicación compatible `familiaInstrumentalId` y `familiaInstrumentalNombre`.

Campos contextuales opcionales:

- Danza: `nombrePresentacion`, `musicaPista`, `vestuario`,
  `necesidadesEscenario`, `duracionMin`.
- Teatro: `nombrePresentacion`, `utileria`, `escenografia`, `audio`,
  `iluminacion`, `duracionMin`.
- Artes Plásticas: `tituloObra`, `tecnica`, `materiales`, `cantidadObras`,
  `descripcionObra`, `fotografiaUrl`, `seleccionadaExposicion` y `expuesta`.

La capacidad cuenta un documento como una presentación aunque tenga integrantes.
Teatro y Danza suman `duracionMin` para estimar bloque. Artes Plásticas suma obras
y obras seleccionadas. Un documento previo sin área artística se infiere en lectura
como Música desde `area`; no se escribe esa inferencia ni se altera historial.

### configuracion/muestrasProceso

Documento maestro independiente de los eventos. Implementación de dominio en
`src/muestras-model.js`; vista, listeners y transacciones en `src/muestras-anual.js`.

- `descripcion`, `agrupacion`, `decisiones`: textos institucionales editables.
- `ciclos`: `[{id, nombre, regla, mes, semana}]`. Su longitud determina la cantidad
  de ciclos. Identificadores estables; cambiar el nombre no crea otro ciclo.
  Reglas: `pascua`, `ultima`, `numero`, `sabado`. `mes` es 1–12 y `semana` 1–4.
  Para Pascua, `semana=2` es la segunda semana completa antes de Domingo de Ramos.
- `distribucion`: `[{id, dia, nombre, emoji, instrumentos, descripcion, orden, activo}]`.
  `dia`: 0 lunes a 6 domingo. Las opciones de participantes salen de familias activas.
  Desactivar una familia conserva registros previos; el editor mantiene el valor anterior.
- `bloques`: `[{id, nombre, hora, duracion, cupo}]`, horario `HH:MM` y duración en minutos.
  No hay un número fijo de bloques. `pausa`: mínimo de minutos entre bloques.
- `politica`: `{slot, obras, maxObras, repertorio, margen, descripcion}`.
- `capacidad`: `{umbral, alerta, descripcion}`. `umbral` es el número de familias
  desbordadas para recomendar segunda semana; `alerta` son los últimos cupos disponibles.
- `revision`, `updatedAt`, `updatedBy`: control de concurrencia y autoría.

### configuracion/muestrasProceso/anios/{YYYY}

- `fechasCalculadas`: `[{id, fechaInicio, fechaFin}]`, instantánea calculada al guardar.
- `fechasModificadas`: solo excepciones manuales respecto al cálculo al guardar.
- `estado`: Borrador o Validado; `notas` editables.
- `eventosGenerados`: mapa de ID de ciclo a ID de evento.
- `revision`, `updatedAt`, `updatedBy`.

Las fechas guardadas del año prevalecen sobre cálculos nuevos. Cambiar reglas generales
no modifica automáticamente los calendarios ya guardados. **Calcular** y **Restaurar**
preparan un nuevo borrador; **Guardar** lo confirma. Las modificaciones de calendario
no cambian fechas de eventos ya generados: esos eventos conservan su edición operativa.
Quitar un ciclo no borra sus eventos ni documentos anuales históricos.

### eventos/{eventoId}/muestras/{muestraId}: familia instrumental

Campos adicionales opcionales: `familiaInstrumentalId`, `familiaInstrumentalNombre`.
El ID es la referencia estable; el nombre conserva una etiqueta legible para exportaciones
y familias anteriores. No se migran ni se eliminan registros antiguos automáticamente.

El panel cuenta **todos los registros de la subcolección**, incluidos los cancelados
mientras permanezcan inscritos, y muestra aparte los que no tengan familia activa.
No cuenta integrantes del ensamble para capacidad ni altera el seguimiento individual.
La capacidad normal es la suma de cupos de bloques. Estado disponible / últimos cupos /
completo / ampliar según conteo. Jornadas adicionales: `ceil(conteo/capacidad)-1`.
Se recomienda conservar el día de la familia y extender a otra semana. Solo se advierte;
la coordinación decide y las inscripciones nunca se bloquean por capacidad.

### Generación y compatibilidad

Los eventos generados usan `muestra-proceso-{YYYY}-{cicloId}` e incluyen
`sistemaAnual: {anio, cicloId}`, tipo `Muestra de proceso`, estado `Planeación`, fechas,
objetivo, notas y autoría. Una transacción lee primero configuración, año y todos los
IDs de evento; crea solamente los faltantes y actualiza el mapa anual de forma atómica.
También reconoce eventos cargados que ya tengan el mismo metadato año/ciclo.
No se intenta deducir equivalencia de eventos manuales por su título.

Una copia importada pierde `sistemaAnual` para que no se confunda con el evento canónico.
Exportación/importación de eventos conserva el resto del formato y los nuevos campos
opcionales de participantes. La exportación global existente sigue siendo de eventos;
no es una copia de seguridad de la configuración anual.

### Jornadas programadas de cada ciclo

`plannedJornadas()` convierte las fechas del ciclo en eventos operativos, sin crear
participantes ni modificar las fechas manuales. Semana 1 genera una jornada por cada
familia musical activa; Semana 2 genera una jornada por área artística no musical.
Artes Plásticas puede ocupar toda la segunda semana. Cada documento usa el ID
`muestra-artistica-{anio}-{ciclo}-{jornada}` y guarda:

`sistemaAnual: { anio, cicloId, jornadaId, semana, areaArtisticaId, modalidadIds,
conflictoDia, version: 3 }`.

`jornadasGeneradas` en el documento del año conserva el mapa de eventos creados.
El creador consulta en transacción el año, configuración y cada ID antes de escribir,
por lo que repetir la acción no duplica ni sobrescribe jornadas. Un conflicto de día
configurado se muestra antes de confirmar y queda marcado en el evento para que la
coordinación lo resuelva manualmente.

### configuracion/muestrasProceso/historial/{id}

`fecha`, `usuario`, `seccion`, `anterior`, `nuevo`, `comentario` opcional. Los cambios de configuración y año
se escriben en la misma transacción que su historial. El cliente rechaza guardados
cuando la revisión cambió desde que se abrió el borrador. Lectura mediante `orderBy(fecha)`
y límite de 30; no requiere un índice compuesto. No hay purga automática del historial.

Reglas: mismo `googleUser()` y lista autorizada de eventos. Lectura/creación/actualización
maestra y anual para el equipo; borrado para `isAdmin()`. Historial: lectura autorizada,
creación con `usuario` igual al correo autenticado y modificación/borrado solo admin.
No cambia ninguna regla de RIP, eventos, estudiantes, lugares o personas.
