const { execSync } = require('child_process');

module.exports = async () => {
  const env = { ...process.env, DATABASE_URL: 'file:./prisma/test.db' };

  // Genera el cliente Prisma para SQLite (output separado → no toca el cliente de producción)
  execSync('npx prisma generate --schema=prisma/schema.test.prisma', { stdio: 'pipe', env });

  // Crea / actualiza el esquema en la base de datos de test
  execSync('npx prisma db push --skip-generate --schema=prisma/schema.test.prisma --accept-data-loss', {
    stdio: 'pipe',
    env,
  });
};
