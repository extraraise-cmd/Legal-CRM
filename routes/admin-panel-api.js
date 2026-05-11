const { Router } = require('express');
const prisma = require('../db/prisma');
const { sendApprovalNotification, sendRejectionNotification } = require('../lib/email');

const router = Router();

function requireApiKey(req, res, next) {
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(requireApiKey);

// GET /admin-api/tenants?filter=pending|approved|all
router.get('/tenants', async (req, res) => {
  const { filter = 'all' } = req.query;
  const where = filter === 'pending'  ? { approved: false }
              : filter === 'approved' ? { approved: true }
              : {};

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

// POST /admin-api/tenants/:id/approve
router.post('/tenants/:id/approve', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado.' });
  if (tenant.approved) return res.status(409).json({ error: 'Ya estaba aprobado.' });

  const updated = await prisma.tenant.update({ where: { id }, data: { approved: true } });
  await sendApprovalNotification({ name: updated.name, email: updated.email });
  res.json({ ok: true, tenant: updated });
});

// POST /admin-api/tenants/:id/reject
router.post('/tenants/:id/reject', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado.' });

  await sendRejectionNotification({ name: tenant.name, email: tenant.email });
  await prisma.tenant.delete({ where: { id } });
  res.status(204).send();
});

// PATCH /admin-api/tenants/:id  — role / plan
router.patch('/tenants/:id', async (req, res) => {
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

// DELETE /admin-api/tenants/:id
router.delete('/tenants/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Tenant no encontrado.' });
  await prisma.tenant.delete({ where: { id } });
  res.status(204).send();
});

module.exports = router;
