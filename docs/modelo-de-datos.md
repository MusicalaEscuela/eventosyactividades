# Modelo de datos sugerido

La app usa una colección principal `eventos` y subcolecciones por cada evento.

## eventos/{eventoId}

Campos principales:

- `titulo`: nombre del evento o muestra.
- `tipo`: Evento, Muestra de proceso, Musicala Fest, Open Day, Ensayo, Actividad interna.
- `estado`: Planeación, En curso, En riesgo, Listo, Realizado, Archivado.
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

- `estudianteGrupo`
- `area`
- `docente`
- `repertorio`
- `bloque`
- `duracionMin`
- `estado`
- `prioridad`
- `recursos`
- `notas`

## eventos/{eventoId}/checklist/{itemId}

- `item`
- `categoria`
- `responsable`
- `fechaLimite`
- `estado`
- `prioridad`
- `notas`

## eventos/{eventoId}/bitacora/{notaId}

- `tipo`: Nota, Riesgo, Decisión, Cambio, Aprendizaje.
- `comentario`
- `createdAt`
- `createdByName`
- `createdByEmail`

## lugares/{lugarId}

Base maestra independiente de los eventos: `nombre`, `capacidad`, `costo`,
`contacto`, `estado`, `tecnica`, `apoyo` y `observaciones`.

## eventos/{eventoId}/programacion/{momentoId}

`hora`, `duracionMin`, `bloque`, `espacio`, `item`, `encargado` y `montaje`.

## eventos/{eventoId}/equipo/{personaId}

`nombre`, `rol`, `zona`, `horario`, `contacto`, `estado` y `notas`.

## eventos/{eventoId}/rider/{elementoId}

`elemento`, `categoria`, `cantidad`, `proveedor`, `ubicacion`, `estado` y `notas`.
