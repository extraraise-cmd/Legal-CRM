const APP_VERSION = '1.1';
const API = '/api/leads';

let _clerk;

async function apiFetch(url, options = {}) {
  const token = await _clerk.session.getToken();
  return fetch(url, {
    ...options,
    headers: { ...options.headers, 'Authorization': `Bearer ${token}` },
  });
}

// ── State ──
let currentFilter  = 'todos';
let allLeads       = [];
let editingId      = null;
let activeDrawerId = null;
let activeTab      = 'leads';
let statsSource    = '';
let statsDateFrom  = '';
let statsDateTo    = '';
let chartDonut     = null;
let chartBar       = null;

// ── Constants ──
const STATUSES = ['nuevo', 'contactado', 'calificado', 'perdido', 'convertido'];
const STATUS_LABELS = {
  nuevo: 'Nuevo', contactado: 'Contactado', calificado: 'Calificado',
  perdido: 'Perdido', convertido: 'Convertido',
};
const STATUS_COLORS = {
  nuevo: '#3b82f6', contactado: '#f59e0b', calificado: '#22c55e',
  perdido: '#ef4444', convertido: '#a855f7',
};
const STATUS_BG = {
  nuevo: '#eff6ff', contactado: '#fffbeb', calificado: '#f0fdf4',
  perdido: '#fef2f2', convertido: '#faf5ff',
};
const SOURCES_LIST = ['Referido', 'Externo', 'Marketing', 'Recurrente Marketing'];
const QUALITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const QUALITY_CLASS  = { baja: 'q-baja', media: 'q-media', alta: 'q-alta' };

// ── DOM refs ──
const modalOverlay  = document.getElementById('modalOverlay');
const leadForm      = document.getElementById('leadForm');
const leadsBody     = document.getElementById('leadsBody');
const modalTitle    = document.getElementById('modalTitle');
const submitBtn     = document.getElementById('submitBtn');
const formError     = document.getElementById('formError');
const fieldName     = document.getElementById('fieldName');
const fieldEmail    = document.getElementById('fieldEmail');
const fieldPhone    = document.getElementById('fieldPhone');
const fieldSource   = document.getElementById('fieldSource');
const fieldStatus   = document.getElementById('fieldStatus');
const fieldMessage  = document.getElementById('fieldMessage');
const leadIdInput   = document.getElementById('leadId');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawerName    = document.getElementById('drawerName');
const drawerBadge   = document.getElementById('drawerBadge');
const drawerInfoGrid        = document.getElementById('drawerInfoGrid');
const drawerMessageSection  = document.getElementById('drawerMessageSection');
const drawerMessageText     = document.getElementById('drawerMessageText');
const activityLog   = document.getElementById('activityLog');
const activityInput = document.getElementById('activityInput');
const searchInput   = document.getElementById('searchInput');
const fieldQuality  = document.getElementById('fieldQuality');
const fieldAmount   = document.getElementById('fieldAmount');

// ════════════════════════════════════════
//  TAB SWITCHING
// ════════════════════════════════════════
document.querySelectorAll('[data-tab]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    switchTab(el.dataset.tab);
  });
});

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('leadsView').classList.toggle('hidden', tab !== 'leads');
  document.getElementById('statsView').classList.toggle('hidden', tab !== 'stats');
  document.getElementById('marketingView').classList.toggle('hidden', tab !== 'marketing');
  document.querySelectorAll('[data-tab]').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === tab)
  );
  if (tab === 'stats') renderStats();
}

// ════════════════════════════════════════
//  MODAL crear / editar
// ════════════════════════════════════════
function openModal(lead = null) {
  editingId              = lead ? lead.id : null;
  modalTitle.textContent = lead ? 'Editar lead' : 'Nuevo lead';
  submitBtn.textContent  = lead ? 'Actualizar'  : 'Guardar';

  fieldName.value    = lead ? lead.name           : '';
  fieldEmail.value   = lead ? lead.email          : '';
  fieldPhone.value   = lead ? lead.phone          : '';
  fieldSource.value  = lead ? lead.source         : '';
  fieldStatus.value  = lead ? lead.status         : 'nuevo';
  fieldQuality.value = lead ? (lead.quality || '') : '';
  fieldAmount.value  = lead && lead.amount != null ? lead.amount : '';
  fieldMessage.value = lead ? lead.message        : '';
  leadIdInput.value  = lead ? lead.id             : '';

  clearErrors();
  modalOverlay.classList.remove('hidden');
  fieldName.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  leadForm.reset();
  clearErrors();
  editingId = null;
}

function clearErrors() {
  document.getElementById('errName').textContent  = '';
  document.getElementById('errEmail').textContent = '';
  fieldName.classList.remove('error');
  fieldEmail.classList.remove('error');
  formError.classList.add('hidden');
  formError.textContent = '';
}

document.getElementById('openModal').addEventListener('click', () => openModal());
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelModal').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

leadForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearErrors();

  const amountRaw = fieldAmount.value.trim();
  const payload = {
    name:    fieldName.value.trim(),
    email:   fieldEmail.value.trim(),
    phone:   fieldPhone.value.trim(),
    source:  fieldSource.value,
    status:  fieldStatus.value,
    quality: fieldQuality.value,
    amount:  amountRaw !== '' ? parseFloat(amountRaw) : null,
    message: fieldMessage.value.trim(),
  };

  let hasError = false;
  if (!payload.name)  { document.getElementById('errName').textContent  = 'El nombre es obligatorio.'; fieldName.classList.add('error');  hasError = true; }
  if (!payload.email) { document.getElementById('errEmail').textContent = 'El email es obligatorio.';  fieldEmail.classList.add('error'); hasError = true; }
  if (hasError) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando…';

  try {
    const url    = editingId ? `${API}/${editingId}` : API;
    const method = editingId ? 'PATCH' : 'POST';
    const res    = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data   = await res.json();

    if (!res.ok) { formError.textContent = data.error || 'Error desconocido.'; formError.classList.remove('hidden'); return; }

    const wasEditing = !!editingId;
    closeModal();
    showToast(wasEditing ? 'Lead actualizado correctamente.' : 'Lead creado correctamente.');
    await fetchLeads();
    if (activeDrawerId === data.id) renderDrawer(data);
  } catch {
    formError.textContent = 'No se pudo conectar con el servidor.';
    formError.classList.remove('hidden');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = editingId ? 'Actualizar' : 'Guardar';
  }
});

// ════════════════════════════════════════
//  DRAWER ver más
// ════════════════════════════════════════
async function openDrawer(id) {
  try {
    const res  = await apiFetch(`${API}/${id}`);
    const lead = await res.json();
    activeDrawerId = lead.id;
    renderDrawer(lead);
    drawerOverlay.classList.remove('hidden');
  } catch { console.error('Error al cargar lead'); }
}

function renderDrawer(lead) {
  drawerName.textContent  = lead.name;
  drawerBadge.className   = `badge badge-${lead.status}`;
  drawerBadge.textContent = lead.status;

  drawerInfoGrid.innerHTML =
    infoItem('Email',   lead.email   || null) +
    infoItem('Teléfono',lead.phone   || null) +
    infoItem('Fuente',  lead.source  || null) +
    infoItem('Calidad', lead.quality ? QUALITY_LABELS[lead.quality] : null) +
    infoItem('Importe', lead.amount  != null ? formatAmount(lead.amount) : null) +
    infoItem('Creado',  formatDate(lead.createdAt));

  if (lead.message) {
    drawerMessageSection.style.display = '';
    drawerMessageText.textContent = lead.message;
  } else {
    drawerMessageSection.style.display = 'none';
  }

  renderActivityLog(lead.activities || []);
  document.getElementById('drawerEditBtn').onclick   = () => { closeDrawer(); openModal(lead); };
  document.getElementById('drawerDeleteBtn').onclick = () => deleteLeadFromDrawer(lead.id);
}

function infoItem(label, value) {
  const display = value
    ? `<div class="info-value">${escHtml(value)}</div>`
    : `<div class="info-value muted">—</div>`;
  return `<div class="info-item"><div class="info-label">${label}</div>${display}</div>`;
}

function renderActivityLog(activities) {
  activityLog.innerHTML = !activities.length
    ? '<p class="activity-empty">Sin actividad registrada aún.</p>'
    : activities.map(a => `
        <div class="activity-item">
          <div class="activity-dot"></div>
          <div class="activity-content">
            <div class="activity-text">${escHtml(a.text)}</div>
            <div class="activity-date">${formatDatetime(a.createdAt)}</div>
          </div>
        </div>`).join('');
}

function closeDrawer() {
  drawerOverlay.classList.add('hidden');
  activeDrawerId   = null;
  activityInput.value = '';
}

drawerOverlay.addEventListener('click', e => { if (e.target === drawerOverlay) closeDrawer(); });
document.getElementById('closeDrawer').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!drawerOverlay.classList.contains('hidden')) { closeDrawer(); return; } closeModal(); }
});

document.getElementById('addActivityBtn').addEventListener('click', async () => {
  const text = activityInput.value.trim();
  if (!text || !activeDrawerId) return;
  const btn = document.getElementById('addActivityBtn');
  btn.disabled = true; btn.textContent = 'Añadiendo…';
  try {
    const res = await apiFetch(`${API}/${activeDrawerId}/activities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    if (res.ok) {
      activityInput.value = '';
      const lead = await (await apiFetch(`${API}/${activeDrawerId}`)).json();
      renderActivityLog(lead.activities);
    }
  } catch { console.error('Error al añadir actividad'); }
  finally { btn.disabled = false; btn.textContent = 'Añadir nota'; activityInput.focus(); }
});

activityInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') document.getElementById('addActivityBtn').click();
});

// ════════════════════════════════════════
//  LEADS FILTERS + TABLE
// ════════════════════════════════════════
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    applyFilters();
  });
});

if (searchInput) {
  searchInput.addEventListener('input', applyFilters);
}

async function fetchLeads() {
  showSkeleton();
  try {
    const list = await (await apiFetch(API)).json();
    allLeads = list;
    updateFilterCounts(list);
    applyFilters();
  } catch { console.error('Error al cargar leads'); }
}

function renderLeads(leads) {
  if (!leads.length) {
    const searching = searchInput && searchInput.value.trim();
    const msg = searching
      ? `Sin resultados para "<strong>${escHtml(searchInput.value.trim())}</strong>".`
      : currentFilter === 'todos' ? 'No hay leads aún. ¡Crea el primero!'
        : `No hay leads con estado "<strong>${STATUS_LABELS[currentFilter] || currentFilter}</strong>".`;
    leadsBody.innerHTML = `<tr><td colspan="7" class="empty-state">
      <span class="empty-state-icon">◎</span>${msg}</td></tr>`;
    return;
  }
  leadsBody.innerHTML = leads.map(l => `
    <tr data-id="${l.id}">
      <td>
        <div class="lead-name">${escHtml(l.name)}</div>
        ${l.phone ? `<div class="lead-sub">${escHtml(l.phone)}</div>` : ''}
      </td>
      <td><div style="font-size:13px;color:var(--text-muted)">${escHtml(l.email)}</div></td>
      <td>${l.source ? `<span style="font-size:13px;color:var(--text-muted)">${escHtml(l.source)}</span>` : '<span style="color:#cbd5e1">—</span>'}</td>
      <td>
        <select class="quality-select ${l.quality ? QUALITY_CLASS[l.quality] : ''}"
                onchange="changeQuality(${l.id}, this)">
          <option value=""    ${!l.quality          ? 'selected' : ''}>—</option>
          <option value="baja"  ${l.quality==='baja'  ? 'selected' : ''}>Baja</option>
          <option value="media" ${l.quality==='media' ? 'selected' : ''}>Media</option>
          <option value="alta"  ${l.quality==='alta'  ? 'selected' : ''}>Alta</option>
        </select>
      </td>
      <td>
        <span class="badge badge-${l.status}">${STATUS_LABELS[l.status] || l.status}</span>
        ${l.amount != null ? `<div class="lead-amount">${formatAmount(l.amount)}</div>` : ''}
      </td>
      <td class="lead-date">${formatDate(l.createdAt)}</td>
      <td>
        <div class="table-actions">
          <button class="btn-ver-mas" onclick="openDrawer(${l.id})">Ver más</button>
          <button class="btn-icon edit" title="Editar"   onclick="editLead(${l.id})">✎</button>
          <button class="btn-icon del"  title="Eliminar" onclick="deleteLead(${l.id})">✕</button>
        </div>
      </td>
    </tr>`).join('');
}

async function editLead(id) {
  try { openModal(await (await apiFetch(`${API}/${id}`)).json()); }
  catch { console.error('Error al obtener lead'); }
}

async function deleteLead(id) {
  if (!confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return;
  await apiFetch(`${API}/${id}`, { method: 'DELETE' });
  if (activeDrawerId === id) closeDrawer();
  showToast('Lead eliminado.', 'info');
  fetchLeads();
}

async function deleteLeadFromDrawer(id) {
  if (!confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return;
  await apiFetch(`${API}/${id}`, { method: 'DELETE' });
  closeDrawer();
  showToast('Lead eliminado.', 'info');
  fetchLeads();
}

// ════════════════════════════════════════
//  ESTADÍSTICAS
// ════════════════════════════════════════
document.querySelectorAll('#sourcePills .pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#sourcePills .pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    statsSource = btn.dataset.source;
    renderStats();
  });
});

const statsDateFromEl = document.getElementById('statsDateFrom');
const statsDateToEl   = document.getElementById('statsDateTo');

statsDateFromEl.addEventListener('change', () => {
  statsDateFrom = statsDateFromEl.value;
  statsDateFromEl.classList.toggle('active', !!statsDateFrom);
  renderStats();
});
statsDateToEl.addEventListener('change', () => {
  statsDateTo = statsDateToEl.value;
  statsDateToEl.classList.toggle('active', !!statsDateTo);
  renderStats();
});
document.getElementById('clearDatesBtn').addEventListener('click', () => {
  statsDateFrom = statsDateTo = '';
  statsDateFromEl.value = statsDateToEl.value = '';
  statsDateFromEl.classList.remove('active');
  statsDateToEl.classList.remove('active');
  renderStats();
});

document.getElementById('downloadLeadsBtn').addEventListener('click', async () => {
  const all   = await (await apiFetch(API)).json();
  const leads = filterByDate(all);
  if (!leads.length) { showToast('No hay leads en ese rango de fechas.', 'info'); return; }
  downloadCSV(leads);
  showToast(`${leads.length} leads exportados.`);
});

function filterByDate(leads) {
  let list = leads;
  if (statsDateFrom) {
    const from = new Date(statsDateFrom);
    list = list.filter(l => new Date(l.createdAt) >= from);
  }
  if (statsDateTo) {
    const to = new Date(statsDateTo + 'T23:59:59');
    list = list.filter(l => new Date(l.createdAt) <= to);
  }
  return list;
}

function downloadCSV(leads) {
  const cols = [
    ['ID',         l => l.id],
    ['Nombre',     l => l.name],
    ['Email',      l => l.email],
    ['Teléfono',   l => l.phone   || ''],
    ['Fuente',     l => l.source  || ''],
    ['Calidad',    l => QUALITY_LABELS[l.quality] || ''],
    ['Estado',     l => STATUS_LABELS[l.status]   || l.status],
    ['Importe',    l => l.amount != null ? l.amount : ''],
    ['Mensaje',    l => l.message || ''],
    ['Creado',     l => new Date(l.createdAt).toLocaleDateString('es-ES')],
    ['Actividades',l => (l.activities || []).length],
  ];

  const esc  = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    cols.map(([h]) => esc(h)).join(','),
    ...leads.map(l => cols.map(([, fn]) => esc(fn(l))).join(',')),
  ].join('\r\n');

  const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url });
  const from = statsDateFrom || 'inicio';
  const to   = statsDateTo   || new Date().toISOString().slice(0, 10);
  a.download = `leads_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function renderStats() {
  const all   = await (await apiFetch(API)).json();
  const dated = filterByDate(all);
  const leads = statsSource !== '' ? dated.filter(l => l.source === statsSource) : dated;

  // update subtitle with active period
  const subtitle = document.getElementById('statsSubtitle');
  if (statsDateFrom || statsDateTo) {
    const f = statsDateFrom ? new Date(statsDateFrom).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) : '…';
    const t = statsDateTo   ? new Date(statsDateTo  ).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) : 'hoy';
    subtitle.textContent = `Periodo: ${f} – ${t}`;
  } else {
    subtitle.textContent = 'Análisis del pipeline de ventas';
  }

  if (!dated.length) {
    document.getElementById('kpiGrid').innerHTML = '<div class="empty-stats">No hay leads en ese rango de fechas.</div>';
    document.querySelector('.charts-row').style.display = 'none';
    document.querySelector('.breakdown-card').style.display = 'none';
    return;
  }
  document.querySelector('.charts-row').style.display    = '';
  document.querySelector('.breakdown-card').style.display = '';

  renderKPIs(leads, dated.length);
  renderDonut(leads);
  renderBarChart(dated);
  renderBreakdown(dated);
}

function countByStatus(leads) {
  const c = {};
  STATUSES.forEach(s => c[s] = 0);
  leads.forEach(l => { if (c[l.status] !== undefined) c[l.status]++; });
  return c;
}

function renderKPIs(leads, totalAll) {
  const total      = leads.length;
  const byStatus   = countByStatus(leads);
  const converted  = byStatus.convertido;
  const lost       = byStatus.perdido;
  const inPipeline = byStatus.contactado + byStatus.calificado;
  const convRate   = total ? ((converted  / total) * 100).toFixed(1) : '0.0';
  const lossRate   = total ? ((lost       / total) * 100).toFixed(1) : '0.0';

  const closedBase = converted + lost;
  const realConv   = closedBase ? ((converted / closedBase) * 100).toFixed(0) : '—';

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon" style="background:#eff6ff;color:#3b82f6">◎</div>
      <div class="kpi-body">
        <div class="kpi-label">Total leads</div>
        <div class="kpi-value">${total}</div>
        ${statsSource ? `<div class="kpi-sub">de ${totalAll} en total</div>` : `<div class="kpi-sub">&nbsp;</div>`}
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:#f0fdf4;color:#22c55e">✓</div>
      <div class="kpi-body">
        <div class="kpi-label">Tasa de conversión</div>
        <div class="kpi-value">${convRate}<span class="kpi-unit">%</span></div>
        <div class="kpi-sub">${converted} convertidos · ${realConv}% sobre cerrados</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:#fefce8;color:#f59e0b">⬆</div>
      <div class="kpi-body">
        <div class="kpi-label">En pipeline</div>
        <div class="kpi-value">${inPipeline}</div>
        <div class="kpi-sub">${byStatus.calificado} calificados · ${byStatus.contactado} contactados</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:#fef2f2;color:#ef4444">✕</div>
      <div class="kpi-body">
        <div class="kpi-label">Tasa de pérdida</div>
        <div class="kpi-value">${lossRate}<span class="kpi-unit">%</span></div>
        <div class="kpi-sub">${lost} perdidos</div>
      </div>
    </div>`;
}

function renderDonut(leads) {
  if (chartDonut) { chartDonut.destroy(); chartDonut = null; }

  const byStatus = countByStatus(leads);
  const total    = leads.length;
  const ctx      = document.getElementById('chartDonut').getContext('2d');

  chartDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: STATUSES.map(s => STATUS_LABELS[s]),
      datasets: [{
        data: STATUSES.map(s => byStatus[s]),
        backgroundColor: STATUSES.map(s => STATUS_COLORS[s]),
        borderWidth: 3,
        borderColor: '#fff',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `  ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  document.getElementById('donutLegend').innerHTML = STATUSES.map(s => {
    const count = byStatus[s];
    const pct   = total ? ((count / total) * 100).toFixed(0) : 0;
    return `<div class="legend-item">
      <span class="legend-dot" style="background:${STATUS_COLORS[s]}"></span>
      <span class="legend-label">${STATUS_LABELS[s]}</span>
      <span class="legend-count">${count}</span>
      <span class="legend-pct">${pct}%</span>
    </div>`;
  }).join('');
}

function renderBarChart(all) {
  if (chartBar) { chartBar.destroy(); chartBar = null; }

  const activeSources = [...SOURCES_LIST, ''].filter(s => all.some(l => l.source === s));
  const labels        = activeSources.map(s => s || 'Sin fuente');

  const datasets = STATUSES.map(status => ({
    label: STATUS_LABELS[status],
    data: activeSources.map(src => all.filter(l => l.source === src && l.status === status).length),
    backgroundColor: STATUS_COLORS[status],
    borderRadius: 3,
    borderSkipped: false,
  }));

  const ctx = document.getElementById('chartBar').getContext('2d');
  chartBar = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 12 } } },
        y: { stacked: true, ticks: { stepSize: 1, font: { size: 12 } }, grid: { color: '#f1f5f9' } },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 11, boxHeight: 11, padding: 16, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => `  ${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
      },
    },
  });
}

function renderBreakdown(all) {
  const activeSources = [...SOURCES_LIST, ''].filter(s => all.some(l => l.source === s));

  const rows = activeSources.map(src => {
    const group    = all.filter(l => l.source === src);
    const byStatus = countByStatus(group);
    const total    = group.length;
    const closed   = byStatus.convertido + byStatus.perdido;
    const convPct  = closed ? Math.round((byStatus.convertido / closed) * 100) : 0;
    const convAll  = total  ? Math.round((byStatus.convertido / total)  * 100) : 0;
    return { label: src || 'Sin fuente', byStatus, total, convPct, convAll };
  });

  const totalByStatus = countByStatus(all);
  const totalClosed   = totalByStatus.convertido + totalByStatus.perdido;
  const totalConvPct  = totalClosed ? Math.round((totalByStatus.convertido / totalClosed) * 100) : 0;

  document.getElementById('breakdownTable').innerHTML = `
    <thead>
      <tr>
        <th>Fuente</th>
        ${STATUSES.map(s => `<th><span class="bdg-mini" style="background:${STATUS_BG[s]};color:${STATUS_COLORS[s]}">${STATUS_LABELS[s]}</span></th>`).join('')}
        <th>Total</th>
        <th title="Convertidos / (Convertidos + Perdidos)">Conv. real</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `
        <tr>
          <td class="source-cell">${escHtml(r.label)}</td>
          ${STATUSES.map(s => `<td class="num-cell">${r.byStatus[s] || 0}</td>`).join('')}
          <td class="num-cell total-cell">${r.total}</td>
          <td class="conv-cell">${convBar(r.convPct)}</td>
        </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td class="source-cell">Total</td>
        ${STATUSES.map(s => `<td class="num-cell">${totalByStatus[s]}</td>`).join('')}
        <td class="num-cell total-cell">${all.length}</td>
        <td class="conv-cell">${convBar(totalConvPct)}</td>
      </tr>
    </tfoot>`;
}

function convBar(pct) {
  return `<div class="conv-bar-wrap">
    <div class="conv-bar-track"><div class="conv-bar" style="width:${pct}%"></div></div>
    <span>${pct}%</span>
  </div>`;
}

async function changeQuality(id, selectEl) {
  const quality = selectEl.value;
  selectEl.className = `quality-select ${quality ? QUALITY_CLASS[quality] : ''}`;
  try {
    await apiFetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quality }),
    });
    const lead = allLeads.find(l => l.id === id);
    if (lead) lead.quality = quality;
  } catch {
    showToast('Error al cambiar la calidad.', 'error');
  }
}

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
function formatAmount(amount) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDatetime(iso) {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ════════════════════════════════════════
//  SKELETON / TOAST / FILTER UTILS
// ════════════════════════════════════════
function showSkeleton() {
  leadsBody.innerHTML = Array(6).fill(`
    <tr>
      <td><div class="skel skel-name"></div><div class="skel skel-sub"></div></td>
      <td><div class="skel skel-email"></div></td>
      <td><div class="skel skel-source"></div></td>
      <td><div class="skel skel-badge"></div></td>
      <td><div class="skel skel-date"></div></td>
      <td></td>
    </tr>`).join('');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 280);
  }, 3000);
}

function updateFilterCounts(leads) {
  document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
    const s = btn.dataset.status;
    const count = s === 'todos' ? leads.length : leads.filter(l => l.status === s).length;
    btn.textContent = s === 'todos' ? `Todos (${count})` : `${STATUS_LABELS[s]} (${count})`;
  });
}

function applyFilters() {
  const query = (searchInput?.value ?? '').trim().toLowerCase();
  let list = currentFilter !== 'todos'
    ? allLeads.filter(l => l.status === currentFilter)
    : allLeads;
  if (query) {
    list = list.filter(l =>
      l.name.toLowerCase().includes(query) ||
      l.email.toLowerCase().includes(query)
    );
  }
  renderLeads(list);
}

// ════════════════════════════════════════
//  AUTH + BOOTSTRAP
// ════════════════════════════════════════
function showScreen(name) {
  document.getElementById('auth-screen').classList.toggle('hidden', name !== 'auth');
  document.getElementById('pending-screen').classList.toggle('hidden', name !== 'pending');
  document.getElementById('app-layout').classList.toggle('hidden', name !== 'app');
}

async function bootstrap() {
  const { clerkPublishableKey } = await fetch('/config').then(r => r.json());

  // ── Modo dev: sin Clerk configurado ──────────────────────────────────────
  if (!clerkPublishableKey || clerkPublishableKey.startsWith('pk_test_XXX')) {
    // apiFetch usará x-api-key en lugar de Bearer token
    apiFetch = (url, options = {}) => fetch(url, {
      ...options,
      headers: { ...options.headers, 'x-api-key': 'minicrm-secret-2026' },
    });
    showScreen('app');
    document.getElementById('user-name').textContent  = 'Admin (dev)';
    document.getElementById('user-email').textContent = 'sin Clerk configurado';
    document.getElementById('signout-btn').style.display = 'none';
    document.getElementById('appVersion').textContent = `v${APP_VERSION}`;
    fetchLeads();
    return;
  }

  // ── Modo producción: Clerk ────────────────────────────────────────────────
  _clerk = new window.Clerk(clerkPublishableKey);
  await _clerk.load();

  _clerk.addListener(({ user }) => {
    if (!user) showScreen('auth');
  });

  if (!_clerk.user) {
    showScreen('auth');
    _clerk.mountSignIn(document.getElementById('sign-in-container'), {
      afterSignInUrl: '/',
      afterSignUpUrl: '/',
    });
    return;
  }

  const token = await _clerk.session.getToken();
  const check = await fetch('/api/leads', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (check.status === 403) {
    const body = await check.json().catch(() => ({}));
    if (body.code === 'PENDING_APPROVAL') {
      showScreen('pending');
      document.getElementById('pending-signout').onclick = () =>
        _clerk.signOut().then(() => location.reload());
      return;
    }
  }

  const u = _clerk.user;
  document.getElementById('user-name').textContent  = u.fullName || u.primaryEmailAddress?.emailAddress || '';
  document.getElementById('user-email').textContent = u.primaryEmailAddress?.emailAddress || '';
  document.getElementById('signout-btn').onclick    = () =>
    _clerk.signOut().then(() => location.reload());

  showScreen('app');
  document.getElementById('appVersion').textContent = `v${APP_VERSION}`;
  fetchLeads();
}

bootstrap();
