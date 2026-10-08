import { layout } from './layout';
import { escapeHtml } from './layout';

interface SupportReceivedData {
  ticketId: string;
  userName: string;
}

export function renderSupportReceived(
  data: SupportReceivedData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.ticketId);
  const name = escapeHtml(data.userName);
  
  const subject = `Support Request Received - Ticket #${code}`;
  const html = layout(
    `
    <p>Hi ${name},</p>
    <p>We've received your support request (Ticket #<strong>${code}</strong>).</p>
    <p>Our team is reviewing it and will get back to you as soon as possible.</p>
    <p>Thank you for your patience!</p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
