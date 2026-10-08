import { layout } from './layout';
import { escapeHtml } from './layout';

interface RideReceiptData {
  rideCode: string;
  driverName: string;
  fare: string;
  fee: string;
  tip: string;
  total: string;
}

export function renderRideReceipt(
  data: RideReceiptData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.rideCode);
  const driverName = escapeHtml(data.driverName);
  
  const subject = `Your CAN-RIDE Receipt - ${code}`;
  const html = layout(
    `
    <h2>Thanks for riding with us!</h2>
    <p>Here's your receipt for ride <strong>${code}</strong> with driver <strong>${driverName}</strong>.</p>
    
    <table width="100%" cellpadding="10" cellspacing="0" border="1" style="border-collapse: collapse; border-color: #ddd;">
      <tr><td><strong>Base Fare:</strong></td><td align="right">${escapeHtml(data.fare)}</td></tr>
      <tr><td><strong>Service Fee:</strong></td><td align="right">${escapeHtml(data.fee)}</td></tr>
      <tr><td><strong>Tip:</strong></td><td align="right">${escapeHtml(data.tip)}</td></tr>
      <tr style="background-color: #f9f9f9;"><td><strong>Total:</strong></td><td align="right"><strong>${escapeHtml(data.total)}</strong></td></tr>
    </table>
    
    <p>We hope to see you again soon!</p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
