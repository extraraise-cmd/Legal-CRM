const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const prisma = require('../db/prisma');
const { sendNewRegistrationAlert } = require('../lib/email');

const router      = Router();
const SALT_ROUNDS = 12;

function signToken(tenant) {
  return jwt.sign(
    { tenantId: tenant.id, role: tenant.role, name: tenant.name, email: tenant.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim())           return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (!email?.trim())          return res.status(400).json({ error: 'El email es obligatorio.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ error: 'El email no es válido.' });
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });

  const existing = await prisma.tenant.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // El primer tenant se convierte en admin aprobado automáticamente
  const isFirst = (await prisma.tenant.count()) === 0;

  const tenant = await prisma.tenant.create({
    data: {
      name:         name.trim(),
      email:        email.trim().toLowerCase(),
      passwordHash,
      role:         isFirst ? 'admin' : 'user',
      approved:     isFirst,
    },
  });

  if (!isFirst) {
    await sendNewRegistrationAlert({ name: tenant.name, email: tenant.email, tenantId: tenant.id })
      .catch(() => {});
    return res.status(201).json({
      pending: true,
      message: 'Solicitud recibida. Te avisaremos por email cuando tu cuenta esté activa.',
    });
  }

  res.status(201).json({ token: signToken(tenant), pending: false });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password)
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });

  const tenant = await prisma.tenant.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!tenant || !tenant.passwordHash)
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });

  const valid = await bcrypt.compare(password, tenant.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });

  if (!tenant.approved && tenant.role !== 'admin')
    return res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación.', code: 'PENDING_APPROVAL' });

  res.json({ token: signToken(tenant), name: tenant.name, email: tenant.email, role: tenant.role, plan: tenant.plan });
});

module.exports = router;
