const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.API_KEY  = 'test-api-key-2026';
// DATABASE_URL viene del globalSetup (file:./prisma/test.db via env del proceso)

const app    = require('../server');
const prisma = require('../db/prisma');

const KEY  = process.env.API_KEY;

let testTenantId;
let adminTenantId;

// auth helper: inyecta la api key y el tenant de test
const auth  = (req) => req.set('x-api-key', KEY).set('x-tenant-id', String(testTenantId));
const admin = (req) => req.set('x-api-key', KEY).set('x-tenant-id', String(adminTenantId));

beforeAll(async () => {
  await prisma.activity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: { clerkUserId: 'test-clerk-user-1', name: 'Test User', email: 'test@minicrm.io', approved: true },
  });
  testTenantId = tenant.id;

  const adminTenant = await prisma.tenant.create({
    data: { clerkUserId: 'test-clerk-admin', name: 'Admin User', email: 'admin@minicrm.io', role: 'admin', approved: true },
  });
  adminTenantId = adminTenant.id;
});

afterAll(async () => {
  await prisma.activity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.$disconnect();
});

// ─── Autenticación ───────────────────────────────────────────────────────────

describe('Autenticación', () => {
  test('sin API key devuelve 401', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  test('API key incorrecta devuelve 401', async () => {
    const res = await request(app).get('/api/leads').set('x-api-key', 'wrong');
    expect(res.status).toBe(401);
  });

  test('API key correcta permite el acceso', async () => {
    const res = await auth(request(app).get('/api/leads'));
    expect(res.status).toBe(200);
  });
});

// ─── Aislamiento multi-tenant ─────────────────────────────────────────────────

describe('Aislamiento multi-tenant', () => {
  test('un tenant no ve los leads de otro', async () => {
    await auth(request(app).post('/api/leads')).send({ name: 'Lead A', email: 'a@test.com' });

    const otherTenant = await prisma.tenant.create({
      data: { clerkUserId: 'other-user', name: 'Otro', email: 'otro@test.com', approved: true },
    });

    const resOther = await request(app)
      .get('/api/leads')
      .set('x-api-key', KEY)
      .set('x-tenant-id', String(otherTenant.id));

    expect(resOther.status).toBe(200);
    expect(resOther.body.every(l => l.email !== 'a@test.com')).toBe(true);

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  test('no puede editar un lead de otro tenant', async () => {
    const lead = await prisma.lead.create({
      data: { name: 'Ajeno', email: 'ajeno@test.com', tenantId: adminTenantId },
    });

    const res = await auth(request(app).patch(`/api/leads/${lead.id}`)).send({ name: 'Hackeado' });
    expect(res.status).toBe(404);

    await prisma.lead.delete({ where: { id: lead.id } });
  });
});

// ─── GET /api/leads ───────────────────────────────────────────────────────────

describe('GET /api/leads', () => {
  test('devuelve un array', async () => {
    const res = await auth(request(app).get('/api/leads'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('cada lead tiene los campos esperados', async () => {
    await auth(request(app).post('/api/leads')).send({ name: 'Campos', email: 'campos@test.com' });
    const res  = await auth(request(app).get('/api/leads'));
    const lead = res.body[0];
    ['id','name','email','phone','source','status','message','createdAt','activities'].forEach(f =>
      expect(lead).toHaveProperty(f)
    );
    expect(Array.isArray(lead.activities)).toBe(true);
  });

  test('filtra por status', async () => {
    await auth(request(app).post('/api/leads')).send({ name: 'Filtro', email: 'filtro@test.com', status: 'contactado' });
    const res = await auth(request(app).get('/api/leads?status=contactado'));
    res.body.forEach(l => expect(l.status).toBe('contactado'));
  });

  test('status=todos devuelve todos', async () => {
    const all  = await auth(request(app).get('/api/leads'));
    const todos = await auth(request(app).get('/api/leads?status=todos'));
    expect(todos.body.length).toBe(all.body.length);
  });
});

// ─── GET /api/leads/:id ───────────────────────────────────────────────────────

describe('GET /api/leads/:id', () => {
  let leadId;

  beforeAll(async () => {
    const res = await auth(request(app).post('/api/leads')).send({ name: 'Lead ID', email: 'lid@test.com' });
    leadId = res.body.id;
  });

  test('devuelve el lead correcto', async () => {
    const res = await auth(request(app).get(`/api/leads/${leadId}`));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(leadId);
  });

  test('id inexistente devuelve 404', async () => {
    const res = await auth(request(app).get('/api/leads/999999'));
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/leads ──────────────────────────────────────────────────────────

describe('POST /api/leads', () => {
  test('crea lead con datos mínimos', async () => {
    const res = await auth(request(app).post('/api/leads')).send({ name: 'Min', email: 'min@test.com' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('nuevo');
    expect(res.body.activities).toEqual([]);
  });

  test('normaliza email a minúsculas', async () => {
    const res = await auth(request(app).post('/api/leads')).send({ name: 'Case', email: 'UP@TEST.COM' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('up@test.com');
  });

  test('sin nombre → 400', async () => {
    const res = await auth(request(app).post('/api/leads')).send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });

  test('email inválido → 400', async () => {
    const res = await auth(request(app).post('/api/leads')).send({ name: 'X', email: 'no-email' });
    expect(res.status).toBe(400);
  });

  test('status inválido → 400', async () => {
    const res = await auth(request(app).post('/api/leads')).send({ name: 'X', email: 'x@x.com', status: 'inventado' });
    expect(res.status).toBe(400);
  });

  test('source inválida → 400', async () => {
    const res = await auth(request(app).post('/api/leads')).send({ name: 'X', email: 'x@x.com', source: 'Falsa' });
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/leads/:id ─────────────────────────────────────────────────────

describe('PATCH /api/leads/:id', () => {
  let leadId;

  beforeEach(async () => {
    const res = await auth(request(app).post('/api/leads')).send({ name: 'Original', email: 'orig@test.com' });
    leadId = res.body.id;
  });

  test('actualiza nombre', async () => {
    const res = await auth(request(app).patch(`/api/leads/${leadId}`)).send({ name: 'Nuevo Nombre' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nuevo Nombre');
  });

  test('actualiza status', async () => {
    const res = await auth(request(app).patch(`/api/leads/${leadId}`)).send({ status: 'contactado' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('contactado');
  });

  test('actualización parcial no toca los otros campos', async () => {
    const res = await auth(request(app).patch(`/api/leads/${leadId}`)).send({ status: 'calificado' });
    expect(res.body.name).toBe('Original');
    expect(res.body.email).toBe('orig@test.com');
  });

  test('id inexistente → 404', async () => {
    const res = await auth(request(app).patch('/api/leads/999999')).send({ status: 'contactado' });
    expect(res.status).toBe(404);
  });

  test('nombre vacío → 400', async () => {
    const res = await auth(request(app).patch(`/api/leads/${leadId}`)).send({ name: '' });
    expect(res.status).toBe(400);
  });

  test('email inválido → 400', async () => {
    const res = await auth(request(app).patch(`/api/leads/${leadId}`)).send({ email: 'mal' });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/leads/:id/activities ──────────────────────────────────────────

describe('Actividades', () => {
  let leadId;

  beforeAll(async () => {
    const res = await auth(request(app).post('/api/leads')).send({ name: 'Act Lead', email: 'act@test.com' });
    leadId = res.body.id;
  });

  test('crea actividad', async () => {
    const res = await auth(request(app).post(`/api/leads/${leadId}/activities`)).send({ text: 'Llamada' });
    expect(res.status).toBe(201);
    expect(res.body.text).toBe('Llamada');
  });

  test('aparece en el lead', async () => {
    await auth(request(app).post(`/api/leads/${leadId}/activities`)).send({ text: 'Email enviado' });
    const res   = await auth(request(app).get(`/api/leads/${leadId}`));
    const texts = res.body.activities.map(a => a.text);
    expect(texts).toContain('Email enviado');
  });

  test('texto vacío → 400', async () => {
    const res = await auth(request(app).post(`/api/leads/${leadId}/activities`)).send({ text: '' });
    expect(res.status).toBe(400);
  });

  test('lead inexistente → 404', async () => {
    const res = await auth(request(app).post('/api/leads/999999/activities')).send({ text: 'X' });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/leads/:id ────────────────────────────────────────────────────

describe('DELETE /api/leads/:id', () => {
  test('elimina lead → 204 y luego 404', async () => {
    const created = await auth(request(app).post('/api/leads')).send({ name: 'Borrar', email: 'del@test.com' });
    const id = created.body.id;
    expect((await auth(request(app).delete(`/api/leads/${id}`))).status).toBe(204);
    expect((await auth(request(app).get(`/api/leads/${id}`))).status).toBe(404);
  });

  test('id inexistente → 404', async () => {
    const res = await auth(request(app).delete('/api/leads/999999'));
    expect(res.status).toBe(404);
  });
});

// ─── Admin ────────────────────────────────────────────────────────────────────

describe('Admin /admin/tenants', () => {
  test('usuario normal no puede acceder → 403', async () => {
    const res = await auth(request(app).get('/admin/tenants'));
    expect(res.status).toBe(403);
  });

  test('admin lista todos los tenants', async () => {
    const res = await admin(request(app).get('/admin/tenants'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  test('admin cambia el plan de un tenant', async () => {
    const res = await admin(request(app).patch(`/admin/tenants/${testTenantId}`)).send({ plan: 'pro' });
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('pro');
  });

  test('plan inválido → 400', async () => {
    const res = await admin(request(app).patch(`/admin/tenants/${testTenantId}`)).send({ plan: 'enterprise' });
    expect(res.status).toBe(400);
  });

  test('admin obtiene un tenant por id', async () => {
    const res = await admin(request(app).get(`/admin/tenants/${testTenantId}`));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testTenantId);
  });

  test('tenant inexistente → 404', async () => {
    const res = await admin(request(app).get('/admin/tenants/999999'));
    expect(res.status).toBe(404);
  });

  test('filtra tenants pendientes con ?approved=false', async () => {
    const pending = await prisma.tenant.create({
      data: { clerkUserId: 'pending-user', name: 'Pendiente', email: 'pendiente@test.com', approved: false },
    });
    const res = await admin(request(app).get('/admin/tenants?approved=false'));
    expect(res.status).toBe(200);
    expect(res.body.some(t => t.id === pending.id)).toBe(true);
    expect(res.body.every(t => t.approved === false)).toBe(true);
    await prisma.tenant.delete({ where: { id: pending.id } });
  });
});

// ─── Aprobación de registros ──────────────────────────────────────────────────

describe('Aprobación de registros', () => {
  test('tenant no aprobado recibe 403 al acceder a la API', async () => {
    const pending = await prisma.tenant.create({
      data: { clerkUserId: 'blocked-user', name: 'Bloqueado', email: 'blocked@test.com', approved: false },
    });

    const res = await request(app)
      .get('/api/leads')
      .set('x-api-key', KEY)
      .set('x-tenant-id', String(pending.id));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PENDING_APPROVAL');

    await prisma.tenant.delete({ where: { id: pending.id } });
  });

  test('admin aprueba un tenant → 200 y approved=true', async () => {
    const pending = await prisma.tenant.create({
      data: { clerkUserId: 'to-approve', name: 'Por Aprobar', email: 'approve@test.com', approved: false },
    });

    const res = await admin(request(app).post(`/admin/tenants/${pending.id}/approve`));
    expect(res.status).toBe(200);
    expect(res.body.tenant.approved).toBe(true);

    const updated = await prisma.tenant.findUnique({ where: { id: pending.id } });
    expect(updated.approved).toBe(true);

    await prisma.tenant.delete({ where: { id: pending.id } });
  });

  test('aprobar dos veces → 409', async () => {
    const t = await prisma.tenant.create({
      data: { clerkUserId: 'already-approved', name: 'Ya Aprobado', email: 'ya@test.com', approved: true },
    });
    const res = await admin(request(app).post(`/admin/tenants/${t.id}/approve`));
    expect(res.status).toBe(409);
    await prisma.tenant.delete({ where: { id: t.id } });
  });

  test('admin rechaza un tenant → 204 y tenant eliminado', async () => {
    const pending = await prisma.tenant.create({
      data: { clerkUserId: 'to-reject', name: 'Por Rechazar', email: 'reject@test.com', approved: false },
    });

    const res = await admin(request(app).post(`/admin/tenants/${pending.id}/reject`));
    expect(res.status).toBe(204);

    const deleted = await prisma.tenant.findUnique({ where: { id: pending.id } });
    expect(deleted).toBeNull();
  });
});
