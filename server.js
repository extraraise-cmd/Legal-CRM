require("dotenv").config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const prisma = require('./db/prisma');
const requireAuth    = require('./middleware/auth');
const adminRouter    = require('./routes/admin');
const adminPanelApi  = require('./routes/admin-panel-api');
const webhookRouter  = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Clerk middleware solo en producción (en test no existe CLERK_PUBLISHABLE_KEY)
if (process.env.NODE_ENV !== 'test') {
  const { clerkMiddleware } = require('@clerk/express');
  app.use(clerkMiddleware());
}

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-tenant-id'],
}));

// El webhook de Clerk necesita el body raw (Buffer) para verificar la firma
app.use('/webhooks/clerk', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const VALID_STATUSES = ['nuevo', 'contactado', 'calificado', 'perdido', 'convertido'];
const VALID_SOURCES  = ['', 'Referido', 'Externo', 'Marketing', 'Recurrente Marketing', 'external-client'];

const LEAD_INCLUDE = {
  activities: { orderBy: { createdAt: 'desc' } },
};

function formatLead(lead) {
  return {
    id:         lead.id,
    name:       lead.name,
    email:      lead.email,
    phone:      lead.phone,
    source:     lead.source,
    status:     lead.status,
    message:    lead.message,
    createdAt:  lead.createdAt,
    activities: (lead.activities ?? []).map(a => ({
      id:        a.id,
      text:      a.text,
      createdAt: a.createdAt,
    })),
  };
}

// ─── Config pública (publishable key para el frontend) ───────────────────────
app.get('/config', (req, res) => {
  res.json({ clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '' });
});

// ─── Webhooks (sin auth, verificación propia con svix) ───────────────────────
app.use('/webhooks', webhookRouter);

// ─── Admin panel API (solo API key, para public/admin.html) ──────────────────
app.use('/admin-api', adminPanelApi);

// ─── Admin API (requiere auth + role=admin) ───────────────────────────────────
app.use('/admin', requireAuth, adminRouter);

// ─── API (todos los endpoints requieren auth y quedan aislados por tenantId) ──
app.use('/api', requireAuth);

// GET /api/leads?status=nuevo
app.get('/api/leads', async (req, res) => {
  const { status } = req.query;
  const where = {
    tenantId: req.tenantId,
    ...(status && status !== 'todos' ? { status } : {}),
  };
  const leads = await prisma.lead.findMany({
    where,
    include: LEAD_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  res.json(leads.map(formatLead));
});

// GET /api/leads/:id
app.get('/api/leads/:id', async (req, res) => {
  const lead = await prisma.lead.findFirst({
    where: { id: parseInt(req.params.id, 10), tenantId: req.tenantId },
    include: LEAD_INCLUDE,
  });
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });
  res.json(formatLead(lead));
});

// POST /api/leads
app.post('/api/leads', async (req, res) => {
  const { name, email, phone = '', source = '', status = 'nuevo', message = '' } = req.body;

  if (!name  || !name.trim())  return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'El email es obligatorio.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ error: 'El email no es válido.' });
  if (!VALID_STATUSES.includes(status))
    return res.status(400).json({ error: 'Estado inválido.' });
  if (!VALID_SOURCES.includes(source))
    return res.status(400).json({ error: 'Fuente inválida.' });

  const lead = await prisma.lead.create({
    data: {
      name:     name.trim(),
      email:    email.trim().toLowerCase(),
      phone:    phone.trim(),
      source,
      status,
      message:  message.trim(),
      tenantId: req.tenantId,
    },
    include: LEAD_INCLUDE,
  });

  res.status(201).json(formatLead(lead));
});

// PATCH /api/leads/:id
app.patch('/api/leads/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });

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

  const data = {};
  if (name    !== undefined) data.name    = name.trim();
  if (email   !== undefined) data.email   = email.trim().toLowerCase();
  if (phone   !== undefined) data.phone   = phone.trim();
  if (source  !== undefined) data.source  = source;
  if (status  !== undefined) data.status  = status;
  if (message !== undefined) data.message = message.trim();

  const lead = await prisma.lead.update({ where: { id }, data, include: LEAD_INCLUDE });
  res.json(formatLead(lead));
});

// POST /api/leads/:id/activities
app.post('/api/leads/:id/activities', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const exists = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!exists) return res.status(404).json({ error: 'Lead no encontrado.' });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'El texto de la actividad es obligatorio.' });

  const activity = await prisma.activity.create({
    data: { leadId: id, text: text.trim() },
  });

  res.status(201).json({ id: activity.id, text: activity.text, createdAt: activity.createdAt });
});

// DELETE /api/leads/:id
app.delete('/api/leads/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const exists = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!exists) return res.status(404).json({ error: 'Lead no encontrado.' });

  await prisma.lead.delete({ where: { id } });
  res.status(204).send();
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`MiniCRM Leads corriendo en http://localhost:${PORT}`));
}

module.exports = app;
