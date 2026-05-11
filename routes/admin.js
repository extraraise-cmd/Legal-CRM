const { Router } = require('express');
const prisma = require('../db/prisma');
const { sendApprovalNotification, sendRejectionNotification } = require('../lib/email');

const router = Router();

function requireAdmin(req, res, next) {
  if (!req.tenant || req.tenant.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// GET /admin/tenants?approved=false|true  (sin filtro → todos)
router.get('/tenants', requireAdmin, async (req, res) => {
  const { approved } = req.query;
  const where = approved !== undefined ? { approved: approved === 'true' } : {};

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true,
      role: true, plan: true, approved: true, createdAt: true,
      _count: { select: { leads: true } },
    },
  });
  res.json(tenants);
});

// GET /admin/tenants/:id
router.get('/tenants/:id', requireAdmin, async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: { _count: { select: { leads: true } } },
  });
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado.' });
  res.json(tenant);
});

// PATCH /admin/tenants/:id  — cambia role o plan
router.patch('/tenants/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role, plan } = req.body;

  if (role !== undefined && !['user', 'admin'].includes(role))
    return res.status(400).json({ error: 'Role inválido.' });
  if (plan !== undefined && !['free', 'pro'].includes(plan))
    return res.status(400).json({ error: 'Plan inválido.' });

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Tenant no encontrado.' });

  const data = {};
  if (role !== undefined) data.role = role;
  if (plan !== undefined) data.plan = plan;

  const updated = await prisma.tenant.update({ where: { id }, data });
  res.json(updated);
});

// POST /admin/tenants/:id/approve
router.post('/tenants/:id/approve', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Tenant no encontrado.' });
  if (existing.approved) return res.status(409).json({ error: 'Ya estaba aprobado.' });

  const tenant = await prisma.tenant.update({
    where: { id },
    data:  { approved: true },
  });

  await sendApprovalNotification({ name: tenant.name, email: tenant.email });
  res.json({ ok: true, tenant });
});

// POST /admin/tenants/:id/reject
router.post('/tenants/:id/reject', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Tenant no encontrado.' });

  await sendRejectionNotification({ name: existing.name, email: existing.email });
  await prisma.tenant.delete({ where: { id } });
  res.status(204).send();
});

// DELETE /admin/tenants/:id
router.delete('/tenants/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Tenant no encontrado.' });

  await prisma.tenant.delete({ where: { id } });
  res.status(204).send();
});

module.exports = router;
