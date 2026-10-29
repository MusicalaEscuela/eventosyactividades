import { DEVICE_TYPES } from './stage-patch-data.js?v=20261016-stage';

// Keep the old percentage-based nodes readable while the editor uses pixels.
export const EXTRA_DEVICE_IDS = Object.freeze(['person', 'generic_resource', 'chair', 'riser', 'curtain', 'lights', 'camera_tripod', 'guitar_acoustic', 'violin', 'cello', 'flute', 'saxophone', 'trumpet', 'percussion']);
export const SUPPORTED_DEVICE_IDS = Object.freeze([...Object.keys(DEVICE_TYPES), ...EXTRA_DEVICE_IDS]);
const supported = new Set(SUPPORTED_DEVICE_IDS);
const list = value => Array.isArray(value) ? value : [];
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const copy = value => JSON.parse(JSON.stringify(value));
const text = (value, max = 160) => typeof value === 'string' ? value.slice(0, max).replace(/\u0000/g, '') : '';
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== null && value !== '' ? Math.min(max, Math.max(min, Number(value))) : fallback;
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function resourceKey(name) {
  const key = norm(name);
  if (/^(piano|teclado)( electrico| digital| estereo)?$|^piano teclado$/.test(key)) return 'piano teclado';
  if (/^silla( sin brazos)?$/.test(key)) return 'silla sin brazos';
  return key;
}

export function deviceTypeForName(name) {
  const key = norm(name);
  const exact = Object.values(DEVICE_TYPES).find(type => norm(type.label) === key);
  if (exact) return exact.id;
  const aliases = [
    [/soporte.*teclado|base.*teclado/, 'stand_keyboard'],
    [/soporte.*(parlante|cabina)/, 'generic_resource'],
    [/base.*micro|soporte.*micro|pie.*micro/, 'stand_mic_straight'],
    [/atril/, 'music_stand'], [/alfombra.*bateria/, 'drum_rug'],
    [/silla|banco/, 'chair'], [/tarima/, 'riser'], [/telon|cortina/, 'curtain'],
    [/luces|luz|iluminacion/, 'lights'], [/tripode|camara/, 'camera_tripod'],
    [/multitoma|regleta/, 'power_strip'], [/extension/, 'extension'], [/toma.*corriente/, 'power_outlet'],
    [/monitor/, 'monitor_floor'], [/parlante|cabina/, 'speaker_active'],
    [/ampli.*bajo/, 'amp_bass'], [/ampli/, 'amp_guitar'],
    [/micro.*condensador/, 'mic_condenser'], [/micro/, 'mic_dynamic'],
    [/consola|mixer|mezcladora/, 'mixer'], [/interfaz/, 'audio_interface'],
    [/caja directa|^di( |$)/, 'di_passive'], [/audifono|in ear/, 'headphones'],
    [/piano|teclado/, 'keyboard_stereo'], [/guitarra.*electrica/, 'guitar_electric'],
    [/guitarra/, 'guitar_acoustic'], [/bajo/, 'bass_electric'], [/bateria/, 'drum_full'],
    [/violin|viola/, 'violin'], [/cello|violonchelo/, 'cello'], [/flauta/, 'flute'],
    [/saxo/, 'saxophone'], [/trompeta/, 'trumpet'], [/percusion|cajon|conga|bongo/, 'percussion'],
    [/computador|portatil|laptop/, 'computer'], [/celular|telefono/, 'phone'], [/^voz$|^canto$/, 'vocal_main']
  ];
  return aliases.find(([pattern]) => pattern.test(key))?.[1] || 'generic_resource';
}

const resources = row => list(row.recursosSeleccionados).length ? row.recursosSeleccionados : String(row.recursos || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);

export function generate(row = {}, participants = []) {
  row = record(row);
  const members = list(row.integrantes).length ? row.integrantes : [{ nombre: row.estudianteGrupo, instrumento: row.instrumento, participanteId: row.id }];
  const participantIndex = new Map(list(participants).map(p => [p.id, p]));
  const usedIds = new Set();
  const people = members.map((member, i) => {
    const original = participantIndex.get(member.participanteId) || {};
    const identity = String(member.studentId || member.participanteId || i);
    let id = `person:${identity}`;
    if (usedIds.has(id)) id += `:${i}`;
    usedIds.add(id);
    return { id, kind: 'person', name: member.nombre || original.estudianteGrupo || 'Integrante', detail: member.instrumento || original.instrumento || '' };
  });
  const counts = new Map();
  const add = (name, quantity, minimum = false) => {
    const key = resourceKey(name);
    if (!key) return;
    const old = counts.get(key);
    counts.set(key, { name: old?.name || name, quantity: minimum ? Math.max(old?.quantity || 0, quantity) : (old?.quantity || 0) + quantity });
  };
  people.forEach(person => add(person.detail, 1));
  resources(row).forEach(name => add(name, 1, true));
  const memberCounts = new Map();
  members.forEach(member => resources(participantIndex.get(member.participanteId) || {}).forEach(name => {
    const key = resourceKey(name), old = memberCounts.get(key);
    memberCounts.set(key, { name, quantity: (old?.quantity || 0) + 1 });
  }));
  memberCounts.forEach(item => add(item.name, item.quantity, true));
  const equipment = [...counts].map(([key, value]) => ({ id: `resource:${key}`, kind: 'resource', name: value.name, quantity: value.quantity, detail: '' }));
  const columns = 7, stageWidth = 1440;
  const peopleRows = Math.ceil(people.length / columns);
  const equipmentTop = 100 + peopleRows * 160;
  const stageHeight = Math.max(960, equipmentTop + Math.ceil(equipment.length / columns) * 260 + 80);
  people.forEach((node, index) => Object.assign(node, { x: (130 + index % columns * 190) / stageWidth * 100, y: (80 + Math.floor(index / columns) * 160) / stageHeight * 100 }));
  equipment.forEach((node, index) => Object.assign(node, { x: (130 + index % columns * 190) / stageWidth * 100, y: (equipmentTop + Math.floor(index / columns) * 260) / stageHeight * 100 }));
  return { version: 2, nodes: [...people, ...equipment], notes: '', stageWidth, stageHeight };
}

function portIds(element) {
  const type = DEVICE_TYPES[element.typeId];
  if (!type) return [];
  const count = Math.round(number(element.channels, type.defaultChannels || 1, 1, 64));
  if (type.dynamicPorts === 'di') return Array.from({ length: Math.min(count, 8) }, (_, i) => [`in_ts_${i + 1}`, `thru_${i + 1}`, `out_xlr_${i + 1}`]).flat();
  if (type.dynamicPorts === 'mixer') return [...Array.from({ length: Math.min(count, 32) }, (_, i) => `in_${i + 1}`), 'out_main_l', 'out_main_r', 'aux_1', 'aux_2', 'pwr'];
  if (type.dynamicPorts === 'interface') return [...Array.from({ length: Math.min(count, 32) }, (_, i) => `in_${i + 1}`), 'out_l', 'out_r', 'out_hp', 'usb'];
  if (type.dynamicPorts === 'power') return [...(type.requiresPower ? ['in_pwr'] : []), ...Array.from({ length: Math.min(count, 12) }, (_, i) => `out_${i + 1}`)];
  if (type.dynamicPorts === 'amp') {
    const output = element.opts?.output || type.deviceOptions?.find(option => option.key === 'output')?.default;
    return ['in_ts', output === 'ts_line' ? 'out_line' : output === 'xlr_di' ? 'out_di' : 'out_mic', 'pwr'];
  }
  return list(type.ports).map(port => port.id);
}

/** Validate structure, not HTML. Names and notes remain plain text; renderers must escape them. */
export function normalizeProject(input) {
  const project = record(input), seen = new Set(), sourceIds = new Set(), elements = [];
  for (const raw of list(project.elements).slice(0, 250)) {
    const source = record(raw), id = text(source.id, 180), typeId = text(source.typeId, 64);
    if (!id || seen.has(id) || !supported.has(typeId)) continue;
    seen.add(id);
    const element = { id, typeId, x: number(source.x, 0, 0, 100000), y: number(source.y, 0, 0, 100000), name: text(source.name) || DEVICE_TYPES[typeId]?.label || (typeId === 'person' ? 'Integrante' : 'Recurso'), notes: text(source.notes, 5000), quantity: Math.round(number(source.quantity, 1, 1, 999)), kind: typeId === 'person' ? 'person' : 'resource' };
    const sourceNodeId = text(source.sourceNodeId, 180);
    // Older exports or imported duplicates can carry the original source link.
    // The duplicate remains an independent element instead of sharing one node identity.
    if (sourceNodeId && !sourceIds.has(sourceNodeId)) {
      element.sourceNodeId = sourceNodeId;
      sourceIds.add(sourceNodeId);
    }
    if (source.channels !== undefined) element.channels = Math.round(number(source.channels, 1, 1, 64));
    if (Array.isArray(source.channelTypes)) element.channelTypes = source.channelTypes.slice(0, 64).map(value => ['xlr', 'ts', 'trs'].includes(value) ? value : 'xlr');
    const options = {};
    for (const option of list(DEVICE_TYPES[typeId]?.deviceOptions)) {
      if (!own(record(source.opts), option.key)) continue;
      const value = source.opts[option.key];
      if (option.type === 'checkbox') options[option.key] = value === true;
      else if (list(option.choices).some(choice => choice.value === value)) options[option.key] = value;
    }
    if (Object.keys(options).length) element.opts = options;
    elements.push(element);
  }
  const byId = new Map(elements.map(element => [element.id, element])), cableIds = new Set(), cables = [];
  for (const raw of list(project.cables).slice(0, 1000)) {
    const source = record(raw), id = text(source.id, 180);
    const from = byId.get(source.fromEl), to = byId.get(source.toEl);
    if (!id || cableIds.has(id) || !from || !to || !portIds(from).includes(source.fromPort) || !portIds(to).includes(source.toPort)) continue;
    cableIds.add(id);
    cables.push({ id, fromEl: from.id, fromPort: text(source.fromPort, 64), toEl: to.id, toPort: text(source.toPort, 64), cableType: ['xlr', 'ts', 'trs', 'usb', 'power', 'speaker', 'rca', 'midi', 'other'].includes(source.cableType) ? source.cableType : 'other', length: number(source.length, 0, 0, 10000) });
  }
  const checks = {}, quantities = {};
  for (const [key, value] of Object.entries(record(project.checks)).slice(0, 2000)) if (!['__proto__', 'constructor', 'prototype'].includes(key)) Object.defineProperty(checks, text(key, 220), { value: value === true, enumerable: true, writable: true });
  for (const [key, value] of Object.entries(record(project.quantities)).slice(0, 1000)) if (!['__proto__', 'constructor', 'prototype'].includes(key)) Object.defineProperty(quantities, text(key, 220), { value: Math.round(number(value, 0, 0, 999)), enumerable: true, writable: true });
  return { name: text(project.name) || 'Montaje', version: '2.0', elements, cables, checks, quantities, notes: text(project.notes, 5000), stageWidth: number(project.stageWidth, 1440, 800, 12000), stageHeight: number(project.stageHeight, 960, 900, 100000) };
}

function elementFromNode(node, width, height) {
  return { id: node.id, sourceNodeId: node.id, kind: node.kind === 'person' ? 'person' : 'resource', typeId: node.kind === 'person' ? 'person' : deviceTypeForName(node.name), name: node.name, notes: node.detail || '', quantity: node.kind === 'person' ? 1 : Math.round(number(node.quantity, 1, 1, 999)), x: Math.max(0, number(node.x, 10, 0, 100) / 100 * width - 70), y: number(node.y, 10, 0, 100) / 100 * height };
}

export function toEditorProject(data = {}, { name } = {}) {
  data = record(data);
  if (data.patch) return normalizeProject(data.patch);
  const width = number(data.stageWidth, 1440, 800, 12000), height = number(data.stageHeight, 960, 900, 100000);
  return normalizeProject({ name: name || data.name || 'Montaje', elements: list(data.nodes).map(node => elementFromNode(node, width, height)), cables: [], notes: data.notes || '', stageWidth: width, stageHeight: height });
}

export function fromEditorProject(project, previous = {}) {
  previous = record(previous);
  const patch = normalizeProject(project);
  const present = new Set(patch.elements.map(element => element.sourceNodeId || element.id));
  const hidden = new Set(list(previous.hidden));
  list(previous.nodes).forEach(node => { if (/^(person|resource):/.test(node.id) && !present.has(node.id)) hidden.add(node.id); });
  const nodes = patch.elements.map(element => ({ id: element.id, kind: element.kind, name: element.name, detail: element.notes, ...(element.kind === 'resource' ? { quantity: element.quantity } : {}), x: (element.x + 70) / patch.stageWidth * 100, y: element.y / patch.stageHeight * 100 }));
  return { ...copy(previous), version: 2, nodes, patch, notes: patch.notes, hidden: [...hidden], stageWidth: patch.stageWidth, stageHeight: patch.stageHeight };
}

function uniqueNodes(nodes) {
  const seen = new Set();
  return nodes.filter(node => {
    if (!node?.id || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function capacityData(data, nodes, priorIds = new Set()) {
  const unique = uniqueNodes(nodes);
  // Existing placements and custom resources retain priority as new source needs arrive.
  const ordered = [...unique.filter(node => priorIds.has(node.id)), ...unique.filter(node => !priorIds.has(node.id))];
  return { ...copy(data), nodes: ordered.slice(0, 250), pendingNodes: ordered.slice(250) };
}

export function reconcile(saved, generated) {
  if (!saved) return capacityData(generated, list(generated.nodes));
  const hidden = new Set(list(saved.hidden));
  const existing = new Map(list(saved.nodes).map(node => [node.id, node]));
  const sourceNodes = uniqueNodes([...list(generated.nodes), ...list(saved.pendingNodes)]);
  if (saved.patch) {
    const patch = normalizeProject(saved.patch);
    const identities = new Set(patch.elements.map(element => element.sourceNodeId || element.id));
    // Existing entries are authoritative, including custom imports and deliberate deletions.
    // Only source identities never seen in the saved version are added.
    const additions = sourceNodes.filter(node => !hidden.has(node.id) && !identities.has(node.id) && !existing.has(node.id));
    const slots = Math.max(0, 250 - patch.elements.length);
    patch.elements.push(...additions.slice(0, slots).map(node => elementFromNode(node, generated.stageWidth || 1440, generated.stageHeight || 960)));
    patch.stageWidth = Math.max(patch.stageWidth, generated.stageWidth || 1440);
    patch.stageHeight = Math.max(patch.stageHeight, generated.stageHeight || 960);
    return fromEditorProject(patch, { ...saved, hidden: [...hidden], pendingNodes: additions.slice(slots) });
  }
  const nodes = sourceNodes.filter(node => !hidden.has(node.id)).map(node => {
    const old = existing.get(node.id);
    return old ? { ...node, x: old.x, y: old.y, ...(node.kind === 'resource' ? { quantity: old.quantity ?? node.quantity, detail: old.detail || '' } : {}) } : node;
  });
  nodes.push(...list(saved.nodes).filter(node => !/^(person|resource):/.test(node.id)));
  // Legacy node coordinates were relative to the old board dimensions.
  return capacityData({ ...generated, notes: saved.notes || '', hidden: [...hidden], generatedFrom: saved.generatedFrom || '', stageWidth: saved.stageWidth || 1440, stageHeight: saved.stageHeight || 960 }, nodes, new Set(existing.keys()));
}

export function consolidatedPlots(plotDatas) {
  const maximums = new Map();
  list(plotDatas).forEach(data => {
    const totals = new Map();
    const placed = data?.patch ? fromEditorProject(data.patch, data).nodes : list(data?.nodes);
    const nodes = uniqueNodes([...placed, ...list(data?.pendingNodes)]);
    nodes.filter(node => node.kind === 'resource').forEach(node => {
      const key = resourceKey(node.name);
      if (!key) return;
      const prior = totals.get(key);
      totals.set(key, { name: prior?.name || node.name, quantity: (prior?.quantity || 0) + Math.round(number(node.quantity, 1, 0, 999)) });
    });
    totals.forEach((item, key) => maximums.set(key, { name: maximums.get(key)?.name || item.name, quantity: Math.max(maximums.get(key)?.quantity || 0, item.quantity) }));
  });
  return [...maximums.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
