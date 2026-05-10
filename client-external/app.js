const API = 'http://localhost:3000/api/leads';

const btnLoad   = document.getElementById('btn-load');
const btnCreate = document.getElementById('btn-create');
const tbody     = document.getElementById('leads-body');
const statusMsg = document.getElementById('status-msg');

function showStatus(msg, type = 'ok') {
  statusMsg.textContent = msg;
  statusMsg.className = `status ${type}`;
  setTimeout(() => { statusMsg.className = 'status hidden'; }, 3500);
}

function renderRows(leads) {
  if (!leads.length) {
    tbody.innerHTML = '<tr id="empty-row"><td colspan="6">No hay leads.</td></tr>';
    return;
  }
  tbody.innerHTML = leads.map(l => `
    <tr>
      <td>${l.id}</td>
      <td>${l.name}</td>
      <td>${l.email}</td>
      <td>${l.source || '—'}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
      <td>${new Date(l.createdAt).toLocaleString('es-ES')}</td>
    </tr>
  `).join('');
}

async function loadLeads() {
  btnLoad.disabled = true;
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const leads = await res.json();
    renderRows(leads);
    showStatus(`${leads.length} leads cargados.`);
  } catch (err) {
    showStatus(`No se pudo conectar al servidor: ${err.message}`, 'err');
  } finally {
    btnLoad.disabled = false;
  }
}

async function createTestLead() {
  btnCreate.disabled = true;
  const payload = {
    name:   'Lead desde Cliente',
    email:  `leadcliente+${Date.now()}@example.com`,
    source: 'external-client',
    status: 'nuevo',
  };
  try {
    const res = await fetch(API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    showStatus(`Lead #${data.id} creado: ${data.email}`);
    await loadLeads();
  } catch (err) {
    showStatus(`Error al crear lead: ${err.message}`, 'err');
  } finally {
    btnCreate.disabled = false;
  }
}

btnLoad.addEventListener('click', loadLeads);
btnCreate.addEventListener('click', createTestLead);
