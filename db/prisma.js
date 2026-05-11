// Tests → cliente SQLite generado en node_modules/.prisma-test/client
// Producción → cliente PostgreSQL generado en node_modules/@prisma/client
const { PrismaClient } =
  process.env.NODE_ENV === 'test'
    ? require('../node_modules/.prisma-test/client')
    : require('@prisma/client');

const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

module.exports = prisma;
