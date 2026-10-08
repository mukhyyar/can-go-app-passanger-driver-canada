import { layout } from './layout';
import { escapeHtml } from './layout';

interface RideCancelledData {
  rideCode: string;
  cancelledBy: string;
  fee: string;
  gracePeriodMinutes: number;
}

export function renderRideCancelled(
  data: RideCancelledData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.rideCode);
  const by = escapeHtml(data.cancelledBy);
  const fee = escapeHtml(data.fee);
  const grace = data.gracePeriodMinutes;
  
  const subject = `Ride Cancelled - ${code}`;
  const html = layout(
    `
    <h2>Your ride was cancelled</h2>
    <p>Ride <strong>${code}</strong> was cancelled by <strong>${by}</strong>.</p>
    <p><strong>Cancellation Fee:</strong> ${fee}</p>
    <p><em>Note: A cancellation fee may apply if cancelled after the ${grace}-minute grace period.</em></p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
