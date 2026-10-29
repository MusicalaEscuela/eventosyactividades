# Stage Plot dentro del rider de Eventos

El tab **Rider técnico** incorpora el editor completo del proyecto hermano
`Stage Plot`, servido desde `src/stage-editor/`. La biblioteca, los puertos,
el diagnóstico, las tres plantillas, Input List, materiales, checklist,
importación/exportación JSON, impresión y zoom usan su motor original.

## Uso

1. Seleccionar una presentación en Rider técnico.
2. Usar **Plano visual** para distribuir dibujos o **Conectar** para cablear
   puertos de salida y entrada. Agregar equipos arrastrándolos desde la biblioteca
   o haciendo doble clic; en dispositivos táctiles, tocar el equipo.
3. Seleccionar un dibujo y usar **Editar**, **Duplicar** o **Eliminar**.
   El editor permite cantidades, canales, conectores y opciones propias del equipo.
4. **Ajustar plano** encaja el contenido. **Ordenar plano** distribuye los objetos
   en filas conservando equipos, cantidades, notas y conexiones; pide confirmar
   porque cambia posiciones. **Ampliar editor** abre el área de trabajo a pantalla
   completa.
5. Revisar diagnóstico, materiales y el checklist de ida/regreso.
6. Pulsar **Guardar montaje** o el botón **Guardar** del editor.

Los equipos sin un tipo específico conservan su nombre como recurso genérico.
Los instrumentos acústicos tienen dibujos propios; el equipo técnico agrega sus
micrófonos cuando corresponda. No se inventa cableado al generar un plano.

## Datos y compatibilidad

- Se conserva la ruta existente `eventos/{evento}.stagePlots[presentacion]`.
  No se agregan colecciones, reglas ni dependencias remotas.
- El esquema versión 2 conserva `nodes`, `notes`, `hidden` y `generatedFrom`,
  y añade `patch`: equipos en píxeles, cables, opciones, cantidades, checklist,
  cantidades que se llevan y dimensiones de escenario.
- Abrir un plano anterior conserva sus posiciones y cantidades y no escribe una
  migración automática. El primer guardado explícito persiste la versión 2.
- Los borradores están separados por evento y presentación y sobreviven a cambios
  de pestaña/presentación dentro de la sesión. Al salir de la página con cambios
  pendientes, el navegador solicita confirmación. Cerrar sesión limpia borradores.
- Los guardados usan la transacción y comparación con la versión base existentes.
  Un error o conflicto conserva el borrador. Se puede exportar JSON antes de cargar
  la versión remota. Durante el guardado se bloquea la edición.
- El editor no utiliza las claves globales `msp_*` de localStorage. Cada checklist
  pertenece a su presentación y se guarda explícitamente con el montaje.
- Límite: 250 objetos y 1000 cables por plano. Las unidades se pueden agrupar con
  **Cantidad**. Las necesidades generadas que no caben se conservan en
  `pendingNodes`, se advierten y siguen contando en equipos compartidos.
  Tras liberar espacio y guardar, volver a abrir Rider permite incorporarlas.
- El máximo compartido suma unidades dentro de una presentación y toma el máximo
  entre presentaciones. Los montajes simultáneos requieren revisión de producción.
- Se conserva el control de tamaño de 600 KB para todos los montajes del evento;
  un exceso informa el error sin sustituir el documento remoto.

## Aislamiento del editor

El iframe usa archivos del mismo origen para evitar colisiones de estilos, IDs
y estado global con Eventos. No carga el proyecto hermano mediante URL externa.
`stage-plots.js` intercambia datos por la API directa `window.stageEditor`:
`load`, `getProject`, `print`, `setBusy`, `setNotes`, `fit`, `onChange` y `onSave`.
La API entrega copias de los datos y los cambios llegan al borrador de forma
síncrona. El iframe no accede a Firebase; el guardado sigue en `app.js`.

Los nombres y notas se renderizan como texto escapado. La importación valida
estructura, tamaño, catálogo e identidades antes de reemplazar el montaje.
Las conexiones se conservan para que el diagnóstico permita revisar errores
técnicos, sin eliminar el trabajo del usuario.

## Verificación local

```powershell
node --test tests/stage-plots-model.test.mjs
python -m http.server 4173 --bind 127.0.0.1
# En otra terminal:
node tests/stage-plots-browser.mjs
```

La prueba de navegador intercepta Firebase y RIP con datos en memoria. Comprueba
compatibilidad con versión 1, guardado/recarga de versión 2, cables, cantidades,
checklist independiente, notas, edición de canales, ordenamiento, errores de
guardado, conflictos, JSON, preparación de impresión y ancho móvil.
Las capturas están en `tests/artifacts/stage-plots-*.png`, excluidas de Hosting.

Estos cambios locales no publican GitHub Pages, Firebase Hosting ni reglas.
La prueba con datos simulados no confirma autenticación o guardado en producción.
