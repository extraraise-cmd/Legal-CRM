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
let editingId      = null;
let activeDrawerId = null;
let activeTab      = 'leads';
let statsSource    = '';
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

  fieldName.value    = lead ? lead.name    : '';
  fieldEmail.value   = lead ? lead.email   : '';
  fieldPhone.value   = lead ? lead.phone   : '';
  fieldSource.value  = lead ? lead.source  : '';
  fieldStatus.value  = lead ? lead.status  : 'nuevo';
  fieldMessage.value = lead ? lead.message : '';
  leadIdInput.value  = lead ? lead.id      : '';

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

  const payload = {
    name:    fieldName.value.trim(),
    email:   fieldEmail.value.trim(),
    phone:   fieldPhone.value.trim(),
    source:  fieldSource.value,
    status:  fieldStatus.value,
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

    closeModal();
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
    infoItem('Email',   lead.email  || null) +
    infoItem('Teléfono',lead.phone  || null) +
    infoItem('Fuente',  lead.source || null) +
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
    fetchLeads();
  });
});

async function fetchLeads() {
  try {
    const url  = currentFilter !== 'todos' ? `${API}?status=${currentFilter}` : API;
    const list = await (await apiFetch(url)).json();
    renderLeads(list);
  } catch { console.error('Error al cargar leads'); }
}

function renderLeads(leads) {
  if (!leads.length) {
    leadsBody.innerHTML = `<tr><td colspan="6" class="empty-state">${
      currentFilter === 'todos' ? 'No hay leads aún. ¡Crea el primero!'
        : `No hay leads con estado "<strong>${currentFilter}</strong>".`}</td></tr>`;
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
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
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
  fetchLeads();
}

async function deleteLeadFromDrawer(id) {
  if (!confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return;
  await apiFetch(`${API}/${id}`, { method: 'DELETE' });
  closeDrawer();
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

async function renderStats() {
  const all   = await (await apiFetch(API)).json();
  const leads = statsSource !== '' ? all.filter(l => l.source === statsSource) : all;

  if (!all.length) {
    document.getElementById('kpiGrid').innerHTML = '<div class="empty-stats">Aún no hay leads para analizar.</div>';
    document.querySelector('.charts-row').style.display = 'none';
    document.querySelector('.breakdown-card').style.display = 'none';
    return;
  }
  document.querySelector('.charts-row').style.display   = '';
  document.querySelector('.breakdown-card').style.display = '';

  renderKPIs(leads, all.length);
  renderDonut(leads);
  renderBarChart(all);
  renderBreakdown(all);
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

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
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
//  AUTH + BOOTSTRAP
// ════════════════════════════════════════
function showScreen(name) {
  document.getElementById('auth-screen').classList.toggle('hidden', name !== 'auth');
  document.getElementById('pending-screen').classList.toggle('hidden', name !== 'pending');
  document.getElementById('app-layout').classList.toggle('hidden', name !== 'app');
}

async function bootstrap() {
  const { clerkPublishableKey } = await fetch('/config').then(r => r.json());

  _clerk = new window.Clerk(clerkPublishableKey);
  await _clerk.load();

  _clerk.addListener(({ user }) => {
    if (!user) { showScreen('auth'); }
  });

  if (!_clerk.user) {
    showScreen('auth');
    _clerk.mountSignIn(document.getElementById('sign-in-container'), {
      afterSignInUrl:  '/',
      afterSignUpUrl:  '/',
    });
    return;
  }

  // Comprobar si el tenant está aprobado
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

  // Usuario aprobado: mostrar app
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
