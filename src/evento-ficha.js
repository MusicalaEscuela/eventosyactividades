const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const rows = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();
const count = (value, missing = '…') => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value).toLocaleString('es-CO') : missing;
const ready = attendance => attendance.ready !== false;
const stylesURL = new URL('./evento-ficha.css?v=20261029-aforo-1', import.meta.url).href;

function dateLabel(value) {
  const valueText = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valueText);
  if (!match) return valueText || 'Fecha por definir';
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(match[3])} de ${months[Number(match[2]) - 1] || match[2]} de ${match[1]}`;
}

function seatLabel(attendance) {
  return count(attendance.sillasTotal, ready(attendance) ? 'Por definir' : '…');
}

function sourceLabel(attendance) {
  if (!ready(attendance)) return attendance.readStatus === 'error' ? 'Cálculo no disponible: falta cargar los datos del evento.' : 'Cargando estudiantes y equipo…';
  return attendance.sillasModo === 'manual' ? 'Cantidad ajustada manualmente' : 'Cálculo automático · solo personas confirmadas';
}

function breakdown(attendance, compact = false) {
  const entries = [
    ['estudiantes', '🎓', 'Estudiantes', attendance.estudiantes],
    ['equipo', '🤝', 'Equipo', attendance.equipo],
    ['invitados', '👥', 'Invitados registrados', attendance.invitadosRegistrados],
    ['publico', '🎟️', 'Público adicional', attendance.publicoAdicional]
  ];
  return `<div class="event-attendance-breakdown ${compact ? 'is-compact' : ''}">${entries.map(([key, icon, label, value]) => `<div><span aria-hidden="true">${icon}</span><strong data-attendance-part="${key}">${ready(attendance) ? count(value, 'Por definir') : '…'}</strong><span>${label}</span></div>`).join('')}</div>`;
}

/** Reused in Participants, Team, Rider, Schedule and Checklist. No stored totals. */
export function renderAttendanceSummary(attendance = {}) {
  const pending = ready(attendance) && Number(attendance.pendientes?.personas) > 0 ? `<span class="event-attendance-pending">${count(attendance.pendientes.personas)} persona(s) por confirmar</span>` : '';
  return `<aside class="event-attendance-summary" data-attendance-summary aria-label="Sillas y asistencia del evento"><div class="event-attendance-summary-main"><span aria-hidden="true">🪑</span><div><strong><span data-chair-total>${esc(seatLabel(attendance))}</span> sillas por preparar</strong><small>${esc(sourceLabel(attendance))}</small></div></div><div class="event-attendance-summary-numbers"><span><b data-attendance-total>${ready(attendance) ? count(attendance.totalPersonas, 'Por definir') : '…'}</b> personas confirmadas</span>${pending}</div><button type="button" class="small-btn" data-action="view-ficha">Ver ficha del evento</button></aside>`;
}

function fact(label, value, fallback = 'Por definir', extra = '') {
  return `<div class="event-sheet-fact ${extra}"><dt>${esc(label)}</dt><dd>${esc(text(value) || fallback)}</dd></div>`;
}

function programmePreview(programming = []) {
  const ordered = rows(programming).slice().sort((a, b) => Number(a.diaPrograma || 0) - Number(b.diaPrograma || 0) || Number(!a.hora) - Number(!b.hora) || text(a.hora).localeCompare(text(b.hora)));
  if (!ordered.length) return '<p class="event-sheet-empty">El programa todavía no tiene momentos registrados.</p>';
  return `<ol class="event-sheet-programme">${ordered.slice(0, 6).map(row => `<li><time>${esc(row.hora || 'Sin hora')}${Number(row.diaPrograma) > 0 ? `<small>Día ${Number(row.diaPrograma) + 1}</small>` : ''}</time><div><strong>${esc(row.item || row.estudianteGrupo || 'Momento por definir')}</strong>${row.encargado ? `<span>${esc(row.encargado)}</span>` : ''}</div></li>`).join('')}</ol>${ordered.length > 6 ? `<p class="event-sheet-footnote">${ordered.length - 6} momento(s) más en Minuto a minuto.</p>` : ''}`;
}

function confirmedTeam(ctx, attendance) {
  const people = rows(attendance.personasConfirmadas?.equipo);
  if (!ready(attendance)) return `<p class="event-sheet-empty">${esc(sourceLabel(attendance))}</p>`;
  if (!people.length) return '<p class="event-sheet-empty">Aún no hay personas del equipo contabilizadas como confirmadas.</p>';
  const byName = new Map();
  rows(ctx.team).filter(person => ['confirmado', 'listo', 'realizado'].includes(text(person.estado).toLocaleLowerCase('es'))).forEach(person => {
    const name = text(person.nombre).toLocaleLowerCase('es');
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(person);
  });
  return `<ul class="event-sheet-team">${people.map(person => {
    const matching = byName.get(text(person.nombre).toLocaleLowerCase('es')) || [];
    const roles = [...new Set(matching.map(row => text(row.rol)).filter(Boolean))];
    return `<li><span class="event-sheet-person-icon" aria-hidden="true">✓</span><div><strong>${esc(person.nombre || 'Persona confirmada')}</strong>${roles.length ? `<span>${esc(roles.join(' · '))}</span>` : ''}</div></li>`;
  }).join('')}</ul>`;
}

/** A single, printable operational sheet assembled from current event sources. */
export function renderEventSheet(ctx = {}, attendance = {}) {
  const event = ctx.event || {};
  const pending = attendance.pendientes || {};
  const capacityKnown = ready(attendance) && attendance.capacidadLugar !== null && attendance.capacidadLugar !== undefined;
  const capacitySubject = attendance.sillasTotal !== null && attendance.sillasTotal !== undefined && Number(attendance.sillasTotal) >= Number(attendance.totalPersonas) ? 'Las sillas por preparar superan' : 'Las personas confirmadas superan';
  const warnings = rows(attendance.warnings);
  const manual = attendance.sillasModo === 'manual';
  const programCount = rows(ctx.programming).length;
  return `<section class="event-sheet" data-event-ficha>
    <header class="event-sheet-header"><div><span class="event-sheet-eyebrow">INFORMACIÓN PARA ORGANIZAR EL EVENTO</span><h3>Ficha del evento</h3><p>Asistencia, montaje y datos principales en un solo lugar.</p></div><div class="actions"><button type="button" class="btn btn-light" data-action="edit-event">Editar datos del evento</button><button type="button" class="btn btn-light" data-action="print-ficha">Imprimir ficha</button></div></header>
    <div class="event-sheet-attendance">
      <article class="event-sheet-seats"><span class="event-sheet-seats-icon" aria-hidden="true">🪑</span><span>Sillas por preparar</span><strong data-chair-total>${esc(seatLabel(attendance))}</strong><small>${esc(sourceLabel(attendance))}</small>${manual && ready(attendance) ? `<p>Según las confirmaciones: <b>${count(attendance.sillasSugeridas, 'Por definir')}</b> sillas.</p>` : '<p>Una silla por estudiante, integrante del equipo y persona del público confirmada.</p>'}</article>
      <article class="event-sheet-confirmed"><div class="event-sheet-confirmed-heading"><div><span>Personas confirmadas</span><strong data-attendance-total>${ready(attendance) ? count(attendance.totalPersonas, 'Por definir') : '…'}</strong></div><span class="event-sheet-confirmed-tag">Solo confirmados</span></div>${breakdown(attendance)}<p class="event-sheet-footnote">Cada estudiante se cuenta una vez, aunque participe en varias obras o ensambles. El público adicional se suma aparte de los invitados registrados.</p></article>
    </div>
    ${!ready(attendance) ? `<div class="event-sheet-notice" role="status">${esc(sourceLabel(attendance))} Las cifras se mostrarán cuando estén disponibles las confirmaciones.</div>` : Number(pending.personas) > 0 ? `<div class="event-sheet-pending"><div><strong>${count(pending.personas)} persona(s) pendientes de confirmar</strong><p>${count(pending.estudiantes, '0')} estudiantes · ${count(pending.equipo, '0')} del equipo · ${count(pending.invitados, '0')} invitados asociados. Se mantienen fuera del cálculo actual.</p></div><div class="actions"><button type="button" class="small-btn" data-event-section="muestras">Revisar participantes</button><button type="button" class="small-btn" data-event-section="equipo">Revisar equipo</button></div></div>` : '<p class="event-sheet-footnote">Para actualizar el total, registra invitaciones aceptadas en Participantes y personas confirmadas en Equipo.</p>'}
    ${capacityKnown ? `<div class="event-sheet-capacity ${Number(attendance.excesoCapacidad) > 0 ? 'is-over' : ''}" role="status"><span aria-hidden="true">${Number(attendance.excesoCapacidad) > 0 ? '⚠️' : '📍'}</span><span>Capacidad del lugar: <strong>${count(attendance.capacidadLugar)} personas sentadas.</strong>${Number(attendance.excesoCapacidad) > 0 ? ` ${capacitySubject} esa capacidad en ${count(attendance.excesoCapacidad)}.` : ''}</span></div>` : ''}
    ${warnings.length ? `<details class="event-sheet-warnings" open><summary>Datos por revisar (${warnings.length})</summary><ul>${warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul></details>` : ''}
    <div class="event-sheet-section-heading"><h4>Datos del evento</h4><span>${esc(event.estado || 'Estado por definir')}</span></div>
    <dl class="event-sheet-facts">
      ${fact('Evento', event.titulo, 'Sin título', 'is-wide')}
      ${fact('Fecha', dateLabel(event.fechaInicio))}${fact('Hora de inicio', event.horaInicio)}
      ${fact('Lugar', event.lugar)}${fact('Responsable', event.responsable)}
      ${fact('Tipo de evento', event.tipo)}${fact('Público al que se dirige', event.publico)}
      ${fact('Presupuesto', event.presupuesto)}${fact('Ventiladores', event.ventiladoresCantidad === 0 ? '0' : event.ventiladoresCantidad)}
      ${fact('Objetivo', event.objetivo, 'Sin objetivo registrado', 'is-wide is-prose')}${event.notas ? fact('Notas y acuerdos', event.notas, '', 'is-wide is-prose') : ''}
    </dl>
    <div class="event-sheet-bottom"><section class="event-sheet-card"><div class="event-sheet-section-heading"><h4>Minuto a minuto</h4><button type="button" class="small-btn" data-event-section="programacion">Ver programa${programCount ? ` (${programCount})` : ''}</button></div>${programmePreview(ctx.programming)}</section><section class="event-sheet-card"><div class="event-sheet-section-heading"><h4>Equipo confirmado</h4><button type="button" class="small-btn" data-event-section="equipo">Ver equipo</button></div>${confirmedTeam(ctx, attendance)}</section></div>
    <p class="event-sheet-footnote event-sheet-chair-note">Las sillas del escenario se organizan en el rider de cada presentación. Este total sirve para preparar las sillas generales del evento.</p>
  </section>`;
}

/** Returns false when the browser blocks the print window. */
export function printEventSheet(ctx = {}, attendance = {}) {
  const win = window.open('', '_blank');
  if (!win) return false;
  const mainStyles = new URL('../styles.css?v=20261029-aforo-1', import.meta.url).href;
  const title = ctx.event?.titulo || 'Ficha del evento';
  win.document.open();
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Ficha del evento</title><link rel="stylesheet" href="${esc(mainStyles)}"><link rel="stylesheet" href="${esc(stylesURL)}"></head><body class="event-sheet-print"><main>${renderEventSheet(ctx, attendance)}</main></body></html>`);
  win.addEventListener('load', () => { win.focus(); win.print(); }, { once:true });
  win.document.close();
  return true;
}
