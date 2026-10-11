import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';

// Tests the public UI and server-readback handling using the same Firestore
// test adapter as the admin regression. Security is covered separately by
// docentes-rules.test.mjs against the actual emulator Rules engine.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.setDefaultTimeout(8000);
page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR', error.stack); });
page.on('dialog', dialog => dialog.accept());
await page.route('**/src/firebase-config.js*', route => route.fulfill({ contentType: 'text/javascript', path: fileURLToPath(new URL('./firebase-mock.js', import.meta.url)) }));
const deadline = { seconds: Math.floor(Date.now() / 1000) + 3600 };
const seeds = [
  ['convocatoriasDocentes/muestra-prueba', { eventoId: 'muestra-prueba', titulo: 'Muestra de prueba', fechaInicio: '2026-10-20', lugar: 'Sala de muestras', abierta: true, cierreAt: deadline, docentes: { docente1: 'Docente Uno', docente2: 'Docente Dos' } }],
  ['convocatoriasDocentes/muestra-cerrada', { eventoId: 'muestra-cerrada', titulo: 'Muestra cerrada', fechaInicio: '2026-10-10', abierta: false, cierreAt: deadline, docentes: { docente1: 'Docente Uno' } }],
  ['personas/privada', { nombre: 'Persona privada de administración', email: 'privado@example.com' }]
];
await page.addInitScript(records => {
  if (!sessionStorage.getItem('annual-test-store')) sessionStorage.setItem('annual-test-store', JSON.stringify(records));
}, seeds);

const root = process.env.TEST_URL || 'http://127.0.0.1:4173';
const choose = async teacher => {
  await page.locator('#eventChoice').selectOption('muestra-prueba');
  await page.locator('#teacherChoice').selectOption(teacher);
  await page.locator('#startForm button[type="submit"]').click();
  await page.locator('#teacherForm').waitFor();
};
const presentation = index => page.locator(`[data-presentation="${index}"]`);
const snapshot = async path => page.evaluate(key => window.testStore.get(key), path);
const waitRevision = async (token, revision) => {
  await page.waitForFunction(({ token, revision }) => window.testStore.get(`fichasDocentes/${token}`)?.revision === revision, { token, revision });
};

try {
  await page.goto(`${root}/docentes.html`);
  await page.locator('#startForm').waitFor();
  assert.equal(await page.locator('#loginBtn').count(), 0);
  assert.equal(await page.locator('#eventChoice option').count(), 2);
  assert.equal(await page.getByText('Persona privada de administración', { exact: true }).count(), 0);
  await choose('docente1');
  await presentation(0).locator('[name="estudianteGrupo"]').fill('Ana María');
  await presentation(0).locator('[name="repertorio"]').fill('Minueto');
  await presentation(0).locator('[name="duracionMin"]').fill('4');
  await page.locator('#saveDraftBtn').click();
  await page.locator('#privateLink').waitFor();
  await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('confirmado por el servidor'));
  const privateUrl = await page.locator('#privateLink').inputValue();
  const token = new URLSearchParams(new URL(privateUrl).hash.slice(1)).get('ficha');
  assert.match(token, /^[a-f0-9]{64}$/);
  await waitRevision(token, 1);
  assert.equal((await snapshot(`fichasDocentes/${token}`)).estado, 'Borrador');

  // Reopening by name on the same browser uses its private link, one ficha.
  await page.locator('#newFormBtn').click();
  await choose('docente1');
  assert.equal(await page.locator('#privateLink').inputValue(), privateUrl);
  assert.equal(await page.evaluate(() => window.testStore.all().filter(([path]) => path.startsWith('fichasDocentes/') && path.split('/').length === 2).length), 1);

  await page.locator('[name="asistencia"]').selectOption('No');
  await page.locator('#submitFichaBtn').click();
  await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('preparación'));
  assert.equal((await snapshot(`fichasDocentes/${token}`)).revision, 1);
  await presentation(0).locator('[name="preparacion"]').fill('Afinar antes de entrar');
  await presentation(0).locator('[name="inicio"]').fill('Dar cuatro tiempos');
  await page.locator('#addPresentationBtn').click();
  await presentation(1).locator('[name="tipo"]').selectOption('Ensamble');
  await presentation(1).locator('[name="estudianteGrupo"]').fill('Dúo de violines');
  await presentation(1).locator('[name="integrantesTexto"]').fill('Ana María\nBruno');
  await presentation(1).locator('[name="repertorio"]').fill('Dúo de prueba');
  await presentation(1).locator('[name="duracionMin"]').fill('3');
  await presentation(1).locator('[name="preparacion"]').fill('Dos atriles');
  await presentation(1).locator('[name="inicio"]').fill('Bruno da la entrada');
  await page.locator('#submitFichaBtn').click();
  await waitRevision(token, 2);
  await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('Enviado a coordinación'));
  assert.equal((await snapshot(`fichasDocentes/${token}`)).cantidadPresentaciones, 2);
  assert.equal((await snapshot(`fichasDocentes/${token}/presentaciones/p02`)).integrantesTexto, 'Ana María\nBruno');
  assert.equal(await page.evaluate(() => window.testStore.all().some(([path]) => path.includes('/muestras/'))), false);

  await mkdir('tests/artifacts', { recursive: true });
  await page.screenshot({ path: 'tests/artifacts/docentes-public-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'tests/artifacts/docentes-public-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Close, read-only consultation, selective reopening and confirmed lock.
  await page.evaluate(() => {
    const data = window.testStore.get('convocatoriasDocentes/muestra-prueba');
    window.testStore.set('convocatoriasDocentes/muestra-prueba', { ...data, abierta: false });
  });
  await page.reload();
  await page.locator('#teacherForm').waitFor();
  assert.equal(await page.locator('#submitFichaBtn').isDisabled(), true);
  assert.equal(await presentation(0).locator('[name="estudianteGrupo"]').getAttribute('readonly'), '');
  await page.evaluate(token => {
    const path = `fichasDocentes/${token}`, data = window.testStore.get(path);
    window.testStore.set(path, { ...data, estado: 'Requiere ajustes', revision: 3, reabiertaHasta: { seconds: Math.floor(Date.now() / 1000) + 3600 } });
  }, token);
  await page.reload();
  await page.locator('#teacherForm').waitFor();
  assert.equal(await page.locator('#submitFichaBtn').isEnabled(), true);
  await page.locator('#saveDraftBtn').click();
  await waitRevision(token, 4);
  await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('Borrador guardado'));
  assert.equal((await snapshot(`fichasDocentes/${token}/presentaciones/p02`)).revision, 4);
  await page.evaluate(token => {
    const path = `fichasDocentes/${token}`, data = window.testStore.get(path);
    window.testStore.set(path, { ...data, estado: 'Confirmado', revision: 5 });
  }, token);
  await page.reload();
  await page.locator('#teacherForm').waitFor();
  assert.equal(await page.locator('#submitFichaBtn').isDisabled(), true);

  // A new artwork proposal needs its count, and zero stage minutes is valid.
  await page.evaluate(() => {
    const path = 'convocatoriasDocentes/muestra-prueba', data = window.testStore.get(path);
    window.testStore.set(path, { ...data, abierta: true });
  });
  await page.locator('#newFormBtn').click();
  await choose('docente2');
  await presentation(0).locator('[name="areaArtisticaId"]').selectOption('artes-plasticas');
  await presentation(0).locator('[name="estudianteGrupo"]').fill('Camila');
  await presentation(0).locator('[name="repertorio"]').fill('Acuarelas');
  await presentation(0).locator('[name="duracionMin"]').fill('0');
  await presentation(0).locator('[name="cantidadObras"]').fill('2');
  // The write succeeds, but a network failure occurs before server readback.
  await page.evaluate(() => window.testStore.failNextServerRead('fichasDocentes/'));
  await page.locator('#submitFichaBtn').click();
  await page.locator('#verifyCommittedBtn').waitFor();
  assert.equal(await page.locator('#submitFichaBtn').isDisabled(), true);
  const pendingUrl = await page.locator('#privateLink').inputValue();
  const pendingToken = new URLSearchParams(new URL(pendingUrl).hash.slice(1)).get('ficha');
  assert.match(pendingToken, /^[a-f0-9]{64}$/);
  assert.equal((await snapshot(`fichasDocentes/${pendingToken}`)).estado, 'Enviado');
  assert.equal((await snapshot(`fichasDocentes/${pendingToken}/presentaciones/p01`)).cantidadObras, 2);
  await page.locator('#verifyCommittedBtn').click();
  await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('Ficha guardada y confirmada por el servidor'));
  assert.equal(await page.locator('#privateLink').inputValue(), pendingUrl);
  assert.equal(await page.evaluate(() => window.testStore.all().filter(([path]) => path.startsWith('fichasDocentes/') && path.split('/').length === 2).length), 2);
  assert.deepEqual(errors, []);
  console.log('PASS: formato público sin login; borrador, enlace privado, misma ficha, ausencia, ensamble, envío, consultas cerradas, reapertura, confirmado, artes, recuperación de lectura y móvil sin desborde; 0 errores JS.');
} finally {
  await browser.close();
}
