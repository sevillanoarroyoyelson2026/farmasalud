import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Correos transaccionales al cliente (pedido registrado, cambios de estado, respuesta a reclamos).
 * - Se envían por SMTP (Gmail con "contraseña de aplicación", Outlook, Zoho, etc.).
 * - Son "mejor esfuerzo": si el correo falla o no está configurado, el pedido NO se ve
 *   afectado; solo se registra en el log del servidor.
 * - Todo texto que viene de usuarios se escapa antes de ir al HTML (evita inyección).
 */

let cachedTransporter: Transporter | null | undefined;

function getMailTransporter(): Transporter | null {
  if (cachedTransporter !== undefined) {
    return cachedTransporter;
  }
  const smtpHost = process.env['SMTP_HOST'];
  const smtpUser = process.env['SMTP_USER'];
  const smtpPassword = process.env['SMTP_PASSWORD'];
  if (!smtpHost || !smtpUser || !smtpPassword) {
    cachedTransporter = null;
    return cachedTransporter;
  }
  const smtpPort = Number(process.env['SMTP_PORT'] ?? 465);
  cachedTransporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPassword },
  });
  return cachedTransporter;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPublicSiteUrl(path: string): string {
  const siteUrl = (process.env['ALLOWED_ORIGIN'] ?? '').replace(/\/$/, '');
  return siteUrl ? `${siteUrl}${path}` : '';
}

/** Plantilla común: encabezado de marca, mensaje y botón opcional. Recibe texto YA escapado. */
function renderEmailLayout(escapedTitle: string, escapedParagraphs: string[], buttonLabel: string, buttonPath: string): string {
  const buttonUrl = buildPublicSiteUrl(buttonPath);
  const buttonHtml = buttonUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(buttonUrl)}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(buttonLabel)}</a></p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6faf9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:20px;font-weight:700;color:#0f766e;margin:0 0 16px">Farmasalud</p>
<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${escapedTitle}</h1>
${escapedParagraphs.map((paragraph) => `<p style="line-height:1.5;margin:0 0 10px">${paragraph}</p>`).join('')}
${buttonHtml}
</div>
<p style="font-size:12px;color:#94a3b8;margin-top:16px">Farmasalud E.I.R.L. · Trujillo, Perú. Recibes este correo por una compra o trámite en nuestra tienda en línea.</p>
</div></body></html>`;
}

interface CustomerEmail {
  recipientEmail: string;
  subject: string;
  escapedTitle: string;
  escapedParagraphs: string[];
  buttonLabel: string;
  buttonPath: string;
}

async function sendCustomerEmail(customerEmail: CustomerEmail): Promise<void> {
  const mailTransporter = getMailTransporter();
  if (!mailTransporter || !customerEmail.recipientEmail) {
    return;
  }
  try {
    await mailTransporter.sendMail({
      from: process.env['EMAIL_FROM'] || `Farmasalud <${process.env['SMTP_USER']}>`,
      to: customerEmail.recipientEmail,
      subject: customerEmail.subject,
      html: renderEmailLayout(
        customerEmail.escapedTitle,
        customerEmail.escapedParagraphs,
        customerEmail.buttonLabel,
        customerEmail.buttonPath,
      ),
    });
  } catch (error) {
    // Nunca se registra el correo del destinatario ni el contenido: solo el motivo técnico.
    console.error(`[email-notifications] ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Mensaje al cliente para cada estado que le interesa saber. */
const ORDER_STATUS_EMAIL_MESSAGE: Record<string, { subject: string; message: string } | undefined> = {
  confirmed: { subject: 'Tu receta fue aprobada', message: 'Validamos tu receta médica. Ya estamos preparando tu pedido.' },
  ready_for_pickup: { subject: 'Tu pedido está listo para recoger', message: 'Tu pedido ya está listo. Acércate a la botica con tu número de pedido.' },
  out_for_delivery: { subject: 'Tu pedido va en camino', message: 'Tu pedido salió de la botica y está en camino a tu dirección.' },
  delivered: { subject: 'Pedido entregado', message: 'Tu pedido fue entregado. ¡Gracias por comprar en Farmasalud! Puedes calificar la atención en tu cuenta.' },
  cancelled: { subject: 'Tu pedido fue cancelado', message: 'Tu pedido fue cancelado.' },
};

export async function notifyOrderRegistered(
  recipientEmail: string,
  customerName: string,
  orderId: string,
  orderNumber: string,
  orderTotal: number,
  requiresPrescription: boolean,
): Promise<void> {
  await sendCustomerEmail({
    recipientEmail,
    subject: `Recibimos tu pedido ${orderNumber}`,
    escapedTitle: `¡Gracias, ${escapeHtml(customerName)}!`,
    escapedParagraphs: [
      `Registramos tu pedido <strong>${escapeHtml(orderNumber)}</strong> por <strong>S/ ${orderTotal.toFixed(2)}</strong>.`,
      requiresPrescription
        ? 'Un químico farmacéutico revisará tu receta médica antes de prepararlo.'
        : 'Ya estamos preparándolo.',
    ],
    buttonLabel: 'Seguir mi pedido',
    buttonPath: `/mis-pedidos/${orderId}`,
  });
}

export async function notifyOrderStatusChanged(
  recipientEmail: string,
  orderId: string,
  orderNumber: string,
  newStatus: string,
  staffNote: string,
): Promise<void> {
  const statusMessage = ORDER_STATUS_EMAIL_MESSAGE[newStatus];
  if (!statusMessage) {
    return;
  }
  const escapedParagraphs = [`Pedido <strong>${escapeHtml(orderNumber)}</strong>: ${escapeHtml(statusMessage.message)}`];
  if (newStatus === 'cancelled' && staffNote) {
    escapedParagraphs.push(`Motivo: ${escapeHtml(staffNote)}`);
    escapedParagraphs.push('Si pagaste con tarjeta, registramos la devolución del importe.');
  }
  await sendCustomerEmail({
    recipientEmail,
    subject: `${statusMessage.subject} · ${orderNumber}`,
    escapedTitle: escapeHtml(statusMessage.subject),
    escapedParagraphs,
    buttonLabel: 'Ver mi pedido',
    buttonPath: `/mis-pedidos/${orderId}`,
  });
}

export async function notifyClaimAnswered(
  recipientEmail: string,
  claimNumber: string,
  responseText: string,
): Promise<void> {
  await sendCustomerEmail({
    recipientEmail,
    subject: `Respuesta a tu reclamo ${claimNumber}`,
    escapedTitle: `Respondimos tu reclamo ${escapeHtml(claimNumber)}`,
    escapedParagraphs: [escapeHtml(responseText).replace(/\n/g, '<br>')],
    buttonLabel: 'Ver en mi cuenta',
    buttonPath: '/libro-de-reclamaciones',
  });
}
