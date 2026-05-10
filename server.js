require("dotenv").config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: permite peticiones desde el cliente externo en local (Vite dev server)
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireApiKey(req, res, next) {
  if (!process.env.API_KEY) return res.status(500).json({ error: 'API_KEY not configured' });
  if (req.headers['x-api-key'] !== process.env.API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.use('/api', requireApiKey);

const VALID_STATUSES = ['nuevo', 'contactado', 'calificado', 'perdido', 'convertido'];
const VALID_SOURCES  = ['', 'Referido', 'Externo', 'Marketing', 'Recurrente Marketing', 'external-client'];

const stmts = {
  allLeads:       db.prepare('SELECT * FROM leads ORDER BY created_at DESC'),
  leadsByStatus:  db.prepare('SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC'),
  leadById:       db.prepare('SELECT * FROM leads WHERE id = ?'),
  insertLead:     db.prepare('INSERT INTO leads (name, email, phone, source, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  updateLead:     db.prepare('UPDATE leads SET name=?, email=?, phone=?, source=?, status=?, message=? WHERE id=?'),
  deleteLead:     db.prepare('DELETE FROM leads WHERE id = ?'),
  activitiesByLead: db.prepare('SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC'),
  insertActivity: db.prepare('INSERT INTO activities (lead_id, text, created_at) VALUES (?, ?, ?)'),
  activityById:   db.prepare('SELECT * FROM activities WHERE id = ?'),
};

function formatLead(row) {
  const activities = stmts.activitiesByLead.all(row.id);
  return {
    id:         row.id,
    name:       row.name,
    email:      row.email,
    phone:      row.phone,
    source:     row.source,
    status:     row.status,
    message:    row.message,
    createdAt:  row.created_at,
    activities: activities.map(a => ({ id: a.id, text: a.text, createdAt: a.created_at })),
  };
}

// GET /api/leads?status=nuevo
app.get('/api/leads', (req, res) => {
  const { status } = req.query;
  const rows = (status && status !== 'todos')
    ? stmts.leadsByStatus.all(status)
    : stmts.allLeads.all();
  res.json(rows.map(formatLead));
});

// GET /api/leads/:id
app.get('/api/leads/:id', (req, res) => {
  const row = stmts.leadById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Lead no encontrado.' });
  res.json(formatLead(row));
});

// POST /api/leads
app.post('/api/leads', (req, res) => {
  const { name, email, phone = '', source = '', status = 'nuevo', message = '' } = req.body;

  if (!name  || !name.trim())  return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'El email es obligatorio.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ error: 'El email no es válido.' });
  if (!VALID_STATUSES.includes(status))
    return res.status(400).json({ error: 'Estado inválido.' });
  if (!VALID_SOURCES.includes(source))
    return res.status(400).json({ error: 'Fuente inválida.' });

  const created_at = new Date().toISOString();
  const result = stmts.insertLead.run(
    name.trim(), email.trim().toLowerCase(), phone.trim(),
    source, status, message.trim(), created_at
  );

  res.status(201).json(formatLead(stmts.leadById.get(result.lastInsertRowid)));
});

// PATCH /api/leads/:id
app.patch('/api/leads/:id', (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const row = stmts.leadById.get(id);
  if (!row) return res.status(404).json({ error: 'Lead no encontrado.' });

  const { name, email, phone, source, status, message } = req.body;

  if (name !== undefined && !name.trim())
    return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
  if (email !== undefined) {
    if (!email.trim()) return res.status(400).json({ error: 'El email no puede estar vacío.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return res.status(400).json({ error: 'El email no es válido.' });
  }
  if (source !== undefined && !VALID_SOURCES.includes(source))
    return res.status(400).json({ error: 'Fuente inválida.' });
  if (status !== undefined && !VALID_STATUSES.includes(status))
    return res.status(400).json({ error: 'Estado inválido.' });

  stmts.updateLead.run(
    name    !== undefined ? name.trim()              : row.name,
    email   !== undefined ? email.trim().toLowerCase() : row.email,
    phone   !== undefined ? phone.trim()             : row.phone,
    source  !== undefined ? source                   : row.source,
    status  !== undefined ? status                   : row.status,
    message !== undefined ? message.trim()           : row.message,
    id
  );

  res.json(formatLead(stmts.leadById.get(id)));
});

// POST /api/leads/:id/activities
app.post('/api/leads/:id/activities', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!stmts.leadById.get(id)) return res.status(404).json({ error: 'Lead no encontrado.' });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'El texto de la actividad es obligatorio.' });

  const result = stmts.insertActivity.run(id, text.trim(), new Date().toISOString());
  const activity = stmts.activityById.get(result.lastInsertRowid);
  res.status(201).json({ id: activity.id, text: activity.text, createdAt: activity.created_at });
});

// DELETE /api/leads/:id
app.delete('/api/leads/:id', (req, res) => {
  const result = stmts.deleteLead.run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Lead no encontrado.' });
  res.status(204).send();
});

app.listen(PORT, () => console.log(`MiniCRM Leads corriendo en http://localhost:${PORT}`));
