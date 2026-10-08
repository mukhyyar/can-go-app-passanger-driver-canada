import { layout } from './layout';
import { escapeHtml } from './layout';

interface AdminLargeWithdrawalData {
  driverName: string;
  driverEmail: string;
  amount: string;
  currency: string;
  adminWebBaseUrl: string;
  userId: string;
}

export function renderAdminLargeWithdrawal(
  data: AdminLargeWithdrawalData,
  assetBaseUrl: string,
) {
  const driverName = escapeHtml(data.driverName);
  const driverEmail = escapeHtml(data.driverEmail);
  const amount = escapeHtml(data.amount);
  const currency = escapeHtml(data.currency);
  const adminUrl = escapeHtml(`${data.adminWebBaseUrl}/drivers/${data.userId}`);
  
  const subject = `ALERT: Large Withdrawal Requested (${amount} ${currency})`;
  const html = layout(
    `
    <h2>Large Withdrawal Alert</h2>
    <p>Driver <strong>${driverName}</strong> (${driverEmail}) has requested a large withdrawal of <strong>${amount} ${currency}</strong>.</p>
    <p>This is an FYI alert. The withdrawal is processing automatically, but you may want to review the driver's recent activity.</p>
    <br>
    <a href="${adminUrl}" class="btn">View Driver Profile</a>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
