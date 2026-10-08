import { layout } from './layout';
import { escapeHtml } from './layout';

interface WalletPayoutFailedData {
  driverName: string;
  amount: string;
  currency: string;
}

export function renderWalletPayoutFailed(
  data: WalletPayoutFailedData,
  assetBaseUrl: string,
) {
  const driverName = escapeHtml(data.driverName);
  const amount = escapeHtml(data.amount);
  const currency = escapeHtml(data.currency);
  
  const subject = `Withdrawal Failed - ${amount} ${currency}`;
  const html = layout(
    `
    <p>Hi ${driverName},</p>
    <p>Unfortunately, your withdrawal of <strong>${amount} ${currency}</strong> could not be completed.</p>
    <p>The funds have been returned to your Can-Ride wallet and are available again.</p>
    <p>Please check your payout method settings and try again. If the issue persists, please contact support.</p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
