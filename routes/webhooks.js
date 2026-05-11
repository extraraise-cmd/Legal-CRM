const { Router } = require('express');
const { Webhook } = require('svix');
const prisma = require('../db/prisma');
const { sendNewRegistrationAlert } = require('../lib/email');

const router = Router();

// Clerk envía JSON raw — necesitamos el body sin parsear para verificar la firma
router.post('/clerk', async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'CLERK_WEBHOOK_SECRET not configured' });

  const wh = new Webhook(secret);
  let event;

  try {
    event = wh.verify(req.body, {
      'svix-id':        req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  if (event.type === 'user.created') {
    const { id, email_addresses, first_name, last_name } = event.data;
    const email = email_addresses?.[0]?.email_address ?? `${id}@unknown.com`;
    const name  = [first_name, last_name].filter(Boolean).join(' ') || email;

    // Evitar duplicados si ya existe (p.ej. re-entrega del webhook)
    const existing = await prisma.tenant.findUnique({ where: { clerkUserId: id } });
    if (!existing) {
      const tenant = await prisma.tenant.create({
        data: { clerkUserId: id, email, name, approved: false },
      });
      await sendNewRegistrationAlert({ name, email, tenantId: tenant.id });
    }
  }

  res.json({ received: true });
});

module.exports = router;
