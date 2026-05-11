require('dotenv').config();
const prisma = require('../db/prisma');

const names = [
  'Ana García','Carlos Martínez','Laura Sánchez','Miguel López','Sofía Rodríguez',
  'Javier Fernández','Isabel Gómez','Pablo Díaz','Lucía Moreno','Alejandro Jiménez',
  'Carmen Ruiz','David Álvarez','Elena Romero','Sergio Torres','Marta Vargas',
  'Adrián Ramos','Patricia Castro','Rubén Ortega','Natalia Guerrero','Óscar Medina',
  'Raquel Núñez','Héctor Blanco','Silvia Ibáñez','Iván Herrera','Cristina Peña',
  'Enrique Molina','Beatriz Vega','Alberto Ríos','Mónica Cruz','Gonzalo Serrano',
  'Pilar Reyes','Roberto Morales','Amparo Gil','José Ortiz','Verónica Santos',
  'Marcos Rubio','Yolanda Cano','Raúl Delgado','Lorena Navarro','Tomás Iglesias',
  'Esther Domínguez','Víctor Flores','Rosa Moya','Fernando Lara','Sara Bravo',
  'Andrés Hidalgo','Alicia Suárez','Nicolás Pardo','Claudia Mendoza','Jorge Aguilar',
];

const statuses   = ['nuevo','nuevo','nuevo','contactado','contactado','calificado','calificado','perdido','convertido'];
const sources    = ['Referido','Referido','Externo','Marketing','Marketing','Recurrente Marketing',''];
const qualities  = ['','','baja','baja','media','media','media','alta','alta'];
const amounts    = [null,null,null,800,1200,1500,2000,2500,3500,5000];

const messages = [
  'Necesita asesoría sobre contrato laboral.',
  'Consulta divorcio con hijos menores.',
  'Reclamación accidente de tráfico.',
  'Herencia en disputa entre hermanos.',
  'Problema con comunidad de vecinos.',
  'Contrato de compraventa inmueble.',
  'Despido improcedente, solicita orientación.',
  'Incidencia con seguro de hogar.',
  'Solicita información sobre sociedad limitada.',
  'Reclamación deuda a cliente moroso.',
  '',
];

const phones = [
  '+34 612 345 678','+34 623 456 789','+34 634 567 890','+34 645 678 901',
  '+34 656 789 012','+34 667 890 123','+34 678 901 234','+34 689 012 345',
  '',''
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function seed() {
  // Encontrar el primer tenant (dev admin)
  const tenant = await prisma.tenant.findFirst({ where: { role: 'admin' } });
  if (!tenant) { console.error('No hay tenant admin. Arranca el servidor primero.'); process.exit(1); }

  console.log(`Insertando 50 leads en tenant ${tenant.email}...`);

  for (let i = 0; i < 50; i++) {
    const name   = names[i];
    const parts  = name.toLowerCase().split(' ');
    const email  = `${parts[0]}.${parts[1]}@example.com`;
    const status  = pick(statuses);
    const source  = pick(sources);
    const quality = pick(qualities);
    const amount  = status === 'convertido' ? pick(amounts.filter(Boolean)) : (Math.random() > 0.7 ? pick(amounts) : null);
    const phone   = pick(phones);
    const message = pick(messages);

    // Fecha aleatoria en los últimos 6 meses
    const daysAgo = Math.floor(Math.random() * 180);
    const createdAt = new Date(Date.now() - daysAgo * 86400000);

    const lead = await prisma.lead.create({
      data: { name, email, phone, source, status, quality, amount, message, tenantId: tenant.id, createdAt },
    });

    // Algunos leads con actividades
    if (Math.random() > 0.5) {
      const acts = [
        'Primera llamada realizada. Interesado en continuar.',
        'Email enviado con documentación inicial.',
        'Reunión virtual programada para la próxima semana.',
        'Cliente revisó el presupuesto. Pendiente de decisión.',
        'Seguimiento: no contesta. Se deja mensaje de voz.',
        'Firmó el contrato de representación.',
      ];
      const n = Math.floor(Math.random() * 3) + 1;
      for (let j = 0; j < n; j++) {
        await prisma.activity.create({
          data: {
            leadId: lead.id,
            text: pick(acts),
            createdAt: new Date(createdAt.getTime() + (j + 1) * 86400000 * Math.random() * 5),
          },
        });
      }
    }
  }

  const total = await prisma.lead.count({ where: { tenantId: tenant.id } });
  console.log(`✓ ${total} leads en la base de datos.`);
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
