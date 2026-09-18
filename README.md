# Musicala | Seguimiento de eventos y muestras

App web estática, sin PWA, conectada al proyecto Firebase `muestras-de-proceso`.

Sirve para hacer seguimiento a:

- Eventos generales.
- Musicala Fest.
- Muestras de proceso.
- Open Day.
- Ensayos.
- Actividades internas.
- Checklist técnico/logístico.
- Muestras por estudiante o grupo.
- Bitácora de decisiones, riesgos y aprendizajes.

## Qué incluye

- Login con Google usando Firebase Auth.
- Firestore como base de datos.
- CRUD de eventos.
- Submódulos por evento:
  - Actividades.
  - Muestras.
  - Checklist.
  - Bitácora.
- Plantillas base según tipo de evento.
- Exportación JSON de un evento o de todo el sistema.
- Importación JSON de eventos exportados.
- Diseño responsive.
- Sin service worker, sin manifest, sin instalación PWA.

## Archivos principales

```txt
index.html
styles.css
src/firebase-config.js
src/app.js
firestore.rules
firebase.json
.firebaserc
docs/modelo-de-datos.md
```

## Activar Firebase

En Firebase Console:

1. Entra al proyecto `muestras-de-proceso`.
2. Ve a **Authentication > Sign-in method**.
3. Activa **Google** como proveedor.
4. Ve a **Firestore Database** y crea la base de datos si aún no existe.
5. Copia las reglas de `firestore.rules` en **Firestore > Rules** y publícalas.

> Las reglas incluidas permiten leer/crear/editar solo a las cuentas Google incluidas en la lista autorizada de `firestore.rules`. Solo los correos admin pueden eliminar. Ajusta la lista si quieres cerrar más el acceso.

## Probar localmente

No abras el archivo con doble clic. Los módulos de Firebase necesitan servidor local.

Opción rápida con Python:

```bash
cd musicala-eventos-app
python -m http.server 5500
```

Luego abre:

```txt
http://localhost:5500
```

También puedes usar la extensión **Live Server** de VS Code.

## Publicar en Firebase Hosting

Instala Firebase CLI si no lo tienes:

```bash
npm install -g firebase-tools
```

Inicia sesión:

```bash
firebase login
```

Desde la carpeta del proyecto:

```bash
firebase deploy
```

El archivo `firebase.json` ya apunta al proyecto `muestras-de-proceso` por `.firebaserc`.

## Recomendación de uso

1. Crea un evento o carga la plantilla base 2026.
2. Entra al evento.
3. Carga el checklist base.
4. Agrega actividades con responsables y fechas límite.
5. Registra muestras por estudiante/grupo.
6. Usa la bitácora para dejar decisiones, riesgos y aprendizajes.
7. Exporta JSON antes de cambios grandes.

## Notas importantes

- Esta app no importa directamente Excel. Para traer datos del archivo viejo, conviene limpiar primero una base y luego cargarla manualmente o adaptar una importación CSV/JSON.
- La estructura está pensada para que después se pueda conectar con otros módulos de Musicala: estudiantes, docentes, repertorio, diplomas y calendario.

## Sistema anual de Muestras de Proceso

El botón **📅 Sistema anual de muestras** abre la guía institucional sin seleccionar
un evento. Primero muestra calendario, semana tipo, bloques, política de presentación,
ampliaciones y decisiones; la edición está separada en secciones desplegables.

- Configuración maestra compartida en `configuracion/muestrasProceso`.
- Calendarios y ajustes independientes en `configuracion/muestrasProceso/anios/{YYYY}`.
- Si no existe el documento, se muestran los valores iniciales sin escribir automáticamente.
  **Editar configuración → Guardar cambios** los persiste. La primera generación de
  eventos también guarda la configuración inicial si todavía no existe.
- Selecciona el año, calcula o edita fechas y pulsa **Guardar**. Restaurar fechas
  calculadas modifica el borrador y requiere guardar. No cambia otros años.
- Las reglas son editables: semana anterior a Semana Santa, última semana completa
  de un mes, semana completa numerada o semana que termina el primer sábado.
  El cálculo gregoriano de Pascua ocurre localmente, sin API. Semana completa significa
  lunes a sábado; Semana Santa comienza el Domingo de Ramos. En 2026 resulta:
  16–21 marzo, 25–30 mayo, 14–19 septiembre y 30 noviembre–5 diciembre.
- Familias instrumentales: se pueden agregar y cambiar día, icono, instrumentos,
  descripción, orden y estado. Desactivar conserva referencias de participantes anteriores.
- Los bloques tienen horario, duración y cupo propios; se pueden agregar y eliminar.
  Se calcula el cupo diario, se validan horarios y pausa y se advierte si el tiempo
  máximo de todos los participantes supera la duración del bloque.
- **Crear Muestras de Proceso del año** presenta un resumen y pide confirmación.
  Usa transacciones e identificadores deterministas por año/ciclo. Repetir la acción
  no duplica eventos ni sobrescribe la operación de eventos existentes.
- Las modificaciones registran usuario, fecha, sección y valores anteriores/nuevos.
  La guía muestra los últimos 30 registros; los demás permanecen en Firestore.

En eventos de tipo **Muestra de proceso**, el panel **Capacidad por jornada** cuenta
los registros reales de `muestras`, uno por presentación. Un ensamble ocupa un cupo;
el seguimiento individual de sus integrantes sigue usando la lógica existente.
Los registros antiguos aparecen como **Sin asignar** y se pueden clasificar desde
Participantes. También se elige familia al agregar desde RIP o crear un ensamble.
No se infiere la familia a partir del repertorio ni se bloquean inscripciones.

Los permisos usan la misma lista de cuentas Google autorizadas de los eventos.
No hay lectura pública. Solo administradores pueden borrar configuración; el historial
solo admite entradas del usuario autenticado y su edición/borrado requiere administrador.

### Verificación local del módulo

```powershell
node --test tests/muestras-model.test.mjs
python -m http.server 4173
# En otra terminal, con Playwright disponible (PLAYWRIGHT_MODULE puede indicar su ruta):
node tests/browser-smoke.mjs
firebase emulators:exec --only firestore --project demo-muestras-anual --config .firebase-test.json "node tests/firestore-rules.test.mjs"
```

La prueba de navegador intercepta Firebase y RIP con un adaptador en memoria; no escribe
producción. Cubre configuración ausente, guardado/recarga, aislamiento anual, generación
repetida, conflicto de edición, registros antiguos, selección de familia, Kanban, cierre
de sesión y ancho móvil. Las capturas quedan en `tests/artifacts/`, excluidas de Hosting.
Las pruebas de reglas usan exclusivamente un proyecto demo del emulador.

La autenticación Google real y la persistencia en producción deben verificarse en una
sesión autorizada después de publicar Hosting y las reglas correspondientes. Cambiar
los archivos locales no despliega reglas ni inicializa documentos en producción.
