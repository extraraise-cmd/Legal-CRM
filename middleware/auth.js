const jwt    = require('jsonwebtoken');
const prisma = require('../db/prisma');

function checkApproved(tenant, res) {
  if (!tenant.approved && tenant.role !== 'admin') {
    res.status(403).json({ error: 'Cuenta pendiente de aprobación.', code: 'PENDING_APPROVAL' });
    return false;
  }
  return true;
}

// Tests: x-api-key + x-tenant-id
async function testAuth(req, res, next) {
  if (req.headers['x-api-key'] !== process.env.API_KEY)
    return res.status(401).json({ error: 'Unauthorized' });

  const id = parseInt(req.headers['x-tenant-id'] || '1', 10);
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return res.status(401).json({ error: 'Tenant not found' });
  if (!checkApproved(tenant, res)) return;

  req.tenantId = tenant.id;
  req.tenant   = tenant;
  next();
}

// Producción/desarrollo: Bearer JWT
async function jwtAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });

  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: payload.tenantId } });
  if (!tenant) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkApproved(tenant, res)) return;

  req.tenantId = tenant.id;
  req.tenant   = tenant;
  next();
}

module.exports = process.env.NODE_ENV === 'test' ? testAuth : jwtAuth;
