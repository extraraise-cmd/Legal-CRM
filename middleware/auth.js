const prisma = require('../db/prisma');

function checkApproved(tenant, res) {
  if (!tenant.approved && tenant.role !== 'admin') {
    res.status(403).json({ error: 'Cuenta pendiente de aprobación.', code: 'PENDING_APPROVAL' });
    return false;
  }
  return true;
}

// Tests: API key simple
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

// Dev: sin Clerk configurado → API key + tenant por defecto (se crea si no existe)
async function devAuth(req, res, next) {
  if (req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  let tenant = await prisma.tenant.findFirst({ where: { role: 'admin' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        clerkUserId: 'dev-admin',
        name:        'Admin',
        email:       process.env.EMAIL_ADMIN || 'admin@minicrm.local',
        role:        'admin',
        approved:    true,
      },
    });
  }
  req.tenantId = tenant.id;
  req.tenant   = tenant;
  next();
}

// Producción: JWT de Clerk
async function clerkAuth(req, res, next) {
  const { getAuth } = require('@clerk/express');
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  let tenant = await prisma.tenant.findUnique({ where: { clerkUserId: userId } });
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

const isTest = process.env.NODE_ENV === 'test';
const isDev  = !process.env.CLERK_PUBLISHABLE_KEY ||
               process.env.CLERK_PUBLISHABLE_KEY.startsWith('pk_test_XXX');

module.exports = isTest ? testAuth : isDev ? devAuth : clerkAuth;
