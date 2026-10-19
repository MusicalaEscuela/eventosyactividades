# Ruta progresiva de muestras

Cada registro representa a un estudiante identificado, un área y una obra o proceso. Audio → Video → Recital → Presentación grande.

## Registrar un proceso

1. Abre **Ruta de muestras** en la barra lateral o desde la inscripción del estudiante en Participantes.
2. Elige estudiante y área. **Iniciar nueva obra / proceso** crea las cuatro etapas pendientes; no copia avances anteriores ni borra el historial.
3. Abre cada etapa para registrar estado, fecha, docente, enlace opcional y observaciones. Para completarla necesitas fecha y docente. Si omites etapas o registras fechas fuera de orden, deja el motivo de excepción.
4. Al finalizar puedes cerrar el proceso. Permanece en el historial y se puede reabrir para corregirlo. Puede haber procesos simultáneos para obras diferentes.

## Relacionarlo con una muestra

- En Participantes → Ruta de muestras, selecciona el proceso y pulsa **Vincular a esta inscripción**. Cada integrante de un ensamble tiene su propio proceso.
- Editar evento permite indicar si corresponde a un recital o a una presentación grande. No se presupone que todas las muestras sean de la misma etapa.
- Después de la presentación, abre la ruta desde esa inscripción y utiliza **Registrar participación efectiva**. Revisa fecha, docente y etapas anteriores antes de guardar. El evento no puede tener fecha futura ni estar marcado como No realizado.
- Inscribir estudiantes, vincular un proceso, enviar un formulario docente o marcar el evento realizado no completa etapas automáticamente.
- La lista de selección y la tabla de participantes muestran los avances. Si hay varios procesos activos o la inscripción no tiene uno vinculado, revisa cuál corresponde a la nueva obra.

Los datos se guardan en `rutasMuestras`, con un historial de cambios por proceso. Solo acceden las cuentas del equipo ya autorizadas; el formulario docente sin sesión no recibe acceso a este historial. No se modifica RIP. Los avances anteriores no se inventan ni se migran como completados desde simples inscripciones históricas.
