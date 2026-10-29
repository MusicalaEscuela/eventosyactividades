import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, reconcile, toEditorProject, fromEditorProject, normalizeProject, consolidatedPlots, resourceKey, deviceTypeForName, SUPPORTED_DEVICE_IDS } from '../src/stage-plots-model.js';

test('generation preserves member identities, instruments and maximum of selected needs', () => {
  const row = { id: 'ensamble', integrantes: [{ studentId: 'ana', participanteId: 'a', nombre: 'Ana', instrumento: 'Piano' }, { studentId: 'luis', participanteId: 'b', nombre: 'Luis', instrumento: 'Teclado' }], recursosSeleccionados: ['Silla sin brazos', 'Piano / teclado', 'Luces'] };
  const generated = generate(row, [{ id: 'a', recursosSeleccionados: ['Silla sin brazos'] }, { id: 'b', recursosSeleccionados: ['Silla sin brazos'] }]);
  assert.deepEqual(generated.nodes.filter(node => node.kind === 'person').map(node => node.id), ['person:ana', 'person:luis']);
  assert.equal(generated.nodes.find(node => resourceKey(node.name) === 'piano teclado').quantity, 2);
  assert.equal(generated.nodes.find(node => resourceKey(node.name) === 'silla sin brazos').quantity, 2);
  assert.equal(toEditorProject(generated).cables.length, 0, 'no invented technical connections');
});

test('automatic equipment layout avoids the former pile of resources at the front', () => {
  const data = generate({ id: 'big', estudianteGrupo: 'Estudiante', recursosSeleccionados: Array.from({ length: 30 }, (_, i) => `Equipo especial ${i}`) });
  const patch = toEditorProject(data);
  assert.ok(patch.stageWidth >= 1400);
  assert.ok(patch.stageHeight > 960);
  const positions = patch.elements.map(element => `${element.x}:${element.y}`);
  assert.equal(new Set(positions).size, positions.length);
  const equipment = patch.elements.filter(element => element.kind === 'resource');
  for (let i = 1; i < equipment.length; i++) if (equipment[i].y === equipment[i - 1].y) assert.ok(equipment[i].x - equipment[i - 1].x >= 190 - 0.001);
});

test('legacy migration retains percentages, quantity, free text and unknown resource needs', () => {
  const legacy = { version: 1, notes: 'Revisar antes de abrir', nodes: [{ id: 'person:a', kind: 'person', name: 'Ana', detail: 'Viola', x: 45, y: 30 }, { id: 'custom:chair', kind: 'resource', name: 'Silla sin brazos', quantity: 5, x: 20, y: 50 }, { id: 'custom:unknown', kind: 'resource', name: 'Material especial', quantity: 2, x: 60, y: 65 }] };
  const patch = toEditorProject(legacy, { name: 'Mi presentación' });
  assert.equal(patch.name, 'Mi presentación');
  assert.equal(patch.elements[1].typeId, 'chair');
  assert.equal(patch.elements[2].typeId, 'generic_resource');
  const roundTrip = fromEditorProject(patch, legacy);
  assert.equal(roundTrip.version, 2);
  assert.equal(roundTrip.nodes[0].x, 45);
  assert.equal(roundTrip.nodes[0].y, 30);
  assert.equal(roundTrip.nodes[1].quantity, 5);
  assert.equal(roundTrip.notes, legacy.notes);
});

test('saved legacy coordinates and quantities win while new needs appear', () => {
  const generated = generate({ id: 'a', estudianteGrupo: 'Ana nueva', instrumento: 'Piano', recursosSeleccionados: ['Luces'] });
  const saved = { version: 1, nodes: [{ id: 'person:a', kind: 'person', name: 'Ana', x: 21, y: 43 }, { id: 'resource:piano teclado', kind: 'resource', name: 'Piano', quantity: 3, x: 70, y: 60 }, { id: 'custom:foo', kind: 'resource', name: 'Atril especial', quantity: 2, x: 10, y: 20 }], notes: 'Notas técnicas' };
  const result = reconcile(saved, generated);
  assert.equal(result.nodes.find(node => node.id === 'person:a').name, 'Ana nueva');
  assert.equal(result.nodes.find(node => node.id === 'person:a').x, 21);
  assert.equal(result.nodes.find(node => node.id === 'resource:piano teclado').quantity, 3);
  assert.ok(result.nodes.some(node => node.id === 'resource:luces'));
  assert.ok(result.nodes.some(node => node.id === 'custom:foo'));
  assert.equal(result.notes, 'Notas técnicas');
});

test('editor preserves channels, ports, options, cables, checklist and transport quantities', () => {
  const patch = normalizeProject({ name: 'Patch', elements: [{ id: 'guitar', typeId: 'guitar_electric', x: 40, y: 40, name: 'Guitarra Luis', opts: { battery: true } }, { id: 'di', typeId: 'di_active', x: 250, y: 40, channels: 2, opts: { powerMode: 'battery' } }, { id: 'console', typeId: 'mixer', x: 600, y: 40, channels: 12, channelTypes: ['xlr', 'trs'], opts: { phantom: true } }], cables: [{ id: 'c1', fromEl: 'guitar', fromPort: 'out_ts', toEl: 'di', toPort: 'in_ts_2', cableType: 'ts', length: 7.5 }, { id: 'c2', fromEl: 'di', fromPort: 'out_xlr_2', toEl: 'console', toPort: 'in_12', cableType: 'xlr', length: 12 }], checks: { 'Guitarra::ida': true, 'Guitarra::reg': false }, quantities: { 'Guitarra': 0 }, notes: 'Conectar al canal 12' });
  assert.equal(patch.cables.length, 2);
  assert.equal(patch.elements[1].opts.powerMode, 'battery');
  const result = fromEditorProject(patch);
  assert.deepEqual(toEditorProject(result), patch);
  assert.equal(result.patch.checks['Guitarra::ida'], true);
  assert.equal(result.patch.quantities.Guitarra, 0);
  assert.equal(result.patch.cables[0].length, 7.5);
});

test('reconcile preserves a completed patch and appends only new source nodes', () => {
  const source = generate({ id: 'a', estudianteGrupo: 'Ana', instrumento: 'Piano', recursosSeleccionados: ['Luces'] });
  const patch = toEditorProject(source);
  const removed = patch.elements.find(element => element.typeId === 'lights');
  patch.elements = patch.elements.filter(element => element.id !== removed.id);
  patch.elements[0].x = 777;
  patch.elements[0].name = 'Nombre editado';
  patch.checks = { 'Piano::ida': true };
  const saved = fromEditorProject(patch, source);
  assert.ok(saved.hidden.includes(removed.id));
  const updatedSource = generate({ id: 'a', estudianteGrupo: 'Nombre fuente cambiado', instrumento: 'Piano', recursosSeleccionados: ['Luces', 'Atril'] });
  const reconciled = reconcile(saved, updatedSource);
  assert.equal(reconciled.patch.elements[0].x, 777);
  assert.equal(reconciled.patch.elements[0].name, 'Nombre editado');
  assert.equal(reconciled.patch.checks['Piano::ida'], true);
  assert.ok(!reconciled.patch.elements.some(element => element.id === removed.id));
  assert.ok(reconciled.patch.elements.some(element => element.typeId === 'music_stand'));
  assert.deepEqual(reconcile(reconciled, updatedSource), reconciled, 'opening repeatedly does not duplicate resources');
});

test('normalizer rejects malformed structures, duplicate identities and orphan cables', () => {
  const result = normalizeProject({ name: '<img src=x onerror=alert(1)>', elements: [null, { id: 'bad', typeId: 'does_not_exist' }, { id: 'mic', typeId: 'mic_dynamic', x: -10, y: 'not-a-number', quantity: 10000 }, { id: 'mic', typeId: 'person' }, { id: 'mixer', typeId: 'mixer', channels: 4, opts: { phantom: true, injected: '<script>' } }], cables: [{ id: 'orphan', fromEl: 'not-here', fromPort: 'out_xlr', toEl: 'mixer', toPort: 'in_1' }, { id: 'bad-port', fromEl: 'mic', fromPort: 'not-here', toEl: 'mixer', toPort: 'in_1' }, { id: 'ok', fromEl: 'mic', fromPort: 'out_xlr', toEl: 'mixer', toPort: 'in_1', cableType: 'xlr', length: -100 }], checks: JSON.parse('{"__proto__":true,"a":true,"b":"true"}'), quantities: { a: -20, b: 2.6 } });
  assert.equal(result.elements.length, 2);
  assert.equal(result.elements[0].x, 0);
  assert.equal(result.elements[0].y, 0);
  assert.equal(result.elements[0].quantity, 999);
  assert.equal(result.cables.length, 1);
  assert.equal(result.cables[0].length, 0);
  assert.equal(Object.hasOwn(result.elements[1].opts, 'injected'), false);
  assert.equal(Object.hasOwn(result.checks, '__proto__'), false);
  assert.deepEqual(result.checks, { a: true, b: false });
  assert.deepEqual(result.quantities, { a: 0, b: 3 });
  assert.equal(result.name, '<img src=x onerror=alert(1)>', 'names remain plain text; the view must escape HTML');
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(normalizeProject(null).elements.length, 0);
});

test('normalization caps project size and rejects ports outside configured channels', () => {
  const many = normalizeProject({ elements: Array.from({ length: 260 }, (_, index) => ({ id: `e${index}`, typeId: 'person' })) });
  assert.equal(many.elements.length, 250);
  const patch = normalizeProject({ elements: [{ id: 'mic', typeId: 'mic_dynamic' }, { id: 'console', typeId: 'mixer', channels: 2 }], cables: [{ id: 'invalid', fromEl: 'mic', fromPort: 'out_xlr', toEl: 'console', toPort: 'in_3', cableType: 'xlr' }] });
  assert.equal(patch.cables.length, 0);
});

test('shared inventory sums within one presentation and takes maximum across presentations', () => {
  const plots = [{ nodes: [{ id: 'a', kind: 'resource', name: 'Piano', quantity: 1 }, { id: 'b', kind: 'resource', name: 'Teclado', quantity: 2 }, { id: 'c', kind: 'person', name: 'Docente' }] }, { patch: { elements: [{ id: 'd', typeId: 'keyboard_stereo', name: 'Piano digital', quantity: 2 }, { id: 'e', typeId: 'chair', name: 'Silla', quantity: 4 }] } }];
  const totals = consolidatedPlots(plots);
  assert.equal(totals.find(item => resourceKey(item.name) === 'piano teclado').quantity, 3);
  assert.equal(totals.find(item => resourceKey(item.name) === 'silla sin brazos').quantity, 4);
  assert.equal(totals.length, 2);
});

test('name mapping keeps supports separate and accepts non-electronic instruments', () => {
  assert.equal(deviceTypeForName('Soporte de parlante Empire Sound'), 'generic_resource');
  assert.equal(deviceTypeForName('Parlante Empire Sound con cable de energía'), 'speaker_active');
  assert.equal(deviceTypeForName('Guitarra acústica'), 'guitar_acoustic');
  assert.equal(deviceTypeForName('Violín'), 'violin');
  assert.equal(deviceTypeForName('Flauta traversa'), 'flute');
  assert.equal(deviceTypeForName('Necesidad especial'), 'generic_resource');
  const names = ['Voz', 'Batería', 'Bajo', 'Piano', 'Guitarra', 'Amplificador', 'Soporte de teclado', 'Base de micrófono', 'Atril', 'Tarima', 'Telones cafés', 'Trípode para cámara', 'Luces', 'Toma de corriente', 'Consola', 'Interfaz de audio', 'Caja directa', 'Audífonos', 'Silla sin brazos', 'Viola', 'Cello', 'Saxo', 'Trompeta', 'Percusión'];
  names.forEach(name => assert.ok(SUPPORTED_DEVICE_IDS.includes(deviceTypeForName(name)), `${name} maps to a supported editor type`));
  assert.equal(deviceTypeForName('Batería'), 'drum_full');
});

test('import callers can reject unknown devices by comparing normalized element count', () => {
  const imported = { elements: [{ id: 'known', typeId: 'chair' }, { id: 'unknown', typeId: 'external_device' }] };
  assert.notEqual(normalizeProject(imported).elements.length, imported.elements.length);
});

test('duplicated source links cannot collapse independent editor nodes', () => {
  const original = generate({ id: 'ana', estudianteGrupo: 'Ana', instrumento: 'Piano' });
  const patch = toEditorProject(original);
  const piano = patch.elements.find(element => element.typeId === 'keyboard_stereo');
  patch.elements.push({ ...piano, id: 'duplicate:one', x: 900 });
  const saved = fromEditorProject(patch, original);
  assert.equal(saved.nodes.length, patch.elements.length);
  assert.equal(new Set(saved.nodes.map(node => node.id)).size, saved.nodes.length);
  assert.equal(saved.patch.elements.filter(element => element.sourceNodeId === piano.sourceNodeId).length, 1);
  assert.equal(consolidatedPlots([saved]).find(item => resourceKey(item.name) === 'piano teclado').quantity, 2);
  assert.deepEqual(reconcile(saved, original).patch.elements, saved.patch.elements);
});

test('original Stage Plot cable endpoint schema and connector names survive unchanged', () => {
  const raw = { elements: [{ id: '_mic', typeId: 'mic_dynamic', name: 'Mic' }, { id: '_mix', typeId: 'mixer', name: 'Mixer', channels: 8 }], cables: [{ id: '_cable', fromEl: '_mic', fromPort: 'out_xlr', toEl: '_mix', toPort: 'in_1', cableType: 'xlr', length: 5 }] };
  const normalized = normalizeProject(raw);
  assert.deepEqual(normalized.cables, raw.cables);
  const saved = fromEditorProject(raw);
  assert.deepEqual(reconcile(saved, { nodes: [] }).patch.cables, raw.cables);
});

test('over-capacity automatic generation retains every omitted need in pendingNodes', () => {
  const source = generate({ id: 'large', estudianteGrupo: 'Grupo grande', recursosSeleccionados: Array.from({ length: 260 }, (_, index) => `Recurso distinto ${index}`) });
  assert.equal(source.nodes.length, 261, 'source remains complete for change detection');
  const reconciled = reconcile(null, source);
  assert.equal(reconciled.nodes.length, 250);
  assert.equal(reconciled.pendingNodes.length, 11);
  assert.equal(new Set([...reconciled.nodes, ...reconciled.pendingNodes].map(node => node.id)).size, source.nodes.length);
  const saved = fromEditorProject(toEditorProject(reconciled), reconciled);
  assert.deepEqual(saved.pendingNodes, reconciled.pendingNodes);
  const reopened = reconcile(saved, source);
  assert.equal(reopened.patch.elements.length, 250);
  assert.equal(reopened.pendingNodes.length, 11);
  assert.equal(consolidatedPlots([reopened]).length, 260, 'pending resource needs remain counted');
});

test('reconciliation preserves custom equipment at capacity and retries pending nodes after deletion', () => {
  const initial = generate({ id: 'a', estudianteGrupo: 'Ana', instrumento: 'Piano' });
  const patch = toEditorProject(initial);
  for (let index = 0; index < 247; index++) patch.elements.push({ id: `custom:${index}`, typeId: 'generic_resource', name: `Equipo propio ${index}`, quantity: 2 });
  const saved = fromEditorProject(patch, initial);
  assert.equal(saved.patch.elements.length, 249);
  const source = generate({ id: 'a', estudianteGrupo: 'Ana', instrumento: 'Piano', recursosSeleccionados: ['Luces', 'Atril', 'Silla'] });
  const full = reconcile(saved, source);
  assert.equal(full.patch.elements.length, 250);
  assert.equal(full.pendingNodes.length, 2);
  assert.equal(full.patch.elements.filter(element => element.id.startsWith('custom:')).length, 247);
  const removedId = full.patch.elements.find(element => element.typeId === 'lights').id;
  const edited = structuredClone(full.patch);
  edited.elements = edited.elements.filter(element => element.id !== removedId);
  const afterDelete = fromEditorProject(edited, full);
  assert.equal(afterDelete.pendingNodes.length, 2);
  const retried = reconcile(afterDelete, source);
  assert.equal(retried.patch.elements.length, 250);
  assert.equal(retried.pendingNodes.length, 1);
  assert.ok(!retried.patch.elements.some(element => element.id === removedId), 'explicit deletion remains hidden');
  assert.equal(retried.patch.elements.filter(element => element.id.startsWith('custom:')).length, 247);
  assert.deepEqual(reconcile(retried, source), retried, 'capacity warning is stable across openings');
});

test('legacy expansion protects existing custom resources before deferring new generated items', () => {
  const source = generate({ id: 'legacy', estudianteGrupo: 'Legado', recursosSeleccionados: Array.from({ length: 250 }, (_, index) => `Nueva necesidad ${index}`) });
  const saved = { version: 1, nodes: [{ id: 'person:legacy', kind: 'person', name: 'Legado', x: 30, y: 40 }, { id: 'custom:keep', kind: 'resource', name: 'Recurso propio', quantity: 7, x: 60, y: 70 }], notes: 'Conservar' };
  const reconciled = reconcile(saved, source);
  assert.equal(reconciled.nodes.length, 250);
  assert.equal(reconciled.pendingNodes.length, 2);
  assert.equal(reconciled.nodes.find(node => node.id === 'custom:keep').quantity, 7);
  assert.equal(reconciled.nodes.find(node => node.id === 'person:legacy').x, 30);
  assert.equal(reconciled.nodes.length + reconciled.pendingNodes.length, source.nodes.length + 1);
});
