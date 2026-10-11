import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// REST uses the real Firestore emulator Rules engine, including atomic
// getAfter and server request.time. No mocked authorisation decisions.
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8187';
const project = 'demo-muestras-anual';
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const admin = 'alekcaballeromusic@gmail.com';
const editor = 'adminmusicala@gmail.com';
const id = `docentes-${Date.now()}`;
const eventId = `${id}-evento`;
const catalogPath = `convocatoriasDocentes/${eventId}`;
const parentPath = token => `fichasDocentes/${token}`;
const childPath = (token, i = 1) => `${parentPath(token)}/presentaciones/p${String(i).padStart(2, '0')}`;
const testToken = suffix => createHash('sha256').update(`${id}-${suffix}`).digest('hex');
const tokenA = testToken('a'), tokenB = testToken('b'), tokenC = testToken('c'), tokenD = testToken('d');

const jwt = email => {
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ aud: project, iss: `https://securetoken.google.com/${project}`, sub: `test-${email}`, user_id: `test-${email}`, email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: 'google.com' } })}.`;
};

function value(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: fields(v) } };
}
const fields = data => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)]));
function decode(v) {
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('stringValue' in v) return v.stringValue;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  return (v.arrayValue?.values || []).map(decode);
}
const headers = email => ({ 'Content-Type': 'application/json', ...(email ? { Authorization: `Bearer ${jwt(email)}` } : {}) });
const request = (path, method = 'GET', email = null, data) => fetch(`${base}/${path}`, { method, headers: headers(email), body: data ? JSON.stringify(data) : undefined });
async function expect(responsePromise, status, label) {
  const response = await responsePromise;
  const body = await response.text();
  assert.equal(response.status, status, `${label}: ${body}`);
  return body ? JSON.parse(body) : null;
}
const set = (path, data, email = admin) => request(path, 'PATCH', email, { fields: fields(data) });
async function read(path, email = null) {
  const result = await expect(request(path, 'GET', email), 200, `read ${path}`);
  return Object.fromEntries(Object.entries(result.fields || {}).map(([k, v]) => [k, decode(v)]));
}
function write(path, data, timestamps = ['updatedAt']) {
  const plain = { ...data };
  timestamps.forEach(k => delete plain[k]);
  return {
    update: { name: `projects/${project}/databases/(default)/documents/${path}`, fields: fields(plain) },
    ...(timestamps.length ? { updateTransforms: timestamps.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) } : {})
  };
}
const commit = (writes, email = null) => fetch(`${base}:commit`, { method: 'POST', headers: headers(email), body: JSON.stringify({ writes }) });
const deletion = path => ({ delete: `projects/${project}/databases/(default)/documents/${path}` });
const parent = (docenteId = 'prof1', count = 1, state = 'Borrador') => ({
  eventoId: eventId, docenteId, docenteNombre: docenteId === 'prof1' ? 'Docente Uno' : 'Docente Dos',
  asistencia: 'Por confirmar', disponibilidad: '', apoyo: '', indicacionesGenerales: '',
  estado: state, revision: 1, cantidadPresentaciones: count,
  revocada: false, reabiertaHasta: null, comentarioCoordinacion: ''
});
const presentation = (revision = 1, state = 'Borrador') => ({
  tipo: 'Individual', estudianteGrupo: state === 'Enviado' ? 'Estudiante' : '', integrantesTexto: '',
  areaArtisticaId: 'musica', instrumento: 'Piano', repertorio: state === 'Enviado' ? 'Obra' : '',
  duracionMin: state === 'Enviado' ? 3 : 0, cantidadObras: 1, recursos: '', materialUrl: '',
  preparacion: '', entrada: '', inicio: '', acompanamiento: '', cierre: '', observaciones: '', revision
});
function initial(token, data, children = []) {
  return [
    write(`${catalogPath}/reservas/${data.docenteId}`, { fichaToken: token }, ['createdAt']),
    write(parentPath(token), data, ['createdAt', 'updatedAt']),
    ...children.map((p, i) => write(childPath(token, i + 1), p))
  ];
}

await expect(set(`eventos/${eventId}`, { titulo: 'Muestra de prueba', estado: 'Planeación' }), 200, 'admin seed evento');
let catalog = { eventoId: eventId, titulo: 'Muestra de prueba', fechaInicio: '2026-10-11', lugar: 'Sala', abierta: true, cierreAt: new Date(Date.now() + 60 * 60 * 1000), docentes: { prof1: 'Docente Uno', prof2: 'Docente Dos' }, updatedAt: new Date(), updatedBy: admin };
await expect(set(catalogPath, catalog), 200, 'admin seed catalog');
await expect(request('convocatoriasDocentes'), 200, 'public minimal catalog list');
await expect(request(catalogPath), 200, 'public catalog get');
await expect(set(catalogPath, catalog, editor), 200, 'existing coordinator can open convocatoria');
await expect(request(catalogPath, 'DELETE', editor), 403, 'existing coordinator cannot delete convocatoria');
await expect(set(catalogPath, catalog, 'externo@example.com'), 403, 'outsider cannot open convocatoria');
await expect(request(`eventos/${eventId}`), 403, 'public canonical event hidden');
await expect(request('personas'), 403, 'public master roster hidden');
await expect(request('fichasDocentes'), 403, 'private ficha list hidden');
await expect(request(parentPath(tokenA)), 403, 'unknown token hidden');
await expect(commit([write(`${catalogPath}/reservas/prof1`, { fichaToken: tokenA }, ['createdAt'])]), 403, 'orphan reservation rejected');
await expect(commit([write(parentPath(tokenA), parent(), ['createdAt', 'updatedAt'])]), 403, 'orphan ficha rejected');
await expect(commit(initial(tokenC, { ...parent(), docenteId: 'inventado' })), 403, 'unknown teacher rejected');
await expect(commit(initial(tokenA, parent(), [presentation()])), 200, 'atomic anonymous draft create');
await expect(request(`${catalogPath}/reservas/prof1`), 403, 'reservation cannot be read publicly');
await expect(request(parentPath(tokenA)), 200, 'known bearer can read own ficha');
await expect(request(`${parentPath(tokenA)}/presentaciones`), 200, 'known bearer can list own presentations');
await expect(commit(initial(tokenB, parent(), [presentation()])), 403, 'same teacher second ficha denied atomically');
await expect(request(parentPath(tokenB), 'GET', admin), 404, 'denied duplicate wrote no parent');

let a = await read(parentPath(tokenA));
const advancing = (extra = {}) => ({ ...a, revision: a.revision + 1, ...extra });
await expect(commit([write(childPath(tokenA), presentation(2))]), 403, 'direct child write needs parent advance');
await expect(commit([deletion(childPath(tokenA))]), 403, 'direct child deletion needs parent advance');
await expect(commit([write(parentPath(tokenA), { ...a, revision: a.revision })]), 403, 'stale revision rejected');
await expect(commit([write(parentPath(tokenA), { ...a, revision: a.revision + 2 })]), 403, 'revision jump rejected');
await expect(commit([write(parentPath(tokenA), advancing({ docenteId: 'prof2' }))]), 403, 'teacher identity immutable');
await expect(commit([write(parentPath(tokenA), advancing({ eventoId: 'otra' }))]), 403, 'event identity immutable');
await expect(commit([write(parentPath(tokenA), advancing({ comentarioCoordinacion: 'Inventado' }))]), 403, 'coordination comment immutable');
await expect(commit([write(parentPath(tokenA), advancing({ reabiertaHasta: new Date(Date.now() + 3600000) }))]), 403, 'public cannot reopen self');
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Confirmado' }))]), 403, 'public cannot confirm self');
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Enviado' }))]), 403, 'submit needs same revision valid p01');
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Enviado' })), write(childPath(tokenA), presentation(2))]), 403, 'empty submitted presentation rejected');
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Enviado', asistencia: 'No' })), write(childPath(tokenA), presentation(2, 'Enviado'))]), 403, 'absent teacher needs execution preparation and start');
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Enviado' })), write(childPath(tokenA), { ...presentation(2, 'Enviado'), materialUrl: 'javascript:alert(1)' })]), 403, 'script material URL rejected');
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Enviado' })), write(childPath(tokenA), { ...presentation(2, 'Enviado'), observaciones: 'x'.repeat(3001) })]), 403, 'field length enforced');
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Enviado' })), write(childPath(tokenA), presentation(2, 'Enviado'))]), 200, 'atomic anonymous submit');
a = await read(parentPath(tokenA));

catalog = { ...catalog, abierta: false };
await expect(set(catalogPath, catalog), 200, 'admin closes catalog');
await expect(commit([write(parentPath(tokenA), advancing())]), 403, 'manual closure blocks save');
await expect(commit([write(parentPath(tokenA), advancing({ cantidadPresentaciones: 0, estado: 'Borrador' })), deletion(childPath(tokenA))]), 403, 'manual closure blocks child deletion');
await expect(set(parentPath(tokenA), { ...a, reabiertaHasta: new Date(Date.now() + 3600000) }), 200, 'admin selectively reopens');
a = await read(parentPath(tokenA));
await expect(commit([write(parentPath(tokenA), advancing()), write(childPath(tokenA), presentation(3, 'Enviado'))]), 200, 'admin selective reopening allows paired revision');
a = await read(parentPath(tokenA));
await expect(set(`eventos/${eventId}`, { titulo: 'Muestra de prueba', estado: 'Realizado' }), 200, 'admin closes canonical event');
await expect(commit([write(parentPath(tokenA), advancing()), write(childPath(tokenA), presentation(4, 'Enviado'))]), 403, 'canonical completed event overrides stale catalog/reopening');
await expect(set(`eventos/${eventId}`, { titulo: 'Muestra de prueba', estado: 'Planeación' }), 200, 'admin restores test event');
await expect(set(parentPath(tokenA), { ...a, estado: 'Confirmado', reabiertaHasta: new Date(Date.now() + 3600000) }), 200, 'admin confirms');
a = await read(parentPath(tokenA));
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Borrador' })), write(childPath(tokenA), presentation(4))]), 403, 'confirmed parent locks public editing');
await expect(commit([write(childPath(tokenA), presentation(4))]), 403, 'confirmed parent locks children');
await expect(set(parentPath(tokenA), { ...a, estado: 'Requiere ajustes' }), 200, 'admin requests adjustment');
a = await read(parentPath(tokenA));
await expect(commit([write(parentPath(tokenA), advancing({ estado: 'Borrador', cantidadPresentaciones: 0 })), deletion(childPath(tokenA))]), 200, 'paired revision can remove a draft presentation');
a = await read(parentPath(tokenA));
await expect(set(parentPath(tokenA), { ...a, revocada: true }), 200, 'admin revokes old link');
await expect(request(parentPath(tokenA)), 403, 'revoked parent unreadable');
await expect(request(`${parentPath(tokenA)}/presentaciones`), 403, 'revoked child list unreadable');
await expect(request(childPath(tokenA)), 403, 'revoked child unreadable');

catalog = { ...catalog, abierta: true, cierreAt: new Date(Date.now() - 60000) };
await expect(set(catalogPath, catalog), 200, 'admin sets expired deadline');
await expect(commit(initial(tokenD, parent('prof2'))), 403, 'expired deadline blocks new ficha');
catalog = { ...catalog, cierreAt: new Date(Date.now() + 3600000) };
await expect(set(catalogPath, catalog), 200, 'admin opens test catalog');
await expect(commit(initial(tokenD, parent('prof2', 20), Array.from({ length: 20 }, () => presentation()))), 200, 'maximum 20 presentation draft atomic create');
let d = await read(parentPath(tokenD));
await expect(commit([write(parentPath(tokenD), { ...d, revision: 2, estado: 'Enviado' }), ...Array.from({ length: 20 }, (_, i) => write(childPath(tokenD, i + 1), presentation(2, 'Enviado')))]), 200, 'maximum 20 presentation atomic submit');
d = await read(parentPath(tokenD));
await expect(commit([write(parentPath(tokenD), { ...d, revision: 3, cantidadPresentaciones: 1 }), write(childPath(tokenD), { ...presentation(3, 'Enviado'), areaArtisticaId: 'artes-plasticas', duracionMin: 0, cantidadObras: 3 }), ...Array.from({ length: 19 }, (_, i) => deletion(childPath(tokenD, i + 2)))]), 200, 'arts may submit zero minutes and explicit artwork count');
await expect(request('fichasDocentes', 'GET', 'externo@example.com'), 403, 'outsider cannot enumerate private fichas');
await expect(request('fichasDocentes', 'GET', editor), 200, 'existing coordinator can review private fichas');
await expect(request('fichasDocentes', 'GET', admin), 200, 'admin can review all fichas');
await expect(set(`eventos/${id}-compat`, { titulo: 'Compatible' }, editor), 200, 'existing event editor rule compatible');
await expect(set(`eventos/${id}-compat/muestras/antigua`, { estudianteGrupo: 'Anterior' }, editor), 200, 'existing participant editor rule compatible');

console.log('PASS: fichas docentes: catálogo mínimo, secreto no enumerable, reserva atómica única, cierre/plazo/evento, revisión, confirmación, revocación, límites y 20 presentaciones; reglas existentes compatibles.');
