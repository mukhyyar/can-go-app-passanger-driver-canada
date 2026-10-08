import { layout, escapeHtml } from './layout';

export interface AccountSuspendedVars {
  driverName: string;
  reason: string;
}

export function renderAccountSuspended(vars: AccountSuspendedVars, assetBaseUrl: string) {
  const name = escapeHtml(vars.driverName);
  const reason = escapeHtml(vars.reason);
  const html = layout(`
    <h2 style="margin-top:0;">Account Temporarily Suspended 🛑</h2>
    <p>Hi ${name},</p>
    <p>Your CAN-RIDE driver account has been temporarily placed on hold.</p>
    <div class="alert-box">
      <strong>Reason:</strong> ${reason}
    </div>
    <p>We take safety very seriously. Your account is currently under review by our safety team. You will not be able to accept rides during this time.</p>
    <p>Our team will reach out to you shortly with next steps.</p>
  `, assetBaseUrl);

  return { subject: 'CAN-RIDE: Account Suspended', html };
}
