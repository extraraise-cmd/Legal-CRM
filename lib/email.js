const nodemailer = require('nodemailer');

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM    = process.env.EMAIL_FROM    || 'MiniCRM <noreply@minicrm.io>';
const ADMIN   = process.env.EMAIL_ADMIN   || process.env.SMTP_USER;
const APP_URL = process.env.APP_URL       || 'http://localhost:3000';

function emailDisabled() {
  return process.env.NODE_ENV === 'test' || !process.env.SMTP_HOST;
}

async function sendNewRegistrationAlert({ name, email, tenantId }) {
  if (emailDisabled()) return;

  const transport = createTransport();
  await transport.sendMail({
    from:    FROM,
    to:      ADMIN,
    subject: `[MiniCRM] Nuevo registro pendiente: ${name}`,
    html: `
      <p>Un nuevo usuario se ha registrado y espera aprobación:</p>
      <ul>
        <li><strong>Nombre:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
      </ul>
      <p>
        <a href="${APP_URL}/admin/tenants/${tenantId}/approve" style="
          background:#4f46e5;color:#fff;padding:10px 20px;
          border-radius:6px;text-decoration:none;display:inline-block">
          Aprobar acceso
        </a>
        &nbsp;
        <a href="${APP_URL}/admin/tenants/${tenantId}/reject" style="
          background:#dc2626;color:#fff;padding:10px 20px;
          border-radius:6px;text-decoration:none;display:inline-block">
          Rechazar
        </a>
      </p>
    `,
  });
}

async function sendApprovalNotification({ name, email }) {
  if (emailDisabled()) return;

  const transport = createTransport();
  await transport.sendMail({
    from:    FROM,
    to:      email,
    subject: '¡Tu cuenta de MiniCRM ha sido aprobada!',
    html: `
      <p>Hola ${name},</p>
      <p>Tu cuenta ha sido <strong>aprobada</strong>. Ya puedes acceder a tu panel:</p>
      <p>
        <a href="${APP_URL}/dashboard" style="
          background:#4f46e5;color:#fff;padding:10px 20px;
          border-radius:6px;text-decoration:none;display:inline-block">
          Ir al panel
        </a>
      </p>
      <p>Saludos,<br>El equipo de MiniCRM</p>
    `,
  });
}

async function sendRejectionNotification({ name, email }) {
  if (emailDisabled()) return;

  const transport = createTransport();
  await transport.sendMail({
    from:    FROM,
    to:      email,
    subject: 'Actualización sobre tu solicitud en MiniCRM',
    html: `
      <p>Hola ${name},</p>
      <p>Lamentamos informarte que tu solicitud de acceso no ha sido aprobada en este momento.</p>
      <p>Si crees que es un error, responde a este email y lo revisaremos.</p>
      <p>Saludos,<br>El equipo de MiniCRM</p>
    `,
  });
}

module.exports = {
  sendNewRegistrationAlert,
  sendApprovalNotification,
  sendRejectionNotification,
};
