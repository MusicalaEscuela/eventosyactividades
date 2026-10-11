# Formato docente de eventos y muestras

`docentes.html` abre el formulario sin iniciar sesión. El catálogo publicado por coordinación contiene únicamente el título, fecha, lugar, plazo y nombres de docentes habilitados. Los estudiantes y las instrucciones permanecen en fichas privadas.

## Guardado y regreso

Cada combinación docente–muestra admite una ficha. La creación escribe de forma atómica una reserva en `convocatoriasDocentes/{eventoId}/reservas/{docenteId}` y la ficha en `fichasDocentes/{secreto}`. Las reglas rechazan una reserva huérfana, una ficha sin reserva, o una segunda ficha para la misma combinación.

El secreto aleatorio tiene 256 bits, codificados como 64 caracteres hexadecimales. El enlace guarda el secreto en el fragmento `#ficha=...`; no se envía al servidor del sitio como parte de la dirección. Quien tenga el enlace puede consultar esa ficha y editarla durante su plazo. Elegir un nombre no verifica la identidad; coordinación revisa el contenido antes de confirmarlo. El formulario no otorga acceso al panel, a los eventos internos ni al padrón completo.

Las fichas privadas no se pueden enumerar sin permisos de administración. El acceso público tampoco permite consultar las reservas ni recuperar un secreto mediante el nombre del docente. Coordinación puede recuperar una ficha generando un enlace nuevo y revocando el anterior.

El servicio del formulario utiliza una aplicación Firebase independiente llamada `docentes-public`, sin inicio de sesión. Así sus escrituras mantienen los límites públicos aunque coordinación tenga una sesión administrativa abierta en otra pestaña. El panel conserva la aplicación y la sesión originales.

## Plazos y revisión

Un guardado público requiere que el catálogo esté abierto y antes de su `cierreAt`, o que coordinación haya fijado una `reabiertaHasta` futura para esa ficha. El evento original debe existir y seguir activo; `Realizado`, `No realizado` y `Archivado` bloquean las escrituras incluso con un catálogo antiguo o reapertura selectiva. La consulta de una ficha existente sigue disponible después del plazo, salvo revocación del enlace.

Coordinación controla `comentarioCoordinacion`, `reabiertaHasta`, `revocada` y los estados `Requiere ajustes` y `Confirmado`. El docente sólo guarda `Borrador` o `Enviado`. Una ficha confirmada permanece bloqueada hasta que coordinación la ponga en `Requiere ajustes` y habilite un plazo.

Cada guardado aumenta la revisión exactamente en uno. La transacción rechaza una versión desactualizada y conserva los cambios recibidos desde otra ventana. Todas las presentaciones se guardan con la misma revisión de la ficha y la misma fecha del servidor; retirar una presentación forma parte de esa transacción. La interfaz confirma el guardado después de consultar de nuevo la ficha y sus presentaciones desde el servidor.

## Presentaciones e inscripción

Una ficha admite hasta 20 presentaciones, identificadas de forma estable como `p01` a `p20`. Se reciben nombres de estudiantes e integrantes escritos por el docente; la página pública no expone identificadores ni contactos del padrón. Se admiten individuales y ensambles de Música, Danza, Teatro y Artes Plásticas.

Para enviar se exige al menos una presentación, estudiante o ensamble, repertorio y duración positiva. Artes Plásticas permite duración cero y registra de 1 a 20 obras. Un ensamble requiere integrantes; si el docente indica que no asistirá, cada presentación requiere preparación y señal de inicio. Los textos tienen límites en la interfaz y en las reglas; los recursos enlazados sólo admiten HTTP o HTTPS.

La interfaz rechaza dos presentaciones con el mismo tipo, área, estudiante o ensamble y repertorio. Permite proponer piezas diferentes o participar como solista y como parte de un ensamble; coordinación verifica esas coincidencias antes de incorporarlas.

Las reglas verifican la primera presentación al pasar a `Enviado` y verifican cualquier presentación escrita. Las restricciones de Firestore impiden inspeccionar 20 documentos hijos desde una única regla del padre. Por ello, antes de confirmar e incorporar al evento, coordinación verifica que el número real de documentos coincida con `cantidadPresentaciones`, que todos tengan la revisión de la ficha y que cada uno esté completo. Una solicitud incompleta enviada mediante un cliente manipulado nunca debe convertirse directamente en participantes confirmados.

La confirmación de coordinación vincula o crea las participaciones y revisa coincidencias con las existentes. Una segunda presentación del mismo estudiante puede ser legítima, por ejemplo como solista y como integrante de un ensamble, y requiere revisión expresa.

Las coincidencias se revisan también entre propuestas de una misma ficha. Si una corrección cambia estudiantes ya confirmados, las inscripciones anteriores se muestran para que coordinación las ajuste desde Participantes o confirme expresamente que deben conservarse. Los nuevos registros llevan la revisión en su identificador y no sobrescriben el historial anterior.

Al cerrar, archivar o eliminar un evento, su convocatoria queda cerrada en la misma escritura. Cambiar el título, fecha o lugar actualiza el catálogo público. Volver a activar el evento requiere abrir sus inscripciones expresamente.

## Despliegue y comprobación

Publicar los archivos en GitHub Pages requiere desplegar además las reglas aditivas de este proyecto Firebase (`muestras-de-proceso`). Las reglas originales de eventos, configuración, personas y lugares conservan sus permisos. El formulario depende de las nuevas reglas; publicar HTML sin ellas no habilita el guardado.

Prueba de autorización local con el motor real de reglas:

```powershell
firebase emulators:exec --only firestore --project demo-muestras-anual --config .firebase-test.json "node tests/firestore-rules.test.mjs && node tests/docentes-rules.test.mjs"
```

El segundo programa cubre catálogo público mínimo, listado privado denegado, reservas y creaciones atómicas, duplicados, fechas de cierre, estado del evento, revisiones concurrentes, campos protegidos, enlaces revocados, presentaciones incompletas, enlaces de recursos, límites y guardados con 20 presentaciones.
