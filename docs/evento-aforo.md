# Ficha del evento y cálculo de sillas

Al abrir un evento se muestra **Ficha del evento**. Reúne fecha, hora, lugar,
responsable, público, presupuesto, ventiladores, objetivos, notas, programa,
equipo y un desglose de asistencia. **Imprimir ficha** genera una vista independiente.

## Solo personas confirmadas

El modo automático calcula una silla por persona, sumando:

- Estudiantes únicos con invitación **Aceptada** o asistencia **Confirmada**.
- Personas únicas del Equipo con confirmación **Confirmado**.
- Invitados registrados de los participantes confirmados.
- **Público adicional confirmado** registrado en Editar evento.

Las invitaciones pendientes o enviadas y los integrantes del equipo pendientes
se muestran aparte. Los rechazados, cancelados y no disponibles quedan fuera.
Estar **Listo** en la preparación de un estudiante no confirma su asistencia.
En Equipo se conservan las equivalencias antiguas de Listo/Realizado a Confirmado.

Un estudiante no se multiplica por tener varias obras o ensambles. Los integrantes
con inscripción individual conservan su propia confirmación; aceptar un ensamble
no confirma automáticamente una inscripción individual pendiente. Un ensamble
antiguo sin integrantes no se trata como una sola persona: se avisa para completarlo.

Para varias inscripciones de la misma persona se utiliza el máximo de invitados
registrados. Si un ensamble también tiene una cantidad de invitados, se considera
el total del grupo y no otra copia de las familias de sus integrantes; se avisa
para revisar si existen invitados distintos. Las identidades ambiguas y los datos
incompletos se muestran en **Datos por revisar**.

El campo Público conserva su descripción. No se extraen cantidades de ese texto.
Público adicional confirmado sirve para invitados externos que no estén incluidos
en las inscripciones; cero significa que no hay público adicional registrado.

## Cantidad automática o manual

- `sillasModo`: `automatico` o `manual`.
- `publicoAdicionalCantidad`: entero mayor o igual a cero.
- `sillasCantidad`: cantidad manual compatible con el campo anterior; en automático
  queda vacía porque el total se calcula a partir de los datos actuales.

Los eventos anteriores sin cantidad usan el cálculo automático. Una cantidad ya
guardada, incluido cero, conserva el modo manual hasta que coordinación elija
Automático. La ficha muestra tanto las sillas manuales como las personas confirmadas
y advierte si faltan sillas.

El cálculo usa los listeners de Participantes y Equipo. No escribe cifras derivadas
ni migra eventos al abrirlos. Cambiar una confirmación actualiza las secciones y la
vista previa de Editar evento. Si las fuentes están cargando o no se pueden leer,
se informa y no se presenta un cero como cálculo completo.

El total está visible en la cabecera y en Participantes, Equipo, Rider técnico,
Pendientes y Minuto a minuto. Las sillas en escena se revisan aparte en los montajes.
Si el lugar coincide inequívocamente con la Base de lugares, se compara con su
capacidad sentada sin inventar un aforo.

## Verificación

```powershell
node --test tests/evento-aforo-model.test.mjs
python -m http.server 4173 --bind 127.0.0.1
# En otra terminal:
node tests/evento-aforo-browser.mjs
```

La prueba de navegador reemplaza Firebase y RIP por datos en memoria. No modifica
asistencia real. Esta integración no requiere cambios en las reglas de Firestore.
