import { layout, escapeHtml } from './layout';

export interface KycApprovedVars {
  driverName: string;
}

export function renderKycApproved(vars: KycApprovedVars, assetBaseUrl: string) {
  const name = escapeHtml(vars.driverName);
  const html = layout(`
    <h2 style="margin-top:0;">You're Approved! 🎉</h2>
    <p>Hi ${name},</p>
    <p>Great news! Your CAN-RIDE driver account has been fully approved.</p>
    <div class="success-box">
      Your profile is now active and you can start accepting rides immediately.
    </div>
    <p>Open the CAN-RIDE Driver App, go online, and start earning on your own schedule!</p>
  `, assetBaseUrl);

  return { subject: 'CAN-RIDE: Your Account is Approved', html };
}
