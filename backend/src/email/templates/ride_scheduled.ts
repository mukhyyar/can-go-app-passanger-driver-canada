import { layout } from './layout';
import { escapeHtml } from './layout';

interface RideScheduledData {
  rideCode: string;
  pickupAt: string;
  fromLabel: string;
  toLabel: string;
  fare: string;
}

export function renderRideScheduled(
  data: RideScheduledData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.rideCode);
  const pickupAt = escapeHtml(data.pickupAt);
  const from = escapeHtml(data.fromLabel);
  const to = escapeHtml(data.toLabel);
  const fare = escapeHtml(data.fare);
  
  const subject = `Your Ride is Scheduled - ${code}`;
  const html = layout(
    `
    <h2>Your ride is confirmed!</h2>
    <p>We've successfully scheduled your ride (<strong>${code}</strong>).</p>
    <ul>
      <li><strong>Pickup Time:</strong> ${pickupAt}</li>
      <li><strong>Pickup Location:</strong> ${from}</li>
      <li><strong>Destination:</strong> ${to}</li>
      <li><strong>Estimated Fare:</strong> ${fare}</li>
    </ul>
    <p>A driver will be assigned closer to your pickup time.</p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
