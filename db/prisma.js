// Elige el cliente según el proveedor real:
//   file:// → SQLite (test/dev local)
//   postgresql:// → PostgreSQL (producción)
const isSQLite = (process.env.DATABASE_URL || '').startsWith('file:');

const { PrismaClient } = isSQLite
  ? require('../node_modules/.prisma-test/client')
  : require('@prisma/client');

const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

module.exports = prisma;
