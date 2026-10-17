# Activar archivos de Partituras

Proyecto: `muestras-de-proceso`.
Bucket configurado: `muestras-de-proceso.firebasestorage.app`.

1. En Firebase Console, abre Storage y crea/activa el bucket. Firebase puede solicitar habilitar facturación. Si el nombre del bucket es diferente, actualiza `storageBucket` en `src/firebase-config.js` y publica la aplicación.
2. En Storage → Rules, revisa y publica `storage.rules`. Estas reglas son para el bucket nuevo: si ya hay reglas para otros proyectos o rutas, incorpora únicamente el bloque de Partituras y sus funciones, conservando las demás reglas.
3. Para las descargas autenticadas desde GitHub Pages, aplica `storage-cors.json` al bucket desde Google Cloud Shell:

```sh
gcloud storage buckets update gs://muestras-de-proceso.firebasestorage.app --cors-file=storage-cors.json
```

4. En Eventos → Partituras, sube un PDF y descárgalo desde otra sesión autorizada para comprobar el circuito completo.

No se publicaron reglas de Storage durante la implementación. No necesitas cambiar Firestore Rules: los metadatos usan `eventos/{eventoId}/partituras/{archivoId}`, bajo los permisos actuales del equipo.

Los archivos no se exponen en el formulario docente sin sesión. La descarga usa la sesión de Firebase y no guarda enlaces públicos en Firestore. Solo los administradores ven Eliminar. PDF, PNG, JPG, Word, MusicXML y MuseScore: hasta 20 MB por archivo. Carga un archivo cada vez.

Los registros anteriores de Documentos y Bitácora se conservan; sus pestañas se retiraron. Partituras tiene su propia colección.

La exportación JSON incluye los metadatos de Partituras, pero no los archivos. Al importar un evento no se copian estos adjuntos: deben subirse de nuevo para que el evento importado tenga sus propios archivos. Eliminar un evento también intenta retirar sus archivos de Storage antes de borrar sus registros; si Storage no responde, se detiene la eliminación.
