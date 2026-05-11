const { getAuth } = require('@clerk/express');
const prisma = require('../db/prisma');

function checkApproved(tenant, res) {
  if (!tenant.approved && tenant.role !== 'admin') {
    res.status(403).json({ error: 'Cuenta pendiente de aprobación.', code: 'PENDING_APPROVAL' });
    return false;
  }
  return true;
}

// En tests usamos API key simple para no depender de Clerk
async function testAuth(req, res, next) {
  if (req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const id = parseInt(req.headers['x-tenant-id'] || '1', 10);
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return res.status(401).json({ error: 'Tenant not found' });
  if (!checkApproved(tenant, res)) return;
  req.tenantId = tenant.id;
  req.tenant   = tenant;
  next();
}

// En producción verificamos el JWT de Clerk y resolvemos (o creamos) el tenant
async function clerkAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  let tenant = await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  // Si el webhook aún no llegó, creamos el tenant como pendiente
  if (!tenant) {
    const claims = req.auth?.sessionClaims ?? {};
    const email  = claims.email ?? `${userId}@unknown.com`;
    const name   = [claims.given_name, claims.family_name].filter(Boolean).join(' ') || email;
    tenant = await prisma.tenant.create({
      data: { clerkUserId: userId, email, name, approved: false },
    });
  }

  if (!checkApproved(tenant, res)) return;
  req.tenantId = tenant.id;
  req.tenant   = tenant;
  next();
}

module.exports = process.env.NODE_ENV === 'test' ? testAuth : clerkAuth;
