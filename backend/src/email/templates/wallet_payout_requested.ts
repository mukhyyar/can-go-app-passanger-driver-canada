import { layout } from './layout';
import { escapeHtml } from './layout';

interface WalletPayoutRequestedData {
  driverName: string;
  amount: string;
  currency: string;
  accountMask: string;
}

export function renderWalletPayoutRequested(
  data: WalletPayoutRequestedData,
  assetBaseUrl: string,
) {
  const driverName = escapeHtml(data.driverName);
  const amount = escapeHtml(data.amount);
  const currency = escapeHtml(data.currency);
  const accountMask = escapeHtml(data.accountMask);
  
  const subject = `Withdrawal Requested - ${amount} ${currency}`;
  const html = layout(
    `
    <p>Hi ${driverName},</p>
    <p>Your withdrawal of <strong>${amount} ${currency}</strong> is currently processing.</p>
    <p>The funds will be sent to your bank account ending in <strong>${accountMask}</strong>.</p>
    <p>Please note that it may take a few business days for the funds to appear in your account depending on your bank.</p>
    <p>Thank you for driving with Can-Ride!</p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
